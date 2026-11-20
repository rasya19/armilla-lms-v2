import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

test("class attendance is scoped, private to students, and writable only by admin or homeroom teacher", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { classroomRoutes } = await import("./classroom-routes.js");
  const date = new Date("2026-11-19T00:00:00.000Z");
  let saved: { id: string; kelasId: string; status: "HADIR" | "IZIN" | "SAKIT" | "ALPA" } | null = null;
  let years = 1;
  const students = [{ id: "s1", nama: "Satu", nisn: "0000000001" }, { id: "s2", nama: "Dua", nisn: "0000000002" }];
  Object.defineProperty(prisma.kelas, "findFirst", { configurable: true, value: async ({ where }: { where: { id: string; sekolahId: string } }) =>
    where.id === "c1" && where.sekolahId === "school-a" ? { id: "c1", nama: "Kelas 9", waliGuruId: "wali" } : null,
  });
  Object.defineProperty(prisma.siswa, "findMany", { configurable: true, value: async ({ where }: { where: { sekolahId: string; kelasId: string; status: string; id?: string } }) => {
    assert.equal(where.sekolahId, "school-a"); assert.equal(where.kelasId, "c1"); assert.equal(where.status, "Aktif");
    return students.filter((student) => !where.id || student.id === where.id);
  } });
  Object.defineProperty(prisma.presensi, "findMany", { configurable: true, value: async ({ where }: { where: { sekolahId: string; kelasId: string; siswaId: { in: string[] }; tanggal: Date } }) => {
    assert.equal(where.sekolahId, "school-a"); assert.equal(where.kelasId, "c1"); assert.equal(where.tanggal.getTime(), date.getTime());
    return where.siswaId.in.includes("s1") ? [{ siswaId: "s1", status: "HADIR" }] : [];
  } });
  Object.defineProperty(prisma.presensi, "groupBy", { configurable: true, value: async ({ where }: { where: { sekolahId: string; kelasId: string; siswaId: { in: string[] }; tanggal: { gte: Date; lt: Date } } }) => {
    assert.equal(where.sekolahId, "school-a"); assert.equal(where.kelasId, "c1");
    assert.equal(where.tanggal.gte.toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(where.tanggal.lt.toISOString(), "2026-12-01T00:00:00.000Z");
    return where.siswaId.in.includes("s1") ? [{ siswaId: "s1", status: "HADIR", _count: { _all: 4 } }, { siswaId: "s1", status: "IZIN", _count: { _all: 1 } }] : [];
  } });
  Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (fn: (tx: object) => Promise<unknown>) => fn({
    $queryRaw: async (query: TemplateStringsArray, id: string, school: string, kelas?: string) => {
      assert.equal(school, "school-a");
      if (query.join("").includes('FROM "Kelas"')) return id === "c1" ? [{ id: "c1", waliGuruId: "wali" }] : [];
      return id === "s1" && kelas === "c1" ? [{ id: "s1" }] : [];
    },
    presensi: {
      findUnique: async () => saved,
      create: async ({ data }: { data: { status: "HADIR" | "IZIN" | "SAKIT" | "ALPA"; kelasId: string; siswaId: string; sekolahId: string } }) => {
        assert.equal(data.siswaId, "s1"); assert.equal(data.sekolahId, "school-a");
        saved = { id: "p1", kelasId: data.kelasId, status: data.status };
      },
      update: async ({ data }: { data: { status: "HADIR" | "IZIN" | "SAKIT" | "ALPA" } }) => {
        assert.ok(saved); saved.status = data.status;
      },
    },
    tahunAjaran: { findMany: async () => Array.from({ length: years }, (_, index) => ({ id: `year-${index}` })) },
  }) });
  const session = (role: string) => ({
    sekolahId: "school-a", peran: role === "ADMIN" ? "ADMIN" as const : role === "SISWA" ? "SISWA" as const : "GURU" as const,
    siswaId: role === "SISWA" ? "s1" : null, kelasId: role === "SISWA" ? "c1" : null, guruId: role === "WALI" ? "wali" : role === "GURU" ? "other" : null,
  });
  const server = express().use(express.json()).use("/classroom", classroomRoutes(async (req) => session(req.get("x-role") ?? "SISWA"), () => date)).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/classroom`;
    const req = (path: string, role: string, body?: object) => fetch(base + path, { method: body ? "PATCH" : "GET", headers: { "x-role": role, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const mine = await (await req("/c1/presensi?bulan=2026-11", "SISWA")).json();
    assert.equal(mine.rows.length, 1); assert.equal(mine.rows[0].id, "s1"); assert.equal(mine.rows[0].counts.HADIR, 4); assert.equal(mine.dapatMengubah, false);
    const all = await (await req("/c1/presensi?bulan=2026-11", "WALI")).json();
    assert.equal(all.rows.length, 2); assert.equal(all.dapatMengubah, true);
    assert.equal((await (await req("/c1/presensi", "GURU")).json()).dapatMengubah, false);
    assert.equal((await req("/c2/presensi", "SISWA")).status, 404);
    assert.equal((await req("/c2/presensi", "ADMIN")).status, 404);
    assert.equal((await req("/c1/presensi?bulan=2026-13", "ADMIN")).status, 400);
    const body = { status: "IZIN", expectedStatus: null, tanggal: "2026-11-19" };
    assert.equal((await req("/c1/presensi/s1", "SISWA", body)).status, 403);
    assert.equal((await req("/c1/presensi/s1", "GURU", body)).status, 403);
    years = 0; assert.equal((await req("/c1/presensi/s1", "WALI", body)).status, 409);
    years = 1; assert.equal((await req("/c1/presensi/s1", "WALI", body)).status, 200);
    assert.equal((await req("/c1/presensi/s1", "ADMIN", body)).status, 409);
    assert.equal((await req("/c1/presensi/s1", "ADMIN", { ...body, expectedStatus: "IZIN", tanggal: "2026-11-18" })).status, 409);
    assert.equal((await req("/c1/presensi/s1", "ADMIN", { ...body, expectedStatus: "IZIN", status: "SAKIT" })).status, 200);
    assert.equal(saved?.status, "SAKIT");
    assert.equal((await req("/c1/presensi/s2", "ADMIN", body)).status, 404);
  } finally { server.close(); await once(server, "close"); await prisma.$disconnect(); await pool.end(); await loginPool.end(); }
});
