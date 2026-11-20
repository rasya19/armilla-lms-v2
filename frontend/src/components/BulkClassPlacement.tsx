import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { BulkPlacementAction } from "./BulkPlacementAction";
import type { PlacementClass, PlacementNotice, PlacementStudent } from "./BulkPlacementAction";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type Row = { id: string; nama: string; keterangan: string; kelasId: string | null; status: string };
type Result = { rows: Row[]; page: number; hasNext: boolean };
function isResult(value: unknown): value is Result {
  if (!value || typeof value !== "object" || !("rows" in value) || !Array.isArray(value.rows) || !("page" in value) || typeof value.page !== "number" || !("hasNext" in value) || typeof value.hasNext !== "boolean") return false;
  return value.rows.every((row: unknown) => row !== null && typeof row === "object" && "id" in row && typeof row.id === "string" && "nama" in row && typeof row.nama === "string" && "keterangan" in row && typeof row.keterangan === "string" && "kelasId" in row && (row.kelasId === null || typeof row.kelasId === "string") && "status" in row && row.status === "Aktif");
}

export function BulkClassPlacement({ classes, onMoved }: { classes: PlacementClass[]; onMoved: () => void }) {
  const [filter, setFilter] = useState<"belum" | "semua">("belum");
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<PlacementNotice | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const timer = window.setTimeout(() => setSearch(input.trim()), 250); return () => window.clearTimeout(timer); }, [input]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setSelected(new Set()); setError("");
    const query = new URLSearchParams({ page: String(page), kelas: filter, aktif: "1" });
    if (search) query.set("q", search);
    fetchWithTimeout(`/api/sekolah/siswa?${query}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : "Daftar siswa belum dapat dimuat.");
      const body: unknown = await response.json();
      if (!isResult(body) || body.page !== page) throw new Error("Respons daftar siswa tidak valid.");
      setData(body);
    }).catch((failure: unknown) => { if (!isCallerAborted(failure, controller.signal)) { setError(describeFetchError(failure, "Daftar siswa belum dapat dimuat.")); } });
    return () => controller.abort();
  }, [filter, page, search, version]);
  const rows = input.trim() === search ? data?.rows ?? [] : [];
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = selected.size > 0 && selected.size < rows.length; }, [selected, rows.length]);
  const chosen: PlacementStudent[] = rows.filter((row) => selected.has(row.id)).map((row) => ({ id: row.id, nama: row.nama, nisn: row.keterangan, kelasId: row.kelasId }));
  function finished(result: PlacementNotice) {
    setNotice(result); setSelected(new Set()); setVersion((value) => value + 1); onMoved();
  }
  return <section className="dashboard-glass space-y-4 p-4">
    <h3 className="font-bold text-slate-900">Penempatan Siswa Massal</h3>
    <p className="text-sm text-slate-600">Pilih siswa aktif pada halaman ini. Perpindahan mengganti kelas sebelumnya tanpa menyimpan riwayat.</p>
    {notice && <p role={notice.error ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${notice.error ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>{notice.text}</p>}
    <BulkPlacementAction students={chosen} classes={classes} onFinished={finished} />
    <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={filter === "belum"} onClick={() => { setSelected(new Set()); setPage(1); setFilter("belum"); }} className={`rounded-full px-3 py-2 text-sm font-bold ${filter === "belum" ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"}`}>Belum ditempatkan</button><button type="button" aria-pressed={filter === "semua"} onClick={() => { setSelected(new Set()); setPage(1); setFilter("semua"); }} className={`rounded-full px-3 py-2 text-sm font-bold ${filter === "semua" ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"}`}>Semua Siswa</button></div>
    <label className="relative block"><span className="sr-only">Cari nama atau NISN siswa</span><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" maxLength={100} value={input} onChange={(event) => { setInput(event.target.value); setSelected(new Set()); setPage(1); }} placeholder="Cari nama atau NISN" className="glass-input w-full rounded-xl py-3 pl-10 pr-3 text-sm" /></label>
    {error ? <p role="alert" className="text-sm text-rose-700">{error} <button type="button" className="font-bold underline" onClick={() => setVersion((value) => value + 1)}>Coba lagi</button></p> : !data || input.trim() !== search ? <p className="text-sm">Memuat siswa...</p> : rows.length === 0 ? <p className="text-sm text-slate-600">Tidak ada siswa yang sesuai.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3"><input ref={allRef} aria-label="Pilih semua siswa di halaman ini" type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={(event) => setSelected(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())} /></th><th className="p-3">Nama</th><th className="p-3">NISN</th><th className="p-3">Kelas saat ini</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100 hover:bg-indigo-50/60"><td className="p-3"><input type="checkbox" aria-label={`Pilih ${row.nama} (${row.keterangan})`} checked={selected.has(row.id)} onChange={(event) => setSelected((previous) => { const next = new Set(previous); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /></td><td className="p-3 font-semibold">{row.nama}</td><td className="p-3">{row.keterangan}</td><td className="p-3">{row.kelasId ? classes.find((item) => item.id === row.kelasId)?.nama ?? "Kelas tidak ditemukan" : "Belum ditempatkan"}</td></tr>)}</tbody></table></div>}
    <div className="flex items-center gap-4 text-sm"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="font-bold text-indigo-700 disabled:text-slate-400">Sebelumnya</button><span>Halaman {page} · pilih semua berlaku untuk halaman ini (maks. 25 siswa)</span><button type="button" disabled={!data?.hasNext || input.trim() !== search} onClick={() => setPage((value) => value + 1)} className="font-bold text-indigo-700 disabled:text-slate-400">Berikutnya</button></div>
  </section>;
}
