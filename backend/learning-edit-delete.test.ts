import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

test("learning edit and delete enforce ownership, tenant scoping, and clean up task submissions", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { learningRoutes } = await import("./learning-routes.js");
  const today = new Date("2026-11-19T00:00:00.000Z");

  let deletedSubmissionsForTask: string | null = null;
  let deletedTaskId: string | null = null;
  let updatedMaterialData: Record<string, unknown> | null = null;
  let updatedTaskData: Record<string, unknown> | null = null;

  Object.defineProperty(prisma.kelas, "findFirst", {
    configurable: true,
    value: async ({ where }: { where: { id: string; sekolahId: string } }) =>
      where.id === "class-a" && where.sekolahId === "school-a" ? { id: "class-a" } : null,
  });

  Object.defineProperty(prisma.materiAjar, "findMany", {
    configurable: true,
    value: async () => [
      {
        id: "mat-a",
        guruId: "teacher-a",
        judul: "Modul 1",
        createdAt: today,
        kelas: { nama: "Kelas 9" },
        mapel: { nama: "Matematika" },
        guru: { nama: "Guru A" },
        tahunAjaran: { nama: "2026", semester: "Ganjil" },
        deskripsi: "Isi lama",
        tautan: null,
      },
    ],
  });

  Object.defineProperty(prisma.materiAjar, "updateMany", {
    configurable: true,
    value: async ({ where, data }: { where: { id: string; sekolahId: string; guruId?: string }; data: Record<string, unknown> }) => {
      if (where.id !== "mat-a" || where.sekolahId !== "school-a") return { count: 0 };
      if (where.guruId && where.guruId !== "teacher-a") return { count: 0 };
      updatedMaterialData = data;
      return { count: 1 };
    },
  });

  Object.defineProperty(prisma.materiAjar, "deleteMany", {
    configurable: true,
    value: async ({ where }: { where: { id: string; sekolahId: string; guruId?: string } }) => {
      if (where.id !== "mat-a" || where.sekolahId !== "school-a") return { count: 0 };
      if (where.guruId && where.guruId !== "teacher-a") return { count: 0 };
      return { count: 1 };
    },
  });

  Object.defineProperty(prisma.tugas, "updateMany", {
    configurable: true,
    value: async ({ where, data }: { where: { id: string; sekolahId: string; guruId?: string }; data: Record<string, unknown> }) => {
      if (where.id !== "task-a" || where.sekolahId !== "school-a") return { count: 0 };
      if (where.guruId && where.guruId !== "teacher-a") return { count: 0 };
      updatedTaskData = data;
      return { count: 1 };
    },
  });

  Object.defineProperty(prisma, "$transaction", {
    configurable: true,
    value: async (fn: (tx: object) => Promise<unknown>) =>
      fn({
        tugas: {
          findFirst: async ({ where }: { where: { id: string; sekolahId: string; guruId?: string } }) => {
            if (where.id !== "task-a" || where.sekolahId !== "school-a") return null;
            if (where.guruId && where.guruId !== "teacher-a") return null;
            return { id: "task-a" };
          },
          delete: async ({ where }: { where: { id: string } }) => {
            deletedTaskId = where.id;
            return { id: where.id };
          },
        },
        pengumpulanTugas: {
          deleteMany: async ({ where }: { where: { tugasId: string } }) => {
            deletedSubmissionsForTask = where.tugasId;
            return { count: 2 };
          },
        },
      }),
  });

  const session = (role: string) =>
    role === "ADMIN"
      ? { sekolahId: "school-a", peran: "ADMIN" as const, siswaId: null, kelasId: null, guruId: null, wajibGantiPassword: false }
      : role === "GURU_A"
        ? { sekolahId: "school-a", peran: "GURU" as const, siswaId: null, kelasId: null, guruId: "teacher-a", wajibGantiPassword: false }
        : role === "GURU_B"
          ? { sekolahId: "school-a", peran: "GURU" as const, siswaId: null, kelasId: null, guruId: "teacher-b", wajibGantiPassword: false }
          : { sekolahId: "school-a", peran: "SISWA" as const, siswaId: "student-a", kelasId: "class-a", guruId: null, wajibGantiPassword: false };

  const server = express()
    .use(express.json())
    .use("/learning", learningRoutes(async (req) => session(req.get("x-role") ?? "SISWA"), () => today))
    .listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/learning`;
    const req = (path: string, role: string, method = "GET", body?: object) =>
      fetch(base + path, {
        method,
        headers: { "x-role": role, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

    const listGuruA = await (await req("/materi?kelasId=class-a", "GURU_A")).json();
    assert.equal(listGuruA.rows[0].bisaKelola, true);
    const listGuruB = await (await req("/materi?kelasId=class-a", "GURU_B")).json();
    assert.equal(listGuruB.rows[0].bisaKelola, false);
    const listAdmin = await (await req("/materi?kelasId=class-a", "ADMIN")).json();
    assert.equal(listAdmin.rows[0].bisaKelola, true);

    assert.equal((await req("/materi/mat-a", "SISWA", "PATCH", { judul: "Baru", isi: "Teks", tautan: "" })).status, 403);
    assert.equal((await req("/materi/mat-a", "GURU_B", "PATCH", { judul: "Baru", isi: "Teks", tautan: "" })).status, 404);
    assert.equal((await req("/materi/mat-a", "GURU_A", "PATCH", { judul: "Baru", isi: "", tautan: "http://insecure.local" })).status, 400);

    const patchMat = await req("/materi/mat-a", "GURU_A", "PATCH", {
      judul: "Modul 1 Revisi",
      isi: "Isi baru",
      tautan: "https://example.com/modul.pdf",
    });
    assert.equal(patchMat.status, 200);
    assert.deepEqual(updatedMaterialData, {
      judul: "Modul 1 Revisi",
      deskripsi: "Isi baru",
      tautan: "https://example.com/modul.pdf",
    });

    const patchTask = await req("/tugas/task-a", "ADMIN", "PATCH", {
      judul: "Tugas Revisi",
      isi: "Kerjakan soal",
      batasWaktu: "2026-11-25T10:00:00.000Z",
    });
    assert.equal(patchTask.status, 200);
    assert.equal(updatedTaskData?.judul, "Tugas Revisi");
    assert.equal(updatedTaskData?.instruksi, "Kerjakan soal");
    assert.ok(updatedTaskData?.batasWaktu instanceof Date);

    assert.equal((await req("/materi/mat-a", "SISWA", "DELETE")).status, 403);
    assert.equal((await req("/materi/mat-a", "GURU_B", "DELETE")).status, 404);
    assert.equal((await req("/materi/mat-a", "GURU_A", "DELETE")).status, 200);

    assert.equal((await req("/tugas/task-a", "GURU_B", "DELETE")).status, 404);
    assert.equal((await req("/tugas/task-a", "ADMIN", "DELETE")).status, 200);
    assert.equal(deletedSubmissionsForTask, "task-a");
    assert.equal(deletedTaskId, "task-a");
  } finally {
    server.close();
    await once(server, "close");
    await prisma.$disconnect();
    await pool.end();
    await loginPool.end();
  }
});
