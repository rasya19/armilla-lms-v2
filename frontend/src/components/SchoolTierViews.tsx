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
import { DashboardHero, EmptyState } from "./DashboardUI";
import { SchoolModal } from "./SchoolModal";
import { StudentImport, type StudentImportResult } from "./StudentImport";
import { dispatchTenantThemeChange, isThemeKey, type ThemeKey } from "./TenantThemeProvider";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { ensureStandardClasses } from "./standardClasses";
import { getPlanBySlug, SUBSCRIPTION_PLANS, type PlanSlug } from "./subscriptionPlans";

export function UpgradePlanModal({
  featureName,
  requiredPlan,
  currentPlan,
  onClose,
}: {
  featureName: string;
  requiredPlan: Exclude<PlanSlug, "basic">;
  currentPlan: PlanSlug;
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

        <div className="flex justify-end gap-2 pt-1">
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
  const [result, setResult] = useState<StudentImportResult | null>(null);

  return (
    <section className="dashboard-glass p-4 sm:p-6">
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
        <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
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
            <ul className="mt-2 list-inside list-disc text-xs text-emerald-900">
              {result.skipped.map((row) => (
                <li key={row.number}>
                  Baris {row.number}: {row.nama || "(nama kosong)"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-4 rounded-2xl border border-white/80 bg-white/95 p-4 text-slate-900 sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <FileSpreadsheet size={19} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900">Unggah File Excel Siswa</h3>
            <p className="text-xs text-slate-600">Pemetaan kolom otomatis dengan pratinjau data sebelum disimpan.</p>
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
  const [data, setData] = useState<ClassData | null>(() => getCached<ClassData>("/api/sekolah/kelas"));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<"promotion" | "placement">("promotion");

  useEffect(() => {
    let active = true;
    const cached = getCached<ClassData>("/api/sekolah/kelas");
    if (cached) setData(cached);
    ensureStandardClasses()
      .then(() => fetch("/api/sekolah/kelas"))
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
        if (active) {
          setData(body);
          setError("");
        }
      })
      .catch((failure: unknown) => {
        if (active && !cached) {
          setError(failure instanceof Error ? failure.message : "Data kelas belum dapat dimuat.");
        }
      });
    return () => {
      active = false;
    };
  }, [version]);

  function handleMoved() {
    invalidateCache(["/api/sekolah/kelas", "/api/sekolah/siswa", "/api/sekolah/ringkasan"]);
    setVersion((v) => v + 1);
  }

  return (
    <section className="dashboard-glass p-4 sm:p-6">
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
          className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            tab === "promotion"
              ? "bg-indigo-600 text-white shadow-sm"
              : "border border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50"
          }`}
        >
          Kenaikan Kelas Massal
        </button>
        <button
          type="button"
          aria-pressed={tab === "placement"}
          onClick={() => setTab("placement")}
          className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            tab === "placement"
              ? "bg-indigo-600 text-white shadow-sm"
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
        <p className="mt-5 text-sm">Memuat daftar kelas...</p>
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

export function SchoolAcademicRecap({ onOpenClassroom }: { onOpenClassroom: () => void }) {
  const endpoint = "/api/sekolah/rekap-akademik";
  const [data, setData] = useState<RecapData | null>(() => getCached<RecapData>(endpoint));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<RecapData>(endpoint);
    if (cached) setData(cached);
    setError("");
    fetch(endpoint, { signal: controller.signal })
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
        if (!controller.signal.aborted && !cached) {
          setError(failure instanceof Error ? failure.message : "Rekap akademik belum dapat dimuat.");
        }
      });
    return () => controller.abort();
  }, [version]);

  const presensiPct =
    data && data.summary.presensi.total > 0
      ? Math.round((data.summary.presensi.hadir / data.summary.presensi.total) * 100)
      : null;

  return (
    <section className="dashboard-glass p-4 sm:p-6">
      <DashboardHero
        title="Rekap Akademik & Nilai"
        description="Ringkasan nilai tugas, evaluasi akhir, materi ajar, serta tingkat kehadiran siswa per kelas secara real-time."
        badge="Paket Reguler+"
        action={
          <button type="button" onClick={onOpenClassroom} className="dashboard-hero-action">
            <ClipboardCheck size={17} aria-hidden="true" />
            Buka Ruang KBM
          </button>
        }
      />

      {error ? (
        <div role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
          {error}{" "}
          <button type="button" onClick={() => setVersion((v) => v + 1)} className="ml-2 font-bold underline">
            Muat ulang
          </button>
        </div>
      ) : !data ? (
        <p className="mt-5 text-sm">Memuat rekap akademik...</p>
      ) : (
        <div className="mt-5 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white bg-white p-4 text-slate-900 shadow-xs">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Rata-rata Tugas</p>
              <p className="mt-2 text-2xl font-black text-indigo-800">
                {data.summary.rataRataTugas !== null ? data.summary.rataRataTugas : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-600">{data.summary.totalNilaiTugas} pengumpulan dinilai</p>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4 text-slate-900 shadow-xs">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Rata-rata Nilai Akhir</p>
              <p className="mt-2 text-2xl font-black text-emerald-700">
                {data.summary.rataRataNilaiAkhir !== null ? data.summary.rataRataNilaiAkhir : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-600">{data.summary.totalEntriNilai} catatan nilai</p>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4 text-slate-900 shadow-xs">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tingkat Kehadiran</p>
              <p className="mt-2 text-2xl font-black text-cyan-700">
                {presensiPct !== null ? `${presensiPct}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {data.summary.presensi.hadir} hadir dari {data.summary.presensi.total} catatan
              </p>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4 text-slate-900 shadow-xs">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Aktivitas KBM</p>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {data.summary.totalMateri + data.summary.totalTugas + data.summary.totalUjian}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {data.summary.totalMateri} materi · {data.summary.totalTugas} tugas · {data.summary.totalUjian} ujian
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white bg-white p-4 text-slate-900 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">Rekap Kehadiran per Kelas</h3>
              <button
                type="button"
                onClick={() => {
                  invalidateCache(endpoint);
                  setVersion((v) => v + 1);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
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
                  <thead className="bg-slate-50 text-xs uppercase text-slate-600">
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
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="p-3 font-semibold text-slate-900">{row.nama}</td>
                        <td className="p-3">{row.jumlahSiswa}</td>
                        <td className="p-3 font-semibold text-emerald-700">{row.hadir}</td>
                        <td className="p-3 text-amber-700">{row.sakit}</td>
                        <td className="p-3 text-sky-700">{row.izin}</td>
                        <td className="p-3 text-rose-700">{row.alpa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white bg-white p-4 text-slate-900 sm:p-5">
            <div className="flex items-center gap-2">
              <Award size={18} className="text-indigo-600" aria-hidden="true" />
              <h3 className="text-base font-bold text-slate-900">Catatan Nilai Terbaru</h3>
            </div>
            {data.nilaiTerbaru.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-600">
                Belum ada entri nilai simulasi atau nilai akhir. Penilaian tugas harian tetap dapat dipantau melalui menu Ruang KBM.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[38rem] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-600">
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
                      <tr key={entry.id} className="border-t border-slate-100">
                        <td className="p-3 font-semibold text-slate-900">{entry.siswaNama}</td>
                        <td className="p-3">{entry.mapelNama}</td>
                        <td className="p-3">{entry.nilaiMandiri}</td>
                        <td className="p-3">{entry.nilaiSimulasi}</td>
                        <td className="p-3 font-bold text-indigo-700">{entry.nilaiAkhir}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
    label: "Ocean Biru",
    description: "Nuansa biru profesional cerah khas edukasi modern.",
    swatch: "from-sky-700 via-blue-700 to-cyan-800",
  },
  {
    key: "emerald",
    label: "Emerald Hijau",
    description: "Segar dan menenangkan dengan aksen hijau zamrud.",
    swatch: "from-emerald-700 via-teal-700 to-cyan-800",
  },
  {
    key: "sunset",
    label: "Sunset Ungu",
    description: "Tampilan kreatif dengan gradien ungu & magenta hangat.",
    swatch: "from-violet-700 via-fuchsia-700 to-rose-600",
  },
  {
    key: "dark",
    label: "Dark Mode",
    description: "Latar gelap elegan dengan kontras nyaman di malam hari.",
    swatch: "from-slate-900 via-emerald-950 to-slate-800",
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
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>("ocean");
  const [form, setForm] = useState({
    primary_color: "#4f46e5",
    logo_url: "",
    hero_title: "",
    hero_subtitle: "",
    footer_text: "",
    show_gallery: true,
    show_news: true,
  });
  const [loading, setLoading] = useState(true);
  const [themeBusy, setThemeBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/sekolah/identitas", { signal: controller.signal })
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
        if (isThemeKey(data.sekolah.themeKey)) {
          setSelectedTheme(data.sekolah.themeKey);
        }
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
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : "Pengaturan belum dapat dimuat.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function applyTheme(themeKey: ThemeKey) {
    setThemeBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/sekolah/tema", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeKey }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
            ? body.error
            : "Tema gagal diperbarui."
        );
      }
      setSelectedTheme(themeKey);
      dispatchTenantThemeChange(themeKey);
      setMessage("Tema dashboard sekolah dan LMS siswa/guru berhasil diperbarui.");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "Tema gagal diperbarui.");
    } finally {
      setThemeBusy(false);
    }
  }

  async function saveIdentity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/sekolah/identitas", {
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
      setMessage("Identitas dan kustomisasi halaman lembaga berhasil disimpan.");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "Identitas sekolah gagal disimpan.");
    } finally {
      setFormBusy(false);
    }
  }

  return (
    <section className="dashboard-glass p-4 sm:p-6">
      <DashboardHero
        title="Tema & Identitas Sekolah"
        description="Sesuaikan tema visual portal Admin & LMS serta lengkapi identitas lembaga PKBM Anda."
        badge="Paket Pro"
      />

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          {message}
        </p>
      )}

      {loading ? (
        <p className="mt-5 text-sm">Memuat tema dan identitas sekolah...</p>
      ) : (
        <div className="mt-5 space-y-6">
          <div className="rounded-2xl border border-white bg-white p-4 text-slate-900 sm:p-5">
            <div className="flex items-center gap-2">
              <Palette size={19} className="text-indigo-600" aria-hidden="true" />
              <div>
                <h3 className="text-base font-bold text-slate-900">Tema Visual Portal Sekolah &amp; LMS</h3>
                <p className="text-xs text-slate-600">
                  Perubahan tema langsung diterapkan untuk Admin Sekolah, Guru, dan Siswa pada subdomain lembaga Anda.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {THEME_OPTIONS.map((option) => {
                const active = selectedTheme === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    disabled={themeBusy}
                    onClick={() => applyTheme(option.key)}
                    className={`rounded-2xl border p-3.5 text-left transition ${
                      active
                        ? "border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/30"
                        : "border-slate-200 bg-white hover:border-indigo-300"
                    }`}
                  >
                    <div className={`h-12 w-full rounded-xl bg-gradient-to-r ${option.swatch}`} />
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900">{option.label}</span>
                      {active && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          <Check size={11} aria-hidden="true" />
                          Aktif
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={saveIdentity} className="rounded-2xl border border-white bg-white p-4 text-slate-900 sm:p-5">
            <div className="flex items-center gap-2">
              <Sparkles size={19} className="text-indigo-600" aria-hidden="true" />
              <div>
                <h3 className="text-base font-bold text-slate-900">Identitas &amp; Branding Lembaga</h3>
                <p className="text-xs text-slate-600">Kelola judul portal, subjudul, warna aksen, dan teks footer sekolah.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-800">
                Judul Portal Lembaga
                <input
                  type="text"
                  maxLength={150}
                  value={form.hero_title}
                  onChange={(e) => setForm({ ...form, hero_title: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-900"
                  placeholder="Contoh: Portal Belajar PKBM Harapan Bangsa"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-800">
                Warna Aksen Utama (Hex)
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pemilih warna aksen"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.primary_color) ? form.primary_color : "#4f46e5"}
                    onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                    className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                  />
                  <input
                    type="text"
                    maxLength={7}
                    pattern="^#[0-9a-fA-F]{6}$"
                    value={form.primary_color}
                    onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm font-normal text-slate-900"
                  />
                </div>
              </label>

              <label className="block text-sm font-semibold text-slate-800 sm:col-span-2">
                Subjudul / Slogan Sekolah
                <textarea
                  rows={2}
                  maxLength={400}
                  value={form.hero_subtitle}
                  onChange={(e) => setForm({ ...form, hero_subtitle: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-900"
                  placeholder="Deskripsi singkat visi belajar atau layanan pendidikan kesetaraan"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-800">
                URL Logo Lembaga (opsional)
                <input
                  type="text"
                  maxLength={500}
                  value={form.logo_url}
                  onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-900"
                  placeholder="https://..."
                />
              </label>

              <label className="block text-sm font-semibold text-slate-800">
                Teks Footer Lembaga
                <input
                  type="text"
                  maxLength={300}
                  value={form.footer_text}
                  onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-900"
                />
              </label>

              <div className="flex flex-wrap gap-6 sm:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={form.show_news}
                    onChange={(e) => setForm({ ...form, show_news: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  Tampilkan pengumuman lembaga
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={form.show_gallery}
                    onChange={(e) => setForm({ ...form, show_gallery: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
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
    fetch("/api/sekolah/pengaturan", { signal: controller.signal })
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
        if (!controller.signal.aborted && !cached) {
          setError(failure instanceof Error ? failure.message : "Pengaturan lanjutan belum dapat dimuat.");
        }
      });
    return () => controller.abort();
  }, [version]);

  async function ensureClasses() {
    setClassBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/sekolah/kelas-standar", { method: "POST" });
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
      setError(failure instanceof Error ? failure.message : "Kelas standar belum dapat diproses.");
    } finally {
      setClassBusy(false);
    }
  }

  const ppdbUrl = data ? `${window.location.origin}/ppdb/${encodeURIComponent(data.sekolah.slug)}` : "";
  const activePlanInfo = data ? getPlanBySlug(data.sekolah.normalizedPlan) : SUBSCRIPTION_PLANS[2];

  return (
    <section className="dashboard-glass p-4 sm:p-6">
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
        <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          {notice}
        </p>
      )}

      {!data ? (
        <p className="mt-5 text-sm">Memuat pengaturan lanjutan...</p>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-white bg-white p-5 text-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Globe size={19} className="text-indigo-600" aria-hidden="true" />
                <h3 className="text-base font-bold text-slate-900">Profil Tenant &amp; Langganan</h3>
              </div>
              <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-950">
                {activePlanInfo.name}
              </span>
            </div>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Nama Lembaga</dt>
                <dd className="text-right font-semibold text-slate-900">{data.sekolah.nama}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Subdomain / Slug</dt>
                <dd className="text-right font-mono font-semibold text-indigo-700">{data.sekolah.slug}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">NPSN</dt>
                <dd className="text-right font-semibold text-slate-900">{data.sekolah.npsn ?? "Belum diisi"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Status Layanan</dt>
                <dd className="text-right font-semibold text-emerald-700">{data.sekolah.status}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="text-slate-600">Masa Aktif Hingga</dt>
                <dd className="text-right font-semibold text-slate-900">
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

            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3.5">
              <p className="text-xs font-bold text-indigo-950">Tautan Formulir PPDB Publik</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <a href={ppdbUrl} className="min-w-0 flex-1 break-all text-xs font-semibold text-indigo-700 underline">
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
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-bold text-indigo-900 hover:bg-indigo-50"
                >
                  {copiedPpdb ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                  {copiedPpdb ? "Tersalin" : "Salin"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white bg-white p-5 text-slate-900">
            <div className="flex items-center gap-2">
              <Settings2 size={19} className="text-indigo-600" aria-hidden="true" />
              <h3 className="text-base font-bold text-slate-900">Kesiapan Akun &amp; Struktur Kelas</h3>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-xs font-bold text-slate-600">Akun LMS Siswa</p>
                <p className="mt-1 text-xl font-black text-slate-900">
                  {data.statistik.siswaDenganAkun} / {data.statistik.siswaAktif}
                </p>
                <p className="mt-1 text-xs text-slate-600">Siswa aktif memiliki akun LMS</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-xs font-bold text-slate-600">Akun LMS Guru</p>
                <p className="mt-1 text-xl font-black text-slate-900">
                  {data.statistik.guruDenganAkun} / {data.statistik.guruAktif}
                </p>
                <p className="mt-1 text-xs text-slate-600">Guru aktif memiliki akun LMS</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-xs font-bold text-slate-600">Kelas &amp; Mapel</p>
                <p className="mt-1 text-xl font-black text-slate-900">
                  {data.statistik.kelasTotal} Kelas · {data.statistik.mapelTotal} Mapel
                </p>
                <p className="mt-1 text-xs text-slate-600">{data.statistik.tahunAjaranTotal} Tahun Ajaran</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-xs font-bold text-slate-600">Kelas Standar PKBM</p>
                <p className="mt-1 text-sm font-bold text-emerald-700">
                  {data.sekolah.kelasStandarDibuat ? "Sudah Disiapkan (12 Kelas)" : "Belum Lengkap"}
                </p>
                <p className="mt-1 text-xs text-slate-600">Paket A (1–6), B (7–9), C (10–12)</p>
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
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
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
