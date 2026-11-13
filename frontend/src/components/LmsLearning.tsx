import { useEffect, useState } from "react";

type Named = { nama: string };
type Assignment = { id: string; hari: number; jamMulai: string; jamSelesai: string; kelas: Named; mapel: Named; tahunAjaran: Named & { semester: string } };
type Submission = { id: string; jawaban: string | null; tautan: string | null; dikumpulkanPada: string; nilai: number | null; catatanGuru: string | null };
type StudentSubmission = Submission & { siswa: Named & { nisn: string } };
type Content = { id: string; judul: string; kelas: Named; mapel: Named; guru: Named; tahunAjaran: Named & { semester: string }; deskripsi?: string | null; tautan?: string | null; instruksi?: string | null; batasWaktu?: string | null; pengumpulan?: Submission[] };
type Page<T> = { rows: T[]; page: number; hasNext: boolean };
type Kind = "materi" | "tugas";
const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white p-2";
const button = "mt-3 rounded-xl bg-[#0c192d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const days = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
function obj(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function named(v: unknown): v is Named { return obj(v) && typeof v.nama === "string"; }
function nullableString(v: unknown): v is string | null { return v === null || typeof v === "string"; }
function submission(v: unknown): v is Submission {
  return obj(v) && typeof v.id === "string" && nullableString(v.jawaban) && nullableString(v.tautan) && typeof v.dikumpulkanPada === "string" && (v.nilai === null || typeof v.nilai === "number") && nullableString(v.catatanGuru);
}
function content(v: unknown): v is Content {
  return obj(v) && typeof v.id === "string" && typeof v.judul === "string" && named(v.kelas) && named(v.mapel) && named(v.guru) && obj(v.tahunAjaran) && typeof v.tahunAjaran.nama === "string" && typeof v.tahunAjaran.semester === "string"
    && (v.deskripsi === undefined || nullableString(v.deskripsi)) && (v.tautan === undefined || nullableString(v.tautan)) && (v.instruksi === undefined || nullableString(v.instruksi)) && (v.batasWaktu === undefined || nullableString(v.batasWaktu)) && (v.pengumpulan === undefined || (Array.isArray(v.pengumpulan) && v.pengumpulan.every(submission)));
}
function assignment(v: unknown): v is Assignment {
  return obj(v) && typeof v.id === "string" && typeof v.hari === "number" && typeof v.jamMulai === "string" && typeof v.jamSelesai === "string" && named(v.kelas) && named(v.mapel) && obj(v.tahunAjaran) && typeof v.tahunAjaran.nama === "string" && typeof v.tahunAjaran.semester === "string";
}
function studentSubmission(v: unknown): v is StudentSubmission { return obj(v) && obj(v.siswa) && typeof v.siswa.nama === "string" && typeof v.siswa.nisn === "string" && submission(v); }
function isPage<T>(v: unknown, guard: (x: unknown) => x is T): v is Page<T> {
  return obj(v) && Array.isArray(v.rows) && v.rows.every(guard) && typeof v.page === "number" && typeof v.hasNext === "boolean";
}
async function request(path: string, method = "GET", body?: object, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/lms/pembelajaran${path}`, { method, signal, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(obj(result) && typeof result.error === "string" ? result.error : `Permintaan gagal (${response.status}).`);
  return result;
}
function failureMessage(failure: unknown): string {
  return failure instanceof TypeError ? "Koneksi terputus. Muat ulang data untuk memeriksa hasil sebelum mencoba lagi." : failure instanceof Error ? failure.message : "Permintaan gagal.";
}
function time(value: string) { return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB"; }
function Link({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return <p className="text-rose-700">Tautan tidak aman dan tidak ditampilkan.</p>;
    return <a className="break-all font-semibold underline" href={url.href} target="_blank" rel="noopener noreferrer">{url.href}</a>;
  } catch { return <p className="text-rose-700">Tautan tidak valid dan tidak ditampilkan.</p>; }
}

export function LmsLearning({ role }: { role: "GURU" | "SISWA" }) {
  const [kind, setKind] = useState<Kind>("materi");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<Page<Content> | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [assignmentError, setAssignmentError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ jadwalId: "", judul: "", isi: "", tautan: "", batasWaktu: "" });
  const [selected, setSelected] = useState<Content | null>(null);
  const [answers, setAnswers] = useState<Page<StudentSubmission> | null>(null);
  const [answerPage, setAnswerPage] = useState(1);
  const [answerError, setAnswerError] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [answerLink, setAnswerLink] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    request(`/${kind}?page=${page}`, "GET", undefined, controller.signal).then((value) => {
      if (!isPage(value, content) || value.page !== page) throw new Error("Respons materi atau tugas tidak valid.");
      setData(value);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) { console.error("Gagal memuat pembelajaran:", failure); setError(failureMessage(failure)); } });
    return () => controller.abort();
  }, [kind, page, version]);
  useEffect(() => {
    if (role !== "GURU") return;
    const controller = new AbortController();
    setAssignmentError("");
    request("/penugasan", "GET", undefined, controller.signal).then((value) => {
      if (!obj(value) || !Array.isArray(value.rows) || !value.rows.every(assignment)) throw new Error("Respons jadwal tidak valid.");
      setAssignments(value.rows);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) { console.error("Gagal memuat jadwal guru:", failure); setAssignmentError(failureMessage(failure)); } });
    return () => controller.abort();
  }, [role, version]);
  useEffect(() => {
    if (!selected || role !== "GURU") return;
    const controller = new AbortController();
    setAnswers(null); setAnswerError("");
    request(`/tugas/${encodeURIComponent(selected.id)}/pengumpulan?page=${answerPage}`, "GET", undefined, controller.signal).then((value) => {
      if (!isPage(value, studentSubmission) || value.page !== answerPage) throw new Error("Respons pengumpulan tidak valid.");
      setAnswers(value);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) { console.error("Gagal memuat pengumpulan:", failure); setAnswerError(failureMessage(failure)); } });
    return () => controller.abort();
  }, [role, selected, answerPage, version]);

  async function mutate(path: string, method: string, body: object, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await request(path, method, body); setMessage(success); setVersion((v) => v + 1); return true; }
    catch (failure) { console.error("Gagal memproses pembelajaran:", failure); setError(failureMessage(failure)); return false; }
    finally { setBusy(false); }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let batasWaktu = "";
    if (kind === "tugas" && form.batasWaktu) {
      const parsed = new Date(`${form.batasWaktu}:00+07:00`);
      if (Number.isNaN(parsed.getTime())) { setError("Batas waktu tidak valid."); return; }
      batasWaktu = parsed.toISOString();
    }
    if (await mutate(`/${kind}`, "POST", { ...form, batasWaktu }, `${kind === "materi" ? "Materi" : "Tugas"} disimpan.`)) {
      setForm({ jadwalId: "", judul: "", isi: "", tautan: "", batasWaktu: "" }); setPage(1);
    }
  }
  async function submitAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !window.confirm("Kumpulkan jawaban ini? Pada tahap ini jawaban tidak dapat diubah setelah dikumpulkan.")) return;
    if (await mutate(`/tugas/${encodeURIComponent(selected.id)}/pengumpulan`, "POST", { jawaban: answerText, tautan: answerLink }, "Jawaban dikumpulkan.")) { setSelected(null); setAnswerText(""); setAnswerLink(""); }
  }
  async function grade(id: string, nilai: string, catatanGuru: string) {
    if (!selected) return;
    await mutate(`/tugas/${encodeURIComponent(selected.id)}/pengumpulan/${encodeURIComponent(id)}`, "PATCH", { nilai: Number(nilai), catatanGuru }, "Nilai disimpan.");
  }
  function switchKind(value: Kind) { setKind(value); setPage(1); setSelected(null); setMessage(""); setError(""); }
  return <section className="mt-6 rounded-xl border border-[#e6dfd0] bg-[#f8f6ef] p-5">
    <h2 className="font-bold">Materi dan tugas</h2><p className="mt-2 text-sm text-slate-600">Uji lokal. Hanya periode aktif dan kelas yang sesuai ditampilkan. Tautan harus HTTPS; pastikan penerima memiliki izin mengaksesnya.</p>
    <div className="mt-3 flex gap-3"><button type="button" aria-pressed={kind === "materi"} onClick={() => switchKind("materi")} className="font-bold underline">Materi</button><button type="button" aria-pressed={kind === "tugas"} onClick={() => switchKind("tugas")} className="font-bold underline">Tugas</button></div>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}{message && <p role="status" className="mt-3 text-sm text-green-700">{message}</p>}
    {role === "GURU" && <form onSubmit={create} className="mt-4 rounded-xl border border-[#e6dfd0] bg-white p-4">
      <h3 className="font-bold">Buat {kind}</h3>
      {assignmentError && <p role="alert" className="mt-2 text-sm text-rose-700">{assignmentError} <button type="button" onClick={() => setVersion((v) => v + 1)} className="font-bold underline">Coba lagi</button></p>}
      <label className="mt-3 block text-sm font-semibold">Jadwal mengajar<select required className={field} value={form.jadwalId} onChange={(e) => setForm({ ...form, jadwalId: e.target.value })}><option value="">Pilih jadwal aktif</option>{assignments?.map((a) => <option key={a.id} value={a.id}>{a.mapel.nama} · {a.kelas.nama} · {a.tahunAjaran.nama} {a.tahunAjaran.semester} · {days[a.hari]} {a.jamMulai}–{a.jamSelesai}</option>)}</select></label>
      {assignments?.length === 0 && <p className="mt-2 text-sm">Belum ada jadwal aktif. Hubungi admin sekolah.</p>}
      <label className="mt-3 block text-sm font-semibold">Judul<input required maxLength={200} className={field} value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} /></label>
      <label className="mt-3 block text-sm font-semibold">{kind === "materi" ? "Isi materi (boleh kosong jika ada tautan)" : "Instruksi tugas"}<textarea required={kind === "tugas"} maxLength={5000} className={field} value={form.isi} onChange={(e) => setForm({ ...form, isi: e.target.value })} /></label>
      {kind === "materi" ? <label className="mt-3 block text-sm font-semibold">Tautan HTTPS (opsional)<input type="url" maxLength={2000} className={field} value={form.tautan} onChange={(e) => setForm({ ...form, tautan: e.target.value })} /></label> : <label className="mt-3 block text-sm font-semibold">Batas waktu WIB (opsional)<input type="datetime-local" className={field} value={form.batasWaktu} onChange={(e) => setForm({ ...form, batasWaktu: e.target.value })} /></label>}
      <button disabled={busy || !assignments?.length} className={button}>Simpan {kind}</button>
    </form>}
    {!data && !error ? <p className="mt-4 text-sm">Memuat...</p> : error && !data ? <button type="button" onClick={() => setVersion((v) => v + 1)} className="mt-3 font-bold underline">Coba lagi</button> : data && <>{data.rows.length === 0 ? <p className="mt-4 text-sm">Belum ada {kind} pada halaman ini.</p> : <ul className="mt-4 space-y-3">{data.rows.map((item) => <li key={item.id} className="rounded-xl border border-[#e6dfd0] bg-white p-4 text-sm"><h3 className="font-bold">{item.judul}</h3><p className="mt-1">{item.mapel.nama} · {item.kelas.nama} · {item.guru.nama}</p><p className="text-slate-600">{item.tahunAjaran.nama} · {item.tahunAjaran.semester}</p><p className="mt-2 whitespace-pre-wrap break-words">{kind === "materi" ? item.deskripsi : item.instruksi}</p><Link value={item.tautan} />
      {kind === "tugas" && <><p className="mt-2">Batas: {item.batasWaktu ? time(item.batasWaktu) : "Tidak ada"}</p>{role === "SISWA" && item.pengumpulan?.[0] ? <div className="mt-2"><p>Sudah dikumpulkan: {time(item.pengumpulan[0].dikumpulkanPada)}{item.batasWaktu && new Date(item.pengumpulan[0].dikumpulkanPada) > new Date(item.batasWaktu) ? " · Terlambat" : ""}</p><p className="whitespace-pre-wrap break-words">{item.pengumpulan[0].jawaban}</p><Link value={item.pengumpulan[0].tautan} /><p>Nilai: {item.pengumpulan[0].nilai ?? "Belum dinilai"}</p><p className="whitespace-pre-wrap break-words">{item.pengumpulan[0].catatanGuru}</p></div> : <button type="button" onClick={() => { setSelected(item); setAnswerPage(1); setAnswerText(""); setAnswerLink(""); }} className="mt-2 font-bold underline">{role === "GURU" ? "Lihat pengumpulan" : "Kumpulkan jawaban"}</button>}</>}
    </li>)}</ul>}<div className="mt-4 flex gap-4 text-sm"><button type="button" disabled={page === 1} onClick={() => { setSelected(null); setPage((v) => v - 1); }} className="font-bold underline disabled:text-slate-400">Sebelumnya</button><span>Halaman {page}</span><button type="button" disabled={!data.hasNext} onClick={() => { setSelected(null); setPage((v) => v + 1); }} className="font-bold underline disabled:text-slate-400">Berikutnya</button></div></>}
    {selected && kind === "tugas" && <section className="mt-4 rounded-xl border border-[#e6dfd0] bg-white p-4"><h3 className="font-bold">{role === "GURU" ? "Pengumpulan" : "Jawaban"}: {selected.judul}</h3><button type="button" onClick={() => setSelected(null)} className="mt-2 text-sm font-bold underline">Tutup</button>
      {role === "SISWA" ? <form onSubmit={submitAnswer}><p className="mt-2 text-sm">Jawaban hanya dapat dikumpulkan sekali dan tidak bisa diubah. Jawaban setelah batas waktu tetap diterima dan ditandai terlambat.</p><label className="mt-3 block text-sm font-semibold">Jawaban teks<textarea maxLength={5000} className={field} value={answerText} onChange={(e) => setAnswerText(e.target.value)} /></label><label className="mt-3 block text-sm font-semibold">Tautan HTTPS<input type="url" maxLength={2000} className={field} value={answerLink} onChange={(e) => setAnswerLink(e.target.value)} /></label><button disabled={busy || (!answerText.trim() && !answerLink.trim())} className={button}>Kumpulkan tugas</button></form>
        : answerError ? <p role="alert" className="mt-3 text-sm text-rose-700">{answerError} <button type="button" onClick={() => setVersion((v) => v + 1)} className="font-bold underline">Coba lagi</button></p>
        : !answers ? <p className="mt-3 text-sm">Memuat pengumpulan...</p> : <>{answers.rows.length === 0 ? <p className="mt-3 text-sm">Belum ada pengumpulan pada halaman ini.</p> : answers.rows.map((answer) => <GradeForm key={answer.id} answer={answer} deadline={selected.batasWaktu} busy={busy} onSave={grade} />)}<div className="mt-4 flex gap-4 text-sm"><button type="button" disabled={answerPage === 1} onClick={() => setAnswerPage((v) => v - 1)} className="font-bold underline disabled:text-slate-400">Sebelumnya</button><span>Halaman {answerPage}</span><button type="button" disabled={!answers.hasNext} onClick={() => setAnswerPage((v) => v + 1)} className="font-bold underline disabled:text-slate-400">Berikutnya</button></div></>}
    </section>}
  </section>;
}

function GradeForm({ answer, deadline, busy, onSave }: { answer: StudentSubmission; deadline?: string | null; busy: boolean; onSave: (id: string, nilai: string, catatan: string) => Promise<void> }) {
  const [nilai, setNilai] = useState(answer.nilai === null ? "" : String(answer.nilai));
  const [catatan, setCatatan] = useState(answer.catatanGuru ?? "");
  return <form onSubmit={(event) => { event.preventDefault(); void onSave(answer.id, nilai, catatan); }} className="mt-3 rounded-xl border border-[#e6dfd0] p-3 text-sm">
    <p className="font-bold">{answer.siswa.nama} · {answer.siswa.nisn}</p><p>Dikumpulkan: {time(answer.dikumpulkanPada)}{deadline && new Date(answer.dikumpulkanPada) > new Date(deadline) ? " · Terlambat" : ""}</p>
    <p className="mt-2 whitespace-pre-wrap break-words">{answer.jawaban}</p><Link value={answer.tautan} />
    <label className="mt-3 block font-semibold">Nilai (0–100)<input type="number" min="0" max="100" step="any" required className={field} value={nilai} onChange={(e) => setNilai(e.target.value)} /></label>
    <label className="mt-3 block font-semibold">Komentar guru<textarea maxLength={2000} className={field} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label><button disabled={busy} className={button}>Simpan nilai</button>
  </form>;
}
