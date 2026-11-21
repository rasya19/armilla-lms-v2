import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  Download,
  Lock,
  MessageSquare,
  Package,
  Pin,
  Plus,
  Printer,
  Search,
  Send,
  Sparkles,
  Trash2,
  Unlock,
} from "lucide-react";
import { CardGridSkeleton, DashboardHero, EmptyState } from "./DashboardUI";
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

function escapeCsv(value: string | number | null | undefined) {
  const str = String(value ?? "").replace(/"/g, '""');
  return `"${str}"`;
}

// ==========================================
// 1. ASISTEN BELAJAR AI (PRO)
// ==========================================
type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: string;
};

export function AsistenAiView() {
  const isDark = useTenantTheme() === "dark";
  const [mode, setMode] = useState<"modul" | "soal" | "chat">("modul");
  const [jenjang, setJenjang] = useState("Paket C (Setara SMA)");
  const [mapel, setMapel] = useState("Bahasa Indonesia");
  const [topik, setTopik] = useState("");
  const [jenisSoal, setJenisSoal] = useState<"PG" | "ESAI">("PG");
  const [jumlahSoal, setJumlahSoal] = useState(5);
  const [generatedOutput, setGeneratedOutput] = useState("");
  const [outputSource, setOutputSource] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const [chatPrompt, setChatPrompt] = useState("");
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function runGenerator(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "chat") return;
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const res = await fetchWithTimeout("/api/school/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          jenjang,
          mapel,
          topik,
          jenisSoal,
          jumlahSoal: Number(jumlahSoal),
        }),
      });
      const body = (await res.json()) as { content?: string; source?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal memproses permintaan asisten AI.");
      setGeneratedOutput(body.content ?? "");
      setOutputSource(body.source ?? "kurikulum-kesetaraan");
    } catch (failure) {
      setError(describeFetchError(failure, "Asisten belajar belum merespons."));
    } finally {
      setBusy(false);
    }
  }

  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = chatPrompt.trim();
    if (!trimmed) return;

    const userMsg: AiChatMessage = { id: `${Date.now()}-u`, role: "user", content: trimmed };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatPrompt("");
    setBusy(true);
    setError("");
    try {
      const res = await fetchWithTimeout("/api/school/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          jenjang,
          mapel,
          topik,
          pesan: trimmed,
        }),
      });
      const body = (await res.json()) as { content?: string; source?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal mengirim pertanyaan.");
      setChatMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: "assistant",
          content: body.content ?? "",
          source: body.source,
        },
      ]);
    } catch (failure) {
      setError(describeFetchError(failure, "Pertanyaan belum dapat diproses."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!generatedOutput) return;
    await navigator.clipboard.writeText(generatedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        <DashboardHero
          eyebrow="ASISTEN TUTOR CERDAS (PAKET PRO)"
          title="Asisten Belajar AI Kesetaraan"
          description="Susun modul ajar dan rangkuman Paket A/B/C, buat bank soal otomatis beserta kunci jawaban, atau konsultasi materi interaktif."
        />

        {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}

        <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
          <div className="mb-5 flex flex-wrap gap-2">
            {([
              { id: "modul", label: "Generator Modul Ajar & Rangkuman" },
              { id: "soal", label: "Generator Latihan Soal Otomatis" },
              { id: "chat", label: "Tanya Jawab Materi (Chat Tutor)" },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  mode === tab.id
                    ? "bg-sky-700 text-white shadow-sm"
                    : isDark
                      ? "border border-slate-700 text-slate-300 hover:bg-slate-800"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Sparkles size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-xs font-bold">
              Jenjang Kesetaraan
              <select value={jenjang} onChange={(e) => setJenjang(e.target.value)} className={inputClass(isDark)}>
                <option value="Paket A (Setara SD)">Paket A (Setara SD)</option>
                <option value="Paket B (Setara SMP)">Paket B (Setara SMP)</option>
                <option value="Paket C (Setara SMA)">Paket C (Setara SMA)</option>
              </select>
            </label>
            <label className="block text-xs font-bold">
              Mata Pelajaran
              <input type="text" value={mapel} onChange={(e) => setMapel(e.target.value)} placeholder="Matematika / Bahasa Indonesia / Ekonomi" className={inputClass(isDark)} />
            </label>
            <label className="block text-xs font-bold">
              Topik Bahasan {mode === "chat" ? "(Opsional)" : "(Wajib)"}
              <input type="text" value={topik} onChange={(e) => setTopik(e.target.value)} placeholder="Contoh: Teks Prosedur / Persamaan Linear" className={inputClass(isDark)} />
            </label>
          </div>

          {mode !== "chat" ? (
            <form onSubmit={runGenerator} className="mt-4 space-y-4">
              {mode === "soal" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-bold">
                    Jenis Soal
                    <select value={jenisSoal} onChange={(e) => setJenisSoal(e.target.value as "PG" | "ESAI")} className={inputClass(isDark)}>
                      <option value="PG">Pilihan Ganda (A–D) + Kunci &amp; Pembahasan</option>
                      <option value="ESAI">Esai / Uraian + Rubrik Jawaban</option>
                    </select>
                  </label>
                  <label className="block text-xs font-bold">
                    Jumlah Butir Soal (1–10)
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={jumlahSoal}
                      onChange={(e) => setJumlahSoal(Number(e.target.value))}
                      className={inputClass(isDark)}
                    />
                  </label>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs opacity-75">
                  Terhubung aman melalui endpoint server lembaga (`/api/school/ai-assistant`).
                </span>
                <button type="submit" disabled={busy} className="master-primary inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-50">
                  <Bot size={16} />
                  {busy ? "Menyusun Materi..." : mode === "modul" ? "Buat Modul Ajar" : "Generate Latihan Soal"}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-5 space-y-4">
              <div className={`max-h-[400px] space-y-3 overflow-y-auto rounded-2xl border p-4 ${isDark ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-slate-50/80"}`}>
                {chatMessages.length === 0 ? (
                  <p className="py-8 text-center text-xs opacity-70">
                    Mulai percakapan dengan Tutor AI kesetaraan — tanyakan konsep materi, contoh soal, atau cara penyampaian KBM.
                  </p>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "ml-auto max-w-[85%] bg-sky-700 text-white"
                          : isDark
                            ? "mr-auto max-w-[90%] border border-slate-700 bg-slate-900 text-slate-100"
                            : "mr-auto max-w-[90%] border border-slate-200 bg-white text-slate-900 shadow-xs"
                      }`}
                    >
                      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider opacity-70">
                        {msg.role === "user" ? "Anda" : `Tutor AI (${msg.source === "ai-provider" ? "AI Provider" : "Kurikulum Kesetaraan"})`}
                      </p>
                      {msg.content}
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={sendChat} className="flex gap-2">
                <input
                  type="text"
                  value={chatPrompt}
                  onChange={(e) => setChatPrompt(e.target.value)}
                  placeholder="Ketik pertanyaan materi atau metode mengajar..."
                  className={`${inputClass(isDark)} mt-0 flex-1`}
                />
                <button type="submit" disabled={busy || !chatPrompt.trim()} className="master-primary inline-flex items-center gap-2 px-4 py-2.5 disabled:opacity-50">
                  <Send size={15} />
                  {busy ? "..." : "Kirim"}
                </button>
              </form>
            </div>
          )}
        </div>

        {mode !== "chat" && generatedOutput && (
          <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-3">
              <div>
                <h3 className="text-sm font-bold">Hasil Penyusunan Materi</h3>
                <p className="text-[11px] opacity-70">
                  Sumber: {outputSource === "ai-provider" ? "AI Provider Aktif" : "Template Terstruktur Kurikulum Kesetaraan"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold hover:bg-slate-100"
                >
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  {copied ? "Tersalin" : "Salin Teks"}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-900 hover:bg-sky-100"
                >
                  <Printer size={14} />
                  Cetak
                </button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{generatedOutput}</pre>
          </div>
        )}
      </div>

      {generatedOutput && (
        <div className="print-only bg-white p-8 text-slate-900">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{generatedOutput}</pre>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 2. MANAJEMEN ASET & SARPRAS (PRO)
// ==========================================
type AsetRow = {
  id: string;
  kodeInventaris: string;
  namaBarang: string;
  kategori: "Elektronik" | "Meubelair" | "Alat Praktik" | "Gedung & Ruang" | "Lainnya";
  jumlah: number;
  kondisi: "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT";
  lokasiRuangan: string;
  tahunPengadaan: number;
  sumberPengadaan: "BOSP" | "Mandiri" | "Hibah" | "Lainnya";
  catatan: string | null;
};

const KONDISI_LABELS: Record<AsetRow["kondisi"], string> = {
  BAIK: "Baik",
  RUSAK_RINGAN: "Rusak Ringan",
  RUSAK_BERAT: "Rusak Berat",
};

export function ManajemenAsetView() {
  const isDark = useTenantTheme() === "dark";
  const [schoolName, setSchoolName] = useState("PKBM");
  const [assets, setAssets] = useState<AsetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filterKategori, setFilterKategori] = useState("ALL");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AsetRow | null>(null);
  const [kodeInventaris, setKodeInventaris] = useState("");
  const [namaBarang, setNamaBarang] = useState("");
  const [kategori, setKategori] = useState<AsetRow["kategori"]>("Elektronik");
  const [jumlah, setJumlah] = useState(1);
  const [kondisi, setKondisi] = useState<AsetRow["kondisi"]>("BAIK");
  const [lokasiRuangan, setLokasiRuangan] = useState("");
  const [tahunPengadaan, setTahunPengadaan] = useState(new Date().getFullYear());
  const [sumberPengadaan, setSumberPengadaan] = useState<AsetRow["sumberPengadaan"]>("BOSP");
  const [catatan, setCatatan] = useState("");

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/sekolah/aset", { signal });
      const body = (await res.json()) as { sekolah?: { nama?: string }; assets?: AsetRow[]; error?: string };
      if (!res.ok) throw new Error(body.error || "Data aset belum dapat dimuat.");
      if (body.sekolah?.nama) setSchoolName(body.sekolah.nama);
      setAssets(body.assets ?? []);
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Inventaris sarpras gagal dimuat."));
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
      totalUnit: assets.reduce((acc, a) => acc + a.jumlah, 0),
      baik: assets.filter((a) => a.kondisi === "BAIK").reduce((acc, a) => acc + a.jumlah, 0),
      rusakRingan: assets.filter((a) => a.kondisi === "RUSAK_RINGAN").reduce((acc, a) => acc + a.jumlah, 0),
      rusakBerat: assets.filter((a) => a.kondisi === "RUSAK_BERAT").reduce((acc, a) => acc + a.jumlah, 0),
    };
  }, [assets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (filterKategori !== "ALL" && a.kategori !== filterKategori) return false;
      if (!q) return true;
      return (
        a.namaBarang.toLowerCase().includes(q) ||
        a.kodeInventaris.toLowerCase().includes(q) ||
        a.lokasiRuangan.toLowerCase().includes(q)
      );
    });
  }, [assets, filterKategori, search]);

  function openCreate() {
    setEditing(null);
    setKodeInventaris("");
    setNamaBarang("");
    setKategori("Elektronik");
    setJumlah(1);
    setKondisi("BAIK");
    setLokasiRuangan("");
    setTahunPengadaan(new Date().getFullYear());
    setSumberPengadaan("BOSP");
    setCatatan("");
    setModalOpen(true);
  }

  function openEdit(row: AsetRow) {
    setEditing(row);
    setKodeInventaris(row.kodeInventaris);
    setNamaBarang(row.namaBarang);
    setKategori(row.kategori);
    setJumlah(row.jumlah);
    setKondisi(row.kondisi);
    setLokasiRuangan(row.lokasiRuangan);
    setTahunPengadaan(row.tahunPengadaan);
    setSumberPengadaan(row.sumberPengadaan);
    setCatatan(row.catatan ?? "");
    setModalOpen(true);
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const endpoint = editing ? `/api/sekolah/aset/${editing.id}` : "/api/sekolah/aset";
      const res = await fetchWithTimeout(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kodeInventaris,
          namaBarang,
          kategori,
          jumlah: Number(jumlah),
          kondisi,
          lokasiRuangan,
          tahunPengadaan: Number(tahunPengadaan),
          sumberPengadaan,
          catatan,
        }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Data aset gagal disimpan.");
      setModalOpen(false);
      setNotice(body.message || "Data inventaris disimpan.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Data aset gagal disimpan."));
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(id: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/aset/${id}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menghapus aset.");
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setNotice(body.message || "Aset dihapus.");
    } catch (failure) {
      setError(describeFetchError(failure, "Aset gagal dihapus."));
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = ["Kode Inventaris", "Nama Barang", "Kategori", "Jumlah", "Kondisi", "Lokasi Ruangan", "Tahun", "Sumber Dana"];
    const rows = filtered.map((a) => [
      escapeCsv(a.kodeInventaris),
      escapeCsv(a.namaBarang),
      escapeCsv(a.kategori),
      escapeCsv(a.jumlah),
      escapeCsv(KONDISI_LABELS[a.kondisi]),
      escapeCsv(a.lokasiRuangan),
      escapeCsv(a.tahunPengadaan),
      escapeCsv(a.sumberPengadaan),
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kartu-inventaris-ruangan-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        <DashboardHero
          eyebrow="SARANA & PRASARANA LEMBAGA (PAKET PRO)"
          title="Manajemen Aset & Sarpras (KIR)"
          description="Kelola inventaris aset lembaga berdasarkan ruangan, kondisi barang, tahun perolehan, dan sumber dana BOSP/Mandiri/Hibah."
          action={
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className="dashboard-hero-action dashboard-hero-secondary disabled:opacity-50">
                <Download size={16} />
                Ekspor CSV
              </button>
              <button type="button" onClick={() => window.print()} disabled={filtered.length === 0} className="dashboard-hero-action dashboard-hero-secondary disabled:opacity-50">
                <Printer size={16} />
                Cetak KIR
              </button>
              <button type="button" onClick={openCreate} className="dashboard-hero-action">
                <Plus size={16} />
                Tambah Aset
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
                <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Total Unit Aset</p>
                <p className="mt-2 text-3xl font-black tabular-nums">{stats.totalUnit}</p>
              </div>
              <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
                <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Kondisi Baik</p>
                <p className="mt-2 text-3xl font-black tabular-nums text-emerald-600">{stats.baik}</p>
              </div>
              <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
                <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Rusak Ringan</p>
                <p className="mt-2 text-3xl font-black tabular-nums text-amber-600">{stats.rusakRingan}</p>
              </div>
              <div className={`rounded-2xl p-5 ${panelClass(isDark)}`}>
                <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Rusak Berat</p>
                <p className="mt-2 text-3xl font-black tabular-nums text-rose-600">{stats.rusakBerat}</p>
              </div>
            </div>

            <div className={`rounded-2xl p-4 sm:p-5 ${panelClass(isDark)}`}>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari kode / barang / ruangan..."
                    className={`${inputClass(isDark)} mt-0 w-64 pl-9`}
                  />
                </div>
                <select value={filterKategori} onChange={(e) => setFilterKategori(e.target.value)} className={`${inputClass(isDark)} mt-0 w-48`}>
                  <option value="ALL">Semua Kategori</option>
                  <option value="Elektronik">Elektronik</option>
                  <option value="Meubelair">Meubelair</option>
                  <option value="Alat Praktik">Alat Praktik</option>
                  <option value="Gedung & Ruang">Gedung &amp; Ruang</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  title="Belum ada aset sarpras tercatat"
                  description="Catat inventaris laptop, proyektor, meja belajar, dan fasilitas ruangan lembaga Anda."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider opacity-70">
                        <th className="px-3 py-3">Kode</th>
                        <th className="px-3 py-3">Nama Barang &amp; Kategori</th>
                        <th className="px-3 py-3 text-center">Unit</th>
                        <th className="px-3 py-3">Kondisi</th>
                        <th className="px-3 py-3">Lokasi Ruangan</th>
                        <th className="px-3 py-3">Pengadaan</th>
                        <th className="px-3 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70">
                      {filtered.map((row) => (
                        <tr key={row.id}>
                          <td className="px-3 py-3 font-mono font-bold">{row.kodeInventaris}</td>
                          <td className="px-3 py-3">
                            <p className="font-bold">{row.namaBarang}</p>
                            <p className="text-[11px] opacity-70">{row.kategori}</p>
                          </td>
                          <td className="px-3 py-3 text-center font-black tabular-nums">{row.jumlah}</td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                                row.kondisi === "BAIK"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : row.kondisi === "RUSAK_RINGAN"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {KONDISI_LABELS[row.kondisi]}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-semibold">{row.lokasiRuangan}</td>
                          <td className="px-3 py-3">
                            {row.tahunPengadaan} · {row.sumberPengadaan}
                          </td>
                          <td className="px-3 py-3 text-right">
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
                                onClick={() => void removeAsset(row.id)}
                                aria-label="Hapus aset"
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
      </div>

      <div className="print-only bg-white p-6 text-slate-900">
        <div className="border-b-2 border-slate-900 pb-3 text-center">
          <h2 className="text-lg font-black uppercase">DAFTAR KARTU INVENTARIS RUANGAN (KIR)</h2>
          <p className="text-sm font-bold">{schoolName}</p>
        </div>
        <table className="mt-4 w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-400 px-2 py-1.5 text-left">Kode</th>
              <th className="border border-slate-400 px-2 py-1.5 text-left">Nama Barang</th>
              <th className="border border-slate-400 px-2 py-1.5 text-left">Kategori</th>
              <th className="border border-slate-400 px-2 py-1.5 text-center">Jml</th>
              <th className="border border-slate-400 px-2 py-1.5 text-left">Kondisi</th>
              <th className="border border-slate-400 px-2 py-1.5 text-left">Lokasi</th>
              <th className="border border-slate-400 px-2 py-1.5 text-left">Tahun / Sumber</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id}>
                <td className="border border-slate-400 px-2 py-1 font-mono">{a.kodeInventaris}</td>
                <td className="border border-slate-400 px-2 py-1 font-semibold">{a.namaBarang}</td>
                <td className="border border-slate-400 px-2 py-1">{a.kategori}</td>
                <td className="border border-slate-400 px-2 py-1 text-center">{a.jumlah}</td>
                <td className="border border-slate-400 px-2 py-1">{KONDISI_LABELS[a.kondisi]}</td>
                <td className="border border-slate-400 px-2 py-1">{a.lokasiRuangan}</td>
                <td className="border border-slate-400 px-2 py-1">
                  {a.tahunPengadaan} ({a.sumberPengadaan})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <SchoolModal onClose={() => setModalOpen(false)} title={editing ? "Edit Data Aset Sarpras" : "Tambah Aset & Sarpras"}>
          <form onSubmit={submitForm} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Kode Inventaris (Kosongkan untuk otomatis)
                <input
                  type="text"
                  value={kodeInventaris}
                  onChange={(e) => setKodeInventaris(e.target.value)}
                  placeholder="INV-2026-001"
                  className={inputClass(false)}
                />
              </label>
              <label className="block text-sm font-semibold">
                Nama Barang / Aset
                <input required type="text" value={namaBarang} onChange={(e) => setNamaBarang(e.target.value)} placeholder="Laptop Lab CBT / Meja Lipat" className={inputClass(false)} />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm font-semibold">
                Kategori
                <select value={kategori} onChange={(e) => setKategori(e.target.value as AsetRow["kategori"])} className={inputClass(false)}>
                  <option value="Elektronik">Elektronik</option>
                  <option value="Meubelair">Meubelair</option>
                  <option value="Alat Praktik">Alat Praktik</option>
                  <option value="Gedung & Ruang">Gedung &amp; Ruang</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Jumlah Unit
                <input required type="number" min={1} max={10000} value={jumlah} onChange={(e) => setJumlah(Number(e.target.value))} className={inputClass(false)} />
              </label>
              <label className="block text-sm font-semibold">
                Kondisi
                <select value={kondisi} onChange={(e) => setKondisi(e.target.value as AsetRow["kondisi"])} className={inputClass(false)}>
                  <option value="BAIK">Baik</option>
                  <option value="RUSAK_RINGAN">Rusak Ringan</option>
                  <option value="RUSAK_BERAT">Rusak Berat</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm font-semibold">
                Lokasi Ruangan
                <input required type="text" value={lokasiRuangan} onChange={(e) => setLokasiRuangan(e.target.value)} placeholder="Ruang Kelas A / Lab Komputer" className={inputClass(false)} />
              </label>
              <label className="block text-sm font-semibold">
                Tahun Pengadaan
                <input required type="number" min={1980} max={2100} value={tahunPengadaan} onChange={(e) => setTahunPengadaan(Number(e.target.value))} className={inputClass(false)} />
              </label>
              <label className="block text-sm font-semibold">
                Sumber Pengadaan
                <select value={sumberPengadaan} onChange={(e) => setSumberPengadaan(e.target.value as AsetRow["sumberPengadaan"])} className={inputClass(false)}>
                  <option value="BOSP">BOSP Kesetaraan</option>
                  <option value="Mandiri">Dana Mandiri</option>
                  <option value="Hibah">Hibah Pemerintah / Mitra</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Catatan Tambahan
              <input type="text" value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputClass(false)} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                Batal
              </button>
              <button type="submit" disabled={busy} className="master-primary px-5 py-2.5 disabled:opacity-50">
                {busy ? "Menyimpan..." : "Simpan Aset"}
              </button>
            </div>
          </form>
        </SchoolModal>
      )}
    </div>
  );
}

// ==========================================
// 3. RUANG DISKUSI (BASIC+)
// ==========================================
type BalasanRow = {
  id: string;
  isi: string;
  penulisNama: string;
  penulisPeran: string;
  createdAt: string;
};

type TopikRow = {
  id: string;
  kelasId: string | null;
  kategori: "UMUM" | "KELAS" | "PENGUMUMAN";
  judul: string;
  isi: string;
  penulisNama: string;
  penulisPeran: string;
  disematkan: boolean;
  ditutup: boolean;
  createdAt: string;
  balasan: BalasanRow[];
};

export function RuangDiskusiView() {
  const isDark = useTenantTheme() === "dark";
  const [topics, setTopics] = useState<TopikRow[]>([]);
  const [kelasList, setKelasList] = useState<Array<{ id: string; nama: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filterKategori, setFilterKategori] = useState("ALL");
  const [filterKelas, setFilterKelas] = useState("ALL");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [judul, setJudul] = useState("");
  const [kategori, setKategori] = useState<TopikRow["kategori"]>("UMUM");
  const [kelasId, setKelasId] = useState("");
  const [isi, setIsi] = useState("");
  const [disematkan, setDisematkan] = useState(false);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/sekolah/diskusi", { signal });
      const body = (await res.json()) as { topics?: TopikRow[]; kelas?: Array<{ id: string; nama: string }>; error?: string };
      if (!res.ok) throw new Error(body.error || "Forum diskusi belum dapat dimuat.");
      const list = body.topics ?? [];
      setTopics(list);
      setKelasList(body.kelas ?? []);
      setSelectedTopicId((prev) => (prev && list.some((t) => t.id === prev) ? prev : list[0]?.id ?? null));
      setError("");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Ruang diskusi gagal dimuat."));
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

  const kelasMap = useMemo(() => new Map(kelasList.map((k) => [k.id, k.nama])), [kelasList]);

  const filteredTopics = useMemo(() => {
    return topics.filter((t) => {
      if (filterKategori !== "ALL" && t.kategori !== filterKategori) return false;
      if (filterKelas !== "ALL" && (t.kelasId ?? "") !== filterKelas) return false;
      return true;
    });
  }, [topics, filterKategori, filterKelas]);

  const activeTopic = useMemo(
    () => filteredTopics.find((t) => t.id === selectedTopicId) ?? filteredTopics[0] ?? null,
    [filteredTopics, selectedTopicId],
  );

  async function submitNewTopic(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/diskusi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul,
          kategori,
          kelasId: kategori === "KELAS" ? kelasId || null : null,
          isi,
          disematkan,
        }),
      });
      const body = (await res.json()) as { topic?: TopikRow; error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Topik diskusi gagal dibuat.");
      setModalOpen(false);
      setJudul("");
      setIsi("");
      setDisematkan(false);
      if (body.topic) setSelectedTopicId(body.topic.id);
      setNotice(body.message || "Utas diskusi diterbitkan.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Topik diskusi gagal diterbitkan."));
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(event: React.FormEvent) {
    event.preventDefault();
    if (!activeTopic || !replyText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/diskusi/${activeTopic.id}/balasan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isi: replyText }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal mengirim balasan.");
      setReplyText("");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Balasan gagal dikirim."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleTopicFlag(topic: TopikRow, field: "disematkan" | "ditutup") {
    setBusy(true);
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/diskusi/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !topic[field] }),
      });
      const body = (await res.json()) as { topic?: TopikRow; error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal memperbarui utas.");
      if (body.topic) {
        setTopics((prev) => prev.map((t) => (t.id === topic.id ? body.topic! : t)));
      }
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal memperbarui status topik."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTopic(id: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/sekolah/diskusi/${id}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menghapus utas.");
      setNotice(body.message || "Topik dihapus.");
      await loadData();
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal menghapus topik."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="KOLABORASI TUTOR & WARGA BELAJAR"
        title="Ruang Diskusi Kelas & Lembaga"
        description="Forum tanya-jawab pembelajaran, pengumuman penting lembaga, dan diskusi kolaboratif antar kelas PKBM."
        action={
          <button type="button" onClick={() => setModalOpen(true)} className="dashboard-hero-action">
            <Plus size={16} />
            Buat Topik Diskusi
          </button>
        }
      />

      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}

      <div className={`flex flex-wrap items-center gap-3 rounded-2xl p-4 ${panelClass(isDark)}`}>
        <select value={filterKategori} onChange={(e) => setFilterKategori(e.target.value)} className={`${inputClass(isDark)} mt-0 w-48`}>
          <option value="ALL">Semua Kategori</option>
          <option value="PENGUMUMAN">Pengumuman Lembaga</option>
          <option value="KELAS">Diskusi Kelas</option>
          <option value="UMUM">Forum Umum</option>
        </select>
        <select value={filterKelas} onChange={(e) => setFilterKelas(e.target.value)} className={`${inputClass(isDark)} mt-0 w-52`}>
          <option value="ALL">Semua Kelas</option>
          {kelasList.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nama}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <CardGridSkeleton count={3} columns={3} />
      ) : filteredTopics.length === 0 ? (
        <EmptyState
          title="Belum ada topik diskusi"
          description="Mulai percakapan baru untuk berdiskusi mengenai materi belajar atau pengumuman lembaga."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-5">
            {filteredTopics.map((topic) => {
              const selected = activeTopic?.id === topic.id;
              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setSelectedTopicId(topic.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-sky-500 bg-sky-50/90 text-slate-900 ring-1 ring-sky-400"
                      : panelClass(isDark)
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {topic.disematkan && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-900">
                          <Pin size={10} />
                          Disematkan
                        </span>
                      )}
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-extrabold text-sky-900">
                        {topic.kategori === "KELAS" && topic.kelasId
                          ? kelasMap.get(topic.kelasId) ?? "Kelas"
                          : topic.kategori}
                      </span>
                      {topic.ditutup && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">Ditutup</span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold opacity-70">{topic.balasan.length} balasan</span>
                  </div>
                  <p className="mt-2 text-sm font-bold">{topic.judul}</p>
                  <p className="mt-1 line-clamp-2 text-xs opacity-75">{topic.isi}</p>
                  <p className="mt-2 text-[11px] opacity-65">
                    Oleh {topic.penulisNama} ({topic.penulisPeran})
                  </p>
                </button>
              );
            })}
          </div>

          <div className={`rounded-2xl p-5 lg:col-span-7 ${panelClass(isDark)}`}>
            {activeTopic ? (
              <div className="flex h-full flex-col justify-between space-y-4">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/70 pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-extrabold text-sky-900">
                          {activeTopic.kategori === "KELAS" && activeTopic.kelasId
                            ? kelasMap.get(activeTopic.kelasId) ?? "Kelas"
                            : activeTopic.kategori}
                        </span>
                        <span className="text-xs opacity-70">
                          {activeTopic.penulisNama} · {new Date(activeTopic.createdAt).toLocaleString("id-ID")}
                        </span>
                      </div>
                      <h3 className="mt-2 text-lg font-extrabold">{activeTopic.judul}</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleTopicFlag(activeTopic, "disematkan")}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-bold hover:bg-slate-100"
                      >
                        <Pin size={12} />
                        {activeTopic.disematkan ? "Lepas Pin" : "Sematkan"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleTopicFlag(activeTopic, "ditutup")}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-bold hover:bg-slate-100"
                      >
                        {activeTopic.ditutup ? <Unlock size={12} /> : <Lock size={12} />}
                        {activeTopic.ditutup ? "Buka" : "Tutup"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void deleteTopic(activeTopic.id)}
                        aria-label="Hapus topik"
                        className="rounded-lg border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{activeTopic.isi}</p>

                  <div className="mt-6 space-y-2.5 border-t border-slate-200/70 pt-4">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider opacity-70">
                      Balasan Diskusi ({activeTopic.balasan.length})
                    </h4>
                    {activeTopic.balasan.length === 0 ? (
                      <p className="text-xs opacity-65">Belum ada balasan. Jadilah yang pertama menanggapi topik ini.</p>
                    ) : (
                      <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                        {activeTopic.balasan.map((reply) => (
                          <div
                            key={reply.id}
                            className={`rounded-xl border p-3 text-xs ${
                              isDark ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold">
                                {reply.penulisNama}{" "}
                                <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-extrabold text-sky-900">
                                  {reply.penulisPeran}
                                </span>
                              </span>
                              <span className="text-[10px] opacity-65">{new Date(reply.createdAt).toLocaleString("id-ID")}</span>
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{reply.isi}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {activeTopic.ditutup ? (
                  <p className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700">
                    Diskusi pada utas ini telah ditutup.
                  </p>
                ) : (
                  <form onSubmit={submitReply} className="flex gap-2 pt-2">
                    <input
                      type="text"
                      required
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Tulis balasan atau tanggapan Anda..."
                      className={`${inputClass(isDark)} mt-0 flex-1`}
                    />
                    <button type="submit" disabled={busy || !replyText.trim()} className="master-primary inline-flex items-center gap-1.5 px-4 py-2.5 disabled:opacity-50">
                      <Send size={14} />
                      Balas
                    </button>
                  </form>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {modalOpen && (
        <SchoolModal onClose={() => setModalOpen(false)} title="Buat Topik Diskusi Baru">
          <form onSubmit={submitNewTopic} className="space-y-4">
            <label className="block text-sm font-semibold">
              Judul Topik
              <input required type="text" value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="Jadwal Tutorial Akhir Pekan / Pertanyaan Modul 3..." className={inputClass(false)} />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Kategori
                <select value={kategori} onChange={(e) => setKategori(e.target.value as TopikRow["kategori"])} className={inputClass(false)}>
                  <option value="UMUM">Forum Umum</option>
                  <option value="KELAS">Diskusi Kelas Tertentu</option>
                  <option value="PENGUMUMAN">Pengumuman Lembaga</option>
                </select>
              </label>
              {kategori === "KELAS" && (
                <label className="block text-sm font-semibold">
                  Kelas Target
                  <select value={kelasId} onChange={(e) => setKelasId(e.target.value)} className={inputClass(false)}>
                    <option value="">-- Pilih Kelas --</option>
                    {kelasList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className="block text-sm font-semibold">
              Isi Pesan / Pembuka Diskusi
              <textarea required rows={4} value={isi} onChange={(e) => setIsi(e.target.value)} className={inputClass(false)} />
            </label>
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={disematkan} onChange={(e) => setDisematkan(e.target.checked)} />
              Sematkan di bagian atas forum (Pin Thread)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                Batal
              </button>
              <button type="submit" disabled={busy} className="master-primary px-5 py-2.5 disabled:opacity-50">
                {busy ? "Menerbitkan..." : "Terbitkan Topik"}
              </button>
            </div>
          </form>
        </SchoolModal>
      )}
    </div>
  );
}
