import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  Award,
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Database,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Home,
  KeyRound,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  MonitorCheck,
  Package,
  Palette,
  QrCode,
  RefreshCw,
  Server,
  Settings,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { SchoolData, type SchoolDataKind } from "./SchoolData";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { LoginNavigation } from "./LoginNavigation";
import { CardGridSkeleton, DashboardHero, PortalSpinner } from "./DashboardUI";
import { Classroom } from "./Classroom";
import { isThemeKey, TenantThemeProvider, useTenantTheme, type ThemeKey } from "./TenantThemeProvider";
import { getCached, invalidateCache, prefetchCoreSchoolData, prefetchForView, setCached, setCacheScope } from "./schoolCache";
import { resetStandardClassesCache } from "./standardClasses";
import {
  clearAuthCache,
  deriveTenantSlugFromHost,
  formatSlugDisplayName,
  getAuthCache,
  getCachedTenantProfile,
  saveAuthCache,
  saveCachedTenantProfile,
  type SchoolAuthCache,
} from "./authSessionCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { getPlanBySlug, hasPlanAccess, resolvePlanSlug, type PlanSlug } from "./subscriptionPlans";
import { ModulePlaceholderView, type DevelopmentModuleId } from "./ModulePlaceholderView";
import {
  DevSandboxLmsPreview,
  DevSandboxToolbar,
  type SandboxMode,
  type SandboxRole,
  type SandboxSamples,
} from "./DevSandbox";
import {
  SchoolAcademicRecap,
  SchoolAdvancedSettingsView,
  SchoolBulkPlacementView,
  SchoolImportPanel,
  SchoolThemeIdentityView,
  UpgradePlanModal,
} from "./SchoolTierViews";
import { VervalDapodikView } from "./VervalDapodikView";

const DEVELOPER_EMAIL = "ismantoj88@gmail.com";

type SchoolView =
  | SchoolDataKind
  | DevelopmentModuleId
  | "dashboard"
  | "password"
  | "ruang-kbm"
  | "impor-dapodik"
  | "penempatan-kelas"
  | "verval-dapodik"
  | "presensi"
  | "rekap-akademik"
  | "tema-identitas"
  | "pengaturan-lanjutan";

type SchoolMenuItem = {
  label: string;
  icon: LucideIcon;
  target: Exclude<SchoolView, "dashboard">;
  requiredPlan?: Exclude<PlanSlug, "basic">;
  inDevelopment?: boolean;
};

const DATA_KINDS = new Set<SchoolView>(["siswa", "guru", "ppdb", "kelas", "mapel", "akademik"]);

const DEV_MODULE_SET = new Set<SchoolView>([
  "modul-kesetaraan",
  "akreditasi-snp",
  "agenda-mengajar",
  "data-alumni",
  "cek-raport",
  "cbt-bank-soal",
  "cbt-jadwal",
  "cbt-monitoring",
  "cbt-pengaturan",
  "keuangan-spp",
  "ruang-diskusi",
  "asisten-ai",
  "manajemen-aset",
  "kartu-digital-qr",
]);

function isSchoolDataKind(view: SchoolView): view is SchoolDataKind {
  return DATA_KINDS.has(view);
}

function isDevelopmentModule(view: SchoolView): view is DevelopmentModuleId {
  return DEV_MODULE_SET.has(view);
}

const masterItems: SchoolMenuItem[] = [
  { label: "Data Siswa", icon: Users, target: "siswa" },
  { label: "Data Guru", icon: GraduationCap, target: "guru" },
  { label: "Kelola Mapel", icon: BookOpen, target: "mapel" },
  { label: "Manajemen Kelas", icon: Building2, target: "kelas" },
  { label: "PPDB Online", icon: ClipboardList, target: "ppdb" },
  { label: "Verval Dapodik", icon: ClipboardCheck, target: "verval-dapodik" },
  { label: "Modul Kesetaraan", icon: Layers, target: "modul-kesetaraan", requiredPlan: "reguler", inDevelopment: true },
  { label: "Akreditasi 8 SNP", icon: ShieldCheck, target: "akreditasi-snp", requiredPlan: "pro", inDevelopment: true },
];

const academicItems: SchoolMenuItem[] = [
  { label: "Tahun & Jadwal", icon: CalendarDays, target: "akademik" },
  { label: "Agenda & Jurnal Mengajar", icon: FileText, target: "agenda-mengajar", inDevelopment: true },
  { label: "Presensi Warga Belajar", icon: UserCheck, target: "presensi", requiredPlan: "reguler" },
  { label: "Ruang KBM & Materi", icon: BookOpen, target: "ruang-kbm" },
  { label: "Data Alumni (Tracer Study)", icon: Briefcase, target: "data-alumni", requiredPlan: "reguler", inDevelopment: true },
  { label: "Kenaikan Kelas Massal", icon: ArrowLeftRight, target: "penempatan-kelas", requiredPlan: "reguler" },
  { label: "Cek & Cetak E-Raport", icon: ClipboardCheck, target: "cek-raport", requiredPlan: "reguler", inDevelopment: true },
  { label: "Analitik & Rekap Nilai", icon: BarChart3, target: "rekap-akademik", requiredPlan: "reguler" },
];

const cbtItems: SchoolMenuItem[] = [
  { label: "Kelola Bank Soal & Ujian", icon: Database, target: "cbt-bank-soal", requiredPlan: "reguler", inDevelopment: true },
  { label: "Jadwal Ujian CBT", icon: CalendarDays, target: "cbt-jadwal", requiredPlan: "reguler", inDevelopment: true },
  { label: "Monitoring Ujian Live", icon: MonitorCheck, target: "cbt-monitoring", requiredPlan: "reguler", inDevelopment: true },
  { label: "Pengaturan Ujian", icon: SlidersHorizontal, target: "cbt-pengaturan", requiredPlan: "reguler", inDevelopment: true },
];

const standaloneItems: SchoolMenuItem[] = [
  { label: "Keuangan & SPP", icon: Wallet, target: "keuangan-spp", requiredPlan: "pro", inDevelopment: true },
  { label: "Ruang Diskusi", icon: MessageSquare, target: "ruang-diskusi", inDevelopment: true },
  { label: "Asisten Belajar AI", icon: Bot, target: "asisten-ai", requiredPlan: "pro", inDevelopment: true },
  { label: "Tema & Identitas Sekolah", icon: Palette, target: "tema-identitas", requiredPlan: "pro" },
  { label: "Manajemen Aset & Sarpras", icon: Package, target: "manajemen-aset", requiredPlan: "pro", inDevelopment: true },
  { label: "Kartu Pelajar Digital QR", icon: QrCode, target: "kartu-digital-qr", requiredPlan: "pro", inDevelopment: true },
  { label: "Ganti Password", icon: KeyRound, target: "password" },
];

const MENU_ICON_MAP = new Map<SchoolView, LucideIcon>(
  [...masterItems, ...academicItems, ...cbtItems, ...standaloneItems].map((item) => [item.target, item.icon])
);

const PLAN_BADGE_STYLES: Record<PlanSlug, { label: string; sidebarClass: string; headerClass: string }> = {
  basic: {
    label: "PAKET BASIC",
    sidebarClass: "border-slate-500/50 bg-slate-700/70 text-slate-100",
    headerClass: "border-slate-300 bg-slate-100 text-slate-900",
  },
  reguler: {
    label: "PAKET REGULER",
    sidebarClass: "border-cyan-400/50 bg-cyan-500/20 text-cyan-100",
    headerClass: "border-indigo-300 bg-indigo-100 text-indigo-950",
  },
  pro: {
    label: "PAKET PRO",
    sidebarClass: "border-amber-400/60 bg-amber-500/25 text-amber-100",
    headerClass: "border-amber-300 bg-amber-100 text-amber-950",
  },
};

type SidebarThemePalette = {
  aside: string;
  headerDivider: string;
  identityCard: string;
  avatar: string;
  schoolName: string;
  roleText: string;
  closeBtn: string;
  dashboardActive: string;
  dashboardActiveIcon: string;
  dashboardInactive: string;
  dashboardInactiveIcon: string;
  sectionLabel: string;
  groupButton: string;
  groupIcon: string;
  groupBorder: string;
  itemActive: string;
  itemActiveIcon: string;
  itemInactive: string;
  itemLocked: string;
  itemIcon: string;
  devBadge: string;
  proBadgeActive: string;
  proBadgeLocked: string;
  regBadgeActive: string;
  regBadgeLocked: string;
  standaloneDivider: string;
  footerDivider: string;
  tierCard: string;
  tierLabel: string;
  refreshBtn: string;
  logoutBtn: string;
  useLightBadges: boolean;
  headerSchoolPill: string;
  headerAvatar: string;
  headerMenuBtn: string;
  mobileAccentText: string;
  mobileAccentBg: string;
  mobileFab: string;
};

const SIDEBAR_THEMES: Record<ThemeKey, SidebarThemePalette> = {
  ocean: {
    aside:
      "border-sky-200/90 bg-gradient-to-b from-white/90 via-sky-50/90 to-cyan-100/80 text-slate-800 shadow-[4px_0_24px_rgba(3,105,161,0.08)] backdrop-blur-xl",
    headerDivider: "border-sky-200/80",
    identityCard: "border-sky-200/90 bg-white/85 shadow-xs",
    avatar: "bg-gradient-to-tr from-sky-700 to-cyan-500 text-white shadow-sm",
    schoolName: "text-sky-950",
    roleText: "text-sky-700",
    closeBtn: "text-slate-600 hover:bg-sky-100 hover:text-sky-950",
    dashboardActive: "bg-gradient-to-r from-sky-700 via-cyan-700 to-teal-700 text-white shadow-md shadow-sky-900/15",
    dashboardActiveIcon: "bg-white/20 text-white",
    dashboardInactive: "text-slate-700 hover:bg-sky-100/80 hover:text-sky-950",
    dashboardInactiveIcon: "bg-sky-100 text-sky-700",
    sectionLabel: "text-sky-900/65",
    groupButton: "text-slate-800 hover:bg-sky-100/80 hover:text-sky-950",
    groupIcon: "bg-sky-100 text-sky-700",
    groupBorder: "border-sky-200/90",
    itemActive: "border border-sky-300/90 bg-white/95 text-sky-950 shadow-xs",
    itemActiveIcon: "bg-gradient-to-br from-sky-600 to-cyan-500 text-white shadow-xs",
    itemInactive: "text-slate-700 hover:bg-sky-100/75 hover:text-sky-950",
    itemLocked: "text-slate-500 hover:bg-sky-100/50 hover:text-slate-800",
    itemIcon: "bg-sky-100/80 text-sky-700",
    devBadge: "border-sky-300 bg-sky-100 text-sky-900",
    proBadgeActive: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
    proBadgeLocked: "bg-amber-50 text-amber-800 ring-1 ring-amber-300",
    regBadgeActive: "bg-cyan-100 text-cyan-900 ring-1 ring-cyan-300",
    regBadgeLocked: "bg-cyan-50 text-cyan-800 ring-1 ring-cyan-300",
    standaloneDivider: "border-sky-200/80",
    footerDivider: "border-sky-200/80",
    tierCard: "border-sky-200/90 bg-white/85 shadow-xs",
    tierLabel: "text-slate-700",
    refreshBtn: "text-sky-700 hover:bg-sky-100 hover:text-sky-950",
    logoutBtn: "border-rose-200 bg-rose-50/90 text-rose-700 hover:bg-rose-100",
    useLightBadges: true,
    headerSchoolPill: "bg-sky-100/90 text-sky-950",
    headerAvatar: "bg-gradient-to-br from-sky-600 to-cyan-500",
    headerMenuBtn: "hover:bg-sky-100 text-sky-900",
    mobileAccentText: "text-sky-700",
    mobileAccentBg: "bg-sky-100/90",
    mobileFab: "bg-gradient-to-br from-sky-600 to-cyan-500",
  },
  emerald: {
    aside:
      "border-emerald-200/90 bg-gradient-to-b from-white/90 via-emerald-50/90 to-teal-100/80 text-slate-800 shadow-[4px_0_24px_rgba(4,120,87,0.08)] backdrop-blur-xl",
    headerDivider: "border-emerald-200/80",
    identityCard: "border-emerald-200/90 bg-white/85 shadow-xs",
    avatar: "bg-gradient-to-tr from-emerald-700 to-teal-500 text-white shadow-sm",
    schoolName: "text-emerald-950",
    roleText: "text-emerald-700",
    closeBtn: "text-slate-600 hover:bg-emerald-100 hover:text-emerald-950",
    dashboardActive: "bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 text-white shadow-md shadow-emerald-900/15",
    dashboardActiveIcon: "bg-white/20 text-white",
    dashboardInactive: "text-slate-700 hover:bg-emerald-100/80 hover:text-emerald-950",
    dashboardInactiveIcon: "bg-emerald-100 text-emerald-700",
    sectionLabel: "text-emerald-900/65",
    groupButton: "text-slate-800 hover:bg-emerald-100/80 hover:text-emerald-950",
    groupIcon: "bg-emerald-100 text-emerald-700",
    groupBorder: "border-emerald-200/90",
    itemActive: "border border-emerald-300/90 bg-white/95 text-emerald-950 shadow-xs",
    itemActiveIcon: "bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-xs",
    itemInactive: "text-slate-700 hover:bg-emerald-100/75 hover:text-emerald-950",
    itemLocked: "text-slate-500 hover:bg-emerald-100/50 hover:text-slate-800",
    itemIcon: "bg-emerald-100/80 text-emerald-700",
    devBadge: "border-sky-300 bg-sky-100 text-sky-900",
    proBadgeActive: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
    proBadgeLocked: "bg-amber-50 text-amber-800 ring-1 ring-amber-300",
    regBadgeActive: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300",
    regBadgeLocked: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300",
    standaloneDivider: "border-emerald-200/80",
    footerDivider: "border-emerald-200/80",
    tierCard: "border-emerald-200/90 bg-white/85 shadow-xs",
    tierLabel: "text-slate-700",
    refreshBtn: "text-emerald-700 hover:bg-emerald-100 hover:text-emerald-950",
    logoutBtn: "border-rose-200 bg-rose-50/90 text-rose-700 hover:bg-rose-100",
    useLightBadges: true,
    headerSchoolPill: "bg-emerald-100/90 text-emerald-950",
    headerAvatar: "bg-gradient-to-br from-emerald-600 to-teal-500",
    headerMenuBtn: "hover:bg-emerald-100 text-emerald-900",
    mobileAccentText: "text-emerald-700",
    mobileAccentBg: "bg-emerald-100/90",
    mobileFab: "bg-gradient-to-br from-emerald-600 to-teal-500",
  },
  sunset: {
    aside:
      "border-fuchsia-200/90 bg-gradient-to-b from-white/90 via-fuchsia-50/85 to-rose-100/80 text-slate-800 shadow-[4px_0_24px_rgba(162,28,175,0.08)] backdrop-blur-xl",
    headerDivider: "border-fuchsia-200/80",
    identityCard: "border-fuchsia-200/90 bg-white/85 shadow-xs",
    avatar: "bg-gradient-to-tr from-violet-600 to-fuchsia-500 text-white shadow-sm",
    schoolName: "text-violet-950",
    roleText: "text-violet-700",
    closeBtn: "text-slate-600 hover:bg-fuchsia-100 hover:text-violet-950",
    dashboardActive: "bg-gradient-to-r from-violet-700 via-fuchsia-700 to-rose-600 text-white shadow-md shadow-violet-900/15",
    dashboardActiveIcon: "bg-white/20 text-white",
    dashboardInactive: "text-slate-700 hover:bg-fuchsia-100/80 hover:text-violet-950",
    dashboardInactiveIcon: "bg-fuchsia-100 text-violet-700",
    sectionLabel: "text-violet-900/65",
    groupButton: "text-slate-800 hover:bg-fuchsia-100/80 hover:text-violet-950",
    groupIcon: "bg-fuchsia-100 text-violet-700",
    groupBorder: "border-fuchsia-200/90",
    itemActive: "border border-fuchsia-300/90 bg-white/95 text-violet-950 shadow-xs",
    itemActiveIcon: "bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-xs",
    itemInactive: "text-slate-700 hover:bg-fuchsia-100/75 hover:text-violet-950",
    itemLocked: "text-slate-500 hover:bg-fuchsia-100/50 hover:text-slate-800",
    itemIcon: "bg-fuchsia-100/80 text-violet-700",
    devBadge: "border-violet-300 bg-violet-100 text-violet-900",
    proBadgeActive: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
    proBadgeLocked: "bg-amber-50 text-amber-800 ring-1 ring-amber-300",
    regBadgeActive: "bg-fuchsia-100 text-fuchsia-900 ring-1 ring-fuchsia-300",
    regBadgeLocked: "bg-fuchsia-50 text-fuchsia-800 ring-1 ring-fuchsia-300",
    standaloneDivider: "border-fuchsia-200/80",
    footerDivider: "border-fuchsia-200/80",
    tierCard: "border-fuchsia-200/90 bg-white/85 shadow-xs",
    tierLabel: "text-slate-700",
    refreshBtn: "text-violet-700 hover:bg-fuchsia-100 hover:text-violet-950",
    logoutBtn: "border-rose-200 bg-rose-50/90 text-rose-700 hover:bg-rose-100",
    useLightBadges: true,
    headerSchoolPill: "bg-fuchsia-100/90 text-violet-950",
    headerAvatar: "bg-gradient-to-br from-violet-600 to-fuchsia-500",
    headerMenuBtn: "hover:bg-fuchsia-100 text-violet-900",
    mobileAccentText: "text-violet-700",
    mobileAccentBg: "bg-fuchsia-100/90",
    mobileFab: "bg-gradient-to-br from-violet-600 to-fuchsia-500",
  },
  dark: {
    aside: "border-slate-800/80 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-200",
    headerDivider: "border-slate-800/80",
    identityCard: "border-slate-700/60 bg-slate-800/50",
    avatar: "bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-sm",
    schoolName: "text-white",
    roleText: "text-emerald-300",
    closeBtn: "text-slate-300 hover:bg-slate-800",
    dashboardActive: "bg-gradient-to-r from-emerald-700 via-teal-700 to-slate-700 text-white shadow-md",
    dashboardActiveIcon: "bg-white/15 text-white",
    dashboardInactive: "text-slate-300 hover:bg-slate-800/70 hover:text-white",
    dashboardInactiveIcon: "bg-slate-800/80 text-slate-300",
    sectionLabel: "text-slate-400 opacity-75",
    groupButton: "text-slate-200 hover:bg-slate-800/80",
    groupIcon: "bg-slate-800/80 text-slate-300",
    groupBorder: "border-slate-700/70",
    itemActive: "border border-white/15 bg-white/10 text-white shadow-inner backdrop-blur-md",
    itemActiveIcon: "bg-gradient-to-br from-emerald-500 to-teal-500 text-white",
    itemInactive: "text-slate-300 hover:bg-white/10 hover:text-white",
    itemLocked: "text-slate-400 hover:bg-white/5 hover:text-slate-200",
    itemIcon: "bg-slate-800/70 text-slate-300",
    devBadge: "border-sky-400/30 bg-sky-500/15 text-sky-200",
    proBadgeActive: "bg-amber-400/20 text-amber-200",
    proBadgeLocked: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30",
    regBadgeActive: "bg-cyan-400/20 text-cyan-200",
    regBadgeLocked: "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30",
    standaloneDivider: "border-slate-800/70",
    footerDivider: "border-slate-800/80",
    tierCard: "border-slate-700/60 bg-slate-800/50",
    tierLabel: "text-slate-300",
    refreshBtn: "text-slate-300 hover:bg-slate-700/70 hover:text-white",
    logoutBtn: "border-rose-900/60 bg-rose-950/25 text-rose-300 hover:bg-rose-950/50",
    useLightBadges: false,
    headerSchoolPill: "bg-slate-800 text-slate-100",
    headerAvatar: "bg-gradient-to-br from-emerald-600 to-teal-500",
    headerMenuBtn: "hover:bg-slate-800 text-slate-200",
    mobileAccentText: "text-indigo-600",
    mobileAccentBg: "bg-indigo-50/80",
    mobileFab: "bg-gradient-to-br from-emerald-600 to-teal-500",
  },
};

export function SchoolLogin() {
  const hostSlug = deriveTenantSlugFromHost();
  const initialProfile = hostSlug ? getCachedTenantProfile(hostSlug) : null;
  const [schoolName, setSchoolName] = useState<string>(() => initialProfile?.nama ?? formatSlugDisplayName(hostSlug));
  const [logoUrl, setLogoUrl] = useState<string | null>(() => initialProfile?.logoUrl ?? null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordHelp, setShowPasswordHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = hostSlug ? `/api/public/sekolah/${encodeURIComponent(hostSlug)}` : "/api/public/sekolah";
    fetchWithTimeout(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as {
          nama?: string;
          slug?: string;
          logoUrl?: string | null;
          themeKey?: string;
          plan?: string;
        };
        if (typeof data.nama === "string" && data.nama.trim()) {
          setSchoolName(data.nama);
          setLogoUrl(typeof data.logoUrl === "string" && data.logoUrl ? data.logoUrl : null);
          saveCachedTenantProfile(data.slug || hostSlug, {
            nama: data.nama,
            slug: data.slug || hostSlug,
            logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : null,
            themeKey: data.themeKey,
            plan: data.plan,
          });
        }
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          // Keep optimistic slug/localStorage branding silently
        }
      });
    return () => controller.abort();
  }, [hostSlug]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetchWithTimeout("/api/auth/sekolah/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        let message = "Layanan login sekolah tidak tersedia.";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const data: unknown = await response.json();
          if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") message = data.error;
        }
        throw new Error(message);
      }
      try {
        const data: unknown = await response.json();
        if (typeof data === "object" && data !== null) {
          const payload = data as {
            token?: string;
            nama?: string;
            email?: string | null;
            isDeveloper?: boolean;
            sekolah?: string;
            slug?: string;
            plan?: string;
            rawPlan?: string | null;
            themeKey?: string;
            user?: SchoolAuthCache["user"];
          };
          const resolvedSlug = typeof payload.slug === "string" ? payload.slug : hostSlug;
          const resolvedSchool = typeof payload.sekolah === "string" && payload.sekolah ? payload.sekolah : schoolName;
          if (resolvedSlug) setCacheScope(resolvedSlug);
          saveAuthCache<SchoolAuthCache>("sekolah", {
            token: payload.token,
            nama: typeof payload.nama === "string" ? payload.nama : email,
            email: payload.email ?? email,
            isDeveloper: payload.isDeveloper === true,
            sekolah: resolvedSchool,
            slug: resolvedSlug,
            plan: resolvePlanSlug(payload.plan ?? payload.rawPlan ?? null),
            rawPlan: payload.rawPlan ?? null,
            themeKey: payload.themeKey,
            user: payload.user,
            updatedAt: Date.now(),
          });
          if (resolvedSlug) {
            saveCachedTenantProfile(resolvedSlug, {
              nama: resolvedSchool,
              slug: resolvedSlug,
              logoUrl,
              themeKey: payload.themeKey,
              plan: payload.plan,
            });
          }
        }
      } catch {
        // Session cookie is already active even if optional JSON hydration fails
      }
      setPassword("");
      navigate("/sekolah");
    } catch (failure) {
      setError(describeFetchError(failure, "Login gagal."));
    } finally {
      setBusy(false);
    }
  }

  return <main className="glass-shell glass-login-shell flex min-h-screen items-center justify-center px-5 py-5"><div className="glass-panel glass-login w-full max-w-md rounded-3xl p-6">
    <div className="flex items-center gap-3">
      {logoUrl ? (
        <img src={logoUrl} alt={`Logo ${schoolName}`} className="h-11 w-11 rounded-xl border border-white/20 object-cover shadow-sm" />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-base font-black text-white shadow-sm">
          {schoolName.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="master-eyebrow">KESETARAAN LMS / SEKOLAH</p>
        <p className="truncate text-xs font-bold text-slate-600">{schoolName}</p>
      </div>
    </div>
    <h1 className="mt-3 text-2xl font-bold">Login Admin Sekolah</h1>
    <p className="mt-2 text-sm text-slate-700">Masuk menggunakan akun admin sekolah Anda.</p>
    {location.state?.passwordChanged === true && <p role="status" className="mt-4 text-sm text-green-700">Password berhasil diganti. Silakan masuk kembali.</p>}
    <LoginNavigation />
    <form onSubmit={submit} className="mt-4 space-y-4">
      <label className="block text-sm font-semibold">Email<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="glass-input mt-2 w-full rounded-xl px-4 py-3" /></label>
      <div><div className="flex items-center justify-between gap-2"><label htmlFor="school-login-password" className="text-sm font-semibold">Kata sandi</label><button type="button" aria-expanded={showPasswordHelp} aria-controls="school-password-help" onClick={() => setShowPasswordHelp((visible) => !visible)} className="text-sm font-semibold text-indigo-800 underline">Lupa password</button></div><div className="relative mt-2"><input id="school-login-password" type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="glass-input w-full rounded-xl py-3 pl-4 pr-12" /><button type="button" aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-600"><span aria-hidden="true">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</span></button></div><p id="school-password-help" hidden={!showPasswordHelp} className="mt-2 text-sm text-slate-700">Pemulihan melalui email belum tersedia. Hubungi pengelola Rasyatech Admin untuk bantuan akses akun.</p></div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<button disabled={busy} className="master-primary w-full py-3 disabled:opacity-50">{busy ? "Memeriksa..." : "Masuk"}</button>
    </form>
    <Link to="/" className="mt-4 inline-block text-sm font-semibold text-indigo-800 underline">Kembali ke beranda</Link>
  </div></main>;
}

export function SchoolHome() {
  const initialAuth = getAuthCache<SchoolAuthCache>("sekolah");
  const fallbackSlug = initialAuth?.slug || deriveTenantSlugFromHost();
  if (fallbackSlug) {
    setCacheScope(fallbackSlug);
  }
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "error">(() => (initialAuth ? "ready" : "loading"));
  const [school, setSchool] = useState(() => initialAuth?.sekolah || formatSlugDisplayName(fallbackSlug));
  const [slug, setSlug] = useState(() => fallbackSlug);
  const [plan, setPlan] = useState<PlanSlug>(() => (initialAuth ? resolvePlanSlug(initialAuth.plan ?? initialAuth.rawPlan ?? null) : "basic"));
  const [cachedTheme, setCachedTheme] = useState<ThemeKey | undefined>(() =>
    initialAuth?.themeKey && isThemeKey(initialAuth.themeKey) ? initialAuth.themeKey : undefined,
  );
  const [isDeveloper, setIsDeveloper] = useState(() =>
    Boolean(
      initialAuth?.isDeveloper === true ||
        (typeof initialAuth?.email === "string" && initialAuth.email.trim().toLowerCase() === DEVELOPER_EMAIL),
    ),
  );
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>("dev");
  const [sandboxRole, setSandboxRole] = useState<SandboxRole>("ADMIN");
  const [samples, setSamples] = useState<SandboxSamples | null>(null);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<SchoolView>("dashboard");
  const [transitionAlternate, setTransitionAlternate] = useState(false);
  const [dataKind, setDataKind] = useState<SchoolDataKind>("siswa");
  const [menuOpen, setMenuOpen] = useState(false);
  const [masterOpen, setMasterOpen] = useState(true);
  const [academicOpen, setAcademicOpen] = useState(false);
  const [cbtOpen, setCbtOpen] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState<{ featureName: string; requiredPlan: Exclude<PlanSlug, "basic"> } | null>(null);
  const [refreshingPlan, setRefreshingPlan] = useState(false);
  const navigate = useNavigate();

  async function refreshSessionProfile(options?: { signal?: AbortSignal; manual?: boolean }) {
    if (options?.manual) setRefreshingPlan(true);
    try {
      const response = await fetchWithTimeout("/api/auth/sekolah/session", {
        cache: "no-store",
        signal: options?.signal,
      });
      if (response.status === 401) {
        clearAuthCache("sekolah");
        invalidateCache();
        setStatus("unauthorized");
        return;
      }
      if (!response.ok) throw new Error("Gagal memeriksa sesi sekolah.");
      const data: unknown = await response.json();
      if (typeof data !== "object" || data === null || !("sekolah" in data) || typeof data.sekolah !== "string" || !("slug" in data) || typeof data.slug !== "string") {
        throw new Error("Respons sesi tidak valid.");
      }
      const rawOrNormalized =
        ("plan" in data && typeof data.plan === "string" ? data.plan : null) ??
        ("rawPlan" in data && typeof data.rawPlan === "string" ? data.rawPlan : null);
      const resolvedPlan = resolvePlanSlug(rawOrNormalized);
      const devFlag =
        ("isDeveloper" in data && data.isDeveloper === true) ||
        ("email" in data && typeof data.email === "string" && data.email.trim().toLowerCase() === DEVELOPER_EMAIL);
      const themeKeyValue = "themeKey" in data && typeof data.themeKey === "string" ? data.themeKey : undefined;

      setSchool(data.sekolah);
      setSlug(data.slug);
      setCacheScope(data.slug);
      setPlan((prevPlan) => {
        if (prevPlan !== resolvedPlan) {
          invalidateCache([
            "/api/sekolah/ringkasan",
            "/api/sekolah/rekap-akademik",
            "/api/sekolah/identitas",
            "/api/sekolah/pengaturan",
          ]);
        }
        return resolvedPlan;
      });
      if (themeKeyValue && isThemeKey(themeKeyValue)) {
        setCachedTheme(themeKeyValue);
      }
      setIsDeveloper(devFlag);
      if (!devFlag) {
        setSandboxMode("client");
        setSandboxRole("ADMIN");
      }
      saveAuthCache<SchoolAuthCache>("sekolah", {
        token: initialAuth?.token,
        nama: "nama" in data && typeof data.nama === "string" ? data.nama : initialAuth?.nama ?? "Admin",
        email: "email" in data && typeof data.email === "string" ? data.email : initialAuth?.email ?? null,
        isDeveloper: devFlag,
        sekolah: data.sekolah,
        slug: data.slug,
        plan: resolvedPlan,
        rawPlan: "rawPlan" in data && typeof data.rawPlan === "string" ? data.rawPlan : null,
        themeKey: themeKeyValue,
        updatedAt: Date.now(),
      });
      saveCachedTenantProfile(data.slug, {
        nama: data.sekolah,
        slug: data.slug,
        themeKey: themeKeyValue,
        plan: resolvedPlan,
      });
      if (upgradePrompt && hasPlanAccess(resolvedPlan, upgradePrompt.requiredPlan)) {
        setUpgradePrompt(null);
      }
      setError("");
      setStatus("ready");
    } catch (failure: unknown) {
      if (!isCallerAborted(failure, options?.signal)) {
        const message = describeFetchError(failure, "Sesi sekolah belum dapat diverifikasi.");
        if (!initialAuth && status !== "ready") {
          setError(message);
          setStatus("error");
        } else if (options?.manual) {
          setError(message);
        }
      }
    } finally {
      if (options?.manual && !options?.signal?.aborted) {
        setRefreshingPlan(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let lastCheckedAt = Date.now();
    void refreshSessionProfile({ signal: controller.signal });

    const maybeRevalidate = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastCheckedAt < 10_000) return;
      lastCheckedAt = now;
      void refreshSessionProfile({ signal: controller.signal });
    };

    window.addEventListener("focus", maybeRevalidate);
    document.addEventListener("visibilitychange", maybeRevalidate);
    return () => {
      controller.abort();
      window.removeEventListener("focus", maybeRevalidate);
      document.removeEventListener("visibilitychange", maybeRevalidate);
    };
  }, []);

  useEffect(() => {
    if (!isDeveloper || sandboxRole === "ADMIN" || samples !== null) return;
    const controller = new AbortController();
    setSamplesLoading(true);
    fetchWithTimeout("/api/sekolah/dev-sandbox/samples", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat sampel akun.");
        const body = (await res.json()) as SandboxSamples;
        setSamples(body);
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setSamples({ guru: null, siswa: null });
          setError(describeFetchError(failure, "Sampel sandbox gagal dimuat."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSamplesLoading(false);
      });
    return () => controller.abort();
  }, [isDeveloper, sandboxRole, samples]);

  function handleSandboxModeChange(nextMode: SandboxMode) {
    if (!isDeveloper) return;
    setSandboxMode(nextMode);
    if (nextMode === "client" && isDevelopmentModule(view)) {
      setView("dashboard");
    }
  }

  function handleSandboxRoleChange(nextRole: SandboxRole) {
    if (!isDeveloper) return;
    setSandboxRole(nextRole);
  }

  async function logout() {
    try {
      const response = await fetchWithTimeout("/api/auth/sekolah/logout", { method: "POST" });
      if (!response.ok) throw new Error("Gagal keluar. Coba lagi.");
      clearAuthCache("sekolah");
      invalidateCache();
      resetStandardClassesCache();
      navigate("/login");
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal keluar. Coba lagi."));
    }
  }

  function openUpgradePrompt(featureName: string, requiredPlan: Exclude<PlanSlug, "basic">) {
    setMenuOpen(false);
    setUpgradePrompt({ featureName, requiredPlan });
  }

  function selectView(next: SchoolView, requiredPlan?: Exclude<PlanSlug, "basic">, label?: string) {
    if (requiredPlan && !hasPlanAccess(plan, requiredPlan)) {
      openUpgradePrompt(label ?? "Fitur Premium", requiredPlan);
      return;
    }
    if (next !== view) setTransitionAlternate((previous) => !previous);
    if (isSchoolDataKind(next)) setDataKind(next);
    setView(next);
    setMenuOpen(false);
  }

  const planStyle = PLAN_BADGE_STYLES[plan];
  const effectiveMode: SandboxMode = isDeveloper ? sandboxMode : "client";
  const effectiveRole: SandboxRole = isDeveloper ? sandboxRole : "ADMIN";
  const showDevMenus = isDeveloper && effectiveMode === "dev";

  const visibleMasterItems = masterItems.filter((item) => !item.inDevelopment || showDevMenus);
  const visibleAcademicItems = academicItems.filter((item) => !item.inDevelopment || showDevMenus);
  const visibleCbtItems = cbtItems.filter((item) => !item.inDevelopment || showDevMenus);
  const visibleStandaloneItems = standaloneItems.filter((item) => !item.inDevelopment || showDevMenus);

  if (status === "unauthorized") return <Navigate to="/login" replace />;
  if (status === "loading") return <PortalSpinner label="Memuat portal sekolah" />;
  if (status !== "ready") return <main className="school-dashboard min-h-screen bg-slate-950 p-8 text-white">{error || "Sesi tidak tersedia. Muat ulang halaman."}</main>;

  return <TenantThemeProvider scope="sekolah" initialTheme={cachedTheme}><main className="dashboard-canvas glass-area min-h-screen text-slate-800">
    {isDeveloper && effectiveRole !== "ADMIN" ? (
      <DevSandboxLmsPreview
        role={effectiveRole}
        school={school}
        samples={samples}
        loading={samplesLoading}
        onBackToAdmin={() => handleSandboxRoleChange("ADMIN")}
      />
    ) : (
    <div className="mx-auto flex min-h-screen max-w-[1600px]">
      <SchoolSidebar
        school={school}
        plan={plan}
        planStyle={planStyle}
        view={view}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        masterOpen={masterOpen}
        setMasterOpen={setMasterOpen}
        academicOpen={academicOpen}
        setAcademicOpen={setAcademicOpen}
        cbtOpen={cbtOpen}
        setCbtOpen={setCbtOpen}
        visibleMasterItems={visibleMasterItems}
        visibleAcademicItems={visibleAcademicItems}
        visibleCbtItems={visibleCbtItems}
        visibleStandaloneItems={visibleStandaloneItems}
        refreshingPlan={refreshingPlan}
        onRefreshPlan={() => void refreshSessionProfile({ manual: true })}
        onSelectView={selectView}
        onLogout={logout}
      />
      {menuOpen && <button type="button" aria-label="Tutup menu sekolah" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden" />}
      <div className="min-w-0 flex-1">
        <SchoolPortalHeader
          school={school}
          planStyle={planStyle}
          menuOpen={menuOpen}
          onOpenMenu={() => setMenuOpen(true)}
        />
        {error && <p role="alert" className="glass-panel m-4 rounded-xl p-4 text-rose-700">{error}</p>}
        <div className={`animate-page-enter ${transitionAlternate ? "page-enter-alternate" : ""} mx-auto max-w-7xl space-y-6 p-6 pb-28 md:pb-6`}>
          {view === "dashboard" && (
            <SchoolOverview
              school={school}
              slug={slug}
              plan={plan}
              onSelect={(target) => selectView(target)}
              onOpenView={(target, req, lbl) => selectView(target, req, lbl)}
              onRequireUpgrade={openUpgradePrompt}
            />
          )}
          {view === "password" && (
            <section className="dashboard-glass space-y-6 rounded-2xl p-6">
              <DashboardHero
                eyebrow="KEAMANAN AKUN"
                title="Ganti Password"
                description="Verifikasi password saat ini sebelum membuat kata sandi baru untuk akun admin lembaga."
              />
              <PasswordChangeForm
                endpoint="/api/auth/sekolah/ganti-password"
                onChanged={() => navigate("/login", { state: { passwordChanged: true }, replace: true })}
                description="Gunakan kombinasi huruf dan angka yang kuat agar akses sekolah tetap aman."
                className="rounded-2xl border border-white bg-white/90 p-6 text-slate-900"
                inputClassName="glass-input mt-2 w-full rounded-xl px-4 py-3"
                buttonClassName="master-primary py-3 disabled:opacity-50"
              />
            </section>
          )}
          {view === "ruang-kbm" && <Classroom role="ADMIN" />}
          {view === "verval-dapodik" && <VervalDapodikView />}
          {view === "impor-dapodik" && hasPlanAccess(plan, "reguler") && (
            <SchoolImportPanel onGoToStudents={() => selectView("siswa")} />
          )}
          {view === "penempatan-kelas" && hasPlanAccess(plan, "reguler") && (
            <SchoolBulkPlacementView />
          )}
          {view === "presensi" && hasPlanAccess(plan, "reguler") && (
            <SchoolAcademicRecap mode="presensi" onOpenClassroom={() => selectView("ruang-kbm")} />
          )}
          {view === "rekap-akademik" && hasPlanAccess(plan, "reguler") && (
            <SchoolAcademicRecap mode="rekap" onOpenClassroom={() => selectView("ruang-kbm")} />
          )}
          {view === "tema-identitas" && hasPlanAccess(plan, "pro") && (
            <SchoolThemeIdentityView />
          )}
          {view === "pengaturan-lanjutan" && hasPlanAccess(plan, "pro") && (
            <SchoolAdvancedSettingsView
              onOpenTheme={() => selectView("tema-identitas", "pro", "Tema & Identitas Sekolah")}
              onOpenClasses={() => selectView("kelas")}
            />
          )}
          {showDevMenus && isDevelopmentModule(view) && (
            <ModulePlaceholderView
              moduleId={view}
              icon={MENU_ICON_MAP.get(view) ?? Layers}
              onBackToDashboard={() => selectView("dashboard")}
            />
          )}
          <SchoolData
            slug={slug}
            kind={dataKind}
            visible={isSchoolDataKind(view)}
            plan={plan}
            onRequireUpgrade={openUpgradePrompt}
          />
        </div>
      </div>
    </div>
    )}
    {isDeveloper && (
      <DevSandboxToolbar
        slug={slug}
        plan={plan}
        mode={effectiveMode}
        role={effectiveRole}
        samples={samples}
        samplesLoading={samplesLoading}
        onModeChange={handleSandboxModeChange}
        onRoleChange={handleSandboxRoleChange}
      />
    )}
    {upgradePrompt && (
      <UpgradePlanModal
        featureName={upgradePrompt.featureName}
        requiredPlan={upgradePrompt.requiredPlan}
        currentPlan={plan}
        refreshing={refreshingPlan}
        onRefreshPlan={() => void refreshSessionProfile({ manual: true })}
        onClose={() => setUpgradePrompt(null)}
      />
    )}
    {effectiveRole === "ADMIN" && (
      <SchoolMobileNav
        menuOpen={menuOpen}
        view={view}
        onOpenMenu={() => setMenuOpen(true)}
        onSelectView={(next) => selectView(next)}
      />
    )}
  </main></TenantThemeProvider>;
}

function SchoolSidebar({
  school,
  plan,
  planStyle,
  view,
  menuOpen,
  setMenuOpen,
  masterOpen,
  setMasterOpen,
  academicOpen,
  setAcademicOpen,
  cbtOpen,
  setCbtOpen,
  visibleMasterItems,
  visibleAcademicItems,
  visibleCbtItems,
  visibleStandaloneItems,
  refreshingPlan,
  onRefreshPlan,
  onSelectView,
  onLogout,
}: {
  school: string;
  plan: PlanSlug;
  planStyle: { label: string; sidebarClass: string; headerClass: string };
  view: SchoolView;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  masterOpen: boolean;
  setMasterOpen: (open: boolean) => void;
  academicOpen: boolean;
  setAcademicOpen: (open: boolean) => void;
  cbtOpen: boolean;
  setCbtOpen: (open: boolean) => void;
  visibleMasterItems: SchoolMenuItem[];
  visibleAcademicItems: SchoolMenuItem[];
  visibleCbtItems: SchoolMenuItem[];
  visibleStandaloneItems: SchoolMenuItem[];
  refreshingPlan: boolean;
  onRefreshPlan: () => void;
  onSelectView: (next: SchoolView, requiredPlan?: Exclude<PlanSlug, "basic">, label?: string) => void;
  onLogout: () => void;
}) {
  const theme = useTenantTheme();
  const palette = SIDEBAR_THEMES[theme] ?? SIDEBAR_THEMES.ocean;
  const badgeClass = palette.useLightBadges ? planStyle.headerClass : planStyle.sidebarClass;

  function renderMenuItem(item: SchoolMenuItem) {
    const Icon = item.icon;
    const active = view === item.target;
    const locked = item.requiredPlan ? !hasPlanAccess(plan, item.requiredPlan) : false;
    return (
      <button
        key={item.target}
        type="button"
        title={item.label}
        aria-current={active ? "page" : undefined}
        onMouseEnter={() => {
          if (!locked && !item.inDevelopment) prefetchForView(item.target);
        }}
        onClick={() => onSelectView(item.target, item.requiredPlan, item.label)}
        className={`flex w-full items-center justify-between gap-1.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors duration-200 ${
          active ? palette.itemActive : locked ? palette.itemLocked : palette.itemInactive
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              active ? palette.itemActiveIcon : palette.itemIcon
            }`}
          >
            <Icon size={14} />
          </span>
          <span className="truncate">{item.label}</span>
        </span>
        {(item.inDevelopment || item.requiredPlan) && (
          <span className="flex shrink-0 items-center gap-1">
            {item.inDevelopment && (
              <span
                title="Modul dalam tahap pengembangan"
                className={`inline-flex items-center rounded border px-1 py-0.5 text-[7px] font-extrabold uppercase tracking-wider ${palette.devBadge}`}
              >
                DEV
              </span>
            )}
            {item.requiredPlan && (
              <span
                className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[7px] font-extrabold uppercase tracking-wider ${
                  item.requiredPlan === "pro"
                    ? locked
                      ? palette.proBadgeLocked
                      : palette.proBadgeActive
                    : locked
                      ? palette.regBadgeLocked
                      : palette.regBadgeActive
                }`}
              >
                {locked && <Lock size={8} aria-hidden="true" />}
                {item.requiredPlan === "pro" ? "PRO" : "REG"}
              </span>
            )}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside
      className={`${menuOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-50 w-64 flex-col border-r p-3.5 transition-colors duration-300 lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0 ${palette.aside}`}
    >
      <div className={`flex items-center justify-between gap-2 border-b pb-3.5 ${palette.headerDivider}`}>
        <div className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border p-2.5 ${palette.identityCard}`}>
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-black ${palette.avatar}`}>
            {school.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-xs font-black uppercase tracking-wide ${palette.schoolName}`}>{school}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className={`text-[10px] font-bold uppercase ${palette.roleText}`}>ADMIN</span>
              <span className={`inline-flex rounded border px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider ${badgeClass}`}>
                {planStyle.label}
              </span>
            </div>
          </div>
        </div>
        <button type="button" onClick={() => setMenuOpen(false)} aria-label="Tutup menu" className={`rounded-lg p-1.5 lg:hidden ${palette.closeBtn}`}>
          <X size={18} />
        </button>
      </div>

      <nav aria-label="Menu sekolah" className="dashboard-scrollbar mt-3.5 min-h-0 flex-1 overflow-y-auto pr-0.5">
        <button
          type="button"
          aria-current={view === "dashboard" ? "page" : undefined}
          onMouseEnter={() => prefetchForView("dashboard")}
          onClick={() => onSelectView("dashboard")}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs font-bold transition ${
            view === "dashboard" ? palette.dashboardActive : palette.dashboardInactive
          }`}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              view === "dashboard" ? palette.dashboardActiveIcon : palette.dashboardInactiveIcon
            }`}
          >
            <LayoutDashboard size={15} />
          </span>
          <span className="truncate">Dashboard Utama</span>
        </button>

        <p className={`mb-2 mt-4 px-3 text-[10px] font-black uppercase tracking-wider ${palette.sectionLabel}`}>MENU NAVIGASI</p>

        <div className="space-y-1.5">
          <div>
            <button
              type="button"
              aria-expanded={masterOpen}
              onClick={() => setMasterOpen(!masterOpen)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${palette.groupButton}`}
            >
              <span className="flex items-center gap-2.5">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${palette.groupIcon}`}>
                  <Database size={14} />
                </span>
                <span>Master Data</span>
              </span>
              {masterOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {masterOpen && (
              <div className={`ml-3 mt-1.5 space-y-1.5 border-l pl-2.5 ${palette.groupBorder}`}>
                {visibleMasterItems.map((item) => renderMenuItem(item))}
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              aria-expanded={academicOpen}
              onClick={() => setAcademicOpen(!academicOpen)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${palette.groupButton}`}
            >
              <span className="flex items-center gap-2.5">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${palette.groupIcon}`}>
                  <GraduationCap size={14} />
                </span>
                <span>Akademik &amp; Rapor</span>
              </span>
              {academicOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {academicOpen && (
              <div className={`ml-3 mt-1.5 space-y-1.5 border-l pl-2.5 ${palette.groupBorder}`}>
                {visibleAcademicItems.map((item) => renderMenuItem(item))}
              </div>
            )}
          </div>

          {visibleCbtItems.length > 0 && (
            <div>
              <button
                type="button"
                aria-expanded={cbtOpen}
                onClick={() => setCbtOpen(!cbtOpen)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${palette.groupButton}`}
              >
                <span className="flex items-center gap-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${palette.groupIcon}`}>
                    <MonitorCheck size={14} />
                  </span>
                  <span>Ujian Online (CBT)</span>
                </span>
                {cbtOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {cbtOpen && (
                <div className={`ml-3 mt-1.5 space-y-1.5 border-l pl-2.5 ${palette.groupBorder}`}>
                  {visibleCbtItems.map((item) => renderMenuItem(item))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`mt-2 space-y-1.5 border-t pt-2 ${palette.standaloneDivider}`}>
          {visibleStandaloneItems.map((item) => renderMenuItem(item))}
        </div>
      </nav>

      <div className={`mt-3 shrink-0 space-y-2.5 border-t pt-3 ${palette.footerDivider}`}>
        <div className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${palette.tierCard}`}>
          <span className={`text-[11px] font-bold ${palette.tierLabel}`}>Tier Akses</span>
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${badgeClass}`}>
              {planStyle.label}
            </span>
            <button
              type="button"
              disabled={refreshingPlan}
              onClick={onRefreshPlan}
              title="Segarkan status paket"
              aria-label="Segarkan status paket"
              className={`rounded p-1 transition disabled:opacity-50 ${palette.refreshBtn}`}
            >
              <RefreshCw size={12} className={refreshingPlan ? "animate-spin" : ""} aria-hidden="true" />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className={`flex w-full items-center justify-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition ${palette.logoutBtn}`}
        >
          <LogOut size={15} />
          Keluar
        </button>
      </div>
    </aside>
  );
}

function SchoolPortalHeader({
  school,
  planStyle,
  menuOpen,
  onOpenMenu,
}: {
  school: string;
  planStyle: { label: string; sidebarClass: string; headerClass: string };
  menuOpen: boolean;
  onOpenMenu: () => void;
}) {
  const theme = useTenantTheme();
  const palette = SIDEBAR_THEMES[theme] ?? SIDEBAR_THEMES.ocean;
  return (
    <header className="dashboard-header sticky top-0 z-30 mx-4 mt-4 flex items-center gap-3 rounded-xl border px-4 py-3 sm:mx-6 sm:mt-6 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Buka menu sekolah"
        aria-expanded={menuOpen}
        className={`rounded-lg p-2 lg:hidden ${palette.headerMenuBtn}`}
      >
        <Menu size={21} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className={`inline-block max-w-full truncate rounded-lg px-3 py-1 text-sm font-extrabold ${palette.headerSchoolPill}`}>
            {school}
          </h1>
          <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${planStyle.headerClass}`}>
            {planStyle.label}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Sekolah aktif
        </p>
      </div>
      <span className="hidden text-xs font-bold text-slate-700 sm:block">Admin</span>
      <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white shadow-md ${palette.headerAvatar}`}>
        AD
      </span>
    </header>
  );
}

function SchoolMobileNav({
  menuOpen,
  view,
  onOpenMenu,
  onSelectView,
}: {
  menuOpen: boolean;
  view: SchoolView;
  onOpenMenu: () => void;
  onSelectView: (next: SchoolView) => void;
}) {
  const theme = useTenantTheme();
  const palette = SIDEBAR_THEMES[theme] ?? SIDEBAR_THEMES.ocean;
  return (
    <nav
      aria-label="Navigasi bawah sekolah"
      className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-white/70 bg-white/80 px-1 pt-2 shadow-[0_-8px_30px_rgba(79,70,229,0.08)] backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {([
        { label: "Beranda", icon: Home, active: !menuOpen && view === "dashboard", click: () => onSelectView("dashboard") },
        { label: "Siswa", icon: Users, active: !menuOpen && view === "siswa", click: () => onSelectView("siswa") },
        { label: "Jadwal", icon: CalendarDays, active: !menuOpen && view === "akademik", click: () => onSelectView("akademik") },
        { label: "PPDB", icon: ClipboardList, active: !menuOpen && view === "ppdb", click: () => onSelectView("ppdb") },
        { label: "Menu Lainnya", icon: LayoutGrid, active: menuOpen || (view !== "dashboard" && view !== "siswa" && view !== "akademik" && view !== "ppdb"), click: onOpenMenu },
      ] as const).map(({ label, icon: Icon, active, click }) => (
        <button
          key={label}
          type="button"
          aria-current={active ? "page" : undefined}
          onClick={click}
          className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[10px] ${
            active ? `font-semibold ${palette.mobileAccentText}` : "font-medium text-slate-600"
          }`}
        >
          <span
            className={
              label === "Jadwal"
                ? `-mt-6 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg ${palette.mobileFab}`
                : `rounded-xl p-1.5 ${active ? palette.mobileAccentBg : ""}`
            }
          >
            <Icon size={20} />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}

type Summary = { siswa: number; guru: number; kelas: number; ppdb: number; ppdbDiterima: number; ppdbDitolak: number };

type OverviewRecap = {
  summary: {
    rataRataTugas: number | null;
    rataRataNilaiAkhir: number | null;
    totalTugas: number;
    totalMateri: number;
    presensi: { hadir: number; total: number };
  };
  nilaiTerbaru: Array<{ mapelNama: string; nilaiAkhir: number }>;
};

function SchoolOverview({
  school,
  slug,
  plan,
  onSelect,
  onOpenView,
  onRequireUpgrade,
}: {
  school: string;
  slug: string;
  plan: PlanSlug;
  onSelect: (view: SchoolDataKind) => void;
  onOpenView: (view: SchoolView, requiredPlan?: Exclude<PlanSlug, "basic">, label?: string) => void;
  onRequireUpgrade: (featureName: string, requiredPlan: Exclude<PlanSlug, "basic">) => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(() => getCached<Summary>("/api/sekolah/ringkasan"));
  const [recap, setRecap] = useState<OverviewRecap | null>(() => getCached<OverviewRecap>("/api/sekolah/rekap-akademik"));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const activePlan = getPlanBySlug(plan);
  const canUseRecap = hasPlanAccess(plan, "reguler");
  const canUsePro = hasPlanAccess(plan, "pro");

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<Summary>("/api/sekolah/ringkasan");
    if (cached) setSummary(cached);
    setError("");
    fetchWithTimeout("/api/sekolah/ringkasan", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : "Ringkasan sekolah belum dapat dimuat.");
        const data: unknown = await response.json();
        if (typeof data !== "object" || data === null || !("siswa" in data) || typeof data.siswa !== "number" || !("guru" in data) || typeof data.guru !== "number" || !("kelas" in data) || typeof data.kelas !== "number" || !("ppdb" in data) || typeof data.ppdb !== "number" || !("ppdbDiterima" in data) || typeof data.ppdbDiterima !== "number" || !("ppdbDitolak" in data) || typeof data.ppdbDitolak !== "number") throw new Error("Respons ringkasan tidak valid.");
        const next: Summary = { siswa: data.siswa, guru: data.guru, kelas: data.kelas, ppdb: data.ppdb, ppdbDiterima: data.ppdbDiterima, ppdbDitolak: data.ppdbDitolak };
        setCached("/api/sekolah/ringkasan", next);
        setSummary(next);
        prefetchCoreSchoolData();
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          if (!cached) setError(describeFetchError(failure, "Ringkasan sekolah belum dapat dimuat."));
        }
      });
    return () => controller.abort();
  }, [version]);

  useEffect(() => {
    if (summary) {
      prefetchCoreSchoolData();
    }
  }, [summary !== null]);

  useEffect(() => {
    if (!canUseRecap) return;
    const controller = new AbortController();
    const cached = getCached<OverviewRecap>("/api/sekolah/rekap-akademik");
    if (cached) setRecap(cached);
    fetchWithTimeout("/api/sekolah/rekap-akademik", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as OverviewRecap;
        setCached("/api/sekolah/rekap-akademik", body);
        setRecap(body);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [canUseRecap, version]);

  const totalPpdb = summary ? summary.ppdb + summary.ppdbDiterima + summary.ppdbDitolak : 0;

  const subjectStats = (() => {
    if (!recap || recap.nilaiTerbaru.length === 0) return [];
    const grouped = new Map<string, { total: number; count: number }>();
    for (const item of recap.nilaiTerbaru) {
      const current = grouped.get(item.mapelNama) ?? { total: 0, count: 0 };
      current.total += item.nilaiAkhir;
      current.count += 1;
      grouped.set(item.mapelNama, current);
    }
    return [...grouped.entries()]
      .slice(0, 5)
      .map(([nama, stats]) => ({
        nama,
        avg: Math.round((stats.total / stats.count) * 10) / 10,
      }));
  })();

  const avgDisplay =
    canUseRecap && recap?.summary.rataRataNilaiAkhir !== null && recap?.summary.rataRataNilaiAkhir !== undefined
      ? recap.summary.rataRataNilaiAkhir
      : canUseRecap && recap?.summary.rataRataTugas !== null && recap?.summary.rataRataTugas !== undefined
        ? recap.summary.rataRataTugas
        : null;

  const kpiCards = [
    {
      id: "siswa" as const,
      label: "TOTAL SISWA AKTIF",
      value: summary ? String(summary.siswa) : "0",
      sub: "Warga belajar terdaftar",
      icon: Users,
      tint: "from-blue-50 to-indigo-100",
      iconClass: "bg-indigo-600/10 text-indigo-700",
    },
    {
      id: "guru" as const,
      label: "GURU AKTIF",
      value: summary ? String(summary.guru) : "0",
      sub: "Tutor & pengampu mapel",
      icon: GraduationCap,
      tint: "from-violet-50 to-purple-100",
      iconClass: "bg-violet-600/10 text-violet-700",
    },
    {
      id: "kelas" as const,
      label: avgDisplay !== null ? "RATA-RATA NILAI" : "KELAS AKTIF",
      value: avgDisplay !== null ? String(avgDisplay) : summary ? String(summary.kelas) : "0",
      sub: avgDisplay !== null ? `${summary?.kelas ?? 0} kelas aktif` : "Rombel Kesetaraan",
      icon: avgDisplay !== null ? Award : Building2,
      tint: "from-cyan-50 to-sky-100",
      iconClass: "bg-cyan-600/10 text-cyan-700",
    },
    {
      id: "ppdb" as const,
      label: "PENDAFTAR BARU",
      value: summary ? String(summary.ppdb) : "0",
      sub: `${totalPpdb} total pendaftar PPDB`,
      icon: ClipboardList,
      tint: "from-emerald-50 to-teal-100",
      iconClass: "bg-emerald-600/10 text-emerald-700",
    },
  ];

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="DASHBOARD SEKOLAH"
        title={`Selamat Datang di Portal ${school}`}
        description="Kelola operasional lembaga, warga belajar, dan aktivitas akademik dalam satu panel terpadu."
      />

      {error ? (
        <div role="alert" className="glass-panel rounded-2xl p-6 text-sm">
          {error}{" "}
          <button type="button" onClick={() => setVersion((value) => value + 1)} className="ml-2 font-bold underline">
            Coba lagi
          </button>
        </div>
      ) : !summary ? (
        <CardGridSkeleton count={4} columns={4} />
      ) : (
        <>
          <div className="page-stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onSelect(card.id)}
                  className={`flex items-center justify-between gap-4 rounded-2xl border border-white bg-gradient-to-br ${card.tint} p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{card.label}</p>
                    <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{card.value}</p>
                    <p className="mt-1 truncate text-xs font-medium text-slate-600">{card.sub}</p>
                  </div>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.iconClass}`}>
                    <Icon size={21} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="dashboard-glass flex flex-col justify-between rounded-2xl p-6 lg:col-span-8">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                      <BarChart3 size={18} />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Statistik Nilai Rata-rata Mapel</h3>
                      <p className="text-xs text-slate-600">Capaian nilai evaluasi warga belajar terhadap batas ketuntasan minimal</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      canUseRecap
                        ? onOpenView("rekap-akademik", "reguler", "Analitik & Rekap Nilai")
                        : onRequireUpgrade("Analitik & Rekap Nilai", "reguler")
                    }
                    className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50"
                  >
                    {canUseRecap ? "Buka Analitik Lengkap" : "Paket Reguler+"}
                  </button>
                </div>

                {!canUseRecap ? (
                  <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-white/50 p-6 text-center">
                    <p className="max-w-md text-sm text-slate-700">
                      Grafik perbandingan rata-rata nilai per mata pelajaran dan rekap presensi tersedia mulai{" "}
                      <strong>Paket Reguler</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => onRequireUpgrade("Analitik & Rekap Nilai", "reguler")}
                      className="master-primary mt-4 px-4 py-2"
                    >
                      Lihat Paket Reguler
                    </button>
                  </div>
                ) : subjectStats.length === 0 ? (
                  <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-white/50 p-6 text-center">
                    <p className="max-w-md text-sm text-slate-700">
                      Belum ada entri nilai simulasi atau nilai akhir yang tercatat. Mulai kelola materi, tugas, dan penilaian melalui Ruang KBM.
                    </p>
                    <button
                      type="button"
                      onClick={() => onOpenView("ruang-kbm")}
                      className="master-primary mt-4 px-4 py-2"
                    >
                      Buka Ruang KBM &amp; Materi
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {subjectStats.map((item) => {
                      const passed = item.avg >= 75;
                      return (
                        <div key={item.nama} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                            <span className="truncate pr-3">{item.nama}</span>
                            <span className={passed ? "text-emerald-700" : "text-amber-700"}>{item.avg}</span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                            <div
                              className={`h-full rounded-full ${
                                passed
                                  ? "bg-gradient-to-r from-indigo-500 to-emerald-500"
                                  : "bg-gradient-to-r from-amber-500 to-orange-500"
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, item.avg))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/75 px-4 py-3 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Tuntas (&ge; 75 KKM)
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    Perlu Pendampingan (&lt; 75)
                  </span>
                </div>
                <span className="font-bold text-indigo-900">Target KKM Lembaga: 75</span>
              </div>
            </div>

            <div className="dashboard-glass flex flex-col justify-between rounded-2xl p-6 lg:col-span-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Aliran Pendaftar PPDB</h3>
                <p className="mt-0.5 text-xs text-slate-600">Ringkasan status verifikasi calon warga belajar</p>
                <div
                  className="mx-auto mt-5 flex h-36 w-36 items-center justify-center rounded-full shadow-inner"
                  style={{
                    background: totalPpdb
                      ? `conic-gradient(#f59e0b 0 ${(summary.ppdb / totalPpdb) * 100}%, #10b981 0 ${((summary.ppdb + summary.ppdbDiterima) / totalPpdb) * 100}%, #f43f5e 0)`
                      : "#e2e8f0",
                  }}
                >
                  <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white text-slate-900 shadow-xs">
                    <span className="text-2xl font-black">{totalPpdb}</span>
                    <span className="text-[11px] font-semibold text-slate-500">Pendaftar</span>
                  </div>
                </div>
                <div className="mt-5 space-y-2 text-xs text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      Menunggu Verifikasi
                    </span>
                    <strong>{summary.ppdb}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      Diterima
                    </span>
                    <strong>{summary.ppdbDiterima}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                      Ditolak
                    </span>
                    <strong>{summary.ppdbDitolak}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelect("ppdb")}
                className="master-primary mt-5 w-full py-2.5"
              >
                Selesaikan Seleksi PPDB
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="dashboard-glass flex flex-col justify-between rounded-2xl p-6 lg:col-span-7">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                      <Activity size={18} />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Aktivitas Sistem Terkini</h3>
                      <p className="text-xs text-slate-600">Pantauan operasional akademik dan pendaftaran lembaga</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      canUseRecap
                        ? onOpenView("rekap-akademik", "reguler", "Analitik & Rekap Nilai")
                        : onOpenView("ruang-kbm")
                    }
                    className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50"
                  >
                    Lihat Semua Aktivitas
                  </button>
                </div>

                <ul className="mt-5 space-y-2.5 text-xs">
                  <li className="flex items-center justify-between gap-3 rounded-xl border border-white bg-white/80 px-4 py-3 text-slate-800">
                    <span>Total warga belajar aktif &amp; rombel berjalan</span>
                    <strong className="text-indigo-900">
                      {summary.siswa} siswa · {summary.kelas} kelas
                    </strong>
                  </li>
                  <li className="flex items-center justify-between gap-3 rounded-xl border border-white bg-white/80 px-4 py-3 text-slate-800">
                    <span>Antrean seleksi PPDB menunggu tinjauan</span>
                    <strong className={summary.ppdb > 0 ? "text-amber-700" : "text-emerald-700"}>
                      {summary.ppdb} pendaftar
                    </strong>
                  </li>
                  <li className="flex items-center justify-between gap-3 rounded-xl border border-white bg-white/80 px-4 py-3 text-slate-800">
                    <span>Aktivitas materi ajar, tugas KBM, &amp; presensi</span>
                    <strong className="text-slate-900">
                      {canUseRecap && recap
                        ? `${recap.summary.totalMateri} materi · ${recap.summary.totalTugas} tugas · ${recap.summary.presensi.total} presensi`
                        : "Aktif di Ruang KBM"}
                    </strong>
                  </li>
                </ul>
              </div>
            </div>

            <div className="dashboard-glass flex flex-col justify-between rounded-2xl p-6 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Server size={18} />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Status Sistem &amp; Kapasitas Layanan</h3>
                      <p className="text-xs text-slate-600">Konfigurasi tenant dan paket langganan</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                    ONLINE
                  </span>
                </div>

                <dl className="mt-5 space-y-2.5 rounded-xl border border-white bg-white/80 p-4 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-600">Paket Langganan</dt>
                    <dd className="font-extrabold text-indigo-900">{activePlan.name}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-600">Subdomain Portal</dt>
                    <dd className="truncate font-mono font-bold text-slate-900">{slug}.pkbm.siput.id</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-600">Kapasitas Guru &amp; Kelas</dt>
                    <dd className="font-bold text-slate-900">
                      {summary.guru} guru · {summary.kelas} kelas
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {canUsePro ? (
                  <button
                    type="button"
                    onClick={() => onOpenView("pengaturan-lanjutan", "pro", "Pengaturan Lanjutan")}
                    className="master-primary flex-1 py-2.5"
                  >
                    Pengaturan Lanjutan Tenant
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRequireUpgrade("Tema & Identitas Sekolah", "pro")}
                    className="master-primary flex-1 py-2.5"
                  >
                    Lihat Fitur Paket Pro
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
