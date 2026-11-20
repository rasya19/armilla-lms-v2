import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  ExternalLink,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Inbox,
  Landmark,
  LogOut,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { PortalSpinner } from "./DashboardUI";
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
  totalDapodik: number;
  totalSiswaDapodik: number;
  berkasLengkap: number;
  berkasLengkapCount: number;
  selisihTanpaBerkas: number;
  tanpaBerkasCount: number;
  paketA: number;
  paketB: number;
  paketC: number;
  siswaMemenuhiCutoff: number;
  belumLengkapCount: number;
  siapVerifikasiCount: number;
  terverifikasiPkbmCount: number;
  kelengkapanVervalPersen: number;
  lolosVervalDinas: number;
  lolosDinasCount: number;
  perluPerbaikanCount: number;
  menungguDinasCount: number;
  persentaseLolosDinas: number;
  isDemoSimulation?: boolean;
};

type DinasSummaryResponse = {
  wilayah: string;
  availableWilayah: string[];
  cutoffDate: string;
  petugas: { nama: string; peran: string; isSuperAdmin: boolean };
  kpi: {
    totalPkbm: number;
    totalWargaBelajar: number;
    totalDapodik: number;
    totalDapodikTarik: number;
    totalBerkasLengkap: number;
    totalSelisihTanpaBerkas: number;
    totalPaketA: number;
    totalPaketB: number;
    totalPaketC: number;
    totalCutoff: number;
    totalLolosVervalDinas: number;
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
  isDemoSimulation?: boolean;
};

function makeDemoDocPreviewUrl(title: string, holder: string, docNumber: string): string {
  const safe = (v: string) => v.replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <rect width="640" height="360" rx="18" fill="#0f172a"/>
    <rect x="18" y="18" width="604" height="324" rx="14" fill="#1e293b" stroke="#334155" stroke-width="2"/>
    <text x="42" y="64" fill="#38bdf8" font-family="sans-serif" font-size="14" font-weight="bold">PRATINJAU ARSIP ADMINISTRASI SIMULASI</text>
    <text x="42" y="106" fill="#f8fafc" font-family="sans-serif" font-size="24" font-weight="bold">${safe(title)}</text>
    <text x="42" y="156" fill="#cbd5e1" font-family="sans-serif" font-size="16">Pemilik Berkas: ${safe(holder)}</text>
    <text x="42" y="190" fill="#94a3b8" font-family="monospace" font-size="15">Nomor Dokumen: ${safe(docNumber)}</text>
    <rect x="42" y="230" width="556" height="72" rx="10" fill="#0f172a" stroke="#10b981" stroke-opacity="0.45"/>
    <text x="60" y="264" fill="#34d399" font-family="sans-serif" font-size="14" font-weight="bold">TERVALIDASI SEBAGAI CONTOH PAPARAN DIKMAS</text>
    <text x="60" y="286" fill="#94a3b8" font-family="sans-serif" font-size="12">Hanya menampilkan metadata &amp; dokumen administratif (non-KBM)</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildDemoSimulationDataset(wilayah: string, cutoffDate: string): {
  pkbm: PkbmSummary[];
  studentsByPkbmId: Record<string, DinasStudentRow[]>;
} {
  const regionLabel = wilayah && wilayah !== "Semua Wilayah" ? wilayah : "Kabupaten Bandung";
  const pkbmList: PkbmSummary[] = [
    {
      id: "demo-pkbm-bina-harapan",
      nama: "PKBM Bina Harapan Bangsa",
      npsn: "P2029901",
      slug: "demo-bina-harapan",
      plan: "pro",
      kabupatenKota: regionLabel,
      totalSiswa: 100,
      totalDapodik: 100,
      totalSiswaDapodik: 100,
      berkasLengkap: 40,
      berkasLengkapCount: 40,
      selisihTanpaBerkas: 60,
      tanpaBerkasCount: 42,
      paketA: 15,
      paketB: 35,
      paketC: 50,
      siswaMemenuhiCutoff: 88,
      belumLengkapCount: 45,
      siapVerifikasiCount: 15,
      terverifikasiPkbmCount: 40,
      kelengkapanVervalPersen: 58,
      lolosVervalDinas: 32,
      lolosDinasCount: 32,
      perluPerbaikanCount: 18,
      menungguDinasCount: 50,
      persentaseLolosDinas: 32,
      isDemoSimulation: true,
    },
    {
      id: "demo-pkbm-cendekia",
      nama: "PKBM Cendekia Nusantara",
      npsn: "P2029902",
      slug: "demo-cendekia",
      plan: "reguler",
      kabupatenKota: regionLabel,
      totalSiswa: 60,
      totalDapodik: 60,
      totalSiswaDapodik: 60,
      berkasLengkap: 48,
      berkasLengkapCount: 48,
      selisihTanpaBerkas: 12,
      tanpaBerkasCount: 5,
      paketA: 10,
      paketB: 18,
      paketC: 32,
      siswaMemenuhiCutoff: 56,
      belumLengkapCount: 8,
      siapVerifikasiCount: 4,
      terverifikasiPkbmCount: 48,
      kelengkapanVervalPersen: 86,
      lolosVervalDinas: 44,
      lolosDinasCount: 44,
      perluPerbaikanCount: 4,
      menungguDinasCount: 12,
      persentaseLolosDinas: 73,
      isDemoSimulation: true,
    },
  ];

  const studentsByPkbmId: Record<string, DinasStudentRow[]> = {
    "demo-pkbm-bina-harapan": [
      {
        id: "demo-st-1",
        nisn: "0048129011",
        nama: "Rizky Pratama",
        nik: "3204120905040001",
        noKk: "3204121108150023",
        tempatLahir: "Bandung",
        tanggalLahir: "2004-05-09",
        jenisKelamin: "L",
        jenjang: "Paket C",
        paketKategori: "Paket C",
        kelasNama: "Paket C XII",
        tanggalMasuk: `${cutoffDate.slice(0, 4)}-07-14`,
        memenuhiCutoff: true,
        namaIbuKandung: "Nining Suryani",
        alamatLengkap: "Kp. Sukamaju RT 02/05",
        desaKelurahan: "Cileunyi Kulon",
        kecamatan: "Cileunyi",
        sekolahAsal: "SMPN 1 Cileunyi",
        npsnAsal: "20206123",
        nomorIjazahTerakhir: "DN-02/SMP/2020/00412",
        sumberDapodik: true,
        urlKk: makeDemoDocPreviewUrl("Kartu Keluarga (KK)", "Rizky Pratama", "3204121108150023"),
        urlAktaKtp: makeDemoDocPreviewUrl("Akta Kelahiran / KTP", "Rizky Pratama", "3204-LT-20040509"),
        urlIjazah: makeDemoDocPreviewUrl("Ijazah SMP / Paket B", "Rizky Pratama", "DN-02/SMP/2020/00412"),
        urlSuratPindah: makeDemoDocPreviewUrl("Surat Keterangan Pindah (SKP)", "Rizky Pratama", "421.3/SKP-018"),
        statusVerval: "TERVERIFIKASI_PKBM",
        catatanVerval: "Dokumen fisik lengkap & diverifikasi operator.",
        statusVervalDinas: "LOLOS_VERVAL",
        catatanDinas: "Berkas administrasi lengkap, NIK/KK padan dan sesuai cut-off.",
        kelengkapanPersen: 100,
        isDemoSimulation: true,
      },
      {
        id: "demo-st-2",
        nisn: "0059238144",
        nama: "Siti Nurhaliza",
        nik: "3204185408050002",
        noKk: "3204182203140019",
        tempatLahir: "Soreang",
        tanggalLahir: "2005-08-14",
        jenisKelamin: "P",
        jenjang: "Paket C",
        paketKategori: "Paket C",
        kelasNama: "Paket C XI",
        tanggalMasuk: `${cutoffDate.slice(0, 4)}-08-10`,
        memenuhiCutoff: true,
        namaIbuKandung: "Euis Kartika",
        alamatLengkap: "Jl. Gading Tutuka No. 18",
        desaKelurahan: "Pamekaran",
        kecamatan: "Soreang",
        sekolahAsal: "MTs Al-Ikhlas",
        npsnAsal: "20278011",
        nomorIjazahTerakhir: null,
        sumberDapodik: true,
        urlKk: makeDemoDocPreviewUrl("Kartu Keluarga (KK)", "Siti Nurhaliza", "3204182203140019"),
        urlAktaKtp: makeDemoDocPreviewUrl("Akta Kelahiran / KTP", "Siti Nurhaliza", "3204-LT-20050814"),
        urlIjazah: null,
        urlSuratPindah: null,
        statusVerval: "SIAP_VERVAL",
        catatanVerval: "Menunggu scan ijazah terakhir dari warga belajar.",
        statusVervalDinas: "PERLU_PERBAIKAN",
        catatanDinas: "Scan Ijazah/SKHUN sebelumnya belum diunggah untuk verifikasi syarat Paket C.",
        kelengkapanPersen: 80,
        isDemoSimulation: true,
      },
      {
        id: "demo-st-3",
        nisn: "0067114902",
        nama: "Deden Kurniawan (Anomali Tanpa Berkas)",
        nik: "3204251203030009",
        noKk: null,
        tempatLahir: "Banjaran",
        tanggalLahir: "2003-03-12",
        jenisKelamin: "L",
        jenjang: "Paket B",
        paketKategori: "Paket B",
        kelasNama: "Paket B IX",
        tanggalMasuk: `${cutoffDate.slice(0, 4)}-08-29`,
        memenuhiCutoff: true,
        namaIbuKandung: null,
        alamatLengkap: null,
        desaKelurahan: null,
        kecamatan: "Banjaran",
        sekolahAsal: null,
        npsnAsal: null,
        nomorIjazahTerakhir: null,
        sumberDapodik: true,
        urlKk: null,
        urlAktaKtp: null,
        urlIjazah: null,
        urlSuratPindah: null,
        statusVerval: "BELUM_LENGKAP",
        catatanVerval: "Tercatat pada tarikan Dapodik, belum ada berkas fisik (KK/Akta/Ijazah).",
        statusVervalDinas: "MENUNGGU_DINAS",
        catatanDinas: null,
        kelengkapanPersen: 20,
        isDemoSimulation: true,
      },
    ],
    "demo-pkbm-cendekia": [
      {
        id: "demo-st-4",
        nisn: "0051120088",
        nama: "Asep Saepudin",
        nik: "3204081102050004",
        noKk: "3204080401120077",
        tempatLahir: "Majalaya",
        tanggalLahir: "2005-02-11",
        jenisKelamin: "L",
        jenjang: "Paket B",
        paketKategori: "Paket B",
        kelasNama: "Paket B VIII",
        tanggalMasuk: `${cutoffDate.slice(0, 4)}-07-18`,
        memenuhiCutoff: true,
        namaIbuKandung: "Ai Rohaeti",
        alamatLengkap: "Kp. Biru No. 45",
        desaKelurahan: "Biru",
        kecamatan: "Majalaya",
        sekolahAsal: "SDN Biru 01",
        npsnAsal: "20206789",
        nomorIjazahTerakhir: "DN-02/SD/2018/00918",
        sumberDapodik: true,
        urlKk: makeDemoDocPreviewUrl("Kartu Keluarga (KK)", "Asep Saepudin", "3204080401120077"),
        urlAktaKtp: makeDemoDocPreviewUrl("Akta Kelahiran / KTP", "Asep Saepudin", "3204-LT-20050211"),
        urlIjazah: makeDemoDocPreviewUrl("Ijazah SD / Paket A", "Asep Saepudin", "DN-02/SD/2018/00918"),
        urlSuratPindah: null,
        statusVerval: "TERVERIFIKASI_PKBM",
        catatanVerval: "Sesuai dokumen asli.",
        statusVervalDinas: "LOLOS_VERVAL",
        catatanDinas: "Memenuhi syarat administrasi & cut-off 31 Agustus.",
        kelengkapanPersen: 93,
        isDemoSimulation: true,
      },
    ],
  };

  return { pkbm: pkbmList, studentsByPkbmId };
}

function statusDinasBadge(status: VervalDinasStatus): { label: string; cls: string } {
  switch (status) {
    case "LOLOS_VERVAL":
      return { label: "Lolos Verval", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" };
    case "PERLU_PERBAIKAN":
      return { label: "Perlu Perbaikan", cls: "border-rose-300 bg-rose-50 text-rose-800" };
    default:
      return { label: "Menunggu Dinas", cls: "border-amber-300 bg-amber-50 text-amber-900" };
  }
}

function DinasCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Menyiapkan ringkasan wilayah" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-2xl border border-white/90 bg-white/85 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="h-3.5 w-2/5 animate-pulse rounded-md bg-sky-100" />
            <div className="h-8 w-8 animate-pulse rounded-xl bg-sky-100" />
          </div>
          <div className="h-8 w-1/2 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-3 w-3/4 animate-pulse rounded-md bg-slate-200/80" />
        </div>
      ))}
      <span className="sr-only">Memuat ringkasan wilayah...</span>
    </div>
  );
}

function DinasTableSkeleton({ rows = 4, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Menyiapkan data tabel" className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
      <div className="space-y-3">
        <div className="grid gap-3 border-b border-slate-200 pb-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, index) => (
            <div key={index} className="h-3.5 animate-pulse rounded-md bg-sky-100" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid items-center gap-3 py-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((__, colIndex) => (
              <div key={colIndex} className={`h-4 animate-pulse rounded-lg bg-slate-200/80 ${colIndex === 0 ? "w-4/5" : "w-3/5"}`} />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Memuat tabel...</span>
    </div>
  );
}

function DinasEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-sky-300 bg-sky-50/70 px-5 py-9 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-xs">
        <Inbox size={22} />
      </span>
      <p className="mt-3 text-sm font-extrabold text-slate-950">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-xs font-medium leading-5 text-slate-700">{description}</p>
    </div>
  );
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
    <main
      data-tenant-theme="ocean"
      className="dashboard-canvas glass-login-shell flex min-h-screen items-center justify-center px-5 py-6 text-slate-900 antialiased"
      style={{
        backgroundImage:
          "radial-gradient(rgba(37, 99, 235, 0.14) 1px, transparent 1px), linear-gradient(135deg, #eefaff 0%, #dceffa 52%, #edf5ff 100%)",
        backgroundSize: "22px 22px, 100% 100%",
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-white/95 bg-white/90 p-7 shadow-[0_24px_60px_rgba(37,99,235,0.14)] backdrop-blur-2xl">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25">
          <Landmark size={22} />
        </span>
        <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-700">
          KESETARAAN LMS / PORTAL DINAS PENDIDIKAN
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Login Verifikator Dinas</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-700">
          Masuk dengan akun Dinas Pendidikan Kabupaten/Kota untuk memverifikasi kelengkapan berkas administrasi PKBM di wilayah Anda.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-bold text-slate-900">
            Email Dinas
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </label>
          <label className="block text-sm font-bold text-slate-900">
            Kata sandi
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-input mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-sm font-extrabold text-white shadow-md shadow-blue-600/25 transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Memeriksa..." : "Masuk Portal Dinas"}
          </button>
        </form>
        <Link to="/" className="mt-5 inline-block text-sm font-bold text-blue-700 underline hover:text-blue-900">
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
  const [demoOverride, setDemoOverride] = useState<boolean | null>(null);
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
          setSummary(null);
          setError(describeFetchError(failure, "Ringkasan Portal Dinas Pendidikan belum tersedia."));
        }
      });
    return () => controller.abort();
  }, [status, wilayahFilter, reloadTick]);

  const hasZeroRealData = Boolean(summary && (summary.pkbm.length === 0 || summary.kpi.totalWargaBelajar === 0));
  const showDemoSimulation = demoOverride ?? hasZeroRealData;

  const demoDataset = useMemo(
    () => buildDemoSimulationDataset(summary?.wilayah ?? "Kabupaten Bandung", summary?.cutoffDate ?? "2026-08-31"),
    [summary?.wilayah, summary?.cutoffDate],
  );

  const displayedView = useMemo(() => {
    if (!summary) return null;
    if (!showDemoSimulation) {
      return {
        pkbm: summary.pkbm,
        kpi: summary.kpi,
      };
    }
    const combinedPkbm = [...summary.pkbm, ...demoDataset.pkbm];
    const totalPkbm = combinedPkbm.length;
    const totalWargaBelajar = combinedPkbm.reduce((acc, item) => acc + item.totalSiswa, 0);
    const totalDapodik = combinedPkbm.reduce((acc, item) => acc + item.totalDapodik, 0);
    const totalBerkasLengkap = combinedPkbm.reduce((acc, item) => acc + item.berkasLengkap, 0);
    const totalSelisihTanpaBerkas = combinedPkbm.reduce((acc, item) => acc + item.selisihTanpaBerkas, 0);
    const totalPaketA = combinedPkbm.reduce((acc, item) => acc + item.paketA, 0);
    const totalPaketB = combinedPkbm.reduce((acc, item) => acc + item.paketB, 0);
    const totalPaketC = combinedPkbm.reduce((acc, item) => acc + item.paketC, 0);
    const totalCutoff = combinedPkbm.reduce((acc, item) => acc + item.siswaMemenuhiCutoff, 0);
    const totalLolosVervalDinas = combinedPkbm.reduce((acc, item) => acc + item.lolosVervalDinas, 0);
    return {
      pkbm: combinedPkbm,
      kpi: {
        totalPkbm,
        totalWargaBelajar,
        totalDapodik,
        totalDapodikTarik: totalDapodik,
        totalBerkasLengkap,
        totalSelisihTanpaBerkas,
        totalPaketA,
        totalPaketB,
        totalPaketC,
        totalCutoff,
        totalLolosVervalDinas,
        totalLolosDinas: totalLolosVervalDinas,
        persentaseLolosVerval: totalWargaBelajar ? Math.round((totalLolosVervalDinas / totalWargaBelajar) * 100) : 0,
      },
    };
  }, [summary, showDemoSimulation, demoDataset]);

  useEffect(() => {
    if (!selectedPkbm) return;
    if (selectedPkbm.isDemoSimulation) {
      const baseRows = demoDataset.studentsByPkbmId[selectedPkbm.id] ?? [];
      const term = studentSearch.trim().toLowerCase();
      const filtered = baseRows.filter((row) => {
        if (studentStatusFilter && row.statusVervalDinas !== studentStatusFilter) return false;
        if (term) {
          const matches =
            row.nama.toLowerCase().includes(term) ||
            row.nisn.toLowerCase().includes(term) ||
            (row.nik ?? "").toLowerCase().includes(term);
          if (!matches) return false;
        }
        return true;
      });
      setStudentsLoading(false);
      setPkbmStudents(filtered);
      return;
    }

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
  }, [selectedPkbm, studentStatusFilter, studentSearch, reloadTick, demoDataset]);

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
    if (!summary || !displayedView) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = displayedView.pkbm.map((item, index) => ({
        No: index + 1,
        "Nama PKBM": item.isDemoSimulation ? `${item.nama} [Simulasi Demo]` : item.nama,
        Sumber: item.isDemoSimulation ? "Simulasi Demo" : "Database Riil",
        NPSN: item.npsn ?? "-",
        "Kabupaten/Kota": item.kabupatenKota ?? "-",
        "Total Dapodik": item.totalDapodik,
        "Total Siswa LMS": item.totalSiswa,
        "Berkas Lengkap": item.berkasLengkap,
        "Selisih Tanpa Berkas": item.selisihTanpaBerkas,
        "Paket A": item.paketA,
        "Paket B": item.paketB,
        "Paket C": item.paketC,
        "Memenuhi Cut-Off": item.siswaMemenuhiCutoff,
        "Kelengkapan Verval (%)": `${item.kelengkapanVervalPersen}%`,
        "Lolos Verval Dinas": item.lolosVervalDinas,
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
    if (inspectStudent.isDemoSimulation) {
      setToast("Mode Simulasi Demo bersifat pratinjau paparan — gunakan data PKBM riil untuk menyimpan keputusan ke database.");
      setInspectStudent(null);
      return;
    }
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
      <main
        data-tenant-theme="ocean"
        className="dashboard-canvas flex min-h-screen items-center justify-center p-8 text-slate-900 antialiased"
      >
        <div className="max-w-md rounded-2xl border border-white/95 bg-white/90 p-6 shadow-xl backdrop-blur-xl">
          <p className="text-sm font-bold text-rose-700">{error || "Sesi Portal Dinas Pendidikan tidak tersedia."}</p>
        </div>
      </main>
    );
  }

  return (
    <main
      data-tenant-theme="ocean"
      className="dashboard-canvas min-h-screen pb-10 text-slate-900 antialiased"
      style={{
        backgroundImage:
          "radial-gradient(rgba(37, 99, 235, 0.14) 1px, transparent 1px), linear-gradient(135deg, #eefaff 0%, #dceffa 52%, #edf5ff 100%)",
        backgroundSize: "22px 22px, 100% 100%",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 sm:pt-4">
        <header className="sticky top-3 z-30 rounded-2xl border border-white/95 bg-white/88 px-4 py-3 shadow-[0_8px_30px_rgba(37,99,235,0.08)] backdrop-blur-xl sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25">
                <Landmark size={20} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-sm font-extrabold tracking-tight text-slate-950 sm:text-base">
                    {summary ? summary.wilayah : "Portal Dinas Pendidikan"}
                  </h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Dinas Aktif
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] font-bold tracking-wide text-slate-600">
                  PORTAL VERVAL WILAYAH · DINAS PENDIDIKAN
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={showDemoSimulation}
                onClick={() => {
                  const next = !showDemoSimulation;
                  setDemoOverride(next);
                  if (!next && selectedPkbm?.isDemoSimulation) {
                    setSelectedPkbm(null);
                    setInspectStudent(null);
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition ${
                  showDemoSimulation
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-600/25 hover:brightness-110"
                    : "border border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/70"
                }`}
              >
                <Sparkles size={14} />
                Simulasi Demo
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                    showDemoSimulation ? "bg-amber-400 text-slate-950" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {showDemoSimulation ? "ON" : "OFF"}
                </span>
              </button>

              {summary?.petugas.isSuperAdmin && summary.availableWilayah.length > 0 && (
                <select
                  aria-label="Pilih Wilayah Kabupaten/Kota"
                  value={wilayahFilter}
                  onChange={(e) => {
                    setSelectedPkbm(null);
                    setWilayahFilter(e.target.value);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-2xs focus:border-blue-600 focus:outline-none"
                >
                  <option value="">Semua Wilayah</option>
                  {summary.availableWilayah.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              )}
              <span className="hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 sm:inline-block">
                {petugasNama}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
              >
                <LogOut size={14} /> Keluar
              </button>
            </div>
          </div>
        </header>
      </div>

      <div className="mx-auto max-w-7xl space-y-5 px-4 pt-5 sm:px-6">
        {/* Baris 1: Hero Ocean & Gold Kontras Tinggi */}
        <section
          className="relative overflow-hidden rounded-2xl p-6 text-white shadow-[0_18px_40px_rgba(37,99,235,0.26)] sm:p-7"
          style={{
            background: "linear-gradient(115deg, #1d4ed8 0%, #2563eb 52%, #4338ca 100%)",
          }}
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[36px] border-white/10" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-300/15 blur-2xl" />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
            <div className="min-w-0 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-bold tracking-wide text-white backdrop-blur-md">
                <ShieldCheck size={13} />
                Verifikasi &amp; Validasi Kesetaraan Wilayah · Administratif
              </span>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Dashboard Dinas Pendidikan
              </h2>
              <p className="mt-1.5 text-sm font-medium leading-6 text-blue-50">
                Pantau kesiapan berkas administrasi (KK, Akta/KTP, Ijazah, Surat Pindah), rekonsiliasi hasil tarik Dapodik vs bukti fisik, dan cut-off pendaftaran ({summary?.cutoffDate ?? "31 Agustus"}) tanpa mengakses nilai atau presensi KBM.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 font-bold text-white backdrop-blur-sm">
                  <Database size={12} className="text-amber-300" />
                  Wilayah: {summary ? summary.wilayah : "Memuat..."}
                </span>
                {summary && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 font-bold text-white backdrop-blur-sm">
                    Data Riil DB: {summary.pkbm.length} PKBM · {summary.kpi.totalWargaBelajar} Siswa
                  </span>
                )}
              </div>
            </div>

            <div className="shrink-0">
              <button
                type="button"
                disabled={!displayedView || displayedView.pkbm.length === 0 || exporting}
                onClick={() => void handleExportRekap()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3 text-xs font-extrabold text-slate-950 shadow-[0_8px_22px_rgba(245,158,11,0.38)] transition hover:from-amber-300 hover:to-amber-400 disabled:opacity-50"
              >
                <FileSpreadsheet size={16} aria-hidden="true" />
                {exporting ? "Menyiapkan..." : "Export Rekap Verval Kabupaten"}
              </button>
            </div>
          </div>
        </section>

        {showDemoSimulation && summary && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-amber-400/80 bg-amber-50/95 px-4 py-3 text-xs text-slate-900 shadow-xs">
            <div className="flex items-start gap-2.5 sm:items-center">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-amber-600 sm:mt-0" />
              <p className="font-medium leading-5">
                <strong className="font-extrabold text-slate-950">Mode Paparan Aktif:</strong>{" "}
                {hasZeroRealData
                  ? "Data riil PKBM/warga belajar di wilayah ini masih 0, sehingga simulasi contoh rekonsiliasi anti-WB fiktif ditampilkan otomatis."
                  : "Menampilkan simulasi contoh rekonsiliasi anti-WB fiktif berdampingan dengan data PKBM riil dari database PostgreSQL."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDemoOverride(false);
                if (selectedPkbm?.isDemoSimulation) {
                  setSelectedPkbm(null);
                  setInspectStudent(null);
                }
              }}
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-extrabold text-slate-900 hover:bg-amber-100"
            >
              Sembunyikan Simulasi
            </button>
          </div>
        )}

        {toast && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950 shadow-sm">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              {toast}
            </span>
            <button type="button" onClick={() => setToast("")} className="text-emerald-700 hover:text-emerald-950">
              <X size={16} />
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-bold text-rose-900">
            <AlertTriangle size={16} className="shrink-0 text-rose-600" />
            {error}
          </p>
        )}

        {/* Baris 2: 4 Kartu KPI Ocean & Gold Kontras Tinggi */}
        {!displayedView ? (
          error ? null : <DinasCardSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-white/95 bg-white/90 p-5 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-600">
                <span>Total PKBM Terdaftar</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700">
                  <Building2 size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{displayedView.kpi.totalPkbm}</p>
              <p className="mt-1 text-xs font-semibold text-slate-700">
                {summary?.pkbm.length ?? 0} lembaga riil DB
                {showDemoSimulation ? ` + ${demoDataset.pkbm.length} simulasi` : ""}
              </p>
            </article>

            <article className="rounded-2xl border border-white/95 bg-white/90 p-5 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-600">
                <span>Total Warga Belajar</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700">
                  <Users size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{displayedView.kpi.totalWargaBelajar}</p>
              <p className="mt-1 text-xs font-semibold text-slate-700">
                Paket A: {displayedView.kpi.totalPaketA} · B: {displayedView.kpi.totalPaketB} · C: {displayedView.kpi.totalPaketC}
              </p>
            </article>

            <article className="rounded-2xl border-2 border-amber-400 bg-white/95 p-5 text-slate-900 shadow-[0_10px_26px_rgba(245,158,11,0.14)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-700">
                <span>Dapodik vs Berkas Fisik</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 text-amber-700">
                  <FileCheck2 size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{displayedView.kpi.totalDapodik}</p>
              <p className="mt-1 text-xs font-semibold text-slate-700">
                Lengkap:{" "}
                <span className="font-extrabold text-emerald-700">{displayedView.kpi.totalBerkasLengkap}</span>
                {" · "}Selisih:{" "}
                <span className="font-extrabold text-rose-700">{displayedView.kpi.totalSelisihTanpaBerkas}</span>
                {" · "}Cut-Off: {displayedView.kpi.totalCutoff}
              </p>
            </article>

            <article className="rounded-2xl border border-white/95 bg-white/90 p-5 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-600">
                <span>Lolos Verval Dinas</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                  <ShieldCheck size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight text-emerald-700">{displayedView.kpi.persentaseLolosVerval}%</p>
              <p className="mt-1 text-xs font-semibold text-slate-700">
                {displayedView.kpi.totalLolosVervalDinas} dari {displayedView.kpi.totalWargaBelajar} warga belajar
              </p>
            </article>
          </div>
        )}

        {/* Baris 3: Tabel Monitoring PKBM */}
        <section className="space-y-4 rounded-2xl border border-white/95 bg-white/90 p-5 text-slate-900 shadow-[0_12px_32px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-950">Monitoring Kesiapan Verval per PKBM</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-600">
                Klik &ldquo;Periksa Berkas&rdquo; pada lembaga untuk memeriksa biodata Dapodik &amp; 4 dokumen fisik (KK, Akta/KTP, Ijazah, Surat Pindah).
              </p>
            </div>
          </div>

          {!displayedView ? (
            error ? (
              <DinasEmptyState
                title="Data wilayah belum dapat dimuat"
                description="Periksa koneksi server atau muat ulang halaman untuk menarik data langsung dari database."
              />
            ) : (
              <DinasTableSkeleton rows={4} columns={6} />
            )
          ) : displayedView.pkbm.length === 0 ? (
            <DinasEmptyState
              title="Belum ada data PKBM atau warga belajar yang disinkronkan di wilayah ini"
              description="Belum ada PKBM aktif dengan izin verval Dinas di kabupaten/kota ini, atau Anda dapat menekan 'Simulasi Demo' di pojok atas untuk melihat contoh paparan."
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-sky-50/90 text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  <tr>
                    <th className="px-4 py-3.5">PKBM / NPSN</th>
                    <th className="px-4 py-3.5">Dapodik &amp; Paket (A/B/C)</th>
                    <th className="px-4 py-3.5">Cut-Off</th>
                    <th className="px-4 py-3.5">Rekonsiliasi Berkas</th>
                    <th className="px-4 py-3.5">Lolos Dinas</th>
                    <th className="px-4 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {displayedView.pkbm.map((item) => (
                    <tr
                      key={item.id}
                      className={selectedPkbm?.id === item.id ? "bg-blue-50/90" : "hover:bg-sky-50/60"}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-extrabold text-slate-950">{item.nama}</p>
                          {item.isDemoSimulation ? (
                            <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-900">
                              Simulasi Demo
                            </span>
                          ) : (
                            <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-blue-800">
                              Data Riil DB
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs font-medium text-slate-600">
                          NPSN: {item.npsn ?? "—"} · {item.kabupatenKota ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-800">
                        <span className="font-extrabold text-slate-950">{item.totalDapodik} Dapodik</span>
                        <span className="ml-1.5 font-medium text-slate-600">({item.totalSiswa} siswa LMS)</span>
                        <p className="mt-0.5 font-medium text-slate-600">
                          A: {item.paketA} · B: {item.paketB} · C: {item.paketC}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-extrabold text-amber-700">{item.siswaMemenuhiCutoff} siswa</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500"
                              style={{ width: `${item.kelengkapanVervalPersen}%` }}
                            />
                          </div>
                          <span className="text-xs font-extrabold text-slate-950">{item.kelengkapanVervalPersen}%</span>
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-slate-700">
                          Lengkap:{" "}
                          <span className="font-extrabold text-emerald-700">{item.berkasLengkap}</span>
                          {" · "}Selisih:{" "}
                          <span className={item.selisihTanpaBerkas > 0 ? "font-extrabold text-rose-700" : "font-semibold text-slate-600"}>
                            {item.selisihTanpaBerkas}
                          </span>
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        <span className="font-extrabold text-emerald-700">{item.persentaseLolosDinas}%</span>
                        <p className="mt-0.5 font-medium text-slate-600">
                          {item.lolosVervalDinas} lolos · {item.perluPerbaikanCount} perbaikan
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPkbm(item);
                            setStudentSearch("");
                            setStudentStatusFilter("");
                            setTimeout(() => document.getElementById("panel-nominatif-dinas")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:brightness-110"
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
          <section id="panel-nominatif-dinas" className="scroll-mt-6 space-y-4 rounded-2xl border-2 border-blue-500/45 bg-white/95 p-5 text-slate-900 shadow-[0_16px_40px_rgba(37,99,235,0.12)] backdrop-blur-xl sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700">
                    PEMERIKSAAN NOMINATIF LEMBAGA (ADMINISTRATIF NON-KBM)
                  </p>
                  {selectedPkbm.isDemoSimulation && (
                    <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-900">
                      CONTOH SIMULASI PAPARAN
                    </span>
                  )}
                </div>
                <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">
                  {selectedPkbm.nama} (NPSN: {selectedPkbm.npsn ?? "—"})
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="search"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Cari nama/NISN/NIK..."
                    className="rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs font-medium text-slate-950 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <select
                  aria-label="Filter Status Verval Dinas"
                  value={studentStatusFilter}
                  onChange={(e) => setStudentStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="">Semua Status Dinas</option>
                  <option value="MENUNGGU_DINAS">Menunggu Dinas</option>
                  <option value="LOLOS_VERVAL">Lolos Verval</option>
                  <option value="PERLU_PERBAIKAN">Perlu Perbaikan</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSelectedPkbm(null)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100"
                >
                  Tutup Panel
                </button>
              </div>
            </div>

            {studentsLoading ? (
              <DinasTableSkeleton rows={4} columns={5} />
            ) : pkbmStudents.length === 0 ? (
              <DinasEmptyState
                title="Belum ada data warga belajar yang disinkronkan"
                description="Belum ada siswa aktif di PKBM ini atau tidak ada yang cocok dengan filter status/pencarian."
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-sky-50/90 text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    <tr>
                      <th className="px-4 py-3">Warga Belajar</th>
                      <th className="px-4 py-3">NIK / KK / Ibu</th>
                      <th className="px-4 py-3">Paket &amp; Cut-Off</th>
                      <th className="px-4 py-3">Berkas</th>
                      <th className="px-4 py-3">Status Dinas</th>
                      <th className="px-4 py-3 text-right">Verifikasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80">
                    {pkbmStudents.map((st) => {
                      const badge = statusDinasBadge(st.statusVervalDinas);
                      return (
                        <tr key={st.id} className="hover:bg-sky-50/60">
                          <td className="px-4 py-3">
                            <p className="font-extrabold text-slate-950">{st.nama}</p>
                            <p className="text-xs font-medium text-slate-600">NISN {st.nisn} · {st.kelengkapanPersen}% lengkap</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-800">
                            <p className="font-mono font-semibold text-slate-900">NIK: {st.nik ?? "—"}</p>
                            <p className="font-mono font-semibold text-slate-900">KK: {st.noKk ?? "—"}</p>
                            <p className="font-medium text-slate-600">Ibu: {st.namaIbuKandung ?? "—"}</p>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <p className="font-bold text-slate-950">{st.paketKategori} · {st.kelasNama}</p>
                            <p className={st.memenuhiCutoff ? "font-bold text-emerald-700" : "font-medium text-slate-600"}>
                              {st.memenuhiCutoff ? "Memenuhi Cut-Off" : "Di luar Cut-Off / Kosong"}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlKk ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                                KK
                              </span>
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlAktaKtp ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                                Akta
                              </span>
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlIjazah ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                                Ijazah
                              </span>
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlSuratPindah ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                                Surat Pindah
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.cls}`}>
                              {badge.label}
                            </span>
                            {st.catatanDinas && (
                              <p className="mt-1 max-w-[180px] truncate text-[11px] font-semibold text-rose-700" title={st.catatanDinas}>
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
                              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 transition hover:bg-blue-100"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-sky-50 to-blue-50/70 px-6 py-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700">
                  VERIFIKASI DINAS PENDIDIKAN {inspectStudent.isDemoSimulation ? "· SIMULASI PAPARAN" : ""}
                </p>
                <h3 className="text-lg font-extrabold tracking-tight text-slate-950">{inspectStudent.nama}</h3>
              </div>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setInspectStudent(null)}
                className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-950"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs">
              {inspectStudent.isDemoSimulation && (
                <p className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-950">
                  Contoh data simulasi paparan (hanya pratinjau dokumen administrasi — perubahan tidak disimpan ke database).
                </p>
              )}

              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2">
                <p><span className="font-semibold text-slate-600">NISN:</span> <strong className="font-mono text-slate-950">{inspectStudent.nisn}</strong></p>
                <p><span className="font-semibold text-slate-600">NIK:</span> <strong className="font-mono text-slate-950">{inspectStudent.nik ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-600">No. KK:</span> <strong className="font-mono text-slate-950">{inspectStudent.noKk ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-600">Ibu Kandung:</span> <strong className="text-slate-950">{inspectStudent.namaIbuKandung ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-600">Sekolah Asal:</span> <strong className="text-slate-950">{inspectStudent.sekolahAsal ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-600">No. Ijazah:</span> <strong className="text-slate-950">{inspectStudent.nomorIjazahTerakhir ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-600">Status PKBM:</span> <strong className="text-blue-700">{inspectStudent.statusVerval}</strong></p>
                <p><span className="font-semibold text-slate-600">Tanggal Masuk:</span> <strong className="text-slate-950">{inspectStudent.tanggalMasuk ?? "—"}</strong></p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <span className="font-extrabold uppercase tracking-wider text-slate-800">Pratinjau Berkas</span>
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
                        className={`rounded-lg px-3 py-1 font-bold transition ${
                          docTab === tab.id
                            ? "bg-blue-600 text-white shadow-xs"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
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
                  if (!u) return <p className="py-6 text-center font-medium text-slate-600">Berkas belum diunggah.</p>;
                  if (u.startsWith("data:application/pdf") || u.toLowerCase().endsWith(".pdf")) {
                    return <iframe src={u} title="Pratinjau PDF" className="mt-3 h-64 w-full rounded-xl border border-slate-200 bg-white" />;
                  }
                  if (u.startsWith("data:image/") || /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(u)) {
                    return <img src={u} alt="Pratinjau Berkas" className="mx-auto mt-3 max-h-64 rounded-xl object-contain" />;
                  }
                  return (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
                      <span className="break-all font-mono text-blue-700">{u}</span>
                      {u.startsWith("http") && (
                        <a href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-blue-700 underline">
                          Buka <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  );
                })()}
              </div>

              <label className="block font-bold text-slate-900">
                Catatan Pemeriksaan Dinas (Wajib diisi jika Minta Perbaikan)
                <textarea
                  rows={2}
                  maxLength={500}
                  value={catatanInput}
                  onChange={(e) => setCatatanInput(e.target.value)}
                  placeholder="Contoh: Scan KK buram, mohon unggah ulang yang lebih jelas."
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-medium text-slate-950 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none"
                />
              </label>

              {actionError && <p role="alert" className="font-bold text-rose-700">{actionError}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void submitDinasDecision("MENUNGGU_DINAS")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
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
