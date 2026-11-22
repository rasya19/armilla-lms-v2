export type CbtCategory = "UTS" | "AS" | "UJIAN_AKHIR" | "TUGAS";

export interface CbtCategoryOption {
  id: CbtCategory;
  shortLabel: string;
  label: string;
  prefix: string;
  description: string;
  sampleExamTitle: string;
  sampleTaskTitle: string;
}

export const CBT_CATEGORIES: CbtCategoryOption[] = [
  {
    id: "UTS",
    shortLabel: "UTS",
    label: "UTS (Tengah Semester)",
    prefix: "UTS",
    description: "Ujian / Sumatif Tengah Semester (UTS / STS)",
    sampleExamTitle: "UTS Matematika Semester Ganjil",
    sampleTaskTitle: "Tugas Pengganti UTS Modul 1",
  },
  {
    id: "AS",
    shortLabel: "AS / UAS",
    label: "AS / UAS (Asesmen Sumatif)",
    prefix: "AS",
    description: "Asesmen Sumatif / Penilaian Akhir Semester (PAS / UAS)",
    sampleExamTitle: "Asesmen Sumatif Akhir Semester",
    sampleTaskTitle: "Tugas Proyek Asesmen Sumatif",
  },
  {
    id: "UJIAN_AKHIR",
    shortLabel: "Ujian Akhir",
    label: "Ujian Akhir Kelas Akhir",
    prefix: "UAK",
    description: "Ujian Pendidikan Kesetaraan (UPK) / Kelas 6, 9, dan 12",
    sampleExamTitle: "Ujian Akhir Kelas Akhir (UPK)",
    sampleTaskTitle: "Tugas Portofolio Ujian Akhir Kelas Akhir",
  },
  {
    id: "TUGAS",
    shortLabel: "Tugas CBT",
    label: "Tugas & Latihan CBT",
    prefix: "TGS",
    description: "Penugasan terstruktur, latihan harian, dan remedial",
    sampleExamTitle: "Latihan & Evaluasi Modul",
    sampleTaskTitle: "Tugas Mandiri Modul Belajar",
  },
];

export interface ParsedQuestionDraft {
  row: number;
  tipe: "PG" | "ESAI";
  teks: string;
  bobot: number;
  opsiA: string;
  opsiB: string;
  opsiC: string;
  opsiD: string;
  opsiE: string;
  kunci: string;
  kunciEsai: string;
  pembahasan: string;
}

export interface ParsedTaskDraft {
  row: number;
  judul: string;
  kategori: CbtCategory;
  kelasNama: string;
  mapelNama: string;
  instruksi: string;
  batasWaktu: string;
  tautan: string;
}

export interface SkippedImportRow {
  row: number;
  reason: string;
}

export function detectCbtCategory(kode: string, judul: string): CbtCategory | "UMUM" {
  const codeUpper = (kode || "").trim().toUpperCase();
  if (codeUpper.startsWith("UTS-")) return "UTS";
  if (codeUpper.startsWith("AS-") || codeUpper.startsWith("UAS-") || codeUpper.startsWith("PAS-")) return "AS";
  if (codeUpper.startsWith("UAK-") || codeUpper.startsWith("UPK-")) return "UJIAN_AKHIR";
  if (codeUpper.startsWith("TGS-")) return "TUGAS";

  const titleUpper = (judul || "").trim().toUpperCase();
  if (/\b(UJIAN AKHIR|KELAS AKHIR|UPK|UJIAN SEKOLAH|UJIAN KESETARAAN)\b/.test(titleUpper)) return "UJIAN_AKHIR";
  if (/\b(UTS|STS|TENGAH SEMESTER)\b/.test(titleUpper)) return "UTS";
  if (/\b(AS|UAS|PAS|SAS|ASESMEN SUMATIF|AKHIR SEMESTER)\b/.test(titleUpper)) return "AS";
  if (/\b(TUGAS|LATIHAN|REMEDIAL|KUIS)\b/.test(titleUpper)) return "TUGAS";
  return "UMUM";
}

export function categoryBadgeLabel(category: CbtCategory | "UMUM"): string {
  switch (category) {
    case "UTS":
      return "UTS";
    case "AS":
      return "AS / UAS";
    case "UJIAN_AKHIR":
      return "Ujian Akhir Kelas Akhir";
    case "TUGAS":
      return "Tugas CBT";
    default:
      return "Ujian CBT";
  }
}

export function isFinalGradeClass(kelasNama: string): boolean {
  const normalized = kelasNama.trim().toUpperCase();
  return (
    /\b(6|9|12|VI|IX|XII)\b/.test(normalized) ||
    /KELAS\s*(6|9|12|VI|IX|XII|AKHIR)/.test(normalized) ||
    /TINGKAT\s*(6|9|12|AKHIR)/.test(normalized)
  );
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text || text === "-" || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return "";
  return text;
}

function normalizeKeyLetter(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/^(OPSI|PILIHAN|JAWABAN|KUNCI)\s*[:.-]?\s*/i, "").replace(/[.)\s]+$/g, "");
  if (["A", "B", "C", "D", "E"].includes(cleaned)) return cleaned;
  const first = cleaned.charAt(0);
  if (["A", "B", "C", "D", "E"].includes(first) && (cleaned.length === 1 || /^[\s.):-]/.test(cleaned.slice(1)))) {
    return first;
  }
  return "";
}

function normalizeCategoryString(raw: string, fallback: CbtCategory): CbtCategory {
  const upper = raw.trim().toUpperCase();
  if (!upper) return fallback;
  if (upper.includes("AKHIR KELAS") || upper.includes("UJIAN AKHIR") || upper === "UAK" || upper === "UPK") return "UJIAN_AKHIR";
  if (upper.includes("TENGAH") || upper === "UTS" || upper === "STS") return "UTS";
  if (upper === "AS" || upper === "UAS" || upper === "PAS" || upper.includes("SUMATIF") || upper.includes("AKHIR SEMESTER")) return "AS";
  if (upper.includes("TUGAS") || upper.includes("LATIHAN") || upper === "TGS") return "TUGAS";
  return fallback;
}

function parseFlexibleDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 25000 && value < 80000) {
    // Excel serial date
    const utcMs = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(utcMs);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const text = String(value).trim();
  if (!text) return "";
  // Support DD/MM/YYYY or DD-MM-YYYY (optional HH:mm)
  const idMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (idMatch) {
    const [, dd, mm, yyyy, hh = "23", mi = "59"] = idMatch;
    const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${hh.padStart(2, "0")}:${mi}:00+07:00`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return text;
}

export async function parseQuestionSpreadsheet(file: File): Promise<{
  rows: ParsedQuestionDraft[];
  skipped: SkippedImportRow[];
  sheetName: string;
}> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0] || "Sheet1";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Lembar kerja pada file Excel/CSV tidak ditemukan.");
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (matrix.length === 0) {
    throw new Error("File kosong. Gunakan template Excel soal yang tersedia.");
  }

  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const cells = (matrix[r] ?? []).map(normalizeHeader);
    const hasQuestionCol = cells.some((c) => c === "pertanyaan" || c === "soal" || c === "teks soal" || c === "question");
    if (hasQuestionCol) {
      headerRowIdx = r;
      break;
    }
  }

  const headerCells = (matrix[headerRowIdx] ?? []).map(normalizeHeader);
  const findCol = (aliases: string[]): number => {
    for (const alias of aliases) {
      const idx = headerCells.findIndex((h) => h === alias);
      if (idx !== -1) return idx;
    }
    for (const alias of aliases) {
      const idx = headerCells.findIndex((h) => h.includes(alias));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colTipe = findCol(["tipe", "tipe soal", "jenis", "jenis soal", "type"]);
  const colSoal = findCol(["pertanyaan", "teks soal", "soal", "question"]);
  const colA = findCol(["opsi a", "pilihan a", "jawaban a", "a"]);
  const colB = findCol(["opsi b", "pilihan b", "jawaban b", "b"]);
  const colC = findCol(["opsi c", "pilihan c", "jawaban c", "c"]);
  const colD = findCol(["opsi d", "pilihan d", "jawaban d", "d"]);
  const colE = findCol(["opsi e", "pilihan e", "jawaban e", "e"]);
  const colKunci = findCol(["kunci", "kunci jawaban", "jawaban benar", "jawaban", "answer", "key"]);
  const colBobot = findCol(["bobot", "skor", "poin", "nilai", "score"]);
  const colPembahasan = findCol(["pembahasan", "penjelasan", "keterangan", "explanation"]);

  if (colSoal === -1) {
    throw new Error('Kolom "Pertanyaan" atau "Soal" tidak ditemukan pada baris header. Unduh template Excel untuk format baku.');
  }

  const rows: ParsedQuestionDraft[] = [];
  const skipped: SkippedImportRow[] = [];

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const excelRow = r + 1;
    const teks = cleanCell(line[colSoal]);
    const allEmpty = line.every((cell) => cleanCell(cell) === "");
    if (allEmpty) continue;
    if (!teks) {
      skipped.push({ row: excelRow, reason: "Kolom pertanyaan kosong." });
      continue;
    }

    const opsiA = colA >= 0 ? cleanCell(line[colA]) : "";
    const opsiB = colB >= 0 ? cleanCell(line[colB]) : "";
    const opsiC = colC >= 0 ? cleanCell(line[colC]) : "";
    const opsiD = colD >= 0 ? cleanCell(line[colD]) : "";
    const opsiE = colE >= 0 ? cleanCell(line[colE]) : "";
    const rawTipe = colTipe >= 0 ? cleanCell(line[colTipe]).toUpperCase() : "";
    const rawKunci = colKunci >= 0 ? cleanCell(line[colKunci]) : "";
    const rawBobot = colBobot >= 0 ? Number(line[colBobot]) : 10;
    const bobot = Number.isFinite(rawBobot) && rawBobot >= 1 && rawBobot <= 100 ? Math.round(rawBobot) : 10;
    const pembahasan = colPembahasan >= 0 ? cleanCell(line[colPembahasan]) : "";

    const hasOptions = [opsiA, opsiB, opsiC, opsiD, opsiE].filter(Boolean).length >= 2;
    const isEsai =
      rawTipe.includes("ESAI") ||
      rawTipe.includes("ESSAY") ||
      rawTipe.includes("URAIAN") ||
      rawTipe.includes("ISIAN") ||
      (!rawTipe && !hasOptions);

    if (isEsai) {
      rows.push({
        row: excelRow,
        tipe: "ESAI",
        teks,
        bobot,
        opsiA: "",
        opsiB: "",
        opsiC: "",
        opsiD: "",
        opsiE: "",
        kunci: "",
        kunciEsai: rawKunci,
        pembahasan,
      });
      continue;
    }

    const filledOptions = [
      { code: "A", val: opsiA },
      { code: "B", val: opsiB },
      { code: "C", val: opsiC },
      { code: "D", val: opsiD },
      { code: "E", val: opsiE },
    ].filter((o) => o.val);

    if (filledOptions.length < 2) {
      skipped.push({ row: excelRow, reason: "Soal PG minimal memiliki 2 opsi jawaban (A dan B)." });
      continue;
    }

    const keyLetter = normalizeKeyLetter(rawKunci);
    if (!keyLetter || !filledOptions.some((o) => o.code === keyLetter)) {
      skipped.push({ row: excelRow, reason: "Kunci jawaban PG (A–E) belum diisi atau tidak sesuai opsi yang terisi." });
      continue;
    }

    rows.push({
      row: excelRow,
      tipe: "PG",
      teks,
      bobot,
      opsiA,
      opsiB,
      opsiC,
      opsiD,
      opsiE,
      kunci: keyLetter,
      kunciEsai: "",
      pembahasan,
    });
  }

  return { rows, skipped, sheetName };
}

export function parseQuestionText(rawText: string): {
  rows: ParsedQuestionDraft[];
  skipped: SkippedImportRow[];
} {
  const lines = rawText.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    if (/^\d+\s*[.)]\s+/.test(line) && current.length > 0) {
      blocks.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  const rows: ParsedQuestionDraft[] = [];
  const skipped: SkippedImportRow[] = [];

  blocks.forEach((block, index) => {
    const rowNum = index + 1;
    const questionParts: string[] = [];
    const opsi: Record<string, string> = {};
    let kunciRaw = "";
    let pembahasan = "";
    let bobot = 10;

    for (const line of block) {
      const optMatch = line.match(/^([A-Ea-e])\s*[.):]\s+(.+)$/);
      const keyMatch = line.match(/^(?:KUNCI|JAWABAN|ANSWER)\s*[:=-]\s*(.+)$/i);
      const expMatch = line.match(/^(?:PEMBAHASAN|PENJELASAN)\s*[:=-]\s*(.+)$/i);
      const weightMatch = line.match(/^(?:BOBOT|SKOR)\s*[:=-]\s*(\d+)$/i);

      if (keyMatch) {
        kunciRaw = keyMatch[1].trim();
      } else if (expMatch) {
        pembahasan = expMatch[1].trim();
      } else if (weightMatch) {
        const parsedBobot = Number(weightMatch[1]);
        if (parsedBobot >= 1 && parsedBobot <= 100) bobot = parsedBobot;
      } else if (optMatch) {
        const code = optMatch[1].toUpperCase();
        opsi[code] = optMatch[2].trim();
      } else {
        const stripped = questionParts.length === 0 ? line.replace(/^\d+\s*[.)]\s+/, "") : line;
        questionParts.push(stripped);
      }
    }

    const teks = questionParts.join("\n").trim();
    if (!teks) {
      skipped.push({ row: rowNum, reason: "Pertanyaan tidak terbaca." });
      return;
    }

    const optEntries = ["A", "B", "C", "D", "E"].filter((c) => Boolean(opsi[c]));
    if (optEntries.length === 0) {
      rows.push({
        row: rowNum,
        tipe: "ESAI",
        teks,
        bobot,
        opsiA: "",
        opsiB: "",
        opsiC: "",
        opsiD: "",
        opsiE: "",
        kunci: "",
        kunciEsai: kunciRaw,
        pembahasan,
      });
      return;
    }

    if (optEntries.length < 2) {
      skipped.push({ row: rowNum, reason: "Soal PG minimal memiliki 2 opsi jawaban." });
      return;
    }

    const keyLetter = normalizeKeyLetter(kunciRaw);
    if (!keyLetter || !opsi[keyLetter]) {
      skipped.push({ row: rowNum, reason: 'Tambahkan baris "Kunci: A/B/C/D/E" sesuai opsi jawaban.' });
      return;
    }

    rows.push({
      row: rowNum,
      tipe: "PG",
      teks,
      bobot,
      opsiA: opsi.A || "",
      opsiB: opsi.B || "",
      opsiC: opsi.C || "",
      opsiD: opsi.D || "",
      opsiE: opsi.E || "",
      kunci: keyLetter,
      kunciEsai: "",
      pembahasan,
    });
  });

  return { rows, skipped };
}

export async function parseTaskSpreadsheet(
  file: File,
  defaultCategory: CbtCategory,
): Promise<{
  rows: ParsedTaskDraft[];
  skipped: SkippedImportRow[];
  sheetName: string;
}> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0] || "Sheet1";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Lembar kerja pada file Excel/CSV tidak ditemukan.");
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (matrix.length === 0) {
    throw new Error("File kosong. Unduh template Excel tugas terlebih dahulu.");
  }

  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const cells = (matrix[r] ?? []).map(normalizeHeader);
    if (cells.some((c) => c.includes("judul") || c.includes("nama tugas") || c.includes("instruksi"))) {
      headerRowIdx = r;
      break;
    }
  }

  const headerCells = (matrix[headerRowIdx] ?? []).map(normalizeHeader);
  const findCol = (aliases: string[]): number => {
    for (const alias of aliases) {
      const idx = headerCells.findIndex((h) => h === alias);
      if (idx !== -1) return idx;
    }
    for (const alias of aliases) {
      const idx = headerCells.findIndex((h) => h.includes(alias));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colJudul = findCol(["judul tugas", "judul", "nama tugas", "tugas", "title"]);
  const colKategori = findCol(["kategori", "jenis", "jenis ujian", "ujian"]);
  const colKelas = findCol(["kelas", "rombel", "kelas target"]);
  const colMapel = findCol(["mata pelajaran", "mapel", "pelajaran"]);
  const colInstruksi = findCol(["instruksi", "soal tugas", "deskripsi", "isi", "uraian"]);
  const colBatas = findCol(["batas waktu", "tenggat", "deadline", "tanggal selesai"]);
  const colTautan = findCol(["tautan", "tautan https", "link", "url"]);

  if (colJudul === -1 || colInstruksi === -1) {
    throw new Error('Kolom "Judul Tugas" dan "Instruksi" wajib ada pada header file Excel/CSV.');
  }

  const rows: ParsedTaskDraft[] = [];
  const skipped: SkippedImportRow[] = [];

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const excelRow = r + 1;
    if (line.every((cell) => cleanCell(cell) === "")) continue;

    const judul = cleanCell(line[colJudul]);
    const instruksi = cleanCell(line[colInstruksi]);
    if (!judul) {
      skipped.push({ row: excelRow, reason: "Judul tugas kosong." });
      continue;
    }
    if (!instruksi) {
      skipped.push({ row: excelRow, reason: "Instruksi atau soal tugas kosong." });
      continue;
    }

    const kategori = colKategori >= 0 ? normalizeCategoryString(cleanCell(line[colKategori]), defaultCategory) : defaultCategory;
    const kelasNama = colKelas >= 0 ? cleanCell(line[colKelas]) : "";
    const mapelNama = colMapel >= 0 ? cleanCell(line[colMapel]) : "";
    const batasWaktu = colBatas >= 0 ? parseFlexibleDate(line[colBatas]) : "";
    const tautan = colTautan >= 0 ? cleanCell(line[colTautan]) : "";

    rows.push({
      row: excelRow,
      judul,
      kategori,
      kelasNama,
      mapelNama,
      instruksi,
      batasWaktu,
      tautan,
    });
  }

  return { rows, skipped, sheetName };
}

export async function downloadQuestionTemplate(category: CbtCategory) {
  const XLSX = await import("xlsx");
  const catMeta = CBT_CATEGORIES.find((c) => c.id === category) ?? CBT_CATEGORIES[0];
  const rows = [
    ["No", "Tipe", "Pertanyaan", "Opsi A", "Opsi B", "Opsi C", "Opsi D", "Opsi E", "Kunci", "Bobot", "Pembahasan"],
    [
      1,
      "PG",
      `[${catMeta.shortLabel}] Hasil dari 15 x 4 + 20 adalah ...`,
      "60",
      "70",
      "80",
      "90",
      "100",
      "C",
      10,
      "Perkalian dikerjakan lebih dahulu: 15 x 4 = 60, lalu ditambah 20 menjadi 80.",
    ],
    [
      2,
      "PG",
      `[${catMeta.shortLabel}] Salah satu tujuan utama pendidikan kesetaraan di PKBM adalah ...`,
      "Membatasi akses belajar masyarakat",
      "Memberikan layanan pendidikan bermutu bagi masyarakat yang tidak dapat mengikuti pendidikan formal",
      "Mengganti seluruh kurikulum nasional",
      "Menghapus ujian akhir kesetaraan",
      "",
      "B",
      10,
      "PKBM menyediakan akses pendidikan nonformal Paket A, B, dan C yang setara dengan pendidikan formal.",
    ],
    [
      3,
      "ESAI",
      `[${catMeta.shortLabel}] Jelaskan secara singkat manfaat pengelolaan keuangan keluarga yang terencana!`,
      "",
      "",
      "",
      "",
      "",
      "Membantu mengatur prioritas kebutuhan pokok, menghindari utang konsumtif, dan menyiapkan dana darurat.",
      20,
      "Penilaian berdasarkan ketepatan konsep dan kelengkapan alasan warga belajar.",
    ],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 5 },
    { wch: 8 },
    { wch: 52 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 18 },
    { wch: 14 },
    { wch: 8 },
    { wch: 40 },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, `Template_Soal_${catMeta.prefix}`);
  XLSX.writeFile(book, `Template_Impor_Soal_${catMeta.prefix}_SIPUT_PKBM.xlsx`);
}

export async function downloadTaskTemplate(category: CbtCategory) {
  const XLSX = await import("xlsx");
  const catMeta = CBT_CATEGORIES.find((c) => c.id === category) ?? CBT_CATEGORIES[0];
  const sampleClass = category === "UJIAN_AKHIR" ? "Paket C Kelas 12" : "";
  const rows = [
    ["Judul Tugas", "Kategori", "Kelas", "Mata Pelajaran", "Instruksi", "Batas Waktu", "Tautan HTTPS"],
    [
      catMeta.sampleTaskTitle,
      catMeta.id,
      sampleClass,
      "",
      "Kerjakan rangkuman modul dan unggah hasil analisis proyek sesuai rubrik penilaian. Minimal 300 kata.",
      "2026-12-15 23:59",
      "",
    ],
    [
      `Tugas Praktik ${catMeta.shortLabel} - Studi Kasus`,
      catMeta.id,
      sampleClass,
      "",
      "Buat laporan praktik mandiri berdasarkan lembar kerja yang telah dibagikan oleh tutor mata pelajaran.",
      "2026-12-20 23:59",
      "",
    ],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 36 },
    { wch: 16 },
    { wch: 22 },
    { wch: 22 },
    { wch: 58 },
    { wch: 18 },
    { wch: 28 },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, `Template_Tugas_${catMeta.prefix}`);
  XLSX.writeFile(book, `Template_Impor_Tugas_${catMeta.prefix}_SIPUT_PKBM.xlsx`);
}
