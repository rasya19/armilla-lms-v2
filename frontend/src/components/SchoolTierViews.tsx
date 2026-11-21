import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Award,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileSpreadsheet,
  Globe,
  Lock,
  Palette,
  RefreshCw,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { BulkClassPlacement } from "./BulkClassPlacement";
import { ClassPromotion } from "./ClassPromotion";
import { CardGridSkeleton, DashboardHero, EmptyState } from "./DashboardUI";
import { SchoolModal } from "./SchoolModal";
import { StudentImport, type StudentImportResult } from "./StudentImport";
import { isThemeKey, useTenantTheme, type ThemeKey } from "./TenantThemeProvider";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { ensureStandardClasses } from "./standardClasses";
import { getPlanBySlug, SUBSCRIPTION_PLANS, type PlanSlug } from "./subscriptionPlans";
import { deriveTenantSlugFromHost, saveCachedTenantProfile } from "./authSessionCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

export function UpgradePlanModal({
  featureName,
  requiredPlan,
  currentPlan,
  refreshing,
  onRefreshPlan,
  onClose,
}: {
  featureName: string;
  requiredPlan: Exclude<PlanSlug, "basic">;
  currentPlan: PlanSlug;
  refreshing?: boolean;
  onRefreshPlan?: () => void;
  onClose: () => void;
}) {
  const target = getPlanBySlug(requiredPlan);
  const current = getPlanBySlug(currentPlan);

  return (
    <SchoolModal
      title={`Fitur ${target.name}`}
      titleIcon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <Lock size={20} aria-hidden="true" />
        </span>
      }
      onClose={onClose}
    >
      <div className="mt-4 space-y-4 text-sm text-slate-700">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="font-bold">
            Menu &ldquo;{featureName}&rdquo; tersedia mulai {target.name}.
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-900">
            Paket aktif lembaga Anda saat ini adalah <strong>{current.name}</strong>. Upgrade paket untuk membuka fitur ini beserta seluruh fitur tingkat di bawahnya.
          </p>
        </div>

        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-700">{target.name}</p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {target.price} <span className="text-xs font-semibold text-slate-600">{target.period}</span>
              </p>
            </div>
            <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-900">
              {target.badge}
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-slate-600">{target.billingNote}</p>
          <ul className="mt-3 space-y-2">
            {target.features.map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-slate-800">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs leading-5 text-slate-700">
          <p className="font-bold text-slate-900">Cara Aktivasi Upgrade:</p>
          <p className="mt-1">
            Hubungi tim pengelola <strong>Rasyatech Admin</strong> dengan menyebutkan nama PKBM atau NPSN lembaga Anda untuk aktivasi langsung ke {target.name}.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {onRefreshPlan && (
            <button
              type="button"
              disabled={refreshing}
              onClick={onRefreshPlan}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
              {refreshing ? "Memeriksa..." : "Cek Status Paket"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="master-primary px-5 py-2.5"
          >
            Mengerti
          </button>
        </div>
      </div>
    </SchoolModal>
  );
}

export function SchoolImportPanel({ onGoToStudents }: { onGoToStudents: () => void }) {
  const isDark = useTenantTheme() === "dark";
  const [result, setResult] = useState<StudentImportResult | null>(null);

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        title="Impor Massal Dapodik"
        description="Unggah file Excel (.xlsx) hasil unduhan Dapodik untuk menambahkan atau memperbarui hingga 500 data siswa sekaligus."
        badge="Paket Reguler+"
        action={
          <button type="button" onClick={onGoToStudents} className="dashboard-hero-action">
            <Users size={17} aria-hidden="true" />
            Lihat Data Siswa
          </button>
        }
      />
      {result && (
        <div
          role="status"
          className={`mt-5 rounded-xl border p-4 text-sm ${
            isDark
              ? "border-emerald-500/35 bg-emerald-950/50 text-emerald-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-950"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-bold">
              Impor selesai: {result.created} siswa baru ditambahkan, {result.updated} siswa diperbarui, {result.skipped.length} baris tanpa NISN dilewati.
            </p>
            <button
              type="button"
              onClick={onGoToStudents}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
            >
              Buka Data Siswa
            </button>
          </div>
          {result.skipped.length > 0 && (
            <ul className={`mt-2 list-inside list-disc text-xs ${isDark ? "text-emerald-200" : "text-emerald-900"}`}>
              {result.skipped.map((row) => (
                <li key={row.number}>
                  Baris {row.number}: {row.nama || "(nama kosong)"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div
        className={`mt-4 rounded-2xl border p-4 sm:p-6 ${
          isDark
            ? "border-slate-700/60 bg-slate-900/75 text-slate-100"
            : "border-white/80 bg-white/95 text-slate-900"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              isDark ? "border border-emerald-400/25 bg-emerald-500/15 text-emerald-300" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            <FileSpreadsheet size={19} aria-hidden="true" />
          </span>
          <div>
            <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Unggah File Excel Siswa</h3>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Pemetaan kolom otomatis dengan pratinjau data sebelum disimpan.</p>
          </div>
        </div>
        <StudentImport
          onImported={(importRes) => {
            invalidateCache(["/api/sekolah/siswa", "/api/sekolah/ringkasan"]);
            setResult(importRes);
          }}
        />
      </div>
    </section>
  );
}

type ClassItem = { id: string; nama: string; waliGuruId: string | null; jumlahSiswa: number };
type ClassData = { kelas: ClassItem[]; guru: { id: string; nama: string }[] };

function isClassData(value: unknown): value is ClassData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.kelas) &&
    Array.isArray(record.guru) &&
    record.kelas.every(
      (item: unknown) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).id === "string" &&
        typeof (item as Record<string, unknown>).nama === "string"
    )
  );
}

export function SchoolBulkPlacementView() {
  const isDark = useTenantTheme() === "dark";
  const [data, setData] = useState<ClassData | null>(() => getCached<ClassData>("/api/sekolah/kelas"));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<"promotion" | "placement">("promotion");

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<ClassData>("/api/sekolah/kelas");
    if (cached) setData(cached);
    ensureStandardClasses(controller.signal)
      .then(() => fetchWithTimeout("/api/sekolah/kelas", { signal: controller.signal }))
      .then(async (res) => {
        const body: unknown = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
              ? body.error
              : "Data kelas belum dapat dimuat."
          );
        }
        if (!isClassData(body)) throw new Error("Respons kelas tidak valid.");
        setCached("/api/sekolah/kelas", body);
        if (!controller.signal.aborted) {
          setData(body);
          setError("");
        }
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal) && !cached) {
          setError(describeFetchError(failure, "Data kelas belum dapat dimuat."));
        }
      });
    return () => controller.abort();
  }, [version]);

  function handleMoved() {
    invalidateCache(["/api/sekolah/kelas", "/api/sekolah/siswa", "/api/sekolah/ringkasan"]);
    setVersion((v) => v + 1);
  }

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        title="Penempatan & Kenaikan Kelas"
        description="Pindahkan siswa antar-kelas secara massal untuk kenaikan jenjang atau penempatan siswa baru sekaligus."
        badge="Paket Reguler+"
      />

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={tab === "promotion"}
          onClick={() => setTab("promotion")}
          className={`rounded-full px-4 py-2.5 text-sm font-bold transition ${
            tab === "promotion"
              ? isDark
                ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.35)]"
                : "bg-indigo-600 text-white shadow-sm"
              : isDark
                ? "border border-slate-700/70 bg-slate-800/70 text-slate-300 hover:bg-slate-700/80 hover:text-white"
                : "border border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50"
          }`}
        >
          Kenaikan Kelas Massal
        </button>
        <button
          type="button"
          aria-pressed={tab === "placement"}
          onClick={() => setTab("placement")}
          className={`rounded-full px-4 py-2.5 text-sm font-bold transition ${
            tab === "placement"
              ? isDark
                ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.35)]"
                : "bg-indigo-600 text-white shadow-sm"
              : isDark
                ? "border border-slate-700/70 bg-slate-800/70 text-slate-300 hover:bg-slate-700/80 hover:text-white"
                : "border border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50"
          }`}
        >
          Penempatan Siswa Massal
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {error}{" "}
          <button type="button" onClick={() => setVersion((v) => v + 1)} className="font-bold underline">
            Coba lagi
          </button>
        </p>
      ) : !data ? (
        <CardGridSkeleton count={2} columns={2} />
      ) : (
        <div className="mt-5">
          {tab === "promotion" ? (
            <ClassPromotion classes={data.kelas} onMoved={handleMoved} />
          ) : (
            <BulkClassPlacement classes={data.kelas} onMoved={handleMoved} />
          )}
        </div>
      )}
    </section>
  );
}

type RecapData = {
  summary: {
    rataRataTugas: number | null;
    totalNilaiTugas: number;
    rataRataNilaiAkhir: number | null;
    totalEntriNilai: number;
    totalTugas: number;
    totalUjian: number;
    totalMateri: number;
    presensi: { hadir: number; sakit: number; izin: number; alpa: number; total: number };
  };
  perKelas: Array<{
    id: string;
    nama: string;
    jumlahSiswa: number;
    hadir: number;
    sakit: number;
    izin: number;
    alpa: number;
    totalPresensi: number;
  }>;
  nilaiTerbaru: Array<{
    id: string;
    siswaNama: string;
    mapelNama: string;
    nilaiMandiri: number;
    nilaiSimulasi: number;
    nilaiAkhir: number;
    tanggalSimulasi: string;
  }>;
};

export function SchoolAcademicRecap({
  onOpenClassroom,
  mode = "rekap",
}: {
  onOpenClassroom: () => void;
  mode?: "rekap" | "presensi";
}) {
  const isDark = useTenantTheme() === "dark";
  const endpoint = "/api/sekolah/rekap-akademik";
  const [data, setData] = useState<RecapData | null>(() => getCached<RecapData>(endpoint));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<RecapData>(endpoint);
    if (cached) setData(cached);
    setError("");
    fetchWithTimeout(endpoint, { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
              ? body.error
              : "Rekap akademik belum dapat dimuat."
          );
        }
        setCached(endpoint, body as RecapData);
        setData(body as RecapData);
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal) && !cached) {
          setError(describeFetchError(failure, "Rekap akademik belum dapat dimuat."));
        }
      });
    return () => controller.abort();
  }, [version]);

  const presensiPct =
    data && data.summary.presensi.total > 0
      ? Math.round((data.summary.presensi.hadir / data.summary.presensi.total) * 100)
      : null;

  const isPresensiMode = mode === "presensi";
  const cardSurface = isDark
    ? "rounded-2xl border border-slate-700/60 bg-slate-900/75 p-4 text-slate-100 shadow-lg"
    : "rounded-2xl border border-white bg-white p-4 text-slate-900 shadow-xs";

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        title={isPresensiMode ? "Presensi Warga Belajar" : "Rekap Akademik & Nilai"}
        description={
          isPresensiMode
            ? "Pantau rekapitulasi kehadiran (Hadir, Sakit, Izin, Alpa) warga belajar per kelas secara real-time dari aktivitas Ruang KBM."
            : "Ringkasan nilai tugas, evaluasi akhir, materi ajar, serta tingkat kehadiran siswa per kelas secara real-time."
        }
        badge="Paket Reguler+"
        action={
          <button type="button" onClick={onOpenClassroom} className="dashboard-hero-action">
            <ClipboardCheck size={17} aria-hidden="true" />
            Buka Ruang KBM
          </button>
        }
      />

      {error ? (
        <div role="alert" className={`mt-5 rounded-xl border p-4 text-sm ${isDark ? "border-rose-500/35 bg-rose-950/50 text-rose-200" : "border-transparent bg-rose-50 text-rose-800"}`}>
          {error}{" "}
          <button type="button" onClick={() => setVersion((v) => v + 1)} className="ml-2 font-bold underline">
            Muat ulang
          </button>
        </div>
      ) : !data ? (
        <CardGridSkeleton count={4} columns={4} />
      ) : (
        <div className="mt-5 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={cardSurface}>
              <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>Rata-rata Tugas</p>
              <p className={`mt-2 text-2xl font-black tabular-nums ${isDark ? "text-amber-300" : "text-indigo-800"}`}>
                {data.summary.rataRataTugas !== null ? data.summary.rataRataTugas : "—"}
              </p>
              <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>{data.summary.totalNilaiTugas} pengumpulan dinilai</p>
            </div>
            <div className={cardSurface}>
              <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>Rata-rata Nilai Akhir</p>
              <p className={`mt-2 text-2xl font-black tabular-nums ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                {data.summary.rataRataNilaiAkhir !== null ? data.summary.rataRataNilaiAkhir : "—"}
              </p>
              <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>{data.summary.totalEntriNilai} catatan nilai</p>
            </div>
            <div className={cardSurface}>
              <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>Tingkat Kehadiran</p>
              <p className={`mt-2 text-2xl font-black tabular-nums ${isDark ? "text-sky-300" : "text-cyan-700"}`}>
                {presensiPct !== null ? `${presensiPct}%` : "—"}
              </p>
              <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                {data.summary.presensi.hadir} hadir dari {data.summary.presensi.total} catatan
              </p>
            </div>
            <div className={cardSurface}>
              <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>Aktivitas KBM</p>
              <p className={`mt-2 text-2xl font-black tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>
                {data.summary.totalMateri + data.summary.totalTugas + data.summary.totalUjian}
              </p>
              <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                {data.summary.totalMateri} materi · {data.summary.totalTugas} tugas · {data.summary.totalUjian} ujian
              </p>
            </div>
          </div>

          <div className={`${cardSurface} sm:p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Rekap Kehadiran per Kelas</h3>
              <button
                type="button"
                onClick={() => {
                  invalidateCache(endpoint);
                  setVersion((v) => v + 1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                  isDark
                    ? "border-slate-700/80 bg-slate-800/80 text-slate-200 hover:border-amber-400/40 hover:text-amber-300"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <RefreshCw size={13} aria-hidden="true" />
                Segarkan
              </button>
            </div>
            {data.perKelas.length === 0 ? (
              <EmptyState
                title="Belum ada kelas terdaftar"
                description="Buat kelas terlebih dahulu di menu Manajemen Kelas untuk memantau rekap presensi."
              />
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[38rem] text-left text-sm">
                  <thead className={isDark ? "bg-slate-950/60 text-xs uppercase text-slate-400" : "bg-slate-50 text-xs uppercase text-slate-600"}>
                    <tr>
                      <th className="p-3">Kelas</th>
                      <th className="p-3">Siswa Aktif</th>
                      <th className="p-3">Hadir</th>
                      <th className="p-3">Sakit</th>
                      <th className="p-3">Izin</th>
                      <th className="p-3">Alpa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perKelas.map((row) => (
                      <tr key={row.id} className={`border-t ${isDark ? "border-slate-800/70" : "border-slate-100"}`}>
                        <td className={`p-3 font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{row.nama}</td>
                        <td className="p-3 tabular-nums">{row.jumlahSiswa}</td>
                        <td className={`p-3 font-semibold tabular-nums ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>{row.hadir}</td>
                        <td className={`p-3 tabular-nums ${isDark ? "text-amber-300" : "text-amber-700"}`}>{row.sakit}</td>
                        <td className={`p-3 tabular-nums ${isDark ? "text-sky-300" : "text-sky-700"}`}>{row.izin}</td>
                        <td className={`p-3 tabular-nums ${isDark ? "text-rose-400" : "text-rose-700"}`}>{row.alpa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!isPresensiMode && (
            <div className={`${cardSurface} sm:p-5`}>
              <div className="flex items-center gap-2">
                <Award size={18} className={isDark ? "text-amber-400" : "text-indigo-600"} aria-hidden="true" />
                <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Catatan Nilai Terbaru</h3>
              </div>
              {data.nilaiTerbaru.length === 0 ? (
                <p
                  className={`mt-3 rounded-xl border border-dashed p-5 text-center text-sm ${
                    isDark ? "border-slate-700/70 bg-slate-950/50 text-slate-400" : "border-slate-200 text-slate-600"
                  }`}
                >
                  Belum ada entri nilai simulasi atau nilai akhir. Penilaian tugas harian tetap dapat dipantau melalui menu Ruang KBM.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[38rem] text-left text-sm">
                    <thead className={isDark ? "bg-slate-950/60 text-xs uppercase text-slate-400" : "bg-slate-50 text-xs uppercase text-slate-600"}>
                      <tr>
                        <th className="p-3">Siswa</th>
                        <th className="p-3">Mata Pelajaran</th>
                        <th className="p-3">Mandiri</th>
                        <th className="p-3">Simulasi</th>
                        <th className="p-3">Nilai Akhir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.nilaiTerbaru.map((entry) => (
                        <tr key={entry.id} className={`border-t ${isDark ? "border-slate-800/70" : "border-slate-100"}`}>
                          <td className={`p-3 font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{entry.siswaNama}</td>
                          <td className="p-3">{entry.mapelNama}</td>
                          <td className="p-3 tabular-nums">{entry.nilaiMandiri}</td>
                          <td className="p-3 tabular-nums">{entry.nilaiSimulasi}</td>
                          <td className={`p-3 font-bold tabular-nums ${isDark ? "text-amber-300" : "text-indigo-700"}`}>{entry.nilaiAkhir}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const THEME_OPTIONS: Array<{
  key: ThemeKey;
  label: string;
  description: string;
  swatch: string;
}> = [
  {
    key: "ocean",
    label: "Ocean & Gold",
    description: "Nuansa biru profesional cerah dengan aksen emas khas edukasi modern.",
    swatch: "from-sky-700 via-blue-700 to-amber-500",
  },
  {
    key: "violet",
    label: "Royal Violet",
    description: "Ungu indigo elegan berpadu aksen lavender lembut.",
    swatch: "from-indigo-700 via-indigo-600 to-violet-600",
  },
  {
    key: "emerald",
    label: "Emerald Fresh",
    description: "Segar dan menenangkan dengan aksen hijau zamrud dan teal.",
    swatch: "from-emerald-700 via-teal-700 to-cyan-800",
  },
  {
    key: "sunset",
    label: "Sunset Violet",
    description: "Tampilan kreatif dengan gradien ungu & magenta hangat.",
    swatch: "from-violet-700 via-fuchsia-700 to-rose-600",
  },
  {
    key: "dark",
    label: "Rasyatech Dark",
    description: "Tema gelap glassmorphism premium dengan grid arsitektural & aksen emas menyala.",
    swatch: "from-slate-950 via-slate-900 to-amber-500",
  },
];

type IdentityPayload = {
  sekolah: { nama: string; slug: string; npsn: string | null; themeKey: string };
  settings: {
    primary_color: string;
    logo_url: string | null;
    hero_title: string | null;
    hero_subtitle: string | null;
    show_gallery: boolean;
    show_news: boolean;
    footer_text: string | null;
  };
};

export function SchoolThemeIdentityView() {
  const isDark = useTenantTheme() === "dark";
  const initialIdentity = getCached<IdentityPayload>("/api/sekolah/identitas");
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>(() =>
    initialIdentity && isThemeKey(initialIdentity.sekolah.themeKey) ? initialIdentity.sekolah.themeKey : "ocean"
  );
  const [form, setForm] = useState(() => ({
    primary_color: initialIdentity?.settings.primary_color || "#4f46e5",
    logo_url: initialIdentity?.settings.logo_url ?? "",
    hero_title: initialIdentity?.settings.hero_title ?? "",
    hero_subtitle: initialIdentity?.settings.hero_subtitle ?? "",
    footer_text: initialIdentity?.settings.footer_text ?? "",
    show_gallery: initialIdentity?.settings.show_gallery ?? true,
    show_news: initialIdentity?.settings.show_news ?? true,
  }));
  const [loading, setLoading] = useState(!initialIdentity);
  const [formBusy, setFormBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<IdentityPayload>("/api/sekolah/identitas");
    if (cached) {
      if (isThemeKey(cached.sekolah.themeKey)) setSelectedTheme(cached.sekolah.themeKey);
      setForm({
        primary_color: cached.settings.primary_color || "#4f46e5",
        logo_url: cached.settings.logo_url ?? "",
        hero_title: cached.settings.hero_title ?? "",
        hero_subtitle: cached.settings.hero_subtitle ?? "",
        footer_text: cached.settings.footer_text ?? "",
        show_gallery: cached.settings.show_gallery,
        show_news: cached.settings.show_news,
      });
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError("");
    fetchWithTimeout("/api/sekolah/identitas", { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
              ? body.error
              : "Pengaturan tema dan identitas belum dapat dimuat."
          );
        }
        const data = body as IdentityPayload;
        setCached("/api/sekolah/identitas", data);
        if (isThemeKey(data.sekolah.themeKey)) {
          setSelectedTheme(data.sekolah.themeKey);
        }
        saveCachedTenantProfile(data.sekolah.slug || deriveTenantSlugFromHost(), {
          nama: data.sekolah.nama,
          slug: data.sekolah.slug,
          logoUrl: data.settings.logo_url ?? null,
          themeKey: data.sekolah.themeKey,
        });
        setForm({
          primary_color: data.settings.primary_color || "#4f46e5",
          logo_url: data.settings.logo_url ?? "",
          hero_title: data.settings.hero_title ?? "",
          hero_subtitle: data.settings.hero_subtitle ?? "",
          footer_text: data.settings.footer_text ?? "",
          show_gallery: data.settings.show_gallery,
          show_news: data.settings.show_news,
        });
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal) && !cached) {
          setError(describeFetchError(failure, "Pengaturan belum dapat dimuat."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function saveIdentity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/identitas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
            ? body.error
            : "Identitas sekolah gagal disimpan."
        );
      }
      invalidateCache(["/api/sekolah/identitas", "/api/sekolah/pengaturan"]);
      const cached = getCached<IdentityPayload>("/api/sekolah/identitas");
      const slugKey = cached?.sekolah.slug || deriveTenantSlugFromHost();
      if (slugKey && cached) {
        saveCachedTenantProfile(slugKey, {
          nama: cached.sekolah.nama,
          slug: slugKey,
          logoUrl: form.logo_url.trim() || null,
        });
      }
      setMessage("Identitas dan kustomisasi halaman lembaga berhasil disimpan.");
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Identitas sekolah gagal disimpan."));
    } finally {
      setFormBusy(false);
    }
  }

  const panelClass = isDark
    ? "rounded-2xl border border-slate-700/60 bg-slate-900/75 p-4 text-slate-100 sm:p-5"
    : "rounded-2xl border border-white bg-white p-4 text-slate-900 sm:p-5";
  const inputClass = isDark
    ? "mt-1.5 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3.5 py-2.5 text-sm font-normal text-slate-100"
    : "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-900";

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="TAMPILAN & BRANDING"
        title="Tema & Identitas Sekolah"
        description="Seluruh paket menggunakan tema platform seragam dari Master Admin, serta kustomisasi identitas lembaga PKBM Anda."
      />

      {error && (
        <p role="alert" className={`mt-4 rounded-xl border p-4 text-sm font-semibold ${isDark ? "border-rose-500/35 bg-rose-950/50 text-rose-200" : "border-transparent bg-rose-50 text-rose-800"}`}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className={`mt-4 rounded-xl border p-4 text-sm font-semibold ${isDark ? "border-emerald-500/35 bg-emerald-950/50 text-emerald-200" : "border-transparent bg-emerald-50 text-emerald-900"}`}>
          {message}
        </p>
      )}

      {loading ? (
        <CardGridSkeleton count={4} columns={4} />
      ) : (
        <div className="mt-5 space-y-6">
          <div className={panelClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Palette size={19} className={isDark ? "text-amber-400" : "text-indigo-600"} aria-hidden="true" />
                <div>
                  <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Tema Global Platform Aktif</h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    Dikelola terpusat oleh Master Admin dan diterapkan seragam untuk seluruh paket (Basic, Reguler, maupun Pro).
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
                  isDark ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/35" : "bg-indigo-100 text-indigo-900"
                }`}
              >
                <Check size={13} aria-hidden="true" />
                {THEME_OPTIONS.find((item) => item.key === selectedTheme)?.label ?? selectedTheme}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {THEME_OPTIONS.map((option) => {
                const active = selectedTheme === option.key;
                return (
                  <div
                    key={option.key}
                    className={`rounded-2xl border p-3.5 text-left transition ${
                      active
                        ? isDark
                          ? "border-amber-400/70 bg-amber-500/12 ring-2 ring-amber-400/30"
                          : "border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/30"
                        : isDark
                          ? "border-slate-700/70 bg-slate-950/60 opacity-75"
                          : "border-slate-200 bg-white opacity-75"
                    }`}
                  >
                    <div className={`h-11 w-full rounded-xl bg-gradient-to-r ${option.swatch}`} />
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{option.label}</span>
                      {active && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                            isDark
                              ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950"
                              : "bg-indigo-600 text-white"
                          }`}
                        >
                          <Check size={11} aria-hidden="true" />
                          Aktif
                        </span>
                      )}
                    </div>
                    <p className={`mt-1 text-xs leading-5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{option.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={saveIdentity} className={panelClass}>
            <div className="flex items-center gap-2">
              <Sparkles size={19} className={isDark ? "text-amber-400" : "text-indigo-600"} aria-hidden="true" />
              <div>
                <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Identitas &amp; Branding Lembaga</h3>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Kelola judul portal, subjudul, warna aksen, dan teks footer sekolah.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className={`block text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                Judul Portal Lembaga
                <input
                  type="text"
                  maxLength={150}
                  value={form.hero_title}
                  onChange={(e) => setForm({ ...form, hero_title: e.target.value })}
                  className={inputClass}
                  placeholder="Contoh: Portal Belajar PKBM Harapan Bangsa"
                />
              </label>

              <label className={`block text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                Warna Aksen Utama (Hex)
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pemilih warna aksen"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.primary_color) ? form.primary_color : "#4f46e5"}
                    onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                    className={`h-10 w-12 cursor-pointer rounded-lg border p-1 ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}
                  />
                  <input
                    type="text"
                    maxLength={7}
                    pattern="^#[0-9a-fA-F]{6}$"
                    value={form.primary_color}
                    onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                    className={`${inputClass} mt-0 font-mono`}
                  />
                </div>
              </label>

              <label className={`block text-sm font-semibold sm:col-span-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                Subjudul / Slogan Sekolah
                <textarea
                  rows={2}
                  maxLength={400}
                  value={form.hero_subtitle}
                  onChange={(e) => setForm({ ...form, hero_subtitle: e.target.value })}
                  className={inputClass}
                  placeholder="Deskripsi singkat visi belajar atau layanan pendidikan kesetaraan"
                />
              </label>

              <label className={`block text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                URL Logo Lembaga (opsional)
                <input
                  type="text"
                  maxLength={500}
                  value={form.logo_url}
                  onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  className={inputClass}
                  placeholder="https://..."
                />
              </label>

              <label className={`block text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                Teks Footer Lembaga
                <input
                  type="text"
                  maxLength={300}
                  value={form.footer_text}
                  onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
                  className={inputClass}
                />
              </label>

              <div className="flex flex-wrap gap-6 sm:col-span-2">
                <label className={`inline-flex items-center gap-2 text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <input
                    type="checkbox"
                    checked={form.show_news}
                    onChange={(e) => setForm({ ...form, show_news: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 accent-amber-500"
                  />
                  Tampilkan pengumuman lembaga
                </label>
                <label className={`inline-flex items-center gap-2 text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <input
                    type="checkbox"
                    checked={form.show_gallery}
                    onChange={(e) => setForm({ ...form, show_gallery: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 accent-amber-500"
                  />
                  Tampilkan galeri kegiatan
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button type="submit" disabled={formBusy} className="master-primary px-5 py-2.5 disabled:opacity-50">
                {formBusy ? "Menyimpan..." : "Simpan Identitas Sekolah"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

type AdvancedSettingsData = {
  sekolah: {
    id: string;
    nama: string;
    slug: string;
    npsn: string | null;
    status: string;
    plan: string | null;
    normalizedPlan: PlanSlug;
    themeKey: string;
    expiresAt: string | null;
    adminPhone: string | null;
    kelasStandarDibuat: boolean;
    createdAt: string;
  };
  statistik: {
    siswaAktif: number;
    siswaDenganAkun: number;
    guruAktif: number;
    guruDenganAkun: number;
    kelasTotal: number;
    mapelTotal: number;
    tahunAjaranTotal: number;
  };
};

export function SchoolAdvancedSettingsView({
  onOpenTheme,
  onOpenClasses,
}: {
  onOpenTheme: () => void;
  onOpenClasses: () => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const [data, setData] = useState<AdvancedSettingsData | null>(() =>
    getCached<AdvancedSettingsData>("/api/sekolah/pengaturan")
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedPpdb, setCopiedPpdb] = useState(false);
  const [classBusy, setClassBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<AdvancedSettingsData>("/api/sekolah/pengaturan");
    if (cached) setData(cached);
    setError("");
    fetchWithTimeout("/api/sekolah/pengaturan", { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
              ? body.error
              : "Pengaturan lanjutan belum dapat dimuat."
          );
        }
        setCached("/api/sekolah/pengaturan", body as AdvancedSettingsData);
        setData(body as AdvancedSettingsData);
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal) && !cached) {
          setError(describeFetchError(failure, "Pengaturan lanjutan belum dapat dimuat."));
        }
      });
    return () => controller.abort();
  }, [version]);

  async function ensureClasses() {
    setClassBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/kelas-standar", { method: "POST" });
      const body: unknown = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
            ? body.error
            : "Kelas standar belum dapat diproses."
        );
      }
      invalidateCache(["/api/sekolah/kelas", "/api/sekolah/pengaturan", "/api/sekolah/ringkasan"]);
      setNotice("Verifikasi kelas standar PKBM (Paket A Kelas 1–6, B Kelas 7–9, C Kelas 10–12) berhasil.");
      setVersion((v) => v + 1);
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Kelas standar belum dapat diproses."));
    } finally {
      setClassBusy(false);
    }
  }

  const ppdbUrl = data ? `${window.location.origin}/ppdb/${encodeURIComponent(data.sekolah.slug)}` : "";
  const activePlanInfo = data ? getPlanBySlug(data.sekolah.normalizedPlan) : SUBSCRIPTION_PLANS[2];
  const panelClass = isDark
    ? "rounded-2xl border border-slate-700/60 bg-slate-900/75 p-5 text-slate-100"
    : "rounded-2xl border border-white bg-white p-5 text-slate-900";
  const subBoxClass = isDark
    ? "rounded-xl border border-slate-700/60 bg-slate-950/60 p-3.5"
    : "rounded-xl border border-slate-200 bg-slate-50 p-3.5";

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        title="Pengaturan Lanjutan"
        description="Informasi langganan lembaga, status aktivasi akun LMS, tautan subdomain, dan utilitas kelas standar."
        badge="Paket Pro"
        action={
          <button type="button" onClick={onOpenTheme} className="dashboard-hero-action">
            <Palette size={17} aria-hidden="true" />
            Atur Tema &amp; Identitas
          </button>
        }
      />

      {error && (
        <p role="alert" className={`mt-4 rounded-xl border p-4 text-sm font-semibold ${isDark ? "border-rose-500/35 bg-rose-950/50 text-rose-200" : "border-transparent bg-rose-50 text-rose-800"}`}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={`mt-4 rounded-xl border p-4 text-sm font-semibold ${isDark ? "border-emerald-500/35 bg-emerald-950/50 text-emerald-200" : "border-transparent bg-emerald-50 text-emerald-900"}`}>
          {notice}
        </p>
      )}

      {!data ? (
        <CardGridSkeleton count={4} columns={2} />
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className={panelClass}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Globe size={19} className={isDark ? "text-amber-400" : "text-indigo-600"} aria-hidden="true" />
                <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Profil Tenant &amp; Langganan</h3>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider ${
                  isDark
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                    : "border-transparent bg-amber-100 text-amber-950"
                }`}
              >
                {activePlanInfo.name}
              </span>
            </div>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className={`flex justify-between gap-4 border-b pb-2 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                <dt className={isDark ? "text-slate-400" : "text-slate-600"}>Nama Lembaga</dt>
                <dd className={`text-right font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{data.sekolah.nama}</dd>
              </div>
              <div className={`flex justify-between gap-4 border-b pb-2 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                <dt className={isDark ? "text-slate-400" : "text-slate-600"}>Subdomain / Slug</dt>
                <dd className={`text-right font-mono font-semibold ${isDark ? "text-amber-300" : "text-indigo-700"}`}>{data.sekolah.slug}</dd>
              </div>
              <div className={`flex justify-between gap-4 border-b pb-2 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                <dt className={isDark ? "text-slate-400" : "text-slate-600"}>NPSN</dt>
                <dd className={`text-right font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{data.sekolah.npsn ?? "Belum diisi"}</dd>
              </div>
              <div className={`flex justify-between gap-4 border-b pb-2 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                <dt className={isDark ? "text-slate-400" : "text-slate-600"}>Status Layanan</dt>
                <dd className={`text-right font-semibold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>{data.sekolah.status}</dd>
              </div>
              <div className={`flex justify-between gap-4 border-b pb-2 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                <dt className={isDark ? "text-slate-400" : "text-slate-600"}>Masa Aktif Hingga</dt>
                <dd className={`text-right font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
                  {data.sekolah.expiresAt
                    ? new Date(data.sekolah.expiresAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "Aktif Berkelanjutan"}
                </dd>
              </div>
            </dl>

            <div className={`mt-4 rounded-xl border p-3.5 ${isDark ? "border-amber-400/25 bg-slate-950/60" : "border-indigo-100 bg-indigo-50/70"}`}>
              <p className={`text-xs font-bold ${isDark ? "text-amber-300" : "text-indigo-950"}`}>Tautan Formulir PPDB Publik</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <a href={ppdbUrl} className={`min-w-0 flex-1 break-all text-xs font-semibold underline ${isDark ? "text-slate-200" : "text-indigo-700"}`}>
                  {ppdbUrl}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.clipboard?.writeText) {
                      void navigator.clipboard
                        .writeText(ppdbUrl)
                        .then(() => {
                          setCopiedPpdb(true);
                          window.setTimeout(() => setCopiedPpdb(false), 2500);
                        })
                        .catch(() => {});
                    }
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                    isDark
                      ? "border-slate-700/80 bg-slate-800/80 text-slate-200 hover:border-amber-400/40 hover:text-amber-300"
                      : "border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50"
                  }`}
                >
                  {copiedPpdb ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                  {copiedPpdb ? "Tersalin" : "Salin"}
                </button>
              </div>
            </div>
          </div>

          <div className={panelClass}>
            <div className="flex items-center gap-2">
              <Settings2 size={19} className={isDark ? "text-amber-400" : "text-indigo-600"} aria-hidden="true" />
              <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Kesiapan Akun &amp; Struktur Kelas</h3>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className={subBoxClass}>
                <p className={`text-xs font-bold ${isDark ? "text-slate-400" : "text-slate-600"}`}>Akun LMS Siswa</p>
                <p className={`mt-1 text-xl font-black tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>
                  {data.statistik.siswaDenganAkun} / {data.statistik.siswaAktif}
                </p>
                <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Siswa aktif memiliki akun LMS</p>
              </div>
              <div className={subBoxClass}>
                <p className={`text-xs font-bold ${isDark ? "text-slate-400" : "text-slate-600"}`}>Akun LMS Guru</p>
                <p className={`mt-1 text-xl font-black tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>
                  {data.statistik.guruDenganAkun} / {data.statistik.guruAktif}
                </p>
                <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Guru aktif memiliki akun LMS</p>
              </div>
              <div className={subBoxClass}>
                <p className={`text-xs font-bold ${isDark ? "text-slate-400" : "text-slate-600"}`}>Kelas &amp; Mapel</p>
                <p className={`mt-1 text-xl font-black tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>
                  {data.statistik.kelasTotal} Kelas · {data.statistik.mapelTotal} Mapel
                </p>
                <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>{data.statistik.tahunAjaranTotal} Tahun Ajaran</p>
              </div>
              <div className={subBoxClass}>
                <p className={`text-xs font-bold ${isDark ? "text-slate-400" : "text-slate-600"}`}>Kelas Standar PKBM</p>
                <p className={`mt-1 text-sm font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                  {data.sekolah.kelasStandarDibuat ? "Sudah Disiapkan (12 Kelas)" : "Belum Lengkap"}
                </p>
                <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Paket A (1–6), B (7–9), C (10–12)</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={classBusy}
                onClick={ensureClasses}
                className="master-primary px-4 py-2.5 disabled:opacity-50"
              >
                {classBusy ? "Memproses..." : "Verifikasi Kelas Standar PKBM"}
              </button>
              <button
                type="button"
                onClick={onOpenClasses}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-bold transition ${
                  isDark
                    ? "border-slate-700/80 bg-slate-800/80 text-slate-200 hover:border-amber-400/40 hover:text-amber-300"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                Kelola Kelas
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
