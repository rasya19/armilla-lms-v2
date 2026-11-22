import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

type BankRow = {
  id: string;
  schoolId: string | null;
  originSchoolName: string;
  paket: string;
  gradeLevel: string;
  subject: string;
  title: string;
  summary: string | null;
  fileUrl: string;
  visibility: string;
  createdAt: Date;
};

test("module-bank routes enforce visibility scoping, seed idempotency, bulk import, and assign-to-class", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { moduleBankRoutes, NATIONAL_MODULE_CATALOG, NATIONAL_ORIGIN_NAME } = await import(
    "./module-bank-routes.js"
  );

  let nextId = 1;
  const bankRows: BankRow[] = [
    {
      id: "mod-a-priv",
      schoolId: "school-a",
      originSchoolName: "PKBM Harapan",
      paket: "Paket C",
      gradeLevel: "Kelas 10",
      subject: "Matematika",
      title: "Modul Privat A",
      summary: "Ringkasan A",
      fileUrl: "https://drive.google.com/file/d/abcdefghij12345/view",
      visibility: "PRIVATE",
      createdAt: new Date("2026-11-20T00:00:00Z"),
    },
    {
      id: "mod-b-priv",
      schoolId: "school-b",
      originSchoolName: "PKBM Nusantara",
      paket: "Paket B",
      gradeLevel: "Kelas 8",
      subject: "IPA",
      title: "Modul Rahasia Sekolah B",
      summary: null,
      fileUrl: "https://example.com/secret-b.pdf",
      visibility: "PRIVATE",
      createdAt: new Date("2026-11-20T01:00:00Z"),
    },
    {
      id: "mod-b-arch",
      schoolId: "school-b",
      originSchoolName: "PKBM Nusantara",
      paket: "Paket B",
      gradeLevel: "Kelas 8",
      subject: "IPA",
      title: "Modul Arsip Sekolah B",
      summary: null,
      fileUrl: "https://example.com/archive-b.pdf",
      visibility: "ARCHIVED",
      createdAt: new Date("2026-11-20T02:00:00Z"),
    },
    {
      id: "mod-b-pub",
      schoolId: "school-b",
      originSchoolName: "PKBM Nusantara",
      paket: "Paket A",
      gradeLevel: "Kelas 5",
      subject: "Bahasa Indonesia",
      title: "Modul Publik Sekolah B",
      summary: "Terbuka untuk semua",
      fileUrl: "https://emodul.kemdikbud.go.id/A-BInd-5/A-BInd-5.pdf",
      visibility: "PUBLIC",
      createdAt: new Date("2026-11-20T03:00:00Z"),
    },
  ];

  const createdMaterials: Array<{ id: string; judul: string; kelasId: string; jenis?: string; tautan?: string | null }> = [];

  Object.defineProperty(prisma.sekolah, "findUnique", {
    configurable: true,
    value: async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      nama: where.id === "school-a" ? "PKBM Harapan" : "PKBM Nusantara",
    }),
  });

  Object.defineProperty(prisma.kelas, "findMany", {
    configurable: true,
    value: async ({ where }: { where: { sekolahId: string } }) =>
      where.sekolahId === "school-a" ? [{ id: "class-a", nama: "Paket C Kelas 10" }] : [],
  });

  Object.defineProperty(prisma.kelas, "findFirst", {
    configurable: true,
    value: async ({ where }: { where: { id: string; sekolahId: string } }) =>
      where.id === "class-a" && where.sekolahId === "school-a"
        ? { id: "class-a", nama: "Paket C Kelas 10" }
        : null,
  });

  Object.defineProperty(prisma.mapel, "findMany", {
    configurable: true,
    value: async () => [{ id: "mapel-ind", nama: "Bahasa Indonesia" }],
  });

  Object.defineProperty(prisma.mapel, "findFirst", {
    configurable: true,
    value: async () => null,
  });

  Object.defineProperty(prisma.mapel, "create", {
    configurable: true,
    value: async ({ data }: { data: { nama: string } }) => ({ id: "mapel-auto", nama: data.nama }),
  });

  Object.defineProperty(prisma.tahunAjaran, "findFirst", {
    configurable: true,
    value: async () => ({ id: "ta-1" }),
  });

  Object.defineProperty(prisma.guru, "findFirst", {
    configurable: true,
    value: async () => ({ id: "guru-a" }),
  });

  Object.defineProperty(prisma.materiAjar, "findFirst", {
    configurable: true,
    value: async ({ where }: { where: { judul?: string; kelasId?: string } }) =>
      createdMaterials.find((m) => m.judul === where.judul && m.kelasId === where.kelasId) ?? null,
  });

  Object.defineProperty(prisma.materiAjar, "create", {
    configurable: true,
    value: async ({ data }: { data: { judul: string; kelasId: string; jenis?: string; tautan?: string | null } }) => {
      const rec = { ...data, id: `materi-${createdMaterials.length + 1}` };
      createdMaterials.push(rec);
      return { id: rec.id, judul: rec.judul };
    },
  });

  Object.defineProperty(prisma, "learningModuleBank", {
    configurable: true,
    value: {
      findMany: async ({
        where,
      }: {
        where?: { schoolId?: string | null; visibility?: string; originSchoolName?: string; paket?: string };
      }) => {
        return bankRows.filter((row) => {
          if (where?.schoolId !== undefined && row.schoolId !== where.schoolId) return false;
          if (where?.originSchoolName !== undefined && row.originSchoolName !== where.originSchoolName) return false;
          if (where?.visibility !== undefined && row.visibility !== where.visibility) return false;
          if (where?.paket !== undefined && row.paket !== where.paket) return false;
          return true;
        });
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; schoolId?: string; OR?: Array<{ visibility?: string; schoolId?: string }> };
      }) => {
        return (
          bankRows.find((row) => {
            if (row.id !== where.id) return false;
            if (where.schoolId !== undefined && row.schoolId !== where.schoolId) return false;
            if (where.OR) {
              const matchedOr = where.OR.some(
                (cond) =>
                  (cond.visibility !== undefined && row.visibility === cond.visibility) ||
                  (cond.schoolId !== undefined && row.schoolId === cond.schoolId),
              );
              if (!matchedOr) return false;
            }
            return true;
          }) ?? null
        );
      },
      create: async ({ data }: { data: Omit<BankRow, "id" | "createdAt"> }) => {
        const rec: BankRow = {
          id: `mod-new-${nextId++}`,
          createdAt: new Date(),
          ...data,
        };
        bankRows.push(rec);
        return rec;
      },
      createMany: async ({ data }: { data: Array<Omit<BankRow, "id" | "createdAt">> }) => {
        for (const item of data) {
          bankRows.push({
            id: `mod-new-${nextId++}`,
            createdAt: new Date(),
            ...item,
          });
        }
        return { count: data.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<BankRow> }) => {
        const target = bankRows.find((r) => r.id === where.id);
        assert.ok(target);
        Object.assign(target, data);
        return target;
      },
      deleteMany: async ({ where }: { where: { id: string; schoolId: string } }) => {
        const idx = bankRows.findIndex((r) => r.id === where.id && r.schoolId === where.schoolId);
        if (idx === -1) return { count: 0 };
        bankRows.splice(idx, 1);
        return { count: 1 };
      },
    },
  });

  const server = express()
    .use(express.json())
    .use(
      "/api/module-bank",
      moduleBankRoutes(async (req) => {
        const role = req.get("x-role");
        if (role === "SISWA") {
          return {
            sekolahId: "school-a",
            peran: "SISWA" as const,
            nama: "Siswa Uji",
            siswaId: "stu-1",
            kelasId: "class-a",
            guruId: null,
            wajibGantiPassword: false,
          };
        }
        const schoolId = req.get("x-school") ?? "school-a";
        return {
          sekolahId: schoolId,
          peran: "ADMIN" as const,
          nama: "Admin Uji",
          siswaId: null,
          kelasId: null,
          guruId: null,
          wajibGantiPassword: false,
        };
      }),
    )
    .listen(0, "127.0.0.1");

  await once(server, "listening");

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr !== "string");
    const base = `http://127.0.0.1:${addr.port}/api/module-bank`;
    const call = (path: string, opts?: { method?: string; body?: unknown; role?: string; school?: string }) =>
      fetch(base + path, {
        method: opts?.method ?? "GET",
        headers: {
          "content-type": "application/json",
          "x-role": opts?.role ?? "ADMIN",
          "x-school": opts?.school ?? "school-a",
        },
        ...(opts?.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });

    // 1. Reject SISWA
    assert.equal((await call("/", { role: "SISWA" })).status, 401);

    // 2. GET / hides other schools' PRIVATE and ARCHIVED modules
    const listRes = await call("/");
    assert.equal(listRes.status, 200);
    const listBody = (await listRes.json()) as {
      schoolModules: BankRow[];
      publicModules: BankRow[];
    };
    assert.deepEqual(
      listBody.schoolModules.map((m) => m.id),
      ["mod-a-priv"],
    );
    assert.deepEqual(
      listBody.publicModules.map((m) => m.id),
      ["mod-b-pub"],
    );

    // 3. POST / validates URL & stores metadata
    assert.equal(
      (
        await call("/", {
          method: "POST",
          body: {
            paket: "Paket C",
            gradeLevel: "Kelas 11",
            subject: "Ekonomi",
            title: "Bad URL",
            fileUrl: "javascript:alert(1)",
          },
        })
      ).status,
      400,
    );

    const createRes = await call("/", {
      method: "POST",
      body: {
        paket: "Paket C",
        gradeLevel: "Kelas 11",
        subject: "Ekonomi",
        title: "Modul Ekonomi Kreatif",
        summary: "Kewirausahaan warga belajar",
        fileUrl: "https://drive.google.com/file/d/xyz9876543210/view",
        visibility: "PRIVATE",
      },
    });
    assert.equal(createRes.status, 201);
    const createdJson = (await createRes.json()) as { module: BankRow };
    assert.equal(createdJson.module.schoolId, "school-a");
    assert.equal(createdJson.module.visibility, "PRIVATE");

    // 4. POST /import-bulk
    const bulkRes = await call("/import-bulk", {
      method: "POST",
      body: {
        visibility: "PUBLIC",
        items: [
          {
            paket: "Paket A",
            gradeLevel: "Kelas 4",
            subject: "IPAS",
            title: "Modul Bulk 1",
            fileUrl: "https://example.com/bulk-1.pdf",
          },
          {
            paket: "Paket B",
            gradeLevel: "Kelas 9",
            subject: "Matematika",
            title: "Modul Bulk 2",
            fileUrl: "https://example.com/bulk-2.pdf",
          },
        ],
      },
    });
    assert.equal(bulkRes.status, 201);
    const bulkJson = (await bulkRes.json()) as { imported: number };
    assert.equal(bulkJson.imported, 2);

    // 5. POST /seed-national is idempotent
    const seed1 = await call("/seed-national", { method: "POST" });
    assert.equal(seed1.status, 201);
    const seed1Json = (await seed1.json()) as { seeded: number; totalCatalog: number };
    assert.equal(seed1Json.seeded, NATIONAL_MODULE_CATALOG.length);
    assert.ok(
      bankRows.some(
        (r) => r.schoolId === null && r.originSchoolName === NATIONAL_ORIGIN_NAME && r.visibility === "PUBLIC",
      ),
    );

    const seed2 = await call("/seed-national", { method: "POST" });
    assert.equal(seed2.status, 201);
    const seed2Json = (await seed2.json()) as { seeded: number; alreadyPresent: number };
    assert.equal(seed2Json.seeded, 0);
    assert.equal(seed2Json.alreadyPresent, NATIONAL_MODULE_CATALOG.length);

    // 6. PATCH /:id/visibility scoped to school
    assert.equal(
      (
        await call("/mod-b-priv/visibility", {
          method: "PATCH",
          body: { visibility: "PUBLIC" },
          school: "school-a",
        })
      ).status,
      404,
    );
    const visRes = await call("/mod-a-priv/visibility", {
      method: "PATCH",
      body: { visibility: "ARCHIVED" },
    });
    assert.equal(visRes.status, 200);
    assert.equal(bankRows.find((r) => r.id === "mod-a-priv")?.visibility, "ARCHIVED");

    // 7. POST /:id/assign-to-class rejects other school's private/archived module, accepts PUBLIC
    assert.equal(
      (
        await call("/mod-b-priv/assign-to-class", {
          method: "POST",
          body: { classId: "class-a" },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call("/mod-b-arch/assign-to-class", {
          method: "POST",
          body: { classId: "class-a" },
        })
      ).status,
      404,
    );

    const assignRes = await call("/mod-b-pub/assign-to-class", {
      method: "POST",
      body: { classId: "class-a" },
    });
    assert.equal(assignRes.status, 201);
    assert.equal(createdMaterials.length, 1);
    assert.equal(createdMaterials[0].jenis, "MODUL_PDF");
    assert.equal(createdMaterials[0].tautan, "https://emodul.kemdikbud.go.id/A-BInd-5/A-BInd-5.pdf");

    // Duplicate assign returns alreadyExists without inserting second row
    const dupRes = await call("/mod-b-pub/assign-to-class", {
      method: "POST",
      body: { classId: "class-a" },
    });
    assert.equal(dupRes.status, 200);
    const dupJson = (await dupRes.json()) as { alreadyExists: boolean };
    assert.equal(dupJson.alreadyExists, true);
    assert.equal(createdMaterials.length, 1);

    // 8. DELETE /:id scoped to school
    assert.equal((await call("/mod-b-pub", { method: "DELETE", school: "school-a" })).status, 404);
    assert.equal((await call("/mod-a-priv", { method: "DELETE", school: "school-a" })).status, 200);
    assert.equal(bankRows.some((r) => r.id === "mod-a-priv"), false);
  } finally {
    server.close();
    await once(server, "close");
    await prisma.$disconnect();
    await pool.end();
    await loginPool.end();
  }
});
