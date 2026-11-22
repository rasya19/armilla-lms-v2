import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  LogIn,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { KopSurat } from "./KopSurat";
import { RegistrationReceipt, type RegistrationData } from "./RegistrationReceipt";
import { parseSchoolProfile, unwrapSchoolPayload, type SchoolProfile } from "./schoolProfile";
import { canAccessFeature, type PlanTier } from "../utils/planAccess";
import { resolvePlanSlug } from "./subscriptionPlans";
import { normalizeThemeKey, type ThemeKey } from "./TenantThemeProvider";

export const RESERVED_SLUGS = new Set([
  "login",
  "admin",
  "dashboard",
  "ppdb",
  "ujian",
  "api",
  "assets",
  "daftar",
  "register",
  "master",
  "sekolah",
  "lms",
  "www",
]);

type PublicAnnouncementItem = {
  id: string;
  judul: string;
  ringkasan: string;
  tanggal: string | null;
};

type PublicGalleryItem = {
  id: string;
  judul: string;
  keterangan: string;
  imageUrl: string | null;
};

type PublicPortalBranding = {
  primaryColor: string;
  heroTitle: string;
  heroSubtitle: string;
  footerText: string;
  showNews: boolean;
  showGallery: boolean;
  logoUrlOverride: string | null;
  announcements: PublicAnnouncementItem[];
  gallery: PublicGalleryItem[];
};

type PublicProfile = SchoolProfile & {
  themeKey: ThemeKey;
  planTier: PlanTier;
  branding: PublicPortalBranding;
};

const DEFAULT_ACCENT_BY_THEME: Record<ThemeKey, string> = {
  ocean: "#0369a1",
  emerald: "#047857",
  sunset: "#c2410c",
  violet: "#6d28d9",
  dark: "#d97706",
};

const slugValid = (slug: string) =>
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) && !RESERVED_SLUGS.has(slug);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function readBoolean(fallback: boolean, ...candidates: unknown[]): boolean {
  for (const candidate of candidates) {
    if (typeof candidate === "boolean") return candidate;
  }
  return fallback;
}

function normalizeHexColor(value: string | null, fallback: string): string {
  if (value && /^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    return value.trim();
  }
  return fallback;
}

function getReadableOnAccent(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#ffffff";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const linear = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.45 ? "#0f172a" : "#ffffff";
}

function parseAnnouncements(sources: unknown[]): PublicAnnouncementItem[] {
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    const parsed: PublicAnnouncementItem[] = [];
    source.forEach((item, index) => {
      if (!isRecord(item)) return;
      const judul = readString(item.judul, item.title, item.nama);
      if (!judul) return;
      parsed.push({
        id: readString(item.id) ?? `ann-${index}`,
        judul,
        ringkasan: readString(item.isi, item.ringkasan, item.deskripsi, item.content, item.body) ?? "",
        tanggal: readString(item.tanggal, item.createdAt, item.publishedAt, item.date),
      });
    });
    if (parsed.length > 0) return parsed.slice(0, 4);
  }
  return [];
}

function parseGallery(sources: unknown[]): PublicGalleryItem[] {
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    const parsed: PublicGalleryItem[] = [];
    source.forEach((item, index) => {
      if (!isRecord(item)) return;
      const judul = readString(item.judul, item.title, item.caption, item.nama) ?? `Dokumentasi Kegiatan ${index + 1}`;
      const imageUrl = readString(item.imageUrl, item.image_url, item.url, item.fotoUrl, item.foto);
      if (!imageUrl && !readString(item.judul, item.title)) return;
      parsed.push({
        id: readString(item.id) ?? `gal-${index}`,
        judul,
        keterangan: readString(item.keterangan, item.deskripsi, item.subtitle) ?? "Kegiatan pembelajaran PKBM",
        imageUrl,
      });
    });
    if (parsed.length > 0) return parsed.slice(0, 6);
  }
  return [];
}

function parsePublicProfile(data: unknown): PublicProfile | null {
  const root = isRecord(data) ? data : null;
  const record = unwrapSchoolPayload(data);
  if (!record) return null;
  const profile = parseSchoolProfile(record);
  if (!profile) return null;

  const rawPlan =
    typeof record.planTier === "string"
      ? record.planTier
      : typeof record.plan === "string"
        ? record.plan
        : typeof record.rawPlan === "string"
          ? record.rawPlan
          : typeof record.paket === "string"
            ? record.paket
            : null;

  const themeKey = normalizeThemeKey(record.themeKey, "ocean");
  const settingsObj = isRecord(record.settings)
    ? record.settings
    : isRecord(root?.settings)
      ? root.settings
      : isRecord(record.identitas)
        ? record.identitas
        : isRecord(record.pengaturan)
          ? record.pengaturan
          : null;

  const primaryColor = normalizeHexColor(
    readString(
      settingsObj?.primary_color,
      settingsObj?.primaryColor,
      record.primary_color,
      record.primaryColor,
    ),
    DEFAULT_ACCENT_BY_THEME[themeKey],
  );

  const heroTitle =
    readString(
      settingsObj?.hero_title,
      settingsObj?.heroTitle,
      record.hero_title,
      record.heroTitle,
    ) ?? profile.nama;

  const heroSubtitle =
    readString(
      settingsObj?.hero_subtitle,
      settingsObj?.heroSubtitle,
      record.hero_subtitle,
      record.heroSubtitle,
    ) ??
    "Lembaga Pendidikan Kesetaraan resmi penyelenggara Program Paket A, Paket B, dan Paket C dengan sistem pembelajaran fleksibel secara tatap muka, tutorial, dan daring.";

  const footerText =
    readString(
      settingsObj?.footer_text,
      settingsObj?.footerText,
      record.footer_text,
      record.footerText,
    ) ?? `© ${new Date().getFullYear()} ${profile.nama}. Portal Resmi Pendidikan Kesetaraan.`;

  const showNews = readBoolean(
    true,
    settingsObj?.show_news,
    settingsObj?.showNews,
    record.show_news,
    record.showNews,
  );

  const showGallery = readBoolean(
    true,
    settingsObj?.show_gallery,
    settingsObj?.showGallery,
    record.show_gallery,
    record.showGallery,
  );

  const logoUrlOverride = readString(
    settingsObj?.logo_url,
    settingsObj?.logoUrl,
    record.logo_url,
    profile.logoUrl,
  );

  const announcements = parseAnnouncements([
    record.pengumuman,
    record.announcements,
    record.news,
    root?.pengumuman,
    root?.announcements,
    root?.news,
  ]);

  const gallery = parseGallery([
    record.galeri,
    record.gallery,
    record.kegiatan,
    root?.galeri,
    root?.gallery,
  ]);

  return {
    ...profile,
    logoUrl: logoUrlOverride ?? profile.logoUrl,
    themeKey,
    planTier: resolvePlanSlug(rawPlan),
    branding: {
      primaryColor,
      heroTitle,
      heroSubtitle,
      footerText,
      showNews,
      showGallery,
      logoUrlOverride,
      announcements,
      gallery,
    },
  };
}

async function loadProfile(slug: string, signal: AbortSignal): Promise<PublicProfile> {
  if (!slugValid(slug)) throw new Error("Sekolah tidak ditemukan.");
  const response = await fetch(`/api/public/sekolah/${encodeURIComponent(slug)}`, { signal });
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "Sekolah tidak ditemukan atau tidak aktif."
        : "Portal sekolah belum dapat dimuat.",
    );
  }
  const data: unknown = await response.json();
  const parsed = parsePublicProfile(data);
  if (!parsed) throw new Error("Respons profil sekolah tidak valid.");
  return parsed;
}

function whatsapp(phone: string | null, message: string): string | null {
  if (!phone) return null;
  let number = phone.replace(/[^0-9]/g, "");
  if (number.startsWith("0")) number = `62${number.slice(1)}`;
  if (!/^62\d{8,13}$/.test(number)) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function formatDateId(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isInitialPpdbIntent(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  return (
    path === "/ppdb" ||
    path.endsWith("/ppdb") ||
    hash === "#ppdb" ||
    params.get("tab") === "ppdb" ||
    params.get("ppdb") === "1"
  );
}

const EQUALITY_PROGRAMS = [
  {
    code: "01",
    jenjang: "Paket A",
    title: "Paket A",
    equivalent: "Setara SD / MI",
    levelRange: "Kelas 1 – 6",
    description:
      "Membangun fondasi literasi, numerasi, karakter, dan keterampilan dasar secara terstruktur bagi peserta didik usia sekolah maupun dewasa.",
    modes: "Tatap muka terjadwal · Bimbingan tutorial · Modul daring mandiri",
  },
  {
    code: "02",
    jenjang: "Paket B",
    title: "Paket B",
    equivalent: "Setara SMP / MTs",
    levelRange: "Kelas 7 – 9",
    description:
      "Memperkuat kompetensi akademik menengah pertama dan kecakapan hidup melalui pendampingan tutor serta latihan ujian berbasis digital.",
    modes: "Tatap muka fleksibel · Diskusi tutorial · Evaluasi & CBT daring",
  },
  {
    code: "03",
    jenjang: "Paket C",
    title: "Paket C",
    equivalent: "Setara SMA / MA",
    levelRange: "Kelas 10 – 12",
    description:
      "Mempersiapkan lulusan yang siap bekerja, berwirausaha, atau melanjutkan ke perguruan tinggi dengan kurikulum kesetaraan nasional.",
    modes: "Kelas akhir pekan/sore · Tutorial intensif · Portal belajar 24 jam",
  },
] as const;

const GALLERY_PLACEHOLDERS = [
  {
    id: "ph-1",
    judul: "Pembelajaran Tatap Muka & Tutorial",
    keterangan: "Sesi pendampingan bersama tutor kelas untuk penguatan materi inti dan diskusi modul.",
  },
  {
    id: "ph-2",
    judul: "Praktik Keterampilan & Pemberdayaan",
    keterangan: "Kegiatan kecakapan hidup dan vokasi yang mendukung kemandirian warga belajar PKBM.",
  },
  {
    id: "ph-3",
    judul: "Asesmen & Ujian Kesetaraan Digital",
    keterangan: "Pelaksanaan evaluasi belajar terjadwal melalui sistem CBT dan e-Raport terintegrasi.",
  },
] as const;

export function PortalLogin() {
  const [params, setParams] = useSearchParams();
  const slug = params.get("sekolah") || "";
  const [schoolSlug, setSchoolSlug] = useState(slug);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    setError("");
    loadProfile(slug, controller.signal)
      .then(() => {
        window.location.replace(`https://${slug}.rsch.my.id/lms/login`);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          console.error("Gagal memilih sekolah:", failure);
          setError(failure instanceof Error ? failure.message : "Sekolah belum dapat dipilih.");
        }
      });
    return () => controller.abort();
  }, [slug, attempt]);

  function chooseSchool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = schoolSlug.trim().toLowerCase();
    if (!slugValid(value)) {
      setError("Alamat portal sekolah tidak valid.");
      return;
    }
    if (value === slug) setAttempt((previous) => previous + 1);
    else setParams({ sekolah: value });
  }

  return (
    <main className="glass-shell flex min-h-screen items-center justify-center p-6">
      <div className="glass-panel w-full max-w-md rounded-3xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <BrandLogo alt="Logo SIPUT PKBM" className="h-11 w-11 rounded-xl" />
          <div>
            <p className="master-eyebrow">SIPUT PKBM</p>
            <p className="text-xs font-bold text-slate-600">Portal Pembelajaran</p>
          </div>
        </div>
        {slug && !error ? (
          <p role="status">Mengalihkan ke login sekolah...</p>
        ) : (
          <>
            <h1 className="text-xl font-bold">Masuk Portal Belajar</h1>
            <p className="mt-2 text-sm">Masukkan slug dari alamat portal sekolah Anda.</p>
            <form onSubmit={chooseSchool} className="mt-4 space-y-3">
              <label className="block text-sm font-semibold">
                Slug sekolah
                <input
                  className="glass-input mt-2 w-full rounded-xl px-4 py-3"
                  value={schoolSlug}
                  onChange={(event) => setSchoolSlug(event.target.value)}
                  placeholder="Contoh: armilla"
                  required
                />
              </label>
              {error && <p role="alert">{error}</p>}
              <button className="master-primary">Lanjutkan</button>
            </form>
          </>
        )}
        <Link className="mt-4 inline-block underline" to="/">
          Kembali
        </Link>
      </div>
    </main>
  );
}

export function PublicSchoolPortal({ slug: propSlug }: { slug?: string }) {
  const { slug: paramSlug = "" } = useParams();
  const host = window.location.hostname.toLowerCase();
  const base = ["pkbm.siput.id", "rsch.my.id"].find((d) => host.endsWith("." + d));
  const hostSlug = base ? host.slice(0, -(base.length + 1)) : "";
  const slug = propSlug || paramSlug || hostSlug;
  return <SchoolPortal key={slug} slug={slug} />;
}

function GalleryCardImage({ item, accent }: { item: PublicGalleryItem; accent: string }) {
  const [failed, setFailed] = useState(false);

  if (!item.imageUrl || failed) {
    return (
      <div
        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 border-b border-slate-200 px-6 text-center"
        style={{ backgroundColor: `${accent}0d` }}
      >
        <ImageIcon size={28} style={{ color: accent }} aria-hidden="true" />
        <p className="text-xs font-semibold text-slate-600">Dokumentasi Kegiatan PKBM</p>
      </div>
    );
  }

  return (
    <div className="aspect-[4/3] w-full overflow-hidden border-b border-slate-200 bg-slate-100">
      <img
        src={item.imageUrl}
        alt={item.judul}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
    </div>
  );
}

function SchoolPortal({ slug }: { slug: string }) {
  const [school, setSchool] = useState<PublicProfile | null>(null);
  const [loadError, setLoadError] = useState("");
  const [ppdbOpen, setPpdbOpen] = useState<boolean>(() => isInitialPpdbIntent());
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<RegistrationData | null>(null);
  const [form, setForm] = useState({
    nama: "",
    nik: "",
    nisn: "",
    tempatLahir: "",
    tanggalLahir: "",
    jenisKelamin: "",
    jenjang: "",
    telepon: "",
    asalSekolah: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    setSchool(null);
    setReceipt(null);
    setLoadError("");
    loadProfile(slug, controller.signal)
      .then(setSchool)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          console.error("Gagal memuat portal:", failure);
          setLoadError(failure instanceof Error ? failure.message : "Portal belum dapat dimuat.");
        }
      });
    return () => controller.abort();
  }, [slug]);

  useEffect(() => {
    function syncFromLocation() {
      setPpdbOpen(isInitialPpdbIntent());
    }
    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, []);

  function openPpdbView(preselectedJenjang?: string) {
    if (preselectedJenjang) {
      setForm((prev) => ({ ...prev, jenjang: preselectedJenjang }));
    }
    setSubmitError("");
    setPpdbOpen(true);
    try {
      const nextUrl = `${window.location.pathname}#ppdb`;
      window.history.pushState({ view: "ppdb" }, "", nextUrl);
    } catch {
      window.location.hash = "#ppdb";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closePpdbView() {
    setPpdbOpen(false);
    setSubmitError("");
    try {
      const cleanPath = window.location.pathname.endsWith("/ppdb")
        ? window.location.pathname.slice(0, -5) || "/"
        : window.location.pathname;
      window.history.pushState({ view: "home" }, "", cleanPath);
    } catch {
      window.location.hash = "";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitPpdb(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!form.nik.trim() && !form.nisn.trim()) {
      setSubmitError("Isi NIK atau NISN calon warga belajar.");
      return;
    }
    setBusy(true);
    setSubmitError("");
    try {
      const response = await fetch(`/api/public/sekolah/${encodeURIComponent(slug)}/ppdb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
            ? body.error
            : "Pendaftaran belum dapat dikirim.",
        );
      }
      if (typeof body !== "object" || body === null || !("noDaftar" in body) || typeof body.noDaftar !== "string") {
        throw new Error("Respons tidak valid. Hubungi admin sebelum mengirim ulang.");
      }
      setReceipt({ ...form, noDaftar: body.noDaftar });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (failure) {
      console.error("Gagal mengirim PPDB:", failure);
      setSubmitError(
        failure instanceof TypeError
          ? "Koneksi terputus. Hubungi admin sebelum mengirim ulang."
          : failure instanceof Error
            ? failure.message
            : "Pendaftaran belum dapat dikirim.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!school) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16 text-slate-900">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <BrandLogo alt="Logo SIPUT PKBM" className="mx-auto h-12 w-12 rounded-xl" />
          {loadError ? (
            <>
              <h1 className="mt-4 text-lg font-bold text-slate-900">Portal Belum Tersedia</h1>
              <p role="alert" className="mt-2 text-sm text-rose-700">
                {loadError}
              </p>
              <Link
                to="/"
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Kembali ke Beranda
              </Link>
            </>
          ) : (
            <p role="status" className="mt-4 text-sm font-medium text-slate-600">
              Memuat profil resmi lembaga...
            </p>
          )}
        </div>
      </main>
    );
  }

  const accent = school.branding.primaryColor;
  const onAccent = getReadableOnAccent(accent);
  const fullAddress = [school.alamatLengkap, school.kabupatenKota, school.provinsi].filter(Boolean).join(", ");
  const loginPath = `/login?sekolah=${encodeURIComponent(slug)}`;
  const ppdbEnabled = canAccessFeature(school.planTier, "reguler");
  const contactUrl = whatsapp(
    school.teleponWa,
    receipt
      ? `Halo, saya ${receipt.nama}. Saya telah mendaftar PPDB di ${school.nama} dengan nomor registrasi ${receipt.noDaftar}.`
      : `Halo Admin ${school.nama}, saya ingin mendapatkan informasi mengenai pendaftaran dan program pendidikan kesetaraan.`,
  );

  const inputClass =
    "mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 transition focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10";

  if (ppdbOpen) {
    return (
      <div data-tenant-theme={school.themeKey} className="min-h-screen bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
            <button
              type="button"
              onClick={closePpdbView}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 sm:text-sm"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Kembali ke Beranda PKBM
            </button>
            <div className="hidden min-w-0 items-center gap-2.5 sm:flex">
              <BrandLogo src={school.logoUrl} alt={`Logo ${school.nama}`} className="h-8 w-8 rounded-lg" />
              <span className="truncate text-sm font-bold text-slate-900">{school.nama}</span>
            </div>
            <Link
              to={loginPath}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition hover:opacity-90 sm:text-sm"
              style={{ backgroundColor: accent, color: onAccent }}
            >
              <LogIn size={15} aria-hidden="true" />
              Masuk Portal
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
          {receipt ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 print:hidden">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
                    <div>
                      <h1 className="text-lg font-bold text-emerald-950">Pendaftaran PPDB Berhasil Dikirim</h1>
                      <p className="mt-1 text-sm text-emerald-900">
                        Simpan bukti dan kode registrasi Anda untuk verifikasi oleh admin {school.nama}.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-right">
                    <p className="text-xs font-medium text-slate-500">Kode Registrasi</p>
                    <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900">
                      {receipt.noDaftar}
                    </p>
                  </div>
                </div>
              </div>

              <RegistrationReceipt profile={school} applicant={receipt} />

              <div className="flex flex-wrap items-center gap-3 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-90"
                  style={{ backgroundColor: accent, color: onAccent }}
                >
                  <Printer size={16} aria-hidden="true" />
                  Cetak / Simpan PDF
                </button>
                {contactUrl ? (
                  <a
                    href={contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    Konfirmasi ke Admin PKBM via WhatsApp
                  </a>
                ) : (
                  <p className="text-sm text-slate-600">
                    Kontak WhatsApp lembaga belum tersedia. Simpan nomor registrasi Anda.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setReceipt(null);
                    setForm({
                      nama: "",
                      nik: "",
                      nisn: "",
                      tempatLahir: "",
                      tanggalLahir: "",
                      jenisKelamin: "",
                      jenjang: "",
                      telepon: "",
                      asalSekolah: "",
                    });
                    closePpdbView();
                  }}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  Kembali ke Beranda PKBM
                </button>
              </div>
            </div>
          ) : ppdbEnabled ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <KopSurat profile={school} />
              </div>

              <div className="mt-6 border-b border-slate-200 pb-5">
                <p className="text-xs font-semibold text-slate-500">
                  Penerimaan Warga Belajar Baru · {school.nama}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Formulir Pendaftaran PPDB Online
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Lengkapi biodata calon warga belajar beserta NIK atau NISN. Data pendaftaran akan
                  diverifikasi oleh admin lembaga dan nomor registrasi akan langsung diterbitkan
                  setelah formulir dikirim.
                </p>
              </div>

              {submitError && (
                <p
                  role="alert"
                  className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
                >
                  {submitError}
                </p>
              )}

              <form onSubmit={submitPpdb} className="mt-6 grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["nama", "Nama lengkap", "text", 200, "Sesuai Akta Lahir / KK"],
                    ["nik", "NIK (16 angka, jika ada)", "text", 16, "16 digit angka"],
                    ["nisn", "NISN (10 angka, jika ada)", "text", 10, "10 digit angka"],
                    ["tempatLahir", "Tempat lahir", "text", 200, "Contoh: Bandung"],
                    ["tanggalLahir", "Tanggal lahir", "date", undefined, ""],
                    ["telepon", "Nomor WhatsApp aktif", "tel", 30, "Contoh: 081234567890"],
                    ["asalSekolah", "Asal sekolah / putus sekolah", "text", 200, "Nama sekolah sebelumnya"],
                  ] as const
                ).map(([key, label, type, max, placeholder]) => (
                  <label key={key} className="block text-sm font-semibold text-slate-800">
                    {label}
                    <input
                      type={type}
                      required={key !== "nik" && key !== "nisn"}
                      maxLength={max}
                      placeholder={placeholder || undefined}
                      inputMode={key === "nik" || key === "nisn" ? "numeric" : undefined}
                      pattern={key === "nik" ? "[0-9]{16}" : key === "nisn" ? "[0-9]{10}" : undefined}
                      value={form[key]}
                      onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                      className={inputClass}
                    />
                  </label>
                ))}

                <label className="block text-sm font-semibold text-slate-800">
                  Jenis kelamin
                  <select
                    required
                    value={form.jenisKelamin}
                    onChange={(event) => setForm({ ...form, jenisKelamin: event.target.value })}
                    className={inputClass}
                  >
                    <option value="">Pilih jenis kelamin</option>
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </label>

                <label className="block text-sm font-semibold text-slate-800 sm:col-span-2">
                  Pilihan program kesetaraan
                  <select
                    required
                    value={form.jenjang}
                    onChange={(event) => setForm({ ...form, jenjang: event.target.value })}
                    className={inputClass}
                  >
                    <option value="">Pilih program paket</option>
                    <option value="Paket A">Paket A (Setara SD / MI)</option>
                    <option value="Paket B">Paket B (Setara SMP / MTs)</option>
                    <option value="Paket C">Paket C (Setara SMA / MA)</option>
                  </select>
                </label>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 sm:col-span-2">
                  <button
                    type="button"
                    onClick={closePpdbView}
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ArrowLeft size={15} aria-hidden="true" />
                    Kembali ke Beranda PKBM
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-6 py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: accent, color: onAccent }}
                  >
                    <UserPlus size={16} aria-hidden="true" />
                    {busy ? "Mengirim Pendaftaran..." : "Kirim Pendaftaran PPDB"}
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <h1 className="text-2xl font-bold text-slate-900">Informasi Pendaftaran Warga Belajar</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Formulir pendaftaran online pada portal {school.nama} belum diaktifkan. Silakan
                hubungi admin lembaga secara langsung untuk informasi jadwal dan persyaratan PPDB.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {contactUrl ? (
                  <a
                    href={contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-90"
                    style={{ backgroundColor: accent, color: onAccent }}
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    Hubungi Admin via WhatsApp
                  </a>
                ) : (
                  <p className="text-sm text-slate-600">Kontak WhatsApp lembaga belum tersedia.</p>
                )}
                <button
                  type="button"
                  onClick={closePpdbView}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  Kembali ke Beranda PKBM
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    );
  }

  return (
    <div data-tenant-theme={school.themeKey} className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar — 3 clean zones: Brand wordmark, concise nav links, single primary CTA */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
          <a
            href="#beranda"
            className="flex min-w-0 shrink-0 items-center gap-3 whitespace-nowrap text-slate-900"
          >
            <BrandLogo src={school.logoUrl} alt={`Logo ${school.nama}`} className="h-9 w-9 shrink-0 rounded-xl" />
            <span className="max-w-[180px] truncate text-base font-bold tracking-tight sm:max-w-[280px]">
              {school.nama}
            </span>
          </a>

          <nav aria-label="Navigasi beranda PKBM" className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#program" className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 hover:underline underline-offset-4">
              Program
            </a>
            {school.branding.showNews && (
              <a href="#pengumuman" className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 hover:underline underline-offset-4">
                Pengumuman
              </a>
            )}
            {school.branding.showGallery && (
              <a href="#galeri" className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 hover:underline underline-offset-4">
                Galeri
              </a>
            )}
            <a href="#kontak" className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 hover:underline underline-offset-4">
              Kontak
            </a>
          </nav>

          <div className="shrink-0">
            <Link
              to={loginPath}
              className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition hover:opacity-90 sm:text-sm"
              style={{ backgroundColor: accent, color: onAccent }}
            >
              <LogIn size={15} aria-hidden="true" />
              Masuk Portal
            </Link>
          </div>
        </div>
      </header>

      <main id="beranda">
        {/* 1. Hero Banner Utama */}
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
            <div className="grid items-stretch gap-10 lg:grid-cols-12">
              <div className="flex flex-col justify-center lg:col-span-7">
                <div className="flex items-center gap-4">
                  <BrandLogo
                    src={school.logoUrl}
                    alt={`Logo resmi ${school.nama}`}
                    className="h-16 w-16 shrink-0 rounded-2xl border border-slate-200 bg-white p-1.5 sm:h-20 sm:w-20"
                  />
                  <div className="min-w-0">
                    {school.branding.heroTitle !== school.nama && (
                      <p className="truncate text-sm font-semibold text-slate-700">{school.nama}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500">
                      <span className="tabular-nums">NPSN: {school.npsn || "Belum tersedia"}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Izin Operasional: {school.skIzinOperasional || "Terdaftar Resmi"}
                      </span>
                    </div>
                    {school.namaYayasan && (
                      <p className="mt-1 text-xs text-slate-500">{school.namaYayasan}</p>
                    )}
                  </div>
                </div>

                <h1 className="mt-6 max-w-2xl text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]">
                  {school.branding.heroTitle}
                </h1>

                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                  {school.branding.heroSubtitle}
                </p>

                <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
                  <MapPin size={16} className="mt-1 shrink-0 text-slate-400" aria-hidden="true" />
                  <span>{fullAddress || "Alamat lengkap lembaga belum diatur oleh admin sekolah."}</span>
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3.5">
                  <Link
                    to={loginPath}
                    className="inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-6 py-3 text-sm font-semibold transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ backgroundColor: accent, color: onAccent }}
                  >
                    <LogIn size={17} aria-hidden="true" />
                    Masuk Portal Belajar (Login)
                  </Link>
                  <button
                    type="button"
                    onClick={() => openPpdbView()}
                    className="inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    <UserPlus size={17} aria-hidden="true" />
                    Daftar PPDB Online
                  </button>
                </div>
              </div>

              {/* Right institutional summary card — single elevation, hairline border */}
              <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-6 sm:p-7 lg:col-span-5">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Profil Resmi Lembaga</p>
                  <h2 className="mt-1.5 text-lg font-bold text-slate-900">{school.nama}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Pusat Kegiatan Belajar Masyarakat penyelenggara pendidikan kesetaraan terpadu.
                  </p>

                  <dl className="mt-6 divide-y divide-slate-200 text-sm">
                    <div className="flex items-start justify-between gap-4 py-3">
                      <dt className="text-slate-500">NPSN</dt>
                      <dd className="text-right font-semibold tabular-nums text-slate-900">
                        {school.npsn || "—"}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-3">
                      <dt className="text-slate-500">SK Izin Operasional</dt>
                      <dd className="text-right font-semibold text-slate-900">
                        {school.skIzinOperasional || "—"}
                      </dd>
                    </div>
                    {school.namaKetuaPkbm && (
                      <div className="flex items-start justify-between gap-4 py-3">
                        <dt className="text-slate-500">Kepala / Ketua PKBM</dt>
                        <dd className="text-right font-semibold text-slate-900">{school.namaKetuaPkbm}</dd>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-4 py-3">
                      <dt className="text-slate-500">Layanan Program</dt>
                      <dd className="text-right font-semibold text-slate-900">Paket A · Paket B · Paket C</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-3">
                      <dt className="text-slate-500">Sistem Belajar</dt>
                      <dd className="text-right font-semibold text-slate-900">Tatap Muka · Tutorial · Daring</dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                    <ShieldCheck size={15} style={{ color: accent }} aria-hidden="true" />
                    Akses Guru, Siswa & Admin
                  </span>
                  {contactUrl && (
                    <a
                      href={contactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold hover:underline"
                      style={{ color: accent }}
                    >
                      Hubungi Sekretariat
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Kartu Program Pendidikan Kesetaraan (3 Kolom) */}
        <section id="program" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold" style={{ color: accent }}>
              Program Pendidikan Kesetaraan
            </p>
            <h2 className="mt-1.5 text-balance text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Pilihan Jenjang Belajar Fleksibel untuk Semua Usia
            </h2>
            <p className="mt-2.5 text-sm leading-6 text-slate-600 sm:text-base">
              Setiap jenjang dirancang dengan jadwal yang menyesuaikan kebutuhan warga belajar
              melalui kombinasi kelas tatap muka, bimbingan tutorial, dan akses materi daring.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {EQUALITY_PROGRAMS.map((program) => (
              <article
                key={program.jenjang}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-300"
              >
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs font-semibold tabular-nums text-slate-400">
                      {program.code}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {program.equivalent} · {program.levelRange}
                    </span>
                  </div>

                  <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-900">
                    {program.title}
                    <span className="block text-sm font-medium text-slate-600">
                      ({program.equivalent})
                    </span>
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-slate-600">{program.description}</p>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <p className="text-xs font-medium text-slate-500">Sistem Belajar</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-800">
                      {program.modes}
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-2">
                  <button
                    type="button"
                    onClick={() => openPpdbView(program.jenjang)}
                    className="inline-flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    <span>Daftar {program.title}</span>
                    <ArrowRight size={15} style={{ color: accent }} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* 3. Pengumuman Terbaru (tampil jika show_news aktif di Profil & Identitas Sekolah) */}
        {school.branding.showNews && (
          <section id="pengumuman" className="border-t border-slate-200 bg-white">
            <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="text-sm font-semibold" style={{ color: accent }}>
                    Informasi Lembaga
                  </p>
                  <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    Pengumuman Terbaru
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Pemberitahuan resmi jadwal pembelajaran, penerimaan warga belajar, dan ujian
                    kesetaraan dari {school.nama}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openPpdbView()}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold hover:underline"
                  style={{ color: accent }}
                >
                  Pendaftaran PPDB Online
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </div>

              {school.branding.announcements.length > 0 ? (
                <div className="mt-8 grid gap-5 md:grid-cols-2">
                  {school.branding.announcements.map((item) => {
                    const formatted = formatDateId(item.tanggal);
                    return (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6"
                      >
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Calendar size={13} aria-hidden="true" />
                          <span>{formatted || "Informasi Resmi Lembaga"}</span>
                        </div>
                        <h3 className="mt-2.5 text-base font-bold text-slate-900">{item.judul}</h3>
                        {item.ringkasan && (
                          <p className="mt-2 text-sm leading-6 text-slate-600">{item.ringkasan}</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-8 grid gap-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-6 sm:p-8 lg:grid-cols-12 lg:items-center">
                  <div className="lg:col-span-8">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <Bell size={14} style={{ color: accent }} aria-hidden="true" />
                      <span>Papan Informasi Resmi PKBM</span>
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-slate-900">
                      Belum ada pengumuman terbaru yang dipublikasikan
                    </h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">
                      Pengumuman jadwal belajar tatap muka, jadwal ujian kesetaraan, dan info
                      kegiatan warga belajar akan otomatis muncul di bagian ini setelah diterbitkan
                      oleh admin {school.nama}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
                    <Link
                      to={loginPath}
                      className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                    >
                      <BookOpen size={15} aria-hidden="true" />
                      Cek Info di Portal Belajar
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 4. Galeri Kegiatan PKBM (tampil jika show_gallery aktif di Profil & Identitas Sekolah) */}
        {school.branding.showGallery && (
          <section id="galeri" className="border-t border-slate-200 bg-slate-50">
            <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold" style={{ color: accent }}>
                  Dokumentasi Aktivitas
                </p>
                <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Galeri Kegiatan PKBM
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Potret suasana kegiatan pembelajaran, pembinaan keterampilan, dan aktivitas warga
                  belajar di lingkungan {school.nama}.
                </p>
              </div>

              {school.branding.gallery.length > 0 ? (
                <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {school.branding.gallery.map((item) => (
                    <figure
                      key={item.id}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white"
                    >
                      <GalleryCardImage item={item} accent={accent} />
                      <figcaption className="p-5">
                        <h3 className="text-sm font-bold text-slate-900">{item.judul}</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.keterangan}</p>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                  {GALLERY_PLACEHOLDERS.map((slot, index) => (
                    <div
                      key={slot.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                    >
                      <div
                        className="flex aspect-[4/3] flex-col items-center justify-center gap-2.5 border-b border-slate-200 px-6 text-center"
                        style={{ backgroundColor: `${accent}0a` }}
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white">
                          {index === 0 ? (
                            <GraduationCap size={20} style={{ color: accent }} aria-hidden="true" />
                          ) : index === 1 ? (
                            <Building2 size={20} style={{ color: accent }} aria-hidden="true" />
                          ) : (
                            <ImageIcon size={20} style={{ color: accent }} aria-hidden="true" />
                          )}
                        </div>
                        <p className="text-xs font-medium text-slate-500">
                          Foto galeri belum diunggah lembaga
                        </p>
                      </div>
                      <div className="p-5">
                        <h3 className="text-sm font-bold text-slate-900">{slot.judul}</h3>
                        <p className="mt-1.5 text-xs leading-5 text-slate-600">{slot.keterangan}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Ajakan Aksi Penutup */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  Siap Melanjutkan Pendidikan Bersama {school.nama}?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Daftarkan diri melalui PPDB Online untuk mendapatkan kode registrasi resmi, atau
                  masuk ke Portal Belajar jika Anda sudah terdaftar sebagai warga belajar maupun
                  tutor.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => openPpdbView()}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-90"
                  style={{ backgroundColor: accent, color: onAccent }}
                >
                  <UserPlus size={16} aria-hidden="true" />
                  Daftar PPDB Online
                </button>
                <Link
                  to={loginPath}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  <LogIn size={16} aria-hidden="true" />
                  Masuk Portal Belajar
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Lembaga */}
      <footer id="kontak" className="border-t border-slate-200 bg-slate-900 text-slate-300">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-3">
                <BrandLogo
                  src={school.logoUrl}
                  alt={`Logo ${school.nama}`}
                  className="h-10 w-10 shrink-0 rounded-xl border border-white/15 bg-white p-1"
                />
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-white">{school.nama}</p>
                  <p className="text-xs text-slate-400 tabular-nums">
                    NPSN: {school.npsn || "Belum tersedia"}
                    {school.skIzinOperasional ? ` · Izin: ${school.skIzinOperasional}` : ""}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-400">
                {fullAddress || "Alamat lengkap lembaga belum tersedia."}
              </p>
            </div>

            <div className="md:col-span-4">
              <h3 className="text-sm font-semibold text-white">Kontak Sekretariat</h3>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-400">
                {school.teleponWa && (
                  <li className="flex items-center gap-2">
                    <Phone size={14} className="shrink-0 text-slate-500" aria-hidden="true" />
                    {contactUrl ? (
                      <a
                        href={contactUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white hover:underline"
                      >
                        {school.teleponWa}
                      </a>
                    ) : (
                      <span>{school.teleponWa}</span>
                    )}
                  </li>
                )}
                {school.emailSekolah && (
                  <li className="flex items-center gap-2">
                    <Mail size={14} className="shrink-0 text-slate-500" aria-hidden="true" />
                    <a href={`mailto:${school.emailSekolah}`} className="hover:text-white hover:underline">
                      {school.emailSekolah}
                    </a>
                  </li>
                )}
                {school.websiteSekolah && (
                  <li className="flex items-center gap-2">
                    <Globe size={14} className="shrink-0 text-slate-500" aria-hidden="true" />
                    <span>{school.websiteSekolah}</span>
                  </li>
                )}
                {!school.teleponWa && !school.emailSekolah && !school.websiteSekolah && (
                  <li>Informasi kontak dapat dikonfirmasi langsung ke kantor sekretariat lembaga.</li>
                )}
              </ul>
            </div>

            <div className="md:col-span-3">
              <h3 className="text-sm font-semibold text-white">Tautan Cepat</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                <li>
                  <a href="#program" className="hover:text-white hover:underline">
                    Program Paket A, B & C
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openPpdbView()}
                    className="hover:text-white hover:underline"
                  >
                    Formulir PPDB Online
                  </button>
                </li>
                <li>
                  <Link to={loginPath} className="hover:text-white hover:underline">
                    Masuk Portal Belajar
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-slate-800 pt-6 text-xs leading-5 text-slate-400">
            {school.branding.footerText}
          </div>
        </div>
      </footer>
    </div>
  );
}
