export const UPK_OVERRIDE_MARKER = "__UPK_MANUAL__";

export const RAPORT_WEIGHT = 0.6;
export const UPK_WEIGHT = 0.4;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isUpkExam(kode: string | null | undefined, judul: string | null | undefined): boolean {
  const k = (kode ?? "").trim().toUpperCase();
  const j = (judul ?? "").trim().toUpperCase();
  if (k.startsWith("UAK-") || k.startsWith("UPK-")) return true;
  return /\b(UPK|UAK|UJIAN\s*AKHIR|UJIAN\s*PENDIDIKAN\s*KESETARAAN|USBN)\b/.test(j);
}

export function transcriptPredikat(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "-";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  return "D";
}

export type TranscriptScoreResult = {
  semesterCount: number;
  rataRaport: number | null;
  kontribusiRaport: number | null;
  nilaiUpk: number | null;
  kontribusiUpk: number | null;
  nilaiTranskrip: number | null;
  predikat: string;
};

/**
 * Menghitung Nilai Transkrip Kelulusan (Pendamping Ijazah):
 * 60% Rata-rata Nilai Raport (hingga 6 semester) + 40% Nilai UPK (Ujian Akhir Kelas Akhir).
 */
export function computeTranscriptScore(
  semesterValues: number[],
  upkScore: number | null,
): TranscriptScoreResult {
  const validSemesters = semesterValues
    .filter((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100)
    .slice(0, 6);

  const rataRaport =
    validSemesters.length > 0
      ? round2(validSemesters.reduce((sum, v) => sum + v, 0) / validSemesters.length)
      : null;

  const validUpk =
    upkScore !== null && typeof upkScore === "number" && Number.isFinite(upkScore) && upkScore >= 0 && upkScore <= 100
      ? round2(upkScore)
      : null;

  const kontribusiRaport = rataRaport !== null ? round2(rataRaport * RAPORT_WEIGHT) : null;
  const kontribusiUpk = validUpk !== null ? round2(validUpk * UPK_WEIGHT) : null;

  const nilaiTranskrip =
    rataRaport !== null && validUpk !== null
      ? round2(rataRaport * RAPORT_WEIGHT + validUpk * UPK_WEIGHT)
      : null;

  return {
    semesterCount: validSemesters.length,
    rataRaport,
    kontribusiRaport,
    nilaiUpk: validUpk,
    kontribusiUpk,
    nilaiTranskrip,
    predikat: transcriptPredikat(nilaiTranskrip),
  };
}
