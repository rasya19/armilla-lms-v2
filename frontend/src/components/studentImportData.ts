import type { WorkSheet } from "xlsx";

export const studentFields = [
  { key: "nisn", label: "NISN", aliases: ["nisn"], required: true },
  { key: "nama", label: "Nama siswa", aliases: ["nama", "nama siswa", "nama peserta didik"], required: true },
  { key: "nik", label: "NIK", aliases: ["nik"], required: false },
  { key: "jenisKelamin", label: "Jenis kelamin", aliases: ["jk", "jenis kelamin"], required: false },
  { key: "tempatLahir", label: "Tempat lahir", aliases: ["tempat lahir"], required: false },
  { key: "tanggalLahir", label: "Tanggal lahir", aliases: ["tanggal lahir"], required: false },
  { key: "alamatLengkap", label: "Alamat", aliases: ["alamat", "alamat lengkap"], required: false },
  { key: "namaAyah", label: "Nama ayah", aliases: ["data ayah nama", "nama ayah"], required: false },
  { key: "namaIbu", label: "Nama ibu", aliases: ["data ibu nama", "nama ibu"], required: false },
  { key: "telepon", label: "Telepon", aliases: ["hp", "telepon", "no telepon", "nomor telepon", "no hp", "nomor hp"], required: false },
  { key: "email", label: "Email", aliases: ["email", "e mail"], required: false },
  { key: "jenjang", label: "Jenjang", aliases: ["jenjang"], required: false },
  { key: "tanggalMasuk", label: "Tanggal masuk", aliases: ["tanggal masuk"], required: false },
  { key: "jalurPendaftaran", label: "Jalur pendaftaran", aliases: ["jalur pendaftaran"], required: false },
] as const;
export type StudentField = typeof studentFields[number]["key"];
export type StudentMapping = Record<StudentField, string>;
export type SheetRow = { number: number; cells: string[] };
export const emptyStudentMapping = Object.fromEntries(studentFields.map(({ key }) => [key, ""])) as StudentMapping;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function readStudentSheet(sheet: WorkSheet, XLSX: typeof import("xlsx")): { headers: string[]; rows: SheetRow[]; mapping: StudentMapping } {
  if (!sheet["!ref"]) throw new Error("Sheet tidak berisi data.");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const fullRange = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]);
  if (fullRange.e.c - fullRange.s.c + 1 > 100) throw new Error("Maksimal 100 kolom.");
  const getCell = (r: number, c: number) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    return cell ? XLSX.utils.format_cell(cell).trim() : "";
  };
  const headerRow = Array.from({ length: Math.min(range.e.r + 1, 15) }, (_, r) => r).find((r) => {
    const labels = Array.from({ length: range.e.c + 1 }, (_, c) => normalize(getCell(r, c)));
    return labels.includes("nisn") && labels.some((label) => ["nama", "nama siswa", "nama peserta didik"].includes(label));
  }) ?? range.s.r;
  const merges = sheet["!merges"] ?? [];
  const twoRows = merges.some((merge) => merge.s.r === headerRow && merge.e.r === headerRow + 1);
  const headers = Array.from({ length: range.e.c + 1 }, (_, c) => {
    const parent = merges.find((merge) => merge.s.r === headerRow && merge.e.r === headerRow && merge.s.c <= c && merge.e.c >= c);
    const upper = parent ? getCell(headerRow, parent.s.c) : getCell(headerRow, c);
    const lower = twoRows ? getCell(headerRow + 1, c) : "";
    return [upper, lower].filter(Boolean).join(" ");
  });
  const firstDataRow = headerRow + (twoRows ? 2 : 1);
  if (fullRange.e.r - firstDataRow + 1 > 500) throw new Error("Maksimal 500 baris data siswa.");
  const rows: SheetRow[] = [];
  for (let r = firstDataRow; r <= range.e.r; r++) {
    const cells = headers.map((_, c) => getCell(r, c));
    if (cells.some(Boolean)) rows.push({ number: r + 1, cells });
  }
  if (!rows.length) throw new Error("File harus berisi 1 sampai 500 baris siswa.");
  const mapping = { ...emptyStudentMapping };
  for (const field of studentFields) {
    for (const alias of field.aliases) {
      const matches = headers.map((header, index) => ({ header: normalize(header), index })).filter(({ header }) => header === alias);
      if (matches.length === 1) { mapping[field.key] = String(matches[0].index); break; }
    }
  }
  return { headers, rows, mapping };
}

export function mappedStudentRows(rows: SheetRow[], mapping: StudentMapping) {
  const ready: Record<StudentField, string>[] = [];
  const readyNumbers: number[] = [];
  const skipped: { number: number; nama: string }[] = [];
  for (const row of rows) {
    const student = Object.fromEntries(studentFields.map(({ key }) => [key, mapping[key] === "" ? "" : row.cells[Number(mapping[key])] ?? ""])) as Record<StudentField, string>;
    if (!student.nisn.trim()) skipped.push({ number: row.number, nama: student.nama });
    else { ready.push(student); readyNumbers.push(row.number); }
  }
  return { ready, readyNumbers, skipped };
}
