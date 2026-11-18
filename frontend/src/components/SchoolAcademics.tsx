import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useGlassConfirm } from "./GlassConfirm";
import { SchoolModal } from "./SchoolModal";
import { EmptyState } from "./DashboardUI";

type Named = { id: string; nama: string };
type Year = Named & { semester: string; mulai: string; selesai: string };
type Subject = Named & { kkm: number };
type Schedule = { id: string; tahunAjaranId: string; kelasId: string; mapelId: string; guruId: string; hari: number; jamMulai: string; jamSelesai: string };
type Data = { tahun: Year[]; mapel: Subject[]; kelas: Named[]; guru: Named[]; jadwal: Schedule[] };
const days = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white p-2";
const action = "mt-3 rounded-xl bg-[#0c192d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNamed(value: unknown): value is Named {
  return isObject(value) && typeof value.id === "string" && typeof value.nama === "string";
}
function isData(value: unknown): value is Data {
  return isObject(value) && Array.isArray(value.tahun) && value.tahun.every((x: unknown) => isObject(x) && typeof x.id === "string" && typeof x.nama === "string" && typeof x.semester === "string" && typeof x.mulai === "string" && typeof x.selesai === "string")
    && Array.isArray(value.mapel) && value.mapel.every((x: unknown) => isObject(x) && typeof x.id === "string" && typeof x.nama === "string" && typeof x.kkm === "number")
    && Array.isArray(value.kelas) && value.kelas.every(isNamed) && Array.isArray(value.guru) && value.guru.every(isNamed)
    && Array.isArray(value.jadwal) && value.jadwal.every((x: unknown) => isObject(x) && typeof x.id === "string" && typeof x.tahunAjaranId === "string" && typeof x.kelasId === "string" && typeof x.mapelId === "string" && typeof x.guruId === "string" && typeof x.hari === "number" && typeof x.jamMulai === "string" && typeof x.jamSelesai === "string");
}
async function request(path: string, method = "GET", body?: object): Promise<unknown> {
  const response = await fetch(`/api/sekolah/akademik${path}`, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(isObject(result) && typeof result.error === "string" ? result.error : `Permintaan gagal (status ${response.status}).`);
  return result;
}

export function SchoolAcademics({ mode }: { mode: "mapel" | "akademik" }) {
  const confirm = useGlassConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [yearId, setYearId] = useState<string | null>(null);
  const [year, setYear] = useState({ nama: "", semester: "Ganjil", mulai: "", selesai: "" });
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [subject, setSubject] = useState({ nama: "", kkm: "75" });
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [academicModal, setAcademicModal] = useState<"tahun" | "jadwal" | null>(null);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState({ tahunAjaranId: "", kelasId: "", mapelId: "", guruId: "", hari: "1", jamMulai: "", jamSelesai: "" });

  useEffect(() => {
    let active = true;
    request("").then((result) => {
      if (!isData(result)) throw new Error("Respons akademik tidak valid.");
      if (active) setData(result);
    }).catch((failure: unknown) => {
      if (active) { console.error("Gagal memuat akademik:", failure); setData(null); setError(failure instanceof Error ? failure.message : "Data belum dapat dimuat."); }
    });
    return () => { active = false; };
  }, [version]);

  async function mutate(path: string, method: string, body: object | undefined, success: string): Promise<boolean> {
    setBusy(true); setError(""); setMessage("");
    try {
      await request(path, method, body);
      setMessage(success); setVersion((v) => v + 1);
      return true;
    } catch (failure) {
      console.error("Gagal menyimpan data akademik:", failure);
      setError(failure instanceof TypeError ? "Koneksi terputus. Muat ulang data untuk memeriksa hasilnya sebelum mencoba lagi." : failure instanceof Error ? failure.message : "Data belum dapat disimpan.");
      return false;
    } finally { setBusy(false); }
  }
  async function saveYear(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (yearId && !await confirm("Mengubah tanggal tahun ajaran dapat mengubah akses guru untuk reset password siswa. Lanjutkan?")) return;
    if (await mutate(yearId ? `/tahun/${encodeURIComponent(yearId)}` : "/tahun", yearId ? "PATCH" : "POST", year, "Tahun ajaran disimpan.")) {
      setYearId(null); setYear({ nama: "", semester: "Ganjil", mulai: "", selesai: "" }); setAcademicModal(null);
    }
  }
  async function saveSubject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await mutate(subjectId ? `/mapel/${encodeURIComponent(subjectId)}` : "/mapel", subjectId ? "PATCH" : "POST", { nama: subject.nama, kkm: Number(subject.kkm) }, "Mata pelajaran disimpan.")) {
      setSubjectId(null); setSubject({ nama: "", kkm: "75" }); setSubjectOpen(false);
    }
  }
  async function saveSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!await confirm("Perubahan jadwal dapat mengubah izin guru untuk reset password siswa di kelas terkait. Lanjutkan?")) return;
    if (await mutate(scheduleId ? `/jadwal/${encodeURIComponent(scheduleId)}` : "/jadwal", scheduleId ? "PATCH" : "POST", { ...schedule, hari: Number(schedule.hari) }, "Jadwal disimpan.")) { setSchedule({ tahunAjaranId: "", kelasId: "", mapelId: "", guruId: "", hari: "1", jamMulai: "", jamSelesai: "" }); setScheduleId(null); setAcademicModal(null); }
  }
  async function deleteItem(kind: "tahun" | "mapel", item: Named) {
    if (!await confirm(`Hapus ${kind === "tahun" ? "tahun ajaran" : "mata pelajaran"} ${item.nama}? Data yang masih digunakan tidak dapat dihapus.`)) return;
    await mutate(`/${kind}/${encodeURIComponent(item.id)}`, "DELETE", undefined, "Data dihapus.");
  }
  async function deleteSchedule(item: Schedule) {
    if (!await confirm("Hapus jadwal ini? Guru bisa kehilangan izin reset siswa di kelas terkait. Untuk koreksi, buat ulang jadwal yang benar.")) return;
    await mutate(`/jadwal/${encodeURIComponent(item.id)}`, "DELETE", undefined, "Jadwal dihapus.");
  }
  const name = (items: Named[], id: string) => {
    const item = items.find((entry) => entry.id === id);
    return item ? `${item.nama} (${item.id.slice(0, 8)})` : "Tidak ditemukan atau tidak aktif";
  };
  return <div className="mt-4 space-y-6">
    {mode === "akademik" && <p className="text-sm text-slate-600">Tahun ajaran dianggap aktif berdasarkan tanggal Jakarta, termasuk hari mulai dan selesai. Beberapa periode dapat aktif bersamaan; periksa tanggal dengan teliti. Bentrok jam jadwal belum diperiksa otomatis.</p>}
    {error && !(mode === "mapel" && subjectOpen) && !academicModal && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {!data ? <button type="button" onClick={() => { setError(""); setVersion((v) => v + 1); }} className="text-sm font-bold underline">Muat ulang data akademik</button> : <>
      {mode === "akademik" && <section><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Tahun ajaran</h3><button type="button" className="master-primary" onClick={() => { setError(""); setYearId(null); setYear({ nama: "", semester: "Ganjil", mulai: "", selesai: "" }); setAcademicModal("tahun"); }}>+ Tambah tahun ajaran</button></div>
        {!data.tahun.length ? <EmptyState title="Belum ada tahun ajaran" description="Tambahkan tahun ajaran untuk membuat jadwal." action={<button type="button" className="master-primary" onClick={() => { setYearId(null); setYear({ nama: "", semester: "Ganjil", mulai: "", selesai: "" }); setAcademicModal("tahun"); }}>Tambah tahun ajaran</button>} /> : <ul className="mt-4 space-y-2">{data.tahun.map((item) => <li key={item.id} className="dashboard-glass p-4 text-sm">{item.nama} · {item.semester} · {item.mulai.slice(0, 10)} s.d. {item.selesai.slice(0, 10)} <button type="button" disabled={busy} className="font-bold text-indigo-700 underline" onClick={() => { setError(""); setYearId(item.id); setYear({ nama: item.nama, semester: item.semester, mulai: item.mulai.slice(0, 10), selesai: item.selesai.slice(0, 10) }); setAcademicModal("tahun"); }}>Ubah</button><button type="button" disabled={busy} onClick={() => deleteItem("tahun", item)} className="ml-3 font-bold text-rose-700 underline disabled:opacity-50">Hapus</button></li>)}</ul>}
        {academicModal === "tahun" && <SchoolModal title={yearId ? "Ubah tahun ajaran" : "Tambah tahun ajaran"} busy={busy} onClose={() => { setAcademicModal(null); setError(""); }}><form onSubmit={saveYear}>
        <label className="mt-3 block text-sm font-semibold">Nama tahun ajaran<input className={field} required maxLength={100} placeholder="2026/2027" value={year.nama} onChange={(e) => setYear({ ...year, nama: e.target.value })} /></label>
        <label className="mt-3 block text-sm font-semibold">Semester<select className={field} value={year.semester} onChange={(e) => setYear({ ...year, semester: e.target.value })}><option>Ganjil</option><option>Genap</option></select></label>
        <label className="mt-3 block text-sm font-semibold">Tanggal mulai<input type="date" className={field} required value={year.mulai} onChange={(e) => setYear({ ...year, mulai: e.target.value })} /></label>
        <label className="mt-3 block text-sm font-semibold">Tanggal selesai<input type="date" className={field} required min={year.mulai} value={year.selesai} onChange={(e) => setYear({ ...year, selesai: e.target.value })} /></label>
        <button disabled={busy} className={action}>{yearId ? "Simpan tahun ajaran" : "Tambah tahun ajaran"}</button>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      </form></SchoolModal>}</section>}
      {mode === "mapel" && <section>
        <div className="flex flex-wrap items-center justify-between gap-3"><label><span className="sr-only">Cari mata pelajaran</span><input type="search" className={field} placeholder="Cari mata pelajaran" value={subjectSearch} onChange={(event) => setSubjectSearch(event.target.value)} /></label><p className="text-sm text-slate-600">{data.mapel.length} mata pelajaran</p><button type="button" onClick={() => { setError(""); setSubjectId(null); setSubject({ nama: "", kkm: "75" }); setSubjectOpen(true); }} className="master-primary gap-2"><Plus size={18} />Tambah Mapel</button></div>
        {!data.mapel.filter((item) => item.nama.toLowerCase().includes(subjectSearch.trim().toLowerCase())).length ? <EmptyState title={subjectSearch ? "Mata pelajaran tidak ditemukan" : "Belum ada mata pelajaran"} description={subjectSearch ? "Coba kata kunci lain." : "Tambahkan mata pelajaran untuk membuat jadwal."} action={!subjectSearch && <button type="button" className="master-primary" onClick={() => { setSubjectId(null); setSubject({ nama: "", kkm: "75" }); setSubjectOpen(true); }}>Tambah Mapel</button>} /> : <div className="dashboard-glass mt-4 overflow-x-auto"><table className="w-full min-w-[24rem] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Mata pelajaran</th><th className="p-4">KKM</th><th className="p-4">Aksi</th></tr></thead><tbody>{data.mapel.filter((item) => item.nama.toLowerCase().includes(subjectSearch.trim().toLowerCase())).map((item) => <tr key={item.id} className="border-t border-slate-100 transition hover:bg-indigo-50/60"><td className="p-4 font-semibold">{item.nama}</td><td className="p-4">{item.kkm}</td><td className="p-4"><button type="button" disabled={busy} className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50" onClick={() => { setError(""); setSubjectId(item.id); setSubject({ nama: item.nama, kkm: String(item.kkm) }); setSubjectOpen(true); }}>Ubah</button><button type="button" disabled={busy} onClick={() => deleteItem("mapel", item)} className="ml-3 font-bold text-rose-700 underline disabled:opacity-50">Hapus</button></td></tr>)}</tbody></table></div>}
        {subjectOpen && <SchoolModal title={subjectId ? "Ubah mata pelajaran" : "Tambah mata pelajaran"} busy={busy} onClose={() => { setSubjectOpen(false); setError(""); }}>
          <form onSubmit={saveSubject}>
            <label className="mt-3 block text-sm font-semibold">Nama mata pelajaran<input className={field} required maxLength={100} value={subject.nama} onChange={(e) => setSubject({ ...subject, nama: e.target.value })} /></label>
            <label className="mt-3 block text-sm font-semibold">KKM<input type="number" className={field} required min="0" max="100" step="1" value={subject.kkm} onChange={(e) => setSubject({ ...subject, kkm: e.target.value })} /></label>
            {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
            <button disabled={busy} className="master-primary mt-4 w-full disabled:opacity-50">{subjectId ? "Simpan mata pelajaran" : "Tambah mata pelajaran"}</button>
          </form>
        </SchoolModal>}
      </section>}
      {mode === "akademik" && <><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Daftar jadwal</h3><button type="button" className="master-primary" onClick={() => { setError(""); setScheduleId(null); setSchedule({ tahunAjaranId: "", kelasId: "", mapelId: "", guruId: "", hari: "1", jamMulai: "", jamSelesai: "" }); setAcademicModal("jadwal"); }}>+ Tambah jadwal</button></div>
        {academicModal === "jadwal" && <SchoolModal title={scheduleId ? "Ubah jadwal mengajar" : "Tambah jadwal mengajar"} busy={busy} onClose={() => { setAcademicModal(null); setError(""); }}><form onSubmit={saveSchedule}>
        {([["tahunAjaranId", "Tahun ajaran", data.tahun], ["kelasId", "Kelas", data.kelas], ["guruId", "Guru aktif", data.guru], ["mapelId", "Mata pelajaran", data.mapel]] as const).map(([key, label, options]) => <label key={key} className="mt-3 block text-sm font-semibold">{label}<select className={field} required value={schedule[key]} onChange={(e) => setSchedule({ ...schedule, [key]: e.target.value })}><option value="">Pilih {label.toLowerCase()}</option>{options.map((item) => <option key={item.id} value={item.id}>{item.nama}{"semester" in item ? ` · ${item.semester}` : ""} ({item.id.slice(0, 8)})</option>)}</select></label>)}
        <label className="mt-3 block text-sm font-semibold">Hari<select className={field} value={schedule.hari} onChange={(e) => setSchedule({ ...schedule, hari: e.target.value })}>{days.slice(1).map((day, i) => <option key={day} value={String(i + 1)}>{day}</option>)}</select></label>
        <label className="mt-3 block text-sm font-semibold">Jam mulai<input className={field} type="time" required value={schedule.jamMulai} onChange={(e) => setSchedule({ ...schedule, jamMulai: e.target.value })} /></label>
        <label className="mt-3 block text-sm font-semibold">Jam selesai<input className={field} type="time" required value={schedule.jamSelesai} onChange={(e) => setSchedule({ ...schedule, jamSelesai: e.target.value })} /></label>
        <button disabled={busy || !data.tahun.length || !data.kelas.length || !data.guru.length || !data.mapel.length} className={action}>{scheduleId ? "Simpan jadwal" : "Tambah jadwal"}</button>
        <p className="mt-2 text-sm">Tambahkan tahun ajaran, kelas, guru aktif, dan mata pelajaran terlebih dahulu.</p>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      </form></SchoolModal>}
      <section>{!data.jadwal.length ? <EmptyState title="Belum ada jadwal" description="Buat jadwal setelah tahun ajaran, kelas, guru, dan mata pelajaran tersedia." action={<button type="button" className="master-primary" onClick={() => { setScheduleId(null); setSchedule({ tahunAjaranId: "", kelasId: "", mapelId: "", guruId: "", hari: "1", jamMulai: "", jamSelesai: "" }); setAcademicModal("jadwal"); }}>Tambah jadwal</button>} /> : <ul className="mt-2 space-y-2">{data.jadwal.map((item) => <li key={item.id} className="dashboard-glass p-4 text-sm"><p className="font-bold">{days[item.hari] ?? `Hari ${item.hari}`} · {item.jamMulai}–{item.jamSelesai}</p><p>{name(data.tahun, item.tahunAjaranId)} · {name(data.kelas, item.kelasId)}</p><p>{name(data.mapel, item.mapelId)} · {name(data.guru, item.guruId)}</p><button disabled={busy} type="button" onClick={() => { setError(""); setScheduleId(item.id); setSchedule({ tahunAjaranId: item.tahunAjaranId, kelasId: item.kelasId, mapelId: item.mapelId, guruId: item.guruId, hari: String(item.hari), jamMulai: item.jamMulai, jamSelesai: item.jamSelesai }); setAcademicModal("jadwal"); }} className="mt-2 font-bold text-indigo-700 underline disabled:opacity-50">Ubah</button><button disabled={busy} type="button" onClick={() => deleteSchedule(item)} className="ml-3 mt-2 font-bold text-rose-700 underline disabled:opacity-50">Hapus jadwal</button></li>)}</ul>}</section></>}
    </>}
  </div>;
}
