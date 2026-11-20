import express from "express";
import { createHash, randomBytes } from "crypto";
import { loginPool, pool, prisma } from "./db.js";
import { DEFAULT_ACCOUNT_PASSWORD, DEFAULT_STUDENT_PASSWORD, hashPassword, isValidPasswordLength, verifyPassword } from "./password.js";
import { extractPaketFromNote, registrationRateLimit, registrationRoutes, saveRegistrationRecord } from "./registration-routes.js";
import { parseStudentImport } from "./student-import.js";
import { parseApplicant, parseTeacher } from "./school-input.js";
import { parseClass, parsePlacement } from "./class-input.js";
import { academicRoutes } from "./academic-routes.js";
import { httpSecurity, productionOrigin } from "./http-security.js";
import { learningRoutes } from "./learning-routes.js";
import { classroomRoutes } from "./classroom-routes.js";
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
import { resolveSchoolWithSandboxSeed, resolveTenantHostSchool, SANDBOX_SLUG } from "./sandbox-seed.js";

const app = express();
export default app;
const cookieName = "armilla_session";
const schoolCookieName = "sekolah_session";
const lmsCookieName = "lms_session";
const sessionDurationMs = 8 * 60 * 60 * 1000;
const ppdbAttempts = new Map<string, { count: number; until: number }>();
const dummyHash = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

app.disable("x-powered-by");
const production = process.env.NODE_ENV === "production";
app.use("/api/internal", internalProvisionRoutes(prisma));
app.use("/api", httpSecurity({ production, origin: production ? productionOrigin(process.env.APP_ORIGIN) : undefined }));
app.use("/api/sekolah/siswa/import", express.json({ limit: "256kb" }));
app.use("/api/lms/pembelajaran", express.json({ limit: "64kb" }));
app.use(express.json({ limit: "16kb" }));
app.use("/api", tenantHostMiddleware(production, (slug) => resolveTenantHostSchool(prisma, slug), process.env.APP_ORIGIN));
app.get("/api/tenant/context", (req, res) => res.json({
  kind: req.tenant?.kind,
  ...(req.tenant?.kind === "school" ? { slug: req.tenant.slug } : {}),
}));
app.use("/api", (req, res, next) => {
  const tenant = req.tenant;
  if (!tenant) return res.status(503).json({ error: "Konteks sekolah tidak tersedia." });
  if (tenant.kind === "main" && /^\/(?:auth\/(?:sekolah|lms)|sekolah|lms|ppdb)(?:\/|$)/.test(req.path)) {
    if (/^\/auth\/(?:sekolah|lms)\/login$/.test(req.path)) return res.status(401).json({ error: "Akun tidak terdaftar pada instansi ini. Gunakan subdomain sekolah Anda." });
    return res.status(404).json({ error: "Fitur ini tersedia melalui subdomain sekolah." });
  }
  if (tenant.kind === "school" && /^\/(?:auth\/master|master|pendaftaran-sekolah)(?:\/|$)/.test(req.path)) {
    return res.status(404).json({ error: "Fitur ini tersedia melalui domain utama." });
  }
  return next();
});
const limitSecret = production ? rateLimitSecret(process.env.LOGIN_RATE_LIMIT_SECRET) : randomBytes(32).toString("hex");
const limitLogin = loginRateLimit(loginPool, limitSecret);
const limitProductionPpdb = registrationRateLimit(loginPool, limitSecret, false, "ppdb");

function loginIp(req: express.Request): string {
  return loginClientIp(production, !!process.env.VERCEL, req.ip, req.get("x-vercel-forwarded-for"));
}

function sessionToken(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function savePasswordChange(account: {
  id: string;
  passwordHash: string;
  peran: "MASTER_ADMIN" | "ADMIN" | "GURU" | "SISWA";
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

async function handlePublicSchoolLookup(req: express.Request, res: express.Response, explicitSlug?: string) {
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
    return res.json({
      id: school.id,
      nama: school.nama,
      slug: school.slug,
      npsn: school.npsn ?? null,
      plan: normalizeTenantPlan(school.plan),
      status: school.status,
      themeKey: school.themeKey ?? "ocean",
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
  try {
    const result = await limitLogin<{ token: string; nama: string; peran: "MASTER_ADMIN" }>(loginIp(req), email, async () => {
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
      return res.status(401).json({ error: "Email atau kata sandi salah." });
    }
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

app.post("/api/auth/sekolah/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 1024) return res.status(400).json({ error: "Email dan kata sandi wajib diisi." });
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
    }>(loginIp(req), email, async () => {
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
          themeKey: schoolInfo?.themeKey ?? "ocean",
        },
      };
    });
    if (result.kind === "limited") {
      res.setHeader("Retry-After", String(result.retryAfter));
      return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
    }
    if (result.kind === "failure") return res.status(401).json({ error: "Email atau kata sandi salah, atau akun tidak terdaftar pada instansi ini." });
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
  return {
    nama: session.akun.nama,
    email: session.akun.email ?? null,
    isDeveloper: isDeveloperAccount(session.akun.email),
    sekolah: school.nama,
    slug: school.slug,
    plan: normalizeTenantPlan(school.plan),
    rawPlan: school.plan ?? null,
    themeKey: school.themeKey ?? "ocean",
  };
}

app.get("/api/auth/sekolah/session", async (req, res) => {
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
    const temporaryPassword = DEFAULT_ACCOUNT_PASSWORD;
    const passwordHash = await hashPassword(temporaryPassword);
    await prisma.$transaction(async (tx) => {
      if (jenis === "siswa") {
        await tx.$queryRaw`SELECT "id" FROM "Siswa" WHERE "id" = ${req.params.id} AND "sekolahId" = ${sekolahId} FOR UPDATE`;
        const siswa = await tx.siswa.findFirst({ where: { id: req.params.id, sekolahId, status: "Aktif" }, select: { id: true, nama: true, nisn: true } });
        if (!siswa || !/^\d{10}$/.test(siswa.nisn)) throw new Error("INVALID_ENTITY");
        await tx.akun.create({ data: { nama: siswa.nama, sekolahId, siswaId: siswa.id, peran: "SISWA", passwordHash, wajibGantiPassword: true } });
      } else {
        await tx.$queryRaw`SELECT "id" FROM "Guru" WHERE "id" = ${req.params.id} AND "sekolahId" = ${sekolahId} FOR UPDATE`;
        const guru = await tx.guru.findFirst({ where: { id: req.params.id, sekolahId, status: "Aktif" }, select: { id: true, nama: true, email: true } });
        if (!guru || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guru.email.trim()) || guru.email.length > 254) throw new Error("INVALID_ENTITY");
        await tx.akun.create({ data: { nama: guru.nama, email: guru.email.trim().toLowerCase(), sekolahId, guruId: guru.id, peran: "GURU", passwordHash, wajibGantiPassword: true } });
      }
    });
    return res.status(201).json({ temporaryPassword });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ENTITY") return res.status(400).json({ error: "Data aktif tidak ditemukan atau NISN/email tidak valid." });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "Akun atau email sudah terdaftar." });
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
    const temporaryPassword = DEFAULT_ACCOUNT_PASSWORD;
    const passwordHash = await hashPassword(temporaryPassword);
    const changed = await prisma.$transaction(async (tx) => {
      const account = await tx.akun.findFirst({
        where: jenis === "siswa"
          ? { sekolahId, peran: "SISWA", aktif: true, siswaId: req.params.id, guruId: null, siswa: { sekolahId, status: "Aktif" } }
          : { sekolahId, peran: "GURU", aktif: true, guruId: req.params.id, siswaId: null, guru: { sekolahId, status: "Aktif" } },
        select: { id: true },
      });
      if (!account) return false;
      const updated = await tx.akun.updateMany({
        where: { id: account.id, sekolahId, aktif: true },
        data: { passwordHash, wajibGantiPassword: true },
      });
      if (updated.count !== 1) return false;
      await tx.sesiAkun.updateMany({ where: { akunId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return true;
    });
    if (!changed) return res.status(404).json({ error: "Akun aktif tidak ditemukan di sekolah ini." });
    return res.json({ temporaryPassword });
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
    return res.json({ themeKey: school.themeKey });
  } catch (error) {
    console.error("Gagal memuat tema sekolah:", error);
    return res.status(503).json({ error: "Tema sekolah belum dapat dimuat." });
  }
});

app.post("/api/auth/lms/login", async (req, res) => {
  const { identitas, password, peran } = req.body || {};
  if (typeof identitas !== "string" || identitas.length > 254 || typeof password !== "string" || password.length > 1024 || (peran !== "SISWA" && peran !== "GURU")) return res.status(400).json({ error: "Periksa identitas, peran, dan kata sandi." });
  try {
    const result = await limitLogin<{ token: string; nama: string; peran: "SISWA" | "GURU"; wajibGantiPassword: boolean }>(loginIp(req), identitas, async () => {
      const identity = identitas.trim().toLowerCase();
      const account = peran === "SISWA"
        ? await prisma.akun.findFirst({ where: { peran: "SISWA", siswa: { nisn: identity } }, include: { siswa: { select: { sekolahId: true, status: true } }, guru: { select: { sekolahId: true, status: true } } } })
        : await prisma.akun.findUnique({ where: { email: identity }, include: { siswa: { select: { sekolahId: true, status: true } }, guru: { select: { sekolahId: true, status: true } } } });
      const valid = await verifyPassword(password, account?.passwordHash || dummyHash);
      const related = account?.peran === "SISWA" ? account.siswa : account?.peran === "GURU" ? account.guru : null;
      if (!account || !valid || account.peran !== peran || !account.aktif || !account.sekolahId || (req.tenant?.kind === "school" && account.sekolahId !== req.tenant.id) || !related || related.sekolahId !== account.sekolahId || related.status !== "Aktif" || (peran === "SISWA" ? !!account.guruId : !!account.siswaId)) return { kind: "failure" };
      const token = await createLoginSession(account, new Date(Date.now() + sessionDurationMs));
      if (!token) return { kind: "failure" };
      return { kind: "success", value: { token, nama: account.nama, peran: account.peran as "SISWA" | "GURU", wajibGantiPassword: account.wajibGantiPassword } };
    });
    if (result.kind === "limited") {
      res.setHeader("Retry-After", String(result.retryAfter));
      return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
    }
    if (result.kind === "failure") return res.status(401).json({ error: "Identitas atau kata sandi salah, atau akun tidak terdaftar pada instansi ini." });
    res.cookie(lmsCookieName, result.value.token, { ...cookieOptions(), maxAge: sessionDurationMs });
    return res.json({
      nama: result.value.nama,
      peran: result.value.peran,
      wajibGantiPassword: result.value.wajibGantiPassword,
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
    return res.json({ nama: session.akun.nama, peran: session.akun.peran, wajibGantiPassword: session.akun.wajibGantiPassword });
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
    if (!forcedChange && session.akun.peran !== "GURU") return res.status(403).json({ error: "Fitur ganti password tidak tersedia untuk peran ini." });
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

function jakartaDate(): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
}

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
    return { sekolahId: account.sekolahId, peran: account.peran, siswaId: account.siswaId, kelasId: account.siswa?.kelasId ?? null };
  }
  const sandbox = await getDevSandboxLmsContext(req);
  if (!sandbox) return null;
  return { sekolahId: sandbox.sekolahId, peran: sandbox.peran, siswaId: sandbox.siswaId, kelasId: sandbox.kelasId };
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

app.get("/api/lms/guru/siswa-reset", async (req, res) => {
  try {
    const session = await getLmsSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    if (session.akun.peran !== "GURU" || session.akun.wajibGantiPassword || !session.akun.guruId || !session.akun.sekolahId) return res.status(403).json({ error: "Akses ditolak. Guru harus mengganti password awal." });
    const nisn = req.query.nisn;
    if (typeof nisn !== "string" || !/^\d{10}$/.test(nisn)) return res.status(400).json({ error: "NISN harus terdiri dari 10 angka." });
    const sekolahId = session.akun.sekolahId;
    const today = jakartaDate();
    const kelas = await prisma.kelas.findMany({
      where: { sekolahId, jadwal: { some: { sekolahId, guruId: session.akun.guruId, tahunAjaran: { sekolahId, mulai: { lte: today }, selesai: { gte: today } } } } },
      select: { id: true },
    });
    const siswa = await prisma.siswa.findFirst({ where: { nisn, sekolahId, status: "Aktif", kelasId: { in: kelas.map((item) => item.id) }, akun: { is: { aktif: true, peran: "SISWA", sekolahId, guruId: null } } }, select: { id: true, nama: true, nisn: true } });
    if (!siswa) return res.status(404).json({ error: "Siswa tidak ditemukan atau tidak berada di kelas yang Anda ajar pada tahun ajaran aktif." });
    return res.json(siswa);
  } catch (error) {
    console.error("Gagal mencari siswa untuk reset password:", error);
    return res.status(503).json({ error: "Pencarian siswa tidak tersedia." });
  }
});

app.post("/api/lms/guru/siswa/:id/reset-password", async (req, res) => {
  try {
    const session = await getLmsSession(req);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    if (session.akun.peran !== "GURU" || session.akun.wajibGantiPassword || !session.akun.guruId || !session.akun.sekolahId) return res.status(403).json({ error: "Akses ditolak. Guru harus mengganti password awal." });
    const sekolahId = session.akun.sekolahId;
    const guruId = session.akun.guruId;
    const temporaryPassword = DEFAULT_STUDENT_PASSWORD;
    const passwordHash = await hashPassword(temporaryPassword);
    const today = jakartaDate();
    const changed = await prisma.$transaction(async (tx) => {
      const kelas = await tx.kelas.findMany({
        where: { sekolahId, jadwal: { some: { sekolahId, guruId, tahunAjaran: { sekolahId, mulai: { lte: today }, selesai: { gte: today } } } } },
        select: { id: true },
      });
      const student = await tx.siswa.findFirst({ where: { id: req.params.id, sekolahId, status: "Aktif", kelasId: { in: kelas.map((item) => item.id) } }, select: { id: true } });
      if (!student) return false;
      const account = await tx.akun.findFirst({ where: { siswaId: student.id, sekolahId, peran: "SISWA", aktif: true, guruId: null }, select: { id: true } });
      if (!account) return false;
      const updated = await tx.akun.updateMany({ where: { id: account.id, sekolahId, siswaId: student.id, peran: "SISWA", aktif: true, guruId: null }, data: { passwordHash, wajibGantiPassword: true } });
      if (updated.count !== 1) return false;
      await tx.sesiAkun.updateMany({ where: { akunId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return true;
    });
    if (!changed) return res.status(404).json({ error: "Siswa tidak ditemukan atau tidak berada di kelas yang Anda ajar pada tahun ajaran aktif." });
    return res.json({ temporaryPassword });
  } catch (error) {
    console.error("Gagal mereset password siswa:", error);
    return res.status(503).json({ error: "Password siswa belum dapat direset." });
  }
});

app.use("/api/sekolah", schoolManagementRoutes(async (req) => (await getSession(req, "ADMIN"))?.akun.sekolahId ?? null));
app.use("/api/sekolah", schoolTierRoutes(async (req) => (await getSession(req, "ADMIN"))?.akun.sekolahId ?? null));

app.post("/api/sekolah/siswa/import", async (req, res) => {
  try {
    const session = await getSession(req, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const parsed = parseStudentImport(req.body?.rows);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.siswa.findMany({ where: { nisn: { in: parsed.rows.map((row) => row.nisn) } }, select: { nisn: true, sekolahId: true } });
      if (existing.some((student) => student.sekolahId !== sekolahId)) throw new Error("NISN_CONFLICT");
      const found = new Set(existing.map((student) => student.nisn));
      const newRows = parsed.rows.filter((row) => !found.has(row.nisn));
      const existingRows = parsed.rows.filter((row) => found.has(row.nisn));
      if (existingRows.length) {
        const values = Prisma.join(existingRows.map((row) => Prisma.sql`(${row.nisn}, ${row.nama}, ${row.email ?? null}, ${row.telepon ?? null}, ${row.nik ?? null}, ${row.tempatLahir ?? null}, ${row.tanggalLahir ?? null}::date, ${row.jenisKelamin ?? null}, ${row.jenjang ?? null}, ${row.tanggalMasuk ?? null}::date, ${row.jalurPendaftaran ?? null}, ${row.namaAyah ?? null}, ${row.namaIbu ?? null}, ${row.alamatLengkap ?? null}, ${row.teleponAyah ?? null}, ${row.pekerjaanAyah ?? null}, ${row.teleponIbu ?? null}, ${row.pekerjaanIbu ?? null}, ${row.namaWali ?? null}, ${row.teleponWali ?? null}, ${row.pekerjaanWali ?? null})`));
        const updated = await tx.$executeRaw`
          UPDATE "Siswa" AS siswa SET "nama" = data.nama, "email" = COALESCE(data.email, siswa."email"),
            "telepon" = COALESCE(data.telepon, siswa."telepon"), "nik" = COALESCE(data.nik, siswa."nik"),
            "tempatLahir" = COALESCE(data.tempat_lahir, siswa."tempatLahir"), "tanggalLahir" = COALESCE(data.tanggal_lahir, siswa."tanggalLahir"),
            "jenisKelamin" = COALESCE(data.jenis_kelamin, siswa."jenisKelamin"), "jenjang" = COALESCE(data.jenjang, siswa."jenjang"),
            "tanggalMasuk" = COALESCE(data.tanggal_masuk, siswa."tanggalMasuk"), "jalurPendaftaran" = COALESCE(data.jalur_pendaftaran, siswa."jalurPendaftaran"),
            "namaAyah" = COALESCE(data.nama_ayah, siswa."namaAyah"), "namaIbu" = COALESCE(data.nama_ibu, siswa."namaIbu"),
            "alamatLengkap" = COALESCE(data.alamat, siswa."alamatLengkap"),
            "teleponAyah" = COALESCE(data.telepon_ayah, siswa."teleponAyah"), "pekerjaanAyah" = COALESCE(data.pekerjaan_ayah, siswa."pekerjaanAyah"),
            "teleponIbu" = COALESCE(data.telepon_ibu, siswa."teleponIbu"), "pekerjaanIbu" = COALESCE(data.pekerjaan_ibu, siswa."pekerjaanIbu"),
            "namaWali" = COALESCE(data.nama_wali, siswa."namaWali"), "teleponWali" = COALESCE(data.telepon_wali, siswa."teleponWali"), "pekerjaanWali" = COALESCE(data.pekerjaan_wali, siswa."pekerjaanWali")
          FROM (VALUES ${values}) AS data(nisn, nama, email, telepon, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, jenjang, tanggal_masuk, jalur_pendaftaran, nama_ayah, nama_ibu, alamat, telepon_ayah, pekerjaan_ayah, telepon_ibu, pekerjaan_ibu, nama_wali, telepon_wali, pekerjaan_wali)
          WHERE siswa."nisn" = data.nisn AND siswa."sekolahId" = ${sekolahId}
        `;
        if (updated !== existingRows.length) throw new Error("IMPORT_CONFLICT");
      }
      if (newRows.length) await tx.siswa.createMany({ data: newRows.map((row) => ({ ...row, sekolahId, status: "Aktif" })) });
      return { created: newRows.length, updated: existingRows.length };
    }, { timeout: 30000 });
    return res.json(result);
  } catch (error) {
    if (error instanceof Error && (error.message === "NISN_CONFLICT" || error.message === "IMPORT_CONFLICT" || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"))) {
      return res.status(409).json({ error: "Impor dibatalkan karena ada konflik NISN. Periksa file atau hubungi master admin." });
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

app.post("/api/ppdb/:slug", async (req, res) => {
  if (req.tenant?.kind === "school" && req.params.slug !== req.tenant.slug) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
  if (production) {
    try {
      const limit = await limitProductionPpdb(loginIp(req));
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfter));
        return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi nanti." });
      }
    } catch (error) {
      console.error("Pembatas PPDB tidak tersedia:", error instanceof Error ? error.name : "UnknownError");
      return res.status(503).json({ error: "Perlindungan PPDB tidak tersedia." });
    }
  } else {
    const now = Date.now();
    for (const [key, value] of ppdbAttempts) if (value.until <= now) ppdbAttempts.delete(key);
    const ip = req.ip || "unknown";
    const current = ppdbAttempts.get(ip);
    if (current && current.count >= 5) {
      res.setHeader("Retry-After", String(Math.ceil((current.until - now) / 1000)));
      return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi nanti." });
    }
    ppdbAttempts.set(ip, { count: (current?.count || 0) + 1, until: current?.until || now + 60 * 60 * 1000 });
  }
  const data = parseApplicant(req.body);
  if (!data) return res.status(400).json({ error: "Periksa nama, email, telepon, alamat, dan jenjang." });
  try {
    const school = req.params.slug === SANDBOX_SLUG
      ? await resolveSchoolWithSandboxSeed(prisma, req.params.slug)
      : await prisma.sekolah.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!school) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
    await prisma.pPDB.create({ data: { ...data, sekolahId: school.id, noDaftar: randomBytes(16).toString("hex"), status: "Pending" } });
    return res.status(201).json({ message: "Pendaftaran diterima dan menunggu pemeriksaan admin sekolah." });
  } catch (error) {
    console.error("Gagal menyimpan PPDB:", error);
    return res.status(503).json({ error: "Pendaftaran belum dapat disimpan." });
  }
});

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
    const [kelas, guru, counts] = await Promise.all([
      prisma.kelas.findMany({ where: { sekolahId }, select: { id: true, nama: true, waliGuruId: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 501 }),
      prisma.guru.findMany({ where: { sekolahId, status: "Aktif" }, select: { id: true, nama: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 501 }),
      prisma.siswa.groupBy({ by: ["kelasId"], where: { sekolahId, status: "Aktif", kelasId: { not: null } }, _count: { _all: true } }),
    ]);
    if (kelas.length > 500 || guru.length > 500) return res.status(409).json({ error: "Pengaturan kelas mendukung maksimal 500 kelas dan 500 guru aktif." });
    const jumlah = new Map(counts.map((item) => [item.kelasId, item._count._all]));
    return res.json({ kelas: kelas.map((item) => ({ ...item, jumlahSiswa: jumlah.get(item.id) ?? 0 })), guru });
  } catch (error) {
    console.error("Gagal memuat pengaturan kelas:", error);
    return res.status(503).json({ error: "Pengaturan kelas belum dapat dimuat." });
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
    let rows: { id: string; nama: string; keterangan: string; status: string; kelasId?: string | null; punyaAkun?: boolean; email?: string; telepon?: string; alamat?: string; jenjang?: string; catatan?: string | null }[];
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
        prisma.siswa.findMany({ where, select: { id: true, nama: true, nisn: true, kelasId: true, status: true, akun: { select: { id: true } } }, orderBy: { id: "asc" }, ...pagination }),
        prisma.siswa.count({ where }),
      ]);
      rows = data.map((item) => ({ id: item.id, nama: item.nama, keterangan: item.nisn, kelasId: item.kelasId, status: item.status, punyaAkun: !!item.akun }));
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
    const schools = await prisma.sekolah.findMany({
      select: { id: true, nama: true, slug: true, npsn: true, plan: true, status: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
    });
    return res.json({
      sekolah: schools.slice(0, pageSize).map((school) => ({
        ...school,
        plan: normalizeTenantPlan(school.plan),
      })),
      page,
      hasNext: schools.length > pageSize,
    });
  } catch (error) {
    console.error("Gagal memuat daftar sekolah:", error);
    return res.status(503).json({ error: "Daftar sekolah tidak tersedia. Coba lagi nanti." });
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
    const syncResult = await syncTenantPlanToLms({
      npsn: school.npsn,
      slug: school.slug,
      plan: cleanPlan,
    });
    if ("error" in syncResult) {
      return res.status(syncResult.status).json({ error: syncResult.error });
    }
    await prisma.sekolah.update({
      where: { id: school.id },
      data: { plan: cleanPlan },
    });
    return res.json({
      success: true,
      plan: cleanPlan,
      message: syncResult.message,
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
