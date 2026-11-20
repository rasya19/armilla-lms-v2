export type SchoolProfile = {
  nama: string;
  npsn: string | null;
  namaYayasan: string | null;
  skIzinOperasional: string | null;
  alamatLengkap: string | null;
  kabupatenKota: string | null;
  provinsi: string | null;
  teleponWa: string | null;
  emailSekolah: string | null;
  websiteSekolah: string | null;
  logoUrl: string | null;
  namaKetuaPkbm: string | null;
};

export function isSchoolProfile(value: unknown): value is SchoolProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.nama === "string" && ["npsn", "namaYayasan", "skIzinOperasional", "alamatLengkap", "kabupatenKota", "provinsi", "teleponWa", "emailSekolah", "websiteSekolah", "logoUrl", "namaKetuaPkbm"].every((key) => record[key] === null || typeof record[key] === "string");
}
