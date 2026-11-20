import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

test("schedule import validates tenant references and saves all rows atomically", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { academicRoutes } = await import("./academic-routes.js");
  const schedule = { tahunAjaranId: "year", kelasId: "class", mapelId: "subject", guruId: "teacher", hari: 1, jamMulai: "08:00", jamSelesai: "09:00" };
  let saved: (typeof schedule)[] = [];
  let total = 0;
  const reference = (allowed: string) => async ({ where }: { where: { sekolahId: string; id: { in: string[] }; status?: string } }) =>
    where.sekolahId === "school-a" && where.id.in.includes(allowed) && (allowed !== "teacher" || where.status === "Aktif") ? [{ id: allowed }] : [];
  Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (callback: (tx: object) => Promise<unknown>) => callback({
    $queryRaw: async () => [{ id: "school-a" }],
    tahunAjaran: { findMany: reference("year") },
    kelas: { findMany: reference("class") },
    mapel: { findMany: reference("subject") },
    guru: { findMany: reference("teacher") },
    jadwalPelajaran: {
      findMany: async ({ where }: { where: { sekolahId: string } }) => where.sekolahId === "school-a" ? saved : [],
      count: async () => total + saved.length,
      createMany: async ({ data }: { data: (typeof schedule & { sekolahId: string })[] }) => { assert.ok(data.every((row) => row.sekolahId === "school-a")); saved = [...saved, ...data]; return { count: data.length }; },
    },
  }) });
  const server = express().use(express.json()).use("/academic", academicRoutes(async (req) => req.get("x-school") || null, () => new Date())).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const post = (rows: object[], school = "school-a") => fetch(`http://127.0.0.1:${address.port}/academic/jadwal/import`, { method: "POST", headers: { "content-type": "application/json", "x-school": school }, body: JSON.stringify({ rows }) });
    assert.equal((await post([schedule], "")).status, 401);
    assert.equal((await post([])).status, 400);
    assert.equal((await post([schedule, { ...schedule, jamSelesai: "07:00" }])).status, 400);
    assert.equal((await post([schedule, schedule])).status, 409);
    assert.equal((await post([schedule], "school-b")).status, 400);
    assert.equal(saved.length, 0);
    const response = await post([schedule, { ...schedule, hari: 2 }]);
    assert.equal(response.status, 201); assert.equal((await response.json()).created, 2);
    assert.equal((await post([{ ...schedule, hari: 3 }, schedule])).status, 409);
    assert.equal(saved.length, 2);
    total = 1998;
    assert.equal((await post([{ ...schedule, hari: 3 }])).status, 409);
    assert.equal(saved.length, 2);
  } finally { server.close(); await once(server, "close"); await prisma.$disconnect(); await pool.end(); await loginPool.end(); }
});
