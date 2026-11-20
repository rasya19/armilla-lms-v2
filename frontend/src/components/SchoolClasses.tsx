import { useEffect, useState } from "react";
import { useGlassConfirm } from "./GlassConfirm";
import { SchoolModal } from "./SchoolModal";
import { CardGridSkeleton, EmptyState } from "./DashboardUI";
import { ClassPromotion } from "./ClassPromotion";
import { BulkClassPlacement } from "./BulkClassPlacement";
import { ensureStandardClasses } from "./standardClasses";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { hasPlanAccess, type PlanSlug } from "./subscriptionPlans";
import { Lock } from "lucide-react";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { useTenantTheme } from "./TenantThemeProvider";

type ClassItem = { id: string; nama: string; waliGuruId: string | null; jumlahSiswa: number };
type Teacher = { id: string; nama: string };
type ClassData = { kelas: ClassItem[]; guru: Teacher[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClassData(value: unknown): value is ClassData {
  return isObject(value) && Array.isArray(value.kelas) && Array.isArray(value.guru)
    && value.kelas.every((item: unknown) => isObject(item) && typeof item.id === "string" && typeof item.nama === "string" && (item.waliGuruId === null || typeof item.waliGuruId === "string") && typeof item.jumlahSiswa === "number" && Number.isInteger(item.jumlahSiswa) && item.jumlahSiswa >= 0)
    && value.guru.every((item: unknown) => isObject(item) && typeof item.id === "string" && typeof item.nama === "string");
}

async function request(url: string, method = "GET", body?: object, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchWithTimeout(url, { method, signal, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(isObject(data) && typeof data.error === "string" ? data.error : `Permintaan gagal (status ${response.status}).`);
  return data;
}

const field = "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3";
const action = "mt-3 rounded-xl bg-[#0c192d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

export function SchoolClasses({
  plan = "basic",
  onRequireUpgrade,
}: {
  plan?: PlanSlug;
  onRequireUpgrade?: (featureName: string, requiredPlan: Exclude<PlanSlug, "basic">) => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const canUseReguler = hasPlanAccess(plan, "reguler");
  const confirm = useGlassConfirm();
  const [data, setData] = useState<ClassData | null>(() => getCached<ClassData>("/api/sekolah/kelas"));
  const [version, setVersion] = useState(0);
  const [nama, setNama] = useState("");
  const [wali, setWali] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [classOpen, setClassOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"list" | "promotion">("list");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<ClassData>("/api/sekolah/kelas");
    if (cached) setData(cached);
    ensureStandardClasses(controller.signal).then(() => request("/api/sekolah/kelas", "GET", undefined, controller.signal)).then((value) => {
      if (!isClassData(value)) throw new Error("Respons kelas tidak valid.");
      setCached("/api/sekolah/kelas", value);
      if (!controller.signal.aborted) { setData(value); setError(""); }
    }).catch((failure: unknown) => {
      if (!isCallerAborted(failure, controller.signal)) {
        if (!cached) { setData(null); setError(describeFetchError(failure, "Kelas belum dapat dimuat.")); }
      }
    });
    return () => controller.abort();
  }, [version]);

  async function saveClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await request(editing ? `/api/sekolah/kelas/${encodeURIComponent(editing)}` : "/api/sekolah/kelas", editing ? "PATCH" : "POST", { nama, waliGuruId: wali || null });
      invalidateCache(["/api/sekolah/kelas", "/api/sekolah/siswa", "/api/sekolah/akademik", "/api/sekolah/ringkasan"]);
      setNama(""); setWali(""); setEditing(null); setClassOpen(false); setMessage("Kelas disimpan."); setVersion((value) => value + 1);
    } catch (failure) {
      setError(describeFetchError(failure, "Kelas belum dapat disimpan."));
    } finally { setBusy(false); }
  }

  async function deleteClass(item: ClassItem) {
    if (!await confirm(`Hapus kelas ${item.nama}? Kelas yang masih digunakan tidak dapat dihapus.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await request(`/api/sekolah/kelas/${encodeURIComponent(item.id)}`, "DELETE");
      invalidateCache(["/api/sekolah/kelas", "/api/sekolah/siswa", "/api/sekolah/akademik", "/api/sekolah/ringkasan"]);
      setMessage("Kelas dihapus."); setVersion((value) => value + 1);
    } catch (failure) {
      setError(describeFetchError(failure, "Kelas belum dapat dihapus."));
    } finally { setBusy(false); }
  }

  function handleMoved() {
    invalidateCache(["/api/sekolah/kelas", "/api/sekolah/siswa"]);
    setVersion((value) => value + 1);
  }

  return <div className="mt-4 space-y-6">
    <p className="text-sm text-slate-600">Setiap siswa hanya memiliki satu kelas saat ini. Perpindahan mengganti kelas sebelumnya tanpa menyimpan riwayat. Wali kelas tidak otomatis mendapat hak reset; hak tersebut memerlukan jadwal mengajar.</p>
    {error && !classOpen && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {!data ? (error ? <button type="button" onClick={() => { setError(""); setVersion((value) => value + 1); }} className="text-sm font-bold underline">Muat ulang kelas</button> : <CardGridSkeleton count={4} columns={2} />) : <>
      <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={tab === "list"} onClick={() => setTab("list")} className={`rounded-full px-4 py-2 text-sm font-bold transition ${tab === "list" ? (isDark ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)]" : "bg-indigo-600 text-white") : (isDark ? "border border-slate-700/70 bg-slate-800/70 text-slate-300 hover:bg-slate-700/80 hover:text-white" : "bg-indigo-50 text-indigo-700")}`}>Daftar Kelas</button><button type="button" aria-pressed={tab === "promotion"} onClick={() => { if (!canUseReguler) { onRequireUpgrade?.("Kenaikan Kelas Massal", "reguler"); return; } setError(""); setMessage(""); setTab("promotion"); }} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${tab === "promotion" ? (isDark ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)]" : "bg-indigo-600 text-white") : (isDark ? "border border-slate-700/70 bg-slate-800/70 text-slate-300 hover:bg-slate-700/80 hover:text-white" : "bg-indigo-50 text-indigo-700")}`}>{!canUseReguler && <Lock size={14} aria-hidden="true" />}Kenaikan Kelas Massal{!canUseReguler && <span className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${isDark ? "bg-amber-400/20 text-amber-300" : "bg-indigo-200/80 text-indigo-950"}`}>Reguler</span>}</button></div>
      {tab === "promotion" && canUseReguler ? <ClassPromotion classes={data.kelas} onMoved={handleMoved} /> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="text-sm"><span className="sr-only">Cari kelas</span><input type="search" className={field} placeholder="Cari nama kelas" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button type="button" className="master-primary" onClick={() => { setError(""); setEditing(null); setNama(""); setWali(""); setClassOpen(true); }}>+ Tambah Kelas</button></div>
      {classOpen && <SchoolModal title={editing ? "Ubah kelas" : "Tambah kelas"} busy={busy} onClose={() => { setClassOpen(false); setError(""); }}>
      <form onSubmit={saveClass}>
        <label className="mt-3 block text-sm font-semibold">Nama kelas<input className={field} required maxLength={100} value={nama} onChange={(event) => setNama(event.target.value)} /></label>
        <label className="mt-3 block text-sm font-semibold">Wali kelas (opsional)<select className={field} value={wali} onChange={(event) => setWali(event.target.value)}><option value="">Belum ditentukan</option>{data.guru.map((item) => <option key={item.id} value={item.id}>{item.nama} ({item.id.slice(0, 8)})</option>)}</select></label>
        {!data.guru.length && <p className="mt-2 text-sm">Wali kelas dapat ditentukan setelah guru aktif ditambahkan.</p>}
        {error && <p role="alert" className="mt-2 text-sm text-rose-500">{error}</p>}
        <button disabled={busy} className={action}>{editing ? "Simpan perubahan kelas" : "Tambah kelas"}</button>
      </form></SchoolModal>}
      <section><h3 className="font-bold">Daftar kelas <span className="text-sm font-normal text-slate-600">({data.kelas.length})</span></h3>{!data.kelas.filter((item) => item.nama.toLowerCase().includes(search.trim().toLowerCase())).length ? <EmptyState title={search ? "Kelas tidak ditemukan" : "Belum ada kelas"} description={search ? "Coba nama kelas lain." : "Tambahkan kelas dan pilih wali kelas untuk memulai."} action={!search && <button type="button" className="master-primary" onClick={() => { setEditing(null); setNama(""); setWali(""); setClassOpen(true); }}>Tambah Kelas</button>} /> : <ul className="mt-2 space-y-2">{data.kelas.filter((item) => item.nama.toLowerCase().includes(search.trim().toLowerCase())).map((item) => <li key={item.id} className={`dashboard-glass p-4 text-sm transition ${isDark ? "hover:border-amber-400/35 hover:bg-slate-800/60" : "hover:bg-indigo-50/60"}`}><strong>{item.nama}</strong> ({item.id.slice(0, 8)}) · {item.jumlahSiswa} siswa aktif · Wali: {item.waliGuruId ? data.guru.find((teacher) => teacher.id === item.waliGuruId)?.nama ?? "Guru tidak aktif atau tidak ditemukan" : "Belum ditentukan"} <button type="button" disabled={busy} onClick={() => { setError(""); setEditing(item.id); setNama(item.nama); setWali(item.waliGuruId ?? ""); setClassOpen(true); }} className={`ml-2 font-bold underline disabled:opacity-50 ${isDark ? "text-amber-300" : "text-indigo-700"}`}>Ubah</button><button type="button" disabled={busy} onClick={() => deleteClass(item)} className={`ml-3 font-bold underline disabled:opacity-50 ${isDark ? "text-rose-400" : "text-rose-700"}`}>Hapus</button></li>)}</ul>}</section>
      {canUseReguler ? <BulkClassPlacement classes={data.kelas} onMoved={handleMoved} /> : (
        <section className="dashboard-glass flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900">Penempatan Siswa Massal</h3>
              <span className="inline-flex items-center gap-1 rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-indigo-900"><Lock size={11} aria-hidden="true" />Reguler</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">Tempatkan hingga 50 siswa ke kelas tujuan sekaligus. Tersedia pada Paket Reguler dan Paket Pro.</p>
          </div>
          <button type="button" onClick={() => onRequireUpgrade?.("Penempatan Siswa Massal", "reguler")} className="master-primary shrink-0">
            Lihat Info Upgrade
          </button>
        </section>
      )}
      </>}
    </>}
  </div>;
}
