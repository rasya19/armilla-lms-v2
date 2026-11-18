export async function ensureStandardClasses(signal?: AbortSignal): Promise<void> {
  const response = await fetch("/api/sekolah/kelas-standar", { method: "POST", signal });
  if (!response.ok) {
    let message = `Kelas standar belum dapat disiapkan (status ${response.status}).`;
    if (response.headers.get("content-type")?.includes("application/json")) {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error;
    }
    throw new Error(message);
  }
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
