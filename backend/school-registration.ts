export type Registration = {
  namaSekolah: string;
  npsn: string;
  wilayah: string | null;
  namaKontak: string;
  emailKontak: string;
  teleponKontak: string;
  paket?: string;
};

const planMap: Record<string, string> = {
  standar: "Standar",
  "paket standar": "Standar",
  pro: "Pro",
  "paket pro": "Pro",
  tahunan: "Tahunan",
  "paket tahunan": "Tahunan",
  enterprise: "Tahunan",
  "paket enterprise": "Tahunan",
};

export function parseRegistrationPlan(input: unknown): string | undefined | null {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "string") return null;
  const normalized = input.trim().toLowerCase();
  if (!normalized) return undefined;
  return planMap[normalized] ?? null;
}

export function parseRegistration(input: unknown): Registration | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const { namaSekolah, npsn, wilayah, namaKontak, emailKontak, teleponKontak, paket } = record;
  if (typeof namaSekolah !== "string" || typeof npsn !== "string" || typeof namaKontak !== "string" || typeof emailKontak !== "string" || typeof teleponKontak !== "string" || (wilayah !== undefined && wilayah !== null && typeof wilayah !== "string")) return null;
  const plan = parseRegistrationPlan(paket);
  if (plan === null) return null;
  const nama = namaSekolah.trim();
  const kontak = namaKontak.trim();
  const email = emailKontak.trim().toLowerCase();
  const telepon = teleponKontak.trim();
  const nomor = npsn.trim().toUpperCase();
  const region = typeof wilayah === "string" ? wilayah.trim() : "";
  if (nama.length < 2 || nama.length > 200 || kontak.length < 2 || kontak.length > 120 || region.length > 200 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+0-9 ()-]{6,30}$/.test(telepon) || !/^(?:\d{8}|[PK]\d{7})$/.test(nomor)) return null;
  return {
    namaSekolah: nama,
    npsn: nomor,
    wilayah: region || null,
    namaKontak: kontak,
    emailKontak: email,
    teleponKontak: telepon,
    ...(plan ? { paket: plan } : {}),
  };
}
