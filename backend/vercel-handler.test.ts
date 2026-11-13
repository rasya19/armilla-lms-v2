import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { createVercelHandler, productionConfigurationIssue } from "./vercel-handler.js";

const valid = { NODE_ENV: "production", DATABASE_URL: "postgresql://test:test@localhost/test", APP_ORIGIN: "https://example.invalid", LOGIN_RATE_LIMIT_SECRET: "ab".repeat(32) };

test("production startup reports specific invalid configuration without revealing values", () => {
  assert.equal(productionConfigurationIssue(valid), null);
  assert.equal(productionConfigurationIssue({ ...valid, DATABASE_URL: "" })?.code, "DATABASE_URL_MISSING");
  assert.equal(productionConfigurationIssue({ ...valid, APP_ORIGIN: "http://localhost:3000" })?.code, "APP_ORIGIN_INVALID");
  assert.equal(productionConfigurationIssue({ ...valid, LOGIN_RATE_LIMIT_SECRET: "bad-secret" })?.code, "LOGIN_RATE_LIMIT_SECRET_INVALID");
  assert.equal(productionConfigurationIssue({ NODE_ENV: "development" }), null);
});

test("serverless handler returns JSON for configuration and import errors and caches successful app", async () => {
  let loads = 0;
  const successful = express();
  successful.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  const ok = createVercelHandler(async () => { loads++; return successful; }, valid);
  const badConfig = createVercelHandler(async () => { loads++; return successful; }, { ...valid, LOGIN_RATE_LIMIT_SECRET: "" });
  const failedImport = createVercelHandler(async () => { throw new Error("sensitive database detail"); }, valid);
  const outer = express();
  outer.use("/ok", (req, res) => { void ok(req, res); });
  outer.use("/invalid", (req, res) => { void badConfig(req, res); });
  outer.use("/broken", (req, res) => { void failedImport(req, res); });
  const server = outer.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const invalid = await fetch(`${base}/invalid/api/health`);
    assert.equal(invalid.status, 503);
    assert.equal(invalid.headers.get("cache-control"), "no-store");
    assert.equal((await invalid.json()).code, "LOGIN_RATE_LIMIT_SECRET_INVALID");
    assert.equal(loads, 0);
    const broken = await fetch(`${base}/broken/api/health`);
    assert.equal(broken.status, 503);
    const body = await broken.text();
    assert.equal(JSON.parse(body).code, "API_INITIALIZATION_FAILED");
    assert.ok(!body.includes("sensitive"));
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${base}/ok/api/health`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
    }
    assert.equal(loads, 1);
  } finally {
    server.close();
    await once(server, "close");
  }
});
