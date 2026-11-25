import { Router } from "express";
import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { offloadDataUrlToSupabaseStorage } from "./storage-upload.js";
import { validateDocumentAttachment } from "./upload-validation.js";

export type VervalStatus = "BELUM_LENGKAP" | "SIAP_VERVAL" | "TERVERIFIKASI_PKBM";
export type VervalDinasStatus = "MENUNGGU_DINAS" | "LOLOS_VERVAL" | "PERLU_PERBAIKAN";

export const VALID_STATUS_VERVAL = new Set<VervalStatus>([
  "BELUM_LENGKAP",
  "SIAP_VERVAL",
  "TERVERIFIKASI_PKBM",
]);

export const VALID_STATUS_VERVAL_DINAS = new Set<VervalDinasStatus>([
  "MENUNGGU_DINAS",
  "LOLOS_VERVAL",
  "PERLU_PERBAIKAN",
]);

export function normalizeVervalStatus(raw: string | null | undefined): VervalStatus {
  if (!raw) return "BELUM_LENGKAP";
  const value = raw.trim().toUpperCase();
  if (value === "SIAP_VERVAL" || value === "MENUNGGU_VERIFIKASI") return "SIAP_VERVAL";
  if (value === "TERVERIFIKASI_PKBM" || value === "TERVERIFIKASI" || value === "MASUK_DAPODIK") {
    return "TERVERIFIKASI_PKBM";
  }
  return "BELUM_LENGKAP";
}

function isAcceptedStatusVervalInput(raw: string): boolean {
  const value = raw.trim().toUpperCase();
  return (
    value === "BELUM_LENGKAP" ||
    value === "SIAP_VERVAL" ||
    value === "TERVERIFIKASI_PKBM" ||
    value === "MENUNGGU_VERIFIKASI" ||
    value === "TERVERIFIKASI" ||
    value === "MASUK_DAPODIK"
  );
}

function vervalStatusFilterValues(status: VervalStatus): string[] {
  if (status === "SIAP_VERVAL") return ["SIAP_VERVAL", "MENUNGGU_VERIFIKASI"];
  if (status === "TERVERIFIKASI_PKBM") return ["TERVERIFIKASI_PKBM", "TERVERIFIKASI", "MASUK_DAPODIK"];
  return ["BELUM_LENGKAP"];
}

export type VervalContext = {
  sekolahId: string;
  role: "ADMIN" | "SISWA";
  siswaId?: string | null;
};

type CompletenessSource = {
  nik?: string | null;
  noKk?: string | null;
  namaIbuKandung?: string | null;
  namaIbu?: string | null;
  tempatLahir?: string | null;
  tanggalLahir?: Date | string | null;
  jenisKelamin?: string | null;
  alamatLengkap?: string | null;
  desaKelurahan?: string | null;
  kecamatan?: string | null;
  sekolahAsal?: string | null;
  nomorIjazahTerakhir?: string | null;
  tanggalMasuk?: Date | string | null;
  urlKk?: string | null;
  urlAktaKtp?: string | null;
  urlIjazah?: string | null;
  urlSuratPindah?: string | null;
  urlFotoIjazah?: string | null;
};

const REQUIRED_VERVAL_FIELDS: Array<{ key: string; label: string; check: (s: CompletenessSource) => boolean }> = [
  { key: "nik", label: "NIK (16 digit)", check: (s) => typeof s.nik === "string" && /^\d{16}$/.test(s.nik.trim()) },
  { key: "noKk", label: "Nomor KK (16 digit)", check: (s) => typeof s.noKk === "string" && /^\d{16}$/.test(s.noKk.trim()) },
  {
    key: "namaIbuKandung",
    label: "Nama Ibu Kandung",
    check: (s) => Boolean((s.namaIbuKandung && s.namaIbuKandung.trim()) || (s.namaIbu && s.namaIbu.trim())),
  },
  { key: "tempatLahir", label: "Tempat Lahir", check: (s) => Boolean(s.tempatLahir && s.tempatLahir.trim()) },
  { key: "tanggalLahir", label: "Tanggal Lahir", check: (s) => Boolean(s.tanggalLahir) },
  { key: "jenisKelamin", label: "Jenis Kelamin", check: (s) => s.jenisKelamin === "L" || s.jenisKelamin === "P" },
  { key: "alamatLengkap", label: "Alamat Lengkap", check: (s) => Boolean(s.alamatLengkap && s.alamatLengkap.trim()) },
  { key: "desaKelurahan", label: "Desa / Kelurahan", check: (s) => Boolean(s.desaKelurahan && s.desaKelurahan.trim()) },
  { key: "kecamatan", label: "Kecamatan", check: (s) => Boolean(s.kecamatan && s.kecamatan.trim()) },
  { key: "sekolahAsal", label: "Sekolah Asal", check: (s) => Boolean(s.sekolahAsal && s.sekolahAsal.trim()) },
  {
    key: "nomorIjazahTerakhir",
    label: "Nomor Ijazah Terakhir",
    check: (s) => Boolean(s.nomorIjazahTerakhir && s.nomorIjazahTerakhir.trim()),
  },
  { key: "tanggalMasuk", label: "Tanggal Masuk", check: (s) => Boolean(s.tanggalMasuk) },
  { key: "urlKk", label: "Berkas Kartu Keluarga (KK)", check: (s) => Boolean(s.urlKk && s.urlKk.trim()) },
  { key: "urlAktaKtp", label: "Berkas Akta Lahir / KTP", check: (s) => Boolean(s.urlAktaKtp && s.urlAktaKtp.trim()) },
  { key: "urlIjazah", label: "Berkas Ijazah Terakhir", check: (s) => Boolean(s.urlIjazah && s.urlIjazah.trim()) },
];

export function computeVervalCompleteness(source: CompletenessSource): {
  kelengkapanPersen: number;
  filledCount: number;
  totalFields: number;
  berkasCount: number;
  berkasWajibCount: number;
  berkasLengkap: boolean;
  tanpaBerkas: boolean;
  missingFields: string[];
} {
  let filledCount = 0;
  const missingFields: string[] = [];
  for (const field of REQUIRED_VERVAL_FIELDS) {
    if (field.check(source)) {
      filledCount += 1;
    } else {
      missingFields.push(field.label);
    }
  }
  const hasKk = Boolean(source.urlKk && source.urlKk.trim());
  const hasAkta = Boolean(source.urlAktaKtp && source.urlAktaKtp.trim());
  const hasIjazah = Boolean(source.urlIjazah && source.urlIjazah.trim());
  const hasSuratPindah = Boolean(source.urlSuratPindah && source.urlSuratPindah.trim());
  const berkasWajibCount = (hasKk ? 1 : 0) + (hasAkta ? 1 : 0) + (hasIjazah ? 1 : 0);
  const berkasCount = berkasWajibCount + (hasSuratPindah ? 1 : 0);
  const totalFields = REQUIRED_VERVAL_FIELDS.length;
  return {
    kelengkapanPersen: Math.round((filledCount / totalFields) * 100),
    filledCount,
    totalFields,
    berkasCount,
    berkasWajibCount,
    berkasLengkap: berkasWajibCount === 3,
    tanpaBerkas: berkasCount === 0,
    missingFields,
  };
}

export function formatIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return null;
}

export function formatDmyDate(value: Date | string | null | undefined): string {
  const iso = formatIsoDate(value);
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function defaultCutoffIso(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const cutoffYear = month >= 6 ? year : year - 1;
  return `${cutoffYear}-08-31`;
}

function serializeVervalSchool(school: {
  id: string;
  nama: string;
  npsn: string | null;
  slug: string;
  kabupatenKota: string | null;
  izinVervalDinas: boolean;
  totalSiswaDapodik?: number;
  tanggalCutOffDapodik?: Date | string | null;
  alamatSekolah?: string | null;
  namaKepalaSekolah?: string | null;
  namaOperatorDapodik?: string | null;
}) {
  return {
    id: school.id,
    nama: school.nama,
    npsn: school.npsn ?? null,
    slug: school.slug,
    kabupatenKota: school.kabupatenKota ?? null,
    izinVervalDinas: Boolean(school.izinVervalDinas),
    totalSiswaDapodik: school.totalSiswaDapodik ?? 0,
    tanggalCutOffDapodik: formatIsoDate(school.tanggalCutOffDapodik) ?? defaultCutoffIso(),
    alamatSekolah: school.alamatSekolah ?? null,
    namaKepalaSekolah: school.namaKepalaSekolah ?? null,
    namaOperatorDapodik: school.namaOperatorDapodik ?? null,
  };
}

export function detectPaketCategory(jenjang?: string | null, kelasNama?: string | null): "Paket A" | "Paket B" | "Paket C" | "Lainnya" {
  const combined = `${jenjang ?? ""} ${kelasNama ?? ""}`.toLowerCase();
  if (combined.includes("paket a") || /\bkelas\s*[1-6]\b/.test(combined)) return "Paket A";
  if (combined.includes("paket b") || /\bkelas\s*[7-9]\b/.test(combined)) return "Paket B";
  if (combined.includes("paket c") || /\bkelas\s*(10|11|12)\b/.test(combined)) return "Paket C";
  return "Lainnya";
}

export function isSafeDocumentUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return true;
  return validateDocumentAttachment(value, { allowRelative: true, allowHttp: false }).ok;
}

function parseFlexibleDateInput(raw: unknown): { ok: true; value: Date | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  let iso = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    iso = trimmed;
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split("/");
    iso = `${y}-${m}-${d}`;
  } else if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split("-");
    iso = `${y}-${m}-${d}`;
  } else {
    return { ok: false };
  }
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    return { ok: false };
  }
  return { ok: true, value: date };
}

function parseOptionalString(raw: unknown, maxLen: number): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length > maxLen) return { ok: false };
  return { ok: true, value: trimmed || null };
}

function cleanNumericId(raw: unknown): string {
  if (typeof raw !== "string" && typeof raw !== "number") return "";
  return String(raw).replace(/[^0-9]/g, "").trim();
}

function cleanText(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const SISWA_VERVAL_SELECT = {
  id: true,
  nisn: true,
  nama: true,
  kelasId: true,
  telepon: true,
  status: true,
  nik: true,
  noKk: true,
  tempatLahir: true,
  tanggalLahir: true,
  jenisKelamin: true,
  jenjang: true,
  tanggalMasuk: true,
  namaIbu: true,
  namaIbuKandung: true,
  namaAyah: true,
  alamatLengkap: true,
  desaKelurahan: true,
  kecamatan: true,
  sekolahAsal: true,
  npsnAsal: true,
  nomorIjazahTerakhir: true,
  sumberDapodik: true,
  urlKk: true,
  urlAktaKtp: true,
  urlIjazah: true,
  urlSuratPindah: true,
  urlFotoIjazah: true,
  statusVerval: true,
  catatanVerval: true,
  statusVervalDinas: true,
  catatanDinas: true,
} as const;

type SelectedSiswaVerval = Prisma.SiswaGetPayload<{ select: typeof SISWA_VERVAL_SELECT }>;

function serializeVervalStudent(student: SelectedSiswaVerval, kelasNamaMap: Map<string, string>) {
  const namaIbuKandung = student.namaIbuKandung ?? student.namaIbu ?? null;
  const completeness = computeVervalCompleteness({
    ...student,
    namaIbuKandung,
  });
  const statusVerval = normalizeVervalStatus(student.statusVerval);
  const statusVervalDinas = VALID_STATUS_VERVAL_DINAS.has(student.statusVervalDinas as VervalDinasStatus)
    ? (student.statusVervalDinas as VervalDinasStatus)
    : "MENUNGGU_DINAS";

  return {
    id: student.id,
    nisn: student.nisn,
    nama: student.nama,
    kelasId: student.kelasId,
    kelasNama: student.kelasId ? (kelasNamaMap.get(student.kelasId) ?? "Kelas Terhapus") : "Belum ditempatkan",
    telepon: student.telepon ?? null,
    status: student.status,
    nik: student.nik ?? null,
    noKk: student.noKk ?? null,
    tempatLahir: student.tempatLahir ?? null,
    tanggalLahir: formatIsoDate(student.tanggalLahir),
    jenisKelamin: student.jenisKelamin ?? null,
    jenjang: student.jenjang ?? null,
    tanggalMasuk: formatIsoDate(student.tanggalMasuk),
    namaIbuKandung,
    namaAyah: student.namaAyah ?? null,
    alamatLengkap: student.alamatLengkap ?? null,
    desaKelurahan: student.desaKelurahan ?? null,
    kecamatan: student.kecamatan ?? null,
    sekolahAsal: student.sekolahAsal ?? null,
    npsnAsal: student.npsnAsal ?? null,
    nomorIjazahTerakhir: student.nomorIjazahTerakhir ?? null,
    sumberDapodik: Boolean(student.sumberDapodik),
    urlKk: student.urlKk ?? null,
    urlAktaKtp: student.urlAktaKtp ?? null,
    urlIjazah: student.urlIjazah ?? null,
    urlSuratPindah: student.urlSuratPindah ?? null,
    urlFotoIjazah: student.urlFotoIjazah ?? null,
    statusVerval,
    catatanVerval: student.catatanVerval ?? null,
    statusVervalDinas,
    catatanDinas: student.catatanDinas ?? null,
    ...completeness,
  };
}

type NormalizedDapodikRow = {
  nisn: string | null;
  nik: string | null;
  noKk: string | null;
  nama: string;
  tempatLahir: string | null;
  tanggalLahir: Date | null;
  jenisKelamin: string | null;
  jenjang: string | null;
  namaIbuKandung: string | null;
  alamatLengkap: string | null;
  desaKelurahan: string | null;
  kecamatan: string | null;
  sekolahAsal: string | null;
  npsnAsal: string | null;
  nomorIjazahTerakhir: string | null;
  tanggalMasuk: Date | null;
  telepon: string | null;
  email: string | null;
};

function parseDapodikImportRows(rawRows: unknown): { rows: NormalizedDapodikRow[] } | { error: string } {
  if (!Array.isArray(rawRows) || rawRows.length < 1 || rawRows.length > 1000) {
    return { error: "Impor Dapodik harus berisi 1 sampai 1000 baris warga belajar." };
  }
  const rows: NormalizedDapodikRow[] = [];
  const seenNisn = new Set<string>();
  const seenNik = new Set<string>();

  for (const [index, raw] of rawRows.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { error: `Baris ${index + 1} tidak valid.` };
    }
    const item = raw as Record<string, unknown>;
    const nama = cleanText(item.nama, 200);
    if (!nama || nama.length < 2) {
      return { error: `Baris ${index + 1}: Nama peserta didik minimal 2 karakter.` };
    }
    const rawNisn = cleanNumericId(item.nisn);
    const rawNik = cleanNumericId(item.nik);
    const rawNoKk = cleanNumericId(item.noKk);

    if (rawNisn && !/^\d{10}$/.test(rawNisn)) {
      return { error: `Baris ${index + 1} (${nama}): NISN harus terdiri dari 10 angka jika diisi.` };
    }
    if (rawNik && !/^\d{16}$/.test(rawNik)) {
      return { error: `Baris ${index + 1} (${nama}): NIK harus terdiri dari 16 angka jika diisi.` };
    }
    if (rawNoKk && !/^\d{16}$/.test(rawNoKk)) {
      return { error: `Baris ${index + 1} (${nama}): Nomor KK harus terdiri dari 16 angka jika diisi.` };
    }
    if (!rawNisn && !rawNik) {
      return { error: `Baris ${index + 1} (${nama}): Wajib memiliki minimal NISN (10 digit) atau NIK (16 digit).` };
    }
    if (rawNisn) {
      if (seenNisn.has(rawNisn)) {
        return { error: `Baris ${index + 1} (${nama}): NISN ${rawNisn} duplikat di dalam file.` };
      }
      seenNisn.add(rawNisn);
    }
    if (rawNik) {
      if (seenNik.has(rawNik)) {
        return { error: `Baris ${index + 1} (${nama}): NIK ${rawNik} duplikat di dalam file.` };
      }
      seenNik.add(rawNik);
    }

    const tglLahirParsed = parseFlexibleDateInput(item.tanggalLahir);
    if (!tglLahirParsed.ok) {
      return { error: `Baris ${index + 1} (${nama}): Format tanggal lahir tidak valid (gunakan YYYY-MM-DD atau DD/MM/YYYY).` };
    }
    const tglMasukParsed = parseFlexibleDateInput(item.tanggalMasuk);
    if (!tglMasukParsed.ok) {
      return { error: `Baris ${index + 1} (${nama}): Format tanggal masuk tidak valid (gunakan YYYY-MM-DD atau DD/MM/YYYY).` };
    }

    const rawJk = cleanText(item.jenisKelamin, 20)?.toUpperCase() ?? null;
    const jenisKelamin =
      rawJk === "L" || rawJk === "LAKI-LAKI" || rawJk === "LAKI LAKI"
        ? "L"
        : rawJk === "P" || rawJk === "PEREMPUAN"
          ? "P"
          : null;

    const rawEmail = cleanText(item.email, 254)?.toLowerCase() ?? null;
    const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : null;
    const rawTelp = cleanText(item.telepon, 30);
    const telepon = rawTelp && /^[+0-9 ()-]{6,30}$/.test(rawTelp) ? rawTelp : null;
    const rawNpsnAsal = cleanText(item.npsnAsal, 20);
    const npsnAsal = rawNpsnAsal && /^[A-Za-z0-9]{8}$/.test(rawNpsnAsal) ? rawNpsnAsal : null;

    rows.push({
      nisn: rawNisn || null,
      nik: rawNik || null,
      noKk: rawNoKk || null,
      nama,
      tempatLahir: cleanText(item.tempatLahir, 200),
      tanggalLahir: tglLahirParsed.value,
      jenisKelamin,
      jenjang: cleanText(item.jenjang, 100),
      namaIbuKandung: cleanText(item.namaIbuKandung ?? item.namaIbu, 200),
      alamatLengkap: cleanText(item.alamatLengkap, 500),
      desaKelurahan: cleanText(item.desaKelurahan, 200),
      kecamatan: cleanText(item.kecamatan, 200),
      sekolahAsal: cleanText(item.sekolahAsal, 200),
      npsnAsal,
      nomorIjazahTerakhir: cleanText(item.nomorIjazahTerakhir, 120),
      tanggalMasuk: tglMasukParsed.value,
      telepon,
      email,
    });
  }

  return { rows };
}

export function vervalRoutes(resolveContext: (req: Request) => Promise<VervalContext | null>) {
  const router = Router();

  router.use(async (req, res, next) => {
    try {
      const ctx = await resolveContext(req);
      if (!ctx) return res.status(401).json({ error: "Sesi tidak valid." });
      res.locals.vervalCtx = ctx;
      return next();
    } catch (error) {
      console.error("Gagal memeriksa sesi verval:", error);
      return res.status(503).json({ error: "Layanan verval tidak tersedia." });
    }
  });

  router.get("/me", async (_req, res) => {
    const ctx = res.locals.vervalCtx as VervalContext;
    if (ctx.role !== "SISWA" || !ctx.siswaId) {
      return res.status(403).json({ error: "Hanya warga belajar yang dapat mengakses profil biodata Dapodik pribadi." });
    }
    try {
      const [student, school, kelasList] = await Promise.all([
        prisma.siswa.findFirst({
          where: { id: ctx.siswaId, sekolahId: ctx.sekolahId },
          select: SISWA_VERVAL_SELECT,
        }),
        prisma.sekolah.findUnique({
          where: { id: ctx.sekolahId },
          select: { id: true, nama: true, npsn: true, kabupatenKota: true },
        }),
        prisma.kelas.findMany({
          where: { sekolahId: ctx.sekolahId },
          select: { id: true, nama: true },
        }),
      ]);
      if (!student || !school) {
        return res.status(404).json({ error: "Data siswa atau sekolah tidak ditemukan di database." });
      }
      const kelasMap = new Map(kelasList.map((k) => [k.id, k.nama]));
      return res.json({
        sekolah: school,
        siswa: serializeVervalStudent(student, kelasMap),
      });
    } catch (error) {
      console.error("Gagal memuat biodata verval siswa:", error);
      return res.status(503).json({ error: "Biodata Dapodik siswa belum dapat dimuat." });
    }
  });

  router.patch("/pengaturan-sekolah", async (req, res) => {
    const ctx = res.locals.vervalCtx as VervalContext;
    if (ctx.role !== "ADMIN") {
      return res.status(403).json({ error: "Hanya admin/operator PKBM yang dapat mengubah pengaturan sinkronisasi Dinas." });
    }
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Payload pengaturan sekolah tidak valid." });
    }
    const payload = body as Record<string, unknown>;
    const updateData: Prisma.SekolahUpdateInput = {};

    if (Object.prototype.hasOwnProperty.call(payload, "kabupatenKota")) {
      const parsed = parseOptionalString(payload.kabupatenKota, 150);
      if (!parsed.ok) return res.status(400).json({ error: "Nama Kabupaten/Kota maksimal 150 karakter." });
      updateData.kabupatenKota = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "izinVervalDinas")) {
      if (typeof payload.izinVervalDinas !== "boolean") {
        return res.status(400).json({ error: "Status izin sinkronisasi Dinas harus bernilai boolean." });
      }
      updateData.izinVervalDinas = payload.izinVervalDinas;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "tanggalCutOffDapodik")) {
      const parsed = parseFlexibleDateInput(payload.tanggalCutOffDapodik);
      if (!parsed.ok) {
        return res.status(400).json({ error: "Format tanggal cut-off Dapodik tidak valid (gunakan YYYY-MM-DD atau DD/MM/YYYY)." });
      }
      updateData.tanggalCutOffDapodik = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "alamatSekolah")) {
      const parsed = parseOptionalString(payload.alamatSekolah, 300);
      if (!parsed.ok) return res.status(400).json({ error: "Alamat sekolah maksimal 300 karakter." });
      updateData.alamatSekolah = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "namaKepalaSekolah")) {
      const parsed = parseOptionalString(payload.namaKepalaSekolah, 150);
      if (!parsed.ok) return res.status(400).json({ error: "Nama Kepala PKBM maksimal 150 karakter." });
      updateData.namaKepalaSekolah = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "namaOperatorDapodik")) {
      const parsed = parseOptionalString(payload.namaOperatorDapodik, 150);
      if (!parsed.ok) return res.status(400).json({ error: "Nama Operator Dapodik maksimal 150 karakter." });
      updateData.namaOperatorDapodik = parsed.value;
    }

    try {
      const updated = await prisma.sekolah.update({
        where: { id: ctx.sekolahId },
        data: updateData,
        select: {
          id: true,
          nama: true,
          npsn: true,
          slug: true,
          kabupatenKota: true,
          izinVervalDinas: true,
          tanggalCutOffDapodik: true,
          alamatSekolah: true,
          namaKepalaSekolah: true,
          namaOperatorDapodik: true,
          totalSiswaDapodik: true,
        },
      });
      return res.json({
        message: "Pengaturan sinkronisasi Dinas Pendidikan berhasil disimpan.",
        sekolah: serializeVervalSchool(updated),
      });
    } catch (error) {
      console.error("Gagal memperbarui pengaturan sekolah verval:", error);
      return res.status(503).json({ error: "Pengaturan sinkronisasi Dinas belum dapat disimpan." });
    }
  });

  router.post("/import-dapodik", async (req, res) => {
    const ctx = res.locals.vervalCtx as VervalContext;
    if (ctx.role !== "ADMIN") {
      return res.status(403).json({ error: "Hanya admin/operator PKBM yang dapat mengimpor data Dapodik." });
    }
    const parsed = parseDapodikImportRows(req.body?.rows);
    if ("error" in parsed) {
      return res.status(400).json({ error: parsed.error });
    }

    const totalDapodikCountRaw = req.body?.totalDapodikCount;
    const totalDapodikCount =
      typeof totalDapodikCountRaw === "number" && Number.isInteger(totalDapodikCountRaw) && totalDapodikCountRaw >= parsed.rows.length
        ? Math.min(totalDapodikCountRaw, 50_000)
        : parsed.rows.length;

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const incomingNisns = parsed.rows.map((r) => r.nisn).filter((v): v is string => Boolean(v));
          const incomingNiks = parsed.rows.map((r) => r.nik).filter((v): v is string => Boolean(v));

          if (incomingNisns.length) {
            const conflicting = await tx.siswa.findMany({
              where: { nisn: { in: incomingNisns }, NOT: { sekolahId: ctx.sekolahId } },
              select: { nisn: true },
              take: 5,
            });
            if (conflicting.length) {
              throw new Error(`NISN_CONFLICT:${conflicting.map((c) => c.nisn).join(", ")}`);
            }
          }

          const existingConditions: Prisma.SiswaWhereInput[] = [];
          if (incomingNisns.length) existingConditions.push({ nisn: { in: incomingNisns } });
          if (incomingNiks.length) existingConditions.push({ nik: { in: incomingNiks } });

          const existingStudents = existingConditions.length
            ? await tx.siswa.findMany({
                where: { sekolahId: ctx.sekolahId, OR: existingConditions },
                select: { id: true, nisn: true, nik: true },
              })
            : [];

          const byNisn = new Map(existingStudents.map((s) => [s.nisn, s]));
          const byNik = new Map(
            existingStudents.filter((s) => Boolean(s.nik)).map((s) => [s.nik as string, s]),
          );

          const toUpdate: Array<{ id: string; row: NormalizedDapodikRow }> = [];
          const toCreate: NormalizedDapodikRow[] = [];

          for (const row of parsed.rows) {
            const match = (row.nik ? byNik.get(row.nik) : undefined) ?? (row.nisn ? byNisn.get(row.nisn) : undefined);
            if (match) {
              toUpdate.push({ id: match.id, row });
            } else {
              toCreate.push(row);
            }
          }

          for (const item of toUpdate) {
            const r = item.row;
            await tx.siswa.update({
              where: { id: item.id },
              data: {
                nama: r.nama,
                ...(r.nik ? { nik: r.nik } : {}),
                ...(r.noKk ? { noKk: r.noKk } : {}),
                ...(r.tempatLahir ? { tempatLahir: r.tempatLahir } : {}),
                ...(r.tanggalLahir ? { tanggalLahir: r.tanggalLahir } : {}),
                ...(r.jenisKelamin ? { jenisKelamin: r.jenisKelamin } : {}),
                ...(r.jenjang ? { jenjang: r.jenjang } : {}),
                ...(r.namaIbuKandung ? { namaIbuKandung: r.namaIbuKandung, namaIbu: r.namaIbuKandung } : {}),
                ...(r.alamatLengkap ? { alamatLengkap: r.alamatLengkap } : {}),
                ...(r.desaKelurahan ? { desaKelurahan: r.desaKelurahan } : {}),
                ...(r.kecamatan ? { kecamatan: r.kecamatan } : {}),
                ...(r.sekolahAsal ? { sekolahAsal: r.sekolahAsal } : {}),
                ...(r.npsnAsal ? { npsnAsal: r.npsnAsal } : {}),
                ...(r.nomorIjazahTerakhir ? { nomorIjazahTerakhir: r.nomorIjazahTerakhir } : {}),
                ...(r.tanggalMasuk ? { tanggalMasuk: r.tanggalMasuk } : {}),
                ...(r.telepon ? { telepon: r.telepon } : {}),
                ...(r.email ? { email: r.email } : {}),
                sumberDapodik: true,
                status: "Aktif",
              },
            });
          }

          if (toCreate.length) {
            const usedNisns = new Set(incomingNisns);
            const createPayload = toCreate.map((r, idx) => {
              let finalNisn = r.nisn;
              if (!finalNisn) {
                const suffix = r.nik ? r.nik.slice(-9) : `${Date.now().toString().slice(-6)}${String(idx).padStart(3, "0")}`;
                let candidate = `9${suffix}`;
                let bump = 0;
                while (usedNisns.has(candidate)) {
                  bump += 1;
                  candidate = `9${suffix.slice(0, 7)}${String(bump).padStart(2, "0")}`;
                }
                usedNisns.add(candidate);
                finalNisn = candidate;
              }
              return {
                sekolahId: ctx.sekolahId,
                nisn: finalNisn,
                nama: r.nama,
                status: "Aktif",
                sumberDapodik: true,
                statusVerval: "BELUM_LENGKAP",
                ...(r.nik ? { nik: r.nik } : {}),
                ...(r.noKk ? { noKk: r.noKk } : {}),
                ...(r.tempatLahir ? { tempatLahir: r.tempatLahir } : {}),
                ...(r.tanggalLahir ? { tanggalLahir: r.tanggalLahir } : {}),
                ...(r.jenisKelamin ? { jenisKelamin: r.jenisKelamin } : {}),
                ...(r.jenjang ? { jenjang: r.jenjang } : {}),
                ...(r.namaIbuKandung ? { namaIbuKandung: r.namaIbuKandung, namaIbu: r.namaIbuKandung } : {}),
                ...(r.alamatLengkap ? { alamatLengkap: r.alamatLengkap } : {}),
                ...(r.desaKelurahan ? { desaKelurahan: r.desaKelurahan } : {}),
                ...(r.kecamatan ? { kecamatan: r.kecamatan } : {}),
                ...(r.sekolahAsal ? { sekolahAsal: r.sekolahAsal } : {}),
                ...(r.npsnAsal ? { npsnAsal: r.npsnAsal } : {}),
                ...(r.nomorIjazahTerakhir ? { nomorIjazahTerakhir: r.nomorIjazahTerakhir } : {}),
                ...(r.tanggalMasuk ? { tanggalMasuk: r.tanggalMasuk } : {}),
                ...(r.telepon ? { telepon: r.telepon } : {}),
                ...(r.email ? { email: r.email } : {}),
              };
            });
            await tx.siswa.createMany({ data: createPayload });
          }

          await tx.sekolah.update({
            where: { id: ctx.sekolahId },
            data: { totalSiswaDapodik: totalDapodikCount },
          });

          return {
            created: toCreate.length,
            updated: toUpdate.length,
            totalSiswaDapodik: totalDapodikCount,
          };
        },
        { timeout: 30000 },
      );

      return res.json({
        ...result,
        message: `Sinkronisasi Excel Dapodik berhasil: ${result.created} siswa baru ditambahkan, ${result.updated} siswa diperbarui (${result.totalSiswaDapodik} total data Dapodik).`,
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("NISN_CONFLICT:")) {
        return res.status(409).json({
          error: `Impor dibatalkan karena NISN sudah terdaftar di PKBM lain: ${error.message.slice("NISN_CONFLICT:".length)}.`,
        });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return res.status(409).json({ error: "Impor dibatalkan karena terdapat konflik NISN unik. Periksa kembali file Dapodik Anda." });
      }
      console.error("Gagal mengimpor Excel Dapodik:", error);
      return res.status(503).json({ error: "Impor Excel Dapodik belum dapat diproses. Tidak ada data yang diubah." });
    }
  });

  router.get("/siswa", async (req, res) => {
    const ctx = res.locals.vervalCtx as VervalContext;
    if (ctx.role !== "ADMIN") {
      return res.status(403).json({ error: "Akses daftar verval hanya untuk admin/operator sekolah." });
    }
    const statusFilterRaw = typeof req.query.statusVerval === "string" ? req.query.statusVerval.trim() : "";
    const statusDinasFilter = typeof req.query.statusVervalDinas === "string" ? req.query.statusVervalDinas.trim() : "";
    const kelasIdFilter = typeof req.query.kelasId === "string" ? req.query.kelasId.trim() : "";
    const tanpaBerkasOnly = req.query.tanpaBerkas === "true" || req.query.tanpaBerkas === "1";
    const searchRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (statusFilterRaw && !isAcceptedStatusVervalInput(statusFilterRaw)) {
      return res.status(400).json({ error: "Filter status verval tidak valid." });
    }
    const statusFilter = statusFilterRaw ? normalizeVervalStatus(statusFilterRaw) : null;

    if (statusDinasFilter && !VALID_STATUS_VERVAL_DINAS.has(statusDinasFilter as VervalDinasStatus)) {
      return res.status(400).json({ error: "Filter status verval Dinas tidak valid." });
    }
    if (searchRaw.length > 100) {
      return res.status(400).json({ error: "Pencarian maksimal 100 karakter." });
    }

    const pageValue = req.query.page;
    const limitValue = req.query.limit;
    if (pageValue !== undefined && (typeof pageValue !== "string" || !/^[1-9]\d{0,5}$/.test(pageValue))) {
      return res.status(400).json({ error: "Nomor halaman tidak valid." });
    }
    if (limitValue !== undefined && limitValue !== "10" && limitValue !== "25" && limitValue !== "50" && limitValue !== "100") {
      return res.status(400).json({ error: "Ukuran halaman tidak valid." });
    }
    const page = pageValue ? Number(pageValue) : 1;
    const pageSize = limitValue ? Number(limitValue) : 25;

    try {
      const term = searchRaw.replace(/[\\%_]/g, "\\$&");
      const where: Prisma.SiswaWhereInput = {
        sekolahId: ctx.sekolahId,
        status: "Aktif",
        ...(statusFilter ? { statusVerval: { in: vervalStatusFilterValues(statusFilter) } } : {}),
        ...(statusDinasFilter ? { statusVervalDinas: statusDinasFilter } : {}),
        ...(kelasIdFilter === "belum" ? { kelasId: null } : kelasIdFilter ? { kelasId: kelasIdFilter } : {}),
        ...(tanpaBerkasOnly
          ? {
              AND: [
                { OR: [{ urlKk: null }, { urlKk: "" }] },
                { OR: [{ urlAktaKtp: null }, { urlAktaKtp: "" }] },
                { OR: [{ urlIjazah: null }, { urlIjazah: "" }] },
                { OR: [{ urlSuratPindah: null }, { urlSuratPindah: "" }] },
              ],
            }
          : {}),
        ...(term
          ? {
              OR: [
                { nama: { contains: term, mode: "insensitive" } },
                { nisn: { contains: term, mode: "insensitive" } },
                { nik: { contains: term, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const [school, kelasList, allStatusRows, rows, total] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: ctx.sekolahId },
          select: {
            id: true,
            nama: true,
            npsn: true,
            slug: true,
            kabupatenKota: true,
            izinVervalDinas: true,
            tanggalCutOffDapodik: true,
            alamatSekolah: true,
            namaKepalaSekolah: true,
            namaOperatorDapodik: true,
            totalSiswaDapodik: true,
          },
        }),
        prisma.kelas.findMany({
          where: { sekolahId: ctx.sekolahId },
          select: { id: true, nama: true },
          orderBy: [{ nama: "asc" }, { id: "asc" }],
          take: 500,
        }),
        prisma.siswa.findMany({
          where: { sekolahId: ctx.sekolahId, status: "Aktif" },
          select: {
            statusVerval: true,
            statusVervalDinas: true,
            sumberDapodik: true,
            urlKk: true,
            urlAktaKtp: true,
            urlIjazah: true,
            urlSuratPindah: true,
          },
        }),
        prisma.siswa.findMany({
          where,
          select: SISWA_VERVAL_SELECT,
          orderBy: [{ nama: "asc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize + 1,
        }),
        prisma.siswa.count({ where }),
      ]);

      let belumLengkap = 0;
      let siapVerval = 0;
      let terverifikasiPkbm = 0;
      let lolosDinas = 0;
      let perluPerbaikanDinas = 0;
      let sumberDapodikCount = 0;
      let berkasLengkap = 0;
      let belumAdaBerkas = 0;

      for (const item of allStatusRows) {
        const normalized = normalizeVervalStatus(item.statusVerval);
        if (normalized === "SIAP_VERVAL") siapVerval += 1;
        else if (normalized === "TERVERIFIKASI_PKBM") terverifikasiPkbm += 1;
        else belumLengkap += 1;

        if (item.statusVervalDinas === "LOLOS_VERVAL") lolosDinas += 1;
        else if (item.statusVervalDinas === "PERLU_PERBAIKAN") perluPerbaikanDinas += 1;

        if (item.sumberDapodik) sumberDapodikCount += 1;

        const hasKk = Boolean(item.urlKk && item.urlKk.trim());
        const hasAkta = Boolean(item.urlAktaKtp && item.urlAktaKtp.trim());
        const hasIjazah = Boolean(item.urlIjazah && item.urlIjazah.trim());
        const hasSuratPindah = Boolean(item.urlSuratPindah && item.urlSuratPindah.trim());
        if (hasKk && hasAkta && hasIjazah) berkasLengkap += 1;
        if (!hasKk && !hasAkta && !hasIjazah && !hasSuratPindah) belumAdaBerkas += 1;
      }

      if (!school) {
        return res.status(404).json({ error: "Data sekolah tidak ditemukan di database." });
      }

      const totalDapodik = Math.max(school.totalSiswaDapodik ?? 0, sumberDapodikCount);
      const selisihTanpaBerkas = Math.max(0, totalDapodik - berkasLengkap);

      const summary = {
        total: allStatusRows.length,
        totalDapodik,
        sumberDapodikCount,
        berkasLengkap,
        belumAdaBerkas,
        selisihTanpaBerkas,
        belumLengkap,
        siapVerval,
        terverifikasiPkbm,
        lolosDinas,
        perluPerbaikanDinas,
      };

      const kelasMap = new Map(kelasList.map((k) => [k.id, k.nama]));
      return res.json({
        sekolah: serializeVervalSchool(school),
        summary,
        kelasList,
        rows: rows.slice(0, pageSize).map((item) => serializeVervalStudent(item, kelasMap)),
        page,
        pageSize,
        hasNext: rows.length > pageSize,
        total,
      });
    } catch (error) {
      console.error("Gagal memuat daftar verval siswa:", error);
      return res.status(503).json({ error: "Data verval siswa belum dapat dimuat." });
    }
  });

  router.patch("/siswa/:id", async (req, res) => {
    const ctx = res.locals.vervalCtx as VervalContext;
    const studentId = req.params.id;
    if (ctx.role === "SISWA" && ctx.siswaId !== studentId) {
      return res.status(403).json({ error: "Anda hanya dapat memperbarui biodata Dapodik milik sendiri." });
    }

    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Payload pembaruan verval tidak valid." });
    }
    const payload = body as Record<string, unknown>;
    const updateData: Prisma.SiswaUpdateManyMutationInput = {};

    if (Object.prototype.hasOwnProperty.call(payload, "nik")) {
      const parsed = parseOptionalString(payload.nik, 20);
      if (!parsed.ok || (parsed.value && !/^\d{16}$/.test(parsed.value))) {
        return res.status(400).json({ error: "NIK harus terdiri dari tepat 16 angka." });
      }
      updateData.nik = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "noKk")) {
      const parsed = parseOptionalString(payload.noKk, 20);
      if (!parsed.ok || (parsed.value && !/^\d{16}$/.test(parsed.value))) {
        return res.status(400).json({ error: "Nomor KK harus terdiri dari tepat 16 angka." });
      }
      updateData.noKk = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "namaIbuKandung")) {
      const parsed = parseOptionalString(payload.namaIbuKandung, 200);
      if (!parsed.ok) return res.status(400).json({ error: "Nama ibu kandung maksimal 200 karakter." });
      updateData.namaIbuKandung = parsed.value;
      if (parsed.value) {
        updateData.namaIbu = parsed.value;
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "tempatLahir")) {
      const parsed = parseOptionalString(payload.tempatLahir, 200);
      if (!parsed.ok) return res.status(400).json({ error: "Tempat lahir maksimal 200 karakter." });
      updateData.tempatLahir = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "tanggalLahir")) {
      const parsed = parseFlexibleDateInput(payload.tanggalLahir);
      if (!parsed.ok) return res.status(400).json({ error: "Format tanggal lahir tidak valid (gunakan YYYY-MM-DD atau DD/MM/YYYY)." });
      updateData.tanggalLahir = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "jenisKelamin")) {
      const parsed = parseOptionalString(payload.jenisKelamin, 10);
      if (!parsed.ok || (parsed.value && parsed.value !== "L" && parsed.value !== "P")) {
        return res.status(400).json({ error: "Jenis kelamin harus L atau P." });
      }
      updateData.jenisKelamin = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "jenjang")) {
      const parsed = parseOptionalString(payload.jenjang, 100);
      if (!parsed.ok) return res.status(400).json({ error: "Jenjang/Paket maksimal 100 karakter." });
      updateData.jenjang = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "tanggalMasuk")) {
      const parsed = parseFlexibleDateInput(payload.tanggalMasuk);
      if (!parsed.ok) return res.status(400).json({ error: "Format tanggal masuk tidak valid (gunakan YYYY-MM-DD atau DD/MM/YYYY)." });
      updateData.tanggalMasuk = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "alamatLengkap")) {
      const parsed = parseOptionalString(payload.alamatLengkap, 500);
      if (!parsed.ok) return res.status(400).json({ error: "Alamat lengkap maksimal 500 karakter." });
      updateData.alamatLengkap = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "desaKelurahan")) {
      const parsed = parseOptionalString(payload.desaKelurahan, 200);
      if (!parsed.ok) return res.status(400).json({ error: "Desa/Kelurahan maksimal 200 karakter." });
      updateData.desaKelurahan = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "kecamatan")) {
      const parsed = parseOptionalString(payload.kecamatan, 200);
      if (!parsed.ok) return res.status(400).json({ error: "Kecamatan maksimal 200 karakter." });
      updateData.kecamatan = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "sekolahAsal")) {
      const parsed = parseOptionalString(payload.sekolahAsal, 200);
      if (!parsed.ok) return res.status(400).json({ error: "Sekolah asal maksimal 200 karakter." });
      updateData.sekolahAsal = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "npsnAsal")) {
      const parsed = parseOptionalString(payload.npsnAsal, 20);
      if (!parsed.ok || (parsed.value && !/^[A-Za-z0-9]{8}$/.test(parsed.value))) {
        return res.status(400).json({ error: "NPSN sekolah asal harus terdiri dari 8 karakter huruf/angka." });
      }
      updateData.npsnAsal = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "nomorIjazahTerakhir")) {
      const parsed = parseOptionalString(payload.nomorIjazahTerakhir, 120);
      if (!parsed.ok) return res.status(400).json({ error: "Nomor ijazah terakhir maksimal 120 karakter." });
      updateData.nomorIjazahTerakhir = parsed.value;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "telepon")) {
      const parsed = parseOptionalString(payload.telepon, 30);
      if (!parsed.ok || (parsed.value && !/^[+0-9 ()-]{6,30}$/.test(parsed.value))) {
        return res.status(400).json({ error: "Nomor telepon/WhatsApp tidak valid (6-30 karakter)." });
      }
      updateData.telepon = parsed.value;
    }

    for (const [fieldKey, label] of [
      ["urlKk", "Berkas KK"],
      ["urlAktaKtp", "Berkas Akta/KTP"],
      ["urlIjazah", "Berkas Ijazah"],
      ["urlSuratPindah", "Berkas Surat Pindah"],
      ["urlFotoIjazah", "Pas Foto Ijazah 4x6"],
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(payload, fieldKey)) {
        const rawVal = payload[fieldKey];
        if (rawVal === null || rawVal === "") {
          updateData[fieldKey] = null;
        } else if (typeof rawVal !== "string" || !isSafeDocumentUrl(rawVal)) {
          return res.status(400).json({ error: `${label} harus berupa tautan http/https atau file gambar/PDF yang valid (maks. 1.5 MB).` });
        } else {
          updateData[fieldKey] = await offloadDataUrlToSupabaseStorage({
            value: rawVal.trim(),
            sekolahId: ctx.sekolahId,
            category: "verval",
          });
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "statusVerval")) {
      if (typeof payload.statusVerval !== "string" || !isAcceptedStatusVervalInput(payload.statusVerval)) {
        return res.status(400).json({ error: "Status verval tidak valid." });
      }
      const nextStatus = normalizeVervalStatus(payload.statusVerval);
      if (ctx.role === "SISWA" && nextStatus !== "BELUM_LENGKAP" && nextStatus !== "SIAP_VERVAL") {
        return res.status(403).json({ error: "Hanya admin/operator PKBM yang dapat menetapkan status terverifikasi PKBM." });
      }
      updateData.statusVerval = nextStatus;
    } else if (payload.ajukanVerifikasi === true) {
      updateData.statusVerval = "SIAP_VERVAL";
    }

    if (Object.prototype.hasOwnProperty.call(payload, "catatanVerval")) {
      if (ctx.role !== "ADMIN") {
        return res.status(403).json({ error: "Hanya admin/operator sekolah yang dapat mengubah catatan verifikasi." });
      }
      const parsed = parseOptionalString(payload.catatanVerval, 500);
      if (!parsed.ok) return res.status(400).json({ error: "Catatan verval maksimal 500 karakter." });
      updateData.catatanVerval = parsed.value;
    }

    try {
      const updatedCount = await prisma.siswa.updateMany({
        where: { id: studentId, sekolahId: ctx.sekolahId },
        data: updateData,
      });
      if (!updatedCount.count) {
        return res.status(404).json({ error: "Siswa tidak ditemukan di sekolah ini." });
      }
      const [updatedStudent, kelasList] = await Promise.all([
        prisma.siswa.findFirst({
          where: { id: studentId, sekolahId: ctx.sekolahId },
          select: SISWA_VERVAL_SELECT,
        }),
        prisma.kelas.findMany({
          where: { sekolahId: ctx.sekolahId },
          select: { id: true, nama: true },
        }),
      ]);
      if (!updatedStudent) return res.status(404).json({ error: "Siswa tidak ditemukan." });
      const kelasMap = new Map(kelasList.map((k) => [k.id, k.nama]));
      return res.json({
        message: "Data verval Dapodik siswa berhasil diperbarui.",
        siswa: serializeVervalStudent(updatedStudent, kelasMap),
      });
    } catch (error) {
      console.error("Gagal memperbarui data verval siswa:", error);
      return res.status(503).json({ error: "Data verval siswa belum dapat diperbarui." });
    }
  });

  router.get("/export", async (req, res) => {
    const ctx = res.locals.vervalCtx as VervalContext;
    if (ctx.role !== "ADMIN") {
      return res.status(403).json({ error: "Akses ekspor verval hanya untuk admin/operator sekolah." });
    }
    const statusFilterRaw = typeof req.query.statusVerval === "string" ? req.query.statusVerval.trim() : "";
    const kelasIdFilter = typeof req.query.kelasId === "string" ? req.query.kelasId.trim() : "";
    if (statusFilterRaw && !isAcceptedStatusVervalInput(statusFilterRaw)) {
      return res.status(400).json({ error: "Filter status verval tidak valid." });
    }
    const statusFilter = statusFilterRaw ? normalizeVervalStatus(statusFilterRaw) : null;

    try {
      const [school, kelasList, students] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: ctx.sekolahId },
          select: { id: true, nama: true, npsn: true, slug: true, kabupatenKota: true },
        }),
        prisma.kelas.findMany({
          where: { sekolahId: ctx.sekolahId },
          select: { id: true, nama: true },
        }),
        prisma.siswa.findMany({
          where: {
            sekolahId: ctx.sekolahId,
            status: "Aktif",
            ...(statusFilter ? { statusVerval: { in: vervalStatusFilterValues(statusFilter) } } : {}),
            ...(kelasIdFilter === "belum" ? { kelasId: null } : kelasIdFilter ? { kelasId: kelasIdFilter } : {}),
          },
          select: SISWA_VERVAL_SELECT,
          orderBy: [{ nama: "asc" }, { id: "asc" }],
          take: 2000,
        }),
      ]);

      const kelasMap = new Map(kelasList.map((k) => [k.id, k.nama]));
      const columns = [
        "Nama",
        "NIK",
        "No KK",
        "NISN",
        "JK",
        "Tempat Lahir",
        "Tanggal Lahir",
        "Nama Ibu Kandung",
        "Jenjang/Paket",
        "Kelas",
        "Sekolah Asal",
        "No Ijazah",
        "Tanggal Masuk",
        "Status Verval",
      ];

      const exportRows = students.map((student) => {
        const kelasNama = student.kelasId ? (kelasMap.get(student.kelasId) ?? "") : "";
        const jenjang = student.jenjang ?? (kelasNama ? detectPaketCategory(null, kelasNama) : "");
        return {
          Nama: student.nama,
          NIK: student.nik ?? "",
          "No KK": student.noKk ?? "",
          NISN: student.nisn,
          JK: student.jenisKelamin ?? "",
          "Tempat Lahir": student.tempatLahir ?? "",
          "Tanggal Lahir": formatDmyDate(student.tanggalLahir),
          "Nama Ibu Kandung": student.namaIbuKandung ?? student.namaIbu ?? "",
          "Jenjang/Paket": jenjang,
          Kelas: kelasNama,
          "Sekolah Asal": student.sekolahAsal ?? "",
          "No Ijazah": student.nomorIjazahTerakhir ?? "",
          "Tanggal Masuk": formatDmyDate(student.tanggalMasuk),
          "Status Verval": normalizeVervalStatus(student.statusVerval),
        };
      });

      if (req.query.format === "csv") {
        const headerLine = columns.map(csvCell).join(",");
        const bodyLines = exportRows.map((row) =>
          columns.map((col) => csvCell(String(row[col as keyof typeof row] ?? ""))).join(","),
        );
        const csvContent = `\uFEFF${[headerLine, ...bodyLines].join("\r\n")}`;
        const safeSlug = (school?.slug || "pkbm").replace(/[^a-z0-9-_]/gi, "_");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="verval-dapodik-${safeSlug}.csv"`);
        return res.send(csvContent);
      }

      if (!school) {
        return res.status(404).json({ error: "Data sekolah tidak ditemukan di database." });
      }

      return res.json({
        sekolah: school,
        exportedAt: new Date().toISOString(),
        columns,
        rows: exportRows,
      });
    } catch (error) {
      console.error("Gagal mengekspor data verval Dapodik:", error);
      return res.status(503).json({ error: "Ekspor data verval Dapodik belum tersedia." });
    }
  });

  return router;
}
