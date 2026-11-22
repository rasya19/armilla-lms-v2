import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, GraduationCap, Layers, Library, Sparkles, Users } from "lucide-react";
import { CardGridSkeleton, DashboardHero, EmptyState, TableSkeleton } from "./DashboardUI";
import { LmsLearning } from "./LmsLearning";
import { ClassroomModulePickerModal } from "./ModuleBankView";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type Role = "ADMIN" | "GURU" | "SISWA";
type Named = { id: string; nama: string };
type Room = Named & { wali: string | null; jumlahSiswa: number; jumlahMapel: number; tugasAktif: number };
type Details = Named & { wali: string | null; siswa: Named[]; guru: Named[]; mapel: Named[]; presensi: string | null };
type PaketKey = "PAKET_A" | "PAKET_B" | "PAKET_C" | "LAINNYA";

type PaketMeta = {
  key: PaketKey;
  title: string;
  subtitle: string;
  accentBar: string;
  cardHover: string;
  iconBg: string;
  badgeBg: string;
  buttonCls: string;
};

const PAKET_CONFIG: Record<PaketKey, PaketMeta> = {
  PAKET_A: {
    key: "PAKET_A",
    title: "Paket A",
    subtitle: "Setara SD / Kelas 1–6",
    accentBar: "from-emerald-500 via-teal-500 to-cyan-500",
    cardHover: "hover:border-emerald-300/90 hover:shadow-md hover:shadow-emerald-500/10",
    iconBg: "bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700 ring-1 ring-emerald-200/80",
    badgeBg: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80",
    buttonCls: "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-sm shadow-emerald-600/20",
  },
  PAKET_B: {
    key: "PAKET_B",
    title: "Paket B",
    subtitle: "Setara SMP / Kelas 7–9",
    accentBar: "from-sky-500 via-blue-500 to-cyan-500",
    cardHover: "hover:border-sky-300/90 hover:shadow-md hover:shadow-sky-500/10",
    iconBg: "bg-gradient-to-br from-sky-100 to-blue-100 text-sky-700 ring-1 ring-sky-200/80",
    badgeBg: "bg-sky-50 text-sky-700 ring-1 ring-sky-200/80",
    buttonCls: "bg-gradient-to-r from-sky-600 to-blue-600 text-white hover:from-sky-700 hover:to-blue-700 shadow-sm shadow-sky-600/20",
  },
  PAKET_C: {
    key: "PAKET_C",
    title: "Paket C",
    subtitle: "Setara SMA / Kelas 10–12",
    accentBar: "from-indigo-500 via-violet-500 to-purple-500",
    cardHover: "hover:border-indigo-300/90 hover:shadow-md hover:shadow-indigo-500/10",
    iconBg: "bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 ring-1 ring-indigo-200/80",
    badgeBg: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80",
    buttonCls: "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 shadow-sm shadow-indigo-600/20",
  },
  LAINNYA: {
    key: "LAINNYA",
    title: "Program Lainnya",
    subtitle: "Kelas Kustom & Program Khusus",
    accentBar: "from-amber-500 via-orange-500 to-rose-500",
    cardHover: "hover:border-amber-300/90 hover:shadow-md hover:shadow-amber-500/10",
    iconBg: "bg-gradient-to-br from-amber-100 to-orange-100 text-amber-700 ring-1 ring-amber-200/80",
    badgeBg: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80",
    buttonCls: "bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700 shadow-sm shadow-amber-600/20",
  },
};

function detectRoomPaket(name: string): PaketKey {
  const normalized = name.trim().toLowerCase();
  if (/\bpaket\s*a\b/.test(normalized)) return "PAKET_A";
  if (/\bpaket\s*b\b/.test(normalized)) return "PAKET_B";
  if (/\bpaket\s*c\b/.test(normalized)) return "PAKET_C";
  const gradeMatch = normalized.match(/\b(?:kelas|kls|tingkat)\s*(\d{1,2})\b/);
  if (gradeMatch) {
    const grade = Number(gradeMatch[1]);
    if (grade >= 1 && grade <= 6) return "PAKET_A";
    if (grade >= 7 && grade <= 9) return "PAKET_B";
    if (grade >= 10 && grade <= 12) return "PAKET_C";
  }
  if (/\bsd\b/.test(normalized)) return "PAKET_A";
  if (/\bsmp\b/.test(normalized)) return "PAKET_B";
  if (/\bsma\b|\bsmk\b/.test(normalized)) return "PAKET_C";
  return "LAINNYA";
}

function sortRoomsNatural(list: Room[]): Room[] {
  return [...list].sort((a, b) => a.nama.localeCompare(b.nama, "id-ID", { numeric: true, sensitivity: "base" }));
}

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

export function Classroom({ role, sandboxRole, initialTab, initialKelasId }: { role: Role; sandboxRole?: "GURU" | "SISWA"; initialTab?: "materi" | "tugas"; initialKelasId?: string | null }) {
  const base = `/api/${role === "ADMIN" ? "sekolah" : "lms"}/ruang-kbm`;
  const cacheKey = `${base}::${sandboxRole ?? "real"}`;
  const [rooms, setRooms] = useState<Room[] | null>(() => getCached<Room[]>(cacheKey));
  const [selectedPaket, setSelectedPaket] = useState<PaketKey | null>(null);
  const [selected, setSelected] = useState<string | null>(initialKelasId ?? null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialKelasId) setSelected(initialKelasId);
  }, [initialKelasId]);

  useEffect(() => {
    if (!rooms || !selected) return;
    const match = rooms.find((item) => item.id === selected);
    if (match) {
      setSelectedPaket((current) => current ?? detectRoomPaket(match.nama));
    }
  }, [rooms, selected]);

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

  const groupedRooms = useMemo(() => {
    const groups: Record<PaketKey, Room[]> = {
      PAKET_A: [],
      PAKET_B: [],
      PAKET_C: [],
      LAINNYA: [],
    };
    for (const item of rooms ?? []) {
      groups[detectRoomPaket(item.nama)].push(item);
    }
    return {
      PAKET_A: sortRoomsNatural(groups.PAKET_A),
      PAKET_B: sortRoomsNatural(groups.PAKET_B),
      PAKET_C: sortRoomsNatural(groups.PAKET_C),
      LAINNYA: sortRoomsNatural(groups.LAINNYA),
    };
  }, [rooms]);

  const visiblePakets = useMemo<PaketKey[]>(() => {
    const baseKeys: PaketKey[] = ["PAKET_A", "PAKET_B", "PAKET_C"];
    if (groupedRooms.LAINNYA.length > 0) baseKeys.push("LAINNYA");
    return baseKeys;
  }, [groupedRooms.LAINNYA.length]);

  if (selected) {
    return (
      <ClassroomWorkspace
        key={`${selected}-${initialTab ?? "materi"}`}
        role={role}
        sandboxRole={sandboxRole}
        initialTab={initialTab}
        base={base}
        kelasId={selected}
        onExit={() => {
          setSelected(null);
          setVersion((value) => value + 1);
        }}
      />
    );
  }

  const lobbyTitle = "Materi & Tugas Kelas";
  const lobbyDescription = role === "SISWA"
    ? "Pilih ruang kelas Anda untuk membaca materi ajar, pengumuman, dan mengumpulkan tugas."
    : selectedPaket
      ? `Daftar rombel pada ${PAKET_CONFIG[selectedPaket].title} (${PAKET_CONFIG[selectedPaket].subtitle}). Pilih kelas untuk mengelola materi ajar, pengumuman, tugas, dan warga kelas.`
      : "Pilih jenjang paket terlebih dahulu, lalu buka rombel kelas untuk mengelola materi ajar, tugas kelas, dan warga kelas.";

  const activePaketMeta = selectedPaket ? PAKET_CONFIG[selectedPaket] : null;
  const activePaketRooms = selectedPaket ? groupedRooms[selectedPaket] : [];

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero title={lobbyTitle} description={lobbyDescription} />

      {error ? (
        <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
          {error}{" "}
          <button type="button" className="font-bold underline" onClick={() => setVersion((value) => value + 1)}>
            Coba lagi
          </button>
        </p>
      ) : !rooms ? (
        <CardGridSkeleton count={3} columns={3} />
      ) : rooms.length === 0 ? (
        <EmptyState
          title={role === "SISWA" ? "Belum tergabung di ruang kelas" : "Belum ada ruang kelas"}
          description={
            role === "SISWA"
              ? "Anda belum tergabung di ruang kelas. Hubungi operator sekolah untuk penempatan kelas."
              : "Belum ada kelas yang ditugaskan. Tambahkan kelas atau jadwal mengajar pada panel admin."
          }
        />
      ) : role === "SISWA" && rooms.length === 1 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((item) => {
            const meta = PAKET_CONFIG[detectRoomPaket(item.nama)];
            return (
              <article
                key={item.id}
                className={`dashboard-glass relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-slate-200/80 p-5 transition duration-200 ${meta.cardHover}`}
              >
                <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${meta.accentBar}`} aria-hidden="true" />
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-3">
                    <span className={`rounded-xl p-3 ${meta.iconBg}`}>
                      <GraduationCap size={22} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate font-bold text-slate-900">Selamat Datang di {item.nama}</h2>
                      <p className="truncate text-sm text-slate-700">Wali Kelas: {item.wali ?? "Belum ditentukan"}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 tabular-nums">
                    {item.jumlahSiswa} siswa · {item.jumlahMapel} mapel · {item.tugasAktif} tugas aktif
                  </p>
                </div>
                <button
                  type="button"
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${meta.buttonCls}`}
                  onClick={() => setSelected(item.id)}
                >
                  Masuk ke Ruang Kelas
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      ) : !selectedPaket ? (
        /* Langkah 1 — Kartu Pilihan Jenjang / Paket */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Langkah 1 dari 2</p>
              <h2 className="text-base font-extrabold text-slate-900">Pilih Jenjang / Program Paket</h2>
            </div>
            <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 tabular-nums">
              Total {rooms.length} rombel · {rooms.reduce((sum, item) => sum + item.jumlahSiswa, 0)} siswa aktif
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {visiblePakets.map((key) => {
              const meta = PAKET_CONFIG[key];
              const paketRooms = groupedRooms[key];
              const totalSiswa = paketRooms.reduce((sum, item) => sum + item.jumlahSiswa, 0);
              const totalTugas = paketRooms.reduce((sum, item) => sum + item.tugasAktif, 0);
              const Icon = key === "PAKET_A" ? BookOpen : key === "PAKET_B" ? Layers : key === "PAKET_C" ? GraduationCap : Sparkles;

              return (
                <article
                  key={key}
                  className={`dashboard-glass relative flex flex-col justify-between gap-5 overflow-hidden rounded-2xl border border-slate-200/80 p-6 transition duration-200 ${meta.cardHover}`}
                >
                  <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${meta.accentBar}`} aria-hidden="true" />
                  <div className="space-y-4 pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${meta.iconBg}`}>
                        <Icon size={24} aria-hidden="true" />
                      </span>
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${meta.badgeBg}`}>
                        {paketRooms.length} Rombel
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl font-extrabold tracking-tight text-slate-900">{meta.title}</h3>
                      <p className="mt-1 text-sm font-medium text-slate-600">{meta.subtitle}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-slate-50/90 p-3 ring-1 ring-slate-200/70">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rombel</p>
                        <p className="mt-0.5 text-lg font-extrabold text-slate-900 tabular-nums">{paketRooms.length}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Siswa Aktif</p>
                        <p className="mt-0.5 text-lg font-extrabold text-slate-900 tabular-nums">{totalSiswa}</p>
                      </div>
                    </div>

                    {totalTugas > 0 && (
                      <p className="text-xs font-semibold text-slate-600 tabular-nums">
                        {totalTugas} tugas aktif berjalan di jenjang ini
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={paketRooms.length === 0}
                    onClick={() => setSelectedPaket(key)}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:bg-none disabled:text-slate-500 disabled:shadow-none ${meta.buttonCls}`}
                  >
                    {paketRooms.length === 0 ? "Belum Ada Kelas" : "Buka Daftar Kelas"}
                    {paketRooms.length > 0 && <ArrowRight size={16} aria-hidden="true" />}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        /* Langkah 2 — Kartu Kelas di Dalam Paket Terpilih */
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedPaket(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-800 shadow-xs transition hover:border-slate-400 hover:bg-slate-50"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Kembali ke Pilih Paket
              </button>
              {activePaketMeta && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-extrabold ${activePaketMeta.badgeBg}`}>
                    {activePaketMeta.title}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{activePaketMeta.subtitle}</span>
                </div>
              )}
            </div>
            <span className="text-xs font-bold text-slate-600 tabular-nums">
              {activePaketRooms.length} kelas · {activePaketRooms.reduce((sum, item) => sum + item.jumlahSiswa, 0)} siswa aktif
            </span>
          </div>

          {activePaketRooms.length === 0 ? (
            <EmptyState
              title={`Belum ada kelas pada ${activePaketMeta?.title ?? "paket ini"}`}
              description="Tambahkan rombel untuk jenjang ini melalui menu Manajemen Kelas (Rombel)."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activePaketRooms.map((item) => {
                const meta = activePaketMeta ?? PAKET_CONFIG.LAINNYA;
                return (
                  <article
                    key={item.id}
                    className={`dashboard-glass relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-slate-200/80 p-5 transition duration-200 ${meta.cardHover}`}
                  >
                    <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${meta.accentBar}`} aria-hidden="true" />
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center gap-3">
                        <span className={`rounded-xl p-3 ${meta.iconBg}`}>
                          <GraduationCap size={22} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-slate-900">
                            {role === "SISWA" ? `Selamat Datang di ${item.nama}` : item.nama}
                          </h3>
                          <p className="truncate text-sm text-slate-700">Wali Kelas: {item.wali ?? "Belum ditentukan"}</p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 tabular-nums">
                        {item.jumlahSiswa} siswa · {item.jumlahMapel} mapel · {item.tugasAktif} tugas aktif
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${meta.buttonCls}`}
                      onClick={() => setSelected(item.id)}
                    >
                      {role === "SISWA" ? "Masuk ke Ruang Kelas" : "Masuk Kelas"}
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ClassroomWorkspace({ role, sandboxRole, initialTab, base, kelasId, onExit }: { role: Role; sandboxRole?: "GURU" | "SISWA"; initialTab?: "materi" | "tugas"; base: string; kelasId: string; onExit: () => void }) {
  const endpoint = `${base}/${encodeURIComponent(kelasId)}`;
  const detailCacheKey = `${endpoint}::${sandboxRole ?? "real"}`;
  const [data, setData] = useState<Details | null>(() => getCached<Details>(detailCacheKey));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<"materi" | "tugas" | "warga">(initialTab ?? "materi");
  const [mapelId, setMapelId] = useState("");
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const [learningSeq, setLearningSeq] = useState(0);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">{([["materi", "Materi & Pengumuman"], ["tugas", "Tugas Kelas"], ["warga", "Warga Kelas"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === id ? "bg-indigo-600 text-white" : "bg-white/70 text-slate-700"}`}>{label}</button>)}</div>
        {role !== "SISWA" && tab === "materi" && (
          <button
            type="button"
            onClick={() => setModulePickerOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <Library size={16} aria-hidden="true" />
            Ambil dari Bank Modul
          </button>
        )}
      </div>
      {tab === "warga" ? <div className="grid gap-4 md:grid-cols-2"><section className="dashboard-glass p-5"><h2 className="flex items-center gap-2 font-bold"><BookOpen size={18} /> Guru Pengampu</h2>{data.guru.length ? <ul className="mt-3 space-y-2">{data.guru.map((item) => <li key={item.id}>{item.nama}</li>)}</ul> : <p className="mt-3 text-sm">Belum ada guru dengan jadwal aktif.</p>}</section><section className="dashboard-glass p-5"><h2 className="flex items-center gap-2 font-bold"><Users size={18} /> Siswa</h2>{data.siswa.length ? <ul className="mt-3 space-y-2">{data.siswa.map((item) => <li key={item.id}>{item.nama}</li>)}</ul> : <p className="mt-3 text-sm">Belum ada siswa aktif.</p>}</section></div> : <LmsLearning key={`${kelasId}-${tab}-${learningSeq}`} role={role} sandboxRole={sandboxRole} kelasId={kelasId} mapelId={mapelId || undefined} initialKind={tab} />}
      {modulePickerOpen && role !== "SISWA" && (
        <ClassroomModulePickerModal
          kelasId={kelasId}
          kelasNama={data.nama}
          mapelId={mapelId || undefined}
          sandboxRole={sandboxRole === "GURU" ? "GURU" : undefined}
          onAssigned={(msg) => {
            setModulePickerOpen(false);
            setNotice(msg);
            invalidateCache(["/api/sekolah/pembelajaran", "/api/lms/pembelajaran", "/api/sekolah/rekap-akademik"]);
            setLearningSeq((v) => v + 1);
          }}
          onClose={() => setModulePickerOpen(false)}
        />
      )}
    </>}
  </div>;
}
