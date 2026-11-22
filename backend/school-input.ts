const DISALLOWED_PROTOCOL_RE = /\b(?:javascript|vbscript|data:text\/html)\s*:/i;

export function sanitizePlainText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  if (DISALLOWED_PROTOCOL_RE.test(value)) return null;
  const cleaned = value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= min && cleaned.length <= max ? cleaned : null;
}

function text(value: unknown, min: number, max: number): string | null {
  return sanitizePlainText(value, min, max);
}

function email(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/[<>]/.test(trimmed) || trimmed.length < 3 || trimmed.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

function phone(value: unknown): string | null {
  const result = sanitizePlainText(value, 6, 30);
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
