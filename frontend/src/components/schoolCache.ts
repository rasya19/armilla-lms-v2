const store = new Map<string, Map<string, unknown>>();

function tenantKey(): string {
  return typeof window !== "undefined" ? window.location.host || "default" : "default";
}

function bucket(): Map<string, unknown> {
  const key = tenantKey();
  let map = store.get(key);
  if (!map) {
    map = new Map<string, unknown>();
    store.set(key, map);
  }
  return map;
}

export function getCached<T>(endpoint: string): T | null {
  const value = bucket().get(endpoint);
  return value === undefined ? null : (value as T);
}

export function setCached<T>(endpoint: string, value: T): void {
  bucket().set(endpoint, value);
}

export function invalidateCache(prefixes?: string | string[]): void {
  const map = bucket();
  if (!prefixes) {
    map.clear();
    return;
  }
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  for (const key of map.keys()) {
    if (list.some((prefix) => key.startsWith(prefix))) {
      map.delete(key);
    }
  }
}
