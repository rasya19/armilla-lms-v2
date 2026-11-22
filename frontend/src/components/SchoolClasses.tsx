import { useEffect, useState } from "react";
import { useGlassConfirm } from "./GlassConfirm";
import { SchoolModal } from "./SchoolModal";
import { CardGridSkeleton, EmptyState, TableSkeleton } from "./DashboardUI";
import { ensureStandardClasses } from "./standardClasses";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import type { PlanSlug } from "./subscriptionPlans";
import { GraduationCap, Pencil, Search, Trash2, UserMinus, Users } from "lucide-react";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { useTenantTheme } from "./TenantThemeProvider";

type ClassItem = { id: string; nama: string; waliGuruId: string | null; jumlahSiswa: number };
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

type ClassPalette = {
  label: string;
  bar: string;
  cardBorder: string;
  headerBg: string;
  iconBg: string;
  tag: string;
  statButton: string;
  statIcon: string;
  siswaButton: string;
};

function getClassCardPalette(className: string, isDark: boolean): ClassPalette {
  const lower = className.toLowerCase();
  const gradeMatch = lower.match(/\bkelas\s*(\d{1,2})\b/);
  const grade = gradeMatch ? Number(gradeMatch[1]) : null;

  const isPaketA = /\bpaket\s*a\b/.test(lower) || (grade !== null && grade >= 1 && grade <= 6);
  const isPaketB = /\bpaket\s*b\b/.test(lower) || (grade !== null && grade >= 7 && grade <= 9);
  const isPaketC = /\bpaket\s*c\b/.test(lower) || (grade !== null && grade >= 10 && grade <= 12);

  if (isPaketA) {
    return {
      label: "Paket A",
      bar: "bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500",
      cardBorder: isDark
        ? "border-emerald-500/25 hover:border-emerald-400/55 hover:shadow-lg hover:shadow-emerald-950/50"
        : "border-emerald-200/80 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-500/10",
      headerBg: isDark
        ? "bg-gradient-to-br from-emerald-950/55 via-teal-950/30 to-transparent"
        : "bg-gradient-to-br from-emerald-50/90 via-teal-50/45 to-white/60",
      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/25",
      tag: isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100/90 text-emerald-800",
      statButton: isDark
        ? "text-emerald-200 hover:bg-emerald-500/15 hover:text-emerald-100"
        : "text-emerald-900 hover:bg-emerald-50 hover:text-emerald-700",
      statIcon: isDark ? "text-emerald-300" : "text-emerald-600",
      siswaButton: isDark
        ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
        : "border-emerald-200 bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100",
    };
  }

  if (isPaketB) {
    return {
      label: "Paket B",
      bar: "bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-500",
      cardBorder: isDark
        ? "border-sky-500/25 hover:border-sky-400/55 hover:shadow-lg hover:shadow-sky-950/50"
        : "border-sky-200/80 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-500/10",
      headerBg: isDark
        ? "bg-gradient-to-br from-sky-950/55 via-blue-950/30 to-transparent"
        : "bg-gradient-to-br from-sky-50/90 via-blue-50/45 to-white/60",
      iconBg: "bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm shadow-blue-600/25",
      tag: isDark ? "bg-sky-500/20 text-sky-300" : "bg-sky-100/90 text-sky-800",
      statButton: isDark
        ? "text-sky-200 hover:bg-sky-500/15 hover:text-sky-100"
        : "text-sky-900 hover:bg-sky-50 hover:text-sky-700",
      statIcon: isDark ? "text-sky-300" : "text-sky-600",
      siswaButton: isDark
        ? "border-sky-400/35 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25"
        : "border-sky-200 bg-sky-50/90 text-sky-800 hover:bg-sky-100",
    };
  }

  if (isPaketC) {
    return {
      label: "Paket C",
      bar: "bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500",
      cardBorder: isDark
        ? "border-indigo-500/25 hover:border-violet-400/55 hover:shadow-lg hover:shadow-indigo-950/50"
        : "border-indigo-200/80 hover:border-violet-300 hover:shadow-lg hover:shadow-indigo-500/10",
      headerBg: isDark
        ? "bg-gradient-to-br from-indigo-950/55 via-violet-950/30 to-transparent"
        : "bg-gradient-to-br from-indigo-50/90 via-violet-50/45 to-white/60",
      iconBg: "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-600/25",
      tag: isDark ? "bg-violet-500/20 text-violet-200" : "bg-violet-100/90 text-violet-800",
      statButton: isDark
        ? "text-indigo-200 hover:bg-indigo-500/15 hover:text-indigo-100"
        : "text-indigo-900 hover:bg-indigo-50 hover:text-indigo-700",
      statIcon: isDark ? "text-violet-300" : "text-indigo-600",
      siswaButton: isDark
        ? "border-violet-400/35 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
        : "border-violet-200 bg-violet-50/90 text-violet-800 hover:bg-violet-100",
    };
  }

  return {
    label: "Rombel",
    bar: "bg-gradient-to-r from-amber-400 via-orange-500 to-rose-400",
    cardBorder: isDark
      ? "border-amber-500/25 hover:border-amber-400/55 hover:shadow-lg hover:shadow-amber-950/40"
      : "border-amber-200/80 hover:border-amber-300 hover:shadow-lg hover:shadow-amber-500/10",
    headerBg: isDark
      ? "bg-gradient-to-br from-amber-950/45 via-orange-950/25 to-transparent"
      : "bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white/60",
    iconBg: "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm shadow-amber-600/25",
    tag: isDark ? "bg-amber-500/20 text-amber-200" : "bg-amber-100/90 text-amber-900",
    statButton: isDark
      ? "text-amber-200 hover:bg-amber-500/15 hover:text-amber-100"
      : "text-amber-950 hover:bg-amber-50 hover:text-amber-800",
    statIcon: isDark ? "text-amber-300" : "text-amber-600",
    siswaButton: isDark
      ? "border-amber-400/35 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
      : "border-amber-200 bg-amber-50/90 text-amber-900 hover:bg-amber-100",
  };
}

export function SchoolClasses(_props: {
  plan?: PlanSlug;
  onRequireUpgrade?: (featureName: string, requiredPlan: Exclude<PlanSlug, "basic">) => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const confirm = useGlassConfirm();
  const [data, setData] = useState<ClassData | null>(() => getCached<ClassData>("/api/sekolah/kelas"));
  const [version, setVersion] = useState(0);
  const [nama, setNama] = useState("");
  const [wali, setWali] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [classOpen, setClassOpen] = useState(false);
  const [search, setSearch] = useState("");
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
                const palette = getClassCardPalette(item.nama, isDark);
                const openRoster = () => {
                  setRosterSearch("");
                  setRosterStudents([]);
                  setRosterClass({ id: item.id, nama: item.nama, wali: waliName });
                };
                return (
                  <article
                    key={item.id}
                    className={`dashboard-glass flex flex-col justify-between overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 ${palette.cardBorder}`}
                  >
                    <div>
                      <div className={`h-1.5 w-full ${palette.bar}`} aria-hidden="true" />
                      <div className={`px-5 pb-4 pt-4 ${palette.headerBg}`}>
                        <div className="flex items-start gap-3.5">
                          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${palette.iconBg}`}>
                            <GraduationCap size={21} aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className={`truncate text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                                {item.nama}
                              </h4>
                              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-extrabold tracking-wide ${palette.tag}`}>
                                {palette.label}
                              </span>
                            </div>
                            <p className={`mt-1 truncate text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                              Wali Kelas:{" "}
                              <span className={`font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                                {waliName}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 px-5 py-3 text-xs">
                        <button
                          type="button"
                          onClick={openRoster}
                          title={`Lihat daftar siswa di ${item.nama}`}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 font-bold tabular-nums transition ${palette.statButton}`}
                        >
                          <Users size={15} aria-hidden="true" className={palette.statIcon} />
                          <span>{item.jumlahSiswa} siswa aktif</span>
                        </button>
                        <span className={`font-mono text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          #{item.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>

                    <div className={`flex items-center gap-2 border-t px-5 pb-4 pt-3 ${isDark ? "border-slate-700/60" : "border-slate-200/80"}`}>
                      <button
                        type="button"
                        onClick={openRoster}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition ${palette.siswaButton}`}
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
                        : "Tempatkan siswa ke kelas ini melalui menu Data Siswa (Warga Belajar)."
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
    </>}
  </div>;
}
