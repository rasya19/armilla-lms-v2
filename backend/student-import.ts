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

const optionalFields = ["email", "telepon", "nik", "tempatLahir", "tanggalLahir", "jenisKelamin", "jenjang", "tanggalMasuk", "jalurPendaftaran", "namaAyah", "teleponAyah", "pekerjaanAyah", "namaIbu", "teleponIbu", "pekerjaanIbu", "namaWali", "teleponWali", "pekerjaanWali", "alamatLengkap"] as const;

function parseDate(value: string): Date | null {
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
    const tanggalLahir = optional.tanggalLahir ? parseDate(optional.tanggalLahir) : null;
    const tanggalMasuk = optional.tanggalMasuk ? parseDate(optional.tanggalMasuk) : null;
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
    rows.push({ nisn, nama, ...(email ? { email: email.toLowerCase() } : {}), ...(telepon ? { telepon } : {}),
      ...(optional.nik ? { nik: optional.nik } : {}), ...(optional.tempatLahir ? { tempatLahir: optional.tempatLahir } : {}),
      ...(tanggalLahir ? { tanggalLahir } : {}), ...(optional.jenisKelamin ? { jenisKelamin: optional.jenisKelamin } : {}),
      ...(optional.jenjang ? { jenjang: optional.jenjang } : {}), ...(tanggalMasuk ? { tanggalMasuk } : {}),
      ...(optional.jalurPendaftaran ? { jalurPendaftaran: optional.jalurPendaftaran } : {}), ...(optional.namaAyah ? { namaAyah: optional.namaAyah } : {}),
      ...(optional.teleponAyah ? { teleponAyah: optional.teleponAyah } : {}), ...(optional.pekerjaanAyah ? { pekerjaanAyah: optional.pekerjaanAyah } : {}),
      ...(optional.namaIbu ? { namaIbu: optional.namaIbu } : {}), ...(optional.teleponIbu ? { teleponIbu: optional.teleponIbu } : {}),
      ...(optional.pekerjaanIbu ? { pekerjaanIbu: optional.pekerjaanIbu } : {}), ...(optional.namaWali ? { namaWali: optional.namaWali } : {}),
      ...(optional.teleponWali ? { teleponWali: optional.teleponWali } : {}), ...(optional.pekerjaanWali ? { pekerjaanWali: optional.pekerjaanWali } : {}),
      ...(optional.alamatLengkap ? { alamatLengkap: optional.alamatLengkap } : {}) });
  }
  return { rows };
}
