import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Database,
  KeyRound,
  MonitorCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
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
  kelas: { id: string; nama: string };
  mapel: { id: string; nama: string };
  guru: { id: string; nama: string };
  _count: { soal: number; percobaan: number };
};

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
// 1. KELOLA BANK SOAL & UJIAN
// ==========================================
export function CbtBankSoalView({ onOpenSettings, sandboxRole }: { onOpenSettings?: () => void; sandboxRole?: "GURU" | "SISWA" } = {}) {
  const isDark = useTenantTheme() === "dark";
  const { ujianList, kelasList, mapelList, guruList, loading, error, setError, reload } = useCbtOverview(sandboxRole);
  const [selectedUjianId, setSelectedUjianId] = useState("");
  const [soalList, setSoalList] = useState<SoalItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | CbtCategory>("ALL");

  // Create exam form
  const [kategori, setKategori] = useState<CbtCategory>("UTS");
  const [judul, setJudul] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [mapelId, setMapelId] = useState("");
  const [guruId, setGuruId] = useState("");
  const [durasiMenit, setDurasiMenit] = useState(60);
  const [kkm, setKkm] = useState(75);

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
        body: JSON.stringify({ kategori, judul, kelasId, mapelId, guruId, durasiMenit, kkm }),
      });
      const body = (await res.json()) as { ujian?: UjianItem; message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal membuat paket ujian.");
      setNotice(body.message || "Paket ujian dibuat.");
      setJudul("");
      await reload();
      if (body.ujian?.id) setSelectedUjianId(body.ujian.id);
    } catch (failure) {
      setError(describeFetchError(failure, "Paket ujian belum dapat dibuat."));
    } finally {
      setBusy(false);
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

  const filteredUjianList =
    categoryFilter === "ALL"
      ? ujianList
      : ujianList.filter((u) => detectCbtCategory(u.kode, u.judul) === categoryFilter);
  const activeUjian = filteredUjianList.find((u) => u.id === selectedUjianId) ?? ujianList.find((u) => u.id === selectedUjianId) ?? null;

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow="Ujian Online (CBT) · Paket Reguler+"
        title="Kelola Bank Soal & Paket Ujian"
        description="Susun dan impor paket soal serta tugas untuk UTS, Asesmen Sumatif (AS/UAS), dan Ujian Akhir Kelas Akhir (UPK) lengkap dengan Pilihan Ganda (A–E), Esai, kunci jawaban, dan bobot skor."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowImport((prev) => !prev)}
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
            </div>
            <div className="space-y-2">
              {filteredUjianList.length === 0 ? (
                <p className={`py-4 text-center text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Belum ada paket pada kategori ini.
                </p>
              ) : filteredUjianList.map((u) => {
                const selected = u.id === selectedUjianId;
                const cat = detectCbtCategory(u.kode, u.judul);
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
                      <p className="text-[11px] font-semibold text-sky-600">
                        {categoryBadgeLabel(cat)} · {u.kode} · {u.durasiMenit} Menit
                      </p>
                      <p className="font-bold text-sm">{u.judul}</p>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        {u.mapel.nama} · {u.kelas.nama} · <strong>{u._count.soal} Soal</strong>
                      </p>
                    </button>
                    <div className="mt-2 flex justify-end">
                      <button type="button" onClick={() => void handleDeleteUjian(u.id)} className="text-[11px] font-bold text-rose-600 hover:underline">
                        Hapus Paket
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
                <div className="border-b border-slate-200/70 pb-3">
                  <p className="text-xs font-bold uppercase text-sky-600">Editor Butir Soal · {activeUjian.kode}</p>
                  <h4 className="text-lg font-bold">{activeUjian.judul}</h4>
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

