import { strict as assert } from "node:assert";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { Prisma } from "@prisma/client";
import { httpSecurity } from "./http-security.js";
import { registrationLimitKey, registrationRateLimit, registrationRoutes } from "./registration-routes.js";

const valid = { namaSekolah: "Sekolah Uji", namaKontak: "Penguji", emailKontak: "test@example.invalid", teleponKontak: "0123456789" };
const origin = "https://school.example.invalid";
const headers = { origin, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" };

test("production registration validates origin and input, saves, and reports safe errors", async () => {
  let mode = "ok";
  let saved = 0;
  const app = express();
  app.use(httpSecurity({ production: true, origin }));
  app.use(express.json());
  app.use("/api/pendaftaran-sekolah", registrationRoutes({
    production: true,
    vercel: true,
    limit: async () => {
      if (mode === "limit-error") throw new Error("sensitive database detail");
      return { allowed: mode !== "limited", retryAfter: 120 };
    },
    save: async () => {
      if (mode === "save-error") throw new Prisma.PrismaClientKnownRequestError("sensitive database detail", { code: "P2021", clientVersion: "test" });
      saved++;
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/pendaftaran-sekolah`;
  const post = (body: unknown, h = headers) => fetch(url, { method: "POST", headers: h, body: JSON.stringify(body) });
  try {
    assert.equal((await post(valid, { ...headers, origin: "https://evil.invalid" })).status, 403);
    assert.equal((await post(valid, { ...headers, "x-vercel-forwarded-for": "" })).status, 503);
    assert.equal((await post({ ...valid, emailKontak: "invalid" })).status, 400);
    assert.equal((await post(valid)).status, 201);
    assert.equal(saved, 1);
    mode = "limited";
    const limited = await post(valid);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "120");
    mode = "limit-error";
    const limitError = await post(valid);
    assert.equal(limitError.status, 503);
    assert.equal((await limitError.json()).code, "REGISTRATION_LIMIT_UNAVAILABLE");
    mode = "save-error";
    const saveError = await post(valid);
    const text = await saveError.text();
    assert.equal(saveError.status, 503);
    assert.equal(JSON.parse(text).code, "REGISTRATION_SCHEMA_ERROR");
    assert.ok(!text.includes("sensitive"));
    assert.equal(saved, 1);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("database saves test registration and enforces a shared limit", { skip: process.env.RUN_REGISTRATION_INTEGRATION !== "1", timeout: 60000 }, async () => {
  const { pool, loginPool, prisma } = await import("./db.js");
  const secret = randomBytes(32).toString("hex");
  const ip = "192.0.2.55";
  const key = registrationLimitKey(secret, ip);
  const routeIp = "192.0.2.56";
  const routeKey = registrationLimitKey(secret, routeIp);
  const limits = [registrationRateLimit(pool, secret), registrationRateLimit(loginPool, secret)];
  const testId = randomUUID();
  const app = express();
  app.use(httpSecurity({ production: true, origin }));
  app.use(express.json());
  app.use("/api/pendaftaran-sekolah", registrationRoutes({
    production: true,
    vercel: true,
    limit: limits[0],
    save: async (data) => { await prisma.pendaftaranSekolah.create({ data: { ...data, id: testId } }); },
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => limits[i % 2](ip)));
    assert.equal(results.filter((item) => item.allowed).length, 5);
    assert.equal(results.filter((item) => !item.allowed).length, 5);
    const response = await fetch(`http://127.0.0.1:${address.port}/api/pendaftaran-sekolah`, {
      method: "POST",
      headers: { ...headers, "x-vercel-forwarded-for": routeIp },
      body: JSON.stringify({ ...valid, emailKontak: `${testId}@example.invalid` }),
    });
    assert.equal(response.status, 201);
    const created = await prisma.pendaftaranSekolah.findUniqueOrThrow({ where: { id: testId }, select: { id: true, status: true } });
    assert.equal(created.id, testId);
    assert.equal(created.status, "MENUNGGU");
    assert.ok(await prisma.pendaftaranSekolah.findUnique({ where: { id: testId }, select: { id: true } }));
  } finally {
    server.close();
    await once(server, "close");
    await prisma.pendaftaranSekolah.deleteMany({ where: { id: testId } });
    await pool.query('DELETE FROM "LoginRateLimit" WHERE "key" = ANY($1::text[])', [[key, routeKey]]);
    await prisma.$disconnect();
    await Promise.all([pool.end(), loginPool.end()]);
  }
});
