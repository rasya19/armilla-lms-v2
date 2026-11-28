export type RaportScoreSource = "raport" | "pindahan";

const TRANSFER_LEGER_TOKEN_REGEX = /_{2,}LEGER_PINDAHAN_{2,}|\[LEGER_PINDAHAN\]/i;
const INTERNAL_SENTINEL_TOKEN_REGEX = /_{2,}[A-Z0-9_]+_{2,}|\[(?:LEGER_PINDAHAN|UPK_OVERRIDE)\]/gi;

export function parseRaportCompetencyNote(
  rawNote: string | null | undefined,
  explicitSource?: RaportScoreSource | null,
): { isTransferLeger: boolean; cleanNote: string | null } {
  const raw = typeof rawNote === "string" ? rawNote : "";
  const hasTransferToken = TRANSFER_LEGER_TOKEN_REGEX.test(raw);
  const isTransferLeger = explicitSource === "pindahan" || hasTransferToken;

  const stripped = raw
    .replace(INTERNAL_SENTINEL_TOKEN_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    isTransferLeger,
    cleanNote: stripped.length > 0 ? stripped : null,
  };
}

export function buildRaportCompetencyNarrative(params: {
  mapelNama: string;
  nilaiAkhir: number | null | undefined;
  customNote?: string | null;
  source?: RaportScoreSource | null;
  isTransferLeger?: boolean;
}): string {
  const mapelNama = params.mapelNama.trim() || "mata pelajaran ini";
  const parsed = parseRaportCompetencyNote(params.customNote, params.source);
  const isTransfer = Boolean(params.isTransferLeger || parsed.isTransferLeger);

  if (parsed.cleanNote) {
    return parsed.cleanNote;
  }

  const nilaiAkhir =
    typeof params.nilaiAkhir === "number" && Number.isFinite(params.nilaiAkhir)
      ? params.nilaiAkhir
      : null;

  if (nilaiAkhir === null) {
    if (isTransfer) {
      return `Belum terdapat angka konversi nilai akhir dari leger pindahan pada mata pelajaran ${mapelNama}. Lengkapi nilai pindahan terlebih dahulu untuk menampilkan capaian kompetensi.`;
    }
    return `Belum terdapat capaian nilai akhir pada mata pelajaran ${mapelNama} semester ini.`;
  }

  if (isTransfer) {
    if (nilaiAkhir >= 86) {
      return `Capaian kompetensi pada mata pelajaran ${mapelNama} mengacu pada hasil konversi nilai leger pindahan dengan kategori sangat baik. Warga belajar disarankan mempertahankan prestasi melalui pengayaan dan pendalaman materi secara mandiri.`;
    }
    if (nilaiAkhir >= 76) {
      return `Capaian kompetensi pada mata pelajaran ${mapelNama} mengacu pada hasil konversi nilai leger pindahan dengan kategori baik. Perlu penguatan berkelanjutan pada latihan analisis dan adaptasi pembelajaran mandiri di PKBM.`;
    }
    if (nilaiAkhir >= 70) {
      return `Capaian kompetensi pada mata pelajaran ${mapelNama} mengacu pada hasil konversi nilai leger pindahan dengan kategori cukup. Disarankan mengikuti pendampingan tutorial agar penguasaan konsep lanjutan semakin optimal.`;
    }
    if (nilaiAkhir >= 50) {
      return `Capaian kompetensi pada mata pelajaran ${mapelNama} mengacu pada hasil konversi nilai leger pindahan dan masih memerlukan penguatan konsep dasar. Perlu bimbingan tutor serta latihan remedial terarah.`;
    }
    return `Capaian kompetensi pada mata pelajaran ${mapelNama} mengacu pada hasil konversi nilai leger pindahan dan belum mencapai ketuntasan. Diperlukan pendampingan intensif serta pengulangan modul dasar bersama tutor.`;
  }

  if (nilaiAkhir >= 86) {
    return `Menunjukkan penguasaan yang sangat baik dalam memahami dan menerapkan seluruh kompetensi esensial pada mata pelajaran ${mapelNama}. Perlu diberikan pengayaan untuk mengembangkan keterampilan berpikir tingkat lanjut secara mandiri.`;
  }
  if (nilaiAkhir >= 76) {
    return `Menunjukkan penguasaan yang baik dalam memahami konsep dan penerapan materi ${mapelNama}. Perlu penguatan pada latihan analisis dan konsistensi penyelesaian tugas mandiri.`;
  }
  if (nilaiAkhir >= 70) {
    return `Menunjukkan penguasaan yang cukup pada kompetensi dasar mata pelajaran ${mapelNama}. Perlu bimbingan lanjutan dalam memahami materi yang lebih kompleks serta peningkatan ketelitian dalam pembelajaran tutorial dan mandiri.`;
  }
  if (nilaiAkhir >= 50) {
    return `Mulai memahami sebagian konsep dasar ${mapelNama}. Perlu pendampingan tutor dan remedial pada bagian materi yang belum tuntas.`;
  }
  return `Belum mencapai ketuntasan pada kompetensi esensial ${mapelNama}. Perlu bimbingan intensif dan pengulangan modul mandiri secara menyeluruh.`;
}

// ==========================================
// P5 / PEMBERDAYAAN & KETERAMPILAN NARRATIVE GENERATOR
// ==========================================
export type P5AchievementLevel = "MB" | "SB" | "BSH" | "SAB";

export type P5DimensionKey =
  | "BERIMAN"
  | "BERKEBINEKAAN"
  | "GOTONG_ROYONG"
  | "MANDIRI"
  | "BERNALAR_KRITIS"
  | "KREATIF"
  | "PEMBERDAYAAN";

export const P5_LEVEL_OPTIONS: Array<{
  code: P5AchievementLevel;
  label: string;
  shortLabel: string;
  score: number;
}> = [
  { code: "MB", label: "Mulai Berkembang (MB)", shortLabel: "Mulai Berkembang", score: 1 },
  { code: "SB", label: "Sedang Berkembang (SB)", shortLabel: "Sedang Berkembang", score: 2 },
  { code: "BSH", label: "Berkembang Sesuai Harapan (BSH)", shortLabel: "Berkembang Sesuai Harapan", score: 3 },
  { code: "SAB", label: "Sangat Berkembang (SAB)", shortLabel: "Sangat Berkembang", score: 4 },
];

export const P5_DIMENSION_OPTIONS: Array<{
  key: P5DimensionKey;
  label: string;
  focusBehavior: string;
  growthAction: string;
}> = [
  {
    key: "BERIMAN",
    label: "Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia",
    focusBehavior: "menunjukkan akhlak mulia, integritas, sikap santun, serta kepedulian terhadap sesama dan lingkungan",
    growthAction: "pembiasaan refleksi nilai spiritual dan keteladanan sikap dalam keseharian",
  },
  {
    key: "BERKEBINEKAAN",
    label: "Berkebinekaan Global",
    focusBehavior: "menghargai keberagaman budaya, berkomunikasi lintas perspektif secara inklusif, dan menjaga harmoni sosial",
    growthAction: "dialog terbuka serta apresiasi terhadap latar belakang budaya yang beragam",
  },
  {
    key: "GOTONG_ROYONG",
    label: "Bergotong Royong",
    focusBehavior: "berkolaborasi aktif, berbagi peran secara adil, serta menunjukkan kepedulian sosial dalam kerja tim",
    growthAction: "latihan komunikasi kelompok dan tanggung jawab bersama dalam menyelesaikan tugas projek",
  },
  {
    key: "MANDIRI",
    label: "Mandiri",
    focusBehavior: "mengelola waktu belajar, mengatur emosi, dan menuntaskan tanggung jawab projek secara inisiatif",
    growthAction: "penyusunan target belajar bertahap dan evaluasi diri secara rutin",
  },
  {
    key: "BERNALAR_KRITIS",
    label: "Bernalar Kritis",
    focusBehavior: "mengidentifikasi masalah, mengolah informasi secara objektif, dan merumuskan solusi berbasis data",
    growthAction: "latihan bertanya reflektif dan verifikasi sumber informasi sebelum mengambil kesimpulan",
  },
  {
    key: "KREATIF",
    label: "Kreatif",
    focusBehavior: "menghasilkan gagasan orisinal, memodifikasi karya secara inovatif, dan menemukan alternatif pemecahan masalah",
    growthAction: "eksplorasi ide baru dan keberanian mencoba pendekatan karya yang lebih variatif",
  },
  {
    key: "PEMBERDAYAAN",
    label: "Pemberdayaan & Keterampilan Kesetaraan",
    focusBehavior: "menerapkan kecakapan hidup, kemandirian vokasional/wirausaha, serta partisipasi produktif di masyarakat",
    growthAction: "praktik keterampilan aplikatif dan pendampingan penguatan portofolio karya mandiri",
  },
];

export function getP5DimensionMeta(dimensi: string) {
  return (
    P5_DIMENSION_OPTIONS.find((item) => item.key === dimensi || item.label.toLowerCase() === dimensi.toLowerCase()) ?? {
      key: "PEMBERDAYAAN" as P5DimensionKey,
      label: dimensi.trim() || "Pemberdayaan & Keterampilan Kesetaraan",
      focusBehavior: "menerapkan karakter positif dan kecakapan hidup secara kontekstual",
      growthAction: "pendampingan refleksi dan praktik berkelanjutan bersama tutor",
    }
  );
}

export function getP5LevelLabel(level: P5AchievementLevel): string {
  return P5_LEVEL_OPTIONS.find((item) => item.code === level)?.label ?? "Berkembang Sesuai Harapan (BSH)";
}

export function buildP5DimensionNarrative(params: {
  dimensi: string;
  judulProjek?: string | null;
  tingkatCapaian: P5AchievementLevel;
  customNote?: string | null;
}): string {
  const custom = typeof params.customNote === "string" ? params.customNote.trim() : "";
  if (custom) return custom;

  const meta = getP5DimensionMeta(params.dimensi);
  const projekText = params.judulProjek?.trim()
    ? `melalui projek "${params.judulProjek.trim()}"`
    : "dalam kegiatan projek penguatan profil pelajar dan pemberdayaan";

  switch (params.tingkatCapaian) {
    case "SAB":
      return `Pada dimensi ${meta.label}, peserta didik berkembang sangat baik ${projekText}. Peserta didik secara konsisten dan menjadi teladan dalam ${meta.focusBehavior}, serta mampu menginspirasi rekan sejawat untuk menerapkan nilai tersebut secara mandiri.`;
    case "BSH":
      return `Pada dimensi ${meta.label}, peserta didik telah berkembang sesuai harapan ${projekText}. Peserta didik mampu ${meta.focusBehavior} secara konsisten dan bertanggung jawab sesuai tahapan fase belajarnya.`;
    case "SB":
      return `Pada dimensi ${meta.label}, peserta didik sedang berkembang ${projekText}. Peserta didik mulai terbiasa ${meta.focusBehavior}, namun masih memerlukan penguatan pada ${meta.growthAction} agar capaian semakin konsisten.`;
    case "MB":
    default:
      return `Pada dimensi ${meta.label}, peserta didik mulai berkembang ${projekText}. Peserta didik masih memerlukan bimbingan terarah dari tutor untuk ${meta.focusBehavior}, khususnya melalui ${meta.growthAction}.`;
  }
}

export function computeOverallP5Level(levels: P5AchievementLevel[]): P5AchievementLevel {
  if (levels.length === 0) return "BSH";
  const scoreMap: Record<P5AchievementLevel, number> = { MB: 1, SB: 2, BSH: 3, SAB: 4 };
  const avg = levels.reduce((sum, lvl) => sum + (scoreMap[lvl] ?? 3), 0) / levels.length;
  if (avg >= 3.5) return "SAB";
  if (avg >= 2.5) return "BSH";
  if (avg >= 1.5) return "SB";
  return "MB";
}

export function buildP5ProcessNote(params: {
  tingkatKeseluruhan: P5AchievementLevel;
  judulProjek?: string | null;
  customNote?: string | null;
}): string {
  const custom = typeof params.customNote === "string" ? params.customNote.trim() : "";
  if (custom) return custom;

  const tema = params.judulProjek?.trim()
    ? `projek "${params.judulProjek.trim()}"`
    : "kegiatan projek P5 serta pemberdayaan dan keterampilan semester ini";

  switch (params.tingkatKeseluruhan) {
    case "SAB":
      return `Secara keseluruhan, peserta didik menunjukkan keterlibatan yang sangat unggul dan inisiatif tinggi sepanjang pelaksanaan ${tema}. Kemampuan refleksi, kolaborasi, dan kualitas karya telah melampaui harapan serta layak dikembangkan pada proyek lanjutan.`;
    case "BSH":
      return `Secara keseluruhan, peserta didik mengikuti rangkaian ${tema} dengan baik dan bertanggung jawab. Peserta didik telah mencapai target karakter dan keterampilan sesuai harapan fase belajarnya.`;
    case "SB":
      return `Secara keseluruhan, peserta didik menunjukkan perkembangan positif selama mengikuti ${tema}. Diperlukan dorongan lanjutan dalam kemandirian, konsistensi pelaksanaan tahapan projek, serta keberanian menyampaikan gagasan.`;
    case "MB":
    default:
      return `Secara keseluruhan, peserta didik mulai beradaptasi dalam mengikuti tahapan ${tema}. Diperlukan pendampingan tutor secara bertahap agar partisipasi aktif, tanggung jawab, dan kepercayaan diri peserta didik semakin meningkat.`;
  }
}

// ==========================================
// EKSTRAKURIKULER / PENGEMBANGAN DIRI NARRATIVE GENERATOR
// ==========================================
export const EKSKUL_PREDIKAT_OPTIONS = ["Sangat Baik", "Baik", "Cukup", "Perlu Bimbingan"] as const;
export type EkskulPredikat = (typeof EKSKUL_PREDIKAT_OPTIONS)[number];

export function buildEkskulDescription(params: {
  kegiatan: string;
  predikat: string;
  customNote?: string | null;
}): string {
  const custom = typeof params.customNote === "string" ? params.customNote.trim() : "";
  if (custom) return custom;

  const namaKegiatan = params.kegiatan.trim() || "kegiatan pengembangan diri ini";
  const normalized = params.predikat.trim().toLowerCase();

  if (normalized === "sangat baik") {
    return `Sangat aktif, disiplin, dan menunjukkan penguasaan keterampilan serta keteladanan yang menonjol dalam kegiatan ${namaKegiatan}.`;
  }
  if (normalized === "baik") {
    return `Aktif berpartisipasi, kooperatif, dan mampu mengikuti seluruh agenda latihan serta praktik dalam kegiatan ${namaKegiatan} dengan baik.`;
  }
  if (normalized === "cukup") {
    return `Cukup aktif mengikuti kegiatan ${namaKegiatan}; disarankan meningkatkan kehadiran dan inisiatif dalam setiap sesi praktik.`;
  }
  return `Masih memerlukan dorongan dan pendampingan agar lebih rutin hadir serta terlibat aktif dalam kegiatan ${namaKegiatan}.`;
}
