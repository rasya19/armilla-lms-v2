import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  Building2,
  CalendarDays,
  CheckCircle2,
  Copy,
  Database,
  Eye,
  Globe,
  KeyRound,
  Lock,
  MonitorCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { CardGridSkeleton, DashboardHero, EmptyState } from "./DashboardUI";
import { CbtImportPanel } from "./CbtImportPanel";
import {
  CBT_CATEGORIES,
  categoryBadgeLabel,
  detectCbtCategory,
  type CbtCategory,
} from "./cbtImportData";
import { useTenantTheme } from "./TenantThemeProvider";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type BankVisibility = "PRIVATE" | "PUBLIC" | "ARCHIVED";
type PublicBankJenjang = "ALL" | "PAKET_A" | "PAKET_B" | "PAKET_C";
type PublicBankKategori = "ALL" | "LATIHAN" | "UTS" | "UAS" | "UJIAN_AKHIR";

type UjianItem = {
  id: string;
  kode: string;
  judul: string;
  durasiMenit: number;
  mulai: string;
  selesai: string;
  kkm: number;
  tokenKode: string | null;
  dipublikasikan: boolean;
  visibility?: BankVisibility;
  originSchoolName?: string | null;
  sourceSchoolName?: string | null;
  kelas: { id: string; nama: string };
  mapel: { id: string; nama: string };
  guru: { id: string; nama: string };
  _count: { soal: number; percobaan: number };
};

type PublicBankItem = {
  id: string;
  kode: string;
  judul: string;
  durasiMenit: number;
  kkm: number;
  visibility: "PUBLIC";
  createdAt: string;
  jumlahSoal: number;
  mataPelajaran: string;
  kelasAsal: string;
  jenjang: "PAKET_A" | "PAKET_B" | "PAKET_C" | "LAINNYA";
  kategori: "LATIHAN" | "UTS" | "UAS" | "UJIAN_AKHIR";
  originSchoolName: string;
  sourceSchoolName?: string;
  pembuatNama: string;
  isOwnSchool: boolean;
  isMaster?: boolean;
};

type PublicBankPreviewPayload = {
  bank: {
    id: string;
    kode: string;
    judul: string;
    durasiMenit: number;
    kkm: number;
    mataPelajaran: string;
    kelasAsal: string;
    jenjang: PublicBankItem["jenjang"];
    kategori: PublicBankItem["kategori"];
    originSchoolName: string;
    pembuatNama: string;
    jumlahSoal: number;
    isMaster?: boolean;
  };
  soal: Array<{
    id: string;
    urutan: number;
    tipe: "PG" | "ESAI";
    teks: string;
    bobot: number;
    kunciEsai: string | null;
    pembahasan: string | null;
    opsi: Array<{ id?: string; kode: string; teks: string; benar: boolean }>;
  }>;
  error?: string;
};

function normalizeVisibility(raw?: string | null): BankVisibility {
  if (raw === "PUBLIC" || raw === "ARCHIVED") return raw;
  return "PRIVATE";
}

function publicJenjangLabel(value: PublicBankItem["jenjang"]): string {
  if (value === "PAKET_A") return "Paket A";
  if (value === "PAKET_B") return "Paket B";
  if (value === "PAKET_C") return "Paket C";
  return "Umum";
}

function publicKategoriLabel(value: PublicBankItem["kategori"]): string {
  if (value === "UTS") return "UTS";
  if (value === "UAS") return "UAS";
  if (value === "UJIAN_AKHIR") return "Ujian Akhir";
  return "Latihan";
}

function VisibilityBadge({ visibility, isDark }: { visibility: BankVisibility; isDark: boolean }) {
  if (visibility === "PUBLIC") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-extrabold ${
          isDark
            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
      >
        <Globe size={10} aria-hidden="true" />
        Publik
      </span>
    );
  }
  if (visibility === "ARCHIVED") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-extrabold ${
          isDark
            ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        <Archive size={10} aria-hidden="true" />
        Diarsipkan
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-extrabold ${
        isDark
          ? "border-slate-600 bg-slate-800 text-slate-200"
          : "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      <Lock size={10} aria-hidden="true" />
      Privat
    </span>
  );
}

type SoalItem = {
  id: string;
  urutan: number;
  tipe: "PG" | "ESAI";
  teks: string;
  bobot: number;
  kunciEsai: string | null;
  pembahasan: string | null;
  opsi: Array<{ id: string; kode: string; teks: string; benar: boolean }>;
};

type PesertaMonitoring = {
  siswaId: string;
  nama: string;
  nisn: string;
  status: "BELUM_MULAI" | "SEDANG_MENGERJAKAN" | "SELESAI";
  dimulaiPada: string | null;
  dikumpulkanPada: string | null;
  terjawab: number;
  totalSoal: number;
  nilai: number | null;
  tabViolations: number;
};

type CbtPengaturan = {
  acakUrutanSoal: boolean;
  acakOpsiJawaban: boolean;
  tampilkanNilaiLangsung: boolean;
  batasToleransiKeluarTab: number;
  kkmDefault: number;
  wajibToken: boolean;
};

function panelCls(isDark: boolean) {
  return isDark
    ? "border border-slate-700/60 bg-slate-900/75 text-slate-100"
    : "border border-white/85 bg-white/92 text-slate-900 shadow-xs";
}

function fieldCls(isDark: boolean) {
  return isDark
    ? "mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/75 px-3.5 py-2.5 text-sm text-white"
    : "glass-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm text-slate-900";
}

function sandboxHeaders(sandboxRole?: "GURU" | "SISWA", extra?: Record<string, string>): Record<string, string> | undefined {
  if (!sandboxRole && !extra) return undefined;
  return {
    ...(extra ?? {}),
    ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
  };
}

function useCbtOverview(sandboxRole?: "GURU" | "SISWA") {
  const [ujianList, setUjianList] = useState<UjianItem[]>([]);
  const [kelasList, setKelasList] = useState<Array<{ id: string; nama: string }>>([]);
  const [mapelList, setMapelList] = useState<Array<{ id: string; nama: string; kkm: number }>>([]);
  const [guruList, setGuruList] = useState<Array<{ id: string; nama: string }>>([]);
  const [pengaturan, setPengaturan] = useState<CbtPengaturan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const headers = sandboxHeaders(sandboxRole);
      const res = await fetchWithTimeout("/api/sekolah/cbt/ujian", { signal, ...(headers ? { headers } : {}) });
      const body = (await res.json()) as {
        ujian?: UjianItem[];
        kelas?: Array<{ id: string; nama: string }>;
        mapel?: Array<{ id: string; nama: string; kkm: number }>;
        guru?: Array<{ id: string; nama: string }>;
        pengaturan?: CbtPengaturan;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Gagal memuat data CBT.");
      setUjianList(body.ujian ?? []);
      setKelasList(body.kelas ?? []);
      setMapelList(body.mapel ?? []);
      setGuruList(body.guru ?? []);
      if (body.pengaturan) setPengaturan(body.pengaturan);
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Data CBT belum dapat dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [sandboxRole]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return { ujianList, kelasList, mapelList, guruList, pengaturan, loading, error, setError, reload };
}

// ==========================================
// 1B. BANK SOAL UMUM (GAYA E-UJIAN)
// ==========================================
function CbtPublicBanksPanel({
  kelasList,
  sandboxRole,
  onCloned,
}: {
  kelasList: Array<{ id: string; nama: string }>;
  sandboxRole?: "GURU" | "SISWA";
  onCloned?: (createdId?: string) => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const [banks, setBanks] = useState<PublicBankItem[]>([]);
  const [mapelOptions, setMapelOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewData, setPreviewData] = useState<PublicBankPreviewPayload | null>(null);

  const [jenjangFilter, setJenjangFilter] = useState<PublicBankJenjang>("ALL");
  const [mapelFilter, setMapelFilter] = useState("");
  const [kategoriFilter, setKategoriFilter] = useState<PublicBankKategori>("ALL");
  const [search, setSearch] = useState("");
  const [targetKelasId, setTargetKelasId] = useState("");

  const loadPublicBanks = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (jenjangFilter !== "ALL") params.set("jenjang", jenjangFilter);
      if (mapelFilter) params.set("mapel", mapelFilter);
      if (kategoriFilter !== "ALL") params.set("kategori", kategoriFilter);
      if (search.trim()) params.set("q", search.trim());
      const query = params.toString();
      const headers = sandboxHeaders(sandboxRole);
      const res = await fetchWithTimeout(`/api/cbt/public-banks${query ? `?${query}` : ""}`, {
        signal,
        ...(headers ? { headers } : {}),
      });
      const body = (await res.json().catch(() => null)) as {
        banks?: PublicBankItem[];
        mataPelajaranList?: string[];
        error?: string;
      } | null;
      if (!res.ok) throw new Error(body?.error || "Katalog Bank Soal Umum belum dapat dimuat.");
      setBanks(body?.banks ?? []);
      if (Array.isArray(body?.mataPelajaranList)) setMapelOptions(body.mataPelajaranList);
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Katalog Bank Soal Umum belum dapat dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [jenjangFilter, mapelFilter, kategoriFilter, search, sandboxRole]);

  useEffect(() => {
    const controller = new AbortController();
    void loadPublicBanks(controller.signal);
    return () => controller.abort();
  }, [loadPublicBanks]);

  async function handleOpenPreview(bank: PublicBankItem) {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewData(null);
    try {
      const headers = sandboxHeaders(sandboxRole);
      const res = await fetchWithTimeout(`/api/cbt/public-banks/${encodeURIComponent(bank.id)}/preview`, {
        ...(headers ? { headers } : {}),
      });
      const body = (await res.json().catch(() => null)) as PublicBankPreviewPayload | null;
      if (!res.ok || !body?.bank) {
        await loadPublicBanks();
        throw new Error(body?.error || "Bank soal ini sudah diarsipkan atau tidak tersedia untuk publik");
      }
      setPreviewData(body);
    } catch (failure) {
      setPreviewError(describeFetchError(failure, "Pratinjau soal belum dapat dimuat."));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleImportBank(bankId: string, bankJudul: string) {
    setImportingId(bankId);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(`/api/cbt/public-banks/${encodeURIComponent(bankId)}/import`, {
        method: "POST",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...(targetKelasId ? { kelasId: targetKelasId } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        ujian?: UjianItem;
        message?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        await loadPublicBanks();
        throw new Error(body?.error || "Bank soal ini sudah diarsipkan atau tidak tersedia untuk publik");
      }
      setPreviewOpen(false);
      setNotice(body?.message || `Bank soal "${bankJudul}" berhasil diambil ke Bank Soal Sekolah Anda (Privat).`);
      onCloned?.(body?.ujian?.id);
    } catch (failure) {
      setError(describeFetchError(failure, "Bank soal umum belum dapat diambil."));
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className={`space-y-4 rounded-2xl p-5 ${panelCls(isDark)}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold">
              <Globe size={18} className="text-emerald-600" aria-hidden="true" />
              Bank Soal Umum (Lintas PKBM &amp; Pustaka Pusat)
            </h3>
            <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Telusuri paket soal siap pakai berstatus <strong>Publik</strong>, lihat pratinjau butir soal sebelum mengambil, lalu salin ke <strong>Bank Soal Sekolah</strong> Anda (otomatis berstatus Privat dan bebas diedit).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPublicBanks()}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
              isDark
                ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            Muat Ulang
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-xs font-bold">
            Jenjang Paket
            <select
              value={jenjangFilter}
              onChange={(e) => setJenjangFilter(e.target.value as PublicBankJenjang)}
              className={fieldCls(isDark)}
            >
              <option value="ALL">Semua Jenjang</option>
              <option value="PAKET_A">Paket A (SD)</option>
              <option value="PAKET_B">Paket B (SMP)</option>
              <option value="PAKET_C">Paket C (SMA)</option>
            </select>
          </label>
          <label className="block text-xs font-bold">
            Mata Pelajaran
            <select
              value={mapelFilter}
              onChange={(e) => setMapelFilter(e.target.value)}
              className={fieldCls(isDark)}
            >
              <option value="">Semua Mata Pelajaran</option>
              {mapelOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold">
            Kategori Ujian
            <select
              value={kategoriFilter}
              onChange={(e) => setKategoriFilter(e.target.value as PublicBankKategori)}
              className={fieldCls(isDark)}
            >
              <option value="ALL">Semua Kategori</option>
              <option value="LATIHAN">Latihan</option>
              <option value="UTS">UTS</option>
              <option value="UAS">UAS</option>
              <option value="UJIAN_AKHIR">Ujian Akhir</option>
            </select>
          </label>
          <label className="block text-xs font-bold">
            Cari Judul / PKBM
            <div className="relative mt-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari soal atau PKBM..."
                className={`${fieldCls(isDark).replace("mt-1 ", "")} pl-9`}
              />
            </div>
          </label>
          <label className="block text-xs font-bold">
            Kelas Tujuan Salinan
            <select
              value={targetKelasId}
              onChange={(e) => setTargetKelasId(e.target.value)}
              className={fieldCls(isDark)}
            >
              <option value="">Otomatis sesuaikan jenjang</option>
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>{k.nama}</option>
              ))}
            </select>
          </label>
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

      {loading ? (
        <CardGridSkeleton count={3} columns={3} />
      ) : banks.length === 0 ? (
        <EmptyState
          title="Belum ada paket pada Bank Soal Umum"
          description="Ubah filter jenjang/mapel/kategori di atas, atau bagikan paket Bank Soal Sekolah Anda ke Bank Soal Umum."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {banks.map((bank) => {
            const busyImport = importingId === bank.id;
            const originLabel = bank.originSchoolName || bank.sourceSchoolName || "PKBM Kontributor";
            return (
              <article
                key={bank.id}
                className={`flex flex-col justify-between gap-4 rounded-2xl p-5 transition ${panelCls(isDark)}`}
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-extrabold ${
                        bank.jenjang === "PAKET_A"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : bank.jenjang === "PAKET_B"
                            ? "border-sky-200 bg-sky-50 text-sky-800"
                            : "border-indigo-200 bg-indigo-50 text-indigo-800"
                      }`}
                    >
                      {publicJenjangLabel(bank.jenjang)}
                    </span>
                    <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                      {publicKategoriLabel(bank.kategori)}
                    </span>
                    <VisibilityBadge visibility="PUBLIC" isDark={isDark} />
                    {bank.isMaster && (
                      <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-extrabold text-violet-800">
                        Pusat
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-bold text-sky-600">{bank.mataPelajaran}</p>
                    <h4 className="mt-0.5 text-sm font-extrabold leading-snug">{bank.judul}</h4>
                    <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      Kelas acuan: {bank.kelasAsal}
                    </p>
                  </div>

                  <div className={`space-y-1.5 rounded-xl p-3 text-xs ${isDark ? "bg-slate-950/60" : "bg-slate-50"}`}>
                    <p className="font-bold tabular-nums">
                      {bank.jumlahSoal} Butir Soal · Durasi {bank.durasiMenit} Menit · KKM {bank.kkm}
                    </p>
                    <p className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      <Building2 size={13} className="shrink-0 text-emerald-600" aria-hidden="true" />
                      <span className="truncate font-semibold">{originLabel}</span>
                    </p>
                    <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Kontributor: {bank.pembuatNama}
                      {bank.isOwnSchool ? " (Lembaga Anda)" : ""}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={importingId !== null}
                    onClick={() => void handleOpenPreview(bank)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition disabled:opacity-50 ${
                      isDark
                        ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                        : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <Eye size={14} aria-hidden="true" />
                    Pratinjau Soal
                  </button>
                  <button
                    type="button"
                    disabled={importingId !== null}
                    onClick={() => void handleImportBank(bank.id, bank.judul)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
                  >
                    <Copy size={14} aria-hidden="true" />
                    {busyImport ? "Mengambil..." : "Ambil ke Bank Soal Sekolah"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal Pratinjau Soal (Baca-Saja) */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div
            className={`flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900"
            }`}
          >
            <div className={`flex items-start justify-between gap-3 border-b p-5 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600">
                  PRATINJAU BANK SOAL UMUM (BACA-SAJA)
                </p>
                <h3 className="mt-1 text-lg font-extrabold">
                  {previewData ? previewData.bank.judul : "Memuat pratinjau soal..."}
                </h3>
                {previewData && (
                  <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    {publicJenjangLabel(previewData.bank.jenjang)} · {previewData.bank.mataPelajaran} ·{" "}
                    {publicKategoriLabel(previewData.bank.kategori)} · {previewData.bank.jumlahSoal} soal · Kontributor:{" "}
                    <strong>{previewData.bank.originSchoolName}</strong>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Tutup pratinjau"
                className={`rounded-xl p-1.5 ${isDark ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"}`}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {previewLoading ? (
                <CardGridSkeleton count={2} columns={2} />
              ) : previewError ? (
                <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                  {previewError}
                </p>
              ) : !previewData || previewData.soal.length === 0 ? (
                <p className={`py-8 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Paket soal ini belum memiliki butir soal.
                </p>
              ) : (
                previewData.soal.map((s) => (
                  <div
                    key={s.id}
                    className={`rounded-xl border p-4 text-xs ${
                      isDark ? "border-slate-800 bg-slate-950/60" : "border-slate-200 bg-slate-50/80"
                    }`}
                  >
                    <p className="text-sm font-bold leading-relaxed">
                      {s.urutan}. [{s.tipe}] {s.teks}{" "}
                      <span className="text-xs font-semibold text-sky-600">(Bobot {s.bobot})</span>
                    </p>
                    {s.tipe === "PG" ? (
                      <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                        {s.opsi.map((o) => (
                          <li
                            key={o.kode}
                            className={`rounded-lg border px-2.5 py-1.5 ${
                              o.benar
                                ? isDark
                                  ? "border-emerald-500/40 bg-emerald-500/15 font-bold text-emerald-200"
                                  : "border-emerald-300 bg-emerald-50 font-bold text-emerald-800"
                                : isDark
                                  ? "border-slate-800 bg-slate-900 text-slate-300"
                                  : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            <span className="mr-1.5 font-extrabold">{o.kode}.</span>
                            {o.teks} {o.benar ? "✓" : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      s.kunciEsai && (
                        <p className="mt-2 font-semibold text-emerald-700">Pedoman Esai: {s.kunciEsai}</p>
                      )
                    )}
                    {s.pembahasan && (
                      <p className={`mt-2 text-[11px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        Pembahasan: {s.pembahasan}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className={`flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4 ${isDark ? "border-slate-800 bg-slate-950/60" : "border-slate-200 bg-slate-50"}`}>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className={`rounded-xl border px-4 py-2 text-xs font-bold ${
                  isDark ? "border-slate-700 bg-slate-800 text-slate-200" : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                Tutup
              </button>
              {previewData && (
                <button
                  type="button"
                  disabled={importingId !== null}
                  onClick={() => void handleImportBank(previewData.bank.id, previewData.bank.judul)}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
                >
                  <Copy size={14} aria-hidden="true" />
                  {importingId === previewData.bank.id ? "Mengambil..." : "Ambil ke Bank Soal Sekolah"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CbtPublicBanksView({
  sandboxRole,
  onCloned,
}: {
  sandboxRole?: "GURU" | "SISWA";
  onCloned?: (createdId?: string) => void;
} = {}) {
  const { kelasList } = useCbtOverview(sandboxRole);
  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="Ujian Online (CBT) · Bank Soal Umum"
        title="Bank Soal Umum"
        description="Telusuri bank soal siap pakai lintas PKBM & Pustaka Pusat berdasarkan jenjang Paket A/B/C, mata pelajaran, dan kategori evaluasi, pratinjau soal, lalu ambil ke Bank Soal Sekolah Anda."
      />
      <CbtPublicBanksPanel kelasList={kelasList} sandboxRole={sandboxRole} onCloned={onCloned} />
    </section>
  );
}

// ==========================================
// 1. KELOLA BANK SOAL & UJIAN
// ==========================================
export function CbtBankSoalView({
  onOpenSettings,
  sandboxRole,
  initialSubTab = "sekolah",
}: {
  onOpenSettings?: () => void;
  sandboxRole?: "GURU" | "SISWA";
  initialSubTab?: "sekolah" | "publik";
} = {}) {
  const isDark = useTenantTheme() === "dark";
  const { ujianList, kelasList, mapelList, guruList, loading, error, setError, reload } = useCbtOverview(sandboxRole);
  const [bankSubTab, setBankSubTab] = useState<"sekolah" | "publik">(initialSubTab);
  const [selectedUjianId, setSelectedUjianId] = useState("");
  const [soalList, setSoalList] = useState<SoalItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [visibilityBusyId, setVisibilityBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | CbtCategory>("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<"ALL" | BankVisibility>("ALL");

  // Create exam form
  const [kategori, setKategori] = useState<CbtCategory>("UTS");
  const [judul, setJudul] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [mapelId, setMapelId] = useState("");
  const [guruId, setGuruId] = useState("");
  const [durasiMenit, setDurasiMenit] = useState(60);
  const [kkm, setKkm] = useState(75);
  const [createVisibility, setCreateVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");

  // Add question form
  const [tipe, setTipe] = useState<"PG" | "ESAI">("PG");
  const [teksSoal, setTeksSoal] = useState("");
  const [bobot, setBobot] = useState(10);
  const [opsiA, setOpsiA] = useState("");
  const [opsiB, setOpsiB] = useState("");
  const [opsiC, setOpsiC] = useState("");
  const [opsiD, setOpsiD] = useState("");
  const [opsiE, setOpsiE] = useState("");
  const [kunciPg, setKunciPg] = useState("A");
  const [kunciEsai, setKunciEsai] = useState("");
  const [pembahasan, setPembahasan] = useState("");

  useEffect(() => {
    if (kelasList[0] && !kelasId) setKelasId(kelasList[0].id);
    if (mapelList[0] && !mapelId) setMapelId(mapelList[0].id);
    if (guruList[0] && !guruId) setGuruId(guruList[0].id);
  }, [kelasList, mapelList, guruList, kelasId, mapelId, guruId]);

  useEffect(() => {
    if (ujianList.length > 0 && !ujianList.some((u) => u.id === selectedUjianId)) {
      setSelectedUjianId(ujianList[0].id);
    }
  }, [ujianList, selectedUjianId]);

  const loadQuestions = useCallback(async (ujianId: string) => {
    if (!ujianId) {
      setSoalList([]);
      return;
    }
    try {
      const headers = sandboxHeaders(sandboxRole);
      const res = await fetchWithTimeout(`/api/sekolah/cbt/ujian/${ujianId}/soal`, headers ? { headers } : undefined);
      const body = (await res.json()) as { soal?: SoalItem[] };
      if (res.ok) setSoalList(body.soal ?? []);
    } catch {
      // Ignore transient error
    }
  }, [sandboxRole]);

  useEffect(() => {
    if (selectedUjianId) void loadQuestions(selectedUjianId);
  }, [selectedUjianId, loadQuestions]);

  async function handleCreateUjian(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/cbt/ujian", {
        method: "POST",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({ kategori, judul, kelasId, mapelId, guruId, durasiMenit, kkm, visibility: createVisibility }),
      });
      const body = (await res.json()) as { ujian?: UjianItem; message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal membuat paket ujian.");
      setNotice(
        body.message ||
          (createVisibility === "PUBLIC"
            ? "Paket ujian dibuat dan dipublikasikan ke Pustaka Bank Soal Publik."
            : "Paket ujian dibuat sebagai Bank Soal Sekolah (Privat)."),
      );
      setJudul("");
      setCreateVisibility("PRIVATE");
      await reload();
      if (body.ujian?.id) setSelectedUjianId(body.ujian.id);
    } catch (failure) {
      setError(describeFetchError(failure, "Paket ujian belum dapat dibuat."));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeVisibility(id: string, nextVisibility: BankVisibility) {
    setVisibilityBusyId(id);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(`/api/cbt/banks/${encodeURIComponent(id)}/visibility`, {
        method: "PATCH",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({ visibility: nextVisibility }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Status visibilitas bank soal belum dapat diubah.");
      setNotice(body?.message || "Status visibilitas bank soal diperbarui.");
      await reload();
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal mengubah status visibilitas bank soal."));
    } finally {
      setVisibilityBusyId(null);
    }
  }

  async function handleDeleteUjian(id: string) {
    setBusy(true);
    try {
      const headers = sandboxHeaders(sandboxRole);
      const res = await fetchWithTimeout(`/api/sekolah/cbt/ujian/${id}`, { method: "DELETE", ...(headers ? { headers } : {}) });
      if (!res.ok) throw new Error("Gagal menghapus paket ujian.");
      setNotice("Paket ujian dihapus.");
      if (selectedUjianId === id) setSelectedUjianId("");
      await reload();
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal menghapus ujian."));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSoal(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedUjianId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const opsi = [
        { kode: "A", teks: opsiA, benar: kunciPg === "A" },
        { kode: "B", teks: opsiB, benar: kunciPg === "B" },
        { kode: "C", teks: opsiC, benar: kunciPg === "C" },
        { kode: "D", teks: opsiD, benar: kunciPg === "D" },
        { kode: "E", teks: opsiE, benar: kunciPg === "E" },
      ].filter((o) => o.teks.trim() !== "");

      const res = await fetchWithTimeout(`/api/sekolah/cbt/ujian/${selectedUjianId}/soal`, {
        method: "POST",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({ tipe, teks: teksSoal, bobot, opsi, kunciEsai, pembahasan }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menambah butir soal.");
      setNotice(body.message || "Butir soal ditambahkan.");
      setTeksSoal("");
      setOpsiA("");
      setOpsiB("");
      setOpsiC("");
      setOpsiD("");
      setOpsiE("");
      setKunciEsai("");
      setPembahasan("");
      await Promise.all([loadQuestions(selectedUjianId), reload()]);
    } catch (failure) {
      setError(describeFetchError(failure, "Butir soal belum dapat ditambahkan."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSoal(soalId: string) {
    if (!selectedUjianId) return;
    setBusy(true);
    try {
      const headers = sandboxHeaders(sandboxRole);
      await fetchWithTimeout(`/api/sekolah/cbt/ujian/${selectedUjianId}/soal/${soalId}`, { method: "DELETE", ...(headers ? { headers } : {}) });
      await Promise.all([loadQuestions(selectedUjianId), reload()]);
    } finally {
      setBusy(false);
    }
  }

  const filteredUjianList = ujianList.filter((u) => {
    if (categoryFilter !== "ALL" && detectCbtCategory(u.kode, u.judul) !== categoryFilter) return false;
    if (visibilityFilter !== "ALL" && normalizeVisibility(u.visibility) !== visibilityFilter) return false;
    return true;
  });
  const activeUjian = filteredUjianList.find((u) => u.id === selectedUjianId) ?? ujianList.find((u) => u.id === selectedUjianId) ?? null;

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="Ujian Online (CBT) · Paket Reguler+"
        title="Kelola Bank Soal & Paket Ujian"
        description="Susun dan impor paket soal untuk UTS, Asesmen Sumatif (AS/UAS), dan Ujian Akhir (UPK), atur visibilitas Privat/Publik/Arsip, serta salin bank soal siap pakai dari Pustaka Publik antar-PKBM."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setBankSubTab("sekolah");
                setShowImport((prev) => !prev);
              }}
              className="dashboard-hero-action whitespace-nowrap"
            >
              <UploadCloud size={15} aria-hidden="true" />
              {showImport ? "Tutup Panel Impor" : "Impor Soal & Tugas"}
            </button>
            {onOpenSettings && (
              <button type="button" onClick={onOpenSettings} className="dashboard-hero-action dashboard-hero-secondary whitespace-nowrap">
                <SlidersHorizontal size={15} aria-hidden="true" />
                Pengaturan Ujian
              </button>
            )}
          </div>
        }
      />

      {/* Tab Utama: Bank Soal Sekolah vs. Bank Soal Umum */}
      <div className={`flex flex-wrap items-center gap-2 rounded-2xl p-2 ${panelCls(isDark)}`}>
        <button
          type="button"
          aria-pressed={bankSubTab === "sekolah"}
          onClick={() => setBankSubTab("sekolah")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${
            bankSubTab === "sekolah"
              ? isDark
                ? "bg-amber-400 text-slate-950"
                : "bg-sky-700 text-white shadow-xs"
              : isDark
                ? "text-slate-300 hover:bg-slate-800"
                : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Lock size={14} aria-hidden="true" />
          Bank Soal Sekolah ({ujianList.length})
        </button>
        <button
          type="button"
          aria-pressed={bankSubTab === "publik"}
          onClick={() => setBankSubTab("publik")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${
            bankSubTab === "publik"
              ? isDark
                ? "bg-emerald-400 text-slate-950"
                : "bg-emerald-600 text-white shadow-xs"
              : isDark
                ? "text-slate-300 hover:bg-slate-800"
                : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Globe size={14} aria-hidden="true" />
          Bank Soal Umum
        </button>
      </div>

      {bankSubTab === "publik" ? (
        <CbtPublicBanksPanel
          kelasList={kelasList}
          sandboxRole={sandboxRole}
          onCloned={(createdId) => {
            void reload().then(() => {
              if (createdId) {
                setSelectedUjianId(createdId);
                setBankSubTab("sekolah");
                setNotice("Bank soal umum berhasil diambil ke Bank Soal Sekolah Anda dengan status Privat.");
              }
            });
          }}
        />
      ) : (
        <>
      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}

      {showImport && (
        <CbtImportPanel
          ujianList={ujianList}
          kelasList={kelasList}
          mapelList={mapelList}
          guruList={guruList}
          initialUjianId={selectedUjianId}
          sandboxRole={sandboxRole}
          onImported={(createdId) => {
            void reload().then(() => {
              const target = createdId || selectedUjianId;
              if (target) {
                setSelectedUjianId(target);
                void loadQuestions(target);
              }
            });
          }}
        />
      )}

      <form onSubmit={handleCreateUjian} className={`space-y-4 rounded-2xl p-5 ${panelCls(isDark)}`}>
        <h3 className="flex items-center gap-2 text-base font-bold">
          <Database size={18} className="text-sky-600" />
          Buat Paket Ujian Baru
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="block text-xs font-bold">
            Kategori Ujian
            <select value={kategori} onChange={(e) => setKategori(e.target.value as CbtCategory)} className={fieldCls(isDark)}>
              {CBT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold lg:col-span-2">
            Judul Paket Ujian
            <input required value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="Contoh: UTS / AS / Ujian Akhir Matematika" className={fieldCls(isDark)} />
          </label>
          <label className="block text-xs font-bold">
            Kelas Target
            <select required value={kelasId} onChange={(e) => setKelasId(e.target.value)} className={fieldCls(isDark)}>
              {kelasList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold">
            Mata Pelajaran
            <select required value={mapelId} onChange={(e) => setMapelId(e.target.value)} className={fieldCls(isDark)}>
              {mapelList.map((m) => <option key={m.id} value={m.id}>{m.nama}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold">
            Durasi (Menit)
            <input type="number" min={5} max={360} value={durasiMenit} onChange={(e) => setDurasiMenit(Number(e.target.value))} className={fieldCls(isDark)} />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
              createVisibility === "PRIVATE"
                ? isDark
                  ? "border-sky-400 bg-sky-500/15"
                  : "border-sky-500 bg-sky-50/80"
                : isDark
                  ? "border-slate-700 bg-slate-950/40"
                  : "border-slate-200 bg-white"
            }`}
          >
            <input
              type="radio"
              name="create-bank-visibility"
              value="PRIVATE"
              checked={createVisibility === "PRIVATE"}
              onChange={() => setCreateVisibility("PRIVATE")}
              className="mt-1 accent-sky-600"
            />
            <div>
              <p className="flex items-center gap-1.5 text-xs font-extrabold">
                <Lock size={13} className="text-sky-600" aria-hidden="true" />
                Simpan di Bank Soal Sekolah (Privat)
              </p>
              <p className={`mt-0.5 text-[11px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Hanya dapat diakses dan digunakan untuk internal lembaga ini.
              </p>
            </div>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
              createVisibility === "PUBLIC"
                ? isDark
                  ? "border-emerald-400 bg-emerald-500/15"
                  : "border-emerald-500 bg-emerald-50/80"
                : isDark
                  ? "border-slate-700 bg-slate-950/40"
                  : "border-slate-200 bg-white"
            }`}
          >
            <input
              type="radio"
              name="create-bank-visibility"
              value="PUBLIC"
              checked={createVisibility === "PUBLIC"}
              onChange={() => setCreateVisibility("PUBLIC")}
              className="mt-1 accent-emerald-600"
            />
            <div>
              <p className="flex items-center gap-1.5 text-xs font-extrabold">
                <Globe size={13} className="text-emerald-600" aria-hidden="true" />
                Bagikan ke Bank Soal Umum (Publik)
              </p>
              <p className={`mt-0.5 text-[11px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Dapat dipratinjau dan diambil oleh PKBM lain dengan atribusi lembaga Anda.
              </p>
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="block text-xs font-bold">
              Tutor Pembuat Soal
              <select value={guruId} onChange={(e) => setGuruId(e.target.value)} className={fieldCls(isDark)}>
                {guruList.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold">
              Nilai KKM
              <input type="number" min={0} max={100} value={kkm} onChange={(e) => setKkm(Number(e.target.value))} className={fieldCls(isDark)} />
            </label>
          </div>
          <button type="submit" disabled={busy || !kelasId || !mapelId || !guruId} className="master-primary gap-1.5 px-5 py-2.5 text-xs">
            <Plus size={15} />
            Buat Paket Ujian
          </button>
        </div>
      </form>

      {loading ? (
        <CardGridSkeleton count={2} columns={2} />
      ) : ujianList.length === 0 ? (
        <EmptyState title="Belum ada paket ujian CBT" description="Buat paket ujian pertama Anda atau klik Impor Soal & Tugas di atas untuk mengunggah soal UTS, AS, atau Ujian Akhir Kelas Akhir." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className={`space-y-3 rounded-2xl p-4 ${panelCls(isDark)}`}>
            <div className="space-y-2">
              <h4 className="text-sm font-bold">Daftar Paket Ujian ({filteredUjianList.length})</h4>
              <div className={`flex flex-wrap gap-1 rounded-xl p-1 ${isDark ? "bg-slate-950/70" : "bg-slate-100"}`}>
                {([
                  { id: "ALL" as const, label: "Semua" },
                  { id: "UTS" as const, label: "UTS" },
                  { id: "AS" as const, label: "AS / UAS" },
                  { id: "UJIAN_AKHIR" as const, label: "Ujian Akhir" },
                  { id: "TUGAS" as const, label: "Tugas" },
                ]).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={categoryFilter === tab.id}
                    onClick={() => setCategoryFilter(tab.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      categoryFilter === tab.id
                        ? isDark
                          ? "bg-amber-400 text-slate-950"
                          : "bg-white text-slate-900 shadow-xs"
                        : isDark
                          ? "text-slate-400 hover:text-white"
                          : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className={`flex flex-wrap gap-1 rounded-xl p-1 ${isDark ? "bg-slate-950/70" : "bg-slate-100"}`}>
                {([
                  { id: "ALL" as const, label: "Semua Status" },
                  { id: "PRIVATE" as const, label: "Privat" },
                  { id: "PUBLIC" as const, label: "Publik" },
                  { id: "ARCHIVED" as const, label: "Diarsipkan" },
                ]).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    aria-pressed={visibilityFilter === st.id}
                    onClick={() => setVisibilityFilter(st.id)}
                    className={`rounded-lg px-2 py-1 text-[10px] font-bold transition ${
                      visibilityFilter === st.id
                        ? isDark
                          ? "bg-sky-500 text-white"
                          : "bg-white text-slate-900 shadow-xs"
                        : isDark
                          ? "text-slate-400 hover:text-white"
                          : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {filteredUjianList.length === 0 ? (
                <p className={`py-4 text-center text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Belum ada paket pada filter ini.
                </p>
              ) : filteredUjianList.map((u) => {
                const selected = u.id === selectedUjianId;
                const cat = detectCbtCategory(u.kode, u.judul);
                const vis = normalizeVisibility(u.visibility);
                const visBusy = visibilityBusyId === u.id;
                return (
                  <div
                    key={u.id}
                    className={`rounded-xl border p-3 transition ${
                      selected
                        ? isDark
                          ? "border-amber-400 bg-amber-500/10"
                          : "border-sky-500 bg-sky-50"
                        : isDark
                          ? "border-slate-800 bg-slate-950/60"
                          : "border-slate-200 bg-slate-50/70"
                    }`}
                  >
                    <button type="button" onClick={() => setSelectedUjianId(u.id)} className="w-full text-left">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <p className="text-[11px] font-semibold text-sky-600">
                          {categoryBadgeLabel(cat)} · {u.kode} · {u.durasiMenit} Menit
                        </p>
                        <VisibilityBadge visibility={vis} isDark={isDark} />
                      </div>
                      <p className="mt-1 font-bold text-sm">{u.judul}</p>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        {u.mapel.nama} · {u.kelas.nama} · <strong>{u._count.soal} Soal</strong>
                      </p>
                      {(u.originSchoolName || u.sourceSchoolName) && (
                        <p className={`mt-1 flex items-center gap-1 text-[10px] font-semibold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                          <Building2 size={11} aria-hidden="true" />
                          Sumber: {u.originSchoolName || u.sourceSchoolName}
                        </p>
                      )}
                    </button>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-200/60 pt-2">
                      <div className="flex flex-wrap gap-1">
                        {vis !== "PUBLIC" && (
                          <button
                            type="button"
                            disabled={visBusy}
                            onClick={() => void handleChangeVisibility(u.id, "PUBLIC")}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <Globe size={11} aria-hidden="true" />
                            Bagikan ke Umum
                          </button>
                        )}
                        {vis !== "PRIVATE" && (
                          <button
                            type="button"
                            disabled={visBusy}
                            onClick={() => void handleChangeVisibility(u.id, "PRIVATE")}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                          >
                            <Lock size={11} aria-hidden="true" />
                            Jadikan Privat
                          </button>
                        )}
                        {vis !== "ARCHIVED" && (
                          <button
                            type="button"
                            disabled={visBusy}
                            onClick={() => void handleChangeVisibility(u.id, "ARCHIVED")}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                          >
                            <Archive size={11} aria-hidden="true" />
                            Arsipkan
                          </button>
                        )}
                      </div>
                      <button type="button" onClick={() => void handleDeleteUjian(u.id)} className="text-[11px] font-bold text-rose-600 hover:underline">
                        Hapus
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`space-y-5 rounded-2xl p-5 lg:col-span-2 ${panelCls(isDark)}`}>
            {activeUjian && (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/70 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold uppercase text-sky-600">Editor Butir Soal · {activeUjian.kode}</p>
                      <VisibilityBadge visibility={normalizeVisibility(activeUjian.visibility)} isDark={isDark} />
                    </div>
                    <h4 className="mt-1 text-lg font-bold">{activeUjian.judul}</h4>
                    {(activeUjian.originSchoolName || activeUjian.sourceSchoolName) && (
                      <p className={`mt-0.5 text-xs ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                        Diambil dari: {activeUjian.originSchoolName || activeUjian.sourceSchoolName} (bebas diedit untuk lembaga Anda)
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {normalizeVisibility(activeUjian.visibility) !== "PUBLIC" && (
                      <button
                        type="button"
                        disabled={visibilityBusyId === activeUjian.id}
                        onClick={() => void handleChangeVisibility(activeUjian.id, "PUBLIC")}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <Globe size={12} aria-hidden="true" />
                        Bagikan ke Umum
                      </button>
                    )}
                    {normalizeVisibility(activeUjian.visibility) !== "PRIVATE" && (
                      <button
                        type="button"
                        disabled={visibilityBusyId === activeUjian.id}
                        onClick={() => void handleChangeVisibility(activeUjian.id, "PRIVATE")}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                      >
                        <Lock size={12} aria-hidden="true" />
                        Jadikan Privat
                      </button>
                    )}
                    {normalizeVisibility(activeUjian.visibility) !== "ARCHIVED" && (
                      <button
                        type="button"
                        disabled={visibilityBusyId === activeUjian.id}
                        onClick={() => void handleChangeVisibility(activeUjian.id, "ARCHIVED")}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                      >
                        <Archive size={12} aria-hidden="true" />
                        Arsipkan
                      </button>
                    )}
                  </div>
                </div>

                <form onSubmit={handleAddSoal} className="space-y-3 rounded-xl border border-slate-200/70 p-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block text-xs font-bold">
                      Tipe Soal
                      <select value={tipe} onChange={(e) => setTipe(e.target.value as "PG" | "ESAI")} className={fieldCls(isDark)}>
                        <option value="PG">Pilihan Ganda (A–E)</option>
                        <option value="ESAI">Esai / Uraian</option>
                      </select>
                    </label>
                    <label className="block text-xs font-bold">
                      Bobot Skor
                      <input type="number" min={1} max={100} value={bobot} onChange={(e) => setBobot(Number(e.target.value))} className={fieldCls(isDark)} />
                    </label>
                    {tipe === "PG" && (
                      <label className="block text-xs font-bold">
                        Kunci Jawaban Benar
                        <select value={kunciPg} onChange={(e) => setKunciPg(e.target.value)} className={fieldCls(isDark)}>
                          <option value="A">Opsi A</option>
                          <option value="B">Opsi B</option>
                          <option value="C">Opsi C</option>
                          <option value="D">Opsi D</option>
                          <option value="E">Opsi E</option>
                        </select>
                      </label>
                    )}
                  </div>

                  <label className="block text-xs font-bold">
                    Pertanyaan
                    <textarea required rows={2} value={teksSoal} onChange={(e) => setTeksSoal(e.target.value)} placeholder="Tuliskan teks pertanyaan di sini..." className={fieldCls(isDark)} />
                  </label>

                  {tipe === "PG" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input required placeholder="Opsi A" value={opsiA} onChange={(e) => setOpsiA(e.target.value)} className={fieldCls(isDark)} />
                      <input required placeholder="Opsi B" value={opsiB} onChange={(e) => setOpsiB(e.target.value)} className={fieldCls(isDark)} />
                      <input placeholder="Opsi C (opsional)" value={opsiC} onChange={(e) => setOpsiC(e.target.value)} className={fieldCls(isDark)} />
                      <input placeholder="Opsi D (opsional)" value={opsiD} onChange={(e) => setOpsiD(e.target.value)} className={fieldCls(isDark)} />
                      <input placeholder="Opsi E (opsional)" value={opsiE} onChange={(e) => setOpsiE(e.target.value)} className={fieldCls(isDark)} />
                    </div>
                  ) : (
                    <label className="block text-xs font-bold">
                      Pedoman / Kunci Jawaban Esai
                      <textarea rows={2} value={kunciEsai} onChange={(e) => setKunciEsai(e.target.value)} className={fieldCls(isDark)} />
                    </label>
                  )}

                  <div className="flex justify-end">
                    <button type="submit" disabled={busy} className="master-primary px-4 py-2 text-xs">
                      + Tambah Butir Soal
                    </button>
                  </div>
                </form>

                <div className="space-y-3">
                  <h5 className="text-sm font-bold">Daftar Soal ({soalList.length})</h5>
                  {soalList.map((s) => (
                    <div key={s.id} className={`rounded-xl border p-4 text-xs ${isDark ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50/70"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-sm">
                          {s.urutan}. [{s.tipe}] {s.teks} <span className="text-xs font-semibold text-sky-600">(Bobot {s.bobot})</span>
                        </p>
                        <button type="button" onClick={() => void handleDeleteSoal(s.id)} className="text-rose-600 hover:underline">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {s.tipe === "PG" ? (
                        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                          {s.opsi.map((o) => (
                            <li key={o.id} className={o.benar ? "font-bold text-emerald-600" : ""}>
                              {o.kode}. {o.teks} {o.benar ? "✓" : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        s.kunciEsai && <p className="mt-2 italic text-emerald-700">Kunci: {s.kunciEsai}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
        </>
      )}
    </section>
  );
}

// ==========================================
// 2. JADWAL UJIAN CBT & TOKEN 6 KARAKTER
// ==========================================
export function CbtJadwalView({ onOpenSettings, sandboxRole }: { onOpenSettings?: () => void; sandboxRole?: "GURU" | "SISWA" } = {}) {
  const isDark = useTenantTheme() === "dark";
  const { ujianList, kelasList, loading, error, setError, reload } = useCbtOverview(sandboxRole);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kelasId, setKelasId] = useState("");
  const [mulai, setMulai] = useState("");
  const [selesai, setSelesai] = useState("");
  const [dipublikasikan, setDipublikasikan] = useState(true);

  function startEdit(u: UjianItem) {
    setEditingId(u.id);
    setKelasId(u.kelas.id);
    setMulai(new Date(u.mulai).toISOString().slice(0, 16));
    setSelesai(new Date(u.selesai).toISOString().slice(0, 16));
    setDipublikasikan(u.dipublikasikan);
  }

  async function saveSchedule(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/cbt/ujian/${editingId}`, {
        method: "PATCH",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          kelasId,
          mulai: new Date(mulai).toISOString(),
          selesai: new Date(selesai).toISOString(),
          dipublikasikan,
        }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal memperbarui jadwal.");
      setNotice(body.message || "Jadwal diperbarui.");
      setEditingId(null);
      await reload();
    } catch (failure) {
      setError(describeFetchError(failure, "Jadwal ujian belum dapat disimpan."));
    } finally {
      setBusy(false);
    }
  }

  async function rotateToken(id: string) {
    setBusy(true);
    setNotice("");
    try {
      const headers = sandboxHeaders(sandboxRole);
      const res = await fetchWithTimeout(`/api/sekolah/cbt/ujian/${id}/token`, { method: "POST", ...(headers ? { headers } : {}) });
      const body = (await res.json()) as { tokenKode?: string; message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal mengganti token.");
      setNotice(`Token baru aktif: ${body.tokenKode}`);
      await reload();
    } catch (failure) {
      setError(describeFetchError(failure, "Token belum dapat digenerasi."));
    } finally {
      setBusy(false);
    }
  }

  function copyToken(token: string) {
    navigator.clipboard?.writeText(token);
    setNotice(`Token ${token} disalin ke papan klip.`);
  }

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="Ujian Online (CBT) · Paket Reguler+"
        title="Jadwal Sesi Ujian & Token Akses"
        description="Atur kelas target, rentang tanggal dan jam pelaksanaan sesi CBT, publikasi ujian, serta generate Token Ujian 6 karakter otomatis untuk peserta."
        action={
          onOpenSettings ? (
            <button type="button" onClick={onOpenSettings} className="dashboard-hero-action dashboard-hero-secondary">
              <SlidersHorizontal size={15} aria-hidden="true" />
              Pengaturan Ujian
            </button>
          ) : undefined
        }
      />

      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}

      {editingId && (
        <form onSubmit={saveSchedule} className={`space-y-4 rounded-2xl p-5 ${panelCls(isDark)}`}>
          <h3 className="flex items-center gap-2 text-base font-bold">
            <CalendarDays size={18} className="text-sky-600" />
            Atur Ulang Jadwal Sesi CBT
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-bold">
              Kelas Target
              <select value={kelasId} onChange={(e) => setKelasId(e.target.value)} className={fieldCls(isDark)}>
                {kelasList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold">
              Waktu Mulai
              <input type="datetime-local" required value={mulai} onChange={(e) => setMulai(e.target.value)} className={fieldCls(isDark)} />
            </label>
            <label className="block text-xs font-bold">
              Waktu Selesai
              <input type="datetime-local" required value={selesai} onChange={(e) => setSelesai(e.target.value)} className={fieldCls(isDark)} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={dipublikasikan} onChange={(e) => setDipublikasikan(e.target.checked)} />
            Publikasikan sesi ujian ini ke portal warga belajar
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingId(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold">
              Batal
            </button>
            <button type="submit" disabled={busy} className="master-primary px-5 py-2.5 text-xs">
              Simpan Jadwal Ujian
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <CardGridSkeleton count={3} columns={3} />
      ) : ujianList.length === 0 ? (
        <EmptyState title="Belum ada jadwal ujian CBT" description="Buat paket ujian pada menu Kelola Bank Soal & Ujian terlebih dahulu." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ujianList.map((u) => (
            <div key={u.id} className={`flex flex-col justify-between gap-4 rounded-2xl p-5 ${panelCls(isDark)}`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase text-sky-600">{u.kode} · {u.mapel.nama}</span>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${u.dipublikasikan ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
                    {u.dipublikasikan ? "DIPUBLIKASIKAN" : "DRAF"}
                  </span>
                </div>
                <h4 className="mt-1 text-base font-bold">{u.judul}</h4>
                <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Kelas Target: <strong>{u.kelas.nama}</strong> · Durasi: {u.durasiMenit} menit · {u._count.soal} Butir Soal
                </p>
                <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Jadwal: {new Date(u.mulai).toLocaleString("id-ID")} s/d {new Date(u.selesai).toLocaleString("id-ID")}
                </p>
              </div>

              <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${isDark ? "border-slate-800 bg-slate-950/60" : "border-sky-200 bg-sky-50/70"}`}>
                <div>
                  <p className="text-[10px] font-bold uppercase text-sky-700">Token Masuk Peserta</p>
                  <p className="font-mono text-lg font-black tracking-widest">{u.tokenKode || "------"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {u.tokenKode && (
                    <button type="button" onClick={() => copyToken(u.tokenKode!)} className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-bold text-sky-900">
                      <Copy size={12} /> Salin
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => void rotateToken(u.id)} className="inline-flex items-center gap-1 rounded-lg bg-sky-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-sky-800">
                    <KeyRound size={12} /> Token Baru
                  </button>
                  <button type="button" onClick={() => startEdit(u)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800">
                    Ubah Jadwal
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ==========================================
// 3. MONITORING UJIAN LIVE
// ==========================================
export function CbtMonitoringView({ sandboxRole }: { sandboxRole?: "GURU" | "SISWA" } = {}) {
  const isDark = useTenantTheme() === "dark";
  const { ujianList, loading, error, setError } = useCbtOverview(sandboxRole);
  const [selectedId, setSelectedId] = useState("");
  const [peserta, setPeserta] = useState<PesertaMonitoring[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (ujianList.length > 0 && !selectedId) setSelectedId(ujianList[0].id);
  }, [ujianList, selectedId]);

  const loadMonitoring = useCallback(async (ujianId: string) => {
    if (!ujianId) return;
    try {
      const headers = sandboxHeaders(sandboxRole);
      const res = await fetchWithTimeout(`/api/sekolah/cbt/ujian/${ujianId}/monitoring`, headers ? { headers } : undefined);
      const body = (await res.json()) as { peserta?: PesertaMonitoring[]; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal memuat monitoring.");
      setPeserta(body.peserta ?? []);
    } catch (failure) {
      setError(describeFetchError(failure, "Data monitoring belum dapat dimuat."));
    }
  }, [setError, sandboxRole]);

  useEffect(() => {
    if (selectedId) void loadMonitoring(selectedId);
  }, [selectedId, loadMonitoring]);

  async function resetPeserta(siswaId: string) {
    if (!selectedId) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/cbt/ujian/${selectedId}/reset-peserta`, {
        method: "POST",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({ siswaId }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal mereset sesi.");
      setNotice(body.message || "Sesi peserta direset.");
      await loadMonitoring(selectedId);
    } catch (failure) {
      setError(describeFetchError(failure, "Sesi peserta belum dapat direset."));
    } finally {
      setBusy(false);
    }
  }

  const belumMulai = peserta.filter((p) => p.status === "BELUM_MULAI").length;
  const mengerjakan = peserta.filter((p) => p.status === "SEDANG_MENGERJAKAN").length;
  const selesai = peserta.filter((p) => p.status === "SELESAI").length;

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="Pengawas CBT · Paket Reguler+"
        title="Monitoring Ujian Live"
        description="Pantau status peserta secara langsung per sesi ujian (Belum Mulai, Sedang Mengerjakan, Selesai, skor otomatis PG) serta reset sesi peserta bila terkendala jaringan."
        action={
          <button type="button" onClick={() => selectedId && void loadMonitoring(selectedId)} className="dashboard-hero-action">
            <RefreshCw size={15} />
            Segarkan Status
          </button>
        }
      />

      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}

      <div className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4 ${panelCls(isDark)}`}>
        <label className="block flex-1 text-xs font-bold">
          Pilih Sesi Ujian yang Dipantau
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={fieldCls(isDark)}>
            {ujianList.map((u) => <option key={u.id} value={u.id}>{u.judul} — {u.kelas.nama} (Token: {u.tokenKode || "-"})</option>)}
          </select>
        </label>
        <div className="flex gap-3 text-xs font-bold">
          <span className="rounded-xl bg-slate-200 px-3 py-2 text-slate-800">Belum Mulai: {belumMulai}</span>
          <span className="rounded-xl bg-amber-100 px-3 py-2 text-amber-900">Mengerjakan: {mengerjakan}</span>
          <span className="rounded-xl bg-emerald-100 px-3 py-2 text-emerald-900">Selesai: {selesai}</span>
        </div>
      </div>

      {loading ? (
        <CardGridSkeleton count={3} columns={3} />
      ) : peserta.length === 0 ? (
        <EmptyState title="Belum ada peserta terdaftar pada sesi ujian ini" description="Pastikan kelas target ujian memiliki warga belajar aktif." />
      ) : (
        <div className={`overflow-x-auto rounded-2xl ${panelCls(isDark)}`}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={`border-b text-xs font-bold uppercase ${isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600"}`}>
                <th className="px-4 py-3">Warga Belajar</th>
                <th className="px-4 py-3">Status Sesi</th>
                <th className="px-4 py-3 text-center">Terjawab</th>
                <th className="px-4 py-3 text-center">Nilai PG</th>
                <th className="px-4 py-3 text-center">Keluar Tab</th>
                <th className="px-4 py-3 text-right">Aksi Pengawas</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200/70"}`}>
              {peserta.map((p) => (
                <tr key={p.siswaId}>
                  <td className="px-4 py-3">
                    <p className="font-bold">{p.nama}</p>
                    <p className="font-mono text-xs text-slate-500">NISN: {p.nisn}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-extrabold ${
                      p.status === "SELESAI"
                        ? "bg-emerald-100 text-emerald-900"
                        : p.status === "SEDANG_MENGERJAKAN"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-slate-200 text-slate-700"
                    }`}>
                      {p.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold">{p.terjawab} / {p.totalSoal}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-black text-sky-700">{p.nilai !== null ? p.nilai : "-"}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{p.tabViolations}x</td>
                  <td className="px-4 py-3 text-right">
                    {p.status !== "BELUM_MULAI" && (
                      <button type="button" disabled={busy} onClick={() => void resetPeserta(p.siswaId)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">
                        <RotateCcw size={12} /> Reset Sesi
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ==========================================
// 4. PENGATURAN ATURAN CBT
// ==========================================
export function CbtPengaturanView() {
  const isDark = useTenantTheme() === "dark";
  const [form, setForm] = useState<CbtPengaturan>({
    acakUrutanSoal: true,
    acakOpsiJawaban: true,
    tampilkanNilaiLangsung: true,
    batasToleransiKeluarTab: 3,
    kkmDefault: 75,
    wajibToken: true,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchWithTimeout("/api/sekolah/cbt/pengaturan", { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as { pengaturan?: CbtPengaturan; error?: string };
        if (!res.ok) throw new Error(body.error || "Gagal memuat pengaturan CBT.");
        if (body.pengaturan) setForm(body.pengaturan);
      })
      .catch((failure) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setError(describeFetchError(failure, "Pengaturan CBT belum dapat dimuat."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/cbt/pengaturan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await res.json()) as { pengaturan?: CbtPengaturan; message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menyimpan pengaturan.");
      if (body.pengaturan) setForm(body.pengaturan);
      setNotice(body.message || "Pengaturan aturan CBT disimpan.");
    } catch (failure) {
      setError(describeFetchError(failure, "Pengaturan belum dapat disimpan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="Konfigurasi Evaluasi · Paket Reguler+"
        title="Pengaturan Ujian CBT Lembaga"
        description="Tetapkan aturan baku pelaksanaan ujian online lembaga: pengacakan soal & jawaban, tampilan skor pasca-ujian, token sesi, dan toleransi keluar tab."
      />

      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}

      {loading ? (
        <CardGridSkeleton count={2} columns={2} />
      ) : (
        <form onSubmit={handleSave} className={`mx-auto max-w-3xl space-y-4 rounded-2xl p-6 ${panelCls(isDark)}`}>
          <h3 className="flex items-center gap-2 text-base font-bold">
            <SlidersHorizontal size={18} className="text-sky-600" />
            Aturan Pelaksanaan &amp; Keamanan Ujian
          </h3>

          <div className="space-y-3 text-sm">
            {[
              { key: "acakUrutanSoal", label: "Acak Urutan Soal Otomatis", desc: "Setiap peserta menerima urutan butir soal berbeda saat ujian dimulai." },
              { key: "acakOpsiJawaban", label: "Acak Pilihan Jawaban (A–E)", desc: "Posisi opsi jawaban diacak otomatis untuk meminimalkan kecurangan." },
              { key: "tampilkanNilaiLangsung", label: "Tampilkan Nilai Langsung Setelah Selesai", desc: "Peserta langsung melihat skor Pilihan Ganda setelah menekan Kumpulkan." },
              { key: "wajibToken", label: "Wajib Token Sesi 6 Karakter", desc: "Peserta wajib memasukkan Token Ujian dari pengawas sebelum mengakses soal." },
            ].map((toggle) => {
              const k = toggle.key as "acakUrutanSoal" | "acakOpsiJawaban" | "tampilkanNilaiLangsung" | "wajibToken";
              return (
                <label key={k} className={`flex items-start justify-between gap-4 rounded-xl border p-4 cursor-pointer ${isDark ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50/70"}`}>
                  <div>
                    <p className="font-bold">{toggle.label}</p>
                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>{toggle.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form[k]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [k]: e.target.checked }))}
                    className="mt-1 h-4 w-4 shrink-0"
                  />
                </label>
              );
            })}
          </div>

          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <label className="block text-xs font-bold">
              Batas Toleransi Keluar Tab Browser
              <input
                type="number"
                min={0}
                max={20}
                value={form.batasToleransiKeluarTab}
                onChange={(e) => setForm((p) => ({ ...p, batasToleransiKeluarTab: Number(e.target.value) }))}
                className={fieldCls(isDark)}
              />
              <span className={`mt-1 block text-[11px] font-normal ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Isi 0 untuk mengunci tanpa toleransi keluar tab.
              </span>
            </label>
            <label className="block text-xs font-bold">
              KKM Default Ujian CBT
              <input
                type="number"
                min={0}
                max={100}
                value={form.kkmDefault}
                onChange={(e) => setForm((p) => ({ ...p, kkmDefault: Number(e.target.value) }))}
                className={fieldCls(isDark)}
              />
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={busy} className="master-primary gap-1.5 px-5 py-2.5 text-xs">
              <Save size={15} />
              {busy ? "Menyimpan..." : "Simpan Pengaturan CBT"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// ==========================================
// 5. IMPOR SOAL & TUGAS (UTS / AS / UJIAN AKHIR)
// ==========================================
export function CbtImportView({ sandboxRole }: { sandboxRole?: "GURU" | "SISWA" } = {}) {
  const { ujianList, kelasList, mapelList, guruList, loading, error, reload } = useCbtOverview(sandboxRole);

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="Ujian Online (CBT) · Impor Massal"
        title="Impor Soal & Tugas (UTS, AS, Ujian Akhir Kelas Akhir)"
        description="Unggah bank soal Pilihan Ganda (A–E) atau Esai dari Excel/CSV/Word serta impor daftar tugas evaluasi untuk UTS, Asesmen Sumatif (AS/UAS), maupun Ujian Akhir Kelas Akhir (Kelas 6, 9, dan 12)."
      />

      {error && (
        <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </p>
      )}

      {loading ? (
        <CardGridSkeleton count={3} columns={3} />
      ) : (
        <CbtImportPanel
          ujianList={ujianList}
          kelasList={kelasList}
          mapelList={mapelList}
          guruList={guruList}
          sandboxRole={sandboxRole}
          onImported={() => void reload()}
        />
      )}
    </section>
  );
}

