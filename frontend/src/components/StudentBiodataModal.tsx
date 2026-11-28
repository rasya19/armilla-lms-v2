import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Eraser,
  FileText,
  Lock,
  Pencil,
  PenTool,
  Printer,
  Save,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { buildKopSuratProfile, KopSurat } from "./KopSurat";
import type { SchoolProfile } from "./schoolProfile";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type BiodataPayload = {
  anakKe: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: string;
  alamat: string;
  namaOrangTuaWali: string;
  pekerjaanOrangTuaWali: string;
  asalLembaga: string;
  tanggalMasuk: string;
  semesterMasuk: string;
  keteranganPindah: string;
  isSiswaPindahan: boolean;
  pasFotoUrl: string;
  tandaTanganUrl: string;
  tandaTanganTanggal: string;
};

type BiodataApiResponse = {
  siswa: {
    id: string;
    nama: string;
    nisn: string;
    nik?: string | null;
    jenjang?: string | null;
    email?: string | null;
    telepon?: string | null;
    tempatLahir?: string | null;
    tanggalLahir?: string | null;
    jenisKelamin?: string | null;
    alamatLengkap?: string | null;
    desaKelurahan?: string | null;
    kecamatan?: string | null;
    namaAyah?: string | null;
    pekerjaanAyah?: string | null;
    namaIbu?: string | null;
    namaIbuKandung?: string | null;
    pekerjaanIbu?: string | null;
    namaWali?: string | null;
    pekerjaanWali?: string | null;
    sekolahAsal?: string | null;
    npsnAsal?: string | null;
    tanggalMasuk?: string | null;
    jalurPendaftaran?: string | null;
    urlFotoIjazah?: string | null;
    urlSuratPindah?: string | null;
  };
  kelasNama: string | null;
  sekolah: {
    nama: string;
    npsn: string | null;
    alamat: string | null;
    kabupatenKota: string | null;
    kepalaSekolah: string | null;
    logoUrl: string | null;
  };
  kopSurat?: SchoolProfile;
  biodata?: Partial<BiodataPayload>;
  hasTransferScores?: boolean;
  error?: string;
};

function toDateInput(raw?: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const dt = new Date(trimmed);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}

function formatTanggalIndo(raw?: string | null): string {
  if (!raw || !raw.trim()) return "-";
  const dt = new Date(raw.trim());
  if (Number.isNaN(dt.getTime())) return raw.trim();
  return dt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatJk(raw?: string | null): string {
  const val = (raw ?? "").trim().toLowerCase();
  if (!val) return "-";
  if (val === "l" || val.startsWith("laki")) return "Laki-laki";
  if (val === "p" || val.startsWith("perempuan") || val.startsWith("wanita")) return "Perempuan";
  return raw!.trim();
}

async function compressImageFile(file: File, maxWidth: number, maxHeight: number, format: "jpeg" | "png"): Promise<string> {
  const mime = (file.type || "").trim().toLowerCase();
  const isImageByExt = /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!mime.startsWith("image/") && !isImageByExt) {
    throw new Error("File harus berupa gambar (JPG, JPEG, PNG, atau WebP).");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Ukuran file gambar maksimal 10 MB.");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gambar tidak valid atau rusak."));
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia di browser ini.");

  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-none";

export function StudentBiodataModal({
  studentId,
  onSaved,
  onBusyChange,
}: {
  studentId: string;
  onSaved?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hasSavedBiodata, setHasSavedBiodata] = useState(false);
  const savedSnapshotRef = useRef<BiodataPayload | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [meta, setMeta] = useState<BiodataApiResponse | null>(null);
  const [form, setForm] = useState<BiodataPayload>({
    anakKe: "",
    tempatLahir: "",
    tanggalLahir: "",
    jenisKelamin: "",
    alamat: "",
    namaOrangTuaWali: "",
    pekerjaanOrangTuaWali: "",
    asalLembaga: "",
    tanggalMasuk: "",
    semesterMasuk: "",
    keteranganPindah: "",
    isSiswaPindahan: false,
    pasFotoUrl: "",
    tandaTanganUrl: "",
    tandaTanganTanggal: new Date().toISOString().slice(0, 10),
  });

  // Signature canvas state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasCanvasStroke, setHasCanvasStroke] = useState(false);
  const [showCanvasPad, setShowCanvasPad] = useState(false);

  useEffect(() => {
    onBusyChange?.(saving);
  }, [saving, onBusyChange]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchWithTimeout(`/api/sekolah/siswa/${encodeURIComponent(studentId)}/biodata`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as BiodataApiResponse | null;
        if (!res.ok || !body?.siswa) {
          throw new Error(body?.error || "Biodata siswa belum dapat dimuat.");
        }
        setMeta(body);
        const s = body.siswa;
        const b = body.biodata ?? {};
        const alamatParts = [s.alamatLengkap, s.desaKelurahan, s.kecamatan].map((p) => (p ?? "").trim()).filter(Boolean);
        const defaultParentName = s.namaWali?.trim()
          ? s.namaWali.trim()
          : [s.namaAyah?.trim(), (s.namaIbu || s.namaIbuKandung)?.trim()].filter(Boolean).join(" / ");
        const defaultParentJob = s.pekerjaanWali?.trim()
          ? s.pekerjaanWali.trim()
          : [s.pekerjaanAyah?.trim(), s.pekerjaanIbu?.trim()].filter(Boolean).join(" / ");
        const inferredTransfer = Boolean(
          b.isSiswaPindahan ??
            (body.hasTransferScores ||
              /pindah|mutasi/i.test(s.jalurPendaftaran ?? "") ||
              Boolean(s.urlSuratPindah) ||
              Boolean(b.keteranganPindah?.trim())),
        );

        const loadedForm: BiodataPayload = {
          anakKe: b.anakKe ?? "",
          tempatLahir: b.tempatLahir ?? (s.tempatLahir ?? ""),
          tanggalLahir: b.tanggalLahir ?? toDateInput(s.tanggalLahir),
          jenisKelamin: b.jenisKelamin ?? (s.jenisKelamin ?? ""),
          alamat: b.alamat ?? alamatParts.join(", "),
          namaOrangTuaWali: b.namaOrangTuaWali ?? defaultParentName,
          pekerjaanOrangTuaWali: b.pekerjaanOrangTuaWali ?? defaultParentJob,
          asalLembaga: b.asalLembaga ?? (s.sekolahAsal ?? ""),
          tanggalMasuk: b.tanggalMasuk ?? toDateInput(s.tanggalMasuk),
          semesterMasuk: b.semesterMasuk ?? "",
          keteranganPindah: b.keteranganPindah ?? "",
          isSiswaPindahan: inferredTransfer,
          pasFotoUrl: b.pasFotoUrl ?? (s.urlFotoIjazah ?? ""),
          tandaTanganUrl: b.tandaTanganUrl ?? "",
          tandaTanganTanggal: b.tandaTanganTanggal ?? new Date().toISOString().slice(0, 10),
        };
        setForm(loadedForm);
        savedSnapshotRef.current = loadedForm;
        const hasExisting = Boolean(
          b.anakKe ||
            b.tempatLahir ||
            b.alamat ||
            b.namaOrangTuaWali ||
            b.pasFotoUrl ||
            b.tandaTanganUrl ||
            s.tempatLahir ||
            s.alamatLengkap ||
            s.urlFotoIjazah,
        );
        setHasSavedBiodata(hasExisting);
        setLocked(hasExisting);
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setError(describeFetchError(failure, "Biodata siswa belum dapat dimuat."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [studentId]);

  async function handlePhotoUpload(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const encoded = await compressImageFile(file, 360, 480, "jpeg");
      setForm((prev) => ({ ...prev, pasFotoUrl: encoded }));
      setNotice("Pas foto siap disimpan.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Gagal memproses pas foto.");
    }
  }

  async function handleSignatureUpload(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const encoded = await compressImageFile(file, 480, 200, "png");
      setForm((prev) => ({ ...prev, tandaTanganUrl: encoded }));
      setShowCanvasPad(false);
      setNotice("Gambar tanda tangan siap disimpan.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Gagal memproses gambar tanda tangan.");
    }
  }

  function getCanvasCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handleCanvasDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getCanvasCoords(e);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
    setHasCanvasStroke(true);
  }

  function handleCanvasMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handleCanvasUp() {
    setDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasCanvasStroke(false);
  }

  function applyCanvasSignature() {
    const canvas = canvasRef.current;
    if (!canvas || !hasCanvasStroke) return;
    const dataUrl = canvas.toDataURL("image/png");
    setForm((prev) => ({ ...prev, tandaTanganUrl: dataUrl }));
    setShowCanvasPad(false);
    setNotice("Tanda tangan dari canvas diterapkan. Klik Simpan Biodata untuk menyimpan permanen.");
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/siswa/${encodeURIComponent(studentId)}/biodata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ biodata: form }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Biodata siswa belum dapat disimpan.");
      savedSnapshotRef.current = form;
      setHasSavedBiodata(true);
      setLocked(true);
      setShowCanvasPad(false);
      setNotice(body?.message || "Biodata lengkap siswa berhasil disimpan.");
      onSaved?.();
    } catch (failure) {
      setError(describeFetchError(failure, "Biodata siswa belum dapat disimpan."));
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    if (savedSnapshotRef.current) {
      setForm(savedSnapshotRef.current);
    }
    setShowCanvasPad(false);
    setLocked(true);
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-slate-500">Memuat biodata lengkap peserta didik...</p>;
  }

  if (!meta) {
    return (
      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
        {error || "Biodata siswa tidak ditemukan."}
      </p>
    );
  }

  const schoolName = meta.kopSurat?.nama || meta.sekolah.nama || "PKBM";
  const schoolNpsn = meta.kopSurat?.npsn || meta.sekolah.npsn || "-";
  const schoolAddress = meta.kopSurat?.alamatLengkap || meta.sekolah.alamat || "-";
  const ttlText = [form.tempatLahir.trim(), form.tanggalLahir ? formatTanggalIndo(form.tanggalLahir) : ""].filter(Boolean).join(", ") || "-";
  const showTransferSection = Boolean(
    form.isSiswaPindahan || form.asalLembaga.trim() || form.keteranganPindah.trim() || form.semesterMasuk.trim(),
  );

  return (
    <div className="mt-3 space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("edit")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
              tab === "edit" ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <FileText size={14} />
            Edit Biodata, Foto &amp; TTD
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
              tab === "preview" ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <Printer size={14} />
            Pratinjau &amp; Cetak Biodata
          </button>
        </div>
        {tab === "preview" && (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-emerald-500"
          >
            <Printer size={14} />
            Cetak / PDF Biodata
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 size={14} />
          {notice}
        </p>
      )}

      {tab === "edit" ? (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {locked ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-[11px] font-extrabold text-slate-600">
                  <Lock size={11} /> Tersimpan · Terkunci
                </span>
              ) : hasSavedBiodata ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-800">
                  <Pencil size={11} /> Mode Edit
                </span>
              ) : null}
            </div>
            {locked && (
              <button
                type="button"
                onClick={() => setLocked(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-1.5 text-xs font-extrabold text-sky-900 hover:bg-sky-100"
              >
                <Pencil size={13} /> Edit Biodata
              </button>
            )}
          </div>

          <fieldset disabled={locked} className={`space-y-4 ${locked ? "opacity-80 [&_.bg-white]:bg-slate-100 [&_input]:cursor-not-allowed [&_input]:border-slate-200 [&_input]:bg-slate-100 [&_input]:text-slate-500 [&_select]:cursor-not-allowed [&_select]:border-slate-200 [&_select]:bg-slate-100 [&_select]:text-slate-500" : ""}`}>
          {/* Ringkasan Identitas Pokok */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <span className="text-slate-500">Nama Lengkap</span>
                <p className="font-bold text-slate-900">{meta.siswa.nama}</p>
              </div>
              <div>
                <span className="text-slate-500">NISN / No. Induk</span>
                <p className="font-mono font-bold text-slate-900">{meta.siswa.nisn || "-"}</p>
              </div>
              <div>
                <span className="text-slate-500">Kelas / Program</span>
                <p className="font-bold text-slate-900">{meta.kelasNama || meta.siswa.jenjang || "-"}</p>
              </div>
            </div>
          </div>

          {/* Pas Foto & Tanda Tangan */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Pas Foto 3x4 */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                <Camera size={14} className="text-sky-600" />
                Pas Foto Peserta Didik (3×4 / 4×6)
              </p>
              <div className="flex items-center gap-4">
                <div className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-[10px] text-slate-400">
                  {form.pasFotoUrl ? (
                    <img src={form.pasFotoUrl} alt={`Pas foto ${meta.siswa.nama}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 px-2">
                      <UserRound size={24} className="text-slate-300" />
                      <span>Pas Foto 3×4</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2 text-xs">
                  <p className="text-[11px] text-slate-500">
                    Format JPG/PNG (otomatis dikompresi). Jika belum diunggah, biodata cetak menampilkan kotak foto kosong yang rapi.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-900 hover:bg-sky-100">
                      <Upload size={12} />
                      {form.pasFotoUrl ? "Ganti Foto" : "Upload Foto"}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          void handlePhotoUpload(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {form.pasFotoUrl && (
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, pasFotoUrl: "" }))}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 size={12} />
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tanda Tangan */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                <PenTool size={14} className="text-indigo-600" />
                Tanda Tangan Pengesahan (Opsional)
              </p>
              <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
                {form.tandaTanganUrl ? (
                  <img src={form.tandaTanganUrl} alt="Tanda tangan" className="max-h-20 max-w-full object-contain" />
                ) : (
                  <span className="text-[11px] italic text-slate-400">
                    Belum ada gambar tanda tangan (akan tampil area tanda tangan basah saat dicetak)
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100">
                  <Upload size={12} />
                  Upload TTD
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      void handleSignatureUpload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setShowCanvasPad((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  <PenTool size={12} />
                  {showCanvasPad ? "Tutup Canvas" : "Gambar di Canvas"}
                </button>
                {form.tandaTanganUrl && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, tandaTanganUrl: "" }))}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 size={12} />
                    Hapus
                  </button>
                )}
              </div>
              {showCanvasPad && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <canvas
                    ref={canvasRef}
                    width={420}
                    height={130}
                    onPointerDown={handleCanvasDown}
                    onPointerMove={handleCanvasMove}
                    onPointerUp={handleCanvasUp}
                    onPointerLeave={handleCanvasUp}
                    className="w-full touch-none rounded-lg border border-slate-300 bg-white"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <Eraser size={11} />
                      Bersihkan
                    </button>
                    <button
                      type="button"
                      disabled={!hasCanvasStroke}
                      onClick={applyCanvasSignature}
                      className="rounded-lg bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      Terapkan TTD
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Biodata Identitas & Orang Tua/Wali */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-bold text-slate-800">
              Tempat Lahir
              <input
                type="text"
                value={form.tempatLahir}
                onChange={(e) => setForm({ ...form, tempatLahir: e.target.value })}
                placeholder="Contoh: Bandung"
                className={inputCls}
              />
            </label>
            <label className="block text-xs font-bold text-slate-800">
              Tanggal Lahir
              <input
                type="date"
                value={form.tanggalLahir}
                onChange={(e) => setForm({ ...form, tanggalLahir: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block text-xs font-bold text-slate-800">
              Jenis Kelamin
              <select
                value={form.jenisKelamin}
                onChange={(e) => setForm({ ...form, jenisKelamin: e.target.value })}
                className={inputCls}
              >
                <option value="">-- Pilih --</option>
                <option value="Laki-laki">Laki-laki</option>
                <option value="Perempuan">Perempuan</option>
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-800">
              Anak ke-berapa
              <input
                type="text"
                value={form.anakKe}
                onChange={(e) => setForm({ ...form, anakKe: e.target.value })}
                placeholder="Contoh: 2 (Kedua)"
                className={inputCls}
              />
            </label>
            <label className="block text-xs font-bold text-slate-800 sm:col-span-2">
              Alamat Peserta Didik
              <input
                type="text"
                value={form.alamat}
                onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                placeholder="Alamat domisili lengkap"
                className={inputCls}
              />
            </label>
            <label className="block text-xs font-bold text-slate-800">
              Nama Orang Tua / Wali
              <input
                type="text"
                value={form.namaOrangTuaWali}
                onChange={(e) => setForm({ ...form, namaOrangTuaWali: e.target.value })}
                placeholder="Nama Ayah / Ibu / Wali"
                className={inputCls}
              />
            </label>
            <label className="block text-xs font-bold text-slate-800">
              Pekerjaan Orang Tua / Wali
              <input
                type="text"
                value={form.pekerjaanOrangTuaWali}
                onChange={(e) => setForm({ ...form, pekerjaanOrangTuaWali: e.target.value })}
                placeholder="Contoh: Wiraswasta / Karyawan"
                className={inputCls}
              />
            </label>
          </div>

          {/* Riwayat Mutasi / Pindahan */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-extrabold text-slate-900">
              <input
                type="checkbox"
                checked={form.isSiswaPindahan}
                onChange={(e) => setForm({ ...form, isSiswaPindahan: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Peserta Didik Pindahan / Mutasi dari Satuan Pendidikan Lain
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-xs font-bold text-slate-800">
                Asal Satuan Pendidikan
                <input
                  type="text"
                  value={form.asalLembaga}
                  onChange={(e) => setForm({ ...form, asalLembaga: e.target.value })}
                  placeholder="Contoh: SMPN 1 ... / PKBM ..."
                  className={inputCls}
                />
              </label>
              <label className="block text-xs font-bold text-slate-800">
                Tanggal Masuk
                <input
                  type="date"
                  value={form.tanggalMasuk}
                  onChange={(e) => setForm({ ...form, tanggalMasuk: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className="block text-xs font-bold text-slate-800">
                Semester / Tingkat Masuk
                <input
                  type="text"
                  value={form.semesterMasuk}
                  onChange={(e) => setForm({ ...form, semesterMasuk: e.target.value })}
                  placeholder="Contoh: Kelas 8 / Semester 1"
                  className={inputCls}
                />
              </label>
              <label className="block text-xs font-bold text-slate-800">
                Keterangan Pindah / Leger
                <input
                  type="text"
                  value={form.keteranganPindah}
                  onChange={(e) => setForm({ ...form, keteranganPindah: e.target.value })}
                  placeholder="Keterangan mutasi / konversi leger"
                  className={inputCls}
                />
              </label>
            </div>
          </div>

            <label className="block text-xs font-bold text-slate-800">
              Tanggal Pengesahan Biodata
              <input
                type="date"
                value={form.tandaTanganTanggal}
                onChange={(e) => setForm({ ...form, tandaTanganTanggal: e.target.value })}
                className={inputCls}
              />
            </label>
          </fieldset>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setTab("preview")}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Lihat Pratinjau Cetak
            </button>
            {locked ? (
              <button
                type="button"
                onClick={() => setLocked(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-5 py-2 text-xs font-extrabold text-sky-900 hover:bg-sky-100"
              >
                <Pencil size={14} /> Edit Biodata
              </button>
            ) : (
              <>
                {hasSavedBiodata && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleCancelEdit}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Batal
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-5 py-2 text-xs font-extrabold text-white hover:bg-sky-600 disabled:opacity-50"
                >
                  <Save size={14} />
                  {saving ? "Menyimpan..." : "Simpan Biodata Lengkap"}
                </button>
              </>
            )}
          </div>
        </form>
      ) : (
        <article className="print-sheet rounded-2xl border border-slate-300 bg-white p-6 text-slate-900">
          <KopSurat profile={buildKopSuratProfile(meta.kopSurat, meta.sekolah)} />

          <div className="mt-4 text-center">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-950">
              Identitas Peserta Didik Pendidikan Kesetaraan
            </h3>
            <p className="text-xs font-semibold text-slate-600">
              {schoolName} · NPSN {schoolNpsn}
            </p>
          </div>

          <table className="mt-4 w-full border-collapse text-xs">
            <tbody>
              {[
                ["1.", "Nama Lengkap Peserta Didik", meta.siswa.nama],
                ["2.", "NISN / Nomor Induk", meta.siswa.nisn || "-"],
                ["3.", "Kelas / Program Kesetaraan", meta.kelasNama || meta.siswa.jenjang || "-"],
                ["4.", "Tempat, Tanggal Lahir", ttlText],
                ["5.", "Jenis Kelamin", formatJk(form.jenisKelamin)],
                ["6.", "Anak ke-berapa", form.anakKe.trim() || "-"],
                ["7.", "Alamat Peserta Didik", form.alamat.trim() || "-"],
                ["8.", "Satuan Pendidikan", `${schoolName} (NPSN: ${schoolNpsn})`],
                ["9.", "Alamat Satuan Pendidikan", schoolAddress],
                ["10.", "Nama Orang Tua / Wali", form.namaOrangTuaWali.trim() || "-"],
                ["11.", "Pekerjaan Orang Tua / Wali", form.pekerjaanOrangTuaWali.trim() || "-"],
                ...(showTransferSection
                  ? [
                      ["12.", "Asal Satuan Pendidikan / Lembaga", form.asalLembaga.trim() || "-"],
                      [
                        "13.",
                        "Tanggal / Semester Masuk",
                        [form.tanggalMasuk ? formatTanggalIndo(form.tanggalMasuk) : "", form.semesterMasuk.trim()]
                          .filter(Boolean)
                          .join(" · ") || "-",
                      ],
                      ["14.", "Keterangan Mutasi / Pindahan", form.keteranganPindah.trim() || "-"],
                    ]
                  : []),
              ].map(([no, label, value]) => (
                <tr key={no} className="border-b border-slate-200">
                  <td className="w-8 py-1.5 align-top font-semibold text-slate-600">{no}</td>
                  <td className="w-56 py-1.5 align-top text-slate-700">{label}</td>
                  <td className="w-4 py-1.5 align-top text-slate-700">:</td>
                  <td className="py-1.5 align-top font-semibold text-slate-950">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pas Foto + Blok Pengesahan Tanda Tangan */}
          <div className="print-avoid-break mt-6 flex flex-wrap items-end justify-between gap-6 px-2">
            <div className="flex h-36 w-28 items-center justify-center overflow-hidden border border-slate-400 bg-slate-50 text-center text-[10px] text-slate-500">
              {form.pasFotoUrl ? (
                <img src={form.pasFotoUrl} alt={`Pas foto ${meta.siswa.nama}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <UserRound size={24} className="text-slate-300" />
                  <span>Pas Foto</span>
                  <span>3 × 4</span>
                </div>
              )}
            </div>

            <div className="min-w-[220px] text-center text-xs">
              <p className="text-slate-700">
                {meta.sekolah.kabupatenKota || "Setempat"}, {formatTanggalIndo(form.tandaTanganTanggal)}
              </p>
              <p className="font-bold text-slate-900">Kepala {schoolName}</p>
              <div className="my-2 flex h-16 items-center justify-center">
                {form.tandaTanganUrl ? (
                  <img src={form.tandaTanganUrl} alt="Tanda tangan pengesahan" className="max-h-16 max-w-[180px] object-contain" />
                ) : (
                  <div className="h-14" />
                )}
              </div>
              <p className="font-bold underline text-slate-950">{meta.sekolah.kepalaSekolah || "Kepala PKBM"}</p>
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
