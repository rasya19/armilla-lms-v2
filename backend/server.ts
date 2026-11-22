import express from "express";
import { createHash, randomBytes, randomInt, randomUUID } from "crypto";
import { loginPool, pool, prisma } from "./db.js";
import { DEFAULT_ACCOUNT_PASSWORD, DEFAULT_STUDENT_PASSWORD, hashPassword, isValidPasswordLength, verifyPassword } from "./password.js";
import {
  buildMonthlyCalendarSummary,
  jakartaDate,
  jakartaIsoDate,
  parseRequestedAccountPassword,
  recordStudentLoginAttendance,
  resolveStudentLoginUsername,
} from "./attendance-helpers.js";
import { extractPaketFromNote, registrationRateLimit, registrationRoutes, saveRegistrationRecord } from "./registration-routes.js";
import { formatPasswordFromBirthDate, normalizeClassKey, parseDapodikStudentImport, slugifyShortName } from "./student-import.js";
import { parseApplicant, parseTeacher } from "./school-input.js";
import { parseClass, parsePlacement } from "./class-input.js";
import { academicRoutes } from "./academic-routes.js";
import { httpSecurity, productionOrigin } from "./http-security.js";
import { learningRoutes } from "./learning-routes.js";
import { classroomRoutes } from "./classroom-routes.js";
import { examRoutes } from "./exam-routes.js";
import { createLoginSession } from "./login-session.js";
import { loginClientIp, loginRateLimit, rateLimitSecret } from "./login-rate-limit.js";
import { Prisma } from "@prisma/client";
import { internalProvisionRoutes } from "./internal-provision.js";
import { forwardRegistrationToMaster } from "./master-admin-registration.js";
import { tenantAccessible } from "./tenant-access.js";
import { tenantHostMiddleware } from "./tenant-host.js";
import { schoolManagementRoutes } from "./school-management-routes.js";
import { normalizeTenantPlan } from "./plan-utils.js";
import { schoolTierRoutes } from "./school-tier-routes.js";
import { syncTenantPlanToLms, toCleanPlanCode } from "./lms-plan-sync.js";
import { getGlobalTheme, GLOBAL_THEME_OPTIONS, isGlobalThemeKey, setGlobalTheme } from "./global-theme.js";
import {
  ensureSandboxDinasAccount,
  ensureSandboxTenant,
  resolveSchoolWithSandboxSeed,
  resolveTenantHostSchool,
  SANDBOX_DINAS_EMAIL,
  SANDBOX_SLUG,
} from "./sandbox-seed.js";
import { vervalRoutes } from "./verval-routes.js";
import { dinasRoutes, type DinasContext } from "./dinas-routes.js";
import { tahap2AcademicRoutes } from "./academic-raport-routes.js";
import { cbtPublicBankRoutes, tahap2CbtRoutes } from "./cbt-routes.js";
import { tahap2ProRoutes } from "./pro-admin-routes.js";
import { tahap2CollabRoutes } from "./collab-asset-routes.js";
import { masterContentRoutes, moduleBulkImportRoutes, schoolMasterContentRoutes } from "./master-content-routes.js";
import { moduleBankRoutes } from "./module-bank-routes.js";
import { cloneMasterContentToSchool } from "./master-content-shared.js";
import { resolveTeacherScope, type SchoolSessionInfo } from "./school-modules-shared.js";
import { createLoginFailureLimiter, createPpdbSubmissionLimiter, resolveSafeClientIp } from "./rate-limit.js";
import { createSecurityGuardMiddleware, globalErrorHandler, type VerifiedActorSession } from "./security-middleware.js";

const app = express();
export default app;
const cookieName = "armilla_session";
const schoolCookieName = "sekolah_session";
const lmsCookieName = "lms_session";
const dinasCookieName = "dinas_session";
const sessionDurationMs = 8 * 60 * 60 * 1000;
const loginFailureLimiter = createLoginFailureLimiter();
const ppdbSubmissionLimiter = createPpdbSubmissionLimiter();
const dummyHash = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

app.disable("x-powered-by");
const production = process.env.NODE_ENV === "production";
app.use("/api/internal", internalProvisionRoutes(prisma));
app.use("/api", httpSecurity({ production, origin: production ? productionOrigin(process.env.APP_ORIGIN) : undefined }));
app.use("/api/verval", express.json({ limit: "20mb" }));
app.use("/api/sekolah/siswa/import", express.json({ limit: "2mb" }));
app.use("/api/sekolah/identitas", express.json({ limit: "5mb" }));
app.use("/api/master/pustaka-konten", express.json({ limit: "2mb" }));
app.use("/api/school", express.json({ limit: "2mb" }));
app.use("/api/sekolah/ai-assistant", express.json({ limit: "256kb" }));
app.use("/api/sekolah/diskusi", express.json({ limit: "256kb" }));
app.use("/api/sekolah/cbt", express.json({ limit: "2mb" }));
app.use("/api/sekolah/pembelajaran", express.json({ limit: "256kb" }));
app.use("/api/lms/pembelajaran", express.json({ limit: "5mb" }));
app.use("/api/module-bank", express.json({ limit: "20mb" }));
app.use(express.json({ limit: "16kb" }));
app.use("/api", tenantHostMiddleware(production, (slug) => resolveTenantHostSchool(prisma, slug), process.env.APP_ORIGIN));
app.get("/api/tenant/context", (req, res) => res.json({
  kind: req.tenant?.kind,
  ...(req.tenant?.kind === "school" ? { slug: req.tenant.slug } : {}),
}));
app.use("/api", (req, res, next) => {
  const tenant = req.tenant;
  if (!tenant) return res.status(503).json({ error: "Konteks sekolah tidak tersedia." });
  if (tenant.kind === "main" && /^\/(?:auth\/(?:sekolah|lms)|sekolah|school|lms|ppdb|verval|module-bank)(?:\/|$)/.test(req.path)) {
    if (/^\/auth\/(?:sekolah|lms)\/login$/.test(req.path)) return res.status(401).json({ error: "Akun tidak terdaftar pada instansi ini. Gunakan subdomain sekolah Anda." });
    return res.status(404).json({ error: "Fitur ini tersedia melalui subdomain sekolah." });
  }
  if (tenant.kind === "school" && /^\/(?:auth\/(?:master|dinas)|master|dinas|pendaftaran-sekolah)(?:\/|$)/.test(req.path)) {
    return res.status(404).json({ error: "Fitur ini tersedia melalui domain utama." });
  }
  return next();
});
app.use("/api", createSecurityGuardMiddleware(async (req): Promise<VerifiedActorSession | null> => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const path = req.path || "/";

  const toAdminActor = async (): Promise<VerifiedActorSession | null> => {
    const s = await getSession(req, "ADMIN");
    return s?.akun.sekolahId ? { userId: s.akun.id, role: "ADMIN", schoolId: s.akun.sekolahId } : null;
  };
  const toLmsActor = async (): Promise<VerifiedActorSession | null> => {
    const s = await getLmsSession(req);
    if (!s?.akun.sekolahId) return null;
    const role = s.akun.peran === "GURU" ? "GURU" : "SISWA";
    return { userId: s.akun.id, role, schoolId: s.akun.sekolahId };
  };
  const toMasterActor = async (): Promise<VerifiedActorSession | null> => {
    const s = await getSession(req, "MASTER_ADMIN");
    return s ? { userId: s.akun.id, role: "MASTER_ADMIN", schoolId: null } : null;
  };
  const toDinasActor = async (): Promise<VerifiedActorSession | null> => {
    const d = await getDinasSession(req);
    return d ? { userId: d.akunId, role: d.peran === "MASTER_ADMIN" ? "MASTER_ADMIN" : "DINAS", schoolId: null } : null;
  };

  if (path === "/master" || path.startsWith("/master/")) {
    return (await toMasterActor()) ?? (await toAdminActor()) ?? (await toLmsActor()) ?? (await toDinasActor());
  }
  if (path === "/dinas" || path.startsWith("/dinas/")) {
    return (await toDinasActor()) ?? (await toAdminActor()) ?? (await toLmsActor());
  }
  if (path === "/lms" || path.startsWith("/lms/")) {
    return (await toLmsActor()) ?? (await toAdminActor()) ?? (await toMasterActor());
  }
  return (await toAdminActor()) ?? (await toLmsActor()) ?? (await toMasterActor()) ?? (await toDinasActor());
}));
const limitSecret = production ? rateLimitSecret(process.env.LOGIN_RATE_LIMIT_SECRET) : randomBytes(32).toString("hex");
const limitLogin = loginRateLimit(loginPool, limitSecret);
const limitProductionPpdb = registrationRateLimit(loginPool, limitSecret, false, "ppdb");

function loginIp(req: express.Request): string {
  if (production && process.env.VERCEL) {
    return loginClientIp(production, true, req.ip, req.get("x-vercel-forwarded-for"));
  }
  return resolveSafeClientIp(req);
}

function sessionToken(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function savePasswordChange(account: {
  id: string;
  passwordHash: string;
  peran: "MASTER_ADMIN" | "ADMIN" | "GURU" | "SISWA" | "DINAS";
  sekolahId: string | null;
  wajibGantiPassword: boolean;
}, passwordHash: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.akun.updateMany({
      where: {
        id: account.id,
        passwordHash: account.passwordHash,
        peran: account.peran,
        sekolahId: account.sekolahId,
        aktif: true,
        wajibGantiPassword: account.wajibGantiPassword,
      },
      data: { passwordHash, wajibGantiPassword: false },
    });
    if (updated.count !== 1) return false;
    await tx.sesiAkun.updateMany({ where: { akunId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return true;
  });
}

function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

let fallbackVisitors = 0;

async function readOrIncrementVisitors(increment: boolean): Promise<number> {
  try {
    const result = increment
      ? await pool.query<{ visitors: number }>(
          `INSERT INTO "SiteStat" ("id", "visitors", "updatedAt")
           VALUES ($1, 1, now())
           ON CONFLICT ("id") DO UPDATE
           SET "visitors" = "SiteStat"."visitors" + 1, "updatedAt" = now()
           RETURNING "visitors"`,
          ["landing"],
        )
      : await pool.query<{ visitors: number }>(
          `SELECT "visitors" FROM "SiteStat" WHERE "id" = $1`,
          ["landing"],
        );
    const dbCount = result.rows[0]?.visitors;
    if (typeof dbCount === "number" && Number.isFinite(dbCount)) {
      fallbackVisitors = dbCount;
      return dbCount;
    }
  } catch (error) {
    console.warn("Statistik pengunjung menggunakan fallback memori:", error instanceof Error ? error.message : "UnknownError");
  }
  if (increment) fallbackVisitors += 1;
  return fallbackVisitors;
}

async function readTotalSchools(): Promise<number> {
  try {
    return await prisma.sekolah.count();
  } catch (error) {
    console.warn("Jumlah sekolah menggunakan fallback:", error instanceof Error ? error.message : "UnknownError");
    return 0;
  }
}

app.get("/api/public/stats", async (_req, res) => {
  const [totalVisitors, totalSchools] = await Promise.all([readOrIncrementVisitors(false), readTotalSchools()]);
  return res.json({ totalVisitors, totalSchools });
});

app.post("/api/public/stats", async (_req, res) => {
  const [totalVisitors, totalSchools] = await Promise.all([readOrIncrementVisitors(true), readTotalSchools()]);
  return res.json({ totalVisitors, totalSchools });
});

app.get("/api/public/tema", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const themeKey = await getGlobalTheme(prisma);
  return res.json({ themeKey });
});

async function handlePublicSchoolLookup(req: express.Request, res: express.Response, explicitSlug?: string) {
  res.setHeader("Cache-Control", "no-store");
  const querySlug = typeof req.query.slug === "string" ? req.query.slug.trim().toLowerCase() : "";
  const slug = (explicitSlug ?? (querySlug || (req.tenant?.kind === "school" ? req.tenant.slug : ""))).trim().toLowerCase();
  if (!slug || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    return res.status(400).json({ error: "Subdomain sekolah tidak valid." });
  }
  if (req.tenant?.kind === "school" && slug !== req.tenant.slug) {
    return res.status(404).json({ error: "Sekolah tidak ditemukan." });
  }
  try {
    const school = await resolveSchoolWithSandboxSeed(prisma, slug);
    if (!school || !tenantAccessible(school)) {
      return res.status(404).json({ error: "Sekolah / Lembaga tidak terdaftar atau tidak aktif." });
    }
    let logoUrl: string | null = null;
    try {
      const settings = await prisma.websiteSettings.findUnique({
        where: { school_id: school.id },
        select: { logo_url: true },
      });
      logoUrl = settings?.logo_url ?? null;
    } catch {
      logoUrl = null;
    }
    const themeKey = await getGlobalTheme(prisma, school.themeKey);
    return res.json({
      id: school.id,
      nama: school.nama,
      slug: school.slug,
      npsn: school.npsn ?? null,
      plan: normalizeTenantPlan(school.plan),
      status: school.status,
      themeKey,
      logoUrl,
    });
  } catch (error) {
    console.error("Gagal memuat profil publik sekolah:", error);
    return res.status(503).json({ error: "Profil sekolah belum dapat dimuat." });
  }
}

app.get("/api/public/sekolah", (req, res) => handlePublicSchoolLookup(req, res));
app.get("/api/public/sekolah/:slug", (req, res) => handlePublicSchoolLookup(req, res, req.params.slug));

app.use("/api/pendaftaran-sekolah", registrationRoutes({
  production,
  vercel: !!process.env.VERCEL,
  limit: registrationRateLimit(loginPool, limitSecret, !!process.env.VERCEL && process.env.VERCEL_ENV === "preview"),
  save: async (data, registrationId) => {
    await forwardRegistrationToMaster(registrationId, data);
    await saveRegistrationRecord(prisma.pendaftaranSekolah, registrationId, data);
  },
}));

app.post("/api/auth/master/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 1024) {
    return res.status(400).json({ error: "Email dan kata sandi wajib diisi." });
  }
  const clientIp = loginIp(req);
  const memCheck = loginFailureLimiter.check(clientIp, email);
  if (!memCheck.allowed) {
    res.setHeader("Retry-After", String(memCheck.retryAfter));
    return res.status(429).json({ error: "Terlalu banyak percobaan login gagal. Coba lagi nanti." });
  }
  try {
    const result = await limitLogin<{ token: string; nama: string; peran: "MASTER_ADMIN" }>(clientIp, email, async () => {
      const account = await prisma.akun.findUnique({ where: { email: email.trim().toLowerCase() } });
      const valid = await verifyPassword(password, account?.passwordHash || dummyHash);
      if (!account || !valid || !account.aktif || account.peran !== "MASTER_ADMIN") return { kind: "failure" };
      const token = await createLoginSession(account, new Date(Date.now() + sessionDurationMs));
      if (!token) return { kind: "failure" };
      return { kind: "success", value: { token, nama: account.nama, peran: account.peran } };
    });
    if (result.kind === "limited") {
      res.setHeader("Retry-After", String(result.retryAfter));
      return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
    }
    if (result.kind === "failure") {
      loginFailureLimiter.recordFailure(clientIp, email);
      return res.status(401).json({ error: "Email atau kata sandi salah." });
    }
    loginFailureLimiter.recordSuccess(clientIp, email);
    res.cookie(cookieName, result.value.token, { ...cookieOptions(), maxAge: sessionDurationMs });
    return res.json({
      nama: result.value.nama,
      peran: result.value.peran,
      token: createHash("sha256").update(result.value.token).digest("hex").slice(0, 32),
      user: { nama: result.value.nama, peran: result.value.peran },
    });
  } catch (error) {
    console.error("Gagal memproses login master:", error);
    return res.status(503).json({ error: "Layanan login tidak tersedia." });
  }
});

const DEVELOPER_EMAILS = new Set(["ismantoj88@gmail.com"]);

function isDeveloperAccount(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  return DEVELOPER_EMAILS.has(email.trim().toLowerCase());
}

async function getSession(req: express.Request, role: "MASTER_ADMIN" | "ADMIN" = "MASTER_ADMIN") {
  const token = sessionToken(req.headers.cookie, role === "ADMIN" ? schoolCookieName : cookieName);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await prisma.sesiAkun.findUnique({ where: { tokenHash }, include: { akun: { include: { sekolah: { select: { status: true, expiresAt: true } } } } } });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.akun.aktif || session.akun.peran !== role || (role === "ADMIN" && !session.akun.sekolahId)) return null;
  if (role === "ADMIN" && !tenantAccessible(session.akun.sekolah)) return null;
  if (role === "ADMIN" && req.tenant?.kind === "school" && session.akun.sekolahId !== req.tenant.id) return null;
  return session;
}

async function getDinasSession(req: express.Request): Promise<DinasContext | null> {
  const token = sessionToken(req.headers.cookie, dinasCookieName);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await prisma.sesiAkun.findUnique({
      where: { tokenHash },
      include: { akun: true },
    });
    if (session && !session.revokedAt && session.expiresAt > new Date() && session.akun.aktif) {
      const account = session.akun;
      const isSuperAdmin = account.peran === "MASTER_ADMIN" || isDeveloperAccount(account.email);
      if (account.peran === "DINAS" || isSuperAdmin) {
        return {
          akunId: account.id,
          nama: account.nama,
          email: account.email ?? null,
          peran: account.peran === "MASTER_ADMIN" ? "MASTER_ADMIN" : "DINAS",
          wilayahKabupaten: account.wilayahKabupaten ?? null,
          isSuperAdmin,
        };
      }
    }
  }
  const masterSession = await getSession(req, "MASTER_ADMIN");
  if (masterSession) {
    return {
      akunId: masterSession.akun.id,
      nama: masterSession.akun.nama,
      email: masterSession.akun.email ?? null,
      peran: "MASTER_ADMIN",
      wilayahKabupaten: masterSession.akun.wilayahKabupaten ?? null,
      isSuperAdmin: true,
    };
  }
  return null;
}

app.post("/api/auth/dinas/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 1024) {
    return res.status(400).json({ error: "Email dan kata sandi wajib diisi." });
  }
  const clientIp = loginIp(req);
  const memCheck = loginFailureLimiter.check(clientIp, email);
  if (!memCheck.allowed) {
    res.setHeader("Retry-After", String(memCheck.retryAfter));
    return res.status(429).json({ error: "Terlalu banyak percobaan login gagal. Coba lagi nanti." });
  }
  try {
    const result = await limitLogin<{
      token: string;
      nama: string;
      email: string | null;
      peran: "DINAS" | "MASTER_ADMIN";
      wilayahKabupaten: string | null;
      isSuperAdmin: boolean;
    }>(clientIp, email, async () => {
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail === SANDBOX_DINAS_EMAIL) {
        await ensureSandboxTenant(prisma);
        await ensureSandboxDinasAccount(prisma);
      }
      const account = await prisma.akun.findUnique({ where: { email: normalizedEmail } });
      const valid = await verifyPassword(password, account?.passwordHash || dummyHash);
      const isSuperAdmin = Boolean(account && (account.peran === "MASTER_ADMIN" || isDeveloperAccount(account.email)));
      if (!account || !valid || !account.aktif || (account.peran !== "DINAS" && !isSuperAdmin)) {
        return { kind: "failure" };
      }
      const token = await createLoginSession(account, new Date(Date.now() + sessionDurationMs));
      if (!token) return { kind: "failure" };
      return {
        kind: "success",
        value: {
          token,
          nama: account.nama,
          email: account.email ?? null,
          peran: account.peran === "MASTER_ADMIN" ? "MASTER_ADMIN" : "DINAS",
          wilayahKabupaten: account.wilayahKabupaten ?? null,
          isSuperAdmin,
        },
      };
    });
    if (result.kind === "limited") {
      res.setHeader("Retry-After", String(result.retryAfter));
      return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
    }
    if (result.kind === "failure") {
      loginFailureLimiter.recordFailure(clientIp, email);
      return res.status(401).json({ error: "Email atau kata sandi salah, atau akun tidak memiliki akses Dinas Pendidikan." });
    }
    loginFailureLimiter.recordSuccess(clientIp, email);
    res.cookie(dinasCookieName, result.value.token, { ...cookieOptions(), maxAge: sessionDurationMs });
    return res.json({
      nama: result.value.nama,
      email: result.value.email,
      peran: result.value.peran,
      wilayahKabupaten: result.value.wilayahKabupaten,
      isSuperAdmin: result.value.isSuperAdmin,
      token: createHash("sha256").update(result.value.token).digest("hex").slice(0, 32),
      user: {
        nama: result.value.nama,
        email: result.value.email,
        peran: result.value.peran,
        wilayahKabupaten: result.value.wilayahKabupaten,
        isSuperAdmin: result.value.isSuperAdmin,
      },
    });
  } catch (error) {
    console.error("Gagal memproses login Dinas Pendidikan:", error);
    return res.status(503).json({ error: "Layanan login Dinas Pendidikan tidak tersedia." });
  }
});

app.get("/api/auth/dinas/session", async (req, res) => {
  try {
    const ctx = await getDinasSession(req);
    if (!ctx) return res.status(401).json({ error: "Sesi Dinas Pendidikan tidak valid." });
    return res.json({
      nama: ctx.nama,
      email: ctx.email,
      peran: ctx.peran,
      wilayahKabupaten: ctx.wilayahKabupaten,
      isSuperAdmin: ctx.isSuperAdmin,
    });
  } catch (error) {
    console.error("Gagal memeriksa sesi Dinas Pendidikan:", error);
    return res.status(503).json({ error: "Layanan sesi Dinas Pendidikan tidak tersedia." });
  }
});

app.post("/api/auth/dinas/logout", async (req, res) => {
  try {
    const token = sessionToken(req.headers.cookie, dinasCookieName);
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await prisma.sesiAkun.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    res.clearCookie(dinasCookieName, cookieOptions());
    return res.status(204).end();
  } catch (error) {
    console.error("Gagal mengakhiri sesi Dinas Pendidikan:", error);
    return res.status(503).json({ error: "Gagal mengakhiri sesi Dinas." });
  }
});

app.post("/api/auth/sekolah/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 1024) return res.status(400).json({ error: "Email dan kata sandi wajib diisi." });
  const clientIp = loginIp(req);
  const memCheck = loginFailureLimiter.check(clientIp, email);
  if (!memCheck.allowed) {
    res.setHeader("Retry-After", String(memCheck.retryAfter));
    return res.status(429).json({ error: "Terlalu banyak percobaan login gagal. Coba lagi nanti." });
  }
  try {
    const result = await limitLogin<{
      token: string;
      nama: string;
      email: string | null;
      isDeveloper: boolean;
      sekolah: string;
      slug: string;
      plan: string;
      rawPlan: string | null;
      themeKey: string;
    }>(clientIp, email, async () => {
      const account = await prisma.akun.findUnique({ where: { email: email.trim().toLowerCase() } });
      const valid = await verifyPassword(password, account?.passwordHash || dummyHash);
      if (!account || !valid || !account.aktif || account.peran !== "ADMIN" || !account.sekolahId || (req.tenant?.kind === "school" && account.sekolahId !== req.tenant.id)) return { kind: "failure" };
      const [token, schoolInfo] = await Promise.all([
        createLoginSession(account, new Date(Date.now() + sessionDurationMs)),
        prisma.sekolah
          .findUnique({
            where: { id: account.sekolahId },
            select: { nama: true, slug: true, plan: true, themeKey: true },
          })
          .catch(() => null),
      ]);
      if (!token) return { kind: "failure" };
      const themeKey = await getGlobalTheme(prisma, schoolInfo?.themeKey);
      return {
        kind: "success",
        value: {
          token,
          nama: account.nama,
          email: account.email ?? null,
          isDeveloper: isDeveloperAccount(account.email),
          sekolah: schoolInfo?.nama ?? (req.tenant?.kind === "school" ? req.tenant.slug : "Sekolah"),
          slug: schoolInfo?.slug ?? (req.tenant?.kind === "school" ? req.tenant.slug : ""),
          plan: normalizeTenantPlan(schoolInfo?.plan),
          rawPlan: schoolInfo?.plan ?? null,
          themeKey,
        },
      };
    });
    if (result.kind === "limited") {
      res.setHeader("Retry-After", String(result.retryAfter));
      return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
    }
    if (result.kind === "failure") {
      loginFailureLimiter.recordFailure(clientIp, email);
      return res.status(401).json({ error: "Email atau kata sandi salah, atau akun tidak terdaftar pada instansi ini." });
    }
    loginFailureLimiter.recordSuccess(clientIp, email);
    res.cookie(schoolCookieName, result.value.token, { ...cookieOptions(), maxAge: sessionDurationMs });
    return res.json({
      nama: result.value.nama,
      email: result.value.email,
      isDeveloper: result.value.isDeveloper,
      sekolah: result.value.sekolah,
      slug: result.value.slug,
      plan: result.value.plan,
      rawPlan: result.value.rawPlan,
      themeKey: result.value.themeKey,
      token: createHash("sha256").update(result.value.token).digest("hex").slice(0, 32),
      user: {
        nama: result.value.nama,
        email: result.value.email,
        peran: "ADMIN",
        isDeveloper: result.value.isDeveloper,
      },
    });
  } catch (error) {
    console.error("Gagal memproses login sekolah:", error);
    return res.status(503).json({ error: "Layanan login sekolah tidak tersedia." });
  }
});

async function buildSchoolProfilePayload(req: express.Request) {
  const session = await getSession(req, "ADMIN");
  if (!session || !session.akun.sekolahId) return null;
  const school = await prisma.sekolah.findUnique({
    where: { id: session.akun.sekolahId },
    select: { nama: true, slug: true, plan: true, themeKey: true },
  });
  if (!school) return null;
  const themeKey = await getGlobalTheme(prisma, school.themeKey);
  return {
    nama: session.akun.nama,
    email: session.akun.email ?? null,
    isDeveloper: isDeveloperAccount(session.akun.email),
    sekolah: school.nama,
    slug: school.slug,
    plan: normalizeTenantPlan(school.plan),
    rawPlan: school.plan ?? null,
    themeKey,
  };
}

app.get("/api/auth/sekolah/session", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const profile = await buildSchoolProfilePayload(req);
    if (!profile) return res.status(401).json({ error: "Sesi tidak valid." });
    return res.json(profile);
  } catch (error) {
    console.error("Gagal memeriksa sesi sekolah:", error);
    return res.status(503).json({ error: "Layanan sesi tidak tersedia." });
  }
});

app.get("/api/sekolah/me", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const profile = await buildSchoolProfilePayload(req);
    if (!profile) return res.status(401).json({ error: "Sesi tidak valid." });
    return res.json(profile);
  } catch (error) {
    console.error("Gagal memuat profil admin sekolah:", error);
    return res.status(503).json({ error: "Layanan profil tidak tersedia." });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const adminSession = await getSession(req, "ADMIN");
    if (adminSession) {
      return res.json({
        authenticated: true,
        role: "ADMIN",
        nama: adminSession.akun.nama,
        email: adminSession.akun.email ?? null,
        isDeveloper: isDeveloperAccount(adminSession.akun.email),
      });
    }
    const lmsSession = await getLmsSession(req);
    if (lmsSession) {
      return res.json({
        authenticated: true,
        role: lmsSession.akun.peran,
        nama: lmsSession.akun.nama,
        email: lmsSession.akun.email ?? null,
        isDeveloper: isDeveloperAccount(lmsSession.akun.email),
      });
    }
    const masterSession = await getSession(req, "MASTER_ADMIN");
    if (masterSession) {
      return res.json({
        authenticated: true,
        role: "MASTER_ADMIN",
        nama: masterSession.akun.nama,
        email: masterSession.akun.email ?? null,
        isDeveloper: isDeveloperAccount(masterSession.akun.email),
      });
    }
    const dinasSession = await getDinasSession(req);
    if (dinasSession) {
      return res.json({
        authenticated: true,
        role: dinasSession.peran,
        nama: dinasSession.nama,
        email: dinasSession.email,
        wilayahKabupaten: dinasSession.wilayahKabupaten,
        isDeveloper: isDeveloperAccount(dinasSession.email),
      });
    }
    return res.status(401).json({ error: "Sesi tidak valid." });
  } catch (error) {
    console.error("Gagal memeriksa profil akun:", error);
    return res.status(503).json({ error: "Layanan profil tidak tersedia." });
  }
});

app.get("/api/sekolah/dev-sandbox/samples", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!session || !sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    if (!isDeveloperAccount(session.akun.email)) {
      return res.status(403).json({ error: "Akses ditolak." });
    }
    const [guru, siswaWithClass] = await Promise.all([
      prisma.guru.findFirst({
        where: { sekolahId, status: "Aktif" },
        orderBy: [{ nama: "asc" }, { id: "asc" }],
        select: { id: true, nama: true, email: true },
      }),
      prisma.siswa.findFirst({
        where: { sekolahId, status: "Aktif", kelasId: { not: null } },
        orderBy: [{ nama: "asc" }, { id: "asc" }],
        select: { id: true, nama: true, nisn: true, kelasId: true },
      }),
    ]);
    const siswa = siswaWithClass ?? await prisma.siswa.findFirst({
      where: { sekolahId, status: "Aktif" },
      orderBy: [{ nama: "asc" }, { id: "asc" }],
      select: { id: true, nama: true, nisn: true, kelasId: true },
    });
    return res.json({ guru, siswa });
  } catch (error) {
    console.error("Gagal memuat sampel sandbox:", error);
    return res.status(503).json({ error: "Sampel sandbox tidak tersedia." });
  }
});

app.post("/api/auth/sekolah/logout", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    if (session) await prisma.sesiAkun.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    res.clearCookie(schoolCookieName, cookieOptions());
    return res.status(204).end();
  } catch (error) {
    console.error("Gagal mengakhiri sesi sekolah:", error);
    return res.status(503).json({ error: "Gagal mengakhiri sesi." });
  }
});

app.post("/api/auth/sekolah/ganti-password", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const { currentPassword, password } = req.body || {};
    if (typeof currentPassword !== "string" || currentPassword.length > 1024 || typeof password !== "string" || !isValidPasswordLength(password)) {
      return res.status(400).json({ error: "Password saat ini wajib diisi. Password baru harus 6–1024 karakter." });
    }
    if (!await verifyPassword(currentPassword, session.akun.passwordHash)) {
      return res.status(400).json({ error: "Password saat ini salah." });
    }
    if (await verifyPassword(password, session.akun.passwordHash)) {
      return res.status(400).json({ error: "Password baru harus berbeda dari password saat ini." });
    }
    const passwordHash = await hashPassword(password);
    if (!await savePasswordChange(session.akun, passwordHash)) {
      return res.status(409).json({ error: "Akun telah berubah. Silakan masuk kembali." });
    }
    res.clearCookie(schoolCookieName, cookieOptions());
    return res.json({ message: "Password berhasil diganti. Silakan masuk kembali." });
  } catch (error) {
    console.error("Gagal mengganti password admin sekolah:", error);
    return res.status(503).json({ error: "Password belum dapat diganti." });
  }
});

app.post("/api/sekolah/:jenis/:id/akun", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const jenis = req.params.jenis;
    if (jenis !== "siswa" && jenis !== "guru") return res.status(404).json({ error: "Jenis akun tidak ditemukan." });
    const parsedPassword = parseRequestedAccountPassword(req.body?.password, DEFAULT_ACCOUNT_PASSWORD);
    if (!parsedPassword.ok) return res.status(400).json({ error: parsedPassword.error });
    const temporaryPassword = parsedPassword.password;
    const passwordHash = await hashPassword(temporaryPassword);
    const createdInfo = await prisma.$transaction(async (tx) => {
      if (jenis === "siswa") {
        await tx.$queryRaw`SELECT "id" FROM "Siswa" WHERE "id" = ${req.params.id} AND "sekolahId" = ${sekolahId} FOR UPDATE`;
        const siswa = await tx.siswa.findFirst({
          where: { id: req.params.id, sekolahId, status: "Aktif" },
          select: { id: true, nama: true, nisn: true, akun: { select: { id: true, aktif: true, email: true } } },
        });
        if (!siswa) throw new Error("INVALID_ENTITY");
        if (siswa.akun?.aktif) throw new Error("ACCOUNT_EXISTS");
        const { username, storeInAccountEmail } = resolveStudentLoginUsername(siswa, siswa.akun?.email);
        if (siswa.akun) {
          await tx.akun.update({
            where: { id: siswa.akun.id },
            data: {
              nama: siswa.nama,
              email: storeInAccountEmail,
              aktif: true,
              passwordHash,
              wajibGantiPassword: false,
            },
          });
        } else {
          await tx.akun.create({
            data: {
              nama: siswa.nama,
              email: storeInAccountEmail,
              sekolahId,
              siswaId: siswa.id,
              peran: "SISWA",
              passwordHash,
              wajibGantiPassword: false,
            },
          });
        }
        return { nama: siswa.nama, username };
      } else {
        await tx.$queryRaw`SELECT "id" FROM "Guru" WHERE "id" = ${req.params.id} AND "sekolahId" = ${sekolahId} FOR UPDATE`;
        const guru = await tx.guru.findFirst({ where: { id: req.params.id, sekolahId, status: "Aktif" }, select: { id: true, nama: true, email: true } });
        if (!guru || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guru.email.trim()) || guru.email.length > 254) throw new Error("INVALID_ENTITY");
        const email = guru.email.trim().toLowerCase();
        await tx.akun.create({ data: { nama: guru.nama, email, sekolahId, guruId: guru.id, peran: "GURU", passwordHash, wajibGantiPassword: true } });
        return { nama: guru.nama, username: email };
      }
    });
    return res.status(201).json({
      temporaryPassword,
      username: createdInfo.username,
      nama: createdInfo.nama,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ENTITY") return res.status(400).json({ error: "Data aktif tidak ditemukan atau identitas/email tidak valid." });
    if (error instanceof Error && error.message === "ACCOUNT_EXISTS") return res.status(409).json({ error: "Akun siswa sudah terdaftar. Gunakan tombol Reset Password." });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "Akun atau username sudah terdaftar." });
    console.error("Gagal membuat akun LMS:", error);
    return res.status(503).json({ error: "Akun belum dapat dibuat." });
  }
});

app.post("/api/sekolah/:jenis/:id/reset-password", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const jenis = req.params.jenis;
    if (jenis !== "siswa" && jenis !== "guru") return res.status(404).json({ error: "Jenis akun tidak ditemukan." });
    const parsedPassword = parseRequestedAccountPassword(req.body?.password, DEFAULT_ACCOUNT_PASSWORD);
    if (!parsedPassword.ok) return res.status(400).json({ error: parsedPassword.error });
    const temporaryPassword = parsedPassword.password;
    const passwordHash = await hashPassword(temporaryPassword);
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.akun.findFirst({
        where: jenis === "siswa"
          ? { sekolahId, peran: "SISWA", aktif: true, siswaId: req.params.id, guruId: null, siswa: { sekolahId, status: "Aktif" } }
          : { sekolahId, peran: "GURU", aktif: true, guruId: req.params.id, siswaId: null, guru: { sekolahId, status: "Aktif" } },
        select: {
          id: true,
          nama: true,
          email: true,
          siswa: { select: { nisn: true, nama: true } },
          guru: { select: { email: true, nama: true } },
        },
      });
      if (!account) return null;
      const updated = await tx.akun.updateMany({
        where: { id: account.id, sekolahId, aktif: true },
        data: { passwordHash, wajibGantiPassword: jenis === "guru" },
      });
      if (updated.count !== 1) return null;
      await tx.sesiAkun.updateMany({ where: { akunId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
      const username =
        jenis === "siswa"
          ? (account.siswa?.nisn?.trim() || account.email || "")
          : (account.guru?.email || account.email || "");
      return { nama: account.siswa?.nama ?? account.guru?.nama ?? account.nama, username };
    });
    if (!result) return res.status(404).json({ error: "Akun aktif tidak ditemukan di sekolah ini." });
    return res.json({ temporaryPassword, username: result.username, nama: result.nama });
  } catch (error) {
    console.error("Gagal mereset password akun sekolah:", error);
    return res.status(503).json({ error: "Password belum dapat direset." });
  }
});

async function getLmsSession(req: express.Request) {
  const token = sessionToken(req.headers.cookie, lmsCookieName);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.sesiAkun.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    include: { akun: { include: { siswa: { select: { sekolahId: true, status: true, kelasId: true } }, guru: { select: { sekolahId: true, status: true } }, sekolah: { select: { status: true, expiresAt: true } } } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.akun.aktif || !session.akun.sekolahId) return null;
  if (!tenantAccessible(session.akun.sekolah)) return null;
  if (req.tenant?.kind === "school" && session.akun.sekolahId !== req.tenant.id) return null;
  const account = session.akun;
  if (account.peran === "SISWA" && account.siswa?.sekolahId === account.sekolahId && account.siswa.status === "Aktif" && !account.guruId) return session;
  if (account.peran === "GURU" && account.guru?.sekolahId === account.sekolahId && account.guru.status === "Aktif" && !account.siswaId) return session;
  return null;
}

app.get("/api/tenant/theme", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.tenant?.kind === "main") return res.status(404).json({ error: "Tema sekolah tersedia melalui subdomain sekolah." });
  if (req.query.scope !== "sekolah" && req.query.scope !== "lms") return res.status(400).json({ error: "Jenis sesi tidak valid." });
  try {
    const session = req.query.scope === "sekolah" ? await getSession(req, "ADMIN") : await getLmsSession(req);
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const school = await prisma.sekolah.findUnique({ where: { id: sekolahId }, select: { themeKey: true } });
    if (!school) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
    const themeKey = await getGlobalTheme(prisma, school.themeKey);
    return res.json({ themeKey });
  } catch (error) {
    console.error("Gagal memuat tema sekolah:", error);
    return res.status(503).json({ error: "Tema sekolah belum dapat dimuat." });
  }
});

app.post("/api/auth/lms/login", async (req, res) => {
  const { identitas, password, peran } = req.body || {};
  if (typeof identitas !== "string" || identitas.length > 254 || typeof password !== "string" || password.length > 1024 || (peran !== "SISWA" && peran !== "GURU")) return res.status(400).json({ error: "Periksa identitas, peran, dan kata sandi." });
  const clientIp = loginIp(req);
  const memCheck = loginFailureLimiter.check(clientIp, identitas);
  if (!memCheck.allowed) {
    res.setHeader("Retry-After", String(memCheck.retryAfter));
    return res.status(429).json({ error: "Terlalu banyak percobaan login gagal. Coba lagi nanti." });
  }
  try {
    const result = await limitLogin<{
      token: string;
      nama: string;
      peran: "SISWA" | "GURU";
      wajibGantiPassword: boolean;
      sekolahId: string;
      siswaId: string | null;
      kelasId: string | null;
    }>(clientIp, identitas, async () => {
      const identity = identitas.trim().toLowerCase();
      const account = peran === "SISWA"
        ? await prisma.akun.findFirst({
            where: {
              peran: "SISWA",
              ...(req.tenant?.kind === "school" ? { sekolahId: req.tenant.id } : {}),
              OR: [{ siswa: { nisn: identity } }, { email: identity }],
            },
            include: {
              siswa: { select: { sekolahId: true, status: true, kelasId: true } },
              guru: { select: { sekolahId: true, status: true } },
            },
          })
        : await prisma.akun.findUnique({
            where: { email: identity },
            include: {
              siswa: { select: { sekolahId: true, status: true, kelasId: true } },
              guru: { select: { sekolahId: true, status: true } },
            },
          });
      const valid = await verifyPassword(password, account?.passwordHash || dummyHash);
      const related = account?.peran === "SISWA" ? account.siswa : account?.peran === "GURU" ? account.guru : null;
      if (!account || !valid || account.peran !== peran || !account.aktif || !account.sekolahId || (req.tenant?.kind === "school" && account.sekolahId !== req.tenant.id) || !related || related.sekolahId !== account.sekolahId || related.status !== "Aktif" || (peran === "SISWA" ? !!account.guruId : !!account.siswaId)) return { kind: "failure" };
      const token = await createLoginSession(account, new Date(Date.now() + sessionDurationMs));
      if (!token) return { kind: "failure" };
      return {
        kind: "success",
        value: {
          token,
          nama: account.nama,
          peran: account.peran as "SISWA" | "GURU",
          wajibGantiPassword: account.wajibGantiPassword,
          sekolahId: account.sekolahId,
          siswaId: account.siswaId ?? null,
          kelasId: account.siswa?.kelasId ?? null,
        },
      };
    });
    if (result.kind === "limited") {
      res.setHeader("Retry-After", String(result.retryAfter));
      return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
    }
    if (result.kind === "failure") {
      loginFailureLimiter.recordFailure(clientIp, identitas);
      return res.status(401).json({ error: "Identitas atau kata sandi salah, atau akun tidak terdaftar pada instansi ini." });
    }
    loginFailureLimiter.recordSuccess(clientIp, identitas);

    let presensiHariIni = null;
    if (result.value.peran === "SISWA" && result.value.siswaId) {
      presensiHariIni = await recordStudentLoginAttendance(prisma, {
        sekolahId: result.value.sekolahId,
        siswaId: result.value.siswaId,
        kelasId: result.value.kelasId,
      }).catch((err) => {
        console.error("Gagal mencatat presensi otomatis saat login siswa:", err);
        return null;
      });
    }

    res.cookie(lmsCookieName, result.value.token, { ...cookieOptions(), maxAge: sessionDurationMs });
    return res.json({
      nama: result.value.nama,
      peran: result.value.peran,
      wajibGantiPassword: result.value.wajibGantiPassword,
      presensiHariIni,
      token: createHash("sha256").update(result.value.token).digest("hex").slice(0, 32),
      user: {
        nama: result.value.nama,
        peran: result.value.peran,
        wajibGantiPassword: result.value.wajibGantiPassword,
      },
    });
  } catch (error) {
    console.error("Gagal login LMS:", error);
    return res.status(503).json({ error: "Layanan login LMS tidak tersedia." });
  }
});

app.get("/api/auth/lms/session", async (req, res) => {
  try {
    const session = await getLmsSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const [school, guru, siswaProfile, presensiHariIni] = await Promise.all([
      session.akun.sekolahId
        ? prisma.sekolah.findUnique({ where: { id: session.akun.sekolahId }, select: { nama: true, slug: true, plan: true } })
        : null,
      session.akun.peran === "GURU" && session.akun.guruId && session.akun.sekolahId
        ? prisma.guru.findFirst({
            where: { id: session.akun.guruId, sekolahId: session.akun.sekolahId },
            select: { id: true, nama: true, email: true, nuptk: true, telepon: true, mapelUtama: true },
          })
        : null,
      session.akun.peran === "SISWA" && session.akun.siswaId && session.akun.sekolahId
        ? prisma.siswa.findFirst({
            where: { id: session.akun.siswaId, sekolahId: session.akun.sekolahId },
            select: { id: true, nama: true, nisn: true, kelasId: true },
          })
        : null,
      session.akun.peran === "SISWA" && session.akun.siswaId && session.akun.sekolahId
        ? recordStudentLoginAttendance(prisma, {
            sekolahId: session.akun.sekolahId,
            siswaId: session.akun.siswaId,
            kelasId: session.akun.siswa?.kelasId ?? null,
          }).catch((err) => {
            console.error("Gagal mencatat/memuat presensi otomatis siswa:", err);
            return null;
          })
        : Promise.resolve(null),
    ]);
    const resolvedKelasId = siswaProfile?.kelasId ?? session.akun.siswa?.kelasId ?? null;
    const siswaKelas =
      resolvedKelasId && session.akun.sekolahId
        ? await prisma.kelas.findFirst({
            where: { id: resolvedKelasId, sekolahId: session.akun.sekolahId },
            select: { id: true, nama: true },
          })
        : null;
    return res.json({
      nama: guru?.nama ?? siswaProfile?.nama ?? session.akun.nama,
      peran: session.akun.peran,
      wajibGantiPassword: session.akun.wajibGantiPassword,
      sekolah: school?.nama ?? "",
      slug: school?.slug ?? "",
      plan: normalizeTenantPlan(school?.plan),
      guruId: session.akun.guruId ?? null,
      siswaId: siswaProfile?.id ?? session.akun.siswaId ?? null,
      nisn: siswaProfile?.nisn ?? null,
      kelasId: resolvedKelasId,
      kelasNama: siswaKelas?.nama ?? null,
      email: guru?.email ?? session.akun.email,
      nuptk: guru?.nuptk ?? null,
      telepon: guru?.telepon ?? null,
      mapelUtama: guru?.mapelUtama ?? null,
      presensiHariIni,
    });
  } catch (error) {
    console.error("Gagal memeriksa sesi LMS:", error);
    return res.status(503).json({ error: "Sesi LMS tidak tersedia." });
  }
});

app.post("/api/auth/lms/ganti-password", async (req, res) => {
  try {
    const session = await getLmsSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const forcedChange = session.akun.wajibGantiPassword;
    if (!forcedChange && session.akun.peran !== "GURU" && session.akun.peran !== "SISWA") {
      return res.status(403).json({ error: "Fitur ganti password tidak tersedia untuk peran ini." });
    }
    const { currentPassword, password } = req.body || {};
    if (typeof password !== "string" || !isValidPasswordLength(password)) {
      return res.status(400).json({ error: "Password baru harus 6–1024 karakter." });
    }
    if (!forcedChange) {
      if (typeof currentPassword !== "string" || currentPassword.length > 1024) {
        return res.status(400).json({ error: "Password saat ini wajib diisi." });
      }
      if (!await verifyPassword(currentPassword, session.akun.passwordHash)) {
        return res.status(400).json({ error: "Password saat ini salah." });
      }
    }
    if (await verifyPassword(password, session.akun.passwordHash)) {
      return res.status(400).json({ error: "Password baru harus berbeda dari password saat ini." });
    }
    const passwordHash = await hashPassword(password);
    const changed = await savePasswordChange(session.akun, passwordHash);
    if (!changed) return res.status(409).json({ error: "Akun telah berubah. Silakan masuk kembali." });
    res.clearCookie(lmsCookieName, cookieOptions());
    return res.json({ message: "Password berhasil diganti. Silakan masuk kembali." });
  } catch (error) {
    console.error("Gagal mengganti password LMS:", error);
    return res.status(503).json({ error: "Password belum dapat diganti." });
  }
});

app.post("/api/auth/lms/logout", async (req, res) => {
  try {
    const session = await getLmsSession(req);
    if (session) await prisma.sesiAkun.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    res.clearCookie(lmsCookieName, cookieOptions());
    return res.status(204).end();
  } catch (error) {
    console.error("Gagal keluar LMS:", error);
    return res.status(503).json({ error: "Gagal keluar." });
  }
});

app.get("/api/lms/beranda", async (req, res) => {
  try {
    const session = await getLmsSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    if (session.akun.wajibGantiPassword) return res.status(403).json({ error: "Ganti password awal sebelum mengakses LMS." });
    return res.json({ nama: session.akun.nama, peran: session.akun.peran });
  } catch (error) {
    console.error("Gagal memuat beranda LMS:", error);
    return res.status(503).json({ error: "Beranda LMS tidak tersedia." });
  }
});



async function getDevSandboxLmsContext(req: express.Request): Promise<{
  sekolahId: string;
  peran: "GURU" | "SISWA";
  siswaId: string | null;
  kelasId: string | null;
  guruId: string | null;
  wajibGantiPassword: boolean;
  nama: string;
} | null> {
  const headerRole = req.get("x-dev-sandbox-role");
  if (headerRole !== "GURU" && headerRole !== "SISWA") return null;
  const adminSession = await getSession(req, "ADMIN");
  if (!adminSession?.akun.sekolahId || !isDeveloperAccount(adminSession.akun.email)) return null;
  const sekolahId = adminSession.akun.sekolahId;
  if (headerRole === "GURU") {
    const guru = await prisma.guru.findFirst({
      where: { sekolahId, status: "Aktif" },
      orderBy: [{ nama: "asc" }, { id: "asc" }],
      select: { id: true, nama: true },
    });
    if (!guru) return null;
    return { sekolahId, peran: "GURU", siswaId: null, kelasId: null, guruId: guru.id, wajibGantiPassword: false, nama: guru.nama };
  }
  const siswa = (await prisma.siswa.findFirst({
    where: { sekolahId, status: "Aktif", kelasId: { not: null } },
    orderBy: [{ nama: "asc" }, { id: "asc" }],
    select: { id: true, nama: true, kelasId: true },
  })) ?? (await prisma.siswa.findFirst({
    where: { sekolahId, status: "Aktif" },
    orderBy: [{ nama: "asc" }, { id: "asc" }],
    select: { id: true, nama: true, kelasId: true },
  }));
  if (!siswa) return null;
  return { sekolahId, peran: "SISWA", siswaId: siswa.id, kelasId: siswa.kelasId ?? null, guruId: null, wajibGantiPassword: false, nama: siswa.nama };
}

app.use("/api/lms/ruang-kbm", classroomRoutes(async (req) => {
  const session = await getLmsSession(req);
  const account = session?.akun;
  if (account?.sekolahId && !account.wajibGantiPassword && (account.peran === "SISWA" || account.peran === "GURU")) {
    return { sekolahId: account.sekolahId, peran: account.peran, siswaId: account.siswaId, kelasId: account.siswa?.kelasId ?? null, guruId: account.guruId ?? null };
  }
  const sandbox = await getDevSandboxLmsContext(req);
  if (!sandbox) return null;
  return { sekolahId: sandbox.sekolahId, peran: sandbox.peran, siswaId: sandbox.siswaId, kelasId: sandbox.kelasId, guruId: sandbox.guruId };
}, jakartaDate));
app.use("/api/sekolah/ruang-kbm", classroomRoutes(async (req) => {
  const session = await getSession(req, "ADMIN");
  if (!session?.akun.sekolahId) return null;
  return { sekolahId: session.akun.sekolahId, peran: "ADMIN", siswaId: null, kelasId: null };
}, jakartaDate));
app.use("/api/sekolah/pembelajaran", learningRoutes(async (req) => {
  const session = await getSession(req, "ADMIN");
  if (!session?.akun.sekolahId) return null;
  return { sekolahId: session.akun.sekolahId, peran: "ADMIN", siswaId: null, kelasId: null, guruId: null, wajibGantiPassword: false };
}, jakartaDate));

app.use("/api/lms/pembelajaran", learningRoutes(async (req) => {
  const session = await getLmsSession(req);
  const account = session?.akun;
  if (account?.sekolahId && (account.peran === "SISWA" || account.peran === "GURU")) {
    return { sekolahId: account.sekolahId, peran: account.peran, siswaId: account.siswaId, kelasId: account.siswa?.kelasId ?? null, guruId: account.guruId, wajibGantiPassword: account.wajibGantiPassword };
  }
  const sandbox = await getDevSandboxLmsContext(req);
  if (!sandbox) return null;
  return { sekolahId: sandbox.sekolahId, peran: sandbox.peran, siswaId: sandbox.siswaId, kelasId: sandbox.kelasId, guruId: sandbox.guruId, wajibGantiPassword: false };
}, jakartaDate));

app.use("/api/lms/ujian", express.json({ limit: "256kb" }), examRoutes(async (req) => {
  const session = await getLmsSession(req);
  const account = session?.akun;
  if (account?.sekolahId && !account.wajibGantiPassword && (account.peran === "SISWA" || account.peran === "GURU")) {
    return { sekolahId: account.sekolahId, peran: account.peran, siswaId: account.siswaId ?? null, kelasId: account.siswa?.kelasId ?? null, guruId: account.guruId ?? null };
  }
  const sandbox = await getDevSandboxLmsContext(req);
  if (!sandbox) return null;
  return { sekolahId: sandbox.sekolahId, peran: sandbox.peran, siswaId: sandbox.siswaId, kelasId: sandbox.kelasId, guruId: sandbox.guruId };
}, jakartaDate));

app.get("/api/lms/siswa/nilai", async (req, res) => {
  try {
    const session = await getLmsSession(req);
    const sandbox = !session ? await getDevSandboxLmsContext(req) : null;
    if (!session && !sandbox) return res.status(401).json({ error: "Sesi tidak valid." });
    if (session?.akun.wajibGantiPassword) return res.status(403).json({ error: "Ganti password awal sebelum mengakses LMS." });
    const peran = session ? session.akun.peran : sandbox!.peran;
    const sekolahId = session ? session.akun.sekolahId : sandbox?.sekolahId ?? null;
    const siswaId = session ? session.akun.siswaId : sandbox?.siswaId ?? null;
    if (peran !== "SISWA" || !sekolahId || !siswaId) {
      return res.status(403).json({ error: "Ringkasan nilai hanya tersedia untuk akun siswa." });
    }

    const [siswa, sekolah, tugasRows, ujianRows, nilaiRows, mapelRows, taRows, modulSkkRows, catatanRows] = await Promise.all([
      prisma.siswa.findFirst({
        where: { id: siswaId, sekolahId },
        select: { id: true, nama: true, nisn: true, kelasId: true, jenjang: true },
      }),
      prisma.sekolah.findUnique({
        where: { id: sekolahId },
        select: { nama: true, npsn: true, alamatSekolah: true, namaKepalaSekolah: true },
      }),
      prisma.pengumpulanTugas.findMany({
        where: { siswaId, tugas: { sekolahId } },
        select: {
          id: true,
          dikumpulkanPada: true,
          nilai: true,
          catatanGuru: true,
          tugas: {
            select: {
              id: true,
              judul: true,
              batasWaktu: true,
              mapel: { select: { nama: true } },
              tahunAjaran: { select: { nama: true, semester: true } },
            },
          },
        },
        orderBy: { dikumpulkanPada: "desc" },
        take: 150,
      }),
      prisma.percobaanUjian.findMany({
        where: { siswaId, ujian: { sekolahId } },
        select: {
          id: true,
          status: true,
          dimulaiPada: true,
          dikumpulkanPada: true,
          nilai: true,
          nilaiOverride: true,
          catatanGuru: true,
          ujian: {
            select: {
              id: true,
              kode: true,
              judul: true,
              kkm: true,
              tampilNilai: true,
              mapel: { select: { nama: true } },
              tahunAjaran: { select: { nama: true, semester: true } },
            },
          },
        },
        orderBy: { dimulaiPada: "desc" },
        take: 150,
      }),
      prisma.nilai.findMany({
        where: { sekolahId, siswaId },
        orderBy: { tanggalSimulasi: "desc" },
        take: 100,
      }),
      prisma.mapel.findMany({
        where: { sekolahId },
        select: { id: true, nama: true },
        take: 300,
      }),
      prisma.tahunAjaran.findMany({
        where: { sekolahId },
        select: { id: true, nama: true, semester: true },
        take: 50,
      }),
      prisma.modulKesetaraan.findMany({
        where: { sekolahId },
        select: { id: true, jenjang: true, tingkatan: true, kelompok: true, kodeModul: true, judulModul: true, skkTotal: true },
        orderBy: [{ jenjang: "asc" }, { kodeModul: "asc" }],
        take: 120,
      }),
      prisma.catatanRaport.findMany({
        where: { sekolahId, siswaId },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

    if (!siswa) return res.status(404).json({ error: "Profil siswa tidak ditemukan." });

    const mapelMap = new Map(mapelRows.map((m) => [m.id, m.nama]));
    const taMap = new Map(taRows.map((t) => [t.id, `${t.nama} · ${t.semester}`]));

    const [siswaKelas, webSettings] = await Promise.all([
      siswa.kelasId
        ? prisma.kelas.findFirst({
            where: { id: siswa.kelasId, sekolahId },
            select: { id: true, nama: true },
          })
        : Promise.resolve(null),
      prisma.websiteSettings.findUnique({
        where: { school_id: sekolahId },
        select: { logo_url: true },
      }).catch(() => null),
    ]);
    const kelasNama = siswaKelas?.nama ?? null;
    const jenjangSource = `${kelasNama ?? ""} ${siswa.jenjang ?? ""}`.toLowerCase();
    const detectedJenjang =
      /\bpaket[\s_-]*a\b|\bkelas\s*[1-6]\b|\bsd\b/.test(jenjangSource)
        ? "PAKET_A"
        : /\bpaket[\s_-]*b\b|\bkelas\s*[7-9]\b|\bsmp\b/.test(jenjangSource)
          ? "PAKET_B"
          : /\bpaket[\s_-]*c\b|\bkelas\s*1[0-2]\b|\bsma\b/.test(jenjangSource)
            ? "PAKET_C"
            : null;

    const matchingSkk = detectedJenjang
      ? modulSkkRows.filter((m) => m.jenjang === detectedJenjang)
      : [];

    const raport = nilaiRows.map((row) => ({
      id: row.id,
      mapel: mapelMap.get(row.mapelId) ?? "Mata Pelajaran",
      tahunAjaran: row.tahunAjaranId ? (taMap.get(row.tahunAjaranId) ?? "Semester Aktif") : "Semester Aktif",
      nilaiMandiri: row.nilaiMandiri,
      nilaiSimulasi: row.nilaiSimulasi,
      nilaiAkhir: row.nilaiAkhir,
      catatanKompetensi: row.catatanKompetensi,
      predikat: row.nilaiAkhir >= 90 ? "A" : row.nilaiAkhir >= 80 ? "B" : row.nilaiAkhir >= 70 ? "C" : "D",
    }));

    const tugas = tugasRows.map((row) => ({
      id: row.id,
      judul: row.tugas.judul,
      mapel: row.tugas.mapel.nama,
      tahunAjaran: `${row.tugas.tahunAjaran.nama} · ${row.tugas.tahunAjaran.semester}`,
      dikumpulkanPada: row.dikumpulkanPada,
      nilai: row.nilai,
      catatanGuru: row.catatanGuru,
    }));

    const ujian = ujianRows.map((row) => {
      const nilaiFinal = row.ujian.tampilNilai || row.nilaiOverride !== null
        ? (row.nilaiOverride ?? row.nilai)
        : null;
      return {
        id: row.id,
        kode: row.ujian.kode,
        judul: row.ujian.judul,
        mapel: row.ujian.mapel.nama,
        tahunAjaran: `${row.ujian.tahunAjaran.nama} · ${row.ujian.tahunAjaran.semester}`,
        kkm: row.ujian.kkm,
        status: row.dikumpulkanPada ? "SELESAI" : row.status,
        dikumpulkanPada: row.dikumpulkanPada,
        nilai: nilaiFinal,
        catatanGuru: row.catatanGuru,
      };
    });

    const tugasScores = tugas.map((t) => t.nilai).filter((v): v is number => typeof v === "number");
    const ujianScores = ujian.map((u) => u.nilai).filter((v): v is number => typeof v === "number");
    const raportScores = raport.map((r) => r.nilaiAkhir);
    const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);

    return res.json({
      siswa: {
        id: siswa.id,
        nama: siswa.nama,
        nisn: siswa.nisn,
        kelasId: siswa.kelasId,
        kelasNama,
        jenjang: detectedJenjang,
      },
      sekolah: sekolah
        ? {
            nama: sekolah.nama,
            npsn: sekolah.npsn,
            alamat: sekolah.alamatSekolah,
            kepalaSekolah: sekolah.namaKepalaSekolah,
            logoUrl: webSettings?.logo_url ?? null,
          }
        : null,
      tugas,
      ujian,
      raport,
      modulSkk: matchingSkk,
      catatanRaport: catatanRows[0] ?? null,
      summary: {
        rataTugas: avg(tugasScores),
        rataUjian: avg(ujianScores),
        rataRaport: avg(raportScores),
        totalSkk: matchingSkk.reduce((sum, item) => sum + item.skkTotal, 0),
        totalTugasDinilai: tugasScores.length,
        totalUjianSelesai: ujian.filter((u) => u.dikumpulkanPada).length,
      },
    });
  } catch (error) {
    console.error("Gagal memuat nilai siswa:", error);
    return res.status(503).json({ error: "Rekap nilai dan transkrip sementara belum tersedia." });
  }
});

app.get("/api/lms/jadwal", async (req, res) => {
  try {
    const session = await getLmsSession(req);
    const sandbox = !session ? await getDevSandboxLmsContext(req) : null;
    if (!session && !sandbox) return res.status(401).json({ error: "Sesi tidak valid." });
    if (session?.akun.wajibGantiPassword) return res.status(403).json({ error: "Ganti password awal sebelum mengakses LMS." });
    const pageValue = req.query.page;
    if (pageValue !== undefined && (typeof pageValue !== "string" || !/^[1-9]\d{0,5}$/.test(pageValue))) return res.status(400).json({ error: "Nomor halaman tidak valid." });
    const page = pageValue === undefined ? 1 : Number(pageValue);
    const sekolahId = session ? session.akun.sekolahId : sandbox?.sekolahId ?? null;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const peran = session ? session.akun.peran : sandbox!.peran;
    const kelasId = session ? (session.akun.peran === "SISWA" ? session.akun.siswa?.kelasId : null) : sandbox?.kelasId ?? null;
    const guruId = session ? session.akun.guruId : sandbox?.guruId ?? null;
    if (peran === "SISWA" && !kelasId) return res.json({ rows: [], page, hasNext: false, belumDitempatkan: true });
    const scope = peran === "SISWA" && kelasId ? { kelasId } : peran === "GURU" && guruId ? { guruId } : null;
    if (!scope) return res.status(401).json({ error: "Sesi tidak valid." });
    const today = jakartaDate();
    const jadwal = await prisma.jadwalPelajaran.findMany({
      where: {
        sekolahId,
        ...scope,
        kelas: { sekolahId },
        guru: { sekolahId },
        mapel: { sekolahId },
        tahunAjaran: { sekolahId, mulai: { lte: today }, selesai: { gte: today } },
      },
      select: { id: true, hari: true, jamMulai: true, jamSelesai: true, ruangan: true, kelas: { select: { nama: true } }, guru: { select: { nama: true } }, mapel: { select: { nama: true } }, tahunAjaran: { select: { nama: true, semester: true } } },
      orderBy: [{ hari: "asc" }, { jamMulai: "asc" }, { id: "asc" }],
      skip: (page - 1) * 25, take: 26,
    });
    return res.json({ rows: jadwal.slice(0, 25), page, hasNext: jadwal.length > 25, belumDitempatkan: false });
  } catch (error) {
    console.error("Gagal memuat jadwal LMS:", error);
    return res.status(503).json({ error: "Jadwal belum dapat dimuat." });
  }
});

async function resolveTeacherManagedClasses(sekolahId: string, guruId: string) {
  const [allClasses, schedules] = await Promise.all([
    prisma.kelas.findMany({
      where: { sekolahId },
      select: { id: true, nama: true, waliGuruId: true },
      orderBy: { nama: "asc" },
      take: 300,
    }),
    prisma.jadwalPelajaran.findMany({
      where: { sekolahId, guruId },
      select: { kelasId: true },
      take: 1000,
    }),
  ]);
  const assignedSet = new Set<string>();
  for (const k of allClasses) {
    if (k.waliGuruId === guruId) assignedSet.add(k.id);
  }
  for (const j of schedules) {
    assignedSet.add(j.kelasId);
  }
  // If teacher has specific wali/jadwal classes, scope strictly to them; otherwise allow school classes
  const managedClasses = assignedSet.size > 0
    ? allClasses.filter((k) => assignedSet.has(k.id))
    : allClasses;
  return {
    managedClasses: managedClasses.map((k) => ({ id: k.id, nama: k.nama, isWali: k.waliGuruId === guruId })),
    managedIds: managedClasses.map((k) => k.id),
  };
}

app.get("/api/lms/guru/siswa", async (req, res) => {
  try {
    const ctx = await resolveTeacherPortalContext(req);
    if (!ctx) return res.status(401).json({ error: "Sesi guru tidak valid." });
    const { sekolahId, guruId } = ctx;
    const { managedClasses, managedIds } = await resolveTeacherManagedClasses(sekolahId, guruId);
    const kelasParam = typeof req.query.kelasId === "string" ? req.query.kelasId.trim() : "";
    const qParam = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

    if (!managedIds.length) {
      return res.json({ kelas: [], siswa: [] });
    }
    const targetKelasIds = kelasParam && managedIds.includes(kelasParam) ? [kelasParam] : managedIds;
    const escapedTerm = qParam ? qParam.replace(/[\\%_]/g, "\\$&") : "";
    const students = await prisma.siswa.findMany({
      where: {
        sekolahId,
        status: "Aktif",
        kelasId: { in: targetKelasIds },
        ...(escapedTerm
          ? {
              OR: [
                { nama: { contains: escapedTerm, mode: "insensitive" } },
                { nisn: { contains: escapedTerm, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        nama: true,
        nisn: true,
        kelasId: true,
        status: true,
        akun: { select: { id: true, aktif: true, email: true } },
      },
      orderBy: [{ nama: "asc" }, { id: "asc" }],
      take: 300,
    });
    const kelasNameById = new Map(managedClasses.map((k) => [k.id, k.nama]));
    return res.json({
      kelas: managedClasses,
      siswa: students.map((s) => ({
        id: s.id,
        nama: s.nama,
        nisn: s.nisn,
        kelasId: s.kelasId,
        kelasNama: s.kelasId ? kelasNameById.get(s.kelasId) ?? "" : "",
        status: s.status,
        punyaAkun: Boolean(s.akun?.aktif),
        username: s.nisn.trim() || s.akun?.email || "",
      })),
    });
  } catch (error) {
    console.error("Gagal memuat daftar siswa guru:", error);
    return res.status(503).json({ error: "Data siswa belum dapat dimuat." });
  }
});

app.post("/api/lms/guru/siswa/:id/akun", async (req, res) => {
  try {
    const ctx = await resolveTeacherPortalContext(req);
    if (!ctx) return res.status(401).json({ error: "Sesi guru tidak valid." });
    const { sekolahId, guruId } = ctx;
    const parsedPassword = parseRequestedAccountPassword(req.body?.password, DEFAULT_STUDENT_PASSWORD);
    if (!parsedPassword.ok) return res.status(400).json({ error: parsedPassword.error });
    const temporaryPassword = parsedPassword.password;
    const passwordHash = await hashPassword(temporaryPassword);
    const { managedIds } = await resolveTeacherManagedClasses(sekolahId, guruId);
    if (!managedIds.length) {
      return res.status(403).json({ error: "Anda belum memiliki kelas yang diampu." });
    }

    const createdInfo = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Siswa" WHERE "id" = ${req.params.id} AND "sekolahId" = ${sekolahId} FOR UPDATE`;
      const siswa = await tx.siswa.findFirst({
        where: { id: req.params.id, sekolahId, status: "Aktif", kelasId: { in: managedIds } },
        select: { id: true, nama: true, nisn: true, akun: { select: { id: true, aktif: true, email: true } } },
      });
      if (!siswa) throw new Error("NOT_FOUND");
      if (siswa.akun?.aktif) throw new Error("ACCOUNT_EXISTS");
      const { username, storeInAccountEmail } = resolveStudentLoginUsername(siswa, siswa.akun?.email);
      if (siswa.akun) {
        await tx.akun.update({
          where: { id: siswa.akun.id },
          data: {
            nama: siswa.nama,
            email: storeInAccountEmail,
            aktif: true,
            passwordHash,
            wajibGantiPassword: false,
          },
        });
      } else {
        await tx.akun.create({
          data: {
            nama: siswa.nama,
            email: storeInAccountEmail,
            sekolahId,
            siswaId: siswa.id,
            peran: "SISWA",
            passwordHash,
            wajibGantiPassword: false,
          },
        });
      }
      return { nama: siswa.nama, username };
    });

    return res.status(201).json({
      temporaryPassword,
      username: createdInfo.username,
      nama: createdInfo.nama,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return res.status(404).json({ error: "Siswa tidak ditemukan di kelas yang Anda ampu." });
    }
    if (error instanceof Error && error.message === "ACCOUNT_EXISTS") {
      return res.status(409).json({ error: "Akun siswa sudah terdaftar. Gunakan tombol Reset Password." });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "Akun atau username sudah terdaftar." });
    }
    console.error("Gagal membuat akun siswa oleh guru:", error);
    return res.status(503).json({ error: "Akun siswa belum dapat dibuat." });
  }
});

app.get("/api/lms/guru/siswa-reset", async (req, res) => {
  try {
    const ctx = await resolveTeacherPortalContext(req);
    if (!ctx) return res.status(401).json({ error: "Sesi tidak valid." });
    const nisn = req.query.nisn;
    if (typeof nisn !== "string" || nisn.trim().length < 3 || nisn.trim().length > 64) {
      return res.status(400).json({ error: "Masukkan NISN atau username siswa yang valid." });
    }
    const { sekolahId, guruId } = ctx;
    const { managedIds } = await resolveTeacherManagedClasses(sekolahId, guruId);
    const key = nisn.trim().toLowerCase();
    const siswa = await prisma.siswa.findFirst({
      where: {
        sekolahId,
        status: "Aktif",
        kelasId: { in: managedIds },
        OR: [{ nisn: key }, { akun: { is: { email: key } } }],
        akun: { is: { aktif: true, peran: "SISWA", sekolahId, guruId: null } },
      },
      select: { id: true, nama: true, nisn: true },
    });
    if (!siswa) return res.status(404).json({ error: "Siswa tidak ditemukan atau tidak berada di kelas yang Anda ampu." });
    return res.json(siswa);
  } catch (error) {
    console.error("Gagal mencari siswa untuk reset password:", error);
    return res.status(503).json({ error: "Pencarian siswa tidak tersedia." });
  }
});

app.post("/api/lms/guru/siswa/:id/reset-password", async (req, res) => {
  try {
    const ctx = await resolveTeacherPortalContext(req);
    if (!ctx) return res.status(401).json({ error: "Sesi tidak valid." });
    const { sekolahId, guruId } = ctx;
    const parsedPassword = parseRequestedAccountPassword(req.body?.password, DEFAULT_STUDENT_PASSWORD);
    if (!parsedPassword.ok) return res.status(400).json({ error: parsedPassword.error });
    const temporaryPassword = parsedPassword.password;
    const passwordHash = await hashPassword(temporaryPassword);
    const { managedIds } = await resolveTeacherManagedClasses(sekolahId, guruId);
    const result = await prisma.$transaction(async (tx) => {
      const student = await tx.siswa.findFirst({
        where: { id: req.params.id, sekolahId, status: "Aktif", kelasId: { in: managedIds } },
        select: { id: true, nama: true, nisn: true },
      });
      if (!student) return null;
      const account = await tx.akun.findFirst({
        where: { siswaId: student.id, sekolahId, peran: "SISWA", aktif: true, guruId: null },
        select: { id: true, email: true },
      });
      if (!account) return null;
      const updated = await tx.akun.updateMany({
        where: { id: account.id, sekolahId, siswaId: student.id, peran: "SISWA", aktif: true, guruId: null },
        data: { passwordHash, wajibGantiPassword: false },
      });
      if (updated.count !== 1) return null;
      await tx.sesiAkun.updateMany({ where: { akunId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return { nama: student.nama, username: student.nisn.trim() || account.email || "" };
    });
    if (!result) return res.status(404).json({ error: "Akun siswa aktif tidak ditemukan di kelas yang Anda ampu." });
    return res.json({ temporaryPassword, username: result.username, nama: result.nama });
  } catch (error) {
    console.error("Gagal mereset password siswa:", error);
    return res.status(503).json({ error: "Password siswa belum dapat direset." });
  }
});

async function resolveTeacherPortalContext(req: express.Request): Promise<{
  sekolahId: string;
  guruId: string;
  akunId: string | null;
  nama: string;
  isSandbox: boolean;
} | null> {
  const session = await getLmsSession(req);
  const account = session?.akun;
  if (account?.sekolahId && account.peran === "GURU" && !account.wajibGantiPassword && account.guruId) {
    return { sekolahId: account.sekolahId, guruId: account.guruId, akunId: account.id, nama: account.nama, isSandbox: false };
  }
  const sandbox = await getDevSandboxLmsContext(req);
  if (sandbox && sandbox.peran === "GURU" && sandbox.guruId) {
    return { sekolahId: sandbox.sekolahId, guruId: sandbox.guruId, akunId: null, nama: sandbox.nama, isSandbox: true };
  }
  return null;
}

app.get("/api/lms/guru/beranda", async (req, res) => {
  try {
    const ctx = await resolveTeacherPortalContext(req);
    if (!ctx) return res.status(401).json({ error: "Sesi guru tidak valid." });
    const { sekolahId, guruId } = ctx;

    const [school, guru, scope] = await Promise.all([
      prisma.sekolah.findUnique({ where: { id: sekolahId }, select: { nama: true, slug: true, plan: true } }),
      prisma.guru.findFirst({
        where: { id: guruId, sekolahId },
        select: { id: true, nama: true, email: true, nuptk: true, telepon: true, mapelUtama: true, status: true },
      }),
      resolveTeacherScope(sekolahId, guruId),
    ]);
    if (!guru) return res.status(404).json({ error: "Data guru tidak ditemukan." });

    const restrictToAssigned = !scope.isWaliKelas;
    const accessibleKelasIds = restrictToAssigned ? scope.assignedKelasIds : undefined;

    const [kelasList, studentCounts, mapelList, jadwalRows, materiCount, tugasList, ujianCount, pengumumanRaw] = await Promise.all([
      prisma.kelas.findMany({
        where: {
          sekolahId,
          ...(accessibleKelasIds ? { id: { in: accessibleKelasIds } } : {}),
        },
        select: {
          id: true,
          nama: true,
          waliGuruId: true,
        },
        orderBy: { nama: "asc" },
        take: 200,
      }),
      prisma.siswa.groupBy({
        by: ["kelasId"],
        where: {
          sekolahId,
          status: "Aktif",
          kelasId: accessibleKelasIds ? { in: accessibleKelasIds } : { not: null },
        },
        _count: { _all: true },
      }),
      prisma.mapel.findMany({
        where: {
          sekolahId,
          ...(restrictToAssigned ? { id: { in: scope.assignedMapelIds } } : {}),
        },
        select: { id: true, nama: true },
        orderBy: { nama: "asc" },
        take: 200,
      }),
      prisma.jadwalPelajaran.findMany({
        where: { sekolahId, guruId },
        select: { kelasId: true, mapel: { select: { id: true, nama: true } } },
        take: 500,
      }),
      prisma.materiAjar.count({
        where: {
          sekolahId,
          ...(restrictToAssigned ? { kelasId: { in: scope.assignedKelasIds } } : {}),
        },
      }),
      prisma.tugas.findMany({
        where: {
          sekolahId,
          ...(restrictToAssigned ? { kelasId: { in: scope.assignedKelasIds } } : {}),
        },
        select: { id: true, judul: true, kelasId: true, kelas: { select: { nama: true } }, mapel: { select: { nama: true } }, batasWaktu: true },
        orderBy: [{ createdAt: "desc" }],
        take: 200,
      }),
      prisma.ujian.count({
        where: {
          sekolahId,
          ...(restrictToAssigned
            ? {
                OR: [
                  { guruId },
                  ...(scope.assignedKelasIds.length && scope.assignedMapelIds.length
                    ? [{ kelasId: { in: scope.assignedKelasIds }, mapelId: { in: scope.assignedMapelIds } }]
                    : []),
                ],
              }
            : {}),
        },
      }),
      prisma.topikDiskusi
        .findMany({
          where: {
            sekolahId,
            ...(restrictToAssigned
              ? { OR: [{ kelasId: null }, { kelasId: { in: scope.assignedKelasIds } }] }
              : {}),
          },
          select: {
            id: true,
            judul: true,
            kategori: true,
            kelasId: true,
            penulisNama: true,
            penulisPeran: true,
            disematkan: true,
            createdAt: true,
            _count: { select: { balasan: true } },
          },
          orderBy: [{ disematkan: "desc" }, { createdAt: "desc" }],
          take: 5,
        })
        .catch(() => []),
    ]);

    const tugasIds = tugasList.map((t) => t.id);
    const [ungradedCount, ungradedSubmissions] = tugasIds.length
      ? await Promise.all([
          prisma.pengumpulanTugas.count({ where: { tugasId: { in: tugasIds }, nilai: null } }),
          prisma.pengumpulanTugas.findMany({
            where: { tugasId: { in: tugasIds }, nilai: null },
            select: {
              id: true,
              dikumpulkanPada: true,
              jawaban: true,
              tautan: true,
              attachmentPhotoUrl: true,
              siswa: { select: { id: true, nama: true, nisn: true } },
              tugas: { select: { id: true, judul: true, kelasId: true, kelas: { select: { nama: true } }, mapel: { select: { nama: true } } } },
            },
            orderBy: { dikumpulkanPada: "desc" },
            take: 8,
          }),
        ])
      : [0, []];

    const mapelByKelas = new Map<string, string[]>();
    for (const row of jadwalRows) {
      const existing = mapelByKelas.get(row.kelasId) ?? [];
      if (!existing.includes(row.mapel.nama)) existing.push(row.mapel.nama);
      mapelByKelas.set(row.kelasId, existing);
    }

    const siswaCountByKelas = new Map<string, number>();
    for (const row of studentCounts) {
      if (row.kelasId) siswaCountByKelas.set(row.kelasId, row._count._all);
    }

    const kelasNameById = new Map(kelasList.map((k) => [k.id, k.nama]));
    const pengumumanTerbaru = pengumumanRaw.map((topic) => ({
      id: topic.id,
      judul: topic.judul,
      kategori: topic.kategori,
      penulisNama: topic.penulisNama,
      penulisPeran: topic.penulisPeran,
      disematkan: topic.disematkan,
      createdAt: topic.createdAt,
      kelas: topic.kelasId && kelasNameById.has(topic.kelasId) ? { id: topic.kelasId, nama: kelasNameById.get(topic.kelasId)! } : null,
      _count: topic._count,
    }));

    const kelasDiampu = kelasList.map((k) => ({
      id: k.id,
      nama: k.nama,
      isWali: k.waliGuruId === guruId,
      jumlahSiswa: siswaCountByKelas.get(k.id) ?? 0,
      mapel: mapelByKelas.get(k.id) ?? [],
    }));
    const totalSiswa = kelasDiampu.reduce((acc, k) => acc + k.jumlahSiswa, 0);

    return res.json({
      profil: guru,
      sekolah: school?.nama ?? "",
      slug: school?.slug ?? "",
      plan: normalizeTenantPlan(school?.plan),
      isWaliKelas: scope.isWaliKelas,
      waliKelasList: kelasDiampu.filter((k) => k.isWali).map((k) => ({ id: k.id, nama: k.nama })),
      kelasDiampu,
      mapelDiampu: mapelList,
      stats: {
        totalKelas: kelasDiampu.length,
        totalMapel: mapelList.length,
        totalSiswa,
        totalMateri: materiCount,
        totalTugas: tugasList.length,
        tugasPerluDikoreksi: ungradedCount,
        totalUjianCbt: ujianCount,
      },
      pengumumanTerbaru,
      tugasMenungguKoreksi: ungradedSubmissions,
    });
  } catch (error) {
    console.error("Gagal memuat beranda guru:", error);
    return res.status(503).json({ error: "Data beranda guru belum dapat dimuat." });
  }
});

async function loadAttendanceSheetPayload(params: {
  sekolahId: string;
  kelasList: Array<{ id: string; nama: string; isWali: boolean }>;
  requestedKelasId: string;
  tanggalParam: string;
  bulanParam: string;
}) {
  const todayIso = jakartaIsoDate();
  const selectedKelas = params.kelasList.find((k) => k.id === params.requestedKelasId) ?? params.kelasList[0] ?? null;

  if (!selectedKelas) {
    return {
      kelas: [],
      selectedKelasId: null,
      tanggal: params.tanggalParam,
      bulan: params.bulanParam,
      today: todayIso,
      kalenderBulanan: {},
      siswa: [],
    };
  }

  const targetDate = new Date(`${params.tanggalParam}T00:00:00.000Z`);
  const [yearNum, monthNum] = params.bulanParam.split("-").map(Number);
  const monthStart = new Date(Date.UTC(yearNum, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(yearNum, monthNum, 0));

  const [students, dailyRecords, monthlyRecords] = await Promise.all([
    prisma.siswa.findMany({
      where: { sekolahId: params.sekolahId, kelasId: selectedKelas.id, status: "Aktif" },
      select: { id: true, nama: true, nisn: true },
      orderBy: { nama: "asc" },
    }),
    prisma.presensi.findMany({
      where: { sekolahId: params.sekolahId, kelasId: selectedKelas.id, tanggal: targetDate },
      select: { siswaId: true, status: true, keterangan: true, waktuHadir: true },
    }),
    prisma.presensi.findMany({
      where: { sekolahId: params.sekolahId, kelasId: selectedKelas.id, tanggal: { gte: monthStart, lte: monthEnd } },
      select: { siswaId: true, status: true, tanggal: true },
    }),
  ]);

  const dailyMap = new Map(dailyRecords.map((r) => [r.siswaId, r]));
  const monthlyMap = new Map<string, { HADIR: number; IZIN: number; SAKIT: number; ALPA: number }>();
  for (const r of monthlyRecords) {
    const entry = monthlyMap.get(r.siswaId) ?? { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 };
    if (r.status in entry) entry[r.status as keyof typeof entry] += 1;
    monthlyMap.set(r.siswaId, entry);
  }

  const kalenderBulanan = buildMonthlyCalendarSummary(monthlyRecords, students.length);

  return {
    kelas: params.kelasList,
    selectedKelasId: selectedKelas.id,
    tanggal: params.tanggalParam,
    bulan: params.bulanParam,
    today: todayIso,
    kalenderBulanan,
    siswa: students.map((s) => {
      const daily = dailyMap.get(s.id);
      const rekap = monthlyMap.get(s.id) ?? { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 };
      return {
        id: s.id,
        nama: s.nama,
        nisn: s.nisn,
        status: daily?.status ?? null,
        keterangan: daily?.keterangan ?? "",
        waktuHadir: daily?.waktuHadir ?? null,
        rekapBulanan: rekap,
      };
    }),
  };
}

async function resolveOrCreateAttendanceYear(sekolahId: string, targetDate: Date): Promise<string> {
  let year =
    (await prisma.tahunAjaran.findFirst({
      where: { sekolahId, mulai: { lte: targetDate }, selesai: { gte: targetDate } },
      select: { id: true },
    })) ??
    (await prisma.tahunAjaran.findFirst({
      where: { sekolahId },
      orderBy: { mulai: "desc" },
      select: { id: true },
    }));

  if (!year) {
    const y = targetDate.getUTCFullYear();
    year = await prisma.tahunAjaran.create({
      data: {
        sekolahId,
        nama: `${y}/${y + 1}`,
        semester: "Ganjil",
        mulai: new Date(`${y}-01-01T00:00:00.000Z`),
        selesai: new Date(`${y}-12-31T23:59:59.000Z`),
      },
      select: { id: true },
    });
  }
  return year.id;
}

async function saveAttendanceBatch(params: {
  sekolahId: string;
  kelasId: string;
  tanggalStr: string;
  entries: Array<{ siswaId: string; status: "HADIR" | "SAKIT" | "IZIN" | "ALPA"; keterangan?: string | null }>;
  clearedSiswaIds?: string[];
}): Promise<{ savedCount: number; deletedCount: number }> {
  const targetDate = new Date(`${params.tanggalStr}T00:00:00.000Z`);
  const yearId = await resolveOrCreateAttendanceYear(params.sekolahId, targetDate);

  const activeStudents = await prisma.siswa.findMany({
    where: { sekolahId: params.sekolahId, kelasId: params.kelasId, status: "Aktif" },
    select: { id: true },
  });
  const validStudentIds = new Set(activeStudents.map((s) => s.id));
  const filteredEntries = params.entries.filter((e) => validStudentIds.has(e.siswaId));
  const filteredClearedIds = Array.from(
    new Set((params.clearedSiswaIds ?? []).filter((id) => validStudentIds.has(id))),
  );
  if (!filteredEntries.length && !filteredClearedIds.length) {
    return { savedCount: 0, deletedCount: 0 };
  }

  const existingRows = filteredEntries.length
    ? await prisma.presensi.findMany({
        where: {
          sekolahId: params.sekolahId,
          tanggal: targetDate,
          siswaId: { in: filteredEntries.map((e) => e.siswaId) },
        },
        select: { siswaId: true, keterangan: true, waktuHadir: true },
      })
    : [];
  const existingMap = new Map(existingRows.map((r) => [r.siswaId, r]));

  const now = new Date();
  const operations: Prisma.PrismaPromise<unknown>[] = filteredEntries.map((entry) => {
    const prior = existingMap.get(entry.siswaId);
    const explicitNote = typeof entry.keterangan === "string" ? entry.keterangan.trim().slice(0, 160) : null;
    const resolvedNote =
      explicitNote !== null && explicitNote !== ""
        ? explicitNote
        : entry.status === "HADIR" && prior?.keterangan === "Login Daring"
          ? "Login Daring"
          : null;
    const resolvedWaktu = entry.status === "HADIR" ? (prior?.waktuHadir ?? now) : null;

    return prisma.presensi.upsert({
      where: {
        sekolahId_siswaId_tanggal: {
          sekolahId: params.sekolahId,
          siswaId: entry.siswaId,
          tanggal: targetDate,
        },
      },
      create: {
        sekolahId: params.sekolahId,
        tahunAjaranId: yearId,
        kelasId: params.kelasId,
        siswaId: entry.siswaId,
        tanggal: targetDate,
        status: entry.status,
        keterangan: resolvedNote,
        waktuHadir: resolvedWaktu,
      },
      update: {
        kelasId: params.kelasId,
        tahunAjaranId: yearId,
        status: entry.status,
        keterangan: resolvedNote,
        waktuHadir: resolvedWaktu,
      },
    });
  });

  if (filteredClearedIds.length > 0) {
    operations.push(
      prisma.presensi.deleteMany({
        where: {
          sekolahId: params.sekolahId,
          kelasId: params.kelasId,
          tanggal: targetDate,
          siswaId: { in: filteredClearedIds },
        },
      }),
    );
  }

  await prisma.$transaction(operations);

  return { savedCount: filteredEntries.length, deletedCount: filteredClearedIds.length };
}

async function deleteAttendanceForClassDate(params: {
  sekolahId: string;
  kelasId: string;
  tanggalStr: string;
}): Promise<{ deletedCount: number }> {
  const targetDate = new Date(`${params.tanggalStr}T00:00:00.000Z`);
  const result = await prisma.presensi.deleteMany({
    where: {
      sekolahId: params.sekolahId,
      kelasId: params.kelasId,
      tanggal: targetDate,
    },
  });
  return { deletedCount: result.count };
}

app.get("/api/lms/guru/presensi", async (req, res) => {
  try {
    const ctx = await resolveTeacherPortalContext(req);
    if (!ctx) return res.status(401).json({ error: "Sesi guru tidak valid." });
    const { sekolahId, guruId } = ctx;
    const scope = await resolveTeacherScope(sekolahId, guruId);
    const restrictToAssigned = !scope.isWaliKelas;

    const kelasRaw = await prisma.kelas.findMany({
      where: {
        sekolahId,
        ...(restrictToAssigned ? { id: { in: scope.assignedKelasIds } } : {}),
      },
      select: { id: true, nama: true, waliGuruId: true },
      orderBy: { nama: "asc" },
      take: 200,
    });

    const todayIso = jakartaIsoDate();
    const tanggalParam = typeof req.query.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.tanggal)
      ? req.query.tanggal
      : todayIso;
    const bulanParam = typeof req.query.bulan === "string" && /^\d{4}-\d{2}$/.test(req.query.bulan)
      ? req.query.bulan
      : tanggalParam.slice(0, 7);
    const requestedKelasId = typeof req.query.kelasId === "string" ? req.query.kelasId : "";

    const payload = await loadAttendanceSheetPayload({
      sekolahId,
      kelasList: kelasRaw.map((k) => ({ id: k.id, nama: k.nama, isWali: k.waliGuruId === guruId })),
      requestedKelasId,
      tanggalParam,
      bulanParam,
    });
    return res.json(payload);
  } catch (error) {
    console.error("Gagal memuat presensi guru:", error);
    return res.status(503).json({ error: "Data presensi siswa belum dapat dimuat." });
  }
});

app.patch("/api/lms/guru/presensi", async (req, res) => {
  try {
    const ctx = await resolveTeacherPortalContext(req);
    if (!ctx) return res.status(401).json({ error: "Sesi guru tidak valid." });
    const { sekolahId, guruId } = ctx;

    const kelasId = typeof req.body?.kelasId === "string" ? req.body.kelasId.trim() : "";
    const siswaId = typeof req.body?.siswaId === "string" ? req.body.siswaId.trim() : "";
    const tanggalStr = typeof req.body?.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.tanggal)
      ? req.body.tanggal
      : jakartaIsoDate();
    const status = req.body?.status;
    const keterangan = typeof req.body?.keterangan === "string" ? req.body.keterangan.trim().slice(0, 160) : null;

    if (!kelasId || !siswaId || !["HADIR", "SAKIT", "IZIN", "ALPA"].includes(status)) {
      return res.status(400).json({ error: "Data presensi tidak lengkap atau status tidak valid." });
    }

    const scope = await resolveTeacherScope(sekolahId, guruId);
    if (!scope.isWaliKelas && !scope.assignedKelasIds.includes(kelasId)) {
      return res.status(403).json({ error: "Anda tidak memiliki akses presensi untuk kelas ini." });
    }

    const student = await prisma.siswa.findFirst({
      where: { id: siswaId, sekolahId, kelasId, status: "Aktif" },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ error: "Siswa aktif pada kelas tersebut tidak ditemukan." });

    const targetDate = new Date(`${tanggalStr}T00:00:00.000Z`);
    const yearId = await resolveOrCreateAttendanceYear(sekolahId, targetDate);

    const saved = await prisma.presensi.upsert({
      where: { sekolahId_siswaId_tanggal: { sekolahId, siswaId, tanggal: targetDate } },
      create: {
        sekolahId,
        tahunAjaranId: yearId,
        kelasId,
        siswaId,
        tanggal: targetDate,
        status,
        keterangan: keterangan || null,
        waktuHadir: status === "HADIR" ? new Date() : null,
      },
      update: {
        kelasId,
        tahunAjaranId: yearId,
        status,
        keterangan: keterangan || null,
        waktuHadir: status === "HADIR" ? new Date() : null,
      },
      select: { siswaId: true, status: true, keterangan: true, waktuHadir: true },
    });

    return res.json({ presensi: saved, message: "Presensi siswa disimpan." });
  } catch (error) {
    console.error("Gagal menyimpan presensi guru:", error);
    return res.status(503).json({ error: "Presensi siswa belum dapat disimpan." });
  }
});

app.post("/api/lms/guru/presensi/batch", async (req, res) => {
  try {
    const ctx = await resolveTeacherPortalContext(req);
    if (!ctx) return res.status(401).json({ error: "Sesi guru tidak valid." });
    const { sekolahId, guruId } = ctx;

    const kelasId = typeof req.body?.kelasId === "string" ? req.body.kelasId.trim() : "";
    const tanggalStr = typeof req.body?.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.tanggal)
      ? req.body.tanggal
      : jakartaIsoDate();
    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const rawCleared = Array.isArray(req.body?.clearedSiswaIds)
      ? req.body.clearedSiswaIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0).slice(0, 200)
      : [];

    if (!kelasId || (rawEntries.length === 0 && rawCleared.length === 0) || rawEntries.length > 200) {
      return res.status(400).json({ error: "Daftar presensi kelas tidak valid." });
    }

    const scope = await resolveTeacherScope(sekolahId, guruId);
    if (!scope.isWaliKelas && !scope.assignedKelasIds.includes(kelasId)) {
      return res.status(403).json({ error: "Anda tidak memiliki akses presensi untuk kelas ini." });
    }

    const entries: Array<{ siswaId: string; status: "HADIR" | "SAKIT" | "IZIN" | "ALPA"; keterangan?: string | null }> = [];
    for (const item of rawEntries) {
      if (!item || typeof item !== "object") continue;
      const siswaId = typeof item.siswaId === "string" ? item.siswaId.trim() : "";
      const status = item.status;
      if (!siswaId || !["HADIR", "SAKIT", "IZIN", "ALPA"].includes(status)) {
        return res.status(400).json({ error: "Terdapat status presensi yang tidak valid." });
      }
      entries.push({
        siswaId,
        status,
        keterangan: typeof item.keterangan === "string" ? item.keterangan.trim().slice(0, 160) : null,
      });
    }

    const { savedCount, deletedCount } = await saveAttendanceBatch({
      sekolahId,
      kelasId,
      tanggalStr,
      entries,
      clearedSiswaIds: rawCleared,
    });
    const message =
      savedCount > 0 && deletedCount > 0
        ? `Presensi ${savedCount} siswa disimpan dan ${deletedCount} status dibatalkan.`
        : deletedCount > 0
          ? `${deletedCount} catatan presensi siswa berhasil dikosongkan.`
          : `Presensi ${savedCount} siswa berhasil disimpan.`;
    return res.json({ savedCount, deletedCount, message });
  } catch (error) {
    console.error("Gagal menyimpan presensi massal guru:", error);
    return res.status(503).json({ error: "Presensi siswa belum dapat disimpan." });
  }
});

app.delete("/api/lms/guru/presensi", async (req, res) => {
  try {
    const ctx = await resolveTeacherPortalContext(req);
    if (!ctx) return res.status(401).json({ error: "Sesi guru tidak valid." });
    const { sekolahId, guruId } = ctx;

    const kelasId = String(req.query.classId ?? req.query.kelasId ?? "").trim();
    const tanggalStr = String(req.query.date ?? req.query.tanggal ?? "").trim();
    if (!kelasId || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalStr)) {
      return res.status(400).json({ error: "Parameter classId dan date (YYYY-MM-DD) wajib diisi." });
    }

    const scope = await resolveTeacherScope(sekolahId, guruId);
    if (!scope.isWaliKelas && !scope.assignedKelasIds.includes(kelasId)) {
      return res.status(403).json({ error: "Anda tidak memiliki akses menghapus presensi kelas ini." });
    }

    const kelas = await prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true } });
    if (!kelas) return res.status(404).json({ error: "Kelas tidak ditemukan." });

    const { deletedCount } = await deleteAttendanceForClassDate({ sekolahId, kelasId, tanggalStr });
    return res.json({
      deletedCount,
      message:
        deletedCount > 0
          ? `Presensi tanggal ${tanggalStr} (${deletedCount} catatan) berhasil dihapus.`
          : `Tidak ada catatan presensi tersimpan pada tanggal ${tanggalStr}.`,
    });
  } catch (error) {
    console.error("Gagal menghapus presensi guru:", error);
    return res.status(503).json({ error: "Presensi tanggal tersebut belum dapat dihapus." });
  }
});

app.get("/api/sekolah/presensi", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });

    const kelasRaw = await prisma.kelas.findMany({
      where: { sekolahId },
      select: { id: true, nama: true },
      orderBy: { nama: "asc" },
      take: 300,
    });

    const todayIso = jakartaIsoDate();
    const tanggalParam = typeof req.query.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.tanggal)
      ? req.query.tanggal
      : todayIso;
    const bulanParam = typeof req.query.bulan === "string" && /^\d{4}-\d{2}$/.test(req.query.bulan)
      ? req.query.bulan
      : tanggalParam.slice(0, 7);
    const requestedKelasId = typeof req.query.kelasId === "string" ? req.query.kelasId : "";

    const payload = await loadAttendanceSheetPayload({
      sekolahId,
      kelasList: kelasRaw.map((k) => ({ id: k.id, nama: k.nama, isWali: false })),
      requestedKelasId,
      tanggalParam,
      bulanParam,
    });
    return res.json(payload);
  } catch (error) {
    console.error("Gagal memuat presensi sekolah:", error);
    return res.status(503).json({ error: "Data presensi siswa belum dapat dimuat." });
  }
});

app.patch("/api/sekolah/presensi", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });

    const kelasId = typeof req.body?.kelasId === "string" ? req.body.kelasId.trim() : "";
    const siswaId = typeof req.body?.siswaId === "string" ? req.body.siswaId.trim() : "";
    const tanggalStr = typeof req.body?.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.tanggal)
      ? req.body.tanggal
      : jakartaIsoDate();
    const status = req.body?.status;
    const keterangan = typeof req.body?.keterangan === "string" ? req.body.keterangan.trim().slice(0, 160) : null;

    if (!kelasId || !siswaId || !["HADIR", "SAKIT", "IZIN", "ALPA"].includes(status)) {
      return res.status(400).json({ error: "Data presensi tidak lengkap atau status tidak valid." });
    }

    const student = await prisma.siswa.findFirst({
      where: { id: siswaId, sekolahId, kelasId, status: "Aktif" },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ error: "Siswa aktif pada kelas tersebut tidak ditemukan." });

    const targetDate = new Date(`${tanggalStr}T00:00:00.000Z`);
    const yearId = await resolveOrCreateAttendanceYear(sekolahId, targetDate);

    const saved = await prisma.presensi.upsert({
      where: { sekolahId_siswaId_tanggal: { sekolahId, siswaId, tanggal: targetDate } },
      create: {
        sekolahId,
        tahunAjaranId: yearId,
        kelasId,
        siswaId,
        tanggal: targetDate,
        status,
        keterangan: keterangan || null,
        waktuHadir: status === "HADIR" ? new Date() : null,
      },
      update: {
        kelasId,
        tahunAjaranId: yearId,
        status,
        keterangan: keterangan || null,
        waktuHadir: status === "HADIR" ? new Date() : null,
      },
      select: { siswaId: true, status: true, keterangan: true, waktuHadir: true },
    });

    return res.json({ presensi: saved, message: "Presensi siswa disimpan." });
  } catch (error) {
    console.error("Gagal menyimpan presensi sekolah:", error);
    return res.status(503).json({ error: "Presensi siswa belum dapat disimpan." });
  }
});

app.post("/api/sekolah/presensi/batch", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });

    const kelasId = typeof req.body?.kelasId === "string" ? req.body.kelasId.trim() : "";
    const tanggalStr = typeof req.body?.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.tanggal)
      ? req.body.tanggal
      : jakartaIsoDate();
    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const rawCleared = Array.isArray(req.body?.clearedSiswaIds)
      ? req.body.clearedSiswaIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0).slice(0, 200)
      : [];

    if (!kelasId || (rawEntries.length === 0 && rawCleared.length === 0) || rawEntries.length > 200) {
      return res.status(400).json({ error: "Daftar presensi kelas tidak valid." });
    }

    const kelas = await prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true } });
    if (!kelas) return res.status(404).json({ error: "Kelas tidak ditemukan di sekolah ini." });

    const entries: Array<{ siswaId: string; status: "HADIR" | "SAKIT" | "IZIN" | "ALPA"; keterangan?: string | null }> = [];
    for (const item of rawEntries) {
      if (!item || typeof item !== "object") continue;
      const siswaId = typeof item.siswaId === "string" ? item.siswaId.trim() : "";
      const status = item.status;
      if (!siswaId || !["HADIR", "SAKIT", "IZIN", "ALPA"].includes(status)) {
        return res.status(400).json({ error: "Terdapat status presensi yang tidak valid." });
      }
      entries.push({
        siswaId,
        status,
        keterangan: typeof item.keterangan === "string" ? item.keterangan.trim().slice(0, 160) : null,
      });
    }

    const { savedCount, deletedCount } = await saveAttendanceBatch({
      sekolahId,
      kelasId,
      tanggalStr,
      entries,
      clearedSiswaIds: rawCleared,
    });
    const message =
      savedCount > 0 && deletedCount > 0
        ? `Presensi ${savedCount} siswa disimpan dan ${deletedCount} status dibatalkan.`
        : deletedCount > 0
          ? `${deletedCount} catatan presensi siswa berhasil dikosongkan.`
          : `Presensi ${savedCount} siswa berhasil disimpan.`;
    return res.json({ savedCount, deletedCount, message });
  } catch (error) {
    console.error("Gagal menyimpan presensi massal sekolah:", error);
    return res.status(503).json({ error: "Presensi siswa belum dapat disimpan." });
  }
});

app.delete("/api/sekolah/presensi", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });

    const kelasId = String(req.query.classId ?? req.query.kelasId ?? "").trim();
    const tanggalStr = String(req.query.date ?? req.query.tanggal ?? "").trim();
    if (!kelasId || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalStr)) {
      return res.status(400).json({ error: "Parameter classId dan date (YYYY-MM-DD) wajib diisi." });
    }

    const kelas = await prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true } });
    if (!kelas) return res.status(404).json({ error: "Kelas tidak ditemukan di sekolah ini." });

    const { deletedCount } = await deleteAttendanceForClassDate({ sekolahId, kelasId, tanggalStr });
    return res.json({
      deletedCount,
      message:
        deletedCount > 0
          ? `Presensi tanggal ${tanggalStr} (${deletedCount} catatan) berhasil dihapus.`
          : `Tidak ada catatan presensi tersimpan pada tanggal ${tanggalStr}.`,
    });
  } catch (error) {
    console.error("Gagal menghapus presensi sekolah:", error);
    return res.status(503).json({ error: "Presensi tanggal tersebut belum dapat dihapus." });
  }
});

// Unified endpoint requested: DELETE /api/school/attendance?classId=...&date=YYYY-MM-DD
app.delete("/api/school/attendance", async (req, res) => {
  try {
    const kelasId = String(req.query.classId ?? req.query.kelasId ?? "").trim();
    const tanggalStr = String(req.query.date ?? req.query.tanggal ?? "").trim();
    if (!kelasId || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalStr)) {
      return res.status(400).json({ error: "Parameter classId dan date (YYYY-MM-DD) wajib diisi." });
    }

    const adminSession = await getSession(req, "ADMIN");
    if (adminSession?.akun.sekolahId) {
      const sekolahId = adminSession.akun.sekolahId;
      const kelas = await prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true } });
      if (!kelas) return res.status(404).json({ error: "Kelas tidak ditemukan di sekolah ini." });
      const { deletedCount } = await deleteAttendanceForClassDate({ sekolahId, kelasId, tanggalStr });
      return res.json({
        deletedCount,
        message:
          deletedCount > 0
            ? `Presensi tanggal ${tanggalStr} (${deletedCount} catatan) berhasil dihapus.`
            : `Tidak ada catatan presensi tersimpan pada tanggal ${tanggalStr}.`,
      });
    }

    const teacherCtx = await resolveTeacherPortalContext(req);
    if (teacherCtx) {
      const { sekolahId, guruId } = teacherCtx;
      const scope = await resolveTeacherScope(sekolahId, guruId);
      if (!scope.isWaliKelas && !scope.assignedKelasIds.includes(kelasId)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses menghapus presensi kelas ini." });
      }
      const kelas = await prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true } });
      if (!kelas) return res.status(404).json({ error: "Kelas tidak ditemukan." });
      const { deletedCount } = await deleteAttendanceForClassDate({ sekolahId, kelasId, tanggalStr });
      return res.json({
        deletedCount,
        message:
          deletedCount > 0
            ? `Presensi tanggal ${tanggalStr} (${deletedCount} catatan) berhasil dihapus.`
            : `Tidak ada catatan presensi tersimpan pada tanggal ${tanggalStr}.`,
      });
    }

    return res.status(401).json({ error: "Sesi tidak valid." });
  } catch (error) {
    console.error("Gagal menghapus presensi via /api/school/attendance:", error);
    return res.status(503).json({ error: "Presensi tanggal tersebut belum dapat dihapus." });
  }
});

app.patch("/api/lms/guru/profil", async (req, res) => {
  try {
    const ctx = await resolveTeacherPortalContext(req);
    if (!ctx) return res.status(401).json({ error: "Sesi guru tidak valid." });
    const { sekolahId, guruId, akunId } = ctx;

    const nama = typeof req.body?.nama === "string" ? req.body.nama.trim().slice(0, 120) : "";
    const telepon = typeof req.body?.telepon === "string" ? req.body.telepon.trim().slice(0, 32) : "";
    const mapelUtama = typeof req.body?.mapelUtama === "string" ? req.body.mapelUtama.trim().slice(0, 120) : "";

    if (!nama || nama.length < 2) {
      return res.status(400).json({ error: "Nama lengkap guru minimal 2 karakter." });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const guru = await tx.guru.update({
        where: { id: guruId },
        data: {
          nama,
          telepon: telepon || "",
          ...(mapelUtama ? { mapelUtama } : {}),
        },
        select: { id: true, nama: true, email: true, nuptk: true, telepon: true, mapelUtama: true },
      });
      if (akunId) {
        await tx.akun.updateMany({ where: { id: akunId, sekolahId }, data: { nama } });
      }
      return guru;
    });

    return res.json({ profil: updated, message: "Profil guru berhasil diperbarui." });
  } catch (error) {
    console.error("Gagal memperbarui profil guru:", error);
    return res.status(503).json({ error: "Profil guru belum dapat disimpan." });
  }
});

const resolveAdminSchoolSession = async (req: express.Request): Promise<SchoolSessionInfo | null> => {
  const session = await getSession(req, "ADMIN");
  if (!session?.akun.sekolahId) return null;
  return { sekolahId: session.akun.sekolahId, nama: session.akun.nama, peran: "ADMIN" };
};
const resolveAdminOrTeacherSession = async (req: express.Request): Promise<SchoolSessionInfo | null> => {
  const sandbox = await getDevSandboxLmsContext(req);
  if (sandbox && sandbox.peran === "GURU" && sandbox.guruId) {
    return { sekolahId: sandbox.sekolahId, nama: sandbox.nama, peran: "GURU", guruId: sandbox.guruId };
  }
  const admin = await resolveAdminSchoolSession(req);
  if (admin) return admin;
  const teacher = await resolveTeacherPortalContext(req);
  if (teacher) {
    return { sekolahId: teacher.sekolahId, nama: teacher.nama, peran: "GURU", guruId: teacher.guruId };
  }
  return null;
};
const resolveAcademicSchoolSession = async (req: express.Request): Promise<SchoolSessionInfo | null> => {
  const teacherAllowedPath = req.path.startsWith("/raport") || req.path.startsWith("/modul-kesetaraan") || req.path.startsWith("/agenda-mengajar");
  if (teacherAllowedPath) {
    const sandbox = await getDevSandboxLmsContext(req);
    if (sandbox && sandbox.peran === "GURU" && sandbox.guruId) {
      return { sekolahId: sandbox.sekolahId, nama: sandbox.nama, peran: "GURU", guruId: sandbox.guruId };
    }
  }
  const admin = await resolveAdminSchoolSession(req);
  if (admin) return admin;
  if (teacherAllowedPath) {
    const teacher = await resolveTeacherPortalContext(req);
    if (teacher) {
      return { sekolahId: teacher.sekolahId, nama: teacher.nama, peran: "GURU", guruId: teacher.guruId };
    }
  }
  return null;
};
const resolveCollabSchoolSession = async (req: express.Request): Promise<SchoolSessionInfo | null> => {
  const collabPath = req.path.startsWith("/diskusi") || req.path.startsWith("/ai-assistant");
  if (collabPath) {
    const sandbox = await getDevSandboxLmsContext(req);
    if (sandbox) {
      return {
        sekolahId: sandbox.sekolahId,
        nama: sandbox.nama,
        peran: sandbox.peran,
        guruId: sandbox.guruId,
        siswaId: sandbox.siswaId,
        kelasId: sandbox.kelasId,
      };
    }
  }
  const admin = await resolveAdminSchoolSession(req);
  if (admin) return admin;
  if (collabPath) {
    const lmsSession = await getLmsSession(req);
    if (lmsSession?.akun.sekolahId && !lmsSession.akun.wajibGantiPassword && (lmsSession.akun.peran === "GURU" || lmsSession.akun.peran === "SISWA")) {
      return {
        sekolahId: lmsSession.akun.sekolahId,
        nama: lmsSession.akun.nama,
        peran: lmsSession.akun.peran,
        guruId: lmsSession.akun.guruId ?? null,
        siswaId: lmsSession.akun.siswaId ?? null,
        kelasId: lmsSession.akun.siswa?.kelasId ?? null,
      };
    }
  }
  return null;
};

app.use("/api/sekolah", schoolManagementRoutes(async (req) => (await getSession(req, "ADMIN"))?.akun.sekolahId ?? null));
app.use("/api/sekolah", schoolTierRoutes(async (req) => (await getSession(req, "ADMIN"))?.akun.sekolahId ?? null));
app.use("/api/sekolah", tahap2AcademicRoutes(resolveAcademicSchoolSession));
app.use("/api/sekolah", tahap2CbtRoutes(resolveAdminOrTeacherSession));
app.use("/api/cbt", cbtPublicBankRoutes(resolveAdminOrTeacherSession));
app.use("/api/sekolah", tahap2ProRoutes(resolveAdminSchoolSession));
app.use("/api/sekolah", tahap2CollabRoutes(resolveCollabSchoolSession));
app.use("/api/sekolah", schoolMasterContentRoutes(resolveAdminOrTeacherSession));
app.use("/api/school", schoolMasterContentRoutes(resolveAdminOrTeacherSession));
app.use("/api/school", tahap2CollabRoutes(resolveCollabSchoolSession));
app.use("/api/master/pustaka-konten", masterContentRoutes(async (req) => {
  const masterSession = await getSession(req, "MASTER_ADMIN");
  if (!masterSession) return null;
  return { akunId: masterSession.akun.id, nama: masterSession.akun.nama };
}));
app.use(
  "/api/modules",
  express.json({ limit: "2mb" }),
  moduleBulkImportRoutes(
    async (req) => {
      const masterSession = await getSession(req, "MASTER_ADMIN");
      if (!masterSession) return null;
      return { akunId: masterSession.akun.id, nama: masterSession.akun.nama };
    },
    resolveAdminOrTeacherSession,
  ),
);
app.use("/api/module-bank", moduleBankRoutes(resolveAdminOrTeacherSession));
app.use("/api/verval", vervalRoutes(async (req) => {
  const adminSession = await getSession(req, "ADMIN");
  if (adminSession?.akun.sekolahId) {
    return { sekolahId: adminSession.akun.sekolahId, role: "ADMIN" };
  }
  const lmsSession = await getLmsSession(req);
  if (lmsSession?.akun.sekolahId && lmsSession.akun.peran === "SISWA" && lmsSession.akun.siswaId && !lmsSession.akun.wajibGantiPassword) {
    return { sekolahId: lmsSession.akun.sekolahId, role: "SISWA", siswaId: lmsSession.akun.siswaId };
  }
  const sandbox = await getDevSandboxLmsContext(req);
  if (sandbox && sandbox.peran === "SISWA" && sandbox.siswaId) {
    return { sekolahId: sandbox.sekolahId, role: "SISWA", siswaId: sandbox.siswaId };
  }
  return null;
}));
app.use("/api/dinas", dinasRoutes(getDinasSession));

async function mapInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  for (let start = 0; start < items.length; start += batchSize) {
    const slice = items.slice(start, start + batchSize);
    const chunk = await Promise.all(slice.map(fn));
    for (let offset = 0; offset < chunk.length; offset++) {
      results[start + offset] = chunk[offset];
    }
  }
  return results;
}

app.post("/api/sekolah/siswa/import", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });

    const parsed = parseDapodikStudentImport(req.body?.rows);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const autoCreateClasses = req.body?.autoCreateClasses !== false;

    // Pre-hash initial passwords outside the DB transaction so large imports stay fast
    const rowPasswordHashes = await mapInBatches(parsed.rows, 16, (row) =>
      hashPassword(formatPasswordFromBirthDate(row.tanggalLahir)),
    );

    const schoolPrefix = sekolahId.slice(0, 6).toLowerCase();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Flexible case-insensitive rombel matching (and optional auto-creation)
      const existingClasses = await tx.kelas.findMany({
        where: { sekolahId },
        select: { id: true, nama: true },
      });
      const classMap = new Map<string, string>();
      for (const cls of existingClasses) {
        const key = normalizeClassKey(cls.nama);
        if (key && !classMap.has(key)) classMap.set(key, cls.id);
      }

      const createdClasses: string[] = [];
      const unmatchedClassesSet = new Set<string>();

      if (autoCreateClasses) {
        const missingByKey = new Map<string, string>();
        for (const row of parsed.rows) {
          if (!row.rombel) continue;
          const key = normalizeClassKey(row.rombel);
          if (key && !classMap.has(key) && !missingByKey.has(key)) {
            missingByKey.set(key, row.rombel.slice(0, 100));
          }
        }
        const remainingCapacity = Math.max(0, 500 - existingClasses.length);
        const toCreate = Array.from(missingByKey.entries()).slice(0, remainingCapacity);
        if (toCreate.length > 0) {
          const newClassRows = toCreate.map(([, nama]) => ({
            id: randomUUID(),
            nama,
            kode: randomBytes(16).toString("hex"),
            sekolahId,
            waliGuruId: null,
          }));
          await tx.kelas.createMany({ data: newClassRows });
          for (const cls of newClassRows) {
            classMap.set(normalizeClassKey(cls.nama), cls.id);
            createdClasses.push(cls.nama);
          }
        }
      }

      let matchedClasses = 0;
      let withoutClassCount = 0;
      const resolvedClassIds: (string | null)[] = parsed.rows.map((row) => {
        if (!row.rombel) {
          withoutClassCount++;
          return null;
        }
        const foundId = classMap.get(normalizeClassKey(row.rombel)) ?? null;
        if (foundId) {
          matchedClasses++;
          return foundId;
        }
        unmatchedClassesSet.add(row.rombel);
        withoutClassCount++;
        return null;
      });

      // 2. Look up existing students by NISN or NIPD (including school-scoped NIPD fallback)
      const lookupKeysSet = new Set<string>();
      for (const row of parsed.rows) {
        if (row.nisn) lookupKeysSet.add(row.nisn);
        if (row.nipd) {
          lookupKeysSet.add(row.nipd);
          lookupKeysSet.add(`nipd-${schoolPrefix}-${row.nipd.toLowerCase()}`);
        }
        if (row.username) lookupKeysSet.add(row.username);
      }
      const lookupKeys = Array.from(lookupKeysSet);
      const existingStudents = lookupKeys.length > 0
        ? await tx.siswa.findMany({
            where: { nisn: { in: lookupKeys } },
            select: {
              id: true,
              nisn: true,
              sekolahId: true,
              email: true,
              akun: { select: { id: true, email: true } },
            },
          })
        : [];

      const ownByKey = new Map<string, (typeof existingStudents)[number]>();
      const otherSchoolKeys = new Set<string>();
      for (const student of existingStudents) {
        if (student.sekolahId === sekolahId) {
          ownByKey.set(student.nisn, student);
        } else {
          otherSchoolKeys.add(student.nisn);
        }
      }

      type UpdateEntry = {
        id: string;
        existingNisn: string;
        existingEmail: string | null;
        hasAccount: boolean;
        row: (typeof parsed.rows)[number];
        kelasId: string | null;
        passwordHash: string;
      };
      type CreateEntry = {
        id: string;
        resolvedNisn: string;
        generatedNisn: boolean;
        row: (typeof parsed.rows)[number];
        kelasId: string | null;
        passwordHash: string;
      };

      const updateTargets: UpdateEntry[] = [];
      const createTargets: CreateEntry[] = [];
      const updatedIds = new Set<string>();
      const claimedNisns = new Set<string>(existingStudents.map((s) => s.nisn));

      const makeAutoIdentifier = (nama: string, preferredUsername?: string): string => {
        if (preferredUsername && !claimedNisns.has(preferredUsername) && !otherSchoolKeys.has(preferredUsername)) {
          claimedNisns.add(preferredUsername);
          return preferredUsername;
        }
        const base = slugifyShortName(nama);
        for (let attempt = 0; attempt < 10; attempt++) {
          const candidate = `${base}${randomInt(1000, 9999)}`;
          if (!claimedNisns.has(candidate) && !otherSchoolKeys.has(candidate)) {
            claimedNisns.add(candidate);
            return candidate;
          }
        }
        const fallback = `${base}${randomBytes(3).toString("hex")}`;
        claimedNisns.add(fallback);
        return fallback;
      };

      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const kelasId = resolvedClassIds[i];
        const passwordHash = rowPasswordHashes[i];
        const scopedNipd = row.nipd ? `nipd-${schoolPrefix}-${row.nipd.toLowerCase()}` : undefined;

        const matched =
          (row.nisn ? ownByKey.get(row.nisn) : undefined) ??
          (row.nipd ? ownByKey.get(row.nipd) : undefined) ??
          (scopedNipd ? ownByKey.get(scopedNipd) : undefined);

        if (matched && !updatedIds.has(matched.id)) {
          updatedIds.add(matched.id);
          updateTargets.push({
            id: matched.id,
            existingNisn: matched.nisn,
            existingEmail: matched.email,
            hasAccount: Boolean(matched.akun),
            row,
            kelasId,
            passwordHash,
          });
          continue;
        }

        // Strict tenant isolation: if an explicit 10-digit NISN already belongs to another school, abort with 409
        if (row.nisn && /^\d{10}$/.test(row.nisn) && otherSchoolKeys.has(row.nisn)) {
          throw new Error("NISN_CONFLICT");
        }

        let resolvedNisn: string;
        let generatedNisn = false;
        if (row.nisn && !claimedNisns.has(row.nisn) && !otherSchoolKeys.has(row.nisn)) {
          resolvedNisn = row.nisn;
          claimedNisns.add(resolvedNisn);
        } else if (row.nipd && !claimedNisns.has(row.nipd) && !otherSchoolKeys.has(row.nipd)) {
          resolvedNisn = row.nipd;
          claimedNisns.add(resolvedNisn);
        } else if (scopedNipd && !claimedNisns.has(scopedNipd) && !otherSchoolKeys.has(scopedNipd)) {
          resolvedNisn = scopedNipd;
          claimedNisns.add(resolvedNisn);
        } else {
          resolvedNisn = makeAutoIdentifier(row.nama, row.username);
          generatedNisn = true;
        }

        createTargets.push({
          id: randomUUID(),
          resolvedNisn,
          generatedNisn,
          row,
          kelasId,
          passwordHash,
        });
      }

      // Verify generated identifiers don't collide with any existing Siswa.nisn globally
      const generatedCandidates = createTargets.filter((item) => item.generatedNisn).map((item) => item.resolvedNisn);
      if (generatedCandidates.length > 0) {
        const collisions = await tx.siswa.findMany({
          where: { nisn: { in: generatedCandidates } },
          select: { nisn: true },
        });
        if (collisions.length > 0) {
          const collidedSet = new Set(collisions.map((c) => c.nisn));
          for (const item of createTargets) {
            if (item.generatedNisn && collidedSet.has(item.resolvedNisn)) {
              const replacement = `${slugifyShortName(item.row.nama)}${randomBytes(4).toString("hex")}`;
              item.resolvedNisn = replacement;
              claimedNisns.add(replacement);
            }
          }
        }
      }

      // 3. Auto-generate unique login emails for new accounts (new students + existing students without Akun)
      const emailDomain = "siswa.armilla.local";
      const candidateEmails = new Set<string>();
      for (const item of createTargets) {
        if (item.row.email) candidateEmails.add(item.row.email);
        const loginBase = (item.row.username || item.resolvedNisn).toLowerCase().replace(/[^a-z0-9._-]/g, "");
        if (loginBase) candidateEmails.add(`${loginBase}@${emailDomain}`);
      }
      for (const item of updateTargets) {
        if (!item.hasAccount) {
          if (item.row.email) candidateEmails.add(item.row.email);
          if (item.existingEmail) candidateEmails.add(item.existingEmail.toLowerCase());
          const loginBase = (item.row.username || item.existingNisn).toLowerCase().replace(/[^a-z0-9._-]/g, "");
          if (loginBase) candidateEmails.add(`${loginBase}@${emailDomain}`);
        }
      }

      const takenEmails = new Set<string>();
      if (candidateEmails.size > 0) {
        const existingAccounts = await tx.akun.findMany({
          where: { email: { in: Array.from(candidateEmails) } },
          select: { email: true },
        });
        for (const acc of existingAccounts) {
          if (acc.email) takenEmails.add(acc.email.toLowerCase());
        }
      }

      const allocateAccountEmail = (preferredEmail: string | null | undefined, loginId: string, nama: string): string => {
        if (preferredEmail) {
          const clean = preferredEmail.trim().toLowerCase();
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) && !takenEmails.has(clean)) {
            takenEmails.add(clean);
            return clean;
          }
        }
        const safeBase = loginId.toLowerCase().replace(/[^a-z0-9._-]/g, "") || slugifyShortName(nama);
        const primary = `${safeBase}@${emailDomain}`;
        if (!takenEmails.has(primary)) {
          takenEmails.add(primary);
          return primary;
        }
        for (let attempt = 0; attempt < 10; attempt++) {
          const candidate = `${slugifyShortName(nama)}.${randomInt(1000, 9999)}@${emailDomain}`;
          if (!takenEmails.has(candidate)) {
            takenEmails.add(candidate);
            return candidate;
          }
        }
        const fallback = `${slugifyShortName(nama)}.${randomBytes(4).toString("hex")}@${emailDomain}`;
        takenEmails.add(fallback);
        return fallback;
      };

      const accountsToCreate: Array<{
        nama: string;
        email: string;
        sekolahId: string;
        siswaId: string;
        peran: "SISWA";
        passwordHash: string;
        aktif: boolean;
        wajibGantiPassword: boolean;
      }> = [];

      // 4. Bulk update existing students (safe COALESCE preserves non-blank existing values)
      if (updateTargets.length > 0) {
        const values = Prisma.join(
          updateTargets.map(({ id, row, kelasId }) =>
            Prisma.sql`(${id}, ${row.nama}, ${row.email ?? null}, ${row.telepon ?? null}, ${row.nik ?? null}, ${row.tempatLahir ?? null}, ${row.tanggalLahir ?? null}::date, ${row.jenisKelamin ?? null}, ${row.jenjang ?? null}, ${row.tanggalMasuk ?? null}::date, ${row.jalurPendaftaran ?? null}, ${row.namaAyah ?? null}, ${row.namaIbu ?? null}, ${row.alamatLengkap ?? null}, ${row.teleponAyah ?? null}, ${row.pekerjaanAyah ?? null}, ${row.teleponIbu ?? null}, ${row.pekerjaanIbu ?? null}, ${row.namaWali ?? null}, ${row.teleponWali ?? null}, ${row.pekerjaanWali ?? null}, ${kelasId})`,
          ),
        );
        const updatedCount = await tx.$executeRaw`
          UPDATE "Siswa" AS siswa SET
            "nama" = data.nama,
            "email" = COALESCE(data.email, siswa."email"),
            "telepon" = COALESCE(data.telepon, siswa."telepon"),
            "nik" = COALESCE(data.nik, siswa."nik"),
            "tempatLahir" = COALESCE(data.tempat_lahir, siswa."tempatLahir"),
            "tanggalLahir" = COALESCE(data.tanggal_lahir, siswa."tanggalLahir"),
            "jenisKelamin" = COALESCE(data.jenis_kelamin, siswa."jenisKelamin"),
            "jenjang" = COALESCE(data.jenjang, siswa."jenjang"),
            "tanggalMasuk" = COALESCE(data.tanggal_masuk, siswa."tanggalMasuk"),
            "jalurPendaftaran" = COALESCE(data.jalur_pendaftaran, siswa."jalurPendaftaran"),
            "namaAyah" = COALESCE(data.nama_ayah, siswa."namaAyah"),
            "namaIbu" = COALESCE(data.nama_ibu, siswa."namaIbu"),
            "namaIbuKandung" = COALESCE(data.nama_ibu, siswa."namaIbuKandung"),
            "alamatLengkap" = COALESCE(data.alamat, siswa."alamatLengkap"),
            "teleponAyah" = COALESCE(data.telepon_ayah, siswa."teleponAyah"),
            "pekerjaanAyah" = COALESCE(data.pekerjaan_ayah, siswa."pekerjaanAyah"),
            "teleponIbu" = COALESCE(data.telepon_ibu, siswa."teleponIbu"),
            "pekerjaanIbu" = COALESCE(data.pekerjaan_ibu, siswa."pekerjaanIbu"),
            "namaWali" = COALESCE(data.nama_wali, siswa."namaWali"),
            "teleponWali" = COALESCE(data.telepon_wali, siswa."teleponWali"),
            "pekerjaanWali" = COALESCE(data.pekerjaan_wali, siswa."pekerjaanWali"),
            "kelasId" = COALESCE(data.kelas_id, siswa."kelasId"),
            "sumberDapodik" = true
          FROM (VALUES ${values}) AS data(id, nama, email, telepon, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, jenjang, tanggal_masuk, jalur_pendaftaran, nama_ayah, nama_ibu, alamat, telepon_ayah, pekerjaan_ayah, telepon_ibu, pekerjaan_ibu, nama_wali, telepon_wali, pekerjaan_wali, kelas_id)
          WHERE siswa."id" = data.id AND siswa."sekolahId" = ${sekolahId}
        `;
        if (updatedCount !== updateTargets.length) throw new Error("IMPORT_CONFLICT");

        for (const entry of updateTargets) {
          if (!entry.hasAccount) {
            const accountEmail = allocateAccountEmail(
              entry.row.email ?? entry.existingEmail,
              entry.row.username || entry.existingNisn,
              entry.row.nama,
            );
            accountsToCreate.push({
              nama: entry.row.nama,
              email: accountEmail,
              sekolahId,
              siswaId: entry.id,
              peran: "SISWA",
              passwordHash: entry.passwordHash,
              aktif: true,
              wajibGantiPassword: true,
            });
          }
        }
      }

      // 5. Bulk create new students and auto-generated LMS accounts
      if (createTargets.length > 0) {
        const siswaToCreate = createTargets.map((entry) => {
          const accountEmail = allocateAccountEmail(
            entry.row.email,
            entry.row.username || entry.resolvedNisn,
            entry.row.nama,
          );
          accountsToCreate.push({
            nama: entry.row.nama,
            email: accountEmail,
            sekolahId,
            siswaId: entry.id,
            peran: "SISWA",
            passwordHash: entry.passwordHash,
            aktif: true,
            wajibGantiPassword: true,
          });
          return {
            id: entry.id,
            nisn: entry.resolvedNisn,
            nama: entry.row.nama,
            kelasId: entry.kelasId,
            email: entry.row.email ?? accountEmail,
            telepon: entry.row.telepon ?? null,
            nik: entry.row.nik ?? null,
            tempatLahir: entry.row.tempatLahir ?? null,
            tanggalLahir: entry.row.tanggalLahir ?? null,
            jenisKelamin: entry.row.jenisKelamin ?? null,
            jenjang: entry.row.jenjang ?? null,
            tanggalMasuk: entry.row.tanggalMasuk ?? null,
            jalurPendaftaran: entry.row.jalurPendaftaran ?? null,
            namaAyah: entry.row.namaAyah ?? null,
            teleponAyah: entry.row.teleponAyah ?? null,
            pekerjaanAyah: entry.row.pekerjaanAyah ?? null,
            namaIbu: entry.row.namaIbu ?? null,
            namaIbuKandung: entry.row.namaIbu ?? null,
            teleponIbu: entry.row.teleponIbu ?? null,
            pekerjaanIbu: entry.row.pekerjaanIbu ?? null,
            namaWali: entry.row.namaWali ?? null,
            teleponWali: entry.row.teleponWali ?? null,
            pekerjaanWali: entry.row.pekerjaanWali ?? null,
            alamatLengkap: entry.row.alamatLengkap ?? null,
            sumberDapodik: true,
            sekolahId,
            status: "Aktif",
          };
        });
        await tx.siswa.createMany({ data: siswaToCreate });
      }

      if (accountsToCreate.length > 0) {
        await tx.akun.createMany({ data: accountsToCreate, skipDuplicates: true });
      }

      return {
        created: createTargets.length,
        updated: updateTargets.length,
        skippedEmpty: parsed.skippedEmpty,
        accountsCreated: accountsToCreate.length,
        matchedClasses,
        createdClasses,
        unmatchedClasses: Array.from(unmatchedClassesSet),
        withoutClassCount,
      };
    }, { timeout: 30000 });

    return res.json(result);
  } catch (error) {
    if (error instanceof Error && (error.message === "NISN_CONFLICT" || error.message === "IMPORT_CONFLICT" || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"))) {
      return res.status(409).json({ error: "Impor dibatalkan karena ada konflik NISN dengan sekolah lain. Periksa file atau hubungi master admin." });
    }
    console.error("Gagal mengimpor siswa:", error);
    return res.status(503).json({ error: "Impor belum dapat disimpan. Tidak ada perubahan data." });
  }
});

app.post("/api/sekolah/guru", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const data = parseTeacher(req.body);
    if (!data) return res.status(400).json({ error: "Periksa nama, email, telepon, mata pelajaran, dan NUPTK (16 angka jika diisi)." });
    await prisma.guru.create({ data: { ...data, status: "Aktif", sekolahId } });
    return res.status(201).json({ message: "Data guru disimpan. Akun guru belum dibuat." });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "NUPTK sudah terdaftar. Periksa data atau hubungi master admin." });
    console.error("Gagal menyimpan data guru:", error);
    return res.status(503).json({ error: "Data guru belum dapat disimpan." });
  }
});

app.get("/api/ppdb/:slug", async (req, res) => {
  if (req.tenant?.kind === "school" && req.params.slug !== req.tenant.slug) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
  try {
    const sekolah = req.params.slug === SANDBOX_SLUG
      ? await resolveSchoolWithSandboxSeed(prisma, req.params.slug)
      : await prisma.sekolah.findUnique({ where: { slug: req.params.slug }, select: { nama: true } });
    if (!sekolah) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
    return res.json({ nama: sekolah.nama });
  } catch (error) {
    console.error("Gagal memuat sekolah PPDB:", error);
    return res.status(503).json({ error: "PPDB belum dapat dimuat." });
  }
});

async function handlePublicPpdbSubmission(req: express.Request, res: express.Response) {
  const slug = String(req.params.slug ?? "").trim().toLowerCase();
  if (!slug || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    return res.status(400).json({ error: "Subdomain sekolah tidak valid." });
  }
  if (req.tenant?.kind === "school" && slug !== req.tenant.slug) {
    return res.status(404).json({ error: "Sekolah tidak ditemukan." });
  }
  const clientIp = loginIp(req);
  const memLimit = ppdbSubmissionLimiter.consume(clientIp);
  if (!memLimit.allowed) {
    res.setHeader("Retry-After", String(memLimit.retryAfter));
    return res.status(429).json({ error: "Terlalu banyak pengiriman pendaftaran PPDB. Coba lagi beberapa menit lagi." });
  }
  if (production && process.env.VERCEL) {
    try {
      const limit = await limitProductionPpdb(clientIp);
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfter));
        return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi nanti." });
      }
    } catch (error) {
      console.error("Pembatas PPDB tidak tersedia:", error instanceof Error ? error.name : "UnknownError");
      return res.status(503).json({ error: "Perlindungan PPDB tidak tersedia." });
    }
  }
  const data = parseApplicant(req.body);
  if (!data) return res.status(400).json({ error: "Periksa nama, email, telepon, alamat, dan jenjang." });
  try {
    const school = slug === SANDBOX_SLUG
      ? await resolveSchoolWithSandboxSeed(prisma, slug)
      : await prisma.sekolah.findUnique({ where: { slug }, select: { id: true } });
    if (!school) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
    await prisma.pPDB.create({ data: { ...data, sekolahId: school.id, noDaftar: randomBytes(16).toString("hex"), status: "Pending" } });
    return res.status(201).json({ message: "Pendaftaran diterima dan menunggu pemeriksaan admin sekolah." });
  } catch (error) {
    console.error("Gagal menyimpan PPDB:", error);
    return res.status(503).json({ error: "Pendaftaran belum dapat disimpan." });
  }
}

app.post("/api/ppdb/:slug", handlePublicPpdbSubmission);
app.post("/api/public/:slug/ppdb", handlePublicPpdbSubmission);

app.post("/api/sekolah/ppdb/:id/tinjau", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!session || !sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const { keputusan, catatan } = req.body || {};
    if ((keputusan !== "Diterima" && keputusan !== "Ditolak") || typeof catatan !== "string" || catatan.trim().length > 500 || (keputusan === "Ditolak" && !catatan.trim())) return res.status(400).json({ error: "Keputusan tidak valid atau catatan penolakan belum diisi." });
    const result = await prisma.pPDB.updateMany({ where: { id: req.params.id, sekolahId, status: "Pending" }, data: { status: keputusan, catatanTinjauan: catatan.trim() || null, ditinjauPada: new Date(), ditinjauOlehId: session.akun.id } });
    if (!result.count) return res.status(409).json({ error: "Pendaftaran tidak ditemukan atau sudah ditinjau. Muat ulang daftar." });
    return res.json({ message: "Keputusan disimpan. Data siswa dan akun belum dibuat." });
  } catch (error) {
    console.error("Gagal meninjau PPDB:", error);
    return res.status(503).json({ error: "Keputusan belum dapat disimpan." });
  }
});

app.use("/api/sekolah/akademik", academicRoutes(async (req) => (await getSession(req, "ADMIN"))?.akun.sekolahId ?? null));

app.get("/api/sekolah/ringkasan", async (req, res) => {
  try {
    const sekolahId = (await getSession(req, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const [siswa, guru, kelas, ppdb, ppdbDiterima, ppdbDitolak] = await Promise.all([
      prisma.siswa.count({ where: { sekolahId, status: "Aktif" } }),
      prisma.guru.count({ where: { sekolahId, status: "Aktif" } }),
      prisma.kelas.count({ where: { sekolahId } }),
      prisma.pPDB.count({ where: { sekolahId, status: "Pending" } }),
      prisma.pPDB.count({ where: { sekolahId, status: "Diterima" } }),
      prisma.pPDB.count({ where: { sekolahId, status: "Ditolak" } }),
    ]);
    return res.json({ siswa, guru, kelas, ppdb, ppdbDiterima, ppdbDitolak });
  } catch (error) {
    console.error("Gagal memuat ringkasan sekolah:", error);
    return res.status(503).json({ error: "Ringkasan sekolah belum dapat dimuat." });
  }
});

app.post("/api/sekolah/kelas-standar", async (req, res) => {
  try {
    const sekolahId = (await getSession(req, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    await prisma.$transaction(async (tx) => {
      const schools = await tx.$queryRaw<{ kelasStandarDibuat: boolean }[]>`SELECT "kelasStandarDibuat" FROM "Sekolah" WHERE "id" = ${sekolahId} FOR UPDATE`;
      if (!schools.length) throw new Error("SCHOOL_MISSING");
      if (schools[0].kelasStandarDibuat) return;
      const existing = await tx.kelas.findMany({ where: { sekolahId }, select: { nama: true }, take: 501 });
      const names: string[] = [];
      for (let grade = 1; grade <= 12; grade++) {
        const paket = grade <= 6 ? "A" : grade <= 9 ? "B" : "C";
        const candidates = existing.filter((item) => {
          const name = item.nama.trim().replace(/\s+/g, " ").toLowerCase();
          return name === `kelas ${grade}` || name === `paket ${paket.toLowerCase()} kelas ${grade}`;
        });
        if (candidates.length > 1) throw new Error(`AMBIGUOUS_CLASS:${grade}`);
        if (!candidates.length) names.push(`Paket ${paket} Kelas ${grade}`);
      }
      if (existing.length + names.length > 500) throw new Error("CLASS_LIMIT");
      if (names.length) await tx.kelas.createMany({ data: names.map((nama) => ({ nama, kode: randomBytes(16).toString("hex"), sekolahId, waliGuruId: null })) });
      await tx.sekolah.update({ where: { id: sekolahId }, data: { kelasStandarDibuat: true } });
    });
    return res.json({ message: "Kelas standar tersedia." });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("AMBIGUOUS_CLASS:")) return res.status(409).json({ error: `Ada lebih dari satu kelas standar untuk kelas ${error.message.split(":")[1]}. Ubah nama kelas yang duplikat di Manajemen Kelas.` });
    if (error instanceof Error && error.message === "CLASS_LIMIT") return res.status(409).json({ error: "Kelas standar tidak dapat dibuat karena batas 500 kelas akan terlampaui." });
    console.error("Gagal menyiapkan kelas standar:", error);
    return res.status(503).json({ error: "Kelas standar belum dapat disiapkan. Coba lagi." });
  }
});

app.get("/api/sekolah/kelas", async (req, res) => {
  try {
    const sekolahId = (await getSession(req, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const [kelas, guru, counts, activeStudents] = await Promise.all([
      prisma.kelas.findMany({ where: { sekolahId }, select: { id: true, nama: true, waliGuruId: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 501 }),
      prisma.guru.findMany({ where: { sekolahId, status: "Aktif" }, select: { id: true, nama: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 501 }),
      prisma.siswa.groupBy({ by: ["kelasId"], where: { sekolahId, status: "Aktif", kelasId: { not: null } }, _count: { _all: true } }),
      prisma.siswa.findMany({
        where: { sekolahId, status: "Aktif", kelasId: { not: null } },
        select: { id: true, nama: true, nisn: true, kelasId: true },
        orderBy: [{ nama: "asc" }, { id: "asc" }],
        take: 2500,
      }),
    ]);
    if (kelas.length > 500 || guru.length > 500) return res.status(409).json({ error: "Pengaturan kelas mendukung maksimal 500 kelas dan 500 guru aktif." });
    const jumlah = new Map(counts.map((item) => [item.kelasId, item._count._all]));
    const previewMap = new Map<string, Array<{ id: string; nama: string; nisn: string }>>();
    for (const student of activeStudents) {
      if (!student.kelasId) continue;
      const list = previewMap.get(student.kelasId) ?? [];
      if (list.length < 4) {
        list.push({ id: student.id, nama: student.nama, nisn: student.nisn });
        previewMap.set(student.kelasId, list);
      }
    }
    return res.json({
      kelas: kelas.map((item) => ({
        ...item,
        jumlahSiswa: jumlah.get(item.id) ?? 0,
        siswaPreview: previewMap.get(item.id) ?? [],
      })),
      guru,
    });
  } catch (error) {
    console.error("Gagal memuat pengaturan kelas:", error);
    return res.status(503).json({ error: "Pengaturan kelas belum dapat dimuat." });
  }
});

app.get("/api/sekolah/kelas/:id/siswa", async (req, res) => {
  try {
    const sekolahId = (await getSession(req, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const kelas = await prisma.kelas.findFirst({
      where: { id: req.params.id, sekolahId },
      select: { id: true, nama: true, waliGuruId: true },
    });
    if (!kelas) return res.status(404).json({ error: "Kelas tidak ditemukan di sekolah ini." });
    const [wali, siswa] = await Promise.all([
      kelas.waliGuruId
        ? prisma.guru.findFirst({ where: { id: kelas.waliGuruId, sekolahId }, select: { nama: true } })
        : Promise.resolve(null),
      prisma.siswa.findMany({
        where: { sekolahId, kelasId: kelas.id, status: "Aktif" },
        select: {
          id: true,
          nama: true,
          nisn: true,
          jenisKelamin: true,
          telepon: true,
          akun: { select: { aktif: true, peran: true, sekolahId: true, guruId: true } },
        },
        orderBy: [{ nama: "asc" }, { id: "asc" }],
      }),
    ]);
    return res.json({
      kelas: { id: kelas.id, nama: kelas.nama, wali: wali?.nama ?? null },
      siswa: siswa.map((item) => ({
        id: item.id,
        nama: item.nama,
        nisn: item.nisn,
        jenisKelamin: item.jenisKelamin ?? null,
        telepon: item.telepon ?? null,
        statusAkun: !item.akun
          ? "Belum ada akun"
          : item.akun.aktif && item.akun.peran === "SISWA" && item.akun.sekolahId === sekolahId && !item.akun.guruId
            ? "Akun aktif"
            : "Akun tidak aktif",
      })),
    });
  } catch (error) {
    console.error("Gagal memuat daftar siswa kelas:", error);
    return res.status(503).json({ error: "Daftar siswa kelas belum dapat dimuat." });
  }
});

app.post("/api/sekolah/kelas", async (req, res) => {
  try {
    const sekolahId = (await getSession(req, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const data = parseClass(req.body);
    if (!data) return res.status(400).json({ error: "Nama kelas atau wali kelas tidak valid." });
    const kelas = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Sekolah" WHERE "id" = ${sekolahId} FOR UPDATE`;
      if (data.waliGuruId && !await tx.guru.findFirst({ where: { id: data.waliGuruId, sekolahId, status: "Aktif" }, select: { id: true } })) throw new Error("INVALID_TEACHER");
      if (await tx.kelas.count({ where: { sekolahId } }) >= 500) throw new Error("CLASS_LIMIT");
      return tx.kelas.create({ data: { ...data, kode: randomBytes(16).toString("hex"), sekolahId }, select: { id: true, nama: true, waliGuruId: true } });
    });
    return res.status(201).json(kelas);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_TEACHER") return res.status(400).json({ error: "Wali kelas aktif tidak ditemukan di sekolah ini." });
    if (error instanceof Error && error.message === "CLASS_LIMIT") return res.status(409).json({ error: "Batas 500 kelas telah tercapai." });
    console.error("Gagal membuat kelas:", error);
    return res.status(503).json({ error: "Kelas belum dapat dibuat." });
  }
});

app.patch("/api/sekolah/kelas/:id", async (req, res) => {
  try {
    const sekolahId = (await getSession(req, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const data = parseClass(req.body);
    if (!data) return res.status(400).json({ error: "Nama kelas atau wali kelas tidak valid." });
    if (data.waliGuruId && !await prisma.guru.findFirst({ where: { id: data.waliGuruId, sekolahId, status: "Aktif" }, select: { id: true } })) return res.status(400).json({ error: "Wali kelas aktif tidak ditemukan di sekolah ini." });
    const updated = await prisma.kelas.updateMany({ where: { id: req.params.id, sekolahId }, data });
    if (!updated.count) return res.status(404).json({ error: "Kelas tidak ditemukan di sekolah ini." });
    return res.json({ message: "Kelas diperbarui." });
  } catch (error) {
    console.error("Gagal memperbarui kelas:", error);
    return res.status(503).json({ error: "Kelas belum dapat diperbarui." });
  }
});

app.delete("/api/sekolah/kelas/:id", async (req, res) => {
  try {
    const sekolahId = (await getSession(req, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Kelas" WHERE "id" = ${req.params.id} AND "sekolahId" = ${sekolahId} FOR UPDATE`;
      if (!locked.length) return "missing";
      if (await tx.siswa.count({ where: { kelasId: req.params.id } })) return "used";
      await tx.kelas.deleteMany({ where: { id: req.params.id, sekolahId } });
      return "deleted";
    });
    if (result === "missing") return res.status(404).json({ error: "Kelas tidak ditemukan." });
    if (result === "used") return res.status(409).json({ error: "Kelas masih digunakan siswa dan tidak dapat dihapus." });
    return res.json({ message: "Kelas dihapus." });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2003" || error.code === "P2014")) return res.status(409).json({ error: "Kelas masih digunakan data akademik dan tidak dapat dihapus." });
    console.error("Gagal menghapus kelas:", error);
    return res.status(503).json({ error: "Kelas belum dapat dihapus." });
  }
});

app.get("/api/sekolah/penempatan-siswa", async (req, res) => {
  try {
    const sekolahId = (await getSession(req, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const nisn = req.query.nisn;
    if (typeof nisn !== "string" || !/^\d{10}$/.test(nisn)) return res.status(400).json({ error: "NISN harus terdiri dari 10 angka." });
    const siswa = await prisma.siswa.findFirst({ where: { nisn, sekolahId, status: "Aktif" }, select: { id: true, nama: true, nisn: true, kelasId: true } });
    if (!siswa) return res.status(404).json({ error: "Siswa aktif tidak ditemukan di sekolah ini." });
    return res.json(siswa);
  } catch (error) {
    console.error("Gagal mencari siswa untuk penempatan:", error);
    return res.status(503).json({ error: "Pencarian siswa belum tersedia." });
  }
});

app.get("/api/sekolah/kenaikan-kelas", async (req, res) => {
  try {
    const sekolahId = (await getSession(req, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const kelasId = req.query.kelasId;
    if (kelasId !== undefined && (typeof kelasId !== "string" || !kelasId || kelasId.length > 100 || kelasId !== kelasId.trim())) return res.status(400).json({ error: "Kelas asal tidak valid." });
    if (typeof kelasId === "string" && !await prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true } })) return res.status(404).json({ error: "Kelas asal tidak ditemukan di sekolah ini." });
    const [counts, siswa] = await Promise.all([
      prisma.siswa.groupBy({ by: ["kelasId"], where: { sekolahId, status: "Aktif", kelasId: { not: null } }, _count: { _all: true } }),
      typeof kelasId === "string" ? prisma.siswa.findMany({ where: { sekolahId, kelasId, status: "Aktif" }, select: { id: true, nama: true, nisn: true, akun: { select: { aktif: true, peran: true, sekolahId: true, guruId: true } } }, orderBy: [{ nama: "asc" }, { id: "asc" }] }) : Promise.resolve([]),
    ]);
    return res.json({
      counts: counts.map((item) => ({ kelasId: item.kelasId, jumlah: item._count._all })),
      siswa: siswa.map((item) => ({ id: item.id, nama: item.nama, nisn: item.nisn, statusAkun: !item.akun ? "Belum ada akun" : item.akun.aktif && item.akun.peran === "SISWA" && item.akun.sekolahId === sekolahId && !item.akun.guruId ? "Akun aktif" : "Akun tidak aktif" })),
    });
  } catch (error) {
    console.error("Gagal memuat data kenaikan kelas:", error);
    return res.status(503).json({ error: "Data kenaikan kelas belum dapat dimuat." });
  }
});

app.post("/api/sekolah/penempatan-massal", async (req, res) => {
  try {
    const sekolahId = (await getSession(req, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const kelasId = req.body?.kelasId;
    const students: unknown = req.body?.siswa;
    if (typeof kelasId !== "string" || !parsePlacement({ kelasId, expectedKelasId: null }) || !Array.isArray(students) || students.length < 1 || students.length > 50) return res.status(400).json({ error: "Pilih kelas dan 1 sampai 50 siswa." });
    const parsed: { id: string; expectedKelasId: string | null }[] = [];
    for (const student of students) {
      if (typeof student !== "object" || student === null || Array.isArray(student) || typeof student.id !== "string" || !student.id || student.id.length > 100 || student.id !== student.id.trim()) return res.status(400).json({ error: "Data siswa tidak valid." });
      const placement = parsePlacement({ kelasId, expectedKelasId: student.expectedKelasId });
      if (!placement || parsed.some((item) => item.id === student.id)) return res.status(400).json({ error: "Data siswa atau kelas asal tidak valid." });
      parsed.push({ id: student.id, expectedKelasId: placement.expectedKelasId });
    }
    await prisma.$transaction(async (tx) => {
      const kelas = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Kelas" WHERE "id" = ${kelasId} AND "sekolahId" = ${sekolahId} FOR UPDATE`;
      if (!kelas.length) throw new Error("INVALID_CLASS");
      for (const student of parsed.sort((a, b) => a.id.localeCompare(b.id))) {
        const updated = await tx.siswa.updateMany({ where: { id: student.id, sekolahId, status: "Aktif", kelasId: student.expectedKelasId }, data: { kelasId } });
        if (updated.count !== 1) throw new Error("PLACEMENT_CONFLICT");
      }
    });
    return res.json({ updated: parsed.length });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CLASS") return res.status(400).json({ error: "Kelas tidak ditemukan di sekolah ini." });
    if (error instanceof Error && error.message === "PLACEMENT_CONFLICT") return res.status(409).json({ error: "Siswa tidak aktif, tidak ditemukan, atau kelasnya sudah berubah. Tidak ada siswa yang dipindahkan; muat ulang daftar." });
    console.error("Gagal menyimpan penempatan massal:", error);
    return res.status(503).json({ error: "Penempatan belum dapat dipastikan. Muat ulang daftar sebelum mencoba lagi." });
  }
});

app.patch("/api/sekolah/siswa/:id/kelas", async (req, res) => {
  try {
    const sekolahId = (await getSession(req, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const data = parsePlacement(req.body);
    if (!data) return res.status(400).json({ error: "Pilih kelas atau kosongkan penempatan." });
    const updated = await prisma.$transaction(async (tx) => {
      if (data.kelasId) {
        const kelas = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Kelas" WHERE "id" = ${data.kelasId} AND "sekolahId" = ${sekolahId} FOR UPDATE`;
        if (!kelas.length) throw new Error("INVALID_CLASS");
      }
      return tx.siswa.updateMany({ where: { id: req.params.id, sekolahId, status: "Aktif", kelasId: data.expectedKelasId }, data: { kelasId: data.kelasId } });
    });
    if (!updated.count) return res.status(409).json({ error: "Siswa tidak ditemukan atau penempatan sudah berubah. Cari kembali siswa." });
    return res.json({ message: "Penempatan siswa disimpan." });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CLASS") return res.status(400).json({ error: "Kelas tidak ditemukan di sekolah ini." });
    console.error("Gagal menyimpan penempatan siswa:", error);
    return res.status(503).json({ error: "Penempatan siswa belum dapat disimpan." });
  }
});

app.get("/api/sekolah/:jenis", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const pageValue = req.query.page;
    const limitValue = req.query.limit;
    if (pageValue !== undefined && (typeof pageValue !== "string" || !/^[1-9]\d{0,5}$/.test(pageValue))) return res.status(400).json({ error: "Nomor halaman tidak valid." });
    if (limitValue !== undefined && limitValue !== "10" && limitValue !== "25" && limitValue !== "50") return res.status(400).json({ error: "Ukuran halaman tidak valid." });
    const page = pageValue === undefined ? 1 : Number(pageValue);
    const pageSize = limitValue === undefined ? 25 : Number(limitValue);
    const pagination = { skip: (page - 1) * pageSize, take: pageSize + 1 };
    let rows: { id: string; nama: string; keterangan: string; status: string; kelasId?: string | null; punyaAkun?: boolean; username?: string; email?: string; telepon?: string; alamat?: string; jenjang?: string; catatan?: string | null }[];
    let total: number;
    if (req.params.jenis === "siswa") {
      const filter = req.query.kelas;
      const active = req.query.aktif;
      const search = req.query.q;
      if (filter !== undefined && filter !== "semua" && filter !== "belum" && filter !== "sudah") return res.status(400).json({ error: "Filter kelas tidak valid." });
      if (active !== undefined && active !== "1") return res.status(400).json({ error: "Filter status tidak valid." });
      if (search !== undefined && (typeof search !== "string" || search.trim().length > 100)) return res.status(400).json({ error: "Pencarian maksimal 100 karakter." });
      const term = typeof search === "string" ? search.trim().replace(/[\\%_]/g, "\\$&") : "";
      const where: Prisma.SiswaWhereInput = {
        sekolahId,
        ...(active === "1" ? { status: "Aktif" } : {}),
        ...(filter === "belum" ? { kelasId: null } : filter === "sudah" ? { kelasId: { not: null } } : {}),
        ...(term ? { OR: [{ nama: { contains: term, mode: "insensitive" } }, { nisn: { contains: term, mode: "insensitive" } }] } : {}),
      };
      const [data, count] = await Promise.all([
        prisma.siswa.findMany({ where, select: { id: true, nama: true, nisn: true, kelasId: true, status: true, akun: { select: { id: true, aktif: true, email: true } } }, orderBy: { id: "asc" }, ...pagination }),
        prisma.siswa.count({ where }),
      ]);
      rows = data.map((item) => ({
        id: item.id,
        nama: item.nama,
        keterangan: item.nisn,
        kelasId: item.kelasId,
        status: item.status,
        punyaAkun: Boolean(item.akun?.aktif),
        username: item.nisn.trim() || item.akun?.email || "",
      }));
      total = count;
    } else if (req.params.jenis === "guru") {
      const search = req.query.q;
      if (search !== undefined && (typeof search !== "string" || search.trim().length > 100)) return res.status(400).json({ error: "Pencarian maksimal 100 karakter." });
      const term = typeof search === "string" ? search.trim().replace(/[\\%_]/g, "\\$&") : "";
      const where: Prisma.GuruWhereInput = {
        sekolahId,
        ...(term ? { OR: [
          { nama: { contains: term, mode: "insensitive" } },
          { nuptk: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
        ] } : {}),
      };
      const [data, count] = await Promise.all([
        prisma.guru.findMany({ where, select: { id: true, nama: true, nuptk: true, email: true, status: true, akun: { select: { id: true } } }, orderBy: { id: "asc" }, ...pagination }),
        prisma.guru.count({ where }),
      ]);
      rows = data.map((item) => ({ id: item.id, nama: item.nama, keterangan: item.nuptk || "Belum ada", email: item.email, status: item.status, punyaAkun: !!item.akun }));
      total = count;
    } else if (req.params.jenis === "ppdb") {
      const [data, count] = await Promise.all([
        prisma.pPDB.findMany({ where: { sekolahId }, select: { id: true, nama: true, noDaftar: true, status: true, email: true, telepon: true, alamat: true, jenjang: true, catatanTinjauan: true }, orderBy: { id: "asc" }, ...pagination }),
        prisma.pPDB.count({ where: { sekolahId } }),
      ]);
      rows = data.map((item) => ({ id: item.id, nama: item.nama, keterangan: item.noDaftar, status: item.status, email: item.email, telepon: item.telepon, alamat: item.alamat, jenjang: item.jenjang, catatan: item.catatanTinjauan }));
      total = count;
    } else return res.status(404).json({ error: "Menu tidak ditemukan." });
    return res.json({ rows: rows.slice(0, pageSize), page, pageSize, hasNext: rows.length > pageSize, total });
  } catch (error) {
    console.error("Gagal memuat data sekolah:", error);
    return res.status(503).json({ error: "Data sekolah belum dapat dimuat." });
  }
});

app.get("/api/auth/master/session", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    return res.json({ nama: session.akun.nama, peran: session.akun.peran });
  } catch (error) {
    console.error("Gagal memeriksa sesi:", error);
    return res.status(503).json({ error: "Layanan sesi tidak tersedia." });
  }
});

app.post("/api/auth/master/logout", async (req, res) => {
  try {
    const session = await getSession(req);
    if (session) await prisma.sesiAkun.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    res.clearCookie(cookieName, cookieOptions());
    return res.status(204).end();
  } catch (error) {
    console.error("Gagal mengakhiri sesi:", error);
    return res.status(503).json({ error: "Gagal mengakhiri sesi." });
  }
});

app.get("/api/master/summary", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const [sekolah, adminSekolah] = await prisma.$transaction([
      prisma.sekolah.count(),
      prisma.akun.count({ where: { peran: "ADMIN", sekolahId: { not: null } } }),
    ]);
    return res.json({ sekolah, adminSekolah });
  } catch (error) {
    console.error("Gagal memuat ringkasan master:", error);
    return res.status(503).json({ error: "Ringkasan tidak tersedia. Coba lagi nanti." });
  }
});

app.get("/api/master/tema", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const themeKey = await getGlobalTheme(prisma);
    return res.json({ themeKey, themes: GLOBAL_THEME_OPTIONS });
  } catch (error) {
    console.error("Gagal memuat tema global:", error);
    return res.status(503).json({ error: "Tema global belum dapat dimuat." });
  }
});

app.patch("/api/master/tema", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const rawTheme = req.body?.themeKey;
    if (!isGlobalThemeKey(rawTheme)) {
      return res.status(400).json({ error: "Pilihan tema tidak valid. Gunakan ocean, violet, emerald, sunset, atau dark." });
    }
    const result = await setGlobalTheme(prisma, rawTheme);
    const label = GLOBAL_THEME_OPTIONS.find((item) => item.key === result.themeKey)?.label ?? result.themeKey;
    return res.json({
      success: true,
      themeKey: result.themeKey,
      updated: result.updatedSchools,
      message: `Tema global platform berhasil diubah ke ${label} untuk seluruh paket & tenant.`,
    });
  } catch (error) {
    console.error("Gagal memperbarui tema global:", error);
    return res.status(503).json({ error: "Tema global belum dapat diperbarui." });
  }
});

app.get("/api/master/sekolah", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const pageValue = req.query.page;
    if (pageValue !== undefined && (typeof pageValue !== "string" || !/^[1-9]\d{0,5}$/.test(pageValue))) {
      return res.status(400).json({ error: "Nomor halaman tidak valid." });
    }
    const page = pageValue === undefined ? 1 : Number(pageValue);
    const pageSize = 25;
    let schools: Array<{
      id: string;
      nama: string;
      slug: string;
      npsn: string | null;
      plan: string | null;
      status: string;
      kabupatenKota?: string | null;
      izinVervalDinas?: boolean;
      createdAt: Date;
    }>;
    try {
      schools = await prisma.sekolah.findMany({
        select: { id: true, nama: true, slug: true, npsn: true, plan: true, status: true, kabupatenKota: true, izinVervalDinas: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize + 1,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") {
        schools = await prisma.sekolah.findMany({
          select: { id: true, nama: true, slug: true, npsn: true, plan: true, status: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize + 1,
        });
      } else {
        throw err;
      }
    }
    return res.json({
      sekolah: schools.slice(0, pageSize).map((school) => ({
        ...school,
        plan: normalizeTenantPlan(school.plan),
        kabupatenKota: school.kabupatenKota ?? null,
        izinVervalDinas: school.izinVervalDinas ?? true,
      })),
      page,
      hasNext: schools.length > pageSize,
    });
  } catch (error) {
    console.error("Gagal memuat daftar sekolah:", error);
    return res.status(503).json({ error: "Daftar sekolah tidak tersedia. Coba lagi nanti." });
  }
});

app.post("/api/master/sekolah", async (req, res) => {
  try {
    const session = await getSession(req, "MASTER_ADMIN");
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });

    const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {}) as Record<string, unknown>;
    const nama = typeof body.nama === "string" ? body.nama.trim() : "";
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const npsn = typeof body.npsn === "string" ? body.npsn.trim().toUpperCase() : "";
    const adminName = typeof body.adminName === "string" ? body.adminName.trim() : "";
    const adminEmail = typeof body.adminEmail === "string" ? body.adminEmail.trim().toLowerCase() : "";
    const adminPassword = typeof body.adminPassword === "string" ? body.adminPassword : "";
    const plan = toCleanPlanCode(body.plan ?? body.paket) ?? "reguler";
    const isiKontenSiapPakai = body.isiKontenSiapPakai === true || body.seedMasterContent === true;

    if (!nama || nama.length < 3 || nama.length > 200) {
      return res.status(400).json({ error: "Nama sekolah wajib diisi (3–200 karakter)." });
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) || slug === "www") {
      return res.status(400).json({ error: "Subdomain/slug tidak valid (gunakan huruf kecil, angka, atau strip)." });
    }
    if (npsn && !/^(?:\d{8}|[PK]\d{7})$/.test(npsn)) {
      return res.status(400).json({ error: "Format NPSN tidak valid (8 digit atau awalan P/K + 7 digit)." });
    }
    if (!adminName || adminName.length < 2 || !adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      return res.status(400).json({ error: "Nama dan email admin sekolah wajib diisi dengan format valid." });
    }
    if (!isValidPasswordLength(adminPassword)) {
      return res.status(400).json({ error: "Kata sandi admin minimal 6 karakter." });
    }

    const passwordHash = await hashPassword(adminPassword);
    const globalTheme = await getGlobalTheme(prisma);
    const createdSchool = await prisma.$transaction(async (tx) => {
      const school = await tx.sekolah.create({
        data: {
          nama,
          slug,
          npsn: npsn || null,
          status: "ACTIVE",
          plan,
          themeKey: globalTheme,
        },
        select: { id: true, nama: true, slug: true, npsn: true, plan: true, status: true },
      });
      await tx.akun.create({
        data: {
          sekolahId: school.id,
          nama: adminName,
          email: adminEmail,
          passwordHash,
          peran: "ADMIN",
          aktif: true,
          wajibGantiPassword: false,
        },
      });
      return school;
    });

    let seedSummary = null;
    if (isiKontenSiapPakai) {
      try {
        seedSummary = await cloneMasterContentToSchool(prisma, {
          sekolahId: createdSchool.id,
          copyAll: true,
        });
      } catch (seedError) {
        console.warn("Auto-salin Pustaka Konten Pusat saat pembuatan sekolah gagal:", seedError);
      }
    }

    return res.status(201).json({
      sekolah: createdSchool,
      seedSummary,
      message: seedSummary
        ? `Sekolah ${createdSchool.nama} berhasil dibuat beserta ${seedSummary.copiedModul} modul & ${seedSummary.copiedBankSoal} paket soal dari Pustaka Pusat.`
        : `Sekolah ${createdSchool.nama} berhasil dibuat.`,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "Slug, NPSN, atau email admin sudah terdaftar." });
    }
    console.error("Gagal membuat tenant sekolah baru:", error);
    return res.status(503).json({ error: "Sekolah baru belum dapat dibuat." });
  }
});

app.patch("/api/master/sekolah/:id/wilayah", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const rawKab = req.body?.kabupatenKota;
    const rawIzin = req.body?.izinVervalDinas;
    if (rawKab !== undefined && rawKab !== null && typeof rawKab !== "string") {
      return res.status(400).json({ error: "Kabupaten/Kota tidak valid." });
    }
    const kabupatenKota = typeof rawKab === "string" ? rawKab.trim() : undefined;
    if (kabupatenKota && kabupatenKota.length > 150) {
      return res.status(400).json({ error: "Nama kabupaten/kota maksimal 150 karakter." });
    }
    if (rawIzin !== undefined && typeof rawIzin !== "boolean") {
      return res.status(400).json({ error: "Status izin verval Dinas harus berupa boolean." });
    }
    const updated = await prisma.sekolah.update({
      where: { id: req.params.id },
      data: {
        ...(kabupatenKota !== undefined ? { kabupatenKota: kabupatenKota || null } : {}),
        ...(typeof rawIzin === "boolean" ? { izinVervalDinas: rawIzin } : {}),
      },
      select: { id: true, kabupatenKota: true, izinVervalDinas: true },
    });
    return res.json({ message: "Wilayah verval Dinas PKBM diperbarui.", sekolah: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ error: "Tenant sekolah tidak ditemukan." });
    }
    console.error("Gagal memperbarui wilayah sekolah:", error);
    return res.status(503).json({ error: "Wilayah sekolah belum dapat diperbarui." });
  }
});

app.get("/api/master/dinas-akun", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const rows = await prisma.akun.findMany({
      where: { peran: "DINAS" },
      select: { id: true, nama: true, email: true, wilayahKabupaten: true, aktif: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    });
    return res.json({ akun: rows });
  } catch (error) {
    console.error("Gagal memuat akun Dinas Pendidikan:", error);
    return res.status(503).json({ error: "Daftar akun Dinas belum tersedia." });
  }
});

app.post("/api/master/dinas-akun", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const { nama, email, wilayahKabupaten, password } = req.body || {};
    if (
      typeof nama !== "string" || nama.trim().length < 2 || nama.trim().length > 200 ||
      typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254 ||
      typeof wilayahKabupaten !== "string" || wilayahKabupaten.trim().length < 2 || wilayahKabupaten.trim().length > 150 ||
      typeof password !== "string" || !isValidPasswordLength(password)
    ) {
      return res.status(400).json({ error: "Periksa nama, email valid, wilayah kabupaten/kota, dan password (6-1024 karakter)." });
    }
    const passwordHash = await hashPassword(password);
    const created = await prisma.akun.create({
      data: {
        nama: nama.trim(),
        email: email.trim().toLowerCase(),
        wilayahKabupaten: wilayahKabupaten.trim(),
        passwordHash,
        peran: "DINAS",
        aktif: true,
        wajibGantiPassword: false,
      },
      select: { id: true, nama: true, email: true, wilayahKabupaten: true, aktif: true, createdAt: true },
    });
    return res.status(201).json({ message: "Akun petugas Dinas Pendidikan berhasil dibuat.", akun: created });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "Email sudah terdaftar pada sistem." });
    }
    console.error("Gagal membuat akun Dinas Pendidikan:", error);
    return res.status(503).json({ error: "Akun Dinas Pendidikan belum dapat dibuat." });
  }
});

app.post("/api/master/sekolah/:id/paket", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const cleanPlan = toCleanPlanCode(req.body?.plan ?? req.body?.paket);
    if (!cleanPlan) {
      return res.status(400).json({ error: "Pilihan paket tidak valid. Pilih Paket Basic, Reguler, atau Pro." });
    }
    const school = await prisma.sekolah.findUnique({
      where: { id: req.params.id },
      select: { id: true, nama: true, slug: true, npsn: true },
    });
    if (!school) {
      return res.status(404).json({ error: "Tenant sekolah tidak ditemukan." });
    }

    await prisma.sekolah.update({
      where: { id: school.id },
      data: { plan: cleanPlan },
    });

    const configuredRemoteUrl = process.env.LMS_PROVISION_URL?.trim();
    const requestHost = (req.get("host") ?? "").trim().toLowerCase();
    let shouldSyncRemote = false;
    if (configuredRemoteUrl) {
      try {
        const remoteHost = new URL(configuredRemoteUrl).host.toLowerCase();
        shouldSyncRemote = Boolean(remoteHost && remoteHost !== requestHost);
      } catch {
        shouldSyncRemote = true;
      }
    }

    if (shouldSyncRemote) {
      const syncResult = await syncTenantPlanToLms({
        npsn: school.npsn,
        slug: school.slug,
        plan: cleanPlan,
      });
      if ("error" in syncResult) {
        return res.status(syncResult.status).json({
          error: `Database diperbarui ke ${cleanPlan}, namun sinkronisasi ke LMS eksternal gagal: ${syncResult.error}`,
        });
      }
      return res.json({
        success: true,
        plan: cleanPlan,
        message: syncResult.message,
      });
    }

    return res.json({
      success: true,
      plan: cleanPlan,
      message: `Paket ${school.nama} berhasil diperbarui ke ${cleanPlan.toUpperCase()}.`,
    });
  } catch (error) {
    console.error("Gagal menyinkronkan paket tenant ke LMS:", error);
    return res.status(503).json({ error: "Sinkronisasi paket tenant belum dapat diproses." });
  }
});

app.get("/api/master/pendaftaran-sekolah", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const pageValue = req.query.page;
    if (pageValue !== undefined && (typeof pageValue !== "string" || !/^[1-9]\d{0,5}$/.test(pageValue))) {
      return res.status(400).json({ error: "Nomor halaman tidak valid." });
    }
    const page = pageValue === undefined ? 1 : Number(pageValue);
    const pageSize = 25;
    const selectBase = { id: true, namaSekolah: true, npsn: true, wilayah: true, namaKontak: true, emailKontak: true, teleponKontak: true, status: true, catatanTinjauan: true, dibuatPada: true, sekolahId: true } as const;
    let items: Array<{ id: string; namaSekolah: string; npsn: string | null; wilayah: string | null; namaKontak: string; emailKontak: string; teleponKontak: string; status: string; paket?: string | null; catatanTinjauan: string | null; dibuatPada: Date; sekolahId: string | null }>;
    try {
      items = await prisma.pendaftaranSekolah.findMany({
        select: { ...selectBase, paket: true },
        orderBy: [{ dibuatPada: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize + 1,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
        const fallbackRows = await prisma.pendaftaranSekolah.findMany({
          select: selectBase,
          orderBy: [{ dibuatPada: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize + 1,
        });
        items = fallbackRows.map((item) => {
          const parsedPaket = extractPaketFromNote(item.catatanTinjauan);
          return parsedPaket ? { ...item, paket: parsedPaket } : item;
        });
      } else {
        throw error;
      }
    }
    return res.json({ pendaftaran: items.slice(0, pageSize), page, hasNext: items.length > pageSize });
  } catch (error) {
    console.error("Gagal memuat pendaftaran sekolah:", error);
    return res.status(503).json({ error: "Daftar pendaftaran tidak tersedia. Coba lagi nanti." });
  }
});

app.post("/api/master/pendaftaran-sekolah/:id/tinjau", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    return res.status(409).json({ error: "Verifikasi pendaftaran dilakukan melalui Rasyatech Admin." });
  } catch (error) {
    console.error("Gagal meninjau pendaftaran sekolah:", error);
    return res.status(503).json({ error: "Keputusan belum dapat disimpan. Coba lagi nanti." });
  }
});

app.delete("/api/master/pendaftaran-sekolah/:id", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const result = await prisma.$transaction(async (tx) => {
      const registration = await tx.pendaftaranSekolah.findUnique({
        where: { id: req.params.id },
        select: { sekolahId: true },
      });
      if (!registration) return "not-found";
      if (registration.sekolahId) {
        const sekolahId = registration.sekolahId;
        const [school, settings, accounts] = await Promise.all([
          tx.sekolah.findUnique({
            where: { id: sekolahId },
            select: {
              _count: {
                select: {
                  siswa: true, guru: true, mapel: true, kelas: true, ppdb: true, nilai: true,
                  tahunAjaran: true, jadwal: true, agenda: true, presensi: true, materi: true,
                  tugas: true, berkas: true, ujian: true,
                },
              },
            },
          }),
          tx.websiteSettings.findUnique({ where: { school_id: sekolahId }, select: { school_id: true } }),
          tx.akun.findMany({
            where: { sekolahId },
            select: {
              peran: true, siswaId: true, guruId: true,
              _count: { select: { tinjauan: true, tinjauanSekolah: true, berkas: true } },
            },
          }),
        ]);
        if (!school) return "not-found";
        if (settings || Object.values(school._count).some((count) => count > 0) ||
          accounts.some((account) => account.peran !== "ADMIN" || account.siswaId || account.guruId ||
            Object.values(account._count).some((count) => count > 0))) return "has-data";

        await tx.pendaftaranSekolah.delete({ where: { id: req.params.id }, select: { id: true } });
        await tx.akun.deleteMany({ where: { sekolahId } });
        await tx.sekolah.delete({ where: { id: sekolahId }, select: { id: true } });
      } else {
        await tx.pendaftaranSekolah.delete({ where: { id: req.params.id }, select: { id: true } });
      }
      return "deleted";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result === "not-found") return res.status(404).json({ error: "Pendaftaran tidak ditemukan. Muat ulang daftar." });
    if (result === "has-data") return res.status(409).json({ error: "Sekolah memiliki data terkait dan tidak dapat dihapus melalui menu ini." });
    return res.status(204).end();
  } catch (error) {
    console.error("Gagal menghapus pendaftaran sekolah:", error);
    return res.status(503).json({ error: "Pendaftaran belum dapat dihapus. Coba lagi nanti." });
  }
});

app.use("/api", (_req, res) => res.status(503).json({ error: "Fitur ini belum tersedia." }));
app.use(globalErrorHandler);
