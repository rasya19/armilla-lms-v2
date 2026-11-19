import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Database,
  Eye,
  EyeOff,
  FileSpreadsheet,
  GraduationCap,
  Home,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  LogOut,
  Menu,
  Palette,
  Settings,
  Settings2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { SchoolData, type SchoolDataKind } from "./SchoolData";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { LoginNavigation } from "./LoginNavigation";
import { DashboardHero } from "./DashboardUI";
import { Classroom } from "./Classroom";
import { TenantThemeProvider } from "./TenantThemeProvider";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { resetStandardClassesCache } from "./standardClasses";
import { getPlanBySlug, hasPlanAccess, resolvePlanSlug, type PlanSlug } from "./subscriptionPlans";
import {
  SchoolAcademicRecap,
  SchoolAdvancedSettingsView,
  SchoolBulkPlacementView,
  SchoolImportPanel,
  SchoolThemeIdentityView,
  UpgradePlanModal,
} from "./SchoolTierViews";

type SchoolView =
  | SchoolDataKind
  | "dashboard"
  | "password"
  | "ruang-kbm"
  | "impor-dapodik"
  | "penempatan-kelas"
  | "rekap-akademik"
  | "tema-identitas"
  | "pengaturan-lanjutan";

type SchoolMenuItem = {
  label: string;
  icon: LucideIcon;
  target: Exclude<SchoolView, "dashboard">;
  requiredPlan?: Exclude<PlanSlug, "basic">;
};

const DATA_KINDS = new Set<SchoolView>(["siswa", "guru", "ppdb", "kelas", "mapel", "akademik"]);

function isSchoolDataKind(view: SchoolView): view is SchoolDataKind {
  return DATA_KINDS.has(view);
}

const masterItems: SchoolMenuItem[] = [
  { label: "Data Siswa", icon: Users, target: "siswa" },
  { label: "Data Guru", icon: GraduationCap, target: "guru" },
  { label: "Manajemen Kelas", icon: Building2, target: "kelas" },
  { label: "Kelola Mapel", icon: BookOpen, target: "mapel" },
  { label: "PPDB Online", icon: ClipboardList, target: "ppdb" },
];

const academicItems: SchoolMenuItem[] = [
  { label: "Tahun & Jadwal", icon: CalendarDays, target: "akademik" },
  { label: "Ruang KBM", icon: BookOpen, target: "ruang-kbm" },
  { label: "Impor Massal Dapodik", icon: FileSpreadsheet, target: "impor-dapodik", requiredPlan: "reguler" },
  { label: "Penempatan & Kenaikan Kelas", icon: ArrowLeftRight, target: "penempatan-kelas", requiredPlan: "reguler" },
  { label: "Rekap Akademik & Nilai", icon: BarChart3, target: "rekap-akademik", requiredPlan: "reguler" },
];

const settingsItems: SchoolMenuItem[] = [
  { label: "Tema & Identitas Sekolah", icon: Palette, target: "tema-identitas", requiredPlan: "pro" },
  { label: "Pengaturan Lanjutan", icon: Settings2, target: "pengaturan-lanjutan", requiredPlan: "pro" },
  { label: "Ganti Password", icon: KeyRound, target: "password" },
];

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordHelp, setShowPasswordHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sekolah/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!response.ok) {
        let message = "Layanan login sekolah tidak tersedia.";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const data: unknown = await response.json();
          if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") message = data.error;
        }
        throw new Error(message);
      }
      setPassword("");
      navigate("/sekolah");
    } catch (error) {
      console.error("Login sekolah gagal:", error);
      setError(error instanceof TypeError ? "Server tidak dapat dihubungi." : error instanceof Error ? error.message : "Login gagal.");
    } finally { setBusy(false); }
  }
  return <main className="glass-shell glass-login-shell flex min-h-screen items-center justify-center px-5 py-5"><div className="glass-panel glass-login w-full max-w-md rounded-3xl p-6">
    <p className="master-eyebrow">KESETARAAN LMS / SEKOLAH</p><h1 className="mt-3 text-2xl font-bold">Login Admin Sekolah</h1>
    <p className="mt-3 text-sm text-slate-700">Masuk menggunakan akun admin sekolah Anda.</p>
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
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "error">("loading");
  const [school, setSchool] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState<PlanSlug>("basic");
  const [error, setError] = useState("");
  const [view, setView] = useState<SchoolView>("dashboard");
  const [transitionAlternate, setTransitionAlternate] = useState(false);
  const [dataKind, setDataKind] = useState<SchoolDataKind>("siswa");
  const [menuOpen, setMenuOpen] = useState(false);
  const [masterOpen, setMasterOpen] = useState(true);
  const [academicOpen, setAcademicOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [upgradePrompt, setUpgradePrompt] = useState<{ featureName: string; requiredPlan: Exclude<PlanSlug, "basic"> } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/sekolah/session", { signal: controller.signal }).then(async (response) => {
      if (response.status === 401) { setStatus("unauthorized"); return; }
      if (!response.ok) throw new Error("Gagal memeriksa sesi sekolah.");
      const data: unknown = await response.json();
      if (typeof data !== "object" || data === null || !("sekolah" in data) || typeof data.sekolah !== "string" || !("slug" in data) || typeof data.slug !== "string") throw new Error("Respons sesi tidak valid.");
      setSchool(data.sekolah);
      setSlug(data.slug);
      const rawOrNormalized =
        ("plan" in data && typeof data.plan === "string" ? data.plan : null) ??
        ("rawPlan" in data && typeof data.rawPlan === "string" ? data.rawPlan : null);
      setPlan(resolvePlanSlug(rawOrNormalized));
      setStatus("ready");
    }).catch((error: unknown) => { if (!controller.signal.aborted) { console.error(error); setStatus("error"); } });
    return () => controller.abort();
  }, []);

  async function logout() {
    try {
      const response = await fetch("/api/auth/sekolah/logout", { method: "POST" });
      if (!response.ok) throw new Error("Gagal keluar. Coba lagi.");
      invalidateCache();
      resetStandardClassesCache();
      navigate("/login");
    } catch (error) { console.error(error); setError("Gagal keluar. Coba lagi."); }
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

  function renderMenuItem(item: SchoolMenuItem) {
    const Icon = item.icon;
    const active = view === item.target;
    const locked = item.requiredPlan ? !hasPlanAccess(plan, item.requiredPlan) : false;
    return (
      <button
        key={item.label}
        type="button"
        aria-current={active ? "page" : undefined}
        onClick={() => selectView(item.target, item.requiredPlan, item.label)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors duration-200 ${
          active
            ? "border border-white/15 bg-white/10 text-white shadow-inner backdrop-blur-md"
            : locked
              ? "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className={`shrink-0 rounded-lg p-1.5 ${active ? "bg-gradient-to-br from-indigo-500 to-cyan-500 text-white" : "bg-slate-800/60"}`}>
            <Icon size={15} />
          </span>
          <span className="truncate">{item.label}</span>
        </span>
        {item.requiredPlan && (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
              item.requiredPlan === "pro"
                ? locked
                  ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30"
                  : "bg-amber-400/20 text-amber-200"
                : locked
                  ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30"
                  : "bg-cyan-400/20 text-cyan-200"
            }`}
          >
            {locked && <Lock size={10} aria-hidden="true" />}
            {item.requiredPlan === "pro" ? "Pro" : "Reguler"}
          </span>
        )}
      </button>
    );
  }

  const planStyle = PLAN_BADGE_STYLES[plan];

  if (status === "unauthorized") return <Navigate to="/login" replace />;
  if (status !== "ready") return <main className="school-dashboard min-h-screen p-8 text-white">{status === "loading" ? "Memeriksa sesi..." : "Sesi tidak tersedia. Muat ulang halaman."}</main>;

  return <TenantThemeProvider scope="sekolah"><main className="dashboard-canvas glass-area min-h-screen text-slate-800">
    <div className="mx-auto flex min-h-screen max-w-[1600px]">
      <aside className={`${menuOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-50 w-72 flex-col border-r border-slate-800/80 bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 p-4 text-slate-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0`}>
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-700/50 bg-slate-800/40 p-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 font-black text-white">
              {school.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black uppercase tracking-wide text-white">{school}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-indigo-300">Admin</span>
                <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${planStyle.sidebarClass}`}>
                  {planStyle.label}
                </span>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Tutup menu" className="rounded-lg p-2 text-slate-300 lg:hidden"><X size={20} /></button>
        </div>

        <nav aria-label="Menu sekolah" className="dashboard-scrollbar mt-4 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
          <button type="button" aria-current={view === "dashboard" ? "page" : undefined} onClick={() => selectView("dashboard")} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-bold ${view === "dashboard" ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white" : "text-slate-300 hover:bg-slate-800/70"}`}><span className="rounded-lg bg-slate-800/80 p-1.5"><LayoutDashboard size={16} /></span>Dashboard Utama</button>

          <p className="px-3 pb-1 pt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Menu navigasi</p>

          <button type="button" aria-expanded={masterOpen} onClick={() => setMasterOpen(!masterOpen)} className="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-bold text-slate-300 hover:bg-slate-800/80"><span className="flex items-center gap-3"><span className="rounded-lg bg-slate-800/80 p-1.5"><Database size={16} /></span>Master Data</span>{masterOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
          {masterOpen && <div className="ml-3 space-y-1 border-l border-slate-800 pl-3">{masterItems.map(renderMenuItem)}</div>}

          <button type="button" aria-expanded={academicOpen} onClick={() => setAcademicOpen(!academicOpen)} className="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-bold text-slate-300 hover:bg-slate-800/80"><span className="flex items-center gap-3"><span className="rounded-lg bg-slate-800/80 p-1.5"><GraduationCap size={16} /></span>Akademik &amp; KBM</span>{academicOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
          {academicOpen && <div className="ml-3 space-y-1 border-l border-slate-800 pl-3">{academicItems.map(renderMenuItem)}</div>}

          <button type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)} className="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-bold text-slate-300 hover:bg-slate-800/80"><span className="flex items-center gap-3"><span className="rounded-lg bg-slate-800/80 p-1.5"><Settings size={16} /></span>Pengaturan &amp; Tampilan</span>{settingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
          {settingsOpen && <div className="ml-3 space-y-1 border-l border-slate-800 pl-3">{settingsItems.map(renderMenuItem)}</div>}
        </nav>

        <button type="button" onClick={logout} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-rose-900/50 px-3.5 py-2.5 text-left text-xs font-bold text-rose-300 hover:bg-rose-950/40"><span className="rounded-lg bg-slate-800/80 p-1.5"><LogOut size={16} /></span>Keluar</button>
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
        <div className={`animate-page-enter ${transitionAlternate ? "page-enter-alternate" : ""} mx-auto max-w-7xl p-4 pb-28 sm:p-6 sm:pb-28 md:pb-6 lg:p-8`}>
          {view === "dashboard" && (
            <SchoolOverview
              school={school}
              plan={plan}
              onSelect={(target) => selectView(target)}
              onOpenRecap={() => selectView("rekap-akademik", "reguler", "Rekap Akademik & Nilai")}
              onRequireUpgrade={openUpgradePrompt}
            />
          )}
          {view === "password" && <PasswordChangeForm endpoint="/api/auth/sekolah/ganti-password" onChanged={() => navigate("/login", { state: { passwordChanged: true }, replace: true })} description="Verifikasi password saat ini sebelum membuat password baru." className="glass-panel rounded-2xl p-5" inputClassName="glass-input mt-2 w-full rounded-xl px-4 py-3" buttonClassName="master-primary py-3 disabled:opacity-50" />}
          {view === "ruang-kbm" && <Classroom role="ADMIN" />}
          {view === "impor-dapodik" && hasPlanAccess(plan, "reguler") && (
            <SchoolImportPanel onGoToStudents={() => selectView("siswa")} />
          )}
          {view === "penempatan-kelas" && hasPlanAccess(plan, "reguler") && (
            <SchoolBulkPlacementView />
          )}
          {view === "rekap-akademik" && hasPlanAccess(plan, "reguler") && (
            <SchoolAcademicRecap onOpenClassroom={() => selectView("ruang-kbm")} />
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
    {upgradePrompt && (
      <UpgradePlanModal
        featureName={upgradePrompt.featureName}
        requiredPlan={upgradePrompt.requiredPlan}
        currentPlan={plan}
        onClose={() => setUpgradePrompt(null)}
      />
    )}
    <nav aria-label="Navigasi bawah sekolah" className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-white/70 bg-white/80 px-1 pt-2 shadow-[0_-8px_30px_rgba(79,70,229,0.08)] backdrop-blur-xl md:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
      {([
        { label: "Beranda", icon: Home, active: !menuOpen && view === "dashboard", click: () => selectView("dashboard") },
        { label: "Siswa", icon: Users, active: !menuOpen && view === "siswa", click: () => selectView("siswa") },
        { label: "Jadwal", icon: CalendarDays, active: !menuOpen && view === "akademik", click: () => selectView("akademik") },
        { label: "PPDB", icon: ClipboardList, active: !menuOpen && view === "ppdb", click: () => selectView("ppdb") },
        { label: "Menu Lainnya", icon: LayoutGrid, active: menuOpen || (view !== "dashboard" && view !== "siswa" && view !== "akademik" && view !== "ppdb"), click: () => setMenuOpen(true) },
      ] as const).map(({ label, icon: Icon, active, click }) => <button key={label} type="button" aria-current={active ? "page" : undefined} onClick={click} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[10px] ${active ? "font-semibold text-indigo-600" : "font-medium text-slate-600"}`}><span className={label === "Jadwal" ? "-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-lg" : `rounded-xl p-1.5 ${active ? "bg-indigo-50/80" : ""}`}><Icon size={20} /></span>{label}</button>)}
    </nav>
  </main></TenantThemeProvider>;
}

type Summary = { siswa: number; guru: number; kelas: number; ppdb: number; ppdbDiterima: number; ppdbDitolak: number };

function SchoolOverview({
  school,
  plan,
  onSelect,
  onOpenRecap,
  onRequireUpgrade,
}: {
  school: string;
  plan: PlanSlug;
  onSelect: (view: SchoolDataKind) => void;
  onOpenRecap: () => void;
  onRequireUpgrade: (featureName: string, requiredPlan: Exclude<PlanSlug, "basic">) => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(() => getCached<Summary>("/api/sekolah/ringkasan"));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const activePlan = getPlanBySlug(plan);

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<Summary>("/api/sekolah/ringkasan");
    if (cached) setSummary(cached);
    setError("");
    fetch("/api/sekolah/ringkasan", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : "Ringkasan sekolah belum dapat dimuat.");
      const data: unknown = await response.json();
      if (typeof data !== "object" || data === null || !("siswa" in data) || typeof data.siswa !== "number" || !("guru" in data) || typeof data.guru !== "number" || !("kelas" in data) || typeof data.kelas !== "number" || !("ppdb" in data) || typeof data.ppdb !== "number" || !("ppdbDiterima" in data) || typeof data.ppdbDiterima !== "number" || !("ppdbDitolak" in data) || typeof data.ppdbDitolak !== "number") throw new Error("Respons ringkasan tidak valid.");
      const next: Summary = { siswa: data.siswa, guru: data.guru, kelas: data.kelas, ppdb: data.ppdb, ppdbDiterima: data.ppdbDiterima, ppdbDitolak: data.ppdbDitolak };
      setCached("/api/sekolah/ringkasan", next);
      setSummary(next);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) {
        console.error("Gagal memuat ringkasan:", failure);
        if (!cached) setError(failure instanceof Error ? failure.message : "Ringkasan sekolah belum dapat dimuat.");
      }
    });
    return () => controller.abort();
  }, [version]);
  const cards = [
    { id: "siswa" as const, label: "Siswa aktif", icon: Users },
    { id: "guru" as const, label: "Guru aktif", icon: GraduationCap },
    { id: "kelas" as const, label: "Kelas", icon: BookOpen },
    { id: "ppdb" as const, label: "PPDB menunggu", icon: ClipboardList },
  ];
  const totalPpdb = summary ? summary.ppdb + summary.ppdbDiterima + summary.ppdbDitolak : 0;
  const canUseRecap = hasPlanAccess(plan, "reguler");
  return <div className="space-y-5">
    <DashboardHero title={`Selamat Datang di Portal ${school}`} description="Kelola data lembaga dan kegiatan belajar dalam satu tempat." badge={`Dashboard Sekolah · ${activePlan.name}`} />
    {error ? <div role="alert" className="glass-panel rounded-xl p-5 text-sm">{error} <button type="button" onClick={() => setVersion((value) => value + 1)} className="ml-2 font-bold underline">Coba lagi</button></div> : !summary ? <p className="glass-panel rounded-xl p-5 text-sm">Memuat ringkasan...</p> : <div className="page-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map((card, index) => {
      const Icon = card.icon;
      const colors = ["from-blue-50 to-indigo-100", "from-violet-50 to-purple-100", "from-cyan-50 to-sky-100", "from-emerald-50 to-teal-100"];
      return <button key={card.id} type="button" onClick={() => onSelect(card.id)} className={`rounded-2xl border border-white bg-gradient-to-br ${colors[index]} p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}>
        <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-widest text-slate-500">{card.label}</span><span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><Icon size={18} /></span></div>
        <p className="mt-3 text-2xl font-extrabold text-slate-800">{summary[card.id]}</p><p className="mt-2 text-xs text-slate-500">Lihat data</p>
      </button>;
    })}</div>}
    {summary && <div className="grid gap-5 lg:grid-cols-3">
      <div className="dashboard-glass rounded-2xl p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Award size={18} className="text-indigo-600" /><h3 className="text-sm font-bold text-slate-800">Rekap Akademik, Nilai &amp; Presensi</h3></div>
          <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-indigo-900">Reguler+</span>
        </div>
        <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300/80 p-6 text-center">
          <p className="max-w-md text-sm text-slate-600">
            {canUseRecap
              ? "Pantau rata-rata nilai tugas, nilai akhir, dan rekap kehadiran seluruh kelas melalui menu Rekap Akademik & Nilai."
              : "Ringkasan nilai tugas, nilai akhir siswa, serta rekap kehadiran per kelas tersedia mulai Paket Reguler."}
          </p>
          <button
            type="button"
            onClick={() => (canUseRecap ? onOpenRecap() : onRequireUpgrade("Rekap Akademik & Nilai", "reguler"))}
            className="master-primary mt-4 px-4 py-2"
          >
            {canUseRecap ? "Buka Rekap Akademik & Nilai" : "Lihat Paket Reguler"}
          </button>
        </div>
      </div>
      <div className="dashboard-glass rounded-2xl p-5">
        <h3 className="text-sm font-bold text-slate-800">Alur Pendaftar PPDB</h3>
        <div className="mx-auto mt-5 flex h-32 w-32 items-center justify-center rounded-full" style={{ background: totalPpdb ? `conic-gradient(#f59e0b 0 ${summary.ppdb / totalPpdb * 100}%, #10b981 0 ${(summary.ppdb + summary.ppdbDiterima) / totalPpdb * 100}%, #f43f5e 0)` : "#e2e8f0" }}>
          <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white text-slate-900"><span className="text-2xl font-bold">{totalPpdb}</span><span className="text-xs text-slate-500">Pendaftar</span></div>
        </div>
        <div className="mt-5 space-y-2 text-xs text-slate-600"><p>Menunggu: <strong>{summary.ppdb}</strong></p><p>Diterima: <strong>{summary.ppdbDiterima}</strong></p><p>Ditolak: <strong>{summary.ppdbDitolak}</strong></p></div>
        <button type="button" onClick={() => onSelect("ppdb")} className="mt-4 text-xs font-bold text-indigo-700 underline">Lihat PPDB</button>
      </div>
    </div>}
  </div>;
}
