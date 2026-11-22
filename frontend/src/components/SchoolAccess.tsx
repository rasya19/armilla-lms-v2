import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
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
  GraduationCap,
  Home,
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
  ShieldCheck,
  UploadCloud,
  UserCheck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { SchoolData, type SchoolDataKind } from "./SchoolData";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { LoginNavigation, type LoginRole } from "./LoginNavigation";
import { BrandLogo } from "./BrandLogo";
import { PWAInstallButton } from "./PWAInstallButton";
import { CardGridSkeleton, DashboardHero, PortalSpinner } from "./DashboardUI";
import { Classroom } from "./Classroom";
import { isThemeKey, normalizeThemeKey, savePreferredTheme, TenantThemeProvider, useTenantTheme, type ThemeKey } from "./TenantThemeProvider";
import { unwrapSchoolPayload } from "./schoolProfile";
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
import {
  CekRaportView,
  ModulKesetaraanView,
} from "./SchoolEquivalenceRaport";
import {
  CbtBankSoalView,
  CbtImportView,
  CbtJadwalView,
  CbtMonitoringView,
  CbtPengaturanView,
} from "./SchoolCbtModules";
import {
  AkreditasiSnpView,
  DataAlumniView,
  KartuDigitalQrView,
  KeuanganSppView,
} from "./SchoolProAdminModules";
import {
  AsistenAiView,
  ManajemenAsetView,
  RuangDiskusiView,
} from "./SchoolCollabAssetModules";
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

type SchoolModuleId =
  | "modul-kesetaraan"
  | "akreditasi-snp"
  | "data-alumni"
  | "cek-raport"
  | "cbt-bank-soal"
  | "cbt-impor"
  | "cbt-jadwal"
  | "cbt-monitoring"
  | "cbt-pengaturan"
  | "keuangan-spp"
  | "ruang-diskusi"
  | "asisten-ai"
  | "manajemen-aset"
  | "kartu-digital-qr";

type ActiveDataKind = Exclude<SchoolDataKind, "akademik">;

type SchoolView =
  | ActiveDataKind
  | SchoolModuleId
  | "dashboard"
  | "password"
  | "materi-tugas"
  | "ruang-kbm"
  | "materi-ajar"
  | "tugas-penilaian"
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
  target: SchoolView;
  requiredPlan?: Exclude<PlanSlug, "basic">;
};

type SchoolNavGroupId = "beranda" | "master" | "kbm" | "cbt" | "rapor" | "pengaturan";

type SchoolNavGroup = {
  id: SchoolNavGroupId;
  label: string;
  icon: LucideIcon;
  items: SchoolMenuItem[];
};

const DATA_KINDS = new Set<SchoolView>(["siswa", "guru", "ppdb", "kelas", "mapel"]);

function isSchoolDataKind(view: SchoolView): view is ActiveDataKind {
  return DATA_KINDS.has(view);
}

const SIDEBAR_NAV_GROUPS: SchoolNavGroup[] = [
  {
    id: "beranda",
    label: "Beranda & Penerimaan",
    icon: Home,
    items: [
      { label: "Dashboard Utama", icon: LayoutDashboard, target: "dashboard" },
      { label: "PPDB Online", icon: ClipboardList, target: "ppdb" },
    ],
  },
  {
    id: "master",
    label: "Master Data",
    icon: Database,
    items: [
      { label: "Data Siswa (Warga Belajar)", icon: Users, target: "siswa" },
      { label: "Verval Siswa / Dapodik", icon: ClipboardCheck, target: "verval-dapodik" },
      { label: "Data Guru / Tutor", icon: GraduationCap, target: "guru" },
      { label: "Manajemen Kelas (Rombel)", icon: Building2, target: "kelas" },
      { label: "Kelola Mapel & Bobot SKK", icon: Layers, target: "mapel" },
    ],
  },
  {
    id: "kbm",
    label: "Ruang Belajar (KBM)",
    icon: BookOpen,
    items: [
      { label: "Materi & Tugas Kelas", icon: BookOpen, target: "materi-tugas" },
      { label: "Presensi Warga Belajar", icon: UserCheck, target: "presensi" },
      { label: "Ruang Diskusi", icon: MessageSquare, target: "ruang-diskusi" },
    ],
  },
  {
    id: "cbt",
    label: "Ujian Online (CBT)",
    icon: MonitorCheck,
    items: [
      { label: "Kelola Bank Soal & Ujian", icon: Database, target: "cbt-bank-soal", requiredPlan: "reguler" },
      { label: "Impor Soal & Tugas", icon: UploadCloud, target: "cbt-impor", requiredPlan: "reguler" },
      { label: "Jadwal & Token Ujian", icon: CalendarDays, target: "cbt-jadwal", requiredPlan: "reguler" },
      { label: "Monitoring & Hasil CBT", icon: MonitorCheck, target: "cbt-monitoring", requiredPlan: "reguler" },
    ],
  },
  {
    id: "rapor",
    label: "Rapor & Administrasi",
    icon: Award,
    items: [
      { label: "Cek & Cetak E-Raport", icon: ClipboardCheck, target: "cek-raport", requiredPlan: "reguler" },
      { label: "Kartu Pelajar Digital QR", icon: QrCode, target: "kartu-digital-qr", requiredPlan: "reguler" },
      { label: "Keuangan & SPP", icon: Wallet, target: "keuangan-spp", requiredPlan: "pro" },
      { label: "Data Alumni & Tracer Study", icon: Briefcase, target: "data-alumni", requiredPlan: "pro" },
      { label: "Manajemen Aset & Sarpras", icon: Package, target: "manajemen-aset", requiredPlan: "pro" },
      { label: "Akreditasi 8 SNP", icon: ShieldCheck, target: "akreditasi-snp", requiredPlan: "pro" },
    ],
  },
  {
    id: "pengaturan",
    label: "Pengaturan & AI",
    icon: Settings,
    items: [
      { label: "Asisten Belajar AI", icon: Bot, target: "asisten-ai", requiredPlan: "pro" },
      { label: "Profil & Identitas Sekolah", icon: Palette, target: "tema-identitas" },
    ],
  },
];

export const PLAN_BADGE_STYLES: Record<PlanSlug, { label: string; sidebarClass: string; headerClass: string }> = {
  basic: {
    label: "PAKET BASIC",
    sidebarClass: "border-white/30 bg-white/15 text-white",
    headerClass: "border-slate-300 bg-slate-100 text-slate-900",
  },
  reguler: {
    label: "PAKET REGULER",
    sidebarClass: "border-cyan-200/60 bg-cyan-400/20 text-cyan-50",
    headerClass: "border-indigo-300 bg-indigo-100 text-indigo-950",
  },
  pro: {
    label: "PAKET PRO",
    sidebarClass: "border-amber-300/70 bg-amber-400/25 text-amber-100",
    headerClass: "border-amber-300 bg-amber-100 text-amber-950",
  },
};

export type SidebarThemePalette = {
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
  headerSchoolPill: string;
  headerAvatar: string;
  headerMenuBtn: string;
  mobileAccentText: string;
  mobileAccentBg: string;
  mobileFab: string;
};

export const SIDEBAR_THEMES: Record<ThemeKey, SidebarThemePalette> = {
  ocean: {
    aside:
      "border-sky-300/30 bg-[linear-gradient(180deg,#0c4a6e_0%,#0369a1_50%,#0284c7_100%)] text-white shadow-[4px_0_28px_rgba(7,89,133,0.28)]",
    headerDivider: "border-white/20",
    identityCard: "border-white/25 bg-white/12 shadow-xs backdrop-blur-md",
    avatar: "bg-gradient-to-tr from-amber-300 to-amber-500 text-sky-950 shadow-sm",
    schoolName: "text-white",
    roleText: "text-sky-100",
    closeBtn: "text-sky-100 hover:bg-white/15 hover:text-white",
    dashboardActive: "bg-white text-sky-950 shadow-md shadow-sky-950/25",
    dashboardActiveIcon: "bg-sky-100 text-sky-800",
    dashboardInactive: "text-sky-50/95 hover:bg-white/15 hover:text-white",
    dashboardInactiveIcon: "bg-white/15 text-sky-100",
    sectionLabel: "text-sky-200/80",
    groupButton: "text-white hover:bg-white/15 hover:text-white",
    groupIcon: "bg-white/15 text-sky-100",
    groupBorder: "border-sky-300/30",
    itemActive: "border border-white/80 bg-white text-sky-950 shadow-sm",
    itemActiveIcon: "bg-gradient-to-br from-sky-700 to-cyan-600 text-white shadow-xs",
    itemInactive: "text-sky-50/90 hover:bg-white/15 hover:text-white",
    itemLocked: "text-sky-100/70 hover:bg-white/10 hover:text-white",
    itemIcon: "bg-white/15 text-sky-100",
    proBadgeActive: "bg-amber-300/30 text-amber-50 ring-1 ring-amber-200/70",
    proBadgeLocked: "bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/50",
    regBadgeActive: "bg-cyan-300/25 text-cyan-50 ring-1 ring-cyan-200/60",
    regBadgeLocked: "bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-200/45",
    standaloneDivider: "border-white/20",
    footerDivider: "border-white/20",
    tierCard: "border-white/25 bg-white/12 shadow-xs backdrop-blur-md",
    tierLabel: "text-sky-100",
    refreshBtn: "text-amber-200 hover:bg-white/15 hover:text-white",
    logoutBtn: "border-rose-300/40 bg-rose-500/20 text-rose-50 hover:bg-rose-500/35",
    headerSchoolPill: "bg-sky-100/90 text-sky-950",
    headerAvatar: "bg-gradient-to-br from-sky-600 to-cyan-500",
    headerMenuBtn: "hover:bg-sky-100 text-sky-900",
    mobileAccentText: "text-sky-700",
    mobileAccentBg: "bg-sky-100/90",
    mobileFab: "bg-gradient-to-br from-sky-600 to-cyan-500",
  },
  emerald: {
    aside:
      "border-emerald-300/30 bg-[linear-gradient(180deg,#064e3b_0%,#047857_48%,#0f766e_100%)] text-white shadow-[4px_0_28px_rgba(4,120,87,0.28)]",
    headerDivider: "border-white/20",
    identityCard: "border-white/25 bg-white/12 shadow-xs backdrop-blur-md",
    avatar: "bg-gradient-to-tr from-amber-300 to-amber-500 text-emerald-950 shadow-sm",
    schoolName: "text-white",
    roleText: "text-emerald-100",
    closeBtn: "text-emerald-100 hover:bg-white/15 hover:text-white",
    dashboardActive: "bg-white text-emerald-950 shadow-md shadow-emerald-950/25",
    dashboardActiveIcon: "bg-emerald-100 text-emerald-800",
    dashboardInactive: "text-emerald-50/95 hover:bg-white/15 hover:text-white",
    dashboardInactiveIcon: "bg-white/15 text-emerald-100",
    sectionLabel: "text-emerald-200/80",
    groupButton: "text-white hover:bg-white/15 hover:text-white",
    groupIcon: "bg-white/15 text-emerald-100",
    groupBorder: "border-emerald-300/30",
    itemActive: "border border-white/80 bg-white text-emerald-950 shadow-sm",
    itemActiveIcon: "bg-gradient-to-br from-emerald-700 to-teal-600 text-white shadow-xs",
    itemInactive: "text-emerald-50/90 hover:bg-white/15 hover:text-white",
    itemLocked: "text-emerald-100/70 hover:bg-white/10 hover:text-white",
    itemIcon: "bg-white/15 text-emerald-100",
    proBadgeActive: "bg-amber-300/30 text-amber-50 ring-1 ring-amber-200/70",
    proBadgeLocked: "bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/50",
    regBadgeActive: "bg-teal-300/25 text-teal-50 ring-1 ring-teal-200/60",
    regBadgeLocked: "bg-teal-400/20 text-teal-100 ring-1 ring-teal-200/45",
    standaloneDivider: "border-white/20",
    footerDivider: "border-white/20",
    tierCard: "border-white/25 bg-white/12 shadow-xs backdrop-blur-md",
    tierLabel: "text-emerald-100",
    refreshBtn: "text-amber-200 hover:bg-white/15 hover:text-white",
    logoutBtn: "border-rose-300/40 bg-rose-500/20 text-rose-50 hover:bg-rose-500/35",
    headerSchoolPill: "bg-emerald-100/90 text-emerald-950",
    headerAvatar: "bg-gradient-to-br from-emerald-600 to-teal-500",
    headerMenuBtn: "hover:bg-emerald-100 text-emerald-900",
    mobileAccentText: "text-emerald-700",
    mobileAccentBg: "bg-emerald-100/90",
    mobileFab: "bg-gradient-to-br from-emerald-600 to-teal-500",
  },
  sunset: {
    aside:
      "border-fuchsia-300/30 bg-[linear-gradient(180deg,#4c1d95_0%,#7e22ce_48%,#be185d_100%)] text-white shadow-[4px_0_28px_rgba(109,40,217,0.28)]",
    headerDivider: "border-white/20",
    identityCard: "border-white/25 bg-white/12 shadow-xs backdrop-blur-md",
    avatar: "bg-gradient-to-tr from-amber-300 to-amber-500 text-violet-950 shadow-sm",
    schoolName: "text-white",
    roleText: "text-fuchsia-100",
    closeBtn: "text-fuchsia-100 hover:bg-white/15 hover:text-white",
    dashboardActive: "bg-white text-violet-950 shadow-md shadow-violet-950/25",
    dashboardActiveIcon: "bg-fuchsia-100 text-violet-800",
    dashboardInactive: "text-fuchsia-50/95 hover:bg-white/15 hover:text-white",
    dashboardInactiveIcon: "bg-white/15 text-fuchsia-100",
    sectionLabel: "text-fuchsia-200/80",
    groupButton: "text-white hover:bg-white/15 hover:text-white",
    groupIcon: "bg-white/15 text-fuchsia-100",
    groupBorder: "border-fuchsia-300/30",
    itemActive: "border border-white/80 bg-white text-violet-950 shadow-sm",
    itemActiveIcon: "bg-gradient-to-br from-violet-700 to-fuchsia-600 text-white shadow-xs",
    itemInactive: "text-fuchsia-50/90 hover:bg-white/15 hover:text-white",
    itemLocked: "text-fuchsia-100/70 hover:bg-white/10 hover:text-white",
    itemIcon: "bg-white/15 text-fuchsia-100",
    proBadgeActive: "bg-amber-300/30 text-amber-50 ring-1 ring-amber-200/70",
    proBadgeLocked: "bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/50",
    regBadgeActive: "bg-fuchsia-300/25 text-fuchsia-50 ring-1 ring-fuchsia-200/60",
    regBadgeLocked: "bg-fuchsia-400/20 text-fuchsia-100 ring-1 ring-fuchsia-200/45",
    standaloneDivider: "border-white/20",
    footerDivider: "border-white/20",
    tierCard: "border-white/25 bg-white/12 shadow-xs backdrop-blur-md",
    tierLabel: "text-fuchsia-100",
    refreshBtn: "text-amber-200 hover:bg-white/15 hover:text-white",
    logoutBtn: "border-rose-300/40 bg-rose-500/20 text-rose-50 hover:bg-rose-500/35",
    headerSchoolPill: "bg-fuchsia-100/90 text-violet-950",
    headerAvatar: "bg-gradient-to-br from-violet-600 to-fuchsia-500",
    headerMenuBtn: "hover:bg-fuchsia-100 text-violet-900",
    mobileAccentText: "text-violet-700",
    mobileAccentBg: "bg-fuchsia-100/90",
    mobileFab: "bg-gradient-to-br from-violet-600 to-fuchsia-500",
  },
  violet: {
    aside:
      "border-indigo-300/30 bg-[linear-gradient(180deg,#312e81_0%,#4338ca_50%,#6d28d9_100%)] text-white shadow-[4px_0_28px_rgba(67,56,202,0.28)]",
    headerDivider: "border-white/20",
    identityCard: "border-white/25 bg-white/12 shadow-xs backdrop-blur-md",
    avatar: "bg-gradient-to-tr from-amber-300 to-amber-500 text-indigo-950 shadow-sm",
    schoolName: "text-white",
    roleText: "text-indigo-100",
    closeBtn: "text-indigo-100 hover:bg-white/15 hover:text-white",
    dashboardActive: "bg-white text-indigo-950 shadow-md shadow-indigo-950/25",
    dashboardActiveIcon: "bg-indigo-100 text-indigo-800",
    dashboardInactive: "text-indigo-50/95 hover:bg-white/15 hover:text-white",
    dashboardInactiveIcon: "bg-white/15 text-indigo-100",
    sectionLabel: "text-indigo-200/80",
    groupButton: "text-white hover:bg-white/15 hover:text-white",
    groupIcon: "bg-white/15 text-indigo-100",
    groupBorder: "border-indigo-300/30",
    itemActive: "border border-white/80 bg-white text-indigo-950 shadow-sm",
    itemActiveIcon: "bg-gradient-to-br from-indigo-700 to-violet-600 text-white shadow-xs",
    itemInactive: "text-indigo-50/90 hover:bg-white/15 hover:text-white",
    itemLocked: "text-indigo-100/70 hover:bg-white/10 hover:text-white",
    itemIcon: "bg-white/15 text-indigo-100",
    proBadgeActive: "bg-amber-300/30 text-amber-50 ring-1 ring-amber-200/70",
    proBadgeLocked: "bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/50",
    regBadgeActive: "bg-violet-300/25 text-violet-50 ring-1 ring-violet-200/60",
    regBadgeLocked: "bg-violet-400/20 text-violet-100 ring-1 ring-violet-200/45",
    standaloneDivider: "border-white/20",
    footerDivider: "border-white/20",
    tierCard: "border-white/25 bg-white/12 shadow-xs backdrop-blur-md",
    tierLabel: "text-indigo-100",
    refreshBtn: "text-amber-200 hover:bg-white/15 hover:text-white",
    logoutBtn: "border-rose-300/40 bg-rose-500/20 text-rose-50 hover:bg-rose-500/35",
    headerSchoolPill: "bg-indigo-100/90 text-indigo-950",
    headerAvatar: "bg-gradient-to-br from-indigo-600 to-violet-600",
    headerMenuBtn: "hover:bg-indigo-100 text-indigo-900",
    mobileAccentText: "text-indigo-700",
    mobileAccentBg: "bg-indigo-100/90",
    mobileFab: "bg-gradient-to-br from-indigo-600 to-violet-600",
  },
  dark: {
    aside:
      "border-slate-800/80 bg-[#080f1e]/92 text-slate-200 shadow-[4px_0_32px_rgba(2,6,23,0.6)] backdrop-blur-2xl",
    headerDivider: "border-slate-800/80",
    identityCard: "border-slate-700/50 bg-slate-900/75 shadow-inner",
    avatar:
      "bg-gradient-to-br from-emerald-500 via-lime-400 to-amber-400 text-slate-950 shadow-[0_0_16px_rgba(16,185,129,0.28)]",
    schoolName: "text-white",
    roleText: "text-amber-400",
    closeBtn: "text-slate-300 hover:bg-slate-800",
    dashboardActive:
      "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.34)]",
    dashboardActiveIcon: "bg-slate-950/15 text-slate-950",
    dashboardInactive: "text-slate-300 hover:bg-slate-800/75 hover:text-white",
    dashboardInactiveIcon: "bg-slate-800/85 text-slate-400",
    sectionLabel: "text-slate-400 opacity-75",
    groupButton: "text-slate-200 hover:bg-slate-800/80 hover:text-white",
    groupIcon: "bg-slate-800/85 text-amber-400",
    groupBorder: "border-slate-800/90",
    itemActive:
      "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.32)]",
    itemActiveIcon: "bg-slate-950/15 text-slate-950",
    itemInactive: "text-slate-300 hover:bg-slate-800/70 hover:text-white",
    itemLocked: "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
    itemIcon: "bg-slate-800/80 text-slate-400",
    proBadgeActive: "bg-amber-400/20 text-amber-200",
    proBadgeLocked: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30",
    regBadgeActive: "bg-cyan-400/20 text-cyan-200",
    regBadgeLocked: "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30",
    standaloneDivider: "border-slate-800/80",
    footerDivider: "border-slate-800/80",
    tierCard: "border-slate-700/50 bg-slate-900/75",
    tierLabel: "text-slate-300",
    refreshBtn: "text-amber-300 hover:bg-slate-800 hover:text-amber-200",
    logoutBtn: "border-rose-500/25 bg-rose-950/30 text-rose-300 hover:bg-rose-950/55",
    headerSchoolPill: "bg-transparent px-0 text-white",
    headerAvatar:
      "bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)]",
    headerMenuBtn: "hover:bg-slate-800/80 text-slate-200",
    mobileAccentText: "text-slate-950",
    mobileAccentBg:
      "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)]",
    mobileFab:
      "bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.4)]",
  },
};

export function SchoolLogin() {
  const hostSlug = deriveTenantSlugFromHost();
  const initialProfile = hostSlug ? getCachedTenantProfile(hostSlug) : null;
  const [schoolName, setSchoolName] = useState<string>(() => initialProfile?.nama ?? formatSlugDisplayName(hostSlug));
  const [logoUrl, setLogoUrl] = useState<string | null>(() => initialProfile?.logoUrl ?? null);
  const [theme, setTheme] = useState<ThemeKey>(() => normalizeThemeKey(initialProfile?.themeKey, "ocean"));
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
    fetchWithTimeout(endpoint, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const raw: unknown = await response.json();
        const data = unwrapSchoolPayload(raw);
        if (!data) return;
        const resolvedName =
          typeof data.nama === "string" && data.nama.trim()
            ? data.nama.trim()
            : typeof data.name === "string" && data.name.trim()
              ? data.name.trim()
              : "";
        const resolvedSlug = typeof data.slug === "string" && data.slug ? data.slug : hostSlug;
        const resolvedLogo = typeof data.logoUrl === "string" && data.logoUrl ? data.logoUrl : null;
        const resolvedTheme = normalizeThemeKey(data.themeKey, "ocean");
        setTheme(resolvedTheme);
        savePreferredTheme(resolvedTheme);
        if (resolvedName) {
          setSchoolName(resolvedName);
          setLogoUrl(resolvedLogo);
          saveCachedTenantProfile(resolvedSlug, {
            nama: resolvedName,
            slug: resolvedSlug,
            logoUrl: resolvedLogo,
            themeKey: resolvedTheme,
            plan: typeof data.plan === "string" ? data.plan : undefined,
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

  return <main data-tenant-theme={theme} className="glass-shell glass-login-shell flex min-h-screen items-center justify-center px-5 py-5"><div className="glass-panel glass-login w-full max-w-md rounded-3xl p-6">
    <div className="flex items-center gap-3">
      <BrandLogo src={logoUrl} alt={`Logo ${schoolName}`} className="h-11 w-11 rounded-xl border border-white/20" />
      <div className="min-w-0">
        <p className="master-eyebrow">SIPUT PKBM / SEKOLAH</p>
        <p className="truncate text-xs font-bold text-slate-600">{schoolName}</p>
      </div>
    </div>
    <h1 className="mt-3 text-2xl font-bold">Login Admin Sekolah</h1>
    <p className="mt-2 text-sm text-slate-700">Masuk menggunakan akun admin sekolah Anda.</p>
    {location.state?.passwordChanged === true && <p role="status" className="mt-4 text-sm text-green-700">Password berhasil diganti. Silakan masuk kembali.</p>}
    <LoginNavigation
      value="ADMIN"
      disabled={busy}
      onChange={(role: LoginRole) => {
        if (role !== "ADMIN") {
          navigate("/lms/login", { state: { role } });
        }
      }}
    />
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
  const [dataKind, setDataKind] = useState<ActiveDataKind>("siswa");
  const [mapelSkkTab, setMapelSkkTab] = useState<"mapel" | "skk">("mapel");
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<SchoolNavGroupId, boolean>>({
    beranda: true,
    master: true,
    kbm: true,
    cbt: false,
    rapor: false,
    pengaturan: true,
  });
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
      const rawData: unknown = await response.json();
      const data = unwrapSchoolPayload(rawData);
      const resolvedSchoolName =
        data && typeof data.sekolah === "string" && data.sekolah.trim()
          ? data.sekolah.trim()
          : data && typeof data.nama === "string" && data.nama.trim()
            ? data.nama.trim()
            : data && typeof data.name === "string" && data.name.trim()
              ? data.name.trim()
              : "";
      const resolvedSlug = data && typeof data.slug === "string" && data.slug.trim() ? data.slug.trim() : fallbackSlug;
      if (!data || !resolvedSchoolName || !resolvedSlug) {
        throw new Error("Respons sesi tidak valid.");
      }
      const rawOrNormalized =
        (typeof data.plan === "string" ? data.plan : null) ??
        (typeof data.rawPlan === "string" ? data.rawPlan : null);
      const resolvedPlan = resolvePlanSlug(rawOrNormalized);
      const devFlag =
        data.isDeveloper === true ||
        (typeof data.email === "string" && data.email.trim().toLowerCase() === DEVELOPER_EMAIL);
      const themeKeyValue = typeof data.themeKey === "string" ? data.themeKey : undefined;

      setSchool(resolvedSchoolName);
      setSlug(resolvedSlug);
      setCacheScope(resolvedSlug);
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
        nama: typeof data.nama === "string" ? data.nama : initialAuth?.nama ?? "Admin",
        email: typeof data.email === "string" ? data.email : initialAuth?.email ?? null,
        isDeveloper: devFlag,
        sekolah: resolvedSchoolName,
        slug: resolvedSlug,
        plan: resolvedPlan,
        rawPlan: typeof data.rawPlan === "string" ? data.rawPlan : null,
        themeKey: themeKeyValue,
        updatedAt: Date.now(),
      });
      saveCachedTenantProfile(resolvedSlug, {
        nama: resolvedSchoolName,
        slug: resolvedSlug,
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

  function toggleGroup(groupId: SchoolNavGroupId) {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }

  function selectView(next: SchoolView, requiredPlan?: Exclude<PlanSlug, "basic">, label?: string) {
    if (requiredPlan && !hasPlanAccess(plan, requiredPlan)) {
      openUpgradePrompt(label ?? "Fitur Premium", requiredPlan);
      return;
    }
    if (next !== view) setTransitionAlternate((previous) => !previous);
    if (isSchoolDataKind(next)) setDataKind(next);
    const parentGroup = SIDEBAR_NAV_GROUPS.find((g) => g.items.some((i) => i.target === next));
    if (parentGroup) {
      setOpenGroups((prev) => (prev[parentGroup.id] ? prev : { ...prev, [parentGroup.id]: true }));
    }
    setView(next);
    setMenuOpen(false);
  }

  const planStyle = PLAN_BADGE_STYLES[plan];
  const effectiveMode: SandboxMode = isDeveloper ? sandboxMode : "client";
  const effectiveRole: SandboxRole = isDeveloper ? sandboxRole : "ADMIN";

  if (status === "unauthorized") return <Navigate to="/login" replace />;
  if (status === "loading") return <PortalSpinner label="Memuat portal sekolah" />;
  if (status !== "ready") return <main className="school-dashboard min-h-screen bg-slate-950 p-8 text-white">{error || "Sesi tidak tersedia. Muat ulang halaman."}</main>;

  return <TenantThemeProvider scope="sekolah" initialTheme={cachedTheme} plan={plan} onRequireUpgrade={openUpgradePrompt}><main className="dashboard-canvas glass-area min-h-screen text-slate-800">
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
        openGroups={openGroups}
        onToggleGroup={toggleGroup}
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
                className="dashboard-glass rounded-2xl p-6"
                inputClassName="glass-input mt-2 w-full rounded-xl px-4 py-3"
                buttonClassName="master-primary py-3 disabled:opacity-50"
              />
            </section>
          )}
          {(view === "materi-tugas" || view === "ruang-kbm" || view === "materi-ajar" || view === "tugas-penilaian") && (
            <Classroom key="materi-tugas" role="ADMIN" initialTab={view === "tugas-penilaian" ? "tugas" : undefined} />
          )}
          {view === "verval-dapodik" && <VervalDapodikView />}
          {view === "impor-dapodik" && hasPlanAccess(plan, "reguler") && (
            <SchoolImportPanel onGoToStudents={() => selectView("siswa")} />
          )}
          {view === "penempatan-kelas" && hasPlanAccess(plan, "reguler") && (
            <SchoolBulkPlacementView />
          )}
          {view === "presensi" && (
            <SchoolAcademicRecap mode="presensi" onOpenClassroom={() => selectView("materi-tugas")} />
          )}
          {view === "rekap-akademik" && hasPlanAccess(plan, "reguler") && (
            <SchoolAcademicRecap mode="rekap" onOpenClassroom={() => selectView("materi-tugas")} />
          )}
          {view === "tema-identitas" && (
            <SchoolThemeIdentityView
              canUsePro={hasPlanAccess(plan, "pro")}
              onOpenPassword={() => selectView("password")}
              onOpenAdvanced={() => selectView("pengaturan-lanjutan", "pro", "Pengaturan Lanjutan Tenant")}
            />
          )}
          {view === "pengaturan-lanjutan" && hasPlanAccess(plan, "pro") && (
            <SchoolAdvancedSettingsView
              onOpenTheme={() => selectView("tema-identitas")}
              onOpenClasses={() => selectView("kelas")}
            />
          )}
          {view === "modul-kesetaraan" && <ModulKesetaraanView />}
          {view === "mapel" && (
            <div className="dashboard-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={mapelSkkTab === "mapel"}
                  onClick={() => setMapelSkkTab("mapel")}
                  className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                    mapelSkkTab === "mapel"
                      ? "bg-sky-700 text-white shadow-xs"
                      : "bg-white/75 text-slate-700 hover:bg-white"
                  }`}
                >
                  Daftar Mata Pelajaran &amp; KKM
                </button>
                <button
                  type="button"
                  aria-pressed={mapelSkkTab === "skk"}
                  onClick={() => setMapelSkkTab("skk")}
                  className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                    mapelSkkTab === "skk"
                      ? "bg-sky-700 text-white shadow-xs"
                      : "bg-white/75 text-slate-700 hover:bg-white"
                  }`}
                >
                  Modul Kesetaraan &amp; Bobot SKK
                </button>
              </div>
              <span className="px-2 text-xs font-semibold text-slate-600">Paket Basic+ · Paket A, B &amp; C</span>
            </div>
          )}
          {view === "mapel" && mapelSkkTab === "skk" && <ModulKesetaraanView />}
          {view === "cek-raport" && hasPlanAccess(plan, "reguler") && <CekRaportView />}
          {view === "cbt-bank-soal" && hasPlanAccess(plan, "reguler") && (
            <CbtBankSoalView onOpenSettings={() => selectView("cbt-pengaturan", "reguler", "Pengaturan Ujian CBT")} />
          )}
          {view === "cbt-impor" && hasPlanAccess(plan, "reguler") && <CbtImportView />}
          {view === "cbt-jadwal" && hasPlanAccess(plan, "reguler") && (
            <CbtJadwalView onOpenSettings={() => selectView("cbt-pengaturan", "reguler", "Pengaturan Ujian CBT")} />
          )}
          {view === "cbt-monitoring" && hasPlanAccess(plan, "reguler") && <CbtMonitoringView />}
          {view === "cbt-pengaturan" && hasPlanAccess(plan, "reguler") && <CbtPengaturanView />}
          {view === "akreditasi-snp" && hasPlanAccess(plan, "pro") && <AkreditasiSnpView />}
          {view === "keuangan-spp" && hasPlanAccess(plan, "pro") && <KeuanganSppView />}
          {view === "kartu-digital-qr" && hasPlanAccess(plan, "reguler") && <KartuDigitalQrView />}
          {view === "data-alumni" && hasPlanAccess(plan, "pro") && <DataAlumniView />}
          {view === "asisten-ai" && hasPlanAccess(plan, "pro") && <AsistenAiView />}
          {view === "manajemen-aset" && hasPlanAccess(plan, "pro") && <ManajemenAsetView />}
          {view === "ruang-diskusi" && <RuangDiskusiView />}
          <SchoolData
            slug={slug}
            kind={dataKind}
            visible={isSchoolDataKind(view) && (view !== "mapel" || mapelSkkTab === "mapel")}
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
  openGroups,
  onToggleGroup,
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
  openGroups: Record<SchoolNavGroupId, boolean>;
  onToggleGroup: (groupId: SchoolNavGroupId) => void;
  refreshingPlan: boolean;
  onRefreshPlan: () => void;
  onSelectView: (next: SchoolView, requiredPlan?: Exclude<PlanSlug, "basic">, label?: string) => void;
  onLogout: () => void;
}) {
  const theme = useTenantTheme();
  const palette = SIDEBAR_THEMES[theme] ?? SIDEBAR_THEMES.ocean;
  const badgeClass = planStyle.sidebarClass;

  function renderMenuItem(item: SchoolMenuItem) {
    const Icon = item.icon;
    const active =
      view === item.target ||
      (item.target === "mapel" && view === "modul-kesetaraan") ||
      (item.target === "materi-tugas" && (view === "ruang-kbm" || view === "materi-ajar" || view === "tugas-penilaian")) ||
      (item.target === "cbt-bank-soal" && view === "cbt-pengaturan");
    const locked = item.requiredPlan ? !hasPlanAccess(plan, item.requiredPlan) : false;
    return (
      <button
        key={item.target}
        type="button"
        title={item.label}
        data-sidebar-nav="true"
        aria-current={active ? "page" : undefined}
        onMouseEnter={() => {
          if (!locked) prefetchForView(item.target);
        }}
        onClick={() => onSelectView(item.target, item.requiredPlan, item.label)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors duration-200 ${
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
          <span className="leading-snug">{item.label}</span>
        </span>
        {item.requiredPlan && (
          <span
            className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider ${
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
      </button>
    );
  }

  return (
    <aside
      className={`${menuOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-50 w-72 flex-col border-r p-3.5 transition-colors duration-300 lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0 ${palette.aside}`}
    >
      <div className={`flex items-center justify-between gap-2 border-b pb-3.5 ${palette.headerDivider}`}>
        <div className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border p-2.5 ${palette.identityCard}`}>
          <BrandLogo alt={`Logo ${school}`} className="h-9 w-9 rounded-xl border border-white/20" />
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
        <p className={`mb-2 px-3 text-[10px] font-black uppercase tracking-wider ${palette.sectionLabel}`}>NAVIGASI PORTAL E-UJIAN</p>

        <div className="space-y-2">
          {SIDEBAR_NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            const isOpen = openGroups[group.id];
            return (
              <div key={group.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => onToggleGroup(group.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition ${palette.groupButton}`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${palette.groupIcon}`}>
                      <GroupIcon size={14} />
                    </span>
                    <span>{group.label}</span>
                  </span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isOpen && (
                  <div className={`ml-3 mt-1 space-y-1 border-l pl-2.5 ${palette.groupBorder}`}>
                    {group.items.map((item) => renderMenuItem(item))}
                  </div>
                )}
              </div>
            );
          })}
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
        <PWAInstallButton
          compact
          className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${palette.tierCard}`}
        />
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
  const isDark = theme === "dark";
  const palette = SIDEBAR_THEMES[theme] ?? SIDEBAR_THEMES.ocean;
  const headerBadgeClass = isDark ? planStyle.sidebarClass : planStyle.headerClass;
  return (
    <header className="dashboard-header sticky top-0 z-30 mx-4 mt-4 flex items-center gap-3 rounded-2xl border px-4 py-3 sm:mx-6 sm:mt-6 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Buka menu sekolah"
        aria-expanded={menuOpen}
        className={`rounded-lg p-2 lg:hidden ${palette.headerMenuBtn}`}
      >
        <Menu size={21} />
      </button>
      {isDark && (
        <BrandLogo alt={`Logo ${school}`} className="hidden h-9 w-9 rounded-xl border border-white/15 sm:block" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className={`inline-block max-w-full truncate rounded-lg text-sm font-extrabold ${isDark ? "px-0 py-0.5 text-white sm:text-base" : `px-3 py-1 ${palette.headerSchoolPill}`}`}>
            {school}
          </h1>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
              isDark
                ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Sekolah Aktif
          </span>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${headerBadgeClass}`}>
            {planStyle.label}
          </span>
        </div>
      </div>
      {isDark ? (
        <div className="flex items-center gap-2.5">
          <span className="hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-3.5 py-1.5 text-xs font-extrabold text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)] sm:inline-flex">
            <ShieldCheck size={14} aria-hidden="true" />
            Mode Admin
          </span>
          <span className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-black ${palette.headerAvatar}`}>
            AD
          </span>
        </div>
      ) : (
        <>
          <span className="hidden text-xs font-bold text-slate-700 sm:block">Admin</span>
          <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white shadow-md ${palette.headerAvatar}`}>
            AD
          </span>
        </>
      )}
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
  const isDark = theme === "dark";
  const palette = SIDEBAR_THEMES[theme] ?? SIDEBAR_THEMES.ocean;
  return (
    <nav
      aria-label="Navigasi bawah sekolah"
      className={
        isDark
          ? "fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-center justify-around gap-1 rounded-full border border-slate-700/60 bg-slate-900/90 px-2 py-1.5 shadow-[0_14px_40px_rgba(2,6,23,0.75)] backdrop-blur-2xl md:hidden"
          : "fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-white/85 bg-white/90 px-1 pt-2 shadow-[0_-8px_30px_rgba(15,76,129,0.08)] backdrop-blur-xl md:hidden"
      }
      style={isDark ? undefined : { paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {([
        { label: "Beranda", icon: Home, active: !menuOpen && view === "dashboard", click: () => onSelectView("dashboard") },
        { label: "Siswa", icon: Users, active: !menuOpen && view === "siswa", click: () => onSelectView("siswa") },
        { label: "Materi", icon: BookOpen, active: !menuOpen && (view === "materi-tugas" || view === "materi-ajar" || view === "tugas-penilaian" || view === "ruang-kbm"), click: () => onSelectView("materi-tugas") },
        { label: "PPDB", icon: ClipboardList, active: !menuOpen && view === "ppdb", click: () => onSelectView("ppdb") },
        { label: "Menu", icon: LayoutGrid, active: menuOpen || (view !== "dashboard" && view !== "siswa" && view !== "materi-tugas" && view !== "materi-ajar" && view !== "tugas-penilaian" && view !== "ruang-kbm" && view !== "ppdb"), click: onOpenMenu },
      ] as const).map(({ label, icon: Icon, active, click }) =>
        isDark ? (
          <button
            key={label}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={click}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 text-[10px] transition ${
              active
                ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)]"
                : "font-medium text-slate-400 hover:text-white"
            }`}
          >
            <Icon size={17} />
            <span className="truncate">{label}</span>
          </button>
        ) : (
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
                label === "Materi"
                  ? `-mt-6 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg ${palette.mobileFab}`
                  : `rounded-xl p-1.5 ${active ? palette.mobileAccentBg : ""}`
              }
            >
              <Icon size={20} />
            </span>
            {label}
          </button>
        ),
      )}
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
  onSelect: (view: ActiveDataKind) => void;
  onOpenView: (view: SchoolView, requiredPlan?: Exclude<PlanSlug, "basic">, label?: string) => void;
  onRequireUpgrade: (featureName: string, requiredPlan: Exclude<PlanSlug, "basic">) => void;
}) {
  const theme = useTenantTheme();
  const isDark = theme === "dark";
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
      iconClass: isDark ? "border border-amber-400/25 bg-amber-500/15 text-amber-400" : "bg-indigo-600/10 text-indigo-700",
    },
    {
      id: "guru" as const,
      label: "GURU AKTIF",
      value: summary ? String(summary.guru) : "0",
      sub: "Tutor & pengampu mapel",
      icon: GraduationCap,
      tint: "from-violet-50 to-purple-100",
      iconClass: isDark ? "border border-violet-400/25 bg-violet-500/15 text-violet-300" : "bg-violet-600/10 text-violet-700",
    },
    {
      id: "kelas" as const,
      label: avgDisplay !== null ? "RATA-RATA NILAI" : "KELAS AKTIF",
      value: avgDisplay !== null ? String(avgDisplay) : summary ? String(summary.kelas) : "0",
      sub: avgDisplay !== null ? `${summary?.kelas ?? 0} kelas aktif` : "Rombel Kesetaraan",
      icon: avgDisplay !== null ? Award : Building2,
      tint: "from-cyan-50 to-sky-100",
      iconClass: isDark ? "border border-sky-400/25 bg-sky-500/15 text-sky-300" : "bg-cyan-600/10 text-cyan-700",
    },
    {
      id: "ppdb" as const,
      label: "PENDAFTAR BARU",
      value: summary ? String(summary.ppdb) : "0",
      sub: `${totalPpdb} total pendaftar PPDB`,
      icon: ClipboardList,
      tint: "from-emerald-50 to-teal-100",
      iconClass: isDark ? "border border-emerald-400/25 bg-emerald-500/15 text-emerald-300" : "bg-emerald-600/10 text-emerald-700",
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
                  className={
                    isDark
                      ? "flex items-center justify-between gap-4 rounded-2xl border border-slate-700/50 bg-[#0d1628]/85 p-5 text-left shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-400/40"
                      : `flex items-center justify-between gap-4 rounded-2xl border border-white bg-gradient-to-br ${card.tint} p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`
                  }
                >
                  <div className="min-w-0">
                    <p className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>{card.label}</p>
                    <p className={`mt-2 text-3xl font-black tracking-tight tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>{card.value}</p>
                    <p className={`mt-1 truncate text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>{card.sub}</p>
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
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        isDark ? "border border-amber-400/25 bg-amber-500/15 text-amber-400" : "bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      <BarChart3 size={18} />
                    </span>
                    <div>
                      <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Statistik Nilai Rata-rata Mapel</h3>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Capaian nilai evaluasi warga belajar terhadap batas ketuntasan minimal</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      canUseRecap
                        ? onOpenView("rekap-akademik", "reguler", "Analitik & Rekap Nilai")
                        : onRequireUpgrade("Analitik & Rekap Nilai", "reguler")
                    }
                    className={
                      isDark
                        ? "rounded-full border border-amber-400/35 bg-amber-500/12 px-3.5 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"
                        : "rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50"
                    }
                  >
                    {canUseRecap ? "Buka Analitik Lengkap" : "Paket Reguler+"}
                  </button>
                </div>

                {!canUseRecap ? (
                  <div
                    className={`mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center ${
                      isDark ? "border-slate-700/70 bg-slate-950/60" : "border-slate-300/80 bg-white/50"
                    }`}
                  >
                    <p className={`max-w-md text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      Grafik perbandingan rata-rata nilai per mata pelajaran dan rekap presensi tersedia mulai{" "}
                      <strong className={isDark ? "text-amber-300" : undefined}>Paket Reguler</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => onRequireUpgrade("Analitik & Rekap Nilai", "reguler")}
                      className="master-primary mt-4 rounded-xl px-4 py-2"
                    >
                      Lihat Paket Reguler
                    </button>
                  </div>
                ) : subjectStats.length === 0 ? (
                  <div
                    className={`mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center ${
                      isDark ? "border-slate-700/70 bg-slate-950/60" : "border-slate-300/80 bg-white/50"
                    }`}
                  >
                    <p className={`max-w-md text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      Belum ada entri nilai simulasi atau nilai akhir yang tercatat. Mulai kelola materi, tugas, dan penilaian melalui Ruang KBM.
                    </p>
                    <button
                      type="button"
                      onClick={() => onOpenView("materi-tugas")}
                      className="master-primary mt-4 rounded-xl px-4 py-2"
                    >
                      Buka Materi &amp; Tugas Kelas
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {subjectStats.map((item) => {
                      const passed = item.avg >= 75;
                      return (
                        <div key={item.nama} className="space-y-1">
                          <div className={`flex items-center justify-between text-xs font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                            <span className="truncate pr-3">{item.nama}</span>
                            <span className={`tabular-nums ${passed ? (isDark ? "text-emerald-400" : "text-emerald-700") : (isDark ? "text-amber-400" : "text-amber-700")}`}>
                              {item.avg}
                            </span>
                          </div>
                          <div className={`h-2.5 w-full overflow-hidden rounded-full ${isDark ? "bg-slate-800/90" : "bg-slate-200/80"}`}>
                            <div
                              className={`h-full rounded-full ${
                                passed
                                  ? isDark
                                    ? "bg-gradient-to-r from-emerald-400 to-teal-400"
                                    : "bg-gradient-to-r from-indigo-500 to-emerald-500"
                                  : "bg-gradient-to-r from-amber-400 to-orange-500"
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

              <div
                className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
                  isDark ? "border-slate-700/60 bg-slate-950/55" : "border-slate-200/80 bg-white/75"
                }`}
              >
                <div className="flex flex-wrap items-center gap-4">
                  <span className={`inline-flex items-center gap-1.5 font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    Tuntas (&ge; 75 KKM)
                  </span>
                  <span className={`inline-flex items-center gap-1.5 font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    Perlu Pendampingan (&lt; 75)
                  </span>
                </div>
                <span className={`font-bold ${isDark ? "text-amber-300" : "text-indigo-900"}`}>Target KKM Lembaga: 75</span>
              </div>
            </div>

            <div className="dashboard-glass flex flex-col justify-between rounded-2xl p-6 lg:col-span-4">
              <div>
                <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Aliran Pendaftar PPDB</h3>
                <p className={`mt-0.5 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Ringkasan status verifikasi calon warga belajar</p>
                <div
                  className="mx-auto mt-5 flex h-36 w-36 items-center justify-center rounded-full shadow-inner"
                  style={{
                    background: totalPpdb
                      ? `conic-gradient(#f59e0b 0 ${(summary.ppdb / totalPpdb) * 100}%, #10b981 0 ${((summary.ppdb + summary.ppdbDiterima) / totalPpdb) * 100}%, #f43f5e 0)`
                      : isDark
                        ? "#1e293b"
                        : "#e2e8f0",
                  }}
                >
                  <div
                    className={`flex h-24 w-24 flex-col items-center justify-center rounded-full shadow-xs ${
                      isDark ? "border border-slate-700/70 bg-[#0b1324] text-white" : "bg-white text-slate-900"
                    }`}
                  >
                    <span className="text-2xl font-black tabular-nums">{totalPpdb}</span>
                    <span className={`text-[11px] font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Pendaftar</span>
                  </div>
                </div>
                <div className={`mt-5 space-y-2 text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      Menunggu Verifikasi
                    </span>
                    <strong className="tabular-nums">{summary.ppdb}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      Diterima
                    </span>
                    <strong className="tabular-nums">{summary.ppdbDiterima}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                      Ditolak
                    </span>
                    <strong className="tabular-nums">{summary.ppdbDitolak}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelect("ppdb")}
                className="master-primary mt-5 w-full rounded-xl py-2.5"
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
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        isDark ? "border border-sky-400/25 bg-sky-500/15 text-sky-300" : "bg-cyan-50 text-cyan-700"
                      }`}
                    >
                      <Activity size={18} />
                    </span>
                    <div>
                      <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Aktivitas Sistem Terkini</h3>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Pantauan operasional akademik dan pendaftaran lembaga</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      canUseRecap
                        ? onOpenView("rekap-akademik", "reguler", "Analitik & Rekap Nilai")
                        : onOpenView("materi-tugas")
                    }
                    className={
                      isDark
                        ? "rounded-full border border-slate-700/80 bg-slate-800/80 px-3.5 py-1.5 text-xs font-bold text-slate-200 transition hover:border-amber-400/40 hover:text-amber-300"
                        : "rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50"
                    }
                  >
                    Lihat Semua Aktivitas
                  </button>
                </div>

                <ul className="mt-5 space-y-2.5 text-xs">
                  <li
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                      isDark ? "border-slate-700/50 bg-slate-950/55 text-slate-300" : "border-white bg-white/90 text-slate-800"
                    }`}
                  >
                    <span>Total warga belajar aktif &amp; rombel berjalan</span>
                    <strong className={`tabular-nums ${isDark ? "text-amber-300" : "text-indigo-900"}`}>
                      {summary.siswa} siswa · {summary.kelas} kelas
                    </strong>
                  </li>
                  <li
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                      isDark ? "border-slate-700/50 bg-slate-950/55 text-slate-300" : "border-white bg-white/90 text-slate-800"
                    }`}
                  >
                    <span>Antrean seleksi PPDB menunggu tinjauan</span>
                    <strong className={`tabular-nums ${summary.ppdb > 0 ? (isDark ? "text-amber-300" : "text-amber-700") : (isDark ? "text-emerald-300" : "text-emerald-700")}`}>
                      {summary.ppdb} pendaftar
                    </strong>
                  </li>
                  <li
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                      isDark ? "border-slate-700/50 bg-slate-950/55 text-slate-300" : "border-white bg-white/90 text-slate-800"
                    }`}
                  >
                    <span>Aktivitas materi ajar, tugas KBM, &amp; presensi</span>
                    <strong className={isDark ? "text-white" : "text-slate-900"}>
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
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        isDark ? "border border-emerald-400/25 bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      <Server size={18} />
                    </span>
                    <div>
                      <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Status Sistem &amp; Kapasitas Layanan</h3>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Konfigurasi tenant dan paket langganan</p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${
                      isDark
                        ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-300"
                        : "border-emerald-200 bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    ONLINE
                  </span>
                </div>

                <dl
                  className={`mt-5 space-y-2.5 rounded-xl border p-4 text-xs ${
                    isDark ? "border-slate-700/50 bg-slate-950/55" : "border-white bg-white/90"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <dt className={isDark ? "text-slate-400" : "text-slate-600"}>Paket Langganan</dt>
                    <dd className={`font-extrabold ${isDark ? "text-amber-300" : "text-indigo-900"}`}>{activePlan.name}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className={isDark ? "text-slate-400" : "text-slate-600"}>Subdomain Portal</dt>
                    <dd className={`truncate font-mono font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{slug}.pkbm.siput.id</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className={isDark ? "text-slate-400" : "text-slate-600"}>Kapasitas Guru &amp; Kelas</dt>
                    <dd className={`font-bold tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>
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
                    className="master-primary flex-1 rounded-xl py-2.5"
                  >
                    Pengaturan Lanjutan Tenant
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRequireUpgrade("Pengaturan Lanjutan Tenant", "pro")}
                    className="master-primary flex-1 rounded-xl py-2.5"
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
