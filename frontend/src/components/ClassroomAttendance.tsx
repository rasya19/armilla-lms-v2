import { useEffect, useState } from "react";
import { FileSpreadsheet, Lock } from "lucide-react";
import { useGlassConfirm } from "./GlassConfirm";
import { useTenantPlan } from "./TenantThemeProvider";
import { canAccessFeature } from "../utils/planAccess";

type Status = "HADIR" | "IZIN" | "SAKIT" | "ALPA";
type Row = { id: string; nama: string; nisn: string; status: Status | null; counts: Record<Status, number> };
type Attendance = { kelas: string; tanggal: string; bulan: string; dapatMengubah: boolean; rows: Row[] };
const statuses: { key: Status; label: string; color: string; badge: string }[] = [
  { key: "HADIR", label: "Hadir", color: "text-emerald-600", badge: "bg-emerald-100 text-emerald-800" },
  { key: "IZIN", label: "Izin", color: "text-blue-600", badge: "bg-blue-100 text-blue-800" },
  { key: "SAKIT", label: "Sakit", color: "text-amber-600", badge: "bg-amber-100 text-amber-900" },
  { key: "ALPA", label: "Alpa", color: "text-rose-600", badge: "bg-rose-100 text-rose-800" },
];
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isStatus(value: unknown): value is Status { return statuses.some((item) => item.key === value); }
function isRow(value: unknown): value is Row {
  return object(value) && typeof value.id === "string" && typeof value.nama === "string" && typeof value.nisn === "string"
    && (value.status === null || isStatus(value.status)) && object(value.counts)
    && statuses.every(({ key }) => object(value.counts) && Number.isInteger(value.counts[key]) && Number(value.counts[key]) >= 0);
}
function isAttendance(value: unknown): value is Attendance {
  return object(value) && typeof value.kelas === "string" && typeof value.tanggal === "string" && typeof value.bulan === "string"
    && typeof value.dapatMengubah === "boolean" && Array.isArray(value.rows) && value.rows.every(isRow);
}
function message(error: unknown): string {
  return error instanceof TypeError ? "Koneksi terputus. Muat ulang untuk memeriksa hasil." : error instanceof Error ? error.message : "Presensi belum dapat dimuat.";
}
function percentage(row: Row): string {
  const total = statuses.reduce((sum, item) => sum + row.counts[item.key], 0);
  return total ? `${Math.round(row.counts.HADIR / total * 100)}%` : "—";
}

export function ClassroomAttendance({ base, kelasId, role }: { base: string; kelasId: string; role: "ADMIN" | "GURU" | "SISWA" }) {
  const { plan, access } = useTenantPlan();
  const confirm = useGlassConfirm();
  const [month, setMonth] = useState("");
  const [mode, setMode] = useState<"harian" | "bulanan">("harian");
  const [data, setData] = useState<Attendance | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const endpoint = `${base}/${encodeURIComponent(kelasId)}/presensi`;
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    fetch(`${endpoint}${month ? `?bulan=${encodeURIComponent(month)}` : ""}`, { signal: controller.signal }).then(async (response) => {
      const value: unknown = await response.json();
      if (!response.ok) throw new Error(object(value) && typeof value.error === "string" ? value.error : "Presensi belum dapat dimuat.");
      if (!isAttendance(value)) throw new Error("Respons presensi tidak valid.");
      setData(value);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) { console.error("Gagal memuat presensi:", failure); setError(message(failure)); } });
    return () => controller.abort();
  }, [endpoint, month, version]);

  async function change(row: Row, status: Status) {
    if (busy || row.status === status || !await confirm(`Ubah presensi ${row.nama} hari ini menjadi ${statuses.find((item) => item.key === status)?.label}?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, expectedStatus: row.status, tanggal: data?.tanggal }) });
      const value: unknown = await response.json();
      if (!response.ok) throw new Error(object(value) && typeof value.error === "string" ? value.error : "Presensi belum dapat disimpan.");
      if (!object(value) || value.status !== status) throw new Error("Respons presensi tidak valid. Muat ulang untuk memeriksa.");
      setNotice(`Presensi ${row.nama} berhasil diperbarui.`);
    } catch (failure) { console.error("Gagal mengubah presensi:", failure); setError(message(failure)); }
    finally { setBusy(false); setVersion((current) => current + 1); }
  }
  async function exportExcel() {
    if (!data || busy) return;
    setBusy(true); setError("");
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.aoa_to_sheet([
        [`Rekap Kehadiran KBM - ${data.kelas}`], [`Tanggal: ${data.tanggal} | Bulan: ${data.bulan}`], [],
        ["No", "NISN", "Nama", "Status hari ini", "Hadir", "Izin", "Sakit", "Alpa", "Persentase hadir"],
        ...data.rows.map((row, index) => [index + 1, row.nisn, row.nama, row.status ?? "Belum tercatat", row.counts.HADIR, row.counts.IZIN, row.counts.SAKIT, row.counts.ALPA, percentage(row)]),
      ]);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Presensi");
      XLSX.writeFile(book, `Rekap_Presensi_${data.bulan}.xlsx`);
      setNotice("File rekap presensi berhasil disiapkan.");
    } catch (failure) { console.error("Gagal mengekspor presensi:", failure); setError("Rekap presensi belum dapat diekspor. Coba lagi."); }
    finally { setBusy(false); }
  }
  return <section className="dashboard-glass rounded-3xl p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/50 pb-4">
      <div><h2 className="text-lg font-bold">Rekap Kehadiran KBM{data ? ` ${data.kelas}` : ""}</h2><p className="mt-1 text-xs text-slate-600">{role === "SISWA" ? "Presensi pribadi Anda." : "Pantau kehadiran kelas dan unduh rekap Excel."}</p></div>
      {role !== "SISWA" && <button type="button" disabled={busy || (!data && canAccessFeature(plan, "reguler"))} onClick={() => { if (access("reguler", "Export Absensi Excel")) void exportExcel(); }} className="master-primary gap-2 disabled:opacity-50"><FileSpreadsheet size={16} /> Export Absensi (.xlsx) {!canAccessFeature(plan, "reguler") && <><Lock size={13} /> REGULER</>}</button>}
    </div>
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error} <button type="button" onClick={() => { setError(""); setVersion((value) => value + 1); }} className="font-bold underline">Muat ulang</button></p>}
    {!data ? !error && <p role="status" className="mt-4 text-sm">Memuat presensi...</p> : <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" aria-label="Tampilan presensi">{(["harian", "bulanan"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-xl px-3 py-2 text-xs font-bold ${mode === value ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-800"}`}>{value === "harian" ? "Harian" : "Rekap Bulanan"}</button>)}</div>
        {mode === "bulanan" ? <label className="flex items-center gap-2 text-sm font-semibold">Bulan<input type="month" min="1900-01" max="9998-12" value={month || data.bulan} onChange={(event) => { if (event.target.value) { setError(""); setMonth(event.target.value); } }} className="rounded-xl px-3 py-2" /></label> : <p className="text-sm text-slate-600">Hari ini: {data.tanggal}</p>}
      </div>
      <p className="mt-4 text-xs font-semibold text-slate-600">Ringkasan hari ini</p>
      <div className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{statuses.map((item) => <div key={item.key} className="rounded-2xl border border-white/50 bg-slate-100/70 p-3 text-center"><p className="text-xs font-bold uppercase text-slate-600">{item.label}</p><p className={`text-xl font-extrabold ${item.color}`}>{data.rows.filter((row) => row.status === item.key).length}</p></div>)}</div>
      <p className="mb-3 text-xs text-slate-600">{mode === "harian" ? `Belum tercatat: ${data.rows.filter((row) => row.status === null).length}` : `Rekap ${data.bulan}. Persentase berdasarkan presensi yang tercatat, bukan jumlah hari kalender.`}</p>
      {data.rows.length === 0 ? <p className="py-5 text-sm">Belum ada siswa aktif di kelas ini.</p> : <div className="overflow-x-auto rounded-2xl border border-white/50"><table className="w-full min-w-[36rem] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="p-3">Warga Belajar</th><th className="p-3">NISN</th>{mode === "harian" ? <><th className="p-3">Status</th>{data.dapatMengubah && <th className="p-3 text-right">Ubah Cepat</th>}</> : <>{statuses.map((item) => <th key={item.key} className="p-3 text-center" title={item.label}>{item.label[0]}</th>)}<th className="p-3 text-right">%</th></>}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className="border-t border-slate-200/40"><td className="p-3 font-bold">{row.nama}</td><td className="p-3 font-mono text-xs">{row.nisn}</td>{mode === "harian" ? <><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statuses.find((item) => item.key === row.status)?.badge ?? "bg-slate-100 text-slate-700"}`}>{statuses.find((item) => item.key === row.status)?.label ?? "Belum tercatat"}</span></td>{data.dapatMengubah && <td className="p-3 text-right"><div className="inline-flex gap-1">{statuses.map((item) => <button key={item.key} type="button" disabled={busy || row.status === item.key} aria-label={`${item.label}: ${row.nama}`} aria-pressed={row.status === item.key} onClick={() => void change(row, item.key)} className={`h-9 w-9 rounded-lg text-xs font-bold disabled:opacity-60 ${row.status === item.key ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100"}`}>{item.label[0]}</button>)}</div></td>}</> : <>{statuses.map((item) => <td key={item.key} className={`p-3 text-center font-bold ${item.color}`}>{row.counts[item.key]}</td>)}<td className="p-3 text-right font-bold">{percentage(row)}</td></>}</tr>)}</tbody></table></div>}
    </>}
  </section>;
}
