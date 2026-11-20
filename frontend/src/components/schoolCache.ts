import { fetchWithTimeout } from "./fetchWithTimeout";

const STORAGE_PREFIX = "armilla_school_cache_v1:";
const DEFAULT_PREFETCH_TTL_MS = 15_000;

type CacheEntry = {
  value: unknown;
  updatedAt: number;
};

const memoryStore = new Map<string, Map<string, CacheEntry>>();
const inFlightPrefetches = new Map<string, Promise<void>>();
let activeTenantScope = "";

export function setCacheScope(scope: string): void {
  activeTenantScope = scope.trim().toLowerCase();
}

function tenantKey(): string {
  const host = typeof window !== "undefined" ? window.location.host || "default" : "default";
  return activeTenantScope ? `${host}::${activeTenantScope}` : host;
}

function storageKey(scope: string, endpoint: string): string {
  return `${STORAGE_PREFIX}${scope}::${endpoint}`;
}

function bucket(): Map<string, CacheEntry> {
  const key = tenantKey();
  let map = memoryStore.get(key);
  if (!map) {
    map = new Map<string, CacheEntry>();
    memoryStore.set(key, map);
  }
  return map;
}

function readFromSessionStorage(scope: string, endpoint: string): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(scope, endpoint));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "value" in parsed &&
      "updatedAt" in parsed &&
      typeof parsed.updatedAt === "number"
    ) {
      return parsed as CacheEntry;
    }
  } catch {
    // Ignore malformed or inaccessible sessionStorage
  }
  return null;
}

function writeToSessionStorage(scope: string, endpoint: string, entry: CacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(scope, endpoint), JSON.stringify(entry));
  } catch {
    // Ignore storage quota / private browsing restrictions
  }
}

function removeFromSessionStorage(scope: string, prefixes?: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const fullPrefix = `${STORAGE_PREFIX}${scope}::`;
    const toRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (!key || !key.startsWith(fullPrefix)) continue;
      const endpoint = key.slice(fullPrefix.length);
      if (!prefixes || prefixes.some((prefix) => endpoint.startsWith(prefix))) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors
  }
}

export function getCached<T>(endpoint: string): T | null {
  const scope = tenantKey();
  const map = bucket();
  const mem = map.get(endpoint);
  if (mem !== undefined) return mem.value as T;

  const stored = readFromSessionStorage(scope, endpoint);
  if (stored !== null) {
    map.set(endpoint, stored);
    return stored.value as T;
  }
  return null;
}

export function setCached<T>(endpoint: string, value: T): void {
  const scope = tenantKey();
  const entry: CacheEntry = { value, updatedAt: Date.now() };
  bucket().set(endpoint, entry);
  writeToSessionStorage(scope, endpoint, entry);
}

export function invalidateCache(prefixes?: string | string[]): void {
  const scope = tenantKey();
  const map = bucket();
  if (!prefixes) {
    map.clear();
    removeFromSessionStorage(scope);
    return;
  }
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  for (const key of [...map.keys()]) {
    if (list.some((prefix) => key.startsWith(prefix))) {
      map.delete(key);
    }
  }
  removeFromSessionStorage(scope, list);
}

function isFresh(endpoint: string, ttlMs: number): boolean {
  const scope = tenantKey();
  const mem = bucket().get(endpoint);
  const entry = mem ?? readFromSessionStorage(scope, endpoint);
  if (!entry) return false;
  return Date.now() - entry.updatedAt < ttlMs;
}

export function prefetchEndpoint(endpoint: string, ttlMs = DEFAULT_PREFETCH_TTL_MS): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (isFresh(endpoint, ttlMs)) return Promise.resolve();

  const key = `${tenantKey()}::${endpoint}`;
  const existing = inFlightPrefetches.get(key);
  if (existing) return existing;

  const task = fetchWithTimeout(endpoint, { credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) return;
      const body: unknown = await response.json();
      setCached(endpoint, body);
    })
    .catch(() => {
      // Background prefetch is strictly best-effort
    })
    .finally(() => {
      inFlightPrefetches.delete(key);
    });

  inFlightPrefetches.set(key, task);
  return task;
}

const CORE_PREFETCH_ENDPOINTS = [
  "/api/sekolah/siswa?page=1&limit=10&kelas=semua",
  "/api/sekolah/guru?page=1&limit=10",
  "/api/sekolah/kelas",
  "/api/sekolah/akademik",
  "/api/sekolah/ppdb?page=1&limit=10",
] as const;

export function prefetchCoreSchoolData(): void {
  for (const endpoint of CORE_PREFETCH_ENDPOINTS) {
    void prefetchEndpoint(endpoint, 30_000);
  }
}

export function prefetchForView(view: string): void {
  switch (view) {
    case "dashboard":
      void prefetchEndpoint("/api/sekolah/ringkasan");
      break;
    case "siswa":
      void prefetchEndpoint("/api/sekolah/siswa?page=1&limit=10&kelas=semua");
      void prefetchEndpoint("/api/sekolah/kelas");
      break;
    case "guru":
      void prefetchEndpoint("/api/sekolah/guru?page=1&limit=10");
      break;
    case "kelas":
    case "penempatan-kelas":
      void prefetchEndpoint("/api/sekolah/kelas");
      break;
    case "mapel":
    case "akademik":
      void prefetchEndpoint("/api/sekolah/akademik");
      break;
    case "ppdb":
      void prefetchEndpoint("/api/sekolah/ppdb?page=1&limit=10");
      break;
    case "ruang-kbm":
      void prefetchEndpoint("/api/sekolah/ruang-kbm");
      break;
    case "rekap-akademik":
    case "presensi":
      void prefetchEndpoint("/api/sekolah/rekap-akademik");
      break;
    case "tema-identitas":
      void prefetchEndpoint("/api/sekolah/identitas");
      break;
    case "pengaturan-lanjutan":
      void prefetchEndpoint("/api/sekolah/pengaturan");
      break;
    default:
      break;
  }
}
