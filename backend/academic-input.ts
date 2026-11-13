function object(input: unknown): Record<string, unknown> | null {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length && result.length <= max ? result : null;
}

function date(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return null;
  const result = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value ? null : result;
}

export function parseAcademicYear(input: unknown) {
  const data = object(input);
  if (!data) return null;
  const nama = text(data.nama, 100);
  const semester = data.semester;
  const mulai = date(data.mulai);
  const selesai = date(data.selesai);
  if (!nama || (semester !== "Ganjil" && semester !== "Genap") || !mulai || !selesai || mulai > selesai) return null;
  return { nama, semester, mulai, selesai };
}

export function parseSubject(input: unknown) {
  const data = object(input);
  const nama = data && text(data.nama, 100);
  if (!nama || !data || !Number.isInteger(data.kkm) || typeof data.kkm !== "number" || data.kkm < 0 || data.kkm > 100) return null;
  return { nama, kkm: data.kkm };
}

export function parseSchedule(input: unknown) {
  const data = object(input);
  if (!data) return null;
  const tahunAjaranId = text(data.tahunAjaranId, 100);
  const kelasId = text(data.kelasId, 100);
  const mapelId = text(data.mapelId, 100);
  const guruId = text(data.guruId, 100);
  const hari = data.hari;
  const jamMulai = data.jamMulai;
  const jamSelesai = data.jamSelesai;
  if (!tahunAjaranId || !kelasId || !mapelId || !guruId || typeof hari !== "number" || !Number.isInteger(hari) || hari < 1 || hari > 7 || typeof jamMulai !== "string" || typeof jamSelesai !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(jamMulai) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(jamSelesai) || jamMulai >= jamSelesai) return null;
  return { tahunAjaranId, kelasId, mapelId, guruId, hari, jamMulai, jamSelesai };
}
