import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { internalProvisionRouter, prismaInternalStore, ProvisionConflict } from "./internal-provision.js";
import { verifyPassword } from "./password.js";
import { tenantAccessible } from "./tenant-access.js";

const future = "2099-12-31T23:59:59Z";
const valid = { institutionName: "Sekolah Uji", npsn: "P1234567", subdomain: "sekolah-uji", adminName: "Admin Sekolah", adminEmail: "ADMIN@example.invalid", adminPhone: "08123456789", plan: "Tahunan", expiresAt: future };

test("internal provisioning authenticates, validates, and returns a usable temporary password", async () => {
  let secret: string | undefined = "test-secret";
  let hash = "";
  let calls = 0;
  const app = express();
  app.use("/api/internal", internalProvisionRouter({
    async provision(data, passwordHash) { calls++; hash = passwordHash; assert.equal(data.adminEmail, "admin@example.invalid"); return "tenant-id"; },
    async updateStatus(npsn, status, expiresAt) { calls++; assert.equal(npsn, "P1234567"); assert.equal(status, "SUSPENDED"); assert.equal(expiresAt.toISOString(), "2099-12-31T23:59:59.000Z"); return true; },
  }, { secret: () => secret, origin: () => "http://localhost:3000", production: false }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/internal`;
  const send = (path: string, method: string, body: unknown, auth = "Bearer test-secret", extra: Record<string, string> = {}) => fetch(base + path, { method, headers: { authorization: auth, "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
  try {
    assert.equal((await send("/provision", "POST", valid, "")).status, 401);
    assert.equal((await send("/provision", "POST", valid, "Bearer wrong")).status, 401);
    secret = "";
    assert.equal((await send("/provision", "POST", valid, "Bearer test-secret")).status, 401);
    secret = "test-secret";
    assert.equal((await send("/provision", "POST", valid, "Bearer test-secret", { origin: "http://localhost:3000" })).status, 403);
    assert.equal((await fetch(`${base}/health`)).status, 401);
    const health = await fetch(`${base}/health`, { headers: { authorization: "Bearer test-secret" } });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { success: true });
    for (const body of [{ ...valid, npsn: "bad" }, { ...valid, subdomain: "a.example.com" }, { ...valid, expiresAt: "2026-02-30T00:00:00Z" }, { ...valid, expiresAt: "2000-01-01T00:00:00Z" }]) {
      assert.equal((await send("/provision", "POST", body)).status, 400);
    }
    assert.equal(calls, 0);
    const created = await send("/provision", "POST", valid);
    assert.equal(created.status, 201);
    assert.equal(created.headers.get("cache-control"), "no-store");
    const result = await created.json();
    assert.deepEqual(Object.keys(result).sort(), ["initialUsername", "loginUrl", "success", "temporaryPassword", "tenantId"].sort());
    assert.equal(result.tenantId, "tenant-id");
    assert.equal(result.loginUrl, "http://localhost:3000/login");
    assert.equal(result.initialUsername, "admin@example.invalid");
    assert.match(result.temporaryPassword, /^[A-Za-z0-9_-]{24}$/);
    assert.notEqual(hash, result.temporaryPassword);
    assert.ok(await verifyPassword(result.temporaryPassword, hash));
    assert.equal((await send("/tenants/P1234567/status", "PATCH", { status: "ACTIVE", expiresAt: "2000-01-01T00:00:00Z" })).status, 400);
    assert.equal((await send("/tenants/p1234567/status", "PATCH", { status: "SUSPENDED", expiresAt: future })).status, 200);
    assert.equal(calls, 2);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("production remains disabled and rejects missing credentials first", async () => {
  const app = express();
  app.use(internalProvisionRouter({ provision: async () => { throw new Error("unexpected"); }, updateStatus: async () => false }, { secret: () => "secret", origin: () => "https://example.invalid", production: true }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/provision`;
    assert.equal((await fetch(url, { method: "POST" })).status, 401);
    assert.equal((await fetch(url, { method: "POST", headers: { authorization: "Bearer secret" } })).status, 503);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("conflicts and missing tenants are surfaced without success-shaped responses", async () => {
  const app = express();
  app.use(internalProvisionRouter({
    provision: async () => { throw new ProvisionConflict("NPSN sudah terdaftar."); },
    updateStatus: async () => false,
  }, { secret: () => "secret", origin: () => "http://localhost:3000", production: false }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { authorization: "Bearer secret", "content-type": "application/json" };
    const conflict = await fetch(`${base}/provision`, { method: "POST", headers, body: JSON.stringify(valid) });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error, "NPSN sudah terdaftar.");
    const missing = await fetch(`${base}/tenants/P1234567/status`, { method: "PATCH", headers, body: JSON.stringify({ status: "SUSPENDED", expiresAt: future }) });
    assert.equal(missing.status, 404);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("tenant access denies suspension and expiry while preserving legacy schools", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  assert.equal(tenantAccessible(null, now), false);
  assert.equal(tenantAccessible({ status: "ACTIVE", expiresAt: null }, now), true);
  assert.equal(tenantAccessible({ status: "SUSPENDED", expiresAt: new Date(future) }, now), false);
  assert.equal(tenantAccessible({ status: "ACTIVE", expiresAt: now }, now), false);
  assert.equal(tenantAccessible({ status: "ACTIVE", expiresAt: new Date(future) }, now), true);
});

test("provisioning is atomic and database constraints reject duplicates", { skip: process.env.RUN_PROVISION_INTEGRATION !== "1", timeout: 60000 }, async () => {
  const { prisma, pool, loginPool } = await import("./db.js");
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  const npsn = `P${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`;
  const data = { ...valid, institutionName: id, npsn, subdomain: `test-${id}`, adminEmail: `${id}@example.invalid`, expiresAt: new Date(future) };
  const store = prismaInternalStore(prisma);
  try {
    const tenantId = await store.provision(data, "hash");
    const school = await prisma.sekolah.findUniqueOrThrow({ where: { id: tenantId }, include: { akun: true } });
    assert.equal(school.status, "ACTIVE");
    assert.equal(school.akun.length, 1);
    await assert.rejects(() => store.provision({ ...data, subdomain: `other-${id}` }, "hash"), /NPSN/);
    await assert.rejects(() => store.provision({ ...data, npsn: "K0000000" }, "hash"), /Subdomain/);
    assert.equal(await store.updateStatus(npsn, "SUSPENDED", new Date(future)), true);
    assert.equal((await prisma.sekolah.findUniqueOrThrow({ where: { id: tenantId } })).status, "SUSPENDED");
  } finally {
    await prisma.akun.deleteMany({ where: { email: data.adminEmail } });
    await prisma.sekolah.deleteMany({ where: { slug: data.subdomain } });
    await prisma.$disconnect();
    await Promise.all([pool.end(), loginPool.end()]);
  }
});
