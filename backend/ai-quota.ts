import { prisma } from "./db.js";
import { hasPlanAccess, type TenantPlan } from "./plan-utils.js";
import { sanitizeEnvValue } from "./ai-exam-generator.js";

export type AiFeatureKey = "cbt_generate" | "assistant";

export const PRO_AI_MONTHLY_LIMITS = {
  cbt_generate: 25,
  assistant: 400,
} as const;

export const AI_QUOTA_BY_PLAN: Record<TenantPlan, { cbt_generate: number; assistant: number }> = {
  basic: { cbt_generate: 0, assistant: 0 },
  reguler: { cbt_generate: 0, assistant: 0 },
  pro: {
    cbt_generate: PRO_AI_MONTHLY_LIMITS.cbt_generate,
    assistant: PRO_AI_MONTHLY_LIMITS.assistant,
  },
};

export type AiFeatureQuotaBucket = {
  limit: number;
  used: number;
  remaining: number;
};

export type SchoolAiQuotaSummary = {
  plan: TenantPlan;
  isPro: boolean;
  monthKey: string;
  resetDateLabel: string;
  hasFallbackKey: boolean;
  maskedFallbackKey: string | null;
  cbtGenerate: AiFeatureQuotaBucket;
  assistant: AiFeatureQuotaBucket;
};

export type AiQuotaGateResult =
  | {
      ok: true;
      mode: "vendor" | "school_fallback";
      apiKeyOverride?: string;
      summary: SchoolAiQuotaSummary;
    }
  | {
      ok: false;
      status: 403 | 429;
      code: "AI_PRO_REQUIRED" | "AI_QUOTA_EXCEEDED";
      error: string;
      summary: SchoolAiQuotaSummary;
    };

type StoredMonthlyUsage = {
  cbtGenerateUsed: number;
  assistantUsed: number;
  updatedAt: string;
};

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const INDONESIAN_MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function getWibYearMonth(now: Date = new Date()): { year: number; month: number } {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1, // 1..12
  };
}

export function getCurrentQuotaMonthKey(now: Date = new Date()): string {
  const { year, month } = getWibYearMonth(now);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function getNextResetDateLabel(now: Date = new Date()): string {
  const { year, month } = getWibYearMonth(now);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `1 ${INDONESIAN_MONTHS[nextMonth - 1]} ${nextYear}`;
}

export function maskGeminiApiKey(rawKey: string | null | undefined): string | null {
  const clean = sanitizeEnvValue(rawKey ?? undefined);
  if (!clean) return null;
  if (clean.length <= 8) return "••••••••";
  return `${clean.slice(0, 6)}••••${clean.slice(-4)}`;
}

function usageSettingKey(sekolahId: string, monthKey: string): string {
  return `ai_usage:${sekolahId}:${monthKey}`;
}

function fallbackKeySettingKey(sekolahId: string): string {
  return `ai_fallback_gemini_key:${sekolahId}`;
}

function parseUsageJson(raw: string | null | undefined): StoredMonthlyUsage {
  if (!raw) return { cbtGenerateUsed: 0, assistantUsed: 0, updatedAt: new Date().toISOString() };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredMonthlyUsage>;
    return {
      cbtGenerateUsed:
        typeof parsed.cbtGenerateUsed === "number" && Number.isFinite(parsed.cbtGenerateUsed) && parsed.cbtGenerateUsed >= 0
          ? Math.floor(parsed.cbtGenerateUsed)
          : 0,
      assistantUsed:
        typeof parsed.assistantUsed === "number" && Number.isFinite(parsed.assistantUsed) && parsed.assistantUsed >= 0
          ? Math.floor(parsed.assistantUsed)
          : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return { cbtGenerateUsed: 0, assistantUsed: 0, updatedAt: new Date().toISOString() };
  }
}

export async function readSchoolFallbackGeminiKey(sekolahId: string): Promise<string | null> {
  const row = await prisma.platformSetting
    .findUnique({
      where: { key: fallbackKeySettingKey(sekolahId) },
      select: { value: true },
    })
    .catch(() => null);
  const clean = sanitizeEnvValue(row?.value);
  return clean || null;
}

export async function saveSchoolFallbackGeminiKey(
  sekolahId: string,
  rawKey: string | null | undefined,
): Promise<{ ok: true; hasFallbackKey: boolean; maskedFallbackKey: string | null } | { ok: false; status: number; error: string }> {
  const clean = sanitizeEnvValue(rawKey ?? undefined);
  if (!clean) {
    await prisma.platformSetting
      .deleteMany({ where: { key: fallbackKeySettingKey(sekolahId) } })
      .catch(() => null);
    return { ok: true, hasFallbackKey: false, maskedFallbackKey: null };
  }

  if (clean.length < 20 || clean.length > 200 || /\s/.test(clean)) {
    return {
      ok: false,
      status: 400,
      error: "Format API Key Gemini tidak valid. Pastikan salin kunci API Google AI Studio tanpa spasi.",
    };
  }

  await prisma.platformSetting.upsert({
    where: { key: fallbackKeySettingKey(sekolahId) },
    create: { key: fallbackKeySettingKey(sekolahId), value: clean },
    update: { value: clean },
  });

  return {
    ok: true,
    hasFallbackKey: true,
    maskedFallbackKey: maskGeminiApiKey(clean),
  };
}

export async function getSchoolAiQuotaSummary(
  sekolahId: string,
  plan: TenantPlan,
  now: Date = new Date(),
): Promise<SchoolAiQuotaSummary> {
  const monthKey = getCurrentQuotaMonthKey(now);
  const resetDateLabel = getNextResetDateLabel(now);
  const limits = AI_QUOTA_BY_PLAN[plan];

  const [usageRow, fallbackKey] = await Promise.all([
    prisma.platformSetting
      .findUnique({
        where: { key: usageSettingKey(sekolahId, monthKey) },
        select: { value: true },
      })
      .catch(() => null),
    readSchoolFallbackGeminiKey(sekolahId),
  ]);

  const usage = parseUsageJson(usageRow?.value);
  const cbtRemaining = Math.max(0, limits.cbt_generate - usage.cbtGenerateUsed);
  const assistantRemaining = Math.max(0, limits.assistant - usage.assistantUsed);

  return {
    plan,
    isPro: hasPlanAccess(plan, "pro"),
    monthKey,
    resetDateLabel,
    hasFallbackKey: Boolean(fallbackKey),
    maskedFallbackKey: maskGeminiApiKey(fallbackKey),
    cbtGenerate: {
      limit: limits.cbt_generate,
      used: usage.cbtGenerateUsed,
      remaining: cbtRemaining,
    },
    assistant: {
      limit: limits.assistant,
      used: usage.assistantUsed,
      remaining: assistantRemaining,
    },
  };
}

export function evaluateAiQuotaGate(
  summary: SchoolAiQuotaSummary,
  feature: AiFeatureKey,
  fallbackKey: string | null,
): AiQuotaGateResult {
  if (!summary.isPro) {
    return {
      ok: false,
      status: 403,
      code: "AI_PRO_REQUIRED",
      error:
        "Fitur AI Gemini (Generator Soal CBT AI & Asisten Belajar AI) khusus untuk Paket Pro. " +
        "Silakan upgrade ke Paket Pro (Rp 2.000.000/tahun) untuk mendapatkan kuota 25x generate soal CBT AI & 400 pesan Asisten Belajar AI per bulan.",
      summary,
    };
  }

  const bucket = feature === "cbt_generate" ? summary.cbtGenerate : summary.assistant;
  if (bucket.remaining > 0) {
    return {
      ok: true,
      mode: "vendor",
      summary,
    };
  }

  if (fallbackKey) {
    return {
      ok: true,
      mode: "school_fallback",
      apiKeyOverride: fallbackKey,
      summary,
    };
  }

  const featureName =
    feature === "cbt_generate"
      ? `Generator Soal CBT AI (${bucket.limit}x/bulan)`
      : `Asisten Belajar AI (${bucket.limit} pesan/bulan)`;

  return {
    ok: false,
    status: 429,
    code: "AI_QUOTA_EXCEEDED",
    error:
      `Kuota bulanan ${featureName} untuk lembaga Anda telah tercapai (${bucket.used}/${bucket.limit}). ` +
      `Kuota akan direset otomatis pada ${summary.resetDateLabel}. ` +
      `Hubungi admin SIPUT PKBM untuk opsi top-up kuota, atau masukkan API Key Gemini mandiri (opsional) di menu Profil & Identitas Sekolah sebagai cadangan.`,
    summary,
  };
}

export async function checkSchoolAiQuota(
  sekolahId: string,
  plan: TenantPlan,
  feature: AiFeatureKey,
  now: Date = new Date(),
): Promise<AiQuotaGateResult> {
  const [summary, fallbackKey] = await Promise.all([
    getSchoolAiQuotaSummary(sekolahId, plan, now),
    readSchoolFallbackGeminiKey(sekolahId),
  ]);
  return evaluateAiQuotaGate(summary, feature, fallbackKey);
}

export async function recordSchoolAiUsage(
  sekolahId: string,
  plan: TenantPlan,
  feature: AiFeatureKey,
  now: Date = new Date(),
): Promise<SchoolAiQuotaSummary> {
  const monthKey = getCurrentQuotaMonthKey(now);
  const key = usageSettingKey(sekolahId, monthKey);

  const existing = await prisma.platformSetting
    .findUnique({ where: { key }, select: { value: true } })
    .catch(() => null);
  const current = parseUsageJson(existing?.value);
  const next: StoredMonthlyUsage = {
    cbtGenerateUsed: current.cbtGenerateUsed + (feature === "cbt_generate" ? 1 : 0),
    assistantUsed: current.assistantUsed + (feature === "assistant" ? 1 : 0),
    updatedAt: now.toISOString(),
  };

  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });

  return getSchoolAiQuotaSummary(sekolahId, plan, now);
}
