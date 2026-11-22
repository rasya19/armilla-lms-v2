import type { WorkSheet } from "xlsx";

export const studentFields = [
  { key: "nama", label: "Nama siswa", aliases: ["nama", "nama siswa", "nama peserta didik", "nama lengkap", "peserta didik"], required: true },
  { key: "nisn", label: "NISN", aliases: ["nisn"], required: false },
  { key: "nipd", label: "NIPD / NIS", aliases: ["nipd", "nis", "no induk", "nomor induk", "no induk siswa"], required: false },
  { key: "rombel", label: "Rombel / Kelas", aliases: ["rombel saat ini", "rombel", "kelas saat ini", "kelas", "nama kelas"], required: false },
  { key: "nik", label: "NIK", aliases: ["nik", "no nik", "nomor nik"], required: false },
  { key: "jenisKelamin", label: "Jenis kelamin", aliases: ["jk", "jenis kelamin", "l p", "kelamin"], required: false },
  { key: "tempatLahir", label: "Tempat lahir", aliases: ["tempat lahir", "tmp lahir"], required: false },
  { key: "tanggalLahir", label: "Tanggal lahir", aliases: ["tanggal lahir", "tgl lahir"], required: false },
  { key: "alamatLengkap", label: "Alamat", aliases: ["alamat", "alamat lengkap", "alamat jalan"], required: false },
  { key: "namaAyah", label: "Nama ayah", aliases: ["data ayah nama", "nama ayah", "ayah"], required: false },
  { key: "namaIbu", label: "Nama ibu", aliases: ["data ibu nama", "nama ibu", "nama ibu kandung", "ibu"], required: false },
  { key: "telepon", label: "No. HP / Telepon", aliases: ["hp", "no hp", "nomor hp", "telepon", "no telepon", "nomor telepon", "telp", "no telp"], required: false },
  { key: "email", label: "Email", aliases: ["email", "e mail", "surel"], required: false },
  { key: "username", label: "Username (opsional)", aliases: ["username", "nama pengguna", "akun"], required: false },
  { key: "jenjang", label: "Jenjang", aliases: ["jenjang", "program", "paket"], required: false },
  { key: "tanggalMasuk", label: "Tanggal masuk", aliases: ["tanggal masuk", "tgl masuk", "tanggal registrasi"], required: false },
  { key: "jalurPendaftaran", label: "Jalur pendaftaran", aliases: ["jalur pendaftaran", "jenis pendaftaran"], required: false },
] as const;

export type StudentField = typeof studentFields[number]["key"];
export type StudentMapping = Record<StudentField, string>;
export type SheetRow = { number: number; cells: string[] };
export type SkippedRow = { number: number; nama: string; reason: string };
export const emptyStudentMapping = Object.fromEntries(studentFields.map(({ key }) => [key, ""])) as StudentMapping;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const PLACEHOLDER_REGEX = /^(?:-|–|—|--+|0|null|undefined|n\/a|na)$/i;
const FOOTER_OR_NOTE_REGEX =
  /^(?:catatan|keterangan|ket\.?|nb\s*:|dicetak|diunduh|tanggal\s+(?:unduh|cetak)|sumber\s*(?:data)?|total\b|jumlah\s+(?:siswa|peserta|keseluruhan|rombel)|mengetahui|kepala\s+sekolah|operator\s+dapodik|\*+)/i;

const NAMA_ALIASES = new Set(["nama", "nama siswa", "nama peserta didik", "nama lengkap", "peserta didik"]);
const ANCHOR_ALIASES = new Set(["nisn", "nipd", "nis", "nik", "rombel saat ini", "rombel", "kelas", "kelas saat ini"]);
const SECONDARY_ALIASES = new Set(["jk", "jenis kelamin", "tempat lahir", "tanggal lahir", "alamat", "hp", "telepon", "email"]);
const GROUP_HEADER_LABELS = new Set(["data ayah", "data ibu", "data wali"]);
const SUB_HEADER_LABELS = new Set(["nama", "tahun lahir", "jenjang pendidikan", "pekerjaan", "penghasilan", "nik"]);

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

export function cleanCellValue(raw: string): string {
  const trimmed = raw.replace(/^'+/, "").replace(/\s+/g, " ").trim();
  if (!trimmed || PLACEHOLDER_REGEX.test(trimmed)) return "";
  return trimmed;
}

function isFooterOrEmptyName(nama: string): { skip: boolean; reason: string } {
  if (!nama) return { skip: true, reason: "Nama kosong" };
  const norm = normalize(nama);
  if (!norm || NAMA_ALIASES.has(norm)) return { skip: true, reason: "Header berulang" };
  if (FOOTER_OR_NOTE_REGEX.test(nama)) return { skip: true, reason: "Baris catatan/footer" };
  if (!/\p{L}/u.test(nama)) return { skip: true, reason: "Bukan nama siswa" };
  return { skip: false, reason: "" };
}

function formatValidIsoDate(year: number, month: number, day: number): string {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return "";
  return iso;
}

export function normalizeDateCell(raw: string): string {
  const cleaned = cleanCellValue(raw);
  if (!cleaned) return "";

  const isoMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) return formatValidIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

  const dmyMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const a = Number(dmyMatch[1]);
    const b = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    if (b <= 12) return formatValidIsoDate(y, b, a);
    if (a <= 12) return formatValidIsoDate(y, a, b);
    return "";
  }

  const dmyShort = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (dmyShort) {
    const a = Number(dmyShort[1]);
    const b = Number(dmyShort[2]);
    const yy = Number(dmyShort[3]);
    const y = yy >= 40 ? 1900 + yy : 2000 + yy;
    if (b <= 12) return formatValidIsoDate(y, b, a);
    if (a <= 12) return formatValidIsoDate(y, a, b);
    return "";
  }

  const textMatch = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
  if (textMatch) {
    const month = MONTHS[textMatch[2].toLowerCase()];
    if (month) return formatValidIsoDate(Number(textMatch[3]), month, Number(textMatch[1]));
  }

  if (/^\d{4,5}(?:\.\d+)?$/.test(cleaned)) {
    const serial = Math.floor(Number(cleaned));
    if (serial >= 1000 && serial <= 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (!Number.isNaN(date.getTime())) {
        return formatValidIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      }
    }
  }

  return "";
}

function normalizeGenderCell(raw: string): string {
  const cleaned = cleanCellValue(raw).toLowerCase();
  if (!cleaned) return "";
  if (cleaned === "l" || cleaned === "lk" || cleaned === "m" || cleaned.startsWith("laki") || cleaned === "pria") return "L";
  if (cleaned === "p" || cleaned === "pr" || cleaned === "f" || cleaned.startsWith("perempuan") || cleaned === "wanita") return "P";
  return "";
}

function isDateFormatString(fmt: unknown): boolean {
  if (typeof fmt !== "string") return false;
  const cleaned = fmt.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
  return /[ymd]/i.test(cleaned) && !/[#0?].*0/.test(cleaned);
}

export function readStudentSheet(
  sheet: WorkSheet,
  XLSX: typeof import("xlsx"),
): {
  headers: string[];
  rows: SheetRow[];
  mapping: StudentMapping;
  headerRowNumber: number;
  blankRows: SkippedRow[];
} {
  if (!sheet["!ref"]) throw new Error("Sheet tidak berisi data.");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const fullRange = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]);
  const maxCol = Math.min(range.e.c, 99);
  if (fullRange.e.c - fullRange.s.c + 1 > 120) throw new Error("Maksimal 120 kolom per sheet.");

  const getCell = (r: number, c: number): string => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (!cell) return "";
    if (cell.t === "d" && cell.v instanceof Date && !Number.isNaN(cell.v.getTime())) {
      return formatValidIsoDate(cell.v.getUTCFullYear(), cell.v.getUTCMonth() + 1, cell.v.getUTCDate());
    }
    if (cell.t === "n" && typeof cell.v === "number" && isDateFormatString(cell.z)) {
      const parsed = XLSX.SSF?.parse_date_code?.(cell.v);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        return formatValidIsoDate(parsed.y, parsed.m, parsed.d);
      }
    }
    return XLSX.utils.format_cell(cell).trim();
  };

  // Scan first 15 rows for Dapodik header row
  const scanLimit = Math.min(range.e.r + 1, 15);
  const candidateRows = Array.from({ length: scanLimit }, (_, r) => r);

  const rowLabels = (r: number) =>
    Array.from({ length: maxCol + 1 }, (_, c) => normalize(getCell(r, c)));

  const headerRow =
    candidateRows.find((r) => {
      const labels = rowLabels(r);
      return labels.some((l) => NAMA_ALIASES.has(l)) && labels.some((l) => ANCHOR_ALIASES.has(l));
    }) ??
    candidateRows.find((r) => {
      const labels = rowLabels(r);
      return labels.some((l) => NAMA_ALIASES.has(l)) && labels.some((l) => SECONDARY_ALIASES.has(l));
    }) ??
    candidateRows.find((r) => rowLabels(r).some((l) => NAMA_ALIASES.has(l))) ??
    range.s.r;

  const merges = sheet["!merges"] ?? [];
  const mergedTwoRows = merges.some((merge) => merge.s.r === headerRow && merge.e.r === headerRow + 1);
  const nextRowLabels = headerRow + 1 <= range.e.r ? rowLabels(headerRow + 1) : [];
  const currentRowLabels = rowLabels(headerRow);
  const unmergedTwoRows =
    !mergedTwoRows &&
    currentRowLabels.some((l) => GROUP_HEADER_LABELS.has(l)) &&
    nextRowLabels.some((l) => SUB_HEADER_LABELS.has(l));
  const twoRows = mergedTwoRows || unmergedTwoRows;

  let activeGroupHeader = "";
  const headers = Array.from({ length: maxCol + 1 }, (_, c) => {
    const parent = merges.find((merge) => merge.s.r === headerRow && merge.e.r === headerRow && merge.s.c <= c && merge.e.c >= c);
    let upper = parent ? getCell(headerRow, parent.s.c) : getCell(headerRow, c);
    const lower = twoRows ? getCell(headerRow + 1, c) : "";
    if (unmergedTwoRows) {
      const normUpper = normalize(upper);
      if (GROUP_HEADER_LABELS.has(normUpper)) {
        activeGroupHeader = upper;
      } else if (upper) {
        activeGroupHeader = "";
      } else if (lower && activeGroupHeader) {
        upper = activeGroupHeader;
      }
    }
    return [upper, lower].filter(Boolean).join(" ").trim();
  });

  const firstDataRow = headerRow + (twoRows ? 2 : 1);

  // Find last row with any non-empty cell so trailing empty Excel grid rows aren't counted
  let lastContentRow = firstDataRow - 1;
  for (let r = range.e.r; r >= firstDataRow; r--) {
    const hasContent = headers.some((_, c) => getCell(r, c) !== "");
    if (hasContent) {
      lastContentRow = r;
      break;
    }
  }

  const rows: SheetRow[] = [];
  const blankRows: SkippedRow[] = [];
  for (let r = firstDataRow; r <= lastContentRow; r++) {
    const cells = headers.map((_, c) => getCell(r, c));
    if (cells.some(Boolean)) {
      rows.push({ number: r + 1, cells });
    } else {
      blankRows.push({ number: r + 1, nama: "", reason: "Baris kosong" });
    }
  }

  if (!rows.length) throw new Error("Tidak ditemukan baris data siswa setelah baris header.");

  // Auto-map columns cleanly without assigning the same column twice
  const mapping = { ...emptyStudentMapping };
  const usedCols = new Set<number>();
  const normalizedHeaders = headers.map((header) => normalize(header));

  for (const field of studentFields) {
    for (const alias of field.aliases) {
      const matches = normalizedHeaders
        .map((header, index) => ({ header, index }))
        .filter(({ header, index }) => header === alias && !usedCols.has(index));
      if (matches.length === 1) {
        mapping[field.key] = String(matches[0].index);
        usedCols.add(matches[0].index);
        break;
      }
      if (matches.length > 1 && field.key === "nama") {
        // If multiple columns say "nama" (rare unmerged case), prefer the leftmost one
        mapping[field.key] = String(matches[0].index);
        usedCols.add(matches[0].index);
        break;
      }
    }
  }

  return { headers, rows, mapping, headerRowNumber: headerRow + 1, blankRows };
}

export function mappedStudentRows(
  rows: SheetRow[],
  mapping: StudentMapping,
  blankRows: SkippedRow[] = [],
) {
  const ready: Record<StudentField, string>[] = [];
  const readyNumbers: number[] = [];
  const skipped: SkippedRow[] = [...blankRows];

  for (const row of rows) {
    const student = Object.fromEntries(
      studentFields.map(({ key }) => {
        const raw = mapping[key] === "" ? "" : row.cells[Number(mapping[key])] ?? "";
        if (key === "tanggalLahir" || key === "tanggalMasuk") return [key, normalizeDateCell(raw)];
        if (key === "jenisKelamin") return [key, normalizeGenderCell(raw)];
        return [key, cleanCellValue(raw)];
      }),
    ) as Record<StudentField, string>;

    const check = isFooterOrEmptyName(student.nama);
    if (check.skip) {
      skipped.push({ number: row.number, nama: student.nama, reason: check.reason });
    } else {
      ready.push(student);
      readyNumbers.push(row.number);
    }
  }

  skipped.sort((a, b) => a.number - b.number);
  return { ready, readyNumbers, skipped };
}
