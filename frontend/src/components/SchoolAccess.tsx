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
import { isThemeKey, TenantThemeProvider, type ThemeKey } from "./TenantThemeProvider";
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

  function renderMenuItem(item: SchoolMenuItem, standalone = false) {
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
        onClick={() => selectView(item.target, item.requiredPlan, item.label)}
        className={`flex w-full items-center justify-between gap-1.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors duration-200 ${
          active
            ? "border border-white/15 bg-white/10 text-white shadow-inner backdrop-blur-md"
            : locked
              ? "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              : standalone
                ? "text-slate-300 hover:bg-white/10 hover:text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              active ? "bg-gradient-to-br from-indigo-500 to-cyan-500 text-white" : "bg-slate-800/70 text-slate-300"
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
                className="inline-flex items-center rounded border border-sky-400/30 bg-sky-500/15 px-1 py-0.5 text-[7px] font-extrabold uppercase tracking-wider text-sky-200"
              >
                DEV
              </span>
            )}
            {item.requiredPlan && (
              <span
                className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[7px] font-extrabold uppercase tracking-wider ${
                  item.requiredPlan === "pro"
                    ? locked
                      ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30"
                      : "bg-amber-400/20 text-amber-200"
                    : locked
                      ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30"
                      : "bg-cyan-400/20 text-cyan-200"
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
      <aside className={`${menuOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-50 w-64 flex-col border-r border-slate-800/80 bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 p-3.5 text-slate-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0`}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-slate-700/50 bg-slate-800/40 p-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 font-black text-white shadow-sm">
              {school.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black uppercase tracking-wide text-white">{school}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-bold uppercase text-indigo-300">ADMIN</span>
                <span className={`inline-flex rounded border px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider ${planStyle.sidebarClass}`}>
                  {planStyle.label}
                </span>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Tutup menu" className="rounded-lg p-1.5 text-slate-300 lg:hidden"><X size={18} /></button>
        </div>

        <nav aria-label="Menu sekolah" className="dashboard-scrollbar mt-3.5 min-h-0 flex-1 overflow-y-auto pr-0.5">
          <button
            type="button"
            aria-current={view === "dashboard" ? "page" : undefined}
            onMouseEnter={() => prefetchForView("dashboard")}
            onClick={() => selectView("dashboard")}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs font-bold transition ${
              view === "dashboard"
                ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800/80">
              <LayoutDashboard size={15} />
            </span>
            <span className="truncate">Dashboard Utama</span>
          </button>

          <p className="mb-2 mt-4 px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 opacity-60">MENU NAVIGASI</p>

          <div className="space-y-1.5">
            <div>
              <button
                type="button"
                aria-expanded={masterOpen}
                onClick={() => setMasterOpen(!masterOpen)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold text-slate-200 hover:bg-slate-800/80"
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800/80">
                    <Database size={14} />
                  </span>
                  <span>Master Data</span>
                </span>
                {masterOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {masterOpen && (
                <div className="ml-3 mt-1.5 space-y-1.5 border-l border-slate-700/70 pl-2.5">
                  {visibleMasterItems.map((item) => renderMenuItem(item))}
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                aria-expanded={academicOpen}
                onClick={() => setAcademicOpen(!academicOpen)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold text-slate-200 hover:bg-slate-800/80"
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800/80">
                    <GraduationCap size={14} />
                  </span>
                  <span>Akademik &amp; Rapor</span>
                </span>
                {academicOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {academicOpen && (
                <div className="ml-3 mt-1.5 space-y-1.5 border-l border-slate-700/70 pl-2.5">
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
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold text-slate-200 hover:bg-slate-800/80"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800/80">
                      <MonitorCheck size={14} />
                    </span>
                    <span>Ujian Online (CBT)</span>
                  </span>
                  {cbtOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {cbtOpen && (
                  <div className="ml-3 mt-1.5 space-y-1.5 border-l border-slate-700/70 pl-2.5">
                    {visibleCbtItems.map((item) => renderMenuItem(item))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-2 space-y-1.5 border-t border-slate-800/70 pt-2">
            {visibleStandaloneItems.map((item) => renderMenuItem(item, true))}
          </div>
        </nav>

        <div className="mt-3 shrink-0 space-y-2.5 border-t border-slate-800/80 pt-3">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 py-2">
            <span className="text-[11px] font-bold text-slate-300">Tier Akses</span>
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${planStyle.sidebarClass}`}>
                {planStyle.label}
              </span>
              <button
                type="button"
                disabled={refreshingPlan}
                onClick={() => void refreshSessionProfile({ manual: true })}
                title="Segarkan status paket"
                aria-label="Segarkan status paket"
                className="rounded p-1 text-slate-300 transition hover:bg-slate-700/70 hover:text-white disabled:opacity-50"
              >
                <RefreshCw size={12} className={refreshingPlan ? "animate-spin" : ""} aria-hidden="true" />
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-rose-900/60 bg-rose-950/25 px-3.5 py-2.5 text-xs font-bold text-rose-300 transition hover:bg-rose-950/50"
          >
            <LogOut size={15} />
            Keluar
          </button>
        </div>
      </aside>
      {menuOpen && <button type="button" aria-label="Tutup menu sekolah" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden" />}
      <div className="min-w-0 flex-1">
        <header className="dashboard-header sticky top-0 z-30 mx-4 mt-4 flex items-center gap-3 rounded-xl border px-4 py-3 sm:mx-6 sm:mt-6 sm:px-6">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Buka menu sekolah" aria-expanded={menuOpen} className="rounded-lg p-2 hover:bg-indigo-100 lg:hidden"><Menu size={21} /></button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="inline-block max-w-full truncate rounded-lg bg-indigo-50 px-3 py-1 text-sm font-extrabold text-indigo-900">{school}</h1>
              <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${planStyle.headerClass}`}>
                {planStyle.label}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />Sekolah aktif</p>
          </div>
          <span className="hidden text-xs font-bold text-slate-700 sm:block">Admin</span><span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-xs font-bold text-white shadow-md">AD</span>
        </header>
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
    <nav aria-label="Navigasi bawah sekolah" className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-white/70 bg-white/80 px-1 pt-2 shadow-[0_-8px_30px_rgba(79,70,229,0.08)] backdrop-blur-xl md:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
      {([
        { label: "Beranda", icon: Home, active: !menuOpen && view === "dashboard", click: () => selectView("dashboard") },
        { label: "Siswa", icon: Users, active: !menuOpen && view === "siswa", click: () => selectView("siswa") },
        { label: "Jadwal", icon: CalendarDays, active: !menuOpen && view === "akademik", click: () => selectView("akademik") },
        { label: "PPDB", icon: ClipboardList, active: !menuOpen && view === "ppdb", click: () => selectView("ppdb") },
        { label: "Menu Lainnya", icon: LayoutGrid, active: menuOpen || (view !== "dashboard" && view !== "siswa" && view !== "akademik" && view !== "ppdb"), click: () => setMenuOpen(true) },
      ] as const).map(({ label, icon: Icon, active, click }) => <button key={label} type="button" aria-current={active ? "page" : undefined} onClick={click} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[10px] ${active ? "font-semibold text-indigo-600" : "font-medium text-slate-600"}`}><span className={label === "Jadwal" ? "-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-lg" : `rounded-xl p-1.5 ${active ? "bg-indigo-50/80" : ""}`}><Icon size={20} /></span>{label}</button>)}
    </nav>
    )}
  </main></TenantThemeProvider>;
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
