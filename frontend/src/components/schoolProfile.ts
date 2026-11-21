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

const OPTIONAL_PROFILE_KEYS: Array<Exclude<keyof SchoolProfile, "nama">> = [
  "npsn",
  "namaYayasan",
  "skIzinOperasional",
  "alamatLengkap",
  "kabupatenKota",
  "provinsi",
  "teleponWa",
  "emailSekolah",
  "websiteSekolah",
  "logoUrl",
  "namaKetuaPkbm",
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function unwrapSchoolPayload(value: unknown): Record<string, unknown> | null {
  if (!isPlainRecord(value)) return null;
  const hasDirectIdentity =
    typeof value.nama === "string" ||
    typeof value.name === "string" ||
    typeof value.sekolah === "string" ||
    (typeof value.id === "string" && typeof value.slug === "string");
  if (hasDirectIdentity) {
    return value;
  }
  if (isPlainRecord(value.school)) {
    return unwrapSchoolPayload(value.school) ?? value.school;
  }
  if (isPlainRecord(value.sekolah)) {
    return unwrapSchoolPayload(value.sekolah) ?? value.sekolah;
  }
  if (isPlainRecord(value.data)) {
    return unwrapSchoolPayload(value.data) ?? value.data;
  }
  return value;
}

export function parseSchoolProfile(value: unknown): SchoolProfile | null {
  const record = unwrapSchoolPayload(value);
  if (!record) return null;
  const rawName =
    typeof record.nama === "string"
      ? record.nama
      : typeof record.name === "string"
        ? record.name
        : "";
  const nama = rawName.trim();
  if (!nama) return null;

  const profile: SchoolProfile = {
    nama,
    npsn: null,
    namaYayasan: null,
    skIzinOperasional: null,
    alamatLengkap: null,
    kabupatenKota: null,
    provinsi: null,
    teleponWa: null,
    emailSekolah: null,
    websiteSekolah: null,
    logoUrl: null,
    namaKetuaPkbm: null,
  };

  for (const key of OPTIONAL_PROFILE_KEYS) {
    const val = record[key];
    if (typeof val === "string") {
      profile[key] = val;
    } else if (val === null || val === undefined) {
      profile[key] = null;
    } else {
      return null;
    }
  }

  return profile;
}

export function isSchoolProfile(value: unknown): value is SchoolProfile {
  return parseSchoolProfile(value) !== null;
}
