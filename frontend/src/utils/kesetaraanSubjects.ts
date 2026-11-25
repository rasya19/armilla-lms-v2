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

export type TranscriptSubjectGroup<T> = {
  key: "UMUM" | "PEMINATAN" | "KHUSUS";
  title: string;
  items: T[];
};

const KELOMPOK_KHUSUS_REGEX =
  /\b(pemberdayaan|keterampilan|prakarya|kewirausahaan|vokasi|tata boga|tata busana|komputer|tik|teknologi informasi|informatika|p5|projek|proyek|kerajinan|pertanian|budidaya|fungsional|terstruktur|tersertifikasi)\b/i;

const IPA_PEMINATAN_GROUP_REGEX =
  /\b(fisika|kimia|biologi|matematika\s*(?:tingkat\s*)?(?:lanjut|peminatan)|ipa\s*peminatan)\b/i;

const IPS_PEMINATAN_GROUP_REGEX =
  /\b(geografi|sosiologi|ekonomi|antropologi|ips\s*peminatan|sejarah\s*peminatan)\b/i;

function getSubjectOrderWeight(name: string, group: "UMUM" | "PEMINATAN" | "KHUSUS"): number {
  const n = name.toLowerCase();
  if (group === "UMUM") {
    if (/agama/.test(n)) return 1;
    if (/pancasila|kewarganegaraan|ppkn/.test(n)) return 2;
    if (/bahasa indonesia|b\.?\s*indonesia/.test(n)) return 3;
    if (/matematika/.test(n)) return 4;
    if (/sejarah/.test(n)) return 5;
    if (/bahasa inggris|b\.?\s*inggris/.test(n)) return 6;
    if (/ipas|ilmu pengetahuan alam dan sosial/.test(n)) return 7;
    if (/^ipa\b|ilmu pengetahuan alam/.test(n)) return 8;
    if (/^ips\b|ilmu pengetahuan sosial/.test(n)) return 9;
    if (/seni|budaya/.test(n)) return 10;
    if (/jasmani|pjok|olahraga/.test(n)) return 11;
    return 50;
  }
  if (group === "PEMINATAN") {
    // IPS order: Geografi, Sejarah, Sosiologi, Ekonomi
    if (/geografi/.test(n)) return 1;
    if (/sejarah/.test(n)) return 2;
    if (/sosiologi/.test(n)) return 3;
    if (/ekonomi/.test(n)) return 4;
    // IPA order: Matematika Peminatan, Biologi, Fisika, Kimia
    if (/matematika/.test(n)) return 1;
    if (/biologi/.test(n)) return 2;
    if (/fisika/.test(n)) return 3;
    if (/kimia/.test(n)) return 4;
    return 50;
  }
  // KHUSUS order: Pemberdayaan, Keterampilan Wajib, Keterampilan Pilihan, lainnya
  if (/pemberdayaan/.test(n)) return 1;
  if (/keterampilan\s*wajib/.test(n)) return 2;
  if (/keterampilan\s*pilihan/.test(n)) return 3;
  if (/keterampilan/.test(n)) return 4;
  if (/prakarya|kewirausahaan/.test(n)) return 5;
  return 50;
}

export function groupTranscriptSubjects<T>(
  items: T[],
  getMapelNama: (item: T) => string,
  kelasName: string,
  paketCTrack: PaketCTrack,
  jenjang?: string | null,
): TranscriptSubjectGroup<T>[] {
  const program = detectKesetaraanProgram(kelasName, jenjang);
  const umum: T[] = [];
  const peminatan: T[] = [];
  const khusus: T[] = [];

  for (const item of items) {
    const name = getMapelNama(item).trim();
    if (KELOMPOK_KHUSUS_REGEX.test(name)) {
      khusus.push(item);
      continue;
    }

    if (program === "PAKET_C") {
      if (paketCTrack === "IPA" && IPA_PEMINATAN_GROUP_REGEX.test(name)) {
        peminatan.push(item);
        continue;
      }
      if (paketCTrack === "IPS") {
        const isSejarahPeminatan =
          /\bsejarah\b/i.test(name) && !/\bsejarah\s+indonesia\b/i.test(name);
        if (IPS_PEMINATAN_GROUP_REGEX.test(name) || isSejarahPeminatan) {
          peminatan.push(item);
          continue;
        }
      }
    }

    umum.push(item);
  }

  umum.sort((a, b) => {
    const diff = getSubjectOrderWeight(getMapelNama(a), "UMUM") - getSubjectOrderWeight(getMapelNama(b), "UMUM");
    return diff !== 0 ? diff : getMapelNama(a).localeCompare(getMapelNama(b), "id");
  });
  peminatan.sort((a, b) => {
    const diff = getSubjectOrderWeight(getMapelNama(a), "PEMINATAN") - getSubjectOrderWeight(getMapelNama(b), "PEMINATAN");
    return diff !== 0 ? diff : getMapelNama(a).localeCompare(getMapelNama(b), "id");
  });
  khusus.sort((a, b) => {
    const diff = getSubjectOrderWeight(getMapelNama(a), "KHUSUS") - getSubjectOrderWeight(getMapelNama(b), "KHUSUS");
    return diff !== 0 ? diff : getMapelNama(a).localeCompare(getMapelNama(b), "id");
  });

  const groups: TranscriptSubjectGroup<T>[] = [
    { key: "UMUM", title: "Kelompok Umum", items: umum },
  ];

  if (program === "PAKET_C") {
    groups.push({
      key: "PEMINATAN",
      title:
        paketCTrack === "IPA"
          ? "Peminatan Matematika dan Ilmu Pengetahuan Alam"
          : "Peminatan Ilmu-Ilmu Sosial",
      items: peminatan,
    });
  }

  if (khusus.length > 0 || program === "PAKET_C" || program === "PAKET_B" || program === "PAKET_A") {
    groups.push({
      key: "KHUSUS",
      title: "Kelompok Khusus",
      items: khusus,
    });
  }

  return groups.filter((g) => g.items.length > 0);
}
