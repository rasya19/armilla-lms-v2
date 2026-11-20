import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

test("CBT checks tenant and ownership, scores submissions, supports correction and reset", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { examRoutes } = await import("./exam-routes.js");
  const options = [{ id: "oa", kode: "A", teks: "Satu", benar: true }, { id: "ob", kode: "B", teks: "Dua", benar: false }, { id: "oc", kode: "C", teks: "Tiga", benar: false }, { id: "od", kode: "D", teks: "Empat", benar: false }];
  const exam = { id: "e1", kelasId: "c1", judul: "Ujian", mulai: new Date(Date.now() - 60000), selesai: new Date(Date.now() + 3600000), durasiMenit: 60, soal: [{ id: "q1", urutan: 1, teks: "Soal", opsi: options }] };
  type Attempt = { id: string; siswaId: string; dimulaiPada: Date; dikumpulkanPada: Date | null; nilai: number | null; nilaiOverride: number | null; catatanGuru: string | null };
  let attempt: Attempt | null = null;
  let answers: { soalId: string; opsiId: string | null }[] = [];
  const findExam = async ({ where, select }: { where: { id: string; sekolahId: string; guruId?: string; kelasId?: string }; select?: { soal?: { select?: { opsi?: { select?: { benar?: boolean } } } } } }) => {
    if (where.id !== "e1" || where.sekolahId !== "school-a" || (where.guruId && where.guruId !== "owner") || (where.kelasId && where.kelasId !== "c1")) return null;
    if (select?.soal && !select.soal.select?.opsi?.select?.benar) return { ...exam, soal: exam.soal.map((question) => ({ ...question, opsi: question.opsi.map(({ kode, teks }) => ({ kode, teks })) })) };
    return exam;
  };
  Object.defineProperty(prisma.ujian, "findFirst", { configurable: true, value: findExam });
  Object.defineProperty(prisma.siswa, "findMany", { configurable: true, value: async ({ where }: { where: { sekolahId: string; kelasId: string } }) => {
    assert.equal(where.sekolahId, "school-a"); assert.equal(where.kelasId, "c1");
    return [{ id: "s1", nama: "Satu", nisn: "0000000001" }, { id: "s2", nama: "Dua", nisn: "0000000002" }];
  } });
  Object.defineProperty(prisma.percobaanUjian, "findMany", { configurable: true, value: async () => attempt ? [{ ...attempt, jawaban: answers.map((item) => ({ soalId: item.soalId, opsi: options.find((option) => option.id === item.opsiId) ?? null })) }] : [] });
  Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (fn: (tx: object) => Promise<unknown>) => fn({
    $queryRaw: async (_query: TemplateStringsArray, student: string, school: string, kelas: string) => student === "s1" && school === "school-a" && kelas === "c1" ? [{ id: "s1" }] : [],
    ujian: { findFirst: findExam },
    percobaanUjian: {
      findUnique: async (args: { include?: object }) => attempt && args.include ? { ...attempt, jawaban: answers.map((item) => ({ soalId: item.soalId, opsi: options.find((option) => option.id === item.opsiId) ?? null })) } : attempt,
      create: async () => { attempt = { id: "p1", siswaId: "s1", dimulaiPada: new Date(), dikumpulkanPada: null, nilai: null, nilaiOverride: null, catatanGuru: null }; return attempt; },
      update: async ({ data }: { data: Partial<Attempt> }) => { assert.ok(attempt); Object.assign(attempt, data); return attempt; },
      upsert: async ({ create, update }: { create: Partial<Attempt>; update: Partial<Attempt> }) => {
        if (!attempt) attempt = { id: "p1", siswaId: "s1", dimulaiPada: new Date(), dikumpulkanPada: null, nilai: null, nilaiOverride: null, catatanGuru: null };
        Object.assign(attempt, attempt.nilai === null ? create : update); return attempt;
      },
      delete: async () => { attempt = null; },
    },
    jawabanUjian: {
      deleteMany: async () => { answers = []; },
      createMany: async ({ data }: { data: { soalId: string; opsiId: string | null }[] }) => { answers = data; },
    },
  }) });
  const session = (role: string) => ({ sekolahId: role === "OTHER_SCHOOL" ? "school-b" : "school-a", peran: role === "SISWA" ? "SISWA" as const : role === "ADMIN" ? "ADMIN" as const : "GURU" as const, guruId: role === "OWNER" ? "owner" : role === "GURU" || role === "OTHER_SCHOOL" ? "other" : null, siswaId: role === "SISWA" ? "s1" : null, kelasId: role === "SISWA" ? "c1" : null });
  const server = express().use(express.json()).use("/exam", examRoutes(async (req) => session(req.get("x-role") ?? "SISWA"), () => new Date("2026-11-19T00:00:00Z"))).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/exam`;
    const req = (path: string, role: string, method = "GET", body?: object) => fetch(url + path, { method, headers: { "content-type": "application/json", "x-role": role }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await req("/e1/rekap", "SISWA")).status, 403);
    assert.equal((await req("/e1/rekap", "GURU")).status, 404);
    assert.equal((await req("/e1/rekap", "OTHER_SCHOOL")).status, 404);
    assert.equal((await req("/e1/hasil/s1", "SISWA", "PUT", { nilaiOverride: 100 })).status, 403);
    assert.equal((await req("/e1/hasil/s1", "OWNER", "PUT", { nilaiOverride: 101 })).status, 400);
    const start = await req("/e1/mulai", "SISWA", "POST"); assert.equal(start.status, 200);
    const payload = await start.json(); assert.equal(payload.soal[0].opsi[0].benar, undefined);
    const end = exam.selesai;
    exam.selesai = new Date(Date.now() - 1000);
    assert.equal((await req("/e1/kumpulkan", "SISWA", "POST", { jawaban: { q1: "A" } })).status, 409);
    assert.equal(attempt?.dikumpulkanPada, null);
    exam.selesai = end;
    assert.equal((await req("/e1/kumpulkan", "SISWA", "POST", { jawaban: { q1: "A" } })).status, 200);
    assert.equal(attempt?.nilai, 100);
    assert.equal((await req("/e1/kumpulkan", "SISWA", "POST", { jawaban: { q1: "B" } })).status, 409);
    assert.equal((await req("/e1/hasil/s1", "GURU", "PUT", { jawabanJson: { q1: "B" }, nilaiOverride: 88, catatanGuru: "Remedial" })).status, 404);
    assert.equal((await req("/e1/hasil/s1", "OWNER", "PUT", { jawabanJson: { q1: "B" }, nilaiOverride: 88, catatanGuru: "Remedial" })).status, 200);
    assert.equal(attempt?.nilai, 0); assert.equal(attempt?.nilaiOverride, 88);
    assert.equal((await req("/e1/hasil/s1", "OWNER", "PUT", { nilaiOverride: 90 })).status, 200);
    assert.equal(attempt?.nilai, 0); assert.equal(attempt?.nilaiOverride, 90); assert.equal(attempt?.catatanGuru, "Remedial");
    const report = await (await req("/e1/rekap", "ADMIN")).json();
    assert.equal(report.rows.length, 2); assert.equal(report.rows[0].hasil.nilaiAkhir, 90); assert.equal(report.rows[0].hasil.jumlahSalah, 1); assert.equal(report.rows[1].hasil, null);
    assert.equal((await req("/e1/hasil/s1/reset", "GURU", "DELETE")).status, 404);
    assert.equal((await req("/e1/hasil/s1/reset", "ADMIN", "DELETE")).status, 200);
    assert.equal(attempt, null); assert.equal(answers.length, 0);
    assert.equal((await req("/e1/hasil/s1", "OWNER", "PUT", { jawabanJson: {}, nilaiOverride: 0, catatanGuru: "" })).status, 200);
    assert.equal(attempt?.nilaiOverride, 0);
    const zeroReport = await (await req("/e1/rekap", "ADMIN")).json();
    assert.equal(zeroReport.rows[0].hasil.nilaiAkhir, 0);
    assert.equal((await req("/e1/hasil/s1", "ADMIN", "PUT", { jawabanJson: { unknown: "A" } })).status, 400);
  } finally { server.close(); await once(server, "close"); await prisma.$disconnect(); await pool.end(); await loginPool.end(); }
});
