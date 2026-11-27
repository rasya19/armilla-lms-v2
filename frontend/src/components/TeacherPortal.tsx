import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Database,
  Eye,
  EyeOff,
  Globe,
  GraduationCap,
  Home,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Library,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  MonitorCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  RefreshCw,
  Save,
  Search,
  UploadCloud,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { PWAInstallButton } from "./PWAInstallButton";
import { Classroom } from "./Classroom";
import { CardGridSkeleton, DashboardHero, EmptyState, TableSkeleton } from "./DashboardUI";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { PLAN_BADGE_STYLES, SIDEBAR_THEMES } from "./SchoolAccess";
import { SchoolAttendance } from "./SchoolAttendance";
import { CbtBankSoalView, CbtImportView, CbtJadwalView, CbtMonitoringView, CbtPublicBanksView } from "./SchoolCbtModules";
import { AsistenAiView, RuangDiskusiView } from "./SchoolCollabAssetModules";
import { CekRaportView } from "./SchoolEquivalenceRaport";
import { SchoolModal } from "./SchoolModal";
import { TeacherPasswordReset } from "./TeacherPasswordReset";
import { useTenantTheme } from "./TenantThemeProvider";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { hasPlanAccess, type PlanSlug } from "./subscriptionPlans";
import { ModuleBankView } from "./ModuleBankView";
import { isSafeSubmissionPhotoSrc, SubmissionPhotoModal } from "./LmsLearning";
import { compressPasFoto4x6 } from "./StudentVervalForm";
import {
  buildStudentReminderMessage,
  buildStudentReminderWaUrl,
  formatLoginTimestamp,
  type StudentLoginStatus,
} from "../utils/studentLoginStatus";

export type TeacherView =
  | "beranda"
  | "materi-tugas"
  | "bank-modul"
  | "siswa"
  | "presensi"
  | "cbt"
  | "raport"
  | "diskusi"
  | "asisten-ai"
  | "profil";

type TeacherMenuItem = {
  id: TeacherView;
  label: string;
  icon: LucideIcon;
  requiredPlan?: Exclude<PlanSlug, "basic">;
};

type TeacherProfile = {
  id?: string;
  nama: string;
  email?: string | null;
  nuptk?: string | null;
  telepon?: string | null;
  mapelUtama?: string | null;
};

type TeacherBerandaPayload = {
  profil: TeacherProfile;
  sekolah: string;
  slug: string;
  plan: PlanSlug;
  isWaliKelas: boolean;
  waliKelasList: Array<{ id: string; nama: string }>;
  kelasDiampu: Array<{
    id: string;
    nama: string;
    isWali: boolean;
    jumlahSiswa: number;
    mapel: string[];
  }>;
  mapelDiampu: Array<{ id: string; nama: string }>;
  stats: {
    totalKelas: number;
    totalMapel: number;
    totalSiswa: number;
    totalMateri: number;
    totalTugas: number;
    tugasPerluDikoreksi: number;
    totalUjianCbt: number;
  };
  pengumumanTerbaru: Array<{
    id: string;
    judul: string;
    kategori: string;
    penulisNama: string;
    penulisPeran: string;
    disematkan: boolean;
    createdAt: string;
    kelas: { id: string; nama: string } | null;
    _count: { balasan: number };
  }>;
  tugasMenungguKoreksi: Array<{
    id: string;
    dikumpulkanPada: string;
    jawaban?: string | null;
    tautan?: string | null;
    attachmentPhotoUrl?: string | null;
    siswa: { id: string; nama: string; nisn: string };
    tugas: {
      id: string;
      judul: string;
      kelasId: string;
      kelas: { nama: string };
      mapel: { nama: string };
    };
  }>;
};

type TeacherStudentRow = {
  id: string;
  nama: string;
  nisn: string;
  telepon?: string;
  kelasId: string | null;
  kelasNama: string;
  status: string;
  punyaAkun: boolean;
  username: string;
  statusLogin?: StudentLoginStatus;
  lastLoginAt?: string | null;
};

type TeacherStudentsPayload = {
  kelas: Array<{ id: string; nama: string; isWali: boolean }>;
  siswa: TeacherStudentRow[];
};

const TEACHER_NAV_SECTIONS: Array<{ title: string; items: TeacherMenuItem[] }> = [
  {
    title: "Utama & Pembelajaran",
    items: [
      { id: "beranda", label: "Beranda Guru", icon: LayoutDashboard },
      { id: "materi-tugas", label: "Materi & Tugas Kelas", icon: BookOpen },
      { id: "bank-modul", label: "Bank Modul Belajar", icon: Library },
      { id: "siswa", label: "Data Siswa", icon: Users },
      { id: "presensi", label: "Presensi Siswa", icon: UserCheck },
      { id: "diskusi", label: "Ruang Diskusi", icon: MessageSquare },
    ],
  },
  {
    title: "Evaluasi & Asisten",
    items: [
      { id: "cbt", label: "Ujian Online (CBT)", icon: MonitorCheck, requiredPlan: "reguler" },
      { id: "raport", label: "Input Nilai & E-Raport", icon: ClipboardCheck, requiredPlan: "reguler" },
      { id: "asisten-ai", label: "Asisten Belajar AI", icon: Bot, requiredPlan: "pro" },
    ],
  },
];

const HASH_TO_TEACHER_VIEW: Record<string, TeacherView> = {
  "#beranda-lms": "beranda",
  "#beranda-guru": "beranda",
  "#pembelajaran-lms": "materi-tugas",
  "#ruang-kbm": "materi-tugas",
  "#materi-ajar": "materi-tugas",
  "#tugas-penilaian": "materi-tugas",
  "#materi-tugas": "materi-tugas",
  "#bank-modul": "bank-modul",
  "#data-siswa": "siswa",
  "#presensi-siswa": "presensi",
  "#cbt-guru": "cbt",
  "#raport-guru": "raport",
  "#diskusi-guru": "diskusi",
  "#asisten-ai-guru": "asisten-ai",
  "#profil-lms": "profil",
  "#akses-lms": "profil",
};

function sandboxHeaders(sandboxRole?: "GURU" | "SISWA", extra?: Record<string, string>): Record<string, string> | undefined {
  if (!sandboxRole && !extra) return undefined;
  return {
    ...(extra ?? {}),
    ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
  };
}

export function TeacherPortal({
  nama,
  school,
  plan = "basic",
  email,
  nuptk,
  telepon,
  mapelUtama,
  busy = false,
  error: outerError = "",
  sandboxRole,
  onLogout,
  onPasswordChanged,
  onBackToAdmin,
  onProfileUpdated,
  onFotoUpdated,
  fotoUrl,
}: {
  nama: string;
  school?: string;
  plan?: PlanSlug;
  email?: string | null;
  nuptk?: string | null;
  telepon?: string | null;
  mapelUtama?: string | null;
  fotoUrl?: string | null;
  busy?: boolean;
  error?: string;
  sandboxRole?: "GURU";
  onLogout?: () => void;
  onPasswordChanged?: () => void;
  onBackToAdmin?: () => void;
  onProfileUpdated?: (nextNama: string) => void;
  onFotoUpdated?: (nextFoto: string | null) => void;
}) {
  const theme = useTenantTheme();
  const isDark = theme === "dark";
  const palette = SIDEBAR_THEMES[theme] ?? SIDEBAR_THEMES.ocean;

  const [view, setView] = useState<TeacherView>(() => HASH_TO_TEACHER_VIEW[window.location.hash] ?? "beranda");
  const [menuOpen, setMenuOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [autoHideSidebar, setAutoHideSidebar] = useState(false);
  const [cbtTab, setCbtTab] = useState<"bank" | "publik" | "impor" | "jadwal" | "monitoring">("bank");
  const [classroomTarget, setClassroomTarget] = useState<{ kelasId?: string | null; tab?: "materi" | "tugas"; seq: number }>({ seq: 0 });
  const [upgradePrompt, setUpgradePrompt] = useState<{ featureName: string; requiredPlan: Exclude<PlanSlug, "basic"> } | null>(null);

  const [beranda, setBeranda] = useState<TeacherBerandaPayload | null>(null);
  const [berandaLoading, setBerandaLoading] = useState(true);
  const [berandaError, setBerandaError] = useState("");
  const [teacherFotoUrl, setTeacherFotoUrl] = useState<string | null>(fotoUrl ?? null);

  useEffect(() => {
    if (fotoUrl !== undefined) setTeacherFotoUrl(fotoUrl ?? null);
  }, [fotoUrl]);

  const effectivePlan: PlanSlug = beranda?.plan ?? plan;
  const effectiveSchool = beranda?.sekolah || school || "Lembaga PKBM";
  const effectiveName = beranda?.profil.nama || nama;
  const planStyle = PLAN_BADGE_STYLES[effectivePlan] ?? PLAN_BADGE_STYLES.basic;
  const headerBadgeClass = isDark ? planStyle.sidebarClass : planStyle.headerClass;

  const loadBeranda = useCallback(
    async (signal?: AbortSignal) => {
      setBerandaLoading(true);
      try {
        const headers = sandboxHeaders(sandboxRole);
        const res = await fetchWithTimeout("/api/lms/guru/beranda", {
          signal,
          ...(headers ? { headers } : {}),
        });
        const body = (await res.json()) as TeacherBerandaPayload & { error?: string };
        if (!res.ok) throw new Error(body.error || "Ringkasan beranda guru belum dapat dimuat.");
        setBeranda(body);
        setBerandaError("");
      } catch (failure) {
        if (!isCallerAborted(failure, signal)) {
          setBerandaError(describeFetchError(failure, "Data beranda guru belum dapat dimuat."));
        }
      } finally {
        if (!signal?.aborted) setBerandaLoading(false);
      }
    },
    [sandboxRole],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadBeranda(controller.signal);
    return () => controller.abort();
  }, [loadBeranda]);

  useEffect(() => {
    const onHash = () => {
      const mapped = HASH_TO_TEACHER_VIEW[window.location.hash];
      if (mapped) setView(mapped);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function toggleSidebar() {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMenuOpen((prev) => !prev);
    } else {
      setDesktopSidebarOpen((prev) => !prev);
    }
  }

  function selectView(next: TeacherView, requiredPlan?: Exclude<PlanSlug, "basic">, label?: string) {
    if (requiredPlan && !hasPlanAccess(effectivePlan, requiredPlan)) {
      setUpgradePrompt({ featureName: label ?? next, requiredPlan });
      setMenuOpen(false);
      return;
    }
    setView(next);
    setMenuOpen(false);
    if (autoHideSidebar) setDesktopSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openClassroom(kelasId?: string | null, tab?: "materi" | "tugas") {
    setClassroomTarget((prev) => ({ kelasId: kelasId ?? null, tab, seq: prev.seq + 1 }));
    setView("materi-tugas");
    setMenuOpen(false);
    if (autoHideSidebar) setDesktopSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const initials = useMemo(() => {
    const parts = effectiveName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return effectiveName.slice(0, 2).toUpperCase() || "GR";
  }, [effectiveName]);

  return (
    <main className="dashboard-canvas glass-area min-h-screen text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        {/* Sidebar Navigasi Guru */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-300 ease-in-out ${
            menuOpen
              ? "visible w-72 translate-x-0 p-3.5 opacity-100"
              : "pointer-events-none invisible w-72 -translate-x-full p-3.5 opacity-0"
          } ${
            desktopSidebarOpen
              ? "lg:pointer-events-auto lg:visible lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:translate-x-0 lg:p-3.5 lg:opacity-100"
              : "lg:pointer-events-none lg:invisible lg:sticky lg:top-0 lg:h-screen lg:w-0 lg:shrink-0 lg:-translate-x-full lg:overflow-hidden lg:border-r-0 lg:p-0 lg:opacity-0"
          } ${palette.aside}`}
        >
          <div className={`flex items-center justify-between gap-2 border-b pb-3.5 ${palette.headerDivider}`}>
            <div className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border p-2.5 ${palette.identityCard}`}>
              <BrandLogo alt={`Logo ${effectiveSchool}`} className="h-9 w-9 rounded-xl border border-white/20" />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-extrabold ${palette.schoolName}`}>{effectiveSchool}</p>
                <p className={`truncate text-[10px] font-semibold ${palette.roleText}`}>
                  {beranda?.isWaliKelas ? "Portal Guru · Wali Kelas" : "Portal Guru"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setAutoHideSidebar((prev) => !prev)}
                aria-pressed={autoHideSidebar}
                title={autoHideSidebar ? "Auto-hide aktif: sidebar menutup otomatis setelah menu dipilih" : "Aktifkan auto-hide sidebar"}
                aria-label={autoHideSidebar ? "Nonaktifkan auto-hide sidebar" : "Aktifkan auto-hide sidebar"}
                className={`hidden rounded-lg p-1.5 transition lg:inline-flex ${
                  autoHideSidebar ? "bg-white/25 text-white ring-1 ring-white/40" : palette.closeBtn
                }`}
              >
                {autoHideSidebar ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => setDesktopSidebarOpen(false)}
                title="Sembunyikan sidebar"
                aria-label="Sembunyikan sidebar"
                className={`hidden rounded-lg p-1.5 transition lg:inline-flex ${palette.closeBtn}`}
              >
                <PanelLeftClose size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Tutup menu guru"
                className={`rounded-lg p-1.5 lg:hidden ${palette.closeBtn}`}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <nav aria-label="Navigasi Portal Guru" className="mt-3 flex-1 space-y-4 overflow-y-auto pr-0.5">
            {TEACHER_NAV_SECTIONS.map((section) => (
              <div key={section.title} className="space-y-1">
                <p className={`px-3 text-[10px] font-extrabold uppercase tracking-wider ${palette.sectionLabel}`}>
                  {section.title}
                </p>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  const locked = item.requiredPlan ? !hasPlanAccess(effectivePlan, item.requiredPlan) : false;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => selectView(item.id, item.requiredPlan, item.label)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors duration-200 ${
                        active ? palette.itemActive : locked ? palette.itemLocked : palette.itemInactive
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                            active ? palette.itemActiveIcon : palette.itemIcon
                          }`}
                        >
                          <Icon size={14} aria-hidden="true" />
                        </span>
                        <span className="truncate">{item.label}</span>
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
                })}
              </div>
            ))}
          </nav>

          <div className={`mt-3 space-y-2.5 border-t pt-3 ${palette.footerDivider}`}>
            <div className={`rounded-2xl border p-3 ${palette.tierCard}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${palette.tierLabel}`}>Paket Sekolah</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${planStyle.sidebarClass}`}>
                  {planStyle.label}
                </span>
                <button
                  type="button"
                  onClick={() => void loadBeranda()}
                  aria-label="Muat ulang data guru"
                  className={`rounded-lg p-1.5 transition ${palette.refreshBtn}`}
                >
                  <RefreshCw size={13} className={berandaLoading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            <PWAInstallButton
              compact
              className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${palette.tierCard}`}
            />

            {onBackToAdmin ? (
              <button
                type="button"
                onClick={onBackToAdmin}
                className={`flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition ${palette.logoutBtn}`}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Kembali ke Admin
              </button>
            ) : (
              onLogout && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onLogout}
                  className={`flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${palette.logoutBtn}`}
                >
                  <LogOut size={14} aria-hidden="true" />
                  Keluar Portal Guru
                </button>
              )
            )}
          </div>
        </aside>

        {menuOpen && (
          <button
            type="button"
            aria-label="Tutup menu guru"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[1px] lg:hidden"
          />
        )}

        {/* Konten Utama */}
        <div className="min-w-0 flex-1 transition-all duration-300">
          <header className="dashboard-header sticky top-0 z-30 mx-4 mt-4 flex items-center gap-3 rounded-2xl border px-4 py-3 sm:mx-6 sm:mt-6 sm:px-6">
            <button
              type="button"
              onClick={toggleSidebar}
              title={desktopSidebarOpen ? "Sembunyikan sidebar" : "Tampilkan sidebar"}
              aria-label="Buka atau tutup menu guru"
              aria-expanded={menuOpen || desktopSidebarOpen}
              className={`inline-flex shrink-0 items-center justify-center rounded-xl p-2 transition ${palette.headerMenuBtn}`}
            >
              <Menu size={20} className="lg:hidden" aria-hidden="true" />
              {desktopSidebarOpen ? (
                <PanelLeftClose size={20} className="hidden lg:block" aria-hidden="true" />
              ) : (
                <PanelLeftOpen size={20} className="hidden lg:block" aria-hidden="true" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className={`inline-block max-w-full truncate rounded-lg text-sm font-extrabold ${isDark ? "px-0 py-0.5 text-white sm:text-base" : `px-3 py-1 ${palette.headerSchoolPill}`}`}>
                  {effectiveSchool}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                    isDark
                      ? "border-amber-400/35 bg-amber-500/15 text-amber-200"
                      : "border-indigo-200 bg-indigo-50 text-indigo-800"
                  }`}
                >
                  Mode Guru{sandboxRole ? " · Sandbox" : ""}
                </span>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${headerBadgeClass}`}>
                  {planStyle.label}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => selectView("profil")}
              aria-current={view === "profil" ? "page" : undefined}
              title="Buka Profil & Akun Guru"
              className={`flex shrink-0 items-center gap-2.5 rounded-full border py-1 pl-3 pr-1 text-left transition ${
                view === "profil"
                  ? isDark
                    ? "border-amber-400/60 bg-amber-500/15 ring-2 ring-amber-400/30"
                    : "border-indigo-300 bg-indigo-50/90 ring-2 ring-indigo-200"
                  : isDark
                    ? "border-slate-700/70 bg-slate-800/70 hover:border-amber-400/40"
                    : "border-slate-200/80 bg-white/80 hover:border-indigo-200 hover:bg-indigo-50/50"
              }`}
            >
              <div className="hidden min-w-0 text-right sm:block">
                <p className={`max-w-[160px] truncate text-xs font-bold leading-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  {effectiveName}
                </p>
                <p className={`inline-flex items-center justify-end gap-1 text-[10px] font-semibold ${isDark ? "text-amber-300" : "text-indigo-700"}`}>
                  <UserRound size={10} aria-hidden="true" />
                  Profil Guru
                </p>
              </div>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-black text-white shadow-md ${palette.headerAvatar}`}>
                {teacherFotoUrl ? (
                  <img src={teacherFotoUrl} alt={effectiveName} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </span>
            </button>
          </header>

          {outerError && (
            <p role="alert" className="glass-panel mx-4 mt-4 rounded-xl p-4 text-sm text-rose-700 sm:mx-6">
              {outerError}
            </p>
          )}

          <div className={`animate-page-enter mx-auto ${desktopSidebarOpen ? "max-w-7xl" : "max-w-full"} space-y-6 p-4 pb-28 transition-all duration-300 sm:p-6 md:pb-10`}>
            {view === "beranda" && (
              <TeacherBerandaSection
                data={beranda}
                loading={berandaLoading}
                error={berandaError}
                plan={effectivePlan}
                isDark={isDark}
                onReload={() => void loadBeranda()}
                onOpenClass={(kelasId) => openClassroom(kelasId, "materi")}
                onOpenGrading={(kelasId) => openClassroom(kelasId, "tugas")}
                onNavigate={selectView}
              />
            )}

            {view === "materi-tugas" && (
              <Classroom
                key={`teacher-kbm-${classroomTarget.seq}`}
                role="GURU"
                sandboxRole={sandboxRole}
                initialKelasId={classroomTarget.kelasId}
                initialTab={classroomTarget.tab}
              />
            )}

            {view === "bank-modul" && <ModuleBankView sandboxRole={sandboxRole} />}

            {view === "siswa" && <TeacherStudentsSection sandboxRole={sandboxRole} />}

            {view === "presensi" && <SchoolAttendance role="GURU" sandboxRole={sandboxRole} />}

            {view === "cbt" && hasPlanAccess(effectivePlan, "reguler") && (
              <div className="space-y-4">
                <div className="dashboard-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: "bank" as const, label: "Bank Soal Sekolah", icon: Database },
                      { id: "publik" as const, label: "Bank Soal Umum", icon: Globe },
                      { id: "impor" as const, label: "Impor Soal & Tugas", icon: UploadCloud },
                      { id: "jadwal" as const, label: "Jadwal & Token", icon: CalendarDays },
                      { id: "monitoring" as const, label: "Monitoring & Hasil CBT", icon: MonitorCheck },
                    ]).map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={cbtTab === id}
                        onClick={() => setCbtTab(id)}
                        className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition ${
                          cbtTab === id
                            ? isDark
                              ? "bg-amber-400 text-slate-950"
                              : "bg-sky-700 text-white shadow-xs"
                            : isDark
                              ? "bg-slate-800/80 text-slate-200 hover:bg-slate-700"
                              : "bg-white/80 text-slate-700 hover:bg-white"
                        }`}
                      >
                        <Icon size={14} aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className={`px-2 text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                    Mapel &amp; Kelas Diampu
                  </span>
                </div>

                {cbtTab === "bank" && <CbtBankSoalView sandboxRole={sandboxRole} />}
                {cbtTab === "publik" && (
                  <CbtPublicBanksView
                    sandboxRole={sandboxRole}
                    onCloned={() => setCbtTab("bank")}
                  />
                )}
                {cbtTab === "impor" && <CbtImportView sandboxRole={sandboxRole} />}
                {cbtTab === "jadwal" && <CbtJadwalView sandboxRole={sandboxRole} />}
                {cbtTab === "monitoring" && <CbtMonitoringView sandboxRole={sandboxRole} />}
              </div>
            )}

            {view === "raport" && hasPlanAccess(effectivePlan, "reguler") && (
              <CekRaportView sandboxRole={sandboxRole} />
            )}

            {view === "diskusi" && <RuangDiskusiView sandboxRole={sandboxRole} />}

            {view === "asisten-ai" && hasPlanAccess(effectivePlan, "pro") && (
              <AsistenAiView sandboxRole={sandboxRole} />
            )}

            {view === "profil" && (
              <TeacherProfileSection
                profil={{
                  nama: beranda?.profil.nama ?? nama,
                  email: beranda?.profil.email ?? email ?? null,
                  nuptk: beranda?.profil.nuptk ?? nuptk ?? null,
                  telepon: beranda?.profil.telepon ?? telepon ?? null,
                  mapelUtama: beranda?.profil.mapelUtama ?? mapelUtama ?? null,
                }}
                school={effectiveSchool}
                fotoUrl={teacherFotoUrl}
                isWaliKelas={Boolean(beranda?.isWaliKelas)}
                sandboxRole={sandboxRole}
                onPasswordChanged={onPasswordChanged}
                onFotoChanged={(nextUrl) => {
                  setTeacherFotoUrl(nextUrl);
                  onFotoUpdated?.(nextUrl);
                }}
                onSaved={(updatedNama) => {
                  onProfileUpdated?.(updatedNama);
                  void loadBeranda();
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Navigasi Bawah Mobile */}
      <nav
        aria-label="Navigasi bawah guru"
        className={
          isDark
            ? "fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-center justify-around gap-1 rounded-full border border-slate-700/60 bg-slate-900/90 px-2 py-1.5 shadow-[0_14px_40px_rgba(2,6,23,0.75)] backdrop-blur-2xl lg:hidden"
            : "fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-white/85 bg-white/92 px-1 pt-2 shadow-[0_-8px_30px_rgba(15,76,129,0.08)] backdrop-blur-xl lg:hidden"
        }
        style={isDark ? undefined : { paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {([
          { label: "Beranda", icon: Home, active: !menuOpen && view === "beranda", onClick: () => selectView("beranda") },
          { label: "Kelas", icon: BookOpen, active: !menuOpen && view === "materi-tugas", onClick: () => selectView("materi-tugas") },
          { label: "Presensi", icon: UserCheck, active: !menuOpen && view === "presensi", onClick: () => selectView("presensi") },
          { label: "CBT", icon: MonitorCheck, active: !menuOpen && view === "cbt", onClick: () => selectView("cbt", "reguler", "Ujian Online (CBT)") },
          { label: "Menu", icon: LayoutGrid, active: menuOpen || (view !== "beranda" && view !== "materi-tugas" && view !== "presensi" && view !== "cbt"), onClick: () => setMenuOpen(true) },
        ] as const).map(({ label, icon: Icon, active, onClick }) =>
          isDark ? (
            <button
              key={label}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={onClick}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 text-[10px] transition ${
                active
                  ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)]"
                  : "font-medium text-slate-400 hover:text-white"
              }`}
            >
              <Icon size={17} aria-hidden="true" />
              <span className="truncate">{label}</span>
            </button>
          ) : (
            <button
              key={label}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={onClick}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[10px] ${
                active ? `font-semibold ${palette.mobileAccentText}` : "font-medium text-slate-600"
              }`}
            >
              <span className={`rounded-xl p-1.5 ${active ? palette.mobileAccentBg : ""}`}>
                <Icon size={19} aria-hidden="true" />
              </span>
              {label}
            </button>
          ),
        )}
      </nav>

      {/* Dialog Paket Terkunci */}
      {upgradePrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="teacher-upgrade-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="glass-dialog w-full max-w-md space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Lock size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">
                  Fitur Paket {upgradePrompt.requiredPlan.toUpperCase()}
                </p>
                <h2 id="teacher-upgrade-title" className="text-base font-bold text-slate-900">
                  {upgradePrompt.featureName}
                </h2>
              </div>
            </div>
            <p className="text-sm leading-6 text-slate-700">
              Fitur <strong>{upgradePrompt.featureName}</strong> aktif mulai{" "}
              <strong>Paket {upgradePrompt.requiredPlan.toUpperCase()}</strong>. Saat ini sekolah Anda berada pada{" "}
              <strong>{planStyle.label}</strong>. Silakan hubungi Admin Sekolah untuk mengaktifkan paket ini.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setUpgradePrompt(null)}
                className="master-primary whitespace-nowrap px-4 py-2 text-xs"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ==========================================
// 1. BERANDA GURU
// ==========================================
function TeacherBerandaSection({
  data,
  loading,
  error,
  plan,
  isDark,
  onReload,
  onOpenClass,
  onOpenGrading,
  onNavigate,
}: {
  data: TeacherBerandaPayload | null;
  loading: boolean;
  error: string;
  plan: PlanSlug;
  isDark: boolean;
  onReload: () => void;
  onOpenClass: (kelasId: string) => void;
  onOpenGrading: (kelasId: string) => void;
  onNavigate: (view: TeacherView, requiredPlan?: Exclude<PlanSlug, "basic">, label?: string) => void;
}) {
  const canUseReguler = hasPlanAccess(plan, "reguler");
  const canUsePro = hasPlanAccess(plan, "pro");
  const [queuePhotoPreview, setQueuePhotoPreview] = useState<{ src: string; studentName: string; taskTitle: string } | null>(null);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <CardGridSkeleton count={4} columns={4} />
        <CardGridSkeleton count={3} columns={3} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <section className="dashboard-glass rounded-2xl p-6">
        <p role="alert" className="text-sm font-medium text-rose-700">
          {error}
        </p>
        <button type="button" onClick={onReload} className="master-primary mt-4 px-4 py-2 text-xs">
          Muat Ulang Beranda
        </button>
      </section>
    );
  }

  const stats = data?.stats;
  const kpis = [
    {
      label: "KELAS DIAMPU",
      value: stats?.totalKelas ?? 0,
      sub: data?.isWaliKelas ? `Wali ${data.waliKelasList.map((w) => w.nama).join(", ")}` : "Rombel penugasan aktif",
      icon: GraduationCap,
      tint: isDark ? "border-sky-400/25 bg-sky-500/15 text-sky-300" : "bg-sky-100 text-sky-700",
    },
    {
      label: "MATA PELAJARAN",
      value: stats?.totalMapel ?? 0,
      sub: data?.profil.mapelUtama ? `Utama: ${data.profil.mapelUtama}` : "Mapel diampu",
      icon: BookOpen,
      tint: isDark ? "border-violet-400/25 bg-violet-500/15 text-violet-300" : "bg-violet-100 text-violet-700",
    },
    {
      label: "WARGA BELAJAR",
      value: stats?.totalSiswa ?? 0,
      sub: `${stats?.totalMateri ?? 0} materi · ${stats?.totalTugas ?? 0} tugas`,
      icon: Users,
      tint: isDark ? "border-emerald-400/25 bg-emerald-500/15 text-emerald-300" : "bg-emerald-100 text-emerald-700",
    },
    {
      label: "PERLU DIKOREKSI",
      value: stats?.tugasPerluDikoreksi ?? 0,
      sub: canUseReguler ? `${stats?.totalUjianCbt ?? 0} paket ujian CBT` : "Jawaban tugas belum dinilai",
      icon: ClipboardCheck,
      tint: isDark ? "border-amber-400/25 bg-amber-500/15 text-amber-300" : "bg-amber-100 text-amber-700",
    },
  ];

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow={data?.isWaliKelas ? "PORTAL GURU & WALI KELAS" : "PORTAL GURU / TUTOR"}
        title={`Selamat datang, ${data?.profil.nama ?? "Guru"}`}
        description="Kelola materi ajar, tugas kelas, presensi warga belajar, ujian CBT, penilaian raport, dan diskusi kelas dalam satu ruang kerja terpadu."
        badge={`${stats?.totalKelas ?? 0} Kelas · ${stats?.totalSiswa ?? 0} Siswa`}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate("materi-tugas")}
              className="dashboard-hero-action whitespace-nowrap"
            >
              <BookOpen size={15} aria-hidden="true" />
              Materi &amp; Tugas Kelas
            </button>
            <button
              type="button"
              onClick={() => onNavigate("presensi")}
              className="dashboard-hero-action dashboard-hero-secondary whitespace-nowrap"
            >
              <UserCheck size={15} aria-hidden="true" />
              Presensi Hari Ini
            </button>
          </div>
        }
      />

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="dashboard-glass flex items-start justify-between gap-3 rounded-2xl p-5">
              <div className="min-w-0">
                <p className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {item.label}
                </p>
                <p className={`mt-2 text-3xl font-black tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>
                  {item.value}
                </p>
                <p className={`mt-1 truncate text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>{item.sub}</p>
              </div>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-transparent ${item.tint}`}>
                <Icon size={20} aria-hidden="true" />
              </span>
            </div>
          );
        })}
      </div>

      {/* Daftar Kelas yang Diampu */}
      <section className="dashboard-glass space-y-4 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              Kelas &amp; Mata Pelajaran Diampu
            </h2>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              {data?.isWaliKelas
                ? "Sebagai wali kelas, Anda memiliki akses pantauan ke seluruh kelas lembaga serta mapel penugasan."
                : "Menampilkan kelas dan mata pelajaran yang ditugaskan kepada Anda."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("materi-tugas")}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
              isDark
                ? "border-slate-700 bg-slate-800/80 text-slate-200 hover:border-amber-400/40 hover:text-amber-200"
                : "border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-50"
            }`}
          >
            Lihat Semua Kelas
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>

        {!data?.kelasDiampu.length ? (
          <EmptyState
            title="Belum ada kelas yang ditugaskan"
            description="Hubungi admin sekolah untuk mengatur penugasan jadwal mengajar atau penetapan wali kelas Anda."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.kelasDiampu.map((kelas) => (
              <article
                key={kelas.id}
                className={`dashboard-glass flex flex-col justify-between gap-4 rounded-2xl p-5 transition ${
                  isDark ? "hover:border-amber-400/35 hover:bg-slate-800/60" : "hover:bg-white/95 hover:shadow-md"
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isDark ? "bg-amber-500/15 text-amber-300" : "bg-indigo-100 text-indigo-700"
                        }`}
                      >
                        <GraduationCap size={19} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h3 className={`truncate text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                          {kelas.nama}
                        </h3>
                        <p className={`text-xs tabular-nums ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                          {kelas.jumlahSiswa} siswa aktif
                        </p>
                      </div>
                    </div>
                    {kelas.isWali && (
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                          isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        Wali Kelas
                      </span>
                    )}
                  </div>
                  <p className={`line-clamp-2 text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                    Mapel: {kelas.mapel.length ? kelas.mapel.join(", ") : "Pantauan Wali Kelas"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenClass(kelas.id)}
                  className="master-primary w-full whitespace-nowrap py-2 text-xs"
                >
                  Masuk Ruang Kelas
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Antrean Koreksi & Pengumuman Terbaru */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="dashboard-glass flex flex-col justify-between gap-4 rounded-2xl p-6 lg:col-span-7">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                  Tugas Menunggu Dikoreksi
                </h2>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Pengumpulan tugas terbaru dari warga belajar yang belum memiliki nilai
                </p>
              </div>
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-extrabold tabular-nums ${
                  isDark ? "bg-amber-500/15 text-amber-300" : "bg-amber-100 text-amber-900"
                }`}
              >
                {stats?.tugasPerluDikoreksi ?? 0} Antrean
              </span>
            </div>

            {!data?.tugasMenungguKoreksi.length ? (
              <div className={`mt-5 rounded-xl border border-dashed p-6 text-center text-xs ${isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-600"}`}>
                Semua jawaban tugas yang masuk sudah dinilai. Bagus sekali!
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-slate-200/70">
                {data.tugasMenungguKoreksi.map((item) => {
                  const safePhoto = isSafeSubmissionPhotoSrc(item.attachmentPhotoUrl) ? item.attachmentPhotoUrl : null;
                  return (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className={`truncate font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                          {item.siswa.nama} · <span className={`font-semibold ${isDark ? "text-amber-300" : "text-indigo-700"}`}>{item.tugas.judul}</span>
                        </p>
                        <p className={`mt-0.5 text-[11px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          {item.tugas.kelas.nama} · {item.tugas.mapel.nama} · Dikumpulkan{" "}
                          {new Date(item.dikumpulkanPada).toLocaleDateString("id-ID")}
                        </p>
                        {(item.jawaban || item.tautan || safePhoto) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {item.jawaban && (
                              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"}`}>
                                Jawaban Teks
                              </span>
                            )}
                            {item.tautan && (
                              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-sky-500/20 text-sky-200" : "bg-sky-50 text-sky-700"}`}>
                                Tautan HTTPS
                              </span>
                            )}
                            {safePhoto && (
                              <button
                                type="button"
                                onClick={() =>
                                  setQueuePhotoPreview({
                                    src: safePhoto,
                                    studentName: item.siswa.nama,
                                    taskTitle: item.tugas.judul,
                                  })
                                }
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold transition ${
                                  isDark
                                    ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                                    : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                                }`}
                              >
                                <ImageIcon size={11} aria-hidden="true" />
                                Lihat Foto Tugas
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenGrading(item.tugas.kelasId)}
                        className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                          isDark
                            ? "border-amber-400/35 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                            : "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                        }`}
                      >
                        Nilai Sekarang
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {queuePhotoPreview && (
            <SubmissionPhotoModal
              src={queuePhotoPreview.src}
              studentName={queuePhotoPreview.studentName}
              taskTitle={queuePhotoPreview.taskTitle}
              onClose={() => setQueuePhotoPreview(null)}
            />
          )}
        </section>

        <section className="dashboard-glass flex flex-col justify-between gap-4 rounded-2xl p-6 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                  Pengumuman &amp; Diskusi Terbaru
                </h2>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Informasi terbaru sekolah dan utas tanya-jawab kelas
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("diskusi")}
                className={`whitespace-nowrap text-xs font-bold underline ${isDark ? "text-amber-300" : "text-indigo-700"}`}
              >
                Buka Forum
              </button>
            </div>

            {!data?.pengumumanTerbaru.length ? (
              <div className={`mt-5 rounded-xl border border-dashed p-6 text-center text-xs ${isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-600"}`}>
                Belum ada pengumuman atau topik diskusi terbaru.
              </div>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {data.pengumumanTerbaru.map((topic) => (
                  <li
                    key={topic.id}
                    className={`rounded-xl border p-3.5 text-xs ${
                      isDark ? "border-slate-700/60 bg-slate-900/65" : "border-white bg-white/85"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-extrabold uppercase tracking-wider text-[10px] ${isDark ? "text-cyan-300" : "text-sky-700"}`}>
                        {topic.kategori}{topic.kelas ? ` · ${topic.kelas.nama}` : ""}
                      </span>
                      <span className={`text-[10px] tabular-nums ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        {topic._count.balasan} balasan
                      </span>
                    </div>
                    <p className={`mt-1 line-clamp-2 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                      {topic.judul}
                    </p>
                    <p className={`mt-1 text-[11px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      Oleh {topic.penulisNama} · {new Date(topic.createdAt).toLocaleDateString("id-ID")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => onNavigate("cbt", "reguler", "Ujian Online (CBT)")}
              className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition ${
                isDark
                  ? "border-slate-700 bg-slate-800/80 text-slate-200 hover:border-amber-400/40"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {!canUseReguler && <Lock size={12} aria-hidden="true" />}
              <MonitorCheck size={14} aria-hidden="true" />
              Ujian CBT
            </button>
            <button
              type="button"
              onClick={() => onNavigate("asisten-ai", "pro", "Asisten Belajar AI")}
              className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition ${
                isDark
                  ? "border-slate-700 bg-slate-800/80 text-slate-200 hover:border-amber-400/40"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {!canUsePro && <Lock size={12} aria-hidden="true" />}
              <Bot size={14} aria-hidden="true" />
              Asisten AI
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ==========================================
// 2. DATA SISWA DIKELOLA GURU (BUAT AKUN & RESET PASSWORD)
// ==========================================
function TeacherStudentsSection({ sandboxRole }: { sandboxRole?: "GURU" }) {
  const isDark = useTenantTheme() === "dark";
  const [kelasFilter, setKelasFilter] = useState("");
  const [loginFilter, setLoginFilter] = useState<"semua" | "aktif" | "pernah" | "belum">("semua");
  const [reminderNotice, setReminderNotice] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [data, setData] = useState<TeacherStudentsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalTarget, setModalTarget] = useState<{ student: TeacherStudentRow; reset: boolean } | null>(null);
  const [passwordInput, setPasswordInput] = useState("123456");
  const [showPassword, setShowPassword] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [credential, setCredential] = useState<{
    nama: string;
    username: string;
    password: string;
    reset: boolean;
  } | null>(null);
  const [copiedCredential, setCopiedCredential] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadStudents = useCallback(
    async (nextKelasId: string, nextQ: string, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (nextKelasId) params.set("kelasId", nextKelasId);
        if (nextQ) params.set("q", nextQ);
        const headers = sandboxHeaders(sandboxRole);
        const res = await fetchWithTimeout(`/api/lms/guru/siswa?${params.toString()}`, {
          signal,
          ...(headers ? { headers } : {}),
        });
        const body = (await res.json()) as TeacherStudentsPayload & { error?: string };
        if (!res.ok) throw new Error(body.error || "Data siswa belum dapat dimuat.");
        setData(body);
        setError("");
      } catch (failure) {
        if (!isCallerAborted(failure, signal)) {
          setError(describeFetchError(failure, "Data siswa belum dapat dimuat."));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [sandboxRole],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadStudents(kelasFilter, searchTerm, controller.signal);
    return () => controller.abort();
  }, [kelasFilter, searchTerm, loadStudents]);

  function openAccountModal(student: TeacherStudentRow, reset: boolean) {
    setModalError("");
    setPasswordInput("123456");
    setShowPassword(false);
    setModalTarget({ student, reset });
  }

  async function submitAccountAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalTarget) return;
    const { student, reset } = modalTarget;
    const passwordToSend = passwordInput.trim() || "123456";
    if (passwordToSend.length < 6) {
      setModalError("Kata sandi minimal 6 karakter.");
      return;
    }
    setModalBusy(true);
    setModalError("");
    try {
      const endpoint = `/api/lms/guru/siswa/${encodeURIComponent(student.id)}/${reset ? "reset-password" : "akun"}`;
      const res = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({ password: passwordToSend }),
      });
      const body = (await res.json()) as {
        temporaryPassword?: string;
        username?: string;
        nama?: string;
        error?: string;
      };
      if (!res.ok || !body.temporaryPassword) {
        throw new Error(body.error || (reset ? "Password siswa belum dapat direset." : "Akun siswa belum dapat dibuat."));
      }
      setCredential({
        nama: body.nama || student.nama,
        username: body.username || student.username || student.nisn,
        password: body.temporaryPassword,
        reset,
      });
      setCopiedCredential(false);
      setModalTarget(null);
      await loadStudents(kelasFilter, searchTerm);
    } catch (failure) {
      setModalError(describeFetchError(failure, "Permintaan akun siswa gagal diproses."));
    } finally {
      setModalBusy(false);
    }
  }

  return (
    <section className="dashboard-glass space-y-5 rounded-2xl p-5 sm:p-6">
      <DashboardHero
        eyebrow="WARGA BELAJAR DIAMPU"
        title="Data Siswa"
        description="Lihat daftar warga belajar dari kelas yang Anda ampu, buatkan akun login baru, atau bantu reset kata sandi siswa secara langsung."
        badge={data ? `${data.siswa.length} siswa aktif` : undefined}
        action={
          <button
            type="button"
            onClick={() => void loadStudents(kelasFilter, searchTerm)}
            className="dashboard-hero-action dashboard-hero-secondary whitespace-nowrap"
          >
            <RefreshCw size={15} aria-hidden="true" />
            Segarkan
          </button>
        }
      />

      {/* Filter Kelas, Status Login & Pencarian */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
        <label className="relative block">
          <span className="sr-only">Cari nama atau NISN siswa</span>
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            maxLength={100}
            placeholder="Cari nama atau NISN warga belajar..."
            className="glass-input w-full rounded-xl py-2.5 pl-10 pr-4 text-sm"
          />
        </label>
        <select
          aria-label="Filter kelas yang diampu"
          value={kelasFilter}
          onChange={(e) => setKelasFilter(e.target.value)}
          className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm font-semibold"
        >
          <option value="">Semua Kelas Diampu ({data?.kelas.length ?? 0})</option>
          {data?.kelas.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nama}
              {k.isWali ? " (Wali Kelas)" : ""}
            </option>
          ))}
        </select>
      </div>

      {data && data.siswa.length > 0 && (() => {
        const aktifCount = data.siswa.filter((s) => s.statusLogin === "AKTIF").length;
        const pernahCount = data.siswa.filter((s) => s.statusLogin === "PERNAH").length;
        const belumCount = data.siswa.filter((s) => (s.statusLogin ?? "BELUM") === "BELUM").length;
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-bold ${isDark ? "text-slate-400" : "text-slate-600"}`}>Monitoring Login:</span>
            {([
              ["semua", "Semua", data.siswa.length, "slate"],
              ["aktif", "Sedang Login", aktifCount, "emerald"],
              ["pernah", "Pernah Login", pernahCount, "sky"],
              ["belum", "Belum Pernah Login", belumCount, "amber"],
            ] as const).map(([value, label, count, tone]) => (
              <button
                key={value}
                type="button"
                aria-pressed={loginFilter === value}
                onClick={() => setLoginFilter(value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  loginFilter === value
                    ? tone === "emerald"
                      ? "border-emerald-500 bg-emerald-600 text-white"
                      : tone === "amber"
                        ? "border-amber-500 bg-amber-500 text-slate-950"
                        : tone === "sky"
                          ? "border-sky-500 bg-sky-600 text-white"
                          : isDark
                            ? "border-amber-400 bg-amber-400 text-slate-950"
                            : "border-indigo-600 bg-indigo-600 text-white"
                    : isDark
                      ? "border-slate-700/70 bg-slate-900/70 text-slate-300 hover:border-slate-500"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {value === "aktif" && <span className={`h-2 w-2 rounded-full ${loginFilter === value ? "bg-white" : "bg-emerald-500"}`} />}
                <span>{label}</span>
                <span className="tabular-nums opacity-85">({count})</span>
              </button>
            ))}
          </div>
        );
      })()}

      {reminderNotice && (
        <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-900">
          {reminderNotice}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </p>
      )}

      {credential && (
        <div
          role="status"
          className={`rounded-2xl border p-4 text-sm shadow-xs ${
            isDark
              ? "border-emerald-500/40 bg-emerald-950/50 text-emerald-100"
              : "border-emerald-300 bg-emerald-50 text-emerald-950"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-extrabold">
              {credential.reset ? `Password baru untuk ${credential.nama}` : `Akun login berhasil dibuat untuk ${credential.nama}`}
            </p>
            <button
              type="button"
              onClick={() => setCredential(null)}
              className="text-xs font-bold underline opacity-80 hover:opacity-100"
            >
              Tutup
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <span
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                isDark ? "border-emerald-400/30 bg-slate-950/80 text-slate-100" : "border-emerald-200 bg-white text-slate-900"
              }`}
            >
              NISN / Username: <strong className="font-mono text-sm">{credential.username}</strong>
            </span>
            <span
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                isDark ? "border-emerald-400/30 bg-slate-950/80 text-amber-300" : "border-emerald-200 bg-white text-slate-900"
              }`}
            >
              Kata Sandi: <strong className="font-mono text-sm tracking-wider">{credential.password}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                const text = `${credential.nama}\nNISN/Username: ${credential.username}\nKata Sandi: ${credential.password}`;
                if (navigator.clipboard?.writeText) {
                  void navigator.clipboard.writeText(text).then(() => {
                    setCopiedCredential(true);
                    window.setTimeout(() => setCopiedCredential(false), 2500);
                  }).catch(() => {});
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                isDark
                  ? "border-emerald-400/40 bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                  : "border-emerald-400 bg-white text-emerald-950 hover:bg-emerald-100"
              }`}
            >
              {copiedCredential ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copiedCredential ? "Info Login Tersalin" : "Salin Info Login"}
            </button>
          </div>
          <p className="mt-2 text-xs opacity-85">
            Akun langsung aktif untuk masuk ke Portal Siswa. Bagikan username dan kata sandi ini kepada siswa.
          </p>
        </div>
      )}

      {loading && !data ? (
        <TableSkeleton rows={6} columns={5} />
      ) : !data?.kelas.length ? (
        <EmptyState
          title="Belum ada kelas diampu"
          description="Anda belum ditugaskan sebagai wali kelas atau pengajar pada kelas aktif di lembaga ini."
        />
      ) : data.siswa.length === 0 ? (
        <EmptyState
          title={searchTerm ? "Siswa tidak ditemukan" : "Belum ada siswa di kelas ini"}
          description={
            searchTerm
              ? "Coba kata kunci nama atau NISN lain, atau ubah filter kelas."
              : "Minta admin sekolah untuk menempatkan warga belajar pada kelas yang Anda ampu."
          }
        />
      ) : (
        <div
          className={`overflow-x-auto rounded-2xl border ${
            isDark ? "border-slate-700/70 bg-slate-900/75" : "border-white/85 bg-white/95 shadow-xs"
          }`}
        >
          <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
            <thead
              className={
                isDark
                  ? "border-b border-slate-800 bg-slate-950/60 text-[11px] font-extrabold uppercase tracking-wider text-slate-400"
                  : "border-b border-slate-200/80 bg-slate-50/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-600"
              }
            >
              <tr>
                <th className="px-4 py-3">Warga Belajar</th>
                <th className="px-4 py-3">NISN / Username</th>
                <th className="px-4 py-3">Kelas</th>
                <th className="px-4 py-3">Status Login</th>
                <th className="px-4 py-3">Status Akun</th>
                <th className="px-4 py-3 text-right">Aksi &amp; Tegur</th>
              </tr>
            </thead>
            <tbody className={isDark ? "divide-y divide-slate-800/80" : "divide-y divide-slate-200/70"}>
              {data.siswa
                .filter((student) => {
                  const st = student.statusLogin ?? "BELUM";
                  if (loginFilter === "aktif") return st === "AKTIF";
                  if (loginFilter === "pernah") return st === "PERNAH";
                  if (loginFilter === "belum") return st === "BELUM";
                  return true;
                })
                .map((student) => {
                  const loginStatus = student.statusLogin ?? "BELUM";
                  const reminderMsg = buildStudentReminderMessage({
                    nama: student.nama,
                    kelasNama: student.kelasNama,
                    statusLogin: loginStatus,
                    senderRole: "Guru",
                    portalUrl: `${window.location.origin}/lms`,
                  });
                  const reminderWaUrl = buildStudentReminderWaUrl(student.telepon, reminderMsg);
                  return (
                <tr key={student.id} className={isDark ? "hover:bg-slate-800/45" : "hover:bg-sky-50/40"}>
                  <td className={`px-4 py-3 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{student.nama}</td>
                  <td className={`px-4 py-3 font-mono text-xs tabular-nums ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    {student.username || student.nisn || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isDark ? "bg-sky-500/15 text-sky-300" : "bg-sky-50 text-sky-800"
                      }`}
                    >
                      {student.kelasNama || "Tanpa Kelas"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {loginStatus === "AKTIF" ? (
                      <div className="space-y-0.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Sedang Login
                        </span>
                        {student.lastLoginAt && (
                          <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            {formatLoginTimestamp(student.lastLoginAt)}
                          </p>
                        )}
                      </div>
                    ) : loginStatus === "PERNAH" ? (
                      <div className="space-y-0.5">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${isDark ? "bg-sky-500/15 text-sky-300" : "bg-sky-50 text-sky-700"}`}>
                          Pernah Login
                        </span>
                        {student.lastLoginAt && (
                          <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            Terakhir: {formatLoginTimestamp(student.lastLoginAt)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${isDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-50 text-amber-800"}`}>
                        Belum Login
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {student.punyaAkun ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        <CheckCircle2 size={12} aria-hidden="true" />
                        Akun Aktif
                      </span>
                    ) : (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        Belum Ada Akun
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      {loginStatus !== "AKTIF" &&
                        (reminderWaUrl ? (
                          <a
                            href={reminderWaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
                          >
                            <MessageSquare size={12} aria-hidden="true" />
                            Tegur WA
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (navigator.clipboard?.writeText) {
                                void navigator.clipboard
                                  .writeText(reminderMsg)
                                  .then(() => {
                                    setReminderNotice(`Pesan teguran untuk ${student.nama} disalin — silakan tempel ke WA/grup kelas.`);
                                    window.setTimeout(() => setReminderNotice(""), 4500);
                                  })
                                  .catch(() => {});
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
                          >
                            <MessageSquare size={12} aria-hidden="true" />
                            Salin Teguran
                          </button>
                        ))}
                    {student.punyaAkun ? (
                      <button
                        type="button"
                        onClick={() => openAccountModal(student, true)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                          isDark
                            ? "border-amber-400/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                            : "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                        }`}
                      >
                        <KeyRound size={13} aria-hidden="true" />
                        Reset Password
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openAccountModal(student, false)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                          isDark
                            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                            : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        }`}
                      >
                        <UserPlus size={13} aria-hidden="true" />
                        Buat Akun
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {modalTarget && (
        <SchoolModal
          title={modalTarget.reset ? `Reset Password ${modalTarget.student.nama}` : `Buat Akun ${modalTarget.student.nama}`}
          titleIcon={
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600">
              <KeyRound size={20} aria-hidden="true" />
            </span>
          }
          busy={modalBusy}
          onClose={() => {
            if (!modalBusy) setModalTarget(null);
          }}
        >
          <form onSubmit={(e) => void submitAccountAction(e)} className="mt-4 space-y-4 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
              <p className="font-bold text-slate-900">
                {modalTarget.student.nama} · {modalTarget.student.kelasNama}
              </p>
              <p className="mt-1">
                {modalTarget.student.username || modalTarget.student.nisn ? (
                  <>
                    Login menggunakan NISN/Username:{" "}
                    <strong className="font-mono">{modalTarget.student.username || modalTarget.student.nisn}</strong>
                  </>
                ) : (
                  "NISN siswa kosong — sistem akan membuatkan username otomatis berbasis nama."
                )}
              </p>
            </div>

            <div>
              <label htmlFor="teacher-student-password" className="block text-xs font-bold text-slate-700">
                {modalTarget.reset ? "Kata Sandi Baru (default: 123456)" : "Kata Sandi Awal (default: 123456)"}
              </label>
              <div className="relative mt-1.5">
                <input
                  id="teacher-student-password"
                  type={showPassword ? "text" : "password"}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  minLength={6}
                  maxLength={100}
                  required
                  placeholder="Minimal 6 karakter (default 123456)"
                  className="glass-input w-full rounded-xl py-2.5 pl-3.5 pr-11 font-mono text-sm"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                {modalTarget.reset
                  ? "Kata sandi baru langsung aktif untuk login siswa dan sesi lama akan dikeluarkan."
                  : "Biarkan 123456 atau masukkan kata sandi khusus minimal 6 karakter."}
              </p>
            </div>

            {modalError && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {modalError}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={modalBusy}
                onClick={() => setModalTarget(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={modalBusy}
                className="master-primary px-4 py-2 text-xs disabled:opacity-50"
              >
                {modalBusy ? "Menyimpan..." : modalTarget.reset ? "Simpan Password Baru" : "Buat Akun Sekarang"}
              </button>
            </div>
          </form>
        </SchoolModal>
      )}
    </section>
  );
}

// ==========================================
// 3. PROFIL & AKUN GURU
// ==========================================
function TeacherProfileSection({
  profil,
  school,
  fotoUrl,
  isWaliKelas,
  sandboxRole,
  onPasswordChanged,
  onFotoChanged,
  onSaved,
}: {
  profil: TeacherProfile;
  school: string;
  fotoUrl?: string | null;
  isWaliKelas: boolean;
  sandboxRole?: "GURU";
  onPasswordChanged?: () => void;
  onFotoChanged?: (nextUrl: string | null) => void;
  onSaved: (updatedNama: string) => void;
}) {
  const [nama, setNama] = useState(profil.nama);
  const [telepon, setTelepon] = useState(profil.telepon ?? "");
  const [mapelUtama, setMapelUtama] = useState(profil.mapelUtama ?? "");
  const [fotoBusy, setFotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setNama(profil.nama);
    setTelepon(profil.telepon ?? "");
    setMapelUtama(profil.mapelUtama ?? "");
  }, [profil.nama, profil.telepon, profil.mapelUtama]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/lms/guru/profil", {
        method: "PATCH",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({ nama, telepon, mapelUtama }),
      });
      const body = (await res.json()) as { profil?: TeacherProfile; message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Profil guru belum dapat disimpan.");
      setNotice(body.message || "Profil guru berhasil diperbarui.");
      onSaved(body.profil?.nama ?? nama);
    } catch (failure) {
      setError(describeFetchError(failure, "Profil guru gagal disimpan."));
    } finally {
      setBusy(false);
    }
  }

  async function handleTeacherPhotoChange(file: File | undefined) {
    if (!file || fotoBusy) return;
    setFotoBusy(true);
    setError("");
    setNotice("");
    try {
      const encoded = await compressPasFoto4x6(file);
      const res = await fetchWithTimeout("/api/lms/guru/foto-profil", {
        method: "PUT",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({ fotoUrl: encoded }),
      });
      const body = (await res.json().catch(() => null)) as { fotoUrl?: string | null; message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Foto profil guru gagal disimpan.");
      onFotoChanged?.(body?.fotoUrl ?? encoded);
      setNotice(body?.message || "Foto profil guru berhasil diperbarui.");
    } catch (failure) {
      setError(describeFetchError(failure, "Foto profil guru gagal diunggah."));
    } finally {
      setFotoBusy(false);
    }
  }

  async function handleRemoveTeacherPhoto() {
    if (fotoBusy) return;
    setFotoBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/lms/guru/foto-profil", {
        method: "PUT",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({ fotoUrl: "" }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Foto profil guru gagal dihapus.");
      onFotoChanged?.(null);
      setNotice(body?.message || "Foto profil guru dihapus.");
    } catch (failure) {
      setError(describeFetchError(failure, "Foto profil guru gagal dihapus."));
    } finally {
      setFotoBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="PROFIL & KEAMANAN AKUN"
        title="Profil & Akun Guru"
        description={`Kelola informasi identitas tutor pada ${school}, ganti kata sandi akun, dan bantu reset akses siswa binaan.`}
        badge={isWaliKelas ? "Guru & Wali Kelas" : "Guru / Tutor Aktif"}
      />

      <div className="dashboard-glass flex flex-col items-start gap-4 rounded-2xl p-5 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-indigo-200 bg-indigo-50 text-lg font-black text-indigo-700 shadow-xs">
          {fotoUrl ? (
            <img src={fotoUrl} alt={profil.nama} className="h-full w-full object-cover" />
          ) : (
            profil.nama.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Foto Profil Guru / Tutor</h2>
            <p className="text-xs text-slate-600">
              Foto ini tampil otomatis pada ikon profil kanan atas di Portal Guru. Format JPG/PNG/WebP.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-500">
              {fotoBusy ? "Mengunggah..." : "Unggah / Ganti Foto Profil"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={fotoBusy}
                onChange={(e) => {
                  void handleTeacherPhotoChange(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="sr-only"
              />
            </label>
            {fotoUrl && (
              <button
                type="button"
                disabled={fotoBusy}
                onClick={() => void handleRemoveTeacherPhoto()}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                Hapus Foto
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="dashboard-glass space-y-4 rounded-2xl p-6">
          <div className="flex items-center gap-2.5">
            <Award size={18} className="text-indigo-700" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900">Biodata Guru</h2>
          </div>

          <label className="block text-xs font-bold text-slate-700">
            Nama Lengkap
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              className="glass-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700">
              Email Akun
              <input
                type="email"
                readOnly
                value={profil.email ?? "-"}
                className="glass-input mt-1 w-full rounded-xl bg-slate-100/80 px-3.5 py-2.5 text-sm text-slate-600"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              NUPTK
              <input
                type="text"
                readOnly
                value={profil.nuptk || "Belum diisi"}
                className="glass-input mt-1 w-full rounded-xl bg-slate-100/80 px-3.5 py-2.5 text-sm text-slate-600"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700">
              Nomor Telepon / WhatsApp
              <input
                type="text"
                maxLength={32}
                value={telepon}
                onChange={(e) => setTelepon(e.target.value)}
                placeholder="08xxxxxxxxxx"
                className="glass-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Mata Pelajaran Utama
              <input
                type="text"
                maxLength={120}
                value={mapelUtama}
                onChange={(e) => setMapelUtama(e.target.value)}
                placeholder="Contoh: Bahasa Indonesia"
                className="glass-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
            </label>
          </div>

          {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
          {notice && <p role="status" className="text-xs font-semibold text-emerald-700">{notice}</p>}

          <button type="submit" disabled={busy} className="master-primary inline-flex items-center gap-2 whitespace-nowrap px-5 py-2.5 text-xs">
            <Save size={14} aria-hidden="true" />
            {busy ? "Menyimpan..." : "Simpan Profil Guru"}
          </button>
        </form>

        <div className="dashboard-glass space-y-6 rounded-2xl p-6">
          {sandboxRole ? (
            <div className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">Keamanan &amp; Reset Password</h2>
              <p className="text-sm text-slate-600">
                Penggantian kata sandi akun guru dan reset password siswa aktif pada sesi login guru asli (bukan mode Sandbox Preview).
              </p>
            </div>
          ) : (
            <>
              <PasswordChangeForm
                endpoint="/api/auth/lms/ganti-password"
                onChanged={onPasswordChanged ?? (() => {})}
              />
              <div className="border-t border-slate-200/80 pt-5">
                <TeacherPasswordReset />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
