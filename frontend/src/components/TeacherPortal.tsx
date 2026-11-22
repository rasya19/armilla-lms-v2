import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  GraduationCap,
  Home,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  MonitorCheck,
  RefreshCw,
  Save,
  UserCheck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Classroom } from "./Classroom";
import { CardGridSkeleton, DashboardHero, EmptyState, TableSkeleton } from "./DashboardUI";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { PLAN_BADGE_STYLES, SIDEBAR_THEMES } from "./SchoolAccess";
import { CbtBankSoalView, CbtJadwalView, CbtMonitoringView } from "./SchoolCbtModules";
import { AsistenAiView, RuangDiskusiView } from "./SchoolCollabAssetModules";
import { CekRaportView } from "./SchoolEquivalenceRaport";
import { TeacherPasswordReset } from "./TeacherPasswordReset";
import { useTenantTheme } from "./TenantThemeProvider";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { hasPlanAccess, type PlanSlug } from "./subscriptionPlans";

export type TeacherView =
  | "beranda"
  | "materi-tugas"
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

type PresensiStatus = "HADIR" | "IZIN" | "SAKIT" | "ALPA";

type TeacherPresensiPayload = {
  kelas: Array<{ id: string; nama: string; isWali: boolean }>;
  selectedKelasId: string | null;
  tanggal: string;
  bulan: string;
  siswa: Array<{
    id: string;
    nama: string;
    nisn: string;
    status: PresensiStatus | null;
    keterangan: string;
    waktuHadir: string | null;
    rekapBulanan: { HADIR: number; IZIN: number; SAKIT: number; ALPA: number };
  }>;
};

const TEACHER_NAV_SECTIONS: Array<{ title: string; items: TeacherMenuItem[] }> = [
  {
    title: "Utama & Pembelajaran",
    items: [
      { id: "beranda", label: "Beranda Guru", icon: LayoutDashboard },
      { id: "materi-tugas", label: "Materi & Tugas Kelas", icon: BookOpen },
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

function escapeCsv(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
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
}: {
  nama: string;
  school?: string;
  plan?: PlanSlug;
  email?: string | null;
  nuptk?: string | null;
  telepon?: string | null;
  mapelUtama?: string | null;
  busy?: boolean;
  error?: string;
  sandboxRole?: "GURU";
  onLogout?: () => void;
  onPasswordChanged?: () => void;
  onBackToAdmin?: () => void;
  onProfileUpdated?: (nextNama: string) => void;
}) {
  const theme = useTenantTheme();
  const isDark = theme === "dark";
  const palette = SIDEBAR_THEMES[theme] ?? SIDEBAR_THEMES.ocean;

  const [view, setView] = useState<TeacherView>(() => HASH_TO_TEACHER_VIEW[window.location.hash] ?? "beranda");
  const [menuOpen, setMenuOpen] = useState(false);
  const [cbtTab, setCbtTab] = useState<"bank" | "jadwal" | "monitoring">("bank");
  const [classroomTarget, setClassroomTarget] = useState<{ kelasId?: string | null; tab?: "materi" | "tugas"; seq: number }>({ seq: 0 });
  const [upgradePrompt, setUpgradePrompt] = useState<{ featureName: string; requiredPlan: Exclude<PlanSlug, "basic"> } | null>(null);

  const [beranda, setBeranda] = useState<TeacherBerandaPayload | null>(null);
  const [berandaLoading, setBerandaLoading] = useState(true);
  const [berandaError, setBerandaError] = useState("");

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

  function selectView(next: TeacherView, requiredPlan?: Exclude<PlanSlug, "basic">, label?: string) {
    if (requiredPlan && !hasPlanAccess(effectivePlan, requiredPlan)) {
      setUpgradePrompt({ featureName: label ?? next, requiredPlan });
      setMenuOpen(false);
      return;
    }
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openClassroom(kelasId?: string | null, tab?: "materi" | "tugas") {
    setClassroomTarget((prev) => ({ kelasId: kelasId ?? null, tab, seq: prev.seq + 1 }));
    setView("materi-tugas");
    setMenuOpen(false);
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
          className={`${menuOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-50 w-72 flex-col border-r p-3.5 transition-colors duration-300 lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0 ${palette.aside}`}
        >
          <div className={`flex items-center justify-between gap-2 border-b pb-3.5 ${palette.headerDivider}`}>
            <div className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border p-2.5 ${palette.identityCard}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${palette.avatar}`}>
                {effectiveSchool.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-extrabold ${palette.schoolName}`}>{effectiveSchool}</p>
                <p className={`truncate text-[10px] font-semibold ${palette.roleText}`}>
                  {beranda?.isWaliKelas ? "Portal Guru · Wali Kelas" : "Portal Guru"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Tutup menu guru"
              className={`rounded-lg p-1.5 lg:hidden ${palette.closeBtn}`}
            >
              <X size={18} />
            </button>
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
            className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          />
        )}

        {/* Konten Utama */}
        <div className="min-w-0 flex-1">
          <header className="dashboard-header sticky top-0 z-30 mx-4 mt-4 flex items-center gap-3 rounded-2xl border px-4 py-3 sm:mx-6 sm:mt-6 sm:px-6">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Buka menu guru"
              aria-expanded={menuOpen}
              className={`rounded-lg p-2 lg:hidden ${palette.headerMenuBtn}`}
            >
              <Menu size={21} />
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
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black text-white shadow-md ${palette.headerAvatar}`}>
                {initials}
              </span>
            </button>
          </header>

          {outerError && (
            <p role="alert" className="glass-panel mx-4 mt-4 rounded-xl p-4 text-sm text-rose-700 sm:mx-6">
              {outerError}
            </p>
          )}

          <div className="animate-page-enter mx-auto max-w-7xl space-y-6 p-4 pb-28 sm:p-6 md:pb-10">
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

            {view === "presensi" && <TeacherPresensiSection sandboxRole={sandboxRole} />}

            {view === "cbt" && hasPlanAccess(effectivePlan, "reguler") && (
              <div className="space-y-4">
                <div className="dashboard-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: "bank" as const, label: "Bank Soal & Ujian", icon: Database },
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
                isWaliKelas={Boolean(beranda?.isWaliKelas)}
                sandboxRole={sandboxRole}
                onPasswordChanged={onPasswordChanged}
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
                {data.tugasMenungguKoreksi.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                        {item.siswa.nama} · <span className="font-semibold text-indigo-700">{item.tugas.judul}</span>
                      </p>
                      <p className={`mt-0.5 text-[11px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        {item.tugas.kelas.nama} · {item.tugas.mapel.nama} · Dikumpulkan{" "}
                        {new Date(item.dikumpulkanPada).toLocaleDateString("id-ID")}
                      </p>
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
                ))}
              </ul>
            )}
          </div>
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
// 2. PRESENSI SISWA (INPUT HARIAN & REKAP BULANAN)
// ==========================================
function TeacherPresensiSection({ sandboxRole }: { sandboxRole?: "GURU" }) {
  const isDark = useTenantTheme() === "dark";
  const todayIso = new Date().toISOString().slice(0, 10);
  const [kelasId, setKelasId] = useState("");
  const [tanggal, setTanggal] = useState(todayIso);
  const [data, setData] = useState<TeacherPresensiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPresensi = useCallback(
    async (nextKelasId: string, nextTanggal: string, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (nextKelasId) params.set("kelasId", nextKelasId);
        if (nextTanggal) {
          params.set("tanggal", nextTanggal);
          params.set("bulan", nextTanggal.slice(0, 7));
        }
        const headers = sandboxHeaders(sandboxRole);
        const res = await fetchWithTimeout(`/api/lms/guru/presensi?${params.toString()}`, {
          signal,
          ...(headers ? { headers } : {}),
        });
        const body = (await res.json()) as TeacherPresensiPayload & { error?: string };
        if (!res.ok) throw new Error(body.error || "Data presensi belum dapat dimuat.");
        setData(body);
        if (body.selectedKelasId && body.selectedKelasId !== nextKelasId) {
          setKelasId(body.selectedKelasId);
        }
        setError("");
      } catch (failure) {
        if (!isCallerAborted(failure, signal)) {
          setError(describeFetchError(failure, "Presensi siswa belum dapat dimuat."));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [sandboxRole],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadPresensi(kelasId, tanggal, controller.signal);
    return () => controller.abort();
  }, [kelasId, tanggal, loadPresensi]);

  async function setStudentStatus(siswaId: string, status: PresensiStatus) {
    const activeKelasId = data?.selectedKelasId ?? kelasId;
    if (!activeKelasId) return;
    setSavingId(siswaId);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/lms/guru/presensi", {
        method: "PATCH",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({ kelasId: activeKelasId, siswaId, tanggal, status }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menyimpan presensi.");
      setNotice("Presensi siswa berhasil diperbarui.");
      await loadPresensi(activeKelasId, tanggal);
    } catch (failure) {
      setError(describeFetchError(failure, "Presensi siswa belum dapat disimpan."));
    } finally {
      setSavingId(null);
    }
  }

  async function markAllPresent() {
    const activeKelasId = data?.selectedKelasId ?? kelasId;
    if (!activeKelasId || !data?.siswa.length) return;
    setBulkBusy(true);
    setError("");
    setNotice("");
    try {
      for (const s of data.siswa) {
        if (s.status === "HADIR") continue;
        const res = await fetchWithTimeout("/api/lms/guru/presensi", {
          method: "PATCH",
          headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
          body: JSON.stringify({ kelasId: activeKelasId, siswaId: s.id, tanggal, status: "HADIR" }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error || "Sebagian presensi gagal disimpan.");
        }
      }
      setNotice("Seluruh warga belajar ditandai Hadir pada tanggal ini.");
      await loadPresensi(activeKelasId, tanggal);
    } catch (failure) {
      setError(describeFetchError(failure, "Presensi massal belum dapat diselesaikan."));
    } finally {
      setBulkBusy(false);
    }
  }

  function exportCsv() {
    if (!data?.siswa.length) return;
    const kelasNama = data.kelas.find((k) => k.id === data.selectedKelasId)?.nama ?? "Kelas";
    const lines = [
      ["No", "NISN", "Nama Siswa", `Status (${data.tanggal})`, "Hadir (Bulan)", "Izin (Bulan)", "Sakit (Bulan)", "Alpa (Bulan)"]
        .map(escapeCsv)
        .join(","),
      ...data.siswa.map((s, idx) =>
        [
          idx + 1,
          s.nisn,
          s.nama,
          s.status ?? "BELUM DIISI",
          s.rekapBulanan.HADIR,
          s.rekapBulanan.IZIN,
          s.rekapBulanan.SAKIT,
          s.rekapBulanan.ALPA,
        ]
          .map(escapeCsv)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `presensi-${kelasNama.toLowerCase().replace(/\s+/g, "-")}-${data.tanggal}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const summary = useMemo(() => {
    const list = data?.siswa ?? [];
    return {
      total: list.length,
      hadir: list.filter((s) => s.status === "HADIR").length,
      izin: list.filter((s) => s.status === "IZIN").length,
      sakit: list.filter((s) => s.status === "SAKIT").length,
      alpa: list.filter((s) => s.status === "ALPA").length,
    };
  }, [data]);

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="KEHADIRAN WARGA BELAJAR"
        title="Presensi Siswa & Rekap Bulanan"
        description="Catat kehadiran harian warga belajar per pertemuan kelas dan pantau akumulasi kehadiran bulanan secara otomatis."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={bulkBusy || !data?.siswa.length}
              onClick={() => void markAllPresent()}
              className="dashboard-hero-action whitespace-nowrap disabled:opacity-50"
            >
              <CheckCircle2 size={15} aria-hidden="true" />
              {bulkBusy ? "Menyimpan..." : "Tandai Semua Hadir"}
            </button>
            <button
              type="button"
              disabled={!data?.siswa.length}
              onClick={exportCsv}
              className="dashboard-hero-action dashboard-hero-secondary whitespace-nowrap disabled:opacity-50"
            >
              <Download size={15} aria-hidden="true" />
              Ekspor CSV
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-bold">
          Pilih Kelas
          <select
            value={data?.selectedKelasId ?? kelasId}
            onChange={(e) => setKelasId(e.target.value)}
            className="glass-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
          >
            {!data?.kelas.length && <option value="">Belum ada kelas</option>}
            {data?.kelas.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}{k.isWali ? " (Wali Kelas)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold">
          Tanggal Pertemuan
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className="glass-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
          />
        </label>
        <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${isDark ? "border-slate-700/60 bg-slate-900/70" : "border-white/85 bg-white/85"}`}>
          <span className="text-xs font-bold text-slate-500">Hadir Hari Ini</span>
          <span className="text-xl font-black text-emerald-600 tabular-nums">
            {summary.hadir} / {summary.total}
          </span>
        </div>
        <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-bold tabular-nums ${isDark ? "border-slate-700/60 bg-slate-900/70" : "border-white/85 bg-white/85"}`}>
          <span className="text-sky-700">Izin: {summary.izin}</span>
          <span className="text-amber-700">Sakit: {summary.sakit}</span>
          <span className="text-rose-700">Alpa: {summary.alpa}</span>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}

      {loading && !data ? (
        <TableSkeleton rows={5} columns={4} />
      ) : !data?.kelas.length ? (
        <EmptyState
          title="Belum ada kelas tersedia"
          description="Anda belum ditugaskan pada jadwal mengajar atau wali kelas di lembaga ini."
        />
      ) : !data.siswa.length ? (
        <EmptyState
          title="Belum ada siswa aktif pada kelas ini"
          description="Minta admin sekolah untuk menempatkan warga belajar pada kelas yang dipilih."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/80 bg-white/85">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3">Warga Belajar</th>
                <th className="px-4 py-3">Status ({data.tanggal})</th>
                <th className="px-4 py-3 text-center">Rekap Bulan ({data.bulan})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {data.siswa.map((student) => (
                <tr key={student.id} className="hover:bg-indigo-50/40">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{student.nama}</p>
                    <p className="font-mono text-[11px] text-slate-500">NISN {student.nisn}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        { code: "HADIR" as const, label: "Hadir", active: "bg-emerald-600 text-white border-emerald-600" },
                        { code: "IZIN" as const, label: "Izin", active: "bg-sky-600 text-white border-sky-600" },
                        { code: "SAKIT" as const, label: "Sakit", active: "bg-amber-500 text-white border-amber-500" },
                        { code: "ALPA" as const, label: "Alpa", active: "bg-rose-600 text-white border-rose-600" },
                      ]).map((opt) => {
                        const isSelected = student.status === opt.code;
                        return (
                          <button
                            key={opt.code}
                            type="button"
                            disabled={savingId === student.id || bulkBusy}
                            aria-pressed={isSelected}
                            onClick={() => void setStudentStatus(student.id, opt.code)}
                            className={`whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${
                              isSelected
                                ? opt.active
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold tabular-nums text-slate-700">
                    H:{student.rekapBulanan.HADIR} · I:{student.rekapBulanan.IZIN} · S:{student.rekapBulanan.SAKIT} · A:{student.rekapBulanan.ALPA}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  isWaliKelas,
  sandboxRole,
  onPasswordChanged,
  onSaved,
}: {
  profil: TeacherProfile;
  school: string;
  isWaliKelas: boolean;
  sandboxRole?: "GURU";
  onPasswordChanged?: () => void;
  onSaved: (updatedNama: string) => void;
}) {
  const [nama, setNama] = useState(profil.nama);
  const [telepon, setTelepon] = useState(profil.telepon ?? "");
  const [mapelUtama, setMapelUtama] = useState(profil.mapelUtama ?? "");
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

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="PROFIL & KEAMANAN AKUN"
        title="Profil & Akun Guru"
        description={`Kelola informasi identitas tutor pada ${school}, ganti kata sandi akun, dan bantu reset akses siswa binaan.`}
        badge={isWaliKelas ? "Guru & Wali Kelas" : "Guru / Tutor Aktif"}
      />

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
