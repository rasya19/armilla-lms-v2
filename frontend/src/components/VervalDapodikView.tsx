import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FileWarning,
  Printer,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { DashboardHero, EmptyState, TableSkeleton } from "./DashboardUI";
import { SchoolModal } from "./SchoolModal";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import type { StudentVervalRecord, VervalDinasStatus, VervalStatus } from "./StudentVervalForm";

type VervalSummary = {
  total: number;
  totalDapodik: number;
  sumberDapodikCount: number;
  berkasLengkap: number;
  belumAdaBerkas: number;
  selisihTanpaBerkas: number;
  belumLengkap: number;
  siapVerval: number;
  terverifikasiPkbm: number;
  lolosDinas: number;
  perluPerbaikanDinas: number;
};

type VervalListResponse = {
  sekolah: {
    id: string;
    nama: string;
    npsn: string | null;
    slug: string;
    kabupatenKota: string | null;
    izinVervalDinas: boolean;
    totalSiswaDapodik?: number;
  };
  summary: VervalSummary;
  kelasList: Array<{ id: string; nama: string }>;
  rows: StudentVervalRecord[];
  page: number;
  pageSize: number;
  hasNext: boolean;
  total: number;
};

type ParsedDapodikRow = {
  nisn: string;
  nik: string;
  noKk: string;
  nama: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: string;
  jenjang: string;
  namaIbuKandung: string;
  alamatLengkap: string;
  desaKelurahan: string;
  kecamatan: string;
  sekolahAsal: string;
  npsnAsal: string;
  nomorIjazahTerakhir: string;
  tanggalMasuk: string;
  telepon: string;
  email: string;
};

function isoToDmy(iso: string | null | undefined): string {
  if (!iso) return "";
  const clean = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return "";
  const [y, m, d] = clean.split("-");
  return `${d}/${m}/${y}`;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function excelSerialToIso(serial: number): string {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return "";
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function normalizeExcelDate(raw: unknown): string {
  if (typeof raw === "number") return excelSerialToIso(raw);
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const str = String(raw ?? "").trim();
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(str)) {
    const [d, m, y] = str.split(/[/-]/);
    return `${y}-${m}-${d}`;
  }
  return str;
}

const DAPODIK_FIELD_ALIASES: Array<{ key: keyof ParsedDapodikRow; aliases: string[] }> = [
  { key: "nama", aliases: ["nama", "nama peserta didik", "nama siswa", "nama lengkap"] },
  { key: "nisn", aliases: ["nisn"] },
  { key: "nik", aliases: ["nik", "no nik", "nomor nik"] },
  { key: "noKk", aliases: ["no kk", "nomor kk", "no kartu keluarga", "nomor kartu keluarga", "kk"] },
  { key: "jenisKelamin", aliases: ["jk", "jenis kelamin", "kelamin"] },
  { key: "tempatLahir", aliases: ["tempat lahir"] },
  { key: "tanggalLahir", aliases: ["tanggal lahir", "tgl lahir"] },
  { key: "namaIbuKandung", aliases: ["nama ibu kandung", "data ibu nama", "nama ibu", "ibu kandung"] },
  { key: "alamatLengkap", aliases: ["alamat", "alamat jalan", "alamat lengkap"] },
  { key: "desaKelurahan", aliases: ["desa kelurahan", "desa", "kelurahan"] },
  { key: "kecamatan", aliases: ["kecamatan"] },
  { key: "sekolahAsal", aliases: ["sekolah asal", "asal sekolah"] },
  { key: "npsnAsal", aliases: ["npsn sekolah asal", "npsn asal"] },
  { key: "nomorIjazahTerakhir", aliases: ["no ijazah", "nomor ijazah", "no seri ijazah", "nomor ijazah terakhir"] },
  { key: "tanggalMasuk", aliases: ["tanggal masuk", "tgl masuk", "tmt masuk"] },
  { key: "jenjang", aliases: ["jenjang", "paket", "rombel saat ini", "rombel", "tingkat pendidikan"] },
  { key: "telepon", aliases: ["hp", "no hp", "telepon", "no telepon", "nomor telepon", "nomor hp"] },
  { key: "email", aliases: ["email", "e mail"] },
];

async function parseDapodikWorkbook(file: File): Promise<{
  rows: ParsedDapodikRow[];
  skipped: Array<{ number: number; nama: string; reason: string }>;
  totalRowsInSheet: number;
}> {
  if (file.size > 10_000_000) {
    throw new Error("Ukuran file Excel maksimal 10 MB.");
  }
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Workbook Excel tidak memiliki sheet.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) throw new Error("Sheet Excel kosong.");

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const colCount = Math.min(range.e.c - range.s.c + 1, 100);
  const getCellText = (r: number, c: number) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    return cell ? XLSX.utils.format_cell(cell).trim() : "";
  };
  const getCellRaw = (r: number, c: number): unknown => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    return cell ? cell.v : "";
  };

  let headerRow = range.s.r;
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 15); r++) {
    const labels = Array.from({ length: colCount }, (_, idx) => normalizeHeader(getCellText(r, range.s.c + idx)));
    const hasName = labels.some((l) => ["nama", "nama peserta didik", "nama siswa", "nama lengkap"].includes(l));
    const hasId = labels.some((l) => ["nisn", "nik"].includes(l));
    if (hasName && hasId) {
      headerRow = r;
      break;
    }
  }

  const merges = sheet["!merges"] ?? [];
  const twoRows = merges.some((m) => m.s.r === headerRow && m.e.r === headerRow + 1);
  const headers = Array.from({ length: colCount }, (_, idx) => {
    const c = range.s.c + idx;
    const parent = merges.find((m) => m.s.r === headerRow && m.e.r === headerRow && m.s.c <= c && m.e.c >= c);
    const upper = parent ? getCellText(headerRow, parent.s.c) : getCellText(headerRow, c);
    const lower = twoRows ? getCellText(headerRow + 1, c) : "";
    return normalizeHeader([upper, lower].filter(Boolean).join(" "));
  });

  const colMap = new Map<keyof ParsedDapodikRow, number>();
  for (const spec of DAPODIK_FIELD_ALIASES) {
    for (const alias of spec.aliases) {
      const idx = headers.findIndex((h) => h === alias);
      if (idx !== -1) {
        colMap.set(spec.key, range.s.c + idx);
        break;
      }
    }
  }

  if (!colMap.has("nama") || (!colMap.has("nisn") && !colMap.has("nik"))) {
    throw new Error("Header kolom Dapodik tidak dikenali. Pastikan tersedia kolom Nama serta NISN atau NIK.");
  }

  const firstDataRow = headerRow + (twoRows ? 2 : 1);
  const rows: ParsedDapodikRow[] = [];
  const skipped: Array<{ number: number; nama: string; reason: string }> = [];
  let totalRowsInSheet = 0;

  for (let r = firstDataRow; r <= range.e.r; r++) {
    const rowValues = Array.from({ length: colCount }, (_, idx) => getCellText(r, range.s.c + idx));
    if (!rowValues.some(Boolean)) continue;
    totalRowsInSheet += 1;
    if (rows.length >= 1000) continue;

    const readText = (key: keyof ParsedDapodikRow) => {
      const col = colMap.get(key);
      return col === undefined ? "" : getCellText(r, col);
    };
    const readNumericId = (key: keyof ParsedDapodikRow) => readText(key).replace(/\D/g, "");
    const readDate = (key: keyof ParsedDapodikRow) => {
      const col = colMap.get(key);
      if (col === undefined) return "";
      const raw = getCellRaw(r, col);
      return typeof raw === "number" ? normalizeExcelDate(raw) : normalizeExcelDate(getCellText(r, col));
    };

    const nama = readText("nama");
    const nisn = readNumericId("nisn");
    const nik = readNumericId("nik");

    if (!nama || nama.length < 2) {
      skipped.push({ number: r + 1, nama: nama || "(kosong)", reason: "Nama kosong" });
      continue;
    }
    if (!nisn && !nik) {
      skipped.push({ number: r + 1, nama, reason: "NISN dan NIK kosong" });
      continue;
    }
    if (nisn && nisn.length !== 10) {
      skipped.push({ number: r + 1, nama, reason: "NISN bukan 10 digit" });
      continue;
    }
    if (nik && nik.length !== 16) {
      skipped.push({ number: r + 1, nama, reason: "NIK bukan 16 digit" });
      continue;
    }

    rows.push({
      nama,
      nisn,
      nik,
      noKk: readNumericId("noKk"),
      jenisKelamin: readText("jenisKelamin"),
      tempatLahir: readText("tempatLahir"),
      tanggalLahir: readDate("tanggalLahir"),
      namaIbuKandung: readText("namaIbuKandung"),
      alamatLengkap: readText("alamatLengkap"),
      desaKelurahan: readText("desaKelurahan"),
      kecamatan: readText("kecamatan"),
      sekolahAsal: readText("sekolahAsal"),
      npsnAsal: readText("npsnAsal"),
      nomorIjazahTerakhir: readText("nomorIjazahTerakhir"),
      tanggalMasuk: readDate("tanggalMasuk"),
      jenjang: readText("jenjang"),
      telepon: readText("telepon"),
      email: readText("email"),
    });
  }

  if (!rows.length) {
    throw new Error("Tidak ada baris valid yang dapat diimpor dari file Dapodik tersebut.");
  }

  return { rows, skipped, totalRowsInSheet };
}

function statusPkbmMeta(status: VervalStatus): { label: string; cls: string } {
  switch (status) {
    case "SIAP_VERVAL":
      return { label: "Siap Verval", cls: "border-amber-300 bg-amber-100 text-amber-900" };
    case "TERVERIFIKASI_PKBM":
      return { label: "Terverifikasi PKBM", cls: "border-emerald-300 bg-emerald-100 text-emerald-900" };
    default:
      return { label: "Belum Lengkap", cls: "border-rose-300 bg-rose-100 text-rose-900" };
  }
}

function statusDinasMeta(status: VervalDinasStatus): { label: string; cls: string } {
  switch (status) {
    case "LOLOS_VERVAL":
      return { label: "Lolos Dinas", cls: "border-emerald-300 bg-emerald-100 text-emerald-900" };
    case "PERLU_PERBAIKAN":
      return { label: "Perlu Perbaikan", cls: "border-rose-300 bg-rose-100 text-rose-900" };
    default:
      return { label: "Menunggu Dinas", cls: "border-slate-300 bg-slate-100 text-slate-700" };
  }
}

type DocTabKey = "kk" | "akta" | "ijazah" | "pindah";

type ModalEditState = {
  nik: string;
  noKk: string;
  namaIbuKandung: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: string;
  alamatLengkap: string;
  desaKelurahan: string;
  kecamatan: string;
  sekolahAsal: string;
  npsnAsal: string;
  nomorIjazahTerakhir: string;
  tanggalMasuk: string;
  urlKk: string;
  urlAktaKtp: string;
  urlIjazah: string;
  urlSuratPindah: string;
  statusVerval: VervalStatus;
  catatanVerval: string;
};

function toModalEditState(s: StudentVervalRecord): ModalEditState {
  return {
    nik: s.nik ?? "",
    noKk: s.noKk ?? "",
    namaIbuKandung: s.namaIbuKandung ?? "",
    tempatLahir: s.tempatLahir ?? "",
    tanggalLahir: isoToDmy(s.tanggalLahir),
    jenisKelamin: s.jenisKelamin ?? "",
    alamatLengkap: s.alamatLengkap ?? "",
    desaKelurahan: s.desaKelurahan ?? "",
    kecamatan: s.kecamatan ?? "",
    sekolahAsal: s.sekolahAsal ?? "",
    npsnAsal: s.npsnAsal ?? "",
    nomorIjazahTerakhir: s.nomorIjazahTerakhir ?? "",
    tanggalMasuk: isoToDmy(s.tanggalMasuk),
    urlKk: s.urlKk ?? "",
    urlAktaKtp: s.urlAktaKtp ?? "",
    urlIjazah: s.urlIjazah ?? "",
    urlSuratPindah: s.urlSuratPindah ?? "",
    statusVerval: s.statusVerval,
    catatanVerval: s.catatanVerval ?? "",
  };
}

export function VervalDapodikView() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [kelasFilter, setKelasFilter] = useState("");
  const [tanpaBerkasOnly, setTanpaBerkasOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "25",
    ...(statusFilter ? { statusVerval: statusFilter } : {}),
    ...(kelasFilter ? { kelasId: kelasFilter } : {}),
    ...(tanpaBerkasOnly ? { tanpaBerkas: "true" } : {}),
    ...(searchTerm ? { q: searchTerm } : {}),
  });
  const endpoint = `/api/verval/siswa?${queryParams.toString()}`;

  const [data, setData] = useState<VervalListResponse | null>(() => getCached<VervalListResponse>(endpoint));
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [exporting, setExporting] = useState(false);

  const [activeStudent, setActiveStudent] = useState<StudentVervalRecord | null>(null);
  const [editForm, setEditForm] = useState<ModalEditState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [activeDocTab, setActiveDocTab] = useState<DocTabKey>("kk");
  const [printOpen, setPrintOpen] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importParsed, setImportParsed] = useState<{
    rows: ParsedDapodikRow[];
    skipped: Array<{ number: number; nama: string; reason: string }>;
    totalRowsInSheet: number;
  } | null>(null);
  const [importParseBusy, setImportParseBusy] = useState(false);
  const [importSubmitBusy, setImportSubmitBusy] = useState(false);
  const [importError, setImportError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<VervalListResponse>(endpoint);
    if (cached) setData(cached);
    setError("");
    fetchWithTimeout(endpoint, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Data verval Dapodik belum dapat dimuat.");
        }
        const payload = (await res.json()) as VervalListResponse;
        setCached(endpoint, payload);
        setData(payload);
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal) && !cached) {
          setError(describeFetchError(failure, "Data verval Dapodik belum tersedia."));
        }
      });
    return () => controller.abort();
  }, [endpoint, reloadTick]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function openStudentModal(student: StudentVervalRecord) {
    setActiveStudent(student);
    setEditForm(toModalEditState(student));
    setModalError("");
    setActiveDocTab(
      student.urlKk
        ? "kk"
        : student.urlAktaKtp
          ? "akta"
          : student.urlIjazah
            ? "ijazah"
            : student.urlSuratPindah
              ? "pindah"
              : "kk",
    );
  }

  async function saveStudentVerval(overrideStatus?: VervalStatus) {
    if (!activeStudent || !editForm) return;
    setModalBusy(true);
    setModalError("");
    const nextStatus = overrideStatus ?? editForm.statusVerval;
    try {
      const response = await fetchWithTimeout(`/api/verval/siswa/${encodeURIComponent(activeStudent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          statusVerval: nextStatus,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; siswa?: StudentVervalRecord } | null;
      if (!response.ok || !body?.siswa) {
        throw new Error(body?.error || "Gagal memperbarui status verval siswa.");
      }
      invalidateCache(["/api/verval", "/api/sekolah/siswa", "/api/sekolah/ringkasan"]);
      setToast(`Verval ${body.siswa.nama} berhasil disimpan.`);
      setActiveStudent(null);
      setEditForm(null);
      setReloadTick((v) => v + 1);
    } catch (failure: unknown) {
      setModalError(describeFetchError(failure, "Gagal menyimpan pembaruan verval."));
    } finally {
      setModalBusy(false);
    }
  }

  async function handleDapodikFileChange(file: File | undefined) {
    if (!file) return;
    setImportFileName(file.name);
    setImportParsed(null);
    setImportError("");
    setImportParseBusy(true);
    try {
      const parsed = await parseDapodikWorkbook(file);
      setImportParsed(parsed);
    } catch (failure: unknown) {
      setImportError(failure instanceof Error ? failure.message : "File Excel Dapodik gagal dibaca.");
    } finally {
      setImportParseBusy(false);
    }
  }

  async function handleSubmitImportDapodik() {
    if (!importParsed) return;
    setImportSubmitBusy(true);
    setImportError("");
    try {
      const res = await fetchWithTimeout("/api/verval/import-dapodik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: importParsed.rows,
          totalDapodikCount: importParsed.totalRowsInSheet,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
        created?: number;
        updated?: number;
      } | null;
      if (!res.ok) {
        throw new Error(body?.error || "Gagal menyinkronkan Excel Dapodik.");
      }
      invalidateCache(["/api/verval", "/api/sekolah/siswa", "/api/sekolah/ringkasan"]);
      setToast(body?.message || "Data Excel Dapodik berhasil disinkronkan ke tabel Siswa.");
      setImportOpen(false);
      setImportFileName("");
      setImportParsed(null);
      setPage(1);
      setReloadTick((v) => v + 1);
    } catch (failure: unknown) {
      setImportError(describeFetchError(failure, "Sinkronisasi Excel Dapodik gagal."));
    } finally {
      setImportSubmitBusy(false);
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams({
        ...(statusFilter ? { statusVerval: statusFilter } : {}),
        ...(kelasFilter ? { kelasId: kelasFilter } : {}),
      });
      const res = await fetchWithTimeout(`/api/verval/export?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Gagal mengekspor data Dapodik.");
      }
      const payload = (await res.json()) as {
        sekolah: { nama: string; slug: string };
        columns: string[];
        rows: Array<Record<string, string>>;
      };
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(payload.rows, { header: payload.columns });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Verval Dapodik");
      const safeSlug = (payload.sekolah?.slug || "pkbm").replace(/[^a-z0-9-_]/gi, "_");
      XLSX.writeFile(workbook, `verval-dapodik-${safeSlug}.xlsx`);
      setToast(`Berhasil mengunduh Excel Format Dapodik (${payload.rows.length} warga belajar).`);
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Gagal mengekspor file Excel."));
    } finally {
      setExporting(false);
    }
  }

  const summary = data?.summary;
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="REKONSILIASI DAPODIK & VERVAL ADMINISTRASI"
        title="Verval Data Dapodik & Dinas Pendidikan"
        description="Impor Excel Peserta Didik Dapodik langsung ke tabel Siswa terpadu, pantau selisih berkas fisik (KK, Akta/KTP, Ijazah, Surat Pindah), dan sinkronkan verifikasi Dinas."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setImportError("");
                setImportParsed(null);
                setImportFileName("");
                setImportOpen(true);
              }}
              className="dashboard-hero-action"
            >
              <Upload size={15} aria-hidden="true" />
              Impor Excel Dapodik
            </button>
            <button
              type="button"
              onClick={() => setPrintOpen(true)}
              disabled={!data || rows.length === 0}
              className="dashboard-hero-action dashboard-hero-secondary disabled:opacity-50"
            >
              <Printer size={15} aria-hidden="true" />
              Cetak Nominatif
            </button>
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              disabled={exporting || !data || rows.length === 0}
              className="dashboard-hero-action dashboard-hero-secondary disabled:opacity-50"
            >
              <FileSpreadsheet size={15} aria-hidden="true" />
              {exporting ? "Menyiapkan..." : "Export Excel"}
            </button>
          </div>
        }
      />

      {toast && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} aria-hidden="true" />
            {toast}
          </span>
          <button type="button" onClick={() => setToast("")} aria-label="Tutup notifikasi">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Kartu Rekonsiliasi Selisih Dapodik vs Berkas Fisik */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="dashboard-glass rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-500">
            <span>Hasil Tarik Dapodik</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <FileSpreadsheet size={16} />
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">{summary ? summary.totalDapodik : "—"}</p>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {summary ? `${summary.total} warga belajar aktif di LMS` : "Sinkronisasi data pokok"}
          </p>
        </article>

        <article className="dashboard-glass rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-500">
            <span>Berkas Fisik Lengkap</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <FileCheck2 size={16} />
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-emerald-700">{summary ? summary.berkasLengkap : "—"}</p>
          <p className="mt-1 text-xs font-medium text-slate-600">KK, Akta/KTP &amp; Ijazah terlampir</p>
        </article>

        <article className="dashboard-glass rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-500">
            <span>Selisih Belum Ada Berkas</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <FileWarning size={16} />
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-rose-700">{summary ? summary.selisihTanpaBerkas : "—"}</p>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {summary ? `${summary.belumAdaBerkas} siswa belum unggah 1 pun berkas` : "Deteksi WB tanpa arsip fisik"}
          </p>
        </article>

        <article className="dashboard-glass rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-500">
            <span>Terverifikasi PKBM / Dinas</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
              <ShieldCheck size={16} />
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-indigo-800">{summary ? summary.terverifikasiPkbm : "—"}</p>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {summary
              ? `${summary.siapVerval} siap verval · ${summary.lolosDinas} lolos Dinas`
              : "Validasi berjenjang"}
          </p>
        </article>
      </div>

      <section className="dashboard-glass space-y-4 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearchTerm(searchInput.trim());
            }}
            className="flex min-w-[240px] flex-1 items-center gap-2"
          >
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari nama, NISN, atau NIK..."
                className="glass-input w-full rounded-xl py-2.5 pl-10 pr-4 text-sm"
              />
            </div>
            <button type="submit" className="master-primary rounded-xl px-4 py-2.5 text-xs">
              Cari
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={tanpaBerkasOnly}
              onClick={() => {
                setPage(1);
                setTanpaBerkasOnly((prev) => !prev);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                tanpaBerkasOnly
                  ? "border-rose-600 bg-rose-600 text-white shadow-sm"
                  : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
              }`}
            >
              <AlertCircle size={14} aria-hidden="true" />
              Hanya Tanpa Berkas
            </button>

            <select
              aria-label="Filter Status Verval"
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
              className="glass-input rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800"
            >
              <option value="">Semua Status Verval</option>
              <option value="BELUM_LENGKAP">Belum Lengkap</option>
              <option value="SIAP_VERVAL">Siap Verval</option>
              <option value="TERVERIFIKASI_PKBM">Terverifikasi PKBM</option>
            </select>

            <select
              aria-label="Filter Kelas"
              value={kelasFilter}
              onChange={(e) => {
                setPage(1);
                setKelasFilter(e.target.value);
              }}
              className="glass-input rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800"
            >
              <option value="">Semua Kelas</option>
              {(data?.kelasList ?? []).map((kelas) => (
                <option key={kelas.id} value={kelas.id}>
                  {kelas.nama}
                </option>
              ))}
              <option value="belum">Belum ditempatkan</option>
            </select>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            {error}
          </p>
        ) : !data ? (
          <TableSkeleton rows={5} columns={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Belum ada data verval yang sesuai"
            description="Coba ubah filter status/berkas atau gunakan tombol Impor Excel Dapodik untuk menarik data warga belajar."
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/85">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/90 text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-4 py-3.5">Warga Belajar</th>
                    <th className="px-4 py-3.5">NIK / No. KK</th>
                    <th className="px-4 py-3.5">Kelengkapan</th>
                    <th className="px-4 py-3.5">Berkas (4 Dokumen)</th>
                    <th className="px-4 py-3.5">Status Verval</th>
                    <th className="px-4 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {rows.map((student) => {
                    const pkbmMeta = statusPkbmMeta(student.statusVerval);
                    const dinasMeta = statusDinasMeta(student.statusVervalDinas);
                    return (
                      <tr key={student.id} className="hover:bg-indigo-50/40">
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-bold text-slate-900">{student.nama}</p>
                            {student.sumberDapodik && (
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-800">
                                Dapodik
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-600">
                            NISN {student.nisn} · {student.kelasNama}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-700">
                          <p>NIK: {student.nik ?? <span className="text-rose-600">Belum ada</span>}</p>
                          <p className="mt-0.5">KK: {student.noKk ?? <span className="text-rose-600">Belum ada</span>}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full ${
                                  student.kelengkapanPersen >= 90
                                    ? "bg-emerald-500"
                                    : student.kelengkapanPersen >= 60
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                }`}
                                style={{ width: `${student.kelengkapanPersen}%` }}
                              />
                            </div>
                            <span className="text-xs font-extrabold text-slate-800">{student.kelengkapanPersen}%</span>
                          </div>
                          {student.namaIbuKandung && (
                            <p className="mt-1 truncate text-[11px] text-slate-500">Ibu: {student.namaIbuKandung}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                            <span className={`rounded px-1.5 py-0.5 ${student.urlKk ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                              KK
                            </span>
                            <span className={`rounded px-1.5 py-0.5 ${student.urlAktaKtp ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                              Akta/KTP
                            </span>
                            <span className={`rounded px-1.5 py-0.5 ${student.urlIjazah ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                              Ijazah
                            </span>
                            <span className={`rounded px-1.5 py-0.5 ${student.urlSuratPindah ? "bg-cyan-100 text-cyan-800" : "bg-slate-100 text-slate-500"}`}>
                              Surat Pindah
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col items-start gap-1">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${pkbmMeta.cls}`}>
                              {pkbmMeta.label}
                            </span>
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${dinasMeta.cls}`}>
                              Dinas: {dinasMeta.label}
                            </span>
                            {student.catatanDinas && (
                              <span className="max-w-[200px] truncate text-[11px] text-rose-700" title={student.catatanDinas}>
                                {student.catatanDinas}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => openStudentModal(student)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100"
                          >
                            <Eye size={14} aria-hidden="true" />
                            Lihat / Verifikasi
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs font-semibold text-slate-600">
              <span>
                Menampilkan halaman {data.page} · Total {data.total} warga belajar
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700 disabled:opacity-40"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={!data.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700 disabled:opacity-40"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Modal Impor Excel Dapodik Terpadu */}
      {importOpen && (
        <SchoolModal
          wide
          busy={importSubmitBusy}
          title="Impor Excel Peserta Didik Dapodik"
          titleIcon={<FileSpreadsheet size={20} className="text-emerald-600" />}
          onClose={() => {
            if (!importSubmitBusy) setImportOpen(false);
          }}
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-7 sm:py-5">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 text-xs leading-5 text-indigo-950">
              <p className="font-extrabold">Satu Tabel Siswa Terpadu (Zero Double-Input):</p>
              <p className="mt-1">
                Unggah file <span className="font-mono font-bold">.xlsx / .xls</span> ekspor Peserta Didik dari Dapodik. Sistem otomatis mencocokkan NIK/NISN ke tabel <strong>Siswa</strong>, mengisi biodata awal LMS, menandai sumber Dapodik, dan memperbarui angka <em>Hasil Tarik Dapodik</em> tanpa menimpa berkas fisik yang sudah diunggah.
              </p>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40">
              <Upload size={26} className="text-indigo-600" />
              <span className="mt-2 text-sm font-bold text-slate-900">
                {importFileName || "Pilih File Excel Ekspor Dapodik (.xlsx / .xls)"}
              </span>
              <span className="mt-1 text-xs text-slate-500">Maksimal 1.000 baris per unggahan</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={importParseBusy || importSubmitBusy}
                onChange={(e) => {
                  void handleDapodikFileChange(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="sr-only"
              />
            </label>

            {importParseBusy && <p className="text-xs font-semibold text-indigo-700">Membaca lembar Excel Dapodik...</p>}
            {importError && (
              <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
                {importError}
              </p>
            )}

            {importParsed && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
                  <span className="font-extrabold">{importParsed.rows.length} baris siap disinkronkan</span>
                  <span>· Total baris di sheet: {importParsed.totalRowsInSheet}</span>
                  {importParsed.skipped.length > 0 && (
                    <span className="font-bold text-amber-800">· {importParsed.skipped.length} baris dilewati</span>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 font-bold text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Nama</th>
                        <th className="px-3 py-2">NISN</th>
                        <th className="px-3 py-2">NIK</th>
                        <th className="px-3 py-2">Ibu Kandung</th>
                        <th className="px-3 py-2">Jenjang/Rombel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {importParsed.rows.slice(0, 5).map((r, i) => (
                        <tr key={`${r.nisn || r.nik}-${i}`}>
                          <td className="px-3 py-2 font-semibold text-slate-900">{r.nama}</td>
                          <td className="px-3 py-2 font-mono text-slate-700">{r.nisn || "—"}</td>
                          <td className="px-3 py-2 font-mono text-slate-700">{r.nik || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{r.namaIbuKandung || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{r.jenjang || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/90 px-5 py-3.5 sm:px-7">
            <button
              type="button"
              disabled={importSubmitBusy}
              onClick={() => setImportOpen(false)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!importParsed || importSubmitBusy || importParseBusy}
              onClick={() => void handleSubmitImportDapodik()}
              className="master-primary rounded-xl px-4 py-2 text-xs disabled:opacity-50"
            >
              {importSubmitBusy ? "Menyinkronkan..." : "Sinkronkan ke Tabel Siswa"}
            </button>
          </div>
        </SchoolModal>
      )}

      {/* Modal Lihat / Verifikasi Operator PKBM */}
      {activeStudent && editForm && (
        <SchoolModal
          wide
          busy={modalBusy}
          title={`Verval Dapodik — ${activeStudent.nama}`}
          titleIcon={<ClipboardCheck size={20} className="text-indigo-600" />}
          onClose={() => {
            if (!modalBusy) {
              setActiveStudent(null);
              setEditForm(null);
            }
          }}
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-7 sm:py-5">
            {activeStudent.catatanDinas && (
              <div className="rounded-xl border border-cyan-300 bg-cyan-50 p-3.5 text-xs text-cyan-950">
                <p className="font-extrabold">Catatan Dinas Pendidikan ({statusDinasMeta(activeStudent.statusVervalDinas).label}):</p>
                <p className="mt-1">{activeStudent.catatanDinas}</p>
              </div>
            )}

            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-bold text-slate-700">
                NIK (16 Digit)
                <input
                  type="text"
                  maxLength={16}
                  value={editForm.nik}
                  onChange={(e) => setEditForm({ ...editForm, nik: e.target.value.replace(/\D/g, "") })}
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Nomor KK (16 Digit)
                <input
                  type="text"
                  maxLength={16}
                  value={editForm.noKk}
                  onChange={(e) => setEditForm({ ...editForm, noKk: e.target.value.replace(/\D/g, "") })}
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Nama Ibu Kandung
                <input
                  type="text"
                  value={editForm.namaIbuKandung}
                  onChange={(e) => setEditForm({ ...editForm, namaIbuKandung: e.target.value })}
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Tempat Lahir
                <input
                  type="text"
                  value={editForm.tempatLahir}
                  onChange={(e) => setEditForm({ ...editForm, tempatLahir: e.target.value })}
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Tanggal Lahir (DD/MM/YYYY)
                <input
                  type="text"
                  maxLength={10}
                  value={editForm.tanggalLahir}
                  onChange={(e) => setEditForm({ ...editForm, tanggalLahir: e.target.value })}
                  placeholder="DD/MM/YYYY"
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Jenis Kelamin
                <select
                  value={editForm.jenisKelamin}
                  onChange={(e) => setEditForm({ ...editForm, jenisKelamin: e.target.value })}
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">-- Pilih --</option>
                  <option value="L">L</option>
                  <option value="P">P</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                Alamat Lengkap
                <input
                  type="text"
                  value={editForm.alamatLengkap}
                  onChange={(e) => setEditForm({ ...editForm, alamatLengkap: e.target.value })}
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Desa / Kelurahan
                <input
                  type="text"
                  value={editForm.desaKelurahan}
                  onChange={(e) => setEditForm({ ...editForm, desaKelurahan: e.target.value })}
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Kecamatan
                <input
                  type="text"
                  value={editForm.kecamatan}
                  onChange={(e) => setEditForm({ ...editForm, kecamatan: e.target.value })}
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Sekolah Asal
                <input
                  type="text"
                  value={editForm.sekolahAsal}
                  onChange={(e) => setEditForm({ ...editForm, sekolahAsal: e.target.value })}
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                No. Ijazah Terakhir
                <input
                  type="text"
                  value={editForm.nomorIjazahTerakhir}
                  onChange={(e) => setEditForm({ ...editForm, nomorIjazahTerakhir: e.target.value })}
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Tanggal Masuk (DD/MM/YYYY)
                <input
                  type="text"
                  maxLength={10}
                  value={editForm.tanggalMasuk}
                  onChange={(e) => setEditForm({ ...editForm, tanggalMasuk: e.target.value })}
                  placeholder="DD/MM/YYYY"
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  <FileText size={14} /> Pratinjau &amp; Tautan 4 Berkas Dokumen
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { id: "kk", label: "Kartu Keluarga", url: editForm.urlKk },
                    { id: "akta", label: "Akta / KTP", url: editForm.urlAktaKtp },
                    { id: "ijazah", label: "Ijazah", url: editForm.urlIjazah },
                    { id: "pindah", label: "Surat Pindah", url: editForm.urlSuratPindah },
                  ] as const).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveDocTab(tab.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                        activeDocTab === tab.id
                          ? "bg-indigo-600 text-white"
                          : tab.url
                            ? "bg-white text-slate-700 ring-1 ring-slate-200"
                            : "bg-slate-200/70 text-slate-400"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              {(() => {
                const fieldKey: "urlKk" | "urlAktaKtp" | "urlIjazah" | "urlSuratPindah" =
                  activeDocTab === "kk"
                    ? "urlKk"
                    : activeDocTab === "akta"
                      ? "urlAktaKtp"
                      : activeDocTab === "ijazah"
                        ? "urlIjazah"
                        : "urlSuratPindah";
                const currentUrl = editForm[fieldKey];
                return (
                  <div className="mt-3 space-y-3">
                    <input
                      type="text"
                      value={currentUrl.startsWith("data:") ? "[Berkas Terunggah]" : currentUrl}
                      onChange={(e) => setEditForm({ ...editForm, [fieldKey]: e.target.value })}
                      placeholder="Tempel tautan URL dokumen (https://...) jika melengkapi sebagai Operator"
                      className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                    />
                    {!currentUrl.trim() ? (
                      <p className="py-5 text-center text-xs text-slate-500">Berkas belum dilampirkan.</p>
                    ) : currentUrl.startsWith("data:application/pdf") || currentUrl.toLowerCase().endsWith(".pdf") ? (
                      <iframe src={currentUrl} title="Pratinjau PDF" className="h-64 w-full rounded-xl bg-white" />
                    ) : currentUrl.startsWith("data:image/") || /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(currentUrl) ? (
                      <img src={currentUrl} alt="Pratinjau Dokumen" className="mx-auto max-h-64 rounded-xl object-contain" />
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-xs">
                        <span className="break-all font-mono text-slate-700">{currentUrl}</span>
                        {currentUrl.startsWith("http") && (
                          <a
                            href={currentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:underline"
                          >
                            Buka <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                Status Verval PKBM
                <select
                  value={editForm.statusVerval}
                  onChange={(e) => setEditForm({ ...editForm, statusVerval: e.target.value as VervalStatus })}
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm font-bold"
                >
                  <option value="BELUM_LENGKAP">BELUM_LENGKAP</option>
                  <option value="SIAP_VERVAL">SIAP_VERVAL</option>
                  <option value="TERVERIFIKASI_PKBM">TERVERIFIKASI_PKBM</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Catatan Verifikasi Operator PKBM
                <input
                  type="text"
                  maxLength={500}
                  value={editForm.catatanVerval}
                  onChange={(e) => setEditForm({ ...editForm, catatanVerval: e.target.value })}
                  placeholder="Contoh: NIK sesuai KK, berkas siap diperiksa Dinas"
                  className="glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
            </div>

            {modalError && <p role="alert" className="text-sm font-semibold text-rose-700">{modalError}</p>}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/90 px-5 py-3.5 sm:px-7">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={modalBusy}
                onClick={() => void saveStudentVerval("SIAP_VERVAL")}
                className="rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
              >
                Tandai Siap Verval
              </button>
              <button
                type="button"
                disabled={modalBusy}
                onClick={() => void saveStudentVerval("TERVERIFIKASI_PKBM")}
                className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Tandai Terverifikasi PKBM
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={modalBusy}
                onClick={() => {
                  setActiveStudent(null);
                  setEditForm(null);
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={modalBusy}
                onClick={() => void saveStudentVerval()}
                className="master-primary rounded-xl px-4 py-2 text-xs"
              >
                {modalBusy ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </SchoolModal>
      )}

      {printOpen && data && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white p-6 text-slate-900 sm:p-10">
          <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <h3 className="text-lg font-extrabold">Pratinjau Cetak Daftar Nominatif Verval Dapodik</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <Printer size={14} /> Cetak / Simpan PDF
              </button>
              <button
                type="button"
                onClick={() => void handleExportExcel()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800"
              >
                <Download size={14} /> Export .xlsx
              </button>
              <button
                type="button"
                onClick={() => setPrintOpen(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700"
              >
                Tutup
              </button>
            </div>
          </div>

          <div className="mx-auto max-w-5xl">
            <div className="border-b-2 border-slate-900 pb-4 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
                PUSAT KEGIATAN BELAJAR MASYARAKAT (PKBM)
              </p>
              <h1 className="mt-1 text-2xl font-black uppercase">{data.sekolah.nama}</h1>
              <p className="mt-1 text-xs text-slate-700">
                NPSN: {data.sekolah.npsn ?? "—"} · Wilayah: {data.sekolah.kabupatenKota ?? "Belum ditetapkan"}
              </p>
              <p className="mt-2 text-sm font-extrabold uppercase tracking-wide">
                DAFTAR NOMINATIF VERVAL BIODATA DAPODIK WARGA BELAJAR
              </p>
            </div>

            <table className="mt-5 w-full border-collapse border border-slate-800 text-xs">
              <thead>
                <tr className="bg-slate-100 text-left font-bold">
                  <th className="border border-slate-800 px-2 py-2">No</th>
                  <th className="border border-slate-800 px-2 py-2">Nama Warga Belajar</th>
                  <th className="border border-slate-800 px-2 py-2">NISN</th>
                  <th className="border border-slate-800 px-2 py-2">NIK</th>
                  <th className="border border-slate-800 px-2 py-2">No. KK</th>
                  <th className="border border-slate-800 px-2 py-2">Ibu Kandung</th>
                  <th className="border border-slate-800 px-2 py-2">Kelas / Paket</th>
                  <th className="border border-slate-800 px-2 py-2">Status PKBM</th>
                  <th className="border border-slate-800 px-2 py-2">Status Dinas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="border border-slate-800 px-2 py-1.5 text-center">{(page - 1) * data.pageSize + idx + 1}</td>
                    <td className="border border-slate-800 px-2 py-1.5 font-semibold">{row.nama}</td>
                    <td className="border border-slate-800 px-2 py-1.5 font-mono">{row.nisn}</td>
                    <td className="border border-slate-800 px-2 py-1.5 font-mono">{row.nik ?? "—"}</td>
                    <td className="border border-slate-800 px-2 py-1.5 font-mono">{row.noKk ?? "—"}</td>
                    <td className="border border-slate-800 px-2 py-1.5">{row.namaIbuKandung ?? "—"}</td>
                    <td className="border border-slate-800 px-2 py-1.5">{row.kelasNama}</td>
                    <td className="border border-slate-800 px-2 py-1.5">{row.statusVerval}</td>
                    <td className="border border-slate-800 px-2 py-1.5">{row.statusVervalDinas}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-8 flex justify-end text-xs">
              <div className="w-64 text-center">
                <p>Kepala Lembaga / Operator Dapodik,</p>
                <div className="h-16" />
                <p className="font-bold underline">{data.sekolah.nama}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
