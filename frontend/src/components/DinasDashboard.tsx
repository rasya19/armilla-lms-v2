import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  Building2,
  Calendar,
  CheckCircle2,
  Database,
  ExternalLink,
  Eye,
  FileCheck2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Inbox,
  Landmark,
  LogOut,
  Menu,
  Pencil,
  Printer,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
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
  namaKepalaSekolah?: string | null;
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

type BeritaAcaraMode = "pkbm" | "kabupaten";
type BeritaAcaraStatus = "SUDAH" | "BELUM";
type PejabatJabatanTtd =
  | "Kepala Bidang PAUD & Dikmas"
  | "Kepala Dinas Pendidikan dan Kebudayaan";

type BeritaAcaraSummarySnapshot = {
  totalPkbm: number;
  totalSiswa: number;
  totalDapodik: number;
  berkasLengkap: number;
  selisihTanpaBerkas: number;
  paketA: number;
  paketB: number;
  paketC: number;
  siswaMemenuhiCutoff: number;
  kelengkapanVervalPersen: number;
  lolosVervalDinas: number;
  perluPerbaikanCount: number;
  menungguDinasCount: number;
  persentaseLolosDinas: number;
  cutoffDate: string;
};

type SavedBeritaAcara = {
  id: string;
  mode: BeritaAcaraMode;
  pkbmId: string | null;
  pkbmNama: string;
  pkbmNpsn: string | null;
  pkbmKepala?: string | null;
  wilayah: string;
  nomorSurat: string;
  tanggalSurat: string;
  tanggalIso: string;
  jabatanTtd: PejabatJabatanTtd;
  pejabatNama: string;
  pejabatNip: string;
  catatan: string;
  statusBeritaAcara: BeritaAcaraStatus;
  ringkasan: BeritaAcaraSummarySnapshot;
  updatedAt: string;
};

type UnsavedBeritaAcaraTarget = {
  key: string;
  mode: BeritaAcaraMode;
  pkbmId: string | null;
  pkbmNama: string;
  pkbmNpsn: string | null;
  pkbmKepala?: string | null;
  wilayah: string;
  ringkasan: BeritaAcaraSummarySnapshot;
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
  const regionLabel = wilayah && wilayah !== "Semua Wilayah" ? wilayah : "Kabupaten Kuningan";
  const pkbmList: PkbmSummary[] = [
    {
      id: "demo-pkbm-bina-harapan",
      nama: "PKBM Bina Harapan Bangsa",
      npsn: "P2029901",
      slug: "demo-bina-harapan",
      plan: "pro",
      kabupatenKota: regionLabel,
      namaKepalaSekolah: "H. Ahmad Fauzi, M.Pd.",
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
      namaKepalaSekolah: "Hj. Rina Kartini, S.Pd.",
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
      return { label: "Lolos Verval", cls: "border-emerald-400/35 bg-emerald-500/15 text-emerald-300" };
    case "PERLU_PERBAIKAN":
      return { label: "Perlu Perbaikan", cls: "border-rose-400/35 bg-rose-500/15 text-rose-300" };
    default:
      return { label: "Menunggu Dinas", cls: "border-amber-400/40 bg-amber-500/15 text-amber-300" };
  }
}

const BA_ARCHIVE_STORAGE_KEY = "dinas_saved_ba_archive_v1";
const BA_SIGNER_PREFS_STORAGE_KEY = "dinas_ba_signer_prefs_v1";
const BA_KOP_LOGO_STORAGE_KEY = "dinas_ba_kop_logo_v1";

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatIndonesianDate(isoDate: string): string {
  if (!isoDate) return "—";
  const parts = isoDate.split("-").map(Number);
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(dt);
  }
  const parsed = new Date(isoDate);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(parsed);
  }
  return isoDate;
}

function buildDefaultBaNumber(mode: BeritaAcaraMode, isoDate: string, npsn?: string | null): string {
  const year = (isoDate || todayIsoDate()).slice(0, 4);
  if (mode === "kabupaten") {
    return `421.9/BA-VERVAL-KAB/DIKMAS/${year}`;
  }
  const cleanNpsn = npsn ? npsn.trim() : "PKBM";
  return `421.9/BA-VERVAL-${cleanNpsn}/DIKMAS/${year}`;
}

function loadSavedBaArchive(): SavedBeritaAcara[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BA_ARCHIVE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedBeritaAcara[]) : [];
  } catch {
    return [];
  }
}

function persistSavedBaArchive(items: SavedBeritaAcara[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BA_ARCHIVE_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors safely
  }
}

function loadBaSignerPrefs(): {
  jabatanTtd: PejabatJabatanTtd;
  pejabatNama: string;
  pejabatNip: string;
} {
  const fallback = {
    jabatanTtd: "Kepala Bidang PAUD & Dikmas" as PejabatJabatanTtd,
    pejabatNama: "",
    pejabatNip: "",
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(BA_SIGNER_PREFS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      jabatanTtd:
        parsed.jabatanTtd === "Kepala Dinas Pendidikan dan Kebudayaan"
          ? "Kepala Dinas Pendidikan dan Kebudayaan"
          : "Kepala Bidang PAUD & Dikmas",
      pejabatNama: typeof parsed.pejabatNama === "string" ? parsed.pejabatNama : "",
      pejabatNip: typeof parsed.pejabatNip === "string" ? parsed.pejabatNip : "",
    };
  } catch {
    return fallback;
  }
}

function persistBaSignerPrefs(prefs: {
  jabatanTtd: PejabatJabatanTtd;
  pejabatNama: string;
  pejabatNip: string;
}): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BA_SIGNER_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors safely
  }
}

function loadBaKopLogo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BA_KOP_LOGO_STORAGE_KEY);
    return raw && raw.startsWith("data:image/") ? raw : null;
  } catch {
    return null;
  }
}

function persistBaKopLogo(dataUrl: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (dataUrl) {
      window.localStorage.setItem(BA_KOP_LOGO_STORAGE_KEY, dataUrl);
    } else {
      window.localStorage.removeItem(BA_KOP_LOGO_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors safely
  }
}

async function syncBeritaAcaraToBackend(
  action: "upsert" | "delete",
  payload: SavedBeritaAcara | { id: string },
): Promise<{ synced: boolean }> {
  try {
    const endpoint =
      action === "delete"
        ? `/api/dinas/berita-acara/${encodeURIComponent(payload.id)}`
        : "/api/dinas/berita-acara";
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: action === "delete" ? "DELETE" : "POST",
        headers: action === "upsert" ? { "Content-Type": "application/json" } : undefined,
        body: action === "upsert" ? JSON.stringify(payload) : undefined,
      },
      3500,
    );
    return { synced: res.ok };
  } catch {
    // Fallback aman ke localStorage apabila endpoint backend arsip BA belum tersedia
    return { synced: false };
  }
}

function DinasCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Menyiapkan ringkasan wilayah" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-2xl border border-slate-400/15 bg-[#0d192c]/80 p-5 shadow-[0_14px_36px_rgba(2,6,23,0.45)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="h-3.5 w-2/5 animate-pulse rounded-md bg-slate-700/70" />
            <div className="h-8 w-8 animate-pulse rounded-xl bg-slate-700/70" />
          </div>
          <div className="h-8 w-1/2 animate-pulse rounded-lg bg-slate-600/60" />
          <div className="h-3 w-3/4 animate-pulse rounded-md bg-slate-700/60" />
        </div>
      ))}
      <span className="sr-only">Memuat ringkasan wilayah...</span>
    </div>
  );
}

function DinasTableSkeleton({ rows = 4, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Menyiapkan data tabel" className="overflow-hidden rounded-2xl border border-slate-700/60 bg-[#081222]/75 p-4 backdrop-blur-xl">
      <div className="space-y-3">
        <div className="grid gap-3 border-b border-slate-700/60 pb-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, index) => (
            <div key={index} className="h-3.5 animate-pulse rounded-md bg-slate-700/70" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid items-center gap-3 py-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((__, colIndex) => (
              <div key={colIndex} className={`h-4 animate-pulse rounded-lg bg-slate-800/80 ${colIndex === 0 ? "w-4/5" : "w-3/5"}`} />
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
    <div className="rounded-2xl border border-dashed border-slate-700/80 bg-[#0a1426]/70 px-5 py-9 text-center backdrop-blur-md">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.16)]">
        <Inbox size={22} />
      </span>
      <p className="mt-3 text-sm font-extrabold text-slate-100">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-xs font-medium leading-5 text-slate-400">{description}</p>
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
      data-tenant-theme="dark"
      className="dashboard-canvas dinas-grid-dark glass-login-shell flex min-h-screen items-center justify-center px-5 py-6 text-slate-100 antialiased"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-400/20 bg-gradient-to-br from-[#0f1c32]/90 to-[#0a1324]/88 p-7 shadow-[0_28px_70px_rgba(2,6,23,0.65)] backdrop-blur-2xl">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 via-lime-400 to-amber-400 text-slate-950 shadow-[0_0_24px_rgba(52,211,153,0.3)]">
          <Landmark size={22} />
        </span>
        <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-300">
          KESETARAAN LMS / PORTAL DINAS PENDIDIKAN
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-100">Login Verifikator Dinas</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-300">
          Masuk dengan akun Dinas Pendidikan Kabupaten/Kota untuk memverifikasi kelengkapan berkas administrasi PKBM di wilayah Anda.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-bold text-slate-200">
            Email Dinas
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-4 py-2.5 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25"
            />
          </label>
          <label className="block text-sm font-bold text-slate-200">
            Kata sandi
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-4 py-2.5 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-xl border border-rose-400/35 bg-rose-500/15 px-3.5 py-2.5 text-sm font-semibold text-rose-200">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 py-3 text-sm font-extrabold text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.35)] transition hover:from-amber-300 hover:to-amber-400 disabled:opacity-50"
          >
            {busy ? "Memeriksa..." : "Masuk Portal Dinas"}
          </button>
        </form>
        <Link to="/" className="mt-5 inline-block text-sm font-bold text-amber-300 underline hover:text-amber-200">
          Kembali ke beranda
        </Link>
      </div>
    </main>
  );
}

export function DinasHome() {
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedPath = location.pathname.replace(/\/+$/, "");
  const activeMenu: "verifikasi" | "buat-ba" | "arsip-ba" = normalizedPath.endsWith("/arsip-berita-acara")
    ? "arsip-ba"
    : normalizedPath.endsWith("/berita-acara")
      ? "buat-ba"
      : "verifikasi";
  const [menuOpen, setMenuOpen] = useState(false);
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

  // State Penerbitan & Arsip Berita Acara Verval
  const initialSignerPrefs = useMemo(() => loadBaSignerPrefs(), []);
  const [baMode, setBaMode] = useState<BeritaAcaraMode>("pkbm");
  const [selectedBaPkbmId, setSelectedBaPkbmId] = useState("");
  const [baTanggalIso, setBaTanggalIso] = useState(() => todayIsoDate());
  const [baNomorSurat, setBaNomorSurat] = useState(() => buildDefaultBaNumber("pkbm", todayIsoDate()));
  const [baJabatanTtd, setBaJabatanTtd] = useState<PejabatJabatanTtd>(initialSignerPrefs.jabatanTtd);
  const [baPejabatNama, setBaPejabatNama] = useState(initialSignerPrefs.pejabatNama);
  const [baPejabatNip, setBaPejabatNip] = useState(initialSignerPrefs.pejabatNip);
  const [baKopLogo, setBaKopLogo] = useState<string | null>(() => loadBaKopLogo());
  const [baCatatan, setBaCatatan] = useState("");
  const [baArchive, setBaArchive] = useState<SavedBeritaAcara[]>(() => loadSavedBaArchive());
  const [editingBaId, setEditingBaId] = useState<string | null>(null);
  const [baFormError, setBaFormError] = useState("");
  const [baSearch, setBaSearch] = useState("");
  const [baTypeFilter, setBaTypeFilter] = useState<"ALL" | BeritaAcaraMode>("ALL");
  const [baStatusFilter, setBaStatusFilter] = useState<"ALL" | BeritaAcaraStatus>("ALL");
  const [confirmDeleteBaId, setConfirmDeleteBaId] = useState<string | null>(null);
  const [printBaDoc, setPrintBaDoc] = useState<SavedBeritaAcara | null>(null);

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
    () => buildDemoSimulationDataset(summary?.wilayah ?? "Kabupaten Kuningan", summary?.cutoffDate ?? "2026-08-31"),
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

  // Sinkronkan preferensi pejabat penandatangan otomatis ke localStorage
  useEffect(() => {
    persistBaSignerPrefs({
      jabatanTtd: baJabatanTtd,
      pejabatNama: baPejabatNama,
      pejabatNip: baPejabatNip,
    });
  }, [baJabatanTtd, baPejabatNama, baPejabatNip]);

  // Sinkronkan arsip Berita Acara ke localStorage saat berubah
  useEffect(() => {
    persistSavedBaArchive(baArchive);
  }, [baArchive]);

  // Set default PKBM terpilih saat daftar PKBM aktif tersedia
  useEffect(() => {
    if (editingBaId) return;
    const list = displayedView?.pkbm ?? [];
    if (list.length === 0) return;
    if (!selectedBaPkbmId || !list.some((item) => item.id === selectedBaPkbmId)) {
      const first = list[0];
      setSelectedBaPkbmId(first.id);
      if (baMode === "pkbm") {
        setBaNomorSurat(buildDefaultBaNumber("pkbm", baTanggalIso, first.npsn));
      }
    }
  }, [displayedView, selectedBaPkbmId, editingBaId, baMode, baTanggalIso]);

  const activeWilayahLabel =
    summary?.wilayah && summary.wilayah !== "Semua Wilayah" ? summary.wilayah : "Kabupaten Kuningan";

  const selectedBaPkbm = useMemo(
    () => (displayedView?.pkbm ?? []).find((item) => item.id === selectedBaPkbmId) ?? null,
    [displayedView, selectedBaPkbmId],
  );

  const kabupatenSnapshot = useMemo<BeritaAcaraSummarySnapshot>(() => {
    const list = displayedView?.pkbm ?? [];
    const kpi = displayedView?.kpi;
    const avgCompleteness = list.length
      ? Math.round(list.reduce((acc, item) => acc + item.kelengkapanVervalPersen, 0) / list.length)
      : 0;
    const perluPerbaikanCount = list.reduce((acc, item) => acc + item.perluPerbaikanCount, 0);
    const menungguDinasCount = list.reduce((acc, item) => acc + item.menungguDinasCount, 0);
    return {
      totalPkbm: kpi?.totalPkbm ?? list.length,
      totalSiswa: kpi?.totalWargaBelajar ?? 0,
      totalDapodik: kpi?.totalDapodik ?? 0,
      berkasLengkap: kpi?.totalBerkasLengkap ?? 0,
      selisihTanpaBerkas: kpi?.totalSelisihTanpaBerkas ?? 0,
      paketA: kpi?.totalPaketA ?? 0,
      paketB: kpi?.totalPaketB ?? 0,
      paketC: kpi?.totalPaketC ?? 0,
      siswaMemenuhiCutoff: kpi?.totalCutoff ?? 0,
      kelengkapanVervalPersen: avgCompleteness,
      lolosVervalDinas: kpi?.totalLolosVervalDinas ?? 0,
      perluPerbaikanCount,
      menungguDinasCount,
      persentaseLolosDinas: kpi?.persentaseLolosVerval ?? 0,
      cutoffDate: summary?.cutoffDate ?? "2026-08-31",
    };
  }, [displayedView, summary?.cutoffDate]);

  const activeBaSnapshot = useMemo<BeritaAcaraSummarySnapshot | null>(() => {
    if (baMode === "kabupaten") return kabupatenSnapshot;
    if (selectedBaPkbm) {
      return {
        totalPkbm: 1,
        totalSiswa: selectedBaPkbm.totalSiswa,
        totalDapodik: selectedBaPkbm.totalDapodik,
        berkasLengkap: selectedBaPkbm.berkasLengkap,
        selisihTanpaBerkas: selectedBaPkbm.selisihTanpaBerkas,
        paketA: selectedBaPkbm.paketA,
        paketB: selectedBaPkbm.paketB,
        paketC: selectedBaPkbm.paketC,
        siswaMemenuhiCutoff: selectedBaPkbm.siswaMemenuhiCutoff,
        kelengkapanVervalPersen: selectedBaPkbm.kelengkapanVervalPersen,
        lolosVervalDinas: selectedBaPkbm.lolosVervalDinas,
        perluPerbaikanCount: selectedBaPkbm.perluPerbaikanCount,
        menungguDinasCount: selectedBaPkbm.menungguDinasCount,
        persentaseLolosDinas: selectedBaPkbm.persentaseLolosDinas,
        cutoffDate: summary?.cutoffDate ?? "2026-08-31",
      };
    }
    if (editingBaId) {
      return baArchive.find((item) => item.id === editingBaId)?.ringkasan ?? null;
    }
    return null;
  }, [baMode, kabupatenSnapshot, selectedBaPkbm, summary?.cutoffDate, editingBaId, baArchive]);

  const unsavedBaTargets = useMemo<UnsavedBeritaAcaraTarget[]>(() => {
    if (!displayedView) return [];
    const savedPkbmIds = new Set(
      baArchive.filter((item) => item.mode === "pkbm" && item.pkbmId).map((item) => item.pkbmId as string),
    );
    const hasKabupatenArchive = baArchive.some(
      (item) =>
        item.mode === "kabupaten" &&
        item.wilayah.trim().toLowerCase() === activeWilayahLabel.trim().toLowerCase(),
    );

    const targets: UnsavedBeritaAcaraTarget[] = [];
    if (!hasKabupatenArchive) {
      targets.push({
        key: `unsaved-kab-${activeWilayahLabel}`,
        mode: "kabupaten",
        pkbmId: null,
        pkbmNama: `Rekapitulasi Tingkat Kabupaten (${activeWilayahLabel})`,
        pkbmNpsn: null,
        pkbmKepala: null,
        wilayah: activeWilayahLabel,
        ringkasan: kabupatenSnapshot,
      });
    }

    for (const pkbm of displayedView.pkbm) {
      if (savedPkbmIds.has(pkbm.id)) continue;
      targets.push({
        key: `unsaved-pkbm-${pkbm.id}`,
        mode: "pkbm",
        pkbmId: pkbm.id,
        pkbmNama: pkbm.nama,
        pkbmNpsn: pkbm.npsn,
        pkbmKepala: pkbm.namaKepalaSekolah ?? null,
        wilayah: pkbm.kabupatenKota ?? activeWilayahLabel,
        ringkasan: {
          totalPkbm: 1,
          totalSiswa: pkbm.totalSiswa,
          totalDapodik: pkbm.totalDapodik,
          berkasLengkap: pkbm.berkasLengkap,
          selisihTanpaBerkas: pkbm.selisihTanpaBerkas,
          paketA: pkbm.paketA,
          paketB: pkbm.paketB,
          paketC: pkbm.paketC,
          siswaMemenuhiCutoff: pkbm.siswaMemenuhiCutoff,
          kelengkapanVervalPersen: pkbm.kelengkapanVervalPersen,
          lolosVervalDinas: pkbm.lolosVervalDinas,
          perluPerbaikanCount: pkbm.perluPerbaikanCount,
          menungguDinasCount: pkbm.menungguDinasCount,
          persentaseLolosDinas: pkbm.persentaseLolosDinas,
          cutoffDate: summary?.cutoffDate ?? "2026-08-31",
        },
      });
    }
    return targets;
  }, [displayedView, baArchive, activeWilayahLabel, kabupatenSnapshot, summary?.cutoffDate]);

  const filteredSavedBa = useMemo(() => {
    const q = baSearch.trim().toLowerCase();
    return baArchive.filter((item) => {
      if (baTypeFilter !== "ALL" && item.mode !== baTypeFilter) return false;
      if (q) {
        const hay = [
          item.nomorSurat,
          item.pkbmNama,
          item.pkbmNpsn ?? "",
          item.wilayah,
          item.tanggalSurat,
          item.tanggalIso,
          item.pejabatNama,
          item.jabatanTtd,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [baArchive, baTypeFilter, baSearch]);

  const filteredUnsavedBa = useMemo(() => {
    const q = baSearch.trim().toLowerCase();
    return unsavedBaTargets.filter((target) => {
      if (baTypeFilter !== "ALL" && target.mode !== baTypeFilter) return false;
      if (q) {
        const hay = [
          target.pkbmNama,
          target.pkbmNpsn ?? "",
          target.wilayah,
          target.pkbmKepala ?? "",
          "belum dibuat",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [unsavedBaTargets, baTypeFilter, baSearch]);

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

  function handleUploadKopLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg)$/i.test(file.type)) {
      setBaFormError("Format logo kop dinas harus PNG atau JPG.");
      return;
    }
    if (file.size > 1_500_000) {
      setBaFormError("Ukuran file logo kop dinas maksimal 1,5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setBaKopLogo(reader.result);
        persistBaKopLogo(reader.result);
        setBaFormError("");
        setToast("Logo kop dinas berhasil disimpan.");
      }
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveKopLogo() {
    setBaKopLogo(null);
    persistBaKopLogo(null);
    setToast("Logo kop dinas dihapus.");
  }

  function buildBeritaAcaraPayload(existingId?: string): SavedBeritaAcara | null {
    const nomor = baNomorSurat.trim();
    if (!nomor) {
      setBaFormError("Nomor surat Berita Acara wajib diisi.");
      return null;
    }
    if (!baTanggalIso) {
      setBaFormError("Tanggal penetapan Berita Acara wajib diisi.");
      return null;
    }
    if (!activeBaSnapshot) {
      setBaFormError("Pilih satuan pendidikan (PKBM) terlebih dahulu.");
      return null;
    }

    const editingItem = existingId ? baArchive.find((a) => a.id === existingId) : undefined;
    const pkbmNama =
      baMode === "kabupaten"
        ? `Rekapitulasi Tingkat Kabupaten (${activeWilayahLabel})`
        : selectedBaPkbm?.nama ?? editingItem?.pkbmNama ?? "Satuan Pendidikan PKBM";
    const pkbmId = baMode === "kabupaten" ? null : selectedBaPkbm?.id ?? editingItem?.pkbmId ?? null;
    const pkbmNpsn = baMode === "kabupaten" ? null : selectedBaPkbm?.npsn ?? editingItem?.pkbmNpsn ?? null;
    const pkbmKepala =
      baMode === "kabupaten"
        ? null
        : selectedBaPkbm?.namaKepalaSekolah ?? editingItem?.pkbmKepala ?? null;

    if (baMode === "pkbm" && !pkbmId) {
      setBaFormError("Pilih salah satu PKBM dari daftar lembaga aktif.");
      return null;
    }

    return {
      id:
        existingId ??
        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `ba-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      mode: baMode,
      pkbmId,
      pkbmNama,
      pkbmNpsn,
      pkbmKepala,
      wilayah: selectedBaPkbm?.kabupatenKota ?? activeWilayahLabel,
      nomorSurat: nomor,
      tanggalSurat: formatIndonesianDate(baTanggalIso),
      tanggalIso: baTanggalIso,
      jabatanTtd: baJabatanTtd,
      pejabatNama: baPejabatNama.trim() || "..............................................",
      pejabatNip: baPejabatNip.trim() || "—",
      catatan: baCatatan.trim(),
      statusBeritaAcara: "SUDAH",
      ringkasan: activeBaSnapshot,
      updatedAt: new Date().toISOString(),
    };
  }

  function handleSaveBeritaAcara(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBaFormError("");
    const record = buildBeritaAcaraPayload(editingBaId ?? undefined);
    if (!record) return;

    if (editingBaId) {
      setBaArchive((prev) => prev.map((item) => (item.id === editingBaId ? record : item)));
      setEditingBaId(null);
      setBaCatatan("");
      setToast(`Perubahan Berita Acara ${record.nomorSurat} berhasil disimpan.`);
    } else {
      setBaArchive((prev) => [record, ...prev]);
      setBaCatatan("");
      setToast(`Berita Acara ${record.nomorSurat} berhasil disimpan ke arsip permanen.`);
    }
    void syncBeritaAcaraToBackend("upsert", record);
  }

  function handleCancelEditBa() {
    setEditingBaId(null);
    setBaFormError("");
    setBaCatatan("");
    setBaNomorSurat(buildDefaultBaNumber(baMode, baTanggalIso, selectedBaPkbm?.npsn));
  }

  function handleEditBa(item: SavedBeritaAcara) {
    setEditingBaId(item.id);
    setBaMode(item.mode);
    if (item.mode === "pkbm" && item.pkbmId) {
      setSelectedBaPkbmId(item.pkbmId);
    }
    setBaNomorSurat(item.nomorSurat);
    setBaTanggalIso(item.tanggalIso);
    setBaJabatanTtd(item.jabatanTtd);
    setBaPejabatNama(item.pejabatNama === ".............................................." ? "" : item.pejabatNama);
    setBaPejabatNip(item.pejabatNip === "—" ? "" : item.pejabatNip);
    setBaCatatan(item.catatan);
    setBaFormError("");
    setMenuOpen(false);
    navigate("/dinas/berita-acara");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleDeleteBa(id: string) {
    setBaArchive((prev) => prev.filter((item) => item.id !== id));
    if (editingBaId === id) {
      setEditingBaId(null);
      setBaCatatan("");
    }
    setConfirmDeleteBaId(null);
    setToast("Berita Acara dihapus dari arsip tersimpan.");
    void syncBeritaAcaraToBackend("delete", { id });
  }

  function handleQuickCreateBa(target: UnsavedBeritaAcaraTarget) {
    setEditingBaId(null);
    setBaFormError("");
    setBaMode(target.mode);
    if (target.mode === "pkbm" && target.pkbmId) {
      setSelectedBaPkbmId(target.pkbmId);
    }
    setBaNomorSurat(buildDefaultBaNumber(target.mode, baTanggalIso, target.pkbmNpsn));
    setBaCatatan("");
    setMenuOpen(false);
    navigate("/dinas/berita-acara");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectDinasMenu(target: "verifikasi" | "buat-ba" | "arsip-ba") {
    setMenuOpen(false);
    if (target === "verifikasi") navigate("/dinas");
    else if (target === "buat-ba") navigate("/dinas/berita-acara");
    else navigate("/dinas/arsip-berita-acara");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePrintFromForm() {
    setBaFormError("");
    const record = buildBeritaAcaraPayload(editingBaId ?? undefined);
    if (!record) return;
    setPrintBaDoc(record);
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
        data-tenant-theme="dark"
        className="dashboard-canvas dinas-grid-dark flex min-h-screen items-center justify-center p-8 text-slate-100 antialiased"
      >
        <div className="max-w-md rounded-2xl border border-rose-400/30 bg-[#0d192c]/90 p-6 shadow-2xl backdrop-blur-xl">
          <p className="text-sm font-bold text-rose-300">{error || "Sesi Portal Dinas Pendidikan tidak tersedia."}</p>
        </div>
      </main>
    );
  }

  const activeMenuTitle =
    activeMenu === "verifikasi"
      ? "Verifikasi & Monitoring PKBM"
      : activeMenu === "buat-ba"
        ? "Buat Berita Acara Verval"
        : "Arsip & Monitoring Berita Acara";

  return (
    <main
      data-tenant-theme="dark"
      className="dashboard-canvas dinas-grid-dark min-h-screen text-slate-100 antialiased"
    >
      <div className={printBaDoc ? "no-print" : undefined}>
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        {/* Sidebar Navigasi Portal Dinas Pendidikan */}
        <aside
          className={`${
            menuOpen ? "flex" : "hidden"
          } fixed inset-y-0 left-0 z-50 w-72 flex-col border-r border-slate-400/15 bg-[#081222]/92 p-4 text-slate-100 shadow-[8px_0_36px_rgba(2,6,23,0.6)] backdrop-blur-2xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-700/70 pb-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 via-lime-400 to-amber-400 text-slate-950 shadow-[0_0_20px_rgba(52,211,153,0.3)]">
                <Landmark size={20} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold tracking-tight text-slate-100">Portal Dinas</p>
                <p className="truncate text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                  VERVAL KESETARAAN
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Tutup menu sidebar Dinas"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-950/25 px-3 py-2.5 backdrop-blur-md">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Wilayah Aktif</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Aktif
              </span>
            </div>
            <p className="mt-1 truncate text-xs font-extrabold text-slate-100">
              {summary ? summary.wilayah : activeWilayahLabel}
            </p>
          </div>

          <nav aria-label="Sidebar Portal Dinas Pendidikan" className="mt-5 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
              MENU UTAMA DINAS
            </p>

            <button
              type="button"
              aria-current={activeMenu === "verifikasi" ? "page" : undefined}
              onClick={() => selectDinasMenu("verifikasi")}
              className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3.5 py-3 text-left text-xs font-extrabold transition ${
                activeMenu === "verifikasi"
                  ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.32)]"
                  : "border border-transparent text-slate-300 hover:border-slate-700/80 hover:bg-slate-800/55 hover:text-slate-100"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    activeMenu === "verifikasi"
                      ? "bg-slate-950/15 text-slate-950"
                      : "border border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                  }`}
                >
                  <ShieldCheck size={16} />
                </span>
                <span className="truncate">Verifikasi &amp; Monitoring</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${
                  activeMenu === "verifikasi"
                    ? "bg-slate-950/20 text-slate-950"
                    : "border border-slate-700 bg-slate-800/90 text-slate-300"
                }`}
              >
                {displayedView?.kpi.totalPkbm ?? 0}
              </span>
            </button>

            <button
              type="button"
              aria-current={activeMenu === "buat-ba" ? "page" : undefined}
              onClick={() => selectDinasMenu("buat-ba")}
              className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3.5 py-3 text-left text-xs font-extrabold transition ${
                activeMenu === "buat-ba"
                  ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.32)]"
                  : "border border-transparent text-slate-300 hover:border-slate-700/80 hover:bg-slate-800/55 hover:text-slate-100"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    activeMenu === "buat-ba"
                      ? "bg-slate-950/15 text-slate-950"
                      : "border border-sky-400/20 bg-sky-500/10 text-sky-300"
                  }`}
                >
                  <FilePlus2 size={16} />
                </span>
                <span className="truncate">Buat Berita Acara</span>
              </span>
              {editingBaId && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    activeMenu === "buat-ba"
                      ? "bg-slate-950/20 text-slate-950"
                      : "border border-amber-400/40 bg-amber-500/20 text-amber-300"
                  }`}
                >
                  Edit
                </span>
              )}
            </button>

            <button
              type="button"
              aria-current={activeMenu === "arsip-ba" ? "page" : undefined}
              onClick={() => selectDinasMenu("arsip-ba")}
              className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3.5 py-3 text-left text-xs font-extrabold transition ${
                activeMenu === "arsip-ba"
                  ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.32)]"
                  : "border border-transparent text-slate-300 hover:border-slate-700/80 hover:bg-slate-800/55 hover:text-slate-100"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    activeMenu === "arsip-ba"
                      ? "bg-slate-950/15 text-slate-950"
                      : "border border-amber-400/20 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  <Archive size={16} />
                </span>
                <span className="truncate">Arsip &amp; Status BA</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${
                  activeMenu === "arsip-ba"
                    ? "bg-slate-950/20 text-slate-950"
                    : "border border-slate-700 bg-slate-800/90 text-slate-300"
                }`}
              >
                {baArchive.length}/{baArchive.length + unsavedBaTargets.length}
              </span>
            </button>
          </nav>

          <div className="mt-4 space-y-2.5 border-t border-slate-700/70 pt-3.5">
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2.5 text-xs">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Petugas Login</p>
              <p className="mt-0.5 truncate font-extrabold text-slate-100">{petugasNama}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-extrabold text-rose-300 transition hover:border-rose-400/50 hover:bg-rose-500/20"
            >
              <LogOut size={14} /> Keluar Portal Dinas
            </button>
          </div>
        </aside>

        {menuOpen && (
          <button
            type="button"
            aria-label="Tutup menu sidebar Dinas"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/65 backdrop-blur-xs lg:hidden"
          />
        )}

        {/* Konten Utama per Menu */}
        <div className="min-w-0 flex-1 pb-10">
          <header className="sticky top-0 z-30 border-b border-slate-400/15 bg-gradient-to-r from-[#0a2c2a]/85 via-[#0d182c]/90 to-[#0f192d]/92 px-4 py-3 shadow-[0_12px_32px_rgba(2,6,23,0.45)] backdrop-blur-2xl sm:px-6">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  aria-label="Buka menu sidebar Dinas"
                  aria-expanded={menuOpen}
                  className="rounded-xl border border-slate-700/80 bg-slate-900/80 p-2 text-slate-200 hover:border-amber-400/40 hover:bg-slate-800 lg:hidden"
                >
                  <Menu size={20} />
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-100 sm:text-base">
                      {activeMenuTitle}
                    </h1>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {summary ? summary.wilayah : activeWilayahLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] font-bold tracking-wide text-slate-400">
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
                      ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.34)] hover:from-amber-300 hover:to-amber-400"
                      : "border border-slate-600/75 bg-slate-900/75 text-slate-200 hover:border-amber-400/45 hover:bg-slate-800/80"
                  }`}
                >
                  <Sparkles size={14} />
                  Simulasi Demo
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                      showDemoSimulation
                        ? "bg-slate-950/20 text-slate-950"
                        : "bg-slate-800 text-slate-400"
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
                    className="rounded-xl border border-slate-700/80 bg-slate-900/85 px-3 py-2 text-xs font-bold text-slate-100 focus:border-amber-400 focus:outline-none"
                  >
                    <option value="">Semua Wilayah</option>
                    {summary.availableWilayah.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 pt-5 sm:px-6">
        {/* Hero Banner Dark Glassmorphism sesuai Menu Sidebar Aktif */}
        {activeMenu === "verifikasi" ? (
          <section className="relative overflow-hidden rounded-2xl border border-slate-400/20 bg-gradient-to-br from-[#101c33]/92 via-[#0b1528]/90 to-[#111f38]/88 p-6 text-slate-100 shadow-[0_22px_52px_rgba(2,6,23,0.55)] backdrop-blur-xl sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[36px] border-amber-400/[0.06]" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-0 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-bold tracking-wide text-amber-300 backdrop-blur-md">
                  <ShieldCheck size={13} />
                  Verifikasi &amp; Validasi Kesetaraan Wilayah · Administratif
                </span>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  Verifikasi &amp; Monitoring PKBM
                </h2>
                <p className="mt-1.5 text-sm font-medium leading-6 text-slate-300">
                  Pantau kesiapan berkas administrasi (KK, Akta/KTP, Ijazah, Surat Pindah), rekonsiliasi hasil tarik Dapodik vs bukti fisik, dan cut-off pendaftaran ({summary?.cutoffDate ?? "31 Agustus"}) tanpa mengakses nilai atau presensi KBM.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-600/60 bg-slate-900/70 px-3 py-1 font-bold text-slate-200 backdrop-blur-sm">
                    <Database size={12} className="text-amber-400" />
                    Wilayah: {summary ? summary.wilayah : "Memuat..."}
                  </span>
                  {summary && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 font-bold text-emerald-300 backdrop-blur-sm">
                      Data Riil DB: {summary.pkbm.length} PKBM · {summary.kpi.totalWargaBelajar} Siswa
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={!displayedView || displayedView.pkbm.length === 0 || exporting}
                  onClick={() => void handleExportRekap()}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3 text-xs font-extrabold text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.36)] transition hover:from-amber-300 hover:to-amber-400 disabled:opacity-50"
                >
                  <FileSpreadsheet size={16} aria-hidden="true" />
                  {exporting ? "Menyiapkan..." : "Export Rekap Verval Kabupaten"}
                </button>
              </div>
            </div>
          </section>
        ) : activeMenu === "buat-ba" ? (
          <section className="relative overflow-hidden rounded-2xl border border-slate-400/20 bg-gradient-to-br from-[#101c33]/92 via-[#0b1528]/90 to-[#111f38]/88 p-6 text-slate-100 shadow-[0_22px_52px_rgba(2,6,23,0.55)] backdrop-blur-xl sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[36px] border-amber-400/[0.06]" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-sky-400/10 blur-3xl" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-0 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-bold tracking-wide text-amber-300 backdrop-blur-md">
                  <FilePlus2 size={13} />
                  Penerbitan Dokumen Resmi · {activeWilayahLabel}
                </span>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  {editingBaId ? "Edit Berita Acara Verval" : "Buat Berita Acara Verval"}
                </h2>
                <p className="mt-1.5 text-sm font-medium leading-6 text-slate-300">
                  Susun Berita Acara resmi per Satuan Pendidikan (PKBM) maupun Rekapitulasi Kabupaten/Kota dengan data Dapodik &amp; kelengkapan berkas terisi otomatis.
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => selectDinasMenu("arsip-ba")}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-500/50 bg-slate-900/70 px-4 py-3 text-xs font-extrabold text-slate-100 backdrop-blur-md transition hover:border-amber-400/45 hover:bg-slate-800/80"
                >
                  <Archive size={15} aria-hidden="true" />
                  Buka Arsip BA ({baArchive.length})
                </button>
                <button
                  type="button"
                  onClick={handlePrintFromForm}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3 text-xs font-extrabold text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.36)] transition hover:from-amber-300 hover:to-amber-400"
                >
                  <Printer size={16} aria-hidden="true" />
                  Cetak / Simpan PDF Berita Acara
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="relative overflow-hidden rounded-2xl border border-slate-400/20 bg-gradient-to-br from-[#101c33]/92 via-[#0b1528]/90 to-[#111f38]/88 p-6 text-slate-100 shadow-[0_22px_52px_rgba(2,6,23,0.55)] backdrop-blur-xl sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[36px] border-amber-400/[0.06]" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-0 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-bold tracking-wide text-amber-300 backdrop-blur-md">
                  <Archive size={13} />
                  Manajemen Arsip &amp; Status Penerbitan · {activeWilayahLabel}
                </span>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  Arsip &amp; Monitoring Berita Acara
                </h2>
                <p className="mt-1.5 text-sm font-medium leading-6 text-slate-300">
                  Kelola seluruh Berita Acara Verval yang telah diterbitkan, cetak ulang PDF, perbarui data, atau pantau lembaga PKBM yang belum menerbitkan Berita Acara.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-3 py-1 font-bold text-emerald-300 backdrop-blur-sm">
                    Sudah Tersimpan: {baArchive.length}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-500/15 px-3 py-1 font-bold text-amber-300 backdrop-blur-sm">
                    Belum Dibuat: {unsavedBaTargets.length}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingBaId(null);
                    selectDinasMenu("buat-ba");
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3 text-xs font-extrabold text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.36)] transition hover:from-amber-300 hover:to-amber-400"
                >
                  <FilePlus2 size={16} aria-hidden="true" />
                  Buat Berita Acara Baru
                </button>
              </div>
            </div>
          </section>
        )}

        {showDemoSimulation && summary && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 backdrop-blur-md">
            <div className="flex items-start gap-2.5 sm:items-center">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-amber-400 sm:mt-0" />
              <p className="font-medium leading-5 text-slate-200">
                <strong className="font-extrabold text-amber-300">Mode Paparan Aktif:</strong>{" "}
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
              className="shrink-0 rounded-lg border border-amber-400/45 bg-slate-900/75 px-3 py-1.5 text-[11px] font-extrabold text-amber-300 transition hover:bg-amber-400/15"
            >
              Sembunyikan Simulasi
            </button>
          </div>
        )}

        {toast && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-200 backdrop-blur-md">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              {toast}
            </span>
            <button type="button" onClick={() => setToast("")} className="text-emerald-300 hover:text-white">
              <X size={16} />
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-400/40 bg-rose-500/15 p-4 text-sm font-bold text-rose-200 backdrop-blur-md">
            <AlertTriangle size={16} className="shrink-0 text-rose-400" />
            {error}
          </p>
        )}

        {/* Halaman 1: Verifikasi & Monitoring PKBM */}
        {activeMenu === "verifikasi" && (
        <>
        {/* Baris 2: 4 Kartu KPI Dark Glassmorphism Multi-Aksen */}
        {!displayedView ? (
          error ? null : <DinasCardSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-slate-400/15 bg-gradient-to-br from-[#0f1c32]/85 to-[#0a1324]/80 p-5 text-slate-100 shadow-[0_14px_36px_rgba(2,6,23,0.45)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-400">
                <span>Total PKBM Terdaftar</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/15 text-sky-300">
                  <Building2 size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight tabular-nums text-white">{displayedView.kpi.totalPkbm}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                {summary?.pkbm.length ?? 0} lembaga riil DB
                {showDemoSimulation ? ` + ${demoDataset.pkbm.length} simulasi` : ""}
              </p>
            </article>

            <article className="rounded-2xl border border-slate-400/15 bg-gradient-to-br from-[#0f1c32]/85 to-[#0a1324]/80 p-5 text-slate-100 shadow-[0_14px_36px_rgba(2,6,23,0.45)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-400">
                <span>Total Warga Belajar</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-teal-400/30 bg-teal-500/15 text-teal-300">
                  <Users size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight tabular-nums text-white">{displayedView.kpi.totalWargaBelajar}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                Paket A: {displayedView.kpi.totalPaketA} · B: {displayedView.kpi.totalPaketB} · C: {displayedView.kpi.totalPaketC}
              </p>
            </article>

            <article className="rounded-2xl border border-amber-400/45 bg-gradient-to-br from-[#171d2c]/90 to-[#0c1426]/85 p-5 text-slate-100 shadow-[0_14px_36px_rgba(245,158,11,0.12)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-amber-300">
                <span>Dapodik vs Berkas Fisik</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-400/35 bg-amber-500/15 text-amber-300">
                  <FileCheck2 size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight tabular-nums text-white">{displayedView.kpi.totalDapodik}</p>
              <p className="mt-1 text-xs font-semibold text-slate-300">
                Lengkap:{" "}
                <span className="font-extrabold text-emerald-400">{displayedView.kpi.totalBerkasLengkap}</span>
                {" · "}Selisih:{" "}
                <span className="font-extrabold text-rose-400">{displayedView.kpi.totalSelisihTanpaBerkas}</span>
                {" · "}Cut-Off: <span className="text-amber-300">{displayedView.kpi.totalCutoff}</span>
              </p>
            </article>

            <article className="rounded-2xl border border-slate-400/15 bg-gradient-to-br from-[#0f1c32]/85 to-[#0a1324]/80 p-5 text-slate-100 shadow-[0_14px_36px_rgba(2,6,23,0.45)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-400">
                <span>Lolos Verval Dinas</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300">
                  <ShieldCheck size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight tabular-nums text-emerald-400">{displayedView.kpi.persentaseLolosVerval}%</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                {displayedView.kpi.totalLolosVervalDinas} dari {displayedView.kpi.totalWargaBelajar} warga belajar
              </p>
            </article>
          </div>
        )}

        {/* Baris 3: Tabel Monitoring PKBM */}
        <section className="space-y-4 rounded-2xl border border-slate-400/15 bg-gradient-to-br from-[#0f1c32]/82 to-[#0a1324]/78 p-5 text-slate-100 shadow-[0_18px_44px_rgba(2,6,23,0.48)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-100">Monitoring Kesiapan Verval per PKBM</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-400">
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
            <div className="overflow-x-auto rounded-2xl border border-slate-700/60 bg-[#081222]/70">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-700/70 bg-slate-900/80 text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5">PKBM / NPSN</th>
                    <th className="px-4 py-3.5">Dapodik &amp; Paket (A/B/C)</th>
                    <th className="px-4 py-3.5">Cut-Off</th>
                    <th className="px-4 py-3.5">Rekonsiliasi Berkas</th>
                    <th className="px-4 py-3.5">Lolos Dinas</th>
                    <th className="px-4 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {displayedView.pkbm.map((item) => (
                    <tr
                      key={item.id}
                      className={selectedPkbm?.id === item.id ? "bg-amber-500/10" : "transition hover:bg-slate-800/45"}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-extrabold text-slate-100">{item.nama}</p>
                          {item.isDemoSimulation ? (
                            <span className="rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-300">
                              Simulasi Demo
                            </span>
                          ) : (
                            <span className="rounded-md border border-teal-400/35 bg-teal-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-teal-300">
                              Data Riil DB
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs font-medium text-slate-400">
                          NPSN: <span className="font-mono text-slate-300">{item.npsn ?? "—"}</span> · {item.kabupatenKota ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-300">
                        <span className="font-extrabold text-slate-100 tabular-nums">{item.totalDapodik} Dapodik</span>
                        <span className="ml-1.5 font-medium text-slate-400">({item.totalSiswa} siswa LMS)</span>
                        <p className="mt-0.5 font-medium text-slate-400">
                          A: {item.paketA} · B: {item.paketB} · C: {item.paketC}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-extrabold text-amber-300 tabular-nums">{item.siswaMemenuhiCutoff} siswa</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400"
                              style={{ width: `${item.kelengkapanVervalPersen}%` }}
                            />
                          </div>
                          <span className="text-xs font-extrabold text-slate-100 tabular-nums">{item.kelengkapanVervalPersen}%</span>
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-slate-400">
                          Lengkap:{" "}
                          <span className="font-extrabold text-emerald-400">{item.berkasLengkap}</span>
                          {" · "}Selisih:{" "}
                          <span className={item.selisihTanpaBerkas > 0 ? "font-extrabold text-rose-400" : "font-semibold text-slate-400"}>
                            {item.selisihTanpaBerkas}
                          </span>
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        <span className="font-extrabold text-emerald-400 tabular-nums">{item.persentaseLolosDinas}%</span>
                        <p className="mt-0.5 font-medium text-slate-400">
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
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-[0_0_16px_rgba(245,158,11,0.28)] transition hover:from-amber-300 hover:to-amber-400"
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
          <section id="panel-nominatif-dinas" className="scroll-mt-6 space-y-4 rounded-2xl border border-amber-400/35 bg-gradient-to-br from-[#101e36]/90 to-[#0a1324]/86 p-5 text-slate-100 shadow-[0_20px_48px_rgba(2,6,23,0.58)] backdrop-blur-xl sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/70 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                    PEMERIKSAAN NOMINATIF LEMBAGA (ADMINISTRATIF NON-KBM)
                  </p>
                  {selectedPkbm.isDemoSimulation && (
                    <span className="rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-300">
                      CONTOH SIMULASI PAPARAN
                    </span>
                  )}
                </div>
                <h2 className="mt-1 text-lg font-extrabold tracking-tight text-white">
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
                    className="rounded-xl border border-slate-700/80 bg-slate-950/75 py-2 pl-8 pr-3 text-xs font-medium text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <select
                  aria-label="Filter Status Verval Dinas"
                  value={studentStatusFilter}
                  onChange={(e) => setStudentStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-700/80 bg-slate-950/75 px-3 py-2 text-xs font-bold text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  <option value="">Semua Status Dinas</option>
                  <option value="MENUNGGU_DINAS">Menunggu Dinas</option>
                  <option value="LOLOS_VERVAL">Lolos Verval</option>
                  <option value="PERLU_PERBAIKAN">Perlu Perbaikan</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSelectedPkbm(null)}
                  className="rounded-xl border border-slate-600/80 bg-slate-900/75 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
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
              <div className="overflow-x-auto rounded-2xl border border-slate-700/60 bg-[#081222]/70">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-700/70 bg-slate-900/80 text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Warga Belajar</th>
                      <th className="px-4 py-3">NIK / KK / Ibu</th>
                      <th className="px-4 py-3">Paket &amp; Cut-Off</th>
                      <th className="px-4 py-3">Berkas</th>
                      <th className="px-4 py-3">Status Dinas</th>
                      <th className="px-4 py-3 text-right">Verifikasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {pkbmStudents.map((st) => {
                      const badge = statusDinasBadge(st.statusVervalDinas);
                      return (
                        <tr key={st.id} className="transition hover:bg-slate-800/45">
                          <td className="px-4 py-3">
                            <p className="font-extrabold text-slate-100">{st.nama}</p>
                            <p className="text-xs font-medium text-slate-400">
                              NISN <span className="font-mono text-slate-300">{st.nisn}</span> · {st.kelengkapanPersen}% lengkap
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300">
                            <p className="font-mono font-semibold text-slate-200">NIK: {st.nik ?? "—"}</p>
                            <p className="font-mono font-semibold text-slate-200">KK: {st.noKk ?? "—"}</p>
                            <p className="font-medium text-slate-400">Ibu: {st.namaIbuKandung ?? "—"}</p>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                              {st.paketKategori} · {st.kelasNama}
                            </span>
                            <p className={`mt-1 ${st.memenuhiCutoff ? "font-bold text-emerald-400" : "font-medium text-slate-400"}`}>
                              {st.memenuhiCutoff ? "Memenuhi Cut-Off" : "Di luar Cut-Off / Kosong"}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlKk ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-300" : "border-slate-700/80 bg-slate-800/70 text-slate-500"}`}>
                                KK
                              </span>
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlAktaKtp ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-300" : "border-slate-700/80 bg-slate-800/70 text-slate-500"}`}>
                                Akta
                              </span>
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlIjazah ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-300" : "border-slate-700/80 bg-slate-800/70 text-slate-500"}`}>
                                Ijazah
                              </span>
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlSuratPindah ? "border-teal-400/35 bg-teal-500/15 text-teal-300" : "border-slate-700/80 bg-slate-800/70 text-slate-500"}`}>
                                Surat Pindah
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.cls}`}>
                              {badge.label}
                            </span>
                            {st.catatanDinas && (
                              <p className="mt-1 max-w-[180px] truncate text-[11px] font-semibold text-rose-300" title={st.catatanDinas}>
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
                              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-400/25"
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
        </>
        )}

        {/* Halaman 2: Form Buat / Edit Berita Acara Verval */}
        {activeMenu === "buat-ba" && (
        <section
          id="panel-berita-acara-dinas"
          className="scroll-mt-6 space-y-6 rounded-2xl border border-slate-400/15 bg-gradient-to-br from-[#0f1c32]/82 to-[#0a1324]/78 p-5 text-slate-100 shadow-[0_18px_44px_rgba(2,6,23,0.48)] backdrop-blur-xl sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700/70 pb-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-500/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                <FilePlus2 size={13} />
                FORM PENERBITAN DOKUMEN · {activeWilayahLabel.toUpperCase()}
              </span>
              <h2 className="mt-2 text-lg font-extrabold tracking-tight text-white sm:text-xl">
                {editingBaId ? "Perbarui Berita Acara Verval" : "Formulir Penerbitan Berita Acara Verval"}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-400">
                Pilih mode Per PKBM atau Rekapitulasi Kabupaten, lengkapi nomor surat dan pejabat penandatangan, lalu simpan permanen ke arsip atau cetak PDF.
              </p>
            </div>

            <button
              type="button"
              onClick={() => selectDinasMenu("arsip-ba")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600/80 bg-slate-900/75 px-3.5 py-2 text-xs font-extrabold text-slate-200 transition hover:border-amber-400/45 hover:bg-slate-800"
            >
              <Archive size={14} /> Lihat Daftar Arsip ({baArchive.length})
            </button>
          </div>

          {/* Form Penerbitan / Edit Berita Acara */}
          <form
            id="form-berita-acara-dinas"
            onSubmit={handleSaveBeritaAcara}
            className={`scroll-mt-6 space-y-5 rounded-2xl border p-5 backdrop-blur-md transition ${
              editingBaId
                ? "border-amber-400/60 bg-amber-500/[0.07]"
                : "border-slate-700/70 bg-[#081222]/70"
            }`}
          >
            {editingBaId && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/45 bg-amber-500/15 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2 font-extrabold text-amber-200">
                  <Pencil size={14} className="text-amber-300" />
                  Mode Edit Arsip Aktif — Perubahan akan memperbarui data Berita Acara tanpa membuat duplikat.
                </div>
                <button
                  type="button"
                  onClick={handleCancelEditBa}
                  className="rounded-lg border border-amber-400/45 bg-slate-900/80 px-3 py-1 font-extrabold text-amber-200 hover:bg-amber-400/20"
                >
                  Batal Edit
                </button>
              </div>
            )}

            {/* Pilihan Jenis Berita Acara */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-300">
                  1. Pilih Jenis Berita Acara
                </span>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBaMode("pkbm");
                      if (!editingBaId) {
                        setBaNomorSurat(buildDefaultBaNumber("pkbm", baTanggalIso, selectedBaPkbm?.npsn));
                      }
                    }}
                    className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-xs font-extrabold transition ${
                      baMode === "pkbm"
                        ? "border-amber-400 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                        : "border-slate-700/80 bg-slate-900/75 text-slate-200 hover:border-amber-400/45 hover:bg-slate-800/80"
                    }`}
                  >
                    <Building2 size={16} className="shrink-0" />
                    <span>Per Satuan Pendidikan (PKBM)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBaMode("kabupaten");
                      if (!editingBaId) {
                        setBaNomorSurat(buildDefaultBaNumber("kabupaten", baTanggalIso));
                      }
                    }}
                    className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-xs font-extrabold transition ${
                      baMode === "kabupaten"
                        ? "border-amber-400 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                        : "border-slate-700/80 bg-slate-900/75 text-slate-200 hover:border-amber-400/45 hover:bg-slate-800/80"
                    }`}
                  >
                    <Landmark size={16} className="shrink-0" />
                    <span>Rekapitulasi Kabupaten/Kota</span>
                  </button>
                </div>
              </div>

              {baMode === "pkbm" ? (
                <label className="block space-y-2 text-xs font-extrabold uppercase tracking-wider text-slate-300">
                  <span>2. Pilih Satuan Pendidikan (PKBM)</span>
                  <select
                    value={selectedBaPkbmId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedBaPkbmId(nextId);
                      const matched = (displayedView?.pkbm ?? []).find((p) => p.id === nextId);
                      if (!editingBaId) {
                        setBaNomorSurat(buildDefaultBaNumber("pkbm", baTanggalIso, matched?.npsn));
                      }
                    }}
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3.5 py-2.5 text-xs font-bold normal-case tracking-normal text-slate-100 focus:border-amber-400 focus:outline-none"
                  >
                    {(displayedView?.pkbm ?? []).length === 0 ? (
                      <option value="">Belum ada PKBM aktif di wilayah ini</option>
                    ) : (
                      (displayedView?.pkbm ?? []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nama} — NPSN: {item.npsn ?? "-"}
                          {item.namaKepalaSekolah ? ` · Kepala: ${item.namaKepalaSekolah}` : ""}
                          {item.isDemoSimulation ? " [Simulasi]" : ""}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              ) : (
                <div className="space-y-2">
                  <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    2. Cakupan Wilayah Rekapitulasi
                  </span>
                  <div className="flex items-center justify-between rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-xs">
                    <div>
                      <p className="font-extrabold text-slate-100">{activeWilayahLabel}</p>
                      <p className="text-[11px] font-semibold text-slate-300">
                        Agregat otomatis seluruh {kabupatenSnapshot.totalPkbm} PKBM aktif (Cut-Off: {kabupatenSnapshot.cutoffDate})
                      </p>
                    </div>
                    <span className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-extrabold text-amber-300">
                      Rekap Dinas
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Ringkasan Otomatis Sasaran Terpilih */}
            {activeBaSnapshot && (
              <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-slate-700/70 bg-slate-900/75 p-3.5 sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    {baMode === "kabupaten" ? "PKBM Tercakup" : "NPSN / Kepala"}
                  </p>
                  {baMode === "kabupaten" ? (
                    <p className="mt-0.5 text-sm font-black text-white tabular-nums">{activeBaSnapshot.totalPkbm} Lembaga</p>
                  ) : (
                    <>
                      <p className="mt-0.5 font-mono text-xs font-extrabold text-white">
                        {selectedBaPkbm?.npsn ?? "—"}
                      </p>
                      <p className="truncate text-[11px] font-semibold text-slate-400" title={selectedBaPkbm?.namaKepalaSekolah ?? undefined}>
                        {selectedBaPkbm?.namaKepalaSekolah ?? "Kepala PKBM —"}
                      </p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Dapodik / LMS</p>
                  <p className="mt-0.5 text-sm font-black text-white tabular-nums">
                    {activeBaSnapshot.totalDapodik} / {activeBaSnapshot.totalSiswa}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Berkas Lengkap</p>
                  <p className="mt-0.5 text-sm font-black text-emerald-400 tabular-nums">{activeBaSnapshot.berkasLengkap} Siswa</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Selisih Berkas</p>
                  <p className="mt-0.5 text-sm font-black text-rose-400 tabular-nums">{activeBaSnapshot.selisihTanpaBerkas} Siswa</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Lolos Dinas</p>
                  <p className="mt-0.5 text-sm font-black text-amber-300 tabular-nums">
                    {activeBaSnapshot.lolosVervalDinas} ({activeBaSnapshot.persentaseLolosDinas}%)
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Paket A / B / C</p>
                  <p className="mt-0.5 text-xs font-extrabold text-slate-200 tabular-nums">
                    {activeBaSnapshot.paketA} / {activeBaSnapshot.paketB} / {activeBaSnapshot.paketC}
                  </p>
                </div>
              </div>
            )}

            {/* Metadata Surat, Pejabat Penandatangan & Kop Dinas */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="block text-xs font-bold text-slate-200">
                Nomor Surat Berita Acara
                <input
                  type="text"
                  required
                  value={baNomorSurat}
                  onChange={(e) => setBaNomorSurat(e.target.value)}
                  placeholder="421.9/BA-VERVAL/DIKMAS/2026"
                  className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3.5 py-2.5 text-xs font-bold text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-bold text-slate-200">
                Tanggal Penetapan
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Calendar size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      required
                      value={baTanggalIso}
                      onChange={(e) => setBaTanggalIso(e.target.value)}
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-950/75 py-2.5 pl-9 pr-3 text-xs font-bold text-slate-100 [color-scheme:dark] focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <span className="shrink-0 rounded-xl border border-amber-400/35 bg-amber-500/15 px-2.5 py-2 text-[11px] font-extrabold text-amber-300">
                    {formatIndonesianDate(baTanggalIso)}
                  </span>
                </div>
              </label>

              <label className="block text-xs font-bold text-slate-200">
                Pejabat Penandatangan
                <select
                  value={baJabatanTtd}
                  onChange={(e) => setBaJabatanTtd(e.target.value as PejabatJabatanTtd)}
                  className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3.5 py-2.5 text-xs font-bold text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  <option value="Kepala Bidang PAUD & Dikmas">Kepala Bidang PAUD &amp; Dikmas</option>
                  <option value="Kepala Dinas Pendidikan dan Kebudayaan">Kepala Dinas Pendidikan dan Kebudayaan</option>
                </select>
              </label>

              <label className="block text-xs font-bold text-slate-200">
                Nama Pejabat (Tersimpan Otomatis)
                <input
                  type="text"
                  value={baPejabatNama}
                  onChange={(e) => setBaPejabatNama(e.target.value)}
                  placeholder="Contoh: Drs. H. Suryana, M.Pd."
                  className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3.5 py-2.5 text-xs font-semibold text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-bold text-slate-200">
                NIP Pejabat (Tersimpan Otomatis)
                <input
                  type="text"
                  value={baPejabatNip}
                  onChange={(e) => setBaPejabatNip(e.target.value)}
                  placeholder="Contoh: 19720514 199802 1 002"
                  className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3.5 py-2.5 font-mono text-xs font-semibold text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </label>

              <div className="text-xs font-bold text-slate-200">
                <span>Logo Kop Dinas (PNG / JPG)</span>
                <div className="mt-1.5 flex items-center gap-2.5">
                  {baKopLogo ? (
                    <img
                      src={baKopLogo}
                      alt="Logo Kop Dinas"
                      className="h-10 w-10 shrink-0 rounded-lg border border-slate-600 bg-white object-contain p-0.5"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-600 bg-slate-900/80 text-slate-400">
                      <ImagePlus size={16} />
                    </span>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs font-extrabold text-amber-300 transition hover:bg-amber-400/25">
                    <ImagePlus size={14} />
                    <span>{baKopLogo ? "Ganti Logo" : "Upload Logo"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleUploadKopLogo}
                      className="sr-only"
                    />
                  </label>
                  {baKopLogo && (
                    <button
                      type="button"
                      onClick={handleRemoveKopLogo}
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-500/35 bg-rose-500/15 px-2.5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/25"
                    >
                      <Trash2 size={13} /> Hapus
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label className="block text-xs font-bold text-slate-200">
              Catatan Dinas / Rekomendasi Tindak Lanjut
              <textarea
                rows={2}
                maxLength={800}
                value={baCatatan}
                onChange={(e) => setBaCatatan(e.target.value)}
                placeholder="Contoh: Selisih warga belajar tanpa berkas agar dilengkapi oleh operator PKBM paling lambat 7 hari kerja setelah verifikasi."
                className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 p-3 text-xs font-medium text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </label>

            {baFormError && (
              <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/15 px-3.5 py-2.5 text-xs font-bold text-rose-200">
                <AlertTriangle size={15} className="shrink-0 text-rose-400" />
                {baFormError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-xs font-extrabold text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.34)] transition hover:from-amber-300 hover:to-amber-400"
                >
                  <Save size={15} />
                  {editingBaId ? "Simpan Perubahan BA" : "Simpan Berita Acara"}
                </button>
                {editingBaId && (
                  <button
                    type="button"
                    onClick={handleCancelEditBa}
                    className="rounded-xl border border-slate-600/80 bg-slate-900/80 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
                  >
                    Batal Edit
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handlePrintFromForm}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-5 py-2.5 text-xs font-extrabold text-emerald-300 transition hover:bg-emerald-500/25"
              >
                <Printer size={15} />
                Cetak / Simpan PDF Berita Acara
              </button>
            </div>
          </form>
        </section>
        )}

        {/* Halaman 3: Daftar Berita Acara Tersimpan & Target Belum Dibuat */}
        {activeMenu === "arsip-ba" && (
        <section className="space-y-4 rounded-2xl border border-slate-400/15 bg-gradient-to-br from-[#0f1c32]/82 to-[#0a1324]/78 p-5 text-slate-100 shadow-[0_18px_44px_rgba(2,6,23,0.48)] backdrop-blur-xl sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold tracking-tight text-slate-100">
                  Daftar Berita Acara Tersimpan &amp; Monitoring Penerbitan
                </h3>
                <p className="text-xs font-medium text-slate-400">
                  Saring arsip berdasarkan nomor surat, nama PKBM, NPSN, tanggal, pejabat, jenis BA, atau status Sudah vs Belum dibuat.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={baSearch}
                    onChange={(e) => setBaSearch(e.target.value)}
                    placeholder="Cari nomor surat, PKBM, NPSN, tanggal, pejabat..."
                    className="w-64 rounded-xl border border-slate-700/80 bg-slate-950/75 py-2 pl-8 pr-3 text-xs font-medium text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none sm:w-72"
                  />
                </div>

                <select
                  aria-label="Filter Jenis Berita Acara"
                  value={baTypeFilter}
                  onChange={(e) => setBaTypeFilter(e.target.value as "ALL" | BeritaAcaraMode)}
                  className="rounded-xl border border-slate-700/80 bg-slate-950/75 px-3 py-2 text-xs font-bold text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  <option value="ALL">Semua Jenis BA</option>
                  <option value="pkbm">Per Lembaga (PKBM)</option>
                  <option value="kabupaten">Rekap Dinas (Kabupaten)</option>
                </select>

                <select
                  aria-label="Filter Status Berita Acara"
                  value={baStatusFilter}
                  onChange={(e) => setBaStatusFilter(e.target.value as "ALL" | BeritaAcaraStatus)}
                  className="rounded-xl border border-slate-700/80 bg-slate-950/75 px-3 py-2 text-xs font-bold text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="SUDAH">Sudah Dibuat / Tersimpan</option>
                  <option value="BELUM">Belum Dibuat</option>
                </select>
              </div>
            </div>

            {((baStatusFilter === "SUDAH" && filteredSavedBa.length === 0) ||
              (baStatusFilter === "BELUM" && filteredUnsavedBa.length === 0) ||
              (baStatusFilter === "ALL" && filteredSavedBa.length === 0 && filteredUnsavedBa.length === 0)) ? (
              <DinasEmptyState
                title={
                  baStatusFilter === "BELUM"
                    ? "Semua sasaran pada filter ini sudah memiliki Berita Acara tersimpan"
                    : "Belum ada Berita Acara yang cocok dengan pencarian/filter"
                }
                description={
                  baStatusFilter === "BELUM"
                    ? "Seluruh PKBM dan rekap kabupaten yang sesuai filter telah memiliki arsip Berita Acara Verval."
                    : "Gunakan form di atas untuk menerbitkan dan menyimpan Berita Acara Verval, atau ubah kata kunci filter Anda."
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-700/60 bg-[#081222]/70">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-700/70 bg-slate-900/80 text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-3.5">Jenis &amp; Status</th>
                      <th className="px-4 py-3.5">Nomor Surat &amp; Tanggal</th>
                      <th className="px-4 py-3.5">Satuan Pendidikan / Wilayah</th>
                      <th className="px-4 py-3.5">Ringkasan Data Verval</th>
                      <th className="px-4 py-3.5">Pejabat Penandatangan</th>
                      <th className="px-4 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {baStatusFilter !== "BELUM" &&
                      filteredSavedBa.map((item) => (
                        <tr
                          key={item.id}
                          className={editingBaId === item.id ? "bg-amber-500/12" : "transition hover:bg-slate-800/45"}
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col items-start gap-1.5">
                              <span
                                className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                                  item.mode === "kabupaten"
                                    ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                                    : "border-sky-400/35 bg-sky-500/15 text-sky-300"
                                }`}
                              >
                                {item.mode === "kabupaten" ? "Rekap Kabupaten" : "Per PKBM"}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                                <CheckCircle2 size={11} /> Sudah Tersimpan
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-xs">
                            <p className="font-mono font-extrabold text-slate-100">{item.nomorSurat}</p>
                            <p className="mt-0.5 font-semibold text-slate-400">{item.tanggalSurat}</p>
                          </td>

                          <td className="px-4 py-3.5 text-xs">
                            <p className="font-extrabold text-slate-100">{item.pkbmNama}</p>
                            <p className="mt-0.5 font-medium text-slate-400">
                              {item.mode === "pkbm"
                                ? `NPSN: ${item.pkbmNpsn ?? "—"} · ${item.wilayah}`
                                : `Wilayah ${item.wilayah} (${item.ringkasan.totalPkbm} PKBM)`}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-xs text-slate-300">
                            <p className="font-bold text-slate-100">
                              {item.ringkasan.totalDapodik} Dapodik ·{" "}
                              <span className="text-emerald-400">{item.ringkasan.berkasLengkap} Lengkap</span>
                            </p>
                            <p className="mt-0.5 font-medium text-slate-400">
                              Selisih:{" "}
                              <span className="font-bold text-rose-400">{item.ringkasan.selisihTanpaBerkas}</span>
                              {" · "}Lolos Dinas:{" "}
                              <span className="font-bold text-amber-300">{item.ringkasan.persentaseLolosDinas}%</span>
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-xs">
                            <p className="font-bold text-slate-100">{item.pejabatNama}</p>
                            <p className="mt-0.5 font-medium text-slate-400">{item.jabatanTtd}</p>
                            <p className="font-mono text-[11px] text-slate-500">NIP. {item.pejabatNip}</p>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditBa(item)}
                                className="inline-flex items-center gap-1 rounded-lg border border-sky-400/35 bg-sky-500/15 px-2.5 py-1.5 text-xs font-bold text-sky-300 transition hover:bg-sky-500/25"
                              >
                                <Pencil size={12} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setPrintBaDoc(item)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/25"
                              >
                                <Printer size={12} /> Cetak
                              </button>
                              {confirmDeleteBaId === item.id ? (
                                <div className="inline-flex items-center gap-1 rounded-lg border border-rose-400/40 bg-rose-500/15 px-1.5 py-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBa(item.id)}
                                    className="rounded bg-rose-600 px-2 py-0.5 text-[11px] font-extrabold text-white hover:bg-rose-500"
                                  >
                                    Ya, Hapus
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteBaId(null)}
                                    className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteBaId(item.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-500/15 px-2.5 py-1.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/25"
                                >
                                  <Trash2 size={12} /> Hapus
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}

                    {baStatusFilter !== "SUDAH" &&
                      filteredUnsavedBa.map((target) => (
                        <tr key={target.key} className="bg-amber-500/[0.04] transition hover:bg-amber-500/10">
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col items-start gap-1.5">
                              <span
                                className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                                  target.mode === "kabupaten"
                                    ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                                    : "border-sky-400/35 bg-sky-500/15 text-sky-300"
                                }`}
                              >
                                {target.mode === "kabupaten" ? "Rekap Kabupaten" : "Per PKBM"}
                              </span>
                              <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                                Belum Dibuat
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-xs font-semibold italic text-slate-500">
                            Belum diterbitkan
                          </td>

                          <td className="px-4 py-3.5 text-xs">
                            <p className="font-extrabold text-slate-100">{target.pkbmNama}</p>
                            <p className="mt-0.5 font-medium text-slate-400">
                              {target.mode === "pkbm"
                                ? `NPSN: ${target.pkbmNpsn ?? "—"} · ${target.wilayah}`
                                : `Wilayah ${target.wilayah} (${target.ringkasan.totalPkbm} PKBM)`}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-xs text-slate-300">
                            <p className="font-bold text-slate-100">
                              {target.ringkasan.totalDapodik} Dapodik ·{" "}
                              <span className="text-emerald-400">{target.ringkasan.berkasLengkap} Lengkap</span>
                            </p>
                            <p className="mt-0.5 font-medium text-slate-400">
                              Selisih:{" "}
                              <span className="font-bold text-rose-400">{target.ringkasan.selisihTanpaBerkas}</span>
                              {" · "}Lolos Dinas:{" "}
                              <span className="font-bold text-amber-300">{target.ringkasan.persentaseLolosDinas}%</span>
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-xs font-medium text-slate-400">
                            {target.pkbmKepala ? `Kepala: ${target.pkbmKepala}` : "Menunggu penerbitan Dinas"}
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleQuickCreateBa(target)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-[0_0_16px_rgba(245,158,11,0.28)] transition hover:from-amber-300 hover:to-amber-400"
                            >
                              <FilePlus2 size={14} /> Buat BA
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>
        )}
      </div>
      </div>
      </div>
      </div>

      {activeMenu === "verifikasi" && inspectStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-400/20 bg-[#0b1526]/96 text-slate-100 shadow-[0_28px_80px_rgba(2,6,23,0.8)] backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-slate-700/70 bg-gradient-to-r from-[#0a2c2a]/85 via-[#0e1c33]/90 to-[#111f38]/90 px-6 py-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                  VERIFIKASI DINAS PENDIDIKAN {inspectStudent.isDemoSimulation ? "· SIMULASI PAPARAN" : ""}
                </p>
                <h3 className="text-lg font-extrabold tracking-tight text-white">{inspectStudent.nama}</h3>
              </div>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setInspectStudent(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs">
              {inspectStudent.isDemoSimulation && (
                <p className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-3.5 py-2.5 text-xs font-bold text-amber-200">
                  Contoh data simulasi paparan (hanya pratinjau dokumen administrasi — perubahan tidak disimpan ke database).
                </p>
              )}

              <div className="grid gap-3 rounded-xl border border-slate-700/70 bg-slate-900/75 p-4 sm:grid-cols-2">
                <p><span className="font-semibold text-slate-400">NISN:</span> <strong className="font-mono text-slate-100">{inspectStudent.nisn}</strong></p>
                <p><span className="font-semibold text-slate-400">NIK:</span> <strong className="font-mono text-slate-100">{inspectStudent.nik ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-400">No. KK:</span> <strong className="font-mono text-slate-100">{inspectStudent.noKk ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-400">Ibu Kandung:</span> <strong className="text-slate-100">{inspectStudent.namaIbuKandung ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-400">Sekolah Asal:</span> <strong className="text-slate-100">{inspectStudent.sekolahAsal ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-400">No. Ijazah:</span> <strong className="text-slate-100">{inspectStudent.nomorIjazahTerakhir ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-400">Status PKBM:</span> <strong className="text-emerald-300">{inspectStudent.statusVerval}</strong></p>
                <p><span className="font-semibold text-slate-400">Tanggal Masuk:</span> <strong className="text-slate-100">{inspectStudent.tanggalMasuk ?? "—"}</strong></p>
              </div>

              <div className="rounded-xl border border-slate-700/70 bg-slate-900/75 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/70 pb-3">
                  <span className="font-extrabold uppercase tracking-wider text-slate-200">Pratinjau Berkas</span>
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
                            ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                            : "border border-slate-700 bg-slate-950/70 text-slate-300 hover:border-amber-400/40 hover:text-white"
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
                  if (!u) return <p className="py-6 text-center font-medium text-slate-400">Berkas belum diunggah.</p>;
                  if (u.startsWith("data:application/pdf") || u.toLowerCase().endsWith(".pdf")) {
                    return <iframe src={u} title="Pratinjau PDF" className="mt-3 h-64 w-full rounded-xl border border-slate-700 bg-white" />;
                  }
                  if (u.startsWith("data:image/") || /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(u)) {
                    return <img src={u} alt="Pratinjau Berkas" className="mx-auto mt-3 max-h-64 rounded-xl object-contain" />;
                  }
                  return (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950/75 p-3">
                      <span className="break-all font-mono text-amber-300">{u}</span>
                      {u.startsWith("http") && (
                        <a href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-emerald-300 underline hover:text-emerald-200">
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
                  className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 p-3 text-xs font-medium text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </label>

              {actionError && <p role="alert" className="font-bold text-rose-300">{actionError}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/70 bg-slate-950/60 px-6 py-4">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void submitDinasDecision("MENUNGGU_DINAS")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600/80 bg-slate-900/80 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
              >
                <RotateCcw size={13} /> Reset Menunggu
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void submitDinasDecision("PERLU_PERBAIKAN")}
                  className="rounded-xl border border-rose-500/40 bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-500 disabled:opacity-50"
                >
                  Minta Perbaikan
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void submitDinasDecision("LOLOS_VERVAL")}
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-[0_0_16px_rgba(16,185,129,0.3)] transition hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50"
                >
                  Loloskan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pratinjau & Cetak PDF Berita Acara Resmi Dinas */}
      {printBaDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md sm:p-8 print:static print:overflow-visible print:bg-white print:p-0">
          <div className="no-print mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-400/20 bg-[#0d192c]/95 px-5 py-3.5 text-slate-100 shadow-2xl backdrop-blur-xl">
            <div>
              <p className="text-sm font-extrabold text-white">Pratinjau Cetak Berita Acara Verval Dinas</p>
              <p className="text-xs font-medium text-slate-400">
                Gunakan tombol Cetak / Simpan PDF untuk menyimpan dokumen resmi ke format PDF.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.32)] transition hover:from-amber-300 hover:to-amber-400"
              >
                <Printer size={14} /> Cetak / Simpan PDF
              </button>
              <button
                type="button"
                onClick={() => setPrintBaDoc(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600/80 bg-slate-900/80 px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
              >
                <X size={14} /> Tutup
              </button>
            </div>
          </div>

          <article className="mx-auto max-w-4xl rounded-2xl bg-white p-8 text-slate-950 shadow-2xl sm:p-12 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
            {/* Kop Surat Dinas */}
            <header className="flex items-center gap-4 border-b-4 border-double border-slate-900 pb-4">
              {baKopLogo && (
                <img
                  src={baKopLogo}
                  alt="Logo Kop Dinas Pendidikan"
                  className="h-20 w-20 shrink-0 object-contain"
                />
              )}
              <div className="flex-1 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-800">
                  PEMERINTAH {printBaDoc.wilayah.toUpperCase()}
                </p>
                <h1 className="mt-0.5 text-lg font-black uppercase tracking-wide text-slate-950 sm:text-xl">
                  DINAS PENDIDIKAN DAN KEBUDAYAAN
                </h1>
                <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  BIDANG PEMBINAAN PAUD DAN PENDIDIKAN MASYARAKAT (DIKMAS)
                </p>
                <p className="mt-1 text-[11px] font-medium text-slate-600">
                  Portal Verifikasi &amp; Validasi Administrasi Kesetaraan Wilayah · {printBaDoc.wilayah}
                </p>
              </div>
              {baKopLogo && <div className="hidden h-20 w-20 shrink-0 sm:block" aria-hidden="true" />}
            </header>

            <section className="mt-6 text-center">
              <h2 className="text-base font-black uppercase tracking-wide underline underline-offset-4">
                BERITA ACARA VERIFIKASI DAN VALIDASI DATA WARGA BELAJAR
              </h2>
              <p className="mt-1 text-xs font-bold uppercase text-slate-700">
                {printBaDoc.mode === "kabupaten"
                  ? `REKAPITULASI TINGKAT ${printBaDoc.wilayah.toUpperCase()}`
                  : `SATUAN PENDIDIKAN KESETARAAN — ${printBaDoc.pkbmNama.toUpperCase()}`}
              </p>
              <p className="mt-1.5 font-mono text-xs font-bold text-slate-900">
                Nomor: {printBaDoc.nomorSurat}
              </p>
            </section>

            <section className="mt-6 space-y-4 text-justify text-xs leading-6 text-slate-900">
              <p>
                Pada hari ini, tanggal <strong>{printBaDoc.tanggalSurat}</strong>, bertempat di{" "}
                <strong>Dinas Pendidikan dan Kebudayaan {printBaDoc.wilayah}</strong>, telah dilaksanakan verifikasi dan
                validasi administratif data warga belajar pendidikan kesetaraan (kelengkapan biodata Dapodik, tanggal
                cut-off pendaftaran <strong>{printBaDoc.ringkasan.cutoffDate}</strong>, serta pemeriksaan 4 dokumen fisik:
                KK, Akta Kelahiran/KTP, Ijazah Terakhir, dan Surat Pindah) untuk sasaran berikut:
              </p>

              <table className="w-full text-xs">
                <tbody>
                  <tr>
                    <td className="w-52 py-0.5 font-bold">Jenis Berita Acara</td>
                    <td className="w-4">:</td>
                    <td>
                      {printBaDoc.mode === "kabupaten"
                        ? "Rekapitulasi Tingkat Kabupaten/Kota"
                        : "Per Satuan Pendidikan (PKBM)"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5 font-bold">
                      {printBaDoc.mode === "kabupaten" ? "Wilayah Kabupaten/Kota" : "Nama Lembaga / PKBM"}
                    </td>
                    <td>:</td>
                    <td className="font-bold">{printBaDoc.pkbmNama}</td>
                  </tr>
                  {printBaDoc.mode === "pkbm" && (
                    <>
                      <tr>
                        <td className="py-0.5 font-bold">NPSN / Kabupaten</td>
                        <td>:</td>
                        <td>
                          {printBaDoc.pkbmNpsn ?? "—"} / {printBaDoc.wilayah}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-0.5 font-bold">Kepala PKBM</td>
                        <td>:</td>
                        <td>{printBaDoc.pkbmKepala ?? "—"}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>

              <table className="w-full border-collapse border border-slate-900 text-xs">
                <thead>
                  <tr className="bg-slate-100 font-extrabold text-slate-950">
                    <th className="border border-slate-900 px-3 py-2 text-left">Indikator Rekapitulasi Verval</th>
                    <th className="w-40 border border-slate-900 px-3 py-2 text-right">Jumlah / Capaian</th>
                    <th className="w-36 border border-slate-900 px-3 py-2 text-center">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {printBaDoc.mode === "kabupaten" && (
                    <tr>
                      <td className="border border-slate-900 px-3 py-2">Jumlah PKBM Aktif Terpantau</td>
                      <td className="border border-slate-900 px-3 py-2 text-right font-bold">
                        {printBaDoc.ringkasan.totalPkbm} Lembaga
                      </td>
                      <td className="border border-slate-900 px-3 py-2 text-center">Terdaftar</td>
                    </tr>
                  )}
                  <tr>
                    <td className="border border-slate-900 px-3 py-2">Total Warga Belajar Tarikan Dapodik</td>
                    <td className="border border-slate-900 px-3 py-2 text-right font-bold">
                      {printBaDoc.ringkasan.totalDapodik} Siswa
                    </td>
                    <td className="border border-slate-900 px-3 py-2 text-center">Basis Dapodik</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-900 px-3 py-2">Total Warga Belajar Aktif Terdaftar di LMS</td>
                    <td className="border border-slate-900 px-3 py-2 text-right font-bold">
                      {printBaDoc.ringkasan.totalSiswa} Siswa
                    </td>
                    <td className="border border-slate-900 px-3 py-2 text-center">
                      A:{printBaDoc.ringkasan.paketA} · B:{printBaDoc.ringkasan.paketB} · C:{printBaDoc.ringkasan.paketC}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-900 px-3 py-2">
                      Warga Belajar Memenuhi Cut-Off ({printBaDoc.ringkasan.cutoffDate})
                    </td>
                    <td className="border border-slate-900 px-3 py-2 text-right font-bold">
                      {printBaDoc.ringkasan.siswaMemenuhiCutoff} Siswa
                    </td>
                    <td className="border border-slate-900 px-3 py-2 text-center">Sesuai Cut-Off</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-900 px-3 py-2">
                      Berkas Fisik Lengkap &amp; Valid (KK, Akta/KTP, Ijazah)
                    </td>
                    <td className="border border-slate-900 px-3 py-2 text-right font-bold">
                      {printBaDoc.ringkasan.berkasLengkap} Siswa
                    </td>
                    <td className="border border-slate-900 px-3 py-2 text-center">
                      {printBaDoc.ringkasan.kelengkapanVervalPersen}% Kelengkapan
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-900 px-3 py-2">
                      Selisih Warga Belajar Belum Lengkap / Tanpa Berkas Fisik
                    </td>
                    <td className="border border-slate-900 px-3 py-2 text-right font-bold">
                      {printBaDoc.ringkasan.selisihTanpaBerkas} Siswa
                    </td>
                    <td className="border border-slate-900 px-3 py-2 text-center">Wajib Tindak Lanjut</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-900 px-3 py-2 font-bold">
                      Warga Belajar Lolos Verval Dinas Pendidikan
                    </td>
                    <td className="border border-slate-900 px-3 py-2 text-right font-extrabold">
                      {printBaDoc.ringkasan.lolosVervalDinas} Siswa ({printBaDoc.ringkasan.persentaseLolosDinas}%)
                    </td>
                    <td className="border border-slate-900 px-3 py-2 text-center">
                      {printBaDoc.ringkasan.perluPerbaikanCount} Perbaikan / {printBaDoc.ringkasan.menungguDinasCount} Menunggu
                    </td>
                  </tr>
                </tbody>
              </table>

              {printBaDoc.catatan && (
                <div className="rounded-lg border border-slate-400 bg-slate-50 px-4 py-3 text-xs">
                  <p className="font-extrabold uppercase tracking-wide text-slate-900">Catatan Dinas Pendidikan:</p>
                  <p className="mt-1 whitespace-pre-line text-slate-800">{printBaDoc.catatan}</p>
                </div>
              )}

              <p>
                Demikian Berita Acara Verifikasi dan Validasi Data Warga Belajar ini dibuat dengan sebenarnya untuk
                digunakan sebagai dasar pembinaan administrasi dan pelaporan pendidikan kesetaraan di{" "}
                {printBaDoc.wilayah}.
              </p>
            </section>

            <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs">
              <div>
                {printBaDoc.mode === "pkbm" ? (
                  <>
                    <p>Mengetahui,</p>
                    <p className="font-bold">Kepala {printBaDoc.pkbmNama}</p>
                    <div className="h-20" />
                    <p className="font-bold underline">
                      {printBaDoc.pkbmKepala || "( ............................................. )"}
                    </p>
                  </>
                ) : (
                  <>
                    <p>Petugas Verifikator Portal Dinas,</p>
                    <p className="font-bold">Operator Verval Dikmas</p>
                    <div className="h-20" />
                    <p className="font-bold underline">{petugasNama}</p>
                  </>
                )}
              </div>
              <div>
                <p>
                  {printBaDoc.wilayah}, {printBaDoc.tanggalSurat}
                </p>
                <p className="font-bold">{printBaDoc.jabatanTtd}</p>
                <div className="h-20" />
                <p className="font-bold underline">{printBaDoc.pejabatNama}</p>
                <p className="mt-0.5 font-mono text-[11px]">NIP. {printBaDoc.pejabatNip}</p>
              </div>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
