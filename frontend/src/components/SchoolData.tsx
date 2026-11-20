import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileSpreadsheet, Plus, Search, Users } from "lucide-react";
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
import { ensureStandardClasses } from "./standardClasses";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { hasPlanAccess, type PlanSlug } from "./subscriptionPlans";
import { Lock } from "lucide-react";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type Row = { id: string; nama: string; keterangan: string; status: string; kelasId?: string | null; punyaAkun?: boolean; email?: string; telepon?: string; alamat?: string; jenjang?: string; catatan?: string | null };
type Result = { rows: Row[]; page: number; pageSize?: number; hasNext: boolean; total?: number };
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
  const canUseReguler = hasPlanAccess(plan, "reguler");
  const confirm = useGlassConfirm();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const term = kind === "guru" || kind === "siswa" ? search.trim() : "";
  const [classFilter, setClassFilter] = useState<"semua" | "belum" | "sudah">("semua");
  const [classes, setClasses] = useState<PlacementClass[]>(() => {
    const cached = getCached<{ kelas: PlacementClass[] }>("/api/sekolah/kelas");
    return cached?.kelas ?? [];
  });
  const [classError, setClassError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
        if (kind === "siswa") query.set("kelas", classFilter);
        return `/api/sekolah/${kind}?${query}`;
      })();
  const [fetched, setFetched] = useState<{ endpoint: string; data: Result } | null>(null);
  const data = (activeEndpoint && fetched?.endpoint === activeEndpoint ? fetched.data : null)
    ?? (activeEndpoint ? getCached<Result>(activeEndpoint) : null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [accountBusy, setAccountBusy] = useState(false);
  const [credential, setCredential] = useState<{ nama: string; password: string } | null>(null);
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
    setSelected(new Set());
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
    ensureStandardClasses(controller.signal).then(() => fetchWithTimeout("/api/sekolah/kelas", { signal: controller.signal })).then(async (response) => {
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
  const activeRows = kind === "siswa" && searchInput.trim() === term ? data?.rows.filter((row) => row.status === "Aktif") ?? [] : [];
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = selected.size > 0 && selected.size < activeRows.length; }, [selected, activeRows.length]);
  const chosen = activeRows.filter((row) => selected.has(row.id) && row.kelasId !== undefined).map((row) => ({ id: row.id, nama: row.nama, nisn: row.keterangan, kelasId: row.kelasId ?? null }));
  async function manageAccount(row: Row, role: "siswa" | "guru", reset: boolean) {
    const confirmText = reset
      ? `Reset password akun ${row.nama} ke password default 123456? Semua sesi akun akan berakhir.`
      : `Buat akun ${role} untuk ${row.nama} dengan password default 123456?`;
    if (credential || !await confirm(confirmText)) return;
    setAccountBusy(true); setAccountError("");
    try {
      const response = await fetchWithTimeout(`/api/sekolah/${role}/${encodeURIComponent(row.id)}/${reset ? "reset-password" : "akun"}`, { method: "POST" });
      if (!response.ok) {
        let message = "Akun belum dapat dibuat.";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const body: unknown = await response.json();
          if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") message = body.error;
        }
        throw new Error(message);
      }
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("temporaryPassword" in body) || typeof body.temporaryPassword !== "string" || !/^(?:123456|[A-Za-z0-9_-]{24})$/.test(body.temporaryPassword)) throw new Error("Respons tidak valid. Muat ulang daftar dan reset password untuk memperoleh password baru.");
      invalidateCache(`/api/sekolah/${role}`);
      setCopiedCredential(false);
      setCredential({ nama: row.nama, password: body.temporaryPassword });
      setVersion((value) => value + 1);
    } catch (failure) {
      setAccountError(describeFetchError(failure, "Akun belum dapat diproses."));
    } finally { setAccountBusy(false); }
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
      <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-white"><Users size={20} /><div><p className="text-xs font-semibold">{term ? "Hasil pencarian" : "Total guru"}</p><p className="text-lg font-bold">{data?.total ?? "—"}</p></div></div>
    </div>}
    {kind === "siswa" && <div className="mt-5 space-y-3"><label className="relative block"><span className="sr-only">Cari nama atau NISN siswa</span><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setSelected(new Set()); }} maxLength={100} type="search" placeholder="Cari nama atau NISN" className="glass-input w-full rounded-xl py-3 pl-10 pr-3 text-sm" /></label><div className="flex flex-wrap gap-2">{([["semua", "Semua"], ["belum", "Belum Punya Kelas"], ["sudah", "Sudah Punya Kelas"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={classFilter === value} onClick={() => { setClassFilter(value); setSelected(new Set()); setPagination({ kind, page: 1, term }); }} className={`rounded-full px-3 py-2 text-sm font-bold ${classFilter === value ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"}`}>{label}</button>)}</div><p className="text-xs text-slate-600">Pilih semua berlaku untuk siswa aktif di halaman ini (maks. 50 siswa).</p>{classError && <p role="alert" className="text-sm text-rose-700">{classError}</p>}{placementNotice && <p role={placementNotice.error ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${placementNotice.error ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>{placementNotice.text}</p>}</div>}
    {toast && <div role="status" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    {accountError && <p role="alert" className="mt-4 text-sm text-rose-700">{accountError}</p>}
    {kind === "siswa" && importResult && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><div className="flex items-start justify-between gap-3"><p className="font-semibold">Impor selesai: {importResult.created} siswa baru, {importResult.updated} siswa diperbarui; {importResult.skipped.length} siswa tanpa NISN dilewati.</p><button type="button" onClick={() => setImportResult(null)} className="shrink-0 font-bold underline">Tutup</button></div>{importResult.skipped.length > 0 && <><ul className="mt-2 list-inside list-disc">{importResult.skipped.map((row) => <li key={row.number}>Baris {row.number}: {row.nama || "(nama kosong)"}</li>)}</ul><p className="mt-2">Lengkapi NISN di file sebelum mengimpor siswa tersebut.</p></>}</div>}
    {credential && <div role="status" className="mt-4 rounded-xl border border-amber-400 bg-amber-100/95 p-4 text-sm text-amber-950 shadow-sm"><p className="font-bold text-amber-950">Password sementara untuk {credential.nama}</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="break-all rounded-lg border border-amber-300 bg-amber-200/80 px-3 py-1.5 font-mono text-base font-bold tracking-wider text-slate-950">{credential.password}</code><button type="button" onClick={() => { if (navigator.clipboard?.writeText) { void navigator.clipboard.writeText(credential.password).then(() => { setCopiedCredential(true); window.setTimeout(() => setCopiedCredential(false), 2500); }).catch(() => {}); } }} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-slate-950 shadow-xs transition hover:bg-amber-50">{copiedCredential ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copiedCredential ? "Tersalin" : "Salin"}</button></div><p className="mt-2 leading-relaxed text-amber-950">Hanya ditampilkan sekarang. Sampaikan langsung melalui cara yang aman; pengguna wajib menggantinya saat masuk. Jika hilang, reset kembali.</p><button type="button" onClick={() => { setCredential(null); setCopiedCredential(false); }} className="mt-3 inline-flex items-center rounded-lg border border-amber-400 bg-amber-200/75 px-3 py-1.5 text-xs font-bold text-amber-950 underline transition hover:bg-amber-200">Saya sudah menyimpan dengan aman</button></div>}
    {kind === "kelas" ? <SchoolClasses plan={plan} onRequireUpgrade={onRequireUpgrade} /> : kind === "mapel" || kind === "akademik" ? <SchoolAcademics mode={kind} /> : <>
    {kind === "siswa" && importOpen && <SchoolModal title="Impor Siswa dari Excel" titleIcon={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><FileSpreadsheet size={22} aria-hidden="true" /></span>} busy={importBusy} onClose={() => setImportOpen(false)}><StudentImport onBusyChange={setImportBusy} onImported={(result) => { invalidateCache(["/api/sekolah/siswa", "/api/sekolah/ringkasan"]); setImportOpen(false); setImportResult(result); setPagination({ kind: "siswa", page: 1, term: "" }); setVersion((value) => value + 1); }} /></SchoolModal>}
    {kind === "siswa" && studentOpen && <SchoolModal title="Tambah Siswa" wide busy={studentBusy} onClose={() => setStudentOpen(false)}><StudentEditor onCancel={() => setStudentOpen(false)} onBusyChange={setStudentBusy} onSaved={() => { invalidateCache(["/api/sekolah/siswa", "/api/sekolah/kelas", "/api/sekolah/ringkasan"]); setStudentOpen(false); setPagination({ kind: "siswa", page: 1, term: "" }); setVersion((value) => value + 1); setToast("Data siswa tersimpan. Akun siswa belum dibuat."); }} /></SchoolModal>}
    {teacherOpen && kind === "guru" && <SchoolModal title="Tambah Guru" busy={teacherBusy} onClose={() => setTeacherOpen(false)}><TeacherForm onBusyChange={setTeacherBusy} onSaved={() => { invalidateCache(["/api/sekolah/guru", "/api/sekolah/kelas", "/api/sekolah/akademik", "/api/sekolah/ringkasan"]); setTeacherOpen(false); setSearchInput(""); setSearch(""); setPagination({ kind: "guru", page: 1, term: "" }); setVersion((value) => value + 1); setToast("Data guru tersimpan. Akun guru belum dibuat."); }} /></SchoolModal>}
    {editing && visible && editing.kind === kind && <SchoolModal title={editing.kind === "siswa" ? "Edit Siswa" : "Edit guru"} wide={editing.kind === "siswa"} busy={editing.kind === "siswa" ? studentBusy : teacherBusy} onClose={() => setEditing(null)}>{editing.kind === "siswa" ? <StudentEditor id={editing.id} onCancel={() => setEditing(null)} onBusyChange={setStudentBusy} onSaved={() => { invalidateCache(["/api/sekolah/siswa", "/api/sekolah/kelas", "/api/sekolah/ringkasan"]); setEditing(null); setVersion((value) => value + 1); setToast("Data berhasil diperbarui. Sesi pengguna terkait telah berakhir."); }} /> : <SchoolPersonEditor id={editing.id} onBusyChange={setTeacherBusy} onSaved={() => { invalidateCache(["/api/sekolah/guru", "/api/sekolah/kelas", "/api/sekolah/akademik"]); setEditing(null); setVersion((value) => value + 1); setToast("Data berhasil diperbarui. Sesi pengguna terkait telah berakhir."); }} />}</SchoolModal>}
    {kind === "ppdb" && <div className="mt-4 rounded-xl bg-[#f8f6ef] p-4 text-sm"><p>Tautan PPDB:</p><a className="break-all font-semibold text-[#80643a] underline" href={`/ppdb/${encodeURIComponent(slug)}`}>{`${window.location.origin}/ppdb/${encodeURIComponent(slug)}`}</a><p className="mt-2">Penerimaan hanya mencatat keputusan; akun dan data siswa belum dibuat otomatis.</p></div>}
    {error ? <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p> : !data ? (kind === "ppdb" ? <CardGridSkeleton count={3} columns={3} /> : <TableSkeleton rows={6} columns={kind === "siswa" ? 6 : 5} />) : <>
      {data.rows.length === 0 ? <EmptyState title={kind === "guru" && term ? "Guru tidak ditemukan" : "Belum ada data"} description={kind === "guru" && term ? "Coba kata kunci lain." : "Data yang tersedia akan ditampilkan di sini."} action={kind === "guru" && !term ? <button type="button" className="master-primary" onClick={() => setTeacherOpen(true)}>Tambah Guru</button> : kind === "siswa" ? <button type="button" className="master-primary" onClick={() => setStudentOpen(true)}>Tambah Siswa</button> : undefined} /> : kind === "ppdb" ? <div className="mt-4 space-y-3">{data.rows.map((row) => <article key={row.id} className="rounded-xl border border-[#e6dfd0] p-4"><h3 className="font-bold">{row.nama}</h3><p className="mt-2 break-all text-sm">No. {row.keterangan} · {row.status}</p><p className="mt-1 break-words text-sm text-slate-600">Email: {row.email} · Telepon: {row.telepon}</p><p className="mt-1 break-words text-sm text-slate-600">Jenjang: {row.jenjang} · Alamat: {row.alamat}</p>{row.catatan && <p className="mt-1 break-words text-sm">Catatan: {row.catatan}</p>}{row.status === "Pending" && <ReviewPPDB id={row.id} nama={row.nama} onSaved={() => { invalidateCache(["/api/sekolah/ppdb", "/api/sekolah/ringkasan"]); setVersion((value) => value + 1); }} />}</article>)}</div> : <div className={`dashboard-glass mt-5 overflow-x-auto ${chosen.length ? "mb-36 md:mb-24" : ""}`}><table className="w-full min-w-[48rem] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{kind === "siswa" && <th className="p-4"><input ref={selectAll} type="checkbox" aria-label="Pilih semua siswa aktif di halaman ini" disabled={!activeRows.length} checked={activeRows.length > 0 && selected.size === activeRows.length} onChange={(event) => setSelected(event.target.checked ? new Set(activeRows.map((row) => row.id)) : new Set())} /></th>}<th className="p-4">Nama</th><th className="p-4">{kind === "siswa" ? "NISN" : "NUPTK / Email"}</th>{kind === "siswa" && <th className="p-4">Kelas</th>}<th className="p-4">Status</th><th className="p-4">Akun LMS</th><th className="p-4">Aksi</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className="border-t border-slate-100 transition hover:bg-indigo-50/60">{kind === "siswa" && <td className="p-4"><input type="checkbox" aria-label={`Pilih ${row.nama} (${row.keterangan})`} disabled={row.status !== "Aktif" || searchInput.trim() !== term} checked={selected.has(row.id)} onChange={(event) => setSelected((previous) => { const next = new Set(previous); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /></td>}<td className="p-4 font-semibold">{row.nama}</td><td className="p-4">{row.keterangan}{kind === "guru" && <p className="mt-1 text-slate-500">{row.email}</p>}</td>{kind === "siswa" && <td className="p-4">{row.kelasId ? classes.find((item) => item.id === row.kelasId)?.nama ?? "Kelas tidak ditemukan" : "Belum ditempatkan"}</td>}<td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === "Aktif" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{row.status}</span></td><td className="p-4">{row.status !== "Aktif" ? "Data tidak aktif" : <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">{row.punyaAkun ? "Akun tersedia" : "Belum ada akun"}</span><button disabled={accountBusy || !!credential} type="button" onClick={() => manageAccount(row, kind, !!row.punyaAkun)} className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">{row.punyaAkun ? "Reset password" : "Buat akun"}</button></div>}</td><td className="p-4"><div className="flex gap-2"><button type="button" disabled={accountBusy} onClick={() => setEditing({ kind, id: row.id })} className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 disabled:opacity-50">Edit</button><button type="button" disabled={accountBusy} onClick={() => changeStatus(row, kind)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50">{row.status === "Aktif" ? "Nonaktifkan" : "Aktifkan"}</button></div></td></tr>)}</tbody></table></div>}
      {kind === "siswa" && chosen.length > 0 && <BulkPlacementAction floating students={chosen} classes={classes} onFinished={(notice) => { invalidateCache(["/api/sekolah/siswa", "/api/sekolah/kelas"]); setSelected(new Set()); setPlacementNotice(notice); setVersion((value) => value + 1); }} />}
      {(() => {
        const totalItems = data.total ?? data.rows.length;
        const displayedEnd = data.rows.length ? Math.min((page - 1) * pageSize + data.rows.length, totalItems) : 0;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        return (
          <div className="mt-6 flex flex-col items-center justify-center gap-3 text-center text-sm">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-950">
                Menampilkan {displayedEnd}/{totalItems} · Halaman {page}/{totalPages}
              </span>
              <div className="flex items-center gap-1.5" role="group" aria-label="Jumlah data per halaman">
                <span className="text-xs font-semibold text-slate-600">Per halaman:</span>
                {([10, 25, 50] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={pageSize === size}
                    onClick={() => {
                      setPageSize(size);
                      setSelected(new Set());
                      setPagination({ kind, page: 1, term });
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      pageSize === size
                        ? "bg-indigo-600 text-white shadow-xs"
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
                  setSelected(new Set());
                  setPagination({ kind, page: page - 1, term });
                }}
                className="rounded-lg border border-indigo-200 bg-white px-4 py-1.5 text-xs font-bold text-indigo-900 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Sebelumnya
              </button>
              <span className="min-w-[4.5rem] font-bold text-slate-700">{displayedEnd}/{totalItems}</span>
              <button
                type="button"
                disabled={!data.hasNext}
                onClick={() => {
                  setSelected(new Set());
                  setPagination({ kind, page: page + 1, term });
                }}
                className="rounded-lg border border-indigo-200 bg-white px-4 py-1.5 text-xs font-bold text-indigo-900 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45"
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
