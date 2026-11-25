import { useCallback, useEffect, useState } from "react";
import {
  BookUser,
  Check,
  Copy,
  Download,
  ExternalLink,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { CardGridSkeleton, DashboardHero, EmptyState } from "./DashboardUI";
import { buildKopSuratProfile, KopSurat } from "./KopSurat";
import { QrCodeSvg } from "./QrCodeSvg";
import type { SchoolProfile } from "./schoolProfile";
import { useTenantTheme } from "./TenantThemeProvider";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type GuestbookEntry = {
  id: string;
  nama: string;
  alamat: string;
  noHp: string;
  tujuanKunjungan: string;
  instansi: string | null;
  tanggalKunjung: string;
  tanggalLabel: string;
  waktuLabel: string;
};

type GuestbookPayload = {
  sekolah: {
    nama: string;
    slug: string;
    npsn: string | null;
    alamat: string | null;
    kabupatenKota: string | null;
    kepalaSekolah: string | null;
    logoUrl: string | null;
  };
  kopSurat?: SchoolProfile;
  filter: { tahun: number; bulan: number | null };
  availableYears: number[];
  total: number;
  rows: GuestbookEntry[];
};

const MONTH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "Semua Bulan (Rekap Tahunan)" },
  { value: "1", label: "Januari" },
  { value: "2", label: "Februari" },
  { value: "3", label: "Maret" },
  { value: "4", label: "April" },
  { value: "5", label: "Mei" },
  { value: "6", label: "Juni" },
  { value: "7", label: "Juli" },
  { value: "8", label: "Agustus" },
  { value: "9", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Desember" },
];

export function SchoolGuestbookView() {
  const isDark = useTenantTheme() === "dark";
  const currentYear = new Date().getFullYear();
  const [tahun, setTahun] = useState(String(currentYear));
  const [bulan, setBulan] = useState("ALL");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<GuestbookPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [printMode, setPrintMode] = useState<"rekap" | "poster">("rekap");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadGuestbook = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ tahun });
        if (bulan !== "ALL") params.set("bulan", bulan);
        if (search.trim()) params.set("q", search.trim());
        const res = await fetchWithTimeout(`/api/sekolah/buku-tamu?${params.toString()}`, { signal });
        const body = (await res.json().catch(() => null)) as (GuestbookPayload & { error?: string }) | null;
        if (!res.ok || !body) throw new Error(body?.error || "Data buku tamu digital belum dapat dimuat.");
        setData(body);
      } catch (failure) {
        if (!isCallerAborted(failure, signal)) {
          setError(describeFetchError(failure, "Data buku tamu digital belum dapat dimuat."));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [tahun, bulan, search],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadGuestbook(controller.signal);
    return () => controller.abort();
  }, [loadGuestbook]);

  const guestbookUrl =
    typeof window !== "undefined" && data?.sekolah.slug
      ? `${window.location.origin}/buku-tamu/${data.sekolah.slug}`
      : "";

  const periodeLabel =
    bulan === "ALL"
      ? `Tahun ${tahun}`
      : `${MONTH_OPTIONS.find((m) => m.value === bulan)?.label ?? `Bulan ${bulan}`} ${tahun}`;

  async function handleCopyUrl() {
    if (!guestbookUrl) return;
    try {
      await navigator.clipboard.writeText(guestbookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Gagal menyalin tautan buku tamu.");
    }
  }

  async function handleDelete(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/buku-tamu/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menghapus entri buku tamu.");
      setNotice(body?.message || "Entri buku tamu dihapus.");
      await loadGuestbook();
    } catch (failure) {
      setError(describeFetchError(failure, "Entri buku tamu belum dapat dihapus."));
    } finally {
      setBusy(false);
    }
  }

  async function handleExportExcel() {
    if (!data || data.rows.length === 0) return;
    const XLSX = await import("xlsx");
    const sheetRows = data.rows.map((row, idx) => ({
      No: idx + 1,
      Tanggal: row.tanggalLabel,
      "Waktu (WIB)": row.waktuLabel,
      "Nama Tamu": row.nama,
      Instansi: row.instansi || "-",
      Alamat: row.alamat,
      "No. HP": row.noHp,
      "Tujuan Kunjungan": row.tujuanKunjungan,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Buku Tamu");
    const periodSlug = bulan === "ALL" ? `Tahun_${tahun}` : `Bulan_${bulan}_${tahun}`;
    XLSX.writeFile(wb, `Buku_Tamu_${data.sekolah.slug || "PKBM"}_${periodSlug}.xlsx`);
  }

  function triggerPrint(mode: "rekap" | "poster") {
    setPrintMode(mode);
    window.setTimeout(() => window.print(), 80);
  }

  const cardCls = isDark
    ? "border border-slate-700/60 bg-slate-900/75 text-slate-100"
    : "border border-slate-200/90 bg-white/95 text-slate-900 shadow-xs";

  const fieldCls = isDark
    ? "mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
    : "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900";

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <div className="no-print space-y-5">
        <DashboardHero
          eyebrow="Administrasi Lembaga · Paket Reguler+"
          title="Buku Tamu Digital (QR Code)"
          description="Sediakan QR Code di meja resepsionis PKBM. Tamu cukup memindai QR untuk mengisi nama, alamat, nomor HP, dan tujuan kunjungan — tanggal & waktu otomatis tercatat realtime dan siap diunduh bulanan/tahunan."
          action={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!guestbookUrl}
                onClick={() => triggerPrint("poster")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-xs hover:bg-amber-400 disabled:opacity-50"
              >
                <QrCode size={15} />
                Cetak Poster QR
              </button>
              <button
                type="button"
                disabled={!data || data.rows.length === 0}
                onClick={() => void handleExportExcel()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
              >
                <Download size={15} />
                Unduh Excel ({periodeLabel})
              </button>
              <button
                type="button"
                disabled={!data || data.rows.length === 0}
                onClick={() => triggerPrint("rekap")}
                className="dashboard-hero-action"
              >
                <Printer size={15} />
                Cetak Rekap
              </button>
            </div>
          }
        />

        {error && (
          <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {notice}
          </p>
        )}

        {/* Kartu QR Code Buku Tamu */}
        <div className={`flex flex-col gap-5 rounded-2xl p-5 md:flex-row md:items-center ${cardCls}`}>
          <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            {guestbookUrl ? (
              <QrCodeSvg value={guestbookUrl} size={150} label="QR Code Buku Tamu Digital" />
            ) : (
              <div className="flex h-[150px] w-[150px] items-center justify-center text-xs text-slate-400">
                Memuat QR...
              </div>
            )}
            <span className="mt-2 text-[10px] font-extrabold uppercase tracking-wider text-sky-800">
              Scan untuk Isi Buku Tamu
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-extrabold">
                <BookUser size={17} className="text-sky-600" />
                QR Code &amp; Tautan Buku Tamu {data?.sekolah.nama || "Lembaga"}
              </h3>
              <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Cetak poster QR Code di bawah dan pajang di meja layanan / pintu masuk PKBM. Setiap tamu yang memindai QR langsung mengisi formulir dari HP tanpa perlu login, dan tanggal kunjungan otomatis terekam <em>realtime</em>.
              </p>
            </div>

            {guestbookUrl && (
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800">
                  {guestbookUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopyUrl()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  {copied ? "Tersalin" : "Salin Link"}
                </button>
                <a
                  href={guestbookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600"
                >
                  <ExternalLink size={14} />
                  Buka Form Tamu
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Filter Periode Bulanan / Tahunan */}
        <div className={`rounded-2xl p-4 ${cardCls}`}>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block text-xs font-bold">
              Tahun Rekap
              <select value={tahun} onChange={(e) => setTahun(e.target.value)} className={fieldCls}>
                {(data?.availableYears ?? [currentYear]).map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold">
              Periode Bulan (Bulanan / Tahunan)
              <select value={bulan} onChange={(e) => setBulan(e.target.value)} className={fieldCls}>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold sm:col-span-2">
              Cari Tamu
              <div className="relative mt-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama, alamat, no HP, atau tujuan kunjungan..."
                  className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs text-slate-900"
                />
              </div>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-3 text-xs">
            <span className={isDark ? "text-slate-300" : "text-slate-600"}>
              Menampilkan <strong>{data?.total ?? 0}</strong> kunjungan untuk periode <strong>{periodeLabel}</strong>.
            </span>
            <button
              type="button"
              onClick={() => void loadGuestbook()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={13} />
              Segarkan
            </button>
          </div>
        </div>
      </div>

      {/* Mode Cetak Poster QR Code Buku Tamu */}
      {printMode === "poster" && guestbookUrl && data && (
        <article className="print-only print-sheet rounded-2xl border border-slate-300 bg-white p-10 text-center text-slate-900">
          <KopSurat profile={buildKopSuratProfile(data.kopSurat, data.sekolah)} />
          <div className="mt-10 space-y-4">
            <p className="text-sm font-extrabold uppercase tracking-widest text-sky-800">
              LAYANAN RESEPSIONIS DIGITAL
            </p>
            <h2 className="text-3xl font-black uppercase text-slate-950">BUKU TAMU DIGITAL</h2>
            <p className="mx-auto max-w-md text-sm text-slate-700">
              Silakan pindai (scan) QR Code di bawah menggunakan kamera HP Anda untuk mengisi buku tamu kunjungan secara cepat dan <em>realtime</em>.
            </p>
            <div className="my-8 inline-flex flex-col items-center rounded-3xl border-4 border-sky-800 bg-white p-6">
              <QrCodeSvg value={guestbookUrl} size={280} label="QR Poster Buku Tamu Digital" />
              <p className="mt-4 font-mono text-xs font-bold text-slate-700">{guestbookUrl}</p>
            </div>
            <p className="text-xs font-semibold text-slate-600">
              {data.sekolah.nama} · {data.sekolah.alamat || data.sekolah.kabupatenKota || ""}
            </p>
          </div>
        </article>
      )}

      {/* Tabel Rekap Kunjungan Tamu (Layar + Cetak Rekap) */}
      <div className={printMode === "poster" ? "no-print" : ""}>
        {loading && !data ? (
          <CardGridSkeleton count={3} columns={3} />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            title={`Belum ada kunjungan tamu pada ${periodeLabel}`}
            description="Bagikan atau cetak QR Code Buku Tamu di atas agar tamu dapat langsung memindai dan mengisi kunjungan."
          />
        ) : (
          <article className="print-sheet rounded-2xl border border-slate-300 bg-white p-5 text-slate-900 shadow-xs sm:p-6">
            <div className="print-only mb-4">
              <KopSurat profile={buildKopSuratProfile(data.kopSurat, data.sekolah)} />
            </div>
            <div className="mb-4 text-center">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-950 sm:text-base">
                Rekap Buku Tamu Digital — {data.sekolah.nama}
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Periode: <strong>{periodeLabel}</strong> · Total Kunjungan: <strong>{data.total} tamu</strong>
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse border border-slate-300 text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 font-extrabold text-slate-900">
                    <th className="w-10 border border-slate-300 px-2.5 py-2 text-center">No</th>
                    <th className="w-40 border border-slate-300 px-2.5 py-2">Tanggal &amp; Waktu</th>
                    <th className="border border-slate-300 px-2.5 py-2">Nama Tamu</th>
                    <th className="border border-slate-300 px-2.5 py-2">Alamat</th>
                    <th className="w-32 border border-slate-300 px-2.5 py-2">No. HP</th>
                    <th className="border border-slate-300 px-2.5 py-2">Tujuan Kunjungan</th>
                    <th className="no-print w-16 border border-slate-300 px-2 py-2 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="border border-slate-300 px-2.5 py-2 text-center tabular-nums">{idx + 1}</td>
                      <td className="border border-slate-300 px-2.5 py-2">
                        <p className="font-bold text-slate-900">{row.tanggalLabel}</p>
                        <p className="text-[10px] text-slate-500">{row.waktuLabel}</p>
                      </td>
                      <td className="border border-slate-300 px-2.5 py-2">
                        <p className="font-bold text-slate-900">{row.nama}</p>
                        {row.instansi && <p className="text-[10px] text-slate-500">{row.instansi}</p>}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-2 text-slate-700">{row.alamat}</td>
                      <td className="border border-slate-300 px-2.5 py-2 font-mono text-[11px]">{row.noHp}</td>
                      <td className="border border-slate-300 px-2.5 py-2 text-slate-800">{row.tujuanKunjungan}</td>
                      <td className="no-print border border-slate-300 px-2 py-2 text-center">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(row.id)}
                          title="Hapus entri"
                          className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
