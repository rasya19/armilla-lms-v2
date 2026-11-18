import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

test("classroom access, attendance and learning remain scoped to school and class", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { classroomRoutes } = await import("./classroom-routes.js");
  const { learningRoutes } = await import("./learning-routes.js");
  const today = new Date("2026-11-19T00:00:00.000Z");
  let attendance: "HADIR" | "SAKIT" | null = null;
  let yearCount = 1;
  let moved = false;
  let taskWhere: Record<string, unknown> | null = null;
  let created = 0;
  Object.defineProperty(prisma.kelas, "findFirst", { configurable: true, value: async ({ where }: { where: { id: string; sekolahId: string } }) =>
    where.id === "class-a" && where.sekolahId === "school-a" ? { id: "class-a", nama: "Kelas 9", waliGuruId: null } : null,
  });
  Object.defineProperty(prisma.kelas, "findMany", { configurable: true, value: async ({ where }: { where: { sekolahId: string; id?: string } }) => {
    assert.equal(where.sekolahId, "school-a");
    return where.id && where.id !== "class-a" ? [] : [{ id: "class-a", nama: "Kelas 9", waliGuruId: null }];
  } });
  Object.defineProperty(prisma.guru, "findMany", { configurable: true, value: async () => [] });
  Object.defineProperty(prisma.siswa, "groupBy", { configurable: true, value: async ({ where }: { where: { sekolahId: string; status: string } }) => {
    assert.equal(where.sekolahId, "school-a"); assert.equal(where.status, "Aktif");
    return [{ kelasId: "class-a", _count: { _all: 1 } }];
  } });
  Object.defineProperty(prisma.siswa, "findMany", { configurable: true, value: async ({ where }: { where: { sekolahId: string; kelasId: string; status: string } }) => {
    assert.deepEqual(where, { sekolahId: "school-a", kelasId: "class-a", status: "Aktif" });
    return [{ id: "student-a", nama: "Siswa Uji" }];
  } });
  Object.defineProperty(prisma.jadwalPelajaran, "findMany", { configurable: true, value: async ({ where, select }: { where: { sekolahId: string; kelasId: unknown }; select: { mapelId?: boolean } }) => {
    assert.equal(where.sekolahId, "school-a");
    return select.mapelId ? [{ kelasId: "class-a", mapelId: "subject-a" }] : [{ mapel: { id: "subject-a", nama: "Matematika" }, guru: { id: "teacher-a", nama: "Guru Uji" } }];
  } });
  Object.defineProperty(prisma.tugas, "groupBy", { configurable: true, value: async ({ where }: { where: { sekolahId: string } }) => {
    assert.equal(where.sekolahId, "school-a"); return [{ kelasId: "class-a", _count: { _all: 1 } }];
  } });
  Object.defineProperty(prisma.presensi, "findUnique", { configurable: true, value: async () => attendance ? { status: attendance } : null });
  Object.defineProperty(prisma.tugas, "findMany", { configurable: true, value: async ({ where }: { where: Record<string, unknown> }) => {
    taskWhere = where;
    return [{ id: "task-a", guruId: "teacher-a", judul: "Tugas", kelas: { nama: "Kelas 9" }, mapel: { nama: "Matematika" }, guru: { nama: "Guru Uji" }, tahunAjaran: { nama: "2026", semester: "Ganjil" }, instruksi: "", batasWaktu: null, pengumpulan: [] }];
  } });
  Object.defineProperty(prisma.tugas, "findFirst", { configurable: true, value: async ({ where }: { where: { guruId?: string } }) => where.guruId === "teacher-a" ? { id: "task-a", kelasId: "class-a", batasWaktu: null } : null });
  Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (fn: (tx: object) => Promise<unknown>) => fn({
    $queryRaw: async (_query: TemplateStringsArray, student: string, school: string, kelas: string) => {
      assert.equal(student, "student-a"); assert.equal(school, "school-a"); assert.equal(kelas, "class-a");
      return moved ? [] : [{ id: student }];
    },
    kelas: { findFirst: async ({ where }: { where: { id: string; sekolahId: string } }) => where.id === "class-a" && where.sekolahId === "school-a" ? { id: "class-a" } : null },
    presensi: {
      findUnique: async () => attendance ? { status: attendance } : null,
      create: async ({ data }: { data: { sekolahId: string; siswaId: string; kelasId: string; status: "HADIR"; tanggal: Date } }) => {
        assert.equal(data.sekolahId, "school-a"); assert.equal(data.siswaId, "student-a"); assert.equal(data.kelasId, "class-a"); assert.equal(data.tanggal.getTime(), today.getTime());
        attendance = data.status; created++;
      },
    },
    tahunAjaran: { findMany: async ({ where }: { where: { sekolahId: string } }) => {
      assert.equal(where.sekolahId, "school-a"); return Array.from({ length: yearCount }, (_, index) => ({ id: `year-${index}` }));
    } },
    tugas: { findFirst: async ({ where }: { where: { sekolahId: string; kelasId: string } }) => {
      assert.equal(where.sekolahId, "school-a"); assert.equal(where.kelasId, "class-a"); return { id: "task-a" };
    } },
    pengumpulanTugas: { create: async () => { created++; } },
  }) });
  const session = (role: string) => role === "ADMIN"
    ? { sekolahId: "school-a", peran: "ADMIN" as const, siswaId: null, kelasId: null, guruId: null, wajibGantiPassword: false }
    : role === "GURU"
      ? { sekolahId: "school-a", peran: "GURU" as const, siswaId: null, kelasId: null, guruId: "teacher-b", wajibGantiPassword: false }
      : role === "UNPLACED"
        ? { sekolahId: "school-a", peran: "SISWA" as const, siswaId: "student-a", kelasId: null, guruId: null, wajibGantiPassword: false }
      : { sekolahId: "school-a", peran: "SISWA" as const, siswaId: "student-a", kelasId: "class-a", guruId: null, wajibGantiPassword: false };
  const server = express().use(express.json())
    .use("/classroom", classroomRoutes(async (req) => session(req.get("x-role") ?? "SISWA"), () => today))
    .use("/learning", learningRoutes(async (req) => session(req.get("x-role") ?? "SISWA"), () => today))
    .listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const req = (path: string, role = "SISWA", method = "GET", body?: object) => fetch(base + path, { method, headers: { "x-role": role, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const lobby = await (await req("/classroom/")).json();
    assert.equal(lobby.rows[0].jumlahMapel, 1); assert.equal(lobby.rows[0].jumlahSiswa, 1); assert.equal(lobby.rows[0].tugasAktif, 1);
    assert.deepEqual(await (await req("/classroom/", "UNPLACED")).json(), { rows: [] });
    assert.equal((await req("/classroom/class-a", "UNPLACED")).status, 404);
    assert.equal((await req("/classroom/class-a", "ADMIN")).status, 200);
    assert.equal((await req("/classroom/class-a", "GURU")).status, 200);
    assert.equal((await req("/classroom/class-b")).status, 404);
    assert.equal((await req("/classroom/class-b", "GURU")).status, 404);
    const detail = await (await req("/classroom/class-a")).json();
    assert.equal(detail.siswa[0].nama, "Siswa Uji"); assert.equal(detail.mapel[0].id, "subject-a");
    assert.equal((await req("/classroom/class-a/hadir", "GURU", "POST")).status, 403);
    yearCount = 0; assert.equal((await req("/classroom/class-a/hadir", "SISWA", "POST")).status, 409);
    yearCount = 2; assert.equal((await req("/classroom/class-a/hadir", "SISWA", "POST")).status, 409);
    yearCount = 1; attendance = "SAKIT";
    assert.deepEqual(await (await req("/classroom/class-a/hadir", "SISWA", "POST")).json(), { status: "SAKIT", sudahAda: true });
    assert.equal(created, 0); attendance = null;
    assert.deepEqual(await (await req("/classroom/class-a/hadir", "SISWA", "POST")).json(), { status: "HADIR", sudahAda: false });
    assert.equal(created, 1);
    assert.deepEqual(await (await req("/classroom/class-a/hadir", "SISWA", "POST")).json(), { status: "HADIR", sudahAda: true });
    moved = true; assert.equal((await req("/classroom/class-a/hadir", "SISWA", "POST")).status, 409); moved = false;
    assert.equal((await req("/learning/tugas?kelasId=class-b")).status, 404);
    assert.equal((await req("/learning/tugas?kelasId=class-b", "ADMIN")).status, 404);
    const list = await (await req("/learning/tugas?kelasId=class-a&mapelId=subject-a", "GURU")).json();
    assert.equal(list.rows[0].bisaMenilai, false);
    assert.equal(taskWhere?.sekolahId, "school-a"); assert.equal(taskWhere?.kelasId, "class-a"); assert.equal(taskWhere?.mapelId, "subject-a"); assert.equal(taskWhere?.guruId, undefined);
    assert.equal((await req("/learning/tugas/task-a/pengumpulan", "GURU")).status, 404);
    moved = true; assert.equal((await req("/learning/tugas/task-a/pengumpulan", "SISWA", "POST", { jawaban: "Jawaban", tautan: "" })).status, 404);
    moved = false; assert.equal((await req("/learning/tugas/task-a/pengumpulan", "SISWA", "POST", { jawaban: "Jawaban", tautan: "" })).status, 201);
  } finally {
    server.close(); await once(server, "close"); await prisma.$disconnect(); await pool.end(); await loginPool.end();
  }
});
