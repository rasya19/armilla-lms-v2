import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { httpSecurity, productionOrigin } from "./http-security.js";

test("production requires an exact HTTPS origin", () => {
  assert.equal(productionOrigin("https://lms.example.com"), "https://lms.example.com");
  for (const value of [undefined, "", "http://lms.example.com", "https://lms.example.com/", "https://lms.example.com/path", "https://lms.example.com?x=1", "https://user:pass@lms.example.com", "null", "https://lms.example.com:443"]) {
    assert.throws(() => productionOrigin(value));
  }
  assert.throws(() => httpSecurity({ production: true }));
});

test("production API enforces origin and applies security headers, including errors", async () => {
  const app = express();
  app.use(httpSecurity({ production: true, origin: productionOrigin("https://lms.example.com") }));
  app.use(express.json({ limit: "16b" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.post("/change", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${url}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("cache-control"), "no-store");
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-frame-options"), "DENY");
    assert.equal(health.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'");
    assert.equal(health.headers.get("referrer-policy"), "no-referrer");
    for (const origin of [undefined, "http://lms.example.com", "https://evil.example.com", "https://lms.example.com.evil.example.com", "null", "https://lms.example.com/path"]) {
      const response = await fetch(`${url}/change`, { method: "POST", headers: origin ? { origin } : {} });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    const headers = { origin: "https://lms.example.com" };
    assert.equal((await fetch(`${url}/change`, { method: "POST", headers })).status, 200);
    assert.equal((await fetch(`${url}/change`, { method: "POST", headers: { ...headers, "sec-fetch-site": "cross-site" } })).status, 403);
    const tooLarge = await fetch(`${url}/change`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ value: "x".repeat(32) }) });
    assert.equal(tooLarge.status, 413);
    assert.equal(tooLarge.headers.get("x-content-type-options"), "nosniff");
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("development accepts same-host or missing origin but rejects cross-site mutations", async () => {
  const app = express();
  app.use(httpSecurity({ production: false }));
  app.post("/change", (_req, res) => res.sendStatus(204));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${url}/change`, { method: "POST" })).status, 204);
    assert.equal((await fetch(`${url}/change`, { method: "POST", headers: { origin: url } })).status, 204);
    assert.equal((await fetch(`${url}/change`, { method: "POST", headers: { origin: "http://example.invalid" } })).status, 403);
    assert.equal((await fetch(`${url}/change`, { method: "POST", headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  } finally {
    server.close();
    await once(server, "close");
  }
});
