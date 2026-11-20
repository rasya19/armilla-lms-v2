import { Buffer } from "node:buffer";

const profileLimits = {
  namaYayasan: 200, skIzinOperasional: 200, alamatLengkap: 500, kabupatenKota: 200,
  provinsi: 200, teleponWa: 30, emailSekolah: 254, websiteSekolah: 500, namaKetuaPkbm: 200,
} as const;

export const publicProfileSelect = {
  nama: true, npsn: true, namaYayasan: true, skIzinOperasional: true, alamatLengkap: true,
  kabupatenKota: true, provinsi: true, teleponWa: true, emailSekolah: true,
  websiteSekolah: true, logoUrl: true, namaKetuaPkbm: true,
} as const;

export function parseProfile(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (typeof data.nama !== "string" || data.nama.trim().length < 2 || data.nama.trim().length > 200) return null;
  const result = {} as Record<keyof typeof profileLimits, string | null>;
  for (const key of Object.keys(profileLimits) as (keyof typeof profileLimits)[]) {
    const value = data[key];
    if (value !== null && typeof value !== "string") return null;
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed.length > profileLimits[key]) return null;
    result[key] = trimmed || null;
  }
  const npsn = typeof data.npsn === "string" ? data.npsn.trim().toUpperCase() : data.npsn;
  if (npsn !== null && (typeof npsn !== "string" || (npsn !== "" && !/^(?:\d{8}|[PK]\d{7})$/.test(npsn)))) return null;
  if (result.teleponWa && !/^[+0-9 ()-]{6,30}$/.test(result.teleponWa)) return null;
  if (result.emailSekolah && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.emailSekolah)) return null;
  if (result.websiteSekolah) {
    try { const url = new URL(result.websiteSekolah); if (url.protocol !== "https:" || url.username || url.password) return null; }
    catch { return null; }
  }
  const logo = data.logoUrl;
  if (logo !== null && typeof logo !== "string") return null;
  if (typeof logo === "string" && logo) {
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(logo);
    if (!match || match[2].length > 273068) return null;
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 204800 || bytes.toString("base64") !== match[2]) return null;
    if (match[1] === "png" && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
    if (match[1] === "jpeg" && !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) return null;
  }
  return { nama: data.nama.trim(), npsn: npsn || null, ...result, logoUrl: logo || null };
}

export function parsePublicApplicant(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  const keys = ["nama", "nik", "nisn", "tempatLahir", "tanggalLahir", "jenisKelamin", "jenjang", "telepon", "asalSekolah"] as const;
  if (keys.some((key) => typeof data[key] !== "string")) return null;
  const fields = Object.fromEntries(keys.map((key) => [key, (data[key] as string).trim()])) as Record<typeof keys[number], string>;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(fields.tanggalLahir) ? new Date(`${fields.tanggalLahir}T00:00:00.000Z`) : null;
  if (fields.nama.length < 2 || fields.nama.length > 200 || (!fields.nik && !fields.nisn) ||
      (fields.nik && !/^\d{16}$/.test(fields.nik)) || (fields.nisn && !/^\d{10}$/.test(fields.nisn)) ||
      fields.tempatLahir.length < 2 || fields.tempatLahir.length > 200 || !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== fields.tanggalLahir || date > new Date() ||
      !["L", "P"].includes(fields.jenisKelamin) || !["Paket A", "Paket B", "Paket C"].includes(fields.jenjang) ||
      !/^[+0-9 ()-]{6,30}$/.test(fields.telepon) || fields.asalSekolah.length < 2 || fields.asalSekolah.length > 200) return null;
  return { ...fields, nik: fields.nik || null, nisn: fields.nisn || null, tanggalLahir: date };
}
