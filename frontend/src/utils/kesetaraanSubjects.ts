export type KesetaraanProgram = "PAKET_A" | "PAKET_B" | "PAKET_C" | "UNKNOWN";
export type PaketCTrack = "IPA" | "IPS";

const IPA_SPECIALIST_REGEX = /\b(fisika|kimia|biologi|matematika\s*(?:tingkat\s*)?lanjut|ipa\s*peminatan)\b/i;
const IPS_SPECIALIST_REGEX = /\b(ekonomi|sosiologi|geografi|antropologi|ips\s*peminatan|sejarah\s*peminatan)\b/i;
const PAKET_A_ONLY_REGEX = /\b(ipas|ilmu pengetahuan alam dan sosial)\b/i;
const PAKET_B_TERPADU_IPA_REGEX = /^ipa(?:\s*\(|$)|\bilmu pengetahuan alam\b/i;
const PAKET_B_TERPADU_IPS_REGEX = /^ips(?:\s*\(|$)|\bilmu pengetahuan sosial\b/i;

export function detectKesetaraanProgram(kelasName: string, jenjang?: string | null): KesetaraanProgram {
  const combined = `${kelasName} ${jenjang ?? ""}`.toLowerCase();
  if (/\bpaket\s*a\b/.test(combined)) return "PAKET_A";
  if (/\bpaket\s*b\b/.test(combined)) return "PAKET_B";
  if (/\bpaket\s*c\b/.test(combined)) return "PAKET_C";
  const gradeMatch = combined.match(/\b(?:kelas|kls|tingkat)?\s*(1[0-2]|[1-9])\b/);
  if (gradeMatch) {
    const grade = Number(gradeMatch[1]);
    if (grade >= 1 && grade <= 6) return "PAKET_A";
    if (grade >= 7 && grade <= 9) return "PAKET_B";
    if (grade >= 10 && grade <= 12) return "PAKET_C";
  }
  return "UNKNOWN";
}

export function detectDefaultPaketCTrack(kelasName: string): PaketCTrack {
  const lower = kelasName.toLowerCase();
  if (/\bipa\b|\bmipa\b/.test(lower)) return "IPA";
  if (/\bips\b|\bsosial\b/.test(lower)) return "IPS";
  try {
    const saved = window.localStorage.getItem("siput_paket_c_track");
    if (saved === "IPA" || saved === "IPS") return saved;
  } catch {
    // ignore storage errors
  }
  return "IPS";
}

export function savePaketCTrackPreference(track: PaketCTrack): void {
  try {
    window.localStorage.setItem("siput_paket_c_track", track);
  } catch {
    // ignore storage errors
  }
}

export function isSubjectAllowedForProgram(
  mapelNama: string,
  program: KesetaraanProgram,
  paketCTrack: PaketCTrack,
): boolean {
  const name = mapelNama.trim();
  if (!name) return false;

  if (program === "PAKET_A") {
    if (IPA_SPECIALIST_REGEX.test(name) || IPS_SPECIALIST_REGEX.test(name)) return false;
    return true;
  }

  if (program === "PAKET_B") {
    if (IPA_SPECIALIST_REGEX.test(name) || IPS_SPECIALIST_REGEX.test(name)) return false;
    if (PAKET_A_ONLY_REGEX.test(name)) return false;
    return true;
  }

  if (program === "PAKET_C") {
    if (PAKET_A_ONLY_REGEX.test(name)) return false;
    if (paketCTrack === "IPA") {
      // Hide IPS-only subjects when Paket C is IPA
      if (IPS_SPECIALIST_REGEX.test(name)) return false;
      if (PAKET_B_TERPADU_IPS_REGEX.test(name) && !/sejarah/i.test(name)) return false;
      return true;
    }
    // paketCTrack === "IPS": Hide IPA-only subjects when Paket C is IPS
    if (IPA_SPECIALIST_REGEX.test(name)) return false;
    if (PAKET_B_TERPADU_IPA_REGEX.test(name)) return false;
    return true;
  }

  return true;
}

export function filterItemsByKesetaraanTrack<T>(
  items: T[],
  getMapelNama: (item: T) => string,
  kelasName: string,
  paketCTrack: PaketCTrack,
  jenjang?: string | null,
): T[] {
  const program = detectKesetaraanProgram(kelasName, jenjang);
  if (program === "UNKNOWN") return items;
  const filtered = items.filter((item) => isSubjectAllowedForProgram(getMapelNama(item), program, paketCTrack));
  // Safety fallback: if filtering somehow empties everything (custom mapel names), return original list
  return filtered.length > 0 ? filtered : items;
}

export function predikatFromScore(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "-";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  return "D";
}
