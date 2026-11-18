import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

test("school management edits and status changes remain tenant-scoped and revoke sessions", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { Prisma } = await import("@prisma/client");
  const { schoolManagementRoutes } = await import("./school-management-routes.js");
  const calls: { name: string; args: unknown }[] = [];
  let present = true;
  let duplicate = false;
  let classInTenant = true;
  const createStudent = async (args: unknown) => {
    calls.push({ name: "create-siswa", args });
    if (duplicate) throw new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "test" });
  };
  Object.defineProperty(prisma.siswa, "create", { configurable: true, value: createStudent });
  const account = { id: "account", sekolahId: "school-a", peran: "GURU" };
  const update = (name: string) => async (args: unknown) => { calls.push({ name, args }); return { count: present ? 1 : 0 }; };
  Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (callback: (tx: object) => Promise<unknown>) => callback({
    guru: { updateMany: update("guru") },
    siswa: { updateMany: update("siswa"), create: createStudent },
    $queryRaw: async (_query: TemplateStringsArray, ...values: unknown[]) => { calls.push({ name: "lock-class", args: values }); return classInTenant ? [{ id: "class-a" }] : []; },
    akun: {
      findFirst: async (args: unknown) => { calls.push({ name: "account-find", args }); return account; },
      update: async (args: unknown) => { calls.push({ name: "account-update", args }); },
    },
    sesiAkun: { updateMany: update("revoke") },
  }) });
  const server = express().use(express.json()).use("/school", schoolManagementRoutes(async (req) => req.get("x-school") ?? null)).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/school`;
    const request = (path: string, data: object, school?: string) => fetch(url + path, { method: "PATCH", headers: { "content-type": "application/json", ...(school ? { "x-school": school } : {}) }, body: JSON.stringify(data) });
    const addStudent = (data: object, school?: string) => fetch(url + "/siswa", { method: "POST", headers: { "content-type": "application/json", ...(school ? { "x-school": school } : {}) }, body: JSON.stringify(data) });
    const student = { nama: " Siswa Baru ", nisn: "0123456789", email: "SISWA@example.invalid", telepon: "" };
    assert.equal((await addStudent(student)).status, 401);
    assert.equal((await addStudent({ ...student, nisn: "123" }, "school-a")).status, 400);
    assert.equal(calls.length, 0);
    assert.equal((await addStudent(student, "school-a")).status, 201);
    assert.deepEqual(calls[0], { name: "create-siswa", args: { data: { nama: "Siswa Baru", nisn: "0123456789", email: "siswa@example.invalid", sekolahId: "school-a", status: "Aktif" } } });
    duplicate = true;
    assert.equal((await addStudent(student, "school-b")).status, 409);
    duplicate = false;
    calls.length = 0;
    assert.equal((await addStudent({ ...student, kelasId: "class-a", namaWali: "Wali Uji", teleponWali: "08123456789", pekerjaanWali: "Guru" }, "school-a")).status, 201);
    assert.deepEqual(calls[0], { name: "lock-class", args: ["class-a", "school-a"] });
    assert.deepEqual(calls[1], { name: "create-siswa", args: { data: { nama: "Siswa Baru", nisn: "0123456789", email: "siswa@example.invalid", namaWali: "Wali Uji", teleponWali: "08123456789", pekerjaanWali: "Guru", sekolahId: "school-a", status: "Aktif", kelasId: "class-a" } } });
    calls.length = 0;
    classInTenant = false;
    assert.equal((await addStudent({ ...student, kelasId: "class-other" }, "school-a")).status, 400);
    assert.equal(calls.length, 1);
    assert.equal((await addStudent({ ...student, kelasId: " " }, "school-a")).status, 400);
    classInTenant = true;
    calls.length = 0;
    const teacher = { nama: "Guru Baru", nuptk: "", mapelUtama: "Matematika", email: "BARU@example.invalid", telepon: "08123456789" };
    assert.equal((await request("/guru/one", teacher)).status, 401);
    assert.equal((await request("/guru/one", { ...teacher, nuptk: "123" }, "school-a")).status, 400);
    assert.equal((await request("/guru/one", teacher, "school-a")).status, 200);
    assert.deepEqual(calls[0], { name: "guru", args: { where: { id: "one", sekolahId: "school-a" }, data: { ...teacher, nuptk: null, email: "baru@example.invalid" } } });
    assert.deepEqual(calls.find((call) => call.name === "account-update")?.args, { where: { id: "account" }, data: { nama: "Guru Baru", email: "baru@example.invalid" } });
    assert.ok(calls.some((call) => call.name === "revoke"));
    calls.length = 0;
    account.peran = "SISWA";
    assert.equal((await request("/siswa/one", { nama: "Siswa Baru", nisn: "0123456789", nik: "", tanggalLahir: "2000-02-29", jenisKelamin: "P" }, "school-a")).status, 200);
    assert.deepEqual(calls[0], { name: "siswa", args: { where: { id: "one", sekolahId: "school-a" }, data: { nama: "Siswa Baru", nisn: "0123456789", nik: null, tanggalLahir: new Date("2000-02-29T00:00:00Z"), jenisKelamin: "P", email: null, telepon: null } } });
    calls.length = 0;
    const placement = { nama: "Siswa Baru", nisn: "0123456789", jenjang: "Paket B", kelasId: "class-a", expectedKelasId: null };
    assert.equal((await request("/siswa/one", placement, "school-a")).status, 200);
    assert.deepEqual(calls[0], { name: "lock-class", args: ["class-a", "school-a"] });
    assert.deepEqual(calls[1], { name: "siswa", args: { where: { id: "one", sekolahId: "school-a", status: "Aktif", kelasId: null }, data: { nama: "Siswa Baru", nisn: "0123456789", jenjang: "Paket B", email: null, telepon: null, kelasId: "class-a" } } });
    calls.length = 0;
    classInTenant = false;
    assert.equal((await request("/siswa/one", placement, "school-a")).status, 400);
    assert.equal(calls.length, 1);
    classInTenant = true;
    calls.length = 0;
    present = false;
    assert.equal((await request("/siswa/one", placement, "school-a")).status, 409);
    assert.ok(!calls.some((call) => call.name === "account-update"));
    present = true;
    calls.length = 0;
    assert.equal((await request("/siswa/one", { ...placement, expectedKelasId: undefined }, "school-a")).status, 400);
    assert.equal(calls.length, 0);
    account.peran = "GURU";
    calls.length = 0;
    present = false;
    assert.equal((await request("/guru/other", teacher, "school-a")).status, 404);
    assert.equal(calls.length, 1);
    present = true;
    calls.length = 0;
    assert.equal((await request("/siswa/one/status", { status: "Nonaktif" }, "school-a")).status, 200);
    assert.deepEqual(calls[0], { name: "siswa", args: { where: { id: "one", sekolahId: "school-a" }, data: { status: "Nonaktif" } } });
    assert.ok(calls.some((call) => call.name === "revoke"));
    assert.equal((await request("/siswa/one/status", { status: "hapus" }, "school-a")).status, 400);
  } finally {
    server.close();
    await once(server, "close");
    await prisma.$disconnect();
    await pool.end();
    await loginPool.end();
  }
});
