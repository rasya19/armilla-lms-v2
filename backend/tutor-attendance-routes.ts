import crypto from "node:crypto";
import { Router, type Request } from "express";
import { prisma } from "./db.js";
import { readSchoolKopSurat } from "./kop-surat-helper.js";
import { normalizeTenantPlan } from "./plan-utils.js";

export type TutorAttendanceMethod = "TATAP_MUKA" | "DARING" | "TUTORIAL";
export type TutorAttendanceStatus = "MENUNGGU" | "DISETUJUI" | "DITOLAK";
export type TutorHonorMode = "NONE" | "PER_PERTEMUAN" | "BULANAN" | "KOMBINASI";

export type TutorAttendanceRecord = {
  id: string;
  guruId: string;
  guruNama: string;
  tanggal: string; // YYYY-MM-DD
  jamMasuk: string; // HH:mm WIB
  kelasId: string | null;
  kelasNama: string;
  mapelId: string | null;
  mapelNama: string;
  metode: TutorAttendanceMethod;
  materi: string;
  status: TutorAttendanceStatus;
  catatanAdmin: string | null;
  dibuatOleh: "GURU" | "ADMIN";
  createdAt: string;
};

export type TutorHonorRateOverride = {
  tarifPertemuan?: number | null;
  honorBulanan?: number | null;
  transportPertemuan?: number | null;
};

export type TutorHonorConfig = {
  mode: TutorHonorMode;
  defaultTarifPertemuan: number;
  defaultHonorBulanan: number;
  defaultTransportPertemuan: number;
  perGuru: Record<string, TutorHonorRateOverride>;
};

const DEFAULT_HONOR_CONFIG: TutorHonorConfig = {
  mode: "NONE",
  defaultTarifPertemuan: 50000,
  defaultHonorBulanan: 500000,
  defaultTransportPertemuan: 25000,
  perGuru: {},
};

const VALID_METHODS = new Set<TutorAttendanceMethod>(["TATAP_MUKA", "DARING", "TUTORIAL"]);
const VALID_STATUSES = new Set<TutorAttendanceStatus>(["MENUNGGU", "DISETUJUI", "DITOLAK"]);
const VALID_HONOR_MODES = new Set<TutorHonorMode>(["NONE", "PER_PERTEMUAN", "BULANAN", "KOMBINASI"]);

function currentWibMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? String(now.getUTCFullYear());
  const m = parts.find((p) => p.type === "month")?.value ?? String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function currentWibDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? String(now.getUTCFullYear());
  const m = parts.find((p) => p.type === "month")?.value ?? String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = parts.find((p) => p.type === "day")?.value ?? String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function currentWibTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value ?? "08";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

function normalizeMonthParam(raw: unknown): string {
  if (typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.trim())) {
    return raw.trim();
  }
  return currentWibMonth();
}

function normalizeDateParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const dt = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== trimmed) return null;
  return trimmed;
}

function cleanStr(raw: unknown, maxLen: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, maxLen) : "";
}

function cleanAmount(raw: unknown, fallback = 0): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.round(n), 100_000_000);
}

function attendanceSettingKey(sekolahId: string, month: string): string {
  return `tutor_attendance:${sekolahId}:${month}`;
}

function honorConfigSettingKey(sekolahId: string): string {
  return `tutor_honor_config:${sekolahId}`;
}

async function readMonthlyAttendance(sekolahId: string, month: string): Promise<TutorAttendanceRecord[]> {
  const row = await prisma.platformSetting
    .findUnique({ where: { key: attendanceSettingKey(sekolahId, month) }, select: { value: true } })
    .catch(() => null);
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as TutorAttendanceRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeMonthlyAttendance(
  sekolahId: string,
  month: string,
  records: TutorAttendanceRecord[],
): Promise<void> {
  const key = attendanceSettingKey(sekolahId, month);
  const value = JSON.stringify(records);
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

async function readHonorConfig(sekolahId: string): Promise<TutorHonorConfig> {
  const row = await prisma.platformSetting
    .findUnique({ where: { key: honorConfigSettingKey(sekolahId) }, select: { value: true } })
    .catch(() => null);
  if (!row?.value) return { ...DEFAULT_HONOR_CONFIG, perGuru: {} };
  try {
    const parsed = JSON.parse(row.value) as Partial<TutorHonorConfig>;
    return {
      mode: parsed.mode && VALID_HONOR_MODES.has(parsed.mode) ? parsed.mode : "NONE",
      defaultTarifPertemuan: cleanAmount(parsed.defaultTarifPertemuan, DEFAULT_HONOR_CONFIG.defaultTarifPertemuan),
      defaultHonorBulanan: cleanAmount(parsed.defaultHonorBulanan, DEFAULT_HONOR_CONFIG.defaultHonorBulanan),
      defaultTransportPertemuan: cleanAmount(
        parsed.defaultTransportPertemuan,
        DEFAULT_HONOR_CONFIG.defaultTransportPertemuan,
      ),
      perGuru: parsed.perGuru && typeof parsed.perGuru === "object" && !Array.isArray(parsed.perGuru) ? parsed.perGuru : {},
    };
  } catch {
    return { ...DEFAULT_HONOR_CONFIG, perGuru: {} };
  }
}

async function writeHonorConfig(sekolahId: string, config: TutorHonorConfig): Promise<void> {
  const key = honorConfigSettingKey(sekolahId);
  const value = JSON.stringify(config);
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export function computeTutorMonthlyHonor(
  disetujuiCount: number,
  config: TutorHonorConfig,
  override?: TutorHonorRateOverride,
): {
  tarifPertemuan: number;
  honorBulanan: number;
  transportPertemuan: number;
  totalHonor: number;
} {
  const tarifPertemuan =
    typeof override?.tarifPertemuan === "number" && override.tarifPertemuan >= 0
      ? override.tarifPertemuan
      : config.defaultTarifPertemuan;
  const honorBulanan =
    typeof override?.honorBulanan === "number" && override.honorBulanan >= 0
      ? override.honorBulanan
      : config.defaultHonorBulanan;
  const transportPertemuan =
    typeof override?.transportPertemuan === "number" && override.transportPertemuan >= 0
      ? override.transportPertemuan
      : config.defaultTransportPertemuan;

  let totalHonor = 0;
  if (config.mode === "PER_PERTEMUAN") {
    totalHonor = disetujuiCount * tarifPertemuan;
  } else if (config.mode === "BULANAN") {
    totalHonor = honorBulanan;
  } else if (config.mode === "KOMBINASI") {
    totalHonor = honorBulanan + disetujuiCount * transportPertemuan;
  }

  return { tarifPertemuan, honorBulanan, transportPertemuan, totalHonor };
}

type AdminSessionResolver = (req: Request) => Promise<{ sekolahId: string } | null>;
type TeacherContextResolver = (req: Request) => Promise<{ sekolahId: string; guruId: string; nama: string } | null>;

export function schoolTutorAttendanceRoutes(resolveAdmin: AdminSessionResolver) {
  const router = Router();

  // GET /api/sekolah/absen-tutor?bulan=YYYY-MM&guruId=... (Semua Paket Basic+; Honor aktif khusus Pro)
  router.get("/absen-tutor", async (req, res) => {
    try {
      const session = await resolveAdmin(req);
      if (!session) return res.status(401).json({ error: "Sesi admin sekolah tidak valid." });
      const { sekolahId } = session;
      const bulan = normalizeMonthParam(req.query.bulan);
      const guruFilter = typeof req.query.guruId === "string" ? req.query.guruId.trim() : "";

      const [school, kopSurat, gurus, kelasList, mapelList, allRecords, storedHonorConfig] = await Promise.all([
        prisma.sekolah.findUnique({ where: { id: sekolahId }, select: { id: true, nama: true, plan: true } }),
        readSchoolKopSurat(sekolahId),
        prisma.guru.findMany({
          where: { sekolahId, status: "Aktif" },
          select: { id: true, nama: true, nuptk: true },
          orderBy: [{ nama: "asc" }, { id: "asc" }],
          take: 500,
        }),
        prisma.kelas.findMany({
          where: { sekolahId },
          select: { id: true, nama: true },
          orderBy: [{ nama: "asc" }, { id: "asc" }],
          take: 500,
        }),
        prisma.mapel.findMany({
          where: { sekolahId },
          select: { id: true, nama: true },
          orderBy: [{ nama: "asc" }, { id: "asc" }],
          take: 500,
        }),
        readMonthlyAttendance(sekolahId, bulan),
        readHonorConfig(sekolahId),
      ]);

      const isPro = normalizeTenantPlan(school?.plan) === "pro";
      const effectiveHonorConfig: TutorHonorConfig = isPro
        ? storedHonorConfig
        : { ...DEFAULT_HONOR_CONFIG, mode: "NONE", perGuru: {} };

      const sortedRecords = [...allRecords].sort((a, b) => {
        const cmpDate = b.tanggal.localeCompare(a.tanggal);
        if (cmpDate !== 0) return cmpDate;
        return b.createdAt.localeCompare(a.createdAt);
      });
      const filteredRecords = guruFilter
        ? sortedRecords.filter((r) => r.guruId === guruFilter)
        : sortedRecords;

      const rekapPerGuru = gurus.map((g) => {
        const list = allRecords.filter((r) => r.guruId === g.id);
        const disetujui = list.filter((r) => r.status === "DISETUJUI").length;
        const menunggu = list.filter((r) => r.status === "MENUNGGU").length;
        const ditolak = list.filter((r) => r.status === "DITOLAK").length;
        const honor = isPro
          ? computeTutorMonthlyHonor(disetujui, effectiveHonorConfig, effectiveHonorConfig.perGuru[g.id])
          : { tarifPertemuan: 0, honorBulanan: 0, transportPertemuan: 0, totalHonor: 0 };
        return {
          guruId: g.id,
          guruNama: g.nama,
          nuptk: g.nuptk ?? null,
          totalInput: list.length,
          disetujui,
          menunggu,
          ditolak,
          ...honor,
        };
      });

      return res.json({
        bulan,
        isPro,
        kopSurat,
        gurus,
        kelasList,
        mapelList,
        records: filteredRecords,
        rekapPerGuru,
        honorConfig: effectiveHonorConfig,
      });
    } catch (error) {
      console.error("Gagal memuat absensi tutor:", error);
      return res.status(503).json({ error: "Data absensi tutor belum dapat dimuat." });
    }
  });

  // POST /api/sekolah/absen-tutor — Admin mencatat absen tutor manual (langsung DISETUJUI)
  router.post("/absen-tutor", async (req, res) => {
    try {
      const session = await resolveAdmin(req);
      if (!session) return res.status(401).json({ error: "Sesi admin sekolah tidak valid." });
      const { sekolahId } = session;
      const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const guruId = cleanStr(body.guruId, 100);
      const tanggal = normalizeDateParam(body.tanggal) ?? currentWibDate();
      const kelasId = cleanStr(body.kelasId, 100) || null;
      const mapelId = cleanStr(body.mapelId, 100) || null;
      const metodeRaw = cleanStr(body.metode, 30).toUpperCase() as TutorAttendanceMethod;
      const metode: TutorAttendanceMethod = VALID_METHODS.has(metodeRaw) ? metodeRaw : "TATAP_MUKA";
      const materi = cleanStr(body.materi, 300);
      const jamMasuk = /^\d{2}:\d{2}$/.test(cleanStr(body.jamMasuk, 10)) ? cleanStr(body.jamMasuk, 10) : currentWibTime();

      if (!guruId) return res.status(400).json({ error: "Pilih tutor terlebih dahulu." });
      if (!materi) return res.status(400).json({ error: "Materi atau catatan pertemuan wajib diisi." });

      const [guru, kelas, mapel] = await Promise.all([
        prisma.guru.findFirst({ where: { id: guruId, sekolahId, status: "Aktif" }, select: { id: true, nama: true } }),
        kelasId ? prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true, nama: true } }) : null,
        mapelId ? prisma.mapel.findFirst({ where: { id: mapelId, sekolahId }, select: { id: true, nama: true } }) : null,
      ]);
      if (!guru) return res.status(404).json({ error: "Tutor aktif tidak ditemukan di sekolah ini." });

      const bulan = tanggal.slice(0, 7);
      const records = await readMonthlyAttendance(sekolahId, bulan);
      const newRecord: TutorAttendanceRecord = {
        id: `at-${crypto.randomUUID()}`,
        guruId: guru.id,
        guruNama: guru.nama,
        tanggal,
        jamMasuk,
        kelasId: kelas?.id ?? null,
        kelasNama: kelas?.nama ?? (cleanStr(body.kelasNama, 100) || "Umum"),
        mapelId: mapel?.id ?? null,
        mapelNama: mapel?.nama ?? (cleanStr(body.mapelNama, 100) || "Pembelajaran Kesetaraan"),
        metode,
        materi,
        status: "DISETUJUI",
        catatanAdmin: null,
        dibuatOleh: "ADMIN",
        createdAt: new Date().toISOString(),
      };
      records.unshift(newRecord);
      await writeMonthlyAttendance(sekolahId, bulan, records.slice(0, 2000));
      return res.status(201).json({ record: newRecord, message: `Kehadiran ${guru.nama} berhasil dicatat.` });
    } catch (error) {
      console.error("Gagal mencatat absen tutor manual:", error);
      return res.status(503).json({ error: "Absen tutor belum dapat disimpan." });
    }
  });

  // PATCH /api/sekolah/absen-tutor/:id/status — Admin menyetujui / menolak kehadiran tutor
  router.patch("/absen-tutor/:id/status", async (req, res) => {
    try {
      const session = await resolveAdmin(req);
      if (!session) return res.status(401).json({ error: "Sesi admin sekolah tidak valid." });
      const { sekolahId } = session;
      const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const bulan = normalizeMonthParam(body.bulan);
      const statusRaw = cleanStr(body.status, 30).toUpperCase() as TutorAttendanceStatus;
      const catatanAdmin = cleanStr(body.catatanAdmin, 300) || null;
      if (!VALID_STATUSES.has(statusRaw)) {
        return res.status(400).json({ error: "Status harus MENUNGGU, DISETUJUI, atau DITOLAK." });
      }

      const records = await readMonthlyAttendance(sekolahId, bulan);
      const idx = records.findIndex((r) => r.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Catatan kehadiran tutor tidak ditemukan." });

      records[idx] = { ...records[idx], status: statusRaw, catatanAdmin };
      await writeMonthlyAttendance(sekolahId, bulan, records);
      return res.json({
        record: records[idx],
        message:
          statusRaw === "DISETUJUI"
            ? `Kehadiran ${records[idx].guruNama} disetujui.`
            : statusRaw === "DITOLAK"
              ? `Kehadiran ${records[idx].guruNama} ditolak.`
              : `Status kehadiran ${records[idx].guruNama} dikembalikan ke Menunggu.`,
      });
    } catch (error) {
      console.error("Gagal memperbarui status absen tutor:", error);
      return res.status(503).json({ error: "Status absen tutor belum dapat diperbarui." });
    }
  });

  // DELETE /api/sekolah/absen-tutor/:id?bulan=YYYY-MM
  router.delete("/absen-tutor/:id", async (req, res) => {
    try {
      const session = await resolveAdmin(req);
      if (!session) return res.status(401).json({ error: "Sesi admin sekolah tidak valid." });
      const { sekolahId } = session;
      const bulan = normalizeMonthParam(req.query.bulan);
      const records = await readMonthlyAttendance(sekolahId, bulan);
      const next = records.filter((r) => r.id !== req.params.id);
      if (next.length === records.length) {
        return res.status(404).json({ error: "Catatan kehadiran tutor tidak ditemukan." });
      }
      await writeMonthlyAttendance(sekolahId, bulan, next);
      return res.json({ message: "Catatan kehadiran tutor dihapus." });
    } catch (error) {
      console.error("Gagal menghapus absen tutor:", error);
      return res.status(503).json({ error: "Catatan kehadiran tutor belum dapat dihapus." });
    }
  });

  // PUT /api/sekolah/absen-tutor/honor-config — KHUSUS PAKET PRO
  router.put("/absen-tutor/honor-config", async (req, res) => {
    try {
      const session = await resolveAdmin(req);
      if (!session) return res.status(401).json({ error: "Sesi admin sekolah tidak valid." });
      const { sekolahId } = session;

      const school = await prisma.sekolah.findUnique({ where: { id: sekolahId }, select: { plan: true } });
      if (normalizeTenantPlan(school?.plan) !== "pro") {
        return res.status(403).json({
          code: "PRO_REQUIRED",
          error: "Pengaturan & kalkulasi Honor Tutor khusus untuk Paket Pro. Presensi kehadiran tutor tetap dapat digunakan di semua paket.",
        });
      }

      const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const modeRaw = cleanStr(body.mode, 30).toUpperCase() as TutorHonorMode;
      const mode: TutorHonorMode = VALID_HONOR_MODES.has(modeRaw) ? modeRaw : "NONE";

      const rawPerGuru = body.perGuru && typeof body.perGuru === "object" && !Array.isArray(body.perGuru)
        ? (body.perGuru as Record<string, unknown>)
        : {};
      const perGuru: Record<string, TutorHonorRateOverride> = {};
      for (const [gid, val] of Object.entries(rawPerGuru)) {
        if (!val || typeof val !== "object" || Array.isArray(val)) continue;
        const item = val as Record<string, unknown>;
        const entry: TutorHonorRateOverride = {};
        if (item.tarifPertemuan !== undefined && item.tarifPertemuan !== null && item.tarifPertemuan !== "") {
          entry.tarifPertemuan = cleanAmount(item.tarifPertemuan, 0);
        }
        if (item.honorBulanan !== undefined && item.honorBulanan !== null && item.honorBulanan !== "") {
          entry.honorBulanan = cleanAmount(item.honorBulanan, 0);
        }
        if (item.transportPertemuan !== undefined && item.transportPertemuan !== null && item.transportPertemuan !== "") {
          entry.transportPertemuan = cleanAmount(item.transportPertemuan, 0);
        }
        if (Object.keys(entry).length > 0) perGuru[gid] = entry;
      }

      const nextConfig: TutorHonorConfig = {
        mode,
        defaultTarifPertemuan: cleanAmount(body.defaultTarifPertemuan, DEFAULT_HONOR_CONFIG.defaultTarifPertemuan),
        defaultHonorBulanan: cleanAmount(body.defaultHonorBulanan, DEFAULT_HONOR_CONFIG.defaultHonorBulanan),
        defaultTransportPertemuan: cleanAmount(
          body.defaultTransportPertemuan,
          DEFAULT_HONOR_CONFIG.defaultTransportPertemuan,
        ),
        perGuru,
      };
      await writeHonorConfig(sekolahId, nextConfig);
      return res.json({ honorConfig: nextConfig, message: "Skema honor tutor berhasil disimpan." });
    } catch (error) {
      console.error("Gagal menyimpan konfigurasi honor tutor:", error);
      return res.status(503).json({ error: "Skema honor tutor belum dapat disimpan." });
    }
  });

  return router;
}

export function teacherTutorAttendanceRoutes(resolveTeacher: TeacherContextResolver) {
  const router = Router();

  // GET /api/lms/guru/absen-tutor?bulan=YYYY-MM (Semua Paket Basic+; hanya kehadiran sendiri, tanpa nominal honor)
  router.get("/absen-tutor", async (req, res) => {
    try {
      const ctx = await resolveTeacher(req);
      if (!ctx) return res.status(401).json({ error: "Sesi guru tidak valid." });
      const { sekolahId, guruId } = ctx;
      const bulan = normalizeMonthParam(req.query.bulan);

      const [allRecords, kelasList, mapelList] = await Promise.all([
        readMonthlyAttendance(sekolahId, bulan),
        prisma.kelas.findMany({
          where: { sekolahId },
          select: { id: true, nama: true },
          orderBy: [{ nama: "asc" }, { id: "asc" }],
          take: 500,
        }),
        prisma.mapel.findMany({
          where: { sekolahId },
          select: { id: true, nama: true },
          orderBy: [{ nama: "asc" }, { id: "asc" }],
          take: 500,
        }),
      ]);

      const ownRecords = allRecords
        .filter((r) => r.guruId === guruId)
        .sort((a, b) => {
          const cmpDate = b.tanggal.localeCompare(a.tanggal);
          if (cmpDate !== 0) return cmpDate;
          return b.createdAt.localeCompare(a.createdAt);
        });

      return res.json({
        bulan,
        kelasList,
        mapelList,
        records: ownRecords,
        summary: {
          totalInput: ownRecords.length,
          disetujui: ownRecords.filter((r) => r.status === "DISETUJUI").length,
          menunggu: ownRecords.filter((r) => r.status === "MENUNGGU").length,
          ditolak: ownRecords.filter((r) => r.status === "DITOLAK").length,
        },
      });
    } catch (error) {
      console.error("Gagal memuat absensi mengajar guru:", error);
      return res.status(503).json({ error: "Riwayat absen mengajar belum dapat dimuat." });
    }
  });

  // POST /api/lms/guru/absen-tutor — Tutor mengisi absen mengajar sendiri
  router.post("/absen-tutor", async (req, res) => {
    try {
      const ctx = await resolveTeacher(req);
      if (!ctx) return res.status(401).json({ error: "Sesi guru tidak valid." });
      const { sekolahId, guruId, nama } = ctx;
      const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const tanggal = normalizeDateParam(body.tanggal) ?? currentWibDate();
      const kelasId = cleanStr(body.kelasId, 100) || null;
      const mapelId = cleanStr(body.mapelId, 100) || null;
      const metodeRaw = cleanStr(body.metode, 30).toUpperCase() as TutorAttendanceMethod;
      const metode: TutorAttendanceMethod = VALID_METHODS.has(metodeRaw) ? metodeRaw : "TATAP_MUKA";
      const materi = cleanStr(body.materi, 300);

      if (!materi) return res.status(400).json({ error: "Tuliskan ringkasan materi atau kegiatan pertemuan." });

      const [kelas, mapel] = await Promise.all([
        kelasId ? prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true, nama: true } }) : null,
        mapelId ? prisma.mapel.findFirst({ where: { id: mapelId, sekolahId }, select: { id: true, nama: true } }) : null,
      ]);

      const bulan = tanggal.slice(0, 7);
      const records = await readMonthlyAttendance(sekolahId, bulan);
      const newRecord: TutorAttendanceRecord = {
        id: `at-${crypto.randomUUID()}`,
        guruId,
        guruNama: nama,
        tanggal,
        jamMasuk: currentWibTime(),
        kelasId: kelas?.id ?? null,
        kelasNama: kelas?.nama ?? "Umum",
        mapelId: mapel?.id ?? null,
        mapelNama: mapel?.nama ?? "Pembelajaran Kesetaraan",
        metode,
        materi,
        status: "MENUNGGU",
        catatanAdmin: null,
        dibuatOleh: "GURU",
        createdAt: new Date().toISOString(),
      };
      records.unshift(newRecord);
      await writeMonthlyAttendance(sekolahId, bulan, records.slice(0, 2000));
      return res.status(201).json({
        record: newRecord,
        message: "Absen mengajar berhasil dicatat dan menunggu verifikasi Admin PKBM.",
      });
    } catch (error) {
      console.error("Gagal mencatat absen mengajar guru:", error);
      return res.status(503).json({ error: "Absen mengajar belum dapat disimpan." });
    }
  });

  // DELETE /api/lms/guru/absen-tutor/:id?bulan=YYYY-MM — Hapus catatan sendiri yang masih MENUNGGU
  router.delete("/absen-tutor/:id", async (req, res) => {
    try {
      const ctx = await resolveTeacher(req);
      if (!ctx) return res.status(401).json({ error: "Sesi guru tidak valid." });
      const { sekolahId, guruId } = ctx;
      const bulan = normalizeMonthParam(req.query.bulan);
      const records = await readMonthlyAttendance(sekolahId, bulan);
      const target = records.find((r) => r.id === req.params.id && r.guruId === guruId);
      if (!target) return res.status(404).json({ error: "Catatan absen tidak ditemukan." });
      if (target.status !== "MENUNGGU") {
        return res.status(409).json({ error: "Hanya catatan berstatus Menunggu yang dapat dihapus oleh tutor." });
      }
      await writeMonthlyAttendance(
        sekolahId,
        bulan,
        records.filter((r) => r.id !== target.id),
      );
      return res.json({ message: "Catatan absen mengajar dihapus." });
    } catch (error) {
      console.error("Gagal menghapus absen mengajar guru:", error);
      return res.status(503).json({ error: "Catatan absen belum dapat dihapus." });
    }
  });

  return router;
}
