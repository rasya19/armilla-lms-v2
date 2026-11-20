import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Landmark,
  LogOut,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { CardGridSkeleton, DashboardHero, EmptyState, PortalSpinner, TableSkeleton } from "./DashboardUI";
import {
  clearAuthCache,
  getAuthCache,
  saveAuthCache,
  type DinasAuthCache,
} from "./authSessionCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import type { VervalDinasStatus, VervalStatus } from "./StudentVervalForm";

type PkbmSummary = {
  id: string;
  nama: string;
  npsn: string | null;
  slug: string;
  plan: string;
  kabupatenKota: string | null;
  totalSiswa: number;
  totalSiswaDapodik: number;
  berkasLengkapCount: number;
  tanpaBerkasCount: number;
  paketA: number;
  paketB: number;
  paketC: number;
  siswaMemenuhiCutoff: number;
  belumLengkapCount: number;
  siapVerifikasiCount: number;
  terverifikasiPkbmCount: number;
  kelengkapanVervalPersen: number;
  lolosDinasCount: number;
  perluPerbaikanCount: number;
  menungguDinasCount: number;
  persentaseLolosDinas: number;
};

type DinasSummaryResponse = {
  wilayah: string;
  availableWilayah: string[];
  cutoffDate: string;
  petugas: { nama: string; peran: string; isSuperAdmin: boolean };
  kpi: {
    totalPkbm: number;
    totalWargaBelajar: number;
    totalDapodikTarik: number;
    totalBerkasLengkap: number;
    totalPaketA: number;
    totalPaketB: number;
    totalPaketC: number;
    totalCutoff: number;
    totalLolosDinas: number;
    persentaseLolosVerval: number;
  };
  pkbm: PkbmSummary[];
};

type DinasStudentRow = {
  id: string;
  nisn: string;
  nama: string;
  nik: string | null;
  noKk: string | null;
  tempatLahir: string | null;
  tanggalLahir: string | null;
  jenisKelamin: string | null;
  jenjang: string | null;
  paketKategori: string;
  kelasNama: string;
  tanggalMasuk: string | null;
  memenuhiCutoff: boolean;
  namaIbuKandung: string | null;
  alamatLengkap: string | null;
  desaKelurahan: string | null;
  kecamatan: string | null;
  sekolahAsal: string | null;
  npsnAsal: string | null;
  nomorIjazahTerakhir: string | null;
  sumberDapodik: boolean;
  urlKk: string | null;
  urlAktaKtp: string | null;
  urlIjazah: string | null;
  urlSuratPindah: string | null;
  statusVerval: VervalStatus;
  catatanVerval: string | null;
  statusVervalDinas: VervalDinasStatus;
  catatanDinas: string | null;
  kelengkapanPersen: number;
};

function statusDinasBadge(status: VervalDinasStatus): { label: string; cls: string } {
  switch (status) {
    case "LOLOS_VERVAL":
      return { label: "Lolos Verval", cls: "border-emerald-300 bg-emerald-100 text-emerald-900" };
    case "PERLU_PERBAIKAN":
      return { label: "Perlu Perbaikan", cls: "border-rose-300 bg-rose-100 text-rose-900" };
    default:
      return { label: "Menunggu Dinas", cls: "border-amber-300 bg-amber-100 text-amber-900" };
  }
}

export function DinasLogin({ onAuthenticated }: { onAuthenticated?: (nama: string) => void } = {}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetchWithTimeout("/api/auth/dinas/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        token?: string;
        nama?: string;
        email?: string | null;
        peran?: string;
        wilayahKabupaten?: string | null;
        isSuperAdmin?: boolean;
      } | null;
      if (!response.ok) {
        throw new Error(body?.error || "Login Portal Dinas Pendidikan gagal.");
      }
      if (body?.nama) {
        saveAuthCache<DinasAuthCache>("dinas", {
          token: body.token,
          nama: body.nama,
          email: body.email ?? email,
          peran: body.peran ?? "DINAS",
          wilayahKabupaten: body.wilayahKabupaten ?? null,
          isSuperAdmin: body.isSuperAdmin === true,
          updatedAt: Date.now(),
        });
      }
      setPassword("");
      if (onAuthenticated) {
        onAuthenticated(body?.nama ?? "Verifikator Dinas");
      } else {
        navigate("/dinas");
      }
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Gagal masuk ke Portal Dinas Pendidikan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="master-auth glass-login-shell flex min-h-screen items-center justify-center px-5 py-5">
      <div className="master-login glass-login w-full max-w-md rounded-2xl p-6">
        <span className="master-logo">
          <Landmark size={21} />
        </span>
        <p className="master-eyebrow mt-4">KESETARAAN LMS / PORTAL DINAS PENDIDIKAN</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Login Verifikator Dinas</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Masuk dengan akun Dinas Pendidikan Kabupaten/Kota untuk memverifikasi kelengkapan berkas administrasi PKBM di wilayah Anda.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block text-sm font-semibold text-slate-200">
            Email Dinas
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="master-field mt-2 w-full rounded-xl px-4 py-2.5"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-200">
            Kata sandi
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="master-field mt-2 w-full rounded-xl px-4 py-2.5"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
          <button disabled={busy} className="master-primary w-full py-3 disabled:opacity-50">
            {busy ? "Memeriksa..." : "Masuk Portal Dinas"}
          </button>
        </form>
        <p className="mt-4 rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
          Akun uji sandbox Kab. Bandung: <code className="font-mono text-cyan-300">dinas.sandbox@pkbm.siput.id</code> · sandi{" "}
          <code className="font-mono text-cyan-300">123456</code>
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold text-indigo-200 underline">
          Kembali ke beranda
        </Link>
      </div>
    </main>
  );
}

export function DinasHome() {
  const initialAuth = getAuthCache<DinasAuthCache>("dinas");
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "error">(() =>
    initialAuth ? "ready" : "loading",
  );
  const [petugasNama, setPetugasNama] = useState(() => initialAuth?.nama ?? "Verifikator Dinas");
  const [wilayahFilter, setWilayahFilter] = useState("");
  const [summary, setSummary] = useState<DinasSummaryResponse | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [exporting, setExporting] = useState(false);

  const [selectedPkbm, setSelectedPkbm] = useState<PkbmSummary | null>(null);
  const [pkbmStudents, setPkbmStudents] = useState<DinasStudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState("");

  const [inspectStudent, setInspectStudent] = useState<DinasStudentRow | null>(null);
  const [catatanInput, setCatatanInput] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [docTab, setDocTab] = useState<"kk" | "akta" | "ijazah" | "pindah">("kk");
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchWithTimeout("/api/auth/dinas/session", { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) {
          clearAuthCache("dinas");
          setStatus("unauthorized");
          return;
        }
        if (!res.ok) throw new Error("Gagal memeriksa sesi Dinas Pendidikan.");
        const data = (await res.json()) as {
          nama?: string;
          email?: string | null;
          peran?: string;
          wilayahKabupaten?: string | null;
          isSuperAdmin?: boolean;
        };
        if (data.nama) {
          setPetugasNama(data.nama);
          saveAuthCache<DinasAuthCache>("dinas", {
            token: initialAuth?.token,
            nama: data.nama,
            email: data.email ?? null,
            peran: data.peran ?? "DINAS",
            wilayahKabupaten: data.wilayahKabupaten ?? null,
            isSuperAdmin: data.isSuperAdmin === true,
            updatedAt: Date.now(),
          });
        }
        setStatus("ready");
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal) && !initialAuth) {
          setError(describeFetchError(failure, "Sesi Dinas Pendidikan tidak tersedia."));
          setStatus("error");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    const qs = wilayahFilter ? `?kabupaten=${encodeURIComponent(wilayahFilter)}` : "";
    fetchWithTimeout(`/api/dinas/ringkasan${qs}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) {
          clearAuthCache("dinas");
          setStatus("unauthorized");
          return;
        }
        const body = (await res.json().catch(() => null)) as (DinasSummaryResponse & { error?: string }) | null;
        if (!res.ok || !body?.kpi) {
          throw new Error(body?.error || "Ringkasan wilayah Dinas Pendidikan belum dapat dimuat.");
        }
        setSummary(body);
        setError("");
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setError(describeFetchError(failure, "Ringkasan Portal Dinas Pendidikan belum tersedia."));
        }
      });
    return () => controller.abort();
  }, [status, wilayahFilter, reloadTick]);

  useEffect(() => {
    if (!selectedPkbm) return;
    const controller = new AbortController();
    setStudentsLoading(true);
    const params = new URLSearchParams({
      ...(studentStatusFilter ? { statusVervalDinas: studentStatusFilter } : {}),
      ...(studentSearch.trim() ? { q: studentSearch.trim() } : {}),
    });
    fetchWithTimeout(`/api/dinas/pkbm/${encodeURIComponent(selectedPkbm.id)}/siswa?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { error?: string; siswa?: DinasStudentRow[] } | null;
        if (!res.ok || !body?.siswa) {
          throw new Error(body?.error || "Daftar siswa PKBM belum dapat dimuat.");
        }
        setPkbmStudents(body.siswa);
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setError(describeFetchError(failure, "Daftar siswa PKBM tidak tersedia."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setStudentsLoading(false);
      });
    return () => controller.abort();
  }, [selectedPkbm, studentStatusFilter, studentSearch, reloadTick]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function logout() {
    try {
      await fetchWithTimeout("/api/auth/dinas/logout", { method: "POST" });
    } catch {
      // Clear local cache even if logout request times out
    }
    clearAuthCache("dinas");
    setSummary(null);
    setSelectedPkbm(null);
    setStatus("unauthorized");
  }

  async function handleExportRekap() {
    if (!summary) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = summary.pkbm.map((item, index) => ({
        No: index + 1,
        "Nama PKBM": item.nama,
        NPSN: item.npsn ?? "-",
        "Kabupaten/Kota": item.kabupatenKota ?? "-",
        "Hasil Tarik Dapodik": item.totalSiswaDapodik,
        "Total Siswa LMS": item.totalSiswa,
        "Berkas Lengkap": item.berkasLengkapCount,
        "Tanpa Berkas": item.tanpaBerkasCount,
        "Paket A": item.paketA,
        "Paket B": item.paketB,
        "Paket C": item.paketC,
        "Memenuhi Cut-Off": item.siswaMemenuhiCutoff,
        "Kelengkapan Verval (%)": `${item.kelengkapanVervalPersen}%`,
        "Lolos Verval Dinas": item.lolosDinasCount,
        "Persentase Lolos Dinas": `${item.persentaseLolosDinas}%`,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rekap Verval Wilayah");
      const safeRegion = summary.wilayah.replace(/[^a-z0-9-_]/gi, "_").toLowerCase();
      XLSX.writeFile(wb, `rekap-verval-dinas-${safeRegion}.xlsx`);
      setToast("Rekap verval kabupaten/kota berhasil diekspor (.xlsx).");
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Gagal mengekspor rekap kabupaten/kota."));
    } finally {
      setExporting(false);
    }
  }

  async function submitDinasDecision(statusVervalDinas: VervalDinasStatus) {
    if (!inspectStudent) return;
    setActionBusy(true);
    setActionError("");
    try {
      const res = await fetchWithTimeout(`/api/dinas/siswa/${encodeURIComponent(inspectStudent.id)}/verval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statusVervalDinas,
          catatanDinas: catatanInput.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error || "Gagal menyimpan hasil verval Dinas.");
      }
      setToast(body?.message || "Status verval Dinas diperbarui.");
      setInspectStudent(null);
      setCatatanInput("");
      setReloadTick((v) => v + 1);
    } catch (failure: unknown) {
      setActionError(describeFetchError(failure, "Gagal memperbarui verifikasi Dinas."));
    } finally {
      setActionBusy(false);
    }
  }

  if (status === "unauthorized") {
    return (
      <DinasLogin
        onAuthenticated={(nama) => {
          setPetugasNama(nama);
          setStatus("ready");
          setReloadTick((v) => v + 1);
        }}
      />
    );
  }
  if (status === "loading") return <PortalSpinner label="Memuat Portal Dinas Pendidikan" />;
  if (status !== "ready") {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        {error || "Sesi Portal Dinas Pendidikan tidak tersedia."}
      </main>
    );
  }

  return (
    <main data-tenant-theme="dark" className="dashboard-canvas glass-area min-h-screen text-slate-100">
      <header className="dashboard-header sticky top-0 z-30 border-b border-white/10 bg-slate-950/75 px-5 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-md">
              <Landmark size={20} />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-300">
                PORTAL VERVAL WILAYAH · DINAS PENDIDIKAN
              </p>
              <h1 className="text-sm font-extrabold text-white sm:text-base">
                {summary ? summary.wilayah : "Memuat Wilayah..."}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {summary?.petugas.isSuperAdmin && summary.availableWilayah.length > 0 && (
              <select
                aria-label="Pilih Wilayah Kabupaten/Kota"
                value={wilayahFilter}
                onChange={(e) => {
                  setSelectedPkbm(null);
                  setWilayahFilter(e.target.value);
                }}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-100"
              >
                <option value="">Semua Wilayah</option>
                {summary.availableWilayah.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            )}
            <span className="hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 sm:inline-block">
              {petugasNama}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/25"
            >
              <LogOut size={14} /> Keluar
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-7">
        {/* Baris 1: Hero */}
        <DashboardHero
          eyebrow="VERIFIKASI & VALIDASI KESETARAAN WILAYAH (ADMINISTRATIF)"
          title="Dashboard Dinas Pendidikan"
          description={`Pantau kesiapan berkas administrasi (KK, Akta/KTP, Ijazah, Surat Pindah), hasil tarik Dapodik, dan cut-off pendaftaran (${summary?.cutoffDate ?? "31 Agustus"}) PKBM wilayah Anda.`}
          badge={summary ? `Wilayah: ${summary.wilayah}` : "Portal Dinas"}
          action={
            <button
              type="button"
              disabled={!summary || summary.pkbm.length === 0 || exporting}
              onClick={() => void handleExportRekap()}
              className="dashboard-hero-action disabled:opacity-50"
            >
              <FileSpreadsheet size={15} aria-hidden="true" />
              {exporting ? "Menyiapkan..." : "Export Rekap Verval Kabupaten"}
            </button>
          }
        />

        {toast && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-600/90 px-4 py-3 text-sm font-bold text-white shadow-lg">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              {toast}
            </span>
            <button type="button" onClick={() => setToast("")}>
              <X size={16} />
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-2xl border border-rose-400/40 bg-rose-950/60 p-4 text-sm font-semibold text-rose-200">
            {error}
          </p>
        )}

        {/* Baris 2: 4 Kartu KPI Regional */}
        {!summary ? (
          <CardGridSkeleton count={4} columns={4} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="dashboard-glass rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-300">
                <span>Total PKBM Terdaftar</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300">
                  <Building2 size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black text-white">{summary.kpi.totalPkbm}</p>
              <p className="mt-1 text-xs text-slate-300">Lembaga aktif dengan izin verval Dinas</p>
            </article>

            <article className="dashboard-glass rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-300">
                <span>Total Warga Belajar</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">
                  <Users size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black text-white">{summary.kpi.totalWargaBelajar}</p>
              <p className="mt-1 text-xs text-slate-300">
                Paket A: {summary.kpi.totalPaketA} · B: {summary.kpi.totalPaketB} · C: {summary.kpi.totalPaketC}
              </p>
            </article>

            <article className="dashboard-glass rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-300">
                <span>Memenuhi Cut-Off</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
                  <CalendarCheck2 size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black text-amber-300">{summary.kpi.totalCutoff}</p>
              <p className="mt-1 text-xs text-slate-300">Tanggal masuk &le; {summary.cutoffDate}</p>
            </article>

            <article className="dashboard-glass rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-300">
                <span>Lolos Verval Dinas</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                  <ShieldCheck size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black text-emerald-300">{summary.kpi.persentaseLolosVerval}%</p>
              <p className="mt-1 text-xs text-slate-300">
                {summary.kpi.totalLolosDinas} dari {summary.kpi.totalWargaBelajar} warga belajar
              </p>
            </article>
          </div>
        )}

        {/* Baris 3: Tabel Monitoring PKBM */}
        <section className="dashboard-glass space-y-4 rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-white">Monitoring Kesiapan Verval per PKBM</h2>
              <p className="mt-0.5 text-xs text-slate-300">
                Klik &ldquo;Periksa Berkas&rdquo; pada lembaga untuk memeriksa berkas warga belajar secara nominatif.
              </p>
            </div>
          </div>

          {!summary ? (
            <TableSkeleton rows={4} columns={6} />
          ) : summary.pkbm.length === 0 ? (
            <EmptyState
              title="Belum ada PKBM aktif di wilayah ini"
              description="Minta Master Admin menetapkan kabupaten/kota pada tenant PKBM terkait agar muncul pada rekap Dinas."
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-700/70 bg-slate-900/75">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-700 bg-slate-800/90 text-xs font-extrabold uppercase tracking-wider text-slate-200">
                  <tr>
                    <th className="px-4 py-3.5">PKBM / NPSN</th>
                    <th className="px-4 py-3.5">Warga Belajar (A / B / C)</th>
                    <th className="px-4 py-3.5">Cut-Off</th>
                    <th className="px-4 py-3.5">Kelengkapan Data</th>
                    <th className="px-4 py-3.5">Lolos Dinas</th>
                    <th className="px-4 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {summary.pkbm.map((item) => (
                    <tr
                      key={item.id}
                      className={selectedPkbm?.id === item.id ? "bg-indigo-500/15" : "hover:bg-slate-800/50"}
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-white">{item.nama}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          NPSN: {item.npsn ?? "—"} · {item.kabupatenKota ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-200">
                        <span className="font-extrabold text-white">{item.totalSiswa} siswa</span>
                        <span className="ml-1.5 text-cyan-300">(Dapodik: {item.totalSiswaDapodik})</span>
                        <p className="mt-0.5 text-slate-400">
                          A: {item.paketA} · B: {item.paketB} · C: {item.paketC}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-bold text-amber-300">{item.siswaMemenuhiCutoff} siswa</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-700">
                            <div
                              className="h-full rounded-full bg-cyan-400"
                              style={{ width: `${item.kelengkapanVervalPersen}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-white">{item.kelengkapanVervalPersen}%</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Berkas lengkap: {item.berkasLengkapCount} · Tanpa berkas: {item.tanpaBerkasCount}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        <span className="font-extrabold text-emerald-300">{item.persentaseLolosDinas}%</span>
                        <p className="mt-0.5 text-slate-400">
                          {item.lolosDinasCount} lolos · {item.perluPerbaikanCount} perbaikan
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPkbm(item);
                            setStudentSearch("");
                            setStudentStatusFilter("");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                        >
                          <Eye size={14} /> Periksa Berkas
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Baris 4: Panel Pemeriksaan Nominatif PKBM Terpilih */}
        {selectedPkbm && (
          <section className="dashboard-glass space-y-4 rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/70 pb-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-300">
                  PEMERIKSAAN NOMINATIF LEMBAGA
                </p>
                <h2 className="mt-1 text-lg font-extrabold text-white">
                  {selectedPkbm.nama} (NPSN: {selectedPkbm.npsn ?? "—"})
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Cari nama/NISN/NIK..."
                    className="rounded-xl border border-slate-700 bg-slate-900 py-2 pl-8 pr-3 text-xs text-white"
                  />
                </div>
                <select
                  aria-label="Filter Status Verval Dinas"
                  value={studentStatusFilter}
                  onChange={(e) => setStudentStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                >
                  <option value="">Semua Status Dinas</option>
                  <option value="MENUNGGU_DINAS">Menunggu Dinas</option>
                  <option value="LOLOS_VERVAL">Lolos Verval</option>
                  <option value="PERLU_PERBAIKAN">Perlu Perbaikan</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSelectedPkbm(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
                >
                  Tutup Panel
                </button>
              </div>
            </div>

            {studentsLoading ? (
              <TableSkeleton rows={4} columns={5} />
            ) : pkbmStudents.length === 0 ? (
              <EmptyState
                title="Tidak ada data warga belajar"
                description="Belum ada siswa aktif yang cocok dengan filter status Dinas atau pencarian Anda."
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-700/70 bg-slate-900/75">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-700 bg-slate-800/90 text-xs font-extrabold uppercase tracking-wider text-slate-200">
                    <tr>
                      <th className="px-4 py-3">Warga Belajar</th>
                      <th className="px-4 py-3">NIK / KK / Ibu</th>
                      <th className="px-4 py-3">Paket &amp; Cut-Off</th>
                      <th className="px-4 py-3">Berkas</th>
                      <th className="px-4 py-3">Status Dinas</th>
                      <th className="px-4 py-3 text-right">Verifikasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {pkbmStudents.map((st) => {
                      const badge = statusDinasBadge(st.statusVervalDinas);
                      return (
                        <tr key={st.id} className="hover:bg-slate-800/50">
                          <td className="px-4 py-3">
                            <p className="font-bold text-white">{st.nama}</p>
                            <p className="text-xs text-slate-400">NISN {st.nisn} · {st.kelengkapanPersen}% lengkap</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300">
                            <p className="font-mono">NIK: {st.nik ?? "—"}</p>
                            <p className="font-mono">KK: {st.noKk ?? "—"}</p>
                            <p className="text-slate-400">Ibu: {st.namaIbuKandung ?? "—"}</p>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <p className="font-bold text-white">{st.paketKategori} · {st.kelasNama}</p>
                            <p className={st.memenuhiCutoff ? "text-emerald-300" : "text-slate-400"}>
                              {st.memenuhiCutoff ? "Memenuhi Cut-Off" : "Di luar Cut-Off / Kosong"}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                              <span className={`rounded px-1.5 py-0.5 ${st.urlKk ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-500"}`}>
                                KK
                              </span>
                              <span className={`rounded px-1.5 py-0.5 ${st.urlAktaKtp ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-500"}`}>
                                Akta
                              </span>
                              <span className={`rounded px-1.5 py-0.5 ${st.urlIjazah ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-500"}`}>
                                Ijazah
                              </span>
                              <span className={`rounded px-1.5 py-0.5 ${st.urlSuratPindah ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-500"}`}>
                                Surat Pindah
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.cls}`}>
                              {badge.label}
                            </span>
                            {st.catatanDinas && (
                              <p className="mt-1 max-w-[180px] truncate text-[11px] text-rose-300" title={st.catatanDinas}>
                                {st.catatanDinas}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setInspectStudent(st);
                                setCatatanInput(st.catatanDinas ?? "");
                                setActionError("");
                                setDocTab(
                                  st.urlKk
                                    ? "kk"
                                    : st.urlAktaKtp
                                      ? "akta"
                                      : st.urlIjazah
                                        ? "ijazah"
                                        : st.urlSuratPindah
                                          ? "pindah"
                                          : "kk",
                                );
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25"
                            >
                              <FileText size={13} /> Cek &amp; Putuskan
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {inspectStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
                  VERIFIKASI DINAS PENDIDIKAN
                </p>
                <h3 className="text-lg font-extrabold text-white">{inspectStudent.nama}</h3>
              </div>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setInspectStudent(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs">
              <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-2">
                <p><span className="text-slate-400">NISN:</span> <strong className="font-mono text-white">{inspectStudent.nisn}</strong></p>
                <p><span className="text-slate-400">NIK:</span> <strong className="font-mono text-white">{inspectStudent.nik ?? "—"}</strong></p>
                <p><span className="text-slate-400">No. KK:</span> <strong className="font-mono text-white">{inspectStudent.noKk ?? "—"}</strong></p>
                <p><span className="text-slate-400">Ibu Kandung:</span> <strong className="text-white">{inspectStudent.namaIbuKandung ?? "—"}</strong></p>
                <p><span className="text-slate-400">Sekolah Asal:</span> <strong className="text-white">{inspectStudent.sekolahAsal ?? "—"}</strong></p>
                <p><span className="text-slate-400">No. Ijazah:</span> <strong className="text-white">{inspectStudent.nomorIjazahTerakhir ?? "—"}</strong></p>
                <p><span className="text-slate-400">Status PKBM:</span> <strong className="text-cyan-300">{inspectStudent.statusVerval}</strong></p>
                <p><span className="text-slate-400">Tanggal Masuk:</span> <strong className="text-white">{inspectStudent.tanggalMasuk ?? "—"}</strong></p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <span className="font-extrabold uppercase tracking-wider text-slate-300">Pratinjau Berkas</span>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { id: "kk", label: "KK", url: inspectStudent.urlKk },
                      { id: "akta", label: "Akta / KTP", url: inspectStudent.urlAktaKtp },
                      { id: "ijazah", label: "Ijazah", url: inspectStudent.urlIjazah },
                      { id: "pindah", label: "Surat Pindah", url: inspectStudent.urlSuratPindah },
                    ] as const).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setDocTab(tab.id)}
                        className={`rounded-lg px-3 py-1 font-bold ${
                          docTab === tab.id ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const u =
                    docTab === "kk"
                      ? inspectStudent.urlKk
                      : docTab === "akta"
                        ? inspectStudent.urlAktaKtp
                        : docTab === "ijazah"
                          ? inspectStudent.urlIjazah
                          : inspectStudent.urlSuratPindah;
                  if (!u) return <p className="py-6 text-center text-slate-400">Berkas belum diunggah.</p>;
                  if (u.startsWith("data:application/pdf") || u.toLowerCase().endsWith(".pdf")) {
                    return <iframe src={u} title="Pratinjau PDF" className="mt-3 h-64 w-full rounded-xl bg-white" />;
                  }
                  if (u.startsWith("data:image/") || /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(u)) {
                    return <img src={u} alt="Pratinjau Berkas" className="mx-auto mt-3 max-h-64 rounded-xl object-contain" />;
                  }
                  return (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-slate-900 p-3">
                      <span className="break-all font-mono text-cyan-200">{u}</span>
                      {u.startsWith("http") && (
                        <a href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-indigo-300 underline">
                          Buka <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  );
                })()}
              </div>

              <label className="block font-bold text-slate-200">
                Catatan Pemeriksaan Dinas (Wajib diisi jika Minta Perbaikan)
                <textarea
                  rows={2}
                  maxLength={500}
                  value={catatanInput}
                  onChange={(e) => setCatatanInput(e.target.value)}
                  placeholder="Contoh: Scan KK buram, mohon unggah ulang yang lebih jelas."
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white"
                />
              </label>

              {actionError && <p role="alert" className="font-semibold text-rose-300">{actionError}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-950/80 px-6 py-4">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void submitDinasDecision("MENUNGGU_DINAS")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                <RotateCcw size={13} /> Reset Menunggu
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void submitDinasDecision("PERLU_PERBAIKAN")}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  Minta Perbaikan
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void submitDinasDecision("LOLOS_VERVAL")}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Loloskan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
