import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  GraduationCap,
  KeyRound,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { Classroom } from "./Classroom";
import { CardGridSkeleton, TableSkeleton } from "./DashboardUI";
import { useGlassConfirm } from "./GlassConfirm";
import { LmsSchedule } from "./LmsSchedule";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { PWAInstallButton } from "./PWAInstallButton";
import { SIDEBAR_THEMES } from "./SchoolAccess";
import { StudentVervalForm } from "./StudentVervalForm";
import { useTenantTheme } from "./TenantThemeProvider";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

export type StudentTodayAttendance = {
  tanggal: string;
  status: "HADIR" | "IZIN" | "SAKIT" | "ALPA" | null;
  keterangan: string | null;
  waktuHadir: string | null;
};

export interface StudentPortalProps {
  nama: string;
  nisn?: string | null;
  kelasId?: string | null;
  kelasNama?: string | null;
  school?: string;
  presensiHariIni?: StudentTodayAttendance | null;
  busy?: boolean;
  error?: string;
  sandboxRole?: "SISWA";
  onLogout?: () => void;
  onBackToAdmin?: () => void;
  onPasswordChanged?: () => void;
}

type StudentTab = "kbm" | "diskusi" | "cbt" | "jadwal" | "nilai" | "profil";

type DiscussionReply = {
  id: string;
  isi: string;
  penulisNama: string;
  penulisPeran: string;
  createdAt: string;
};

type DiscussionTopic = {
  id: string;
  kelasId: string | null;
  kategori: string;
  judul: string;
  isi: string;
  penulisNama: string;
  penulisPeran: string;
  disematkan: boolean;
  ditutup: boolean;
  createdAt: string;
  updatedAt: string;
  balasan: DiscussionReply[];
};

type DiscussionPayload = {
  topics: DiscussionTopic[];
  kelas: Array<{ id: string; nama: string }>;
  studentKelasId?: string | null;
  belumDitempatkan?: boolean;
  error?: string;
};

type StudentExamItem = {
  id: string;
  kode: string;
  judul: string;
  mulai: string;
  selesai: string;
  durasiMenit: number;
  kkm: number;
  tampilNilai: boolean;
  butuhToken: boolean;
  jumlahSoal: number;
  mapel: { nama: string };
  guru: { nama: string };
  tahunAjaran: { nama: string; semester: string };
  percobaan: Array<{
    dimulaiPada: string;
    dikumpulkanPada: string | null;
    nilai: number | null;
    nilaiOverride: number | null;
    catatanGuru: string | null;
  }>;
};

type StudentExamListPayload = {
  belumDitempatkan: boolean;
  kelas: { id: string; nama: string } | null;
  rows: StudentExamItem[];
  error?: string;
};

type CbtChoice = "A" | "B" | "C" | "D" | "E";

type ActiveCbtQuestion = {
  id: string;
  urutan: number;
  teks: string;
  opsi: Array<{ kode: string; teks: string }>;
};

type ActiveCbtSession = {
  id: string;
  judul: string;
  siswaId: string;
  deadline: string;
  soal: ActiveCbtQuestion[];
};

type StudentGradesPayload = {
  siswa: {
    id: string;
    nama: string;
    nisn: string;
    kelasId: string | null;
    kelasNama: string | null;
    jenjang: string | null;
  };
  sekolah: {
    nama: string;
    npsn: string | null;
    alamat: string | null;
    kepalaSekolah: string | null;
    logoUrl: string | null;
  } | null;
  tugas: Array<{
    id: string;
    judul: string;
    mapel: string;
    tahunAjaran: string;
    dikumpulkanPada: string;
    nilai: number | null;
    catatanGuru: string | null;
  }>;
  ujian: Array<{
    id: string;
    kode: string;
    judul: string;
    mapel: string;
    tahunAjaran: string;
    kkm: number;
    status: string;
    dikumpulkanPada: string | null;
    nilai: number | null;
    catatanGuru: string | null;
  }>;
  raport: Array<{
    id: string;
    mapel: string;
    tahunAjaran: string;
    nilaiMandiri: number;
    nilaiSimulasi: number;
    nilaiAkhir: number;
    catatanKompetensi: string | null;
    predikat: string;
  }>;
  modulSkk: Array<{
    id: string;
    jenjang: string;
    tingkatan: string;
    kelompok: string;
    kodeModul: string;
    judulModul: string;
    skkTotal: number;
  }>;
  catatanRaport: {
    catatanWali: string | null;
    statusKenaikan: string;
  } | null;
  summary: {
    rataTugas: number | null;
    rataUjian: number | null;
    rataRaport: number | null;
    totalSkk: number;
    totalTugasDinilai: number;
    totalUjianSelesai: number;
  };
  error?: string;
};

type ExamCategory = "SEMUA" | "LATIHAN" | "UTS" | "UAS" | "UJIAN_AKHIR";

const STUDENT_TABS: Array<{
  id: StudentTab;
  label: string;
  shortLabel: string;
  icon: typeof BookOpen;
}> = [
  { id: "kbm", label: "Ruang KBM & Modul", shortLabel: "KBM", icon: BookOpen },
  { id: "diskusi", label: "Ruang Diskusi", shortLabel: "Diskusi", icon: MessageSquare },
  { id: "cbt", label: "Ujian Online (CBT)", shortLabel: "Ujian", icon: ClipboardCheck },
  { id: "jadwal", label: "Jadwal Belajar", shortLabel: "Jadwal", icon: CalendarDays },
  { id: "nilai", label: "Nilai & Transkrip", shortLabel: "Nilai", icon: Award },
  { id: "profil", label: "Profil & Berkas Dapodik", shortLabel: "Profil", icon: UserRound },
];

function detectExamCategory(exam: { kode: string; judul: string }): Exclude<ExamCategory, "SEMUA"> {
  const combined = `${exam.kode} ${exam.judul}`.toUpperCase();
  if (/\bUPK\b|UJIAN\s*AKHIR|\bUAK\b|USBN|UKK/.test(combined)) return "UJIAN_AKHIR";
  if (/\bUAS\b|\bPAS\b|AKHIR\s*SEMESTER/.test(combined)) return "UAS";
  if (/\bUTS\b|\bPTS\b|TENGAH\s*SEMESTER/.test(combined)) return "UTS";
  return "LATIHAN";
}

function examCategoryMeta(cat: Exclude<ExamCategory, "SEMUA">) {
  if (cat === "UJIAN_AKHIR") return { label: "Ujian Akhir / UPK", cls: "border-rose-200 bg-rose-50 text-rose-700" };
  if (cat === "UAS") return { label: "UAS", cls: "border-violet-200 bg-violet-50 text-violet-700" };
  if (cat === "UTS") return { label: "UTS", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  return { label: "Latihan", cls: "border-sky-200 bg-sky-50 text-sky-700" };
}

function formatWib(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })} WIB`;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function detectPaketLabel(kelasNama: string | null | undefined): string | null {
  if (!kelasNama) return null;
  const lower = kelasNama.toLowerCase();
  if (/\bpaket\s*a\b|\bkelas\s*[1-6]\b|\bsd\b/.test(lower)) return "Paket A (Setara SD)";
  if (/\bpaket\s*b\b|\bkelas\s*[7-9]\b|\bsmp\b/.test(lower)) return "Paket B (Setara SMP)";
  if (/\bpaket\s*c\b|\bkelas\s*1[0-2]\b|\bsma\b/.test(lower)) return "Paket C (Setara SMA)";
  return null;
}

function isValidChoice(value: string): value is CbtChoice {
  return value === "A" || value === "B" || value === "C" || value === "D" || value === "E";
}

export function StudentPortal({
  nama,
  nisn,
  kelasId,
  kelasNama,
  school,
  presensiHariIni,
  busy = false,
  error = "",
  sandboxRole,
  onLogout,
  onBackToAdmin,
  onPasswordChanged,
}: StudentPortalProps) {
  const theme = useTenantTheme();
  const isDark = theme === "dark";
  const palette = SIDEBAR_THEMES[theme] ?? SIDEBAR_THEMES.ocean;
  const [menuOpen, setMenuOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [autoHideSidebar, setAutoHideSidebar] = useState(false);
  const [activeTab, setActiveTab] = useState<StudentTab>(() => {
    const hash = window.location.hash;
    if (hash === "#diskusi-siswa") return "diskusi";
    if (hash === "#ujian-cbt") return "cbt";
    if (hash === "#jadwal-lms") return "jadwal";
    if (hash === "#nilai-transkrip") return "nilai";
    if (hash === "#biodata-dapodik" || hash === "#profil-siswa") return "profil";
    return "kbm";
  });

  const [resolvedKelasNama, setResolvedKelasNama] = useState<string | null>(kelasNama ?? null);
  const [resolvedKelasId, setResolvedKelasId] = useState<string | null>(kelasId ?? null);

  useEffect(() => {
    if (kelasNama !== undefined) setResolvedKelasNama(kelasNama ?? null);
    if (kelasId !== undefined) setResolvedKelasId(kelasId ?? null);
  }, [kelasId, kelasNama]);

  // Fallback resolve active class name from /api/lms/ruang-kbm if not provided (e.g. sandbox mode)
  useEffect(() => {
    if (resolvedKelasNama) return;
    const controller = new AbortController();
    fetchWithTimeout("/api/lms/ruang-kbm", {
      signal: controller.signal,
      ...(sandboxRole ? { headers: { "X-Dev-Sandbox-Role": sandboxRole } } : {}),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as { rows?: Array<{ id?: string; nama?: string }> } | null;
        const first = body?.rows?.[0];
        if (first?.nama) {
          setResolvedKelasNama(first.nama);
          if (first.id) setResolvedKelasId(first.id);
        }
      })
      .catch(() => {
        // Silent fallback
      });
    return () => controller.abort();
  }, [resolvedKelasNama, sandboxRole]);

  const schoolDisplay = school || "Lembaga PKBM";
  const paketLabel = detectPaketLabel(resolvedKelasNama);
  const userInitials =
    nama
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || nama.charAt(0).toUpperCase();

  function toggleSidebar() {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMenuOpen((prev) => !prev);
    } else {
      setDesktopSidebarOpen((prev) => !prev);
    }
  }

  function selectTab(next: StudentTab) {
    setActiveTab(next);
    setMenuOpen(false);
    if (autoHideSidebar) setDesktopSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="dashboard-canvas glass-area min-h-screen text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        {/* Sidebar Navigasi Siswa */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-300 ease-in-out print:hidden ${
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
              <BrandLogo alt={`Logo ${schoolDisplay}`} className="h-9 w-9 rounded-xl border border-white/20" />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-black uppercase tracking-wide ${palette.schoolName}`}>
                  {schoolDisplay}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className={`text-[10px] font-bold uppercase ${palette.roleText}`}>
                    WARGA BELAJAR / SISWA
                  </span>
                </div>
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
                aria-label="Tutup menu siswa"
                className={`rounded-lg p-1.5 lg:hidden ${palette.closeBtn}`}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <nav aria-label="Navigasi Portal Siswa" className="dashboard-scrollbar mt-3.5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
            <p className={`mb-2 px-3 text-[10px] font-black uppercase tracking-wider ${palette.sectionLabel}`}>
              NAVIGASI WARGA BELAJAR
            </p>
            {STUDENT_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  title={tab.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => selectTab(tab.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors duration-200 ${
                    active ? palette.itemActive : palette.itemInactive
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      active ? palette.itemActiveIcon : palette.itemIcon
                    }`}
                  >
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <span className="leading-snug">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className={`mt-3 shrink-0 space-y-2.5 border-t pt-3 ${palette.footerDivider}`}>
            <div className={`rounded-2xl border p-3 ${palette.tierCard}`}>
              <p className={`truncate text-xs font-extrabold ${palette.schoolName}`}>{nama}</p>
              <p className={`mt-0.5 truncate text-[11px] font-semibold ${palette.tierLabel}`}>
                {resolvedKelasNama ? resolvedKelasNama : "Belum Ditempatkan di Kelas"}
              </p>
              {nisn && (
                <p className={`mt-1 font-mono text-[10px] font-bold opacity-85 ${palette.tierLabel}`}>
                  NISN {nisn}
                </p>
              )}
            </div>

            <PWAInstallButton
              compact
              className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${palette.tierCard}`}
            />

            {onBackToAdmin ? (
              <button
                type="button"
                onClick={onBackToAdmin}
                className={`flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2.5 text-xs font-bold transition ${palette.logoutBtn}`}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Kembali ke Admin
              </button>
            ) : (
              onLogout && (
                <button
                  disabled={busy}
                  type="button"
                  onClick={onLogout}
                  className={`flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2.5 text-xs font-bold transition disabled:opacity-50 ${palette.logoutBtn}`}
                >
                  <LogOut size={14} aria-hidden="true" />
                  Keluar
                </button>
              )
            )}
          </div>
        </aside>

        {menuOpen && (
          <button
            type="button"
            aria-label="Tutup menu siswa"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[1px] print:hidden lg:hidden"
          />
        )}

        {/* Konten Utama */}
        <div className="min-w-0 flex-1 transition-all duration-300">
          <header className="dashboard-header sticky top-0 z-30 mx-4 mt-4 flex items-center gap-3 rounded-2xl border px-4 py-3 print:hidden sm:mx-6 sm:mt-6 sm:px-6">
            <button
              type="button"
              onClick={toggleSidebar}
              title={desktopSidebarOpen ? "Sembunyikan sidebar" : "Tampilkan sidebar"}
              aria-label="Buka atau tutup menu siswa"
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
            {isDark && (
              <BrandLogo alt={`Logo ${schoolDisplay}`} className="hidden h-9 w-9 rounded-xl border border-white/15 sm:block" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className={`inline-block max-w-full truncate rounded-lg text-sm font-extrabold ${isDark ? "px-0 py-0.5 text-white sm:text-base" : `px-3 py-1 ${palette.headerSchoolPill}`}`}>
                  {schoolDisplay}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                    isDark
                      ? "border-amber-400/35 bg-amber-500/15 text-amber-200"
                      : "border-indigo-200 bg-indigo-50 text-indigo-800"
                  }`}
                >
                  Warga Belajar · {resolvedKelasNama ? resolvedKelasNama : "Siswa"}
                  {sandboxRole ? " · Sandbox" : ""}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => selectTab("profil")}
              aria-current={activeTab === "profil" ? "page" : undefined}
              title="Profil & Berkas Dapodik"
              className={`flex shrink-0 items-center gap-2.5 rounded-full border py-1 pl-3 pr-1 text-left transition ${
                activeTab === "profil"
                  ? isDark
                    ? "border-amber-400/60 bg-amber-500/15 ring-2 ring-amber-400/30"
                    : "border-indigo-300 bg-indigo-50/90 ring-2 ring-indigo-200"
                  : isDark
                    ? "border-slate-700/80 bg-slate-800/80 hover:border-amber-400/50"
                    : "border-slate-200/90 bg-white/90 hover:border-indigo-200 hover:bg-indigo-50/50"
              }`}
            >
              <div className="hidden min-w-0 text-right sm:block">
                <p className={`max-w-[160px] truncate text-xs font-bold leading-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  {nama}
                </p>
                <p className={`inline-flex items-center justify-end gap-1 text-[10px] font-semibold ${isDark ? "text-amber-300" : "text-indigo-700"}`}>
                  <UserRound size={10} aria-hidden="true" />
                  {nisn ? `NISN ${nisn}` : "Profil Siswa"}
                </p>
              </div>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black text-white shadow-sm ${palette.headerAvatar}`}>
                {userInitials}
              </span>
            </button>
          </header>

          <div className={`animate-page-enter mx-auto ${desktopSidebarOpen ? "max-w-7xl" : "max-w-full"} space-y-5 p-4 pb-28 transition-all duration-300 sm:p-6 md:pb-8`}>
        {/* Welcome Hero Banner with Automatic Attendance Badge & Active Class/Paket */}
        <section
          className={`relative overflow-hidden rounded-3xl border p-5 shadow-sm print:hidden sm:p-6 ${
            isDark
              ? "border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/70 text-white"
              : "border-white/80 bg-gradient-to-br from-white via-indigo-50/40 to-cyan-50/50 text-slate-900 shadow-[0_12px_36px_rgba(15,23,42,0.06)]"
          }`}
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div className="space-y-1.5">
              <p className={`text-[11px] font-extrabold uppercase tracking-[0.16em] ${isDark ? "text-amber-300" : "text-indigo-600"}`}>
                PORTAL WARGA BELAJAR · {schoolDisplay}
              </p>
              <h2 className="text-xl font-black tracking-tight sm:text-2xl">
                Selamat datang, {nama}
              </h2>
              <p className={`max-w-2xl text-xs leading-5 sm:text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Akses modul pembelajaran, forum diskusi kelas, ujian CBT online, jadwal KBM, serta pantau nilai dan berkas Dapodik Anda di satu tempat.
              </p>
            </div>

            {nisn && (
              <div
                className={`shrink-0 rounded-2xl border px-3.5 py-2 text-xs ${
                  isDark ? "border-slate-700 bg-slate-800/80 text-slate-200" : "border-slate-200/80 bg-white/85 text-slate-700"
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">NISN Aktif</p>
                <p className="mt-0.5 font-mono text-sm font-extrabold tabular-nums">{nisn}</p>
              </div>
            )}
          </div>

          {/* Badges Row: Presensi Otomatis + Kelas/Paket Aktif */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {(() => {
              const st = presensiHariIni?.status ?? (sandboxRole ? "HADIR" : null);
              const ket = presensiHariIni?.keterangan ?? (sandboxRole ? "Login Daring" : null);

              if (st === "HADIR" || (!presensiHariIni && resolvedKelasId)) {
                const sourceLabel = ket === "Login Daring" || !ket ? "Login Daring" : ket;
                return (
                  <span
                    role="status"
                    className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-extrabold shadow-2xs ${
                      isDark
                        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                        : "border-emerald-300 bg-emerald-50 text-emerald-900"
                    }`}
                  >
                    <CheckCircle2 size={15} className="shrink-0 text-emerald-600" aria-hidden="true" />
                    ✓ Presensi Hari Ini: Tercatat Hadir ({sourceLabel})
                  </span>
                );
              }
              if (st === "IZIN" || st === "SAKIT" || st === "ALPA") {
                const labelMap = { IZIN: "Izin", SAKIT: "Sakit", ALPA: "Alpa" } as const;
                const tone =
                  st === "IZIN"
                    ? "border-sky-300 bg-sky-50 text-sky-900"
                    : st === "SAKIT"
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-rose-300 bg-rose-50 text-rose-900";
                return (
                  <span role="status" className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-extrabold ${tone}`}>
                    <CheckCircle2 size={15} className="shrink-0" aria-hidden="true" />
                    Presensi Hari Ini: Tercatat {labelMap[st]} (Dicatat Guru)
                  </span>
                );
              }
              return (
                <span
                  role="status"
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold ${
                    isDark
                      ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                      : "border-emerald-300 bg-emerald-50 text-emerald-900"
                  }`}
                >
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-600" aria-hidden="true" />
                  ✓ Presensi Hari Ini: Tercatat Hadir (Login Daring)
                </span>
              );
            })()}

            {resolvedKelasNama ? (
              <span
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold ${
                  isDark
                    ? "border-indigo-400/35 bg-indigo-500/15 text-indigo-200"
                    : "border-indigo-200 bg-indigo-50/90 text-indigo-900"
                }`}
              >
                <GraduationCap size={15} className="shrink-0" aria-hidden="true" />
                <span>
                  {paketLabel ? `${paketLabel} · ` : ""}
                  {resolvedKelasNama}
                </span>
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${
                    isDark
                      ? "border-amber-400/35 bg-amber-500/15 text-amber-200"
                      : "border-amber-300 bg-amber-50 text-amber-900"
                  }`}
                >
                  <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
                  Belum Ditempatkan di Kelas
                </span>
                <button
                  type="button"
                  onClick={() => selectTab("profil")}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${
                    isDark
                      ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  <UserRound size={13} aria-hidden="true" />
                  Lengkapi Profil Dapodik
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Konten menu aktif dirender dari Sidebar Kiri */}

        {error && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 print:hidden">
            {error}
          </div>
        )}

        {/* Active Tab Content */}
        <div>
          {activeTab === "kbm" && (
            <div className="space-y-4">
              <Classroom role="SISWA" sandboxRole={sandboxRole} />
            </div>
          )}

          {activeTab === "diskusi" && (
            <StudentDiscussionSection
              sandboxRole={sandboxRole}
              kelasNama={resolvedKelasNama}
              onGoToProfile={() => selectTab("profil")}
            />
          )}

          {activeTab === "cbt" && (
            <StudentCbtSection
              sandboxRole={sandboxRole}
              onGoToDiscussion={() => selectTab("diskusi")}
              onGoToProfile={() => selectTab("profil")}
            />
          )}

          {activeTab === "jadwal" && (
            <div className="space-y-4">
              <LmsSchedule role="SISWA" sandboxRole={sandboxRole} />
            </div>
          )}

          {activeTab === "nilai" && (
            <StudentGradesTranscriptSection
              sandboxRole={sandboxRole}
              fallbackName={nama}
              fallbackSchool={schoolDisplay}
              fallbackKelas={resolvedKelasNama}
            />
          )}

          {activeTab === "profil" && (
            <div className="space-y-5">
              <StudentVervalForm sandboxRole={sandboxRole} />
              {!sandboxRole && onPasswordChanged && (
                <section className="dashboard-glass rounded-3xl p-5 sm:p-6">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                      <KeyRound size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">Keamanan Akun &amp; Ganti Kata Sandi Mandiri</h3>
                      <p className="text-xs text-slate-600">
                        Jaga kerahasiaan akun belajar Anda dengan mengganti kata sandi secara berkala.
                      </p>
                    </div>
                  </div>
                  <PasswordChangeForm
                    endpoint="/api/auth/lms/ganti-password"
                    requireCurrentPassword
                    title="Ganti Kata Sandi"
                    description="Masukkan kata sandi saat ini dan kata sandi baru minimal 6 karakter. Setelah tersimpan, Anda akan diminta masuk kembali."
                    onChanged={onPasswordChanged}
                    className="rounded-2xl border border-slate-200/90 bg-white/90 p-4"
                    inputClassName="glass-input mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm"
                    buttonClassName="master-primary mt-4 px-5 py-2.5 text-sm disabled:opacity-50"
                  />
                </section>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
      </div>

      {/* Mobile Bottom Navigation Bar (PWA-friendly, all 6 items) */}
      <nav
        aria-label="Navigasi bawah siswa"
        className={`print:hidden md:hidden ${
          isDark
            ? "fixed inset-x-2 bottom-2 z-40 grid grid-cols-6 gap-0.5 rounded-2xl border border-slate-700/70 bg-slate-900/95 p-1.5 shadow-[0_14px_40px_rgba(2,6,23,0.75)] backdrop-blur-2xl"
            : "fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-slate-200/90 bg-white/95 px-1 pt-1.5 shadow-[0_-8px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl"
        }`}
        style={isDark ? undefined : { paddingBottom: "max(0.45rem, env(safe-area-inset-bottom))" }}
      >
        {STUDENT_TABS.map(({ id, shortLabel, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => selectTab(id)}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] transition ${
                active
                  ? isDark
                    ? "bg-amber-400 font-extrabold text-slate-950"
                    : "bg-indigo-50 font-extrabold text-indigo-700"
                  : isDark
                    ? "font-medium text-slate-400 hover:text-white"
                    : "font-medium text-slate-600"
              }`}
            >
              <Icon size={17} aria-hidden="true" />
              <span className="truncate">{shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}

/* ============================================================================
 * 1. RUANG DISKUSI SISWA (Terhubung ke /api/sekolah/diskusi bersama Guru/Admin)
 * ==========================================================================*/
function StudentDiscussionSection({
  sandboxRole,
  kelasNama,
  onGoToProfile,
}: {
  sandboxRole?: "SISWA";
  kelasNama: string | null;
  onGoToProfile: () => void;
}) {
  const [data, setData] = useState<DiscussionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filterCat, setFilterCat] = useState<"SEMUA" | "KELAS" | "UMUM" | "PENGUMUMAN">("SEMUA");
  const [search, setSearch] = useState("");

  // Create new question / topic
  const [composerOpen, setComposerOpen] = useState(false);
  const [judul, setJudul] = useState("");
  const [isi, setIsi] = useState("");
  const [targetScope, setTargetScope] = useState<"KELAS" | "UMUM">("KELAS");
  const [creating, setCreating] = useState(false);

  // Per-topic reply input
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyBusyId, setReplyBusyId] = useState<string | null>(null);

  const loadDiscussions = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/diskusi", {
        signal,
        ...(sandboxRole ? { headers: { "X-Dev-Sandbox-Role": sandboxRole } } : {}),
      });
      const body = (await res.json().catch(() => null)) as DiscussionPayload | null;
      if (!res.ok || !body) {
        throw new Error(body?.error || "Forum diskusi belum dapat dimuat.");
      }
      setData(body);
      if (body.belumDitempatkan || !body.studentKelasId) {
        setTargetScope("UMUM");
      }
    } catch (failure: unknown) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Forum diskusi belum dapat dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [sandboxRole]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDiscussions(controller.signal);
    return () => controller.abort();
  }, [loadDiscussions]);

  const studentKelas = data?.kelas?.[0] ?? null;
  const belumDitempatkan = Boolean(data?.belumDitempatkan || (!studentKelas && !kelasNama));

  const filteredTopics = useMemo(() => {
    const list = data?.topics ?? [];
    return list.filter((topic) => {
      if (filterCat !== "SEMUA" && topic.kategori !== filterCat) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hit =
          topic.judul.toLowerCase().includes(q) ||
          topic.isi.toLowerCase().includes(q) ||
          topic.penulisNama.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [data, filterCat, search]);

  async function handleCreateTopic(event: React.FormEvent) {
    event.preventDefault();
    if (!judul.trim() || !isi.trim()) return;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const useClass = targetScope === "KELAS" && studentKelas?.id;
      const res = await fetchWithTimeout("/api/sekolah/diskusi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
        },
        body: JSON.stringify({
          judul: judul.trim(),
          isi: isi.trim(),
          kategori: useClass ? "KELAS" : "UMUM",
          kelasId: useClass ? studentKelas.id : null,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Pertanyaan diskusi belum dapat dikirim.");
      setJudul("");
      setIsi("");
      setComposerOpen(false);
      setNotice(body?.message || "Pertanyaan diskusi berhasil diterbitkan.");
      await loadDiscussions();
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Pertanyaan diskusi belum dapat dikirim."));
    } finally {
      setCreating(false);
    }
  }

  async function handleReply(topicId: string) {
    const text = (replyDrafts[topicId] ?? "").trim();
    if (!text) return;
    setReplyBusyId(topicId);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/diskusi/${encodeURIComponent(topicId)}/balasan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
        },
        body: JSON.stringify({ isi: text }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Balasan belum dapat dikirim.");
      setReplyDrafts((prev) => ({ ...prev, [topicId]: "" }));
      setNotice("Balasan Anda telah dikirim.");
      await loadDiscussions();
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Balasan belum dapat dikirim."));
    } finally {
      setReplyBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="dashboard-glass rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">FORUM INTERAKTIF PKBM</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-900">Ruang Diskusi Kelas &amp; Lembaga</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Terhubung langsung dengan Tutor &amp; Admin sekolah. Tanyakan materi modul atau balas topik diskusi kelas Anda.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadDiscussions()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={() => setComposerOpen((prev) => !prev)}
              className="master-primary inline-flex items-center gap-1.5 text-xs"
            >
              <MessageSquare size={14} aria-hidden="true" />
              {composerOpen ? "Tutup Form" : "Buat Pertanyaan Diskusi"}
            </button>
          </div>
        </div>

        {/* Friendly Banner if Student Has Not Been Placed in a Class */}
        {belumDitempatkan && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-xs text-amber-950">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="font-extrabold">Anda belum ditempatkan pada rombel/kelas oleh Admin Sekolah.</p>
                <p className="mt-0.5 text-amber-900">
                  Diskusi khusus kelas akan otomatis muncul setelah penempatan kelas selesai. Sementara itu, Anda tetap dapat membaca &amp; berpartisipasi pada <strong>Forum Umum &amp; Pengumuman Lembaga</strong> di bawah ini.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onGoToProfile}
              className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-900 hover:bg-amber-100"
            >
              Cek Profil Dapodik
            </button>
          </div>
        )}

        {/* New Topic Form */}
        {composerOpen && (
          <form onSubmit={handleCreateTopic} className="mt-4 space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-indigo-950">Tulis Pertanyaan atau Topik Diskusi Baru</h3>
              <div className="flex gap-1.5">
                {studentKelas && (
                  <button
                    type="button"
                    onClick={() => setTargetScope("KELAS")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                      targetScope === "KELAS" ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    Kelas: {studentKelas.nama}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTargetScope("UMUM")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                    targetScope === "UMUM" ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  Forum Umum Lembaga
                </button>
              </div>
            </div>
            <input
              required
              maxLength={200}
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="Judul pertanyaan, misal: Tanya contoh soal Modul 2 Matematika"
              className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm"
            />
            <textarea
              required
              rows={3}
              maxLength={3000}
              value={isi}
              onChange={(e) => setIsi(e.target.value)}
              placeholder="Tuliskan pertanyaan atau bahan diskusi Anda dengan jelas agar tutor dan teman sekelas dapat membantu..."
              className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={creating || !judul.trim() || !isi.trim()}
                className="master-primary inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
              >
                <Send size={13} aria-hidden="true" />
                {creating ? "Mengirim..." : "Terbitkan Topik"}
              </button>
            </div>
          </form>
        )}

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {([
              { id: "SEMUA", label: "Semua Topik" },
              { id: "KELAS", label: "Diskusi Kelas" },
              { id: "UMUM", label: "Forum Umum" },
              { id: "PENGUMUMAN", label: "Pengumuman" },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilterCat(item.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  filterCat === item.id
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="relative flex w-full items-center sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-3 text-slate-400" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari topik atau penulis..."
              className="glass-input w-full rounded-xl py-2 pl-8 pr-3 text-xs"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
            {notice}
          </p>
        )}
      </div>

      {/* Topic List */}
      {loading && !data ? (
        <TableSkeleton rows={4} columns={2} />
      ) : filteredTopics.length === 0 ? (
        <div className="dashboard-glass rounded-3xl p-8 text-center">
          <MessageSquare size={32} className="mx-auto text-indigo-400" aria-hidden="true" />
          <h3 className="mt-3 text-base font-extrabold text-slate-900">Belum ada topik diskusi pada filter ini</h3>
          <p className="mt-1 text-xs text-slate-600">
            Mulai diskusi pertama dengan mengklik tombol <strong>Buat Pertanyaan Diskusi</strong> di atas.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredTopics.map((topic) => (
            <article key={topic.id} className="dashboard-glass rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {topic.disematkan && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                        <Pin size={10} aria-hidden="true" /> Disematkan
                      </span>
                    )}
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-extrabold ${
                        topic.kategori === "PENGUMUMAN"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : topic.kategori === "KELAS"
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {topic.kategori === "PENGUMUMAN"
                        ? "Pengumuman"
                        : topic.kategori === "KELAS"
                          ? "Diskusi Kelas"
                          : "Forum Umum"}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        topic.penulisPeran === "GURU"
                          ? "bg-sky-100 text-sky-800"
                          : topic.penulisPeran === "ADMIN"
                            ? "bg-violet-100 text-violet-800"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {topic.penulisPeran === "GURU" ? "Tutor" : topic.penulisPeran === "ADMIN" ? "Admin PKBM" : "Siswa"} · {topic.penulisNama}
                    </span>
                    {topic.ditutup && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        <Lock size={10} aria-hidden="true" /> Ditutup
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">{topic.judul}</h3>
                </div>
                <span className="text-[11px] font-medium text-slate-500">{formatWib(topic.createdAt)}</span>
              </div>

              <p className="mt-2.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                {topic.isi}
              </p>

              {/* Replies */}
              <div className="mt-4 space-y-2.5 border-t border-slate-200/80 pt-3.5">
                <p className="text-xs font-extrabold text-slate-600">
                  Balasan ({topic.balasan.length})
                </p>
                {topic.balasan.length > 0 && (
                  <ul className="space-y-2">
                    {topic.balasan.map((reply) => (
                      <li key={reply.id} className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-extrabold text-slate-900">
                            {reply.penulisNama}{" "}
                            <span className="font-semibold text-indigo-600">
                              ({reply.penulisPeran === "GURU" ? "Tutor" : reply.penulisPeran === "ADMIN" ? "Admin" : "Siswa"})
                            </span>
                          </span>
                          <span className="text-[10px] text-slate-500">{formatWib(reply.createdAt)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{reply.isi}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {!topic.ditutup && (
                  <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                    <input
                      maxLength={2000}
                      value={replyDrafts[topic.id] ?? ""}
                      onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [topic.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleReply(topic.id);
                        }
                      }}
                      placeholder="Tulis balasan atau komentar Anda..."
                      className="glass-input flex-1 rounded-xl px-3.5 py-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={replyBusyId === topic.id || !(replyDrafts[topic.id] ?? "").trim()}
                      onClick={() => void handleReply(topic.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Send size={13} aria-hidden="true" />
                      {replyBusyId === topic.id ? "Mengirim..." : "Balas"}
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================================
 * 2. UJIAN ONLINE (CBT) SISWA (Token + Timer + Soal A-E + Riwayat Nilai)
 * ==========================================================================*/
function StudentCbtSection({
  sandboxRole,
  onGoToDiscussion,
  onGoToProfile,
}: {
  sandboxRole?: "SISWA";
  onGoToDiscussion: () => void;
  onGoToProfile: () => void;
}) {
  const [data, setData] = useState<StudentExamListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ExamCategory>("SEMUA");
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [startingId, setStartingId] = useState<string | null>(null);
  const [activeExam, setActiveExam] = useState<ActiveCbtSession | null>(null);

  const loadExams = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithTimeout("/api/lms/ujian/saya", {
        signal,
        ...(sandboxRole ? { headers: { "X-Dev-Sandbox-Role": sandboxRole } } : {}),
      });
      const body = (await res.json().catch(() => null)) as StudentExamListPayload | null;
      if (!res.ok || !body) {
        throw new Error(body?.error || "Daftar ujian CBT belum dapat dimuat.");
      }
      setData(body);
    } catch (failure: unknown) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Daftar ujian CBT belum dapat dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [sandboxRole]);

  useEffect(() => {
    const controller = new AbortController();
    void loadExams(controller.signal);
    return () => controller.abort();
  }, [loadExams]);

  async function handleStartExam(exam: StudentExamItem) {
    const enteredToken = (tokens[exam.id] ?? "").trim().toUpperCase();
    const hasStartedBefore = Boolean(exam.percobaan[0] && !exam.percobaan[0].dikumpulkanPada);
    if (exam.butuhToken && !hasStartedBefore && !enteredToken) {
      setError(`Masukkan token ujian untuk "${exam.judul}" terlebih dahulu.`);
      return;
    }

    setStartingId(exam.id);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(`/api/lms/ujian/${encodeURIComponent(exam.id)}/mulai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
        },
        body: JSON.stringify({ token: enteredToken }),
      });
      const body = (await res.json().catch(() => null)) as (ActiveCbtSession & { error?: string }) | null;
      if (!res.ok || !body || !Array.isArray(body.soal) || body.soal.length === 0) {
        throw new Error(body?.error || "Ujian belum dapat dimulai saat ini.");
      }
      setActiveExam(body);
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Ujian belum dapat dimulai."));
    } finally {
      setStartingId(null);
    }
  }

  const allExams = data?.rows ?? [];
  const filteredExams = useMemo(() => {
    if (categoryFilter === "SEMUA") return allExams;
    return allExams.filter((item) => detectExamCategory(item) === categoryFilter);
  }, [allExams, categoryFilter]);

  const completedExams = useMemo(
    () => allExams.filter((item) => Boolean(item.percobaan[0]?.dikumpulkanPada)),
    [allExams],
  );

  if (activeExam) {
    return (
      <StudentCbtRunner
        exam={activeExam}
        sandboxRole={sandboxRole}
        onExit={() => setActiveExam(null)}
        onSubmitted={(score) => {
          setActiveExam(null);
          setNotice(
            typeof score === "number"
              ? `Ujian berhasil dikumpulkan! Nilai Anda: ${score}.`
              : "Ujian berhasil dikumpulkan. Hasil nilai dapat dilihat pada riwayat ujian.",
          );
          void loadExams();
        }}
      />
    );
  }

  return (
    <section className="space-y-5">
      <div className="dashboard-glass rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">COMPUTER BASED TEST (CBT)</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-900">Ujian Online (CBT)</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Kerjakan Latihan, UTS, UAS, dan Ujian Akhir (UPK) secara daring lengkap dengan token akses dan timer otomatis.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadExams()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Perbarui Daftar
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {([
            { id: "SEMUA", label: "Semua Ujian" },
            { id: "LATIHAN", label: "Latihan" },
            { id: "UTS", label: "UTS" },
            { id: "UAS", label: "UAS" },
            { id: "UJIAN_AKHIR", label: "Ujian Akhir / UPK" },
          ] as const).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                categoryFilter === cat.id
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
            {notice}
          </p>
        )}
      </div>

      {loading && !data ? (
        <CardGridSkeleton count={3} columns={2} />
      ) : data?.belumDitempatkan ? (
        <div className="dashboard-glass rounded-3xl border border-amber-200 bg-amber-50/70 p-6 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <GraduationCap size={24} aria-hidden="true" />
          </span>
          <h3 className="mt-3 text-base font-extrabold text-amber-950">Anda Belum Ditempatkan di Kelas Aktif</h3>
          <p className="mx-auto mt-1.5 max-w-lg text-xs leading-5 text-amber-900">
            Jadwal Ujian Online (Latihan, UTS, UAS, dan Ujian Akhir) disesuaikan dengan rombel/paket kelas Anda. Silakan lengkapi data Dapodik Anda atau hubungi Admin/Tutor PKBM untuk penempatan kelas.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onGoToProfile} className="master-primary text-xs">
              Lengkapi Profil &amp; Dapodik
            </button>
            <button
              type="button"
              onClick={onGoToDiscussion}
              className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
            >
              Buka Ruang Diskusi Umum
            </button>
          </div>
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="dashboard-glass rounded-3xl p-8 text-center">
          <ClipboardCheck size={32} className="mx-auto text-indigo-400" aria-hidden="true" />
          <h3 className="mt-3 text-base font-extrabold text-slate-900">Belum ada ujian aktif pada kategori ini</h3>
          <p className="mt-1 text-xs text-slate-600">
            Jika tutor telah mempublikasikan jadwal ujian untuk kelas <strong>{data?.kelas?.nama}</strong>, ujian akan langsung muncul di sini.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredExams.map((exam) => {
            const cat = detectExamCategory(exam);
            const catMeta = examCategoryMeta(cat);
            const attempt = exam.percobaan[0] ?? null;
            const now = Date.now();
            const startMs = Date.parse(exam.mulai);
            const endMs = Date.parse(exam.selesai);
            const isFinished = Boolean(attempt?.dikumpulkanPada);
            const isOngoing = !Number.isNaN(startMs) && !Number.isNaN(endMs) && now >= startMs && now <= endMs;
            const isUpcoming = !Number.isNaN(startMs) && now < startMs;
            const isInProgress = Boolean(attempt && !attempt.dikumpulkanPada);
            const finalScore = attempt ? (attempt.nilaiOverride ?? attempt.nilai) : null;

            return (
              <article key={exam.id} className="dashboard-glass flex flex-col justify-between gap-4 rounded-3xl p-5">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-extrabold ${catMeta.cls}`}>
                        {catMeta.label}
                      </span>
                      <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {exam.mapel.nama}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                        isFinished
                          ? "bg-emerald-100 text-emerald-800"
                          : isOngoing
                            ? "bg-indigo-100 text-indigo-800"
                            : isUpcoming
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {isFinished ? "Selesai" : isInProgress ? "Sedang Berjalan" : isOngoing ? "Tersedia Sekarang" : isUpcoming ? "Akan Datang" : "Berakhir"}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">{exam.judul}</h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Tutor: {exam.guru.nama} · {exam.jumlahSoal} soal · Durasi {exam.durasiMenit} menit · KKM {exam.kkm}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/75 px-3 py-2 text-[11px] text-slate-700">
                    <p className="flex items-center gap-1.5">
                      <Clock size={12} className="shrink-0 text-indigo-600" aria-hidden="true" />
                      <span>Mulai: {formatWib(exam.mulai)}</span>
                    </p>
                    <p className="mt-0.5 pl-4 text-slate-500">Selesai: {formatWib(exam.selesai)}</p>
                  </div>
                </div>

                <div className="border-t border-slate-200/80 pt-3">
                  {isFinished ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-xs">
                      <span className="font-bold text-emerald-900">
                        Dikumpulkan {formatShortDate(attempt?.dikumpulkanPada)}
                      </span>
                      <span className="font-extrabold text-emerald-800 tabular-nums">
                        {exam.tampilNilai || attempt?.nilaiOverride !== null
                          ? `Nilai: ${finalScore ?? "—"}`
                          : "Nilai Menunggu Publikasi"}
                      </span>
                    </div>
                  ) : isOngoing ? (
                    <div className="space-y-2.5">
                      {exam.butuhToken && !isInProgress && (
                        <label className="block text-[11px] font-bold text-slate-700">
                          Token Ujian (dari Tutor / Proktor)
                          <input
                            type="text"
                            maxLength={24}
                            value={tokens[exam.id] ?? ""}
                            onChange={(e) => setTokens((prev) => ({ ...prev, [exam.id]: e.target.value.toUpperCase() }))}
                            placeholder="Masukkan kode token ujian..."
                            className="glass-input mt-1 w-full rounded-xl px-3 py-2 font-mono text-xs uppercase tracking-widest"
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        disabled={startingId === exam.id || exam.jumlahSoal === 0}
                        onClick={() => void handleStartExam(exam)}
                        className="master-primary w-full py-2.5 text-xs disabled:opacity-50"
                      >
                        {startingId === exam.id
                          ? "Memuat Soal CBT..."
                          : exam.jumlahSoal === 0
                            ? "Soal Belum Tersedia"
                            : isInProgress
                              ? "Lanjutkan Mengerjakan Ujian"
                              : "Mulai Kerjakan Ujian"}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-slate-500">
                      {isUpcoming ? "Tombol mulai akan aktif saat waktu ujian dimulai." : "Waktu pengerjaan ujian telah berakhir."}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Riwayat Nilai Ujian */}
      {completedExams.length > 0 && (
        <div className="dashboard-glass rounded-3xl p-5 sm:p-6">
          <h3 className="text-base font-extrabold text-slate-900">Riwayat Nilai Ujian CBT</h3>
          <p className="mt-0.5 text-xs text-slate-600">Rekap seluruh ujian daring yang telah Anda selesaikan.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 pr-3">Ujian</th>
                  <th className="py-2.5 pr-3">Mapel</th>
                  <th className="py-2.5 pr-3">Selesai</th>
                  <th className="py-2.5 pr-3">KKM</th>
                  <th className="py-2.5 text-right">Nilai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {completedExams.map((exam) => {
                  const attempt = exam.percobaan[0];
                  const nilai = exam.tampilNilai || attempt?.nilaiOverride !== null
                    ? (attempt?.nilaiOverride ?? attempt?.nilai)
                    : null;
                  const tuntas = typeof nilai === "number" && nilai >= exam.kkm;
                  return (
                    <tr key={exam.id}>
                      <td className="py-2.5 pr-3 font-bold text-slate-900">{exam.judul}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{exam.mapel.nama}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{formatShortDate(attempt?.dikumpulkanPada)}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-slate-600">{exam.kkm}</td>
                      <td className="py-2.5 text-right">
                        {typeof nilai === "number" ? (
                          <span
                            className={`inline-flex rounded-lg px-2 py-0.5 font-extrabold tabular-nums ${
                              tuntas ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {nilai}
                          </span>
                        ) : (
                          <span className="text-slate-400">Menunggu</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* Fullscreen Distraction-Free CBT Runner supporting A-E options + Timer + Draft Auto-Save */
function StudentCbtRunner({
  exam,
  sandboxRole,
  onExit,
  onSubmitted,
}: {
  exam: ActiveCbtSession;
  sandboxRole?: "SISWA";
  onExit: () => void;
  onSubmitted: (score: number | null) => void;
}) {
  const confirm = useGlassConfirm();
  const theme = useTenantTheme();
  const storageKey = `cbt:${exam.id}:${exam.siswaId}`;

  const [answers, setAnswers] = useState<Record<string, CbtChoice>>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const valid: Record<string, CbtChoice> = {};
      for (const [qId, val] of Object.entries(raw)) {
        if (typeof val === "string" && isValidChoice(val) && exam.soal.some((q) => q.id === qId)) {
          valid[qId] = val;
        }
      }
      return valid;
    } catch {
      return {};
    }
  });
  const [index, setIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, new Date(exam.deadline).getTime() - Date.now()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const autoSubmittedRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const submitExamPayload = useCallback(async (isAutoSubmit: boolean) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetchWithTimeout(
        `/api/lms/ujian/${encodeURIComponent(exam.id)}/kumpulkan`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
          },
          body: JSON.stringify({ jawaban: answersRef.current, autoSubmit: isAutoSubmit }),
        },
        30_000,
      );
      const body = (await res.json().catch(() => null)) as { success?: boolean; nilai?: number | null; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Ujian belum dapat dikumpulkan.");
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore
      }
      onSubmitted(typeof body?.nilai === "number" ? body.nilai : null);
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Pengumpulan ujian gagal. Draf Anda tetap tersimpan di perangkat."));
    } finally {
      setBusy(false);
    }
  }, [exam.id, onSubmitted, sandboxRole, storageKey]);

  useEffect(() => {
    const deadlineMs = new Date(exam.deadline).getTime();
    if (deadlineMs <= Date.now()) {
      setRemainingMs(0);
      return;
    }
    const timer = window.setInterval(() => {
      const next = Math.max(0, deadlineMs - Date.now());
      setRemainingMs(next);
      if (next <= 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [exam.deadline]);

  useEffect(() => {
    if (remainingMs === 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      void submitExamPayload(true);
    }
  }, [remainingMs, submitExamPayload]);

  function selectOption(questionId: string, kode: CbtChoice) {
    const next = { ...answers, [questionId]: kode };
    setAnswers(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  }

  async function handleSubmit() {
    if (busy) return;
    const unanswered = exam.soal.length - Object.keys(answers).length;
    const confirmed = await confirm(
      unanswered > 0
        ? `Kumpulkan ujian sekarang? Masih ada ${unanswered} soal yang belum dijawab.`
        : "Semua soal sudah terjawab. Kumpulkan ujian sekarang?",
    );
    if (!confirmed) return;
    autoSubmittedRef.current = true;
    await submitExamPayload(false);
  }

  const question = exam.soal[index];
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const lowTime = totalSeconds > 0 && totalSeconds <= 300;

  return createPortal(
    <div data-tenant-theme={theme} className="fixed inset-0 z-[60]">
      <div className="dashboard-canvas glass-area min-h-full text-slate-800">
        <div className="exam-focus fixed inset-0 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 p-4 pb-10 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <button type="button" disabled={busy} onClick={onExit} className="text-sm font-bold text-indigo-700 underline">
                ← Kembali ke Daftar Ujian
              </button>
              <span
                role="timer"
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-sm font-extrabold tabular-nums ${
                  lowTime ? "bg-rose-100 text-rose-800" : "bg-indigo-100 text-indigo-800"
                }`}
              >
                <Clock size={14} aria-hidden="true" />
                {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
              </span>
            </div>

            <div className="dashboard-glass rounded-3xl p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{exam.judul}</p>
                  <p className="mt-0.5 text-sm font-extrabold text-slate-900">
                    Soal {index + 1} dari {exam.soal.length}
                  </p>
                </div>
                <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
                  Terjawab: {Object.keys(answers).length}/{exam.soal.length}
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 transition-all"
                  style={{ width: `${((index + 1) / exam.soal.length) * 100}%` }}
                />
              </div>

              {question && (
                <div key={question.id} className="mt-6">
                  <p className="whitespace-pre-wrap text-base font-semibold leading-relaxed text-slate-900 sm:text-lg">
                    {question.teks}
                  </p>
                  <div className="mt-5 space-y-2.5">
                    {question.opsi.map((opt) => {
                      const code = opt.kode.toUpperCase();
                      const selected = answers[question.id] === code;
                      return (
                        <button
                          key={opt.kode}
                          type="button"
                          aria-pressed={selected}
                          disabled={busy || remainingMs <= 0}
                          onClick={() => {
                            if (isValidChoice(code)) selectOption(question.id, code);
                          }}
                          className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left text-sm transition ${
                            selected
                              ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-950 shadow-2xs"
                              : "border-slate-200 bg-white/85 text-slate-800 hover:border-indigo-200 hover:bg-white"
                          }`}
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                              selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {code}
                          </span>
                          <span className="flex-1 whitespace-pre-wrap">{opt.teks}</span>
                          {selected && <CheckCircle2 size={18} className="shrink-0 text-indigo-600" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
                {error}
              </p>
            )}
            {remainingMs <= 0 && (
              <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                Waktu pengerjaan ujian telah habis. Hubungi tutor atau proktor apabila Anda belum sempat mengumpulkan.
              </p>
            )}

            <div className="sticky bottom-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/70 bg-white/95 p-3 shadow-xl backdrop-blur-xl">
              <button
                type="button"
                disabled={index === 0 || busy}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="rounded-xl px-3 py-2 text-xs font-bold text-indigo-700 disabled:opacity-40"
              >
                ← Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="rounded-xl bg-indigo-50 px-3.5 py-2 text-xs font-extrabold text-indigo-800"
              >
                Navigasi Soal ({Object.keys(answers).length}/{exam.soal.length})
              </button>
              {index === exam.soal.length - 1 ? (
                <button
                  type="button"
                  disabled={busy || remainingMs <= 0}
                  onClick={() => void handleSubmit()}
                  className="master-primary px-4 py-2 text-xs disabled:opacity-50"
                >
                  {busy ? "Mengumpulkan..." : "Selesai & Kumpulkan"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.min(exam.soal.length - 1, i + 1))}
                  className="master-primary px-4 py-2 text-xs"
                >
                  Selanjutnya →
                </button>
              )}
            </div>

            {drawerOpen && (
              <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4">
                <div role="dialog" aria-modal="true" aria-label="Navigasi nomor soal" className="w-full max-w-xl rounded-t-3xl bg-white p-5 text-slate-900 shadow-2xl sm:rounded-3xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold">Navigasi Nomor Soal</h3>
                    <button type="button" onClick={() => setDrawerOpen(false)} className="text-xs font-bold text-indigo-700">
                      Tutup
                    </button>
                  </div>
                  <div className="mt-4 grid max-h-64 grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-8">
                    {exam.soal.map((q, i) => {
                      const answered = Boolean(answers[q.id]);
                      const current = i === index;
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => {
                            setIndex(i);
                            setDrawerOpen(false);
                          }}
                          className={`rounded-xl py-2.5 text-xs font-extrabold transition ${
                            current
                              ? "bg-indigo-600 text-white"
                              : answered
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ============================================================================
 * 3. NILAI & TRANSKRIP SEMENTARA SISWA
 * ==========================================================================*/
function StudentGradesTranscriptSection({
  sandboxRole,
  fallbackName,
  fallbackSchool,
  fallbackKelas,
}: {
  sandboxRole?: "SISWA";
  fallbackName: string;
  fallbackSchool: string;
  fallbackKelas: string | null;
}) {
  const [data, setData] = useState<StudentGradesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadGrades = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithTimeout("/api/lms/siswa/nilai", {
        signal,
        ...(sandboxRole ? { headers: { "X-Dev-Sandbox-Role": sandboxRole } } : {}),
      });
      const body = (await res.json().catch(() => null)) as StudentGradesPayload | null;
      if (!res.ok || !body) {
        throw new Error(body?.error || "Rekap nilai dan transkrip belum dapat dimuat.");
      }
      setData(body);
    } catch (failure: unknown) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Rekap nilai dan transkrip belum dapat dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [sandboxRole]);

  useEffect(() => {
    const controller = new AbortController();
    void loadGrades(controller.signal);
    return () => controller.abort();
  }, [loadGrades]);

  if (loading && !data) {
    return <CardGridSkeleton count={4} columns={2} />;
  }

  const siswaNama = data?.siswa.nama || fallbackName;
  const siswaNisn = data?.siswa.nisn || "—";
  const kelasDisplay = data?.siswa.kelasNama || fallbackKelas || "Belum ditempatkan";
  const sekolahNama = data?.sekolah?.nama || fallbackSchool;

  return (
    <section className="space-y-5">
      {/* Print-Only Formal Header */}
      <div className="hidden border-b-2 border-slate-900 pb-4 text-center print:block">
        <p className="text-xs font-bold uppercase tracking-widest">TRANSKRIP NILAI SEMENTARA PENDIDIKAN KESETARAAN</p>
        <h1 className="mt-1 text-xl font-black uppercase">{sekolahNama}</h1>
        {data?.sekolah?.npsn && <p className="text-xs">NPSN: {data.sekolah.npsn}</p>}
        {data?.sekolah?.alamat && <p className="text-xs">{data.sekolah.alamat}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-300 pt-3 text-left text-xs">
          <p><strong>Nama Warga Belajar:</strong> {siswaNama}</p>
          <p><strong>NISN:</strong> {siswaNisn}</p>
          <p><strong>Kelas / Program:</strong> {kelasDisplay}</p>
          <p><strong>Tanggal Cetak:</strong> {formatShortDate(new Date().toISOString())}</p>
        </div>
      </div>

      {/* Screen Header & Print CTA */}
      <div className="dashboard-glass rounded-3xl p-5 print:hidden sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">CAPAIAN HASIL BELAJAR &amp; SKK</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-900">Nilai &amp; Transkrip Sementara</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Rekap nilai tugas, hasil ujian CBT, nilai raport kesetaraan, serta capaian Satuan Kredit Kompetensi (SKK).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadGrades()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="master-primary inline-flex items-center gap-1.5 text-xs"
            >
              <Printer size={14} aria-hidden="true" />
              Cetak / Unduh Transkrip Sementara
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
            {error}
          </p>
        )}

        {/* 4 Summary Cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Rata-rata Raport</p>
            <p className="mt-1 text-2xl font-black text-indigo-950 tabular-nums">{data?.summary.rataRaport ?? "—"}</p>
            <p className="mt-0.5 text-[11px] text-indigo-700/80">{data?.raport.length ?? 0} mapel tercatat</p>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Rata-rata Ujian CBT</p>
            <p className="mt-1 text-2xl font-black text-sky-950 tabular-nums">{data?.summary.rataUjian ?? "—"}</p>
            <p className="mt-0.5 text-[11px] text-sky-700/80">{data?.summary.totalUjianSelesai ?? 0} ujian selesai</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Rata-rata Tugas</p>
            <p className="mt-1 text-2xl font-black text-emerald-950 tabular-nums">{data?.summary.rataTugas ?? "—"}</p>
            <p className="mt-0.5 text-[11px] text-emerald-700/80">{data?.summary.totalTugasDinilai ?? 0} tugas dinilai</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Beban / Capaian SKK</p>
            <p className="mt-1 text-2xl font-black text-amber-950 tabular-nums">{data?.summary.totalSkk ?? 0} SKK</p>
            <p className="mt-0.5 text-[11px] text-amber-800/80">{data?.modulSkk.length ?? 0} modul kesetaraan</p>
          </div>
        </div>
      </div>

      {/* Nilai Raport / Mapel */}
      <div className="dashboard-glass rounded-3xl p-5 print:border print:border-slate-300 print:shadow-none sm:p-6">
        <div className="flex items-center gap-2">
          <Award size={18} className="text-indigo-600 print:hidden" aria-hidden="true" />
          <h3 className="text-base font-extrabold text-slate-900">Nilai Mata Pelajaran &amp; E-Raport</h3>
        </div>
        {(data?.raport.length ?? 0) === 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Nilai raport resmi per mata pelajaran belum dipublikasikan oleh wali kelas/admin.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 pr-3">Mata Pelajaran</th>
                  <th className="py-2.5 pr-3">Periode</th>
                  <th className="py-2.5 pr-3 text-right">Mandiri</th>
                  <th className="py-2.5 pr-3 text-right">Simulasi</th>
                  <th className="py-2.5 pr-3 text-right">Nilai Akhir</th>
                  <th className="py-2.5 text-center">Predikat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data!.raport.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 pr-3 font-bold text-slate-900">
                      {row.mapel}
                      {row.catatanKompetensi && <p className="mt-0.5 text-[11px] font-normal text-slate-500">{row.catatanKompetensi}</p>}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{row.tahunAjaran}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">{row.nilaiMandiri}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">{row.nilaiSimulasi}</td>
                    <td className="py-2.5 pr-3 text-right font-extrabold tabular-nums text-slate-900">{row.nilaiAkhir}</td>
                    <td className="py-2.5 text-center">
                      <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 font-extrabold text-indigo-800">
                        {row.predikat}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rekap Tugas & Ujian */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="dashboard-glass rounded-3xl p-5 print:border print:border-slate-300 print:shadow-none">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-emerald-600 print:hidden" aria-hidden="true" />
            <h3 className="text-sm font-extrabold text-slate-900">Rekap Nilai Tugas ({data?.tugas.length ?? 0})</h3>
          </div>
          {(data?.tugas.length ?? 0) === 0 ? (
            <p className="mt-3 text-xs text-slate-500">Belum ada tugas yang dikumpulkan.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 text-xs">
              {data!.tugas.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{item.judul}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.mapel} · Dikumpulkan {formatShortDate(item.dikumpulkanPada)}
                    </p>
                    {item.catatanGuru && <p className="mt-0.5 text-[11px] text-slate-600">Catatan: {item.catatanGuru}</p>}
                  </div>
                  <span className="shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1 font-extrabold tabular-nums text-emerald-800">
                    {item.nilai !== null ? item.nilai : "Proses"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dashboard-glass rounded-3xl p-5 print:border print:border-slate-300 print:shadow-none">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={16} className="text-sky-600 print:hidden" aria-hidden="true" />
            <h3 className="text-sm font-extrabold text-slate-900">Rekap Nilai Ujian CBT ({data?.ujian.length ?? 0})</h3>
          </div>
          {(data?.ujian.length ?? 0) === 0 ? (
            <p className="mt-3 text-xs text-slate-500">Belum ada riwayat pengerjaan ujian CBT.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 text-xs">
              {data!.ujian.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{item.judul}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.mapel} · KKM {item.kkm} · {formatShortDate(item.dikumpulkanPada)}
                    </p>
                    {item.catatanGuru && <p className="mt-0.5 text-[11px] text-slate-600">Catatan: {item.catatanGuru}</p>}
                  </div>
                  <span
                    className={`shrink-0 rounded-lg px-2.5 py-1 font-extrabold tabular-nums ${
                      typeof item.nilai === "number" && item.nilai >= item.kkm
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-sky-50 text-sky-800"
                    }`}
                  >
                    {item.nilai !== null ? item.nilai : item.status === "SELESAI" ? "Menunggu" : "Berjalan"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Capaian SKK Modul Kesetaraan */}
      {(data?.modulSkk.length ?? 0) > 0 && (
        <div className="dashboard-glass rounded-3xl p-5 print:border print:border-slate-300 print:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-600 print:hidden" aria-hidden="true" />
              <h3 className="text-sm font-extrabold text-slate-900">Struktur Modul &amp; Capaian SKK Kesetaraan</h3>
            </div>
            <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-900 tabular-nums">
              Total {data!.summary.totalSkk} SKK
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data!.modulSkk.map((m) => (
              <div key={m.id} className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold text-indigo-700">{m.kodeModul}</span>
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800">
                    {m.skkTotal} SKK
                  </span>
                </div>
                <p className="mt-1 font-bold text-slate-900">{m.judulModul}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {m.tingkatan} · {m.kelompok}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Catatan Wali Kelas & Print Signature */}
      {data?.catatanRaport?.catatanWali && (
        <div className="dashboard-glass rounded-3xl p-5 print:border print:border-slate-300 print:shadow-none">
          <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Catatan Wali Kelas / Tutor</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">{data.catatanRaport.catatanWali}</p>
        </div>
      )}

      <div className="hidden justify-end pt-8 text-center text-xs print:flex">
        <div className="w-64">
          <p>Mengetahui,</p>
          <p className="font-bold">Kepala {sekolahNama}</p>
          <div className="h-16" />
          <p className="font-bold underline">{data?.sekolah?.kepalaSekolah || "__________________________"}</p>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-slate-500 print:hidden">
        <ShieldCheck size={13} className="text-emerald-600" aria-hidden="true" />
        Transkrip ini bersifat sementara dan dihasilkan langsung dari data pembelajaran resmi {sekolahNama}.
      </p>
    </section>
  );
}
