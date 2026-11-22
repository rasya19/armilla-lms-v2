import * as XLSX from "xlsx";

export type MasterJenjang = "PAKET_A" | "PAKET_B" | "PAKET_C";
export type MasterKategori = "MATERI" | "UTS" | "UAS" | "UJIAN_AKHIR";

export type MasterModulItem = {
  id: string;
  jenjang: MasterJenjang;
  tingkatKelas: string;
  mataPelajaran: string;
  kategoriUjian: MasterKategori;
  judul: string;
  deskripsi: string | null;
  konten?: string | null;
  fileUrl: string | null;
  jenis: string;
  visibility?: "PUBLIC" | "PRIVATE";
  aktif?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MasterButirSoalItem = {
  id?: string;
  urutan?: number;
  tipe: "PG" | "ESAI";
  teks: string;
  bobot: number;
  opsiA: string | null;
  opsiB: string | null;
  opsiC: string | null;
  opsiD: string | null;
  opsiE: string | null;
  kunciJawaban: string;
  pembahasan: string | null;
};

export type MasterBankSoalItem = {
  id: string;
  jenjang: MasterJenjang;
  tingkatKelas: string;
  mataPelajaran: string;
  kategoriUjian: MasterKategori;
  judul: string;
  deskripsi: string | null;
  durasiMenit: number;
  kkm: number;
  aktif?: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: { butirSoal: number };
  butirSoal?: MasterButirSoalItem[];
};

export type CloneMasterSummary = {
  copiedModul: number;
  skippedModul: number;
  copiedBankSoal: number;
  skippedBankSoal: number;
  copiedSoalCount: number;
  createdClasses: string[];
  createdSubjects: string[];
};

export const JENJANG_OPTIONS: Array<{ value: MasterJenjang; label: string; subtitle: string }> = [
  { value: "PAKET_A", label: "Paket A", subtitle: "Setara SD (Kelas 1–6)" },
  { value: "PAKET_B", label: "Paket B", subtitle: "Setara SMP (Kelas 7–9)" },
  { value: "PAKET_C", label: "Paket C", subtitle: "Setara SMA (Kelas 10–12)" },
];

export const TINGKAT_BY_JENJANG: Record<MasterJenjang, string[]> = {
  PAKET_A: ["Kelas 1", "Kelas 2", "Kelas 3", "Kelas 4", "Kelas 5", "Kelas 6"],
  PAKET_B: ["Kelas 7", "Kelas 8", "Kelas 9"],
  PAKET_C: ["Kelas 10", "Kelas 11", "Kelas 12"],
};

export const KATEGORI_OPTIONS: Array<{ value: MasterKategori; label: string; shortLabel: string }> = [
  { value: "MATERI", label: "Modul Ajar / Materi", shortLabel: "Modul" },
  { value: "UTS", label: "Soal UTS (Tengah Semester)", shortLabel: "UTS" },
  { value: "UAS", label: "Soal UAS (Akhir Semester)", shortLabel: "UAS" },
  { value: "UJIAN_AKHIR", label: "Ujian Akhir / UPK", shortLabel: "Ujian Akhir" },
];

export const PKBM_MAPEL_PRESETS = [
  "Bahasa Indonesia",
  "Matematika",
  "Bahasa Inggris",
  "Pendidikan Pancasila (PPKn)",
  "Ilmu Pengetahuan Alam (IPA)",
  "Ilmu Pengetahuan Sosial (IPS)",
  "Pendidikan Agama",
  "Ekonomi",
  "Sosiologi",
  "Geografi",
  "Sejarah",
  "Informatika / TIK",
  "Prakarya & Kewirausahaan",
];

export function jenjangLabel(value: MasterJenjang): string {
  if (value === "PAKET_A") return "Paket A";
  if (value === "PAKET_B") return "Paket B";
  return "Paket C";
}

export function kategoriLabel(value: MasterKategori): string {
  if (value === "MATERI") return "Modul Ajar";
  if (value === "UTS") return "UTS";
  if (value === "UAS") return "UAS";
  return "Ujian Akhir / UPK";
}

export function jenjangBadgeCls(value: MasterJenjang, dark = false): string {
  if (value === "PAKET_A") {
    return dark
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (value === "PAKET_B") {
    return dark
      ? "border-sky-400/30 bg-sky-500/15 text-sky-200"
      : "border-sky-200 bg-sky-50 text-sky-800";
  }
  return dark
    ? "border-indigo-400/30 bg-indigo-500/15 text-indigo-200"
    : "border-indigo-200 bg-indigo-50 text-indigo-800";
}

export function kategoriBadgeCls(value: MasterKategori, dark = false): string {
  if (value === "MATERI") {
    return dark
      ? "border-teal-400/30 bg-teal-500/15 text-teal-200"
      : "border-teal-200 bg-teal-50 text-teal-800";
  }
  if (value === "UTS") {
    return dark
      ? "border-amber-400/30 bg-amber-500/15 text-amber-200"
      : "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (value === "UAS") {
    return dark
      ? "border-sky-400/30 bg-sky-500/15 text-sky-200"
      : "border-sky-200 bg-sky-50 text-sky-800";
  }
  return dark
    ? "border-rose-400/30 bg-rose-500/15 text-rose-200"
    : "border-rose-200 bg-rose-50 text-rose-800";
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function pickCell(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    if (row[key] && row[key].trim() !== "") return row[key].trim();
  }
  return "";
}

function parseJenjangCell(value: string, fallback: MasterJenjang = "PAKET_C"): MasterJenjang {
  const norm = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (norm === "PAKET_A" || norm === "A" || norm.includes("SD")) return "PAKET_A";
  if (norm === "PAKET_B" || norm === "B" || norm.includes("SMP")) return "PAKET_B";
  if (norm === "PAKET_C" || norm === "C" || norm.includes("SMA")) return "PAKET_C";
  return fallback;
}

function parseKategoriCell(value: string, fallback: MasterKategori = "UTS"): MasterKategori {
  const norm = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (norm === "MATERI" || norm.includes("MODUL")) return "MATERI";
  if (norm === "UTS" || norm.includes("TENGAH")) return "UTS";
  if (norm === "UAS" || norm === "AS" || norm === "PAS") return "UAS";
  if (norm === "UJIAN_AKHIR" || norm.includes("UPK") || norm.includes("KELAS_AKHIR")) return "UJIAN_AKHIR";
  return fallback;
}

function sheetToNormalizedRows(sheet: XLSX.WorkSheet): Array<Record<string, string>> {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (matrix.length < 2) return [];
  const headers = (matrix[0] ?? []).map(normalizeHeader);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < matrix.length; i++) {
    const raw = matrix[i];
    if (!Array.isArray(raw)) continue;
    const rec: Record<string, string> = {};
    let hasAny = false;
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;
      const val = String(raw[c] ?? "").trim();
      if (val) hasAny = true;
      rec[h] = val;
    }
    if (hasAny) rows.push(rec);
  }
  return rows;
}

export type ParsedModulImportItem = {
  jenjang: MasterJenjang;
  tingkatKelas: string;
  mataPelajaran: string;
  kategoriUjian: MasterKategori;
  judul: string;
  deskripsi: string;
  konten: string;
  fileUrl: string;
};

export type ParsedBankSoalPacket = {
  jenjang: MasterJenjang;
  tingkatKelas: string;
  mataPelajaran: string;
  kategoriUjian: MasterKategori;
  judul: string;
  deskripsi: string;
  durasiMenit: number;
  kkm: number;
  butirSoal: MasterButirSoalItem[];
};

export async function parseMasterModulFile(
  file: File,
  defaults: { jenjang: MasterJenjang; tingkatKelas: string; mataPelajaran: string },
): Promise<{ items: ParsedModulImportItem[]; warnings: string[] }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const warnings: string[] = [];

  if (ext === "json") {
    const text = await file.text();
    const raw = JSON.parse(text) as unknown;
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).items)
        ? ((raw as Record<string, unknown>).items as unknown[])
        : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).modul)
          ? ((raw as Record<string, unknown>).modul as unknown[])
          : [];
    const items: ParsedModulImportItem[] = [];
    for (let i = 0; i < list.length; i++) {
      const entry = list[i] as Record<string, unknown>;
      const judul = String(entry?.judul ?? "").trim();
      const mapel = String(entry?.mataPelajaran ?? entry?.mata_pelajaran ?? defaults.mataPelajaran).trim();
      if (!judul || !mapel) {
        warnings.push(`Entri #${i + 1} dilewati karena judul atau mapel kosong.`);
        continue;
      }
      const rawUrl = String(
        entry?.fileUrl ?? entry?.file_url ?? entry?.linkPdf ?? entry?.link_pdf ?? entry?.tautan ?? "",
      ).trim();
      if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
        warnings.push(`Baris #${i + 1} dilewati karena Link PDF harus berupa tautan http:// atau https://.`);
        continue;
      }
      const jenjang = parseJenjangCell(String(entry?.jenjang ?? entry?.paket ?? ""), defaults.jenjang);
      items.push({
        jenjang,
        tingkatKelas:
          String(entry?.tingkatKelas ?? entry?.tingkat_kelas ?? entry?.kelas ?? defaults.tingkatKelas).trim() ||
          defaults.tingkatKelas,
        mataPelajaran: mapel,
        kategoriUjian: parseKategoriCell(String(entry?.kategoriUjian ?? entry?.kategori_ujian ?? "MATERI"), "MATERI"),
        judul,
        deskripsi: String(entry?.deskripsi ?? entry?.ringkasan ?? "").trim(),
        konten: String(entry?.konten ?? entry?.isi ?? "").trim(),
        fileUrl: rawUrl,
      });
    }
    return { items: items.slice(0, 500), warnings };
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { items: [], warnings: ["File tidak memiliki lembar kerja."] };

  const rows = sheetToNormalizedRows(sheet);
  const items: ParsedModulImportItem[] = [];
  for (let i = 0; i < Math.min(rows.length, 500); i++) {
    const row = rows[i];
    const judul = pickCell(row, ["judul_modul", "judul", "nama_modul", "title"]);
    const mapel = pickCell(row, ["mata_pelajaran", "mapel", "pelajaran", "subject"]) || defaults.mataPelajaran;
    if (!judul || !mapel) {
      warnings.push(`Baris #${i + 2} dilewati karena kolom Judul Modul atau Mata Pelajaran kosong.`);
      continue;
    }
    const rawUrl = pickCell(row, ["link_pdf", "file_url", "url", "tautan", "link", "link_modul"]);
    if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
      warnings.push(`Baris #${i + 2} (${judul}): Link PDF tidak valid (wajib diawali https:// atau http://).`);
      continue;
    }
    const jenjang = parseJenjangCell(pickCell(row, ["paket", "jenjang", "program"]), defaults.jenjang);
    items.push({
      jenjang,
      tingkatKelas: pickCell(row, ["kelas", "tingkat_kelas", "tingkat"]) || defaults.tingkatKelas,
      mataPelajaran: mapel,
      kategoriUjian: parseKategoriCell(pickCell(row, ["kategori_ujian", "kategori"]), "MATERI"),
      judul,
      deskripsi: pickCell(row, ["ringkasan", "deskripsi", "keterangan"]),
      konten: pickCell(row, ["konten", "isi", "materi", "isi_modul"]),
      fileUrl: rawUrl,
    });
  }
  if (rows.length > 500) {
    warnings.push("File memiliki lebih dari 500 baris. Hanya 500 modul pertama yang diproses dalam satu kali impor.");
  }
  return { items, warnings };
}

export async function parseMasterBankSoalFile(
  file: File,
  defaults: {
    jenjang: MasterJenjang;
    tingkatKelas: string;
    mataPelajaran: string;
    kategoriUjian: MasterKategori;
    judul: string;
  },
): Promise<{ packets: ParsedBankSoalPacket[]; warnings: string[] }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const warnings: string[] = [];

  if (ext === "json") {
    const text = await file.text();
    const raw = JSON.parse(text) as unknown;
    const rawPackets = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).packets)
        ? ((raw as Record<string, unknown>).packets as unknown[])
        : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).butirSoal)
          ? [raw]
          : [];

    const packets: ParsedBankSoalPacket[] = [];
    for (let i = 0; i < rawPackets.length; i++) {
      const p = rawPackets[i] as Record<string, unknown>;
      const rawQuestions = Array.isArray(p?.butirSoal)
        ? p.butirSoal
        : Array.isArray(p?.soal)
          ? p.soal
          : [];
      const butirSoal: MasterButirSoalItem[] = [];
      for (const q of rawQuestions) {
        const item = q as Record<string, unknown>;
        const teks = String(item?.teks ?? item?.pertanyaan ?? "").trim();
        if (!teks) continue;
        const tipe = String(item?.tipe ?? "PG").toUpperCase() === "ESAI" ? "ESAI" : "PG";
        butirSoal.push({
          tipe,
          teks,
          bobot: Number(item?.bobot ?? 10) || 10,
          opsiA: String(item?.opsiA ?? item?.opsi_a ?? "").trim() || null,
          opsiB: String(item?.opsiB ?? item?.opsi_b ?? "").trim() || null,
          opsiC: String(item?.opsiC ?? item?.opsi_c ?? "").trim() || null,
          opsiD: String(item?.opsiD ?? item?.opsi_d ?? "").trim() || null,
          opsiE: String(item?.opsiE ?? item?.opsi_e ?? "").trim() || null,
          kunciJawaban: String(item?.kunciJawaban ?? item?.kunci_jawaban ?? item?.kunci ?? "A").trim() || "A",
          pembahasan: String(item?.pembahasan ?? "").trim() || null,
        });
      }
      if (butirSoal.length === 0) {
        warnings.push(`Paket JSON #${i + 1} tidak memiliki butir soal valid.`);
        continue;
      }
      const jenjang = parseJenjangCell(String(p?.jenjang ?? ""), defaults.jenjang);
      const kategori = parseKategoriCell(String(p?.kategoriUjian ?? p?.kategori_ujian ?? ""), defaults.kategoriUjian);
      packets.push({
        jenjang,
        tingkatKelas: String(p?.tingkatKelas ?? p?.tingkat_kelas ?? defaults.tingkatKelas).trim() || defaults.tingkatKelas,
        mataPelajaran: String(p?.mataPelajaran ?? p?.mata_pelajaran ?? defaults.mataPelajaran).trim() || defaults.mataPelajaran,
        kategoriUjian: kategori === "MATERI" ? "UTS" : kategori,
        judul: String(p?.judul ?? defaults.judul).trim() || `${kategori} ${defaults.mataPelajaran}`,
        deskripsi: String(p?.deskripsi ?? "").trim(),
        durasiMenit: Number(p?.durasiMenit ?? 60) || 60,
        kkm: Number(p?.kkm ?? 75) || 75,
        butirSoal,
      });
    }
    return { packets, warnings };
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { packets: [], warnings: ["File Excel tidak memiliki lembar kerja."] };

  const rows = sheetToNormalizedRows(sheet);
  const grouped = new Map<string, ParsedBankSoalPacket>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const teks = pickCell(row, ["pertanyaan", "teks", "soal", "butir_soal", "question"]);
    if (!teks) {
      warnings.push(`Baris #${i + 2} dilewati karena kolom pertanyaan kosong.`);
      continue;
    }

    const jenjang = parseJenjangCell(pickCell(row, ["jenjang", "paket"]), defaults.jenjang);
    const tingkatKelas = pickCell(row, ["tingkat_kelas", "tingkat", "kelas"]) || defaults.tingkatKelas;
    const mataPelajaran = pickCell(row, ["mata_pelajaran", "mapel"]) || defaults.mataPelajaran;
    const kategoriRaw = parseKategoriCell(pickCell(row, ["kategori_ujian", "kategori"]), defaults.kategoriUjian);
    const kategoriUjian: MasterKategori = kategoriRaw === "MATERI" ? "UTS" : kategoriRaw;
    const judul =
      pickCell(row, ["judul_paket", "judul", "nama_paket"]) ||
      defaults.judul ||
      `${kategoriLabel(kategoriUjian)} ${mataPelajaran} ${jenjangLabel(jenjang)} ${tingkatKelas}`;

    const groupKey = `${jenjang}::${tingkatKelas}::${mataPelajaran.toLowerCase()}::${kategoriUjian}::${judul.toLowerCase()}`;
    let packet = grouped.get(groupKey);
    if (!packet) {
      packet = {
        jenjang,
        tingkatKelas,
        mataPelajaran,
        kategoriUjian,
        judul,
        deskripsi: pickCell(row, ["deskripsi", "keterangan"]),
        durasiMenit: Number(pickCell(row, ["durasi_menit", "durasi"])) || 60,
        kkm: Number(pickCell(row, ["kkm"])) || 75,
        butirSoal: [],
      };
      grouped.set(groupKey, packet);
    }

    const tipeRaw = pickCell(row, ["tipe", "jenis_soal"]).toUpperCase();
    const tipe: "PG" | "ESAI" = tipeRaw === "ESAI" || tipeRaw === "ESSAY" ? "ESAI" : "PG";
    const opsiA = pickCell(row, ["opsi_a", "a", "pilihan_a"]);
    const opsiB = pickCell(row, ["opsi_b", "b", "pilihan_b"]);
    const opsiC = pickCell(row, ["opsi_c", "c", "pilihan_c"]);
    const opsiD = pickCell(row, ["opsi_d", "d", "pilihan_d"]);
    const opsiE = pickCell(row, ["opsi_e", "e", "pilihan_e"]);
    const kunci = pickCell(row, ["kunci_jawaban", "kunci", "jawaban", "answer"]) || "A";
    const bobot = Number(pickCell(row, ["bobot", "skor", "poin"])) || 10;
    const pembahasan = pickCell(row, ["pembahasan", "penjelasan"]);

    if (tipe === "PG" && (!opsiA || !opsiB)) {
      warnings.push(`Baris #${i + 2} dilewati karena soal PG wajib memiliki minimal Opsi A dan Opsi B.`);
      continue;
    }

    packet.butirSoal.push({
      tipe,
      teks,
      bobot,
      opsiA: opsiA || null,
      opsiB: opsiB || null,
      opsiC: opsiC || null,
      opsiD: opsiD || null,
      opsiE: opsiE || null,
      kunciJawaban: tipe === "PG" ? kunci.toUpperCase().slice(0, 1) : kunci,
      pembahasan: pembahasan || null,
    });
  }

  return { packets: [...grouped.values()].filter((p) => p.butirSoal.length > 0), warnings };
}

export function downloadMasterModulTemplate(): void {
  const rows = [
    {
      Paket: "Paket A",
      Kelas: "Kelas 6",
      "Mata Pelajaran": "Matematika",
      "Judul Modul": "Modul 1: Operasi Hitung Pecahan & Desimal",
      Ringkasan: "Panduan konsep pecahan, desimal, dan soal latihan kontekstual Paket A.",
      "Link PDF": "https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0J/view",
    },
    {
      Paket: "Paket B",
      Kelas: "Kelas 9",
      "Mata Pelajaran": "Bahasa Indonesia",
      "Judul Modul": "Modul 2: Teks Eksposisi & Argumentasi",
      Ringkasan: "Struktur teks eksposisi, kaidah kebahasaan, dan evaluasi mandiri Paket B.",
      "Link PDF": "https://emodul.kemdikbud.go.id/contoh-modul-paket-b.pdf",
    },
    {
      Paket: "Paket C",
      Kelas: "Kelas 12",
      "Mata Pelajaran": "Bahasa Indonesia",
      "Judul Modul": "Modul 3: Teks Editorial & Analisis Opini",
      Ringkasan: "Panduan struktur teks editorial untuk persiapan UPK Paket C.",
      "Link PDF": "https://drive.google.com/file/d/9Z8Y7X6W5V4U3T2S1R0Q/view",
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "DaftarModul");
  XLSX.writeFile(workbook, "Template_Daftar_Modul_Resmi.xlsx");
}

export function downloadMasterBankSoalTemplate(): void {
  const rows = [
    {
      jenjang: "PAKET_C",
      tingkat_kelas: "Kelas 12",
      mata_pelajaran: "Bahasa Indonesia",
      kategori_ujian: "UJIAN_AKHIR",
      judul_paket: "Bank Soal UPK Bahasa Indonesia Paket C",
      durasi_menit: 90,
      kkm: 75,
      tipe: "PG",
      pertanyaan: "Kalimat yang berisi pendapat redaksi terhadap suatu isu aktual disebut...",
      opsi_a: "Fakta berita",
      opsi_b: "Opini editorial",
      opsi_c: "Kutipan langsung",
      opsi_d: "Ringkasan paragraf",
      opsi_e: "Daftar pustaka",
      kunci_jawaban: "B",
      bobot: 10,
      pembahasan: "Teks editorial memuat sikap atau opini redaksi atas peristiwa aktual.",
    },
    {
      jenjang: "PAKET_C",
      tingkat_kelas: "Kelas 12",
      mata_pelajaran: "Bahasa Indonesia",
      kategori_ujian: "UJIAN_AKHIR",
      judul_paket: "Bank Soal UPK Bahasa Indonesia Paket C",
      durasi_menit: 90,
      kkm: 75,
      tipe: "PG",
      pertanyaan: "Bagian akhir teks editorial yang berisi saran atau harapan redaksi disebut...",
      opsi_a: "Pengenalan isu",
      opsi_b: "Argumentasi",
      opsi_c: "Penegasan ulang",
      opsi_d: "Orientasi",
      opsi_e: "Komplikasi",
      kunci_jawaban: "C",
      bobot: 10,
      pembahasan: "Struktur teks editorial terdiri dari pengenalan isu, argumentasi, dan penegasan ulang.",
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "MasterBankSoal");
  XLSX.writeFile(workbook, "Template_Pustaka_Master_Bank_Soal.xlsx");
}
