import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, FileSpreadsheet, KeyRound, MessageCircle, Plus, Search, Users } from "lucide-react";
import {
  buildStudentReminderMessage,
  buildStudentReminderWaUrl,
  formatLoginTimestamp,
  type StudentLoginStatus,
} from "../utils/studentLoginStatus";
import { StudentImport } from "./StudentImport";
import type { StudentImportResult } from "./StudentImport";
import { ReviewPPDB, SchoolPersonEditor, TeacherForm } from "./SchoolForms";
import { StudentEditor } from "./StudentEditor";
import { SchoolClasses } from "./SchoolClasses";
import { SchoolAcademics } from "./SchoolAcademics";
import { useGlassConfirm } from "./GlassConfirm";
import { SchoolModal } from "./SchoolModal";
import { CardGridSkeleton, DashboardHero, EmptyState, TableSkeleton } from "./DashboardUI";
import { BulkPlacementAction } from "./BulkPlacementAction";
import type { PlacementClass, PlacementNotice } from "./BulkPlacementAction";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { hasPlanAccess, type PlanSlug } from "./subscriptionPlans";
import { Lock } from "lucide-react";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { useTenantTheme } from "./TenantThemeProvider";

type Row = { id: string; nama: string; keterangan: string; status: string; kelasId?: string | null; punyaAkun?: boolean; username?: string; email?: string; telepon?: string; alamat?: string; jenjang?: string; catatan?: string | null; statusLogin?: StudentLoginStatus; lastLoginAt?: string | null };
type SelectedStudent = { id: string; nama: string; nisn: string; kelasId: string | null };
type Result = { rows: Row[]; page: number; pageSize?: number; hasNext: boolean; total?: number; loginStats?: { aktif: number; pernah: number; belum: number } };
export type SchoolDataKind = "siswa" | "guru" | "ppdb" | "kelas" | "mapel" | "akademik";
type Kind = SchoolDataKind;
const labels: Record<Kind, string> = { siswa: "Data Siswa", guru: "Data Guru", kelas: "Manajemen Kelas", mapel: "Kelola Mapel", akademik: "Tahun & Jadwal", ppdb: "PPDB Online" };

function isResult(data: unknown): data is Result {
  if (typeof data !== "object" || data === null || !("rows" in data) || !Array.isArray(data.rows) || !("page" in data) || typeof data.page !== "number" || !("hasNext" in data) || typeof data.hasNext !== "boolean") return false;
  if ("total" in data && data.total !== undefined && (typeof data.total !== "number" || !Number.isInteger(data.total) || data.total < 0)) return false;
  return data.rows.every((row: unknown) => typeof row === "object" && row !== null && "id" in row && typeof row.id === "string" && "nama" in row && typeof row.nama === "string" && "keterangan" in row && typeof row.keterangan === "string" && "status" in row && typeof row.status === "string");
}

export function SchoolData({
  slug,
  kind,
  visible,
  plan = "basic",
  onRequireUpgrade,
}: {
  slug: string;
  kind: Kind;
  visible: boolean;
  plan?: PlanSlug;
  onRequireUpgrade?: (featureName: string, requiredPlan: Exclude<PlanSlug, "basic">) => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const canUseReguler = hasPlanAccess(plan, "reguler");
  const confirm = useGlassConfirm();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const term = kind === "guru" || kind === "siswa" ? search.trim() : "";
  const [classFilter, setClassFilter] = useState<"semua" | "belum" | "sudah">("semua");
  const [loginFilter, setLoginFilter] = useState<"semua" | "aktif" | "pernah" | "belum">("semua");
  const [classes, setClasses] = useState<PlacementClass[]>(() => {
    const cached = getCached<{ kelas: PlacementClass[] }>("/api/sekolah/kelas");
    return cached?.kelas ?? [];
  });
  const [classError, setClassError] = useState("");
  const [selected, setSelected] = useState<Map<string, SelectedStudent>>(() => new Map());
  const [placementNotice, setPlacementNotice] = useState<PlacementNotice | null>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const [pagination, setPagination] = useState<{ kind: Kind; page: number; term: string }>({ kind, page: 1, term: "" });
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const page = pagination.kind === kind && pagination.term === term ? pagination.page : 1;
  const activeEndpoint = (!visible || kind === "kelas" || kind === "mapel" || kind === "akademik")
    ? null
    : (() => {
        const query = new URLSearchParams({ page: String(page), limit: String(pageSize) });
        if ((kind === "guru" || kind === "siswa") && term) query.set("q", term);
        if (kind === "siswa") {
          query.set("kelas", classFilter);
          if (loginFilter !== "semua") query.set("login", loginFilter);
        }
        return `/api/sekolah/${kind}?${query}`;
      })();
  const [fetched, setFetched] = useState<{ endpoint: string; data: Result } | null>(null);
  const data = (activeEndpoint && fetched?.endpoint === activeEndpoint ? fetched.data : null)
    ?? (activeEndpoint ? getCached<Result>(activeEndpoint) : null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountModal, setAccountModal] = useState<{ row: Row; role: "siswa" | "guru"; reset: boolean } | null>(null);
  const [accountPasswordInput, setAccountPasswordInput] = useState("123456");
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [accountModalError, setAccountModalError] = useState("");
  const [credential, setCredential] = useState<{ nama: string; username: string; password: string; role: "siswa" | "guru"; reset: boolean } | null>(null);
  const [copiedCredential, setCopiedCredential] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [teacherBusy, setTeacherBusy] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [studentBusy, setStudentBusy] = useState(false);
  const [editing, setEditing] = useState<{ kind: "guru" | "siswa"; id: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<StudentImportResult | null>(null);
  const [toast, setToast] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (kind !== "siswa") setSelected(new Map());
  }, [kind]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    if (!activeEndpoint) return () => controller.abort();
    const cached = getCached<Result>(activeEndpoint);
    fetchWithTimeout(activeEndpoint, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : "Data belum dapat dimuat.");
      const body: unknown = await response.json();
      if (!isResult(body) || body.page !== page || (kind === "guru" && (typeof body.total !== "number" || !Number.isInteger(body.total) || body.total < 0)) || (kind === "siswa" && !body.rows.every((row) => row.kelasId === null || typeof row.kelasId === "string"))) throw new Error("Respons data sekolah tidak valid.");
      setCached(activeEndpoint, body);
      setFetched({ endpoint: activeEndpoint, data: body });
    }).catch((failure: unknown) => {
      if (!isCallerAborted(failure, controller.signal)) {
        if (!cached) setError(describeFetchError(failure, "Data belum dapat dimuat."));
      }
    });
    return () => controller.abort();
  }, [activeEndpoint, kind, page, version]);
  useEffect(() => {
    if (!visible || kind !== "siswa") return;
    const controller = new AbortController();
    setClassError("");
    const cachedClasses = getCached<{ kelas: PlacementClass[] }>("/api/sekolah/kelas");
    if (cachedClasses) setClasses(cachedClasses.kelas);
    fetchWithTimeout("/api/sekolah/kelas", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Daftar kelas belum dapat dimuat.");
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("kelas" in body) || !Array.isArray(body.kelas) || !body.kelas.every((item: unknown) => item !== null && typeof item === "object" && "id" in item && typeof item.id === "string" && "nama" in item && typeof item.nama === "string")) throw new Error("Respons daftar kelas tidak valid.");
      setCached("/api/sekolah/kelas", body);
      setClasses(body.kelas);
    }).catch((failure: unknown) => {
      if (!isCallerAborted(failure, controller.signal)) {
        if (!cachedClasses) { setClasses([]); setClassError(describeFetchError(failure, "Daftar kelas belum dapat dimuat.")); }
      }
    });
    return () => controller.abort();
  }, [kind, visible, version]);
  const activeRows = kind === "siswa" ? data?.rows.filter((row) => row.status === "Aktif") ?? [] : [];
  const selectedOnPageCount = activeRows.filter((row) => selected.has(row.id)).length;
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selectedOnPageCount > 0 && selectedOnPageCount < activeRows.length;
  }, [selectedOnPageCount, activeRows.length]);
  const chosen = Array.from(selected.values());
  function openAccountModal(row: Row, role: "siswa" | "guru", reset: boolean) {
    setAccountError("");
    setAccountModalError("");
    setAccountPasswordInput("123456");
    setShowAccountPassword(false);
    setAccountModal({ row, role, reset });
  }

  async function submitAccountModal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountModal) return;
    const { row, role, reset } = accountModal;
    const passwordToSend = accountPasswordInput.trim() || "123456";
    if (passwordToSend.length < 6) {
      setAccountModalError("Kata sandi minimal 6 karakter.");
      return;
    }
    setAccountBusy(true);
    setAccountError("");
    setAccountModalError("");
    try {
      const response = await fetchWithTimeout(`/api/sekolah/${role}/${encodeURIComponent(row.id)}/${reset ? "reset-password" : "akun"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordToSend }),
      });
      if (!response.ok) {
        let message = reset ? "Password belum dapat direset." : "Akun belum dapat dibuat.";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const body: unknown = await response.json();
          if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") message = body.error;
        }
        throw new Error(message);
      }
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("temporaryPassword" in body) ||
        typeof body.temporaryPassword !== "string" ||
        body.temporaryPassword.length < 6
      ) {
        throw new Error("Respons tidak valid. Muat ulang daftar dan coba kembali.");
      }
      const returnedUsername =
        "username" in body && typeof body.username === "string" && body.username.trim()
          ? body.username.trim()
          : role === "siswa"
            ? (row.username || row.keterangan)
            : (row.email || row.keterangan);
      invalidateCache(`/api/sekolah/${role}`);
      setCopiedCredential(false);
      setAccountModal(null);
      setCredential({
        nama: row.nama,
        username: returnedUsername,
        password: body.temporaryPassword,
        role,
        reset,
      });
      setToast(reset ? `Password ${row.nama} berhasil direset.` : `Akun ${row.nama} berhasil dibuat.`);
      setVersion((value) => value + 1);
    } catch (failure) {
      setAccountModalError(describeFetchError(failure, "Akun belum dapat diproses."));
    } finally {
      setAccountBusy(false);
    }
  }
  async function changeStatus(row: Row, role: "siswa" | "guru") {
    const active = row.status !== "Aktif";
    if (!await confirm(active ? `Aktifkan kembali ${row.nama}?` : `Nonaktifkan ${row.nama}? Akun tidak dapat masuk dan sesi akan berakhir. Riwayat tetap tersimpan.`)) return;
    setAccountBusy(true); setAccountError("");
    try {
      const response = await fetchWithTimeout(`/api/sekolah/${role}/${encodeURIComponent(row.id)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: active ? "Aktif" : "Nonaktif" }) });
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "Status belum dapat diubah.");
      }
      invalidateCache(["/api/sekolah/siswa", "/api/sekolah/guru", "/api/sekolah/kelas", "/api/sekolah/akademik", "/api/sekolah/ringkasan"]);
      if (role === "siswa" && !active) {
        setSelected((previous) => {
          if (!previous.has(row.id)) return previous;
          const next = new Map(previous);
          next.delete(row.id);
          return next;
        });
      }
      setVersion((value) => value + 1);
      setToast(active ? "Data berhasil diaktifkan." : "Data dinonaktifkan; riwayat tetap tersimpan.");
    } catch (failure) {
      setAccountError(describeFetchError(failure, "Status belum dapat diubah."));
    } finally { setAccountBusy(false); }
  }
  return <section hidden={!visible} className="dashboard-glass space-y-6 rounded-2xl p-6">
    <DashboardHero title={labels[kind]} description="Kelola data dan kegiatan untuk sekolah Anda." badge={kind === "guru" && data ? `${data.total} ${term ? "hasil pencarian" : "guru"}` : undefined} action={kind === "guru" ? <button type="button" onClick={() => setTeacherOpen(true)} className="dashboard-hero-action"><Plus size={18} />Tambah Guru</button> : kind === "siswa" ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setStudentOpen(true)} className="dashboard-hero-action"><Plus size={18} />Tambah Siswa</button><button type="button" onClick={() => { if (!canUseReguler) { onRequireUpgrade?.("Impor Massal Dapodik", "reguler"); return; } setImportOpen(true); }} className="dashboard-hero-action dashboard-hero-secondary">{!canUseReguler && <Lock size={14} aria-hidden="true" />}Impor Siswa{!canUseReguler && <span className="rounded bg-white/25 px-1.5 py-0.5 text-[10px] font-extrabold uppercase">Reguler</span>}</button></div> : undefined} />
    {kind === "guru" && <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label className="relative block"><span className="sr-only">Cari nama, NUPTK, atau email guru</span><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={100} type="search" placeholder="Cari nama, NUPTK, atau email" className="glass-input w-full rounded-xl py-3 pl-10 pr-3 text-sm" /></label>
      <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${isDark ? "border border-amber-400/30 bg-amber-500/15 text-amber-200" : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"}`}><Users size={20} /><div><p className="text-xs font-semibold">{term ? "Hasil pencarian" : "Total guru"}</p><p className="text-lg font-bold tabular-nums">{data?.total ?? "—"}</p></div></div>
    </div>}
    {kind === "siswa" && <div className="mt-5 space-y-3"><label className="relative block"><span className="sr-only">Cari nama atau NISN siswa</span><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); }} maxLength={100} type="search" placeholder="Cari nama atau NISN" className="glass-input w-full rounded-xl py-3 pl-10 pr-3 text-sm" /></label><div className="flex flex-wrap gap-2">{([["semua", "Semua Siswa"], ["belum", "Belum Punya Kelas"], ["sudah", "Sudah Punya Kelas"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={classFilter === value} onClick={() => { setClassFilter(value); setPagination({ kind, page: 1, term }); }} className={`rounded-full px-4 py-2 text-xs font-bold transition sm:text-sm ${classFilter === value ? (isDark ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.35)]" : "bg-indigo-600 text-white") : (isDark ? "border border-slate-700/70 bg-slate-800/70 text-slate-300 hover:bg-slate-700/80 hover:text-white" : "bg-indigo-50 text-indigo-700")}`}>{label}</button>)}</div><div className="flex flex-wrap items-center gap-2"><span className={`text-xs font-bold ${isDark ? "text-slate-400" : "text-slate-600"}`}>Monitoring Login:</span>{([
      ["semua", "Semua Status", data?.loginStats ? data.loginStats.aktif + data.loginStats.pernah + data.loginStats.belum : undefined, "slate"],
      ["aktif", "Sedang Login", data?.loginStats?.aktif, "emerald"],
      ["pernah", "Pernah Login", data?.loginStats?.pernah, "sky"],
      ["belum", "Belum Pernah Login", data?.loginStats?.belum, "amber"],
    ] as const).map(([value, label, count, tone]) => <button key={value} type="button" aria-pressed={loginFilter === value} onClick={() => { setLoginFilter(value); setPagination({ kind, page: 1, term }); }} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${loginFilter === value ? (tone === "emerald" ? "border-emerald-500 bg-emerald-600 text-white" : tone === "amber" ? "border-amber-500 bg-amber-500 text-slate-950" : tone === "sky" ? "border-sky-500 bg-sky-600 text-white" : (isDark ? "border-amber-400 bg-amber-400 text-slate-950" : "border-indigo-600 bg-indigo-600 text-white")) : (isDark ? "border-slate-700/70 bg-slate-900/70 text-slate-300 hover:border-slate-500" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}`}>{value === "aktif" && <span className={`h-2 w-2 rounded-full ${loginFilter === value ? "bg-white" : "bg-emerald-500"}`} />}<span>{label}</span>{count !== undefined && <span className="tabular-nums opacity-85">({count})</span>}</button>)}</div><div className="flex flex-wrap items-center justify-between gap-2"><p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Pilihan siswa tetap tersimpan saat mencari, mengganti filter, atau berpindah halaman (maks. 50 siswa per penempatan).</p>{selected.size > 0 && <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold ${isDark ? "border-amber-400/35 bg-amber-500/15 text-amber-200" : "border-indigo-200 bg-indigo-50 text-indigo-900"}`}><span className="tabular-nums font-bold">{selected.size} siswa dipilih</span><button type="button" onClick={() => setSelected(new Map())} className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${isDark ? "border-amber-400/40 bg-slate-900/60 text-amber-200 hover:bg-amber-500/20" : "border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"}`}>Batal Pilih / Reset Pilihan</button></div>}</div>{classError && <p role="alert" className="text-sm text-rose-500">{classError}</p>}{placementNotice && <p role={placementNotice.error ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${placementNotice.error ? (isDark ? "border-rose-500/35 bg-rose-950/50 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-800") : (isDark ? "border-emerald-500/35 bg-emerald-950/50 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-800")}`}>{placementNotice.text}</p>}</div>}
    {toast && <div role="status" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    {accountError && <p role="alert" className="mt-4 text-sm text-rose-500">{accountError}</p>}
    {kind === "siswa" && importResult && <div role="status" className={`mt-4 rounded-xl border p-4 text-sm ${isDark ? "border-emerald-500/35 bg-emerald-950/50 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><div className="flex items-start justify-between gap-3"><p className="font-semibold">Impor selesai: {importResult.created} siswa baru, {importResult.updated} siswa diperbarui; {importResult.skipped.length} siswa tanpa NISN dilewati.</p><button type="button" onClick={() => setImportResult(null)} className="shrink-0 font-bold underline">Tutup</button></div>{importResult.skipped.length > 0 && <><ul className="mt-2 list-inside list-disc">{importResult.skipped.map((row) => <li key={row.number}>Baris {row.number}: {row.nama || "(nama kosong)"}</li>)}</ul><p className="mt-2">Lengkapi NISN di file sebelum mengimpor siswa tersebut.</p></>}</div>}
    {credential && (
      <div role="status" className={`mt-4 rounded-xl border p-4 text-sm shadow-sm ${isDark ? "border-emerald-400/40 bg-emerald-950/50 text-emerald-100" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`}>
        <p className={`font-extrabold ${isDark ? "text-emerald-300" : "text-emerald-900"}`}>
          {credential.reset ? `Password baru untuk ${credential.nama}` : `Akun login baru untuk ${credential.nama}`}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <div className={`rounded-lg border px-3 py-1.5 text-xs ${isDark ? "border-emerald-400/30 bg-slate-950/80 text-slate-200" : "border-emerald-200 bg-white text-slate-800"}`}>
            <span className="font-semibold opacity-75">{credential.role === "siswa" ? "NISN / Username:" : "Email:"}</span>{" "}
            <code className="font-mono text-sm font-bold">{credential.username}</code>
          </div>
          <div className={`rounded-lg border px-3 py-1.5 text-xs ${isDark ? "border-emerald-400/30 bg-slate-950/80 text-amber-300" : "border-emerald-200 bg-white text-slate-900"}`}>
            <span className="font-semibold opacity-75">Kata Sandi:</span>{" "}
            <code className="font-mono text-sm font-bold tracking-wider">{credential.password}</code>
          </div>
          <button
            type="button"
            onClick={() => {
              const info = `${credential.nama}\n${credential.role === "siswa" ? "NISN/Username" : "Email"}: ${credential.username}\nKata Sandi: ${credential.password}`;
              if (navigator.clipboard?.writeText) {
                void navigator.clipboard.writeText(info).then(() => {
                  setCopiedCredential(true);
                  window.setTimeout(() => setCopiedCredential(false), 2500);
                }).catch(() => {});
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold shadow-xs transition ${isDark ? "border-emerald-400/40 bg-emerald-400 text-slate-950 hover:bg-emerald-300" : "border-emerald-400 bg-white text-emerald-950 hover:bg-emerald-100"}`}
          >
            {copiedCredential ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copiedCredential ? "Info Login Tersalin" : "Salin Info Login"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed opacity-90">
          {credential.role === "siswa"
            ? "Akun langsung aktif untuk login di Portal Siswa. Bagikan username dan kata sandi ini ke warga belajar."
            : "Sampaikan kredensial ini ke guru terkait. Guru akan diminta mengganti password saat pertama masuk."}
        </p>
        <button
          type="button"
          onClick={() => { setCredential(null); setCopiedCredential(false); }}
          className={`mt-3 inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-bold underline transition ${isDark ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30" : "border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"}`}
        >
          Tutup Info Kredensial
        </button>
      </div>
    )}
    {accountModal && (
      <SchoolModal
        title={accountModal.reset ? `Reset Password ${accountModal.row.nama}` : `Buat Akun ${accountModal.role === "siswa" ? "Siswa" : "Guru"}`}
        titleIcon={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600"><KeyRound size={20} aria-hidden="true" /></span>}
        busy={accountBusy}
        onClose={() => { if (!accountBusy) setAccountModal(null); }}
      >
        <form onSubmit={(e) => void submitAccountModal(e)} className="mt-4 space-y-4 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
            <p className="font-bold text-slate-900">{accountModal.row.nama}</p>
            <p className="mt-1">
              {accountModal.role === "siswa"
                ? accountModal.row.username || accountModal.row.keterangan
                  ? <>Login menggunakan NISN/Username: <strong className="font-mono">{accountModal.row.username || accountModal.row.keterangan}</strong></>
                  : "NISN belum diisi — sistem akan membuatkan username otomatis berbasis nama siswa."
                : <>Email login: <strong className="font-mono">{accountModal.row.email}</strong></>}
            </p>
          </div>
          <div>
            <label htmlFor="school-account-password" className="block text-xs font-bold text-slate-700">
              {accountModal.reset ? "Kata Sandi Baru (default: 123456)" : "Kata Sandi Awal (default: 123456)"}
            </label>
            <div className="relative mt-1.5">
              <input
                id="school-account-password"
                type={showAccountPassword ? "text" : "password"}
                value={accountPasswordInput}
                onChange={(e) => setAccountPasswordInput(e.target.value)}
                minLength={6}
                maxLength={100}
                required
                placeholder="Minimal 6 karakter (default 123456)"
                className="glass-input w-full rounded-xl py-2.5 pl-3.5 pr-11 font-mono text-sm"
              />
              <button
                type="button"
                aria-label={showAccountPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                onClick={() => setShowAccountPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800"
              >
                {showAccountPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              {accountModal.reset
                ? "Semua sesi login aktif milik pengguna akan dicabut dan kata sandi baru langsung aktif."
                : "Anda dapat langsung menggunakan 123456 atau mengetik kata sandi khusus minimal 6 karakter."}
            </p>
          </div>
          {accountModalError && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {accountModalError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={accountBusy}
              onClick={() => setAccountModal(null)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={accountBusy}
              className="master-primary px-4 py-2 text-xs disabled:opacity-50"
            >
              {accountBusy ? "Menyimpan..." : accountModal.reset ? "Simpan Password Baru" : "Buat Akun Sekarang"}
            </button>
          </div>
        </form>
      </SchoolModal>
    )}
    {kind === "kelas" ? <SchoolClasses plan={plan} onRequireUpgrade={onRequireUpgrade} /> : kind === "mapel" || kind === "akademik" ? <SchoolAcademics mode={kind} /> : <>
    {kind === "siswa" && importOpen && <SchoolModal title="Impor Siswa dari Excel" titleIcon={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400"><FileSpreadsheet size={22} aria-hidden="true" /></span>} busy={importBusy} onClose={() => setImportOpen(false)}><StudentImport onBusyChange={setImportBusy} onImported={(result) => { invalidateCache(["/api/sekolah/siswa", "/api/sekolah/ringkasan", "/api/verval"]); setImportOpen(false); setImportResult(result); setPagination({ kind: "siswa", page: 1, term: "" }); setVersion((value) => value + 1); }} /></SchoolModal>}
    {kind === "siswa" && studentOpen && <SchoolModal title="Tambah Siswa" wide busy={studentBusy} onClose={() => setStudentOpen(false)}><StudentEditor onCancel={() => setStudentOpen(false)} onBusyChange={setStudentBusy} onSaved={() => { invalidateCache(["/api/sekolah/siswa", "/api/sekolah/kelas", "/api/sekolah/ringkasan", "/api/verval"]); setStudentOpen(false); setPagination({ kind: "siswa", page: 1, term: "" }); setVersion((value) => value + 1); setToast("Data siswa tersimpan. Akun siswa belum dibuat."); }} /></SchoolModal>}
    {teacherOpen && kind === "guru" && <SchoolModal title="Tambah Guru" busy={teacherBusy} onClose={() => setTeacherOpen(false)}><TeacherForm onBusyChange={setTeacherBusy} onSaved={() => { invalidateCache(["/api/sekolah/guru", "/api/sekolah/kelas", "/api/sekolah/akademik", "/api/sekolah/ringkasan"]); setTeacherOpen(false); setSearchInput(""); setSearch(""); setPagination({ kind: "guru", page: 1, term: "" }); setVersion((value) => value + 1); setToast("Data guru tersimpan. Akun guru belum dibuat."); }} /></SchoolModal>}
    {editing && visible && editing.kind === kind && <SchoolModal title={editing.kind === "siswa" ? "Edit Siswa" : "Edit guru"} wide={editing.kind === "siswa"} busy={editing.kind === "siswa" ? studentBusy : teacherBusy} onClose={() => setEditing(null)}>{editing.kind === "siswa" ? <StudentEditor id={editing.id} onCancel={() => setEditing(null)} onBusyChange={setStudentBusy} onSaved={() => { invalidateCache(["/api/sekolah/siswa", "/api/sekolah/kelas", "/api/sekolah/ringkasan", "/api/verval"]); setEditing(null); setVersion((value) => value + 1); setToast("Data berhasil diperbarui. Sesi pengguna terkait telah berakhir."); }} /> : <SchoolPersonEditor id={editing.id} onBusyChange={setTeacherBusy} onSaved={() => { invalidateCache(["/api/sekolah/guru", "/api/sekolah/kelas", "/api/sekolah/akademik"]); setEditing(null); setVersion((value) => value + 1); setToast("Data berhasil diperbarui. Sesi pengguna terkait telah berakhir."); }} />}</SchoolModal>}
    {kind === "ppdb" && <div className={`mt-4 rounded-xl border p-4 text-sm ${isDark ? "border-amber-400/25 bg-slate-900/75 text-slate-200" : "border-transparent bg-[#f8f6ef]"}`}><p>Tautan PPDB:</p><a className={`break-all font-semibold underline ${isDark ? "text-amber-300" : "text-[#80643a]"}`} href={`/ppdb/${encodeURIComponent(slug)}`}>{`${window.location.origin}/ppdb/${encodeURIComponent(slug)}`}</a><p className={`mt-2 ${isDark ? "text-slate-400" : ""}`}>Penerimaan hanya mencatat keputusan; akun dan data siswa belum dibuat otomatis.</p></div>}
    {error ? <p role="alert" className="mt-4 text-sm text-rose-500">{error}</p> : !data ? (kind === "ppdb" ? <CardGridSkeleton count={3} columns={3} /> : <TableSkeleton rows={6} columns={kind === "siswa" ? 6 : 5} />) : <>
      {data.rows.length === 0 ? <EmptyState title={kind === "guru" && term ? "Guru tidak ditemukan" : "Belum ada data"} description={kind === "guru" && term ? "Coba kata kunci lain." : "Data yang tersedia akan ditampilkan di sini."} action={kind === "guru" && !term ? <button type="button" className="master-primary" onClick={() => setTeacherOpen(true)}>Tambah Guru</button> : kind === "siswa" ? <button type="button" className="master-primary" onClick={() => setStudentOpen(true)}>Tambah Siswa</button> : undefined} /> : kind === "ppdb" ? <div className="mt-4 space-y-3">{data.rows.map((row) => <article key={row.id} className={`rounded-xl border p-4 ${isDark ? "border-slate-700/60" : "border-[#e6dfd0]"}`}><h3 className="font-bold">{row.nama}</h3><p className="mt-2 break-all text-sm">No. {row.keterangan} · {row.status}</p><p className="mt-1 break-words text-sm text-slate-600">Email: {row.email} · Telepon: {row.telepon}</p><p className="mt-1 break-words text-sm text-slate-600">Jenjang: {row.jenjang} · Alamat: {row.alamat}</p>{row.catatan && <p className="mt-1 break-words text-sm">Catatan: {row.catatan}</p>}{row.status === "Pending" && <ReviewPPDB id={row.id} nama={row.nama} onSaved={() => { invalidateCache(["/api/sekolah/ppdb", "/api/sekolah/ringkasan"]); setVersion((value) => value + 1); }} />}</article>)}</div> : <div className={`dashboard-glass mt-5 overflow-x-auto ${chosen.length ? "mb-36 md:mb-24" : ""}`}><table className="w-full min-w-[54rem] text-left text-sm"><thead className={isDark ? "bg-slate-900/70 text-[11px] font-bold uppercase tracking-wider text-slate-400" : "bg-slate-50 text-xs uppercase text-slate-500"}><tr>{kind === "siswa" && <th className="p-4"><input ref={selectAll} type="checkbox" aria-label="Pilih semua siswa aktif di halaman ini" disabled={!activeRows.length} checked={activeRows.length > 0 && selectedOnPageCount === activeRows.length} onChange={(event) => setSelected((previous) => { const next = new Map(previous); if (event.target.checked) { for (const row of activeRows) { if (!next.has(row.id) && next.size < 50) next.set(row.id, { id: row.id, nama: row.nama, nisn: row.keterangan, kelasId: row.kelasId ?? null }); } } else { for (const row of activeRows) next.delete(row.id); } return next; })} className="h-4 w-4 rounded accent-amber-500" /></th>}<th className="p-4">{kind === "siswa" ? "Nama Siswa" : "Nama"}</th><th className="p-4">{kind === "siswa" ? "NISN" : "NUPTK / Email"}</th>{kind === "siswa" && <th className="p-4">Kelas Saat Ini</th>}{kind === "siswa" && <th className="p-4">Status Login</th>}<th className="p-4">Status</th><th className="p-4">Akun LMS</th><th className="p-4">Aksi</th></tr></thead><tbody>{data.rows.map((row) => { const classNameText = row.kelasId ? classes.find((item) => item.id === row.kelasId)?.nama ?? "Kelas tidak ditemukan" : null; const loginStatus = row.statusLogin ?? "BELUM"; const reminderMsg = kind === "siswa" ? buildStudentReminderMessage({ nama: row.nama, kelasNama: classNameText, statusLogin: loginStatus, senderRole: "Admin", portalUrl: `${window.location.origin}/lms` }) : ""; const reminderWaUrl = kind === "siswa" ? buildStudentReminderWaUrl(row.telepon, reminderMsg) : null; return <tr key={row.id} className={`border-t transition ${isDark ? "border-slate-800/70 hover:bg-slate-800/45" : "border-slate-100 hover:bg-indigo-50/60"}`}>{kind === "siswa" && <td className="p-4"><input type="checkbox" aria-label={`Pilih ${row.nama} (${row.keterangan})`} disabled={row.status !== "Aktif" || (!selected.has(row.id) && selected.size >= 50)} checked={selected.has(row.id)} onChange={(event) => setSelected((previous) => { const next = new Map(previous); if (event.target.checked) { if (next.size < 50) next.set(row.id, { id: row.id, nama: row.nama, nisn: row.keterangan, kelasId: row.kelasId ?? null }); } else { next.delete(row.id); } return next; })} className="h-4 w-4 rounded accent-amber-500" /></td>}<td className={`p-4 font-bold ${isDark ? "text-white" : ""}`}>{row.nama}</td><td className={`p-4 font-mono tabular-nums ${isDark ? "text-slate-400" : ""}`}>{row.keterangan || row.username || "—"}{kind === "guru" && <p className={`mt-1 font-sans text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{row.email}</p>}</td>{kind === "siswa" && <td className="p-4">{classNameText ? <span className={isDark ? "inline-flex rounded-full border border-emerald-500/35 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300" : "inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800"}>{classNameText}</span> : <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>Belum ditempatkan</span>}</td>}{kind === "siswa" && <td className="p-4">{loginStatus === "AKTIF" ? <div className="space-y-0.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}><span className="h-2 w-2 rounded-full bg-emerald-500" />Sedang Login</span>{row.lastLoginAt && <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>{formatLoginTimestamp(row.lastLoginAt)}</p>}</div> : loginStatus === "PERNAH" ? <div className="space-y-0.5"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${isDark ? "bg-sky-500/15 text-sky-300" : "bg-sky-50 text-sky-700"}`}>Pernah Login</span>{row.lastLoginAt && <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Terakhir: {formatLoginTimestamp(row.lastLoginAt)}</p>}</div> : <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${isDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-50 text-amber-800"}`}>Belum Login</span>}</td>}<td className="p-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${row.status === "Aktif" ? (isDark ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-300" : "border-transparent bg-emerald-50 text-emerald-700") : (isDark ? "border-slate-700 bg-slate-800/80 text-slate-400" : "border-transparent bg-slate-100 text-slate-600")}`}>{row.status}</span></td><td className="p-4">{row.status !== "Aktif" ? <span className="text-xs text-slate-500">Data tidak aktif</span> : <div className="flex flex-wrap items-center gap-2"><span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{row.punyaAkun ? "Akun tersedia" : "Belum ada akun"}</span><button disabled={accountBusy} type="button" onClick={() => openAccountModal(row, kind, !!row.punyaAkun)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${isDark ? "border-slate-700/80 bg-slate-800/75 text-slate-200 hover:border-amber-400/50 hover:text-amber-300" : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"}`}>{row.punyaAkun ? "Reset Password" : "Buat akun"}</button></div>}</td><td className="p-4"><div className="flex flex-wrap gap-2">{kind === "siswa" && row.status === "Aktif" && loginStatus !== "AKTIF" && (reminderWaUrl ? <a href={reminderWaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"><MessageCircle size={13} aria-hidden="true" />Tegur WA</a> : <button type="button" onClick={() => { if (navigator.clipboard?.writeText) { void navigator.clipboard.writeText(reminderMsg).then(() => setToast(`Pesan teguran untuk ${row.nama} disalin — silakan tempel ke WA/grup kelas.`)).catch(() => {}); } }} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100"><MessageCircle size={13} aria-hidden="true" />Salin Teguran</button>)}<button type="button" disabled={accountBusy} onClick={() => setEditing({ kind, id: row.id })} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${isDark ? "border-slate-700/80 bg-slate-800/75 text-slate-200 hover:border-amber-400/50 hover:text-amber-300" : "border-indigo-200 text-indigo-700"}`}>Edit</button><button type="button" disabled={accountBusy} onClick={() => changeStatus(row, kind)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${isDark ? "border-rose-500/30 bg-rose-950/35 text-rose-300 hover:bg-rose-950/60" : "border-rose-200 text-rose-700"}`}>{row.status === "Aktif" ? "Nonaktifkan" : "Aktifkan"}</button></div></td></tr>; })}</tbody></table></div>}
      {kind === "siswa" && chosen.length > 0 && <BulkPlacementAction floating students={chosen} classes={classes} onFinished={(notice) => { invalidateCache(["/api/sekolah/siswa", "/api/sekolah/kelas"]); setSelected(new Map()); setPlacementNotice(notice); setVersion((value) => value + 1); }} />}
      {(() => {
        const totalItems = data.total ?? data.rows.length;
        const displayedEnd = data.rows.length ? Math.min((page - 1) * pageSize + data.rows.length, totalItems) : 0;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        return (
          <div className="mt-6 flex flex-col items-center justify-center gap-3 text-center text-sm">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold tabular-nums ${
                  isDark
                    ? "border-slate-700/70 bg-slate-900/80 text-slate-200"
                    : "border-transparent bg-indigo-50 text-indigo-950"
                }`}
              >
                Menampilkan {displayedEnd}/{totalItems} · Halaman {page}/{totalPages}
              </span>
              <div className="flex items-center gap-1.5" role="group" aria-label="Jumlah data per halaman">
                <span className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>Per halaman:</span>
                {([10, 25, 50] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={pageSize === size}
                    onClick={() => {
                      setPageSize(size);
                      setPagination({ kind, page: 1, term });
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums transition ${
                      pageSize === size
                        ? isDark
                          ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_14px_rgba(245,158,11,0.3)]"
                          : "bg-indigo-600 text-white shadow-xs"
                        : isDark
                          ? "border border-slate-700/70 bg-slate-800/75 text-slate-300 hover:border-amber-400/40 hover:text-white"
                          : "border border-slate-300 bg-white text-slate-900 hover:bg-indigo-50"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => {
                  setPagination({ kind, page: page - 1, term });
                }}
                className={`rounded-lg border px-4 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isDark
                    ? "border-slate-700/70 bg-slate-800/75 text-slate-200 hover:border-amber-400/40 hover:text-amber-300"
                    : "border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50"
                }`}
              >
                Sebelumnya
              </button>
              <span className={`min-w-[4.5rem] font-bold tabular-nums ${isDark ? "text-slate-300" : "text-slate-700"}`}>{displayedEnd}/{totalItems}</span>
              <button
                type="button"
                disabled={!data.hasNext}
                onClick={() => {
                  setPagination({ kind, page: page + 1, term });
                }}
                className={`rounded-lg border px-4 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isDark
                    ? "border-slate-700/70 bg-slate-800/75 text-slate-200 hover:border-amber-400/40 hover:text-amber-300"
                    : "border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50"
                }`}
              >
                Berikutnya
              </button>
            </div>
          </div>
        );
      })()}
    </>}
    </>}
  </section>;
}
