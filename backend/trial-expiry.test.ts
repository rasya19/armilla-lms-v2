import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { calculateTrialEndDate, DAY_MS, parseTrialSignup, TRIAL_DURATION_DAYS } from "./trial-utils.js";
import { tenantAccessible, tenantBlockReason } from "./tenant-access.js";

test("trial utilities compute exact 14-day end date, expiry status, and validate trial signups", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  const end = calculateTrialEndDate(start);
  assert.equal(end.getTime() - start.getTime(), TRIAL_DURATION_DAYS * DAY_MS);
  assert.equal(end.toISOString(), "2026-01-15T00:00:00.000Z");

  assert.equal(tenantAccessible({ status: "ACTIVE", expiresAt: end }, new Date("2026-01-14T23:59:59.000Z")), true);
  assert.equal(tenantBlockReason({ status: "ACTIVE", expiresAt: end }, new Date("2026-01-14T23:59:59.000Z")), null);

  assert.equal(tenantAccessible({ status: "ACTIVE", expiresAt: end }, end), false);
  assert.equal(tenantBlockReason({ status: "ACTIVE", expiresAt: end }, end), "EXPIRED");
  assert.equal(tenantBlockReason({ status: "SUSPENDED", expiresAt: end }, start), "SUSPENDED");
  assert.equal(tenantBlockReason(null, start), "NOT_FOUND");

  const valid = parseTrialSignup({
    namaSekolah: "PKBM Harapan Baru",
    slug: "harapan-baru",
    npsn: "P9912345",
    wilayah: "Kota Bandung",
    namaKontak: "Budi Santoso",
    emailKontak: "admin@harapan.sch.id",
    teleponKontak: "081234567890",
    password: "password-aman",
    paket: "Pro",
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.data.slug, "harapan-baru");
    assert.equal(valid.data.planSlug, "pro");
  }

  const reserved = parseTrialSignup({
    namaSekolah: "PKBM Sandbox",
    slug: "sandbox",
    namaKontak: "Budi",
    emailKontak: "admin@harapan.sch.id",
    teleponKontak: "081234567890",
    password: "password-aman",
  });
  assert.equal(reserved.ok, false);

  const shortPassword = parseTrialSignup({
    namaSekolah: "PKBM Harapan",
    slug: "pkbm-harapan-ok",
    namaKontak: "Budi",
    emailKontak: "admin@harapan.sch.id",
    teleponKontak: "081234567890",
    password: "123",
  });
  assert.equal(shortPassword.ok, false);
});

test("14-day free trial signup provisions school and automatically blocks after end date expires", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  process.env.APP_ORIGIN = "https://pkbm.siput.id";
  process.env.LOGIN_RATE_LIMIT_SECRET = "cd".repeat(32);

  const { prisma, loginPool } = await import("./db.js");
  const { hashPassword } = await import("./password.js");
  const { default: app } = await import("./server.js");

  type SchoolRec = {
    id: string;
    nama: string;
    slug: string;
    npsn: string | null;
    kabupatenKota: string | null;
    plan: string;
    status: "ACTIVE" | "SUSPENDED";
    themeKey: string;
    expiresAt: Date | null;
  };
  type AccountRec = {
    id: string;
    sekolahId: string;
    nama: string;
    email: string;
    passwordHash: string;
    peran: "ADMIN" | "GURU" | "SISWA";
    aktif: boolean;
    wajibGantiPassword: boolean;
    guruId: string | null;
    siswaId: string | null;
  };
  type SessionRec = {
    tokenHash: string;
    akunId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  };

  const schools = new Map<string, SchoolRec>();
  const accountsByEmail = new Map<string, AccountRec>();
  const accountsById = new Map<string, AccountRec>();
  const sessionsByHash = new Map<string, SessionRec>();

  let registrationCounter = 0;

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
      return { rows: [{ count: ++registrationCounter, remaining: values[1] }] };
    },
  });

  Object.defineProperty(prisma.platformSetting, "findUnique", {
    configurable: true,
    value: async () => ({ value: "ocean" }),
  });

  Object.defineProperty(prisma.websiteSettings, "findUnique", {
    configurable: true,
    value: async () => null,
  });
  Object.defineProperty(prisma.websiteSettings, "create", {
    configurable: true,
    value: async () => ({}),
  });
  Object.defineProperty(prisma.pendaftaranSekolah, "create", {
    configurable: true,
    value: async () => ({ id: "pendaftaran-1" }),
  });

  const findSchool = (where: { id?: string; slug?: string; npsn?: string } | undefined): SchoolRec | null => {
    if (!where) return null;
    if (where.id) return schools.get(where.id) ?? null;
    for (const s of schools.values()) {
      if (where.slug && s.slug === where.slug) return s;
      if (where.npsn && s.npsn === where.npsn) return s;
    }
    return null;
  };

  Object.defineProperty(prisma.sekolah, "findUnique", {
    configurable: true,
    value: async ({ where }: { where: { id?: string; slug?: string; npsn?: string } }) => findSchool(where),
  });

  Object.defineProperty(prisma.akun, "findUnique", {
    configurable: true,
    value: async ({ where }: { where: { email?: string; id?: string } }) => {
      if (where.email) {
        const a = accountsByEmail.get(where.email) ?? null;
        if (!a) return null;
        return {
          ...a,
          siswa: null,
          guru: a.peran === "GURU" ? { sekolahId: a.sekolahId, status: "Aktif" } : null,
        };
      }
      if (where.id) return accountsById.get(where.id) ?? null;
      return null;
    },
  });

  Object.defineProperty(prisma.sesiAkun, "findUnique", {
    configurable: true,
    value: async ({ where }: { where: { tokenHash: string } }) => {
      const sess = sessionsByHash.get(where.tokenHash);
      if (!sess) return null;
      const acct = accountsById.get(sess.akunId);
      if (!acct) return null;
      const school = schools.get(acct.sekolahId) ?? null;
      return {
        ...sess,
        akun: {
          ...acct,
          guru: acct.peran === "GURU" ? { sekolahId: acct.sekolahId, status: "Aktif" } : null,
          siswa: null,
          sekolah: school ? { id: school.id, status: school.status, expiresAt: school.expiresAt } : null,
        },
      };
    },
  });

  Object.defineProperty(prisma.guru, "findFirst", {
    configurable: true,
    value: async () => ({
      id: "guru-trial-1",
      nama: "Tutor Uji Coba",
      email: "tutor@trial-pkbm.sch.id",
      nuptk: null,
      telepon: null,
      mapelUtama: "Matematika",
    }),
  });

  Object.defineProperty(prisma, "$transaction", {
    configurable: true,
    value: async (fn: (tx: object) => Promise<unknown>) => {
      let currentAccountId: string | null = null;
      return fn({
        sekolah: {
          create: async ({ data }: { data: Partial<SchoolRec> }) => {
            const rec: SchoolRec = {
              id: `school-${schools.size + 1}`,
              nama: String(data.nama),
              slug: String(data.slug),
              npsn: data.npsn ?? null,
              kabupatenKota: data.kabupatenKota ?? null,
              plan: String(data.plan ?? "pro"),
              status: data.status ?? "ACTIVE",
              themeKey: String(data.themeKey ?? "ocean"),
              expiresAt: data.expiresAt ?? null,
            };
            schools.set(rec.id, rec);
            return rec;
          },
        },
        akun: {
          create: async ({ data }: { data: Partial<AccountRec> }) => {
            const rec: AccountRec = {
              id: `akun-${accountsById.size + 1}`,
              sekolahId: String(data.sekolahId),
              nama: String(data.nama),
              email: String(data.email),
              passwordHash: String(data.passwordHash),
              peran: data.peran ?? "ADMIN",
              aktif: data.aktif ?? true,
              wajibGantiPassword: data.wajibGantiPassword ?? false,
              guruId: data.guruId ?? null,
              siswaId: data.siswaId ?? null,
            };
            accountsByEmail.set(rec.email, rec);
            accountsById.set(rec.id, rec);
            return rec;
          },
        },
        $queryRaw: async (_strings: TemplateStringsArray, idVal: string) => {
          if (!currentAccountId) {
            currentAccountId = idVal;
            const acct = accountsById.get(idVal);
            return acct ? [{ passwordHash: acct.passwordHash, aktif: acct.aktif, peran: acct.peran, sekolahId: acct.sekolahId }] : [];
          }
          const school = schools.get(idVal);
          return school ? [{ status: school.status, expiresAt: school.expiresAt }] : [];
        },
        sesiAkun: {
          create: async ({ data }: { data: { akunId: string; tokenHash: string; expiresAt: Date } }) => {
            const sess: SessionRec = { ...data, revokedAt: null };
            sessionsByHash.set(data.tokenHash, sess);
            return sess;
          },
        },
      });
    },
  });

  const server = express()
    .use((req, _res, next) => {
      if (req.get("x-test-host")) req.headers.host = req.get("x-test-host");
      next();
    })
    .use(app)
    .listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const mainHost = "pkbm.siput.id";
    const trialSlug = "pkbm-coba-gratis";
    const trialHost = `${trialSlug}.pkbm.siput.id`;

    // 1. Signup via Coba Gratis 14 Hari on main domain
    const signupRes = await fetch(`${base}/api/pendaftaran-sekolah/coba-gratis`, {
      method: "POST",
      headers: {
        "x-test-host": mainHost,
        origin: `https://${mainHost}`,
        "content-type": "application/json",
        "x-vercel-forwarded-for": "198.51.100.10",
      },
      body: JSON.stringify({
        namaSekolah: "PKBM Coba Gratis",
        slug: trialSlug,
        wilayah: "Kota Yogyakarta",
        namaKontak: "Admin Uji Coba",
        emailKontak: "admin@trial-pkbm.sch.id",
        teleponKontak: "081234567890",
        password: "trial-password-123",
        paket: "Pro",
      }),
    });
    assert.equal(signupRes.status, 201);
    const signupBody = await signupRes.json() as {
      trialDays: number;
      startDate: string;
      endDate: string;
      expiresAt: string;
      sekolah: { id: string; slug: string; expiresAt: string; status: string };
    };
    assert.equal(signupBody.trialDays, 14);
    assert.equal(signupBody.sekolah.slug, trialSlug);
    assert.equal(signupBody.sekolah.status, "ACTIVE");
    const deltaMs = new Date(signupBody.endDate).getTime() - new Date(signupBody.startDate).getTime();
    assert.equal(deltaMs, 14 * DAY_MS);

    // Duplicate subdomain must return 409
    const dupRes = await fetch(`${base}/api/pendaftaran-sekolah/coba-gratis`, {
      method: "POST",
      headers: {
        "x-test-host": mainHost,
        origin: `https://${mainHost}`,
        "content-type": "application/json",
        "x-vercel-forwarded-for": "198.51.100.10",
      },
      body: JSON.stringify({
        namaSekolah: "PKBM Lain",
        slug: trialSlug,
        namaKontak: "Admin Lain",
        emailKontak: "lain@trial-pkbm.sch.id",
        teleponKontak: "081299998888",
        password: "trial-password-123",
      }),
    });
    assert.equal(dupRes.status, 409);

    // Seed a teacher account for LMS expiry verification
    const school = schools.get(signupBody.sekolah.id);
    assert.ok(school);
    const guruHash = await hashPassword("guru-password-123");
    const guruAccount: AccountRec = {
      id: "akun-guru-trial",
      sekolahId: school.id,
      nama: "Tutor Uji Coba",
      email: "tutor@trial-pkbm.sch.id",
      passwordHash: guruHash,
      peran: "GURU",
      aktif: true,
      wajibGantiPassword: false,
      guruId: "guru-trial-1",
      siswaId: null,
    };
    accountsByEmail.set(guruAccount.email, guruAccount);
    accountsById.set(guruAccount.id, guruAccount);

    // 2. While active (before 14 days elapse): tenant context, public lookup, admin login, session, and LMS login work
    const ctxActive = await fetch(`${base}/api/tenant/context`, {
      headers: { "x-test-host": trialHost },
    });
    assert.equal(ctxActive.status, 200);

    const publicActive = await fetch(`${base}/api/public/sekolah/${trialSlug}`, {
      headers: { "x-test-host": trialHost },
    });
    assert.equal(publicActive.status, 200);
    const publicJson = await publicActive.json() as { expiresAt: string | null };
    assert.equal(publicJson.expiresAt, signupBody.expiresAt);

    const adminLoginRes = await fetch(`${base}/api/auth/sekolah/login`, {
      method: "POST",
      headers: {
        "x-test-host": trialHost,
        origin: `https://${trialHost}`,
        "content-type": "application/json",
        "x-vercel-forwarded-for": "198.51.100.11",
      },
      body: JSON.stringify({ email: "admin@trial-pkbm.sch.id", password: "trial-password-123" }),
    });
    assert.equal(adminLoginRes.status, 200);
    const adminCookie = adminLoginRes.headers.get("set-cookie")?.split(";")[0];
    assert.ok(adminCookie);

    const adminSessionActive = await fetch(`${base}/api/auth/sekolah/session`, {
      headers: { "x-test-host": trialHost, cookie: adminCookie },
    });
    assert.equal(adminSessionActive.status, 200);

    const lmsLoginRes = await fetch(`${base}/api/auth/lms/login`, {
      method: "POST",
      headers: {
        "x-test-host": trialHost,
        origin: `https://${trialHost}`,
        "content-type": "application/json",
        "x-vercel-forwarded-for": "198.51.100.12",
      },
      body: JSON.stringify({ identitas: "tutor@trial-pkbm.sch.id", password: "guru-password-123", peran: "GURU" }),
    });
    assert.equal(lmsLoginRes.status, 200);
    const lmsCookie = lmsLoginRes.headers.get("set-cookie")?.split(";")[0];
    assert.ok(lmsCookie);

    // 3. Fast-forward past 14 days (set expiresAt in the past): everything is automatically blocked!
    school.expiresAt = new Date(Date.now() - 60_000);

    const ctxExpired = await fetch(`${base}/api/tenant/context`, {
      headers: { "x-test-host": trialHost },
    });
    assert.equal(ctxExpired.status, 404);
    const ctxExpiredBody = await ctxExpired.json() as { code: string; expiresAt: string };
    assert.equal(ctxExpiredBody.code, "TENANT_EXPIRED");
    assert.ok(ctxExpiredBody.expiresAt);

    const publicExpired = await fetch(`${base}/api/public/sekolah/${trialSlug}`, {
      headers: { "x-test-host": mainHost },
    });
    assert.equal(publicExpired.status, 404);
    const publicExpiredBody = await publicExpired.json() as { code: string };
    assert.equal(publicExpiredBody.code, "TENANT_EXPIRED");

    // Existing admin & LMS cookies must be blocked immediately with 403 TENANT_EXPIRED
    // Note: tenantHostMiddleware rejects subdomain HTTP calls with 404 before auth, while local dev host reaches session check with 403
    const adminSessionExpired = await fetch(`${base}/api/auth/sekolah/session`, {
      headers: { "x-test-host": "localhost:3000", cookie: adminCookie },
    });
    assert.equal(adminSessionExpired.status, 403);
    assert.equal((await adminSessionExpired.json() as { code: string }).code, "TENANT_EXPIRED");

    const lmsSessionExpired = await fetch(`${base}/api/auth/lms/session`, {
      headers: { "x-test-host": "localhost:3000", cookie: lmsCookie },
    });
    assert.equal(lmsSessionExpired.status, 403);
    assert.equal((await lmsSessionExpired.json() as { code: string }).code, "TENANT_EXPIRED");

    // Login attempts on expired school return 403 TENANT_EXPIRED when credentials match
    const expiredLogin = await fetch(`${base}/api/auth/sekolah/login`, {
      method: "POST",
      headers: {
        "x-test-host": "localhost:3000",
        origin: "https://localhost:3000",
        "content-type": "application/json",
        "x-vercel-forwarded-for": "198.51.100.13",
      },
      body: JSON.stringify({ email: "admin@trial-pkbm.sch.id", password: "trial-password-123" }),
    });
    assert.equal(expiredLogin.status, 403);
    assert.equal((await expiredLogin.json() as { code: string }).code, "TENANT_EXPIRED");

    const expiredLmsLogin = await fetch(`${base}/api/auth/lms/login`, {
      method: "POST",
      headers: {
        "x-test-host": "localhost:3000",
        origin: "https://localhost:3000",
        "content-type": "application/json",
        "x-vercel-forwarded-for": "198.51.100.14",
      },
      body: JSON.stringify({ identitas: "tutor@trial-pkbm.sch.id", password: "guru-password-123", peran: "GURU" }),
    });
    assert.equal(expiredLmsLogin.status, 403);
    assert.equal((await expiredLmsLogin.json() as { code: string }).code, "TENANT_EXPIRED");
  } finally {
    server.close();
  }
});
