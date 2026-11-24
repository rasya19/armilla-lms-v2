import { isValidPasswordLength } from "./password.js";
import { parseRegistrationPlan, type RegistrationPlan } from "./school-registration.js";

export const TRIAL_DURATION_DAYS = 14;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const RESERVED_TRIAL_SLUGS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "master",
  "dinas",
  "lms",
  "login",
  "daftar",
  "register",
  "ppdb",
  "ujian",
  "assets",
  "public",
  "sandbox",
  "pkbm",
  "siput",
  "coba-gratis",
  "trial",
  "mail",
  "cdn",
  "static",
]);

export function calculateTrialEndDate(startDate = new Date(), days = TRIAL_DURATION_DAYS): Date {
  return new Date(startDate.getTime() + days * DAY_MS);
}

export function isTrialExpired(expiresAt: Date | null | undefined, now = new Date()): boolean {
  return expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime()) && expiresAt <= now;
}

export function formatIndonesianDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export type ParsedTrialSignup = {
  namaSekolah: string;
  slug: string;
  npsn: string | null;
  wilayah: string | null;
  namaKontak: string;
  emailKontak: string;
  teleponKontak: string;
  password: string;
  planSlug: "basic" | "reguler" | "pro";
  paketLabel: RegistrationPlan;
};

export function normalizeSlugCandidate(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function parseTrialSignup(
  input: unknown,
): { ok: true; data: ParsedTrialSignup } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Payload pendaftaran uji coba tidak valid." };
  }
  const body = input as Record<string, unknown>;
  const namaSekolah = typeof body.namaSekolah === "string" ? body.namaSekolah.trim() : "";
  const rawSlug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const rawNpsn = typeof body.npsn === "string" ? body.npsn.trim().toUpperCase() : "";
  const wilayah = typeof body.wilayah === "string" ? body.wilayah.trim() : "";
  const namaKontak = typeof body.namaKontak === "string" ? body.namaKontak.trim() : "";
  const emailKontak = typeof body.emailKontak === "string" ? body.emailKontak.trim().toLowerCase() : "";
  const teleponKontak = typeof body.teleponKontak === "string" ? body.teleponKontak.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (namaSekolah.length < 3 || namaSekolah.length > 200) {
    return { ok: false, error: "Nama sekolah / PKBM wajib diisi (3–200 karakter)." };
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/.test(rawSlug) || RESERVED_TRIAL_SLUGS.has(rawSlug)) {
    return {
      ok: false,
      error: "Subdomain portal harus 3–48 karakter huruf kecil, angka, atau tanda hubung, dan bukan kata tercadang sistem.",
    };
  }
  if (rawNpsn && !/^(?:\d{8}|[PK]\d{7})$/.test(rawNpsn)) {
    return { ok: false, error: "Format NPSN tidak valid (8 digit atau huruf P/K diikuti 7 digit)." };
  }
  if (wilayah.length > 200) {
    return { ok: false, error: "Nama wilayah maksimal 200 karakter." };
  }
  if (namaKontak.length < 2 || namaKontak.length > 120) {
    return { ok: false, error: "Nama penanggung jawab / admin wajib diisi (2–120 karakter)." };
  }
  if (!emailKontak || emailKontak.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailKontak)) {
    return { ok: false, error: "Masukkan alamat email admin sekolah yang valid." };
  }
  if (!/^[+0-9 ()-]{6,30}$/.test(teleponKontak)) {
    return { ok: false, error: "Nomor telepon / WhatsApp wajib diisi dengan benar (6–30 digit)." };
  }
  if (!isValidPasswordLength(password)) {
    return { ok: false, error: "Kata sandi login admin wajib 6–1024 karakter." };
  }

  const parsedPlan = parseRegistrationPlan(body.paket ?? body.plan ?? "Pro");
  if (parsedPlan === null) {
    return { ok: false, error: "Pilihan paket uji coba tidak valid." };
  }
  const resolvedLabel = parsedPlan?.plan ?? "Pro";
  const lower = resolvedLabel.toLowerCase();
  const planSlug: "basic" | "reguler" | "pro" =
    lower === "basic" ? "basic" : lower === "reguler" ? "reguler" : "pro";

  return {
    ok: true,
    data: {
      namaSekolah,
      slug: rawSlug,
      npsn: rawNpsn || null,
      wilayah: wilayah || null,
      namaKontak,
      emailKontak,
      teleponKontak,
      password,
      planSlug,
      paketLabel: resolvedLabel,
    },
  };
}
