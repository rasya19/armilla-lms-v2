import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

test("master deletes only registrations and empty linked schools", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "production";
  process.env.VERCEL = "1";
  process.env.APP_ORIGIN = "https://rsch.my.id";
  process.env.LOGIN_RATE_LIMIT_SECRET = "ab".repeat(32);
  const { prisma, pool, loginPool } = await import("./db.js");
  const { default: app } = await import("./server.js");
  const originalTransaction = prisma.$transaction;
  const originalFindSession = prisma.sesiAkun.findUnique;
  let mode = "empty";
  let actions: string[] = [];
  const counts = {
    siswa: 0, guru: 0, mapel: 0, kelas: 0, ppdb: 0, nilai: 0, tahunAjaran: 0,
    jadwal: 0, agenda: 0, presensi: 0, materi: 0, tugas: 0, berkas: 0, ujian: 0,
  };
  const tx = {
    pendaftaranSekolah: {
      findUnique: async () => mode === "missing" ? null : { sekolahId: mode === "unlinked" ? null : "school-id" },
      delete: async () => { actions.push("registration"); },
    },
    sekolah: {
      findUnique: async () => ({ _count: { ...counts, siswa: mode === "student" ? 1 : 0 } }),
      delete: async () => { actions.push("school"); },
    },
    websiteSettings: { findUnique: async () => mode === "settings" ? { school_id: "school-id" } : null },
    akun: {
      findMany: async () => [{
        peran: mode === "other-role" ? "GURU" : "ADMIN",
        siswaId: null,
        guruId: null,
        _count: { tinjauan: 0, tinjauanSekolah: mode === "review" ? 1 : 0, berkas: 0 },
      }],
      deleteMany: async () => { actions.push("accounts"); },
    },
  };
  Object.defineProperty(prisma.sesiAkun, "findUnique", {
    configurable: true,
    value: async () => ({
      expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
      akun: { aktif: true, peran: mode === "non-master" ? "ADMIN" : "MASTER_ADMIN" },
    }),
  });
  Object.defineProperty(prisma, "$transaction", {
    configurable: true,
    value: async (callback: (client: typeof tx) => Promise<unknown>, options: { isolationLevel: string }) => {
      assert.equal(options.isolationLevel, "Serializable");
      return callback(tx);
    },
  });
  const server = express().use((req, _res, next) => { if (req.get("x-test-host")) req.headers.host = req.get("x-test-host"); next(); }).use(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api/master/pendaftaran-sekolah/test-id`;
    const headers = { origin: process.env.APP_ORIGIN, "x-test-host": "rsch.my.id", cookie: `armilla_session=${"a".repeat(64)}` };
    assert.equal((await fetch(url, { method: "DELETE", headers: { origin: headers.origin, "x-test-host": headers["x-test-host"] } })).status, 401);
    assert.equal((await fetch(url, { method: "DELETE", headers: { ...headers, origin: "https://evil.invalid" } })).status, 403);
    mode = "non-master";
    assert.equal((await fetch(url, { method: "DELETE", headers })).status, 401);
    for (mode of ["student", "settings", "other-role", "review"]) {
      actions = [];
      assert.equal((await fetch(url, { method: "DELETE", headers })).status, 409);
      assert.deepEqual(actions, []);
    }
    mode = "missing";
    assert.equal((await fetch(url, { method: "DELETE", headers })).status, 404);
    mode = "unlinked";
    actions = [];
    assert.equal((await fetch(url, { method: "DELETE", headers })).status, 204);
    assert.deepEqual(actions, ["registration"]);
    mode = "empty";
    actions = [];
    assert.equal((await fetch(url, { method: "DELETE", headers })).status, 204);
    assert.deepEqual(actions, ["registration", "accounts", "school"]);
  } finally {
    Object.defineProperty(prisma.sesiAkun, "findUnique", { configurable: true, value: originalFindSession });
    Object.defineProperty(prisma, "$transaction", { configurable: true, value: originalTransaction });
    server.close();
    await once(server, "close");
    await prisma.$disconnect();
    await Promise.all([pool.end(), loginPool.end()]);
  }
});
