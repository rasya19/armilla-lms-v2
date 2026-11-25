import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  BookUser,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Phone,
  Send,
  UserRound,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type PublicSchoolInfo = {
  id: string;
  nama: string;
  slug: string;
  npsn: string | null;
  alamat: string | null;
  kabupatenKota: string | null;
  logoUrl: string | null;
};

type SavedGuestReceipt = {
  id: string;
  nama: string;
  alamat: string;
  noHp: string;
  tujuanKunjungan: string;
  instansi: string | null;
  tanggalLabel: string;
  waktuLabel: string;
};

function formatRealtimeWib(now: Date): string {
  const datePart = now.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timePart = now.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${datePart} · ${timePart} WIB`;
}

export function PublicGuestbookPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [school, setSchool] = useState<PublicSchoolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [nowText, setNowText] = useState(() => formatRealtimeWib(new Date()));

  const [nama, setNama] = useState("");
  const [alamat, setAlamat] = useState("");
  const [noHp, setNoHp] = useState("");
  const [instansi, setInstansi] = useState("");
  const [tujuanKunjungan, setTujuanKunjungan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [receipt, setReceipt] = useState<SavedGuestReceipt | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowText(formatRealtimeWib(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!slug) {
      setLoadError("Alamat buku tamu tidak valid.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    fetchWithTimeout(`/api/buku-tamu/public/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          sekolah?: PublicSchoolInfo;
          error?: string;
        } | null;
        if (!res.ok || !body?.sekolah) {
          throw new Error(body?.error || "Buku tamu digital lembaga tidak tersedia.");
        }
        setSchool(body.sekolah);
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setLoadError(describeFetchError(failure, "Buku tamu digital belum dapat dimuat."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !slug) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetchWithTimeout(`/api/buku-tamu/public/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama: nama.trim(),
          alamat: alamat.trim(),
          noHp: noHp.trim(),
          instansi: instansi.trim() || undefined,
          tujuanKunjungan: tujuanKunjungan.trim(),
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        entry?: SavedGuestReceipt;
        error?: string;
      } | null;
      if (!res.ok || !body?.entry) {
        throw new Error(body?.error || "Gagal menyimpan data buku tamu.");
      }
      setReceipt(body.entry);
      setNama("");
      setAlamat("");
      setNoHp("");
      setInstansi("");
      setTujuanKunjungan("");
    } catch (failure: unknown) {
      setSubmitError(describeFetchError(failure, "Data kunjungan belum dapat dikirim."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50 px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-lg">
        <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xl">
          <div className="bg-gradient-to-r from-sky-700 via-indigo-700 to-sky-800 px-6 py-6 text-white">
            <div className="flex items-center gap-3.5">
              {school?.logoUrl ? (
                <img
                  src={school.logoUrl}
                  alt={`Logo ${school.nama}`}
                  className="h-12 w-12 rounded-2xl border border-white/25 bg-white object-contain p-1"
                />
              ) : (
                <BrandLogo alt="Logo Lembaga" className="h-12 w-12 rounded-2xl border border-white/25" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-sky-200">
                  BUKU TAMU DIGITAL
                </p>
                <h1 className="truncate text-lg font-black">{school?.nama || "Lembaga PKBM"}</h1>
                {school?.alamat && <p className="mt-0.5 truncate text-xs text-sky-100">{school.alamat}</p>}
              </div>
            </div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-xs">
              <CalendarClock size={14} aria-hidden="true" />
              <span>{nowText}</span>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="py-10 text-center text-sm font-semibold text-slate-500">
                Memuat formulir buku tamu...
              </div>
            ) : loadError ? (
              <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Buku Tamu Tidak Tersedia</p>
                  <p className="mt-1 text-xs">{loadError}</p>
                </div>
              </div>
            ) : receipt ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={30} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">Kunjungan Tercatat!</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Terima kasih telah mengisi Buku Tamu Digital <strong>{school?.nama}</strong>.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Tanggal &amp; Waktu</span>
                    <strong className="text-right text-slate-900">
                      {receipt.tanggalLabel} · {receipt.waktuLabel}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Nama Tamu</span>
                    <strong className="text-right text-slate-900">{receipt.nama}</strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">No. HP</span>
                    <strong className="text-right font-mono text-slate-900">{receipt.noHp}</strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Alamat</span>
                    <strong className="text-right text-slate-900">{receipt.alamat}</strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Tujuan</span>
                    <strong className="text-right text-slate-900">{receipt.tujuanKunjungan}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-sky-600"
                >
                  <BookUser size={16} />
                  Isi Kunjungan Tamu Berikutnya
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-xs leading-relaxed text-slate-600">
                  Silakan lengkapi data kunjungan berikut. <strong>Tanggal &amp; jam kunjungan</strong> akan otomatis tercatat secara <em>realtime</em> oleh sistem.
                </p>

                {submitError && (
                  <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
                    {submitError}
                  </p>
                )}

                <label className="block text-xs font-bold text-slate-700">
                  Nama Lengkap *
                  <div className="relative mt-1.5">
                    <UserRound size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      required
                      maxLength={150}
                      value={nama}
                      onChange={(e) => setNama(e.target.value)}
                      placeholder="Masukkan nama lengkap Anda"
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                    />
                  </div>
                </label>

                <label className="block text-xs font-bold text-slate-700">
                  Alamat Lengkap *
                  <div className="relative mt-1.5">
                    <MapPin size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      required
                      maxLength={300}
                      value={alamat}
                      onChange={(e) => setAlamat(e.target.value)}
                      placeholder="Desa/Kelurahan, Kecamatan, Kota/Kabupaten"
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                    />
                  </div>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-slate-700">
                    No. HP / WhatsApp *
                    <div className="relative mt-1.5">
                      <Phone size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                      <input
                        type="tel"
                        required
                        maxLength={30}
                        value={noHp}
                        onChange={(e) => setNoHp(e.target.value)}
                        placeholder="0812xxxxxxxx"
                        className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                      />
                    </div>
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    Instansi / Asal (Opsional)
                    <input
                      type="text"
                      maxLength={150}
                      value={instansi}
                      onChange={(e) => setInstansi(e.target.value)}
                      placeholder="Contoh: Dinas Pendidikan / Wali Murid"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                    />
                  </label>
                </div>

                <label className="block text-xs font-bold text-slate-700">
                  Tujuan Kunjungan *
                  <textarea
                    required
                    rows={3}
                    maxLength={300}
                    value={tujuanKunjungan}
                    onChange={(e) => setTujuanKunjungan(e.target.value)}
                    placeholder="Contoh: Pendaftaran warga belajar baru / Pengambilan ijazah / Monitoring Dinas"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                  />
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-sky-600 disabled:opacity-50"
                >
                  <Send size={15} />
                  {submitting ? "Menyimpan Kunjungan..." : "Kirim Buku Tamu"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
