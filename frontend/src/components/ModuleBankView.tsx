import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpen,
  Building2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderUp,
  Globe,
  Layers,
  Library,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { CardGridSkeleton, DashboardHero, EmptyState } from "./DashboardUI";
import { useGlassConfirm } from "./GlassConfirm";
import { ModulePdfViewerModal } from "./ModulePdfPreview";
import { SchoolModal } from "./SchoolModal";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

export type ModuleVisibility = "PRIVATE" | "PUBLIC" | "ARCHIVED";
export type ModulePaket = "Paket A" | "Paket B" | "Paket C";

export type ModuleBankItem = {
  id: string;
  schoolId: string | null;
  originSchoolName: string;
  paket: string;
  gradeLevel: string;
  subject: string;
  title: string;
  summary: string | null;
  fileUrl: string;
  visibility: string;
  createdAt: string;
};

type SimpleOption = { id: string; nama: string };

type ModuleBankPayload = {
  schoolName: string;
  schoolModules: ModuleBankItem[];
  publicModules: ModuleBankItem[];
  classes: SimpleOption[];
  subjects: SimpleOption[];
  filters: {
    pakets: ModulePaket[];
    gradeLevels: string[];
    subjects: string[];
  };
  error?: string;
};

type BulkRowDraft = {
  paket: ModulePaket;
  gradeLevel: string;
  subject: string;
  title: string;
  summary: string;
  fileUrl: string;
  sourceName?: string;
};

const PAKET_OPTIONS: ModulePaket[] = ["Paket A", "Paket B", "Paket C"];
const GRADE_OPTIONS_BY_PAKET: Record<ModulePaket, string[]> = {
  "Paket A": ["Kelas 1", "Kelas 2", "Kelas 3", "Kelas 4", "Kelas 5", "Kelas 6"],
  "Paket B": ["Kelas 7", "Kelas 8", "Kelas 9"],
  "Paket C": ["Kelas 10", "Kelas 11", "Kelas 12"],
};

const ALL_GRADE_OPTIONS = [
  ...GRADE_OPTIONS_BY_PAKET["Paket A"],
  ...GRADE_OPTIONS_BY_PAKET["Paket B"],
  ...GRADE_OPTIONS_BY_PAKET["Paket C"],
];

function authHeaders(sandboxRole?: "GURU", extra?: Record<string, string>): Record<string, string> | undefined {
  if (!sandboxRole && !extra) return undefined;
  return {
    ...(extra ?? {}),
    ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
  };
}

function inferPaketFromText(raw: string): ModulePaket {
  const s = raw.trim().toUpperCase();
  if (/\bPAKET[\s_-]*A\b|\bSD\b/.test(s)) return "Paket A";
  if (/\bPAKET[\s_-]*B\b|\bSMP\b/.test(s)) return "Paket B";
  if (/\bPAKET[\s_-]*C\b|\bSMA\b|\bSMK\b/.test(s)) return "Paket C";
  const match = s.match(/(?:KELAS|KLS)[\s_-]*(\d{1,2})\b|\b(\d{1,2})\b/);
  if (match) {
    const n = Number(match[1] ?? match[2]);
    if (n >= 1 && n <= 6) return "Paket A";
    if (n >= 7 && n <= 9) return "Paket B";
    if (n >= 10 && n <= 12) return "Paket C";
  }
  return "Paket C";
}

function inferGradeFromText(raw: string, paket: ModulePaket): string {
  const match = raw.match(/(?:kelas|kls|tingkat)?[\s_-]*(\d{1,2})\b/i);
  if (match) {
    const n = Number(match[1]);
    if (n >= 1 && n <= 12) return `Kelas ${n}`;
  }
  return GRADE_OPTIONS_BY_PAKET[paket][0];
}

function parsePdfFilenameMetadata(filename: string): Omit<BulkRowDraft, "fileUrl"> {
  const withoutExt = filename.replace(/\.pdf$/i, "").trim();
  const normalized = withoutExt.replace(/[_|]+/g, " - ");
  const parts = normalized
    .split(/\s*-\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 4) {
    const paket = inferPaketFromText(`${parts[0]} ${parts[1]}`);
    const gradeLevel = inferGradeFromText(parts[1], paket);
    const subject = parts[2];
    const title = parts.slice(3).join(" - ");
    return {
      paket,
      gradeLevel,
      subject,
      title,
      summary: `Modul PDF ${paket} ${gradeLevel} - ${subject}`,
      sourceName: filename,
    };
  }

  if (parts.length === 3) {
    const paket = inferPaketFromText(normalized);
    const gradeLevel = inferGradeFromText(normalized, paket);
    return {
      paket,
      gradeLevel,
      subject: parts[1],
      title: parts[2],
      summary: `Modul PDF ${paket} ${gradeLevel} - ${parts[1]}`,
      sourceName: filename,
    };
  }

  if (parts.length === 2) {
    const paket = inferPaketFromText(normalized);
    const gradeLevel = inferGradeFromText(normalized, paket);
    return {
      paket,
      gradeLevel,
      subject: parts[0],
      title: parts[1],
      summary: `Modul PDF ${paket} ${gradeLevel}`,
      sourceName: filename,
    };
  }

  const paket = inferPaketFromText(withoutExt);
  const gradeLevel = inferGradeFromText(withoutExt, paket);
  return {
    paket,
    gradeLevel,
    subject: "Umum",
    title: withoutExt || "Modul PDF",
    summary: `Modul PDF ${paket} ${gradeLevel}`,
    sourceName: filename,
  };
}

function visibilityBadge(visibility: string) {
  if (visibility === "PUBLIC") {
    return {
      label: "Publik",
      cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
      Icon: Globe,
    };
  }
  if (visibility === "ARCHIVED") {
    return {
      label: "Diarsipkan",
      cls: "border-slate-300 bg-slate-100 text-slate-600",
      Icon: Archive,
    };
  }
  return {
    label: "Privat",
    cls: "border-indigo-200 bg-indigo-50 text-indigo-700",
    Icon: Lock,
  };
}

async function downloadExcelTemplate() {
  const XLSX = await import("xlsx");
  const rows = [
    {
      Paket: "Paket C",
      Kelas: "Kelas 12",
      "Mata Pelajaran": "Matematika",
      "Judul Modul": "Modul 1: Peluang & Kaidah Pencacahan",
      Ringkasan: "Panduan belajar mandiri aturan perkalian, permutasi, dan kombinasi.",
      "Link PDF": "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view",
    },
    {
      Paket: "Paket B",
      Kelas: "Kelas 8",
      "Mata Pelajaran": "IPA",
      "Judul Modul": "Modul 2: Sistem Pernapasan & Peredaran Darah",
      Ringkasan: "Materi pengayaan Kurikulum Merdeka Pendidikan Kesetaraan Paket B.",
      "Link PDF": "https://emodul.kemdikbud.go.id/B-IPA-2/B-IPA-2.pdf",
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
    { wch: 38 },
    { wch: 46 },
    { wch: 52 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Template Bank Modul");
  XLSX.writeFile(wb, "Template_Bank_Modul_Kesetaraan.xlsx");
}

function normalizeSpreadsheetRow(raw: Record<string, unknown>): BulkRowDraft | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const exact = raw[k];
      if (exact !== undefined && exact !== null && String(exact).trim() !== "") return String(exact).trim();
      const foundKey = Object.keys(raw).find((rk) => rk.trim().toLowerCase() === k.toLowerCase());
      if (foundKey && raw[foundKey] !== undefined && raw[foundKey] !== null && String(raw[foundKey]).trim() !== "") {
        return String(raw[foundKey]).trim();
      }
    }
    return "";
  };

  const paketRaw = get("Paket", "paket", "Jenjang", "jenjang");
  const kelasRaw = get("Kelas", "kelas", "gradeLevel", "Tingkat");
  const subject = get("Mata Pelajaran", "mataPelajaran", "Mapel", "mapel", "subject");
  const title = get("Judul Modul", "Judul", "judul", "title", "judulModul");
  const summary = get("Ringkasan", "ringkasan", "summary", "Deskripsi", "deskripsi");
  const fileUrl = get("Link PDF", "linkPdf", "fileUrl", "file_url", "Tautan", "tautan", "URL", "url");

  if (!title && !fileUrl) return null;
  const paket = inferPaketFromText(`${paketRaw} ${kelasRaw}`);
  const gradeLevel = inferGradeFromText(kelasRaw, paket);

  return {
    paket,
    gradeLevel,
    subject: subject || "Umum",
    title: title || "Modul Belajar",
    summary,
    fileUrl,
  };
}

export function ModuleBankView({ sandboxRole }: { sandboxRole?: "GURU" }) {
  const confirm = useGlassConfirm();
  const [tab, setTab] = useState<"sekolah" | "umum">("sekolah");
  const [data, setData] = useState<ModuleBankPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Filters
  const [schoolStatusFilter, setSchoolStatusFilter] = useState<"ALL" | ModuleVisibility>("ALL");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [publicPaketFilter, setPublicPaketFilter] = useState<string>("");
  const [publicGradeFilter, setPublicGradeFilter] = useState<string>("");
  const [publicSubjectFilter, setPublicSubjectFilter] = useState<string>("");
  const [publicSearch, setPublicSearch] = useState("");

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    paket: ModulePaket;
    gradeLevel: string;
    subject: string;
    title: string;
    summary: string;
    fileUrl: string;
    visibility: "PRIVATE" | "PUBLIC";
  }>({
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "",
    title: "",
    summary: "",
    fileUrl: "",
    visibility: "PRIVATE",
  });

  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [excelRows, setExcelRows] = useState<BulkRowDraft[]>([]);
  const [excelVisibility, setExcelVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [excelError, setExcelError] = useState("");

  const [multiPdfOpen, setMultiPdfOpen] = useState(false);
  const [pdfRows, setPdfRows] = useState<BulkRowDraft[]>([]);
  const [pdfBaseFolderUrl, setPdfBaseFolderUrl] = useState("");
  const [pdfVisibility, setPdfVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [pdfError, setPdfError] = useState("");

  const [assignTarget, setAssignTarget] = useState<ModuleBankItem | null>(null);
  const [assignClassId, setAssignClassId] = useState("");
  const [assignMapelId, setAssignMapelId] = useState("");

  const [previewItem, setPreviewItem] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  const loadBank = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const headers = authHeaders(sandboxRole);
        const res = await fetchWithTimeout("/api/module-bank", {
          signal,
          ...(headers ? { headers } : {}),
        });
        const body = (await res.json().catch(() => null)) as ModuleBankPayload | null;
        if (!res.ok || !body) {
          throw new Error(body?.error || "Bank Modul Belajar belum dapat dimuat.");
        }
        setData(body);
        if (body.classes.length > 0) {
          setAssignClassId((prev) => prev || body.classes[0].id);
        }
      } catch (failure) {
        if (!isCallerAborted(failure, signal)) {
          setError(describeFetchError(failure, "Bank Modul Belajar belum dapat dimuat."));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [sandboxRole],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadBank(controller.signal);
    return () => controller.abort();
  }, [loadBank]);

  const filteredSchoolModules = useMemo(() => {
    const list = data?.schoolModules ?? [];
    const q = schoolSearch.trim().toLowerCase();
    return list.filter((item) => {
      if (schoolStatusFilter !== "ALL" && item.visibility !== schoolStatusFilter) return false;
      if (!q) return true;
      return `${item.title} ${item.subject} ${item.paket} ${item.gradeLevel} ${item.summary ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [data?.schoolModules, schoolStatusFilter, schoolSearch]);

  const filteredPublicModules = useMemo(() => {
    const list = data?.publicModules ?? [];
    const q = publicSearch.trim().toLowerCase();
    return list.filter((item) => {
      if (publicPaketFilter && item.paket !== publicPaketFilter) return false;
      if (publicGradeFilter && item.gradeLevel !== publicGradeFilter) return false;
      if (publicSubjectFilter && item.subject.toLowerCase() !== publicSubjectFilter.toLowerCase()) return false;
      if (!q) return true;
      return `${item.title} ${item.subject} ${item.paket} ${item.gradeLevel} ${item.originSchoolName} ${item.summary ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [data?.publicModules, publicPaketFilter, publicGradeFilter, publicSubjectFilter, publicSearch]);

  const availablePublicGrades = useMemo(() => {
    if (publicPaketFilter && publicPaketFilter in GRADE_OPTIONS_BY_PAKET) {
      return GRADE_OPTIONS_BY_PAKET[publicPaketFilter as ModulePaket];
    }
    return data?.filters.gradeLevels.length ? data.filters.gradeLevels : ALL_GRADE_OPTIONS;
  }, [publicPaketFilter, data?.filters.gradeLevels]);

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const headers = authHeaders(sandboxRole, { "Content-Type": "application/json" });
      const res = await fetchWithTimeout("/api/module-bank", {
        method: "POST",
        headers,
        body: JSON.stringify(createForm),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Modul belum dapat disimpan.");
      setNotice(body?.message || "Modul disimpan.");
      setCreateOpen(false);
      setCreateForm({
        paket: "Paket C",
        gradeLevel: "Kelas 10",
        subject: "",
        title: "",
        summary: "",
        fileUrl: "",
        visibility: "PRIVATE",
      });
      await loadBank();
    } catch (failure) {
      setError(describeFetchError(failure, "Modul belum dapat disimpan."));
    } finally {
      setBusy(false);
    }
  }

  async function seedNationalCatalog() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const headers = authHeaders(sandboxRole, { "Content-Type": "application/json" });
      const res = await fetchWithTimeout("/api/module-bank/seed-national", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal mengisi katalog modul nasional.");
      setNotice(body?.message || "Katalog modul nasional berhasil diisi.");
      await loadBank();
      setTab("umum");
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal mengisi katalog modul nasional."));
    } finally {
      setBusy(false);
    }
  }

  async function changeVisibility(item: ModuleBankItem, nextVis: ModuleVisibility) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const headers = authHeaders(sandboxRole, { "Content-Type": "application/json" });
      const res = await fetchWithTimeout(`/api/module-bank/${encodeURIComponent(item.id)}/visibility`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ visibility: nextVis }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Status modul belum dapat diubah.");
      setNotice(body?.message || "Status modul diperbarui.");
      await loadBank();
    } catch (failure) {
      setError(describeFetchError(failure, "Status modul belum dapat diubah."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteModule(item: ModuleBankItem) {
    if (!await confirm(`Hapus modul "${item.title}" dari Bank Modul Sekolah?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const headers = authHeaders(sandboxRole);
      const res = await fetchWithTimeout(`/api/module-bank/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        ...(headers ? { headers } : {}),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Modul belum dapat dihapus.");
      setNotice(body?.message || "Modul dihapus.");
      await loadBank();
    } catch (failure) {
      setError(describeFetchError(failure, "Modul belum dapat dihapus."));
    } finally {
      setBusy(false);
    }
  }

  async function submitAssignToClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignTarget || !assignClassId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const headers = authHeaders(sandboxRole, { "Content-Type": "application/json" });
      const res = await fetchWithTimeout(`/api/module-bank/${encodeURIComponent(assignTarget.id)}/assign-to-class`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          classId: assignClassId,
          ...(assignMapelId ? { mapelId: assignMapelId } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Modul gagal disalin ke kelas.");
      setNotice(body?.message || "Modul berhasil disalin ke kelas tujuan.");
      setAssignTarget(null);
      setAssignMapelId("");
    } catch (failure) {
      setError(describeFetchError(failure, "Modul gagal disalin ke kelas."));
    } finally {
      setBusy(false);
    }
  }

  async function handleExcelFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setExcelError("");
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      if (!firstSheet) throw new Error("Lembar Excel tidak ditemukan.");
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const normalized = jsonRows.map(normalizeSpreadsheetRow).filter((r): r is BulkRowDraft => r !== null);
      if (normalized.length === 0) {
        setExcelError("Tidak ada baris valid. Pastikan kolom memakai header Template Excel (Paket, Kelas, Mata Pelajaran, Judul Modul, Ringkasan, Link PDF).");
        setExcelRows([]);
        return;
      }
      setExcelRows(normalized.slice(0, 500));
    } catch (failure) {
      setExcelError(describeFetchError(failure, "Gagal membaca berkas Excel / CSV."));
      setExcelRows([]);
    }
  }

  async function submitBulkImport(items: BulkRowDraft[], visibility: "PRIVATE" | "PUBLIC", onSuccess: () => void, setLocalError: (msg: string) => void) {
    if (items.length === 0) {
      setLocalError("Belum ada daftar modul yang siap diimpor.");
      return;
    }
    const missingUrl = items.findIndex((r) => !/^https?:\/\//i.test(r.fileUrl.trim()));
    if (missingUrl !== -1) {
      setLocalError(`Baris #${missingUrl + 1} ("${items[missingUrl].title}") belum memiliki tautan PDF https:// yang valid.`);
      return;
    }
    setBusy(true);
    setLocalError("");
    setError("");
    setNotice("");
    try {
      const headers = authHeaders(sandboxRole, { "Content-Type": "application/json" });
      const res = await fetchWithTimeout("/api/module-bank/import-bulk", {
        method: "POST",
        headers,
        body: JSON.stringify({ items, visibility }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string; errors?: string[] } | null;
      if (!res.ok) throw new Error(body?.error || "Impor massal modul gagal.");
      setNotice(body?.message || `${items.length} modul berhasil diimpor.`);
      onSuccess();
      await loadBank();
    } catch (failure) {
      setLocalError(describeFetchError(failure, "Impor massal modul gagal."));
    } finally {
      setBusy(false);
    }
  }

  function handleMultiPdfSelect(event: React.ChangeEvent<HTMLInputElement>) {
    setPdfError("");
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const base = pdfBaseFolderUrl.trim().replace(/\/+$/, "");
    const parsed: BulkRowDraft[] = files.slice(0, 200).map((file) => {
      const meta = parsePdfFilenameMetadata(file.name);
      return {
        ...meta,
        fileUrl: base ? `${base}/${encodeURIComponent(file.name)}` : "",
      };
    });
    setPdfRows(parsed);
  }

  function applyBaseUrlToPdfRows(nextBase: string) {
    setPdfBaseFolderUrl(nextBase);
    const cleaned = nextBase.trim().replace(/\/+$/, "");
    if (!cleaned) return;
    setPdfRows((prev) =>
      prev.map((row) => ({
        ...row,
        fileUrl: row.sourceName ? `${cleaned}/${encodeURIComponent(row.sourceName)}` : row.fileUrl,
      })),
    );
  }

  return (
    <section className="space-y-5">
      <DashboardHero
        eyebrow="PUSTAKA MODUL PEMBELAJARAN"
        title="Bank Modul Belajar"
        description={`Kelola pustaka modul PDF ringan berbasis metadata untuk ${data?.schoolName ?? "sekolah Anda"}. Simpan privat, bagikan ke Bank Modul Umum antar PKBM, atau salin langsung ke kelas belajar.`}
        badge={`${data?.schoolModules.length ?? 0} Modul Sekolah · ${data?.publicModules.length ?? 0} Modul Umum`}
      />

      {/* Top Tabs */}
      <div className="dashboard-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={tab === "sekolah"}
            onClick={() => setTab("sekolah")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition sm:text-sm ${
              tab === "sekolah"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white/80 text-slate-700 hover:bg-white"
            }`}
          >
            <Library size={16} aria-hidden="true" />
            Bank Modul Sekolah
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tab === "sekolah" ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-700"}`}>
              {data?.schoolModules.length ?? 0}
            </span>
          </button>

          <button
            type="button"
            aria-pressed={tab === "umum"}
            onClick={() => setTab("umum")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition sm:text-sm ${
              tab === "umum"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white/80 text-slate-700 hover:bg-white"
            }`}
          >
            <Globe size={16} aria-hidden="true" />
            Bank Modul Umum (Publik)
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tab === "umum" ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700"}`}>
              {data?.publicModules.length ?? 0}
            </span>
          </button>
        </div>

        <button
          type="button"
          disabled={loading || busy}
          onClick={() => void loadBank()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          Muat Ulang
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {notice}
        </p>
      )}

      {loading && !data ? (
        <CardGridSkeleton count={6} columns={3} />
      ) : tab === "sekolah" ? (
        <div className="space-y-4">
          {/* Action Buttons Toolbar */}
          <div className="dashboard-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => { setError(""); setCreateOpen(true); }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                <Plus size={15} aria-hidden="true" />
                + Tambah Modul
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => { setExcelError(""); setExcelRows([]); setExcelModalOpen(true); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                <FileSpreadsheet size={15} aria-hidden="true" />
                Impor Excel / CSV
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => { setPdfError(""); setPdfRows([]); setMultiPdfOpen(true); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs font-extrabold text-sky-800 transition hover:bg-sky-100 disabled:opacity-50"
              >
                <FolderUp size={15} aria-hidden="true" />
                Upload Banyak PDF Sekaligus
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void seedNationalCatalog()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-extrabold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
              >
                <Sparkles size={15} aria-hidden="true" />
                Isi Otomatis Katalog Modul Nasional (1 Klik)
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Cari judul / mapel..."
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-indigo-400"
                />
              </div>

              <select
                aria-label="Filter status modul sekolah"
                value={schoolStatusFilter}
                onChange={(e) => setSchoolStatusFilter(e.target.value as "ALL" | ModuleVisibility)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Semua Status</option>
                <option value="PRIVATE">Privat Sekolah</option>
                <option value="PUBLIC">Publik (Umum)</option>
                <option value="ARCHIVED">Diarsipkan</option>
              </select>
            </div>
          </div>

          {filteredSchoolModules.length === 0 ? (
            <EmptyState
              title="Belum ada modul di Bank Modul Sekolah"
              description="Tambahkan tautan modul PDF, impor Excel/CSV, upload banyak PDF sekaligus, atau isi Katalog Nasional Pendidikan Kesetaraan."
              action={
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="master-primary"
                >
                  + Tambah Modul Pertama
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredSchoolModules.map((item) => {
                const badge = visibilityBadge(item.visibility);
                const BadgeIcon = badge.Icon;
                return (
                  <article
                    key={item.id}
                    className="dashboard-glass flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 p-5"
                  >
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                          <Layers size={12} aria-hidden="true" />
                          {item.paket} · {item.gradeLevel}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${badge.cls}`}>
                          <BadgeIcon size={11} aria-hidden="true" />
                          {badge.label}
                        </span>
                      </div>

                      <h3 className="text-sm font-extrabold leading-snug text-slate-900">{item.title}</h3>
                      <p className="text-xs font-bold text-indigo-700">{item.subject}</p>
                      {item.summary && (
                        <p className="line-clamp-3 text-xs leading-relaxed text-slate-600">{item.summary}</p>
                      )}
                    </div>

                    <div className="space-y-2 border-t border-slate-200/70 pt-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewItem({
                            url: item.fileUrl,
                            title: item.title,
                            subtitle: `${item.paket} · ${item.gradeLevel} · ${item.subject}`,
                          })}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye size={13} aria-hidden="true" />
                          Pratinjau PDF
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setAssignTarget(item);
                            if (!assignClassId && data?.classes[0]) setAssignClassId(data.classes[0].id);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          <Send size={13} aria-hidden="true" />
                          Kirim ke Kelas
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {item.visibility !== "PUBLIC" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void changeVisibility(item, "PUBLIC")}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <Globe size={12} aria-hidden="true" />
                            Bagikan ke Umum
                          </button>
                        )}
                        {item.visibility !== "PRIVATE" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void changeVisibility(item, "PRIVATE")}
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                          >
                            <Lock size={12} aria-hidden="true" />
                            Jadikan Privat
                          </button>
                        )}
                        {item.visibility !== "ARCHIVED" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void changeVisibility(item, "ARCHIVED")}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          >
                            <Archive size={12} aria-hidden="true" />
                            Arsipkan
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void deleteModule(item)}
                          aria-label={`Hapus ${item.title}`}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          <Trash2 size={12} aria-hidden="true" />
                          Hapus
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Public Filter Bar */}
          <div className="dashboard-glass grid grid-cols-1 gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-bold text-slate-700">
              Paket Kesetaraan
              <select
                value={publicPaketFilter}
                onChange={(e) => {
                  setPublicPaketFilter(e.target.value);
                  setPublicGradeFilter("");
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
              >
                <option value="">Semua Paket (A, B, C)</option>
                {PAKET_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-bold text-slate-700">
              Kelas / Tingkatan
              <select
                value={publicGradeFilter}
                onChange={(e) => setPublicGradeFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
              >
                <option value="">Semua Kelas</option>
                {availablePublicGrades.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-bold text-slate-700">
              Mata Pelajaran
              <select
                value={publicSubjectFilter}
                onChange={(e) => setPublicSubjectFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
              >
                <option value="">Semua Mata Pelajaran</option>
                {(data?.filters.subjects ?? []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-bold text-slate-700">
              Cari Judul / Lembaga
              <div className="relative mt-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Kata kunci modul..."
                  value={publicSearch}
                  onChange={(e) => setPublicSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-emerald-400"
                />
              </div>
            </label>
          </div>

          {filteredPublicModules.length === 0 ? (
            <EmptyState
              title="Belum ada modul pada filter Bank Modul Umum ini"
              description="Klik tombol Isi Otomatis Katalog Modul Nasional (1 Klik) di Tab Bank Modul Sekolah untuk memuat katalog resmi Pendidikan Kesetaraan."
              action={
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void seedNationalCatalog()}
                  className="master-primary"
                >
                  Isi Katalog Modul Nasional (1 Klik)
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredPublicModules.map((item) => (
                <article
                  key={item.id}
                  className="dashboard-glass flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 p-5"
                >
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                        <BookOpen size={12} aria-hidden="true" />
                        {item.paket} · {item.gradeLevel}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        <Building2 size={11} aria-hidden="true" />
                        {item.originSchoolName}
                      </span>
                    </div>

                    <h3 className="text-sm font-extrabold leading-snug text-slate-900">{item.title}</h3>
                    <p className="text-xs font-bold text-indigo-700">{item.subject}</p>
                    {item.summary && (
                      <p className="line-clamp-3 text-xs leading-relaxed text-slate-600">{item.summary}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
                    <button
                      type="button"
                      onClick={() => setPreviewItem({
                        url: item.fileUrl,
                        title: item.title,
                        subtitle: `${item.paket} · ${item.gradeLevel} · ${item.subject} (${item.originSchoolName})`,
                      })}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Eye size={13} aria-hidden="true" />
                      Pratinjau PDF
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setAssignTarget(item);
                        if (!assignClassId && data?.classes[0]) setAssignClassId(data.classes[0].id);
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Send size={13} aria-hidden="true" />
                      Gunakan / Salin ke Kelas
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: + Tambah Modul */}
      {createOpen && (
        <SchoolModal title="Tambah Modul ke Bank Modul Sekolah" busy={busy} onClose={() => setCreateOpen(false)}>
          <form onSubmit={submitCreate} className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block font-semibold text-slate-700">
                Paket Pendidikan
                <select
                  value={createForm.paket}
                  onChange={(e) => {
                    const nextPaket = e.target.value as ModulePaket;
                    setCreateForm({
                      ...createForm,
                      paket: nextPaket,
                      gradeLevel: GRADE_OPTIONS_BY_PAKET[nextPaket][0],
                    });
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5"
                >
                  {PAKET_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>

              <label className="block font-semibold text-slate-700">
                Kelas
                <select
                  value={createForm.gradeLevel}
                  onChange={(e) => setCreateForm({ ...createForm, gradeLevel: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5"
                >
                  {GRADE_OPTIONS_BY_PAKET[createForm.paket].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block font-semibold text-slate-700">
              Mata Pelajaran
              <input
                required
                maxLength={120}
                placeholder="Misal: Matematika, Bahasa Indonesia, Ekonomi"
                value={createForm.subject}
                onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5"
              />
            </label>

            <label className="block font-semibold text-slate-700">
              Judul Modul
              <input
                required
                maxLength={240}
                placeholder="Misal: Modul 1: Eksponen dan Logaritma"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5"
              />
            </label>

            <label className="block font-semibold text-slate-700">
              Ringkasan Singkat (opsional)
              <textarea
                rows={2}
                maxLength={2000}
                placeholder="Tujuan pembelajaran atau cakupan singkat modul..."
                value={createForm.summary}
                onChange={(e) => setCreateForm({ ...createForm, summary: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5"
              />
            </label>

            <label className="block font-semibold text-slate-700">
              Link PDF (Google Drive / Kemendikdasmen / HTTPS)
              <input
                required
                type="url"
                maxLength={2000}
                placeholder="https://drive.google.com/file/d/.../view atau https://.../modul.pdf"
                value={createForm.fileUrl}
                onChange={(e) => setCreateForm({ ...createForm, fileUrl: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5"
              />
            </label>

            <label className="block font-semibold text-slate-700">
              Visibilitas Awal
              <select
                value={createForm.visibility}
                onChange={(e) => setCreateForm({ ...createForm, visibility: e.target.value as "PRIVATE" | "PUBLIC" })}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5"
              >
                <option value="PRIVATE">Privat Sekolah (Hanya untuk lembaga ini)</option>
                <option value="PUBLIC">Publik (Tampilkan di Bank Modul Umum PKBM)</option>
              </select>
            </label>

            <button
              disabled={busy}
              className="mt-2 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Simpan Modul"}
            </button>
          </form>
        </SchoolModal>
      )}

      {/* Modal: Impor Excel / CSV */}
      {excelModalOpen && (
        <SchoolModal title="Impor Massal Modul dari Excel / CSV" busy={busy} onClose={() => setExcelModalOpen(false)}>
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3.5">
              <div className="text-xs text-emerald-950">
                <p className="font-extrabold">Format Ringan Berbasis Tautan PDF</p>
                <p className="mt-0.5 text-emerald-800">
                  Kolom wajib: Paket, Kelas, Mata Pelajaran, Judul Modul, Ringkasan, Link PDF.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadExcelTemplate}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-700"
              >
                <Download size={14} aria-hidden="true" />
                Unduh Template Excel
              </button>
            </div>

            <label className="block text-xs font-bold text-slate-700">
              Pilih Berkas (.xlsx, .xls, .csv)
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => void handleExcelFileChange(e)}
                className="mt-1.5 block w-full rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs"
              />
            </label>

            <label className="block text-xs font-bold text-slate-700">
              Visibilitas Hasil Impor
              <select
                value={excelVisibility}
                onChange={(e) => setExcelVisibility(e.target.value as "PRIVATE" | "PUBLIC")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
              >
                <option value="PRIVATE">Privat Sekolah</option>
                <option value="PUBLIC">Publik (Bagikan ke Bank Modul Umum)</option>
              </select>
            </label>

            {excelError && <p role="alert" className="text-xs font-semibold text-rose-700">{excelError}</p>}

            {excelRows.length > 0 && (
              <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-[11px] font-bold text-slate-700">
                    <tr>
                      <th className="p-2">Paket / Kelas</th>
                      <th className="p-2">Mapel &amp; Judul</th>
                      <th className="p-2">Link PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelRows.slice(0, 50).map((r, i) => (
                      <tr key={i}>
                        <td className="p-2 whitespace-nowrap">{r.paket} · {r.gradeLevel}</td>
                        <td className="p-2">
                          <span className="font-bold text-slate-900">{r.title}</span>
                          <span className="block text-[11px] text-slate-500">{r.subject}</span>
                        </td>
                        <td className="max-w-[160px] truncate p-2 font-mono text-[11px] text-indigo-700">{r.fileUrl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {excelRows.length > 50 && (
                  <p className="p-2 text-center text-[11px] font-semibold text-slate-500">
                    Menampilkan 50 dari {excelRows.length} baris siap impor.
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={busy || excelRows.length === 0}
              onClick={() => void submitBulkImport(excelRows, excelVisibility, () => setExcelModalOpen(false), setExcelError)}
              className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Mengimpor..." : `Impor ${excelRows.length} Modul`}
            </button>
          </div>
        </SchoolModal>
      )}

      {/* Modal: Upload Banyak PDF Sekaligus */}
      {multiPdfOpen && (
        <SchoolModal title="Upload Banyak PDF Sekaligus (Metadata Otomatis)" busy={busy} onClose={() => setMultiPdfOpen(false)}>
          <div className="space-y-3 text-xs">
            <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-3 text-sky-950">
              <p className="font-extrabold">Format Nama File Otomatis: Paket - Kelas - Mapel - Judul.pdf</p>
              <p className="mt-0.5 text-sky-800">
                Contoh: <span className="font-mono font-bold">Paket C - Kelas 12 - Matematika - Peluang.pdf</span>. Sistem membaca struktur nama file secara otomatis dan menyimpan metadata ringan + tautan PDF.
              </p>
            </div>

            <label className="block font-bold text-slate-700">
              1. Pilih Banyak Berkas PDF Sekaligus
              <input
                type="file"
                accept=".pdf,application/pdf"
                multiple
                onChange={handleMultiPdfSelect}
                className="mt-1 block w-full rounded-xl border border-dashed border-sky-300 bg-white p-3"
              />
            </label>

            <label className="block font-bold text-slate-700">
              2. Base URL Folder Penyimpanan / R2 / CDN (Opsional untuk isi Link PDF otomatis)
              <input
                type="url"
                placeholder="https://cdn.pkbm-anda.id/modul"
                value={pdfBaseFolderUrl}
                onChange={(e) => applyBaseUrlToPdfRows(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5"
              />
            </label>

            <label className="block font-bold text-slate-700">
              Visibilitas
              <select
                value={pdfVisibility}
                onChange={(e) => setPdfVisibility(e.target.value as "PRIVATE" | "PUBLIC")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2 font-semibold"
              >
                <option value="PRIVATE">Privat Sekolah</option>
                <option value="PUBLIC">Publik (Bank Modul Umum)</option>
              </select>
            </label>

            {pdfError && <p role="alert" className="font-semibold text-rose-700">{pdfError}</p>}

            {pdfRows.length > 0 && (
              <div className="max-h-60 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                {pdfRows.map((row, idx) => (
                  <div key={idx} className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-indigo-700">
                        {row.paket} · {row.gradeLevel} · {row.subject}
                      </span>
                      <span className="truncate text-[11px] text-slate-500">{row.sourceName}</span>
                    </div>
                    <input
                      type="text"
                      value={row.title}
                      onChange={(e) => setPdfRows((prev) => prev.map((it, i) => (i === idx ? { ...it, title: e.target.value } : it)))}
                      placeholder="Judul modul"
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-900"
                    />
                    <input
                      type="url"
                      value={row.fileUrl}
                      onChange={(e) => setPdfRows((prev) => prev.map((it, i) => (i === idx ? { ...it, fileUrl: e.target.value } : it)))}
                      placeholder="Tempel tautan Google Drive / HTTPS PDF untuk file ini..."
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-[11px]"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={busy || pdfRows.length === 0}
              onClick={() => void submitBulkImport(pdfRows, pdfVisibility, () => setMultiPdfOpen(false), setPdfError)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              <FileUp size={15} aria-hidden="true" />
              {busy ? "Menyimpan..." : `Simpan ${pdfRows.length} Metadata Modul PDF`}
            </button>
          </div>
        </SchoolModal>
      )}

      {/* Modal: Kirim / Salin Modul ke Kelas */}
      {assignTarget && (
        <SchoolModal title="Salin Modul ke Kelas Belajar" busy={busy} onClose={() => setAssignTarget(null)}>
          <form onSubmit={submitAssignToClass} className="space-y-3 text-sm">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-950">
              <p className="font-extrabold">{assignTarget.title}</p>
              <p className="mt-0.5 text-indigo-700">
                {assignTarget.paket} · {assignTarget.gradeLevel} · {assignTarget.subject}
              </p>
            </div>

            <label className="block font-semibold text-slate-700">
              Pilih Kelas / Rombel Tujuan
              <select
                required
                value={assignClassId}
                onChange={(e) => setAssignClassId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5"
              >
                <option value="">-- Pilih kelas --</option>
                {(data?.classes ?? []).map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </select>
            </label>

            <label className="block font-semibold text-slate-700">
              Mata Pelajaran di Sekolah (opsional — otomatis mencocokkan jika dikosongkan)
              <select
                value={assignMapelId}
                onChange={(e) => setAssignMapelId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5"
              >
                <option value="">Otomatis cocokkan "{assignTarget.subject}"</option>
                {(data?.subjects ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.nama}</option>
                ))}
              </select>
            </label>

            <button
              disabled={busy || !assignClassId}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Menyalin..." : "Kirim & Tampilkan di Kelas"}
            </button>
          </form>
        </SchoolModal>
      )}

      {/* Modal: PDF Viewer Bawaan */}
      {previewItem && (
        <ModulePdfViewerModal
          url={previewItem.url}
          title={previewItem.title}
          subtitle={previewItem.subtitle}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </section>
  );
}

/**
 * Picker Modal embedded inside Classroom ("Ambil dari Bank Modul" shortcut)
 */
export function ClassroomModulePickerModal({
  kelasId,
  kelasNama,
  mapelId,
  sandboxRole,
  onAssigned,
  onClose,
}: {
  kelasId: string;
  kelasNama: string;
  mapelId?: string;
  sandboxRole?: "GURU";
  onAssigned: (message: string) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<ModuleBankPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sourceTab, setSourceTab] = useState<"umum" | "sekolah">("umum");
  const [paketFilter, setPaketFilter] = useState("");
  const [search, setSearch] = useState("");
  const [previewItem, setPreviewItem] = useState<{ url: string; title: string; subtitle?: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const headers = authHeaders(sandboxRole);
    fetchWithTimeout("/api/module-bank", {
      signal: controller.signal,
      ...(headers ? { headers } : {}),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as ModuleBankPayload | null;
        if (!res.ok || !body) throw new Error(body?.error || "Bank Modul belum dapat dimuat.");
        setData(body);
      })
      .catch((failure) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setError(describeFetchError(failure, "Bank Modul belum dapat dimuat."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sandboxRole]);

  const items = useMemo(() => {
    const rawList = sourceTab === "sekolah" ? data?.schoolModules ?? [] : data?.publicModules ?? [];
    const q = search.trim().toLowerCase();
    return rawList.filter((item) => {
      if (sourceTab === "sekolah" && item.visibility === "ARCHIVED") return false;
      if (paketFilter && item.paket !== paketFilter) return false;
      if (!q) return true;
      return `${item.title} ${item.subject} ${item.gradeLevel} ${item.originSchoolName}`
        .toLowerCase()
        .includes(q);
    });
  }, [data, sourceTab, paketFilter, search]);

  async function assign(item: ModuleBankItem) {
    setBusyId(item.id);
    setError("");
    try {
      const headers = authHeaders(sandboxRole, { "Content-Type": "application/json" });
      const res = await fetchWithTimeout(`/api/module-bank/${encodeURIComponent(item.id)}/assign-to-class`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          classId: kelasId,
          ...(mapelId ? { mapelId } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal mengambil modul ke kelas.");
      onAssigned(body?.message || `Modul "${item.title}" berhasil ditambahkan ke ${kelasNama}.`);
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal mengambil modul ke kelas."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <SchoolModal title={`Ambil dari Bank Modul · ${kelasNama}`} busy={Boolean(busyId)} onClose={onClose}>
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSourceTab("umum")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-extrabold ${
                sourceTab === "umum" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              <Globe size={13} aria-hidden="true" />
              Bank Modul Umum ({data?.publicModules.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setSourceTab("sekolah")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-extrabold ${
                sourceTab === "sekolah" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              <Library size={13} aria-hidden="true" />
              Bank Modul Sekolah ({(data?.schoolModules ?? []).filter((m) => m.visibility !== "ARCHIVED").length})
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              aria-label="Filter paket"
              value={paketFilter}
              onChange={(e) => setPaketFilter(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold"
            >
              <option value="">Semua Paket (A, B, C)</option>
              {PAKET_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <input
              type="search"
              placeholder="Cari judul / mata pelajaran..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2"
            />
          </div>

          {error && <p role="alert" className="font-semibold text-rose-700">{error}</p>}

          {loading ? (
            <p className="py-6 text-center font-semibold text-slate-500">Memuat daftar modul...</p>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-slate-600">
              Belum ada modul yang sesuai. Anda bisa menambahkan atau mengisi Katalog Nasional di menu <strong>Bank Modul Belajar</strong>.
            </p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-indigo-700">
                      {item.paket} · {item.gradeLevel} · {item.subject}
                    </p>
                    <p className="text-[11px] text-slate-500">Sumber: {item.originSchoolName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewItem({
                        url: item.fileUrl,
                        title: item.title,
                        subtitle: `${item.paket} · ${item.gradeLevel} · ${item.subject}`,
                      })}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <FileText size={12} aria-hidden="true" />
                      Pratinjau
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void assign(item)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busyId === item.id ? "Menyalin..." : "Gunakan di Kelas"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SchoolModal>

      {previewItem && (
        <ModulePdfViewerModal
          url={previewItem.url}
          title={previewItem.title}
          subtitle={previewItem.subtitle}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </>
  );
}
