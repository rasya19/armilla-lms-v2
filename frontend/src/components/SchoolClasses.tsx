import { useEffect, useState } from "react";
import { useGlassConfirm } from "./GlassConfirm";
import { SchoolModal } from "./SchoolModal";
import { CardGridSkeleton, EmptyState, TableSkeleton } from "./DashboardUI";
import { ClassPromotion } from "./ClassPromotion";
import { BulkClassPlacement } from "./BulkClassPlacement";
import { ensureStandardClasses } from "./standardClasses";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { hasPlanAccess, type PlanSlug } from "./subscriptionPlans";
import { Eye, GraduationCap, Lock, Pencil, Search, Trash2, UserMinus, Users } from "lucide-react";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { useTenantTheme } from "./TenantThemeProvider";

type StudentPreview = { id: string; nama: string; nisn: string };
type ClassItem = { id: string; nama: string; waliGuruId: string | null; jumlahSiswa: number; siswaPreview?: StudentPreview[] };
type Teacher = { id: string; nama: string };
type ClassData = { kelas: ClassItem[]; guru: Teacher[] };
type ClassRosterStudent = {
  id: string;
  nama: string;
  nisn: string;
  jenisKelamin: string | null;
  telepon: string | null;
  statusAkun: string;
};

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

  // Modal daftar siswa per kelas
  const [rosterClass, setRosterClass] = useState<{ id: string; nama: string; wali: string } | null>(null);
  const [rosterStudents, setRosterStudents] = useState<ClassRosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState("");
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterBusyId, setRosterBusyId] = useState<string | null>(null);
  const [rosterVersion, setRosterVersion] = useState(0);

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

  useEffect(() => {
    if (!rosterClass) return;
    const controller = new AbortController();
    setRosterLoading(true);
    setRosterError("");
    request(`/api/sekolah/kelas/${encodeURIComponent(rosterClass.id)}/siswa`, "GET", undefined, controller.signal)
      .then((value) => {
        if (!isObject(value) || !Array.isArray(value.siswa)) {
          throw new Error("Respons daftar siswa kelas tidak valid.");
        }
        if (!controller.signal.aborted) {
          setRosterStudents(value.siswa as ClassRosterStudent[]);
        }
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setRosterError(describeFetchError(failure, "Daftar siswa kelas belum dapat dimuat."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRosterLoading(false);
      });
    return () => controller.abort();
  }, [rosterClass, rosterVersion]);

  async function removeStudentFromClass(student: ClassRosterStudent) {
    if (!rosterClass) return;
    if (!await confirm(`Keluarkan ${student.nama} (${student.nisn}) dari kelas ${rosterClass.nama}? Siswa tetap aktif tanpa kelas.`)) return;
    setRosterBusyId(student.id);
    setRosterError("");
    try {
      await request(`/api/sekolah/siswa/${encodeURIComponent(student.id)}/kelas`, "PATCH", {
        kelasId: null,
        expectedKelasId: rosterClass.id,
      });
      invalidateCache(["/api/sekolah/kelas", "/api/sekolah/siswa", "/api/sekolah/kenaikan-kelas"]);
      setRosterVersion((v) => v + 1);
      setVersion((v) => v + 1);
    } catch (failure) {
      setRosterError(describeFetchError(failure, "Siswa belum dapat dikeluarkan dari kelas."));
    } finally {
      setRosterBusyId(null);
    }
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
      <section>
        <h3 className="font-bold">Daftar kelas <span className="text-sm font-normal text-slate-600 tabular-nums">({data.kelas.length})</span></h3>
        {(() => {
          const filteredClasses = data.kelas.filter((item) => item.nama.toLowerCase().includes(search.trim().toLowerCase()));
          if (!filteredClasses.length) {
            return (
              <EmptyState
                title={search ? "Kelas tidak ditemukan" : "Belum ada kelas"}
                description={search ? "Coba nama kelas lain." : "Tambahkan kelas dan pilih wali kelas untuk memulai."}
                action={!search && <button type="button" className="master-primary" onClick={() => { setEditing(null); setNama(""); setWali(""); setClassOpen(true); }}>Tambah Kelas</button>}
              />
            );
          }
          return (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredClasses.map((item) => {
                const waliName = item.waliGuruId
                  ? data.guru.find((teacher) => teacher.id === item.waliGuruId)?.nama ?? "Guru tidak aktif"
                  : "Belum ditentukan";
                const visiblePreview = (item.siswaPreview ?? []).slice(0, 3);
                const remainingCount = Math.max(0, item.jumlahSiswa - visiblePreview.length);
                return (
                  <article
                    key={item.id}
                    className={`dashboard-glass flex flex-col justify-between gap-4 rounded-2xl p-5 transition ${
                      isDark ? "hover:border-amber-400/35 hover:bg-slate-800/60" : "hover:bg-white/95 hover:shadow-md"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                            isDark ? "border border-amber-400/25 bg-amber-500/15 text-amber-300" : "bg-indigo-100 text-indigo-700"
                          }`}
                        >
                          <GraduationCap size={21} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h4 className={`truncate text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{item.nama}</h4>
                          <p className={`mt-0.5 truncate text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                            Wali Kelas: <span className={`font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>{waliName}</span>
                          </p>
                        </div>
                      </div>

                      <div className={`flex items-center justify-between gap-2 text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                        <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums">
                          <Users size={14} aria-hidden="true" className={isDark ? "text-cyan-300" : "text-indigo-600"} />
                          {item.jumlahSiswa} siswa aktif
                        </span>
                        <span className={`font-mono text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          #{item.id.slice(0, 8)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setRosterSearch("");
                          setRosterStudents([]);
                          setRosterClass({ id: item.id, nama: item.nama, wali: waliName });
                        }}
                        className={`w-full rounded-xl border p-3 text-left text-xs transition ${
                          isDark
                            ? "border-slate-700/70 bg-slate-900/60 hover:border-cyan-400/40"
                            : "border-slate-200/80 bg-slate-50/80 hover:border-indigo-300 hover:bg-indigo-50/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[11px] font-bold ${isDark ? "text-cyan-300" : "text-indigo-700"}`}>
                            Daftar Siswa
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${isDark ? "text-slate-300" : "text-slate-500"}`}>
                            <Eye size={12} aria-hidden="true" />
                            Lihat semua
                          </span>
                        </div>
                        {visiblePreview.length > 0 ? (
                          <ul className={`mt-2 space-y-1 ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                            {visiblePreview.map((student) => (
                              <li key={student.id} className="flex items-center justify-between gap-2">
                                <span className="truncate font-medium">{student.nama}</span>
                                <span className={`shrink-0 font-mono text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                  {student.nisn}
                                </span>
                              </li>
                            ))}
                            {remainingCount > 0 && (
                              <li className={`pt-0.5 text-[11px] font-bold ${isDark ? "text-amber-300" : "text-indigo-700"}`}>
                                +{remainingCount} siswa lainnya...
                              </li>
                            )}
                          </ul>
                        ) : (
                          <p className={`mt-1.5 text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            {item.jumlahSiswa > 0 ? "Klik untuk melihat daftar siswa di kelas ini." : "Belum ada siswa di kelas ini."}
                          </p>
                        )}
                      </button>
                    </div>
                    <div className={`flex items-center gap-2 border-t pt-3 ${isDark ? "border-slate-700/60" : "border-slate-200/80"}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setRosterSearch("");
                          setRosterStudents([]);
                          setRosterClass({ id: item.id, nama: item.nama, wali: waliName });
                        }}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition ${
                          isDark
                            ? "border-cyan-400/35 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25"
                            : "border-sky-200 bg-sky-50/90 text-sky-800 hover:bg-sky-100"
                        }`}
                      >
                        <Users size={13} aria-hidden="true" />
                        Siswa
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setError("");
                          setEditing(item.id);
                          setNama(item.nama);
                          setWali(item.waliGuruId ?? "");
                          setClassOpen(true);
                        }}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
                          isDark
                            ? "border-amber-400/35 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                            : "border-indigo-200 bg-indigo-50/90 text-indigo-800 hover:bg-indigo-100"
                        }`}
                      >
                        <Pencil size={13} aria-hidden="true" />
                        Ubah
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => deleteClass(item)}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
                          isDark
                            ? "border-rose-500/30 bg-rose-950/35 text-rose-300 hover:bg-rose-950/60"
                            : "border-rose-200 bg-rose-50/90 text-rose-700 hover:bg-rose-100"
                        }`}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        Hapus
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })()}
      </section>
      {rosterClass && (
        <SchoolModal
          title={`Siswa di ${rosterClass.nama}`}
          titleIcon={<Users size={20} className="text-indigo-600" aria-hidden="true" />}
          wide
          busy={Boolean(rosterBusyId)}
          onClose={() => {
            setRosterClass(null);
            setRosterError("");
          }}
        >
          <div className="space-y-4 overflow-y-auto px-5 pb-6 pt-3 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className={`text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Wali Kelas: <strong className={isDark ? "text-white" : "text-slate-900"}>{rosterClass.wali}</strong> ·{" "}
                <strong className={`tabular-nums ${isDark ? "text-cyan-300" : "text-indigo-700"}`}>{rosterStudents.length} siswa aktif</strong>
              </div>
              <label className="relative block w-full sm:w-64">
                <span className="sr-only">Cari siswa di kelas ini</span>
                <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Cari nama atau NISN..."
                  className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900"
                />
              </label>
            </div>

            {rosterError && (
              <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
                {rosterError}{" "}
                <button type="button" onClick={() => setRosterVersion((v) => v + 1)} className="font-bold underline">
                  Muat ulang
                </button>
              </p>
            )}

            {rosterLoading ? (
              <TableSkeleton rows={5} columns={4} />
            ) : (() => {
              const q = rosterSearch.trim().toLowerCase();
              const filteredRoster = q
                ? rosterStudents.filter((s) => s.nama.toLowerCase().includes(q) || s.nisn.toLowerCase().includes(q))
                : rosterStudents;
              if (!filteredRoster.length) {
                return (
                  <EmptyState
                    title={q ? "Siswa tidak ditemukan" : `Belum ada siswa di ${rosterClass.nama}`}
                    description={
                      q
                        ? "Coba kata kunci nama atau NISN yang berbeda."
                        : "Tempatkan siswa ke kelas ini melalui Penempatan Siswa Massal di bawah atau menu Data Siswa."
                    }
                  />
                );
              }
              return (
                <div className={`overflow-x-auto rounded-2xl border ${isDark ? "border-slate-700/80 bg-slate-900/70" : "border-slate-200/90 bg-white"}`}>
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className={`border-b text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "border-slate-700/80 bg-slate-800/80 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                      <tr>
                        <th className="w-10 px-3 py-2.5 text-center">No</th>
                        <th className="px-3 py-2.5">Nama Siswa</th>
                        <th className="px-3 py-2.5">NISN</th>
                        <th className="px-3 py-2.5">L/P</th>
                        <th className="px-3 py-2.5">Akun LMS</th>
                        <th className="px-3 py-2.5 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? "divide-slate-800 text-slate-200" : "divide-slate-200/75 text-slate-800"}`}>
                      {filteredRoster.map((student, idx) => (
                        <tr key={student.id} className={isDark ? "hover:bg-slate-800/60" : "hover:bg-indigo-50/40"}>
                          <td className={`px-3 py-2.5 text-center font-semibold tabular-nums ${isDark ? "text-slate-400" : "text-slate-500"}`}>{idx + 1}</td>
                          <td className="px-3 py-2.5">
                            <p className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{student.nama}</p>
                            {student.telepon && <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>{student.telepon}</p>}
                          </td>
                          <td className={`px-3 py-2.5 font-mono ${isDark ? "text-slate-300" : "text-slate-700"}`}>{student.nisn}</td>
                          <td className={`px-3 py-2.5 ${isDark ? "text-slate-300" : "text-slate-600"}`}>{student.jenisKelamin || "-"}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                student.statusAkun === "Akun aktif"
                                  ? (isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-800")
                                  : (isDark ? "bg-slate-700/70 text-slate-300" : "bg-slate-100 text-slate-600")
                              }`}
                            >
                              {student.statusAkun}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              disabled={rosterBusyId === student.id}
                              onClick={() => void removeStudentFromClass(student)}
                              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-bold disabled:opacity-50 ${
                                isDark
                                  ? "border-rose-500/35 bg-rose-950/40 text-rose-300 hover:bg-rose-950/70"
                                  : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              }`}
                            >
                              <UserMinus size={12} aria-hidden="true" />
                              Keluarkan
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </SchoolModal>
      )}
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
