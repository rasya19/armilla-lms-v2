import { cleanInt, cleanText } from "./school-modules-shared.js";

export type CbtCategory = "UTS" | "AS" | "UJIAN_AKHIR" | "TUGAS";

export interface ParsedCbtQuestion {
  tipe: "PG" | "ESAI";
  teks: string;
  bobot: number;
  kunciEsai: string | null;
  pembahasan: string | null;
  opsi: Array<{ kode: string; teks: string; benar: boolean }>;
}

export interface ParsedCbtTask {
  judul: string;
  instruksi: string;
  kategori: CbtCategory;
  kelasNama: string;
  mapelNama: string;
  batasWaktu: Date | null;
  tautan: string | null;
}

export interface ImportSkippedRow {
  row: number;
  reason: string;
}

const VALID_OPTION_CODES = ["A", "B", "C", "D", "E"] as const;

export function normalizeCbtCategory(raw: unknown, fallback: CbtCategory = "UTS"): CbtCategory {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw.trim().toUpperCase().replace(/[\s/-]+/g, "_");
  if (!cleaned) return fallback;
  if (cleaned === "UTS" || cleaned === "STS" || cleaned.includes("TENGAH")) return "UTS";
  if (
    cleaned === "AS" ||
    cleaned === "UAS" ||
    cleaned === "PAS" ||
    cleaned === "SAS" ||
    cleaned.includes("SUMATIF") ||
    cleaned.includes("AKHIR_SEMESTER")
  ) {
    return "AS";
  }
  if (
    cleaned === "UJIAN_AKHIR" ||
    cleaned === "UAK" ||
    cleaned === "UPK" ||
    cleaned === "US" ||
    cleaned === "KELAS_AKHIR" ||
    cleaned.includes("UJIAN_AKHIR") ||
    cleaned.includes("KELAS_AKHIR") ||
    cleaned.includes("KESETARAAN")
  ) {
    return "UJIAN_AKHIR";
  }
  if (cleaned === "TUGAS" || cleaned === "TGS" || cleaned.includes("TUGAS") || cleaned.includes("LATIHAN")) {
    return "TUGAS";
  }
  return fallback;
}

export function cbtCategoryPrefix(category: CbtCategory): string {
  switch (category) {
    case "UTS":
      return "UTS";
    case "AS":
      return "AS";
    case "UJIAN_AKHIR":
      return "UAK";
    case "TUGAS":
      return "TGS";
  }
}

export function cbtCategoryTag(category: CbtCategory): string {
  switch (category) {
    case "UTS":
      return "[UTS]";
    case "AS":
      return "[AS]";
    case "UJIAN_AKHIR":
      return "[Ujian Akhir]";
    case "TUGAS":
      return "[Tugas CBT]";
  }
}

export function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractOptionKey(raw: unknown): string {
  if (typeof raw !== "string" && typeof raw !== "number") return "";
  const cleaned = String(raw).trim().toUpperCase();
  if (!cleaned) return "";
  const direct = cleaned.replace(/^(OPSI|PILIHAN|JAWABAN|KUNCI)\s*[:.-]?\s*/i, "").replace(/[.)\s]+$/g, "");
  if (VALID_OPTION_CODES.includes(direct as (typeof VALID_OPTION_CODES)[number])) return direct;
  const firstLetter = direct.charAt(0);
  if (VALID_OPTION_CODES.includes(firstLetter as (typeof VALID_OPTION_CODES)[number]) && (direct.length === 1 || /^[\s.):-]/.test(direct.slice(1)))) {
    return firstLetter;
  }
  return "";
}

function parseSafeHttpsUrl(raw: unknown): string | null | "INVALID" {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return "INVALID";
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2000) return "INVALID";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "INVALID";
    return parsed.href;
  } catch {
    return "INVALID";
  }
}

export function parseBulkQuestions(
  raw: unknown,
): { valid: ParsedCbtQuestion[]; skipped: ImportSkippedRow[] } | { error: string } {
  if (!Array.isArray(raw)) {
    return { error: "Format daftar soal tidak valid (harus berupa array)." };
  }
  if (raw.length === 0) {
    return { error: "Tidak ada butir soal yang dikirim untuk diimpor." };
  }
  if (raw.length > 200) {
    return { error: "Maksimal 200 butir soal per sekali impor." };
  }

  const valid: ParsedCbtQuestion[] = [];
  const skipped: ImportSkippedRow[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const rowNumber = isObjectRecord(item) && typeof item.row === "number" && Number.isFinite(item.row)
      ? Math.trunc(item.row)
      : i + 1;

    if (!isObjectRecord(item)) {
      skipped.push({ row: rowNumber, reason: "Format baris soal tidak valid." });
      continue;
    }

    const teks = cleanText(item.teks ?? item.pertanyaan ?? item.soal, 2000);
    if (!teks) {
      skipped.push({ row: rowNumber, reason: "Teks pertanyaan kosong." });
      continue;
    }

    const bobot = cleanInt(item.bobot ?? item.skor, 1, 100, 10);
    const pembahasan = cleanText(item.pembahasan, 1000) || null;
    const rawTipe = typeof item.tipe === "string" ? item.tipe.trim().toUpperCase() : "";

    // Build candidate options from either item.opsi array or opsiA..opsiE fields
    const optionMap = new Map<string, { teks: string; benar: boolean }>();
    if (Array.isArray(item.opsi)) {
      for (const entry of item.opsi) {
        if (!isObjectRecord(entry)) continue;
        const kode = extractOptionKey(entry.kode);
        const optText = cleanText(entry.teks, 500);
        if (kode && optText) {
          optionMap.set(kode, { teks: optText, benar: Boolean(entry.benar) });
        }
      }
    } else {
      for (const code of VALID_OPTION_CODES) {
        const optText = cleanText(
          item[`opsi${code}`] ?? item[`pilihan${code}`] ?? item[code] ?? item[code.toLowerCase()],
          500,
        );
        if (optText) {
          optionMap.set(code, { teks: optText, benar: false });
        }
      }
    }

    const isEsai =
      rawTipe === "ESAI" ||
      rawTipe === "ESSAY" ||
      rawTipe === "URAIAN" ||
      rawTipe === "ISIAN" ||
      (!rawTipe && optionMap.size === 0);

    if (isEsai) {
      const kunciEsai = cleanText(item.kunciEsai ?? item.kunci ?? item.jawaban, 1000) || null;
      valid.push({
        tipe: "ESAI",
        teks,
        bobot,
        kunciEsai,
        pembahasan,
        opsi: [],
      });
      continue;
    }

    // PG validation
    const kunciKey = extractOptionKey(item.kunci ?? item.kunciPg ?? item.jawaban);
    const opsiList: Array<{ kode: string; teks: string; benar: boolean }> = [];
    for (const code of VALID_OPTION_CODES) {
      const entry = optionMap.get(code);
      if (entry) {
        opsiList.push({
          kode: code,
          teks: entry.teks,
          benar: kunciKey ? code === kunciKey : entry.benar,
        });
      }
    }

    if (opsiList.length < 2) {
      skipped.push({ row: rowNumber, reason: "Soal pilihan ganda minimal memiliki 2 opsi jawaban." });
      continue;
    }

    if (!opsiList.some((o) => o.benar)) {
      skipped.push({
        row: rowNumber,
        reason: kunciKey
          ? `Kunci jawaban '${kunciKey}' tidak cocok dengan opsi yang terisi.`
          : "Kunci jawaban PG (A–E) belum ditentukan.",
      });
      continue;
    }

    valid.push({
      tipe: "PG",
      teks,
      bobot,
      kunciEsai: null,
      pembahasan,
      opsi: opsiList,
    });
  }

  return { valid, skipped };
}

export function parseBulkTasks(
  raw: unknown,
  defaultCategory: CbtCategory = "UTS",
): { valid: ParsedCbtTask[]; skipped: ImportSkippedRow[] } | { error: string } {
  if (!Array.isArray(raw)) {
    return { error: "Format daftar tugas tidak valid (harus berupa array)." };
  }
  if (raw.length === 0) {
    return { error: "Tidak ada tugas yang dikirim untuk diimpor." };
  }
  if (raw.length > 100) {
    return { error: "Maksimal 100 tugas per sekali impor." };
  }

  const valid: ParsedCbtTask[] = [];
  const skipped: ImportSkippedRow[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const rowNumber = isObjectRecord(item) && typeof item.row === "number" && Number.isFinite(item.row)
      ? Math.trunc(item.row)
      : i + 1;

    if (!isObjectRecord(item)) {
      skipped.push({ row: rowNumber, reason: "Format baris tugas tidak valid." });
      continue;
    }

    const judul = cleanText(item.judul ?? item.namaTugas ?? item.tugas, 180);
    const instruksi = cleanText(item.instruksi ?? item.deskripsi ?? item.soal ?? item.isi, 4500);
    if (!judul) {
      skipped.push({ row: rowNumber, reason: "Judul tugas kosong." });
      continue;
    }
    if (!instruksi) {
      skipped.push({ row: rowNumber, reason: "Instruksi atau soal tugas kosong." });
      continue;
    }

    const kategori = normalizeCbtCategory(item.kategori ?? item.jenis, defaultCategory);
    const kelasNama = cleanText(item.kelasNama ?? item.kelas, 120);
    const mapelNama = cleanText(item.mapelNama ?? item.mapel, 120);

    let batasWaktu: Date | null = null;
    const rawDeadline = cleanText(item.batasWaktu ?? item.tenggat ?? item.deadline, 40);
    if (rawDeadline) {
      const parsedDate = new Date(rawDeadline);
      if (Number.isNaN(parsedDate.getTime())) {
        skipped.push({ row: rowNumber, reason: `Format batas waktu tidak valid: ${rawDeadline}` });
        continue;
      }
      batasWaktu = parsedDate;
    }

    const safeUrl = parseSafeHttpsUrl(item.tautan ?? item.link);
    if (safeUrl === "INVALID") {
      skipped.push({ row: rowNumber, reason: "Tautan harus menggunakan protokol HTTPS yang valid." });
      continue;
    }

    valid.push({
      judul,
      instruksi,
      kategori,
      kelasNama,
      mapelNama,
      batasWaktu,
      tautan: safeUrl,
    });
  }

  return { valid, skipped };
}
