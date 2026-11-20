import { useEffect, useState } from "react";
import { TableSkeleton } from "./DashboardUI";
import { getCached, setCached } from "./schoolCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type Named = { nama: string };
type Schedule = { id: string; hari: number; jamMulai: string; jamSelesai: string; ruangan: string | null; kelas: Named; guru: Named; mapel: Named; tahunAjaran: Named & { semester: string } };
type Result = { rows: Schedule[]; page: number; hasNext: boolean; belumDitempatkan: boolean };
const days = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNamed(value: unknown): value is Named {
  return isObject(value) && typeof value.nama === "string";
}
function isResult(value: unknown): value is Result {
  return isObject(value) && typeof value.page === "number" && typeof value.hasNext === "boolean" && typeof value.belumDitempatkan === "boolean" && Array.isArray(value.rows)
    && value.rows.every((row: unknown) => isObject(row) && typeof row.id === "string" && typeof row.hari === "number" && typeof row.jamMulai === "string" && typeof row.jamSelesai === "string" && (row.ruangan === null || typeof row.ruangan === "string") && isNamed(row.kelas) && isNamed(row.guru) && isNamed(row.mapel) && isObject(row.tahunAjaran) && typeof row.tahunAjaran.nama === "string" && typeof row.tahunAjaran.semester === "string");
}

export function LmsSchedule({ role, sandboxRole }: { role: "GURU" | "SISWA"; sandboxRole?: "GURU" | "SISWA" }) {
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const cacheKey = `/api/lms/jadwal?page=${page}::${sandboxRole ?? "real"}`;
  const [data, setData] = useState<Result | null>(() => getCached<Result>(cacheKey));
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<Result>(cacheKey);
    if (cached) setData(cached);
    setError("");
    fetchWithTimeout(`/api/lms/jadwal?page=${page}`, {
      signal: controller.signal,
      ...(sandboxRole ? { headers: { "X-Dev-Sandbox-Role": sandboxRole } } : {}),
    }).then(async (response) => {
      if (response.status === 401) throw new Error("Sesi berakhir. Silakan masuk kembali.");
      if (response.status === 403) throw new Error("Akses ditolak. Silakan masuk kembali dan ganti password jika diminta.");
      if (!response.ok) throw new Error("Jadwal belum dapat dimuat.");
      const body: unknown = await response.json();
      if (!isResult(body) || body.page !== page) throw new Error("Respons jadwal tidak valid.");
      setCached(cacheKey, body);
      setData(body);
    }).catch((failure: unknown) => {
      if (!isCallerAborted(failure, controller.signal) && !cached) { setError(describeFetchError(failure, "Jadwal belum dapat dimuat.")); }
    });
    return () => controller.abort();
  }, [page, cacheKey, version, sandboxRole]);
  return <section className="mt-6 rounded-xl border border-[#e6dfd0] bg-[#f8f6ef] p-5">
    <h2 className="font-bold">{role === "GURU" ? "Jadwal mengajar" : "Jadwal belajar"}</h2>
    <p className="mt-2 text-sm text-slate-600">Jadwal mingguan untuk tahun ajaran aktif berdasarkan tanggal Jakarta. Hubungi admin sekolah jika data belum sesuai.</p>
    {error ? <div className="mt-3"><p role="alert" className="text-sm text-rose-700">{error}</p><button type="button" onClick={() => setVersion((v) => v + 1)} className="mt-2 text-sm font-bold underline">Coba lagi</button></div>
      : !data ? <TableSkeleton rows={4} columns={3} />
      : data.belumDitempatkan ? <p className="mt-3 text-sm">Anda belum ditempatkan di kelas. Hubungi admin sekolah.</p>
      : <>{data.rows.length === 0 ? <p className="mt-3 text-sm">Belum ada jadwal pada halaman ini.</p> : <ul className="mt-4 space-y-3">{data.rows.map((item) => <li key={item.id} className="rounded-xl border border-[#e6dfd0] bg-white p-3 text-sm">
        <p className="font-bold">{days[item.hari] ?? `Hari ${item.hari}`} · {item.jamMulai}–{item.jamSelesai}</p>
        <p className="mt-1">{item.mapel.nama} · Kelas {item.kelas.nama}</p>
        <p className="mt-1">Guru: {item.guru.nama}{item.ruangan ? ` · Ruangan: ${item.ruangan}` : ""}</p>
        <p className="mt-1 text-slate-600">{item.tahunAjaran.nama} · {item.tahunAjaran.semester}</p>
      </li>)}</ul>}
      <div className="mt-4 flex items-center gap-4 text-sm"><button type="button" disabled={page === 1} onClick={() => setPage((v) => v - 1)} className="font-bold underline disabled:text-slate-400">Sebelumnya</button><span>Halaman {page}</span><button type="button" disabled={!data.hasNext} onClick={() => setPage((v) => v + 1)} className="font-bold underline disabled:text-slate-400">Berikutnya</button></div></>}
  </section>;
}
