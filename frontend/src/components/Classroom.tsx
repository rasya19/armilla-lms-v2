import { useEffect, useState } from "react";
import { BookOpen, GraduationCap, Users } from "lucide-react";
import { CardGridSkeleton, DashboardHero, EmptyState, TableSkeleton } from "./DashboardUI";
import { LmsLearning } from "./LmsLearning";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type Role = "ADMIN" | "GURU" | "SISWA";
type Named = { id: string; nama: string };
type Room = Named & { wali: string | null; jumlahSiswa: number; jumlahMapel: number; tugasAktif: number };
type Details = Named & { wali: string | null; siswa: Named[]; guru: Named[]; mapel: Named[]; presensi: string | null };
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function named(value: unknown): value is Named & Record<string, unknown> { return object(value) && typeof value.id === "string" && typeof value.nama === "string"; }
function room(value: unknown): value is Room {
  return named(value) && object(value) && (value.wali === null || typeof value.wali === "string") && typeof value.jumlahSiswa === "number" && typeof value.jumlahMapel === "number" && typeof value.tugasAktif === "number";
}
function details(value: unknown): value is Details {
  return named(value) && object(value) && (value.wali === null || typeof value.wali === "string") && Array.isArray(value.siswa) && value.siswa.every(named) && Array.isArray(value.guru) && value.guru.every(named) && Array.isArray(value.mapel) && value.mapel.every(named) && (value.presensi === null || typeof value.presensi === "string");
}
async function request(path: string, method = "GET", signal?: AbortSignal, sandboxRole?: "GURU" | "SISWA"): Promise<unknown> {
  const response = await fetchWithTimeout(path, {
    method,
    signal,
    ...(sandboxRole ? { headers: { "X-Dev-Sandbox-Role": sandboxRole } } : {}),
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(object(value) && typeof value.error === "string" ? value.error : `Permintaan gagal (${response.status}).`);
  return value;
}
function failureMessage(failure: unknown) {
  return describeFetchError(failure, "Ruang kelas belum dapat dimuat.");
}

export function Classroom({ role, sandboxRole }: { role: Role; sandboxRole?: "GURU" | "SISWA" }) {
  const base = `/api/${role === "ADMIN" ? "sekolah" : "lms"}/ruang-kbm`;
  const cacheKey = `${base}::${sandboxRole ?? "real"}`;
  const [rooms, setRooms] = useState<Room[] | null>(() => getCached<Room[]>(cacheKey));
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<Room[]>(cacheKey);
    if (cached) setRooms(cached);
    setError("");
    request(base, "GET", controller.signal, sandboxRole).then((value) => {
      if (!object(value) || !Array.isArray(value.rows) || !value.rows.every(room)) throw new Error("Respons lobi kelas tidak valid.");
      setCached(cacheKey, value.rows);
      setRooms(value.rows);
    }).catch((failure: unknown) => {
      if (!isCallerAborted(failure, controller.signal) && !cached) { setError(failureMessage(failure)); }
    });
    return () => controller.abort();
  }, [base, cacheKey, version, sandboxRole]);
  if (selected) return <ClassroomWorkspace key={selected} role={role} sandboxRole={sandboxRole} base={base} kelasId={selected} onExit={() => { setSelected(null); setVersion((value) => value + 1); }} />;
  return <section className="dashboard-glass space-y-6 rounded-2xl p-6">
    <DashboardHero title="Ruang KBM & Materi" description="Masuk ke kelas untuk mengikuti kegiatan belajar, materi ajar, dan tugas bersama." />
    {error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error} <button type="button" className="font-bold underline" onClick={() => setVersion((value) => value + 1)}>Coba lagi</button></p> : !rooms ? <CardGridSkeleton count={3} columns={3} /> : rooms.length === 0 ? <EmptyState title={role === "SISWA" ? "Belum tergabung di ruang kelas" : "Belum ada ruang kelas"} description={role === "SISWA" ? "Anda belum tergabung di ruang kelas. Hubungi operator sekolah untuk penempatan kelas." : "Tambahkan kelas di Manajemen Kelas terlebih dahulu."} /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rooms.map((item) => <article key={item.id} className="dashboard-glass space-y-3 rounded-2xl p-5">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-100 p-3 text-indigo-700"><GraduationCap size={22} /></span><div><h2 className="font-bold text-slate-900">{role === "SISWA" ? `Selamat Datang di ${item.nama}` : item.nama}</h2><p className="text-sm text-slate-700">Wali Kelas: {item.wali ?? "Belum ditentukan"}</p></div></div>
      <p className="text-sm text-slate-700">{item.jumlahSiswa} siswa · {item.jumlahMapel} mapel · {item.tugasAktif} tugas aktif</p>
      <button type="button" className="master-primary" onClick={() => setSelected(item.id)}>{role === "SISWA" ? "Masuk ke Ruang Kelas →" : "Masuk Kelas"}</button>
    </article>)}</div>}
  </section>;
}

function ClassroomWorkspace({ role, sandboxRole, base, kelasId, onExit }: { role: Role; sandboxRole?: "GURU" | "SISWA"; base: string; kelasId: string; onExit: () => void }) {
  const endpoint = `${base}/${encodeURIComponent(kelasId)}`;
  const detailCacheKey = `${endpoint}::${sandboxRole ?? "real"}`;
  const [data, setData] = useState<Details | null>(() => getCached<Details>(detailCacheKey));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<"materi" | "tugas" | "warga">("materi");
  const [mapelId, setMapelId] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<Details>(detailCacheKey);
    if (cached) setData(cached);
    request(endpoint, "GET", controller.signal, sandboxRole).then((value) => {
      if (!details(value) || value.id !== kelasId) throw new Error("Respons ruang kelas tidak valid.");
      setCached(detailCacheKey, value);
      setData(value);
      setError("");
    }).catch((failure: unknown) => {
      if (!isCallerAborted(failure, controller.signal) && !cached) { setError(failureMessage(failure)); }
    });
    return () => controller.abort();
  }, [endpoint, detailCacheKey, kelasId, version, sandboxRole]);
  async function hadir() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const value = await request(`${base}/${encodeURIComponent(kelasId)}/hadir`, "POST", undefined, sandboxRole);
      if (!object(value) || typeof value.status !== "string" || typeof value.sudahAda !== "boolean") throw new Error("Respons kehadiran tidak valid. Muat ulang untuk memeriksa.");
      invalidateCache([detailCacheKey, "/api/sekolah/rekap-akademik"]);
      setNotice(value.sudahAda ? `Presensi hari ini sudah tercatat: ${value.status}.` : "Kehadiran hari ini berhasil dicatat.");
      setVersion((current) => current + 1);
    } catch (failure) { setError(failureMessage(failure)); setVersion((current) => current + 1); }
    finally { setBusy(false); }
  }
  return <div className="animate-page-enter space-y-4">
    <button type="button" onClick={onExit} disabled={busy} className="font-bold text-indigo-800 underline disabled:opacity-50">← {role === "SISWA" ? "Kembali ke lobi" : "Ganti / Keluar Kelas"}</button>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error} <button type="button" className="font-bold underline" onClick={() => { setError(""); setVersion((value) => value + 1); }}>Muat ulang</button></p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    {!data ? !error && <TableSkeleton rows={4} columns={3} /> : <>
      <DashboardHero title={data.nama} description={`Wali Kelas: ${data.wali ?? "Belum ditentukan"}`} badge={`${data.siswa.length} siswa aktif`} action={role === "SISWA" ? <button type="button" className="dashboard-hero-action" disabled={busy || !!data.presensi} onClick={hadir}>{busy ? "Mencatat..." : data.presensi ? `Presensi hari ini: ${data.presensi}` : "Konfirmasi Hadir Hari Ini"}</button> : undefined} />
      <div className="dashboard-glass flex flex-wrap gap-2 p-4" aria-label="Filter mata pelajaran"><button type="button" aria-pressed={!mapelId} onClick={() => setMapelId("")} className={`rounded-full px-3 py-2 text-sm font-bold ${!mapelId ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"}`}>Semua Mapel</button>{data.mapel.map((item) => <button key={item.id} type="button" aria-pressed={mapelId === item.id} onClick={() => setMapelId(item.id)} className={`rounded-full px-3 py-2 text-sm font-bold ${mapelId === item.id ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"}`}>{item.nama}</button>)}</div>
      <div className="flex flex-wrap gap-2">{([["materi", "Materi & Pengumuman"], ["tugas", "Tugas Kelas"], ["warga", "Warga Kelas"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === id ? "bg-indigo-600 text-white" : "bg-white/70 text-slate-700"}`}>{label}</button>)}</div>
      {tab === "warga" ? <div className="grid gap-4 md:grid-cols-2"><section className="dashboard-glass p-5"><h2 className="flex items-center gap-2 font-bold"><BookOpen size={18} /> Guru Pengampu</h2>{data.guru.length ? <ul className="mt-3 space-y-2">{data.guru.map((item) => <li key={item.id}>{item.nama}</li>)}</ul> : <p className="mt-3 text-sm">Belum ada guru dengan jadwal aktif.</p>}</section><section className="dashboard-glass p-5"><h2 className="flex items-center gap-2 font-bold"><Users size={18} /> Siswa</h2>{data.siswa.length ? <ul className="mt-3 space-y-2">{data.siswa.map((item) => <li key={item.id}>{item.nama}</li>)}</ul> : <p className="mt-3 text-sm">Belum ada siswa aktif.</p>}</section></div> : <LmsLearning key={`${kelasId}-${tab}`} role={role} sandboxRole={sandboxRole} kelasId={kelasId} mapelId={mapelId || undefined} initialKind={tab} />}
    </>}
  </div>;
}
