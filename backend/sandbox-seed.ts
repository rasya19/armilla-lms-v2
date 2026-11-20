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

const MINIMAL_SCHOOL_SELECT = {
  id: true,
  slug: true,
  status: true,
  expiresAt: true,
} as const;

const FULL_SCHOOL_SELECT = {
  id: true,
  slug: true,
  nama: true,
  npsn: true,
  status: true,
  expiresAt: true,
  plan: true,
  themeKey: true,
} as const;

const SANDBOX_MOCK_SCHOOL: ResolvedTenantSchool = {
  id: "sandbox-tenant-id",
  slug: SANDBOX_SLUG,
  nama: "Sandbox PKBM Rasyatech",
  npsn: "P9999999",
  status: "ACTIVE",
  expiresAt: null,
  plan: "pro",
  themeKey: "ocean",
};

let inFlightSandboxSeed: Promise<ResolvedTenantSchool | null> | null = null;

async function findSandboxSchoolSafe(prisma: PrismaClient): Promise<ResolvedTenantSchool | null> {
  try {
    return await prisma.sekolah.findUnique({
      where: { slug: SANDBOX_SLUG },
      select: FULL_SCHOOL_SELECT,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
      const minimal = await prisma.sekolah.findUnique({
        where: { slug: SANDBOX_SLUG },
        select: MINIMAL_SCHOOL_SELECT,
      });
      if (!minimal?.id) return null;
      return {
        ...minimal,
        nama: "Sandbox PKBM Rasyatech",
        npsn: "P9999999",
        plan: "pro",
        themeKey: "ocean",
      };
    }
    throw error;
  }
}

async function pickUniqueCode(
  checkExists: (candidate: string) => Promise<boolean>,
  preferred: string,
  fallback: string,
): Promise<string> {
  try {
    if (!(await checkExists(preferred))) return preferred;
  } catch {
    // Fall back to unique suffix if check fails
  }
  return fallback;
}

async function createSandboxSchoolRecord(prisma: PrismaClient): Promise<ResolvedTenantSchool | null> {
  let npsnTaken = false;
  try {
    npsnTaken = Boolean(
      await prisma.sekolah.findUnique({
        where: { npsn: "P9999999" },
        select: { id: true },
      }),
    );
  } catch {
    npsnTaken = false;
  }

  try {
    const created = await prisma.sekolah.create({
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
      select: FULL_SCHOOL_SELECT,
    });
    if (!created?.id) {
      return process.env.DATABASE_URL ? null : { ...SANDBOX_MOCK_SCHOOL };
    }
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return findSandboxSchoolSafe(prisma);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
      try {
        const fallback = await prisma.sekolah.create({
          data: {
            nama: "Sandbox PKBM Rasyatech",
            slug: SANDBOX_SLUG,
            npsn: npsnTaken ? null : "P9999999",
            status: "ACTIVE",
            expiresAt: null,
          },
          select: MINIMAL_SCHOOL_SELECT,
        });
        if (!fallback?.id) {
          return process.env.DATABASE_URL ? null : { ...SANDBOX_MOCK_SCHOOL };
        }
        return {
          ...fallback,
          nama: "Sandbox PKBM Rasyatech",
          npsn: npsnTaken ? null : "P9999999",
          plan: "pro",
          themeKey: "ocean",
        };
      } catch (fallbackError) {
        if (fallbackError instanceof Prisma.PrismaClientKnownRequestError && fallbackError.code === "P2002") {
          return findSandboxSchoolSafe(prisma);
        }
        throw fallbackError;
      }
    }
    throw error;
  }
}

async function seedSandboxDemoRecords(prisma: PrismaClient, school: ResolvedTenantSchool): Promise<void> {
  const passwordHash = await hashPassword(SANDBOX_DEMO_PASSWORD);
  const suffix = school.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "sbx";

  // 1. WebsiteSettings (safe optional relation)
  try {
    const existingSettings = await prisma.websiteSettings.findUnique({
      where: { school_id: school.id },
      select: { school_id: true },
    });
    if (!existingSettings) {
      await prisma.websiteSettings.create({
        data: {
          school_id: school.id,
          primary_color: "#4f46e5",
          hero_title: "Sandbox PKBM Rasyatech",
          hero_subtitle: "Portal Pembelajaran Kesetaraan PKBM Rasyatech",
          show_gallery: true,
          show_news: true,
          footer_text: "© 2026 Sandbox PKBM Rasyatech",
        },
      });
    }
  } catch (err) {
    console.warn("Auto-seed WebsiteSettings sandbox dilewati:", err instanceof Error ? err.message : "UnknownError");
  }

  // 2. Admin Sandbox (ismantoj88@gmail.com / 123456)
  try {
    const existingAdmin = await prisma.akun.findUnique({
      where: { email: SANDBOX_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!existingAdmin) {
      await prisma.akun.create({
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
  } catch (err) {
    console.warn("Auto-seed admin sandbox dilewati:", err instanceof Error ? err.message : "UnknownError");
  }

  // 3. 2 Guru Demo
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
  for (const spec of guruSpecs) {
    try {
      const nuptkTaken = Boolean(
        await prisma.guru.findUnique({ where: { nuptk: spec.nuptk }, select: { id: true } }),
      );
      const guru = await prisma.guru.create({
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
      if (guru?.id) {
        gurus.push(guru);
        const guruAccountTaken = await prisma.akun.findUnique({
          where: { email: spec.email },
          select: { id: true },
        });
        if (!guruAccountTaken) {
          await prisma.akun.create({
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
    } catch (err) {
      console.warn("Auto-seed guru sandbox dilewati:", err instanceof Error ? err.message : "UnknownError");
    }
  }

  // 4. 3 Kelas Paket A/B/C
  const kelasSpecs = [
    { kode: "SBX-PA", nama: "Paket A (Setara SD)", waliGuruId: gurus[0]?.id ?? null },
    { kode: "SBX-PB", nama: "Paket B (Setara SMP)", waliGuruId: gurus[1]?.id ?? null },
    { kode: "SBX-PC", nama: "Paket C (Setara SMA)", waliGuruId: gurus[0]?.id ?? null },
  ];
  const classes: Array<{ id: string; nama: string }> = [];
  for (const spec of kelasSpecs) {
    try {
      const kode = await pickUniqueCode(
        async (candidate) => Boolean(await prisma.kelas.findUnique({ where: { kode: candidate }, select: { id: true } })),
        spec.kode,
        `${spec.kode}-${suffix}`,
      );
      const createdClass = await prisma.kelas.create({
        data: {
          sekolahId: school.id,
          kode,
          nama: spec.nama,
          waliGuruId: spec.waliGuruId,
        },
        select: { id: true, nama: true },
      });
      if (createdClass?.id) classes.push(createdClass);
    } catch (err) {
      console.warn("Auto-seed kelas sandbox dilewati:", err instanceof Error ? err.message : "UnknownError");
    }
  }

  // 5. 5 Siswa Demo
  const siswaSpecs = [
    { nisn: "9999000001", nama: "Budi Santoso", jenjang: "Paket A", kelasIndex: 0, email: "siswa1.sandbox@pkbm.siput.id", telepon: "081399990001" },
    { nisn: "9999000002", nama: "Citra Lestari", jenjang: "Paket B", kelasIndex: 1, email: "siswa2.sandbox@pkbm.siput.id", telepon: "081399990002" },
    { nisn: "9999000003", nama: "Dewi Anggraini", jenjang: "Paket B", kelasIndex: 1, email: "siswa3.sandbox@pkbm.siput.id", telepon: "081399990003" },
    { nisn: "9999000004", nama: "Eko Prasetyo", jenjang: "Paket C", kelasIndex: 2, email: "siswa4.sandbox@pkbm.siput.id", telepon: "081399990004" },
    { nisn: "9999000005", nama: "Fitri Handayani", jenjang: "Paket C", kelasIndex: 2, email: "siswa5.sandbox@pkbm.siput.id", telepon: "081399990005" },
  ];
  for (let i = 0; i < siswaSpecs.length; i++) {
    const spec = siswaSpecs[i];
    try {
      const fallbackNisn = `${Date.now().toString().slice(-9)}${i}`;
      const nisn = await pickUniqueCode(
        async (candidate) => Boolean(await prisma.siswa.findUnique({ where: { nisn: candidate }, select: { id: true } })),
        spec.nisn,
        fallbackNisn,
      );
      const student = await prisma.siswa.create({
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
      if (student?.id) {
        await prisma.akun.create({
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
    } catch (err) {
      console.warn("Auto-seed siswa sandbox dilewati:", err instanceof Error ? err.message : "UnknownError");
    }
  }

  // 6. 4 Mapel Demo
  const mapelSpecs = [
    { kode: "SBX-BIND", nama: "Bahasa Indonesia", kkm: 75 },
    { kode: "SBX-MTK", nama: "Matematika", kkm: 70 },
    { kode: "SBX-BING", nama: "Bahasa Inggris", kkm: 75 },
    { kode: "SBX-IPA", nama: "Ilmu Pengetahuan Alam", kkm: 72 },
  ];
  const mapels: Array<{ id: string; nama: string }> = [];
  for (const spec of mapelSpecs) {
    try {
      const kode = await pickUniqueCode(
        async (candidate) => Boolean(await prisma.mapel.findUnique({ where: { kode: candidate }, select: { id: true } })),
        spec.kode,
        `${spec.kode}-${suffix}`,
      );
      const mapel = await prisma.mapel.create({
        data: {
          sekolahId: school.id,
          kode,
          nama: spec.nama,
          kkm: spec.kkm,
        },
        select: { id: true, nama: true },
      });
      if (mapel?.id) mapels.push(mapel);
    } catch (err) {
      console.warn("Auto-seed mapel sandbox dilewati:", err instanceof Error ? err.message : "UnknownError");
    }
  }

  // 7. Tahun Ajaran & Jadwal Pelajaran agar LMS Guru/Siswa langsung aktif
  if (classes.length >= 3 && mapels.length >= 3 && gurus.length >= 2) {
    try {
      const tahunAjaran = await prisma.tahunAjaran.create({
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
        await prisma.jadwalPelajaran.createMany({
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
    } catch (err) {
      console.warn("Auto-seed jadwal sandbox dilewati:", err instanceof Error ? err.message : "UnknownError");
    }
  }
}

async function seedSandboxTenantInternal(prisma: PrismaClient): Promise<ResolvedTenantSchool | null> {
  try {
    const existing = await findSandboxSchoolSafe(prisma);
    if (existing) return existing;

    const school = await createSandboxSchoolRecord(prisma);
    if (!school?.id) return null;

    if (school.id !== SANDBOX_MOCK_SCHOOL.id) {
      await seedSandboxDemoRecords(prisma, school);
    }

    return school;
  } catch (error) {
    console.error("Gagal auto-seed tenant sandbox:", error instanceof Error ? error.message : "UnknownError");
    try {
      const recovered = await findSandboxSchoolSafe(prisma);
      if (recovered) return recovered;
    } catch {
      // Ignore recovery lookup error
    }
    return process.env.DATABASE_URL ? null : { ...SANDBOX_MOCK_SCHOOL };
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
  if (slug !== SANDBOX_SLUG) {
    try {
      return await prisma.sekolah.findUnique({
        where: { slug },
        select: FULL_SCHOOL_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
        const minimal = await prisma.sekolah.findUnique({
          where: { slug },
          select: MINIMAL_SCHOOL_SELECT,
        });
        if (!minimal) return null;
        return { ...minimal, nama: slug, npsn: null, plan: "basic", themeKey: "ocean" };
      }
      throw error;
    }
  }
  try {
    const existing = await findSandboxSchoolSafe(prisma);
    if (existing) return existing;
    return await ensureSandboxTenant(prisma);
  } catch (error) {
    console.error("Resolusi tenant sandbox fallback:", error instanceof Error ? error.message : "UnknownError");
    return process.env.DATABASE_URL ? null : { ...SANDBOX_MOCK_SCHOOL };
  }
}

export async function resolveTenantHostSchool(
  prisma: PrismaClient,
  rawSlug: string,
): Promise<{ id: string; slug: string; status: "ACTIVE" | "SUSPENDED"; expiresAt: Date | null } | null> {
  const slug = rawSlug.trim().toLowerCase();
  if (slug !== SANDBOX_SLUG) {
    return prisma.sekolah.findUnique({
      where: { slug },
      select: MINIMAL_SCHOOL_SELECT,
    });
  }
  try {
    const existing = await prisma.sekolah.findUnique({
      where: { slug: SANDBOX_SLUG },
      select: MINIMAL_SCHOOL_SELECT,
    });
    if (existing?.id) return existing;
    return await ensureSandboxTenant(prisma);
  } catch (error) {
    console.error("Resolusi host sandbox fallback:", error instanceof Error ? error.message : "UnknownError");
    return process.env.DATABASE_URL ? null : { ...SANDBOX_MOCK_SCHOOL };
  }
}
