import { useCallback, useEffect, useState } from "react";
import {
  CalendarCheck2,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Lock,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { DashboardHero, EmptyState, TableSkeleton } from "./DashboardUI";
import { renderKopSuratHtml } from "./KopSurat";
import type { SchoolProfile } from "./schoolProfile";
import { hasPlanAccess, type PlanSlug } from "./subscriptionPlans";
import { useTenantTheme } from "./TenantThemeProvider";
import { buildSandboxHeaders } from "../utils/safeUrl";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type TutorAttendanceMethod = "TATAP_MUKA" | "DARING" | "TUTORIAL";
type TutorAttendanceStatus = "MENUNGGU" | "DISETUJUI" | "DITOLAK";
type TutorHonorMode = "NONE" | "PER_PERTEMUAN" | "BULANAN" | "KOMBINASI";

type TutorAttendanceRecord = {
  id: string;
  guruId: string;
  guruNama: string;
  tanggal: string;
  jamMasuk: string;
  kelasId: string | null;
  kelasNama: string;
  mapelId: string | null;
  mapelNama: string;
  metode: TutorAttendanceMethod;
  materi: string;
  status: TutorAttendanceStatus;
  catatanAdmin: string | null;
  dibuatOleh: "GURU" | "ADMIN";
  createdAt: string;
};

type TutorHonorRateOverride = {
  tarifPertemuan?: number | null;
  honorBulanan?: number | null;
  transportPertemuan?: number | null;
};

type TutorHonorConfig = {
  mode: TutorHonorMode;
  defaultTarifPertemuan: number;
  defaultHonorBulanan: number;
  defaultTransportPertemuan: number;
  perGuru: Record<string, TutorHonorRateOverride>;
};

type RekapPerGuruRow = {
  guruId: string;
  guruNama: string;
  nuptk: string | null;
  totalInput: number;
  disetujui: number;
  menunggu: number;
  ditolak: number;
  tarifPertemuan: number;
  honorBulanan: number;
  transportPertemuan: number;
  totalHonor: number;
};

type AdminTutorAttendancePayload = {
  bulan: string;
  isPro: boolean;
  kopSurat: SchoolProfile;
  gurus: Array<{ id: string; nama: string; nuptk: string | null }>;
  kelasList: Array<{ id: string; nama: string }>;
  mapelList: Array<{ id: string; nama: string }>;
  records: TutorAttendanceRecord[];
  rekapPerGuru: RekapPerGuruRow[];
  honorConfig: TutorHonorConfig;
};

type TeacherTutorAttendancePayload = {
  bulan: string;
  kelasList: Array<{ id: string; nama: string }>;
  mapelList: Array<{ id: string; nama: string }>;
  records: TutorAttendanceRecord[];
  summary: { totalInput: number; disetujui: number; menunggu: number; ditolak: number };
};

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayDateValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  if (!y || !m) return monthStr;
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

function methodLabel(m: TutorAttendanceMethod): string {
  if (m === "DARING") return "Daring";
  if (m === "TUTORIAL") return "Tutorial";
  return "Tatap Muka";
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
}

export function SchoolTutorAttendanceView({
  plan = "basic",
  onRequireUpgrade,
}: {
  plan?: PlanSlug;
  onRequireUpgrade?: (featureName: string, requiredPlan: Exclude<PlanSlug, "basic">) => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const isProPlan = hasPlanAccess(plan, "pro");
  const [activeTab, setActiveTab] = useState<"daftar" | "rekap" | "honor">("daftar");
  const [bulan, setBulan] = useState(currentMonthValue);
  const [guruFilter, setGuruFilter] = useState("");
  const [data, setData] = useState<AdminTutorAttendancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Form tambah absen manual oleh Admin
  const [showAddForm, setShowAddForm] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addForm, setAddForm] = useState({
    guruId: "",
    tanggal: todayDateValue(),
    kelasId: "",
    mapelId: "",
    metode: "TATAP_MUKA" as TutorAttendanceMethod,
    materi: "",
  });

  // Form Skema Honor (Pro)
  const [honorDraft, setHonorDraft] = useState<TutorHonorConfig>({
    mode: "NONE",
    defaultTarifPertemuan: 50000,
    defaultHonorBulanan: 500000,
    defaultTransportPertemuan: 25000,
    perGuru: {},
  });
  const [honorBusy, setHonorBusy] = useState(false);
  const [honorLocked, setHonorLocked] = useState(false);
  const [hasSavedHonor, setHasSavedHonor] = useState(false);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ bulan });
      if (guruFilter) qs.set("guruId", guruFilter);
      const res = await fetchWithTimeout(`/api/sekolah/absen-tutor?${qs.toString()}`, { signal });
      const body = (await res.json().catch(() => null)) as (AdminTutorAttendancePayload & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error || "Data absensi tutor belum dapat dimuat.");
      setData(body);
      setHonorDraft(body.honorConfig);
      const alreadyConfigured =
        body.honorConfig.mode !== "NONE" || Object.keys(body.honorConfig.perGuru ?? {}).length > 0;
      setHasSavedHonor(alreadyConfigured);
      setHonorLocked(alreadyConfigured);
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Data absensi tutor belum dapat dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [bulan, guruFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  async function handleAddManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/absen-tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Absen tutor gagal dicatat.");
      setNotice(body?.message || "Absen tutor berhasil dicatat.");
      setAddForm((prev) => ({ ...prev, materi: "" }));
      setShowAddForm(false);
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Absen tutor gagal dicatat."));
    } finally {
      setAddBusy(false);
    }
  }

  async function updateStatus(record: TutorAttendanceRecord, status: TutorAttendanceStatus) {
    setBusyId(record.id);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/absen-tutor/${encodeURIComponent(record.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulan: record.tanggal.slice(0, 7), status }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Status kehadiran gagal diperbarui.");
      setNotice(body?.message || "Status kehadiran diperbarui.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Status kehadiran gagal diperbarui."));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRecord(record: TutorAttendanceRecord) {
    setBusyId(record.id);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(
        `/api/sekolah/absen-tutor/${encodeURIComponent(record.id)}?bulan=${encodeURIComponent(record.tanggal.slice(0, 7))}`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Catatan absen gagal dihapus.");
      setNotice(body?.message || "Catatan kehadiran dihapus.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Catatan absen gagal dihapus."));
    } finally {
      setBusyId(null);
    }
  }

  async function saveHonorConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isProPlan) {
      onRequireUpgrade?.("Pengaturan & Rekap Honor Tutor", "pro");
      return;
    }
    setHonorBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/absen-tutor/honor-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(honorDraft),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Skema honor gagal disimpan.");
      setNotice(body?.message || "Skema honor tutor berhasil disimpan.");
      setHasSavedHonor(true);
      await loadData();
      setHonorLocked(true);
    } catch (failure) {
      setError(describeFetchError(failure, "Skema honor gagal disimpan."));
    } finally {
      setHonorBusy(false);
    }
  }

  function cancelHonorEdit() {
    if (data) {
      setHonorDraft(data.honorConfig);
    }
    setHonorLocked(true);
  }

  async function handleExportExcel() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const showHonor = data.isPro && data.honorConfig.mode !== "NONE";
    const rekapRows = data.rekapPerGuru.map((r, i) => ({
      No: i + 1,
      "Nama Tutor": r.guruNama,
      NUPTK: r.nuptk ?? "-",
      "Total Input": r.totalInput,
      "Pertemuan Disetujui": r.disetujui,
      Menunggu: r.menunggu,
      Ditolak: r.ditolak,
      ...(showHonor ? { "Estimasi Honor (Rp)": r.totalHonor } : {}),
    }));
    const detailRows = data.records.map((r, i) => ({
      No: i + 1,
      Tanggal: r.tanggal,
      "Jam Hadir": r.jamMasuk,
      "Nama Tutor": r.guruNama,
      Kelas: r.kelasNama,
      "Mata Pelajaran": r.mapelNama,
      Metode: methodLabel(r.metode),
      Materi: r.materi,
      Status: r.status,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rekapRows), "Rekap Bulanan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Detail Kehadiran");
    XLSX.writeFile(wb, `rekap-absen-tutor-${data.bulan}.xlsx`);
  }

  function handlePrintRekap() {
    if (!data) return;
    const showHonor = data.isPro && data.honorConfig.mode !== "NONE";
    const totalHonorAll = data.rekapPerGuru.reduce((acc, r) => acc + r.totalHonor, 0);
    const title = showHonor ? "REKAP KEHADIRAN & HONOR TUTOR" : "REKAP DAFTAR HADIR TUTOR";
    const rowsHtml = data.rekapPerGuru
      .map(
        (r, i) => `<tr>
          <td style="border:1px solid #0f172a;padding:6px;text-align:center;">${i + 1}</td>
          <td style="border:1px solid #0f172a;padding:6px;font-weight:700;">${escapeHtml(r.guruNama)}</td>
          <td style="border:1px solid #0f172a;padding:6px;text-align:center;">${escapeHtml(r.nuptk ?? "-")}</td>
          <td style="border:1px solid #0f172a;padding:6px;text-align:center;font-weight:700;">${r.disetujui}</td>
          <td style="border:1px solid #0f172a;padding:6px;text-align:center;">${r.menunggu}</td>
          ${showHonor ? `<td style="border:1px solid #0f172a;padding:6px;text-align:right;font-weight:700;">${escapeHtml(formatRupiah(r.totalHonor))}</td>` : ""}
          <td style="border:1px solid #0f172a;padding:6px;width:90px;"></td>
        </tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${title} - ${escapeHtml(formatMonthLabel(data.bulan))}</title>
      <style>body{font-family:Arial,sans-serif;color:#0f172a;margin:24px;}@media print{body{margin:12mm;}}</style>
      </head><body>
      ${renderKopSuratHtml(data.kopSurat)}
      <h2 style="text-align:center;margin:14px 0 4px;font-size:16px;">${title}</h2>
      <p style="text-align:center;margin:0 0 16px;font-size:12px;">Periode: ${escapeHtml(formatMonthLabel(data.bulan))}</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="border:1px solid #0f172a;padding:7px;width:36px;">No</th>
            <th style="border:1px solid #0f172a;padding:7px;text-align:left;">Nama Tutor</th>
            <th style="border:1px solid #0f172a;padding:7px;">NUPTK</th>
            <th style="border:1px solid #0f172a;padding:7px;">Pertemuan Disetujui</th>
            <th style="border:1px solid #0f172a;padding:7px;">Menunggu</th>
            ${showHonor ? `<th style="border:1px solid #0f172a;padding:7px;text-align:right;">Total Honor</th>` : ""}
            <th style="border:1px solid #0f172a;padding:7px;">Tanda Tangan</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          ${showHonor ? `<tr><td colspan="5" style="border:1px solid #0f172a;padding:7px;text-align:right;font-weight:800;">TOTAL KESELURUHAN</td><td style="border:1px solid #0f172a;padding:7px;text-align:right;font-weight:800;">${escapeHtml(formatRupiah(totalHonorAll))}</td><td style="border:1px solid #0f172a;padding:7px;"></td></tr>` : ""}
        </tbody>
      </table>
      <div style="margin-top:32px;display:flex;justify-content:flex-end;">
        <div style="text-align:center;font-size:12px;width:240px;">
          <p style="margin:0;">${escapeHtml(data.kopSurat.kabupatenKota || "Kepala / Ketua PKBM")}, ${escapeHtml(new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date()))}</p>
          <p style="margin:4px 0 56px;font-weight:700;">Ketua / Kepala Lembaga</p>
          <p style="margin:0;font-weight:700;text-decoration:underline;">${escapeHtml(data.kopSurat.namaKetuaPkbm || "........................................")}</p>
        </div>
      </div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const win = window.open("", "_blank", "width=960,height=720");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  const panelClass = isDark
    ? "rounded-2xl border border-slate-700/60 bg-slate-900/75 p-5 text-slate-100"
    : "rounded-2xl border border-white bg-white p-5 text-slate-900";
  const inputClass = isDark
    ? "mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
    : "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900";

  const showHonorCols = Boolean(data?.isPro && data.honorConfig.mode !== "NONE");

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="KEHADIRAN PENGAJAR"
        title="Absensi Tutor & Rekap Pertemuan"
        description="Catat dan verifikasi kehadiran mengajar tutor setiap bulan (tersedia di semua paket). Pengaturan skema & kalkulasi honor otomatis tersedia khusus pada Paket Pro."
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowAddForm((v) => !v)} className="dashboard-hero-action">
              <Plus size={15} aria-hidden="true" />
              Catat Absen Manual
            </button>
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              disabled={!data}
              className="dashboard-hero-action dashboard-hero-secondary disabled:opacity-50"
            >
              <FileSpreadsheet size={15} aria-hidden="true" />
              Export Excel
            </button>
            <button
              type="button"
              onClick={handlePrintRekap}
              disabled={!data}
              className="dashboard-hero-action dashboard-hero-secondary disabled:opacity-50"
            >
              <Printer size={15} aria-hidden="true" />
              Cetak Rekap PDF
            </button>
          </div>
        }
      />

      {error && (
        <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {notice}
        </p>
      )}

      {/* Filter Bulan, Tutor & Navigasi Tab */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "daftar", label: "Daftar Hadir Tutor", icon: CalendarCheck2, pro: false },
              { id: "rekap", label: "Rekap Bulanan", icon: Clock, pro: false },
              { id: "honor", label: "Skema Honor Tutor", icon: Wallet, pro: true },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
                  activeTab === t.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : isDark
                      ? "border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon size={14} aria-hidden="true" />
                {t.label}
                {t.pro && (
                  <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-slate-950">PRO</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            aria-label="Pilih bulan rekap"
            value={bulan}
            onChange={(e) => setBulan(e.target.value)}
            className={`rounded-xl border px-3 py-2 text-xs font-bold ${isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-900"}`}
          />
          {activeTab === "daftar" && data && (
            <select
              aria-label="Filter tutor"
              value={guruFilter}
              onChange={(e) => setGuruFilter(e.target.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold ${isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-900"}`}
            >
              <option value="">Semua Tutor ({data.gurus.length})</option>
              {data.gurus.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nama}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => void loadData()}
            className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold ${isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            <RefreshCw size={13} /> Segarkan
          </button>
        </div>
      </div>

      {/* Form Catat Absen Manual */}
      {showAddForm && data && (
        <form onSubmit={handleAddManual} className={panelClass}>
          <h3 className="text-sm font-extrabold">Catat Kehadiran Tutor Manual (Langsung Disetujui)</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs font-bold">
              Tutor *
              <select
                required
                value={addForm.guruId}
                onChange={(e) => setAddForm({ ...addForm, guruId: e.target.value })}
                className={inputClass}
              >
                <option value="">-- Pilih Tutor --</option>
                {data.gurus.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nama}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold">
              Tanggal *
              <input
                type="date"
                required
                value={addForm.tanggal}
                onChange={(e) => setAddForm({ ...addForm, tanggal: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-xs font-bold">
              Metode Pertemuan
              <select
                value={addForm.metode}
                onChange={(e) => setAddForm({ ...addForm, metode: e.target.value as TutorAttendanceMethod })}
                className={inputClass}
              >
                <option value="TATAP_MUKA">Tatap Muka</option>
                <option value="DARING">Daring / Online</option>
                <option value="TUTORIAL">Tutorial / Mandiri</option>
              </select>
            </label>
            <label className="block text-xs font-bold">
              Kelas (Opsional)
              <select
                value={addForm.kelasId}
                onChange={(e) => setAddForm({ ...addForm, kelasId: e.target.value })}
                className={inputClass}
              >
                <option value="">Umum / Lintas Kelas</option>
                {data.kelasList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold">
              Mata Pelajaran (Opsional)
              <select
                value={addForm.mapelId}
                onChange={(e) => setAddForm({ ...addForm, mapelId: e.target.value })}
                className={inputClass}
              >
                <option value="">Pembelajaran Kesetaraan</option>
                {data.mapelList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nama}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold">
              Materi / Catatan Pertemuan *
              <input
                type="text"
                required
                maxLength={300}
                value={addForm.materi}
                onChange={(e) => setAddForm({ ...addForm, materi: e.target.value })}
                placeholder="Contoh: Pembahasan Modul 3 Bahasa Indonesia"
                className={inputClass}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
            >
              Batal
            </button>
            <button type="submit" disabled={addBusy} className="master-primary px-4 py-2 text-xs disabled:opacity-50">
              {addBusy ? "Menyimpan..." : "Simpan Kehadiran"}
            </button>
          </div>
        </form>
      )}

      {loading && !data ? (
        <TableSkeleton rows={5} columns={6} />
      ) : activeTab === "daftar" ? (
        <div className={panelClass}>
          {!data || data.records.length === 0 ? (
            <EmptyState
              title={`Belum ada absen tutor pada ${formatMonthLabel(bulan)}`}
              description="Tutor dapat mengisi Absen Mengajar dari Portal Guru, atau Admin dapat klik 'Catat Absen Manual' di atas."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[740px] text-left text-xs sm:text-sm">
                <thead className="border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Tanggal &amp; Jam</th>
                    <th className="px-3 py-2.5">Tutor</th>
                    <th className="px-3 py-2.5">Kelas &amp; Mapel</th>
                    <th className="px-3 py-2.5">Materi / Metode</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Verifikasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {data.records.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-3 font-mono text-xs">
                        <p className="font-bold">{r.tanggal}</p>
                        <p className="text-[11px] opacity-70">{r.jamMasuk} WIB</p>
                      </td>
                      <td className="px-3 py-3 font-bold">{r.guruNama}</td>
                      <td className="px-3 py-3 text-xs">
                        <p className="font-semibold">{r.kelasNama}</p>
                        <p className="opacity-75">{r.mapelNama}</p>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span className="inline-flex rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                          {methodLabel(r.metode)}
                        </span>
                        <p className="mt-1 max-w-xs break-words">{r.materi}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            r.status === "DISETUJUI"
                              ? "bg-emerald-50 text-emerald-700"
                              : r.status === "DITOLAK"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {r.status === "DISETUJUI" ? "Disetujui" : r.status === "DITOLAK" ? "Ditolak" : "Menunggu"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {r.status !== "DISETUJUI" && (
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => void updateStatus(r, "DISETUJUI")}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <CheckCircle2 size={12} /> Setujui
                            </button>
                          )}
                          {r.status !== "DITOLAK" && (
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => void updateStatus(r, "DITOLAK")}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              <XCircle size={12} /> Tolak
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void deleteRecord(r)}
                            title="Hapus catatan"
                            className="rounded-lg border border-slate-200 p-1 text-slate-500 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === "rekap" ? (
        <div className={panelClass}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold">
                Rekap Kehadiran {showHonorCols ? "& Estimasi Honor " : ""}Tutor — {formatMonthLabel(bulan)}
              </h3>
              <p className="text-xs opacity-75">
                {showHonorCols
                  ? `Skema Honor Pro aktif: ${data?.honorConfig.mode.replace("_", " ")}`
                  : "Menampilkan rekap jumlah pertemuan per tutor (tanpa nominal rupiah)."}
              </p>
            </div>
            {!isProPlan && (
              <button
                type="button"
                onClick={() => onRequireUpgrade?.("Rekap & Skema Honor Tutor", "pro")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-900 hover:bg-amber-100"
              >
                <Lock size={12} /> Aktifkan Hitung Honor (Paket Pro)
              </button>
            )}
          </div>
          {!data || data.rekapPerGuru.length === 0 ? (
            <EmptyState title="Belum ada data tutor aktif" description="Tambahkan data guru/tutor terlebih dahulu di menu Data Guru." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
                <thead className="border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Nama Tutor</th>
                    <th className="px-3 py-2.5 text-center">Disetujui</th>
                    <th className="px-3 py-2.5 text-center">Menunggu</th>
                    <th className="px-3 py-2.5 text-center">Ditolak</th>
                    {showHonorCols && <th className="px-3 py-2.5 text-right">Estimasi Honor</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {data.rekapPerGuru.map((r) => (
                    <tr key={r.guruId}>
                      <td className="px-3 py-3">
                        <p className="font-bold">{r.guruNama}</p>
                        <p className="font-mono text-[11px] opacity-70">{r.nuptk || "Tanpa NUPTK"}</p>
                      </td>
                      <td className="px-3 py-3 text-center font-black tabular-nums text-emerald-600">{r.disetujui}</td>
                      <td className="px-3 py-3 text-center font-bold tabular-nums text-amber-600">{r.menunggu}</td>
                      <td className="px-3 py-3 text-center font-bold tabular-nums text-rose-600">{r.ditolak}</td>
                      {showHonorCols && (
                        <td className="px-3 py-3 text-right font-extrabold tabular-nums text-indigo-700">
                          {formatRupiah(r.totalHonor)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !isProPlan ? (
        <div className={panelClass}>
          <div className="mx-auto max-w-xl py-6 text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Lock size={22} />
            </span>
            <h3 className="mt-3 text-base font-extrabold">Skema &amp; Kalkulasi Honor Tutor Khusus Paket Pro</h3>
            <p className="mt-1.5 text-xs leading-relaxed opacity-80">
              Presensi kehadiran tutor tetap gratis di semua paket. Upgrade ke <strong>Paket Pro</strong> untuk mengaktifkan 4 mode honor fleksibel (<strong>Hanya Kehadiran</strong>, <strong>Per Pertemuan</strong>, <strong>Bulanan Tetap</strong>, dan <strong>Kombinasi Pokok + Transport/Pertemuan</strong>) lengkap dengan cetak rekap honor ber-Kop Surat.
            </p>
            <button
              type="button"
              onClick={() => onRequireUpgrade?.("Pengaturan & Rekap Honor Tutor", "pro")}
              className="master-primary mt-4 px-5 py-2.5 text-xs"
            >
              Upgrade ke Paket Pro
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={saveHonorConfig} className={`${panelClass} space-y-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-extrabold">Pengaturan Skema Honor Tutor (Paket Pro)</h3>
                {honorLocked ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-[11px] font-extrabold text-slate-600">
                    <Lock size={11} /> Tersimpan · Terkunci
                  </span>
                ) : hasSavedHonor ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-800">
                    <Pencil size={11} /> Mode Edit
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs opacity-75">
                Pilih skema yang sesuai kebijakan lembaga Anda. Nominal honor hanya terlihat oleh Admin Sekolah dan tidak ditampilkan di Portal Guru.
              </p>
            </div>
            {honorLocked && (
              <button
                type="button"
                onClick={() => setHonorLocked(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-xs font-extrabold text-indigo-900 hover:bg-indigo-100"
              >
                <Pencil size={13} /> Edit Skema Honor
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                { id: "NONE", title: "Hanya Kehadiran", desc: "Tanpa perhitungan rupiah di rekap." },
                { id: "PER_PERTEMUAN", title: "Per Pertemuan", desc: "Pertemuan disetujui × tarif pertemuan." },
                { id: "BULANAN", title: "Bulanan Tetap", desc: "Honor pokok tetap setiap bulan." },
                { id: "KOMBINASI", title: "Kombinasi", desc: "Honor pokok + transport per pertemuan." },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={honorLocked}
                onClick={() => setHonorDraft({ ...honorDraft, mode: opt.id })}
                className={`rounded-xl border p-3.5 text-left transition ${
                  honorLocked
                    ? honorDraft.mode === opt.id
                      ? "cursor-not-allowed border-slate-400 bg-slate-200/80 text-slate-700"
                      : "cursor-not-allowed border-slate-200 bg-slate-100/70 text-slate-400 opacity-75"
                    : honorDraft.mode === opt.id
                      ? "border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/25 text-slate-900"
                      : isDark
                        ? "border-slate-700 bg-slate-950/50 text-slate-200"
                        : "border-slate-200 bg-slate-50/70 text-slate-800 hover:bg-white"
                }`}
              >
                <p className="text-xs font-extrabold">{opt.title}</p>
                <p className="mt-1 text-[11px] opacity-75">{opt.desc}</p>
              </button>
            ))}
          </div>

          {honorDraft.mode !== "NONE" && (
            <div className="grid gap-4 sm:grid-cols-3">
              {honorDraft.mode === "PER_PERTEMUAN" && (
                <label className="block text-xs font-bold">
                  Tarif Default per Pertemuan (Rp)
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    disabled={honorLocked}
                    value={honorDraft.defaultTarifPertemuan}
                    onChange={(e) => setHonorDraft({ ...honorDraft, defaultTarifPertemuan: Number(e.target.value) || 0 })}
                    className={
                      honorLocked
                        ? "mt-1 w-full cursor-not-allowed rounded-xl border border-slate-300 bg-slate-200 px-3 py-2 text-xs text-slate-600"
                        : inputClass
                    }
                  />
                </label>
              )}
              {(honorDraft.mode === "BULANAN" || honorDraft.mode === "KOMBINASI") && (
                <label className="block text-xs font-bold">
                  Honor Pokok Bulanan Default (Rp)
                  <input
                    type="number"
                    min={0}
                    step={25000}
                    disabled={honorLocked}
                    value={honorDraft.defaultHonorBulanan}
                    onChange={(e) => setHonorDraft({ ...honorDraft, defaultHonorBulanan: Number(e.target.value) || 0 })}
                    className={
                      honorLocked
                        ? "mt-1 w-full cursor-not-allowed rounded-xl border border-slate-300 bg-slate-200 px-3 py-2 text-xs text-slate-600"
                        : inputClass
                    }
                  />
                </label>
              )}
              {honorDraft.mode === "KOMBINASI" && (
                <label className="block text-xs font-bold">
                  Transport per Pertemuan Default (Rp)
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    disabled={honorLocked}
                    value={honorDraft.defaultTransportPertemuan}
                    onChange={(e) => setHonorDraft({ ...honorDraft, defaultTransportPertemuan: Number(e.target.value) || 0 })}
                    className={
                      honorLocked
                        ? "mt-1 w-full cursor-not-allowed rounded-xl border border-slate-300 bg-slate-200 px-3 py-2 text-xs text-slate-600"
                        : inputClass
                    }
                  />
                </label>
              )}
            </div>
          )}

          {honorDraft.mode !== "NONE" && data && data.gurus.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-extrabold">Tarif Khusus per Tutor (Opsional — Kosongkan untuk Pakai Default)</p>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-extrabold uppercase text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Nama Tutor</th>
                      {honorDraft.mode === "PER_PERTEMUAN" && <th className="px-3 py-2">Tarif / Pertemuan (Rp)</th>}
                      {(honorDraft.mode === "BULANAN" || honorDraft.mode === "KOMBINASI") && (
                        <th className="px-3 py-2">Honor Pokok (Rp)</th>
                      )}
                      {honorDraft.mode === "KOMBINASI" && <th className="px-3 py-2">Transport / Pertemuan (Rp)</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70">
                    {data.gurus.map((g) => {
                      const ov = honorDraft.perGuru[g.id] ?? {};
                      const updateOverride = (field: keyof TutorHonorRateOverride, raw: string) => {
                        const nextPerGuru = { ...honorDraft.perGuru };
                        const current = { ...(nextPerGuru[g.id] ?? {}) };
                        if (raw.trim() === "") delete current[field];
                        else current[field] = Math.max(0, Number(raw) || 0);
                        nextPerGuru[g.id] = current;
                        setHonorDraft({ ...honorDraft, perGuru: nextPerGuru });
                      };
                      const ovInputCls = honorLocked
                        ? "w-40 cursor-not-allowed rounded-lg border border-slate-300 bg-slate-200 px-2.5 py-1.5 text-xs text-slate-600"
                        : "w-40 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900";
                      return (
                        <tr key={g.id}>
                          <td className="px-3 py-2 font-bold">{g.nama}</td>
                          {honorDraft.mode === "PER_PERTEMUAN" && (
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                disabled={honorLocked}
                                placeholder={String(honorDraft.defaultTarifPertemuan)}
                                value={ov.tarifPertemuan ?? ""}
                                onChange={(e) => updateOverride("tarifPertemuan", e.target.value)}
                                className={ovInputCls}
                              />
                            </td>
                          )}
                          {(honorDraft.mode === "BULANAN" || honorDraft.mode === "KOMBINASI") && (
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                disabled={honorLocked}
                                placeholder={String(honorDraft.defaultHonorBulanan)}
                                value={ov.honorBulanan ?? ""}
                                onChange={(e) => updateOverride("honorBulanan", e.target.value)}
                                className={ovInputCls}
                              />
                            </td>
                          )}
                          {honorDraft.mode === "KOMBINASI" && (
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                disabled={honorLocked}
                                placeholder={String(honorDraft.defaultTransportPertemuan)}
                                value={ov.transportPertemuan ?? ""}
                                onChange={(e) => updateOverride("transportPertemuan", e.target.value)}
                                className={ovInputCls}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {honorLocked ? (
              <button
                type="button"
                onClick={() => setHonorLocked(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-5 py-2.5 text-xs font-extrabold text-indigo-900 hover:bg-indigo-100"
              >
                <Pencil size={14} /> Edit Skema Honor
              </button>
            ) : (
              <>
                {hasSavedHonor && (
                  <button
                    type="button"
                    disabled={honorBusy}
                    onClick={cancelHonorEdit}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Batal
                  </button>
                )}
                <button type="submit" disabled={honorBusy} className="master-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-xs disabled:opacity-50">
                  <Save size={14} /> {honorBusy ? "Menyimpan..." : "Simpan Skema Honor"}
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

export function TeacherTutorAttendanceSection({ sandboxRole }: { sandboxRole?: "GURU" }) {
  const isDark = useTenantTheme() === "dark";
  const [bulan, setBulan] = useState(currentMonthValue);
  const [data, setData] = useState<TeacherTutorAttendancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    tanggal: todayDateValue(),
    kelasId: "",
    mapelId: "",
    metode: "TATAP_MUKA" as TutorAttendanceMethod,
    materi: "",
  });

  const loadOwn = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const headers = buildSandboxHeaders(sandboxRole);
      const res = await fetchWithTimeout(`/api/lms/guru/absen-tutor?bulan=${encodeURIComponent(bulan)}`, {
        signal,
        ...(headers ? { headers } : {}),
      });
      const body = (await res.json().catch(() => null)) as (TeacherTutorAttendancePayload & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error || "Riwayat absen mengajar belum dapat dimuat.");
      setData(body);
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Riwayat absen mengajar belum dapat dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [bulan, sandboxRole]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOwn(controller.signal);
    return () => controller.abort();
  }, [loadOwn]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const headers = buildSandboxHeaders(sandboxRole, { "Content-Type": "application/json" });
      const res = await fetchWithTimeout("/api/lms/guru/absen-tutor", {
        method: "POST",
        headers,
        body: JSON.stringify(form),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Absen mengajar gagal dikirim.");
      setNotice(body?.message || "Absen mengajar berhasil dicatat.");
      setForm((prev) => ({ ...prev, materi: "" }));
      await loadOwn();
    } catch (failure) {
      setError(describeFetchError(failure, "Absen mengajar gagal dikirim."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(record: TutorAttendanceRecord) {
    setError("");
    setNotice("");
    try {
      const headers = buildSandboxHeaders(sandboxRole);
      const res = await fetchWithTimeout(
        `/api/lms/guru/absen-tutor/${encodeURIComponent(record.id)}?bulan=${encodeURIComponent(record.tanggal.slice(0, 7))}`,
        { method: "DELETE", ...(headers ? { headers } : {}) },
      );
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Catatan absen gagal dihapus.");
      setNotice(body?.message || "Catatan absen dihapus.");
      await loadOwn();
    } catch (failure) {
      setError(describeFetchError(failure, "Catatan absen gagal dihapus."));
    }
  }

  const cardClass = isDark
    ? "rounded-2xl border border-slate-700/70 bg-slate-900/75 p-5 text-slate-100"
    : "rounded-2xl border border-white/85 bg-white/95 p-5 text-slate-900 shadow-xs";
  const inputClass = isDark
    ? "mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
    : "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900";

  return (
    <section className="dashboard-glass space-y-5 rounded-2xl p-5 sm:p-6">
      <DashboardHero
        eyebrow="KEHADIRAN TUTOR"
        title="Absen Mengajar Tutor"
        description="Catat kehadiran mengajar setiap pertemuan agar terekap rapi untuk administrasi PKBM."
        badge={data ? `${data.summary.disetujui} disetujui bulan ini` : undefined}
      />

      {error && (
        <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900">
          {notice}
        </p>
      )}

      <form onSubmit={handleSubmit} className={cardClass}>
        <h3 className="text-sm font-extrabold">Isi Absen Pertemuan Mengajar</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-bold">
            Tanggal *
            <input
              type="date"
              required
              value={form.tanggal}
              onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block text-xs font-bold">
            Kelas
            <select
              value={form.kelasId}
              onChange={(e) => setForm({ ...form, kelasId: e.target.value })}
              className={inputClass}
            >
              <option value="">Umum / Lintas Kelas</option>
              {data?.kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold">
            Mata Pelajaran
            <select
              value={form.mapelId}
              onChange={(e) => setForm({ ...form, mapelId: e.target.value })}
              className={inputClass}
            >
              <option value="">Pembelajaran Kesetaraan</option>
              {data?.mapelList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nama}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold">
            Metode
            <select
              value={form.metode}
              onChange={(e) => setForm({ ...form, metode: e.target.value as TutorAttendanceMethod })}
              className={inputClass}
            >
              <option value="TATAP_MUKA">Tatap Muka</option>
              <option value="DARING">Daring / Online</option>
              <option value="TUTORIAL">Tutorial / Mandiri</option>
            </select>
          </label>
          <label className="block text-xs font-bold sm:col-span-2 lg:col-span-4">
            Ringkasan Materi / Kegiatan Pertemuan *
            <input
              type="text"
              required
              maxLength={300}
              value={form.materi}
              onChange={(e) => setForm({ ...form, materi: e.target.value })}
              placeholder="Contoh: Diskusi Modul 2 Matematika & latihan soal"
              className={inputClass}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={busy} className="master-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-xs disabled:opacity-50">
            <CalendarCheck2 size={14} /> {busy ? "Mengirim..." : "Catat Absen Mengajar"}
          </button>
        </div>
      </form>

      <div className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold">Riwayat Absen Mengajar Saya — {formatMonthLabel(bulan)}</h3>
            {data && (
              <p className="mt-0.5 text-xs opacity-75">
                Total: <strong>{data.summary.totalInput}</strong> · Disetujui:{" "}
                <strong className="text-emerald-600">{data.summary.disetujui}</strong> · Menunggu:{" "}
                <strong className="text-amber-600">{data.summary.menunggu}</strong>
              </p>
            )}
          </div>
          <input
            type="month"
            aria-label="Filter bulan riwayat absen"
            value={bulan}
            onChange={(e) => setBulan(e.target.value)}
            className={`rounded-xl border px-3 py-2 text-xs font-bold ${isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-900"}`}
          />
        </div>

        {loading && !data ? (
          <TableSkeleton rows={4} columns={5} />
        ) : !data || data.records.length === 0 ? (
          <EmptyState
            title="Belum ada catatan absen pada bulan ini"
            description="Isi form di atas setiap kali Anda melaksanakan pertemuan tatap muka, daring, atau tutorial."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Tanggal</th>
                  <th className="px-3 py-2.5">Kelas &amp; Mapel</th>
                  <th className="px-3 py-2.5">Materi</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {data.records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-3 font-mono text-xs">
                      <p className="font-bold">{r.tanggal}</p>
                      <p className="text-[11px] opacity-70">{r.jamMasuk} WIB</p>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p className="font-semibold">{r.kelasNama}</p>
                      <p className="opacity-75">{r.mapelNama}</p>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <span className="inline-flex rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                        {methodLabel(r.metode)}
                      </span>
                      <p className="mt-1 max-w-xs break-words">{r.materi}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          r.status === "DISETUJUI"
                            ? "bg-emerald-50 text-emerald-700"
                            : r.status === "DITOLAK"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {r.status === "DISETUJUI" ? "Disetujui" : r.status === "DITOLAK" ? "Ditolak" : "Menunggu"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {r.status === "MENUNGGU" && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 size={12} /> Hapus
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
