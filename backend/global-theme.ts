import { Prisma, type PrismaClient } from "@prisma/client";

export type GlobalThemeKey = "ocean" | "emerald" | "sunset" | "violet" | "dark";

export const GLOBAL_THEME_OPTIONS: Array<{
  key: GlobalThemeKey;
  label: string;
  description: string;
  swatches: [string, string, string];
}> = [
  {
    key: "ocean",
    label: "Ocean & Gold",
    description: "Biru laut segar dengan aksen emas modern (bawaan platform)",
    swatches: ["#0369a1", "#0284c7", "#eab308"],
  },
  {
    key: "violet",
    label: "Royal Violet",
    description: "Ungu indigo elegan berpadu aksen lavender lembut",
    swatches: ["#4338ca", "#6366f1", "#a855f7"],
  },
  {
    key: "emerald",
    label: "Emerald Nusantara",
    description: "Hijau zamrud asri dan nuansa pendidikan ramah lingkungan",
    swatches: ["#047857", "#10b981", "#f59e0b"],
  },
  {
    key: "sunset",
    label: "Sunset Warm",
    description: "Oranye terakota hangat penuh energi dan optimisme",
    swatches: ["#c2410c", "#f97316", "#facc15"],
  },
  {
    key: "dark",
    label: "Midnight Slate",
    description: "Mode gelap profesional dengan kontras tinggi",
    swatches: ["#0f172a", "#334155", "#38bdf8"],
  },
];

const VALID_THEME_KEYS = new Set<GlobalThemeKey>(["ocean", "emerald", "sunset", "violet", "dark"]);
const GLOBAL_THEME_KEY = "global_theme";
const SITE_STAT_PREFIX = "global_theme:";

let inMemoryGlobalTheme: GlobalThemeKey | null = null;

export function isGlobalThemeKey(value: unknown): value is GlobalThemeKey {
  return typeof value === "string" && VALID_THEME_KEYS.has(value as GlobalThemeKey);
}

export function normalizeThemeKey(value: unknown, fallback: GlobalThemeKey = "ocean"): GlobalThemeKey {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (isGlobalThemeKey(normalized)) {
      return normalized;
    }
  }
  return fallback;
}

export function resetInMemoryGlobalTheme(): void {
  inMemoryGlobalTheme = null;
}

function isMissingRelationOrDelegate(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022";
  }
  return error instanceof TypeError;
}

export async function getGlobalTheme(
  prisma: PrismaClient,
  fallbackSchoolTheme?: unknown,
): Promise<GlobalThemeKey> {
  // 1. Primary source: PlatformSetting table
  try {
    const settingDelegate = (prisma as unknown as {
      platformSetting?: {
        findUnique?: (args: { where: { key: string }; select: { value: boolean } }) => Promise<{ value: string } | null>;
      };
    }).platformSetting;
    if (settingDelegate && typeof settingDelegate.findUnique === "function") {
      const row = await settingDelegate.findUnique({
        where: { key: GLOBAL_THEME_KEY },
        select: { value: true },
      });
      if (row && isGlobalThemeKey(row.value)) {
        inMemoryGlobalTheme = row.value;
        return row.value;
      }
    }
  } catch (error) {
    if (!isMissingRelationOrDelegate(error)) {
      console.warn("Gagal membaca PlatformSetting tema global:", error instanceof Error ? error.message : "UnknownError");
    }
  }

  // 2. Fallback source: SiteStat row (when PlatformSetting migration has not been applied yet)
  try {
    const siteStatDelegate = (prisma as unknown as {
      siteStat?: {
        findFirst?: (args: {
          where: { id: { startsWith: string } };
          orderBy: { updatedAt: "desc" };
          select: { id: boolean };
        }) => Promise<{ id: string } | null>;
      };
    }).siteStat;
    if (siteStatDelegate && typeof siteStatDelegate.findFirst === "function") {
      const statRow = await siteStatDelegate.findFirst({
        where: { id: { startsWith: SITE_STAT_PREFIX } },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (statRow?.id) {
        const candidate = statRow.id.slice(SITE_STAT_PREFIX.length);
        if (isGlobalThemeKey(candidate)) {
          inMemoryGlobalTheme = candidate;
          return candidate;
        }
      }
    }
  } catch (error) {
    if (!isMissingRelationOrDelegate(error)) {
      console.warn("Gagal membaca fallback SiteStat tema global:", error instanceof Error ? error.message : "UnknownError");
    }
  }

  // 3. In-memory value set in current runtime or school fallback (preserves test compatibility)
  if (inMemoryGlobalTheme) {
    return inMemoryGlobalTheme;
  }

  return normalizeThemeKey(fallbackSchoolTheme, "ocean");
}

export async function setGlobalTheme(
  prisma: PrismaClient,
  themeKey: GlobalThemeKey,
): Promise<{ themeKey: GlobalThemeKey; updatedSchools: number }> {
  inMemoryGlobalTheme = themeKey;

  let persistedSetting = false;
  try {
    const settingDelegate = (prisma as unknown as {
      platformSetting?: {
        upsert?: (args: {
          where: { key: string };
          create: { key: string; value: string };
          update: { value: string };
        }) => Promise<unknown>;
      };
    }).platformSetting;
    if (settingDelegate && typeof settingDelegate.upsert === "function") {
      await settingDelegate.upsert({
        where: { key: GLOBAL_THEME_KEY },
        create: { key: GLOBAL_THEME_KEY, value: themeKey },
        update: { value: themeKey },
      });
      persistedSetting = true;
    }
  } catch (error) {
    if (!isMissingRelationOrDelegate(error)) {
      console.warn("Gagal menyimpan PlatformSetting tema global:", error instanceof Error ? error.message : "UnknownError");
    }
  }

  if (!persistedSetting) {
    try {
      const siteStatDelegate = (prisma as unknown as {
        siteStat?: {
          deleteMany?: (args: { where: { id: { startsWith: string } } }) => Promise<unknown>;
          upsert?: (args: {
            where: { id: string };
            create: { id: string; visitors: number };
            update: { visitors: number };
          }) => Promise<unknown>;
        };
      }).siteStat;
      if (siteStatDelegate?.deleteMany && siteStatDelegate?.upsert) {
        await siteStatDelegate.deleteMany({ where: { id: { startsWith: SITE_STAT_PREFIX } } });
        await siteStatDelegate.upsert({
          where: { id: `${SITE_STAT_PREFIX}${themeKey}` },
          create: { id: `${SITE_STAT_PREFIX}${themeKey}`, visitors: 0 },
          update: { visitors: 0 },
        });
      }
    } catch (error) {
      if (!isMissingRelationOrDelegate(error)) {
        console.warn("Gagal menyimpan fallback SiteStat tema global:", error instanceof Error ? error.message : "UnknownError");
      }
    }
  }

  let updatedSchools = 0;
  try {
    const res = await prisma.sekolah.updateMany({ data: { themeKey } });
    updatedSchools = res.count;
  } catch (error) {
    // Handle DB check constraint when database migration for 'violet' hasn't run yet
    const msg = error instanceof Error ? error.message : String(error);
    if (themeKey === "violet" && (msg.includes("Sekolah_themeKey_check") || msg.includes("23514"))) {
      try {
        const res = await prisma.sekolah.updateMany({ data: { themeKey: "ocean" } });
        updatedSchools = res.count;
      } catch {
        updatedSchools = 0;
      }
    } else if (!isMissingRelationOrDelegate(error)) {
      console.warn("Gagal memperbarui themeKey pada seluruh sekolah:", msg);
    }
  }

  return { themeKey, updatedSchools };
}
