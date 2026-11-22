import { useEffect, useRef, useState } from "react";
import { BookOpen, Camera, Download, Image as ImageIcon, Maximize2, Minimize2, Pencil, Trash2, X } from "lucide-react";
import { useGlassConfirm } from "./GlassConfirm";
import { SchoolModal } from "./SchoolModal";
import { EmptyState, TableSkeleton } from "./DashboardUI";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { ModulePdfPreview, ModulePdfViewerModal } from "./ModulePdfPreview";

type Named = { nama: string };
type Assignment = { id: string; hari: number; jamMulai: string; jamSelesai: string; kelas: Named & { id: string }; mapel: Named & { id: string }; tahunAjaran: Named & { semester: string } };
type Submission = { id: string; jawaban: string | null; tautan: string | null; attachmentPhotoUrl?: string | null; dikumpulkanPada: string; nilai: number | null; catatanGuru: string | null };
type StudentSubmission = Submission & { siswa: Named & { nisn: string } };
type Content = { id: string; judul: string; kelas: Named; mapel: Named; guru: Named; tahunAjaran: Named & { semester: string }; deskripsi?: string | null; tautan?: string | null; instruksi?: string | null; batasWaktu?: string | null; pengumpulan?: Submission[]; bisaMenilai?: boolean; bisaKelola?: boolean };
type Page<T> = { rows: T[]; page: number; hasNext: boolean };
type Kind = "materi" | "tugas";
const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white p-2";
const button = "mt-3 rounded-xl bg-[#0c192d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const days = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
function obj(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function named(v: unknown): v is Named & Record<string, unknown> { return obj(v) && typeof v.nama === "string"; }
function nullableString(v: unknown): v is string | null { return v === null || typeof v === "string"; }
function submission(v: unknown): v is Submission {
  return obj(v)
    && typeof v.id === "string"
    && nullableString(v.jawaban)
    && nullableString(v.tautan)
    && (v.attachmentPhotoUrl === undefined || nullableString(v.attachmentPhotoUrl))
    && typeof v.dikumpulkanPada === "string"
    && (v.nilai === null || typeof v.nilai === "number")
    && nullableString(v.catatanGuru);
}
function content(v: unknown): v is Content {
  return obj(v) && typeof v.id === "string" && typeof v.judul === "string" && named(v.kelas) && named(v.mapel) && named(v.guru) && obj(v.tahunAjaran) && typeof v.tahunAjaran.nama === "string" && typeof v.tahunAjaran.semester === "string"
    && (v.deskripsi === undefined || nullableString(v.deskripsi)) && (v.tautan === undefined || nullableString(v.tautan)) && (v.instruksi === undefined || nullableString(v.instruksi)) && (v.batasWaktu === undefined || nullableString(v.batasWaktu)) && (v.bisaMenilai === undefined || typeof v.bisaMenilai === "boolean") && (v.bisaKelola === undefined || typeof v.bisaKelola === "boolean") && (v.pengumpulan === undefined || (Array.isArray(v.pengumpulan) && v.pengumpulan.every(submission)));
}
function assignment(v: unknown): v is Assignment {
  return obj(v) && typeof v.id === "string" && typeof v.hari === "number" && typeof v.jamMulai === "string" && typeof v.jamSelesai === "string" && named(v.kelas) && obj(v.kelas) && typeof v.kelas.id === "string" && named(v.mapel) && obj(v.mapel) && typeof v.mapel.id === "string" && obj(v.tahunAjaran) && typeof v.tahunAjaran.nama === "string" && typeof v.tahunAjaran.semester === "string";
}
function studentSubmission(v: unknown): v is StudentSubmission { return obj(v) && obj(v.siswa) && typeof v.siswa.nama === "string" && typeof v.siswa.nisn === "string" && submission(v); }
function isPage<T>(v: unknown, guard: (x: unknown) => x is T): v is Page<T> {
  return obj(v) && Array.isArray(v.rows) && v.rows.every(guard) && typeof v.page === "number" && typeof v.hasNext === "boolean";
}
async function request(
  path: string,
  method = "GET",
  body?: object,
  signal?: AbortSignal,
  admin = false,
  sandboxRole?: "GURU" | "SISWA"
): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (!admin && sandboxRole) headers["X-Dev-Sandbox-Role"] = sandboxRole;
  const response = await fetchWithTimeout(`/api/${admin ? "sekolah" : "lms"}/pembelajaran${path}`, {
    method,
    signal,
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(obj(result) && typeof result.error === "string" ? result.error : `Permintaan gagal (${response.status}).`);
  return result;
}
function failureMessage(failure: unknown): string {
  return describeFetchError(failure, "Permintaan gagal.");
}
function time(value: string) { return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB"; }
function toWibLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 16);
}
function Link({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return <p className="text-rose-700">Tautan tidak aman dan tidak ditampilkan.</p>;
    return <a className="break-all font-semibold underline" href={url.href} target="_blank" rel="noopener noreferrer">{url.href}</a>;
  } catch { return <p className="text-rose-700">Tautan tidak valid dan tidak ditampilkan.</p>; }
}

export function isSafeSubmissionPhotoSrc(value: string | null | undefined): value is string {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed.length <= 2_500_000;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export async function compressAssignmentImage(file: File): Promise<{ dataUrl: string; sizeKb: number }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Pilih file gambar (JPG, PNG, atau WebP).");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Ukuran file foto asli maksimal 20 MB.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Foto tidak dapat dibaca. Coba pilih gambar lain."));
      el.src = objectUrl;
    });

    const maxWidth = 1280;
    const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
    const targetWidth = Math.max(1, Math.round(img.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak mendukung kompresi gambar.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
    const base64Bytes = Math.round(((dataUrl.split(",")[1]?.length ?? 0) * 3) / 4);
    if (dataUrl.length > 2_500_000) {
      const fallbackUrl = canvas.toDataURL("image/jpeg", 0.55);
      const fallbackBytes = Math.round(((fallbackUrl.split(",")[1]?.length ?? 0) * 3) / 4);
      return { dataUrl: fallbackUrl, sizeKb: Math.max(1, Math.round(fallbackBytes / 1024)) };
    }
    return { dataUrl, sizeKb: Math.max(1, Math.round(base64Bytes / 1024)) };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function SubmissionPhotoModal({
  src,
  studentName,
  taskTitle,
  onClose,
}: {
  src: string;
  studentName?: string;
  taskTitle?: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!isSafeSubmissionPhotoSrc(src)) return null;

  const safeSlug = (studentName || "lampiran-tugas").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const downloadName = `tugas-${safeSlug || "siswa"}.jpg`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Pratinjau foto tugas${studentName ? ` ${studentName}` : ""}`}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900 text-white shadow-2xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-extrabold sm:text-base">
              {studentName ? `Foto Tugas · ${studentName}` : "Pratinjau Foto Tugas"}
            </h3>
            {taskTitle && <p className="truncate text-xs text-slate-400">{taskTitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setZoomed((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
            >
              {zoomed ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
              {zoomed ? "Sesuaikan Layar" : "Perbesar"}
            </button>
            <a
              href={src}
              download={downloadName}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500"
            >
              <Download size={14} aria-hidden="true" />
              Unduh Foto
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pratinjau foto"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
            >
              <X size={14} aria-hidden="true" />
              Tutup
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950 p-4">
          <img
            src={src}
            alt={studentName ? `Foto tugas ${studentName}` : "Foto tugas siswa"}
            className={
              zoomed
                ? "max-w-none rounded-xl shadow-lg"
                : "max-h-[74vh] w-auto max-w-full rounded-xl object-contain shadow-lg"
            }
          />
        </div>
      </div>
    </div>
  );
}

export function LmsLearning({
  role,
  kelasId,
  mapelId,
  initialKind = "materi",
  sandboxRole,
}: {
  role: "ADMIN" | "GURU" | "SISWA";
  kelasId?: string;
  mapelId?: string;
  initialKind?: Kind;
  sandboxRole?: "GURU" | "SISWA";
}) {
  const confirm = useGlassConfirm();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const queryStr = (() => {
    const q = new URLSearchParams({ page: String(page) });
    if (kelasId) q.set("kelasId", kelasId);
    if (mapelId) q.set("mapelId", mapelId);
    return q.toString();
  })();
  const listCacheKey = `/api/${role === "ADMIN" ? "sekolah" : "lms"}/pembelajaran/${kind}?${queryStr}::${sandboxRole ?? "real"}`;
  const [data, setData] = useState<Page<Content> | null>(() => getCached<Page<Content>>(listCacheKey));
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [schoolKelas, setSchoolKelas] = useState<Array<{ id: string; nama: string }>>([]);
  const [schoolMapel, setSchoolMapel] = useState<Array<{ id: string; nama: string }>>([]);
  const [assignmentError, setAssignmentError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ jadwalId: "", kelasId: kelasId ?? "", mapelId: mapelId ?? "", judul: "", isi: "", tautan: "", batasWaktu: "" });
  const [editing, setEditing] = useState<Content | null>(null);
  const [editForm, setEditForm] = useState({ judul: "", isi: "", tautan: "", batasWaktu: "" });
  const [selected, setSelected] = useState<Content | null>(null);
  const [viewerItem, setViewerItem] = useState<Content | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ src: string; studentName?: string; taskTitle?: string } | null>(null);
  const [answers, setAnswers] = useState<Page<StudentSubmission> | null>(null);
  const [answerPage, setAnswerPage] = useState(1);
  const [answerError, setAnswerError] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [answerLink, setAnswerLink] = useState("");
  const [answerPhoto, setAnswerPhoto] = useState<string>("");
  const [answerPhotoSizeKb, setAnswerPhotoSizeKb] = useState<number | null>(null);
  const [compressingPhoto, setCompressingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const filteredAssignments = assignments?.filter((item) => (!kelasId || item.kelas.id === kelasId) && (!mapelId || item.mapel.id === mapelId));
  const useScheduleSelect = Boolean(filteredAssignments && filteredAssignments.length > 0);

  useEffect(() => { setPage(1); setSelected(null); setEditing(null); }, [kelasId, mapelId]);
  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<Page<Content>>(listCacheKey);
    if (cached) setData(cached);
    setError("");
    request(`/${kind}?${queryStr}`, "GET", undefined, controller.signal, role === "ADMIN", sandboxRole).then((value) => {
      if (!isPage(value, content) || value.page !== page) throw new Error("Respons materi atau tugas tidak valid.");
      setCached(listCacheKey, value);
      setData(value);
    }).catch((failure: unknown) => {
      if (!isCallerAborted(failure, controller.signal) && !cached) { setError(failureMessage(failure)); }
    });
    return () => controller.abort();
  }, [kind, page, queryStr, listCacheKey, version, kelasId, mapelId, role, sandboxRole]);
  useEffect(() => {
    if (role !== "GURU") return;
    const controller = new AbortController();
    setAssignmentError("");
    request("/penugasan", "GET", undefined, controller.signal, false, sandboxRole).then((value) => {
      if (!obj(value) || !Array.isArray(value.rows) || !value.rows.every(assignment)) throw new Error("Respons jadwal tidak valid.");
      setAssignments(value.rows);
      if (Array.isArray(value.kelas)) {
        setSchoolKelas(value.kelas.filter((k): k is { id: string; nama: string } => obj(k) && typeof k.id === "string" && typeof k.nama === "string"));
      }
      if (Array.isArray(value.mapel)) {
        setSchoolMapel(value.mapel.filter((m): m is { id: string; nama: string } => obj(m) && typeof m.id === "string" && typeof m.nama === "string"));
      }
    }).catch((failure: unknown) => { if (!isCallerAborted(failure, controller.signal)) { setAssignmentError(failureMessage(failure)); } });
    return () => controller.abort();
  }, [role, version, sandboxRole]);
  useEffect(() => {
    if (!selected || role === "SISWA") return;
    const controller = new AbortController();
    setAnswers(null); setAnswerError("");
    request(`/tugas/${encodeURIComponent(selected.id)}/pengumpulan?page=${answerPage}`, "GET", undefined, controller.signal, role === "ADMIN", sandboxRole).then((value) => {
      if (!isPage(value, studentSubmission) || value.page !== answerPage) throw new Error("Respons pengumpulan tidak valid.");
      setAnswers(value);
    }).catch((failure: unknown) => { if (!isCallerAborted(failure, controller.signal)) { setAnswerError(failureMessage(failure)); } });
    return () => controller.abort();
  }, [role, selected, answerPage, version, sandboxRole]);

  async function mutate(path: string, method: string, body: object | undefined, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await request(path, method, body, undefined, role === "ADMIN", sandboxRole); invalidateCache(["/api/sekolah/pembelajaran", "/api/lms/pembelajaran", "/api/sekolah/rekap-akademik"]); setMessage(success); setVersion((v) => v + 1); return true; }
    catch (failure) { setError(failureMessage(failure)); return false; }
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
    const payload = useScheduleSelect && form.jadwalId
      ? { jadwalId: form.jadwalId, judul: form.judul, isi: form.isi, tautan: form.tautan, batasWaktu }
      : { kelasId: kelasId || form.kelasId, mapelId: mapelId || form.mapelId, judul: form.judul, isi: form.isi, tautan: form.tautan, batasWaktu };
    if (await mutate(`/${kind}`, "POST", payload, `${kind === "materi" ? "Materi" : "Tugas"} disimpan.`)) {
      setForm({ jadwalId: "", kelasId: kelasId ?? "", mapelId: mapelId ?? "", judul: "", isi: "", tautan: "", batasWaktu: "" }); setPage(1); setCreateOpen(false);
    }
  }
  async function handlePhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setCompressingPhoto(true);
    try {
      const { dataUrl, sizeKb } = await compressAssignmentImage(file);
      setAnswerPhoto(dataUrl);
      setAnswerPhotoSizeKb(sizeKb);
    } catch (failure) {
      setError(failureMessage(failure));
    } finally {
      setCompressingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }
  function clearSelectedPhoto() {
    setAnswerPhoto("");
    setAnswerPhotoSizeKb(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }
  async function submitAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (!answerText.trim() && !answerLink.trim() && !answerPhoto) {
      setError("Isi minimal jawaban teks, tautan, atau unggah foto tugas");
      return;
    }
    if (!await confirm("Kumpulkan tugas ini? Pada tahap ini jawaban tidak dapat diubah setelah dikumpulkan.")) return;
    if (await mutate(`/tugas/${encodeURIComponent(selected.id)}/pengumpulan`, "POST", {
      jawaban: answerText,
      tautan: answerLink,
      attachmentPhotoUrl: answerPhoto,
    }, "Tugas berhasil dikumpulkan.")) {
      setSelected(null);
      setAnswerText("");
      setAnswerLink("");
      clearSelectedPhoto();
    }
  }
  async function grade(id: string, nilai: string, catatanGuru: string) {
    if (!selected) return;
    await mutate(`/tugas/${encodeURIComponent(selected.id)}/pengumpulan/${encodeURIComponent(id)}`, "PATCH", { nilai: Number(nilai), catatanGuru }, "Nilai disimpan.");
  }
  function openEdit(item: Content) {
    setError("");
    setMessage("");
    setEditing(item);
    setEditForm({
      judul: item.judul,
      isi: kind === "materi" ? item.deskripsi ?? "" : item.instruksi ?? "",
      tautan: kind === "materi" ? item.tautan ?? "" : "",
      batasWaktu: kind === "tugas" ? toWibLocalInput(item.batasWaktu) : "",
    });
  }
  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    let batasWaktu = "";
    if (kind === "tugas" && editForm.batasWaktu) {
      const parsed = new Date(`${editForm.batasWaktu}:00+07:00`);
      if (Number.isNaN(parsed.getTime())) { setError("Batas waktu tidak valid."); return; }
      batasWaktu = parsed.toISOString();
    }
    const payload = kind === "materi"
      ? { judul: editForm.judul, isi: editForm.isi, tautan: editForm.tautan }
      : { judul: editForm.judul, isi: editForm.isi, batasWaktu };
    if (await mutate(`/${kind}/${encodeURIComponent(editing.id)}`, "PATCH", payload, `${kind === "materi" ? "Materi" : "Tugas"} diperbarui.`)) {
      setEditing(null);
    }
  }
  async function removeItem(item: Content) {
    const warning = kind === "tugas"
      ? `Hapus tugas "${item.judul}"? Seluruh jawaban pengumpulan siswa untuk tugas ini juga akan dihapus.`
      : `Hapus materi "${item.judul}"?`;
    if (!await confirm(warning)) return;
    if (await mutate(`/${kind}/${encodeURIComponent(item.id)}`, "DELETE", undefined, `${kind === "materi" ? "Materi" : "Tugas"} dihapus.`)) {
      if (selected?.id === item.id) setSelected(null);
      if (editing?.id === item.id) setEditing(null);
    }
  }
  function switchKind(value: Kind) { setKind(value); setPage(1); setSelected(null); setEditing(null); setMessage(""); setError(""); }
  const canCreate = useScheduleSelect || (Boolean(kelasId || schoolKelas.length > 0) && Boolean(mapelId || schoolMapel.length > 0));
  const hasAnySubmissionInput = Boolean(answerText.trim() || answerLink.trim() || answerPhoto);

  return <section className="mt-6 rounded-xl border border-[#e6dfd0] bg-[#f8f6ef] p-5">
    {!kelasId && <><h2 className="font-bold">Materi dan tugas</h2><p className="mt-2 text-sm text-slate-600">Hanya periode aktif dan kelas yang sesuai ditampilkan. Tautan harus HTTPS; pastikan penerima memiliki izin mengaksesnya.</p></>}
    <div className="mt-3 flex flex-wrap items-center gap-3">{!kelasId && <><button type="button" aria-pressed={kind === "materi"} onClick={() => switchKind("materi")} className={`rounded-full px-4 py-2 text-sm font-bold ${kind === "materi" ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"}`}>Materi</button><button type="button" aria-pressed={kind === "tugas"} onClick={() => switchKind("tugas")} className={`rounded-full px-4 py-2 text-sm font-bold ${kind === "tugas" ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"}`}>Tugas</button></>}{role === "GURU" && <button type="button" onClick={() => { setError(""); setForm((prev) => ({ ...prev, kelasId: kelasId ?? prev.kelasId ?? schoolKelas[0]?.id ?? "", mapelId: mapelId ?? prev.mapelId ?? schoolMapel[0]?.id ?? "" })); setCreateOpen(true); }} className="master-primary ml-auto">{kelasId && kind === "materi" ? "+ Bagikan Materi ke Kelas ini" : `+ Buat ${kind}`}</button>}</div>
    {error && !createOpen && !editing && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{error}</p>}{message && <p role="status" className="mt-3 text-sm font-semibold text-green-700">{message}</p>}
    {role === "GURU" && createOpen && <SchoolModal title={`Buat ${kind}`} busy={busy} onClose={() => { setCreateOpen(false); setError(""); }}><form onSubmit={create}>
      {assignmentError && <p role="alert" className="mt-2 text-sm text-rose-700">{assignmentError} <button type="button" onClick={() => setVersion((v) => v + 1)} className="font-bold underline">Coba lagi</button></p>}
      {useScheduleSelect ? (
        <label className="mt-3 block text-sm font-semibold">Jadwal mengajar<select required className={field} value={form.jadwalId} onChange={(e) => setForm({ ...form, jadwalId: e.target.value })}><option value="">Pilih jadwal aktif</option>{filteredAssignments?.map((a) => <option key={a.id} value={a.id}>{a.mapel.nama} · {a.kelas.nama} · {a.tahunAjaran.nama} {a.tahunAjaran.semester} · {days[a.hari]} {a.jamMulai}–{a.jamSelesai}</option>)}</select></label>
      ) : (
        <>
          {!kelasId && (
            <label className="mt-3 block text-sm font-semibold">
              Kelas tujuan
              <select required className={field} value={form.kelasId} onChange={(e) => setForm({ ...form, kelasId: e.target.value })}>
                <option value="">Pilih kelas</option>
                {schoolKelas.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
            </label>
          )}
          {!mapelId && (
            <label className="mt-3 block text-sm font-semibold">
              Mata pelajaran
              <select required className={field} value={form.mapelId} onChange={(e) => setForm({ ...form, mapelId: e.target.value })}>
                <option value="">Pilih mata pelajaran</option>
                {schoolMapel.map((m) => <option key={m.id} value={m.id}>{m.nama}</option>)}
              </select>
            </label>
          )}
          {!canCreate && <p className="mt-2 text-sm text-amber-800">Belum ada kelas atau mata pelajaran terdaftar di sekolah ini.</p>}
        </>
      )}
      <label className="mt-3 block text-sm font-semibold">Judul<input required maxLength={200} className={field} value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} /></label>
      <label className="mt-3 block text-sm font-semibold">{kind === "materi" ? "Isi materi (boleh kosong jika ada tautan)" : "Instruksi tugas"}<textarea required={kind === "tugas"} maxLength={5000} className={field} value={form.isi} onChange={(e) => setForm({ ...form, isi: e.target.value })} /></label>
      {kind === "materi" ? <label className="mt-3 block text-sm font-semibold">Tautan HTTPS (opsional)<input type="url" maxLength={2000} className={field} value={form.tautan} onChange={(e) => setForm({ ...form, tautan: e.target.value })} /></label> : <label className="mt-3 block text-sm font-semibold">Batas waktu WIB (opsional)<input type="datetime-local" className={field} value={form.batasWaktu} onChange={(e) => setForm({ ...form, batasWaktu: e.target.value })} /></label>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}<button disabled={busy || !canCreate} className={button}>Simpan {kind}</button>
    </form></SchoolModal>}
    {role !== "SISWA" && editing && <SchoolModal title={`Edit ${kind}`} busy={busy} onClose={() => { setEditing(null); setError(""); }}><form onSubmit={saveEdit}>
      <p className="text-xs text-slate-600">{editing.mapel.nama} · {editing.kelas.nama} · {editing.tahunAjaran.nama} {editing.tahunAjaran.semester}</p>
      <label className="mt-3 block text-sm font-semibold">Judul<input required maxLength={200} className={field} value={editForm.judul} onChange={(e) => setEditForm({ ...editForm, judul: e.target.value })} /></label>
      <label className="mt-3 block text-sm font-semibold">{kind === "materi" ? "Isi materi (boleh kosong jika ada tautan)" : "Instruksi tugas"}<textarea required={kind === "tugas"} maxLength={5000} className={field} value={editForm.isi} onChange={(e) => setEditForm({ ...editForm, isi: e.target.value })} /></label>
      {kind === "materi" ? <label className="mt-3 block text-sm font-semibold">Tautan HTTPS (opsional)<input type="url" maxLength={2000} className={field} value={editForm.tautan} onChange={(e) => setEditForm({ ...editForm, tautan: e.target.value })} /></label> : <label className="mt-3 block text-sm font-semibold">Batas waktu WIB (opsional)<input type="datetime-local" className={field} value={editForm.batasWaktu} onChange={(e) => setEditForm({ ...editForm, batasWaktu: e.target.value })} /></label>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}<button disabled={busy} className={button}>Simpan perubahan</button>
    </form></SchoolModal>}
    {!data && !error ? <TableSkeleton rows={4} columns={3} /> : error && !data ? <button type="button" onClick={() => setVersion((v) => v + 1)} className="mt-3 font-bold underline">Coba lagi</button> : data && <>{data.rows.length === 0 ? <EmptyState title={`Belum ada ${kind}`} description="Data pada halaman ini akan ditampilkan di sini." action={role === "GURU" ? <button type="button" className="master-primary" onClick={() => setCreateOpen(true)}>Buat {kind}</button> : undefined} /> : <ul className="mt-4 space-y-3">{data.rows.map((item) => <li key={item.id} className="dashboard-glass p-4 text-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1">{kind === "materi" && item.tautan ? <button type="button" onClick={() => setViewerItem(item)} className="text-left font-bold text-indigo-900 underline-offset-2 hover:text-indigo-700 hover:underline">{item.judul}</button> : <h3 className="font-bold">{item.judul}</h3>}<p className="mt-1">{item.mapel.nama} · {item.kelas.nama} · {item.guru.nama}</p><p className="text-slate-600">{item.tahunAjaran.nama} · {item.tahunAjaran.semester}</p></div><div className="flex shrink-0 flex-wrap items-center gap-2">{kind === "materi" && item.tautan && <button type="button" onClick={() => setViewerItem(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"><BookOpen size={13} aria-hidden="true" />Baca Modul</button>}{role !== "SISWA" && item.bisaKelola && <><button type="button" disabled={busy} onClick={() => openEdit(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Pencil size={13} aria-hidden="true" />Edit</button><button type="button" disabled={busy} onClick={() => void removeItem(item)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"><Trash2 size={13} aria-hidden="true" />Hapus</button></>}</div></div><p className="mt-2 whitespace-pre-wrap break-words">{kind === "materi" ? item.deskripsi : item.instruksi}</p>{kind === "materi" ? <ModulePdfPreview url={item.tautan} title={item.judul} defaultExpanded={false} /> : <Link value={item.tautan} />}
      {kind === "tugas" && <><p className="mt-2">Batas: {item.batasWaktu ? time(item.batasWaktu) : "Tidak ada"}</p>{role === "SISWA" && item.pengumpulan?.[0] ? <div className="mt-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"><p className="font-bold text-emerald-900">Sudah dikumpulkan: {time(item.pengumpulan[0].dikumpulkanPada)}{item.batasWaktu && new Date(item.pengumpulan[0].dikumpulkanPada) > new Date(item.batasWaktu) ? " · Terlambat" : ""}</p>{item.pengumpulan[0].jawaban && <p className="whitespace-pre-wrap break-words text-slate-800">{item.pengumpulan[0].jawaban}</p>}<Link value={item.pengumpulan[0].tautan} />{isSafeSubmissionPhotoSrc(item.pengumpulan[0].attachmentPhotoUrl) && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setPhotoPreview({ src: item.pengumpulan![0].attachmentPhotoUrl!, taskTitle: item.judul })}
            className="group inline-flex flex-col items-start gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-2xs transition hover:border-indigo-300"
          >
            <img
              src={item.pengumpulan[0].attachmentPhotoUrl!}
              alt={`Lampiran foto ${item.judul}`}
              className="h-28 w-auto max-w-[220px] rounded-lg object-cover"
            />
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 group-hover:underline">
              <ImageIcon size={12} aria-hidden="true" />
              Perbesar / Unduh Foto Tugas
            </span>
          </button>
        </div>
      )}<p className="font-semibold text-slate-900">Nilai: {item.pengumpulan[0].nilai ?? "Belum dinilai"}</p>{item.pengumpulan[0].catatanGuru && <p className="whitespace-pre-wrap break-words text-slate-700">Catatan: {item.pengumpulan[0].catatanGuru}</p>}</div> : (role === "SISWA" || role === "ADMIN" || item.bisaMenilai) && <button type="button" onClick={() => { setSelected(item); setAnswerPage(1); setAnswerText(""); setAnswerLink(""); clearSelectedPhoto(); setError(""); }} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-indigo-700">{role !== "SISWA" ? "Periksa Pengumpulan & Beri Nilai" : "Kumpulkan Jawaban"}</button>}</>}
    </li>)}</ul>}<div className="mt-4 flex gap-4 text-sm"><button type="button" disabled={page === 1} onClick={() => { setSelected(null); setPage((v) => v - 1); }} className="font-bold underline disabled:text-slate-400">Sebelumnya</button><span>Halaman {page}</span><button type="button" disabled={!data.hasNext} onClick={() => { setSelected(null); setPage((v) => v + 1); }} className="font-bold underline disabled:text-slate-400">Berikutnya</button></div></>}
    {selected && kind === "tugas" && <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">{role !== "SISWA" ? "Pemeriksaan Tugas Siswa" : "Kirim Jawaban Tugas"}: {selected.judul}</h3>
          <p className="text-xs text-slate-600">{selected.mapel.nama} · {selected.kelas.nama}</p>
        </div>
        <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">Tutup</button>
      </div>
      {role === "SISWA" ? <form onSubmit={submitAnswer} className="mt-3 space-y-4">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/90 px-3.5 py-2.5 text-xs text-indigo-950">
          <p className="font-extrabold">Isi minimal salah satu (Jawaban Teks, Tautan HTTPS, atau Foto Tugas)</p>
          <p className="mt-0.5 text-indigo-800">Jawaban hanya dapat dikumpulkan sekali dan tidak bisa diubah. Jawaban setelah batas waktu tetap diterima dan ditandai terlambat.</p>
        </div>
        <label className="block text-sm font-semibold text-slate-800">
          Jawaban Teks (Opsional)
          <textarea maxLength={5000} rows={4} placeholder="Tulis ringkasan jawaban atau penjelasan tugas Anda di sini..." className={field} value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          Tautan HTTPS (Opsional)
          <input type="url" maxLength={2000} placeholder="https://drive.google.com/... atau tautan dokumen Anda" className={field} value={answerLink} onChange={(e) => setAnswerLink(e.target.value)} />
        </label>
        <div className="space-y-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-3.5">
          <label className="block text-sm font-semibold text-slate-800">
            Upload Foto Tugas (Opsional)
            <span className="mt-0.5 block text-xs font-normal text-slate-600">
              Pilih dari galeri atau jepret langsung dari kamera HP. Foto otomatis dikompresi agar hemat kuota (maks. lebar 1280px).
            </span>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              disabled={busy || compressingPhoto}
              onChange={(e) => void handlePhotoSelected(e)}
              className="sr-only"
            />
            <span className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-xs font-extrabold text-indigo-700 shadow-2xs transition hover:bg-indigo-50">
              <Camera size={15} aria-hidden="true" />
              {compressingPhoto ? "Mengompres foto..." : answerPhoto ? "Ganti Foto Tugas" : "Pilih / Jepret Foto Tugas"}
            </span>
          </label>
          {answerPhoto && (
            <div className="mt-2 flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <button
                type="button"
                onClick={() => setPhotoPreview({ src: answerPhoto, taskTitle: selected.judul })}
                className="overflow-hidden rounded-lg border border-slate-200"
              >
                <img src={answerPhoto} alt="Pratinjau foto tugas yang dipilih" className="h-28 w-auto max-w-[200px] object-cover" />
              </button>
              <div className="flex flex-1 flex-col justify-between gap-2 text-xs">
                <div>
                  <p className="font-bold text-emerald-700">Foto siap dikirim (terkompresi otomatis)</p>
                  {answerPhotoSizeKb !== null && (
                    <p className="text-slate-500 tabular-nums">Ukuran file: ~{answerPhotoSizeKb} KB · Lebar maks. 1280px</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPhotoPreview({ src: answerPhoto, taskTitle: selected.judul })}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Maximize2 size={12} aria-hidden="true" />
                    Perbesar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={clearSelectedPhoto}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Trash2 size={12} aria-hidden="true" />
                    Hapus Foto
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <button disabled={busy || compressingPhoto || !hasAnySubmissionInput} className={button}>{busy ? "Mengirim..." : "Kirim Tugas"}</button>
      </form>
        : answerError ? <p role="alert" className="mt-3 text-sm text-rose-700">{answerError} <button type="button" onClick={() => setVersion((v) => v + 1)} className="font-bold underline">Coba lagi</button></p>
        : !answers ? <TableSkeleton rows={3} columns={3} /> : <>{answers.rows.length === 0 ? <p className="mt-3 text-sm text-slate-600">Belum ada pengumpulan pada halaman ini.</p> : answers.rows.map((answer) => <GradeForm key={answer.id} answer={answer} deadline={selected.batasWaktu} busy={busy} onSave={grade} onPreviewPhoto={(src) => setPhotoPreview({ src, studentName: answer.siswa.nama, taskTitle: selected.judul })} />)}<div className="mt-4 flex gap-4 text-sm"><button type="button" disabled={answerPage === 1} onClick={() => setAnswerPage((v) => v - 1)} className="font-bold underline disabled:text-slate-400">Sebelumnya</button><span>Halaman {answerPage}</span><button type="button" disabled={!answers.hasNext} onClick={() => setAnswerPage((v) => v + 1)} className="font-bold underline disabled:text-slate-400">Berikutnya</button></div></>}
    </section>}
    {viewerItem?.tautan && (
      <ModulePdfViewerModal
        url={viewerItem.tautan}
        title={viewerItem.judul}
        subtitle={`${viewerItem.mapel.nama} · ${viewerItem.kelas.nama}`}
        onClose={() => setViewerItem(null)}
      />
    )}
    {photoPreview && (
      <SubmissionPhotoModal
        src={photoPreview.src}
        studentName={photoPreview.studentName}
        taskTitle={photoPreview.taskTitle}
        onClose={() => setPhotoPreview(null)}
      />
    )}
  </section>;
}

function GradeForm({
  answer,
  deadline,
  busy,
  onSave,
  onPreviewPhoto,
}: {
  answer: StudentSubmission;
  deadline?: string | null;
  busy: boolean;
  onSave: (id: string, nilai: string, catatan: string) => Promise<void>;
  onPreviewPhoto: (src: string) => void;
}) {
  const [nilai, setNilai] = useState(answer.nilai === null ? "" : String(answer.nilai));
  const [catatan, setCatatan] = useState(answer.catatanGuru ?? "");
  const safePhoto = isSafeSubmissionPhotoSrc(answer.attachmentPhotoUrl) ? answer.attachmentPhotoUrl : null;
  const safeSlug = answer.siswa.nama.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return <form onSubmit={(event) => { event.preventDefault(); void onSave(answer.id, nilai, catatan); }} className="mt-3 rounded-xl border border-[#e6dfd0] bg-slate-50/60 p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-extrabold text-slate-900">{answer.siswa.nama} · <span className="font-mono text-xs text-slate-600">{answer.siswa.nisn}</span></p>
        <p className="text-xs text-slate-600">Dikumpulkan: {time(answer.dikumpulkanPada)}{deadline && new Date(answer.dikumpulkanPada) > new Date(deadline) ? " · Terlambat" : ""}</p>
      </div>
      <span className={`rounded-lg px-2.5 py-1 text-xs font-extrabold ${answer.nilai !== null ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
        {answer.nilai !== null ? `Nilai: ${answer.nilai}` : "Menunggu Nilai"}
      </span>
    </div>
    {answer.jawaban && <p className="mt-2.5 whitespace-pre-wrap break-words rounded-lg bg-white p-2.5 text-slate-800 ring-1 ring-slate-200/80">{answer.jawaban}</p>}
    {answer.tautan && <div className="mt-2"><Link value={answer.tautan} /></div>}
    {safePhoto && (
      <div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-indigo-900">
          <ImageIcon size={14} className="text-indigo-600" aria-hidden="true" />
          Lampiran Foto Tugas Siswa
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            onClick={() => onPreviewPhoto(safePhoto)}
            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition hover:border-indigo-400"
          >
            <img
              src={safePhoto}
              alt={`Lampiran tugas ${answer.siswa.nama}`}
              className="h-32 w-auto max-w-[240px] object-cover transition group-hover:scale-[1.02]"
            />
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPreviewPhoto(safePhoto)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
            >
              <Maximize2 size={13} aria-hidden="true" />
              Perbesar Foto
            </button>
            <a
              href={safePhoto}
              download={`tugas-${safeSlug || "siswa"}.jpg`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <Download size={13} aria-hidden="true" />
              Unduh Foto
            </a>
          </div>
        </div>
      </div>
    )}
    <label className="mt-3 block font-semibold">Nilai (0–100)<input type="number" min="0" max="100" step="any" required className={field} value={nilai} onChange={(e) => setNilai(e.target.value)} /></label>
    <label className="mt-3 block font-semibold">Komentar guru<textarea maxLength={2000} className={field} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label><button disabled={busy} className={button}>Simpan nilai</button>
  </form>;
}
