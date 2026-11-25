import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Inbox,
  Mail,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { CardGridSkeleton, DashboardHero, EmptyState } from "./DashboardUI";
import { buildKopSuratProfile, KopSurat } from "./KopSurat";
import type { SchoolProfile } from "./schoolProfile";
import { useTenantTheme } from "./TenantThemeProvider";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type MailAgendaEntry = {
  id: string;
  jenis: "MASUK" | "KELUAR";
  tahun: number;
  nomorUrut: number;
  nomorSurat: string;
  tanggalSurat: string;
  pengirimTujuan: string;
  perihal: string;
  keterangan: string | null;
};

type NextMailSuggestion = {
  lastNomorUrut: number;
  nextNomorUrut: number;
  suggestedNomorSurat: string;
};

type MailAgendaPayload = {
  sekolah: {
    nama: string;
    slug: string;
    npsn: string | null;
    alamat: string | null;
    kabupatenKota: string | null;
    kepalaSekolah: string | null;
  };
  kopSurat?: SchoolProfile;
  tahun: number;
  availableYears: number[];
  nextMasuk: NextMailSuggestion;
  nextKeluar: NextMailSuggestion;
  rows: MailAgendaEntry[];
};

export function SchoolMailAgendaView() {
  const isDark = useTenantTheme() === "dark";
  const currentYear = new Date().getFullYear();
  const [activeTab, setActiveTab] = useState<"KELUAR" | "MASUK">("KELUAR");
  const [tahun, setTahun] = useState(String(currentYear));
  const [search, setSearch] = useState("");
  const [data, setData] = useState<MailAgendaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Form state
  const [nomorUrut, setNomorUrut] = useState("");
  const [nomorSurat, setNomorSurat] = useState("");
  const [tanggalSurat, setTanggalSurat] = useState(() => new Date().toISOString().slice(0, 10));
  const [pengirimTujuan, setPengirimTujuan] = useState("");
  const [perihal, setPerihal] = useState("");
  const [keterangan, setKeterangan] = useState("");

  const loadAgenda = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ jenis: activeTab, tahun });
        if (search.trim()) params.set("q", search.trim());
        const res = await fetchWithTimeout(`/api/sekolah/agenda-surat?${params.toString()}`, { signal });
        const body = (await res.json().catch(() => null)) as (MailAgendaPayload & { error?: string }) | null;
        if (!res.ok || !body) throw new Error(body?.error || "Agenda surat belum dapat dimuat.");
        setData(body);
        const nextInfo = activeTab === "KELUAR" ? body.nextKeluar : body.nextMasuk;
        setNomorUrut(String(nextInfo.nextNomorUrut));
        setNomorSurat(nextInfo.suggestedNomorSurat);
      } catch (failure) {
        if (!isCallerAborted(failure, signal)) {
          setError(describeFetchError(failure, "Agenda surat belum dapat dimuat."));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [activeTab, tahun, search],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadAgenda(controller.signal);
    return () => controller.abort();
  }, [loadAgenda]);

  async function handleAddEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/agenda-surat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jenis: activeTab,
          tahun: Number(tahun),
          nomorUrut: nomorUrut.trim() ? Number(nomorUrut) : undefined,
          nomorSurat: nomorSurat.trim() || undefined,
          tanggalSurat,
          pengirimTujuan: pengirimTujuan.trim(),
          perihal: perihal.trim(),
          keterangan: keterangan.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal mencatat surat ke agenda.");
      setNotice(body?.message || "Surat berhasil dicatat ke agenda.");
      setPengirimTujuan("");
      setPerihal("");
      setKeterangan("");
      await loadAgenda();
    } catch (failure) {
      setError(describeFetchError(failure, "Surat belum dapat dicatat."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/agenda-surat/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menghapus data surat.");
      setNotice(body?.message || "Entri agenda surat dihapus.");
      await loadAgenda();
    } catch (failure) {
      setError(describeFetchError(failure, "Data surat belum dapat dihapus."));
    } finally {
      setBusy(false);
    }
  }

  async function handleExportExcel() {
    if (!data || data.rows.length === 0) return;
    const XLSX = await import("xlsx");
    const sheetRows = data.rows.map((r) => ({
      "No. Urut": r.nomorUrut,
      Jenis: r.jenis === "KELUAR" ? "Surat Keluar" : "Surat Masuk",
      "Nomor Surat": r.nomorSurat,
      "Tanggal Surat": r.tanggalSurat,
      [activeTab === "KELUAR" ? "Tujuan Surat" : "Pengirim"]: r.pengirimTujuan,
      Perihal: r.perihal,
      Keterangan: r.keterangan || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab === "KELUAR" ? "Surat Keluar" : "Surat Masuk");
    XLSX.writeFile(wb, `Agenda_Surat_${activeTab}_${data.sekolah.slug || "PKBM"}_${tahun}.xlsx`);
  }

  const nextInfo = activeTab === "KELUAR" ? data?.nextKeluar : data?.nextMasuk;
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
          eyebrow="Administrasi Persuratan · Terintegrasi Transkrip Nilai"
          title="Agenda Surat Masuk & Surat Keluar"
          description="Catat seluruh surat masuk dan surat keluar lembaga secara tertib. Nomor urut terakhir pada Agenda Surat Keluar otomatis dibaca oleh halaman Transkrip Nilai (mis. terakhir No. 23 → Transkrip otomatis No. 24)."
          action={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!data || data.rows.length === 0}
                onClick={() => void handleExportExcel()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
              >
                <Download size={15} />
                Unduh Excel (.xlsx)
              </button>
              <button
                type="button"
                disabled={!data || data.rows.length === 0}
                onClick={() => window.print()}
                className="dashboard-hero-action"
              >
                <Printer size={15} />
                Cetak Buku Agenda
              </button>
            </div>
          }
        />

        {/* Tab Surat Keluar / Surat Masuk */}
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-2 ${cardCls}`}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("KELUAR")}
              aria-pressed={activeTab === "KELUAR"}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                activeTab === "KELUAR"
                  ? "bg-sky-700 text-white shadow-xs"
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800"
                    : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Send size={14} />
              Surat Keluar {data ? `(Terakhir No. ${data.nextKeluar.lastNomorUrut})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("MASUK")}
              aria-pressed={activeTab === "MASUK"}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                activeTab === "MASUK"
                  ? "bg-sky-700 text-white shadow-xs"
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800"
                    : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Inbox size={14} />
              Surat Masuk {data ? `(Terakhir No. ${data.nextMasuk.lastNomorUrut})` : ""}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Tahun Agenda"
              value={tahun}
              onChange={(e) => setTahun(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
            >
              {(data?.availableYears ?? [currentYear]).map((y) => (
                <option key={y} value={String(y)}>
                  Tahun {y}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nomor / perihal..."
                className="w-48 rounded-xl border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadAgenda()}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

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

        {/* Form Input Surat */}
        <form onSubmit={handleAddEntry} className={`space-y-4 rounded-2xl p-5 ${cardCls}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-extrabold">
              <Mail size={16} className="text-sky-600" />
              Catat {activeTab === "KELUAR" ? "Surat Keluar" : "Surat Masuk"} Baru
            </h3>
            {nextInfo && (
              <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-extrabold text-sky-900">
                No. Urut Terakhir: {nextInfo.lastNomorUrut} → Berikutnya: {nextInfo.nextNomorUrut}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-bold">
              No. Urut (Otomatis / Bisa Manual)
              <input
                type="number"
                min={1}
                required
                value={nomorUrut}
                onChange={(e) => setNomorUrut(e.target.value)}
                className={fieldCls}
              />
            </label>
            <label className="block text-xs font-bold lg:col-span-2">
              Nomor Surat
              <input
                type="text"
                required
                maxLength={120}
                value={nomorSurat}
                onChange={(e) => setNomorSurat(e.target.value)}
                placeholder="Contoh: 023/PKBM/XI/2026"
                className={fieldCls}
              />
            </label>
            <label className="block text-xs font-bold">
              Tanggal Surat
              <input
                type="date"
                required
                value={tanggalSurat}
                onChange={(e) => setTanggalSurat(e.target.value)}
                className={fieldCls}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-bold">
              {activeTab === "KELUAR" ? "Tujuan / Penerima Surat *" : "Asal / Pengirim Surat *"}
              <input
                type="text"
                required
                maxLength={200}
                value={pengirimTujuan}
                onChange={(e) => setPengirimTujuan(e.target.value)}
                placeholder={activeTab === "KELUAR" ? "Contoh: Dinas Pendidikan / Wali Murid" : "Contoh: Dinas Pendidikan Kab/Kota"}
                className={fieldCls}
              />
            </label>
            <label className="block text-xs font-bold">
              Perihal *
              <input
                type="text"
                required
                maxLength={300}
                value={perihal}
                onChange={(e) => setPerihal(e.target.value)}
                placeholder="Contoh: Surat Keterangan Aktif / Undangan Rapat"
                className={fieldCls}
              />
            </label>
            <label className="block text-xs font-bold">
              Keterangan (Opsional)
              <input
                type="text"
                maxLength={500}
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Catatan arsip / rak berkas"
                className={fieldCls}
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="master-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-xs disabled:opacity-50"
            >
              <Plus size={14} />
              {busy ? "Menyimpan..." : `Simpan ke Agenda ${activeTab === "KELUAR" ? "Surat Keluar" : "Surat Masuk"}`}
            </button>
          </div>
        </form>
      </div>

      {/* Tabel Buku Agenda Surat (Layar + Cetak) */}
      {loading && !data ? (
        <CardGridSkeleton count={3} columns={3} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          title={`Belum ada catatan ${activeTab === "KELUAR" ? "Surat Keluar" : "Surat Masuk"} pada tahun ${tahun}`}
          description="Isi formulir di atas untuk mencatat surat pertama. Nomor urut Surat Keluar terakhir akan otomatis tersinkron ke Transkrip Nilai."
        />
      ) : (
        <article className="print-sheet rounded-2xl border border-slate-300 bg-white p-5 text-slate-900 shadow-xs sm:p-6">
          <div className="print-only mb-4">
            <KopSurat profile={buildKopSuratProfile(data.kopSurat, data.sekolah)} />
          </div>
          <div className="mb-4 text-center">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-950 sm:text-base">
              Buku Agenda {activeTab === "KELUAR" ? "Surat Keluar" : "Surat Masuk"} — Tahun {tahun}
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">{data.sekolah.nama}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse border border-slate-300 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 font-extrabold text-slate-900">
                  <th className="w-16 border border-slate-300 px-2.5 py-2 text-center">No. Urut</th>
                  <th className="border border-slate-300 px-2.5 py-2">Nomor Surat</th>
                  <th className="w-28 border border-slate-300 px-2.5 py-2 text-center">Tanggal</th>
                  <th className="border border-slate-300 px-2.5 py-2">
                    {activeTab === "KELUAR" ? "Tujuan Surat" : "Pengirim"}
                  </th>
                  <th className="border border-slate-300 px-2.5 py-2">Perihal</th>
                  <th className="border border-slate-300 px-2.5 py-2">Keterangan</th>
                  <th className="no-print w-14 border border-slate-300 px-2 py-2 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="border border-slate-300 px-2.5 py-2 text-center font-extrabold tabular-nums">
                      {row.nomorUrut}
                    </td>
                    <td className="border border-slate-300 px-2.5 py-2 font-mono text-[11px] font-bold text-slate-900">
                      {row.nomorSurat}
                    </td>
                    <td className="border border-slate-300 px-2.5 py-2 text-center tabular-nums">
                      {row.tanggalSurat}
                    </td>
                    <td className="border border-slate-300 px-2.5 py-2 font-semibold">{row.pengirimTujuan}</td>
                    <td className="border border-slate-300 px-2.5 py-2">{row.perihal}</td>
                    <td className="border border-slate-300 px-2.5 py-2 text-slate-600">{row.keterangan || "-"}</td>
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
    </section>
  );
}
