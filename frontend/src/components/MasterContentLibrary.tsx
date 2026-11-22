import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { describeFetchError, fetchWithTimeout } from "./fetchWithTimeout";
import {
  JENJANG_OPTIONS,
  KATEGORI_OPTIONS,
  PKBM_MAPEL_PRESETS,
  TINGKAT_BY_JENJANG,
  downloadMasterBankSoalTemplate,
  downloadMasterModulTemplate,
  jenjangBadgeCls,
  jenjangLabel,
  kategoriBadgeCls,
  kategoriLabel,
  parseMasterBankSoalFile,
  parseMasterModulFile,
  type MasterBankSoalItem,
  type MasterButirSoalItem,
  type MasterJenjang,
  type MasterKategori,
  type MasterModulItem,
  type ParsedBankSoalPacket,
  type ParsedModulImportItem,
} from "./masterContentData";

type ToastState = { kind: "success" | "error"; text: string } | null;

type LibraryPayload = {
  modul: MasterModulItem[];
  bankSoal: MasterBankSoalItem[];
  mataPelajaranList: string[];
  summary: { totalModul: number; totalBankSoal: number; totalButirSoal: number };
};

export function MasterContentLibrary() {
  const [data, setData] = useState<LibraryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastState>(null);

  const [activeTab, setActiveTab] = useState<"soal" | "modul">("soal");
  const [filterJenjang, setFilterJenjang] = useState<string>("");
  const [filterKategori, setFilterKategori] = useState<string>("");
  const [filterMapel, setFilterMapel] = useState<string>("");
  const [search, setSearch] = useState("");

  // Modul CRUD modal
  const [modulModalOpen, setModulModalOpen] = useState(false);
  const [editingModul, setEditingModul] = useState<MasterModulItem | null>(null);
  const [modulJenjang, setModulJenjang] = useState<MasterJenjang>("PAKET_C");
  const [modulTingkat, setModulTingkat] = useState("Kelas 12");
  const [modulMapel, setModulMapel] = useState("Bahasa Indonesia");
  const [modulJudul, setModulJudul] = useState("");
  const [modulDeskripsi, setModulDeskripsi] = useState("");
  const [modulKonten, setModulKonten] = useState("");
  const [modulFileUrl, setModulFileUrl] = useState("");
  const [savingModul, setSavingModul] = useState(false);

  // Bank Soal CRUD modal
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<MasterBankSoalItem | null>(null);
  const [bankJenjang, setBankJenjang] = useState<MasterJenjang>("PAKET_C");
  const [bankTingkat, setBankTingkat] = useState("Kelas 12");
  const [bankMapel, setBankMapel] = useState("Bahasa Indonesia");
  const [bankKategori, setBankKategori] = useState<MasterKategori>("UTS");
  const [bankJudul, setBankJudul] = useState("");
  const [bankDeskripsi, setBankDeskripsi] = useState("");
  const [bankDurasi, setBankDurasi] = useState(60);
  const [bankKkm, setBankKkm] = useState(75);
  const [savingBank, setSavingBank] = useState(false);

  // Question editor modal
  const [activeBankDetail, setActiveBankDetail] = useState<MasterBankSoalItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [soalTipe, setSoalTipe] = useState<"PG" | "ESAI">("PG");
  const [soalTeks, setSoalTeks] = useState("");
  const [soalBobot, setSoalBobot] = useState(10);
  const [soalA, setSoalA] = useState("");
  const [soalB, setSoalB] = useState("");
  const [soalC, setSoalC] = useState("");
  const [soalD, setSoalD] = useState("");
  const [soalE, setSoalE] = useState("");
  const [soalKunci, setSoalKunci] = useState("A");
  const [soalPembahasan, setSoalPembahasan] = useState("");
  const [savingSoal, setSavingSoal] = useState(false);

  // AI Draft Generator modal
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"soal" | "modul">("soal");
  const [aiJenjang, setAiJenjang] = useState<MasterJenjang>("PAKET_C");
  const [aiTingkat, setAiTingkat] = useState("Kelas 12");
  const [aiMapel, setAiMapel] = useState("Bahasa Indonesia");
  const [aiKategori, setAiKategori] = useState<MasterKategori>("UTS");
  const [aiTopik, setAiTopik] = useState("");
  const [aiJumlah, setAiJumlah] = useState(5);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiDraftSoal, setAiDraftSoal] = useState<{
    jenjang: MasterJenjang;
    tingkatKelas: string;
    mataPelajaran: string;
    kategoriUjian: MasterKategori;
    judul: string;
    deskripsi: string | null;
    durasiMenit: number;
    kkm: number;
    butirSoal: MasterButirSoalItem[];
  } | null>(null);
  const [aiDraftModul, setAiDraftModul] = useState<{
    jenjang: MasterJenjang;
    tingkatKelas: string;
    mataPelajaran: string;
    kategoriUjian: MasterKategori;
    judul: string;
    deskripsi: string;
    konten: string;
  } | null>(null);

  // Bulk Excel/JSON Import modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<"bank-soal" | "modul">("bank-soal");
  const [importJenjang, setImportJenjang] = useState<MasterJenjang>("PAKET_C");
  const [importTingkat, setImportTingkat] = useState("Kelas 12");
  const [importMapel, setImportMapel] = useState("Bahasa Indonesia");
  const [importKategori, setImportKategori] = useState<MasterKategori>("UTS");
  const [importJudul, setImportJudul] = useState("");
  const [parsedModuls, setParsedModuls] = useState<ParsedModulImportItem[]>([]);
  const [parsedPackets, setParsedPackets] = useState<ParsedBankSoalPacket[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importBusy, setImportBusy] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterJenjang) params.set("jenjang", filterJenjang);
      if (filterKategori) params.set("kategori", filterKategori);
      if (filterMapel) params.set("mapel", filterMapel);
      if (search.trim()) params.set("q", search.trim());
      const url = `/api/master/pustaka-konten${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetchWithTimeout(url);
      const body = (await res.json().catch(() => null)) as (LibraryPayload & { error?: string }) | null;
      if (!res.ok || !body) {
        throw new Error(body?.error || "Pustaka Konten Pusat belum dapat dimuat.");
      }
      setData(body);
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Pustaka Konten Pusat belum dapat dimuat."));
    } finally {
      setLoading(false);
    }
  }, [filterJenjang, filterKategori, filterMapel, search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function openBankDetail(id: string) {
    setLoadingDetail(true);
    try {
      const res = await fetchWithTimeout(`/api/master/pustaka-konten/bank-soal/${encodeURIComponent(id)}`);
      const body = (await res.json().catch(() => null)) as { bankSoal?: MasterBankSoalItem; error?: string } | null;
      if (!res.ok || !body?.bankSoal) {
        throw new Error(body?.error || "Detail paket bank soal tidak dapat dimuat.");
      }
      setActiveBankDetail(body.bankSoal);
    } catch (failure: unknown) {
      setToast({ kind: "error", text: describeFetchError(failure, "Gagal membuka detail soal.") });
    } finally {
      setLoadingDetail(false);
    }
  }

  function openNewModulModal() {
    setEditingModul(null);
    setModulJenjang("PAKET_C");
    setModulTingkat("Kelas 12");
    setModulMapel("Bahasa Indonesia");
    setModulJudul("");
    setModulDeskripsi("");
    setModulKonten("");
    setModulFileUrl("");
    setModulModalOpen(true);
  }

  function openEditModulModal(item: MasterModulItem) {
    setEditingModul(item);
    setModulJenjang(item.jenjang);
    setModulTingkat(item.tingkatKelas);
    setModulMapel(item.mataPelajaran);
    setModulJudul(item.judul);
    setModulDeskripsi(item.deskripsi ?? "");
    setModulKonten(item.konten ?? "");
    setModulFileUrl(item.fileUrl ?? "");
    setModulModalOpen(true);
  }

  async function handleSaveModul(event: React.FormEvent) {
    event.preventDefault();
    setSavingModul(true);
    try {
      const url = editingModul
        ? `/api/master/pustaka-konten/modul/${encodeURIComponent(editingModul.id)}`
        : "/api/master/pustaka-konten/modul";
      const res = await fetchWithTimeout(url, {
        method: editingModul ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jenjang: modulJenjang,
          tingkatKelas: modulTingkat,
          mataPelajaran: modulMapel,
          kategoriUjian: "MATERI",
          judul: modulJudul,
          deskripsi: modulDeskripsi,
          konten: modulKonten,
          fileUrl: modulFileUrl,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menyimpan modul ajar pusat.");
      setToast({ kind: "success", text: body?.message || "Modul ajar pusat disimpan." });
      setModulModalOpen(false);
      await reload();
    } catch (failure: unknown) {
      setToast({ kind: "error", text: describeFetchError(failure, "Gagal menyimpan modul.") });
    } finally {
      setSavingModul(false);
    }
  }

  async function handleDeleteModul(item: MasterModulItem) {
    try {
      const res = await fetchWithTimeout(`/api/master/pustaka-konten/modul/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menghapus modul.");
      setToast({ kind: "success", text: body?.message || "Modul dihapus." });
      await reload();
    } catch (failure: unknown) {
      setToast({ kind: "error", text: describeFetchError(failure, "Gagal menghapus modul.") });
    }
  }

  function openNewBankModal() {
    setEditingBank(null);
    setBankJenjang("PAKET_C");
    setBankTingkat("Kelas 12");
    setBankMapel("Bahasa Indonesia");
    setBankKategori("UTS");
    setBankJudul("");
    setBankDeskripsi("");
    setBankDurasi(60);
    setBankKkm(75);
    setBankModalOpen(true);
  }

  function openEditBankModal(item: MasterBankSoalItem) {
    setEditingBank(item);
    setBankJenjang(item.jenjang);
    setBankTingkat(item.tingkatKelas);
    setBankMapel(item.mataPelajaran);
    setBankKategori(item.kategoriUjian === "MATERI" ? "UTS" : item.kategoriUjian);
    setBankJudul(item.judul);
    setBankDeskripsi(item.deskripsi ?? "");
    setBankDurasi(item.durasiMenit);
    setBankKkm(item.kkm);
    setBankModalOpen(true);
  }

  async function handleSaveBank(event: React.FormEvent) {
    event.preventDefault();
    setSavingBank(true);
    try {
      const url = editingBank
        ? `/api/master/pustaka-konten/bank-soal/${encodeURIComponent(editingBank.id)}`
        : "/api/master/pustaka-konten/bank-soal";
      const res = await fetchWithTimeout(url, {
        method: editingBank ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jenjang: bankJenjang,
          tingkatKelas: bankTingkat,
          mataPelajaran: bankMapel,
          kategoriUjian: bankKategori,
          judul: bankJudul,
          deskripsi: bankDeskripsi,
          durasiMenit: bankDurasi,
          kkm: bankKkm,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        bankSoal?: MasterBankSoalItem;
        message?: string;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menyimpan paket bank soal.");
      setToast({ kind: "success", text: body?.message || "Paket bank soal disimpan." });
      setBankModalOpen(false);
      await reload();
      if (!editingBank && body?.bankSoal?.id) {
        void openBankDetail(body.bankSoal.id);
      }
    } catch (failure: unknown) {
      setToast({ kind: "error", text: describeFetchError(failure, "Gagal menyimpan paket bank soal.") });
    } finally {
      setSavingBank(false);
    }
  }

  async function handleDeleteBank(item: MasterBankSoalItem) {
    try {
      const res = await fetchWithTimeout(`/api/master/pustaka-konten/bank-soal/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menghapus paket bank soal.");
      setToast({ kind: "success", text: body?.message || "Paket bank soal dihapus." });
      if (activeBankDetail?.id === item.id) setActiveBankDetail(null);
      await reload();
    } catch (failure: unknown) {
      setToast({ kind: "error", text: describeFetchError(failure, "Gagal menghapus paket bank soal.") });
    }
  }

  async function handleAddButirSoal(event: React.FormEvent) {
    event.preventDefault();
    if (!activeBankDetail) return;
    setSavingSoal(true);
    try {
      const res = await fetchWithTimeout(
        `/api/master/pustaka-konten/bank-soal/${encodeURIComponent(activeBankDetail.id)}/soal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipe: soalTipe,
            teks: soalTeks,
            bobot: soalBobot,
            opsiA: soalTipe === "PG" ? soalA : null,
            opsiB: soalTipe === "PG" ? soalB : null,
            opsiC: soalTipe === "PG" ? soalC : null,
            opsiD: soalTipe === "PG" ? soalD : null,
            opsiE: soalTipe === "PG" ? soalE : null,
            kunciJawaban: soalKunci,
            pembahasan: soalPembahasan,
          }),
        },
      );
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menambahkan butir soal.");
      setSoalTeks("");
      setSoalA("");
      setSoalB("");
      setSoalC("");
      setSoalD("");
      setSoalE("");
      setSoalPembahasan("");
      setToast({ kind: "success", text: body?.message || "Butir soal ditambahkan." });
      await Promise.all([openBankDetail(activeBankDetail.id), reload()]);
    } catch (failure: unknown) {
      setToast({ kind: "error", text: describeFetchError(failure, "Gagal menambah butir soal.") });
    } finally {
      setSavingSoal(false);
    }
  }

  async function handleDeleteButirSoal(soalId: string) {
    if (!activeBankDetail) return;
    try {
      const res = await fetchWithTimeout(
        `/api/master/pustaka-konten/bank-soal/${encodeURIComponent(activeBankDetail.id)}/soal/${encodeURIComponent(soalId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Gagal menghapus butir soal.");
      await Promise.all([openBankDetail(activeBankDetail.id), reload()]);
    } catch (failure: unknown) {
      setToast({ kind: "error", text: describeFetchError(failure, "Gagal menghapus butir soal.") });
    }
  }

  async function handleGenerateAi(event: React.FormEvent) {
    event.preventDefault();
    setAiBusy(true);
    setAiError("");
    setAiDraftSoal(null);
    setAiDraftModul(null);
    try {
      const res = await fetchWithTimeout("/api/master/pustaka-konten/generate-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: aiMode,
          jenjang: aiJenjang,
          tingkatKelas: aiTingkat,
          mataPelajaran: aiMapel,
          kategoriUjian: aiMode === "modul" ? "MATERI" : aiKategori,
          topik: aiTopik,
          jumlahSoal: aiJumlah,
        }),
      }, 45000);
      const body = (await res.json().catch(() => null)) as {
        mode?: "modul" | "soal";
        draft?: Record<string, unknown>;
        error?: string;
      } | null;
      if (!res.ok || !body?.draft) {
        throw new Error(body?.error || "Gagal membuat draf AI.");
      }
      if (body.mode === "modul") {
        setAiDraftModul(body.draft as unknown as NonNullable<typeof aiDraftModul>);
      } else {
        setAiDraftSoal(body.draft as unknown as NonNullable<typeof aiDraftSoal>);
      }
    } catch (failure: unknown) {
      setAiError(describeFetchError(failure, "Pembuatan draf AI belum berhasil."));
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSaveAiDraft() {
    setAiSaving(true);
    setAiError("");
    try {
      if (aiDraftModul) {
        const res = await fetchWithTimeout("/api/master/pustaka-konten/modul", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(aiDraftModul),
        });
        const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        if (!res.ok) throw new Error(body?.error || "Gagal menyimpan draf modul AI.");
        setToast({ kind: "success", text: body?.message || "Draf modul AI tersimpan di Pustaka Pusat." });
        setAiModalOpen(false);
        setAiDraftModul(null);
        setActiveTab("modul");
        await reload();
        return;
      }
      if (aiDraftSoal) {
        const res = await fetchWithTimeout("/api/master/pustaka-konten/bank-soal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(aiDraftSoal),
        });
        const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        if (!res.ok) throw new Error(body?.error || "Gagal menyimpan draf bank soal AI.");
        setToast({ kind: "success", text: body?.message || "Draf bank soal AI tersimpan di Pustaka Pusat." });
        setAiModalOpen(false);
        setAiDraftSoal(null);
        setActiveTab("soal");
        await reload();
      }
    } catch (failure: unknown) {
      setAiError(describeFetchError(failure, "Gagal menyimpan hasil AI."));
    } finally {
      setAiSaving(false);
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportWarnings([]);
    setParsedModuls([]);
    setParsedPackets([]);
    try {
      if (importMode === "modul") {
        const result = await parseMasterModulFile(file, {
          jenjang: importJenjang,
          tingkatKelas: importTingkat,
          mataPelajaran: importMapel,
        });
        setParsedModuls(result.items);
        setImportWarnings(result.warnings);
      } else {
        const result = await parseMasterBankSoalFile(file, {
          jenjang: importJenjang,
          tingkatKelas: importTingkat,
          mataPelajaran: importMapel,
          kategoriUjian: importKategori,
          judul: importJudul,
        });
        setParsedPackets(result.packets);
        setImportWarnings(result.warnings);
      }
    } catch (failure: unknown) {
      setImportWarnings([describeFetchError(failure, "Format file tidak dikenali. Gunakan template Excel atau JSON.")]);
    } finally {
      event.target.value = "";
    }
  }

  async function handleSubmitImport() {
    setImportBusy(true);
    try {
      const payload =
        importMode === "modul"
          ? { mode: "modul", items: parsedModuls }
          : { mode: "bank-soal", packets: parsedPackets };
      const res = await fetchWithTimeout("/api/master/pustaka-konten/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Impor massal gagal.");
      setToast({ kind: "success", text: body?.message || "Impor massal berhasil." });
      setImportModalOpen(false);
      setParsedModuls([]);
      setParsedPackets([]);
      setImportWarnings([]);
      setActiveTab(importMode === "modul" ? "modul" : "soal");
      await reload();
    } catch (failure: unknown) {
      setToast({ kind: "error", text: describeFetchError(failure, "Impor massal gagal.") });
    } finally {
      setImportBusy(false);
    }
  }

  const allMapelOptions = Array.from(new Set([...PKBM_MAPEL_PRESETS, ...(data?.mataPelajaranList ?? [])])).sort((a, b) =>
    a.localeCompare(b, "id-ID"),
  );

  return (
    <div className="space-y-6">
      {toast && (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          className={`fixed bottom-24 right-4 z-50 flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm shadow-2xl md:bottom-6 ${
            toast.kind === "success"
              ? "border-emerald-300 bg-emerald-700 text-white"
              : "border-rose-300 bg-rose-700 text-white"
          }`}
        >
          {toast.kind === "success" ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <p className="flex-1 font-semibold leading-5">{toast.text}</p>
          <button type="button" onClick={() => setToast(null)} aria-label="Tutup" className="rounded-lg p-1 hover:bg-white/15">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Header & Summary */}
      <section className="master-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="master-eyebrow">MASTER CONTENT LIBRARY</p>
            <h2 className="mt-2 text-xl font-bold text-white">Pustaka Konten Pusat (Paket A, B, & C)</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Kelola template Modul Ajar dan Bank Soal siap pakai (UTS, UAS, dan Ujian Akhir / UPK) yang dapat disalin otomatis oleh seluruh PKBM klien.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setAiError("");
                setAiDraftModul(null);
                setAiDraftSoal(null);
                setAiModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-violet-500 hover:to-indigo-500"
            >
              <Sparkles size={15} aria-hidden="true" />
              Generate Draf via AI
            </button>
            <button
              type="button"
              onClick={() => {
                setParsedModuls([]);
                setParsedPackets([]);
                setImportWarnings([]);
                setImportModalOpen(true);
              }}
              className="master-outline inline-flex items-center gap-1.5 text-xs"
            >
              <UploadCloud size={15} aria-hidden="true" />
              Impor Excel / JSON
            </button>
            <button
              type="button"
              onClick={activeTab === "modul" ? openNewModulModal : openNewBankModal}
              className="master-primary inline-flex items-center gap-1.5 text-xs"
            >
              <Plus size={15} aria-hidden="true" />
              {activeTab === "modul" ? "Tambah Modul" : "Tambah Bank Soal"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Bank Soal Siap Pakai</p>
            <p className="mt-1.5 text-2xl font-extrabold text-white tabular-nums">{data?.summary.totalBankSoal ?? 0}</p>
            <p className="mt-1 text-xs text-slate-400">Paket UTS, UAS, dan Ujian Akhir / UPK</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Butir Soal Pusat</p>
            <p className="mt-1.5 text-2xl font-extrabold text-indigo-300 tabular-nums">{data?.summary.totalButirSoal ?? 0}</p>
            <p className="mt-1 text-xs text-slate-400">Lengkap dengan opsi PG & kunci jawaban</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Template Modul Ajar</p>
            <p className="mt-1.5 text-2xl font-extrabold text-emerald-300 tabular-nums">{data?.summary.totalModul ?? 0}</p>
            <p className="mt-1 text-xs text-slate-400">Materi ajar terstruktur lintas jenjang</p>
          </div>
        </div>

        {/* Filter & Tabs */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("soal")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "soal"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <Layers size={15} />
              Bank Soal CBT ({data?.bankSoal.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("modul")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "modul"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <BookOpen size={15} />
              Modul Ajar ({data?.modul.length ?? 0})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter Jenjang"
              value={filterJenjang}
              onChange={(e) => setFilterJenjang(e.target.value)}
              className="rounded-xl border border-white/15 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white"
            >
              <option value="">Semua Jenjang (A/B/C)</option>
              {JENJANG_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter Mapel"
              value={filterMapel}
              onChange={(e) => setFilterMapel(e.target.value)}
              className="rounded-xl border border-white/15 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white"
            >
              <option value="">Semua Mapel</option>
              {(data?.mataPelajaranList ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {activeTab === "soal" && (
              <select
                aria-label="Filter Kategori Ujian"
                value={filterKategori}
                onChange={(e) => setFilterKategori(e.target.value)}
                className="rounded-xl border border-white/15 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white"
              >
                <option value="">Semua Kategori</option>
                <option value="UTS">UTS</option>
                <option value="UAS">UAS</option>
                <option value="UJIAN_AKHIR">Ujian Akhir / UPK</option>
              </select>
            )}

            <label className="relative flex items-center">
              <Search size={14} className="pointer-events-none absolute left-3 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari judul / mapel..."
                className="w-48 rounded-xl border border-white/15 bg-slate-900/90 py-2 pl-8 pr-3 text-xs text-white placeholder:text-slate-500"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Main Content List */}
      <section className="master-section">
        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-300">
            <Loader2 size={18} className="animate-spin" />
            Memuat Pustaka Konten Pusat...
          </div>
        ) : activeTab === "soal" ? (
          (data?.bankSoal.length ?? 0) === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
              <p className="text-sm font-semibold text-white">Belum ada paket Bank Soal Pusat pada filter ini.</p>
              <p className="mt-1 text-xs text-slate-400">
                Gunakan tombol Generate Draf via AI, Impor Excel / JSON, atau Tambah Bank Soal untuk mulai mengisi pustaka.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data!.bankSoal.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-indigo-400/40"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${jenjangBadgeCls(item.jenjang, true)}`}>
                        {jenjangLabel(item.jenjang)} · {item.tingkatKelas}
                      </span>
                      <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${kategoriBadgeCls(item.kategoriUjian, true)}`}>
                        {kategoriLabel(item.kategoriUjian)}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">{item.mataPelajaran}</p>
                      <h3 className="mt-1 text-base font-bold leading-snug text-white">{item.judul}</h3>
                      {item.deskripsi && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-400">{item.deskripsi}</p>}
                    </div>
                    <p className="text-xs font-semibold text-slate-300 tabular-nums">
                      {item._count?.butirSoal ?? 0} butir soal · Durasi {item.durasiMenit} menit · KKM {item.kkm}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                    <button
                      type="button"
                      onClick={() => void openBankDetail(item.id)}
                      className="flex-1 rounded-xl bg-indigo-600/90 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500"
                    >
                      Kelola Butir Soal
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditBankModal(item)}
                      aria-label="Ubah paket soal"
                      className="rounded-xl border border-white/15 p-2 text-slate-300 hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteBank(item)}
                      aria-label="Hapus paket soal"
                      className="rounded-xl border border-rose-400/25 p-2 text-rose-300 hover:bg-rose-500/20"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : (data?.modul.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
            <p className="text-sm font-semibold text-white">Belum ada Modul Ajar Pusat pada filter ini.</p>
            <p className="mt-1 text-xs text-slate-400">
              Tambahkan modul manual, buat dengan AI, atau impor dari Excel agar sekolah klien bisa langsung menyalinnya.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data!.modul.map((item) => (
              <article
                key={item.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-emerald-400/40"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${jenjangBadgeCls(item.jenjang, true)}`}>
                      {jenjangLabel(item.jenjang)} · {item.tingkatKelas}
                    </span>
                    <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${kategoriBadgeCls(item.kategoriUjian, true)}`}>
                      {kategoriLabel(item.kategoriUjian)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">{item.mataPelajaran}</p>
                    <h3 className="mt-1 text-base font-bold leading-snug text-white">{item.judul}</h3>
                    {item.deskripsi && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-400">{item.deskripsi}</p>}
                  </div>
                  {item.fileUrl && (
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300 underline hover:text-sky-200"
                    >
                      <FileText size={13} /> Lampiran / Tautan Modul
                    </a>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => openEditModulModal(item)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10"
                  >
                    <Pencil size={13} /> Ubah
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteModul(item)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/25 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
                  >
                    <Trash2 size={13} /> Hapus
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Modal CRUD Modul */}
      {modulModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveModul}
            className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{editingModul ? "Ubah Modul Ajar Pusat" : "Tambah Modul Ajar Pusat"}</h3>
              <button type="button" onClick={() => setModulModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-300">
                Jenjang Paket
                <select
                  value={modulJenjang}
                  onChange={(e) => {
                    const next = e.target.value as MasterJenjang;
                    setModulJenjang(next);
                    setModulTingkat(TINGKAT_BY_JENJANG[next][TINGKAT_BY_JENJANG[next].length - 1]);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {JENJANG_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-300">
                Tingkat Kelas
                <select
                  value={modulTingkat}
                  onChange={(e) => setModulTingkat(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {TINGKAT_BY_JENJANG[modulJenjang].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-300">
              Mata Pelajaran
              <input
                list="pkbm-mapel-list"
                required
                value={modulMapel}
                onChange={(e) => setModulMapel(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <datalist id="pkbm-mapel-list">
                {allMapelOptions.map((m) => <option key={m} value={m} />)}
              </datalist>
            </label>
            <label className="block text-xs font-bold text-slate-300">
              Judul Modul
              <input
                required
                value={modulJudul}
                onChange={(e) => setModulJudul(e.target.value)}
                placeholder="Contoh: Modul 1 — Teks Eksposisi & Argumentasi"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs font-bold text-slate-300">
              Ringkasan / Deskripsi
              <textarea
                rows={2}
                value={modulDeskripsi}
                onChange={(e) => setModulDeskripsi(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs font-bold text-slate-300">
              Isi / Konten Modul
              <textarea
                rows={5}
                value={modulKonten}
                onChange={(e) => setModulKonten(e.target.value)}
                placeholder="Tuliskan ringkasan materi, langkah pembelajaran, atau latihan mandiri..."
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs font-bold text-slate-300">
              URL File PDF / Video (Opsional, HTTPS)
              <input
                type="url"
                value={modulFileUrl}
                onChange={(e) => setModulFileUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModulModalOpen(false)} className="master-outline text-xs">
                Batal
              </button>
              <button type="submit" disabled={savingModul} className="master-primary inline-flex items-center gap-1.5 text-xs">
                {savingModul && <Loader2 size={14} className="animate-spin" />}
                Simpan Modul
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal CRUD Bank Soal */}
      {bankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveBank}
            className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {editingBank ? "Ubah Paket Bank Soal Pusat" : "Tambah Paket Bank Soal Pusat"}
              </h3>
              <button type="button" onClick={() => setBankModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-bold text-slate-300">
                Jenjang Paket
                <select
                  value={bankJenjang}
                  onChange={(e) => {
                    const next = e.target.value as MasterJenjang;
                    setBankJenjang(next);
                    setBankTingkat(TINGKAT_BY_JENJANG[next][TINGKAT_BY_JENJANG[next].length - 1]);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {JENJANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-300">
                Tingkat Kelas
                <select
                  value={bankTingkat}
                  onChange={(e) => setBankTingkat(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {TINGKAT_BY_JENJANG[bankJenjang].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-300">
                Kategori Ujian
                <select
                  value={bankKategori}
                  onChange={(e) => setBankKategori(e.target.value as MasterKategori)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="UTS">UTS</option>
                  <option value="UAS">UAS</option>
                  <option value="UJIAN_AKHIR">Ujian Akhir / UPK</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-300">
              Mata Pelajaran
              <input
                list="pkbm-mapel-list"
                required
                value={bankMapel}
                onChange={(e) => setBankMapel(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs font-bold text-slate-300">
              Judul Paket Bank Soal
              <input
                required
                value={bankJudul}
                onChange={(e) => setBankJudul(e.target.value)}
                placeholder="Contoh: Bank Soal UPK Matematika Paket C"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-300">
                Durasi (Menit)
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={bankDurasi}
                  onChange={(e) => setBankDurasi(Number(e.target.value) || 60)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs font-bold text-slate-300">
                KKM Default
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={bankKkm}
                  onChange={(e) => setBankKkm(Number(e.target.value) || 75)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-300">
              Deskripsi / Kisi-kisi (Opsional)
              <textarea
                rows={2}
                value={bankDeskripsi}
                onChange={(e) => setBankDeskripsi(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setBankModalOpen(false)} className="master-outline text-xs">
                Batal
              </button>
              <button type="submit" disabled={savingBank} className="master-primary inline-flex items-center gap-1.5 text-xs">
                {savingBank && <Loader2 size={14} className="animate-spin" />}
                Simpan Paket Soal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Detail & Editor Butir Soal */}
      {(activeBankDetail || loadingDetail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
              <div>
                {activeBankDetail && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${jenjangBadgeCls(activeBankDetail.jenjang, true)}`}>
                      {jenjangLabel(activeBankDetail.jenjang)} · {activeBankDetail.tingkatKelas}
                    </span>
                    <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${kategoriBadgeCls(activeBankDetail.kategoriUjian, true)}`}>
                      {kategoriLabel(activeBankDetail.kategoriUjian)}
                    </span>
                  </div>
                )}
                <h3 className="mt-2 text-lg font-bold text-white">
                  {activeBankDetail ? activeBankDetail.judul : "Memuat paket soal..."}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveBankDetail(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {loadingDetail ? (
                <div className="flex items-center gap-2 py-8 text-sm text-slate-300">
                  <Loader2 size={18} className="animate-spin" /> Memuat daftar butir soal...
                </div>
              ) : (
                <>
                  {/* Form tambah butir soal */}
                  <form onSubmit={handleAddButirSoal} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-white">Tambah Butir Soal Baru</h4>
                      <div className="flex items-center gap-2">
                        <select
                          value={soalTipe}
                          onChange={(e) => {
                            const next = e.target.value as "PG" | "ESAI";
                            setSoalTipe(next);
                            setSoalKunci(next === "PG" ? "A" : "");
                          }}
                          className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white"
                        >
                          <option value="PG">Pilihan Ganda</option>
                          <option value="ESAI">Esai</option>
                        </select>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={soalBobot}
                          onChange={(e) => setSoalBobot(Number(e.target.value) || 10)}
                          aria-label="Bobot soal"
                          className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white"
                        />
                      </div>
                    </div>
                    <textarea
                      required
                      rows={2}
                      value={soalTeks}
                      onChange={(e) => setSoalTeks(e.target.value)}
                      placeholder="Tuliskan pertanyaan soal di sini..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                    {soalTipe === "PG" ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input required value={soalA} onChange={(e) => setSoalA(e.target.value)} placeholder="Opsi A (wajib)" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                        <input required value={soalB} onChange={(e) => setSoalB(e.target.value)} placeholder="Opsi B (wajib)" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                        <input value={soalC} onChange={(e) => setSoalC(e.target.value)} placeholder="Opsi C" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                        <input value={soalD} onChange={(e) => setSoalD(e.target.value)} placeholder="Opsi D" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                        <input value={soalE} onChange={(e) => setSoalE(e.target.value)} placeholder="Opsi E (opsional)" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                        <select
                          value={soalKunci}
                          onChange={(e) => setSoalKunci(e.target.value)}
                          className="rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-3 py-2 text-xs font-bold text-emerald-200"
                        >
                          <option value="A">Kunci Jawaban: A</option>
                          <option value="B">Kunci Jawaban: B</option>
                          <option value="C">Kunci Jawaban: C</option>
                          <option value="D">Kunci Jawaban: D</option>
                          <option value="E">Kunci Jawaban: E</option>
                        </select>
                      </div>
                    ) : (
                      <input
                        value={soalKunci}
                        onChange={(e) => setSoalKunci(e.target.value)}
                        placeholder="Kata kunci / pedoman jawaban esai..."
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                      />
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={soalPembahasan}
                        onChange={(e) => setSoalPembahasan(e.target.value)}
                        placeholder="Pembahasan singkat (opsional)"
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                      />
                      <button type="submit" disabled={savingSoal} className="master-primary inline-flex items-center gap-1.5 text-xs">
                        {savingSoal ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Tambah Soal
                      </button>
                    </div>
                  </form>

                  {/* Daftar butir soal */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-300">
                      Daftar Butir Soal ({activeBankDetail?.butirSoal?.length ?? 0})
                    </h4>
                    {(activeBankDetail?.butirSoal?.length ?? 0) === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
                        Belum ada butir soal pada paket ini. Tambahkan butir soal di atas.
                      </p>
                    ) : (
                      activeBankDetail!.butirSoal!.map((q, idx) => (
                        <div key={q.id ?? idx} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-white">
                              <span className="mr-2 rounded bg-indigo-500/20 px-1.5 py-0.5 text-xs font-bold text-indigo-300">
                                #{idx + 1}
                              </span>
                              {q.teks}
                            </p>
                            {q.id && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteButirSoal(q.id!)}
                                aria-label="Hapus butir soal"
                                className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/20"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          {q.tipe === "PG" ? (
                            <div className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
                              {(
                                [
                                  ["A", q.opsiA],
                                  ["B", q.opsiB],
                                  ["C", q.opsiC],
                                  ["D", q.opsiD],
                                  ["E", q.opsiE],
                                ] as const
                              )
                                .filter(([, val]) => Boolean(val))
                                .map(([code, val]) => {
                                  const isKey = q.kunciJawaban.toUpperCase() === code;
                                  return (
                                    <div
                                      key={code}
                                      className={`rounded-lg border px-2.5 py-1.5 ${
                                        isKey
                                          ? "border-emerald-400/40 bg-emerald-500/15 font-bold text-emerald-200"
                                          : "border-white/10 bg-slate-950/60 text-slate-300"
                                      }`}
                                    >
                                      <span className="mr-1.5 font-extrabold">{code}.</span>
                                      {val}
                                      {isKey && <span className="ml-2 text-[10px] uppercase text-emerald-300">✓ Kunci</span>}
                                    </div>
                                  );
                                })}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-emerald-300">Kunci Esai: {q.kunciJawaban || "-"}</p>
                          )}
                          {q.pembahasan && <p className="mt-2 text-xs text-slate-400">Pembahasan: {q.pembahasan}</p>}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Generate Draf via AI */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-violet-500/30 bg-slate-900 text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-violet-300">
                  <Sparkles size={13} /> GENERATOR DRAF PUSTAKA PUSAT
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">Generate Draf Soal / Modul via AI</h3>
              </div>
              <button type="button" onClick={() => setAiModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <form onSubmit={handleGenerateAi} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs font-bold text-slate-300">
                    Jenis Konten
                    <select
                      value={aiMode}
                      onChange={(e) => setAiMode(e.target.value as "soal" | "modul")}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    >
                      <option value="soal">Paket Bank Soal (PG)</option>
                      <option value="modul">Modul Ajar</option>
                    </select>
                  </label>
                  <label className="block text-xs font-bold text-slate-300">
                    Jenjang Paket
                    <select
                      value={aiJenjang}
                      onChange={(e) => {
                        const next = e.target.value as MasterJenjang;
                        setAiJenjang(next);
                        setAiTingkat(TINGKAT_BY_JENJANG[next][TINGKAT_BY_JENJANG[next].length - 1]);
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    >
                      {JENJANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-bold text-slate-300">
                    Tingkat Kelas
                    <select
                      value={aiTingkat}
                      onChange={(e) => setAiTingkat(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    >
                      {TINGKAT_BY_JENJANG[aiJenjang].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs font-bold text-slate-300">
                    Mata Pelajaran
                    <input
                      list="pkbm-mapel-list"
                      required
                      value={aiMapel}
                      onChange={(e) => setAiMapel(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  {aiMode === "soal" && (
                    <>
                      <label className="block text-xs font-bold text-slate-300">
                        Kategori Evaluasi
                        <select
                          value={aiKategori}
                          onChange={(e) => setAiKategori(e.target.value as MasterKategori)}
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                        >
                          <option value="UTS">UTS</option>
                          <option value="UAS">UAS</option>
                          <option value="UJIAN_AKHIR">Ujian Akhir / UPK</option>
                        </select>
                      </label>
                      <label className="block text-xs font-bold text-slate-300">
                        Jumlah Soal (2–20)
                        <input
                          type="number"
                          min={2}
                          max={20}
                          value={aiJumlah}
                          onChange={(e) => setAiJumlah(Number(e.target.value) || 5)}
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                        />
                      </label>
                    </>
                  )}
                </div>

                <label className="block text-xs font-bold text-slate-300">
                  Topik / Kisi-kisi Materi (Opsional)
                  <input
                    value={aiTopik}
                    onChange={(e) => setAiTopik(e.target.value)}
                    placeholder="Contoh: Persamaan linear, teks persuasi, atau literasi ekonomi kreatif"
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>

                {aiError && (
                  <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs font-medium text-rose-200">
                    {aiError}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={aiBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60"
                  >
                    {aiBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                    {aiBusy ? "Menyusun draf AI..." : "Buat Draf Sekarang"}
                  </button>
                </div>
              </form>

              {aiDraftModul && (
                <div className="space-y-3 rounded-2xl border border-emerald-400/30 bg-emerald-950/20 p-4">
                  <h4 className="text-sm font-bold text-emerald-200">Pratinjau Draf Modul Ajar</h4>
                  <input
                    value={aiDraftModul.judul}
                    onChange={(e) => setAiDraftModul({ ...aiDraftModul, judul: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-white"
                  />
                  <textarea
                    rows={2}
                    value={aiDraftModul.deskripsi}
                    onChange={(e) => setAiDraftModul({ ...aiDraftModul, deskripsi: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                  />
                  <textarea
                    rows={6}
                    value={aiDraftModul.konten}
                    onChange={(e) => setAiDraftModul({ ...aiDraftModul, konten: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                  />
                  <div className="flex justify-end">
                    <button type="button" disabled={aiSaving} onClick={() => void handleSaveAiDraft()} className="master-primary inline-flex items-center gap-1.5 text-xs">
                      {aiSaving && <Loader2 size={14} className="animate-spin" />}
                      Simpan Modul ke Pustaka Pusat
                    </button>
                  </div>
                </div>
              )}

              {aiDraftSoal && (
                <div className="space-y-3 rounded-2xl border border-indigo-400/30 bg-indigo-950/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-indigo-200">
                      Pratinjau Draf Paket Soal ({aiDraftSoal.butirSoal.length} Butir)
                    </h4>
                    <button type="button" disabled={aiSaving} onClick={() => void handleSaveAiDraft()} className="master-primary inline-flex items-center gap-1.5 text-xs">
                      {aiSaving && <Loader2 size={14} className="animate-spin" />}
                      Simpan ke Pustaka Pusat
                    </button>
                  </div>
                  <input
                    value={aiDraftSoal.judul}
                    onChange={(e) => setAiDraftSoal({ ...aiDraftSoal, judul: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-white"
                  />
                  <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                    {aiDraftSoal.butirSoal.map((q, idx) => (
                      <div key={idx} className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-xs">
                        <p className="font-semibold text-white">
                          {idx + 1}. {q.teks}
                        </p>
                        <p className="mt-1.5 text-emerald-300">Kunci: {q.kunciJawaban}</p>
                        {q.pembahasan && <p className="mt-1 text-slate-400">{q.pembahasan}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Impor Massal Excel / JSON */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">IMPOR MASSAL EXCEL / JSON</p>
                <h3 className="mt-1 text-lg font-bold text-white">Impor Konten ke Pustaka Pusat</h3>
              </div>
              <button type="button" onClick={() => setImportModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImportMode("bank-soal");
                      setParsedModuls([]);
                      setParsedPackets([]);
                      setImportWarnings([]);
                    }}
                    className={`rounded-xl px-3.5 py-2 text-xs font-bold ${
                      importMode === "bank-soal" ? "bg-indigo-600 text-white" : "border border-white/15 text-slate-300"
                    }`}
                  >
                    Impor Bank Soal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportMode("modul");
                      setParsedModuls([]);
                      setParsedPackets([]);
                      setImportWarnings([]);
                    }}
                    className={`rounded-xl px-3.5 py-2 text-xs font-bold ${
                      importMode === "modul" ? "bg-emerald-600 text-white" : "border border-white/15 text-slate-300"
                    }`}
                  >
                    Impor Modul Ajar
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => (importMode === "modul" ? downloadMasterModulTemplate() : downloadMasterBankSoalTemplate())}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20"
                >
                  <Download size={14} />
                  Unduh Template Excel
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold text-slate-300">
                  Default Jenjang (jika kolom kosong)
                  <select
                    value={importJenjang}
                    onChange={(e) => {
                      const next = e.target.value as MasterJenjang;
                      setImportJenjang(next);
                      setImportTingkat(TINGKAT_BY_JENJANG[next][TINGKAT_BY_JENJANG[next].length - 1]);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  >
                    {JENJANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-300">
                  Default Tingkat Kelas
                  <select
                    value={importTingkat}
                    onChange={(e) => setImportTingkat(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  >
                    {TINGKAT_BY_JENJANG[importJenjang].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-300">
                  Default Mata Pelajaran
                  <input
                    list="pkbm-mapel-list"
                    value={importMapel}
                    onChange={(e) => setImportMapel(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </label>
                {importMode === "bank-soal" && (
                  <label className="block text-xs font-bold text-slate-300">
                    Default Kategori Ujian
                    <select
                      value={importKategori}
                      onChange={(e) => setImportKategori(e.target.value as MasterKategori)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                    >
                      {KATEGORI_OPTIONS.filter((k) => k.value !== "MATERI").map((k) => (
                        <option key={k.value} value={k.value}>{k.label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {importMode === "bank-soal" && (
                <label className="block text-xs font-bold text-slate-300">
                  Default Judul Paket (opsional jika kolom judul_paket belum diisi di Excel)
                  <input
                    value={importJudul}
                    onChange={(e) => setImportJudul(e.target.value)}
                    placeholder="Contoh: Bank Soal UTS Bahasa Indonesia Paket C"
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </label>
              )}

              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950/60 p-6 text-center transition hover:border-indigo-400">
                <FileSpreadsheet size={28} className="text-indigo-300" />
                <span className="text-sm font-bold text-white">Pilih File .xlsx, .xls, .csv, atau .json</span>
                <span className="text-xs text-slate-400">Otomatis memvalidasi kolom jenjang, mapel, kategori, dan kunci jawaban</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.json"
                  onChange={(e) => void handleFileSelect(e)}
                  className="hidden"
                />
              </label>

              {importWarnings.length > 0 && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <p className="font-bold">Catatan Validasi:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {importWarnings.slice(0, 6).map((w, idx) => <li key={idx}>{w}</li>)}
                  </ul>
                </div>
              )}

              {parsedModuls.length > 0 && (
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-100">
                  <p className="font-bold">Siap mengimpor {parsedModuls.length} Modul Ajar Pusat:</p>
                  <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                    {parsedModuls.map((m, idx) => (
                      <li key={idx}>• [{jenjangLabel(m.jenjang)} · {m.mataPelajaran}] {m.judul}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedPackets.length > 0 && (
                <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-3.5 text-xs text-indigo-100">
                  <p className="font-bold">
                    Siap mengimpor {parsedPackets.length} Paket Bank Soal (
                    {parsedPackets.reduce((sum, p) => sum + p.butirSoal.length, 0)} butir soal):
                  </p>
                  <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                    {parsedPackets.map((p, idx) => (
                      <li key={idx}>
                        • [{jenjangLabel(p.jenjang)} · {kategoriLabel(p.kategoriUjian)} · {p.mataPelajaran}] {p.judul} ({p.butirSoal.length} soal)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-white/10 p-4">
              <button type="button" onClick={() => setImportModalOpen(false)} className="master-outline text-xs">
                Tutup
              </button>
              <button
                type="button"
                disabled={importBusy || (importMode === "modul" ? parsedModuls.length === 0 : parsedPackets.length === 0)}
                onClick={() => void handleSubmitImport()}
                className="master-primary inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
              >
                {importBusy && <Loader2 size={14} className="animate-spin" />}
                Impor ke Pustaka Pusat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
