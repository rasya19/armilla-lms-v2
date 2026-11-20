import { useState } from "react";
import { createPortal } from "react-dom";
import { useGlassConfirm } from "./GlassConfirm";
import { SchoolModal } from "./SchoolModal";
import { classMatchesPackage } from "./standardClasses";
import { describeFetchError, fetchWithTimeout } from "./fetchWithTimeout";
import { useTenantTheme } from "./TenantThemeProvider";

export type PlacementStudent = { id: string; nama: string; nisn: string; kelasId: string | null };
export type PlacementClass = { id: string; nama: string };
export type PlacementNotice = { error: boolean; text: string };

export function BulkPlacementAction({ students, classes, floating = false, onFinished }: { students: PlacementStudent[]; classes: PlacementClass[]; floating?: boolean; onFinished: (notice: PlacementNotice) => void }) {
  const isDark = useTenantTheme() === "dark";
  const confirm = useGlassConfirm();
  const [destination, setDestination] = useState("");
  const [paket, setPaket] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const target = classes.find((item) => item.id === destination);
    if (busy || !target || !students.length) return;
    if (!await confirm(`Masukkan ${students.length} siswa ke ${target.nama}? Kelas sebelumnya akan diganti dan riwayat kelas belum disimpan.`)) return;
    setBusy(true);
    let notice: PlacementNotice;
    try {
      const response = await fetchWithTimeout("/api/sekolah/penempatan-massal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kelasId: destination, siswa: students.map((student) => ({ id: student.id, expectedKelasId: student.kelasId })) }) });
      if (!response.ok) {
        let message = `Penempatan gagal (status ${response.status}).`;
        if (response.headers.get("content-type")?.includes("application/json")) {
          const value: unknown = await response.json();
          if (value && typeof value === "object" && "error" in value && typeof value.error === "string") message = value.error;
        }
        throw new Error(message);
      }
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || !("updated" in value) || value.updated !== students.length) throw new Error("Respons tidak valid. Periksa kelas siswa sebelum mencoba lagi.");
      notice = { error: false, text: `${students.length} siswa berhasil dimasukkan ke ${target.nama}.` };
    } catch (failure) {
      notice = { error: true, text: describeFetchError(failure, "Penempatan belum dapat disimpan.") };
    } finally { setBusy(false); }
    onFinished(notice);
  }

  const selectClass = isDark
    ? "mt-1 w-full rounded-xl border border-slate-700/80 bg-slate-800/90 p-2.5 text-sm font-medium text-slate-100 focus:outline-2 focus:outline-amber-400"
    : "mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 font-normal";

  const controls = (
    <div
      className={
        floating
          ? isDark
            ? "fixed inset-x-3 bottom-24 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-amber-400/25 bg-[#121a2b]/92 p-3.5 text-slate-100 shadow-[0_20px_50px_rgba(2,6,23,0.78)] backdrop-blur-2xl md:bottom-5"
            : "fixed inset-x-3 bottom-24 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-white/80 bg-white/95 p-3 shadow-2xl backdrop-blur-xl md:bottom-5"
          : "flex flex-wrap items-end gap-3"
      }
    >
      <div className="flex items-center gap-2.5">
        {isDark && (
          <span className="flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 px-2 text-sm font-black tabular-nums text-slate-950 shadow-[0_0_16px_rgba(245,158,11,0.35)]">
            {students.length}
          </span>
        )}
        <span className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
          {isDark ? "Siswa terpilih" : `${students.length} siswa dipilih`}
        </span>
      </div>
      <label className={`min-w-[9rem] flex-1 text-xs font-semibold ${isDark ? "text-slate-300" : "text-sm text-slate-800"}`}>
        Paket
        <select disabled={busy} className={selectClass} value={paket} onChange={(event) => { setPaket(event.target.value); setDestination(""); }}>
          <option value="">Pilih paket</option>
          <option>Paket A</option>
          <option>Paket B</option>
          <option>Paket C</option>
        </select>
      </label>
      <label className={`min-w-[12rem] flex-1 text-xs font-semibold ${isDark ? "text-slate-300" : "text-sm text-slate-800"}`}>
        Kelas tujuan
        <select disabled={busy || !paket} className={selectClass} value={destination} onChange={(event) => setDestination(event.target.value)}>
          <option value="">Pilih kelas tujuan</option>
          {classes.filter((item) => classMatchesPackage(item.nama, paket)).map((item) => (
            <option key={item.id} value={item.id}>
              {item.nama} ({item.id.slice(0, 8)})
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !destination || !students.length}
        onClick={submit}
        className={
          isDark
            ? "rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-xs font-extrabold text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.38)] transition hover:brightness-105 disabled:opacity-45"
            : "master-primary disabled:opacity-50"
        }
      >
        {floating ? "Masukkan ke Kelas" : `Masukkan ${students.length} Siswa ke Kelas Tujuan`}
      </button>
    </div>
  );
  return <>
    {floating ? createPortal(controls, document.body) : controls}
    {busy && <SchoolModal title="Menyimpan penempatan" busy onClose={() => undefined}><p role="status" className="mt-4 text-sm">Sedang memproses {students.length} siswa. Jangan tutup atau muat ulang halaman.</p></SchoolModal>}
  </>;
}
