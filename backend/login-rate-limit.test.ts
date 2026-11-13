import { strict as assert } from "node:assert";
import { createHmac, randomBytes } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { loginClientIp, loginRateLimit, rateLimitSecret } from "./login-rate-limit.js";

test("login limiter secret validation", () => {
  assert.equal(rateLimitSecret("ab".repeat(32)), "ab".repeat(32));
  for (const secret of [undefined, "", "ab", "z".repeat(64)]) assert.throws(() => rateLimitSecret(secret));
});

test("database failure rejects login rather than calling authentication", async () => {
  const pool = new Pool({ host: "127.0.0.1", port: 1, connectionTimeoutMillis: 1000 });
  let called = false;
  try {
    const limit = loginRateLimit(pool, "ab".repeat(32), { cleanup: false });
    await assert.rejects(limit("192.0.2.1", "test", async () => {
      called = true;
      return { kind: "failure" };
    }));
    assert.equal(called, false);
    await assert.rejects(limit("not-an-ip", "test", async () => ({ kind: "failure" })));
  } finally {
    await pool.end();
  }
});

test("production uses only a valid Vercel IP and rejects unsupported deployments", () => {
  assert.equal(loginClientIp(true, true, "127.0.0.1", "192.0.2.1"), "192.0.2.1");
  assert.equal(loginClientIp(false, false, "127.0.0.1", "192.0.2.1"), "127.0.0.1");
  assert.throws(() => loginClientIp(true, false, "127.0.0.1", "192.0.2.1"));
  for (const ip of [undefined, "", "192.0.2.1, 192.0.2.2", "invalid"]) {
    assert.throws(() => loginClientIp(true, true, "127.0.0.1", ip));
  }
});

test("shared database counts only failures and enforces both limits across instances", { skip: process.env.RUN_LOGIN_RATE_LIMIT_INTEGRATION !== "1", timeout: 120000 }, async () => {
  const { pool, loginPool, prisma } = await import("./db.js");
  const secret = randomBytes(32).toString("hex");
  const keys = new Set<string>();
  const key = (kind: string, value: string) => {
    const result = createHmac("sha256", secret).update(`failed-v1\0${kind}\0${value.trim().toLowerCase()}`).digest("hex");
    keys.add(result);
    return result;
  };
  const ip = "192.0.2.1";
  const otherIp = "192.0.2.2";
  const identity = "integration-identity";
  const ipKey = key("ip", ip);
  key("ip", otherIp);
  key("identity", identity);
  const limitA = loginRateLimit(pool, secret, { cleanup: false });
  const limitB = loginRateLimit(loginPool, secret, { cleanup: false });
  const fail = async () => ({ kind: "failure" as const });
  const succeed = async () => ({ kind: "success" as const, value: true });
  try {
    const students = Array.from({ length: 30 }, (_, i) => {
      const student = `student-${i}`;
      key("identity", student);
      return student;
    });
    const successes = await Promise.all(students.map((student, i) => (i % 2 ? limitA : limitB)(ip, student, succeed)));
    assert.equal(successes.filter((item) => item.kind === "success").length, 30);
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM "LoginRateLimit" WHERE "key" = ANY($1::text[])', [[...keys]])).rows[0].count, 0);

    const concurrent = await Promise.all(Array.from({ length: 14 }, (_, i) =>
      (i % 2 ? limitA : limitB)(i % 2 ? ip : otherIp, identity, fail)));
    assert.equal(concurrent.filter((item) => item.kind === "failure").length, 10);
    assert.equal(concurrent.filter((item) => item.kind === "limited").length, 4);
    assert.equal((await limitA(ip, identity, succeed)).kind, "limited");
    const before = await pool.query<{ key: string; count: number }>('SELECT "key", "count" FROM "LoginRateLimit" WHERE "key" = ANY($1::text[]) ORDER BY "key"', [[...keys]]);
    const another = "another-student";
    key("identity", another);
    assert.equal((await limitB(ip, another, succeed)).kind, "success");
    const after = await pool.query<{ key: string; count: number }>('SELECT "key", "count" FROM "LoginRateLimit" WHERE "key" = ANY($1::text[]) ORDER BY "key"', [[...keys]]);
    assert.deepEqual(after.rows, before.rows);

    await pool.query('UPDATE "LoginRateLimit" SET "count" = 499 WHERE "key" = $1', [ipKey]);
    const finalIdentity = "final-failure";
    key("identity", finalIdentity);
    assert.equal((await limitA(ip, finalIdentity, fail)).kind, "failure");
    let called = false;
    const blocked = await limitB(ip, another, async () => {
      called = true;
      return { kind: "success", value: true };
    });
    assert.equal(blocked.kind, "limited");
    if (blocked.kind === "limited") assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 900);
    assert.equal(called, false);

    const exceptionIdentity = "exception";
    key("identity", exceptionIdentity);
    await assert.rejects(limitA(otherIp, exceptionIdentity, async () => { throw new Error("test"); }));
    const exceptionRows = await pool.query('SELECT 1 FROM "LoginRateLimit" WHERE "key" = $1', [key("identity", exceptionIdentity)]);
    assert.equal(exceptionRows.rowCount, 0);
  } finally {
    await pool.query('DELETE FROM "LoginRateLimit" WHERE "key" = ANY($1::text[])', [[...keys]]);
    await prisma.$disconnect();
    await Promise.all([pool.end(), loginPool.end()]);
  }
});
