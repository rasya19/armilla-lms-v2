import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

test("teachers create materials without a schedule only within their school and an active year", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { learningRoutes } = await import("./learning-routes.js");
  let yearCount = 1;
  let saved: Record<string, unknown> | null = null;
  Object.defineProperty(prisma.kelas, "findMany", { configurable: true, value: async ({ where }: { where: { sekolahId: string } }) => where.sekolahId === "a" ? [{ id: "c", nama: "Kelas" }] : [] });
  Object.defineProperty(prisma.mapel, "findMany", { configurable: true, value: async ({ where }: { where: { sekolahId: string } }) => where.sekolahId === "a" ? [{ id: "m", nama: "Mapel" }] : [] });
  Object.defineProperty(prisma.kelas, "findFirst", { configurable: true, value: async ({ where }: { where: { sekolahId: string; id: string } }) => where.sekolahId === "a" && where.id === "c" ? { id: "c" } : null });
  Object.defineProperty(prisma.mapel, "findFirst", { configurable: true, value: async ({ where }: { where: { sekolahId: string; id: string } }) => where.sekolahId === "a" && where.id === "m" ? { id: "m" } : null });
  Object.defineProperty(prisma.tahunAjaran, "findMany", { configurable: true, value: async ({ where }: { where: { sekolahId: string } }) => where.sekolahId === "a" ? Array.from({ length: yearCount }, (_, index) => ({ id: `y${index}` })) : [] });
  Object.defineProperty(prisma.materiAjar, "create", { configurable: true, value: async ({ data }: { data: Record<string, unknown> }) => { saved = data; return { id: "created" }; } });
  const server = express().use(express.json()).use("/learning", learningRoutes(async (req) => ({ sekolahId: req.get("x-school") ?? "a", peran: req.get("x-role") === "SISWA" ? "SISWA" : "GURU", siswaId: null, kelasId: null, guruId: "g", wajibGantiPassword: false }), () => new Date("2026-11-19T00:00:00Z"))).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/learning`;
    const body = { kelasId: "c", mapelId: "m", judul: "Materi", isi: "Teks", tautan: "", pertemuan: "Modul 1" };
    const req = (path: string, method = "GET", data?: object, school = "a", role = "GURU") => fetch(base + path, { method, headers: { "content-type": "application/json", "x-school": school, "x-role": role }, ...(data ? { body: JSON.stringify(data) } : {}) });
    assert.equal((await req("/pilihan-materi")).status, 200);
    assert.equal((await req("/materi", "POST", body, "b")).status, 404);
    assert.equal((await req("/materi", "POST", body, "a", "SISWA")).status, 403);
    yearCount = 2; assert.equal((await req("/materi", "POST", body)).status, 409);
    yearCount = 0; assert.equal((await req("/pilihan-materi")).status, 409);
    yearCount = 1; assert.equal((await req("/materi", "POST", body)).status, 201);
    assert.deepEqual(saved, { sekolahId: "a", guruId: "g", kelasId: "c", mapelId: "m", tahunAjaranId: "y0", judul: "Materi", deskripsi: "Teks", tautan: null, pertemuan: "Modul 1", jenis: "TEKS_TAUTAN" });
    assert.equal((await req("/tugas", "POST", { ...body, batasWaktu: "" })).status, 400);
  } finally { server.close(); await once(server, "close"); await prisma.$disconnect(); await pool.end(); await loginPool.end(); }
});
