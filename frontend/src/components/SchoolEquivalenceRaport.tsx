import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Layers,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react";
import { CardGridSkeleton, DashboardHero, EmptyState } from "./DashboardUI";
import { buildKopSuratProfile, KopSurat } from "./KopSurat";
import { QrCodeSvg } from "./QrCodeSvg";
import { RaportLegerPanel, RaportSixSemesterLegerPanel, RaportTranscriptPanel } from "./RaportLegerTranscript";
import { SchoolModal } from "./SchoolModal";
import type { SchoolProfile } from "./schoolProfile";
import { useTenantTheme } from "./TenantThemeProvider";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import {
  detectDefaultPaketCTrack,
  detectKesetaraanProgram,
  filterItemsByKesetaraanTrack,
  savePaketCTrackPreference,
  type PaketCTrack,
} from "../utils/kesetaraanSubjects";

// ==========================================
// SHARED TYPES
// ==========================================
type MapelOpt = { id: string; nama: string; kkm: number };
type KelasOpt = { id: string; nama: string; waliGuruId?: string | null };
type GuruOpt = { id: string; nama: string };
type TahunOpt = { id: string; nama: string; semester: string };

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

// ==========================================
// 1. MODUL KESETARAAN & SKK (BASIC+)
// ==========================================
type ModulKesetaraanRow = {
  id: string;
  mapelId: string | null;
  jenjang: "PAKET_A" | "PAKET_B" | "PAKET_C";
  tingkatan: string;
  kelompok: "UMUM" | "PEMBERDAYAAN" | "KETERAMPILAN";
  kodeModul: string;
  judulModul: string;
  skkTatapMuka: number;
  skkTutorial: number;
  skkMandiri: number;
  skkTotal: number;
  deskripsi: string | null;
};

const JENJANG_LABELS: Record<ModulKesetaraanRow["jenjang"], string> = {
  PAKET_A: "Paket A (Setara SD)",
  PAKET_B: "Paket B (Setara SMP)",
  PAKET_C: "Paket C (Setara SMA)",
};

const KELOMPOK_LABELS: Record<ModulKesetaraanRow["kelompok"], string> = {
  UMUM: "Kelompok Umum",
  PEMBERDAYAAN: "Pemberdayaan",
  KETERAMPILAN: "Keterampilan",
};

export function ModulKesetaraanView() {
  const isDark = useTenantTheme() === "dark";
  const [modules, setModules] = useState<ModulKesetaraanRow[]>([]);
  const [mapels, setMapels] = useState<MapelOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filterJenjang, setFilterJenjang] = useState<string>("ALL");
  const [filterKelompok, setFilterKelompok] = useState<string>("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ModulKesetaraanRow | null>(null);

  const [jenjang, setJenjang] = useState<ModulKesetaraanRow["jenjang"]>("PAKET_B");
  const [kelompok, setKelompok] = useState<ModulKesetaraanRow["kelompok"]>("UMUM");
  const [tingkatan, setTingkatan] = useState("Kelas 7-9");
  const [mapelId, setMapelId] = useState("");
  const [kodeModul, setKodeModul] = useState("");
  const [judulModul, setJudulModul] = useState("");
  const [skkTatapMuka, setSkkTatapMuka] = useState(2);
  const [skkTutorial, setSkkTutorial] = useState(1);
  const [skkMandiri, setSkkMandiri] = useState(1);
  const [deskripsi, setDeskripsi] = useState("");

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/sekolah/modul-kesetaraan", { signal });
      const body = (await res.json()) as { modules?: ModulKesetaraanRow[]; mapels?: MapelOpt[]; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal memuat modul kesetaraan.");
      setModules(body.modules ?? []);
      setMapels(body.mapels ?? []);
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Modul kesetaraan belum dapat dimuat."));
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

  function openCreate() {
    setEditing(null);
    setJenjang("PAKET_B");
    setKelompok("UMUM");
    setTingkatan("Kelas 7-9");
    setMapelId("");
    setKodeModul("");
    setJudulModul("");
    setSkkTatapMuka(2);
    setSkkTutorial(1);
    setSkkMandiri(1);
    setDeskripsi("");
    setModalOpen(true);
  }

  function openEdit(item: ModulKesetaraanRow) {
    setEditing(item);
    setJenjang(item.jenjang);
    setKelompok(item.kelompok);
    setTingkatan(item.tingkatan);
    setMapelId(item.mapelId ?? "");
    setKodeModul(item.kodeModul);
    setJudulModul(item.judulModul);
    setSkkTatapMuka(item.skkTatapMuka);
    setSkkTutorial(item.skkTutorial);
    setSkkMandiri(item.skkMandiri);
    setDeskripsi(item.deskripsi ?? "");
    setModalOpen(true);
  }

  async function seedCatalog() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/modul-kesetaraan/seed", { method: "POST" });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal memuat katalog standar.");
      setNotice(body.message || "Katalog standar dimuat.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Katalog standar belum dapat dimuat."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const url = editing ? `/api/sekolah/modul-kesetaraan/${editing.id}` : "/api/sekolah/modul-kesetaraan";
      const res = await fetchWithTimeout(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jenjang,
          kelompok,
          tingkatan,
          mapelId: mapelId || null,
          kodeModul,
          judulModul,
          skkTatapMuka,
          skkTutorial,
          skkMandiri,
          deskripsi,
        }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menyimpan modul.");
      setNotice(body.message || "Modul kesetaraan disimpan.");
      setModalOpen(false);
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Modul belum dapat disimpan."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/modul-kesetaraan/${id}`, { method: "DELETE" });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menghapus modul.");
      setNotice(body.message || "Modul dihapus.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Modul belum dapat dihapus."));
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(
    () =>
      modules.filter(
        (m) =>
          (filterJenjang === "ALL" || m.jenjang === filterJenjang) &&
          (filterKelompok === "ALL" || m.kelompok === filterKelompok),
      ),
    [modules, filterJenjang, filterKelompok],
  );

  const skkTotals = useMemo(
    () =>
      filtered.reduce(
        (acc, m) => ({
          tm: acc.tm + m.skkTatapMuka,
          tut: acc.tut + m.skkTutorial,
          man: acc.man + m.skkMandiri,
          total: acc.total + m.skkTotal,
        }),
        { tm: 0, tut: 0, man: 0, total: 0 },
      ),
    [filtered],
  );

  const mapelNames = useMemo(() => new Map(mapels.map((m) => [m.id, m.nama])), [mapels]);

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="Kurikulum Kesetaraan · Paket Basic+"
        title="Modul Kesetaraan & Bobot SKK"
        description="Kelola struktur kelompok mata pelajaran Umum, Pemberdayaan, dan Keterampilan beserta Satuan Kredit Kompetensi (SKK) untuk Paket A, B, dan C."
        action={
          <div className="flex flex-wrap gap-2">
            {modules.length === 0 && !loading && (
              <button type="button" disabled={busy} onClick={() => void seedCatalog()} className="dashboard-hero-secondary rounded-xl px-4 py-2.5 text-xs font-bold">
                <Sparkles size={15} className="inline mr-1.5" />
                Muat Katalog Standar
              </button>
            )}
            <button type="button" onClick={openCreate} className="dashboard-hero-action">
              <Plus size={16} aria-hidden="true" />
              Tambah Modul SKK
            </button>
          </div>
        }
      />

      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Modul Aktif", value: filtered.length, note: "Terfilter saat ini" },
          { label: "SKK Tatap Muka", value: skkTotals.tm, note: "Bobot pertemuan kelas" },
          { label: "SKK Tutorial", value: skkTotals.tut, note: "Pendampingan tutor" },
          { label: "Total Beban SKK", value: skkTotals.total, note: "Tatap muka + tutorial + mandiri" },
        ].map((card) => (
          <div key={card.label} className={`rounded-2xl p-4 ${panelClass(isDark)}`}>
            <p className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>{card.label}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{card.value}</p>
            <p className={`mt-1 text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>{card.note}</p>
          </div>
        ))}
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ${panelClass(isDark)}`}>
        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "PAKET_A", "PAKET_B", "PAKET_C"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterJenjang(key)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                filterJenjang === key
                  ? isDark
                    ? "bg-amber-400 text-slate-950"
                    : "bg-sky-700 text-white"
                  : isDark
                    ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    : "bg-slate-100 text-slate-700 hover:bg-sky-100"
              }`}
            >
              {key === "ALL" ? "Semua Jenjang" : JENJANG_LABELS[key]}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter kelompok kurikulum"
          value={filterKelompok}
          onChange={(e) => setFilterKelompok(e.target.value)}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold ${isDark ? "border border-slate-700 bg-slate-950 text-white" : "glass-input"}`}
        >
          <option value="ALL">Semua Kelompok Mapel</option>
          <option value="UMUM">Kelompok Umum</option>
          <option value="PEMBERDAYAAN">Pemberdayaan</option>
          <option value="KETERAMPILAN">Keterampilan</option>
        </select>
      </div>

      {loading ? (
        <CardGridSkeleton count={3} columns={3} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Belum ada modul kesetaraan pada filter ini"
          description="Muat katalog standar Paket A, B, dan C atau tambahkan modul & bobot SKK secara manual."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {modules.length === 0 && (
                <button type="button" disabled={busy} onClick={() => void seedCatalog()} className="master-primary px-4 py-2.5 text-xs">
                  Muat Katalog Standar PKBM
                </button>
              )}
              <button type="button" onClick={openCreate} className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-xs font-bold text-sky-900">
                + Tambah Modul Baru
              </button>
            </div>
          }
        />
      ) : (
        <div className={`overflow-x-auto rounded-2xl ${panelClass(isDark)}`}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={`border-b text-xs font-bold uppercase ${isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600"}`}>
                <th className="px-4 py-3">Kode &amp; Modul</th>
                <th className="px-4 py-3">Jenjang / Tingkatan</th>
                <th className="px-4 py-3">Kelompok</th>
                <th className="px-4 py-3 text-center">TM</th>
                <th className="px-4 py-3 text-center">Tutorial</th>
                <th className="px-4 py-3 text-center">Mandiri</th>
                <th className="px-4 py-3 text-center">Total SKK</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200/70"}`}>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <p className="text-[11px] font-bold text-sky-600">{item.kodeModul}</p>
                    <p className="font-bold">{item.judulModul}</p>
                    {item.mapelId && mapelNames.get(item.mapelId) && (
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Mapel: {mapelNames.get(item.mapelId)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="font-bold">{JENJANG_LABELS[item.jenjang]}</span>
                    <p className={isDark ? "text-slate-400" : "text-slate-500"}>{item.tingkatan}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-bold ${isDark ? "bg-slate-800 text-amber-300" : "bg-sky-50 text-sky-900"}`}>
                      {KELOMPOK_LABELS[item.kelompok]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold">{item.skkTatapMuka}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold">{item.skkTutorial}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold">{item.skkMandiri}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-black text-emerald-600">{item.skkTotal} SKK</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button type="button" onClick={() => openEdit(item)} className="rounded-lg border border-sky-300 px-2.5 py-1 text-xs font-bold text-sky-700 hover:bg-sky-50">
                        Edit
                      </button>
                      <button type="button" disabled={busy} onClick={() => void handleDelete(item.id)} className="rounded-lg border border-rose-300 p-1.5 text-rose-700 hover:bg-rose-50" aria-label={`Hapus ${item.judulModul}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <SchoolModal
          title={editing ? "Edit Modul & Bobot SKK" : "Tambah Modul Kesetaraan"}
          titleIcon={<Layers size={18} className="text-sky-700" />}
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleSave} className="mt-4 space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block font-semibold">
                Jenjang Kesetaraan
                <select value={jenjang} onChange={(e) => setJenjang(e.target.value as ModulKesetaraanRow["jenjang"])} className={inputClass(false)}>
                  <option value="PAKET_A">Paket A (Setara SD)</option>
                  <option value="PAKET_B">Paket B (Setara SMP)</option>
                  <option value="PAKET_C">Paket C (Setara SMA)</option>
                </select>
              </label>
              <label className="block font-semibold">
                Kelompok Kurikulum
                <select value={kelompok} onChange={(e) => setKelompok(e.target.value as ModulKesetaraanRow["kelompok"])} className={inputClass(false)}>
                  <option value="UMUM">Kelompok Umum</option>
                  <option value="PEMBERDAYAAN">Pemberdayaan</option>
                  <option value="KETERAMPILAN">Keterampilan</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block font-semibold">
                Tingkatan Kelas
                <input required value={tingkatan} onChange={(e) => setTingkatan(e.target.value)} placeholder="Mis. Kelas 7-9" className={inputClass(false)} />
              </label>
              <label className="block font-semibold">
                Tautkan Mata Pelajaran
                <select value={mapelId} onChange={(e) => setMapelId(e.target.value)} className={inputClass(false)}>
                  <option value="">-- Opsional / Umum --</option>
                  {mapels.map((m) => (
                    <option key={m.id} value={m.id}>{m.nama}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block font-semibold">
                Kode Modul
                <input required value={kodeModul} onChange={(e) => setKodeModul(e.target.value)} placeholder="PB-MTK-02" className={inputClass(false)} />
              </label>
              <label className="block font-semibold sm:col-span-2">
                Judul Modul
                <input required value={judulModul} onChange={(e) => setJudulModul(e.target.value)} placeholder="Aljabar Kontekstual" className={inputClass(false)} />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="block font-semibold">
                SKK Tatap Muka
                <input type="number" min={0} max={20} value={skkTatapMuka} onChange={(e) => setSkkTatapMuka(Number(e.target.value))} className={inputClass(false)} />
              </label>
              <label className="block font-semibold">
                SKK Tutorial
                <input type="number" min={0} max={20} value={skkTutorial} onChange={(e) => setSkkTutorial(Number(e.target.value))} className={inputClass(false)} />
              </label>
              <label className="block font-semibold">
                SKK Mandiri
                <input type="number" min={0} max={20} value={skkMandiri} onChange={(e) => setSkkMandiri(Number(e.target.value))} className={inputClass(false)} />
              </label>
            </div>
            <label className="block font-semibold">
              Deskripsi Singkat
              <textarea rows={2} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} className={inputClass(false)} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700">
                Batal
              </button>
              <button type="submit" disabled={busy} className="master-primary px-5 py-2.5 text-xs">
                {busy ? "Menyimpan..." : "Simpan Modul SKK"}
              </button>
            </div>
          </form>
        </SchoolModal>
      )}
    </section>
  );
}

// ==========================================
// 2. AGENDA & JURNAL MENGAJAR (BASIC+)
// ==========================================
type AgendaRow = {
  id: string;
  tanggal: string;
  jamKe: string;
  metode: "TATAP_MUKA" | "TUTORIAL" | "MANDIRI";
  materiPokok: string;
  hadirCount: number;
  tidakHadirCount: number;
  catatanGuru: string | null;
  kelas: { id: string; nama: string };
  mapel: { id: string; nama: string };
  guru: { id: string; nama: string };
};

const METODE_LABELS: Record<AgendaRow["metode"], string> = {
  TATAP_MUKA: "Tatap Muka",
  TUTORIAL: "Tutorial",
  MANDIRI: "Belajar Mandiri",
};

export function AgendaMengajarView() {
  const isDark = useTenantTheme() === "dark";
  const [agenda, setAgenda] = useState<AgendaRow[]>([]);
  const [kelasList, setKelasList] = useState<KelasOpt[]>([]);
  const [mapelList, setMapelList] = useState<MapelOpt[]>([]);
  const [guruList, setGuruList] = useState<GuruOpt[]>([]);
  const [tahunList, setTahunList] = useState<TahunOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [kelasId, setKelasId] = useState("");
  const [mapelId, setMapelId] = useState("");
  const [guruId, setGuruId] = useState("");
  const [tahunAjaranId, setTahunAjaranId] = useState("");
  const [jamKe, setJamKe] = useState("08:00 - 09:30");
  const [metode, setMetode] = useState<AgendaRow["metode"]>("TATAP_MUKA");
  const [hadirCount, setHadirCount] = useState(12);
  const [tidakHadirCount, setTidakHadirCount] = useState(0);
  const [materiPokok, setMateriPokok] = useState("");
  const [catatanGuru, setCatatanGuru] = useState("");
  const [filterKelas, setFilterKelas] = useState("ALL");

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/sekolah/agenda-mengajar", { signal });
      const body = (await res.json()) as {
        agenda?: AgendaRow[];
        kelas?: KelasOpt[];
        mapel?: MapelOpt[];
        guru?: GuruOpt[];
        tahunAjaran?: TahunOpt[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Gagal memuat jurnal mengajar.");
      setAgenda(body.agenda ?? []);
      setKelasList(body.kelas ?? []);
      setMapelList(body.mapel ?? []);
      setGuruList(body.guru ?? []);
      setTahunList(body.tahunAjaran ?? []);
      if (body.kelas?.[0] && !kelasId) setKelasId(body.kelas[0].id);
      if (body.mapel?.[0] && !mapelId) setMapelId(body.mapel[0].id);
      if (body.guru?.[0] && !guruId) setGuruId(body.guru[0].id);
      if (body.tahunAjaran?.[0] && !tahunAjaranId) setTahunAjaranId(body.tahunAjaran[0].id);
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Agenda mengajar belum dapat dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [kelasId, mapelId, guruId, tahunAjaranId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/agenda-mengajar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tanggal,
          kelasId,
          mapelId,
          guruId,
          tahunAjaranId: tahunAjaranId || undefined,
          jamKe,
          metode,
          hadirCount,
          tidakHadirCount,
          materiPokok,
          catatanGuru,
        }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal mencatat jurnal mengajar.");
      setNotice(body.message || "Jurnal mengajar disimpan.");
      setMateriPokok("");
      setCatatanGuru("");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Jurnal mengajar belum dapat disimpan."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/agenda-mengajar/${id}`, { method: "DELETE" });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menghapus jurnal.");
      setNotice(body.message || "Jurnal dihapus.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Jurnal belum dapat dihapus."));
    } finally {
      setBusy(false);
    }
  }

  const filtered = agenda.filter((a) => filterKelas === "ALL" || a.kelas.id === filterKelas);

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="Akademik & KBM · Paket Basic+"
        title="Agenda & Jurnal Mengajar Tutor"
        description="Catat aktivitas harian KBM tatap muka, tutorial, dan belajar mandiri beserta materi pokok serta ringkasan kehadiran warga belajar."
      />

      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}

      <form onSubmit={handleSubmit} className={`space-y-4 rounded-2xl p-5 ${panelClass(isDark)}`}>
        <h3 className="flex items-center gap-2 text-base font-bold">
          <FileText size={18} className="text-sky-600" />
          Catat Jurnal Pertemuan Baru
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-bold">
            Tanggal
            <input type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputClass(isDark)} />
          </label>
          <label className="block text-xs font-bold">
            Kelas / Rombel
            <select required value={kelasId} onChange={(e) => setKelasId(e.target.value)} className={inputClass(isDark)}>
              <option value="">-- Pilih Kelas --</option>
              {kelasList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold">
            Mata Pelajaran
            <select required value={mapelId} onChange={(e) => setMapelId(e.target.value)} className={inputClass(isDark)}>
              <option value="">-- Pilih Mapel --</option>
              {mapelList.map((m) => <option key={m.id} value={m.id}>{m.nama}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold">
            Tutor Pengampu
            <select required value={guruId} onChange={(e) => setGuruId(e.target.value)} className={inputClass(isDark)}>
              <option value="">-- Pilih Tutor --</option>
              {guruList.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-bold">
            Metode Pembelajaran
            <select value={metode} onChange={(e) => setMetode(e.target.value as AgendaRow["metode"])} className={inputClass(isDark)}>
              <option value="TATAP_MUKA">Tatap Muka</option>
              <option value="TUTORIAL">Tutorial</option>
              <option value="MANDIRI">Mandiri</option>
            </select>
          </label>
          <label className="block text-xs font-bold">
            Jam Ke / Waktu
            <input value={jamKe} onChange={(e) => setJamKe(e.target.value)} placeholder="08:00 - 09:30" className={inputClass(isDark)} />
          </label>
          <label className="block text-xs font-bold">
            Warga Belajar Hadir
            <input type="number" min={0} max={500} value={hadirCount} onChange={(e) => setHadirCount(Number(e.target.value))} className={inputClass(isDark)} />
          </label>
          <label className="block text-xs font-bold">
            Tidak Hadir (Izin/Alpa)
            <input type="number" min={0} max={500} value={tidakHadirCount} onChange={(e) => setTidakHadirCount(Number(e.target.value))} className={inputClass(isDark)} />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-bold">
            Pokok Bahasan / Materi
            <input required value={materiPokok} onChange={(e) => setMateriPokok(e.target.value)} placeholder="Contoh: Teks Laporan Hasil Observasi & Diskusi" className={inputClass(isDark)} />
          </label>
          <label className="block text-xs font-bold">
            Catatan Kehadiran / Tindak Lanjut Tutor
            <input value={catatanGuru} onChange={(e) => setCatatanGuru(e.target.value)} placeholder="Catatan evaluasi pertemuan" className={inputClass(isDark)} />
          </label>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={busy || !kelasId || !mapelId || !guruId} className="master-primary gap-2 px-5 py-2.5 text-xs">
            <Save size={15} />
            {busy ? "Menyimpan..." : "Simpan Jurnal Mengajar"}
          </button>
        </div>
      </form>

      <div className={`space-y-4 rounded-2xl p-5 ${panelClass(isDark)}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold">Riwayat Jurnal Mengajar ({filtered.length})</h3>
          <select
            aria-label="Filter riwayat berdasarkan kelas"
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
            className={`rounded-xl px-3 py-2 text-xs font-bold ${isDark ? "border border-slate-700 bg-slate-950 text-white" : "glass-input"}`}
          >
            <option value="ALL">Semua Kelas</option>
            {kelasList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        </div>

        {loading ? (
          <CardGridSkeleton count={3} columns={3} />
        ) : filtered.length === 0 ? (
          <EmptyState title="Belum ada jurnal mengajar tercatat" description="Isi form di atas untuk mendokumentasikan pertemuan KBM tutor." />
        ) : (
          <div className="space-y-3">
            {filtered.map((row) => (
              <div key={row.id} className={`flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${isDark ? "border-slate-800 bg-slate-950/60" : "border-slate-200 bg-slate-50/80"}`}>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 font-bold text-sky-600">
                      <CalendarDays size={13} />
                      {new Date(row.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} · {row.jamKe}
                    </span>
                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold text-indigo-900">{METODE_LABELS[row.metode] ?? row.metode}</span>
                    <span className="font-bold">{row.kelas.nama}</span>
                    <span>· {row.mapel.nama}</span>
                  </div>
                  <p className="text-sm font-bold">{row.materiPokok}</p>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    Tutor: <strong>{row.guru.nama}</strong> · Kehadiran: <strong className="text-emerald-600">{row.hadirCount} Hadir</strong> / {row.tidakHadirCount} Tidak Hadir
                    {row.catatanGuru ? ` · Catatan: ${row.catatanGuru}` : ""}
                  </p>
                </div>
                <button type="button" disabled={busy} onClick={() => void handleDelete(row.id)} className="self-start rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 sm:self-center">
                  Hapus
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ==========================================
// 3. CEK & CETAK E-RAPORT (REGULER+)
// ==========================================
type RaportPayload = {
  sekolah: { nama: string; npsn: string | null; alamat: string | null; kabupatenKota: string | null; kepalaSekolah: string | null; logoUrl: string | null };
  kopSurat?: SchoolProfile;
  kelasList: KelasOpt[];
  tahunList: TahunOpt[];
  selectedKelasId: string;
  selectedTahunId: string;
  waliKelasNama: string | null;
  mapel: Array<MapelOpt & { skk: number }>;
  siswa: Array<{ id: string; nama: string; nisn: string; jenjang: string | null }>;
  nilai: Array<{ id: string; siswaId: string; mapelId: string; nilaiMandiri: number; nilaiSimulasi: number; nilaiAkhir: number; catatanKompetensi: string | null }>;
  catatan: Array<{ siswaId: string; catatanWali: string | null; statusKenaikan: string }>;
};

const STATUS_KENAIKAN_LABELS: Record<string, string> = {
  PROSES: "Proses Penilaian Semester",
  NAIK_KELAS: "Naik ke Tingkat Berikutnya",
  LULUS: "Lulus Pendidikan Kesetaraan",
  TINGGAL_KELAS: "Perlu Pengulangan Modul",
};

function predikatNilai(skor: number): string {
  if (skor >= 90) return "A (Sangat Baik)";
  if (skor >= 80) return "B (Baik)";
  if (skor >= 70) return "C (Cukup)";
  return "D (Perlu Bimbingan)";
}

function detectKurikulumMerdekaPhase(kelasName: string, jenjang?: string | null): { program: string; fase: string } {
  const text = `${kelasName} ${jenjang ?? ""}`.toLowerCase();
  const gradeMatch = text.match(/\b(?:kelas|kls|tingkat)?\s*(1[0-2]|[1-9])\b/);
  const grade = gradeMatch ? Number(gradeMatch[1]) : null;

  if (grade !== null) {
    if (grade <= 2) return { program: "Program Paket A (Setara SD)", fase: "Fase A" };
    if (grade <= 4) return { program: "Program Paket A (Setara SD)", fase: "Fase B" };
    if (grade <= 6) return { program: "Program Paket A (Setara SD)", fase: "Fase C" };
    if (grade <= 9) return { program: "Program Paket B (Setara SMP)", fase: "Fase D" };
    if (grade === 10) return { program: "Program Paket C (Setara SMA)", fase: "Fase E" };
    return { program: "Program Paket C (Setara SMA)", fase: "Fase F" };
  }

  if (text.includes("paket a")) return { program: "Program Paket A (Setara SD)", fase: "Fase A / B / C" };
  if (text.includes("paket b")) return { program: "Program Paket B (Setara SMP)", fase: "Fase D" };
  if (text.includes("paket c")) return { program: "Program Paket C (Setara SMA)", fase: "Fase E / F" };
  return { program: "Pendidikan Kesetaraan", fase: "Fase Kesetaraan" };
}

function isPemberdayaanKeterampilanMapel(mapelNama: string): boolean {
  return /\b(pemberdayaan|keterampilan|prakarya|kewirausahaan|vokasi|tata boga|tata busana|komputer|tik|teknologi informasi|informatika|p5|projek|proyek|kerajinan|pertanian|budidaya)\b/i.test(
    mapelNama,
  );
}

function buildKurikulumMerdekaDescription(mapelNama: string, nilaiAkhir: number | null, customNote: string | null): string {
  if (customNote && customNote.trim()) {
    return customNote.trim();
  }
  if (nilaiAkhir === null) {
    return `Belum terdapat capaian nilai akhir pada mata pelajaran ${mapelNama} semester ini.`;
  }
  if (nilaiAkhir >= 86) {
    return `Menunjukkan penguasaan yang sangat baik dalam memahami dan menerapkan seluruh kompetensi esensial pada mata pelajaran ${mapelNama}. Perlu diberikan pengayaan untuk mengembangkan keterampilan berpikir tingkat lanjut secara mandiri.`;
  }
  if (nilaiAkhir >= 76) {
    return `Menunjukkan penguasaan yang baik dalam memahami konsep dan penerapan materi ${mapelNama}. Perlu penguatan pada latihan analisis dan konsistensi penyelesaian tugas mandiri.`;
  }
  if (nilaiAkhir >= 70) {
    return `Menunjukkan penguasaan yang cukup pada kompetensi dasar mata pelajaran ${mapelNama}. Perlu bimbingan lanjutan dalam memahami materi yang lebih kompleks serta peningkatan ketelitian dalam pembelajaran tutorial dan mandiri.`;
  }
  if (nilaiAkhir >= 50) {
    return `Mulai memahami sebagian konsep dasar ${mapelNama}. Perlu pendampingan tutor dan remedial pada bagian materi yang belum tuntas.`;
  }
  return `Belum mencapai ketuntasan pada kompetensi esensial ${mapelNama}. Perlu bimbingan intensif dan pengulangan modul mandiri secara menyeluruh.`;
}

export function CekRaportView({ sandboxRole }: { sandboxRole?: "GURU" | "SISWA" } = {}) {
  const isDark = useTenantTheme() === "dark";
  const [data, setData] = useState<RaportPayload | null>(null);
  const [raportSubTab, setRaportSubTab] = useState<"raport" | "leger" | "leger-6sem" | "transkrip">("raport");
  const [kelasId, setKelasId] = useState("");
  const [tahunId, setTahunId] = useState("");
  const [selectedSiswaId, setSelectedSiswaId] = useState("");
  const [paketCTrack, setPaketCTrack] = useState<PaketCTrack>(() => detectDefaultPaketCTrack(""));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Edit score form state
  const [editMapelId, setEditMapelId] = useState("");
  const [nilaiMandiri, setNilaiMandiri] = useState(80);
  const [nilaiSimulasi, setNilaiSimulasi] = useState(82);
  const [catatanKompetensi, setCatatanKompetensi] = useState("");

  // Edit homeroom note & decision state
  const [catatanWali, setCatatanWali] = useState("");
  const [statusKenaikan, setStatusKenaikan] = useState("NAIK_KELAS");

  // Add Tahun Ajaran modal state
  const [addYearOpen, setAddYearOpen] = useState(false);
  const [newYearName, setNewYearName] = useState(() => {
    const y = new Date().getFullYear();
    return `${y}/${y + 1}`;
  });
  const [newYearSemester, setNewYearSemester] = useState<"Ganjil" | "Genap">("Ganjil");

  const loadRaport = useCallback(async (kId: string, tId: string, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (kId) params.set("kelasId", kId);
      if (tId) params.set("tahunAjaranId", tId);
      const res = await fetchWithTimeout(`/api/sekolah/raport?${params.toString()}`, {
        signal,
        ...(sandboxRole ? { headers: { "X-Dev-Sandbox-Role": sandboxRole } } : {}),
      });
      const body = (await res.json()) as RaportPayload & { error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal memuat data E-Raport.");
      setData(body);
      setKelasId(body.selectedKelasId);
      setTahunId(body.selectedTahunId);
      if (body.siswa.length > 0 && !body.siswa.some((s) => s.id === selectedSiswaId)) {
        setSelectedSiswaId(body.siswa[0].id);
      } else if (body.siswa.length === 0) {
        setSelectedSiswaId("");
      }
      if (body.mapel.length > 0 && !editMapelId) {
        setEditMapelId(body.mapel[0].id);
      }
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Data E-Raport belum dapat dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [selectedSiswaId, editMapelId, sandboxRole]);

  useEffect(() => {
    const controller = new AbortController();
    void loadRaport(kelasId, tahunId, controller.signal);
    return () => controller.abort();
  }, [kelasId, tahunId]);

  const activeSiswa = useMemo(
    () => data?.siswa.find((s) => s.id === selectedSiswaId) ?? data?.siswa[0] ?? null,
    [data, selectedSiswaId],
  );

  useEffect(() => {
    if (!data || !activeSiswa) return;
    const note = data.catatan.find((c) => c.siswaId === activeSiswa.id);
    setCatatanWali(note?.catatanWali ?? "Terus tingkatkan ketekunan dalam pembelajaran mandiri dan tatap muka.");
    setStatusKenaikan(note?.statusKenaikan ?? "NAIK_KELAS");
  }, [data, activeSiswa]);

  useEffect(() => {
    if (!data || !activeSiswa || !editMapelId) return;
    const existing = data.nilai.find((n) => n.siswaId === activeSiswa.id && n.mapelId === editMapelId);
    if (existing) {
      setNilaiMandiri(existing.nilaiMandiri);
      setNilaiSimulasi(existing.nilaiSimulasi);
      setCatatanKompetensi(existing.catatanKompetensi ?? "");
    } else {
      setNilaiMandiri(78);
      setNilaiSimulasi(80);
      setCatatanKompetensi("");
    }
  }, [data, activeSiswa, editMapelId]);

  async function handleCreateTahunAjaran(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !newYearName.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/raport/tahun-ajaran", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
        },
        body: JSON.stringify({ nama: newYearName.trim(), semester: newYearSemester }),
      });
      const body = (await res.json().catch(() => null)) as {
        tahunAjaran?: { id: string; nama: string; semester: string };
        message?: string;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menambahkan tahun ajaran.");
      setAddYearOpen(false);
      setNotice(body?.message || "Tahun ajaran berhasil ditambahkan.");
      const nextYearId = body?.tahunAjaran?.id ?? tahunId;
      setTahunId(nextYearId);
      await loadRaport(kelasId, nextYearId);
    } catch (failure) {
      setError(describeFetchError(failure, "Tahun ajaran belum dapat ditambahkan."));
    } finally {
      setBusy(false);
    }
  }

  async function saveScore(event: React.FormEvent) {
    event.preventDefault();
    if (!activeSiswa || !editMapelId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/raport/nilai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
        },
        body: JSON.stringify({
          siswaId: activeSiswa.id,
          mapelId: editMapelId,
          tahunAjaranId: tahunId || undefined,
          nilaiMandiri,
          nilaiSimulasi,
          catatanKompetensi,
        }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menyimpan nilai.");
      setNotice(body.message || "Nilai tersimpan.");
      await loadRaport(kelasId, tahunId);
    } catch (failure) {
      setError(describeFetchError(failure, "Nilai belum dapat disimpan."));
    } finally {
      setBusy(false);
    }
  }

  async function syncGradesFromTasksAndCbt() {
    if (busy || !kelasId || !tahunId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/raport/sinkron-otomatis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
        },
        body: JSON.stringify({ kelasId, tahunAjaranId: tahunId }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menyinkronkan nilai otomatis.");
      setNotice(body?.message || "Sinkronisasi nilai selesai.");
      await loadRaport(kelasId, tahunId);
    } catch (failure) {
      setError(describeFetchError(failure, "Sinkronisasi nilai otomatis gagal."));
    } finally {
      setBusy(false);
    }
  }

  async function saveHomeroomNote(event: React.FormEvent) {
    event.preventDefault();
    if (!activeSiswa || !kelasId || !tahunId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/raport/catatan", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
        },
        body: JSON.stringify({
          tahunAjaranId: tahunId,
          kelasId,
          siswaId: activeSiswa.id,
          catatanWali,
          statusKenaikan,
        }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menyimpan catatan wali kelas.");
      setNotice(body.message || "Catatan wali kelas diperbarui.");
      await loadRaport(kelasId, tahunId);
    } catch (failure) {
      setError(describeFetchError(failure, "Catatan wali kelas belum dapat disimpan."));
    } finally {
      setBusy(false);
    }
  }

  const activeKelasName = data?.kelasList.find((k) => k.id === kelasId)?.nama ?? "-";
  const activeTahunObj = data?.tahunList.find((t) => t.id === tahunId) ?? data?.tahunList[0];
  const uniqueYearNames = useMemo(() => {
    const names = new Set<string>();
    for (const t of data?.tahunList ?? []) names.add(t.nama);
    return Array.from(names);
  }, [data?.tahunList]);
  const activeYearName = activeTahunObj?.nama ?? uniqueYearNames[0] ?? "";
  const activeSemesterValue: "Ganjil" | "Genap" =
    activeTahunObj?.semester?.toLowerCase() === "genap" ? "Genap" : "Ganjil";

  async function selectYearAndSemester(targetNama: string, targetSemester: "Ganjil" | "Genap") {
    if (!targetNama) return;
    const match = data?.tahunList.find(
      (t) => t.nama === targetNama && t.semester.toLowerCase() === targetSemester.toLowerCase(),
    );
    if (match) {
      setTahunId(match.id);
      return;
    }
    // Auto-create missing semester pair in database so selection always persists across logout
    setBusy(true);
    setError("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/raport/tahun-ajaran", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
        },
        body: JSON.stringify({ nama: targetNama, semester: targetSemester, createPair: true }),
      });
      const body = (await res.json().catch(() => null)) as {
        tahunAjaran?: { id: string };
        error?: string;
      } | null;
      if (!res.ok || !body?.tahunAjaran?.id) {
        throw new Error(body?.error || "Semester belum dapat disiapkan.");
      }
      setTahunId(body.tahunAjaran.id);
      await loadRaport(kelasId, body.tahunAjaran.id);
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal berpindah semester."));
    } finally {
      setBusy(false);
    }
  }
  const activeProgram = detectKesetaraanProgram(activeKelasName, activeSiswa?.jenjang);

  function handleSelectPaketCTrack(next: PaketCTrack) {
    setPaketCTrack(next);
    savePaketCTrackPreference(next);
  }

  async function seedStandardSubjects() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const jenjang = activeProgram === "UNKNOWN" ? "PAKET_C" : activeProgram;
      const res = await fetchWithTimeout("/api/sekolah/raport/seed-mapel-kesetaraan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
        },
        body: JSON.stringify({ jenjang, jurusan: paketCTrack }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal memuat mapel standar.");
      setNotice(body?.message || "Mapel standar berhasil dimuat.");
      await loadRaport(kelasId, tahunId);
    } catch (failure) {
      setError(describeFetchError(failure, "Mapel standar belum dapat dimuat."));
    } finally {
      setBusy(false);
    }
  }

  const filteredMapels = useMemo(
    () =>
      filterItemsByKesetaraanTrack(
        data?.mapel ?? [],
        (m) => m.nama,
        activeKelasName,
        paketCTrack,
        activeSiswa?.jenjang,
      ),
    [data?.mapel, activeKelasName, paketCTrack, activeSiswa?.jenjang],
  );

  const studentScores = useMemo(() => {
    if (!data || !activeSiswa) return [];
    const byMapel = new Map(data.nilai.filter((n) => n.siswaId === activeSiswa.id).map((n) => [n.mapelId, n]));
    return filteredMapels.map((m) => {
      const row = byMapel.get(m.id);
      return {
        mapel: m,
        nilaiMandiri: row?.nilaiMandiri ?? null,
        nilaiSimulasi: row?.nilaiSimulasi ?? null,
        nilaiAkhir: row?.nilaiAkhir ?? null,
        catatan: row?.catatanKompetensi ?? null,
      };
    });
  }, [data, activeSiswa, filteredMapels]);

  const phaseInfo = detectKurikulumMerdekaPhase(activeKelasName, activeSiswa?.jenjang);
  const programDisplayLabel =
    activeProgram === "PAKET_C" ? `${phaseInfo.program} · Jurusan ${paketCTrack}` : phaseInfo.program;
  const kelompokUmumScores = useMemo(
    () => studentScores.filter((row) => !isPemberdayaanKeterampilanMapel(row.mapel.nama)),
    [studentScores],
  );
  const kelompokKeterampilanScores = useMemo(
    () => studentScores.filter((row) => isPemberdayaanKeterampilanMapel(row.mapel.nama)),
    [studentScores],
  );
  const totalSkkRaport = useMemo(
    () => studentScores.reduce((sum, row) => sum + (row.mapel.skk || 0), 0),
    [studentScores],
  );

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <div className="no-print space-y-6">
        <DashboardHero
          eyebrow="Evaluasi & Rapor Kesetaraan · Kurikulum Merdeka"
          title="E-Raport, Leger & Transkrip Nilai Ijazah"
          description="Kelola laporan hasil belajar E-Raport Kurikulum Merdeka Pendidikan Kesetaraan, leger kelas, hingga cetak transkrip nilai kelulusan siap cetak."
          action={
            raportSubTab === "raport" ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !kelasId || !tahunId}
                  onClick={() => void syncGradesFromTasksAndCbt()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  <CheckCircle2 size={15} />
                  {busy ? "Menyinkronkan..." : "Sinkron Nilai Tugas & CBT"}
                </button>
                <button type="button" onClick={() => window.print()} disabled={!activeSiswa} className="dashboard-hero-action">
                  <Printer size={16} />
                  Cetak / PDF E-Raport
                </button>
              </div>
            ) : undefined
          }
        />

        <div className={`flex flex-wrap gap-2 rounded-2xl p-1.5 ${panelClass(isDark)}`}>
          {([
            { id: "raport" as const, label: "Input & E-Raport Siswa" },
            { id: "leger" as const, label: "Leger Raport Kelas" },
            { id: "leger-6sem" as const, label: "Input Leger Semester 1–6" },
            { id: "transkrip" as const, label: "Transkrip Nilai Ijazah" },
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={raportSubTab === tab.id}
              onClick={() => setRaportSubTab(tab.id)}
              className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                raportSubTab === tab.id
                  ? isDark
                    ? "bg-amber-400 text-slate-950"
                    : "bg-sky-700 text-white shadow-xs"
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800"
                    : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}

        {raportSubTab !== "transkrip" && raportSubTab !== "leger-6sem" && (
        <div className={`space-y-3 rounded-2xl p-4 ${panelClass(isDark)}`}>
          <div className={`grid gap-4 ${raportSubTab === "raport" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
            <div className="block text-xs font-bold">
              <div className="flex items-center justify-between gap-2">
                <span>Tahun Ajaran</span>
                <button
                  type="button"
                  onClick={() => setAddYearOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-extrabold text-sky-800 hover:bg-sky-100"
                >
                  <Plus size={11} />
                  Tambah
                </button>
              </div>
              <select
                aria-label="Tahun Ajaran"
                value={activeYearName}
                onChange={(e) => void selectYearAndSemester(e.target.value, activeSemesterValue)}
                className={inputClass(isDark)}
              >
                {uniqueYearNames.map((nama) => (
                  <option key={nama} value={nama}>{nama}</option>
                ))}
              </select>
            </div>
            <label className="block text-xs font-bold">
              Semester
              <select
                aria-label="Semester"
                value={activeSemesterValue}
                onChange={(e) => void selectYearAndSemester(activeYearName, e.target.value as "Ganjil" | "Genap")}
                className={inputClass(isDark)}
              >
                <option value="Ganjil">Ganjil</option>
                <option value="Genap">Genap</option>
              </select>
            </label>
            <label className="block text-xs font-bold">
              Kelas / Rombel
              <select value={kelasId} onChange={(e) => setKelasId(e.target.value)} className={inputClass(isDark)}>
                {data?.kelasList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
            </label>
            {raportSubTab === "raport" && (
            <label className="block text-xs font-bold">
              Pilih Warga Belajar
              <select value={activeSiswa?.id ?? ""} onChange={(e) => setSelectedSiswaId(e.target.value)} className={inputClass(isDark)}>
                {data?.siswa.map((s) => <option key={s.id} value={s.id}>{s.nama} ({s.nisn})</option>)}
              </select>
            </label>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/60 pt-3 text-xs">
            {activeProgram === "PAKET_C" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">Jurusan Paket C (Filter Mapel):</span>
                {(["IPA", "IPS"] as const).map((tr) => (
                  <button
                    key={tr}
                    type="button"
                    aria-pressed={paketCTrack === tr}
                    onClick={() => handleSelectPaketCTrack(tr)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                      paketCTrack === tr
                        ? "bg-indigo-600 text-white shadow-xs"
                        : isDark
                          ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Paket C — {tr}
                  </button>
                ))}
                <span className={isDark ? "text-slate-400" : "text-slate-500"}>
                  {paketCTrack === "IPA" ? "(Mapel IPS disembunyikan)" : "(Mapel IPA disembunyikan)"}
                </span>
              </div>
            ) : (
              <span className={isDark ? "text-slate-400" : "text-slate-600"}>
                Filter mapel otomatis menyesuaikan program <strong>{phaseInfo.program}</strong>.
              </span>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void seedStandardSubjects()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
            >
              <Sparkles size={13} />
              Muat Mapel Standar {activeProgram === "PAKET_C" ? `Paket C ${paketCTrack}` : activeProgram === "PAKET_B" ? "Paket B" : activeProgram === "PAKET_A" ? "Paket A" : "Kesetaraan"}
            </button>
          </div>
        </div>
        )}

        {raportSubTab === "raport" && (loading ? (
          <CardGridSkeleton count={2} columns={2} />
        ) : !activeSiswa ? (
          <EmptyState title="Belum ada warga belajar di kelas terpilih" description="Pastikan kelas memiliki warga belajar aktif melalui menu Penempatan / Kenaikan Kelas." />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <form onSubmit={saveScore} className={`space-y-3 rounded-2xl p-5 ${panelClass(isDark)}`}>
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Award size={17} className="text-sky-600" />
                Input / Perbarui Nilai Mapel ({activeSiswa.nama})
              </h3>
              <label className="block text-xs font-bold">
                Mata Pelajaran
                <select value={editMapelId} onChange={(e) => setEditMapelId(e.target.value)} className={inputClass(isDark)}>
                  {filteredMapels.map((m) => <option key={m.id} value={m.id}>{m.nama} (KKM {m.kkm})</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-bold">
                  Nilai Modul / Mandiri
                  <input type="number" min={0} max={100} value={nilaiMandiri} onChange={(e) => setNilaiMandiri(Number(e.target.value))} className={inputClass(isDark)} />
                </label>
                <label className="block text-xs font-bold">
                  Nilai Simulasi / CBT
                  <input type="number" min={0} max={100} value={nilaiSimulasi} onChange={(e) => setNilaiSimulasi(Number(e.target.value))} className={inputClass(isDark)} />
                </label>
              </div>
              <label className="block text-xs font-bold">
                Deskripsi Capaian Kompetensi
                <input value={catatanKompetensi} onChange={(e) => setCatatanKompetensi(e.target.value)} placeholder="Contoh: Sangat baik dalam penerapan materi fungsional." className={inputClass(isDark)} />
              </label>
              <div className="flex justify-end">
                <button type="submit" disabled={busy || !editMapelId} className="master-primary px-4 py-2 text-xs">
                  Simpan Nilai Mapel
                </button>
              </div>
            </form>

            <form onSubmit={saveHomeroomNote} className={`space-y-3 rounded-2xl p-5 ${panelClass(isDark)}`}>
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <UserCheck size={17} className="text-emerald-600" />
                Catatan Wali Kelas &amp; Keputusan Semester
              </h3>
              <label className="block text-xs font-bold">
                Status Kenaikan / Kelulusan
                <select value={statusKenaikan} onChange={(e) => setStatusKenaikan(e.target.value)} className={inputClass(isDark)}>
                  <option value="PROSES">Proses Penilaian Semester</option>
                  <option value="NAIK_KELAS">Naik ke Tingkat Berikutnya</option>
                  <option value="LULUS">Lulus Pendidikan Kesetaraan</option>
                  <option value="TINGGAL_KELAS">Perlu Pengulangan Modul</option>
                </select>
              </label>
              <label className="block text-xs font-bold">
                Catatan Wali Kelas / Tutor Pembimbing
                <textarea rows={3} value={catatanWali} onChange={(e) => setCatatanWali(e.target.value)} className={inputClass(isDark)} />
              </label>
              <div className="flex justify-end">
                <button type="submit" disabled={busy || !tahunId} className="master-primary px-4 py-2 text-xs">
                  Simpan Catatan &amp; Keputusan
                </button>
              </div>
            </form>
          </div>
        ))}
      </div>

      {raportSubTab === "leger" && data && (
        <RaportLegerPanel
          data={{
            sekolah: data.sekolah,
            kopSurat: data.kopSurat,
            kelasName: activeProgram === "PAKET_C" ? `${activeKelasName} (${paketCTrack})` : activeKelasName,
            tahunLabel: activeTahunObj ? `${activeTahunObj.nama} (${activeTahunObj.semester})` : "-",
            waliKelasNama: data.waliKelasNama,
            mapel: filteredMapels,
            siswa: data.siswa,
            nilai: data.nilai,
          }}
        />
      )}

      {raportSubTab === "leger-6sem" && (
        <RaportSixSemesterLegerPanel
          initialKelasId={kelasId}
          sandboxRole={sandboxRole}
          paketCTrack={paketCTrack}
          onChangePaketCTrack={handleSelectPaketCTrack}
          onOpenTranscript={() => setRaportSubTab("transkrip")}
        />
      )}

      {raportSubTab === "transkrip" && (
        <RaportTranscriptPanel
          initialKelasId={kelasId}
          sandboxRole={sandboxRole}
          paketCTrack={paketCTrack}
          onChangePaketCTrack={handleSelectPaketCTrack}
        />
      )}

      {raportSubTab === "raport" && activeSiswa && data && (
        <article className="print-sheet rounded-2xl border border-slate-300 bg-white p-6 text-slate-900 shadow-sm sm:p-8">
          {/* Kop Surat Resmi Lembaga (Konfigurasi di Profil & Identitas Sekolah) */}
          <KopSurat profile={buildKopSuratProfile(data.kopSurat, data.sekolah)} />

          <div className="mt-4 text-center">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-950 sm:text-base">
              Laporan Hasil Belajar (Rapor) Pendidikan Kesetaraan
            </h3>
            <p className="text-xs font-semibold text-slate-700">
              Kurikulum Merdeka · {programDisplayLabel} · Tahun Pelajaran {activeTahunObj ? `${activeTahunObj.nama} (${activeTahunObj.semester})` : "2026/2027"}
            </p>
          </div>

          {/* Identitas Peserta Didik */}
          <div className="mt-4 grid gap-x-6 gap-y-1.5 rounded-xl border border-slate-300 bg-slate-50/80 px-4 py-3 text-xs sm:grid-cols-2">
            <div className="flex gap-2">
              <span className="w-36 shrink-0 text-slate-600">Nama Peserta Didik</span>
              <span className="font-bold text-slate-950">: {activeSiswa.nama}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-32 shrink-0 text-slate-600">Kelas / Rombel</span>
              <span className="font-bold text-slate-950">: {activeKelasName}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-36 shrink-0 text-slate-600">NISN / No. Induk</span>
              <span className="font-mono font-bold text-slate-950">: {activeSiswa.nisn}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-32 shrink-0 text-slate-600">Fase</span>
              <span className="font-bold text-slate-950">: {phaseInfo.fase}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-36 shrink-0 text-slate-600">Satuan Pendidikan</span>
              <span className="font-semibold text-slate-900">: {data.sekolah.nama}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-32 shrink-0 text-slate-600">Semester / TA</span>
              <span className="font-semibold text-slate-900">
                : {activeTahunObj ? `${activeTahunObj.semester} / ${activeTahunObj.nama}` : "-"}
              </span>
            </div>
          </div>

          {/* Tabel Capaian Intrakurikuler Kurikulum Merdeka Kesetaraan */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse border border-slate-400 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 font-extrabold text-slate-900">
                  <th className="w-10 border border-slate-400 px-2.5 py-2 text-center">No</th>
                  <th className="w-52 border border-slate-400 px-3 py-2">Mata Pelajaran</th>
                  <th className="w-16 border border-slate-400 px-2 py-2 text-center">Bobot SKK</th>
                  <th className="w-20 border border-slate-400 px-2 py-2 text-center">Nilai Akhir</th>
                  <th className="border border-slate-400 px-3 py-2">Capaian Kompetensi</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-50 font-bold text-slate-900">
                  <td colSpan={5} className="border border-slate-400 px-3 py-1.5 text-[11px] uppercase tracking-wide">
                    A. Kelompok Mata Pelajaran Umum
                  </td>
                </tr>
                {(kelompokUmumScores.length > 0 ? kelompokUmumScores : studentScores).map((row, index) => (
                  <tr key={row.mapel.id}>
                    <td className="border border-slate-400 px-2.5 py-2 text-center align-top tabular-nums">{index + 1}</td>
                    <td className="border border-slate-400 px-3 py-2 align-top font-semibold text-slate-900">{row.mapel.nama}</td>
                    <td className="border border-slate-400 px-2 py-2 text-center align-top tabular-nums">{row.mapel.skk}</td>
                    <td className="border border-slate-400 px-2 py-2 text-center align-top text-sm font-extrabold tabular-nums text-slate-950">
                      {row.nilaiAkhir !== null ? row.nilaiAkhir : "-"}
                    </td>
                    <td className="border border-slate-400 px-3 py-2 align-top leading-relaxed text-slate-700">
                      {buildKurikulumMerdekaDescription(row.mapel.nama, row.nilaiAkhir, row.catatan)}
                    </td>
                  </tr>
                ))}

                {kelompokKeterampilanScores.length > 0 && (
                  <>
                    <tr className="bg-slate-50 font-bold text-slate-900">
                      <td colSpan={5} className="border border-slate-400 px-3 py-1.5 text-[11px] uppercase tracking-wide">
                        B. Kelompok Pemberdayaan dan Keterampilan (Integrasi P5)
                      </td>
                    </tr>
                    {kelompokKeterampilanScores.map((row, index) => (
                      <tr key={row.mapel.id}>
                        <td className="border border-slate-400 px-2.5 py-2 text-center align-top tabular-nums">{index + 1}</td>
                        <td className="border border-slate-400 px-3 py-2 align-top font-semibold text-slate-900">{row.mapel.nama}</td>
                        <td className="border border-slate-400 px-2 py-2 text-center align-top tabular-nums">{row.mapel.skk}</td>
                        <td className="border border-slate-400 px-2 py-2 text-center align-top text-sm font-extrabold tabular-nums text-slate-950">
                          {row.nilaiAkhir !== null ? row.nilaiAkhir : "-"}
                        </td>
                        <td className="border border-slate-400 px-3 py-2 align-top leading-relaxed text-slate-700">
                          {buildKurikulumMerdekaDescription(row.mapel.nama, row.nilaiAkhir, row.catatan)}
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-extrabold text-slate-900">
                  <td colSpan={2} className="border border-slate-400 px-3 py-2 text-right">
                    Total Bobot SKK Semester Ini
                  </td>
                  <td className="border border-slate-400 px-2 py-2 text-center tabular-nums">{totalSkkRaport} SKK</td>
                  <td colSpan={2} className="border border-slate-400 px-3 py-2 text-[11px] font-medium text-slate-600">
                    1 SKK setara 1 JP Tatap Muka / 2 JP Tutorial / 3 JP Mandiri (Permendikbudristek No. 12 Tahun 2024)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Catatan Wali Kelas, Ketidakhadiran & Keputusan */}
          <div className="print-avoid-break mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-400 p-3 text-xs sm:col-span-2">
              <p className="font-extrabold text-slate-900">Catatan Wali Kelas / Tutor Pembimbing</p>
              <p className="mt-1.5 leading-relaxed text-slate-700">{catatanWali}</p>
              <p className="mt-3 border-t border-slate-200 pt-2 text-xs">
                <span className="font-bold text-slate-700">Keputusan Semester:</span>{" "}
                <strong className="text-slate-950">{STATUS_KENAIKAN_LABELS[statusKenaikan] ?? statusKenaikan}</strong>
              </p>
            </div>
            <div className="rounded-xl border border-slate-400 p-3 text-xs">
              <p className="font-extrabold text-slate-900">Ketidakhadiran</p>
              <table className="mt-2 w-full text-xs">
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="py-1 text-slate-600">Sakit</td>
                    <td className="py-1 text-right font-semibold">: .... hari</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1 text-slate-600">Izin</td>
                    <td className="py-1 text-right font-semibold">: .... hari</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-slate-600">Tanpa Keterangan</td>
                    <td className="py-1 text-right font-semibold">: .... hari</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Blok Pengesahan Tanda Tangan Siap Cetak */}
          <div className="print-avoid-break mt-8 grid grid-cols-3 items-end gap-4 text-center text-xs">
            <div>
              <p className="text-slate-600">Mengetahui,</p>
              <p className="font-bold text-slate-900">Orang Tua / Wali</p>
              <div className="h-16" />
              <p className="mx-auto w-40 border-b border-slate-800 pb-0.5 font-semibold text-slate-700">&nbsp;</p>
            </div>
            <div className="flex flex-col items-center justify-end">
              <QrCodeSvg
                value={`RAPORT|${data.sekolah.npsn || data.sekolah.nama}|${activeSiswa.nisn}|${activeTahunObj?.nama || "2026"}`}
                size={70}
                label="QR Verifikasi E-Raport"
                className="rounded-lg border border-slate-300 p-1"
              />
              <p className="mt-1 text-[9px] font-semibold text-slate-500">QR Verifikasi E-Raport</p>
              <p className="mt-3 text-slate-600">Mengetahui,</p>
              <p className="font-bold text-slate-900">Kepala {data.sekolah.nama}</p>
              <div className="h-14" />
              <p className="font-bold underline">{data.sekolah.kepalaSekolah || "Kepala PKBM"}</p>
            </div>
            <div>
              <p className="text-slate-600">
                {data.sekolah.kabupatenKota || "Setempat"},{" "}
                {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p className="font-bold text-slate-900">Wali Kelas / Tutor</p>
              <div className="h-16" />
              <p className="font-bold underline">{data.waliKelasNama || "Wali Kelas"}</p>
            </div>
          </div>
        </article>
      )}

      {addYearOpen && (
        <SchoolModal
          title="Tambah Tahun Ajaran & Semester"
          titleIcon={<CalendarDays size={18} className="text-sky-700" />}
          onClose={() => setAddYearOpen(false)}
        >
          <form onSubmit={handleCreateTahunAjaran} className="mt-4 space-y-3 text-sm">
            <label className="block font-semibold">
              Tahun Ajaran
              <input
                required
                type="text"
                maxLength={40}
                value={newYearName}
                onChange={(e) => setNewYearName(e.target.value)}
                placeholder="Contoh: 2026/2027"
                className={inputClass(false)}
              />
            </label>
            <label className="block font-semibold">
              Semester
              <select
                value={newYearSemester}
                onChange={(e) => setNewYearSemester(e.target.value as "Ganjil" | "Genap")}
                className={inputClass(false)}
              >
                <option value="Ganjil">Ganjil</option>
                <option value="Genap">Genap</option>
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddYearOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
              >
                Batal
              </button>
              <button type="submit" disabled={busy} className="master-primary px-5 py-2.5 text-xs disabled:opacity-50">
                {busy ? "Menyimpan..." : "Simpan Tahun Ajaran"}
              </button>
            </div>
          </form>
        </SchoolModal>
      )}
    </section>
  );
}
