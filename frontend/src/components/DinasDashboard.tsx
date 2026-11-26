import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
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
  Upload,
  Users,
  X,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { PortalSpinner } from "./DashboardUI";
import {
  clearAuthCache,
  getAuthCache,
  saveAuthCache,
  type DinasAuthCache,
} from "./authSessionCache";
import { DocumentPreviewFrame } from "./DocumentPreviewFrame";
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

type VervalSource = "LMS" | "MANUAL_DINAS";

type ManualVervalChecklist = {
  kk: boolean;
  aktaKtp: boolean;
  ijazah: boolean;
  suratPindah: boolean;
};

type DinasStudentRow = {
  id: string;
  sumberVerval?: VervalSource;
  pkbmNama?: string | null;
  pkbmNpsn?: string | null;
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
  manualChecklist?: ManualVervalChecklist;
  isDemoSimulation?: boolean;
};

type ManualDinasStudentApiRow = {
  id: string;
  sumberVerval: "MANUAL_DINAS";
  wilayah: string;
  pkbmNama: string;
  pkbmNpsn: string | null;
  nisn: string;
  nama: string;
  nik: string | null;
  noKk: string | null;
  namaIbuKandung: string | null;
  paketKategori: string;
  kelasNama: string;
  tanggalMasuk: string | null;
  statusVervalDinas: VervalDinasStatus;
  catatanDinas: string | null;
  manualChecklist: ManualVervalChecklist;
};

const EMPTY_MANUAL_CHECKLIST: ManualVervalChecklist = {
  kk: false,
  aktaKtp: false,
  ijazah: false,
  suratPindah: false,
};

function mapManualRowToStudentRow(item: ManualDinasStudentApiRow): DinasStudentRow {
  const checklist = item.manualChecklist ?? EMPTY_MANUAL_CHECKLIST;
  const checkedCount = [checklist.kk, checklist.aktaKtp, checklist.ijazah, checklist.suratPindah].filter(Boolean).length;
  return {
    id: item.id,
    sumberVerval: "MANUAL_DINAS",
    pkbmNama: item.pkbmNama,
    pkbmNpsn: item.pkbmNpsn,
    nisn: item.nisn,
    nama: item.nama,
    nik: item.nik,
    noKk: item.noKk,
    tempatLahir: null,
    tanggalLahir: null,
    jenisKelamin: null,
    jenjang: item.paketKategori,
    paketKategori: item.paketKategori,
    kelasNama: item.kelasNama || item.paketKategori,
    tanggalMasuk: item.tanggalMasuk,
    memenuhiCutoff: Boolean(item.tanggalMasuk),
    namaIbuKandung: item.namaIbuKandung,
    alamatLengkap: null,
    desaKelurahan: null,
    kecamatan: null,
    sekolahAsal: null,
    npsnAsal: null,
    nomorIjazahTerakhir: null,
    sumberDapodik: false,
    urlKk: null,
    urlAktaKtp: null,
    urlIjazah: null,
    urlSuratPindah: null,
    statusVerval: "SIAP_VERVAL",
    catatanVerval: "Upload Manual Non-LMS (berkas diperiksa secara fisik/manual).",
    statusVervalDinas: item.statusVervalDinas,
    catatanDinas: item.catatanDinas,
    kelengkapanPersen: Math.round((checkedCount / 4) * 100),
    manualChecklist: checklist,
  };
}

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
  manualStudents: DinasStudentRow[];
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

  const manualStudents: DinasStudentRow[] = [
    {
      id: "demo-manual-1",
      sumberVerval: "MANUAL_DINAS",
      pkbmNama: "PKBM Maju Mandiri (Non-LMS)",
      pkbmNpsn: "P2029988",
      nisn: "0054412091",
      nama: "Yudi Hermawan",
      nik: "3208110504040003",
      noKk: "3208111902110012",
      tempatLahir: null,
      tanggalLahir: null,
      jenisKelamin: "L",
      jenjang: "Paket C",
      paketKategori: "Paket C",
      kelasNama: "Paket C XII",
      tanggalMasuk: `${cutoffDate.slice(0, 4)}-07-20`,
      memenuhiCutoff: true,
      namaIbuKandung: "Tati Suryati",
      alamatLengkap: null,
      desaKelurahan: null,
      kecamatan: null,
      sekolahAsal: null,
      npsnAsal: null,
      nomorIjazahTerakhir: null,
      sumberDapodik: false,
      urlKk: null,
      urlAktaKtp: null,
      urlIjazah: null,
      urlSuratPindah: null,
      statusVerval: "SIAP_VERVAL",
      catatanVerval: "Upload Manual Non-LMS (berkas fisik diverifikasi langsung oleh Dinas).",
      statusVervalDinas: "MENUNGGU_DINAS",
      catatanDinas: null,
      kelengkapanPersen: 50,
      manualChecklist: { kk: true, aktaKtp: true, ijazah: false, suratPindah: false },
      isDemoSimulation: true,
    },
    {
      id: "demo-manual-2",
      sumberVerval: "MANUAL_DINAS",
      pkbmNama: "PKBM Maju Mandiri (Non-LMS)",
      pkbmNpsn: "P2029988",
      nisn: "0061189320",
      nama: "Neng Susi Susanti",
      nik: "3208114809050007",
      noKk: "3208110403120045",
      tempatLahir: null,
      tanggalLahir: null,
      jenisKelamin: "P",
      jenjang: "Paket B",
      paketKategori: "Paket B",
      kelasNama: "Paket B IX",
      tanggalMasuk: `${cutoffDate.slice(0, 4)}-07-12`,
      memenuhiCutoff: true,
      namaIbuKandung: "Imas Masitoh",
      alamatLengkap: null,
      desaKelurahan: null,
      kecamatan: null,
      sekolahAsal: null,
      npsnAsal: null,
      nomorIjazahTerakhir: null,
      sumberDapodik: false,
      urlKk: null,
      urlAktaKtp: null,
      urlIjazah: null,
      urlSuratPindah: null,
      statusVerval: "SIAP_VERVAL",
      catatanVerval: "Berkas fisik lengkap & telah diperiksa petugas Dinas.",
      statusVervalDinas: "LOLOS_VERVAL",
      catatanDinas: "Berkas fisik KK, Akta, dan Ijazah SD telah diperiksa langsung dan sesuai.",
      kelengkapanPersen: 75,
      manualChecklist: { kk: true, aktaKtp: true, ijazah: true, suratPindah: false },
      isDemoSimulation: true,
    },
  ];

  return { pkbm: pkbmList, studentsByPkbmId, manualStudents };
}

function statusDinasBadge(status: VervalDinasStatus): { label: string; cls: string } {
  switch (status) {
    case "LOLOS_VERVAL":
      return { label: "Terverifikasi", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" };
    case "PERLU_PERBAIKAN":
      return { label: "Perlu Perbaikan", cls: "border-rose-300 bg-rose-50 text-rose-800" };
    default:
      return { label: "Menunggu Verifikasi", cls: "border-amber-300 bg-amber-50 text-amber-900" };
  }
}

function useLockDinasOceanTheme(): void {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.tenantTheme;
    root.dataset.tenantTheme = "ocean";
    return () => {
      if (previous) {
        root.dataset.tenantTheme = previous;
      } else {
        delete root.dataset.tenantTheme;
      }
    };
  }, []);
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
  useLockDinasOceanTheme();
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
        <BrandLogo alt="Logo SIPUT PKBM" className="h-12 w-12 rounded-2xl" />
        <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-700">
          SIPUT PKBM / PORTAL DINAS PENDIDIKAN
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
  useLockDinasOceanTheme();
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
  const [manualStudents, setManualStudents] = useState<DinasStudentRow[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | VervalSource>("ALL");
  const [studentStatusFilter, setStudentStatusFilter] = useState("");

  const [inspectStudent, setInspectStudent] = useState<DinasStudentRow | null>(null);
  const [catatanInput, setCatatanInput] = useState("");
  const [manualChecklistInput, setManualChecklistInput] = useState<ManualVervalChecklist>(EMPTY_MANUAL_CHECKLIST);
  const [quickVerifyBusyId, setQuickVerifyBusyId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [docTab, setDocTab] = useState<"kk" | "akta" | "ijazah" | "pindah">("kk");
  const [reloadTick, setReloadTick] = useState(0);

  // Modal Upload Manual Non-LMS (Data Siswa Saja, Berkas Fisik Manual)
  const [manualUploadOpen, setManualUploadOpen] = useState(false);
  const [manualUploadBusy, setManualUploadBusy] = useState(false);
  const [manualUploadError, setManualUploadError] = useState("");
  const [manualForm, setManualForm] = useState({
    pkbmNama: "",
    pkbmNpsn: "",
    nama: "",
    nisn: "",
    nik: "",
    noKk: "",
    namaIbuKandung: "",
    paketKategori: "Paket C" as "Paket A" | "Paket B" | "Paket C",
    kelasNama: "",
    tanggalMasuk: "",
  });

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

  // Otomatis pilih PKBM pertama agar panel Verval Peserta Didik langsung siap dipakai
  useEffect(() => {
    const list = displayedView?.pkbm ?? [];
    if (list.length === 0) return;
    if (!selectedPkbm || !list.some((item) => item.id === selectedPkbm.id)) {
      setSelectedPkbm(list[0]);
    }
  }, [displayedView, selectedPkbm]);

  // Muat daftar peserta didik Jalur Upload Manual Non-LMS
  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    setManualLoading(true);
    const qs = wilayahFilter ? `?kabupaten=${encodeURIComponent(wilayahFilter)}` : "";
    fetchWithTimeout(`/api/dinas/manual-siswa${qs}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as { siswa?: ManualDinasStudentApiRow[] } | null;
        if (Array.isArray(body?.siswa)) {
          setManualStudents(body.siswa.map(mapManualRowToStudentRow));
        }
      })
      .catch(() => {
        // Non-blocking
      })
      .finally(() => {
        if (!controller.signal.aborted) setManualLoading(false);
      });
    return () => controller.abort();
  }, [status, wilayahFilter, reloadTick]);

  useEffect(() => {
    if (!selectedPkbm) {
      setPkbmStudents([]);
      setStudentsLoading(false);
      return;
    }
    if (selectedPkbm.isDemoSimulation) {
      const baseRows = (demoDataset.studentsByPkbmId[selectedPkbm.id] ?? []).map((row) => ({
        ...row,
        sumberVerval: "LMS" as const,
        pkbmNama: selectedPkbm.nama,
        pkbmNpsn: selectedPkbm.npsn,
      }));
      setStudentsLoading(false);
      setPkbmStudents(baseRows);
      return;
    }

    const controller = new AbortController();
    setStudentsLoading(true);
    fetchWithTimeout(`/api/dinas/pkbm/${encodeURIComponent(selectedPkbm.id)}/siswa`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { error?: string; siswa?: DinasStudentRow[] } | null;
        if (!res.ok || !body?.siswa) {
          throw new Error(body?.error || "Daftar siswa PKBM belum dapat dimuat.");
        }
        setPkbmStudents(
          body.siswa.map((row) => ({
            ...row,
            sumberVerval: "LMS",
            pkbmNama: row.pkbmNama ?? selectedPkbm.nama,
            pkbmNpsn: row.pkbmNpsn ?? selectedPkbm.npsn,
          })),
        );
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
  }, [selectedPkbm, reloadTick, demoDataset]);

  const allVervalStudents = useMemo(() => {
    const manualCombined = showDemoSimulation
      ? [...manualStudents, ...demoDataset.manualStudents]
      : manualStudents;
    return [...pkbmStudents, ...manualCombined];
  }, [pkbmStudents, manualStudents, showDemoSimulation, demoDataset.manualStudents]);

  const vervalStats = useMemo(() => {
    let viaLms = 0;
    let manualDinas = 0;
    let menunggu = 0;
    let terverifikasi = 0;
    let perluPerbaikan = 0;
    for (const row of allVervalStudents) {
      if (row.sumberVerval === "MANUAL_DINAS") manualDinas += 1;
      else viaLms += 1;
      if (row.statusVervalDinas === "LOLOS_VERVAL") terverifikasi += 1;
      else if (row.statusVervalDinas === "PERLU_PERBAIKAN") perluPerbaikan += 1;
      else menunggu += 1;
    }
    return {
      total: allVervalStudents.length,
      viaLms,
      manualDinas,
      menunggu,
      terverifikasi,
      perluPerbaikan,
    };
  }, [allVervalStudents]);

  const filteredVervalStudents = useMemo(() => {
    const term = studentSearch.trim().toLowerCase();
    return allVervalStudents.filter((row) => {
      const rowSource: VervalSource = row.sumberVerval === "MANUAL_DINAS" ? "MANUAL_DINAS" : "LMS";
      if (sourceFilter !== "ALL" && rowSource !== sourceFilter) return false;
      if (studentStatusFilter && row.statusVervalDinas !== studentStatusFilter) return false;
      if (term) {
        const hay = `${row.nama} ${row.nisn} ${row.nik ?? ""} ${row.pkbmNama ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [allVervalStudents, sourceFilter, studentStatusFilter, studentSearch]);

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
    const isManual = inspectStudent.sumberVerval === "MANUAL_DINAS";
    setActionBusy(true);
    setActionError("");
    try {
      const endpoint = isManual
        ? `/api/dinas/manual-siswa/${encodeURIComponent(inspectStudent.id)}/verval`
        : `/api/dinas/siswa/${encodeURIComponent(inspectStudent.id)}/verval`;
      const payload = isManual
        ? {
            wilayah: wilayahFilter || summary?.wilayah || "",
            statusVervalDinas,
            catatanDinas: catatanInput.trim() || null,
            manualChecklist: manualChecklistInput,
          }
        : {
            statusVervalDinas,
            catatanDinas: catatanInput.trim() || null,
          };
      const res = await fetchWithTimeout(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  async function quickVerifyManualStudent(st: DinasStudentRow) {
    if (st.isDemoSimulation) {
      setToast("Mode Simulasi Demo bersifat pratinjau paparan — unggah data riil via Upload Manual Non-LMS untuk menyimpan verifikasi.");
      return;
    }
    setQuickVerifyBusyId(st.id);
    setError("");
    try {
      const nextChecklist: ManualVervalChecklist = {
        kk: true,
        aktaKtp: true,
        ijazah: true,
        suratPindah: st.manualChecklist?.suratPindah ?? false,
      };
      const res = await fetchWithTimeout(`/api/dinas/manual-siswa/${encodeURIComponent(st.id)}/verval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wilayah: wilayahFilter || summary?.wilayah || "",
          statusVervalDinas: "LOLOS_VERVAL",
          catatanDinas: st.catatanDinas ?? "Berkas fisik manual telah diperiksa dan dinyatakan sesuai.",
          manualChecklist: nextChecklist,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal memverifikasi siswa berkas manual.");
      setToast(body?.message || `${st.nama} (Berkas Manual) berhasil diverifikasi.`);
      setReloadTick((v) => v + 1);
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Verifikasi cepat berkas manual gagal."));
    } finally {
      setQuickVerifyBusyId(null);
    }
  }

  async function handleManualQuickAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualUploadError("");
    if (!manualForm.pkbmNama.trim() || !manualForm.nama.trim()) {
      setManualUploadError("Nama PKBM dan Nama Siswa wajib diisi.");
      return;
    }
    setManualUploadBusy(true);
    try {
      const res = await fetchWithTimeout("/api/dinas/manual-siswa/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wilayah: wilayahFilter || summary?.wilayah || "",
          pkbmNama: manualForm.pkbmNama.trim(),
          pkbmNpsn: manualForm.pkbmNpsn.trim() || null,
          rows: [manualForm],
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menambahkan siswa jalur Upload Manual.");
      setToast(body?.message || "Peserta didik jalur Upload Manual Non-LMS berhasil ditambahkan.");
      setManualForm((prev) => ({
        ...prev,
        nama: "",
        nisn: "",
        nik: "",
        noKk: "",
        namaIbuKandung: "",
        kelasNama: "",
      }));
      setManualUploadOpen(false);
      setSourceFilter("MANUAL_DINAS");
      setReloadTick((v) => v + 1);
    } catch (failure: unknown) {
      setManualUploadError(describeFetchError(failure, "Gagal menambahkan data siswa manual."));
    } finally {
      setManualUploadBusy(false);
    }
  }

  async function handleManualExcelUpload(file: File | undefined) {
    if (!file) return;
    setManualUploadError("");
    setManualUploadBusy(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const pick = (obj: Record<string, unknown>, keys: string[]) => {
        for (const k of Object.keys(obj)) {
          const norm = k.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
          if (keys.includes(norm)) {
            const val = obj[k];
            if (val !== undefined && val !== null && String(val).trim() !== "") return String(val).trim();
          }
        }
        return "";
      };
      const parsedRows = rawRows
        .map((r) => ({
          pkbmNama: pick(r, ["namapkbm", "pkbm", "lembaga", "namalembaga", "sekolah"]) || manualForm.pkbmNama.trim(),
          pkbmNpsn: pick(r, ["npsn", "npsnpkbm"]) || manualForm.pkbmNpsn.trim(),
          nama: pick(r, ["nama", "namasiswa", "namawargabelajar", "pesertadidik"]),
          nisn: pick(r, ["nisn"]),
          nik: pick(r, ["nik"]),
          noKk: pick(r, ["nokk", "kk", "nomorkk"]),
          namaIbuKandung: pick(r, ["namaibu", "namaibukandung", "ibukandung", "ibu"]),
          paketKategori: pick(r, ["paket", "jenjang", "program"]) || manualForm.paketKategori,
          kelasNama: pick(r, ["kelas", "rombel", "tingkat"]),
          tanggalMasuk: pick(r, ["tanggalmasuk", "tglmasuk"]),
        }))
        .filter((item) => item.nama && item.pkbmNama);

      if (parsedRows.length === 0) {
        throw new Error(
          "Tidak ada baris valid pada file Excel. Pastikan ada kolom 'Nama' dan 'Nama PKBM' (atau isi Nama PKBM di formulir).",
        );
      }

      const res = await fetchWithTimeout("/api/dinas/manual-siswa/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wilayah: wilayahFilter || summary?.wilayah || "",
          pkbmNama: manualForm.pkbmNama.trim(),
          pkbmNpsn: manualForm.pkbmNpsn.trim() || null,
          rows: parsedRows,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Impor Excel siswa manual gagal.");
      setToast(body?.message || `${parsedRows.length} siswa manual Non-LMS berhasil diunggah.`);
      setManualUploadOpen(false);
      setSourceFilter("MANUAL_DINAS");
      setReloadTick((v) => v + 1);
    } catch (failure: unknown) {
      setManualUploadError(describeFetchError(failure, "Gagal membaca atau mengunggah file Excel."));
    } finally {
      setManualUploadBusy(false);
    }
  }

  async function handleDeleteManualStudent(st: DinasStudentRow) {
    if (st.isDemoSimulation) return;
    setError("");
    try {
      const qs = wilayahFilter ? `?kabupaten=${encodeURIComponent(wilayahFilter)}` : "";
      const res = await fetchWithTimeout(`/api/dinas/manual-siswa/${encodeURIComponent(st.id)}${qs}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menghapus data siswa manual.");
      setToast(body?.message || "Data siswa manual dihapus.");
      setReloadTick((v) => v + 1);
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Gagal menghapus data siswa manual."));
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
        data-tenant-theme="ocean"
        className="dashboard-canvas flex min-h-screen items-center justify-center p-8 text-slate-900 antialiased"
        style={{
          backgroundImage:
            "radial-gradient(rgba(37, 99, 235, 0.14) 1px, transparent 1px), linear-gradient(135deg, #eefaff 0%, #dceffa 52%, #edf5ff 100%)",
          backgroundSize: "22px 22px, 100% 100%",
        }}
      >
        <div className="max-w-md rounded-2xl border border-white/95 bg-white/90 p-6 shadow-xl backdrop-blur-xl">
          <p className="text-sm font-bold text-rose-700">{error || "Sesi Portal Dinas Pendidikan tidak tersedia."}</p>
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
      data-tenant-theme="ocean"
      className="dashboard-canvas min-h-screen text-slate-900 antialiased"
      style={{
        backgroundImage:
          "radial-gradient(rgba(37, 99, 235, 0.14) 1px, transparent 1px), linear-gradient(135deg, #eefaff 0%, #dceffa 52%, #edf5ff 100%)",
        backgroundSize: "22px 22px, 100% 100%",
      }}
    >
      <div className={printBaDoc ? "no-print" : undefined}>
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        {/* Sidebar Navigasi Portal Dinas Pendidikan */}
        <aside
          className={`${
            menuOpen ? "flex" : "hidden"
          } fixed inset-y-0 left-0 z-50 w-72 flex-col border-r border-white/90 bg-white/88 p-4 text-slate-900 shadow-[8px_0_32px_rgba(37,99,235,0.08)] backdrop-blur-2xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <BrandLogo alt="Logo SIPUT PKBM" className="h-11 w-11 rounded-xl" />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold tracking-tight text-slate-950">Portal Dinas</p>
                <p className="truncate text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                  VERVAL KESETARAAN
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Tutup menu sidebar Dinas"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700">Wilayah Aktif</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Aktif
              </span>
            </div>
            <p className="mt-1 truncate text-xs font-extrabold text-slate-900">
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
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25"
                  : "border border-transparent text-slate-800 hover:border-blue-200 hover:bg-blue-50/80"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    activeMenu === "verifikasi"
                      ? "bg-white/20 text-white"
                      : "bg-blue-100/80 text-blue-700"
                  }`}
                >
                  <ShieldCheck size={16} />
                </span>
                <span className="truncate">Verifikasi &amp; Monitoring</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${
                  activeMenu === "verifikasi"
                    ? "bg-amber-400 text-slate-950"
                    : "border border-slate-200 bg-slate-100 text-slate-700"
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
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25"
                  : "border border-transparent text-slate-800 hover:border-blue-200 hover:bg-blue-50/80"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    activeMenu === "buat-ba"
                      ? "bg-white/20 text-white"
                      : "bg-sky-100/90 text-sky-700"
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
                      ? "bg-amber-400 text-slate-950"
                      : "border border-amber-300 bg-amber-100 text-amber-900"
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
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25"
                  : "border border-transparent text-slate-800 hover:border-blue-200 hover:bg-blue-50/80"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    activeMenu === "arsip-ba"
                      ? "bg-white/20 text-white"
                      : "bg-amber-100/90 text-amber-800"
                  }`}
                >
                  <Archive size={16} />
                </span>
                <span className="truncate">Arsip &amp; Status BA</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${
                  activeMenu === "arsip-ba"
                    ? "bg-amber-400 text-slate-950"
                    : "border border-slate-200 bg-slate-100 text-slate-700"
                }`}
              >
                {baArchive.length}/{baArchive.length + unsavedBaTargets.length}
              </span>
            </button>
          </nav>

          <div className="mt-4 space-y-2.5 border-t border-slate-200/80 pt-3.5">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 text-xs">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Petugas Login</p>
              <p className="mt-0.5 truncate font-extrabold text-slate-900">{petugasNama}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100"
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
            className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-xs lg:hidden"
          />
        )}

        {/* Konten Utama per Menu */}
        <div className="min-w-0 flex-1 pb-10">
          <header className="sticky top-0 z-30 border-b border-white/95 bg-white/85 px-4 py-3 shadow-[0_6px_24px_rgba(37,99,235,0.06)] backdrop-blur-xl sm:px-6">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  aria-label="Buka menu sidebar Dinas"
                  aria-expanded={menuOpen}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:border-blue-300 hover:bg-blue-50 lg:hidden"
                >
                  <Menu size={20} />
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-950 sm:text-base">
                      {activeMenuTitle}
                    </h1>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {summary ? summary.wilayah : activeWilayahLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] font-bold tracking-wide text-slate-500">
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
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25 hover:from-blue-700 hover:to-indigo-700"
                      : "border border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/70"
                  }`}
                >
                  <Sparkles size={14} />
                  Simulasi Demo
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                      showDemoSimulation
                        ? "bg-amber-400 text-slate-950"
                        : "bg-slate-100 text-slate-600"
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
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
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
        {/* Hero Banner Ocean Blue & Gold sesuai Menu Sidebar Aktif */}
        {activeMenu === "verifikasi" ? (
          <section
            className="relative overflow-hidden rounded-2xl p-6 text-white shadow-[0_18px_40px_rgba(37,99,235,0.26)] sm:p-7"
            style={{ background: "linear-gradient(115deg, #1d4ed8 0%, #2563eb 52%, #4338ca 100%)" }}
          >
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[36px] border-white/10" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-amber-300/15 blur-3xl" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-0 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-bold tracking-wide text-white backdrop-blur-md">
                  <ShieldCheck size={13} />
                  Verifikasi &amp; Validasi Kesetaraan Wilayah · Administratif
                </span>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  Verifikasi &amp; Monitoring PKBM
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

              <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={!displayedView || displayedView.pkbm.length === 0 || exporting}
                  onClick={() => void handleExportRekap()}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3 text-xs font-extrabold text-slate-950 shadow-lg shadow-amber-950/20 transition hover:from-amber-300 hover:to-amber-400 disabled:opacity-50"
                >
                  <FileSpreadsheet size={16} aria-hidden="true" />
                  {exporting ? "Menyiapkan..." : "Export Rekap Verval Kabupaten"}
                </button>
              </div>
            </div>
          </section>
        ) : activeMenu === "buat-ba" ? (
          <section
            className="relative overflow-hidden rounded-2xl p-6 text-white shadow-[0_18px_40px_rgba(37,99,235,0.26)] sm:p-7"
            style={{ background: "linear-gradient(115deg, #1d4ed8 0%, #2563eb 52%, #4338ca 100%)" }}
          >
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[36px] border-white/10" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-amber-300/15 blur-3xl" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-0 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-bold tracking-wide text-white backdrop-blur-md">
                  <FilePlus2 size={13} />
                  Penerbitan Dokumen Resmi · {activeWilayahLabel}
                </span>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  {editingBaId ? "Edit Berita Acara Verval" : "Buat Berita Acara Verval"}
                </h2>
                <p className="mt-1.5 text-sm font-medium leading-6 text-blue-50">
                  Susun Berita Acara resmi per Satuan Pendidikan (PKBM) maupun Rekapitulasi Kabupaten/Kota dengan data Dapodik &amp; kelengkapan berkas terisi otomatis.
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => selectDinasMenu("arsip-ba")}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/15 px-4 py-3 text-xs font-extrabold text-white backdrop-blur-md transition hover:bg-white/25"
                >
                  <Archive size={15} aria-hidden="true" />
                  Buka Arsip BA ({baArchive.length})
                </button>
                <button
                  type="button"
                  onClick={handlePrintFromForm}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3 text-xs font-extrabold text-slate-950 shadow-lg shadow-amber-950/20 transition hover:from-amber-300 hover:to-amber-400"
                >
                  <Printer size={16} aria-hidden="true" />
                  Cetak / Simpan PDF Berita Acara
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section
            className="relative overflow-hidden rounded-2xl p-6 text-white shadow-[0_18px_40px_rgba(37,99,235,0.26)] sm:p-7"
            style={{ background: "linear-gradient(115deg, #1d4ed8 0%, #2563eb 52%, #4338ca 100%)" }}
          >
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[36px] border-white/10" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-amber-300/15 blur-3xl" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-0 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-bold tracking-wide text-white backdrop-blur-md">
                  <Archive size={13} />
                  Manajemen Arsip &amp; Status Penerbitan · {activeWilayahLabel}
                </span>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  Arsip &amp; Monitoring Berita Acara
                </h2>
                <p className="mt-1.5 text-sm font-medium leading-6 text-blue-50">
                  Kelola seluruh Berita Acara Verval yang telah diterbitkan, cetak ulang PDF, perbarui data, atau pantau lembaga PKBM yang belum menerbitkan Berita Acara.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 font-bold text-white backdrop-blur-sm">
                    Sudah Tersimpan: {baArchive.length}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-amber-400/20 px-3 py-1 font-bold text-amber-100 backdrop-blur-sm">
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
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3 text-xs font-extrabold text-slate-950 shadow-lg shadow-amber-950/20 transition hover:from-amber-300 hover:to-amber-400"
                >
                  <FilePlus2 size={16} aria-hidden="true" />
                  Buat Berita Acara Baru
                </button>
              </div>
            </div>
          </section>
        )}

        {showDemoSimulation && summary && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-amber-400/80 bg-amber-50/95 px-4 py-3 text-xs text-slate-900 shadow-sm backdrop-blur-md">
            <div className="flex items-start gap-2.5 sm:items-center">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-amber-600 sm:mt-0" />
              <p className="font-medium leading-5 text-slate-800">
                <strong className="font-extrabold text-amber-900">Mode Paparan Aktif:</strong>{" "}
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
              className="shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-[11px] font-extrabold text-amber-900 transition hover:bg-amber-100"
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
          <p role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-bold text-rose-900 shadow-sm">
            <AlertTriangle size={16} className="shrink-0 text-rose-600" />
            {error}
          </p>
        )}

        {/* Halaman 1: Verifikasi & Monitoring PKBM */}
        {activeMenu === "verifikasi" && (
        <>
        {/* Baris 2: 4 Kartu KPI Ocean Blue & Gold */}
        {!displayedView ? (
          error ? null : <DinasCardSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-white/95 bg-white/90 p-5 text-slate-900 shadow-[0_10px_28px_rgba(37,99,235,0.08)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-600">
                <span>Total PKBM Terdaftar</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Building2 size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight tabular-nums text-slate-950">{displayedView.kpi.totalPkbm}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                {summary?.pkbm.length ?? 0} lembaga riil DB
                {showDemoSimulation ? ` + ${demoDataset.pkbm.length} simulasi` : ""}
              </p>
            </article>

            <article className="rounded-2xl border border-white/95 bg-white/90 p-5 text-slate-900 shadow-[0_10px_28px_rgba(37,99,235,0.08)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-600">
                <span>Total Warga Belajar</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <Users size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight tabular-nums text-slate-950">{displayedView.kpi.totalWargaBelajar}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                Paket A: {displayedView.kpi.totalPaketA} · B: {displayedView.kpi.totalPaketB} · C: {displayedView.kpi.totalPaketC}
              </p>
            </article>

            <article className="rounded-2xl border-2 border-amber-400 bg-white/95 p-5 text-slate-900 shadow-[0_10px_28px_rgba(245,158,11,0.14)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-amber-800">
                <span>Dapodik vs Berkas Fisik</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <FileCheck2 size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight tabular-nums text-slate-950">{displayedView.kpi.totalDapodik}</p>
              <p className="mt-1 text-xs font-semibold text-slate-700">
                Lengkap:{" "}
                <span className="font-extrabold text-emerald-700">{displayedView.kpi.totalBerkasLengkap}</span>
                {" · "}Selisih:{" "}
                <span className="font-extrabold text-rose-700">{displayedView.kpi.totalSelisihTanpaBerkas}</span>
                {" · "}Cut-Off: <span className="font-bold text-blue-700">{displayedView.kpi.totalCutoff}</span>
              </p>
            </article>

            <article className="rounded-2xl border border-white/95 bg-white/90 p-5 text-slate-900 shadow-[0_10px_28px_rgba(37,99,235,0.08)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-600">
                <span>Lolos Verval Dinas</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <ShieldCheck size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight tabular-nums text-emerald-700">{displayedView.kpi.persentaseLolosVerval}%</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                {displayedView.kpi.totalLolosVervalDinas} dari {displayedView.kpi.totalWargaBelajar} warga belajar
              </p>
            </article>
          </div>
        )}

        {/* Baris 3: Tabel Monitoring PKBM */}
        <section className="space-y-4 rounded-2xl border border-white/95 bg-white/90 p-5 text-slate-900 shadow-[0_12px_32px_rgba(37,99,235,0.08)] backdrop-blur-xl sm:p-6">
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
                      className={selectedPkbm?.id === item.id ? "bg-blue-50/80" : "transition hover:bg-sky-50/60"}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-extrabold text-slate-950">{item.nama}</p>
                          {item.isDemoSimulation ? (
                            <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-800">
                              Simulasi Demo
                            </span>
                          ) : (
                            <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-blue-700">
                              Data Riil DB
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs font-medium text-slate-600">
                          NPSN: <span className="font-mono text-slate-800">{item.npsn ?? "—"}</span> · {item.kabupatenKota ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-700">
                        <span className="font-extrabold text-slate-950 tabular-nums">{item.totalDapodik} Dapodik</span>
                        <span className="ml-1.5 font-medium text-slate-500">({item.totalSiswa} siswa LMS)</span>
                        <p className="mt-0.5 font-medium text-slate-600">
                          A: {item.paketA} · B: {item.paketB} · C: {item.paketC}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-extrabold text-blue-700 tabular-nums">{item.siswaMemenuhiCutoff} siswa</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500"
                              style={{ width: `${item.kelengkapanVervalPersen}%` }}
                            />
                          </div>
                          <span className="text-xs font-extrabold text-slate-900 tabular-nums">{item.kelengkapanVervalPersen}%</span>
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-slate-600">
                          Lengkap:{" "}
                          <span className="font-extrabold text-emerald-700">{item.berkasLengkap}</span>
                          {" · "}Selisih:{" "}
                          <span className={item.selisihTanpaBerkas > 0 ? "font-extrabold text-rose-700" : "font-semibold text-slate-500"}>
                            {item.selisihTanpaBerkas}
                          </span>
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        <span className="font-extrabold text-emerald-700 tabular-nums">{item.persentaseLolosDinas}%</span>
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
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm shadow-blue-600/25 transition hover:from-blue-700 hover:to-indigo-700"
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

        {/* Baris 4: Panel Verval Peserta Didik PKBM (Dua Jalur: Via LMS & Upload Manual Non-LMS) */}
        <section id="panel-nominatif-dinas" className="scroll-mt-6 space-y-4 rounded-2xl border-2 border-blue-500/45 bg-white/95 p-5 text-slate-900 shadow-[0_14px_36px_rgba(37,99,235,0.12)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700">
                  VERVAL PESERTA DIDIK PKBM · DUA JALUR (LMS &amp; UPLOAD MANUAL NON-LMS)
                </p>
                {selectedPkbm?.isDemoSimulation && (
                  <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                    SIMULASI PAPARAN
                  </span>
                )}
              </div>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">
                {sourceFilter === "MANUAL_DINAS"
                  ? "Daftar Peserta Didik — Upload Manual Dinas (Berkas Manual)"
                  : selectedPkbm
                    ? `${selectedPkbm.nama} (NPSN: ${selectedPkbm.npsn ?? "—"})`
                    : "Daftar Verval Peserta Didik"}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-600">
                Jalur <strong>Via LMS</strong> menampilkan berkas digital terlampir untuk diperiksa langsung; Jalur <strong>Upload Manual Dinas</strong> menggunakan checklist pemeriksaan berkas fisik dengan aksi verifikasi cepat.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {displayedView && displayedView.pkbm.length > 0 && (
                <select
                  aria-label="Pilih PKBM LMS"
                  value={selectedPkbm?.id ?? ""}
                  onChange={(e) => {
                    const next = displayedView.pkbm.find((p) => p.id === e.target.value) ?? null;
                    setSelectedPkbm(next);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {displayedView.pkbm.map((p) => (
                    <option key={p.id} value={p.id}>
                      PKBM LMS: {p.nama}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => {
                  setManualUploadError("");
                  setManualUploadOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm shadow-indigo-600/25 transition hover:from-indigo-700 hover:to-blue-700"
              >
                <Upload size={14} /> Upload Manual Non-LMS
              </button>
            </div>
          </div>

          {/* Ringkasan Jumlah Sumber & Status Verval */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total Siswa</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-slate-950">{vervalStats.total}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700">Via LMS</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-sky-900">{vervalStats.viaLms}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">Upload Manual</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-indigo-900">{vervalStats.manualDinas}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800">Menunggu Verifikasi</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-amber-900">{vervalStats.menunggu}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Terverifikasi</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-emerald-900">{vervalStats.terverifikasi}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700">Perlu Perbaikan</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-rose-900">{vervalStats.perluPerbaikan}</p>
            </div>
          </div>

          {/* Bar Filter Sumber, Status Verval & Pencarian */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter Sumber Data Verval">
              {(
                [
                  { id: "ALL", label: `Semua (${vervalStats.total})` },
                  { id: "LMS", label: `Via LMS (${vervalStats.viaLms})` },
                  { id: "MANUAL_DINAS", label: `Upload Manual Dinas (${vervalStats.manualDinas})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSourceFilter(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                    sourceFilter === tab.id
                      ? "bg-blue-600 text-white shadow-sm"
                      : "border border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter Status Verval Dinas"
                value={studentStatusFilter}
                onChange={(e) => setStudentStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="">Semua Status ({vervalStats.total})</option>
                <option value="MENUNGGU_DINAS">Menunggu Verifikasi ({vervalStats.menunggu})</option>
                <option value="LOLOS_VERVAL">Terverifikasi ({vervalStats.terverifikasi})</option>
                <option value="PERLU_PERBAIKAN">Perlu Perbaikan ({vervalStats.perluPerbaikan})</option>
              </select>

              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Cari nama/NISN/NIK/PKBM..."
                  className="rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs font-medium text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {studentsLoading || manualLoading ? (
            <DinasTableSkeleton rows={4} columns={6} />
          ) : filteredVervalStudents.length === 0 ? (
            <DinasEmptyState
              title="Belum ada peserta didik yang sesuai dengan filter ini"
              description="Ubah filter sumber/status verval, pilih PKBM LMS lain, atau klik 'Upload Manual Non-LMS' untuk menambahkan peserta didik berkas manual."
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-sky-50/90 text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  <tr>
                    <th className="px-4 py-3">Warga Belajar &amp; Sumber</th>
                    <th className="px-4 py-3">NIK / KK / Ibu</th>
                    <th className="px-4 py-3">Paket &amp; Cut-Off</th>
                    <th className="px-4 py-3">Berkas</th>
                    <th className="px-4 py-3">Status Verval</th>
                    <th className="px-4 py-3 text-right">Aksi Verifikasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {filteredVervalStudents.map((st) => {
                    const badge = statusDinasBadge(st.statusVervalDinas);
                    const isManual = st.sumberVerval === "MANUAL_DINAS";
                    const checklist = st.manualChecklist ?? EMPTY_MANUAL_CHECKLIST;
                    const checkedCount = [checklist.kk, checklist.aktaKtp, checklist.ijazah, checklist.suratPindah].filter(Boolean).length;
                    return (
                      <tr key={st.id} className="transition hover:bg-sky-50/60">
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-extrabold text-slate-950">{st.nama}</p>
                            {isManual ? (
                              <span className="rounded-md border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-800">
                                Upload Manual Dinas
                              </span>
                            ) : (
                              <span className="rounded-md border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-800">
                                Via LMS
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs font-medium text-slate-600">
                            NISN <span className="font-mono text-slate-800">{st.nisn}</span>
                            {st.pkbmNama ? ` · ${st.pkbmNama}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">
                          <p className="font-mono font-semibold text-slate-900">NIK: {st.nik ?? "—"}</p>
                          <p className="font-mono font-semibold text-slate-900">KK: {st.noKk ?? "—"}</p>
                          <p className="font-medium text-slate-600">Ibu: {st.namaIbuKandung ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                            {st.paketKategori} · {st.kelasNama}
                          </span>
                          <p className={`mt-1 ${st.memenuhiCutoff ? "font-bold text-emerald-700" : "font-medium text-slate-500"}`}>
                            {st.memenuhiCutoff ? "Memenuhi Cut-Off" : isManual ? "Verifikasi Fisik Manual" : "Di luar Cut-Off / Kosong"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {isManual ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-900">
                                <CheckSquare size={11} /> Berkas Manual
                              </span>
                              <p className="text-[11px] font-semibold text-slate-600">
                                Checklist fisik: <span className="font-extrabold text-indigo-700">{checkedCount}/4 dicek</span>
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlKk ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-400"}`}>
                                KK
                              </span>
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlAktaKtp ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-400"}`}>
                                Akta
                              </span>
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlIjazah ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-400"}`}>
                                Ijazah
                              </span>
                              <span className={`rounded border px-1.5 py-0.5 ${st.urlSuratPindah ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 bg-slate-100 text-slate-400"}`}>
                                Surat Pindah
                              </span>
                            </div>
                          )}
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
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            {isManual && st.statusVervalDinas !== "LOLOS_VERVAL" && (
                              <button
                                type="button"
                                disabled={quickVerifyBusyId === st.id}
                                onClick={() => void quickVerifyManualStudent(st)}
                                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <CheckCircle2 size={13} />
                                {quickVerifyBusyId === st.id ? "Memproses..." : "Verifikasi"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setInspectStudent(st);
                                setCatatanInput(st.catatanDinas ?? "");
                                setManualChecklistInput(st.manualChecklist ?? EMPTY_MANUAL_CHECKLIST);
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
                              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 transition hover:bg-blue-100"
                            >
                              {isManual ? (
                                <>
                                  <CheckSquare size={13} /> Checklist
                                </>
                              ) : (
                                <>
                                  <FileText size={13} /> Lihat Berkas &amp; Verifikasi
                                </>
                              )}
                            </button>
                            {isManual && !st.isDemoSimulation && (
                              <button
                                type="button"
                                title="Hapus data manual"
                                onClick={() => void handleDeleteManualStudent(st)}
                                className="rounded-xl border border-rose-200 bg-rose-50 p-1.5 text-rose-700 transition hover:bg-rose-100"
                              >
                                <Trash2 size={13} />
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
        </section>
        </>
        )}

        {/* Halaman 2: Form Buat / Edit Berita Acara Verval */}
        {activeMenu === "buat-ba" && (
        <section
          id="panel-berita-acara-dinas"
          className="scroll-mt-6 space-y-6 rounded-2xl border border-white/95 bg-white/90 p-5 text-slate-900 shadow-[0_12px_32px_rgba(37,99,235,0.08)] backdrop-blur-xl sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-blue-700">
                <FilePlus2 size={13} />
                FORM PENERBITAN DOKUMEN · {activeWilayahLabel.toUpperCase()}
              </span>
              <h2 className="mt-2 text-lg font-extrabold tracking-tight text-slate-950 sm:text-xl">
                {editingBaId ? "Perbarui Berita Acara Verval" : "Formulir Penerbitan Berita Acara Verval"}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-600">
                Pilih mode Per PKBM atau Rekapitulasi Kabupaten, lengkapi nomor surat dan pejabat penandatangan, lalu simpan permanen ke arsip atau cetak PDF.
              </p>
            </div>

            <button
              type="button"
              onClick={() => selectDinasMenu("arsip-ba")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <Archive size={14} /> Lihat Daftar Arsip ({baArchive.length})
            </button>
          </div>

          {/* Form Penerbitan / Edit Berita Acara */}
          <form
            id="form-berita-acara-dinas"
            onSubmit={handleSaveBeritaAcara}
            className={`scroll-mt-6 space-y-5 rounded-2xl border p-5 transition ${
              editingBaId
                ? "border-amber-400 bg-amber-50/70"
                : "border-slate-200 bg-slate-50/80"
            }`}
          >
            {editingBaId && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-100/80 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2 font-extrabold text-amber-950">
                  <Pencil size={14} className="text-amber-700" />
                  Mode Edit Arsip Aktif — Perubahan akan memperbarui data Berita Acara tanpa membuat duplikat.
                </div>
                <button
                  type="button"
                  onClick={handleCancelEditBa}
                  className="rounded-lg border border-amber-400 bg-white px-3 py-1 font-extrabold text-amber-900 hover:bg-amber-50"
                >
                  Batal Edit
                </button>
              </div>
            )}

            {/* Pilihan Jenis Berita Acara */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
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
                        ? "border-blue-600 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25"
                        : "border-slate-300 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/70"
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
                        ? "border-blue-600 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25"
                        : "border-slate-300 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/70"
                    }`}
                  >
                    <Landmark size={16} className="shrink-0" />
                    <span>Rekapitulasi Kabupaten/Kota</span>
                  </button>
                </div>
              </div>

              {baMode === "pkbm" ? (
                <label className="block space-y-2 text-xs font-extrabold uppercase tracking-wider text-slate-700">
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
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold normal-case tracking-normal text-slate-950 focus:border-blue-600 focus:outline-none"
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
                  <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    2. Cakupan Wilayah Rekapitulasi
                  </span>
                  <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-2.5 text-xs">
                    <div>
                      <p className="font-extrabold text-slate-950">{activeWilayahLabel}</p>
                      <p className="text-[11px] font-semibold text-slate-600">
                        Agregat otomatis seluruh {kabupatenSnapshot.totalPkbm} PKBM aktif (Cut-Off: {kabupatenSnapshot.cutoffDate})
                      </p>
                    </div>
                    <span className="rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-extrabold text-blue-800">
                      Rekap Dinas
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Ringkasan Otomatis Sasaran Terpilih */}
            {activeBaSnapshot && (
              <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    {baMode === "kabupaten" ? "PKBM Tercakup" : "NPSN / Kepala"}
                  </p>
                  {baMode === "kabupaten" ? (
                    <p className="mt-0.5 text-sm font-black text-slate-950 tabular-nums">{activeBaSnapshot.totalPkbm} Lembaga</p>
                  ) : (
                    <>
                      <p className="mt-0.5 font-mono text-xs font-extrabold text-slate-950">
                        {selectedBaPkbm?.npsn ?? "—"}
                      </p>
                      <p className="truncate text-[11px] font-semibold text-slate-600" title={selectedBaPkbm?.namaKepalaSekolah ?? undefined}>
                        {selectedBaPkbm?.namaKepalaSekolah ?? "Kepala PKBM —"}
                      </p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Dapodik / LMS</p>
                  <p className="mt-0.5 text-sm font-black text-slate-950 tabular-nums">
                    {activeBaSnapshot.totalDapodik} / {activeBaSnapshot.totalSiswa}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Berkas Lengkap</p>
                  <p className="mt-0.5 text-sm font-black text-emerald-700 tabular-nums">{activeBaSnapshot.berkasLengkap} Siswa</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Selisih Berkas</p>
                  <p className="mt-0.5 text-sm font-black text-rose-700 tabular-nums">{activeBaSnapshot.selisihTanpaBerkas} Siswa</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Lolos Dinas</p>
                  <p className="mt-0.5 text-sm font-black text-blue-700 tabular-nums">
                    {activeBaSnapshot.lolosVervalDinas} ({activeBaSnapshot.persentaseLolosDinas}%)
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Paket A / B / C</p>
                  <p className="mt-0.5 text-xs font-extrabold text-slate-800 tabular-nums">
                    {activeBaSnapshot.paketA} / {activeBaSnapshot.paketB} / {activeBaSnapshot.paketC}
                  </p>
                </div>
              </div>
            )}

            {/* Metadata Surat, Pejabat Penandatangan & Kop Dinas */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="block text-xs font-bold text-slate-800">
                Nomor Surat Berita Acara
                <input
                  type="text"
                  required
                  value={baNomorSurat}
                  onChange={(e) => setBaNomorSurat(e.target.value)}
                  placeholder="421.9/BA-VERVAL/DIKMAS/2026"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-bold text-slate-800">
                Tanggal Penetapan
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Calendar size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      required
                      value={baTanggalIso}
                      onChange={(e) => setBaTanggalIso(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-xs font-bold text-slate-950 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <span className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] font-extrabold text-blue-800">
                    {formatIndonesianDate(baTanggalIso)}
                  </span>
                </div>
              </label>

              <label className="block text-xs font-bold text-slate-800">
                Pejabat Penandatangan
                <select
                  value={baJabatanTtd}
                  onChange={(e) => setBaJabatanTtd(e.target.value as PejabatJabatanTtd)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-950 focus:border-blue-600 focus:outline-none"
                >
                  <option value="Kepala Bidang PAUD & Dikmas">Kepala Bidang PAUD &amp; Dikmas</option>
                  <option value="Kepala Dinas Pendidikan dan Kebudayaan">Kepala Dinas Pendidikan dan Kebudayaan</option>
                </select>
              </label>

              <label className="block text-xs font-bold text-slate-800">
                Nama Pejabat (Tersimpan Otomatis)
                <input
                  type="text"
                  value={baPejabatNama}
                  onChange={(e) => setBaPejabatNama(e.target.value)}
                  placeholder="Contoh: Drs. H. Suryana, M.Pd."
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-bold text-slate-800">
                NIP Pejabat (Tersimpan Otomatis)
                <input
                  type="text"
                  value={baPejabatNip}
                  onChange={(e) => setBaPejabatNip(e.target.value)}
                  placeholder="Contoh: 19720514 199802 1 002"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs font-semibold text-slate-950 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </label>

              <div className="text-xs font-bold text-slate-800">
                <span>Logo Kop Dinas (PNG / JPG)</span>
                <div className="mt-1.5 flex items-center gap-2.5">
                  {baKopLogo ? (
                    <img
                      src={baKopLogo}
                      alt="Logo Kop Dinas"
                      className="h-10 w-10 shrink-0 rounded-lg border border-slate-300 bg-white object-contain p-0.5"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400">
                      <ImagePlus size={16} />
                    </span>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-800 transition hover:bg-blue-100">
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
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 size={13} /> Hapus
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label className="block text-xs font-bold text-slate-800">
              Catatan Dinas / Rekomendasi Tindak Lanjut
              <textarea
                rows={2}
                maxLength={800}
                value={baCatatan}
                onChange={(e) => setBaCatatan(e.target.value)}
                placeholder="Contoh: Selisih warga belajar tanpa berkas agar dilengkapi oleh operator PKBM paling lambat 7 hari kerja setelah verifikasi."
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-medium text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </label>

            {baFormError && (
              <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-800">
                <AlertTriangle size={15} className="shrink-0 text-rose-600" />
                {baFormError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md shadow-blue-600/25 transition hover:from-blue-700 hover:to-indigo-700"
                >
                  <Save size={15} />
                  {editingBaId ? "Simpan Perubahan BA" : "Simpan Berita Acara"}
                </button>
                {editingBaId && (
                  <button
                    type="button"
                    onClick={handleCancelEditBa}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Batal Edit
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handlePrintFromForm}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-xs font-extrabold text-slate-950 shadow-md shadow-amber-500/25 transition hover:from-amber-300 hover:to-amber-400"
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
        <section className="space-y-4 rounded-2xl border border-white/95 bg-white/90 p-5 text-slate-900 shadow-[0_12px_32px_rgba(37,99,235,0.08)] backdrop-blur-xl sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold tracking-tight text-slate-950">
                  Daftar Berita Acara Tersimpan &amp; Monitoring Penerbitan
                </h3>
                <p className="text-xs font-medium text-slate-600">
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
                    className="w-64 rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs font-medium text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none sm:w-72"
                  />
                </div>

                <select
                  aria-label="Filter Jenis Berita Acara"
                  value={baTypeFilter}
                  onChange={(e) => setBaTypeFilter(e.target.value as "ALL" | BeritaAcaraMode)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="ALL">Semua Jenis BA</option>
                  <option value="pkbm">Per Lembaga (PKBM)</option>
                  <option value="kabupaten">Rekap Dinas (Kabupaten)</option>
                </select>

                <select
                  aria-label="Filter Status Berita Acara"
                  value={baStatusFilter}
                  onChange={(e) => setBaStatusFilter(e.target.value as "ALL" | BeritaAcaraStatus)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
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
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-sky-50/90 text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    <tr>
                      <th className="px-4 py-3.5">Jenis &amp; Status</th>
                      <th className="px-4 py-3.5">Nomor Surat &amp; Tanggal</th>
                      <th className="px-4 py-3.5">Satuan Pendidikan / Wilayah</th>
                      <th className="px-4 py-3.5">Ringkasan Data Verval</th>
                      <th className="px-4 py-3.5">Pejabat Penandatangan</th>
                      <th className="px-4 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80">
                    {baStatusFilter !== "BELUM" &&
                      filteredSavedBa.map((item) => (
                        <tr
                          key={item.id}
                          className={editingBaId === item.id ? "bg-amber-50/80" : "transition hover:bg-sky-50/60"}
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col items-start gap-1.5">
                              <span
                                className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                                  item.mode === "kabupaten"
                                    ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                                    : "border-blue-200 bg-blue-50 text-blue-800"
                                }`}
                              >
                                {item.mode === "kabupaten" ? "Rekap Kabupaten" : "Per PKBM"}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                                <CheckCircle2 size={11} /> Sudah Tersimpan
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-xs">
                            <p className="font-mono font-extrabold text-slate-950">{item.nomorSurat}</p>
                            <p className="mt-0.5 font-semibold text-slate-600">{item.tanggalSurat}</p>
                          </td>

                          <td className="px-4 py-3.5 text-xs">
                            <p className="font-extrabold text-slate-950">{item.pkbmNama}</p>
                            <p className="mt-0.5 font-medium text-slate-600">
                              {item.mode === "pkbm"
                                ? `NPSN: ${item.pkbmNpsn ?? "—"} · ${item.wilayah}`
                                : `Wilayah ${item.wilayah} (${item.ringkasan.totalPkbm} PKBM)`}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-xs text-slate-700">
                            <p className="font-bold text-slate-950">
                              {item.ringkasan.totalDapodik} Dapodik ·{" "}
                              <span className="text-emerald-700">{item.ringkasan.berkasLengkap} Lengkap</span>
                            </p>
                            <p className="mt-0.5 font-medium text-slate-600">
                              Selisih:{" "}
                              <span className="font-bold text-rose-700">{item.ringkasan.selisihTanpaBerkas}</span>
                              {" · "}Lolos Dinas:{" "}
                              <span className="font-bold text-blue-700">{item.ringkasan.persentaseLolosDinas}%</span>
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-xs">
                            <p className="font-bold text-slate-950">{item.pejabatNama}</p>
                            <p className="mt-0.5 font-medium text-slate-600">{item.jabatanTtd}</p>
                            <p className="font-mono text-[11px] text-slate-500">NIP. {item.pejabatNip}</p>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditBa(item)}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-800 transition hover:bg-blue-100"
                              >
                                <Pencil size={12} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setPrintBaDoc(item)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
                              >
                                <Printer size={12} /> Cetak
                              </button>
                              {confirmDeleteBaId === item.id ? (
                                <div className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-1.5 py-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBa(item.id)}
                                    className="rounded bg-rose-600 px-2 py-0.5 text-[11px] font-extrabold text-white hover:bg-rose-700"
                                  >
                                    Ya, Hapus
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteBaId(null)}
                                    className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteBaId(item.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
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
                        <tr key={target.key} className="bg-amber-50/40 transition hover:bg-amber-50/80">
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col items-start gap-1.5">
                              <span
                                className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                                  target.mode === "kabupaten"
                                    ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                                    : "border-blue-200 bg-blue-50 text-blue-800"
                                }`}
                              >
                                {target.mode === "kabupaten" ? "Rekap Kabupaten" : "Per PKBM"}
                              </span>
                              <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                                Belum Dibuat
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-xs font-semibold italic text-slate-400">
                            Belum diterbitkan
                          </td>

                          <td className="px-4 py-3.5 text-xs">
                            <p className="font-extrabold text-slate-950">{target.pkbmNama}</p>
                            <p className="mt-0.5 font-medium text-slate-600">
                              {target.mode === "pkbm"
                                ? `NPSN: ${target.pkbmNpsn ?? "—"} · ${target.wilayah}`
                                : `Wilayah ${target.wilayah} (${target.ringkasan.totalPkbm} PKBM)`}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-xs text-slate-700">
                            <p className="font-bold text-slate-950">
                              {target.ringkasan.totalDapodik} Dapodik ·{" "}
                              <span className="text-emerald-700">{target.ringkasan.berkasLengkap} Lengkap</span>
                            </p>
                            <p className="mt-0.5 font-medium text-slate-600">
                              Selisih:{" "}
                              <span className="font-bold text-rose-700">{target.ringkasan.selisihTanpaBerkas}</span>
                              {" · "}Lolos Dinas:{" "}
                              <span className="font-bold text-blue-700">{target.ringkasan.persentaseLolosDinas}%</span>
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-xs font-medium text-slate-600">
                            {target.pkbmKepala ? `Kepala: ${target.pkbmKepala}` : "Menunggu penerbitan Dinas"}
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleQuickCreateBa(target)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-sm shadow-amber-500/25 transition hover:from-amber-300 hover:to-amber-400"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-sky-50 to-blue-50/70 px-6 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700">
                    VERIFIKASI DINAS PENDIDIKAN {inspectStudent.isDemoSimulation ? "· SIMULASI PAPARAN" : ""}
                  </p>
                  {inspectStudent.sumberVerval === "MANUAL_DINAS" ? (
                    <span className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[10px] font-extrabold text-indigo-800">
                      Upload Manual Non-LMS · Berkas Manual
                    </span>
                  ) : (
                    <span className="rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-extrabold text-sky-800">
                      Via LMS · Berkas Digital
                    </span>
                  )}
                </div>
                <h3 className="mt-0.5 text-lg font-extrabold tracking-tight text-slate-950">
                  {inspectStudent.nama}
                  {inspectStudent.pkbmNama ? (
                    <span className="ml-2 text-xs font-semibold text-slate-500">({inspectStudent.pkbmNama})</span>
                  ) : null}
                </h3>
              </div>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setInspectStudent(null)}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-900"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs">
              {inspectStudent.isDemoSimulation && (
                <p className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-900">
                  Contoh data simulasi paparan (hanya pratinjau — perubahan tidak disimpan ke database).
                </p>
              )}

              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2">
                <p><span className="font-semibold text-slate-500">NISN:</span> <strong className="font-mono text-slate-950">{inspectStudent.nisn}</strong></p>
                <p><span className="font-semibold text-slate-500">NIK:</span> <strong className="font-mono text-slate-950">{inspectStudent.nik ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-500">No. KK:</span> <strong className="font-mono text-slate-950">{inspectStudent.noKk ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-500">Ibu Kandung:</span> <strong className="text-slate-950">{inspectStudent.namaIbuKandung ?? "—"}</strong></p>
                <p><span className="font-semibold text-slate-500">Paket / Kelas:</span> <strong className="text-slate-950">{inspectStudent.paketKategori} · {inspectStudent.kelasNama}</strong></p>
                <p><span className="font-semibold text-slate-500">Tanggal Masuk:</span> <strong className="text-slate-950">{inspectStudent.tanggalMasuk ?? "—"}</strong></p>
                {inspectStudent.sumberVerval !== "MANUAL_DINAS" && (
                  <>
                    <p><span className="font-semibold text-slate-500">Sekolah Asal:</span> <strong className="text-slate-950">{inspectStudent.sekolahAsal ?? "—"}</strong></p>
                    <p><span className="font-semibold text-slate-500">No. Ijazah:</span> <strong className="text-slate-950">{inspectStudent.nomorIjazahTerakhir ?? "—"}</strong></p>
                  </>
                )}
              </div>

              {inspectStudent.sumberVerval === "MANUAL_DINAS" ? (
                <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200/80 pb-3">
                    <div>
                      <span className="font-extrabold uppercase tracking-wider text-indigo-900">
                        Checklist Pemeriksaan Berkas Fisik (Manual)
                      </span>
                      <p className="mt-0.5 text-[11px] font-medium text-indigo-800">
                        Data diunggah manual oleh Dinas tanpa berkas digital di web. Centang berkas fisik yang sudah diperiksa lalu klik <strong>Verifikasi</strong>.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setManualChecklistInput({
                          kk: true,
                          aktaKtp: true,
                          ijazah: true,
                          suratPindah: manualChecklistInput.suratPindah,
                        })
                      }
                      className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-indigo-800 hover:bg-indigo-100"
                    >
                      Centang Berkas Wajib
                    </button>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {(
                      [
                        { key: "kk", label: "Kartu Keluarga (KK) fisik sesuai" },
                        { key: "aktaKtp", label: "Akta Kelahiran / KTP fisik sesuai" },
                        { key: "ijazah", label: "Ijazah Terakhir fisik sesuai" },
                        { key: "suratPindah", label: "Surat Pindah / SKP (jika pindahan)" },
                      ] as const
                    ).map((item) => (
                      <label
                        key={item.key}
                        className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-indigo-200/80 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 hover:border-indigo-400"
                      >
                        <input
                          type="checkbox"
                          checked={manualChecklistInput[item.key]}
                          onChange={(e) =>
                            setManualChecklistInput((prev) => ({
                              ...prev,
                              [item.key]: e.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <span className="font-extrabold uppercase tracking-wider text-slate-800">Pratinjau Berkas Digital (LMS)</span>
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
                              ? "bg-blue-600 text-white shadow-sm"
                              : "border border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"
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
                    return (
                      <div className="mt-3">
                        <DocumentPreviewFrame
                          url={u}
                          title="Pratinjau Berkas"
                          heightClass="h-64"
                          emptyText="Berkas belum diunggah."
                        />
                      </div>
                    );
                  })()}
                </div>
              )}

              <label className="block font-bold text-slate-800">
                Catatan Pemeriksaan Dinas (Wajib diisi jika Perlu Perbaikan)
                <textarea
                  rows={2}
                  maxLength={500}
                  value={catatanInput}
                  onChange={(e) => setCatatanInput(e.target.value)}
                  placeholder={
                    inspectStudent.sumberVerval === "MANUAL_DINAS"
                      ? "Contoh: Fotokopi ijazah fisik belum dilegalisir, mohon dilengkapi saat verifikasi lanjutan."
                      : "Contoh: Scan KK buram, mohon unggah ulang yang lebih jelas."
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-medium text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </label>

              {actionError && <p role="alert" className="font-bold text-rose-700">{actionError}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void submitDinasDecision("MENUNGGU_DINAS")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                <RotateCcw size={13} /> Reset Menunggu
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void submitDinasDecision("PERLU_PERBAIKAN")}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
                >
                  Perlu Perbaikan
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void submitDinasDecision("LOLOS_VERVAL")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} /> Verifikasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Upload Manual Non-LMS (Data Siswa Saja, Berkas Manual/Fisik) */}
      {activeMenu === "verifikasi" && manualUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-blue-50/70 px-6 py-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700">
                  JALUR UPLOAD MANUAL NON-LMS · BERKAS FISIK MANUAL
                </p>
                <h3 className="text-lg font-extrabold tracking-tight text-slate-950">
                  Unggah Data Peserta Didik Non-LMS
                </h3>
              </div>
              <button
                type="button"
                disabled={manualUploadBusy}
                onClick={() => setManualUploadOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-900"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
                <p className="font-extrabold text-indigo-950">1. Impor Massal dari Excel (.xlsx / .csv)</p>
                <p className="mt-1 text-[11px] leading-5 text-indigo-800">
                  Cukup unggah daftar biodata siswa (kolom: <strong>Nama</strong>, <strong>NISN</strong>, <strong>NIK</strong>, <strong>No KK</strong>, <strong>Ibu Kandung</strong>, <strong>Paket</strong>, <strong>Nama PKBM</strong>) tanpa perlu mengunggah scan berkas. Status otomatis ditandai <strong>Berkas Manual</strong>.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-indigo-700">
                    <FileSpreadsheet size={14} />
                    <span>{manualUploadBusy ? "Memproses File..." : "Pilih File Excel / CSV"}</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      disabled={manualUploadBusy}
                      onChange={(e) => {
                        void handleManualExcelUpload(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      className="sr-only"
                    />
                  </label>
                  <span className="text-[11px] font-medium text-indigo-700">
                    Tips: Isi Nama PKBM di bawah jika file Excel belum memiliki kolom Nama PKBM.
                  </span>
                </div>
              </div>

              <form onSubmit={handleManualQuickAdd} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="font-extrabold text-slate-900">2. Atau Input Cepat 1 Peserta Didik</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block font-bold text-slate-800">
                    Nama PKBM (Non-LMS) *
                    <input
                      type="text"
                      required
                      value={manualForm.pkbmNama}
                      onChange={(e) => setManualForm({ ...manualForm, pkbmNama: e.target.value })}
                      placeholder="Contoh: PKBM Harapan Mulia"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-950 focus:border-indigo-600 focus:outline-none"
                    />
                  </label>
                  <label className="block font-bold text-slate-800">
                    NPSN PKBM (Opsional)
                    <input
                      type="text"
                      value={manualForm.pkbmNpsn}
                      onChange={(e) => setManualForm({ ...manualForm, pkbmNpsn: e.target.value })}
                      placeholder="Contoh: P2029911"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-950 focus:border-indigo-600 focus:outline-none"
                    />
                  </label>
                  <label className="block font-bold text-slate-800">
                    Nama Lengkap Siswa *
                    <input
                      type="text"
                      required
                      value={manualForm.nama}
                      onChange={(e) => setManualForm({ ...manualForm, nama: e.target.value })}
                      placeholder="Nama sesuai KK / Ijazah"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-950 focus:border-indigo-600 focus:outline-none"
                    />
                  </label>
                  <label className="block font-bold text-slate-800">
                    NISN
                    <input
                      type="text"
                      value={manualForm.nisn}
                      onChange={(e) => setManualForm({ ...manualForm, nisn: e.target.value })}
                      placeholder="10 digit NISN"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-medium text-slate-950 focus:border-indigo-600 focus:outline-none"
                    />
                  </label>
                  <label className="block font-bold text-slate-800">
                    NIK
                    <input
                      type="text"
                      value={manualForm.nik}
                      onChange={(e) => setManualForm({ ...manualForm, nik: e.target.value })}
                      placeholder="16 digit NIK"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-medium text-slate-950 focus:border-indigo-600 focus:outline-none"
                    />
                  </label>
                  <label className="block font-bold text-slate-800">
                    No. KK
                    <input
                      type="text"
                      value={manualForm.noKk}
                      onChange={(e) => setManualForm({ ...manualForm, noKk: e.target.value })}
                      placeholder="16 digit Nomor KK"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-medium text-slate-950 focus:border-indigo-600 focus:outline-none"
                    />
                  </label>
                  <label className="block font-bold text-slate-800">
                    Nama Ibu Kandung
                    <input
                      type="text"
                      value={manualForm.namaIbuKandung}
                      onChange={(e) => setManualForm({ ...manualForm, namaIbuKandung: e.target.value })}
                      placeholder="Nama ibu kandung"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-950 focus:border-indigo-600 focus:outline-none"
                    />
                  </label>
                  <label className="block font-bold text-slate-800">
                    Program Kesetaraan
                    <select
                      value={manualForm.paketKategori}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          paketKategori: e.target.value as "Paket A" | "Paket B" | "Paket C",
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-950 focus:border-indigo-600 focus:outline-none"
                    >
                      <option value="Paket A">Paket A (Setara SD)</option>
                      <option value="Paket B">Paket B (Setara SMP)</option>
                      <option value="Paket C">Paket C (Setara SMA)</option>
                    </select>
                  </label>
                </div>

                {manualUploadError && (
                  <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 font-bold text-rose-700">
                    {manualUploadError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={manualUploadBusy}
                    onClick={() => setManualUploadOpen(false)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={manualUploadBusy}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {manualUploadBusy ? "Menyimpan..." : "Simpan Siswa Manual"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pratinjau & Cetak PDF Berita Acara Resmi Dinas */}
      {printBaDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm sm:p-8 print:static print:overflow-visible print:bg-white print:p-0">
          <div className="no-print mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-white bg-white/95 px-5 py-3.5 text-slate-900 shadow-xl backdrop-blur-xl">
            <div>
              <p className="text-sm font-extrabold text-slate-950">Pratinjau Cetak Berita Acara Verval Dinas</p>
              <p className="text-xs font-medium text-slate-600">
                Gunakan tombol Cetak / Simpan PDF untuk menyimpan dokumen resmi ke format PDF.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm shadow-blue-600/25 transition hover:from-blue-700 hover:to-indigo-700"
              >
                <Printer size={14} /> Cetak / Simpan PDF
              </button>
              <button
                type="button"
                onClick={() => setPrintBaDoc(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
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
