type Registration = {
  namaSekolah: string;
  npsn: string | null;
  namaKontak: string;
  emailKontak: string;
  teleponKontak: string;
};

export function parseRegistration(input: unknown): Registration | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const { namaSekolah, npsn, namaKontak, emailKontak, teleponKontak } = record;
  if (typeof namaSekolah !== "string" || typeof namaKontak !== "string" || typeof emailKontak !== "string" || typeof teleponKontak !== "string" || (npsn !== undefined && npsn !== null && typeof npsn !== "string")) return null;
  const nama = namaSekolah.trim();
  const kontak = namaKontak.trim();
  const email = emailKontak.trim().toLowerCase();
  const telepon = teleponKontak.trim();
  const nomor = typeof npsn === "string" ? npsn.trim().toUpperCase() : "";
  if (nama.length < 2 || nama.length > 200 || kontak.length < 2 || kontak.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+0-9 ()-]{6,30}$/.test(telepon) || (nomor && !/^(?:\d{8}|[PK]\d{7})$/.test(nomor))) return null;
  return { namaSekolah: nama, npsn: nomor || null, namaKontak: kontak, emailKontak: email, teleponKontak: telepon };
}
