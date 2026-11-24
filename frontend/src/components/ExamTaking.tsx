import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2 } from "lucide-react";
import { describeFetchError, fetchWithTimeout } from "./fetchWithTimeout";
import { useGlassConfirm } from "./GlassConfirm";
import { useTenantTheme } from "./TenantThemeProvider";

type Choice = "A" | "B" | "C" | "D";
export type ExamQuestion = { id: string; urutan: number; teks: string; opsi: { kode: string; teks: string }[] };
export type StartedExam = { id: string; judul: string; siswaId: string; deadline: string; soal: ExamQuestion[] };
export function ExamTaking({ exam, base, onExit, onSubmitted }: { exam: StartedExam; base: string; onExit: () => void; onSubmitted: () => void }) {
  const confirm = useGlassConfirm();
  const theme = useTenantTheme();
  const key = `cbt:${exam.id}:${exam.siswaId}`;
  const [draft] = useState<{ valid: Record<string, Choice>; error: string }>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Draf jawaban tidak valid.");
      const valid: Record<string, Choice> = {};
      for (const [id, value] of Object.entries(raw)) if (exam.soal.some((question) => question.id === id) && (value === "A" || value === "B" || value === "C" || value === "D")) valid[id] = value;
      return { valid, error: "" };
    } catch (error) { console.error("Draf ujian tidak dapat dibaca:", error); return { valid: {}, error: "Draf sebelumnya tidak dapat dibaca. Periksa jawaban Anda sebelum mengumpulkan." }; }
  });
  const [answers, setAnswers] = useState(draft.valid);
  const [storageError, setStorageError] = useState(draft.error);
  const [index, setIndex] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(exam.deadline).getTime() - Date.now()));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const deadlineMs = new Date(exam.deadline).getTime();
    if (deadlineMs <= Date.now()) {
      setRemaining(0);
      return;
    }
    const timer = window.setInterval(() => {
      const next = Math.max(0, deadlineMs - Date.now());
      setRemaining(next);
      if (next <= 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [exam.deadline]);
  function choose(id: string, value: Choice) {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(""); }
    catch (failure) { console.error("Draf ujian tidak dapat disimpan:", failure); setStorageError("Draf tidak dapat disimpan di perangkat ini. Jangan tutup halaman sebelum mengumpulkan."); }
  }
  async function submit() {
    if (busy) return;
    if (!await confirm(`Kumpulkan ujian? ${exam.soal.length - Object.keys(answers).length} soal belum dijawab.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetchWithTimeout(
        `${base}/${encodeURIComponent(exam.id)}/kumpulkan`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jawaban: answers }) },
        30_000,
      );
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "Ujian belum dapat dikumpulkan.");
      try { localStorage.removeItem(key); } catch { /* ignore storage cleanup error */ }
      onSubmitted();
    } catch (failure) {
      console.error("Gagal mengumpulkan ujian:", failure);
      setError(describeFetchError(failure, "Koneksi terputus atau timeout. Draf tetap tersimpan; periksa status ujian sebelum mencoba lagi."));
    }
    finally { setBusy(false); }
  }
  const question = exam.soal[index];
  const seconds = Math.ceil(remaining / 1000);
  return createPortal(<div data-tenant-theme={theme} className="fixed inset-0 z-[60]"><div className="dashboard-canvas glass-area min-h-full text-slate-800"><div className="exam-focus fixed inset-0 overflow-y-auto"><div className="mx-auto max-w-3xl space-y-4 p-4 pb-8 sm:p-6">
    <button type="button" disabled={busy} onClick={onExit} className="font-bold text-indigo-700 underline">Keluar dari ujian</button>
    <div className="dashboard-glass rounded-3xl p-6 backdrop-blur-2xl sm:p-8">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-slate-600">{exam.judul}</p><p className="mt-1 font-bold">Soal {index + 1} dari {exam.soal.length}</p></div><span className="rounded-full bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-800" role="timer">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span></div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={exam.soal.length}><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all" style={{ width: `${(index + 1) / exam.soal.length * 100}%` }} /></div>
      <div key={question.id} className="animate-page-enter"><p className="mt-6 whitespace-pre-wrap text-base font-semibold leading-relaxed sm:text-lg">{question.teks}</p><div className="mt-5 space-y-3">{question.opsi.map((option) => {
        const selected = answers[question.id] === option.kode;
        return <button key={option.kode} type="button" aria-pressed={selected} disabled={busy || !remaining} onClick={() => { if (option.kode === "A" || option.kode === "B" || option.kode === "C" || option.kode === "D") choose(question.id, option.kode); }} className={`theme-choice flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${selected ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white/70 text-slate-800"}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-800">{option.kode}</span><span className="flex-1">{option.teks}</span>{selected && <CheckCircle2 size={20} />}</button>;
      })}</div></div>
    </div>
    {storageError && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-950">{storageError}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {!remaining && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">Waktu habis. Draf tetap ada di perangkat; hubungi guru untuk bantuan.</p>}
    <div className="sticky bottom-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/90 p-3 shadow-xl backdrop-blur-xl"><button type="button" disabled={index === 0 || busy} onClick={() => setIndex((n) => n - 1)} className="rounded-xl px-3 py-2 text-sm font-bold text-indigo-800 disabled:opacity-40">← Sebelumnya</button><button type="button" onClick={() => setDrawer(true)} className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-800">Daftar Soal ({Object.keys(answers).length}/{exam.soal.length})</button>{index === exam.soal.length - 1 ? <button type="button" disabled={busy || !remaining} onClick={() => void submit()} className="master-primary disabled:opacity-50">Selesai &amp; Kumpulkan</button> : <button type="button" onClick={() => setIndex((n) => n + 1)} className="master-primary">Selanjutnya →</button>}</div>
    {drawer && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60"><div role="dialog" aria-modal="true" aria-label="Daftar soal" onKeyDown={(event) => { if (event.key === "Escape") setDrawer(false); }} className="animate-page-enter w-full max-w-2xl rounded-t-3xl bg-white p-6 text-slate-900 shadow-2xl"><div className="flex justify-between"><h2 className="font-bold">Daftar Soal</h2><button type="button" autoFocus onClick={() => setDrawer(false)} className="font-bold text-indigo-700">Tutup</button></div><div className="mt-4 grid max-h-64 grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-8">{exam.soal.map((item, i) => <button key={item.id} type="button" aria-label={`Soal ${i + 1}, ${answers[item.id] ? "terjawab" : "belum dijawab"}`} onClick={() => { setIndex(i); setDrawer(false); }} className={`rounded-xl p-3 font-bold ${answers[item.id] ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{i + 1}</button>)}</div></div></div>}
  </div></div></div></div>, document.body);
}
