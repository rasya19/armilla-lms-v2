import { Prisma, type PrismaClient } from "@prisma/client";
import { hashPassword } from "./password.js";

export const SANDBOX_SLUG = "sandbox";
export const SANDBOX_ADMIN_EMAIL = "ismantoj88@gmail.com";
export const SANDBOX_DEMO_PASSWORD = "123456";

export type ResolvedTenantSchool = {
  id: string;
  slug: string;
  nama: string;
  npsn: string | null;
  status: "ACTIVE" | "SUSPENDED";
  expiresAt: Date | null;
  plan: string | null;
  themeKey: string;
};

const SCHOOL_SELECT = {
  id: true,
  slug: true,
  nama: true,
  npsn: true,
  status: true,
  expiresAt: true,
  plan: true,
  themeKey: true,
} as const;

let inFlightSandboxSeed: Promise<ResolvedTenantSchool | null> | null = null;

async function pickUniqueCode(
  checkExists: (candidate: string) => Promise<boolean>,
  preferred: string,
  fallback: string,
): Promise<string> {
  if (!(await checkExists(preferred))) return preferred;
  return fallback;
}

async function seedSandboxTenantInternal(prisma: PrismaClient): Promise<ResolvedTenantSchool | null> {
  const existing = await prisma.sekolah.findUnique({
    where: { slug: SANDBOX_SLUG },
    select: SCHOOL_SELECT,
  });
  if (existing) return existing;

  const passwordHash = await hashPassword(SANDBOX_DEMO_PASSWORD);

  try {
    return await prisma.$transaction(async (tx) => {
      const existingInTx = await tx.sekolah.findUnique({
        where: { slug: SANDBOX_SLUG },
        select: SCHOOL_SELECT,
      });
      if (existingInTx) return existingInTx;

      const npsnTaken = await tx.sekolah.findUnique({
        where: { npsn: "P9999999" },
        select: { id: true },
      });

      const school = await tx.sekolah.create({
        data: {
          nama: "Sandbox PKBM Rasyatech",
          slug: SANDBOX_SLUG,
          npsn: npsnTaken ? null : "P9999999",
          plan: "pro",
          status: "ACTIVE",
          expiresAt: null,
          themeKey: "ocean",
          kelasStandarDibuat: true,
        },
        select: SCHOOL_SELECT,
      });

      if (!school?.id) return null;

      const suffix = school.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "sbx";

      const existingAdmin = await tx.akun.findUnique({
        where: { email: SANDBOX_ADMIN_EMAIL },
        select: { id: true },
      });
      if (!existingAdmin) {
        await tx.akun.create({
          data: {
            sekolahId: school.id,
            email: SANDBOX_ADMIN_EMAIL,
            nama: "Admin Sandbox Rasyatech",
            passwordHash,
            peran: "ADMIN",
            aktif: true,
            wajibGantiPassword: false,
          },
        });
      }

      const guruSpecs = [
        {
          nuptk: "9999000100000001",
          nama: "Ahmad Fauzi, S.Pd",
          mapelUtama: "Matematika",
          email: "guru1.sandbox@pkbm.siput.id",
          telepon: "081299990001",
        },
        {
          nuptk: "9999000100000002",
          nama: "Siti Rahmawati, S.Pd",
          mapelUtama: "Bahasa Indonesia",
          email: "guru2.sandbox@pkbm.siput.id",
          telepon: "081299990002",
        },
      ];

      const gurus: Array<{ id: string; nama: string }> = [];
      for (let i = 0; i < guruSpecs.length; i++) {
        const spec = guruSpecs[i];
        const nuptkTaken = await tx.guru.findUnique({
          where: { nuptk: spec.nuptk },
          select: { id: true },
        });
        const guru = await tx.guru.create({
          data: {
            sekolahId: school.id,
            nuptk: nuptkTaken ? null : spec.nuptk,
            nama: spec.nama,
            mapelUtama: spec.mapelUtama,
            email: spec.email,
            telepon: spec.telepon,
            status: "Aktif",
          },
          select: { id: true, nama: true },
        });
        gurus.push(guru);

        const guruAccountTaken = await tx.akun.findUnique({
          where: { email: spec.email },
          select: { id: true },
        });
        if (!guruAccountTaken) {
          await tx.akun.create({
            data: {
              sekolahId: school.id,
              guruId: guru.id,
              email: spec.email,
              nama: guru.nama,
              passwordHash,
              peran: "GURU",
              aktif: true,
              wajibGantiPassword: false,
            },
          });
        }
      }

      const kelasSpecs = [
        { kode: "SBX-PA", nama: "Paket A (Setara SD)", waliGuruId: gurus[0]?.id ?? null },
        { kode: "SBX-PB", nama: "Paket B (Setara SMP)", waliGuruId: gurus[1]?.id ?? null },
        { kode: "SBX-PC", nama: "Paket C (Setara SMA)", waliGuruId: gurus[0]?.id ?? null },
      ];

      const classes: Array<{ id: string; nama: string }> = [];
      for (const spec of kelasSpecs) {
        const kode = await pickUniqueCode(
          async (candidate) => Boolean(await tx.kelas.findUnique({ where: { kode: candidate }, select: { id: true } })),
          spec.kode,
          `${spec.kode}-${suffix}`,
        );
        const createdClass = await tx.kelas.create({
          data: {
            sekolahId: school.id,
            kode,
            nama: spec.nama,
            waliGuruId: spec.waliGuruId,
          },
          select: { id: true, nama: true },
        });
        classes.push(createdClass);
      }

      const siswaSpecs = [
        { nisn: "9999000001", nama: "Budi Santoso", jenjang: "Paket A", kelasIndex: 0, email: "siswa1.sandbox@pkbm.siput.id", telepon: "081399990001" },
        { nisn: "9999000002", nama: "Citra Lestari", jenjang: "Paket B", kelasIndex: 1, email: "siswa2.sandbox@pkbm.siput.id", telepon: "081399990002" },
        { nisn: "9999000003", nama: "Dewi Anggraini", jenjang: "Paket B", kelasIndex: 1, email: "siswa3.sandbox@pkbm.siput.id", telepon: "081399990003" },
        { nisn: "9999000004", nama: "Eko Prasetyo", jenjang: "Paket C", kelasIndex: 2, email: "siswa4.sandbox@pkbm.siput.id", telepon: "081399990004" },
        { nisn: "9999000005", nama: "Fitri Handayani", jenjang: "Paket C", kelasIndex: 2, email: "siswa5.sandbox@pkbm.siput.id", telepon: "081399990005" },
      ];

      for (let i = 0; i < siswaSpecs.length; i++) {
        const spec = siswaSpecs[i];
        const fallbackNisn = `${Date.now().toString().slice(-9)}${i}`;
        const nisn = await pickUniqueCode(
          async (candidate) => Boolean(await tx.siswa.findUnique({ where: { nisn: candidate }, select: { id: true } })),
          spec.nisn,
          fallbackNisn,
        );
        const student = await tx.siswa.create({
          data: {
            sekolahId: school.id,
            nisn,
            nama: spec.nama,
            jenjang: spec.jenjang,
            kelasId: classes[spec.kelasIndex]?.id ?? null,
            email: spec.email,
            telepon: spec.telepon,
            status: "Aktif",
          },
          select: { id: true, nama: true },
        });
        await tx.akun.create({
          data: {
            sekolahId: school.id,
            siswaId: student.id,
            nama: student.nama,
            passwordHash,
            peran: "SISWA",
            aktif: true,
            wajibGantiPassword: false,
          },
        });
      }

      const mapelSpecs = [
        { kode: "SBX-BIND", nama: "Bahasa Indonesia", kkm: 75 },
        { kode: "SBX-MTK", nama: "Matematika", kkm: 70 },
        { kode: "SBX-BING", nama: "Bahasa Inggris", kkm: 75 },
        { kode: "SBX-IPA", nama: "Ilmu Pengetahuan Alam", kkm: 72 },
      ];

      const mapels: Array<{ id: string; nama: string }> = [];
      for (const spec of mapelSpecs) {
        const kode = await pickUniqueCode(
          async (candidate) => Boolean(await tx.mapel.findUnique({ where: { kode: candidate }, select: { id: true } })),
          spec.kode,
          `${spec.kode}-${suffix}`,
        );
        const mapel = await tx.mapel.create({
          data: {
            sekolahId: school.id,
            kode,
            nama: spec.nama,
            kkm: spec.kkm,
          },
          select: { id: true, nama: true },
        });
        mapels.push(mapel);
      }

      if (classes.length >= 3 && mapels.length >= 3 && gurus.length >= 2) {
        const tahunAjaran = await tx.tahunAjaran.create({
          data: {
            sekolahId: school.id,
            nama: "2026/2027",
            semester: "Ganjil",
            mulai: new Date("2025-01-01T00:00:00.000Z"),
            selesai: new Date("2028-12-31T00:00:00.000Z"),
          },
          select: { id: true },
        });
        if (tahunAjaran?.id) {
          await tx.jadwalPelajaran.createMany({
            data: [
              {
                sekolahId: school.id,
                tahunAjaranId: tahunAjaran.id,
                kelasId: classes[0].id,
                mapelId: mapels[1].id,
                guruId: gurus[0].id,
                hari: 1,
                jamMulai: "08:00",
                jamSelesai: "09:30",
                ruangan: "Ruang Paket A",
              },
              {
                sekolahId: school.id,
                tahunAjaranId: tahunAjaran.id,
                kelasId: classes[1].id,
                mapelId: mapels[0].id,
                guruId: gurus[1].id,
                hari: 2,
                jamMulai: "09:45",
                jamSelesai: "11:15",
                ruangan: "Ruang Paket B",
              },
              {
                sekolahId: school.id,
                tahunAjaranId: tahunAjaran.id,
                kelasId: classes[2].id,
                mapelId: mapels[2].id,
                guruId: gurus[0].id,
                hari: 3,
                jamMulai: "13:00",
                jamSelesai: "14:30",
                ruangan: "Ruang Paket C",
              },
            ],
          });
        }
      }

      return school;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.sekolah.findUnique({
        where: { slug: SANDBOX_SLUG },
        select: SCHOOL_SELECT,
      });
    }
    throw error;
  }
}

export async function ensureSandboxTenant(prisma: PrismaClient): Promise<ResolvedTenantSchool | null> {
  if (!inFlightSandboxSeed) {
    inFlightSandboxSeed = seedSandboxTenantInternal(prisma).finally(() => {
      inFlightSandboxSeed = null;
    });
  }
  return inFlightSandboxSeed;
}

export async function resolveSchoolWithSandboxSeed(
  prisma: PrismaClient,
  rawSlug: string,
): Promise<ResolvedTenantSchool | null> {
  const slug = rawSlug.trim().toLowerCase();
  const existing = await prisma.sekolah.findUnique({
    where: { slug },
    select: SCHOOL_SELECT,
  });
  if (existing || slug !== SANDBOX_SLUG) {
    return existing;
  }
  return ensureSandboxTenant(prisma);
}
