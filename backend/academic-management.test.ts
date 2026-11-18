import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { Prisma } from "@prisma/client";

test("academic deletion protects linked records and schedule edits remain tenant scoped", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { academicRoutes } = await import("./academic-routes.js");
  let linked = true;
  const calls: unknown[] = [];
  Object.defineProperty(prisma.tahunAjaran, "deleteMany", { configurable: true, value: async (args: unknown) => {
    calls.push(args);
    if (linked) throw new Prisma.PrismaClientKnownRequestError("related", { code: "P2003", clientVersion: "test" });
    return { count: 1 };
  } });
  Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (callback: (tx: object) => Promise<unknown>) => callback({
    $queryRaw: async () => [{ id: "item" }],
    nilai: { count: async () => linked ? 1 : 0 },
    mapel: { deleteMany: async (args: unknown) => { calls.push(args); return { count: 1 }; }, findFirst: async () => ({ id: "m" }) },
    kelas: { findFirst: async () => ({ id: "k" }) },
    guru: { findFirst: async () => ({ id: "g" }) },
    tahunAjaran: { findFirst: async () => ({ id: "y" }) },
    jadwalPelajaran: { findFirst: async () => null, updateMany: async (args: unknown) => { calls.push(args); return { count: 1 }; } },
  }) });
  const server = express().use(express.json()).use("/academic", academicRoutes(async (req) => req.get("x-school") ?? null)).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/academic`;
    const req = (path: string, method: string, body?: object, school = "school-a") => fetch(url + path, { method, headers: { "content-type": "application/json", "x-school": school }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await req("/tahun/y", "DELETE")).status, 409);
    assert.deepEqual(calls[0], { where: { id: "y", sekolahId: "school-a" } });
    assert.equal((await req("/mapel/m", "DELETE")).status, 409);
    linked = false;
    assert.equal((await req("/mapel/m", "DELETE")).status, 200);
    assert.deepEqual(calls[1], { where: { id: "m", sekolahId: "school-a" } });
    const schedule = { tahunAjaranId: "y", kelasId: "k", mapelId: "m", guruId: "g", hari: 1, jamMulai: "08:00", jamSelesai: "09:00" };
    assert.equal((await req("/jadwal/j", "PATCH", schedule)).status, 200);
    assert.deepEqual(calls[2], { where: { id: "j", sekolahId: "school-a" }, data: schedule });
    assert.equal((await req("/jadwal/j", "PATCH", { ...schedule, jamSelesai: "07:00" })).status, 400);
    assert.equal((await req("/tahun/y", "DELETE", undefined, "")).status, 401);
  } finally {
    server.close();
    await once(server, "close");
    await prisma.$disconnect(); await pool.end(); await loginPool.end();
  }
});
