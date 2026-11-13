function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length >= min && result.length <= max ? result : null;
}

function email(value: unknown): string | null {
  const result = text(value, 3, 254);
  return result && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result.toLowerCase() : null;
}

function phone(value: unknown): string | null {
  const result = text(value, 6, 30);
  return result && /^[+0-9 ()-]+$/.test(result) ? result : null;
}

export function parseTeacher(input: unknown) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  const nama = text(data.nama, 2, 200);
  const emailValue = email(data.email);
  const telepon = phone(data.telepon);
  const mapelUtama = text(data.mapelUtama, 2, 100);
  const nuptk = typeof data.nuptk === "string" ? data.nuptk.trim() : null;
  if (!nama || !emailValue || !telepon || !mapelUtama || nuptk === null || (nuptk && !/^\d{16}$/.test(nuptk))) return null;
  return { nama, email: emailValue, telepon, mapelUtama, nuptk: nuptk || null };
}

export function parseApplicant(input: unknown) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  const nama = text(data.nama, 2, 200);
  const emailValue = email(data.email);
  const telepon = phone(data.telepon);
  const alamat = text(data.alamat, 3, 500);
  const jenjang = text(data.jenjang, 2, 100);
  if (!nama || !emailValue || !telepon || !alamat || !jenjang) return null;
  return { nama, email: emailValue, telepon, alamat, jenjang };
}
