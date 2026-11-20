import { useEffect, useRef, useState } from "react";
import { useGlassConfirm } from "./GlassConfirm";
import { SchoolModal } from "./SchoolModal";
import { EmptyState, TableSkeleton } from "./DashboardUI";
import { getCached, invalidateCache, setCached } from "./schoolCache";

type ClassItem = { id: string; nama: string };
type Student = { id: string; nama: string; nisn: string; statusAkun: string };
type PromotionData = { counts: { kelasId: string; jumlah: number }[]; siswa: Student[] };

function isPromotionData(value: unknown): value is PromotionData {
  if (typeof value !== "object" || value === null || !("counts" in value) || !Array.isArray(value.counts) || !("siswa" in value) || !Array.isArray(value.siswa)) return false;
  return value.counts.every((item: unknown) => typeof item === "object" && item !== null && "kelasId" in item && typeof item.kelasId === "string" && "jumlah" in item && typeof item.jumlah === "number" && Number.isInteger(item.jumlah) && item.jumlah >= 0)
    && value.siswa.every((item: unknown) => typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" && "nama" in item && typeof item.nama === "string" && "nisn" in item && typeof item.nisn === "string" && "statusAkun" in item && typeof item.statusAkun === "string");
}

export function ClassPromotion({ classes, onMoved }: { classes: ClassItem[]; onMoved: () => void }) {
  const confirm = useGlassConfirm();
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const endpoint = `/api/sekolah/kenaikan-kelas${source ? `?kelasId=${encodeURIComponent(source)}` : ""}`;
  const initialCached = getCached<PromotionData>(endpoint);
  const [data, setData] = useState<PromotionData | null>(initialCached);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialCached?.siswa.map((item) => item.id) ?? []));
  const [loading, setLoading] = useState(!initialCached);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const selectAll = useRef<HTMLInputElement>(null);
  const clearAfterMove = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<PromotionData>(endpoint);
    if (cached) {
      setData(cached);
      setSelected(new Set(clearAfterMove.current ? [] : cached.siswa.map((item) => item.id)));
      setLoading(false);
    } else {
      setData(null);
      setSelected(new Set());
      setLoading(true);
    }
    setLoadError("");
    fetch(endpoint, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : "Data kenaikan kelas belum dapat dimuat.");
      const body: unknown = await response.json();
      if (!isPromotionData(body)) throw new Error("Respons kenaikan kelas tidak valid.");
      setCached(endpoint, body);
      setData(body); setSelected(new Set(clearAfterMove.current ? [] : body.siswa.map((item) => item.id))); clearAfterMove.current = false;
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted && !cached) { console.error("Gagal memuat kenaikan kelas:", failure); setLoadError(failure instanceof TypeError ? "Server tidak dapat dihubungi." : failure instanceof Error ? failure.message : "Data belum dapat dimuat."); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, version]);

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selected.size > 0 && selected.size < (data?.siswa.length ?? 0);
  }, [selected, data]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function move() {
    if (busy || !data || !source || !destination || source === destination || !selected.size) return;
    const from = classes.find((item) => item.id === source);
    const to = classes.find((item) => item.id === destination);
    if (!from || !to) { setNotice({ error: true, text: "Kelas tidak lagi tersedia. Muat ulang halaman." }); return; }
    const students = data.siswa.filter((item) => selected.has(item.id));
    if (!await confirm(`Pindahkan ${students.length} siswa dari ${from.nama} ke ${to.nama}? Penempatan lama akan diganti dan riwayat kelas belum disimpan.`)) return;
    setBusy(true); setNotice(null); setProgress({ done: 0, total: students.length });
    let completed = 0;
    let failure = "";
    for (const student of students) {
      try {
        const response = await fetch(`/api/sekolah/siswa/${encodeURIComponent(student.id)}/kelas`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kelasId: destination, expectedKelasId: source }) });
        if (!response.ok) {
          let reason = `Status ${response.status}`;
          if (response.headers.get("content-type")?.includes("application/json")) {
            const body: unknown = await response.json();
            if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") reason = body.error;
          }
          failure = `${student.nama}: ${reason}${response.status >= 500 ? " Hasil siswa ini perlu diperiksa." : ""}`;
          break;
        }
        completed++;
        setProgress({ done: completed, total: students.length });
      } catch (error) {
        console.error("Gagal memindahkan siswa:", error);
        failure = `Koneksi atau respons terputus saat memproses ${student.nama}; hasil siswa ini belum diketahui.`;
        break;
      }
    }
    setNotice(failure
      ? { error: true, text: `${completed} dari ${students.length} siswa berhasil dipindahkan. ${failure} Siswa berikutnya belum diproses; periksa daftar sebelum mencoba lagi.` }
      : { error: false, text: `${completed} siswa berhasil dipindahkan ke ${to.nama}.` });
    clearAfterMove.current = true;
    invalidateCache(["/api/sekolah/kenaikan-kelas", "/api/sekolah/kelas", "/api/sekolah/siswa", "/api/sekolah/ringkasan"]);
    setVersion((value) => value + 1);
    if (completed) onMoved();
    setBusy(false);
  }

  const field = "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3";
  const allSelected = !!data?.siswa.length && selected.size === data.siswa.length;
  return <div className="space-y-5">
    <p className="text-sm text-slate-600">Pilih siswa aktif untuk dipindahkan. Perpindahan mengganti kelas saat ini dan belum menyimpan riwayat.</p>
    <div className="dashboard-glass grid gap-4 p-4 sm:grid-cols-2">
      <label className="text-sm font-bold">Dari Kelas Asal<select className={field} disabled={busy} value={source} onChange={(event) => { clearAfterMove.current = false; setSource(event.target.value); setNotice(null); if (event.target.value === destination) setDestination(""); }}><option value="">Pilih kelas asal</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.nama} ({item.id.slice(0, 8)}) · {data?.counts.find((count) => count.kelasId === item.id)?.jumlah ?? (loading || loadError ? "..." : 0)} siswa</option>)}</select></label>
      <label className="text-sm font-bold">Ke Kelas Tujuan<select className={field} disabled={busy} value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Pilih kelas tujuan</option>{classes.map((item) => <option key={item.id} value={item.id} disabled={item.id === source}>{item.nama} ({item.id.slice(0, 8)})</option>)}</select></label>
    </div>
    {notice && <p role={notice.error ? "alert" : "status"} className={notice.error ? "rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-800" : "fixed bottom-24 right-5 z-50 max-w-sm rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-lg md:bottom-5"}>{notice.text}</p>}
    {loadError ? <p role="alert" className="text-sm text-rose-700">{loadError} <button type="button" onClick={() => setVersion((value) => value + 1)} className="font-bold underline">Coba lagi</button></p> : loading && !data ? <TableSkeleton rows={5} columns={5} /> : !source ? <EmptyState title="Pilih kelas asal" description="Daftar siswa aktif akan ditampilkan setelah kelas asal dipilih." /> : data?.siswa.length === 0 ? <EmptyState title="Tidak ada siswa aktif" description="Tidak ada siswa aktif di kelas asal ini." /> : data && <>
      <div className="dashboard-glass overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4"><label><input ref={selectAll} type="checkbox" checked={allSelected} disabled={busy} onChange={(event) => setSelected(event.target.checked ? new Set(data.siswa.map((item) => item.id)) : new Set())} /><span className="sr-only">Pilih semua siswa</span></label></th><th className="p-4">NISN</th><th className="p-4">Nama Siswa</th><th className="p-4">Kelas Saat Ini</th><th className="p-4">Status Akun</th></tr></thead><tbody>{data.siswa.map((student) => <tr key={student.id} className="border-t border-slate-100 hover:bg-indigo-50/60"><td className="p-4"><input type="checkbox" aria-label={`Pilih ${student.nama} (${student.nisn})`} checked={selected.has(student.id)} disabled={busy} onChange={(event) => setSelected((previous) => { const next = new Set(previous); if (event.target.checked) next.add(student.id); else next.delete(student.id); return next; })} /></td><td className="p-4">{student.nisn}</td><td className="p-4 font-semibold">{student.nama}</td><td className="p-4">{classes.find((item) => item.id === source)?.nama}</td><td className="p-4">{student.statusAkun}</td></tr>)}</tbody></table></div>
      <button type="button" disabled={busy || !selected.size || !destination || destination === source} onClick={move} className="master-primary disabled:opacity-50">Naikkan {selected.size} Siswa Terpilih</button>
    </>}
    {busy && <SchoolModal title="Memindahkan siswa" busy onClose={() => undefined}><p role="status" className="mt-4 text-sm">Memproses {progress.done} dari {progress.total} siswa. Jangan tutup atau muat ulang halaman.</p></SchoolModal>}
  </div>;
}
