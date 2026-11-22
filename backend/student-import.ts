export type StudentImportRow = {
  nisn: string;
  nama: string;
  email?: string;
  telepon?: string;
  nik?: string;
  tempatLahir?: string;
  tanggalLahir?: Date;
  jenisKelamin?: string;
  jenjang?: string;
  tanggalMasuk?: Date;
  jalurPendaftaran?: string;
  namaAyah?: string;
  teleponAyah?: string;
  pekerjaanAyah?: string;
  namaIbu?: string;
  teleponIbu?: string;
  pekerjaanIbu?: string;
  namaWali?: string;
  teleponWali?: string;
  pekerjaanWali?: string;
  alamatLengkap?: string;
};

export type DapodikStudentImportRow = Omit<StudentImportRow, "nisn"> & {
  nisn?: string;
  nipd?: string;
  username?: string;
  rombel?: string;
};

const PLACEHOLDER_REGEX = /^(?:-|–|—|--+|0|null|undefined|n\/a|na)$/i;

const FOOTER_OR_NOTE_REGEX =
  /^(?:catatan|keterangan|ket\.?|nb\s*:|dicetak|diunduh|tanggal\s+(?:unduh|cetak)|sumber\s*(?:data)?|total\b|jumlah\s+(?:siswa|peserta|keseluruhan|rombel)|mengetahui|kepala\s+sekolah|operator\s+dapodik|\*+)/i;

const REPEATED_HEADER_NAMES = new Set([
  "nama",
  "nama siswa",
  "nama peserta didik",
  "nama lengkap",
  "peserta didik",
]);

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

export function cleanImportText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string"
    ? value
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
  const trimmed = raw.replace(/^'+/, "").replace(/\s+/g, " ").trim();
  if (!trimmed || PLACEHOLDER_REGEX.test(trimmed)) return "";
  return trimmed;
}

export function isFooterOrEmptyName(nama: string): boolean {
  if (!nama) return true;
  const normalized = nama.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized || REPEATED_HEADER_NAMES.has(normalized)) return true;
  if (FOOTER_OR_NOTE_REGEX.test(nama)) return true;
  if (!/\p{L}/u.test(nama)) return true;
  return false;
}

function buildValidUtcDate(year: number, month: number, day: number): Date | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return date;
}

export function parseFlexibleDate(value: string): Date | null {
  const cleaned = cleanImportText(value);
  if (!cleaned) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    return buildValidUtcDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    // Prefer DD/MM/YYYY (Indonesian Dapodik standard); fallback to MM/DD/YYYY if second > 12
    if (second <= 12) return buildValidUtcDate(year, second, first);
    if (first <= 12) return buildValidUtcDate(year, first, second);
    return null;
  }

  // DD/MM/YY (2-digit year)
  const dmyShort = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (dmyShort) {
    const first = Number(dmyShort[1]);
    const second = Number(dmyShort[2]);
    const yy = Number(dmyShort[3]);
    const year = yy >= 40 ? 1900 + yy : 2000 + yy;
    if (second <= 12) return buildValidUtcDate(year, second, first);
    if (first <= 12) return buildValidUtcDate(year, first, second);
    return null;
  }

  // D MMMM YYYY (e.g., 14 Mei 2008)
  const textMatch = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
  if (textMatch) {
    const month = MONTHS[textMatch[2].toLowerCase()];
    if (month) return buildValidUtcDate(Number(textMatch[3]), month, Number(textMatch[1]));
  }

  // Excel serial date (e.g., 39582)
  if (/^\d{4,5}(?:\.\d+)?$/.test(cleaned)) {
    const serial = Math.floor(Number(cleaned));
    if (serial >= 1000 && serial <= 80000) {
      const epochMs = Date.UTC(1899, 11, 30) + serial * 86400000;
      const date = new Date(epochMs);
      if (!Number.isNaN(date.getTime())) {
        return buildValidUtcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      }
    }
  }

  return null;
}

export function normalizeGender(value: string): "L" | "P" | undefined {
  const cleaned = cleanImportText(value).toLowerCase();
  if (!cleaned) return undefined;
  if (cleaned === "l" || cleaned === "lk" || cleaned === "m" || cleaned.startsWith("laki") || cleaned === "pria" || cleaned === "male") {
    return "L";
  }
  if (cleaned === "p" || cleaned === "pr" || cleaned === "f" || cleaned.startsWith("perempuan") || cleaned === "wanita" || cleaned === "female") {
    return "P";
  }
  return undefined;
}

export function formatPasswordFromBirthDate(date?: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "123456";
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
  return `${dd}${mm}${yyyy}`;
}

export function normalizeClassKey(value: string): string {
  return cleanImportText(value).toLowerCase();
}

export function slugifyShortName(nama: string): string {
  const words = nama
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const base = (words[0] || "siswa").slice(0, 12);
  const second = words[1] ? words[1].slice(0, 4) : "";
  return `${base}${second}`.slice(0, 14) || "siswa";
}

function cleanIdentifier(value: unknown, maxLen: number): string | undefined {
  const cleaned = cleanImportText(value).replace(/\s+/g, "");
  if (!cleaned || /^0+$/.test(cleaned)) return undefined;
  const trimmed = cleaned.slice(0, maxLen);
  return /^\d+$/.test(trimmed) ? trimmed : trimmed.toLowerCase();
}

function cleanPhone(value: unknown): string | undefined {
  const cleaned = cleanImportText(value);
  if (!cleaned) return undefined;
  const compact = cleaned.replace(/[^+0-9 ()-]/g, "").trim();
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 20 || /^0+$/.test(digits)) return undefined;
  return compact.slice(0, 30);
}

function cleanEmail(value: unknown): string | undefined {
  const cleaned = cleanImportText(value).toLowerCase();
  if (!cleaned || cleaned.length > 254) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return undefined;
  return cleaned;
}

function cleanUsername(value: unknown): string | undefined {
  const cleaned = cleanImportText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  if (!cleaned || cleaned.length < 2) return undefined;
  return cleaned.slice(0, 40);
}

function cleanNik(value: unknown): string | undefined {
  const cleaned = cleanImportText(value).replace(/[\s-]+/g, "");
  if (!cleaned || /^0+$/.test(cleaned)) return undefined;
  if (!/^\d{6,20}$/.test(cleaned)) return undefined;
  return cleaned;
}

function cleanShortText(value: unknown, maxLen = 200): string | undefined {
  const cleaned = cleanImportText(value);
  return cleaned ? cleaned.slice(0, maxLen) : undefined;
}

function mergeRows(base: DapodikStudentImportRow, incoming: DapodikStudentImportRow): DapodikStudentImportRow {
  return {
    nama: incoming.nama || base.nama,
    nisn: incoming.nisn ?? base.nisn,
    nipd: incoming.nipd ?? base.nipd,
    username: incoming.username ?? base.username,
    rombel: incoming.rombel ?? base.rombel,
    email: incoming.email ?? base.email,
    telepon: incoming.telepon ?? base.telepon,
    nik: incoming.nik ?? base.nik,
    tempatLahir: incoming.tempatLahir ?? base.tempatLahir,
    tanggalLahir: incoming.tanggalLahir ?? base.tanggalLahir,
    jenisKelamin: incoming.jenisKelamin ?? base.jenisKelamin,
    jenjang: incoming.jenjang ?? base.jenjang,
    tanggalMasuk: incoming.tanggalMasuk ?? base.tanggalMasuk,
    jalurPendaftaran: incoming.jalurPendaftaran ?? base.jalurPendaftaran,
    namaAyah: incoming.namaAyah ?? base.namaAyah,
    teleponAyah: incoming.teleponAyah ?? base.teleponAyah,
    pekerjaanAyah: incoming.pekerjaanAyah ?? base.pekerjaanAyah,
    namaIbu: incoming.namaIbu ?? base.namaIbu,
    teleponIbu: incoming.teleponIbu ?? base.teleponIbu,
    pekerjaanIbu: incoming.pekerjaanIbu ?? base.pekerjaanIbu,
    namaWali: incoming.namaWali ?? base.namaWali,
    teleponWali: incoming.teleponWali ?? base.teleponWali,
    pekerjaanWali: incoming.pekerjaanWali ?? base.pekerjaanWali,
    alamatLengkap: incoming.alamatLengkap ?? base.alamatLengkap,
  };
}

export function parseDapodikStudentImport(
  input: unknown,
): { rows: DapodikStudentImportRow[]; skippedEmpty: number } | { error: string } {
  if (!Array.isArray(input) || input.length < 1) {
    return { error: "Impor harus berisi minimal 1 baris siswa." };
  }
  if (input.length > 1000) {
    return { error: "Maksimal 1000 baris mentah per unggahan (maks. 500 siswa aktif)." };
  }

  const rows: DapodikStudentImportRow[] = [];
  const keyIndex = new Map<string, number>();
  let skippedEmpty = 0;

  for (const raw of input) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      skippedEmpty++;
      continue;
    }
    const item = raw as Record<string, unknown>;
    const nama = cleanImportText(item.nama).slice(0, 200);
    if (isFooterOrEmptyName(nama)) {
      skippedEmpty++;
      continue;
    }

    const nisn = cleanIdentifier(item.nisn, 24);
    const nipd = cleanIdentifier(item.nipd, 32);
    const username = cleanUsername(item.username);
    const rombel = cleanShortText(item.rombel ?? item.kelas, 100);
    const email = cleanEmail(item.email);
    const telepon = cleanPhone(item.telepon);
    const nik = cleanNik(item.nik);
    const tempatLahir = cleanShortText(item.tempatLahir, 200);
    const tanggalLahir = parseFlexibleDate(cleanImportText(item.tanggalLahir)) ?? undefined;
    const jenisKelamin = normalizeGender(cleanImportText(item.jenisKelamin));
    const jenjang = cleanShortText(item.jenjang, 200);
    const tanggalMasuk = parseFlexibleDate(cleanImportText(item.tanggalMasuk)) ?? undefined;
    const jalurPendaftaran = cleanShortText(item.jalurPendaftaran, 200);
    const namaAyah = cleanShortText(item.namaAyah, 200);
    const teleponAyah = cleanPhone(item.teleponAyah);
    const pekerjaanAyah = cleanShortText(item.pekerjaanAyah, 200);
    const namaIbu = cleanShortText(item.namaIbu, 200);
    const teleponIbu = cleanPhone(item.teleponIbu);
    const pekerjaanIbu = cleanShortText(item.pekerjaanIbu, 200);
    const namaWali = cleanShortText(item.namaWali, 200);
    const teleponWali = cleanPhone(item.teleponWali);
    const pekerjaanWali = cleanShortText(item.pekerjaanWali, 200);
    const alamatLengkap = cleanShortText(item.alamatLengkap, 500);

    const parsedRow: DapodikStudentImportRow = {
      nama,
      ...(nisn ? { nisn } : {}),
      ...(nipd ? { nipd } : {}),
      ...(username ? { username } : {}),
      ...(rombel ? { rombel } : {}),
      ...(email ? { email } : {}),
      ...(telepon ? { telepon } : {}),
      ...(nik ? { nik } : {}),
      ...(tempatLahir ? { tempatLahir } : {}),
      ...(tanggalLahir ? { tanggalLahir } : {}),
      ...(jenisKelamin ? { jenisKelamin } : {}),
      ...(jenjang ? { jenjang } : {}),
      ...(tanggalMasuk ? { tanggalMasuk } : {}),
      ...(jalurPendaftaran ? { jalurPendaftaran } : {}),
      ...(namaAyah ? { namaAyah } : {}),
      ...(teleponAyah ? { teleponAyah } : {}),
      ...(pekerjaanAyah ? { pekerjaanAyah } : {}),
      ...(namaIbu ? { namaIbu } : {}),
      ...(teleponIbu ? { teleponIbu } : {}),
      ...(pekerjaanIbu ? { pekerjaanIbu } : {}),
      ...(namaWali ? { namaWali } : {}),
      ...(teleponWali ? { teleponWali } : {}),
      ...(pekerjaanWali ? { pekerjaanWali } : {}),
      ...(alamatLengkap ? { alamatLengkap } : {}),
    };

    const dedupKeys = [
      ...(nisn ? [`nisn:${nisn}`] : []),
      ...(nipd ? [`nipd:${nipd}`] : []),
    ];
    const existingIdx = dedupKeys.map((k) => keyIndex.get(k)).find((idx) => idx !== undefined);
    if (existingIdx !== undefined) {
      rows[existingIdx] = mergeRows(rows[existingIdx], parsedRow);
      for (const k of dedupKeys) keyIndex.set(k, existingIdx);
      continue;
    }

    const nextIdx = rows.length;
    rows.push(parsedRow);
    for (const k of dedupKeys) keyIndex.set(k, nextIdx);
  }

  if (rows.length === 0) {
    return { error: "Tidak ada baris siswa dengan Nama valid ditemukan di file." };
  }
  if (rows.length > 500) {
    return { error: "Maksimal 500 siswa valid per unggahan. Bagi file menjadi beberapa bagian." };
  }

  return { rows, skippedEmpty };
}

const optionalFields = [
  "email", "telepon", "nik", "tempatLahir", "tanggalLahir", "jenisKelamin",
  "jenjang", "tanggalMasuk", "jalurPendaftaran", "namaAyah", "teleponAyah",
  "pekerjaanAyah", "namaIbu", "teleponIbu", "pekerjaanIbu", "namaWali",
  "teleponWali", "pekerjaanWali", "alamatLengkap",
] as const;

function parseStrictIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function parseStudentImport(input: unknown): { rows: StudentImportRow[] } | { error: string } {
  if (!Array.isArray(input) || input.length < 1 || input.length > 500) return { error: "Impor harus berisi 1 sampai 500 siswa." };
  const rows: StudentImportRow[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of input.entries()) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { error: `Baris ${index + 1} tidak valid.` };
    const item = raw as Record<string, unknown>;
    if (typeof item.nisn !== "string" || typeof item.nama !== "string" ||
      optionalFields.some((field) => item[field] !== undefined && typeof item[field] !== "string")) return { error: `Data baris ${index + 1} tidak valid.` };
    const nisn = item.nisn.trim();
    const nama = item.nama.trim();
    const email = typeof item.email === "string" ? item.email.trim() : "";
    const telepon = typeof item.telepon === "string" ? item.telepon.trim() : "";
    const optional = Object.fromEntries(optionalFields.map((field) => [field, typeof item[field] === "string" ? (item[field] as string).trim() : ""]));
    const tanggalLahir = optional.tanggalLahir ? parseStrictIsoDate(optional.tanggalLahir) : null;
    const tanggalMasuk = optional.tanggalMasuk ? parseStrictIsoDate(optional.tanggalMasuk) : null;
    if (!/^\d{10}$/.test(nisn) || nama.length < 2 || nama.length > 200 ||
      (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
      (telepon && !/^[+0-9 ()-]{6,30}$/.test(telepon)) ||
      (optional.nik && !/^\d{16}$/.test(optional.nik)) ||
      (optional.jenisKelamin && !["L", "P"].includes(optional.jenisKelamin)) ||
      (optional.tanggalLahir && !tanggalLahir) || (optional.tanggalMasuk && !tanggalMasuk) ||
      ["teleponAyah", "teleponIbu", "teleponWali"].some((field) => optional[field] && !/^[+0-9 ()-]{6,30}$/.test(optional[field])) ||
      ["tempatLahir", "jenjang", "jalurPendaftaran", "namaAyah", "namaIbu", "namaWali", "pekerjaanAyah", "pekerjaanIbu", "pekerjaanWali"].some((field) => optional[field].length > 200) ||
      optional.alamatLengkap.length > 500) return { error: `Baris ${index + 1}: periksa identitas, tanggal (YYYY-MM-DD), kontak, dan data siswa.` };
    if (seen.has(nisn)) return { error: `Baris ${index + 1}: NISN muncul lebih dari sekali dalam file.` };
    seen.add(nisn);
    rows.push({
      nisn,
      nama,
      ...(email ? { email: email.toLowerCase() } : {}),
      ...(telepon ? { telepon } : {}),
      ...(optional.nik ? { nik: optional.nik } : {}),
      ...(optional.tempatLahir ? { tempatLahir: optional.tempatLahir } : {}),
      ...(tanggalLahir ? { tanggalLahir } : {}),
      ...(optional.jenisKelamin ? { jenisKelamin: optional.jenisKelamin } : {}),
      ...(optional.jenjang ? { jenjang: optional.jenjang } : {}),
      ...(tanggalMasuk ? { tanggalMasuk } : {}),
      ...(optional.jalurPendaftaran ? { jalurPendaftaran: optional.jalurPendaftaran } : {}),
      ...(optional.namaAyah ? { namaAyah: optional.namaAyah } : {}),
      ...(optional.teleponAyah ? { teleponAyah: optional.teleponAyah } : {}),
      ...(optional.pekerjaanAyah ? { pekerjaanAyah: optional.pekerjaanAyah } : {}),
      ...(optional.namaIbu ? { namaIbu: optional.namaIbu } : {}),
      ...(optional.teleponIbu ? { teleponIbu: optional.teleponIbu } : {}),
      ...(optional.pekerjaanIbu ? { pekerjaanIbu: optional.pekerjaanIbu } : {}),
      ...(optional.namaWali ? { namaWali: optional.namaWali } : {}),
      ...(optional.teleponWali ? { teleponWali: optional.teleponWali } : {}),
      ...(optional.pekerjaanWali ? { pekerjaanWali: optional.pekerjaanWali } : {}),
      ...(optional.alamatLengkap ? { alamatLengkap: optional.alamatLengkap } : {}),
    });
  }
  return { rows };
}
