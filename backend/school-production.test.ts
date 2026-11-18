import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
test("production routes work without an opt-in while enforcing authentication and PPDB rate limits", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "production";
  process.env.VERCEL = "1";
  process.env.APP_ORIGIN = "https://lms.example.invalid";
  process.env.LOGIN_RATE_LIMIT_SECRET = "ab".repeat(32);
  delete process.env.LMS_ENABLE_EXPERIMENTAL_FEATURES;
  process.env.MASTER_PROVISION_SECRET = "test-provision-secret";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { hashPassword } = await import("./password.js");
  const { default: app } = await import("./server.js");
  let count = 0;
  let limitFails = false;
  const passwordHash = await hashPassword("test-password");
  let schoolStatus = "ACTIVE";
  let sessions = 0;
  const account = { id: "account-id", nama: "Penguji", email: "test@example.invalid", passwordHash, aktif: true, peran: "ADMIN", sekolahId: "school-id" };
  let loginAccount: object = account;
  let provisioned: object | null = null;
  Object.defineProperty(prisma.akun, "findUnique", { configurable: true, value: async () => loginAccount });
  Object.defineProperty(prisma.akun, "findFirst", { configurable: true, value: async () => loginAccount });
  Object.defineProperty(prisma, "$transaction", {
    configurable: true,
    value: async (fn: (tx: object) => Promise<unknown>) => {
      let queryCount = 0;
      return fn({
        $queryRaw: async () => ++queryCount === 1 ? [loginAccount] : [{ status: schoolStatus, expiresAt: null }],
        sesiAkun: { create: async () => { sessions++; } },
        sekolah: { findUnique: async () => null, create: async () => ({ id: "school-id" }) },
        akun: {
          findUnique: async () => null,
          create: async ({ data }: { data: { nama: string; email: string; passwordHash: string; sekolahId: string; peran: "ADMIN" } }) => {
            provisioned = { id: "new-admin", aktif: true, ...data };
          },
        },
        pendaftaranSekolah: { updateMany: async () => ({ count: 1 }) },
      });
    },
  });
  Object.defineProperty(loginPool, "connect", {
    configurable: true,
    value: async () => ({
      query: async () => ({ rows: [] }),
      release: () => undefined,
    }),
  });
  Object.defineProperty(loginPool, "query", {
    configurable: true,
    value: async (_sql: string, values?: [string, number]) => {
      if (!values) return { rows: [] };
      if (limitFails) throw new Error("database unavailable");
      assert.equal(values[1], 3600);
      return { rows: [{ count: ++count, remaining: 3600 }] };
    },
  });
  Object.defineProperty(prisma.sekolah, "findUnique", { configurable: true, value: async () => null });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const routes: [string, string, number][] = [
      ["POST", "/api/auth/sekolah/login", 400],
      ["POST", "/api/auth/lms/login", 400],
      ["GET", "/api/auth/lms/session", 401],
      ["POST", "/api/auth/lms/ganti-password", 401],
      ["GET", "/api/lms/beranda", 401],
      ["GET", "/api/lms/jadwal", 401],
      ["GET", "/api/lms/guru/siswa-reset", 401],
      ["POST", "/api/lms/guru/siswa/id/reset-password", 401],
      ["GET", "/api/lms/pembelajaran/materi", 401],
      ["POST", "/api/sekolah/siswa/id/akun", 401],
      ["POST", "/api/sekolah/siswa/id/reset-password", 401],
      ["POST", "/api/sekolah/siswa/import", 401],
      ["POST", "/api/sekolah/guru", 401],
      ["GET", "/api/ppdb/test", 404],
      ["POST", "/api/sekolah/ppdb/id/tinjau", 401],
      ["GET", "/api/sekolah/akademik", 401],
      ["GET", "/api/sekolah/kelas", 401],
      ["POST", "/api/sekolah/kelas", 401],
      ["PATCH", "/api/sekolah/kelas/id", 401],
      ["GET", "/api/sekolah/penempatan-siswa", 401],
      ["PATCH", "/api/sekolah/siswa/id/kelas", 401],
      ["GET", "/api/sekolah/siswa", 401],
    ];
    const request = (method: string, path: string, headers: Record<string, string> = {}) => fetch(base + path, {
      method,
      headers: { origin: process.env.APP_ORIGIN!, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1", ...headers },
      ...(method !== "GET" ? { body: "{}" } : {}),
    });
    for (const [method, path, status] of routes) {
      assert.equal((await request(method, path)).status, status, `${method} ${path}`);
    }
    assert.equal((await request("POST", "/api/auth/sekolah/login", { origin: "https://evil.example.invalid" })).status, 403);
    const login = () => fetch(base + "/api/auth/sekolah/login", {
      method: "POST",
      headers: { origin: process.env.APP_ORIGIN!, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
      body: JSON.stringify({ email: account.email, password: "test-password" }),
    });
    const provision = await fetch(base + "/api/internal/provision", {
      method: "POST",
      headers: { authorization: "Bearer test-provision-secret", "content-type": "application/json" },
      body: JSON.stringify({ institutionName: "Sekolah Uji", npsn: "P1234567", subdomain: "sekolah-uji", adminName: "Admin Uji", adminEmail: "new@example.invalid", adminPhone: "08123456789", plan: "Tahunan", expiresAt: "2099-12-31T23:59:59Z" }),
    });
    assert.equal(provision.status, 201);
    const credentials = await provision.json();
    assert.ok(provisioned);
    loginAccount = provisioned;
    const newAdminLogin = await fetch(base + "/api/auth/sekolah/login", {
      method: "POST",
      headers: { origin: process.env.APP_ORIGIN!, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
      body: JSON.stringify({ email: credentials.initialUsername, password: credentials.temporaryPassword }),
    });
    assert.equal(newAdminLogin.status, 200);
    loginAccount = account;
    sessions = 0;
    const authenticated = await login();
    assert.equal(authenticated.status, 200);
    assert.match(authenticated.headers.get("set-cookie") ?? "", /HttpOnly; Secure; SameSite=Strict/);
    assert.equal(sessions, 1);
    schoolStatus = "SUSPENDED";
    assert.equal((await login()).status, 401);
    assert.equal(sessions, 1);
    schoolStatus = "ACTIVE";
    loginAccount = { ...account, peran: "GURU", guruId: "teacher-id", siswaId: null, guru: { sekolahId: "school-id", status: "Aktif" }, siswa: null, wajibGantiPassword: true };
    const lmsLogin = await fetch(base + "/api/auth/lms/login", {
      method: "POST",
      headers: { origin: process.env.APP_ORIGIN!, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
      body: JSON.stringify({ identitas: account.email, password: "test-password", peran: "GURU" }),
    });
    assert.equal(lmsLogin.status, 200);
    assert.equal((await lmsLogin.json()).wajibGantiPassword, true);
    assert.equal(sessions, 2);
    loginAccount = { ...account, peran: "SISWA", siswaId: "student-id", guruId: null, siswa: { sekolahId: "school-id", status: "Aktif" }, guru: null, wajibGantiPassword: true };
    const studentLogin = await fetch(base + "/api/auth/lms/login", {
      method: "POST",
      headers: { origin: process.env.APP_ORIGIN!, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
      body: JSON.stringify({ identitas: "1234567890", password: "test-password", peran: "SISWA" }),
    });
    assert.equal(studentLogin.status, 200);
    assert.equal((await studentLogin.json()).wajibGantiPassword, true);
    assert.equal(sessions, 3);
    assert.equal((await request("POST", "/api/ppdb/test", { "x-vercel-forwarded-for": "" })).status, 503);
    for (let i = 0; i < 5; i++) assert.equal((await request("POST", "/api/ppdb/test")).status, 400);
    const limited = await request("POST", "/api/ppdb/test");
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "3600");
    limitFails = true;
    assert.equal((await request("POST", "/api/ppdb/test")).status, 503);
  } finally {
    server.close();
    await once(server, "close");
    await prisma.$disconnect();
    await Promise.all([pool.end(), loginPool.end()]);
  }
});
