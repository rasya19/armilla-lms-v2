import { useEffect, useState } from "react";

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

export function SchoolAcademics() {
  const [data, setData] = useState<Data | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [yearId, setYearId] = useState<string | null>(null);
  const [year, setYear] = useState({ nama: "", semester: "Ganjil", mulai: "", selesai: "" });
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [subject, setSubject] = useState({ nama: "", kkm: "75" });
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
    if (yearId && !window.confirm("Mengubah tanggal tahun ajaran dapat mengubah akses guru untuk reset password siswa. Lanjutkan?")) return;
    if (await mutate(yearId ? `/tahun/${encodeURIComponent(yearId)}` : "/tahun", yearId ? "PATCH" : "POST", year, "Tahun ajaran disimpan.")) {
      setYearId(null); setYear({ nama: "", semester: "Ganjil", mulai: "", selesai: "" });
    }
  }
  async function saveSubject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await mutate(subjectId ? `/mapel/${encodeURIComponent(subjectId)}` : "/mapel", subjectId ? "PATCH" : "POST", { nama: subject.nama, kkm: Number(subject.kkm) }, "Mata pelajaran disimpan.")) {
      setSubjectId(null); setSubject({ nama: "", kkm: "75" });
    }
  }
  async function saveSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("Jadwal pada tahun ajaran aktif memberi guru izin reset password siswa di kelas ini. Lanjutkan?")) return;
    if (await mutate("/jadwal", "POST", { ...schedule, hari: Number(schedule.hari) }, "Jadwal disimpan.")) setSchedule({ tahunAjaranId: "", kelasId: "", mapelId: "", guruId: "", hari: "1", jamMulai: "", jamSelesai: "" });
  }
  async function deleteSchedule(item: Schedule) {
    if (!window.confirm("Hapus jadwal ini? Guru bisa kehilangan izin reset siswa di kelas terkait. Untuk koreksi, buat ulang jadwal yang benar.")) return;
    await mutate(`/jadwal/${encodeURIComponent(item.id)}`, "DELETE", undefined, "Jadwal dihapus.");
  }
  const name = (items: Named[], id: string) => {
    const item = items.find((entry) => entry.id === id);
    return item ? `${item.nama} (${item.id.slice(0, 8)})` : "Tidak ditemukan atau tidak aktif";
  };
  return <div className="mt-4 space-y-6">
    <p className="text-sm text-slate-600">Uji lokal. Tahun ajaran dianggap aktif berdasarkan tanggal Jakarta, termasuk hari mulai dan selesai. Beberapa periode dapat aktif bersamaan; periksa tanggal dengan teliti. Bentrok jam jadwal belum diperiksa otomatis.</p>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {!data ? <button type="button" onClick={() => { setError(""); setVersion((v) => v + 1); }} className="text-sm font-bold underline">Muat ulang data akademik</button> : <>
      <form onSubmit={saveYear} className="rounded-xl border border-[#e6dfd0] p-4">
        <h3 className="font-bold">{yearId ? "Ubah tahun ajaran" : "Tambah tahun ajaran"}</h3>
        <label className="mt-3 block text-sm font-semibold">Nama tahun ajaran<input className={field} required maxLength={100} placeholder="2026/2027" value={year.nama} onChange={(e) => setYear({ ...year, nama: e.target.value })} /></label>
        <label className="mt-3 block text-sm font-semibold">Semester<select className={field} value={year.semester} onChange={(e) => setYear({ ...year, semester: e.target.value })}><option>Ganjil</option><option>Genap</option></select></label>
        <label className="mt-3 block text-sm font-semibold">Tanggal mulai<input type="date" className={field} required value={year.mulai} onChange={(e) => setYear({ ...year, mulai: e.target.value })} /></label>
        <label className="mt-3 block text-sm font-semibold">Tanggal selesai<input type="date" className={field} required min={year.mulai} value={year.selesai} onChange={(e) => setYear({ ...year, selesai: e.target.value })} /></label>
        <button disabled={busy} className={action}>{yearId ? "Simpan tahun ajaran" : "Tambah tahun ajaran"}</button>
        {yearId && <button type="button" onClick={() => { setYearId(null); setYear({ nama: "", semester: "Ganjil", mulai: "", selesai: "" }); }} className="ml-3 text-sm font-bold underline">Batal</button>}
        <ul className="mt-4 space-y-2">{data.tahun.map((item) => <li key={item.id} className="text-sm">{item.nama} · {item.semester} · {item.mulai.slice(0, 10)} s.d. {item.selesai.slice(0, 10)} <button type="button" disabled={busy} className="font-bold underline" onClick={() => { setYearId(item.id); setYear({ nama: item.nama, semester: item.semester, mulai: item.mulai.slice(0, 10), selesai: item.selesai.slice(0, 10) }); }}>Ubah</button></li>)}</ul>
      </form>
      <form onSubmit={saveSubject} className="rounded-xl border border-[#e6dfd0] p-4">
        <h3 className="font-bold">{subjectId ? "Ubah mata pelajaran" : "Tambah mata pelajaran"}</h3>
        <label className="mt-3 block text-sm font-semibold">Nama mata pelajaran<input className={field} required maxLength={100} value={subject.nama} onChange={(e) => setSubject({ ...subject, nama: e.target.value })} /></label>
        <label className="mt-3 block text-sm font-semibold">KKM<input type="number" className={field} required min="0" max="100" step="1" value={subject.kkm} onChange={(e) => setSubject({ ...subject, kkm: e.target.value })} /></label>
        <button disabled={busy} className={action}>{subjectId ? "Simpan mata pelajaran" : "Tambah mata pelajaran"}</button>
        {subjectId && <button type="button" onClick={() => { setSubjectId(null); setSubject({ nama: "", kkm: "75" }); }} className="ml-3 text-sm font-bold underline">Batal</button>}
        <ul className="mt-4 space-y-2">{data.mapel.map((item) => <li key={item.id} className="text-sm">{item.nama} · KKM {item.kkm} ({item.id.slice(0, 8)}) <button type="button" disabled={busy} className="font-bold underline" onClick={() => { setSubjectId(item.id); setSubject({ nama: item.nama, kkm: String(item.kkm) }); }}>Ubah</button></li>)}</ul>
      </form>
      <form onSubmit={saveSchedule} className="rounded-xl border border-[#e6dfd0] p-4">
        <h3 className="font-bold">Tambah jadwal mengajar</h3>
        {([["tahunAjaranId", "Tahun ajaran", data.tahun], ["kelasId", "Kelas", data.kelas], ["guruId", "Guru aktif", data.guru], ["mapelId", "Mata pelajaran", data.mapel]] as const).map(([key, label, options]) => <label key={key} className="mt-3 block text-sm font-semibold">{label}<select className={field} required value={schedule[key]} onChange={(e) => setSchedule({ ...schedule, [key]: e.target.value })}><option value="">Pilih {label.toLowerCase()}</option>{options.map((item) => <option key={item.id} value={item.id}>{item.nama}{"semester" in item ? ` · ${item.semester}` : ""} ({item.id.slice(0, 8)})</option>)}</select></label>)}
        <label className="mt-3 block text-sm font-semibold">Hari<select className={field} value={schedule.hari} onChange={(e) => setSchedule({ ...schedule, hari: e.target.value })}>{days.slice(1).map((day, i) => <option key={day} value={String(i + 1)}>{day}</option>)}</select></label>
        <label className="mt-3 block text-sm font-semibold">Jam mulai<input className={field} type="time" required value={schedule.jamMulai} onChange={(e) => setSchedule({ ...schedule, jamMulai: e.target.value })} /></label>
        <label className="mt-3 block text-sm font-semibold">Jam selesai<input className={field} type="time" required value={schedule.jamSelesai} onChange={(e) => setSchedule({ ...schedule, jamSelesai: e.target.value })} /></label>
        <button disabled={busy || !data.tahun.length || !data.kelas.length || !data.guru.length || !data.mapel.length} className={action}>Tambah jadwal</button>
        <p className="mt-2 text-sm">Tambahkan tahun ajaran, kelas, guru aktif, dan mata pelajaran terlebih dahulu.</p>
      </form>
      <section><h3 className="font-bold">Daftar jadwal</h3>{!data.jadwal.length ? <p className="mt-2 text-sm">Belum ada jadwal.</p> : <ul className="mt-2 space-y-2">{data.jadwal.map((item) => <li key={item.id} className="rounded-xl border border-[#e6dfd0] p-3 text-sm"><p className="font-bold">{days[item.hari] ?? `Hari ${item.hari}`} · {item.jamMulai}–{item.jamSelesai}</p><p>{name(data.tahun, item.tahunAjaranId)} · {name(data.kelas, item.kelasId)}</p><p>{name(data.mapel, item.mapelId)} · {name(data.guru, item.guruId)}</p><button disabled={busy} type="button" onClick={() => deleteSchedule(item)} className="mt-2 font-bold text-rose-700 underline disabled:opacity-50">Hapus jadwal</button></li>)}</ul>}</section>
    </>}
  </div>;
}
