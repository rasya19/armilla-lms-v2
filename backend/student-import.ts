export type StudentImportRow = {
  nisn: string;
  nama: string;
  email?: string;
  telepon?: string;
};

export function parseStudentImport(input: unknown): { rows: StudentImportRow[] } | { error: string } {
  if (!Array.isArray(input) || input.length < 1 || input.length > 500) return { error: "Impor harus berisi 1 sampai 500 siswa." };
  const rows: StudentImportRow[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of input.entries()) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { error: `Baris ${index + 1} tidak valid.` };
    const item = raw as Record<string, unknown>;
    if (typeof item.nisn !== "string" || typeof item.nama !== "string" ||
      (item.email !== undefined && typeof item.email !== "string") ||
      (item.telepon !== undefined && typeof item.telepon !== "string")) return { error: `Data baris ${index + 1} tidak valid.` };
    const nisn = item.nisn.trim();
    const nama = item.nama.trim();
    const email = typeof item.email === "string" ? item.email.trim() : "";
    const telepon = typeof item.telepon === "string" ? item.telepon.trim() : "";
    if (!/^\d{10}$/.test(nisn) || nama.length < 2 || nama.length > 200 ||
      (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
      (telepon && !/^[+0-9 ()-]{6,30}$/.test(telepon))) return { error: `Baris ${index + 1}: periksa NISN (10 angka), nama, email, dan telepon.` };
    if (seen.has(nisn)) return { error: `Baris ${index + 1}: NISN muncul lebih dari sekali dalam file.` };
    seen.add(nisn);
    rows.push({ nisn, nama, ...(email ? { email: email.toLowerCase() } : {}), ...(telepon ? { telepon } : {}) });
  }
  return { rows };
}
