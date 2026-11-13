import { useEffect, useState } from "react";

type ClassItem = { id: string; nama: string; waliGuruId: string };
type Teacher = { id: string; nama: string };
type Student = { id: string; nama: string; nisn: string; kelasId: string | null };
type ClassData = { kelas: ClassItem[]; guru: Teacher[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClassData(value: unknown): value is ClassData {
  return isObject(value) && Array.isArray(value.kelas) && Array.isArray(value.guru)
    && value.kelas.every((item: unknown) => isObject(item) && typeof item.id === "string" && typeof item.nama === "string" && typeof item.waliGuruId === "string")
    && value.guru.every((item: unknown) => isObject(item) && typeof item.id === "string" && typeof item.nama === "string");
}

function isStudent(value: unknown): value is Student {
  return isObject(value) && typeof value.id === "string" && typeof value.nama === "string" && typeof value.nisn === "string" && (value.kelasId === null || typeof value.kelasId === "string");
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
  const [data, setData] = useState<ClassData | null>(null);
  const [version, setVersion] = useState(0);
  const [nama, setNama] = useState("");
  const [wali, setWali] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [nisn, setNisn] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [placement, setPlacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    request("/api/sekolah/kelas").then((value) => {
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
      await request(editing ? `/api/sekolah/kelas/${encodeURIComponent(editing)}` : "/api/sekolah/kelas", editing ? "PATCH" : "POST", { nama, waliGuruId: wali });
      setNama(""); setWali(""); setEditing(null); setMessage("Kelas disimpan."); setVersion((value) => value + 1);
    } catch (error) {
      console.error("Gagal menyimpan kelas:", error);
      setError(error instanceof TypeError ? "Koneksi terputus. Muat ulang halaman untuk memeriksa hasilnya sebelum mencoba lagi." : error instanceof Error ? error.message : "Kelas belum dapat disimpan.");
    } finally { setBusy(false); }
  }

  async function searchStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage(""); setStudent(null);
    try {
      const value = await request(`/api/sekolah/penempatan-siswa?nisn=${encodeURIComponent(nisn)}`);
      if (!isStudent(value)) throw new Error("Respons siswa tidak valid.");
      setStudent(value);
      setPlacement(value.kelasId ?? "");
    } catch (error) {
      console.error("Gagal mencari siswa:", error);
      setError(error instanceof TypeError ? "Server tidak dapat dihubungi." : error instanceof Error ? error.message : "Siswa belum dapat dicari.");
    } finally { setBusy(false); }
  }

  async function savePlacement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!student || !window.confirm(`Ubah kelas ${student.nama}? Penempatan lama akan diganti dan riwayat kelas belum disimpan.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await request(`/api/sekolah/siswa/${encodeURIComponent(student.id)}/kelas`, "PATCH", { kelasId: placement || null, expectedKelasId: student.kelasId });
      setStudent(null); setMessage("Penempatan siswa disimpan. Cari kembali siswa untuk memeriksanya.");
    } catch (error) {
      console.error("Gagal menyimpan penempatan:", error);
      setStudent(null);
      setError(error instanceof TypeError ? "Koneksi terputus. Cari kembali siswa untuk memeriksa hasilnya." : error instanceof Error ? error.message : "Penempatan belum dapat disimpan.");
    } finally { setBusy(false); }
  }

  return <div className="mt-4 space-y-6">
    <p className="text-sm text-slate-600">Uji lokal: setiap siswa hanya memiliki satu kelas saat ini. Perpindahan mengganti kelas sebelumnya tanpa menyimpan riwayat. Wali kelas tidak otomatis mendapat hak reset; hak tersebut memerlukan jadwal mengajar.</p>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {!data ? <button type="button" onClick={() => { setError(""); setVersion((value) => value + 1); }} className="text-sm font-bold underline">Muat ulang kelas</button> : <>
      <form onSubmit={saveClass} className="rounded-xl border border-[#e6dfd0] p-4">
        <h3 className="font-bold">{editing ? "Ubah kelas" : "Tambah kelas"}</h3>
        <label className="mt-3 block text-sm font-semibold">Nama kelas<input className={field} required maxLength={100} value={nama} onChange={(event) => setNama(event.target.value)} /></label>
        <label className="mt-3 block text-sm font-semibold">Wali kelas<select className={field} required value={wali} onChange={(event) => setWali(event.target.value)}><option value="">Pilih guru aktif</option>{data.guru.map((item) => <option key={item.id} value={item.id}>{item.nama} ({item.id.slice(0, 8)})</option>)}</select></label>
        {!data.guru.length && <p className="mt-2 text-sm">Tambahkan guru aktif terlebih dahulu melalui Data Guru.</p>}
        <button disabled={busy || !data.guru.length} className={action}>{editing ? "Simpan perubahan kelas" : "Tambah kelas"}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setNama(""); setWali(""); }} className="ml-4 text-sm font-bold underline">Batal mengubah</button>}
      </form>
      <section><h3 className="font-bold">Daftar kelas</h3>{!data.kelas.length ? <p className="mt-2 text-sm">Belum ada kelas.</p> : <ul className="mt-2 space-y-2">{data.kelas.map((item) => <li key={item.id} className="rounded-xl border border-[#e6dfd0] p-3 text-sm"><strong>{item.nama}</strong> ({item.id.slice(0, 8)}) · Wali: {data.guru.find((teacher) => teacher.id === item.waliGuruId)?.nama ?? "Guru tidak aktif atau tidak ditemukan"} <button type="button" disabled={busy} onClick={() => { setEditing(item.id); setNama(item.nama); setWali(item.waliGuruId); }} className="ml-2 font-bold underline disabled:opacity-50">Ubah</button></li>)}</ul>}</section>
      <section className="rounded-xl border border-[#e6dfd0] p-4"><h3 className="font-bold">Penempatan siswa</h3>
        <form onSubmit={searchStudent}><label className="mt-3 block text-sm font-semibold">Cari NISN siswa<input className={field} required pattern="[0-9]{10}" maxLength={10} inputMode="numeric" value={nisn} onChange={(event) => { setNisn(event.target.value); setStudent(null); }} /></label><button disabled={busy} className={action}>Cari siswa</button></form>
        {student && <form onSubmit={savePlacement} className="mt-4"><p className="font-bold">{student.nama} · {student.nisn}</p><p className="mt-1 text-sm">Kelas saat ini: {student.kelasId ? data.kelas.find((item) => item.id === student.kelasId)?.nama ?? "Tidak ditemukan di sekolah ini" : "Belum ditempatkan"}</p><label className="mt-3 block text-sm font-semibold">Kelas baru<select className={field} value={placement} onChange={(event) => setPlacement(event.target.value)}><option value="">Tidak ditempatkan</option>{student.kelasId && !data.kelas.some((item) => item.id === student.kelasId) && <option value={student.kelasId} disabled>Kelas saat ini tidak ditemukan</option>}{data.kelas.map((item) => <option key={item.id} value={item.id}>{item.nama} ({item.id.slice(0, 8)})</option>)}</select></label><button disabled={busy || placement === (student.kelasId ?? "")} className={action}>Simpan penempatan</button></form>}
      </section>
    </>}
  </div>;
}
