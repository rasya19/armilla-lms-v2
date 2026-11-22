import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  Download,
  ExternalLink,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import { CardGridSkeleton, DashboardHero, EmptyState } from "./DashboardUI";
import { QrCodeSvg } from "./QrCodeSvg";
import { SchoolModal } from "./SchoolModal";
import { useTenantTheme } from "./TenantThemeProvider";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

function panelClass(isDark: boolean) {
  return isDark
    ? "border border-slate-700/60 bg-slate-900/75 text-slate-100"
    : "border border-white/85 bg-white/92 text-slate-900 shadow-xs";
}

function inputClass(isDark: boolean) {
  return isDark
    ? "mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/75 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-400"
    : "glass-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm text-slate-900";
}

function formatRupiah(amount: number) {
  return `Rp ${Number(amount || 0).toLocaleString("id-ID")}`;
}

function formatDateId(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeCsv(value: string | number | null | undefined) {
  const str = String(value ?? "").replace(/"/g, '""');
  return `"${str}"`;
}

// ==========================================
// 1. AKREDITASI 8 SNP (PRO)
// ==========================================
type SnpItem = {
  id: string;
  standarKode: string;
  standarNama: string;
  indikator: string;
  statusDokumen: "BELUM_ADA" | "PROSES" | "LENGKAP";
  tautanBukti: string | null;
  catatanVerifikasi: string | null;
  urutan: number;
};

const SNP_STANDARDS: ReadonlyArray<{ kode: string; nama: string }> = [
  { kode: "SNP-1", nama: "Standar Kompetensi Lulusan (SKL)" },
  { kode: "SNP-2", nama: "Standar Isi" },
  { kode: "SNP-3", nama: "Standar Proses" },
  { kode: "SNP-4", nama: "Standar Penilaian Pendidikan" },
  { kode: "SNP-5", nama: "Standar Pendidik & Tenaga Kependidikan" },
  { kode: "SNP-6", nama: "Standar Sarana & Prasarana" },
  { kode: "SNP-7", nama: "Standar Pengelolaan" },
  { kode: "SNP-8", nama: "Standar Pembiayaan" },
];

export function AkreditasiSnpView() {
  const isDark = useTenantTheme() === "dark";
  const [items, setItems] = useState<SnpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeKode, setActiveKode] = useState<string>("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SnpItem | null>(null);

  const [standarKode, setStandarKode] = useState("SNP-1");
  const [indikator, setIndikator] = useState("");
  const [statusDokumen, setStatusDokumen] = useState<SnpItem["statusDokumen"]>("BELUM_ADA");
  const [tautanBukti, setTautanBukti] = useState("");
  const [catatanVerifikasi, setCatatanVerifikasi] = useState("");

  const [draftUrls, setDraftUrls] = useState<Record<string, string>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/sekolah/akreditasi-snp", { signal });
      const body = (await res.json()) as { items?: SnpItem[]; error?: string };
      if (!res.ok) throw new Error(body.error || "Instrumen 8 SNP belum dapat dimuat.");
      const list = body.items ?? [];
      setItems(list);
      const urls: Record<string, string> = {};
      const notes: Record<string, string> = {};
      for (const item of list) {
        urls[item.id] = item.tautanBukti ?? "";
        notes[item.id] = item.catatanVerifikasi ?? "";
      }
      setDraftUrls(urls);
      setDraftNotes(notes);
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Data Akreditasi 8 SNP gagal dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const progressByStandar = useMemo(() => {
    return SNP_STANDARDS.map((std) => {
      const subset = items.filter((item) => item.standarKode === std.kode);
      const total = subset.length;
      const score = subset.reduce(
        (acc, item) => acc + (item.statusDokumen === "LENGKAP" ? 1 : item.statusDokumen === "PROSES" ? 0.5 : 0),
        0,
      );
      const lengkapCount = subset.filter((item) => item.statusDokumen === "LENGKAP").length;
      const pct = total > 0 ? Math.round((score / total) * 100) : 0;
      return { ...std, total, lengkapCount, pct };
    });
  }, [items]);

  const overallStats = useMemo(() => {
    const total = items.length;
    const lengkap = items.filter((i) => i.statusDokumen === "LENGKAP").length;
    const proses = items.filter((i) => i.statusDokumen === "PROSES").length;
    const score = lengkap + proses * 0.5;
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    return { total, lengkap, proses, pct };
  }, [items]);

  const filteredItems = useMemo(
    () => (activeKode === "ALL" ? items : items.filter((i) => i.standarKode === activeKode)),
    [activeKode, items],
  );

  function openCreate() {
    setEditing(null);
    setStandarKode(activeKode === "ALL" ? "SNP-1" : activeKode);
    setIndikator("");
    setStatusDokumen("BELUM_ADA");
    setTautanBukti("");
    setCatatanVerifikasi("");
    setModalOpen(true);
  }

  function openEdit(item: SnpItem) {
    setEditing(item);
    setStandarKode(item.standarKode);
    setIndikator(item.indikator);
    setStatusDokumen(item.statusDokumen);
    setTautanBukti(item.tautanBukti ?? "");
    setCatatanVerifikasi(item.catatanVerifikasi ?? "");
    setModalOpen(true);
  }

  async function submitModal(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const stdObj = SNP_STANDARDS.find((s) => s.kode === standarKode) ?? SNP_STANDARDS[0];
    try {
      const endpoint = editing ? `/api/sekolah/akreditasi-snp/${editing.id}` : "/api/sekolah/akreditasi-snp";
      const res = await fetchWithTimeout(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          standarKode: stdObj.kode,
          standarNama: stdObj.nama,
          indikator,
          statusDokumen,
          tautanBukti,
          catatanVerifikasi,
        }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Indikator SNP gagal disimpan.");
      setModalOpen(false);
      setNotice(body.message || "Instrumen SNP disimpan.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Indikator SNP gagal disimpan."));
    } finally {
      setSaving(false);
    }
  }

  async function quickUpdateItem(
    item: SnpItem,
    nextStatus?: SnpItem["statusDokumen"],
  ) {
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/akreditasi-snp/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statusDokumen: nextStatus ?? item.statusDokumen,
          tautanBukti: draftUrls[item.id] ?? "",
          catatanVerifikasi: draftNotes[item.id] ?? "",
        }),
      });
      const body = (await res.json()) as { item?: SnpItem; error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Gagal memperbarui indikator.");
      if (body.item) {
        setItems((prev) => prev.map((row) => (row.id === item.id ? body.item! : row)));
      }
      setNotice(body.message || "Status indikator diperbarui.");
    } catch (failure) {
      setError(describeFetchError(failure, "Status indikator gagal diperbarui."));
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(item: SnpItem) {
    setBusyId(item.id);
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/akreditasi-snp/${item.id}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Indikator gagal dihapus.");
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      setNotice(body.message || "Indikator dihapus.");
    } catch (failure) {
      setError(describeFetchError(failure, "Indikator gagal dihapus."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="MUTU & AKREDITASI LEMBAGA (PAKET PRO)"
        title="Akreditasi 8 Standar Nasional Pendidikan (SNP)"
        description="Pantau kesiapan dokumen bukti fisik akreditasi BAN-PDM per standar, tautkan arsip Google Drive, dan kelola verifikasi internal PKBM."
        action={
          <button type="button" onClick={openCreate} className="dashboard-hero-action">
            <Plus size={16} />
            Tambah Indikator
          </button>
        }
      />

      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}

      {loading ? (
        <CardGridSkeleton count={4} columns={4} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className={`rounded-2xl p-5 md:col-span-4 ${panelClass(isDark)}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider opacity-70">Kesiapan Akreditasi Keseluruhan</span>
                <ShieldCheck size={20} className="text-sky-600" />
              </div>
              <p className="mt-3 text-4xl font-black tabular-nums">{overallStats.pct}%</p>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-600 via-cyan-500 to-emerald-500"
                  style={{ width: `${overallStats.pct}%` }}
                />
              </div>
              <p className="mt-3 text-xs opacity-80">
                {overallStats.lengkap} lengkap · {overallStats.proses} dalam proses · {overallStats.total} total indikator
              </p>
            </div>

            <div className={`rounded-2xl p-5 md:col-span-8 ${panelClass(isDark)}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">Progres Per Standar Nasional Pendidikan</h3>
                <button
                  type="button"
                  onClick={() => setActiveKode("ALL")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                    activeKode === "ALL" ? "bg-sky-600 text-white" : "border border-slate-300 text-slate-700"
                  }`}
                >
                  Semua ({items.length})
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {progressByStandar.map((std) => (
                  <button
                    key={std.kode}
                    type="button"
                    onClick={() => setActiveKode(std.kode)}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      activeKode === std.kode
                        ? "border-sky-500 bg-sky-50 text-sky-950 ring-1 ring-sky-400"
                        : isDark
                          ? "border-slate-700/70 bg-slate-950/50 hover:border-sky-500/50"
                          : "border-slate-200 bg-white/80 hover:border-sky-300"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-extrabold">
                      <span>{std.kode}</span>
                      <span className="tabular-nums text-sky-700">{std.pct}%</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] font-semibold opacity-80">{std.nama}</p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-sky-600" style={{ width: `${std.pct}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <EmptyState
              title="Belum ada butir indikator pada standar ini"
              description="Tambahkan butir instrumen baru untuk mulai mendokumentasikan bukti fisik akreditasi."
            />
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => {
                const savingRow = busyId === item.id;
                const badgeStyle =
                  item.statusDokumen === "LENGKAP"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : item.statusDokumen === "PROSES"
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-rose-300 bg-rose-50 text-rose-800";
                return (
                  <article key={item.id} className={`rounded-2xl p-4 sm:p-5 ${panelClass(isDark)}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-extrabold text-sky-900">
                            {item.standarKode}
                          </span>
                          <span className="text-xs font-bold opacity-75">{item.standarNama}</span>
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badgeStyle}`}>
                            {item.statusDokumen === "LENGKAP"
                              ? "Lengkap"
                              : item.statusDokumen === "PROSES"
                                ? "Proses"
                                : "Belum Ada"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-bold leading-snug">{item.indikator}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={savingRow}
                          onClick={() => void removeItem(item)}
                          aria-label="Hapus indikator"
                          className="rounded-lg border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
                      <div className="md:col-span-3">
                        <label className="block text-[11px] font-bold opacity-75">Status Dokumen</label>
                        <select
                          value={item.statusDokumen}
                          disabled={savingRow}
                          onChange={(e) => void quickUpdateItem(item, e.target.value as SnpItem["statusDokumen"])}
                          className={inputClass(isDark)}
                        >
                          <option value="BELUM_ADA">Belum Ada</option>
                          <option value="PROSES">Dalam Proses</option>
                          <option value="LENGKAP">Lengkap</option>
                        </select>
                      </div>
                      <div className="md:col-span-4">
                        <label className="block text-[11px] font-bold opacity-75">Tautan Bukti Fisik (Drive/URL)</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="url"
                            placeholder="https://drive.google.com/..."
                            value={draftUrls[item.id] ?? ""}
                            onChange={(e) => setDraftUrls((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className={inputClass(isDark)}
                          />
                          {item.tautanBukti && (
                            <a
                              href={item.tautanBukti}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Buka dokumen bukti"
                              className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
                            >
                              <ExternalLink size={15} />
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-[11px] font-bold opacity-75">Catatan Verifikasi Internal</label>
                        <input
                          type="text"
                          placeholder="Catatan tim mutu..."
                          value={draftNotes[item.id] ?? ""}
                          onChange={(e) => setDraftNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className={inputClass(isDark)}
                        />
                      </div>
                      <div className="flex items-end md:col-span-2">
                        <button
                          type="button"
                          disabled={savingRow}
                          onClick={() => void quickUpdateItem(item)}
                          className="master-primary w-full py-2.5 disabled:opacity-50"
                        >
                          {savingRow ? "Menyimpan..." : "Simpan Bukti"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {modalOpen && (
        <SchoolModal
          onClose={() => setModalOpen(false)}
          title={editing ? "Edit Indikator Akreditasi SNP" : "Tambah Indikator Akreditasi SNP"}
        >
          <form onSubmit={submitModal} className="space-y-4">
            <label className="block text-sm font-semibold">
              Standar Nasional Pendidikan
              <select
                value={standarKode}
                onChange={(e) => setStandarKode(e.target.value)}
                disabled={Boolean(editing)}
                className={inputClass(false)}
              >
                {SNP_STANDARDS.map((s) => (
                  <option key={s.kode} value={s.kode}>
                    {s.kode} — {s.nama}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Uraian Butir Indikator / Dokumen Wajib
              <textarea
                required
                rows={3}
                value={indikator}
                onChange={(e) => setIndikator(e.target.value)}
                placeholder="Contoh: SK Tim Penjaminan Mutu Internal dan Notulen Rapat Evaluasi Diri..."
                className={inputClass(false)}
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Status Kelengkapan
                <select
                  value={statusDokumen}
                  onChange={(e) => setStatusDokumen(e.target.value as SnpItem["statusDokumen"])}
                  className={inputClass(false)}
                >
                  <option value="BELUM_ADA">Belum Ada</option>
                  <option value="PROSES">Proses</option>
                  <option value="LENGKAP">Lengkap</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Tautan Bukti (Opsional)
                <input
                  type="url"
                  value={tautanBukti}
                  onChange={(e) => setTautanBukti(e.target.value)}
                  placeholder="https://..."
                  className={inputClass(false)}
                />
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Catatan Verifikasi Internal
              <input
                type="text"
                value={catatanVerifikasi}
                onChange={(e) => setCatatanVerifikasi(e.target.value)}
                placeholder="Diverifikasi oleh kepala PKBM / operator..."
                className={inputClass(false)}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                Batal
              </button>
              <button type="submit" disabled={saving} className="master-primary px-5 py-2.5 disabled:opacity-50">
                {saving ? "Menyimpan..." : "Simpan Indikator"}
              </button>
            </div>
          </form>
        </SchoolModal>
      )}
    </div>
  );
}

// ==========================================
// 2. KEUANGAN & SPP (PRO)
// ==========================================
type PembayaranRow = {
  id: string;
  nomorKuitansi: string;
  jumlah: number;
  metode: string;
  tanggalBayar: string;
  catatan: string | null;
  penerima: string;
};

type TagihanRow = {
  id: string;
  siswaId: string;
  siswaNama: string;
  siswaNisn: string;
  kelasNama: string;
  judul: string;
  kategori: string;
  periode: string | null;
  nominal: number;
  terbayar: number;
  sisa: number;
  status: "BELUM_BAYAR" | "CICILAN" | "LUNAS";
  jatuhTempo: string | null;
  keterangan: string | null;
  pembayaran: PembayaranRow[];
};

const KATEGORI_TAGIHAN_LABELS: Record<string, string> = {
  SPP_BULANAN: "SPP Bulanan",
  UANG_UJIAN: "Uang Ujian / CBT",
  DAFTAR_ULANG: "Daftar Ulang",
  SERAGAM_MODUL: "Seragam & Modul Cetak",
  LAINNYA: "Iuran Lainnya",
};

export function KeuanganSppView() {
  const isDark = useTenantTheme() === "dark";
  const [schoolInfo, setSchoolInfo] = useState<{ nama: string; npsn: string | null; alamatSekolah: string | null; kabupatenKota: string | null }>({
    nama: "PKBM",
    npsn: null,
    alamatSekolah: null,
    kabupatenKota: null,
  });
  const [summary, setSummary] = useState({ totalTagihan: 0, totalMasuk: 0, totalTunggakan: 0, jumlahLunas: 0, jumlahTunggakan: 0 });
  const [tagihan, setTagihan] = useState<TagihanRow[]>([]);
  const [kelasList, setKelasList] = useState<Array<{ id: string; nama: string }>>([]);
  const [siswaList, setSiswaList] = useState<Array<{ id: string; nama: string; nisn: string; kelasId: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [search, setSearch] = useState("");

  const [billModalOpen, setBillModalOpen] = useState(false);
  const [targetMode, setTargetMode] = useState<"SISWA" | "KELAS" | "SEMUA">("KELAS");
  const [targetSiswaId, setTargetSiswaId] = useState("");
  const [targetKelasId, setTargetKelasId] = useState("");
  const [judul, setJudul] = useState("SPP Bulan Berjalan");
  const [kategori, setKategori] = useState("SPP_BULANAN");
  const [periode, setPeriode] = useState(new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" }));
  const [nominal, setNominal] = useState(150000);
  const [jatuhTempo, setJatuhTempo] = useState("");
  const [keterangan, setKeterangan] = useState("");

  const [payTarget, setPayTarget] = useState<TagihanRow | null>(null);
  const [payJumlah, setPayJumlah] = useState(0);
  const [payMetode, setPayMetode] = useState("TUNAI");
  const [payCatatan, setPayCatatan] = useState("");

  const [receiptData, setReceiptData] = useState<{ tagihan: TagihanRow; pembayaran: PembayaranRow } | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/sekolah/keuangan", { signal });
      const body = (await res.json()) as {
        sekolah?: typeof schoolInfo;
        summary?: typeof summary;
        tagihan?: TagihanRow[];
        kelas?: Array<{ id: string; nama: string }>;
        siswa?: Array<{ id: string; nama: string; nisn: string; kelasId: string | null }>;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Data keuangan belum dapat dimuat.");
      if (body.sekolah) setSchoolInfo(body.sekolah);
      if (body.summary) setSummary(body.summary);
      setTagihan(body.tagihan ?? []);
      setKelasList(body.kelas ?? []);
      setSiswaList(body.siswa ?? []);
      if (!targetKelasId && body.kelas?.length) setTargetKelasId(body.kelas[0].id);
      if (!targetSiswaId && body.siswa?.length) setTargetSiswaId(body.siswa[0].id);
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Data keuangan & SPP gagal dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [targetKelasId, targetSiswaId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tagihan.filter((row) => {
      if (filterStatus !== "ALL" && row.status !== filterStatus) return false;
      if (!q) return true;
      return (
        row.siswaNama.toLowerCase().includes(q) ||
        row.siswaNisn.toLowerCase().includes(q) ||
        row.judul.toLowerCase().includes(q) ||
        row.kelasNama.toLowerCase().includes(q)
      );
    });
  }, [tagihan, filterStatus, search]);

  async function submitBill(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/keuangan/tagihan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetMode,
          siswaId: targetSiswaId,
          kelasId: targetKelasId,
          judul,
          kategori,
          periode,
          nominal: Number(nominal),
          jatuhTempo,
          keterangan,
        }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Tagihan gagal diterbitkan.");
      setBillModalOpen(false);
      setNotice(body.message || "Tagihan diterbitkan.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Tagihan gagal diterbitkan."));
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault();
    if (!payTarget) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/keuangan/pembayaran", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagihanId: payTarget.id,
          jumlah: Number(payJumlah),
          metode: payMetode,
          catatan: payCatatan,
        }),
      });
      const body = (await res.json()) as { pembayaran?: PembayaranRow; error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Pembayaran gagal dicatat.");
      if (body.pembayaran) {
        setReceiptData({ tagihan: payTarget, pembayaran: body.pembayaran });
      }
      setPayTarget(null);
      setPayCatatan("");
      setNotice(body.message || "Pembayaran berhasil dicatat.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Pembayaran gagal dicatat."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTagihan(id: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/keuangan/tagihan/${id}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menghapus tagihan.");
      setNotice(body.message || "Tagihan dihapus.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal menghapus tagihan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        <DashboardHero
          eyebrow="ADMINISTRASI KEUANGAN (PAKET PRO)"
          title="Keuangan, SPP & Kuitansi Warga Belajar"
          description="Terbitkan tagihan per siswa atau massal per kelas, catat pembayaran cicilan maupun lunas, dan cetak kuitansi resmi lembaga."
          action={
            <button type="button" onClick={() => setBillModalOpen(true)} className="dashboard-hero-action">
              <Plus size={16} />
              Buat Tagihan Baru
            </button>
          }
        />

        {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}

        {loading ? (
          <CardGridSkeleton count={4} columns={4} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
                <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Total Pemasukan</p>
                <p className="mt-2 text-2xl font-black tabular-nums text-emerald-600">{formatRupiah(summary.totalMasuk)}</p>
                <p className="mt-1 text-xs opacity-75">{summary.jumlahLunas} tagihan berstatus lunas</p>
              </div>
              <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
                <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Total Piutang / Tunggakan</p>
                <p className="mt-2 text-2xl font-black tabular-nums text-amber-600">{formatRupiah(summary.totalTunggakan)}</p>
                <p className="mt-1 text-xs opacity-75">{summary.jumlahTunggakan} tagihan belum lunas</p>
              </div>
              <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
                <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Akumulasi Tagihan</p>
                <p className="mt-2 text-2xl font-black tabular-nums">{formatRupiah(summary.totalTagihan)}</p>
                <p className="mt-1 text-xs opacity-75">{tagihan.length} total tagihan diterbitkan</p>
              </div>
              <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
                <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Rasio Kolektibilitas</p>
                <p className="mt-2 text-2xl font-black tabular-nums text-sky-600">
                  {summary.totalTagihan > 0 ? Math.round((summary.totalMasuk / summary.totalTagihan) * 100) : 0}%
                </p>
                <p className="mt-1 text-xs opacity-75">Persentase kas masuk vs tagihan</p>
              </div>
            </div>

            <div className={`rounded-2xl p-4 sm:p-5 ${panelClass(isDark)}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search size={15} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Cari nama siswa / NISN / tagihan..."
                      className={`${inputClass(isDark)} mt-0 w-64 pl-9`}
                    />
                  </div>
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`${inputClass(isDark)} mt-0 w-44`}>
                    <option value="ALL">Semua Status</option>
                    <option value="BELUM_BAYAR">Belum Bayar</option>
                    <option value="CICILAN">Cicilan</option>
                    <option value="LUNAS">Lunas</option>
                  </select>
                </div>
                {receiptData && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-bold text-sky-900 hover:bg-sky-100"
                  >
                    <Printer size={15} />
                    Cetak Kuitansi Terakhir ({receiptData.pembayaran.nomorKuitansi})
                  </button>
                )}
              </div>

              {filteredRows.length === 0 ? (
                <EmptyState
                  title="Belum ada tagihan atau pembayaran"
                  description="Gunakan tombol Buat Tagihan Baru untuk menerbitkan iuran SPP atau uang ujian per kelas."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider opacity-70">
                        <th className="px-3 py-3">Warga Belajar</th>
                        <th className="px-3 py-3">Tagihan &amp; Kategori</th>
                        <th className="px-3 py-3 text-right">Nominal</th>
                        <th className="px-3 py-3 text-right">Terbayar</th>
                        <th className="px-3 py-3 text-right">Sisa</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70">
                      {filteredRows.map((row) => {
                        const lastPayment = row.pembayaran[0];
                        return (
                          <tr key={row.id}>
                            <td className="px-3 py-3">
                              <p className="font-bold">{row.siswaNama}</p>
                              <p className="text-[11px] opacity-70">
                                {row.kelasNama} · NISN {row.siswaNisn}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-bold">{row.judul}</p>
                              <p className="text-[11px] opacity-70">
                                {KATEGORI_TAGIHAN_LABELS[row.kategori] ?? row.kategori}
                                {row.periode ? ` · ${row.periode}` : ""}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums">{formatRupiah(row.nominal)}</td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums text-emerald-600">{formatRupiah(row.terbayar)}</td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums text-amber-600">{formatRupiah(row.sisa)}</td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                                  row.status === "LUNAS"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : row.status === "CICILAN"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {row.status === "LUNAS" ? "Lunas" : row.status === "CICILAN" ? "Cicilan" : "Belum Bayar"}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                {row.sisa > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPayTarget(row);
                                      setPayJumlah(row.sisa);
                                      setPayMetode("TUNAI");
                                      setPayCatatan("");
                                    }}
                                    className="rounded-lg bg-sky-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-sky-800"
                                  >
                                    Bayar
                                  </button>
                                )}
                                {lastPayment && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReceiptData({ tagihan: row, pembayaran: lastPayment });
                                      setTimeout(() => window.print(), 80);
                                    }}
                                    title="Cetak Kuitansi Pembayaran"
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[11px] font-bold hover:bg-slate-100"
                                  >
                                    <Receipt size={13} />
                                    Kuitansi
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void deleteTagihan(row.id)}
                                  aria-label="Hapus tagihan"
                                  className="rounded-lg border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {receiptData && (
        <div className="print-only mx-auto max-w-2xl rounded-xl border-2 border-slate-800 bg-white p-8 text-slate-900">
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-slate-600">KUITANSI PEMBAYARAN RESMI</p>
              <h2 className="mt-1 text-xl font-black uppercase">{schoolInfo.nama}</h2>
              <p className="text-xs text-slate-600">
                {schoolInfo.npsn ? `NPSN: ${schoolInfo.npsn} · ` : ""}
                {schoolInfo.alamatSekolah || schoolInfo.kabupatenKota || "Pendidikan Kesetaraan PKBM"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-xs font-bold">No: {receiptData.pembayaran.nomorKuitansi}</p>
              <p className="mt-1 text-xs text-slate-600">Tanggal: {formatDateId(receiptData.pembayaran.tanggalBayar)}</p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-y-2.5 text-sm">
            <dt className="font-semibold text-slate-600">Telah Terima Dari</dt>
            <dd className="font-bold">
              {receiptData.tagihan.siswaNama} ({receiptData.tagihan.kelasNama})
            </dd>
            <dt className="font-semibold text-slate-600">NISN Warga Belajar</dt>
            <dd className="font-mono">{receiptData.tagihan.siswaNisn}</dd>
            <dt className="font-semibold text-slate-600">Untuk Pembayaran</dt>
            <dd className="font-bold">
              {receiptData.tagihan.judul}
              {receiptData.tagihan.periode ? ` (${receiptData.tagihan.periode})` : ""}
            </dd>
            <dt className="font-semibold text-slate-600">Metode Pembayaran</dt>
            <dd>{receiptData.pembayaran.metode}</dd>
            {receiptData.pembayaran.catatan && (
              <>
                <dt className="font-semibold text-slate-600">Catatan</dt>
                <dd>{receiptData.pembayaran.catatan}</dd>
              </>
            )}
          </dl>

          <div className="mt-6 flex items-center justify-between rounded-lg border-2 border-slate-800 bg-slate-50 px-5 py-3">
            <span className="text-xs font-extrabold uppercase tracking-wider">Jumlah Dibayarkan</span>
            <span className="text-2xl font-black tabular-nums">{formatRupiah(receiptData.pembayaran.jumlah)}</span>
          </div>

          <div className="mt-8 flex justify-end text-center text-xs">
            <div className="w-56">
              <p>Petugas Penerima / Bendahara,</p>
              <div className="h-16" />
              <p className="border-t border-slate-700 pt-1 font-bold">{receiptData.pembayaran.penerima}</p>
            </div>
          </div>
        </div>
      )}

      {billModalOpen && (
        <SchoolModal onClose={() => setBillModalOpen(false)} title="Buat Tagihan / Iuran Baru">
          <form onSubmit={submitBill} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold">Sasaran Tagihan</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {([
                  { id: "SISWA", label: "Per Siswa" },
                  { id: "KELAS", label: "Massal Per Kelas" },
                  { id: "SEMUA", label: "Semua Siswa Aktif" },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTargetMode(opt.id)}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                      targetMode === opt.id ? "border-sky-600 bg-sky-50 text-sky-900" : "border-slate-300 text-slate-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {targetMode === "SISWA" && (
              <label className="block text-sm font-semibold">
                Pilih Warga Belajar
                <select value={targetSiswaId} onChange={(e) => setTargetSiswaId(e.target.value)} className={inputClass(false)}>
                  {siswaList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nama} ({s.nisn})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {targetMode === "KELAS" && (
              <label className="block text-sm font-semibold">
                Pilih Kelas Target
                <select value={targetKelasId} onChange={(e) => setTargetKelasId(e.target.value)} className={inputClass(false)}>
                  {kelasList.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Judul Tagihan
                <input required type="text" value={judul} onChange={(e) => setJudul(e.target.value)} className={inputClass(false)} />
              </label>
              <label className="block text-sm font-semibold">
                Kategori
                <select value={kategori} onChange={(e) => setKategori(e.target.value)} className={inputClass(false)}>
                  {Object.entries(KATEGORI_TAGIHAN_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm font-semibold">
                Nominal (Rp)
                <input
                  required
                  type="number"
                  min={1000}
                  step={500}
                  value={nominal}
                  onChange={(e) => setNominal(Number(e.target.value))}
                  className={inputClass(false)}
                />
              </label>
              <label className="block text-sm font-semibold">
                Periode / Bulan
                <input type="text" value={periode} onChange={(e) => setPeriode(e.target.value)} className={inputClass(false)} />
              </label>
              <label className="block text-sm font-semibold">
                Jatuh Tempo
                <input type="date" value={jatuhTempo} onChange={(e) => setJatuhTempo(e.target.value)} className={inputClass(false)} />
              </label>
            </div>

            <label className="block text-sm font-semibold">
              Keterangan (Opsional)
              <input type="text" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} className={inputClass(false)} />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setBillModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                Batal
              </button>
              <button type="submit" disabled={busy} className="master-primary px-5 py-2.5 disabled:opacity-50">
                {busy ? "Menerbitkan..." : "Terbitkan Tagihan"}
              </button>
            </div>
          </form>
        </SchoolModal>
      )}

      {payTarget && (
        <SchoolModal onClose={() => setPayTarget(null)} title="Catat Pembayaran Masuk">
          <form onSubmit={submitPayment} className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="font-bold">{payTarget.siswaNama}</p>
              <p className="mt-0.5 text-slate-600">
                {payTarget.judul} · Sisa tagihan:{" "}
                <strong className="text-amber-700">{formatRupiah(payTarget.sisa)}</strong>
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Jumlah Dibayar (Rp)
                <input
                  required
                  type="number"
                  min={100}
                  max={payTarget.sisa}
                  value={payJumlah}
                  onChange={(e) => setPayJumlah(Number(e.target.value))}
                  className={inputClass(false)}
                />
              </label>
              <label className="block text-sm font-semibold">
                Metode Pembayaran
                <select value={payMetode} onChange={(e) => setPayMetode(e.target.value)} className={inputClass(false)}>
                  <option value="TUNAI">Tunai / Kasir PKBM</option>
                  <option value="TRANSFER">Transfer Bank</option>
                  <option value="QRIS">QRIS</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Catatan Kuitansi (Opsional)
              <input type="text" value={payCatatan} onChange={(e) => setPayCatatan(e.target.value)} placeholder="Cicilan ke-1 / lunas..." className={inputClass(false)} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayTarget(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                Batal
              </button>
              <button type="submit" disabled={busy} className="master-primary px-5 py-2.5 disabled:opacity-50">
                {busy ? "Menyimpan..." : "Simpan Pembayaran"}
              </button>
            </div>
          </form>
        </SchoolModal>
      )}
    </div>
  );
}

// ==========================================
// 3. KARTU PELAJAR DIGITAL QR (PRO)
// ==========================================
type StudentQrCard = {
  id: string;
  nama: string;
  nisn: string;
  kelasId: string | null;
  kelasNama: string;
  program: "Paket A" | "Paket B" | "Paket C";
  status: string;
  kodeVerifikasi: string;
  qrPayload: string;
};

type CardSchoolProfile = {
  nama: string;
  npsn: string | null;
  alamat: string | null;
  kabupatenKota: string | null;
  kepalaSekolah: string | null;
  logoUrl: string | null;
  primaryColor: string;
};

function StudentIdCardGraphic({ card, sekolah }: { card: StudentQrCard; sekolah: CardSchoolProfile }) {
  return (
    <div className="break-inside-avoid overflow-hidden rounded-2xl border border-slate-300 bg-white text-slate-900 shadow-sm">
      <div
        className="flex items-center justify-between gap-2 px-4 py-2.5 text-white"
        style={{ background: `linear-gradient(120deg, #0c4a6e, ${sekolah.primaryColor || "#0284c7"})` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {sekolah.logoUrl ? (
            <img src={sekolah.logoUrl} alt={`Logo ${sekolah.nama}`} className="h-7 w-7 rounded-lg bg-white object-cover p-0.5" />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/20 text-xs font-black">
              {sekolah.nama.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[10px] font-black uppercase tracking-wider">{sekolah.nama}</p>
            <p className="truncate text-[9px] text-sky-100">
              {sekolah.npsn ? `NPSN ${sekolah.npsn} · ` : ""}Kartu Warga Belajar Digital
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-extrabold uppercase">{card.program}</span>
      </div>

      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-lg font-black text-sky-900">
            {card.nama
              .split(" ")
              .slice(0, 2)
              .map((part) => part.charAt(0).toUpperCase())
              .join("")}
          </div>
          <div className="min-w-0 space-y-0.5 text-xs">
            <p className="truncate text-sm font-extrabold text-slate-900">{card.nama}</p>
            <p className="font-mono text-[11px] font-semibold text-slate-600">NISN: {card.nisn}</p>
            <p className="truncate text-[11px] font-semibold text-slate-700">
              {card.program} · {card.kelasNama}
            </p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
              <CheckCircle2 size={10} />
              {card.status}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center rounded-xl border border-slate-200 bg-white p-1.5">
          <QrCodeSvg value={card.qrPayload} size={74} />
          <span className="mt-1 font-mono text-[8px] font-bold text-slate-500">{card.kodeVerifikasi.slice(-10)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-1.5 text-[9px] text-slate-600">
        <span className="truncate font-mono">ID: {card.kodeVerifikasi}</span>
        <span className="shrink-0 font-bold text-sky-800">Terverifikasi Lembaga</span>
      </div>
    </div>
  );
}

export function KartuDigitalQrView() {
  const isDark = useTenantTheme() === "dark";
  const [sekolah, setSekolah] = useState<CardSchoolProfile>({
    nama: "PKBM",
    npsn: null,
    alamat: null,
    kabupatenKota: null,
    kepalaSekolah: null,
    logoUrl: null,
    primaryColor: "#0369a1",
  });
  const [kelasList, setKelasList] = useState<Array<{ id: string; nama: string }>>([]);
  const [cards, setCards] = useState<StudentQrCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedKelas, setSelectedKelas] = useState("ALL");
  const [search, setSearch] = useState("");
  const [printMode, setPrintMode] = useState<"ALL_FILTERED" | string>("ALL_FILTERED");

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/sekolah/kartu-digital", { signal });
      const body = (await res.json()) as {
        sekolah?: CardSchoolProfile;
        kelas?: Array<{ id: string; nama: string }>;
        cards?: StudentQrCard[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Data kartu digital belum dapat dimuat.");
      if (body.sekolah) setSekolah(body.sekolah);
      setKelasList(body.kelas ?? []);
      setCards(body.cards ?? []);
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Kartu pelajar digital gagal dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (selectedKelas !== "ALL" && (c.kelasId ?? "") !== selectedKelas) return false;
      if (!q) return true;
      return c.nama.toLowerCase().includes(q) || c.nisn.toLowerCase().includes(q) || c.kodeVerifikasi.toLowerCase().includes(q);
    });
  }, [cards, selectedKelas, search]);

  const printCards = useMemo(() => {
    if (printMode === "ALL_FILTERED") return filteredCards;
    return filteredCards.filter((c) => c.id === printMode);
  }, [filteredCards, printMode]);

  function triggerPrint(target: "ALL_FILTERED" | string) {
    setPrintMode(target);
    setTimeout(() => window.print(), 80);
  }

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        <DashboardHero
          eyebrow="IDENTITAS DIGITAL WARGA BELAJAR (PAKET REGULER+)"
          title="Kartu Pelajar Digital QR"
          description="Cetak kartu identitas warga belajar Paket A, B, dan C dengan kode QR verifikasi keaktifan unik secara satuan atau massal per kelas."
          action={
            <button
              type="button"
              disabled={filteredCards.length === 0}
              onClick={() => triggerPrint("ALL_FILTERED")}
              className="dashboard-hero-action disabled:opacity-50"
            >
              <Printer size={16} />
              Cetak Massal ({filteredCards.length} Kartu)
            </button>
          }
        />

        {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}

        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ${panelClass(isDark)}`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama / NISN / kode QR..."
                className={`${inputClass(isDark)} mt-0 w-64 pl-9`}
              />
            </div>
            <select value={selectedKelas} onChange={(e) => setSelectedKelas(e.target.value)} className={`${inputClass(isDark)} mt-0 w-52`}>
              <option value="ALL">Semua Kelas ({cards.length})</option>
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-100"
          >
            <RefreshCw size={14} />
            Segarkan
          </button>
        </div>

        {loading ? (
          <CardGridSkeleton count={6} columns={3} />
        ) : filteredCards.length === 0 ? (
          <EmptyState
            title="Belum ada warga belajar aktif"
            description="Tambahkan data warga belajar aktif terlebih dahulu pada menu Data Siswa untuk menghasilkan kartu digital QR."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredCards.map((card) => (
              <div key={card.id} className="space-y-2">
                <StudentIdCardGraphic card={card} sekolah={sekolah} />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => triggerPrint(card.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-bold text-sky-900 hover:bg-sky-50"
                  >
                    <Printer size={13} />
                    Cetak Kartu Ini
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="print-only grid grid-cols-2 gap-4 bg-white p-4">
        {printCards.map((card) => (
          <StudentIdCardGraphic key={card.id} card={card} sekolah={sekolah} />
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 4. DATA ALUMNI & TRACER STUDY (PAKET PRO)
// ==========================================
type AlumniRow = {
  id: string;
  siswaId: string | null;
  nama: string;
  nisn: string | null;
  program: string;
  tahunLulus: number;
  nomorIjazah: string | null;
  statusPascaLulus: "BEKERJA" | "WIRAUSAHA" | "MELANJUTKAN_PENDIDIKAN" | "LAINNYA";
  namaInstansiUsaha: string | null;
  kontakAktif: string | null;
  tahunMulai: number | null;
  catatan: string | null;
};

type CandidateSiswa = {
  id: string;
  nama: string;
  nisn: string;
  jenjang: string | null;
  status: string;
  telepon: string | null;
  nomorIjazahTerakhir: string | null;
};

const TRACER_LABELS: Record<AlumniRow["statusPascaLulus"], string> = {
  BEKERJA: "Bekerja",
  WIRAUSAHA: "Wirausaha",
  MELANJUTKAN_PENDIDIKAN: "Lanjut Pendidikan",
  LAINNYA: "Lainnya",
};

export function DataAlumniView() {
  const isDark = useTenantTheme() === "dark";
  const [alumni, setAlumni] = useState<AlumniRow[]>([]);
  const [kandidat, setKandidat] = useState<CandidateSiswa[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AlumniRow | null>(null);
  const [siswaId, setSiswaId] = useState("");
  const [nama, setNama] = useState("");
  const [nisn, setNisn] = useState("");
  const [program, setProgram] = useState("Paket C");
  const [tahunLulus, setTahunLulus] = useState(new Date().getFullYear());
  const [nomorIjazah, setNomorIjazah] = useState("");
  const [statusPascaLulus, setStatusPascaLulus] = useState<AlumniRow["statusPascaLulus"]>("BEKERJA");
  const [namaInstansiUsaha, setNamaInstansiUsaha] = useState("");
  const [kontakAktif, setKontakAktif] = useState("");
  const [tahunMulai, setTahunMulai] = useState(new Date().getFullYear());
  const [catatan, setCatatan] = useState("");

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/sekolah/alumni", { signal });
      const body = (await res.json()) as { alumni?: AlumniRow[]; siswaKandidat?: CandidateSiswa[]; error?: string };
      if (!res.ok) throw new Error(body.error || "Data alumni belum dapat dimuat.");
      setAlumni(body.alumni ?? []);
      setKandidat(body.siswaKandidat ?? []);
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Data alumni & tracer study gagal dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const stats = useMemo(() => {
    return {
      total: alumni.length,
      bekerja: alumni.filter((a) => a.statusPascaLulus === "BEKERJA").length,
      wirausaha: alumni.filter((a) => a.statusPascaLulus === "WIRAUSAHA").length,
      lanjut: alumni.filter((a) => a.statusPascaLulus === "MELANJUTKAN_PENDIDIKAN").length,
    };
  }, [alumni]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alumni.filter((a) => {
      if (filterStatus !== "ALL" && a.statusPascaLulus !== filterStatus) return false;
      if (!q) return true;
      return (
        a.nama.toLowerCase().includes(q) ||
        (a.nisn ?? "").toLowerCase().includes(q) ||
        (a.nomorIjazah ?? "").toLowerCase().includes(q) ||
        (a.namaInstansiUsaha ?? "").toLowerCase().includes(q)
      );
    });
  }, [alumni, filterStatus, search]);

  function openCreate() {
    setEditing(null);
    setSiswaId("");
    setNama("");
    setNisn("");
    setProgram("Paket C");
    setTahunLulus(new Date().getFullYear());
    setNomorIjazah("");
    setStatusPascaLulus("BEKERJA");
    setNamaInstansiUsaha("");
    setKontakAktif("");
    setTahunMulai(new Date().getFullYear());
    setCatatan("");
    setModalOpen(true);
  }

  function openEdit(row: AlumniRow) {
    setEditing(row);
    setSiswaId(row.siswaId ?? "");
    setNama(row.nama);
    setNisn(row.nisn ?? "");
    setProgram(row.program);
    setTahunLulus(row.tahunLulus);
    setNomorIjazah(row.nomorIjazah ?? "");
    setStatusPascaLulus(row.statusPascaLulus);
    setNamaInstansiUsaha(row.namaInstansiUsaha ?? "");
    setKontakAktif(row.kontakAktif ?? "");
    setTahunMulai(row.tahunMulai ?? row.tahunLulus);
    setCatatan(row.catatan ?? "");
    setModalOpen(true);
  }

  function handleSelectCandidate(id: string) {
    setSiswaId(id);
    const chosen = kandidat.find((s) => s.id === id);
    if (!chosen) return;
    setNama(chosen.nama);
    setNisn(chosen.nisn);
    setKontakAktif(chosen.telepon ?? "");
    setNomorIjazah(chosen.nomorIjazahTerakhir ?? "");
    const j = (chosen.jenjang ?? "").toLowerCase();
    if (j.includes("paket a") || j.includes("sd")) setProgram("Paket A");
    else if (j.includes("paket b") || j.includes("smp")) setProgram("Paket B");
    else setProgram("Paket C");
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const endpoint = editing ? `/api/sekolah/alumni/${editing.id}` : "/api/sekolah/alumni";
      const res = await fetchWithTimeout(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siswaId: siswaId || null,
          nama,
          nisn,
          program,
          tahunLulus: Number(tahunLulus),
          nomorIjazah,
          statusPascaLulus,
          namaInstansiUsaha,
          kontakAktif,
          tahunMulai: Number(tahunMulai),
          catatan,
        }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Data alumni gagal disimpan.");
      setModalOpen(false);
      setNotice(body.message || "Data alumni disimpan.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Data alumni gagal disimpan."));
    } finally {
      setBusy(false);
    }
  }

  async function removeAlumni(id: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/alumni/${id}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menghapus data alumni.");
      setNotice(body.message || "Data alumni dihapus.");
      setAlumni((prev) => prev.filter((item) => item.id !== id));
    } catch (failure) {
      setError(describeFetchError(failure, "Data alumni gagal dihapus."));
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = ["Nama", "NISN", "Program", "Tahun Lulus", "Nomor Ijazah", "Status Pasca-Lulus", "Instansi/Usaha", "Kontak", "Tahun Mulai"];
    const rows = filtered.map((a) => [
      escapeCsv(a.nama),
      escapeCsv(a.nisn),
      escapeCsv(a.program),
      escapeCsv(a.tahunLulus),
      escapeCsv(a.nomorIjazah),
      escapeCsv(TRACER_LABELS[a.statusPascaLulus]),
      escapeCsv(a.namaInstansiUsaha),
      escapeCsv(a.kontakAktif),
      escapeCsv(a.tahunMulai),
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tracer-study-alumni-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="JEJAK LULUSAN & TRACER STUDY (PAKET PRO)"
        title="Data Alumni & Tracer Study"
        description="Catat lulusan PKBM beserta nomor ijazah/SKL dan telusuri sebaran alumni yang bekerja, berwirausaha, atau melanjutkan pendidikan."
        action={
          <div className="no-print flex flex-wrap gap-2">
            <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className="dashboard-hero-action dashboard-hero-secondary disabled:opacity-50">
              <Download size={16} />
              Ekspor CSV
            </button>
            <button type="button" onClick={() => window.print()} disabled={filtered.length === 0} className="dashboard-hero-action dashboard-hero-secondary disabled:opacity-50">
              <Printer size={16} />
              Cetak Rekap
            </button>
            <button type="button" onClick={openCreate} className="dashboard-hero-action">
              <Plus size={16} />
              Catat Alumni
            </button>
          </div>
        }
      />

      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}

      {loading ? (
        <CardGridSkeleton count={4} columns={4} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
              <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Total Alumni Tercatat</p>
              <p className="mt-2 text-3xl font-black tabular-nums">{stats.total}</p>
            </div>
            <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
              <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Bekerja</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-sky-600">{stats.bekerja}</p>
            </div>
            <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
              <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Wirausaha</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-emerald-600">{stats.wirausaha}</p>
            </div>
            <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
              <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Lanjut Pendidikan</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-amber-600">{stats.lanjut}</p>
            </div>
          </div>

          <div className={`rounded-2xl p-4 sm:p-5 ${panelClass(isDark)}`}>
            <div className="no-print mb-4 flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama / nomor ijazah / instansi..."
                  className={`${inputClass(isDark)} mt-0 w-64 pl-9`}
                />
              </div>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`${inputClass(isDark)} mt-0 w-48`}>
                <option value="ALL">Semua Status Pasca-Lulus</option>
                <option value="BEKERJA">Bekerja</option>
                <option value="WIRAUSAHA">Wirausaha</option>
                <option value="MELANJUTKAN_PENDIDIKAN">Lanjut Pendidikan</option>
                <option value="LAINNYA">Lainnya</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title="Belum ada data alumni & tracer study"
                description="Catat lulusan PKBM beserta status pekerjaan, wirausaha, atau studi lanjutan mereka."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider opacity-70">
                      <th className="px-3 py-3">Nama Alumni</th>
                      <th className="px-3 py-3">Program &amp; Lulus</th>
                      <th className="px-3 py-3">No. Ijazah / SKL</th>
                      <th className="px-3 py-3">Status Tracer Study</th>
                      <th className="px-3 py-3">Instansi / Usaha &amp; Kontak</th>
                      <th className="no-print px-3 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70">
                    {filtered.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3">
                          <p className="font-bold">{row.nama}</p>
                          <p className="font-mono text-[11px] opacity-70">NISN: {row.nisn || "-"}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-bold">{row.program}</p>
                          <p className="text-[11px] opacity-70">Lulus {row.tahunLulus}</p>
                        </td>
                        <td className="px-3 py-3 font-mono font-semibold">{row.nomorIjazah || "-"}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-extrabold text-sky-900">
                            {TRACER_LABELS[row.statusPascaLulus]}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold">{row.namaInstansiUsaha || "-"}</p>
                          <p className="text-[11px] opacity-70">
                            {row.kontakAktif || "-"}
                            {row.tahunMulai ? ` · Mulai ${row.tahunMulai}` : ""}
                          </p>
                        </td>
                        <td className="no-print px-3 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-bold hover:bg-slate-100"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void removeAlumni(row.id)}
                              aria-label="Hapus alumni"
                              className="rounded-lg border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <SchoolModal
          onClose={() => setModalOpen(false)}
          title={editing ? "Perbarui Tracer Study Alumni" : "Catat Alumni & Tracer Study"}
        >
          <form onSubmit={submitForm} className="space-y-4">
            {!editing && kandidat.length > 0 && (
              <label className="block text-sm font-semibold">
                Ambil dari Data Warga Belajar (Opsional — otomatis tandai sebagai Alumni)
                <select value={siswaId} onChange={(e) => handleSelectCandidate(e.target.value)} className={inputClass(false)}>
                  <option value="">-- Input Manual Alumni --</option>
                  {kandidat.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nama} ({s.nisn}) — {s.status}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Nama Lengkap Alumni
                <input required type="text" value={nama} onChange={(e) => setNama(e.target.value)} className={inputClass(false)} />
              </label>
              <label className="block text-sm font-semibold">
                NISN (Opsional)
                <input type="text" value={nisn} onChange={(e) => setNisn(e.target.value)} className={inputClass(false)} />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm font-semibold">
                Program Kesetaraan
                <select value={program} onChange={(e) => setProgram(e.target.value)} className={inputClass(false)}>
                  <option value="Paket A">Paket A (Setara SD)</option>
                  <option value="Paket B">Paket B (Setara SMP)</option>
                  <option value="Paket C">Paket C (Setara SMA)</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Tahun Lulus
                <input
                  required
                  type="number"
                  min={1990}
                  max={2100}
                  value={tahunLulus}
                  onChange={(e) => setTahunLulus(Number(e.target.value))}
                  className={inputClass(false)}
                />
              </label>
              <label className="block text-sm font-semibold">
                Nomor Ijazah / SKL
                <input type="text" value={nomorIjazah} onChange={(e) => setNomorIjazah(e.target.value)} className={inputClass(false)} />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Status Pasca-Lulus
                <select
                  value={statusPascaLulus}
                  onChange={(e) => setStatusPascaLulus(e.target.value as AlumniRow["statusPascaLulus"])}
                  className={inputClass(false)}
                >
                  <option value="BEKERJA">Bekerja</option>
                  <option value="WIRAUSAHA">Wirausaha</option>
                  <option value="MELANJUTKAN_PENDIDIKAN">Melanjutkan Pendidikan</option>
                  <option value="LAINNYA">Lainnya</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Tahun Mulai Bekerja / Studi
                <input
                  type="number"
                  min={1990}
                  max={2100}
                  value={tahunMulai}
                  onChange={(e) => setTahunMulai(Number(e.target.value))}
                  className={inputClass(false)}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Nama Perusahaan / Usaha / Kampus
                <input
                  type="text"
                  value={namaInstansiUsaha}
                  onChange={(e) => setNamaInstansiUsaha(e.target.value)}
                  placeholder="PT / Toko Mandiri / Universitas..."
                  className={inputClass(false)}
                />
              </label>
              <label className="block text-sm font-semibold">
                Kontak Aktif (HP/WA)
                <input type="text" value={kontakAktif} onChange={(e) => setKontakAktif(e.target.value)} className={inputClass(false)} />
              </label>
            </div>

            <label className="block text-sm font-semibold">
              Catatan Tambahan
              <textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputClass(false)} />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                Batal
              </button>
              <button type="submit" disabled={busy} className="master-primary px-5 py-2.5 disabled:opacity-50">
                {busy ? "Menyimpan..." : "Simpan Data Alumni"}
              </button>
            </div>
          </form>
        </SchoolModal>
      )}
    </div>
  );
}
