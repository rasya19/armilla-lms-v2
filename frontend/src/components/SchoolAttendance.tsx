import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { DashboardHero, EmptyState, TableSkeleton } from "./DashboardUI";
import { useTenantTheme } from "./TenantThemeProvider";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

export type PresensiStatus = "HADIR" | "IZIN" | "SAKIT" | "ALPA";

export type CalendarDaySummary = {
  totalSiswa: number;
  terisi: number;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
};

export type AttendanceStudentRow = {
  id: string;
  nama: string;
  nisn: string;
  status: PresensiStatus | null;
  keterangan: string;
  waktuHadir: string | null;
  rekapBulanan: { HADIR: number; IZIN: number; SAKIT: number; ALPA: number };
};

export type AttendanceSheetPayload = {
  kelas: Array<{ id: string; nama: string; isWali: boolean }>;
  selectedKelasId: string | null;
  tanggal: string;
  bulan: string;
  today?: string;
  kalenderBulanan?: Record<string, CalendarDaySummary>;
  siswa: AttendanceStudentRow[];
};

const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const WEEKDAY_SHORT_ID = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const STATUS_OPTIONS: Array<{
  code: PresensiStatus;
  label: string;
  activeLight: string;
  activeDark: string;
}> = [
  {
    code: "HADIR",
    label: "Hadir",
    activeLight: "border-emerald-600 bg-emerald-600 text-white shadow-xs",
    activeDark: "border-emerald-500 bg-emerald-500 text-slate-950 font-extrabold",
  },
  {
    code: "IZIN",
    label: "Izin",
    activeLight: "border-sky-600 bg-sky-600 text-white shadow-xs",
    activeDark: "border-sky-400 bg-sky-400 text-slate-950 font-extrabold",
  },
  {
    code: "SAKIT",
    label: "Sakit",
    activeLight: "border-amber-500 bg-amber-500 text-white shadow-xs",
    activeDark: "border-amber-400 bg-amber-400 text-slate-950 font-extrabold",
  },
  {
    code: "ALPA",
    label: "Alpa",
    activeLight: "border-rose-600 bg-rose-600 text-white shadow-xs",
    activeDark: "border-rose-500 bg-rose-500 text-white font-extrabold",
  },
];

function getJakartaTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "01";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatLongIndonesianDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateObj);
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y || 2026, (m || 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildCalendarCells(ym: string): Array<{ iso: string; day: number } | null> {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return [];
  const firstDay = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Monday = 0 ... Sunday = 6
  const startOffset = (firstDay.getUTCDay() + 6) % 7;
  const cells: Array<{ iso: string; day: number } | null> = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ iso, day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function escapeCsv(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function sandboxHeaders(sandboxRole?: "GURU", extra?: Record<string, string>): Record<string, string> | undefined {
  if (!sandboxRole && !extra) return undefined;
  return {
    ...(extra ?? {}),
    ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
  };
}

export function SchoolAttendance({
  role,
  sandboxRole,
  onOpenClassroom,
}: {
  role: "ADMIN" | "GURU";
  sandboxRole?: "GURU";
  onOpenClassroom?: () => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const initialToday = useMemo(() => getJakartaTodayIso(), []);
  const [kelasId, setKelasId] = useState("");
  const [tanggal, setTanggal] = useState(initialToday);
  const [displayMonth, setDisplayMonth] = useState(initialToday.slice(0, 7));
  const [data, setData] = useState<AttendanceSheetPayload | null>(null);
  const [draftStatuses, setDraftStatuses] = useState<Record<string, PresensiStatus | null>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const baseEndpoint = role === "ADMIN" ? "/api/sekolah/presensi" : "/api/lms/guru/presensi";

  const syncDraftFromPayload = useCallback((payload: AttendanceSheetPayload) => {
    const nextStatuses: Record<string, PresensiStatus | null> = {};
    const nextNotes: Record<string, string> = {};
    for (const student of payload.siswa) {
      nextStatuses[student.id] = student.status;
      nextNotes[student.id] = student.keterangan ?? "";
    }
    setDraftStatuses(nextStatuses);
    setDraftNotes(nextNotes);
  }, []);

  const loadPresensi = useCallback(
    async (nextKelasId: string, nextTanggal: string, nextBulan: string, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (nextKelasId) params.set("kelasId", nextKelasId);
        if (nextTanggal) params.set("tanggal", nextTanggal);
        if (nextBulan) params.set("bulan", nextBulan);
        const headers = sandboxHeaders(sandboxRole);
        const res = await fetchWithTimeout(`${baseEndpoint}?${params.toString()}`, {
          signal,
          ...(headers ? { headers } : {}),
        });
        const body = (await res.json()) as AttendanceSheetPayload & { error?: string };
        if (!res.ok) throw new Error(body.error || "Data presensi belum dapat dimuat.");
        setData(body);
        syncDraftFromPayload(body);
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
    [baseEndpoint, sandboxRole, syncDraftFromPayload],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadPresensi(kelasId, tanggal, displayMonth, controller.signal);
    return () => controller.abort();
  }, [kelasId, tanggal, displayMonth, loadPresensi]);

  const todayIso = data?.today ?? initialToday;

  const dirtyCount = useMemo(() => {
    if (!data) return 0;
    let count = 0;
    for (const s of data.siswa) {
      const currentStatus = draftStatuses[s.id] ?? null;
      const currentNote = (draftNotes[s.id] ?? "").trim();
      const origNote = (s.keterangan ?? "").trim();
      if (currentStatus !== s.status || currentNote !== origNote) {
        count += 1;
      }
    }
    return count;
  }, [data, draftStatuses, draftNotes]);

  const filledCount = useMemo(() => {
    if (!data) return 0;
    return data.siswa.filter((s) => Boolean(draftStatuses[s.id])).length;
  }, [data, draftStatuses]);

  const summary = useMemo(() => {
    const list = data?.siswa ?? [];
    let hadir = 0;
    let izin = 0;
    let sakit = 0;
    let alpa = 0;
    let belum = 0;
    for (const s of list) {
      const st = draftStatuses[s.id] ?? null;
      if (st === "HADIR") hadir += 1;
      else if (st === "IZIN") izin += 1;
      else if (st === "SAKIT") sakit += 1;
      else if (st === "ALPA") alpa += 1;
      else belum += 1;
    }
    return { total: list.length, hadir, izin, sakit, alpa, belum };
  }, [data, draftStatuses]);

  function handleSelectDate(iso: string) {
    setTanggal(iso);
    setDisplayMonth(iso.slice(0, 7));
    setNotice("");
    setError("");
  }

  function handleShiftMonth(delta: number) {
    const nextMonth = shiftMonth(displayMonth, delta);
    setDisplayMonth(nextMonth);
    setNotice("");
  }

  function handleJumpToday() {
    setTanggal(todayIso);
    setDisplayMonth(todayIso.slice(0, 7));
    setNotice("");
  }

  function handleMarkAllPresent() {
    if (!data?.siswa.length) return;
    setDraftStatuses((prev) => {
      const next = { ...prev };
      for (const s of data.siswa) {
        next[s.id] = "HADIR";
      }
      return next;
    });
    setNotice(
      "Seluruh siswa di kelas ini ditandai Hadir pada draf. Ubah status siswa yang Sakit/Izin/Alpa bila perlu, lalu klik Simpan Presensi.",
    );
    setError("");
  }

  async function handleSaveBatch() {
    const activeKelasId = data?.selectedKelasId ?? kelasId;
    if (!activeKelasId || !data?.siswa.length) return;
    const entries = data.siswa
      .map((s) => ({
        siswaId: s.id,
        status: draftStatuses[s.id] ?? null,
        keterangan: (draftNotes[s.id] ?? "").trim(),
      }))
      .filter((e): e is { siswaId: string; status: PresensiStatus; keterangan: string } => e.status !== null);

    if (entries.length === 0) {
      setError("Pilih status kehadiran minimal 1 siswa (atau klik Tandai Semua Hadir) sebelum menyimpan.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(`${baseEndpoint}/batch`, {
        method: "POST",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          kelasId: activeKelasId,
          tanggal,
          entries,
        }),
      });
      const body = (await res.json()) as { savedCount?: number; message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Presensi belum dapat disimpan.");
      setNotice(body.message || `Presensi ${entries.length} siswa untuk ${formatLongIndonesianDate(tanggal)} berhasil disimpan.`);
      await loadPresensi(activeKelasId, tanggal, displayMonth);
    } catch (failure) {
      setError(describeFetchError(failure, "Presensi siswa belum dapat disimpan."));
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    if (!data?.siswa.length) return;
    const kelasNama = data.kelas.find((k) => k.id === data.selectedKelasId)?.nama ?? "Kelas";
    const lines = [
      [
        "No",
        "NISN",
        "Nama Siswa",
        `Status (${data.tanggal})`,
        "Keterangan",
        "Hadir (Bulan)",
        "Izin (Bulan)",
        "Sakit (Bulan)",
        "Alpa (Bulan)",
      ]
        .map(escapeCsv)
        .join(","),
      ...data.siswa.map((s, idx) =>
        [
          idx + 1,
          s.nisn,
          s.nama,
          draftStatuses[s.id] ?? "BELUM DIISI",
          draftNotes[s.id] ?? "",
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

  const calendarCells = useMemo(() => buildCalendarCells(displayMonth), [displayMonth]);
  const [monthYearNum, monthNum] = displayMonth.split("-").map(Number);
  const monthLabel = `${MONTH_NAMES_ID[(monthNum || 1) - 1] ?? "Bulan"} ${monthYearNum || ""}`;
  const calendarData = data?.kalenderBulanan ?? {};

  const panelSurface = isDark
    ? "rounded-2xl border border-slate-700/70 bg-slate-900/75 text-slate-100"
    : "rounded-2xl border border-slate-200/80 bg-white/95 text-slate-900 shadow-xs";

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-5 sm:p-6">
      <DashboardHero
        eyebrow="KEHADIRAN WARGA BELAJAR"
        title={role === "ADMIN" ? "Presensi Warga Belajar" : "Presensi Siswa & Kalender Kehadiran"}
        description="Pilih tanggal langsung pada kalender bulanan untuk melihat atau mengedit daftar hadir siswa, termasuk presensi otomatis dari Login Daring."
        action={
          <div className="flex flex-wrap gap-2">
            {onOpenClassroom && (
              <button
                type="button"
                onClick={onOpenClassroom}
                className="dashboard-hero-action dashboard-hero-secondary whitespace-nowrap"
              >
                <ClipboardCheck size={15} aria-hidden="true" />
                Ruang KBM
              </button>
            )}
            <button
              type="button"
              disabled={!data?.siswa.length}
              onClick={exportCsv}
              className="dashboard-hero-action whitespace-nowrap disabled:opacity-50"
            >
              <Download size={15} aria-hidden="true" />
              Ekspor CSV
            </button>
          </div>
        }
      />

      {/* Baris Pilihan Kelas & Ringkasan Harian */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-bold">
          Pilih Kelas / Rombel
          <select
            value={data?.selectedKelasId ?? kelasId}
            onChange={(e) => {
              setKelasId(e.target.value);
              setNotice("");
            }}
            className="glass-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
          >
            {!data?.kelas.length && <option value="">Belum ada kelas</option>}
            {data?.kelas.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
                {k.isWali ? " (Wali Kelas)" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className={`flex items-center justify-between px-4 py-3 ${panelSurface}`}>
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Hadir
            </p>
            <p className="mt-0.5 text-xs text-slate-500">dari {summary.total} siswa</p>
          </div>
          <span className="text-2xl font-black text-emerald-600 tabular-nums">{summary.hadir}</span>
        </div>

        <div className={`flex items-center justify-between px-4 py-3 text-xs font-bold tabular-nums ${panelSurface}`}>
          <div className="text-center">
            <p className="text-[10px] uppercase text-slate-400">Izin</p>
            <p className="mt-0.5 text-lg font-black text-sky-600">{summary.izin}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase text-slate-400">Sakit</p>
            <p className="mt-0.5 text-lg font-black text-amber-600">{summary.sakit}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase text-slate-400">Alpa</p>
            <p className="mt-0.5 text-lg font-black text-rose-600">{summary.alpa}</p>
          </div>
        </div>

        <div className={`flex items-center justify-between px-4 py-3 ${panelSurface}`}>
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Belum Diabsen
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{tanggal}</p>
          </div>
          <span className={`text-2xl font-black tabular-nums ${summary.belum > 0 ? "text-amber-500" : "text-emerald-600"}`}>
            {summary.belum}
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </p>
      )}

      {/* Workspace 2 Kolom: Kalender Bulanan Interaktif + Daftar Hadir */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* KIRI: Kalender Bulanan Interaktif Gaya SIPUT PAUD */}
        <aside className={`p-4 sm:p-5 ${panelSurface}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  isDark ? "bg-amber-400/15 text-amber-300" : "bg-sky-100 text-sky-700"
                }`}
              >
                <CalendarDays size={18} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold leading-tight">{monthLabel}</h3>
                <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Klik tanggal untuk absen
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleShiftMonth(-1)}
                aria-label="Bulan sebelumnya"
                className={`rounded-lg border p-1.5 transition ${
                  isDark
                    ? "border-slate-700 bg-slate-800 text-slate-200 hover:border-amber-400/60"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={handleJumpToday}
                className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                  isDark
                    ? "border-slate-700 bg-slate-800 text-amber-300 hover:border-amber-400/60"
                    : "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
                }`}
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => handleShiftMonth(1)}
                aria-label="Bulan berikutnya"
                className={`rounded-lg border p-1.5 transition ${
                  isDark
                    ? "border-slate-700 bg-slate-800 text-slate-200 hover:border-amber-400/60"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_SHORT_ID.map((dayName) => (
              <span
                key={dayName}
                className={`py-1 text-[11px] font-extrabold uppercase ${
                  dayName === "Min"
                    ? "text-rose-500"
                    : isDark
                      ? "text-slate-400"
                      : "text-slate-500"
                }`}
              >
                {dayName}
              </span>
            ))}

            {calendarCells.map((cell, index) => {
              if (!cell) {
                return <div key={`empty-${index}`} className="h-11" aria-hidden="true" />;
              }
              const dayInfo = calendarData[cell.iso];
              const isSelected = cell.iso === tanggal;
              const isToday = cell.iso === todayIso;
              const hasRecords = Boolean(dayInfo && dayInfo.terisi > 0);
              const majorityPresent = Boolean(
                dayInfo &&
                  dayInfo.terisi > 0 &&
                  dayInfo.hadir >= Math.ceil((dayInfo.totalSiswa || dayInfo.terisi) / 2),
              );

              let dotClass = isDark ? "bg-slate-600" : "bg-slate-300";
              let statusSummaryText = "Belum diabsen";
              if (hasRecords && dayInfo) {
                dotClass = majorityPresent ? "bg-emerald-500" : "bg-amber-400";
                statusSummaryText = `Hadir ${dayInfo.hadir}, Izin ${dayInfo.izin}, Sakit ${dayInfo.sakit}, Alpa ${dayInfo.alpa}`;
              }

              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => handleSelectDate(cell.iso)}
                  title={`${cell.iso} · ${statusSummaryText}`}
                  aria-pressed={isSelected}
                  className={`relative flex h-11 flex-col items-center justify-center rounded-xl border text-xs font-bold transition ${
                    isSelected
                      ? isDark
                        ? "border-amber-400 bg-amber-400 text-slate-950 shadow-sm"
                        : "border-sky-600 bg-sky-600 text-white shadow-sm"
                      : isToday
                        ? isDark
                          ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                          : "border-emerald-500 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                        : hasRecords
                          ? isDark
                            ? "border-slate-700/80 bg-slate-800/80 text-slate-100 hover:border-slate-500"
                            : "border-slate-200 bg-slate-50/90 text-slate-900 hover:border-sky-300 hover:bg-sky-50/60"
                          : isDark
                            ? "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/50 hover:text-slate-200"
                            : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="tabular-nums leading-none">{cell.day}</span>
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-1.5 w-1.5 rounded-full ${
                      isSelected ? (hasRecords ? "bg-white" : "bg-white/60") : dotClass
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Legenda Warna Kalender */}
          <div
            className={`mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-[11px] ${
              isDark ? "border-slate-800 text-slate-300" : "border-slate-200/80 text-slate-600"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Mayoritas hadir
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              Terisi sebagian
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${isDark ? "bg-slate-600" : "bg-slate-300"}`} />
              Belum diabsen
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-emerald-500 bg-emerald-100" />
              Hari ini (WIB)
            </span>
          </div>
        </aside>

        {/* KANAN: Daftar Hadir Siswa untuk Tanggal Terpilih */}
        <div className="space-y-4">
          <div className={`flex flex-wrap items-center justify-between gap-3 p-4 ${panelSurface}`}>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-extrabold">{formatLongIndonesianDate(tanggal)}</h3>
                {tanggal === todayIso && (
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                    Hari Ini
                  </span>
                )}
              </div>
              <p className={`mt-0.5 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {dirtyCount > 0
                  ? `${dirtyCount} perubahan belum disimpan — klik Simpan Presensi untuk menerapkan.`
                  : "Klik status kehadiran per siswa atau gunakan tombol Tandai Semua Hadir."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving || !data?.siswa.length}
                onClick={handleMarkAllPresent}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition disabled:opacity-50 ${
                  isDark
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                    : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                }`}
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                {tanggal === todayIso ? "Tandai Semua Hadir (Hari Ini)" : "Tandai Semua Hadir"}
              </button>

              <button
                type="button"
                disabled={saving || filledCount === 0}
                onClick={() => void handleSaveBatch()}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold transition disabled:opacity-50 ${
                  dirtyCount > 0
                    ? "bg-sky-600 text-white shadow-sm hover:bg-sky-700"
                    : isDark
                      ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {saving ? (
                  <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Save size={14} aria-hidden="true" />
                )}
                {saving ? "Menyimpan..." : dirtyCount > 0 ? `Simpan Presensi (${dirtyCount})` : "Simpan Presensi"}
              </button>
            </div>
          </div>

          {loading && !data ? (
            <TableSkeleton rows={6} columns={3} />
          ) : !data?.kelas.length ? (
            <EmptyState
              title="Belum ada kelas tersedia"
              description={
                role === "ADMIN"
                  ? "Buat kelas terlebih dahulu di Manajemen Kelas agar presensi siswa dapat dicatat."
                  : "Anda belum ditugaskan pada jadwal mengajar atau wali kelas di lembaga ini."
              }
            />
          ) : !data.siswa.length ? (
            <EmptyState
              title="Belum ada siswa aktif pada kelas ini"
              description="Tempatkan warga belajar pada kelas terpilih terlebih dahulu untuk memulai pencatatan kehadiran."
            />
          ) : (
            <div className={`overflow-x-auto ${panelSurface}`}>
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead
                  className={
                    isDark
                      ? "border-b border-slate-800 bg-slate-950/60 text-[11px] font-extrabold uppercase tracking-wider text-slate-400"
                      : "border-b border-slate-200/80 bg-slate-50/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-600"
                  }
                >
                  <tr>
                    <th className="px-4 py-3">Warga Belajar</th>
                    <th className="px-4 py-3">Status Kehadiran</th>
                    <th className="px-4 py-3 text-center">Rekap ({displayMonth})</th>
                  </tr>
                </thead>
                <tbody className={isDark ? "divide-y divide-slate-800/80" : "divide-y divide-slate-200/70"}>
                  {data.siswa.map((student) => {
                    const currentStatus = draftStatuses[student.id] ?? null;
                    const isOnlineLogin = student.keterangan === "Login Daring" && currentStatus === "HADIR";
                    const isModified = currentStatus !== student.status;
                    return (
                      <tr
                        key={student.id}
                        className={
                          isDark
                            ? `transition hover:bg-slate-800/40 ${isModified ? "bg-amber-500/5" : ""}`
                            : `transition hover:bg-sky-50/40 ${isModified ? "bg-sky-50/40" : ""}`
                        }
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{student.nama}</p>
                            {isOnlineLogin && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                <Sparkles size={10} aria-hidden="true" />
                                Login Daring
                              </span>
                            )}
                          </div>
                          <p className={`font-mono text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            NISN {student.nisn || "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {STATUS_OPTIONS.map((opt) => {
                              const isSelected = currentStatus === opt.code;
                              return (
                                <button
                                  key={opt.code}
                                  type="button"
                                  disabled={saving}
                                  aria-pressed={isSelected}
                                  onClick={() => {
                                    setDraftStatuses((prev) => ({ ...prev, [student.id]: opt.code }));
                                    if (opt.code !== "HADIR" && draftNotes[student.id] === "Login Daring") {
                                      setDraftNotes((prev) => ({ ...prev, [student.id]: "" }));
                                    }
                                  }}
                                  className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${
                                    isSelected
                                      ? isDark
                                        ? opt.activeDark
                                        : opt.activeLight
                                      : isDark
                                        ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-center font-semibold tabular-nums ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                          H:{student.rekapBulanan.HADIR} · I:{student.rekapBulanan.IZIN} · S:{student.rekapBulanan.SAKIT} · A:{student.rekapBulanan.ALPA}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
