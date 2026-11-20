import { useEffect, useState } from "react";
import { useGlassConfirm } from "./GlassConfirm";
import { ExamTaking, type StartedExam } from "./ExamTaking";

type Role = "ADMIN" | "GURU" | "SISWA";
type Exam = { id: string; judul: string; mulai: string; selesai: string; durasiMenit: number; mapel: { nama: string }; percobaan: { dikumpulkanPada: string | null; nilai: number | null; nilaiOverride: number | null }[] };
type Schedule = { id: string; mapel: { nama: string }; guru: { nama: string }; tahunAjaran: { nama: string; semester: string } };
type Question = { id: string; teks: string; urutan: number; opsi: { id: string; kode: string; teks: string; benar: boolean }[] };
type Result = { nama: string; nisn: string; id: string; hasil: null | { dikumpulkanPada: string | null; nilai: number | null; nilaiOverride: number | null; catatanGuru: string | null; jawaban: { soalId: string; opsi: { kode: string } | null }[] } };
type Report = { judul: string; soal: Question[]; rows: Result[] };
type DraftQuestion = { teks: string; opsi: string[]; benar: string };
const emptyQuestion = (): DraftQuestion => ({ teks: "", opsi: ["", "", "", ""], benar: "A" });
const field = "glass-input mt-1 w-full rounded-xl px-3 py-2";
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function named(value: unknown): value is { nama: string } { return object(value) && typeof value.nama === "string"; }
function question(value: unknown): value is Question {
  return object(value) && typeof value.id === "string" && typeof value.teks === "string" && typeof value.urutan === "number" && Array.isArray(value.opsi) && value.opsi.every((item: unknown) => object(item) && typeof item.id === "string" && typeof item.kode === "string" && typeof item.teks === "string" && typeof item.benar === "boolean");
}
function result(value: unknown): value is Result {
  if (!object(value) || typeof value.id !== "string" || typeof value.nama !== "string" || typeof value.nisn !== "string") return false;
  const hasil = value.hasil;
  return hasil === null || (object(hasil) && (hasil.dikumpulkanPada === null || typeof hasil.dikumpulkanPada === "string") && (hasil.nilai === null || typeof hasil.nilai === "number") && (hasil.nilaiOverride === null || typeof hasil.nilaiOverride === "number") && (hasil.catatanGuru === null || typeof hasil.catatanGuru === "string") && Array.isArray(hasil.jawaban) && hasil.jawaban.every((item: unknown) => object(item) && typeof item.soalId === "string" && (item.opsi === null || (object(item.opsi) && typeof item.opsi.kode === "string"))));
}
function exam(value: unknown): value is Exam {
  return object(value) && typeof value.id === "string" && typeof value.judul === "string" && typeof value.mulai === "string" && typeof value.selesai === "string" && typeof value.durasiMenit === "number" && named(value.mapel) && Array.isArray(value.percobaan) && value.percobaan.every((item: unknown) => object(item) && (item.dikumpulkanPada === null || typeof item.dikumpulkanPada === "string") && (item.nilai === null || typeof item.nilai === "number") && (item.nilaiOverride === null || typeof item.nilaiOverride === "number"));
}
function schedule(value: unknown): value is Schedule {
  return object(value) && typeof value.id === "string" && named(value.mapel) && named(value.guru) && object(value.tahunAjaran) && typeof value.tahunAjaran.nama === "string" && typeof value.tahunAjaran.semester === "string";
}
function started(value: unknown): value is StartedExam {
  return object(value) && typeof value.id === "string" && typeof value.judul === "string" && typeof value.siswaId === "string" && typeof value.deadline === "string" && !Number.isNaN(Date.parse(value.deadline)) && Array.isArray(value.soal) && value.soal.length > 0 && value.soal.every((item: unknown) => object(item) && typeof item.id === "string" && typeof item.urutan === "number" && typeof item.teks === "string" && Array.isArray(item.opsi) && item.opsi.length === 4 && item.opsi.every((option: unknown) => object(option) && (option.kode === "A" || option.kode === "B" || option.kode === "C" || option.kode === "D") && typeof option.teks === "string"));
}
async function request(path: string, method = "GET", body?: object): Promise<unknown> {
  const response = await fetch(path, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(object(value) && typeof value.error === "string" ? value.error : "Permintaan ujian gagal.");
  return value;
}
function rows<T>(value: unknown, guard: (row: unknown) => row is T): T[] {
  if (!object(value) || !Array.isArray(value.rows) || !value.rows.every(guard)) throw new Error("Respons ujian tidak valid.");
  return value.rows;
}
function errorText(error: unknown) { return error instanceof TypeError ? "Koneksi terputus. Muat ulang untuk memeriksa hasil." : error instanceof Error ? error.message : "Permintaan gagal."; }

export function ExamCenter({ role, kelasId }: { role: Role; kelasId: string }) {
  const base = `/api/${role === "ADMIN" ? "sekolah" : "lms"}/ujian`;
  const confirm = useGlassConfirm();
  const [list, setList] = useState<Exam[] | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selected, setSelected] = useState<StartedExam | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [editing, setEditing] = useState<Result | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [override, setOverride] = useState("");
  const [note, setNote] = useState("");
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ jadwalId: "", judul: "", mulai: "", selesai: "", durasiMenit: "60" });
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    request(`${base}/kelas/${encodeURIComponent(kelasId)}`).then((value) => { if (active) setList(rows(value, exam)); }).catch((failure: unknown) => { if (active) { console.error(failure); setError(errorText(failure)); } });
    if (role !== "SISWA") request(`${base}/jadwal/${encodeURIComponent(kelasId)}`).then((value) => { if (active) setSchedules(rows(value, schedule)); }).catch((failure: unknown) => { if (active) { console.error(failure); setError(errorText(failure)); } });
    return () => { active = false; };
  }, [base, kelasId, role, version]);
  useEffect(() => {
    if (!reportId) { setReport(null); return; }
    let active = true;
    request(`${base}/${encodeURIComponent(reportId)}/rekap`).then((value) => {
      if (!object(value) || typeof value.judul !== "string" || !Array.isArray(value.soal) || !value.soal.every(question) || !Array.isArray(value.rows) || !value.rows.every(result)) throw new Error("Respons rekap tidak valid.");
      if (active) setReport({ judul: value.judul, soal: value.soal, rows: value.rows });
    }).catch((failure: unknown) => { if (active) { console.error(failure); setError(errorText(failure)); } });
    return () => { active = false; };
  }, [base, reportId, version]);
  async function act(path: string, method: string, body?: object) {
    setBusy(true); setError("");
    try { return await request(path, method, body); }
    catch (failure) { console.error("Operasi ujian gagal:", failure); setError(errorText(failure)); return null; }
    finally { setBusy(false); }
  }
  async function start(id: string) {
    const value = await act(`${base}/${encodeURIComponent(id)}/mulai`, "POST");
    if (!value) return;
    if (!started(value)) { setError("Respons soal ujian tidak valid."); return; }
    setSelected(value);
  }
  async function saveExam(event: React.FormEvent) {
    event.preventDefault();
    const mulai = new Date(`${form.mulai}:00+07:00`), selesai = new Date(`${form.selesai}:00+07:00`);
    if (Number.isNaN(mulai.getTime()) || Number.isNaN(selesai.getTime())) { setError("Waktu ujian tidak valid."); return; }
    if (await act(base, "POST", { ...form, mulai: mulai.toISOString(), selesai: selesai.toISOString(), durasiMenit: Number(form.durasiMenit), soal: questions })) {
      setCreate(false); setQuestions([emptyQuestion()]); setForm({ jadwalId: "", judul: "", mulai: "", selesai: "", durasiMenit: "60" }); setNotice("Ujian dibuat."); setVersion((n) => n + 1);
    }
  }
  function edit(row: Result) {
    setEditing(row); setAnswers(Object.fromEntries((row.hasil?.jawaban ?? []).map((item) => [item.soalId, item.opsi?.kode ?? ""])));
    setOverride(row.hasil?.nilaiOverride === null || row.hasil?.nilaiOverride === undefined ? "" : String(row.hasil.nilaiOverride)); setNote(row.hasil?.catatanGuru ?? "");
  }
  async function saveResult() {
    if (!editing || !reportId || !report) return;
    const jawaban = Object.fromEntries(report.soal.map((question) => [question.id, answers[question.id] || null]));
    if (await act(`${base}/${encodeURIComponent(reportId)}/hasil/${encodeURIComponent(editing.id)}`, "PUT", { jawabanJson: jawaban, nilaiOverride: override === "" ? null : Number(override), catatanGuru: note })) { setEditing(null); setNotice("Nilai disimpan."); setVersion((n) => n + 1); }
  }
  async function reset(row: Result) {
    if (!reportId || !await confirm(`Reset ujian ${row.nama}? Draf pada perangkat siswa tetap tersedia.`)) return;
    if (await act(`${base}/${encodeURIComponent(reportId)}/hasil/${encodeURIComponent(row.id)}/reset`, "DELETE")) { setNotice("Ujian direset."); setVersion((n) => n + 1); }
  }
  async function exportReport() {
    if (!report) return;
    try {
      const XLSX = await import("xlsx"); const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["NISN", "Nama", "Status", "Nilai Akhir", "Catatan Guru"], ...report.rows.map((row) => [row.nisn, row.nama, row.hasil?.dikumpulkanPada ? "Selesai" : "Belum selesai", row.hasil?.nilaiOverride ?? row.hasil?.nilai ?? "", row.hasil?.catatanGuru ?? ""])]), "Rekap");
      XLSX.writeFile(book, "Rekap_Ujian.xlsx");
    } catch (failure) { console.error(failure); setError("Rekap belum dapat diekspor."); }
  }
  if (selected) return <ExamTaking exam={selected} base={base} onExit={() => setSelected(null)} onSubmitted={() => { setSelected(null); setNotice("Ujian berhasil dikumpulkan."); setVersion((n) => n + 1); }} />;
  return <section className="dashboard-glass space-y-4 rounded-3xl p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Ujian &amp; CBT</h2>{role !== "SISWA" && <button type="button" className="master-primary" onClick={() => setCreate(!create)}>{create ? "Tutup" : "+ Buat Ujian"}</button>}</div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error} <button type="button" onClick={() => { setError(""); setVersion((n) => n + 1); }} className="font-bold underline">Muat ulang</button></p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {create && <form onSubmit={saveExam} className="space-y-3 rounded-2xl border p-4"><h3 className="font-bold">Buat ujian</h3><label className="block text-sm">Jadwal<select required className={field} value={form.jadwalId} onChange={(e) => setForm({ ...form, jadwalId: e.target.value })}><option value="">Pilih jadwal</option>{schedules.map((item) => <option key={item.id} value={item.id}>{item.mapel.nama} · {item.guru.nama} · {item.tahunAjaran.nama} {item.tahunAjaran.semester}</option>)}</select></label><label className="block text-sm">Judul<input required maxLength={200} className={field} value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} /></label><div className="grid gap-3 sm:grid-cols-3">{(["mulai", "selesai", "durasiMenit"] as const).map((name) => <label key={name} className="block text-sm">{name === "mulai" ? "Mulai (WIB)" : name === "selesai" ? "Selesai (WIB)" : "Durasi (menit)"}<input required type={name === "durasiMenit" ? "number" : "datetime-local"} min={name === "durasiMenit" ? "1" : undefined} max={name === "durasiMenit" ? "480" : undefined} className={field} value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} /></label>)}</div>
      {questions.map((question, index) => <fieldset key={index} className="space-y-2 rounded-xl border p-3"><legend className="font-bold">Soal {index + 1}</legend><label className="block text-sm">Pertanyaan<textarea required maxLength={5000} className={field} value={question.teks} onChange={(e) => setQuestions((items) => items.map((item, i) => i === index ? { ...item, teks: e.target.value } : item))} /></label>{question.opsi.map((option, i) => <label key={i} className="block text-sm">Pilihan {"ABCD"[i]}<input required maxLength={2000} className={field} value={option} onChange={(e) => setQuestions((items) => items.map((item, j) => j === index ? { ...item, opsi: item.opsi.map((text, k) => k === i ? e.target.value : text) } : item))} /></label>)}<label className="block text-sm">Kunci<select className={field} value={question.benar} onChange={(e) => setQuestions((items) => items.map((item, i) => i === index ? { ...item, benar: e.target.value } : item))}>{["A", "B", "C", "D"].map((item) => <option key={item}>{item}</option>)}</select></label>{questions.length > 1 && <button type="button" onClick={() => setQuestions((items) => items.filter((_, i) => i !== index))} className="text-sm font-bold text-rose-700">Hapus soal</button>}</fieldset>)}<button type="button" disabled={questions.length >= 100} onClick={() => setQuestions((items) => [...items, emptyQuestion()])} className="font-bold text-indigo-700">+ Tambah Soal</button><button disabled={busy} className="master-primary ml-4">Simpan &amp; Publikasikan</button></form>}
    {!list ? <p>Memuat ujian...</p> : list.length === 0 ? <p>Belum ada ujian untuk kelas ini.</p> : <div className="space-y-2">{list.map((exam) => <div key={exam.id} className="rounded-xl border p-4"><h3 className="font-bold">{exam.judul}</h3><p className="text-sm">{exam.mapel.nama} · {new Date(exam.mulai).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB · {exam.durasiMenit} menit</p>{role === "SISWA" ? exam.percobaan[0]?.dikumpulkanPada ? <p className="mt-2 text-sm">Selesai · Nilai: {exam.percobaan[0].nilaiOverride ?? exam.percobaan[0].nilai ?? "—"}</p> : <button type="button" disabled={busy} onClick={() => void start(exam.id)} className="master-primary mt-2">Mulai / Lanjutkan</button> : <button type="button" onClick={() => { setReportId(exam.id); setReport(null); }} className="master-primary mt-2">Rekap Nilai</button>}</div>)}</div>}
    {reportId && <div className="space-y-3 rounded-2xl border p-4"><div className="flex justify-between gap-2"><h3 className="font-bold">Rekap Nilai {report?.judul}</h3><button type="button" onClick={() => setReportId(null)}>Tutup</button></div>{report && <><button type="button" onClick={() => void exportReport()} className="master-primary">Export Excel</button><div className="overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm"><thead><tr><th>Nama</th><th>NISN</th><th>Status</th><th>Nilai</th><th>Aksi</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.id} className="border-t"><td className="py-2">{row.nama}</td><td>{row.nisn}</td><td>{row.hasil?.dikumpulkanPada ? "Selesai" : row.hasil ? "Sedang mengerjakan" : "Belum mengerjakan"}</td><td>{row.hasil?.nilaiOverride ?? row.hasil?.nilai ?? "—"}</td><td><button type="button" onClick={() => edit(row)} className="font-bold text-indigo-700">Edit Jawaban / Nilai</button>{row.hasil && <button type="button" onClick={() => void reset(row)} className="ml-2 font-bold text-rose-700">Reset</button>}</td></tr>)}</tbody></table></div></>}</div>}
    {editing && report && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div role="dialog" aria-modal="true" aria-label="Edit Jawaban dan Nilai" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 text-slate-900"><h3 className="text-lg font-bold">Edit Jawaban &amp; Nilai: {editing.nama}</h3>{report.soal.map((question) => <fieldset key={question.id} className="mt-4 rounded-xl border p-3"><legend className="font-bold">Soal {question.urutan}</legend><p>{question.teks}</p><div className="mt-2 flex flex-wrap gap-2">{["", "A", "B", "C", "D"].map((value) => <button key={value} type="button" aria-pressed={(answers[question.id] ?? "") === value} onClick={() => setAnswers((previous) => ({ ...previous, [question.id]: value }))} className={`rounded-lg px-3 py-2 text-sm font-bold ${(answers[question.id] ?? "") === value ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}>{value || "Kosong"}</button>)}</div><p className="mt-2 text-xs">{!answers[question.id] ? "Belum dijawab" : question.opsi.find((option) => option.kode === answers[question.id])?.benar ? "Benar" : "Salah"}</p></fieldset>)}<label className="mt-4 block text-sm">Nilai Akhir Manual / Remedial<input type="number" min="0" max="100" step="0.01" value={override} onChange={(e) => setOverride(e.target.value)} className={field} /></label><label className="mt-3 block text-sm">Catatan Guru<textarea maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className={field} /></label><div className="mt-4 flex gap-3"><button type="button" onClick={() => setEditing(null)}>Batal</button><button type="button" disabled={busy} onClick={() => void saveResult()} className="master-primary">Simpan Perubahan Nilai</button></div>{error && <p role="alert" className="mt-3 text-rose-700">{error}</p>}</div></div>}
  </section>;
}
