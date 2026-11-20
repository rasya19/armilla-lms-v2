import type { WorkSheet } from "xlsx";

type Named = { id: string; nama: string };
export type References = { tahun: (Named & { semester: string })[]; kelas: Named[]; mapel: Named[]; guru: Named[] };
type Schedule = { tahunAjaranId: string; kelasId: string; mapelId: string; guruId: string; hari: number; jamMulai: string; jamSelesai: string };
export type Preview = { number: number; values: string[]; schedule: Schedule | null; error: string };
export const headers = ["Tahun Ajaran", "Semester", "Kelas", "Mata Pelajaran", "Guru", "Hari", "Jam Mulai", "Jam Selesai"];
const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const normalized = (value: string) => value.trim().toLocaleLowerCase("id-ID");

function findReference(items: Named[], value: string): string | null {
  const byId = items.find((item) => item.id === value);
  if (byId) return byId.id;
  const matches = items.filter((item) => normalized(item.nama) === normalized(value));
  return matches.length === 1 ? matches[0].id : null;
}

function time(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function readScheduleSheet(sheet: WorkSheet, XLSX: typeof import("xlsx"), references: References): Preview[] {
  if (!sheet["!ref"]) throw new Error('Sheet "Jadwal" kosong.');
  const full = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]);
  if (full.e.r > 500 || full.e.c > 30) throw new Error("Maksimal 500 baris jadwal dan 31 kolom.");
  const cell = (r: number, c: number, isTime = false) => {
    const item = sheet[XLSX.utils.encode_cell({ r, c })];
    if (!item) return "";
    if (isTime && typeof item.v === "number") {
      if (item.v < 0 || item.v >= 1) return "";
      const minutes = Math.round(item.v * 1440);
      return minutes < 1440 ? `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}` : "";
    }
    return XLSX.utils.format_cell(item).trim();
  };
  const columns = headers.map((header) => {
    const matches = Array.from({ length: full.e.c + 1 }, (_, index) => index).filter((index) => normalized(cell(0, index)) === normalized(header));
    if (matches.length !== 1) throw new Error(`Kolom "${header}" harus ada satu kali pada baris pertama.`);
    return matches[0];
  });
  const result: Preview[] = [];
  for (let r = 1; r <= full.e.r; r++) {
    const values = columns.map((column, index) => cell(r, column, index >= 6));
    if (!values.some(Boolean)) continue;
    const [year, semester, kelas, mapel, guru, day, start, end] = values;
    const yearId = findReference(references.tahun.filter((item) => normalized(item.semester) === normalized(semester)), year);
    const kelasId = findReference(references.kelas, kelas), mapelId = findReference(references.mapel, mapel), guruId = findReference(references.guru, guru);
    const hari = days.findIndex((item) => normalized(item) === normalized(day)) + 1;
    const jamMulai = time(start), jamSelesai = time(end);
    const invalid = !yearId ? "Tahun ajaran / semester tidak ditemukan atau ambigu" : !kelasId ? "Kelas tidak ditemukan atau ambigu" : !mapelId ? "Mata pelajaran tidak ditemukan atau ambigu" : !guruId ? "Guru aktif tidak ditemukan atau ambigu" : !hari ? "Hari tidak valid" : !jamMulai || !jamSelesai || jamMulai >= jamSelesai ? "Jam tidak valid" : "";
    result.push({ number: r + 1, values, schedule: invalid || !yearId || !kelasId || !mapelId || !guruId ? null : { tahunAjaranId: yearId, kelasId, mapelId, guruId, hari, jamMulai, jamSelesai }, error: invalid });
  }
  if (!result.length) throw new Error("Isi sedikitnya satu baris jadwal.");
  return result;
}
