import express from "express";
import { createHash, randomBytes } from "crypto";
import { loginPool, prisma } from "./db.js";
import { generateTemporaryPassword, hashPassword, isValidPasswordLength, verifyPassword } from "./password.js";
import { registrationRateLimit, registrationRoutes } from "./registration-routes.js";
import { parseStudentImport } from "./student-import.js";
import { parseApplicant, parseTeacher } from "./school-input.js";
import { parseClass, parsePlacement } from "./class-input.js";
import { academicRoutes } from "./academic-routes.js";
import { httpSecurity, productionOrigin } from "./http-security.js";
import { learningRoutes } from "./learning-routes.js";
import { createLoginSession } from "./login-session.js";
import { loginClientIp, loginRateLimit, rateLimitSecret } from "./login-rate-limit.js";
import { Prisma } from "@prisma/client";

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
app.use(httpSecurity({ production, origin: production ? productionOrigin(process.env.APP_ORIGIN) : undefined }));
app.use("/api/sekolah/siswa/import", express.json({ limit: "256kb" }));
app.use("/api/lms/pembelajaran", express.json({ limit: "64kb" }));
app.use(express.json({ limit: "16kb" }));
const limitSecret = production ? rateLimitSecret(process.env.LOGIN_RATE_LIMIT_SECRET) : randomBytes(32).toString("hex");
const limitLogin = loginRateLimit(loginPool, limitSecret);

function loginIp(req: express.Request): string {
  return loginClientIp(production, !!process.env.VERCEL, req.ip, req.get("x-vercel-forwarded-for"));
}

function sessionToken(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/pendaftaran-sekolah", registrationRoutes({
  production,
  vercel: !!process.env.VERCEL,
  limit: registrationRateLimit(loginPool, limitSecret),
  save: async (data) => { await prisma.pendaftaranSekolah.create({ data }); },
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
    return res.json({ nama: result.value.nama, peran: result.value.peran });
  } catch (error) {
    console.error("Gagal memproses login master:", error);
    return res.status(503).json({ error: "Layanan login tidak tersedia." });
  }
});

async function getSession(cookieHeader: string | undefined, role: "MASTER_ADMIN" | "ADMIN" = "MASTER_ADMIN") {
  const token = sessionToken(cookieHeader, role === "ADMIN" ? schoolCookieName : cookieName);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await prisma.sesiAkun.findUnique({ where: { tokenHash }, include: { akun: true } });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.akun.aktif || session.akun.peran !== role || (role === "ADMIN" && !session.akun.sekolahId)) return null;
  return session;
}

app.post("/api/auth/sekolah/login", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Login sekolah belum tersedia untuk produksi." });
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 1024) return res.status(400).json({ error: "Email dan kata sandi wajib diisi." });
  try {
    const result = await limitLogin<{ token: string; nama: string }>(loginIp(req), email, async () => {
      const account = await prisma.akun.findUnique({ where: { email: email.trim().toLowerCase() } });
      const valid = await verifyPassword(password, account?.passwordHash || dummyHash);
      if (!account || !valid || !account.aktif || account.peran !== "ADMIN" || !account.sekolahId) return { kind: "failure" };
      const token = await createLoginSession(account, new Date(Date.now() + sessionDurationMs));
      if (!token) return { kind: "failure" };
      return { kind: "success", value: { token, nama: account.nama } };
    });
    if (result.kind === "limited") {
      res.setHeader("Retry-After", String(result.retryAfter));
      return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
    }
    if (result.kind === "failure") return res.status(401).json({ error: "Email atau kata sandi salah." });
    res.cookie(schoolCookieName, result.value.token, { ...cookieOptions(), maxAge: sessionDurationMs });
    return res.json({ nama: result.value.nama });
  } catch (error) {
    console.error("Gagal memproses login sekolah:", error);
    return res.status(503).json({ error: "Layanan login sekolah tidak tersedia." });
  }
});

app.get("/api/auth/sekolah/session", async (req, res) => {
  try {
    const session = await getSession(req.headers.cookie, "ADMIN");
    if (!session || !session.akun.sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const school = await prisma.sekolah.findUnique({ where: { id: session.akun.sekolahId }, select: { nama: true, slug: true } });
    if (!school) return res.status(401).json({ error: "Sesi tidak valid." });
    return res.json({ nama: session.akun.nama, sekolah: school.nama, slug: school.slug });
  } catch (error) {
    console.error("Gagal memeriksa sesi sekolah:", error);
    return res.status(503).json({ error: "Layanan sesi tidak tersedia." });
  }
});

app.post("/api/auth/sekolah/logout", async (req, res) => {
  try {
    const session = await getSession(req.headers.cookie, "ADMIN");
    if (session) await prisma.sesiAkun.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    res.clearCookie(schoolCookieName, cookieOptions());
    return res.status(204).end();
  } catch (error) {
    console.error("Gagal mengakhiri sesi sekolah:", error);
    return res.status(503).json({ error: "Gagal mengakhiri sesi." });
  }
});

app.post("/api/sekolah/:jenis/:id/akun", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Akun LMS belum tersedia untuk produksi." });
  try {
    const session = await getSession(req.headers.cookie, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const jenis = req.params.jenis;
    if (jenis !== "siswa" && jenis !== "guru") return res.status(404).json({ error: "Jenis akun tidak ditemukan." });
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await prisma.$transaction(async (tx) => {
      if (jenis === "siswa") {
        const siswa = await tx.siswa.findFirst({ where: { id: req.params.id, sekolahId, status: "Aktif" }, select: { id: true, nama: true, nisn: true } });
        if (!siswa || !/^\d{10}$/.test(siswa.nisn)) throw new Error("INVALID_ENTITY");
        await tx.akun.create({ data: { nama: siswa.nama, sekolahId, siswaId: siswa.id, peran: "SISWA", passwordHash, wajibGantiPassword: true } });
      } else {
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
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Reset password belum tersedia untuk produksi." });
  try {
    const session = await getSession(req.headers.cookie, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const jenis = req.params.jenis;
    if (jenis !== "siswa" && jenis !== "guru") return res.status(404).json({ error: "Jenis akun tidak ditemukan." });
    const temporaryPassword = generateTemporaryPassword();
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

async function getLmsSession(cookieHeader: string | undefined) {
  const token = sessionToken(cookieHeader, lmsCookieName);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.sesiAkun.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    include: { akun: { include: { siswa: true, guru: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.akun.aktif || !session.akun.sekolahId) return null;
  const account = session.akun;
  if (account.peran === "SISWA" && account.siswa?.sekolahId === account.sekolahId && account.siswa.status === "Aktif" && !account.guruId) return session;
  if (account.peran === "GURU" && account.guru?.sekolahId === account.sekolahId && account.guru.status === "Aktif" && !account.siswaId) return session;
  return null;
}

app.post("/api/auth/lms/login", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Login LMS belum tersedia untuk produksi." });
  const { identitas, password, peran } = req.body || {};
  if (typeof identitas !== "string" || identitas.length > 254 || typeof password !== "string" || password.length > 1024 || (peran !== "SISWA" && peran !== "GURU")) return res.status(400).json({ error: "Periksa identitas, peran, dan kata sandi." });
  try {
    const result = await limitLogin<{ token: string; wajibGantiPassword: boolean }>(loginIp(req), identitas, async () => {
      const identity = identitas.trim().toLowerCase();
      const account = peran === "SISWA"
        ? await prisma.akun.findFirst({ where: { peran: "SISWA", siswa: { nisn: identity } }, include: { siswa: true, guru: true } })
        : await prisma.akun.findUnique({ where: { email: identity }, include: { siswa: true, guru: true } });
      const valid = await verifyPassword(password, account?.passwordHash || dummyHash);
      const related = account?.peran === "SISWA" ? account.siswa : account?.peran === "GURU" ? account.guru : null;
      if (!account || !valid || account.peran !== peran || !account.aktif || !account.sekolahId || !related || related.sekolahId !== account.sekolahId || related.status !== "Aktif" || (peran === "SISWA" ? !!account.guruId : !!account.siswaId)) return { kind: "failure" };
      const token = await createLoginSession(account, new Date(Date.now() + sessionDurationMs));
      if (!token) return { kind: "failure" };
      return { kind: "success", value: { token, wajibGantiPassword: account.wajibGantiPassword } };
    });
    if (result.kind === "limited") {
      res.setHeader("Retry-After", String(result.retryAfter));
      return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
    }
    if (result.kind === "failure") return res.status(401).json({ error: "Identitas atau kata sandi salah." });
    res.cookie(lmsCookieName, result.value.token, { ...cookieOptions(), maxAge: sessionDurationMs });
    return res.json({ wajibGantiPassword: result.value.wajibGantiPassword });
  } catch (error) {
    console.error("Gagal login LMS:", error);
    return res.status(503).json({ error: "Layanan login LMS tidak tersedia." });
  }
});

app.get("/api/auth/lms/session", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "LMS belum tersedia untuk produksi." });
  try {
    const session = await getLmsSession(req.headers.cookie);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    return res.json({ nama: session.akun.nama, peran: session.akun.peran, wajibGantiPassword: session.akun.wajibGantiPassword });
  } catch (error) {
    console.error("Gagal memeriksa sesi LMS:", error);
    return res.status(503).json({ error: "Sesi LMS tidak tersedia." });
  }
});

app.post("/api/auth/lms/ganti-password", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "LMS belum tersedia untuk produksi." });
  try {
    const session = await getLmsSession(req.headers.cookie);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    if (!session.akun.wajibGantiPassword) return res.status(409).json({ error: "Password awal sudah diganti. Silakan masuk kembali." });
    const { password } = req.body || {};
    if (typeof password !== "string" || !isValidPasswordLength(password) || await verifyPassword(password, session.akun.passwordHash)) return res.status(400).json({ error: "Password baru harus 6–1024 karakter dan berbeda dari password awal." });
    const passwordHash = await hashPassword(password);
    const changed = await prisma.$transaction(async (tx) => {
      const updated = await tx.akun.updateMany({ where: { id: session.akun.id, wajibGantiPassword: true, passwordHash: session.akun.passwordHash, aktif: true }, data: { passwordHash, wajibGantiPassword: false } });
      if (updated.count !== 1) return false;
      await tx.sesiAkun.updateMany({ where: { akunId: session.akun.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return true;
    });
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
    const session = await getLmsSession(req.headers.cookie);
    if (session) await prisma.sesiAkun.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    res.clearCookie(lmsCookieName, cookieOptions());
    return res.status(204).end();
  } catch (error) {
    console.error("Gagal keluar LMS:", error);
    return res.status(503).json({ error: "Gagal keluar." });
  }
});

app.get("/api/lms/beranda", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "LMS belum tersedia untuk produksi." });
  try {
    const session = await getLmsSession(req.headers.cookie);
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

app.use("/api/lms/pembelajaran", learningRoutes(async (cookie) => {
  const session = await getLmsSession(cookie);
  const account = session?.akun;
  if (!account?.sekolahId || (account.peran !== "SISWA" && account.peran !== "GURU")) return null;
  return { sekolahId: account.sekolahId, peran: account.peran, siswaId: account.siswaId, kelasId: account.siswa?.kelasId ?? null, guruId: account.guruId, wajibGantiPassword: account.wajibGantiPassword };
}, jakartaDate));

app.get("/api/lms/jadwal", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Jadwal LMS belum tersedia untuk produksi." });
  try {
    const session = await getLmsSession(req.headers.cookie);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    if (session.akun.wajibGantiPassword) return res.status(403).json({ error: "Ganti password awal sebelum mengakses LMS." });
    const pageValue = req.query.page;
    if (pageValue !== undefined && (typeof pageValue !== "string" || !/^[1-9]\d{0,5}$/.test(pageValue))) return res.status(400).json({ error: "Nomor halaman tidak valid." });
    const page = pageValue === undefined ? 1 : Number(pageValue);
    const sekolahId = session.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const account = session.akun;
    const kelasId = account.peran === "SISWA" ? account.siswa?.kelasId : null;
    if (account.peran === "SISWA" && !kelasId) return res.json({ rows: [], page, hasNext: false, belumDitempatkan: true });
    const scope = account.peran === "SISWA" && kelasId ? { kelasId } : account.peran === "GURU" && account.guruId ? { guruId: account.guruId } : null;
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
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Reset password belum tersedia untuk produksi." });
  try {
    const session = await getLmsSession(req.headers.cookie);
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
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Reset password belum tersedia untuk produksi." });
  try {
    const session = await getLmsSession(req.headers.cookie);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    if (session.akun.peran !== "GURU" || session.akun.wajibGantiPassword || !session.akun.guruId || !session.akun.sekolahId) return res.status(403).json({ error: "Akses ditolak. Guru harus mengganti password awal." });
    const sekolahId = session.akun.sekolahId;
    const guruId = session.akun.guruId;
    const temporaryPassword = generateTemporaryPassword();
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

app.post("/api/sekolah/siswa/import", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Impor siswa belum tersedia untuk produksi." });
  try {
    const session = await getSession(req.headers.cookie, "ADMIN");
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
        const values = Prisma.join(existingRows.map((row) => Prisma.sql`(${row.nisn}, ${row.nama}, ${row.email ?? null}, ${row.telepon ?? null})`));
        const updated = await tx.$executeRaw`
          UPDATE "Siswa" AS siswa SET "nama" = data.nama, "email" = COALESCE(data.email, siswa."email"),
            "telepon" = COALESCE(data.telepon, siswa."telepon")
          FROM (VALUES ${values}) AS data(nisn, nama, email, telepon)
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
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Data guru belum tersedia untuk produksi." });
  try {
    const session = await getSession(req.headers.cookie, "ADMIN");
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
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "PPDB belum tersedia untuk produksi." });
  try {
    const sekolah = await prisma.sekolah.findUnique({ where: { slug: req.params.slug }, select: { nama: true } });
    if (!sekolah) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
    return res.json(sekolah);
  } catch (error) {
    console.error("Gagal memuat sekolah PPDB:", error);
    return res.status(503).json({ error: "PPDB belum dapat dimuat." });
  }
});

app.post("/api/ppdb/:slug", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "PPDB belum tersedia untuk produksi." });
  const now = Date.now();
  for (const [key, value] of ppdbAttempts) if (value.until <= now) ppdbAttempts.delete(key);
  const ip = req.ip || "unknown";
  const current = ppdbAttempts.get(ip);
  if (current && current.count >= 5) {
    res.setHeader("Retry-After", String(Math.ceil((current.until - now) / 1000)));
    return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi nanti." });
  }
  ppdbAttempts.set(ip, { count: (current?.count || 0) + 1, until: current?.until || now + 60 * 60 * 1000 });
  const data = parseApplicant(req.body);
  if (!data) return res.status(400).json({ error: "Periksa nama, email, telepon, alamat, dan jenjang." });
  try {
    const school = await prisma.sekolah.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!school) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
    await prisma.pPDB.create({ data: { ...data, sekolahId: school.id, noDaftar: randomBytes(16).toString("hex"), status: "Pending" } });
    return res.status(201).json({ message: "Pendaftaran diterima dan menunggu pemeriksaan admin sekolah." });
  } catch (error) {
    console.error("Gagal menyimpan PPDB:", error);
    return res.status(503).json({ error: "Pendaftaran belum dapat disimpan." });
  }
});

app.post("/api/sekolah/ppdb/:id/tinjau", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "PPDB belum tersedia untuk produksi." });
  try {
    const session = await getSession(req.headers.cookie, "ADMIN");
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

app.use("/api/sekolah/akademik", academicRoutes(async (cookie) => (await getSession(cookie, "ADMIN"))?.akun.sekolahId ?? null));

app.get("/api/sekolah/kelas", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Pengaturan kelas belum tersedia untuk produksi." });
  try {
    const sekolahId = (await getSession(req.headers.cookie, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const [kelas, guru] = await Promise.all([
      prisma.kelas.findMany({ where: { sekolahId }, select: { id: true, nama: true, waliGuruId: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 501 }),
      prisma.guru.findMany({ where: { sekolahId, status: "Aktif" }, select: { id: true, nama: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 501 }),
    ]);
    if (kelas.length > 500 || guru.length > 500) return res.status(409).json({ error: "Pengaturan kelas mendukung maksimal 500 kelas dan 500 guru aktif untuk uji lokal." });
    return res.json({ kelas, guru });
  } catch (error) {
    console.error("Gagal memuat pengaturan kelas:", error);
    return res.status(503).json({ error: "Pengaturan kelas belum dapat dimuat." });
  }
});

app.post("/api/sekolah/kelas", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Pengaturan kelas belum tersedia untuk produksi." });
  try {
    const sekolahId = (await getSession(req.headers.cookie, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const data = parseClass(req.body);
    if (!data) return res.status(400).json({ error: "Nama kelas dan wali kelas wajib diisi." });
    const kelas = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Sekolah" WHERE "id" = ${sekolahId} FOR UPDATE`;
      const teacher = await tx.guru.findFirst({ where: { id: data.waliGuruId, sekolahId, status: "Aktif" }, select: { id: true } });
      if (!teacher) throw new Error("INVALID_TEACHER");
      if (await tx.kelas.count({ where: { sekolahId } }) >= 500) throw new Error("CLASS_LIMIT");
      return tx.kelas.create({ data: { ...data, kode: randomBytes(16).toString("hex"), sekolahId }, select: { id: true, nama: true, waliGuruId: true } });
    });
    return res.status(201).json(kelas);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_TEACHER") return res.status(400).json({ error: "Wali kelas aktif tidak ditemukan di sekolah ini." });
    if (error instanceof Error && error.message === "CLASS_LIMIT") return res.status(409).json({ error: "Batas 500 kelas untuk uji lokal telah tercapai." });
    console.error("Gagal membuat kelas:", error);
    return res.status(503).json({ error: "Kelas belum dapat dibuat." });
  }
});

app.patch("/api/sekolah/kelas/:id", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Pengaturan kelas belum tersedia untuk produksi." });
  try {
    const sekolahId = (await getSession(req.headers.cookie, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const data = parseClass(req.body);
    if (!data) return res.status(400).json({ error: "Nama kelas dan wali kelas wajib diisi." });
    const teacher = await prisma.guru.findFirst({ where: { id: data.waliGuruId, sekolahId, status: "Aktif" }, select: { id: true } });
    if (!teacher) return res.status(400).json({ error: "Wali kelas aktif tidak ditemukan di sekolah ini." });
    const updated = await prisma.kelas.updateMany({ where: { id: req.params.id, sekolahId }, data });
    if (!updated.count) return res.status(404).json({ error: "Kelas tidak ditemukan di sekolah ini." });
    return res.json({ message: "Kelas diperbarui." });
  } catch (error) {
    console.error("Gagal memperbarui kelas:", error);
    return res.status(503).json({ error: "Kelas belum dapat diperbarui." });
  }
});

app.get("/api/sekolah/penempatan-siswa", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Penempatan siswa belum tersedia untuk produksi." });
  try {
    const sekolahId = (await getSession(req.headers.cookie, "ADMIN"))?.akun.sekolahId;
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

app.patch("/api/sekolah/siswa/:id/kelas", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Penempatan siswa belum tersedia untuk produksi." });
  try {
    const sekolahId = (await getSession(req.headers.cookie, "ADMIN"))?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const data = parsePlacement(req.body);
    if (!data) return res.status(400).json({ error: "Pilih kelas atau kosongkan penempatan." });
    if (data.kelasId && !await prisma.kelas.findFirst({ where: { id: data.kelasId, sekolahId }, select: { id: true } })) return res.status(400).json({ error: "Kelas tidak ditemukan di sekolah ini." });
    const updated = await prisma.siswa.updateMany({ where: { id: req.params.id, sekolahId, status: "Aktif", kelasId: data.expectedKelasId }, data: { kelasId: data.kelasId } });
    if (!updated.count) return res.status(409).json({ error: "Siswa tidak ditemukan atau penempatan sudah berubah. Cari kembali siswa." });
    return res.json({ message: "Penempatan siswa disimpan." });
  } catch (error) {
    console.error("Gagal menyimpan penempatan siswa:", error);
    return res.status(503).json({ error: "Penempatan siswa belum dapat disimpan." });
  }
});

app.get("/api/sekolah/:jenis", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Data sekolah belum tersedia untuk produksi." });
  try {
    const session = await getSession(req.headers.cookie, "ADMIN");
    const sekolahId = session?.akun.sekolahId;
    if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
    const pageValue = req.query.page;
    if (pageValue !== undefined && (typeof pageValue !== "string" || !/^[1-9]\d{0,5}$/.test(pageValue))) return res.status(400).json({ error: "Nomor halaman tidak valid." });
    const page = pageValue === undefined ? 1 : Number(pageValue);
    const pagination = { skip: (page - 1) * 25, take: 26 };
    let rows: { id: string; nama: string; keterangan: string; status: string; punyaAkun?: boolean; email?: string; telepon?: string; alamat?: string; jenjang?: string; catatan?: string | null }[];
    if (req.params.jenis === "siswa") {
      const data = await prisma.siswa.findMany({ where: { sekolahId }, select: { id: true, nama: true, nisn: true, status: true, akun: { select: { id: true } } }, orderBy: { id: "asc" }, ...pagination });
      rows = data.map((item) => ({ id: item.id, nama: item.nama, keterangan: item.nisn, status: item.status, punyaAkun: !!item.akun }));
    } else if (req.params.jenis === "guru") {
      const data = await prisma.guru.findMany({ where: { sekolahId }, select: { id: true, nama: true, nuptk: true, email: true, status: true, akun: { select: { id: true } } }, orderBy: { id: "asc" }, ...pagination });
      rows = data.map((item) => ({ id: item.id, nama: item.nama, keterangan: item.nuptk || "Belum ada", email: item.email, status: item.status, punyaAkun: !!item.akun }));
    } else if (req.params.jenis === "ppdb") {
      const data = await prisma.pPDB.findMany({ where: { sekolahId }, select: { id: true, nama: true, noDaftar: true, status: true, email: true, telepon: true, alamat: true, jenjang: true, catatanTinjauan: true }, orderBy: { id: "asc" }, ...pagination });
      rows = data.map((item) => ({ id: item.id, nama: item.nama, keterangan: item.noDaftar, status: item.status, email: item.email, telepon: item.telepon, alamat: item.alamat, jenjang: item.jenjang, catatan: item.catatanTinjauan }));
    } else return res.status(404).json({ error: "Menu tidak ditemukan." });
    return res.json({ rows: rows.slice(0, 25), page, hasNext: rows.length > 25 });
  } catch (error) {
    console.error("Gagal memuat data sekolah:", error);
    return res.status(503).json({ error: "Data sekolah belum dapat dimuat." });
  }
});

app.get("/api/auth/master/session", async (req, res) => {
  try {
    const session = await getSession(req.headers.cookie);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    return res.json({ nama: session.akun.nama, peran: session.akun.peran });
  } catch (error) {
    console.error("Gagal memeriksa sesi:", error);
    return res.status(503).json({ error: "Layanan sesi tidak tersedia." });
  }
});

app.post("/api/auth/master/logout", async (req, res) => {
  try {
    const session = await getSession(req.headers.cookie);
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
    const session = await getSession(req.headers.cookie);
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
    const session = await getSession(req.headers.cookie);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const pageValue = req.query.page;
    if (pageValue !== undefined && (typeof pageValue !== "string" || !/^[1-9]\d{0,5}$/.test(pageValue))) {
      return res.status(400).json({ error: "Nomor halaman tidak valid." });
    }
    const page = pageValue === undefined ? 1 : Number(pageValue);
    const pageSize = 25;
    const schools = await prisma.sekolah.findMany({
      select: { id: true, nama: true, slug: true, npsn: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
    });
    return res.json({ sekolah: schools.slice(0, pageSize), page, hasNext: schools.length > pageSize });
  } catch (error) {
    console.error("Gagal memuat daftar sekolah:", error);
    return res.status(503).json({ error: "Daftar sekolah tidak tersedia. Coba lagi nanti." });
  }
});

app.get("/api/master/pendaftaran-sekolah", async (req, res) => {
  try {
    const session = await getSession(req.headers.cookie);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const pageValue = req.query.page;
    if (pageValue !== undefined && (typeof pageValue !== "string" || !/^[1-9]\d{0,5}$/.test(pageValue))) {
      return res.status(400).json({ error: "Nomor halaman tidak valid." });
    }
    const page = pageValue === undefined ? 1 : Number(pageValue);
    const pageSize = 25;
    const items = await prisma.pendaftaranSekolah.findMany({
      select: { id: true, namaSekolah: true, npsn: true, namaKontak: true, emailKontak: true, teleponKontak: true, status: true, catatanTinjauan: true, dibuatPada: true, sekolahId: true },
      orderBy: [{ dibuatPada: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
    });
    return res.json({ pendaftaran: items.slice(0, pageSize), page, hasNext: items.length > pageSize });
  } catch (error) {
    console.error("Gagal memuat pendaftaran sekolah:", error);
    return res.status(503).json({ error: "Daftar pendaftaran tidak tersedia. Coba lagi nanti." });
  }
});

app.post("/api/master/pendaftaran-sekolah/:id/tinjau", async (req, res) => {
  try {
    const session = await getSession(req.headers.cookie);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const { keputusan, catatan } = req.body || {};
    if ((keputusan !== "DISETUJUI" && keputusan !== "DITOLAK") || typeof catatan !== "string" || catatan.trim().length > 500 || (keputusan === "DITOLAK" && !catatan.trim())) {
      return res.status(400).json({ error: "Keputusan tidak valid atau catatan penolakan belum diisi." });
    }
    const result = await prisma.pendaftaranSekolah.updateMany({
      where: { id: req.params.id, status: "MENUNGGU" },
      data: { status: keputusan, catatanTinjauan: catatan.trim() || null, ditinjauPada: new Date(), ditinjauOlehId: session.akunId },
    });
    if (result.count === 0) return res.status(409).json({ error: "Pendaftaran tidak ditemukan atau sudah ditinjau. Muat ulang daftar." });
    return res.json({ message: "Keputusan disimpan. Sekolah dan akun belum dibuat secara otomatis; undangan belum tersedia." });
  } catch (error) {
    console.error("Gagal meninjau pendaftaran sekolah:", error);
    return res.status(503).json({ error: "Keputusan belum dapat disimpan. Coba lagi nanti." });
  }
});

app.delete("/api/master/pendaftaran-sekolah/:id", async (req, res) => {
  try {
    const session = await getSession(req.headers.cookie);
    if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
    const result = await prisma.pendaftaranSekolah.deleteMany({ where: { id: req.params.id, sekolahId: null } });
    if (result.count === 0) return res.status(409).json({ error: "Pendaftaran tidak ditemukan atau sudah terhubung ke sekolah. Muat ulang daftar." });
    return res.status(204).end();
  } catch (error) {
    console.error("Gagal menghapus pendaftaran sekolah:", error);
    return res.status(503).json({ error: "Pendaftaran belum dapat dihapus. Coba lagi nanti." });
  }
});

app.use("/api", (_req, res) => res.status(503).json({ error: "Fitur ini belum tersedia." }));
