import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileText,
  Save,
  Send,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { CardGridSkeleton } from "./DashboardUI";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

export type VervalStatus = "BELUM_LENGKAP" | "SIAP_VERVAL" | "TERVERIFIKASI_PKBM";
export type VervalDinasStatus = "MENUNGGU_DINAS" | "LOLOS_VERVAL" | "PERLU_PERBAIKAN";

export type StudentVervalRecord = {
  id: string;
  nisn: string;
  nama: string;
  kelasId: string | null;
  kelasNama: string;
  status: string;
  nik: string | null;
  noKk: string | null;
  tempatLahir: string | null;
  tanggalLahir: string | null;
  jenisKelamin: string | null;
  jenjang: string | null;
  tanggalMasuk: string | null;
  namaIbuKandung: string | null;
  alamatLengkap: string | null;
  desaKelurahan: string | null;
  kecamatan: string | null;
  sekolahAsal: string | null;
  npsnAsal: string | null;
  nomorIjazahTerakhir: string | null;
  sumberDapodik: boolean;
  urlKk: string | null;
  urlAktaKtp: string | null;
  urlIjazah: string | null;
  urlSuratPindah: string | null;
  statusVerval: VervalStatus;
  catatanVerval: string | null;
  statusVervalDinas: VervalDinasStatus;
  catatanDinas: string | null;
  kelengkapanPersen: number;
  filledCount: number;
  totalFields: number;
  berkasCount: number;
  berkasWajibCount: number;
  berkasLengkap: boolean;
  tanpaBerkas: boolean;
  missingFields: string[];
};

function isoToDmy(iso: string | null | undefined): string {
  if (!iso) return "";
  const clean = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return "";
  const [y, m, d] = clean.split("-");
  return `${d}/${m}/${y}`;
}

function statusVervalBadge(status: VervalStatus): { label: string; cls: string } {
  switch (status) {
    case "SIAP_VERVAL":
      return { label: "Siap Verval", cls: "border-amber-300 bg-amber-100 text-amber-900" };
    case "TERVERIFIKASI_PKBM":
      return { label: "Terverifikasi PKBM", cls: "border-emerald-300 bg-emerald-100 text-emerald-900" };
    default:
      return { label: "Belum Lengkap", cls: "border-rose-300 bg-rose-100 text-rose-900" };
  }
}

function statusDinasBadge(status: VervalDinasStatus): { label: string; cls: string } {
  switch (status) {
    case "LOLOS_VERVAL":
      return { label: "Lolos Verval Dinas", cls: "border-emerald-300 bg-emerald-100 text-emerald-900" };
    case "PERLU_PERBAIKAN":
      return { label: "Perlu Perbaikan Dinas", cls: "border-rose-300 bg-rose-100 text-rose-900" };
    default:
      return { label: "Menunggu Verval Dinas", cls: "border-slate-300 bg-slate-100 text-slate-800" };
  }
}

async function compressOrEncodeDocument(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    if (file.size > 1_500_000) {
      throw new Error("Ukuran file PDF maksimal 1,5 MB. Silakan kompres PDF atau gunakan tautan URL.");
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Gagal membaca berkas PDF."));
      reader.readAsDataURL(file);
    });
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Format berkas harus berupa gambar (JPG/PNG/WebP) atau PDF.");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(file);
  });
  if (file.size <= 350_000) return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1280;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

type FormState = {
  nik: string;
  noKk: string;
  namaIbuKandung: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: string;
  alamatLengkap: string;
  desaKelurahan: string;
  kecamatan: string;
  sekolahAsal: string;
  npsnAsal: string;
  nomorIjazahTerakhir: string;
  tanggalMasuk: string;
  urlKk: string;
  urlAktaKtp: string;
  urlIjazah: string;
  urlSuratPindah: string;
};

function toFormState(student: StudentVervalRecord): FormState {
  return {
    nik: student.nik ?? "",
    noKk: student.noKk ?? "",
    namaIbuKandung: student.namaIbuKandung ?? "",
    tempatLahir: student.tempatLahir ?? "",
    tanggalLahir: isoToDmy(student.tanggalLahir),
    jenisKelamin: student.jenisKelamin ?? "",
    alamatLengkap: student.alamatLengkap ?? "",
    desaKelurahan: student.desaKelurahan ?? "",
    kecamatan: student.kecamatan ?? "",
    sekolahAsal: student.sekolahAsal ?? "",
    npsnAsal: student.npsnAsal ?? "",
    nomorIjazahTerakhir: student.nomorIjazahTerakhir ?? "",
    tanggalMasuk: isoToDmy(student.tanggalMasuk),
    urlKk: student.urlKk ?? "",
    urlAktaKtp: student.urlAktaKtp ?? "",
    urlIjazah: student.urlIjazah ?? "",
    urlSuratPindah: student.urlSuratPindah ?? "",
  };
}

export function StudentVervalForm({ sandboxRole }: { sandboxRole?: "SISWA" }) {
  const [schoolName, setSchoolName] = useState("PKBM");
  const [student, setStudent] = useState<StudentVervalRecord | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchWithTimeout("/api/verval/me", {
      signal: controller.signal,
      ...(sandboxRole ? { headers: { "x-dev-sandbox-role": sandboxRole } } : {}),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Biodata Dapodik belum dapat dimuat.");
        }
        const data = (await res.json()) as {
          sekolah?: { nama?: string };
          siswa: StudentVervalRecord;
        };
        if (data.sekolah?.nama) setSchoolName(data.sekolah.nama);
        setStudent(data.siswa);
        setForm(toFormState(data.siswa));
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setError(describeFetchError(failure, "Biodata Dapodik belum tersedia."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sandboxRole]);

  async function save(ajukanVerifikasi: boolean) {
    if (!student || !form) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetchWithTimeout(`/api/verval/siswa/${encodeURIComponent(student.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(sandboxRole ? { "x-dev-sandbox-role": sandboxRole } : {}),
        },
        body: JSON.stringify({
          ...form,
          ...(ajukanVerifikasi ? { ajukanVerifikasi: true } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; siswa?: StudentVervalRecord } | null;
      if (!response.ok || !body?.siswa) {
        throw new Error(body?.error || "Gagal menyimpan biodata Dapodik.");
      }
      setStudent(body.siswa);
      setForm(toFormState(body.siswa));
      setNotice(
        ajukanVerifikasi
          ? "Biodata & berkas berhasil diajukan untuk verifikasi admin PKBM."
          : "Draft biodata Dapodik berhasil disimpan.",
      );
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Gagal menyimpan biodata Dapodik."));
    } finally {
      setBusy(false);
    }
  }

  async function handleFileSelect(
    field: "urlKk" | "urlAktaKtp" | "urlIjazah" | "urlSuratPindah",
    file: File | undefined,
  ) {
    if (!file || !form) return;
    setUploadingField(field);
    setError("");
    try {
      const encoded = await compressOrEncodeDocument(file);
      setForm((prev) => (prev ? { ...prev, [field]: encoded } : prev));
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "Gagal memproses file.");
    } finally {
      setUploadingField(null);
    }
  }

  if (loading) {
    return (
      <section className="dashboard-glass rounded-2xl p-5 sm:p-6">
        <CardGridSkeleton count={3} columns={3} />
      </section>
    );
  }

  if (!student || !form) {
    return (
      <section className="dashboard-glass rounded-2xl p-6">
        <p role="alert" className="text-sm font-semibold text-rose-700">
          {error || "Profil Dapodik warga belajar belum tersedia."}
        </p>
      </section>
    );
  }

  const pkbmBadge = statusVervalBadge(student.statusVerval);
  const dinasBadge = statusDinasBadge(student.statusVervalDinas);
  const lockedByDapodik =
    student.statusVerval === "TERVERIFIKASI_PKBM" && student.statusVervalDinas === "LOLOS_VERVAL";
  const inputCls =
    "glass-input mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-900 disabled:opacity-60";

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/70 pb-5">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700">
            VERVAL DAPODIK WARGA BELAJAR · {schoolName}
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">
            Lengkapi Biodata Dapodik &amp; Berkas
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            NISN <span className="font-mono font-bold text-slate-800">{student.nisn}</span> · Kelas{" "}
            <span className="font-semibold text-slate-800">{student.kelasNama}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${pkbmBadge.cls}`}>
            <FileCheck2 size={14} aria-hidden="true" />
            PKBM: {pkbmBadge.label}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${dinasBadge.cls}`}>
            <ShieldCheck size={14} aria-hidden="true" />
            Dinas: {dinasBadge.label}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-slate-800">
          <span>Kelengkapan Data &amp; Berkas Dapodik</span>
          <span className="text-indigo-800">
            {student.kelengkapanPersen}% ({student.filledCount}/{student.totalFields} poin)
          </span>
        </div>
        <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-white/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-cyan-500 to-emerald-500 transition-all duration-300"
            style={{ width: `${student.kelengkapanPersen}%` }}
          />
        </div>
        {student.missingFields.length > 0 && (
          <p className="mt-2.5 text-xs text-slate-700">
            <span className="font-bold">Belum dilengkapi:</span> {student.missingFields.slice(0, 6).join(", ")}
            {student.missingFields.length > 6 ? ` (+${student.missingFields.length - 6} lainnya)` : ""}
          </p>
        )}
      </div>

      {(student.catatanVerval || student.catatanDinas) && (
        <div className="grid gap-3 md:grid-cols-2">
          {student.catatanVerval && (
            <div className="rounded-xl border border-amber-300/80 bg-amber-50/90 p-3.5 text-xs text-amber-950">
              <p className="flex items-center gap-1.5 font-extrabold uppercase tracking-wide">
                <Clock size={14} aria-hidden="true" /> Catatan Operator PKBM
              </p>
              <p className="mt-1 leading-5">{student.catatanVerval}</p>
            </div>
          )}
          {student.catatanDinas && (
            <div className="rounded-xl border border-cyan-300/80 bg-cyan-50/90 p-3.5 text-xs text-cyan-950">
              <p className="flex items-center gap-1.5 font-extrabold uppercase tracking-wide">
                <ShieldCheck size={14} aria-hidden="true" /> Catatan Verifikator Dinas Pendidikan
              </p>
              <p className="mt-1 leading-5">{student.catatanDinas}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-sm font-semibold text-rose-800">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-900">
          <CheckCircle2 size={16} className="shrink-0" />
          {notice}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs font-bold text-slate-700">
          NIK (16 Digit)
          <input
            type="text"
            inputMode="numeric"
            maxLength={16}
            disabled={busy || lockedByDapodik}
            value={form.nik}
            onChange={(e) => setForm({ ...form, nik: e.target.value.replace(/\D/g, "") })}
            placeholder="Contoh: 3204010101050001"
            className={inputCls}
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          Nomor Kartu Keluarga (16 Digit)
          <input
            type="text"
            inputMode="numeric"
            maxLength={16}
            disabled={busy || lockedByDapodik}
            value={form.noKk}
            onChange={(e) => setForm({ ...form, noKk: e.target.value.replace(/\D/g, "") })}
            placeholder="Contoh: 3204010101059999"
            className={inputCls}
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          Nama Ibu Kandung
          <input
            type="text"
            maxLength={200}
            disabled={busy || lockedByDapodik}
            value={form.namaIbuKandung}
            onChange={(e) => setForm({ ...form, namaIbuKandung: e.target.value })}
            placeholder="Sesuai Kartu Keluarga / Akta"
            className={inputCls}
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          Tempat Lahir
          <input
            type="text"
            maxLength={200}
            disabled={busy || lockedByDapodik}
            value={form.tempatLahir}
            onChange={(e) => setForm({ ...form, tempatLahir: e.target.value })}
            placeholder="Kota/Kabupaten Lahir"
            className={inputCls}
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          Tanggal Lahir (DD/MM/YYYY)
          <input
            type="text"
            maxLength={10}
            disabled={busy || lockedByDapodik}
            value={form.tanggalLahir}
            onChange={(e) => setForm({ ...form, tanggalLahir: e.target.value })}
            placeholder="DD/MM/YYYY"
            className={inputCls}
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          Jenis Kelamin
          <select
            disabled={busy || lockedByDapodik}
            value={form.jenisKelamin}
            onChange={(e) => setForm({ ...form, jenisKelamin: e.target.value })}
            className={inputCls}
          >
            <option value="">-- Pilih Jenis Kelamin --</option>
            <option value="L">Laki-laki (L)</option>
            <option value="P">Perempuan (P)</option>
          </select>
        </label>

        <label className="block text-xs font-bold text-slate-700 md:col-span-2 lg:col-span-3">
          Alamat Lengkap (Jalan / Dusun / RT / RW)
          <input
            type="text"
            maxLength={500}
            disabled={busy || lockedByDapodik}
            value={form.alamatLengkap}
            onChange={(e) => setForm({ ...form, alamatLengkap: e.target.value })}
            placeholder="Contoh: Jl. Merdeka No. 10 RT 02 RW 05"
            className={inputCls}
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          Desa / Kelurahan
          <input
            type="text"
            maxLength={200}
            disabled={busy || lockedByDapodik}
            value={form.desaKelurahan}
            onChange={(e) => setForm({ ...form, desaKelurahan: e.target.value })}
            placeholder="Nama Desa / Kelurahan"
            className={inputCls}
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          Kecamatan
          <input
            type="text"
            maxLength={200}
            disabled={busy || lockedByDapodik}
            value={form.kecamatan}
            onChange={(e) => setForm({ ...form, kecamatan: e.target.value })}
            placeholder="Nama Kecamatan"
            className={inputCls}
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          Tanggal Masuk PKBM (DD/MM/YYYY)
          <input
            type="text"
            maxLength={10}
            disabled={busy || lockedByDapodik}
            value={form.tanggalMasuk}
            onChange={(e) => setForm({ ...form, tanggalMasuk: e.target.value })}
            placeholder="DD/MM/YYYY"
            className={inputCls}
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          Sekolah Asal / Terakhir
          <input
            type="text"
            maxLength={200}
            disabled={busy || lockedByDapodik}
            value={form.sekolahAsal}
            onChange={(e) => setForm({ ...form, sekolahAsal: e.target.value })}
            placeholder="Contoh: SMP Negeri 1 Bandung"
            className={inputCls}
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          NPSN Sekolah Asal (8 Karakter)
          <input
            type="text"
            maxLength={8}
            disabled={busy || lockedByDapodik}
            value={form.npsnAsal}
            onChange={(e) => setForm({ ...form, npsnAsal: e.target.value.trim() })}
            placeholder="Contoh: 20219001"
            className={inputCls}
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          Nomor Ijazah / SKL Terakhir
          <input
            type="text"
            maxLength={120}
            disabled={busy || lockedByDapodik}
            value={form.nomorIjazahTerakhir}
            onChange={(e) => setForm({ ...form, nomorIjazahTerakhir: e.target.value })}
            placeholder="Contoh: DN-02/SMP/2023/00123"
            className={inputCls}
          />
        </label>
      </div>

      <div className="space-y-4 border-t border-slate-200/70 pt-5">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">Unggah / Tautan Berkas Persyaratan</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Unggah foto/PDF dokumen (otomatis dikompres) atau tempel tautan Google Drive / cloud yang dapat diakses.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {([
            { key: "urlKk", label: "Kartu Keluarga (KK)" },
            { key: "urlAktaKtp", label: "Akta Kelahiran / KTP" },
            { key: "urlIjazah", label: "Ijazah / Rapor Terakhir" },
            { key: "urlSuratPindah", label: "Surat Pindah / SKP (Jika Pindahan)" },
          ] as const).map(({ key, label }) => {
            const val = form[key];
            const isFilled = Boolean(val.trim());
            return (
              <div key={key} className="rounded-2xl border border-slate-200/80 bg-white/80 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-800">{label}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      isFilled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {isFilled ? "Terlampir" : "Kosong"}
                  </span>
                </div>
                <input
                  type="text"
                  disabled={busy || lockedByDapodik}
                  value={val.startsWith("data:") ? "[Berkas Terunggah]" : val}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  className="glass-input mt-2.5 w-full rounded-lg px-3 py-2 text-xs text-slate-800"
                />
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-100">
                    <Upload size={13} aria-hidden="true" />
                    {uploadingField === key ? "Memproses..." : "Pilih File"}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={busy || lockedByDapodik || uploadingField !== null}
                      onChange={(e) => {
                        void handleFileSelect(key, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      className="sr-only"
                    />
                  </label>
                  {isFilled && (
                    <button
                      type="button"
                      onClick={() => setPreviewDoc({ title: label, url: val })}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <FileText size={13} aria-hidden="true" />
                      Pratinjau
                    </button>
                  )}
                  {isFilled && !lockedByDapodik && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, [key]: "" })}
                      className="text-xs font-semibold text-rose-600 hover:underline"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!lockedByDapodik && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200/70 pt-4">
          <button
            type="button"
            disabled={busy || uploadingField !== null}
            onClick={() => void save(false)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Save size={15} aria-hidden="true" />
            Simpan Draft
          </button>
          <button
            type="button"
            disabled={busy || uploadingField !== null}
            onClick={() => void save(true)}
            className="master-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-50"
          >
            <Send size={15} aria-hidden="true" />
            {busy ? "Menyimpan..." : "Simpan & Ajukan Verifikasi"}
          </button>
        </div>
      )}

      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h4 className="font-bold">{previewDoc.title}</h4>
              <div className="flex items-center gap-3">
                {previewDoc.url.startsWith("http") && (
                  <a
                    href={previewDoc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline"
                  >
                    Buka Tautan <ExternalLink size={13} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  Tutup
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-4 text-center">
              {previewDoc.url.startsWith("data:application/pdf") || previewDoc.url.toLowerCase().endsWith(".pdf") ? (
                <iframe src={previewDoc.url} title={previewDoc.title} className="h-[70vh] w-full rounded-xl bg-white" />
              ) : previewDoc.url.startsWith("data:image/") || /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(previewDoc.url) ? (
                <img src={previewDoc.url} alt={previewDoc.title} className="mx-auto max-h-[70vh] rounded-xl object-contain" />
              ) : (
                <div className="rounded-xl bg-white p-6 text-sm text-slate-700">
                  <p className="font-semibold">Tautan berkas eksternal:</p>
                  <p className="mt-2 break-all font-mono text-xs text-indigo-700">{previewDoc.url}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
