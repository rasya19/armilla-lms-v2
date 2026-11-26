import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { cleanText } from "./school-modules-shared.js";

export type SchoolKopSuratProfile = {
  nama: string;
  npsn: string | null;
  namaYayasan: string | null;
  skIzinOperasional: string | null;
  alamatLengkap: string | null;
  kabupatenKota: string | null;
  provinsi: string | null;
  teleponWa: string | null;
  emailSekolah: string | null;
  websiteSekolah: string | null;
  logoUrl: string | null;
  logoYayasanUrl: string | null;
  namaKetuaPkbm: string | null;
};

type StoredKopExtra = {
  namaYayasan?: string | null;
  skIzinOperasional?: string | null;
  provinsi?: string | null;
  teleponWa?: string | null;
  emailSekolah?: string | null;
  websiteSekolah?: string | null;
  logoYayasanUrl?: string | null;
};

function kopSettingKey(sekolahId: string): string {
  return `kop_surat:${sekolahId}`;
}

function isSafeKopLogoUrl(value: string): boolean {
  if (!value) return true;
  if (value.startsWith("/")) return value.length <= 500;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value)) {
    return value.length <= 1_450_000;
  }
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && value.length <= 500;
  } catch {
    return false;
  }
}

function isSafeWebsiteUrl(value: string): boolean {
  if (!value) return true;
  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function readSchoolKopSurat(sekolahId: string): Promise<SchoolKopSuratProfile> {
  const [school, webSettings, extraSetting] = await Promise.all([
    prisma.sekolah.findUnique({
      where: { id: sekolahId },
      select: {
        nama: true,
        npsn: true,
        alamatSekolah: true,
        kabupatenKota: true,
        namaKepalaSekolah: true,
        adminPhone: true,
      },
    }),
    prisma.websiteSettings
      .findUnique({
        where: { school_id: sekolahId },
        select: { logo_url: true },
      })
      .catch(() => null),
    prisma.platformSetting
      .findUnique({
        where: { key: kopSettingKey(sekolahId) },
        select: { value: true },
      })
      .catch(() => null),
  ]);

  let extra: StoredKopExtra = {};
  if (extraSetting?.value) {
    try {
      const parsed = JSON.parse(extraSetting.value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        extra = parsed as StoredKopExtra;
      }
    } catch {
      // ignore malformed JSON
    }
  }

  return {
    nama: school?.nama ?? "PKBM",
    npsn: school?.npsn ?? null,
    namaYayasan: cleanText(extra.namaYayasan, 200) || null,
    skIzinOperasional: cleanText(extra.skIzinOperasional, 200) || null,
    alamatLengkap: school?.alamatSekolah ?? null,
    kabupatenKota: school?.kabupatenKota ?? null,
    provinsi: cleanText(extra.provinsi, 150) || null,
    teleponWa: cleanText(extra.teleponWa, 40) || school?.adminPhone || null,
    emailSekolah: cleanText(extra.emailSekolah, 254) || null,
    websiteSekolah: cleanText(extra.websiteSekolah, 300) || null,
    logoUrl: webSettings?.logo_url ?? null,
    logoYayasanUrl: typeof extra.logoYayasanUrl === "string" && extra.logoYayasanUrl.trim() ? extra.logoYayasanUrl.trim() : null,
    namaKetuaPkbm: school?.namaKepalaSekolah ?? null,
  };
}

export async function saveSchoolKopSurat(
  sekolahId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; kopSurat: SchoolKopSuratProfile } | { ok: false; status: number; error: string }> {
  const namaYayasan = cleanText(body.namaYayasan, 200) || null;
  const skIzinOperasional = cleanText(body.skIzinOperasional, 200) || null;
  const alamatLengkap = cleanText(body.alamatLengkap, 500) || null;
  const kabupatenKota = cleanText(body.kabupatenKota, 150) || null;
  const provinsi = cleanText(body.provinsi, 150) || null;
  const teleponWa = cleanText(body.teleponWa, 40) || null;
  const emailSekolah = cleanText(body.emailSekolah, 254) || null;
  const websiteSekolahRaw = cleanText(body.websiteSekolah, 300);
  const namaKetuaPkbm = cleanText(body.namaKetuaPkbm, 200) || null;
  const logoUrlRaw = typeof body.logoUrl === "string" ? body.logoUrl.trim() : "";
  const logoYayasanUrlRaw = typeof body.logoYayasanUrl === "string" ? body.logoYayasanUrl.trim() : "";

  if (emailSekolah && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSekolah)) {
    return { ok: false, status: 400, error: "Format email lembaga tidak valid." };
  }
  if (websiteSekolahRaw && !isSafeWebsiteUrl(websiteSekolahRaw)) {
    return { ok: false, status: 400, error: "Format website lembaga harus berupa URL valid (https://...)." };
  }
  if (logoUrlRaw && !isSafeKopLogoUrl(logoUrlRaw)) {
    return { ok: false, status: 400, error: "Logo harus berupa URL https:// valid atau unggahan PNG/JPG/WebP maksimal 1 MB." };
  }
  if (logoYayasanUrlRaw && !isSafeKopLogoUrl(logoYayasanUrlRaw)) {
    return { ok: false, status: 400, error: "Logo yayasan harus berupa URL https:// valid atau unggahan PNG/JPG/WebP maksimal 1 MB." };
  }

  const extraPayload: StoredKopExtra = {
    namaYayasan,
    skIzinOperasional,
    provinsi,
    teleponWa,
    emailSekolah,
    websiteSekolah: websiteSekolahRaw || null,
    logoYayasanUrl: logoYayasanUrlRaw || null,
  };

  await prisma.sekolah.update({
    where: { id: sekolahId },
    data: {
      alamatSekolah: alamatLengkap,
      kabupatenKota,
      namaKepalaSekolah: namaKetuaPkbm,
      ...(teleponWa ? { adminPhone: teleponWa } : {}),
    },
  });

  if ("logoUrl" in body) {
    try {
      await prisma.websiteSettings.upsert({
        where: { school_id: sekolahId },
        create: {
          school_id: sekolahId,
          logo_url: logoUrlRaw || null,
        },
        update: {
          logo_url: logoUrlRaw || null,
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2021" || err.code === "P2022"))) {
        throw err;
      }
    }
  }

  await prisma.platformSetting.upsert({
    where: { key: kopSettingKey(sekolahId) },
    create: {
      key: kopSettingKey(sekolahId),
      value: JSON.stringify(extraPayload),
    },
    update: {
      value: JSON.stringify(extraPayload),
    },
  });

  const kopSurat = await readSchoolKopSurat(sekolahId);
  return { ok: true, kopSurat };
}
