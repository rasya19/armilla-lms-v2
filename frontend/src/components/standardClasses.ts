const ensuredHosts = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

function hostKey(): string {
  return typeof window !== "undefined" ? window.location.host || "default" : "default";
}

export function resetStandardClassesCache(): void {
  const key = hostKey();
  ensuredHosts.delete(key);
  inFlight.delete(key);
}

export async function ensureStandardClasses(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const key = hostKey();
  if (ensuredHosts.has(key)) return;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const task = fetch("/api/sekolah/kelas-standar", { method: "POST" })
    .then(async (response) => {
      if (!response.ok) {
        let message = `Kelas standar belum dapat disiapkan (status ${response.status}).`;
        if (response.headers.get("content-type")?.includes("application/json")) {
          const body: unknown = await response.json();
          if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error;
        }
        throw new Error(message);
      }
      ensuredHosts.add(key);
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, task);
  return task;
}

export function classMatchesPackage(name: string, paket: string): boolean {
  const selected = /^paket\s+([abc])$/i.exec(paket.trim());
  if (!selected) return false;
  const explicit = /\bpaket\s+([abc])\b/i.exec(name);
  if (explicit && explicit[1].toUpperCase() !== selected[1].toUpperCase()) return false;
  const grade = /\b(?:kelas\s+)?(1[0-2]|[1-9])\b/i.exec(name);
  if (!grade) return false;
  const number = Number(grade[1]);
  return selected[1].toUpperCase() === (number <= 6 ? "A" : number <= 9 ? "B" : "C");
}
