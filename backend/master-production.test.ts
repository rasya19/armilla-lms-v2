import { strict as assert } from "node:assert";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";

test("production master login enforces session, role, origin, and shared failure limits", { skip: process.env.RUN_MASTER_INTEGRATION !== "1", timeout: 120000 }, async () => {
  const secret = randomBytes(32).toString("hex");
  const origin = "https://master-test.example.invalid";
  const ip = "192.0.2.78";
  const id = randomUUID();
  const adminId = randomUUID();
  const registrationId = randomUUID();
  const email = `${id}@example.invalid`;
  const adminEmail = `${adminId}@example.invalid`;
  const password = randomBytes(24).toString("hex");
  const adminToken = randomBytes(32).toString("hex");
  const digest = (kind: string, value: string) => createHmac("sha256", secret).update(`failed-v1\0${kind}\0${value}`).digest("hex");
  const keys = [digest("ip", ip), digest("identity", email), digest("identity", adminEmail)];
  process.env.NODE_ENV = "production";
  process.env.VERCEL = "1";
  process.env.APP_ORIGIN = origin;
  process.env.LOGIN_RATE_LIMIT_SECRET = secret;
  const { prisma, pool, loginPool } = await import("./db.js");
  const { hashPassword } = await import("./password.js");
  const { default: app } = await import("./server.js");
  const originalRandom = Math.random;
  Math.random = () => 1;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { origin, "content-type": "application/json", "x-vercel-forwarded-for": ip };
    const post = (path: string, body: unknown, cookie?: string, customOrigin = origin) => fetch(`${base}${path}`, {
      method: "POST",
      headers: { ...headers, origin: customOrigin, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    const get = (path: string, cookie?: string) => fetch(`${base}${path}`, { headers: cookie ? { cookie } : {} });
    const hash = await hashPassword(password);
    await prisma.akun.create({ data: { id, email, nama: "Test master", peran: "MASTER_ADMIN", passwordHash: hash } });
    await prisma.akun.create({ data: { id: adminId, email: adminEmail, nama: "Test admin", peran: "ADMIN", passwordHash: hash } });
    await prisma.sesiAkun.create({ data: { akunId: adminId, tokenHash: createHash("sha256").update(adminToken).digest("hex"), expiresAt: new Date(Date.now() + 60000) } });
    await prisma.pendaftaranSekolah.create({ data: { id: registrationId, namaSekolah: "Test school", namaKontak: "Test contact", emailKontak: `${registrationId}@example.invalid`, teleponKontak: "0123456789" } });

    for (const path of ["/api/master/summary", "/api/master/sekolah", "/api/master/pendaftaran-sekolah", "/api/auth/master/session"]) {
      assert.equal((await get(path)).status, 401);
      assert.equal((await get(path, `armilla_session=${adminToken}`)).status, 401);
    }
    assert.equal((await post(`/api/master/pendaftaran-sekolah/${registrationId}/tinjau`, { keputusan: "DISETUJUI", catatan: "" })).status, 401);
    assert.equal((await post("/api/auth/master/login", { email, password }, undefined, "https://evil.invalid")).status, 403);
    assert.equal((await post("/api/auth/master/login", { email: adminEmail, password })).status, 401);
    assert.equal((await post("/api/auth/master/login", { email, password: "wrong" })).status, 401);
    const login = await post("/api/auth/master/login", { email, password });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.ok(setCookie.includes("HttpOnly") && setCookie.includes("Secure") && setCookie.includes("SameSite=Strict"));
    const cookie = setCookie.split(";")[0];
    for (const path of ["/api/master/summary", "/api/master/sekolah", "/api/master/pendaftaran-sekolah", "/api/auth/master/session"]) {
      assert.equal((await get(path, cookie)).status, 200);
    }
    assert.equal((await post(`/api/master/pendaftaran-sekolah/${registrationId}/tinjau`, { keputusan: "DISETUJUI", catatan: "" }, cookie, "https://evil.invalid")).status, 403);
    assert.equal((await post(`/api/master/pendaftaran-sekolah/${registrationId}/tinjau`, { keputusan: "DISETUJUI", catatan: "" }, cookie)).status, 200);
    assert.equal((await post("/api/auth/master/logout", {}, cookie)).status, 204);
    assert.equal((await get("/api/master/summary", cookie)).status, 401);
    const secondLogin = await post("/api/auth/master/login", { email, password });
    const secondSetCookie = secondLogin.headers.get("set-cookie");
    assert.equal(secondLogin.status, 200);
    assert.ok(secondSetCookie);
    await prisma.akun.update({ where: { id }, data: { aktif: false } });
    assert.equal((await get("/api/master/summary", secondSetCookie.split(";")[0])).status, 401);
    await prisma.akun.update({ where: { id }, data: { aktif: true } });
    for (let i = 0; i < 9; i++) assert.equal((await post("/api/auth/master/login", { email, password: "wrong" })).status, 401);
    const limited = await post("/api/auth/master/login", { email, password });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
  } finally {
    Math.random = originalRandom;
    server.close();
    await once(server, "close");
    await prisma.pendaftaranSekolah.deleteMany({ where: { id: registrationId } });
    await prisma.akun.deleteMany({ where: { id: { in: [id, adminId] } } });
    await pool.query('DELETE FROM "LoginRateLimit" WHERE "key" = ANY($1::text[])', [keys]);
    await prisma.$disconnect();
    await Promise.all([pool.end(), loginPool.end()]);
  }
});
