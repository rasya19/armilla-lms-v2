export type CachedTenantProfile = {
  nama: string;
  slug: string;
  logoUrl: string | null;
  themeKey: string;
  plan?: string;
  updatedAt: number;
};

export type AuthCacheScope = "sekolah" | "lms" | "master";

export type SchoolAuthCache = {
  token?: string;
  nama: string;
  email?: string | null;
  isDeveloper?: boolean;
  sekolah: string;
  slug: string;
  plan: string;
  rawPlan?: string | null;
  themeKey?: string;
  user?: {
    nama?: string;
    email?: string | null;
    peran?: string;
    isDeveloper?: boolean;
  };
  updatedAt: number;
};

export type LmsAuthCache = {
  token?: string;
  nama: string;
  peran: "SISWA" | "GURU";
  wajibGantiPassword: boolean;
  user?: {
    nama?: string;
    peran?: "SISWA" | "GURU";
    wajibGantiPassword?: boolean;
  };
  updatedAt: number;
};

export type MasterAuthCache = {
  token?: string;
  nama: string;
  peran?: string;
  user?: {
    nama?: string;
    peran?: string;
  };
  updatedAt: number;
};

const TENANT_PROFILE_PREFIX = "armilla_tenant_profile_v1:";
const AUTH_CACHE_PREFIX = "armilla_auth_v1:";
const AUTH_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const PROFILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BASE_DOMAINS = ["pkbm.siput.id", "rsch.my.id"] as const;

export function deriveTenantSlugFromHost(hostname?: string): string {
  const host = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")).trim().toLowerCase();
  if (!host) return "";
  for (const base of BASE_DOMAINS) {
    if (host.endsWith(`.${base}`)) {
      const sub = host.slice(0, -(base.length + 1));
      if (sub && sub !== "www" && !sub.includes(".")) {
        return sub;
      }
    }
  }
  if (host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    if (sub && sub !== "www" && !sub.includes(".")) {
      return sub;
    }
  }
  return "";
}

export function formatSlugDisplayName(slug: string): string {
  const clean = slug.trim().toLowerCase();
  if (!clean) return "Portal Sekolah";
  if (clean === "sandbox") return "Sandbox PKBM Rasyatech";
  return clean
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => {
      if (word === "pkbm" || word === "skb" || word === "lms" || word === "sma" || word === "smp" || word === "sd") {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function profileStorageKey(slug: string): string {
  const normalized = slug.trim().toLowerCase() || (typeof window !== "undefined" ? window.location.host.toLowerCase() : "default");
  return `${TENANT_PROFILE_PREFIX}${normalized}`;
}

export function getCachedTenantProfile(slug: string): CachedTenantProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(profileStorageKey(slug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Partial<CachedTenantProfile>;
    if (typeof obj.nama !== "string" || !obj.nama.trim()) return null;
    if (typeof obj.updatedAt === "number" && Date.now() - obj.updatedAt > PROFILE_MAX_AGE_MS) {
      return null;
    }
    return {
      nama: obj.nama,
      slug: typeof obj.slug === "string" ? obj.slug : slug,
      logoUrl: typeof obj.logoUrl === "string" ? obj.logoUrl : null,
      themeKey: typeof obj.themeKey === "string" ? obj.themeKey : "ocean",
      plan: typeof obj.plan === "string" ? obj.plan : undefined,
      updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveCachedTenantProfile(
  slug: string,
  profile: { nama: string; slug?: string; logoUrl?: string | null; themeKey?: string; plan?: string },
): void {
  if (typeof window === "undefined") return;
  try {
    const normalizedSlug = (profile.slug ?? slug).trim().toLowerCase();
    const existing = getCachedTenantProfile(normalizedSlug);
    const payload: CachedTenantProfile = {
      nama: profile.nama,
      slug: normalizedSlug,
      logoUrl: profile.logoUrl !== undefined ? profile.logoUrl : existing?.logoUrl ?? null,
      themeKey: profile.themeKey ?? existing?.themeKey ?? "ocean",
      plan: profile.plan ?? existing?.plan,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(profileStorageKey(normalizedSlug), JSON.stringify(payload));
  } catch {
    // Ignore localStorage quota / private mode restrictions
  }
}

function authStorageKey(scope: AuthCacheScope): string {
  const host = typeof window !== "undefined" ? (window.location.host || "default").toLowerCase() : "default";
  return `${AUTH_CACHE_PREFIX}${host}:${scope}`;
}

export function saveAuthCache<T extends Record<string, unknown>>(scope: AuthCacheScope, payload: T): void {
  if (typeof window === "undefined") return;
  try {
    const entry = {
      ...payload,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(authStorageKey(scope), JSON.stringify(entry));
  } catch {
    // Ignore localStorage errors
  }
}

export function getAuthCache<T extends { updatedAt?: number }>(scope: AuthCacheScope): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(authStorageKey(scope));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const entry = parsed as T;
    if (typeof entry.updatedAt === "number" && Date.now() - entry.updatedAt > AUTH_MAX_AGE_MS) {
      window.localStorage.removeItem(authStorageKey(scope));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function clearAuthCache(scope: AuthCacheScope): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(authStorageKey(scope));
  } catch {
    // Ignore localStorage errors
  }
}
