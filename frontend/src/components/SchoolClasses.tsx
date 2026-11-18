import { useEffect, useState } from "react";
import { useGlassConfirm } from "./GlassConfirm";
import { SchoolModal } from "./SchoolModal";
import { EmptyState } from "./DashboardUI";
import { ClassPromotion } from "./ClassPromotion";
import { BulkClassPlacement } from "./BulkClassPlacement";
import { ensureStandardClasses } from "./standardClasses";

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

async function request(url: string, method = "GET", body?: object): Promise<unknown> {
  const response = await fetch(url, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(isObject(data) && typeof data.error === "string" ? data.error : `Permintaan gagal (status ${response.status}).`);
  return data;
}

const field = "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3";
const action = "mt-3 rounded-xl bg-[#0c192d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

export function SchoolClasses() {
  const confirm = useGlassConfirm();
  const [data, setData] = useState<ClassData | null>(null);
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
    let active = true;
    ensureStandardClasses().catch((failure: unknown) => {
      if (active) { console.error("Gagal menyiapkan kelas standar:", failure); setError(failure instanceof Error ? failure.message : "Kelas standar belum dapat disiapkan."); }
    }).then(() => request("/api/sekolah/kelas")).then((value) => {
      if (!isClassData(value)) throw new Error("Respons kelas tidak valid.");
      if (active) setData(value);
    }).catch((error: unknown) => {
      if (active) { console.error("Gagal memuat kelas:", error); setData(null); setError(error instanceof Error ? error.message : "Kelas belum dapat dimuat."); }
    });
    return () => { active = false; };
  }, [version]);

  async function saveClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await request(editing ? `/api/sekolah/kelas/${encodeURIComponent(editing)}` : "/api/sekolah/kelas", editing ? "PATCH" : "POST", { nama, waliGuruId: wali || null });
      setNama(""); setWali(""); setEditing(null); setClassOpen(false); setMessage("Kelas disimpan."); setVersion((value) => value + 1);
    } catch (error) {
      console.error("Gagal menyimpan kelas:", error);
      setError(error instanceof TypeError ? "Koneksi terputus. Muat ulang halaman untuk memeriksa hasilnya sebelum mencoba lagi." : error instanceof Error ? error.message : "Kelas belum dapat disimpan.");
    } finally { setBusy(false); }
  }

  async function deleteClass(item: ClassItem) {
    if (!await confirm(`Hapus kelas ${item.nama}? Kelas yang masih digunakan tidak dapat dihapus.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await request(`/api/sekolah/kelas/${encodeURIComponent(item.id)}`, "DELETE");
      setMessage("Kelas dihapus."); setVersion((value) => value + 1);
    } catch (failure) {
      console.error("Gagal menghapus kelas:", failure);
      setError(failure instanceof TypeError ? "Koneksi terputus. Muat ulang data sebelum mencoba lagi." : failure instanceof Error ? failure.message : "Kelas belum dapat dihapus.");
    } finally { setBusy(false); }
  }

  return <div className="mt-4 space-y-6">
    <p className="text-sm text-slate-600">Setiap siswa hanya memiliki satu kelas saat ini. Perpindahan mengganti kelas sebelumnya tanpa menyimpan riwayat. Wali kelas tidak otomatis mendapat hak reset; hak tersebut memerlukan jadwal mengajar.</p>
    {error && !classOpen && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {!data ? <button type="button" onClick={() => { setError(""); setVersion((value) => value + 1); }} className="text-sm font-bold underline">Muat ulang kelas</button> : <>
      <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={tab === "list"} onClick={() => setTab("list")} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === "list" ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"}`}>Daftar Kelas</button><button type="button" aria-pressed={tab === "promotion"} onClick={() => { setError(""); setMessage(""); setTab("promotion"); }} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === "promotion" ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"}`}>Kenaikan Kelas Massal</button></div>
      {tab === "promotion" ? <ClassPromotion classes={data.kelas} onMoved={() => setVersion((value) => value + 1)} /> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="text-sm"><span className="sr-only">Cari kelas</span><input type="search" className={field} placeholder="Cari nama kelas" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button type="button" className="master-primary" onClick={() => { setError(""); setEditing(null); setNama(""); setWali(""); setClassOpen(true); }}>+ Tambah Kelas</button></div>
      {classOpen && <SchoolModal title={editing ? "Ubah kelas" : "Tambah kelas"} busy={busy} onClose={() => { setClassOpen(false); setError(""); }}>
      <form onSubmit={saveClass}>
        <label className="mt-3 block text-sm font-semibold">Nama kelas<input className={field} required maxLength={100} value={nama} onChange={(event) => setNama(event.target.value)} /></label>
        <label className="mt-3 block text-sm font-semibold">Wali kelas (opsional)<select className={field} value={wali} onChange={(event) => setWali(event.target.value)}><option value="">Belum ditentukan</option>{data.guru.map((item) => <option key={item.id} value={item.id}>{item.nama} ({item.id.slice(0, 8)})</option>)}</select></label>
        {!data.guru.length && <p className="mt-2 text-sm">Wali kelas dapat ditentukan setelah guru aktif ditambahkan.</p>}
        {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
        <button disabled={busy} className={action}>{editing ? "Simpan perubahan kelas" : "Tambah kelas"}</button>
      </form></SchoolModal>}
      <section><h3 className="font-bold">Daftar kelas <span className="text-sm font-normal text-slate-600">({data.kelas.length})</span></h3>{!data.kelas.filter((item) => item.nama.toLowerCase().includes(search.trim().toLowerCase())).length ? <EmptyState title={search ? "Kelas tidak ditemukan" : "Belum ada kelas"} description={search ? "Coba nama kelas lain." : "Tambahkan kelas dan pilih wali kelas untuk memulai."} action={!search && <button type="button" className="master-primary" onClick={() => { setEditing(null); setNama(""); setWali(""); setClassOpen(true); }}>Tambah Kelas</button>} /> : <ul className="mt-2 space-y-2">{data.kelas.filter((item) => item.nama.toLowerCase().includes(search.trim().toLowerCase())).map((item) => <li key={item.id} className="dashboard-glass p-4 text-sm transition hover:bg-indigo-50/60"><strong>{item.nama}</strong> ({item.id.slice(0, 8)}) · {item.jumlahSiswa} siswa aktif · Wali: {item.waliGuruId ? data.guru.find((teacher) => teacher.id === item.waliGuruId)?.nama ?? "Guru tidak aktif atau tidak ditemukan" : "Belum ditentukan"} <button type="button" disabled={busy} onClick={() => { setError(""); setEditing(item.id); setNama(item.nama); setWali(item.waliGuruId ?? ""); setClassOpen(true); }} className="ml-2 font-bold text-indigo-700 underline disabled:opacity-50">Ubah</button><button type="button" disabled={busy} onClick={() => deleteClass(item)} className="ml-3 font-bold text-rose-700 underline disabled:opacity-50">Hapus</button></li>)}</ul>}</section>
      <BulkClassPlacement classes={data.kelas} onMoved={() => setVersion((value) => value + 1)} />
      </>}
    </>}
  </div>;
}
