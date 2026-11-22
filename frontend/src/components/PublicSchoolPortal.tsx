import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  LogIn,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Printer,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
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

type TenantLandingPalette = {
  isDark: boolean;
  brandSub: string;
  navLink: string;
  mobileMenuBtn: string;
  mobileDrawer: string;
  ringBorder: string;
  eyebrow: string;
  eyebrowLine: string;
  heading: string;
  bodyText: string;
  mutedText: string;
  statCard: string;
  statLabel: string;
  statIcon: string;
  statValue: string;
  sparkleIcon: string;
  heroArtShell: string;
  heroArtGradient: string;
  heroArtCircle: string;
  heroArtCaption: string;
  heroArtBadgeText: string;
  heroArrowCircle: string;
  stripAccent: string;
  divider: string;
  innerSurface: string;
  badgeSurface: string;
  inputSurface: string;
};

const TENANT_LANDING_THEMES: Record<ThemeKey, TenantLandingPalette> = {
  dark: {
    isDark: true,
    brandSub: "text-emerald-300/85",
    navLink: "text-slate-300 hover:text-amber-300",
    mobileMenuBtn: "border border-slate-700/80 bg-slate-900/70 text-slate-100 hover:bg-slate-800",
    mobileDrawer: "border-t border-slate-700/60 bg-[#091325]/95 text-slate-200 backdrop-blur-2xl",
    ringBorder: "border-amber-400/12",
    eyebrow: "text-amber-300",
    eyebrowLine: "bg-amber-400",
    heading: "text-slate-50",
    bodyText: "text-slate-300",
    mutedText: "text-slate-400",
    statCard: "border-slate-400/20 bg-[#0b1629]/80 backdrop-blur-md",
    statLabel: "text-amber-300",
    statIcon: "text-emerald-400",
    statValue: "text-white",
    sparkleIcon: "text-amber-400",
    heroArtShell: "bg-[#081222] border border-slate-700/70",
    heroArtGradient: "bg-gradient-to-br from-[#0c2c34] via-[#0e1b35] to-[#1a1f36]",
    heroArtCircle: "border-amber-400/12",
    heroArtCaption: "text-emerald-300",
    heroArtBadgeText: "text-slate-300",
    heroArrowCircle: "border-slate-600/80 bg-slate-900/70 text-amber-300",
    stripAccent: "text-amber-300",
    divider: "border-slate-700/70",
    innerSurface: "border-slate-700/60 bg-slate-900/65",
    badgeSurface: "border-slate-700/80 bg-slate-900/85 text-slate-100",
    inputSurface:
      "border-slate-700 bg-slate-900/85 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:ring-amber-400/20",
  },
  ocean: {
    isDark: false,
    brandSub: "text-sky-700",
    navLink: "text-slate-700 hover:text-sky-950",
    mobileMenuBtn: "border border-sky-200/80 bg-white/80 text-sky-950 hover:bg-sky-100",
    mobileDrawer: "border-t border-sky-200/70 bg-white/95 text-sky-950 backdrop-blur-2xl",
    ringBorder: "border-sky-400/25",
    eyebrow: "text-sky-800",
    eyebrowLine: "bg-amber-500",
    heading: "text-sky-950",
    bodyText: "text-slate-700",
    mutedText: "text-slate-600",
    statCard: "border-white/90 bg-white/75 backdrop-blur-md",
    statLabel: "text-sky-800",
    statIcon: "text-sky-700",
    statValue: "text-sky-950",
    sparkleIcon: "text-amber-600",
    heroArtShell: "bg-sky-100 border border-white/80",
    heroArtGradient: "bg-gradient-to-br from-[#d9f3ff] via-[#bae6fd] to-[#fde68a]/65",
    heroArtCircle: "border-white/40",
    heroArtCaption: "text-sky-900",
    heroArtBadgeText: "text-slate-700",
    heroArrowCircle: "border-sky-900/20 bg-white/70 text-sky-900",
    stripAccent: "text-sky-800",
    divider: "border-sky-200/80",
    innerSurface: "border-white/85 bg-white/70",
    badgeSurface: "border-white/90 bg-white/85 text-sky-950",
    inputSurface:
      "border-sky-200/90 bg-white/90 text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:ring-sky-500/15",
  },
  emerald: {
    isDark: false,
    brandSub: "text-emerald-700",
    navLink: "text-slate-700 hover:text-emerald-950",
    mobileMenuBtn: "border border-emerald-200/80 bg-white/80 text-emerald-950 hover:bg-emerald-100",
    mobileDrawer: "border-t border-emerald-200/70 bg-white/95 text-emerald-950 backdrop-blur-2xl",
    ringBorder: "border-emerald-400/25",
    eyebrow: "text-emerald-800",
    eyebrowLine: "bg-emerald-600",
    heading: "text-emerald-950",
    bodyText: "text-slate-700",
    mutedText: "text-slate-600",
    statCard: "border-white/90 bg-white/75 backdrop-blur-md",
    statLabel: "text-emerald-800",
    statIcon: "text-emerald-700",
    statValue: "text-emerald-950",
    sparkleIcon: "text-emerald-700",
    heroArtShell: "bg-emerald-100 border border-white/80",
    heroArtGradient: "bg-gradient-to-br from-[#d1fae5] via-[#99f6e4] to-[#a7f3d0]",
    heroArtCircle: "border-white/40",
    heroArtCaption: "text-emerald-900",
    heroArtBadgeText: "text-slate-700",
    heroArrowCircle: "border-emerald-900/20 bg-white/70 text-emerald-900",
    stripAccent: "text-emerald-800",
    divider: "border-emerald-200/80",
    innerSurface: "border-white/85 bg-white/70",
    badgeSurface: "border-white/90 bg-white/85 text-emerald-950",
    inputSurface:
      "border-emerald-200/90 bg-white/90 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-emerald-500/15",
  },
  sunset: {
    isDark: false,
    brandSub: "text-violet-700",
    navLink: "text-slate-700 hover:text-violet-950",
    mobileMenuBtn: "border border-violet-200/80 bg-white/80 text-violet-950 hover:bg-violet-100",
    mobileDrawer: "border-t border-violet-200/70 bg-white/95 text-violet-950 backdrop-blur-2xl",
    ringBorder: "border-violet-400/25",
    eyebrow: "text-violet-800",
    eyebrowLine: "bg-fuchsia-600",
    heading: "text-violet-950",
    bodyText: "text-slate-700",
    mutedText: "text-slate-600",
    statCard: "border-white/90 bg-white/75 backdrop-blur-md",
    statLabel: "text-violet-800",
    statIcon: "text-fuchsia-700",
    statValue: "text-violet-950",
    sparkleIcon: "text-fuchsia-700",
    heroArtShell: "bg-violet-100 border border-white/80",
    heroArtGradient: "bg-gradient-to-br from-[#ede9fe] via-[#fbcfe8] to-[#fed7aa]",
    heroArtCircle: "border-white/40",
    heroArtCaption: "text-violet-900",
    heroArtBadgeText: "text-slate-700",
    heroArrowCircle: "border-violet-900/20 bg-white/70 text-violet-900",
    stripAccent: "text-violet-800",
    divider: "border-violet-200/80",
    innerSurface: "border-white/85 bg-white/70",
    badgeSurface: "border-white/90 bg-white/85 text-violet-950",
    inputSurface:
      "border-violet-200/90 bg-white/90 text-slate-900 placeholder:text-slate-400 focus:border-violet-600 focus:ring-violet-500/15",
  },
  violet: {
    isDark: false,
    brandSub: "text-indigo-700",
    navLink: "text-slate-700 hover:text-indigo-950",
    mobileMenuBtn: "border border-indigo-200/80 bg-white/80 text-indigo-950 hover:bg-indigo-100",
    mobileDrawer: "border-t border-indigo-200/70 bg-white/95 text-indigo-950 backdrop-blur-2xl",
    ringBorder: "border-indigo-400/25",
    eyebrow: "text-indigo-800",
    eyebrowLine: "bg-indigo-600",
    heading: "text-indigo-950",
    bodyText: "text-slate-700",
    mutedText: "text-slate-600",
    statCard: "border-white/90 bg-white/75 backdrop-blur-md",
    statLabel: "text-indigo-800",
    statIcon: "text-indigo-700",
    statValue: "text-indigo-950",
    sparkleIcon: "text-violet-700",
    heroArtShell: "bg-indigo-100 border border-white/80",
    heroArtGradient: "bg-gradient-to-br from-[#e0e7ff] via-[#c7d2fe] to-[#ede9fe]",
    heroArtCircle: "border-white/40",
    heroArtCaption: "text-indigo-900",
    heroArtBadgeText: "text-slate-700",
    heroArrowCircle: "border-indigo-900/20 bg-white/70 text-indigo-900",
    stripAccent: "text-indigo-800",
    divider: "border-indigo-200/80",
    innerSurface: "border-white/85 bg-white/70",
    badgeSurface: "border-white/90 bg-white/85 text-indigo-950",
    inputSurface:
      "border-indigo-200/90 bg-white/90 text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-indigo-500/15",
  },
};

const DEFAULT_ACCENT_BY_THEME: Record<ThemeKey, string> = {
  ocean: "#0284c7",
  emerald: "#059669",
  sunset: "#9333ea",
  violet: "#4f46e5",
  dark: "#f59e0b",
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

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return [2, 132, 199];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shiftHexColor(hex: string, amount: number): string {
  const [r, g, b] = parseHexRgb(hex);
  const adjust = (channel: number) => {
    const next = amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`;
}

function getReadableOnAccent(hex: string): string {
  const [rRaw, gRaw, bRaw] = parseHexRgb(hex);
  const linear = [rRaw / 255, gRaw / 255, bRaw / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.48 ? "#0f172a" : "#ffffff";
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
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/25",
    pillTone: "bg-emerald-500/15 text-emerald-800 border-emerald-500/25",
    pillToneDark: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
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
    iconBg: "bg-gradient-to-br from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-600/25",
    pillTone: "bg-sky-500/15 text-sky-900 border-sky-500/25",
    pillToneDark: "bg-sky-500/15 text-sky-300 border-sky-400/30",
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
    iconBg: "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/25",
    pillTone: "bg-indigo-500/15 text-indigo-900 border-indigo-500/25",
    pillToneDark: "bg-indigo-500/15 text-indigo-300 border-indigo-400/30",
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
      <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-xl">
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

function GalleryCardImage({
  item,
  accent,
  palette,
}: {
  item: PublicGalleryItem;
  accent: string;
  palette: TenantLandingPalette;
}) {
  const [failed, setFailed] = useState(false);

  if (!item.imageUrl || failed) {
    return (
      <div
        className={`relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-2.5 overflow-hidden border-b px-6 text-center ${palette.divider} ${palette.heroArtShell}`}
      >
        <div className={`absolute inset-0 ${palette.heroArtGradient}`} />
        <div
          className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border shadow-md backdrop-blur-md ${palette.badgeSurface}`}
        >
          <ImageIcon size={22} style={{ color: accent }} aria-hidden="true" />
        </div>
        <p className={`relative text-xs font-semibold ${palette.heroArtCaption}`}>
          Dokumentasi Kegiatan PKBM
        </p>
      </div>
    );
  }

  return (
    <div className={`aspect-[4/3] w-full overflow-hidden border-b ${palette.divider}`}>
      <img
        src={item.imageUrl}
        alt={item.judul}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    </div>
  );
}

function SchoolPortal({ slug }: { slug: string }) {
  const [school, setSchool] = useState<PublicProfile | null>(null);
  const [loadError, setLoadError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
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
    const activeTheme = school?.themeKey ?? "ocean";
    const root = document.documentElement;
    root.dataset.tenantTheme = activeTheme;
    return () => {
      if (root.dataset.tenantTheme === activeTheme) {
        delete root.dataset.tenantTheme;
      }
    };
  }, [school?.themeKey]);

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
    setMenuOpen(false);
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
    setMenuOpen(false);
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
    const fallbackPalette = TENANT_LANDING_THEMES.ocean;
    return (
      <div data-tenant-theme="ocean" className="landing-page flex min-h-screen items-center justify-center px-6 py-16 antialiased">
        <div className="glass-panel w-full max-w-md rounded-3xl p-8 text-center shadow-xl">
          <BrandLogo alt="Logo SIPUT PKBM" className="mx-auto h-14 w-14 rounded-2xl shadow-md" />
          {loadError ? (
            <>
              <h1 className={`mt-5 text-xl font-bold tracking-tight ${fallbackPalette.heading}`}>
                Portal Belum Tersedia
              </h1>
              <p role="alert" className="mt-2 text-sm text-rose-700">
                {loadError}
              </p>
              <Link
                to="/"
                className="landing-primary mt-6 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition"
              >
                Kembali ke Beranda
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </>
          ) : (
            <div className="mt-5 space-y-2">
              <p role="status" className={`text-sm font-semibold ${fallbackPalette.heading}`}>
                Memuat profil resmi lembaga...
              </p>
              <p className={`text-xs ${fallbackPalette.mutedText}`}>
                Menyiapkan beranda PKBM dan layanan pendidikan kesetaraan.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const palette = TENANT_LANDING_THEMES[school.themeKey];
  const accent = school.branding.primaryColor;
  const accentDeep = shiftHexColor(accent, -0.24);
  const onAccent = getReadableOnAccent(accent);
  const accentButtonStyle = {
    background: `linear-gradient(125deg, ${accent} 0%, ${accentDeep} 100%)`,
    color: onAccent,
    boxShadow: `0 12px 28px -8px ${hexToRgba(accent, 0.45)}`,
  };
  const accentBadgeStyle = {
    borderColor: hexToRgba(accent, palette.isDark ? 0.45 : 0.32),
    backgroundColor: hexToRgba(accent, palette.isDark ? 0.16 : 0.1),
  };

  const fullAddress = [school.alamatLengkap, school.kabupatenKota, school.provinsi]
    .filter(Boolean)
    .join(", ");
  const cleanLocationText = fullAddress || "Layanan Pendidikan Kesetaraan Terpadu";
  const cleanFooterAddress =
    fullAddress ||
    "Pusat Kegiatan Belajar Masyarakat penyelenggara pendidikan kesetaraan resmi Paket A, Paket B, dan Paket C.";
  const loginPath = `/login?sekolah=${encodeURIComponent(slug)}`;
  const ppdbEnabled = canAccessFeature(school.planTier, "reguler");
  const contactUrl = whatsapp(
    school.teleponWa,
    receipt
      ? `Halo, saya ${receipt.nama}. Saya telah mendaftar PPDB di ${school.nama} dengan nomor registrasi ${receipt.noDaftar}.`
      : `Halo Admin ${school.nama}, saya ingin mendapatkan informasi mengenai pendaftaran dan program pendidikan kesetaraan.`,
  );

  const inputClass = `mt-1.5 block w-full rounded-xl border px-3.5 py-2.5 text-sm font-normal transition focus:outline-none focus:ring-2 ${palette.inputSurface}`;

  if (ppdbOpen) {
    return (
      <div data-tenant-theme={school.themeKey} className="landing-page min-h-screen antialiased">
        <header className="landing-header sticky top-0 z-40 print:hidden">
          <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
            <button
              type="button"
              onClick={closePpdbView}
              className="landing-secondary inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-xs font-semibold transition sm:text-sm"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Kembali ke Beranda PKBM
            </button>
            <div className="hidden min-w-0 items-center gap-3 sm:flex">
              <BrandLogo src={school.logoUrl} alt={`Logo ${school.nama}`} className="h-9 w-9 rounded-xl shadow-sm" />
              <div className="min-w-0">
                <span className={`block truncate text-sm font-bold tracking-tight ${palette.heading}`}>
                  {school.nama}
                </span>
                <span className={`block text-[10px] font-semibold uppercase tracking-[0.16em] ${palette.brandSub}`}>
                  PPDB Online Resmi
                </span>
              </div>
            </div>
            <Link
              to={loginPath}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-xs font-bold transition hover:brightness-110 sm:text-sm"
              style={accentButtonStyle}
            >
              <LogIn size={15} aria-hidden="true" />
              Masuk Portal
            </Link>
          </div>
        </header>

        <main className="relative mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-12">
          {receipt ? (
            <div className="space-y-6">
              <div
                className={`glass-panel rounded-3xl p-6 shadow-xl print:hidden ${
                  palette.isDark ? "border-emerald-400/35" : "border-emerald-300/80"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
                      <CheckCircle2 size={22} aria-hidden="true" />
                    </span>
                    <div>
                      <h1 className={`text-lg font-bold ${palette.heading}`}>
                        Pendaftaran PPDB Berhasil Dikirim
                      </h1>
                      <p className={`mt-1 text-sm ${palette.bodyText}`}>
                        Simpan bukti dan kode registrasi Anda untuk verifikasi oleh admin {school.nama}.
                      </p>
                    </div>
                  </div>
                  <div className={`rounded-2xl border px-4 py-2.5 text-right ${palette.innerSurface}`}>
                    <p className={`text-xs font-medium ${palette.mutedText}`}>Kode Registrasi</p>
                    <p className={`mt-0.5 font-mono text-base font-bold tabular-nums ${palette.heading}`}>
                      {receipt.noDaftar}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-white p-2 shadow-xl sm:p-4">
                <RegistrationReceipt profile={school} applicant={receipt} />
              </div>

              <div className="flex flex-wrap items-center gap-3 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-6 py-3 text-sm font-bold transition hover:brightness-110"
                  style={accentButtonStyle}
                >
                  <Printer size={16} aria-hidden="true" />
                  Cetak / Simpan PDF
                </button>
                {contactUrl ? (
                  <a
                    href={contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="landing-secondary inline-flex items-center gap-2 whitespace-nowrap rounded-full px-5 py-3 text-sm font-semibold transition"
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    Konfirmasi ke Admin PKBM via WhatsApp
                  </a>
                ) : (
                  <p className={`text-sm ${palette.bodyText}`}>
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
                  className="landing-secondary inline-flex items-center gap-2 whitespace-nowrap rounded-full px-5 py-3 text-sm font-semibold transition"
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  Kembali ke Beranda PKBM
                </button>
              </div>
            </div>
          ) : ppdbEnabled ? (
            <section className="glass-panel rounded-3xl p-6 shadow-xl sm:p-10">
              <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-slate-900 shadow-sm">
                <KopSurat profile={school} />
              </div>

              <div className={`mt-7 border-b pb-6 ${palette.divider}`}>
                <span
                  className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] ${palette.eyebrow}`}
                >
                  <span className="h-px w-6" style={{ backgroundColor: accent }} />
                  Penerimaan Warga Belajar Baru · {school.nama}
                </span>
                <h1 className={`mt-3 text-2xl font-bold tracking-tight sm:text-3xl ${palette.heading}`}>
                  Formulir Pendaftaran PPDB Online
                </h1>
                <p className={`mt-2 max-w-2xl text-sm leading-6 ${palette.bodyText}`}>
                  Lengkapi biodata calon warga belajar beserta NIK atau NISN. Data pendaftaran akan
                  diverifikasi oleh admin lembaga dan nomor registrasi akan langsung diterbitkan
                  setelah formulir dikirim.
                </p>
              </div>

              {submitError && (
                <p
                  role="alert"
                  className="mt-5 rounded-2xl border border-rose-300/80 bg-rose-50/95 px-4 py-3 text-sm font-semibold text-rose-800"
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
                  <label key={key} className={`block text-sm font-semibold ${palette.heading}`}>
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

                <label className={`block text-sm font-semibold ${palette.heading}`}>
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

                <label className={`block text-sm font-semibold sm:col-span-2 ${palette.heading}`}>
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

                <div
                  className={`mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-6 sm:col-span-2 ${palette.divider}`}
                >
                  <button
                    type="button"
                    onClick={closePpdbView}
                    className="landing-secondary inline-flex items-center gap-2 whitespace-nowrap rounded-full px-5 py-3 text-sm font-semibold transition"
                  >
                    <ArrowLeft size={15} aria-hidden="true" />
                    Kembali ke Beranda PKBM
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-7 py-3 text-sm font-bold transition hover:brightness-110 disabled:opacity-50"
                    style={accentButtonStyle}
                  >
                    <UserPlus size={16} aria-hidden="true" />
                    {busy ? "Mengirim Pendaftaran..." : "Kirim Pendaftaran PPDB"}
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <section className="glass-panel rounded-3xl p-6 shadow-xl sm:p-10">
              <h1 className={`text-2xl font-bold tracking-tight ${palette.heading}`}>
                Informasi Pendaftaran Warga Belajar
              </h1>
              <p className={`mt-3 max-w-2xl text-sm leading-6 ${palette.bodyText}`}>
                Formulir pendaftaran online pada portal {school.nama} belum diaktifkan. Silakan
                hubungi admin lembaga secara langsung untuk informasi jadwal dan persyaratan PPDB.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {contactUrl ? (
                  <a
                    href={contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-6 py-3 text-sm font-bold transition hover:brightness-110"
                    style={accentButtonStyle}
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    Hubungi Admin via WhatsApp
                  </a>
                ) : (
                  <p className={`text-sm ${palette.bodyText}`}>Kontak WhatsApp lembaga belum tersedia.</p>
                )}
                <button
                  type="button"
                  onClick={closePpdbView}
                  className="landing-secondary inline-flex items-center gap-2 whitespace-nowrap rounded-full px-5 py-3 text-sm font-semibold transition"
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

  const navLinks = (
    <>
      <a href="#program" onClick={() => setMenuOpen(false)} className={`whitespace-nowrap transition ${palette.navLink}`}>
        Program
      </a>
      {school.branding.showNews && (
        <a href="#pengumuman" onClick={() => setMenuOpen(false)} className={`whitespace-nowrap transition ${palette.navLink}`}>
          Pengumuman
        </a>
      )}
      {school.branding.showGallery && (
        <a href="#galeri" onClick={() => setMenuOpen(false)} className={`whitespace-nowrap transition ${palette.navLink}`}>
          Galeri
        </a>
      )}
      <a href="#kontak" onClick={() => setMenuOpen(false)} className={`whitespace-nowrap transition ${palette.navLink}`}>
        Kontak
      </a>
    </>
  );

  return (
    <div data-tenant-theme={school.themeKey} className="landing-page min-h-screen antialiased">
      {/* Sticky Glassmorphism Navbar matching LandingPage.tsx */}
      <header className="landing-header sticky top-0 z-40">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
          <a
            href="#beranda"
            className="flex min-w-0 items-center gap-3"
            aria-label={`${school.nama}, kembali ke beranda`}
          >
            <BrandLogo
              src={school.logoUrl}
              alt={`Logo ${school.nama}`}
              className="h-10 w-10 shrink-0 rounded-xl shadow-sm"
            />
            <span className="min-w-0">
              <span className={`block max-w-[190px] truncate text-sm font-bold tracking-tight sm:max-w-[260px] sm:text-base ${palette.heading}`}>
                {school.nama}
              </span>
              <span className={`block text-[9px] font-semibold uppercase tracking-[0.18em] ${palette.brandSub}`}>
                Portal Resmi PKBM
              </span>
            </span>
          </a>

          <nav aria-label="Navigasi beranda PKBM" className="hidden items-center gap-7 text-sm font-medium lg:flex">
            {navLinks}
          </nav>

          <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => openPpdbView()}
              className="landing-secondary hidden items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition sm:inline-flex"
            >
              <UserPlus size={15} aria-hidden="true" />
              PPDB Online
            </button>
            <Link
              to={loginPath}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-xs font-bold transition hover:brightness-110 sm:px-5 sm:text-sm"
              style={accentButtonStyle}
            >
              <LogIn size={15} aria-hidden="true" />
              Masuk Portal
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
              aria-expanded={menuOpen}
              className={`rounded-xl p-2 transition lg:hidden ${palette.mobileMenuBtn}`}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            aria-label="Navigasi seluler PKBM"
            className={`flex flex-col gap-4 px-6 py-6 text-sm font-semibold lg:hidden ${palette.mobileDrawer}`}
          >
            {navLinks}
            <div className={`mt-1 flex flex-col gap-3 border-t pt-4 ${palette.divider}`}>
              <button
                type="button"
                onClick={() => openPpdbView()}
                className="landing-secondary inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition"
              >
                <UserPlus size={16} aria-hidden="true" />
                Daftar PPDB Online
              </button>
              <Link
                to={loginPath}
                onClick={() => setMenuOpen(false)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition hover:brightness-110"
                style={accentButtonStyle}
              >
                <LogIn size={16} aria-hidden="true" />
                Masuk Portal Belajar
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main id="beranda">
        {/* 1. Full-Gradient Hero Section matching LandingPage.tsx */}
        <section className="landing-hero relative overflow-hidden">
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -right-36 -top-56 h-[650px] w-[650px] rounded-full border ${palette.ringBorder}`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -right-16 top-4 h-[450px] w-[450px] rounded-full border ${palette.ringBorder}`}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 top-32 h-72 w-72 rounded-full blur-3xl"
            style={{ backgroundColor: hexToRgba(accent, palette.isDark ? 0.16 : 0.14) }}
          />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-12 sm:px-8 md:pb-20 md:pt-16 lg:grid-cols-[1.08fr_.92fr] lg:gap-16">
            {/* Left Hero Glass Panel */}
            <div className="glass-panel rounded-3xl p-6 shadow-xl sm:p-10">
              {/* Official Status Badge */}
              <div
                className={`inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-bold tracking-wide shadow-sm ${palette.heading}`}
                style={accentBadgeStyle}
              >
                <ShieldCheck size={14} className="shrink-0" style={{ color: accent }} aria-hidden="true" />
                <span className="tabular-nums">
                  Terakreditasi &amp; Terdaftar Resmi • NPSN {school.npsn || "Terdaftar"}
                </span>
              </div>

              {school.branding.heroTitle !== school.nama && (
                <p className={`mt-5 text-xs font-bold uppercase tracking-[0.18em] ${palette.eyebrow}`}>
                  {school.nama}
                </p>
              )}

              <h1
                className={`mt-5 max-w-2xl text-balance text-3xl font-bold leading-[1.12] tracking-[-0.03em] sm:text-5xl lg:text-[3.35rem] ${palette.heading}`}
              >
                {school.branding.heroTitle}
              </h1>

              <div
                className="mt-4 h-1 w-16 rounded-full"
                style={{ background: `linear-gradient(90deg, ${accent}, ${shiftHexColor(accent, 0.35)})` }}
                aria-hidden="true"
              />

              <p className={`mt-5 max-w-xl text-base leading-8 sm:text-lg ${palette.bodyText}`}>
                {school.branding.heroSubtitle}
              </p>

              <p className={`mt-4 flex items-start gap-2.5 text-sm leading-6 ${palette.mutedText}`}>
                <MapPin size={16} className="mt-1 shrink-0" style={{ color: accent }} aria-hidden="true" />
                <span>{cleanLocationText}</span>
              </p>

              {/* High-Contrast Dual CTAs */}
              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <Link
                  to={loginPath}
                  className="inline-flex min-h-[50px] items-center justify-center gap-3 whitespace-nowrap rounded-full px-6 py-3.5 text-sm font-bold transition hover:-translate-y-0.5 hover:brightness-110"
                  style={accentButtonStyle}
                >
                  <LogIn size={17} aria-hidden="true" />
                  Masuk Portal Belajar (Login)
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => openPpdbView()}
                  className="landing-secondary inline-flex min-h-[50px] items-center justify-center gap-2.5 whitespace-nowrap rounded-full px-6 py-3.5 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5"
                >
                  <UserPlus size={17} aria-hidden="true" />
                  Daftar PPDB Online
                </button>
              </div>

              {/* 2 Institutional Highlight Stat Tiles matching LandingPage.tsx */}
              <div className="mt-9 grid gap-3 sm:grid-cols-2">
                <div className={`rounded-2xl border p-4 shadow-sm ${palette.statCard}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-bold uppercase tracking-[0.15em] ${palette.statLabel}`}>
                      Program Kesetaraan
                    </span>
                    <GraduationCap size={17} style={{ color: accent }} aria-hidden="true" />
                  </div>
                  <p className={`mt-2 text-xl font-bold tracking-tight ${palette.statValue}`}>
                    Paket A · B · C
                  </p>
                  <p className={`mt-1 text-xs ${palette.mutedText}`}>
                    Setara SD, SMP, dan SMA terakreditasi
                  </p>
                </div>
                <div className={`rounded-2xl border p-4 shadow-sm ${palette.statCard}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-bold uppercase tracking-[0.15em] ${palette.statLabel}`}>
                      Sistem Belajar
                    </span>
                    <Layers size={17} style={{ color: accent }} aria-hidden="true" />
                  </div>
                  <p className={`mt-2 text-xl font-bold tracking-tight ${palette.statValue}`}>
                    Fleksibel &amp; Daring
                  </p>
                  <p className={`mt-1 text-xs ${palette.mutedText}`}>
                    Tatap muka, tutorial, dan LMS digital
                  </p>
                </div>
              </div>

              <div className={`mt-6 flex items-center gap-2.5 text-xs font-medium ${palette.bodyText}`}>
                <Sparkles size={15} className={palette.sparkleIcon} aria-hidden="true" />
                <span>Belajar fleksibel untuk semua usia, resmi dan terdata di Dapodik.</span>
              </div>
            </div>

            {/* Right Glassmorphism Institutional Profile Card matching LandingPage.tsx hero showcase */}
            <div className="relative mx-auto w-full max-w-[520px]">
              <div
                className={`pointer-events-none absolute -inset-4 rounded-[2rem] border ${palette.ringBorder}`}
                aria-hidden="true"
              />
              <div className="glass-panel relative overflow-hidden rounded-[1.75rem] p-5 shadow-xl sm:p-7">
                {/* Visual Top Art Banner */}
                <div className={`relative overflow-hidden rounded-2xl p-6 ${palette.heroArtShell}`}>
                  <div className={`absolute inset-0 ${palette.heroArtGradient}`} />
                  <div
                    className={`pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full border-[32px] ${palette.heroArtCircle}`}
                  />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-[10px] font-bold uppercase tracking-[0.22em] ${palette.heroArtCaption}`}>
                        Profil Resmi Lembaga
                      </span>
                      <span
                        className="h-2.5 w-2.5 rounded-full shadow-sm"
                        style={{ backgroundColor: accent }}
                        aria-hidden="true"
                      />
                    </div>

                    <div className="glass-panel mt-5 rounded-2xl p-4 shadow-md">
                      <div className="flex items-center gap-3.5">
                        <BrandLogo
                          src={school.logoUrl}
                          alt={`Logo resmi ${school.nama}`}
                          className="h-14 w-14 shrink-0 rounded-2xl bg-white/90 p-1 shadow-sm"
                        />
                        <div className="min-w-0">
                          <h2 className={`truncate text-base font-bold sm:text-lg ${palette.heading}`}>
                            {school.nama}
                          </h2>
                          <p className={`mt-0.5 line-clamp-2 text-xs leading-5 ${palette.heroArtBadgeText}`}>
                            {school.namaYayasan ||
                              "Pusat Kegiatan Belajar Masyarakat penyelenggara pendidikan kesetaraan terpadu."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Official Metadata List */}
                <dl className={`mt-5 divide-y text-sm ${palette.divider}`}>
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt className={`shrink-0 ${palette.mutedText}`}>NPSN</dt>
                    <dd className={`text-right font-bold tabular-nums ${palette.heading}`}>
                      {school.npsn || "Terdaftar"}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt className={`shrink-0 ${palette.mutedText}`}>SK Izin Operasional</dt>
                    <dd className={`text-right font-semibold ${palette.heading}`}>
                      {school.skIzinOperasional || "Terdaftar Resmi"}
                    </dd>
                  </div>
                  {school.namaKetuaPkbm && (
                    <div className="flex items-start justify-between gap-4 py-3">
                      <dt className={`shrink-0 ${palette.mutedText}`}>Kepala / Ketua PKBM</dt>
                      <dd className={`text-right font-semibold ${palette.heading}`}>
                        {school.namaKetuaPkbm}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt className={`shrink-0 ${palette.mutedText}`}>Layanan Program</dt>
                    <dd className={`text-right font-semibold ${palette.heading}`}>
                      Paket A · Paket B · Paket C
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt className={`shrink-0 ${palette.mutedText}`}>Sistem Belajar</dt>
                    <dd className={`text-right font-semibold ${palette.heading}`}>
                      Tatap Muka · Tutorial · Daring
                    </dd>
                  </div>
                </dl>

                {/* Bottom Card Action Row */}
                <div className={`mt-4 flex items-center justify-between gap-4 border-t pt-4 ${palette.divider}`}>
                  <div className="min-w-0">
                    <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${palette.mutedText}`}>
                      Akses Terpadu
                    </p>
                    <p className={`mt-0.5 text-xs font-semibold sm:text-sm ${palette.heading}`}>
                      Guru, Warga Belajar &amp; Admin
                    </p>
                  </div>
                  {contactUrl ? (
                    <a
                      href={contactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition hover:brightness-105"
                      style={{
                        borderColor: hexToRgba(accent, 0.35),
                        backgroundColor: hexToRgba(accent, palette.isDark ? 0.16 : 0.1),
                        color: palette.isDark ? "#f8fafc" : accentDeep,
                      }}
                    >
                      Sekretariat
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  ) : (
                    <Link
                      to={loginPath}
                      aria-label="Masuk ke Portal Belajar"
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition hover:scale-105 ${palette.heroArrowCircle}`}
                    >
                      <ArrowRight size={17} />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Strip matching LandingPage.tsx */}
          <div className="landing-strip border-t">
            <div
              className={`mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 text-xs font-medium sm:px-8 ${palette.bodyText}`}
            >
              <span>Portal pendidikan kesetaraan resmi {school.nama}.</span>
              <span className={`font-semibold ${palette.stripAccent}`}>
                Paket A (SD) &nbsp; / &nbsp; Paket B (SMP) &nbsp; / &nbsp; Paket C (SMA)
              </span>
            </div>
          </div>
        </section>

        {/* 2. Kartu Keunggulan & Program Kesetaraan (Paket A, B, C) */}
        <section id="program" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="glass-panel flex flex-col justify-between gap-5 rounded-3xl p-6 shadow-xl sm:flex-row sm:items-end sm:p-10">
              <div className="max-w-2xl">
                <p className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] ${palette.eyebrow}`}>
                  <span className="h-px w-6" style={{ backgroundColor: accent }} />
                  Program Pendidikan Kesetaraan
                </p>
                <h2 className={`mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl ${palette.heading}`}>
                  Pilihan Jenjang Belajar Fleksibel untuk Semua Usia.
                </h2>
              </div>
              <p className={`max-w-md text-sm leading-6 ${palette.bodyText}`}>
                Setiap jenjang dirancang dengan jadwal fleksibel melalui kombinasi kelas tatap muka,
                bimbingan tutorial, dan akses modul daring 24 jam.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              {EQUALITY_PROGRAMS.map((program, index) => (
                <article
                  key={program.jenjang}
                  className="glass-panel group flex flex-col justify-between rounded-3xl p-7 shadow-xl transition duration-300 hover:-translate-y-1.5 hover:shadow-2xl"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${program.iconBg}`}>
                        {index === 0 ? (
                          <BookOpen size={21} aria-hidden="true" />
                        ) : index === 1 ? (
                          <GraduationCap size={22} aria-hidden="true" />
                        ) : (
                          <Award size={22} aria-hidden="true" />
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                            palette.isDark ? program.pillToneDark : program.pillTone
                          }`}
                        >
                          {program.levelRange}
                        </span>
                        <span className={`font-mono text-xs font-semibold tracking-widest ${palette.mutedText}`}>
                          {program.code}
                        </span>
                      </div>
                    </div>

                    <p className={`mt-7 text-xs font-bold uppercase tracking-[0.16em] ${palette.eyebrow}`}>
                      {program.equivalent}
                    </p>
                    <h3 className={`mt-1.5 text-2xl font-bold tracking-tight ${palette.heading}`}>
                      {program.title}
                    </h3>

                    <p className={`mt-3 text-sm leading-6 ${palette.bodyText}`}>{program.description}</p>

                    <div className={`mt-6 rounded-2xl border p-4 ${palette.innerSurface}`}>
                      <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${palette.mutedText}`}>
                        Sistem Belajar
                      </p>
                      <p className={`mt-1.5 text-xs font-semibold leading-5 ${palette.heading}`}>
                        {program.modes}
                      </p>
                    </div>
                  </div>

                  <div className="mt-7">
                    <button
                      type="button"
                      onClick={() => openPpdbView(program.jenjang)}
                      className="landing-secondary inline-flex w-full items-center justify-between rounded-full px-5 py-3 text-sm font-bold transition group-hover:brightness-105"
                    >
                      <span>Daftar {program.title}</span>
                      <ArrowRight size={16} style={{ color: accent }} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 3. Pengumuman Terbaru (tampil jika showNews aktif) */}
        {school.branding.showNews && (
          <section id="pengumuman" className="scroll-mt-24 px-5 py-14 sm:px-8 sm:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="glass-panel flex flex-col justify-between gap-4 rounded-3xl p-6 shadow-xl sm:flex-row sm:items-end sm:p-10">
                <div className="max-w-2xl">
                  <p className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] ${palette.eyebrow}`}>
                    <span className="h-px w-6" style={{ backgroundColor: accent }} />
                    Informasi Lembaga
                  </p>
                  <h2 className={`mt-4 text-3xl font-semibold tracking-tight sm:text-4xl ${palette.heading}`}>
                    Pengumuman Terbaru
                  </h2>
                  <p className={`mt-2 text-sm leading-6 ${palette.bodyText}`}>
                    Pemberitahuan resmi jadwal pembelajaran, penerimaan warga belajar, dan ujian
                    kesetaraan dari {school.nama}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openPpdbView()}
                  className="landing-secondary inline-flex shrink-0 items-center gap-2 self-start whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold transition sm:self-auto"
                >
                  Pendaftaran PPDB Online
                  <ArrowRight size={15} style={{ color: accent }} aria-hidden="true" />
                </button>
              </div>

              {school.branding.announcements.length > 0 ? (
                <div className="mt-8 grid gap-5 md:grid-cols-2">
                  {school.branding.announcements.map((item) => {
                    const formatted = formatDateId(item.tanggal);
                    return (
                      <article
                        key={item.id}
                        className="glass-panel rounded-3xl p-6 shadow-xl transition duration-300 hover:-translate-y-1 hover:shadow-2xl sm:p-7"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${palette.innerSurface} ${palette.mutedText}`}
                          >
                            <Calendar size={13} style={{ color: accent }} aria-hidden="true" />
                            <span>{formatted || "Informasi Resmi Lembaga"}</span>
                          </span>
                          <Bell size={15} style={{ color: accent }} aria-hidden="true" />
                        </div>
                        <h3 className={`mt-4 text-lg font-bold tracking-tight ${palette.heading}`}>
                          {item.judul}
                        </h3>
                        {item.ringkasan && (
                          <p className={`mt-2.5 text-sm leading-6 ${palette.bodyText}`}>
                            {item.ringkasan}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="glass-panel mt-8 grid gap-6 rounded-3xl p-6 shadow-xl sm:p-8 lg:grid-cols-12 lg:items-center">
                  <div className="lg:col-span-8">
                    <div
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${palette.innerSurface} ${palette.eyebrow}`}
                    >
                      <Bell size={13} style={{ color: accent }} aria-hidden="true" />
                      <span>Papan Informasi Resmi PKBM</span>
                    </div>
                    <h3 className={`mt-3 text-xl font-bold tracking-tight ${palette.heading}`}>
                      Belum ada pengumuman terbaru yang dipublikasikan
                    </h3>
                    <p className={`mt-2 text-sm leading-6 ${palette.bodyText}`}>
                      Pengumuman jadwal belajar tatap muka, jadwal ujian kesetaraan, dan info
                      kegiatan warga belajar akan otomatis muncul di bagian ini setelah diterbitkan
                      oleh admin {school.nama}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
                    <Link
                      to={loginPath}
                      className="landing-secondary inline-flex items-center gap-2 whitespace-nowrap rounded-full px-5 py-3 text-sm font-bold transition"
                    >
                      <BookOpen size={15} style={{ color: accent }} aria-hidden="true" />
                      Cek Info di Portal Belajar
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 4. Galeri Kegiatan PKBM (tampil jika showGallery aktif) */}
        {school.branding.showGallery && (
          <section id="galeri" className="scroll-mt-24 px-5 py-14 sm:px-8 sm:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="glass-panel flex flex-col justify-between gap-4 rounded-3xl p-6 shadow-xl sm:flex-row sm:items-end sm:p-10">
                <div className="max-w-2xl">
                  <p className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] ${palette.eyebrow}`}>
                    <span className="h-px w-6" style={{ backgroundColor: accent }} />
                    Dokumentasi Aktivitas
                  </p>
                  <h2 className={`mt-4 text-3xl font-semibold tracking-tight sm:text-4xl ${palette.heading}`}>
                    Galeri Kegiatan PKBM
                  </h2>
                </div>
                <p className={`max-w-md text-sm leading-6 ${palette.bodyText}`}>
                  Potret suasana kegiatan pembelajaran, pembinaan keterampilan, dan aktivitas warga
                  belajar di lingkungan {school.nama}.
                </p>
              </div>

              {school.branding.gallery.length > 0 ? (
                <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {school.branding.gallery.map((item) => (
                    <figure
                      key={item.id}
                      className="glass-panel group overflow-hidden rounded-3xl shadow-xl transition duration-300 hover:-translate-y-1.5 hover:shadow-2xl"
                    >
                      <GalleryCardImage item={item} accent={accent} palette={palette} />
                      <figcaption className="p-6">
                        <h3 className={`text-base font-bold tracking-tight ${palette.heading}`}>
                          {item.judul}
                        </h3>
                        <p className={`mt-1.5 text-xs leading-5 ${palette.bodyText}`}>
                          {item.keterangan}
                        </p>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                  {GALLERY_PLACEHOLDERS.map((slot, index) => (
                    <article
                      key={slot.id}
                      className="glass-panel group overflow-hidden rounded-3xl shadow-xl transition duration-300 hover:-translate-y-1.5 hover:shadow-2xl"
                    >
                      <div
                        className={`relative flex aspect-[4/3] flex-col items-center justify-center gap-3 overflow-hidden border-b px-6 text-center ${palette.divider} ${palette.heroArtShell}`}
                      >
                        <div className={`absolute inset-0 ${palette.heroArtGradient}`} />
                        <div
                          className={`pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full border-[18px] ${palette.heroArtCircle}`}
                        />
                        <div
                          className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border shadow-md backdrop-blur-md ${palette.badgeSurface}`}
                        >
                          {index === 0 ? (
                            <GraduationCap size={22} style={{ color: accent }} aria-hidden="true" />
                          ) : index === 1 ? (
                            <Building2 size={22} style={{ color: accent }} aria-hidden="true" />
                          ) : (
                            <ImageIcon size={22} style={{ color: accent }} aria-hidden="true" />
                          )}
                        </div>
                        <p className={`relative text-xs font-semibold ${palette.heroArtCaption}`}>
                          Dokumentasi Aktivitas PKBM
                        </p>
                      </div>
                      <div className="p-6">
                        <h3 className={`text-base font-bold tracking-tight ${palette.heading}`}>
                          {slot.judul}
                        </h3>
                        <p className={`mt-1.5 text-xs leading-5 ${palette.bodyText}`}>
                          {slot.keterangan}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 5. Ajakan Aksi Penutup matching LandingPage.tsx */}
        <section className="px-5 py-16 sm:px-8 sm:py-24">
          <div className="glass-panel relative mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 overflow-hidden rounded-3xl p-7 shadow-xl sm:p-10 lg:flex-row lg:items-center">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full blur-3xl"
              style={{ backgroundColor: hexToRgba(accent, palette.isDark ? 0.2 : 0.16) }}
            />
            <div className="relative max-w-2xl">
              <p className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] ${palette.eyebrow}`}>
                <span className="h-px w-6" style={{ backgroundColor: accent }} />
                Mulai Langkah Pendidikan Anda
              </p>
              <h2 className={`mt-4 text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-4xl ${palette.heading}`}>
                Siap Melanjutkan Pendidikan Bersama {school.nama}?
              </h2>
              <p className={`mt-3 text-sm leading-7 ${palette.bodyText}`}>
                Daftarkan diri melalui PPDB Online untuk mendapatkan kode registrasi resmi, atau
                masuk ke Portal Belajar jika Anda sudah terdaftar sebagai warga belajar maupun
                tutor.
              </p>
            </div>
            <div className="relative flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => openPpdbView()}
                className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full px-6 py-4 text-sm font-bold transition hover:-translate-y-0.5 hover:brightness-110"
                style={accentButtonStyle}
              >
                <UserPlus size={16} aria-hidden="true" />
                Daftar PPDB Online
                <ArrowRight size={16} aria-hidden="true" />
              </button>
              <Link
                to={loginPath}
                className="landing-secondary inline-flex items-center gap-2 whitespace-nowrap rounded-full px-6 py-4 text-sm font-semibold transition hover:-translate-y-0.5"
              >
                <LogIn size={16} aria-hidden="true" />
                Masuk Portal Belajar
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Modern Dark/Gradient Footer */}
      <footer
        id="kontak"
        className="relative overflow-hidden border-t border-white/15 bg-gradient-to-br from-[#07111f] via-[#0c1b36] to-[#0f172a] text-slate-300"
      >
        <div
          aria-hidden="true"
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, ${accent}, ${shiftHexColor(accent, 0.25)}, ${accentDeep})`,
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: hexToRgba(accent, 0.16) }}
        />

        <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-3.5">
                <BrandLogo
                  src={school.logoUrl}
                  alt={`Logo ${school.nama}`}
                  className="h-11 w-11 shrink-0 rounded-xl border border-white/15 bg-white p-1 shadow-md"
                />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold tracking-tight text-white">
                    {school.nama}
                  </p>
                  <p className="text-xs text-slate-400 tabular-nums">
                    NPSN: {school.npsn || "Terdaftar"}
                    {school.skIzinOperasional ? ` · Izin: ${school.skIzinOperasional}` : ""}
                  </p>
                </div>
              </div>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-300/90">
                {cleanFooterAddress}
              </p>
            </div>

            <div className="md:col-span-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white/90">
                Kontak Sekretariat
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                {school.teleponWa && (
                  <li className="flex items-center gap-2.5">
                    <Phone size={15} className="shrink-0" style={{ color: shiftHexColor(accent, 0.35) }} aria-hidden="true" />
                    {contactUrl ? (
                      <a
                        href={contactUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition hover:text-white hover:underline"
                      >
                        {school.teleponWa}
                      </a>
                    ) : (
                      <span>{school.teleponWa}</span>
                    )}
                  </li>
                )}
                {school.emailSekolah && (
                  <li className="flex items-center gap-2.5">
                    <Mail size={15} className="shrink-0" style={{ color: shiftHexColor(accent, 0.35) }} aria-hidden="true" />
                    <a
                      href={`mailto:${school.emailSekolah}`}
                      className="transition hover:text-white hover:underline"
                    >
                      {school.emailSekolah}
                    </a>
                  </li>
                )}
                {school.websiteSekolah && (
                  <li className="flex items-center gap-2.5">
                    <Globe size={15} className="shrink-0" style={{ color: shiftHexColor(accent, 0.35) }} aria-hidden="true" />
                    <span>{school.websiteSekolah}</span>
                  </li>
                )}
                {!school.teleponWa && !school.emailSekolah && !school.websiteSekolah && (
                  <li className="text-slate-400">
                    Informasi kontak dapat dikonfirmasi langsung ke kantor sekretariat lembaga.
                  </li>
                )}
              </ul>
            </div>

            <div className="md:col-span-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white/90">
                Tautan Cepat
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
                <li>
                  <a href="#program" className="transition hover:text-white hover:underline">
                    Program Paket A, B &amp; C
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openPpdbView()}
                    className="transition hover:text-white hover:underline"
                  >
                    Formulir PPDB Online
                  </button>
                </li>
                <li>
                  <Link to={loginPath} className="transition hover:text-white hover:underline">
                    Masuk Portal Belajar
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs leading-5 text-slate-400 sm:flex-row sm:items-center">
            <p>{school.branding.footerText}</p>
            <p className="text-slate-500">Pendidikan Kesetaraan Terpadu</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
