import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  CBT_CATEGORIES,
  categoryBadgeLabel,
  detectCbtCategory,
  downloadQuestionTemplate,
  downloadTaskTemplate,
  isFinalGradeClass,
  parseQuestionSpreadsheet,
  parseQuestionText,
  parseTaskSpreadsheet,
  type CbtCategory,
  type ParsedQuestionDraft,
  type ParsedTaskDraft,
  type SkippedImportRow,
} from "./cbtImportData";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { useTenantTheme } from "./TenantThemeProvider";

export interface CbtImportExamOption {
  id: string;
  kode: string;
  judul: string;
  kelas: { id: string; nama: string };
  mapel: { id: string; nama: string };
  _count: { soal: number; percobaan: number };
}

interface ImportedTaskRow {
  id: string;
  judul: string;
  instruksi: string | null;
  batasWaktu: string | null;
  createdAt: string;
  kelas: { id: string; nama: string };
  mapel: { id: string; nama: string };
  guru: { id: string; nama: string };
  _count: { pengumpulan: number };
}

function sandboxHeaders(sandboxRole?: "GURU" | "SISWA", extra?: Record<string, string>): Record<string, string> | undefined {
  if (!sandboxRole && !extra) return undefined;
  return {
    ...(extra ?? {}),
    ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
  };
}

function panelCls(isDark: boolean) {
  return isDark
    ? "border border-slate-700/60 bg-slate-900/75 text-slate-100"
    : "border border-slate-200/80 bg-white/95 text-slate-900";
}

function fieldCls(isDark: boolean) {
  return isDark
    ? "mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/75 px-3.5 py-2.5 text-sm text-white"
    : "glass-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm text-slate-900";
}

const SAMPLE_PASTE_TEXT = `1. Hasil dari 24 x 5 - 20 adalah ...
A. 80
B. 90
C. 100
D. 110
Kunci: C

2. Jelaskan secara ringkas tujuan utama pendidikan kesetaraan di PKBM!
Kunci: Memberikan akses pendidikan berkualitas yang setara bagi masyarakat di luar sekolah formal.`;

export function CbtImportPanel({
  ujianList,
  kelasList,
  mapelList,
  guruList,
  initialUjianId,
  sandboxRole,
  onImported,
}: {
  ujianList: CbtImportExamOption[];
  kelasList: Array<{ id: string; nama: string }>;
  mapelList: Array<{ id: string; nama: string; kkm: number }>;
  guruList: Array<{ id: string; nama: string }>;
  initialUjianId?: string;
  sandboxRole?: "GURU" | "SISWA";
  onImported?: (createdUjianId?: string) => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const [importTab, setImportTab] = useState<"soal" | "tugas">("soal");
  const [category, setCategory] = useState<CbtCategory>("UTS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // --- SOAL IMPORT STATE ---
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [existingUjianId, setExistingUjianId] = useState(initialUjianId || "");
  const [replaceMode, setReplaceMode] = useState<"append" | "replace">("append");
  const [inputMode, setInputMode] = useState<"file" | "text">("file");

  const [newJudul, setNewJudul] = useState("");
  const [newMapelId, setNewMapelId] = useState("");
  const [newGuruId, setNewGuruId] = useState("");
  const [newDurasi, setNewDurasi] = useState(90);
  const [newKkm, setNewKkm] = useState(75);
  const [newPublished, setNewPublished] = useState(false);
  const [selectedKelasIds, setSelectedKelasIds] = useState<string[]>([]);

  const [questionFileName, setQuestionFileName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestionDraft[]>([]);
  const [questionSkipped, setQuestionSkipped] = useState<SkippedImportRow[]>([]);
  const questionFileRef = useRef<HTMLInputElement>(null);

  // --- TUGAS IMPORT STATE ---
  const [taskInputMode, setTaskInputMode] = useState<"file" | "manual">("file");
  const [taskFileName, setTaskFileName] = useState("");
  const [taskDefaultMapelId, setTaskDefaultMapelId] = useState("");
  const [taskDefaultGuruId, setTaskDefaultGuruId] = useState("");
  const [taskDefaultKelasIds, setTaskDefaultKelasIds] = useState<string[]>([]);
  const [parsedTasks, setParsedTasks] = useState<ParsedTaskDraft[]>([]);
  const [taskSkipped, setTaskSkipped] = useState<SkippedImportRow[]>([]);
  const taskFileRef = useRef<HTMLInputElement>(null);

  // Quick manual task draft for UTS/AS/Ujian Akhir
  const [manualTaskJudul, setManualTaskJudul] = useState("");
  const [manualTaskInstruksi, setManualTaskInstruksi] = useState("");
  const [manualTaskDeadline, setManualTaskDeadline] = useState("");
  const [manualTaskLink, setManualTaskLink] = useState("");

  // Existing imported tasks list
  const [importedTasks, setImportedTasks] = useState<ImportedTaskRow[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  const finalGradeClasses = useMemo(
    () => kelasList.filter((k) => isFinalGradeClass(k.nama)),
    [kelasList],
  );

  useEffect(() => {
    if (initialUjianId && ujianList.some((u) => u.id === initialUjianId)) {
      setExistingUjianId(initialUjianId);
    } else if (!existingUjianId && ujianList[0]) {
      setExistingUjianId(ujianList[0].id);
    }
  }, [initialUjianId, ujianList, existingUjianId]);

  useEffect(() => {
    if (mapelList[0] && !newMapelId) setNewMapelId(mapelList[0].id);
    if (mapelList[0] && !taskDefaultMapelId) setTaskDefaultMapelId(mapelList[0].id);
    if (guruList[0] && !newGuruId) setNewGuruId(guruList[0].id);
    if (guruList[0] && !taskDefaultGuruId) setTaskDefaultGuruId(guruList[0].id);
    if (kelasList[0] && selectedKelasIds.length === 0) setSelectedKelasIds([kelasList[0].id]);
    if (kelasList[0] && taskDefaultKelasIds.length === 0) setTaskDefaultKelasIds([kelasList[0].id]);
  }, [kelasList, mapelList, guruList, newMapelId, taskDefaultMapelId, newGuruId, taskDefaultGuruId, selectedKelasIds.length, taskDefaultKelasIds.length]);

  const loadTasks = useCallback(async (signal?: AbortSignal) => {
    setTasksLoading(true);
    try {
      const headers = sandboxHeaders(sandboxRole);
      const res = await fetchWithTimeout("/api/sekolah/cbt/tugas", {
        signal,
        ...(headers ? { headers } : {}),
      });
      const body = (await res.json()) as { tugas?: ImportedTaskRow[]; error?: string };
      if (res.ok && Array.isArray(body.tugas)) {
        setImportedTasks(body.tugas);
      }
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        // Non-blocking
      }
    } finally {
      if (!signal?.aborted) setTasksLoading(false);
    }
  }, [sandboxRole]);

  useEffect(() => {
    if (importTab !== "tugas") return;
    const controller = new AbortController();
    void loadTasks(controller.signal);
    return () => controller.abort();
  }, [importTab, loadTasks]);

  function handleSelectCategory(next: CbtCategory) {
    setCategory(next);
    setError("");
    if (next === "UJIAN_AKHIR" && finalGradeClasses.length > 0) {
      const ids = finalGradeClasses.map((k) => k.id);
      setSelectedKelasIds(ids);
      setTaskDefaultKelasIds(ids);
    }
  }

  function toggleClassSelection(id: string, list: string[], setter: (next: string[]) => void) {
    if (list.includes(id)) {
      setter(list.filter((item) => item !== id));
    } else {
      setter([...list, id]);
    }
  }

  function selectOnlyFinalGrades(setter: (next: string[]) => void) {
    if (finalGradeClasses.length > 0) {
      setter(finalGradeClasses.map((k) => k.id));
    } else {
      setError("Belum ditemukan kelas akhir (Kelas 6, 9, atau 12) pada daftar rombel sekolah.");
    }
  }

  async function handleQuestionFileChange(file: File | undefined) {
    if (!file) return;
    setError("");
    setNotice("");
    try {
      const parsed = await parseQuestionSpreadsheet(file);
      setQuestionFileName(`${file.name} (${parsed.sheetName})`);
      setParsedQuestions(parsed.rows);
      setQuestionSkipped(parsed.skipped);
      if (parsed.rows.length === 0) {
        setError("Tidak ditemukan butir soal valid di file tersebut. Pastikan kolom Pertanyaan, Opsi, dan Kunci terisi.");
      }
    } catch (failure) {
      setParsedQuestions([]);
      setQuestionSkipped([]);
      setError(describeFetchError(failure, "File soal belum dapat dibaca."));
    }
  }

  function handleParsePastedText(text: string) {
    setPasteText(text);
    setError("");
    if (!text.trim()) {
      setParsedQuestions([]);
      setQuestionSkipped([]);
      return;
    }
    const parsed = parseQuestionText(text);
    setParsedQuestions(parsed.rows);
    setQuestionSkipped(parsed.skipped);
  }

  async function handleSubmitQuestionImport(event: React.FormEvent) {
    event.preventDefault();
    if (parsedQuestions.length === 0) {
      setError("Siapkan minimal 1 butir soal valid dari file Excel/CSV atau teks soal terlebih dahulu.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const payloadSoal = parsedQuestions.map((q) => ({
        row: q.row,
        tipe: q.tipe,
        teks: q.teks,
        bobot: q.bobot,
        opsiA: q.opsiA,
        opsiB: q.opsiB,
        opsiC: q.opsiC,
        opsiD: q.opsiD,
        opsiE: q.opsiE,
        kunci: q.kunci,
        kunciEsai: q.kunciEsai,
        pembahasan: q.pembahasan,
      }));

      if (targetMode === "existing") {
        if (!existingUjianId) throw new Error("Pilih paket ujian tujuan terlebih dahulu.");
        const res = await fetchWithTimeout(`/api/sekolah/cbt/ujian/${encodeURIComponent(existingUjianId)}/soal/import`, {
          method: "POST",
          headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
          body: JSON.stringify({ mode: replaceMode, soal: payloadSoal }),
        });
        const body = (await res.json()) as {
          importedCount?: number;
          skipped?: SkippedImportRow[];
          message?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || "Gagal mengimpor soal ke paket ujian.");
        setNotice(body.message || `${body.importedCount ?? parsedQuestions.length} soal berhasil diimpor.`);
        setParsedQuestions([]);
        setQuestionSkipped(body.skipped ?? []);
        setQuestionFileName("");
        setPasteText("");
        if (questionFileRef.current) questionFileRef.current.value = "";
        onImported?.(existingUjianId);
      } else {
        if (!newJudul.trim()) throw new Error("Judul paket ujian wajib diisi.");
        if (!newMapelId) throw new Error("Mata pelajaran wajib dipilih.");
        if (selectedKelasIds.length === 0) throw new Error("Pilih minimal satu kelas target.");

        const res = await fetchWithTimeout("/api/sekolah/cbt/ujian/import", {
          method: "POST",
          headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
          body: JSON.stringify({
            kategori: category,
            judul: newJudul.trim(),
            kelasIds: selectedKelasIds,
            mapelId: newMapelId,
            guruId: newGuruId,
            durasiMenit: newDurasi,
            kkm: newKkm,
            dipublikasikan: newPublished,
            soal: payloadSoal,
          }),
        });
        const body = (await res.json()) as {
          ujian?: Array<{ id: string }>;
          skipped?: SkippedImportRow[];
          message?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || "Gagal membuat paket ujian & mengimpor soal.");
        setNotice(body.message || "Paket ujian & soal berhasil dibuat.");
        setNewJudul("");
        setParsedQuestions([]);
        setQuestionSkipped(body.skipped ?? []);
        setQuestionFileName("");
        setPasteText("");
        if (questionFileRef.current) questionFileRef.current.value = "";
        onImported?.(body.ujian?.[0]?.id);
      }
    } catch (failure) {
      setError(describeFetchError(failure, "Impor soal CBT belum dapat diproses."));
    } finally {
      setBusy(false);
    }
  }

  async function handleTaskFileChange(file: File | undefined) {
    if (!file) return;
    setError("");
    setNotice("");
    try {
      const parsed = await parseTaskSpreadsheet(file, category);
      setTaskFileName(`${file.name} (${parsed.sheetName})`);
      setParsedTasks(parsed.rows);
      setTaskSkipped(parsed.skipped);
      if (parsed.rows.length === 0) {
        setError("Tidak ada baris tugas valid pada file. Pastikan kolom Judul Tugas dan Instruksi terisi.");
      }
    } catch (failure) {
      setParsedTasks([]);
      setTaskSkipped([]);
      setError(describeFetchError(failure, "File tugas belum dapat dibaca."));
    }
  }

  async function handleSubmitTaskImport(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    let tasksToSubmit: ParsedTaskDraft[] = parsedTasks;
    if (taskInputMode === "manual") {
      if (!manualTaskJudul.trim() || !manualTaskInstruksi.trim()) {
        setError("Judul tugas dan instruksi pengerjaan wajib diisi.");
        return;
      }
      let batasIso = "";
      if (manualTaskDeadline) {
        const d = new Date(`${manualTaskDeadline}:00+07:00`);
        if (Number.isNaN(d.getTime())) {
          setError("Batas waktu tugas tidak valid.");
          return;
        }
        batasIso = d.toISOString();
      }
      tasksToSubmit = [
        {
          row: 1,
          judul: manualTaskJudul.trim(),
          kategori: category,
          kelasNama: "",
          mapelNama: "",
          instruksi: manualTaskInstruksi.trim(),
          batasWaktu: batasIso,
          tautan: manualTaskLink.trim(),
        },
      ];
    }

    if (tasksToSubmit.length === 0) {
      setError("Unggah file Excel/CSV tugas atau isi form tugas terlebih dahulu.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/sekolah/cbt/tugas/import", {
        method: "POST",
        headers: sandboxHeaders(sandboxRole, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          kategori: category,
          defaultKelasIds: taskDefaultKelasIds,
          defaultMapelId: taskDefaultMapelId,
          guruId: taskDefaultGuruId,
          tugas: tasksToSubmit,
        }),
      });
      const body = (await res.json()) as {
        createdCount?: number;
        skipped?: SkippedImportRow[];
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        if (body.skipped?.length) setTaskSkipped(body.skipped);
        throw new Error(body.error || "Gagal mengimpor tugas.");
      }

      setNotice(body.message || `${body.createdCount ?? tasksToSubmit.length} tugas berhasil diimpor.`);
      setParsedTasks([]);
      setTaskSkipped(body.skipped ?? []);
      setTaskFileName("");
      setManualTaskJudul("");
      setManualTaskInstruksi("");
      setManualTaskDeadline("");
      setManualTaskLink("");
      if (taskFileRef.current) taskFileRef.current.value = "";
      await loadTasks();
    } catch (failure) {
      setError(describeFetchError(failure, "Tugas belum dapat diimpor."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTask(taskId: string) {
    setBusy(true);
    setError("");
    try {
      const headers = sandboxHeaders(sandboxRole);
      const res = await fetchWithTimeout(`/api/sekolah/cbt/tugas/${encodeURIComponent(taskId)}`, {
        method: "DELETE",
        ...(headers ? { headers } : {}),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "Gagal menghapus tugas.");
      setNotice(body.message || "Tugas dihapus.");
      await loadTasks();
    } catch (failure) {
      setError(describeFetchError(failure, "Tugas belum dapat dihapus."));
    } finally {
      setBusy(false);
    }
  }

  const activeCategoryMeta = CBT_CATEGORIES.find((c) => c.id === category) ?? CBT_CATEGORIES[0];

  return (
    <div className="space-y-5">
      {/* Mode Switcher: Impor Soal vs Impor Tugas */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ${panelCls(isDark)}`}>
        <div className={`inline-flex flex-wrap items-center gap-1 rounded-xl p-1 ${isDark ? "bg-slate-950/70" : "bg-slate-100"}`}>
          <button
            type="button"
            aria-pressed={importTab === "soal"}
            onClick={() => {
              setImportTab("soal");
              setError("");
              setNotice("");
            }}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition ${
              importTab === "soal"
                ? isDark
                  ? "bg-amber-400 text-slate-950 shadow-xs"
                  : "bg-white text-slate-900 shadow-xs"
                : isDark
                  ? "text-slate-300 hover:text-white"
                  : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileSpreadsheet size={15} aria-hidden="true" />
            Impor Soal CBT (PG &amp; Esai)
          </button>
          <button
            type="button"
            aria-pressed={importTab === "tugas"}
            onClick={() => {
              setImportTab("tugas");
              setError("");
              setNotice("");
            }}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition ${
              importTab === "tugas"
                ? isDark
                  ? "bg-amber-400 text-slate-950 shadow-xs"
                  : "bg-white text-slate-900 shadow-xs"
                : isDark
                  ? "text-slate-300 hover:text-white"
                  : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ClipboardList size={15} aria-hidden="true" />
            Impor Tugas (UTS / AS / Ujian Akhir)
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (importTab === "soal") {
              void downloadQuestionTemplate(category);
            } else {
              void downloadTaskTemplate(category);
            }
          }}
          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
            isDark
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
              : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          }`}
        >
          <Download size={14} aria-hidden="true" />
          Unduh Template Excel ({activeCategoryMeta.shortLabel})
        </button>
      </div>

      {/* Category Selector: UTS / AS / Ujian Akhir Kelas Akhir / Tugas CBT */}
      <div className={`space-y-3 rounded-2xl p-5 ${panelCls(isDark)}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">1. Pilih Jenis Evaluasi / Kategori Ujian</h3>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Tentukan apakah soal atau tugas ini untuk UTS, Asesmen Sumatif (AS/UAS), Ujian Akhir Kelas Akhir (UPK), atau Tugas CBT.
            </p>
          </div>
          {category === "UJIAN_AKHIR" && (
            <span className={`text-xs font-semibold ${isDark ? "text-amber-300" : "text-indigo-700"}`}>
              Kelas Akhir terdeteksi: {finalGradeClasses.length} rombel
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CBT_CATEGORIES.map((item) => {
            const active = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectCategory(item.id)}
                className={`rounded-xl border p-3.5 text-left transition ${
                  active
                    ? isDark
                      ? "border-amber-400 bg-amber-500/15 text-white"
                      : "border-sky-600 bg-sky-50 text-slate-900 ring-1 ring-sky-600/30"
                    : isDark
                      ? "border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-600"
                      : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-sky-300"
                }`}
              >
                <p className={`text-xs font-extrabold ${active ? (isDark ? "text-amber-300" : "text-sky-700") : ""}`}>
                  {item.label}
                </p>
                <p className={`mt-1 text-[11px] leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  {item.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {notice && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </p>
      )}

      {/* ================================================== */}
      {/* TAB 1: IMPOR SOAL CBT (PG & ESAI)                  */}
      {/* ================================================== */}
      {importTab === "soal" && (
        <form onSubmit={handleSubmitQuestionImport} className={`space-y-5 rounded-2xl p-5 ${panelCls(isDark)}`}>
          <div className="space-y-3">
            <h3 className="text-sm font-bold">2. Tujuan Paket Ujian CBT</h3>
            <div className="flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
                <input
                  type="radio"
                  name="cbt-import-target"
                  checked={targetMode === "new"}
                  onChange={() => setTargetMode("new")}
                />
                Buat Paket {activeCategoryMeta.shortLabel} Baru &amp; Impor Soal Sekaligus
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
                <input
                  type="radio"
                  name="cbt-import-target"
                  checked={targetMode === "existing"}
                  onChange={() => setTargetMode("existing")}
                  disabled={ujianList.length === 0}
                />
                Tambahkan ke Paket Ujian yang Sudah Ada ({ujianList.length})
              </label>
            </div>

            {targetMode === "existing" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-bold sm:col-span-2">
                  Pilih Paket Ujian Tujuan
                  <select
                    required
                    value={existingUjianId}
                    onChange={(e) => setExistingUjianId(e.target.value)}
                    className={fieldCls(isDark)}
                  >
                    {ujianList.map((u) => (
                      <option key={u.id} value={u.id}>
                        [{categoryBadgeLabel(detectCbtCategory(u.kode, u.judul))}] {u.judul} — {u.kelas.nama} ({u._count.soal} soal)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-bold">
                  Mode Penggabungan
                  <select
                    value={replaceMode}
                    onChange={(e) => setReplaceMode(e.target.value as "append" | "replace")}
                    className={fieldCls(isDark)}
                  >
                    <option value="append">Tambahkan di belakang soal lama</option>
                    <option value="replace">Ganti seluruh soal pada paket ini</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block text-xs font-bold sm:col-span-2">
                    Judul Paket Ujian
                    <input
                      required
                      value={newJudul}
                      onChange={(e) => setNewJudul(e.target.value)}
                      placeholder={`Contoh: ${activeCategoryMeta.sampleExamTitle}`}
                      className={fieldCls(isDark)}
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    Mata Pelajaran
                    <select required value={newMapelId} onChange={(e) => setNewMapelId(e.target.value)} className={fieldCls(isDark)}>
                      {mapelList.map((m) => (
                        <option key={m.id} value={m.id}>{m.nama}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-bold">
                    Tutor Pembuat Soal
                    <select value={newGuruId} onChange={(e) => setNewGuruId(e.target.value)} className={fieldCls(isDark)}>
                      {guruList.map((g) => (
                        <option key={g.id} value={g.id}>{g.nama}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs font-bold">
                    Durasi Ujian (Menit)
                    <input
                      type="number"
                      min={5}
                      max={360}
                      value={newDurasi}
                      onChange={(e) => setNewDurasi(Number(e.target.value))}
                      className={fieldCls(isDark)}
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    Nilai KKM
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={newKkm}
                      onChange={(e) => setNewKkm(Number(e.target.value))}
                      className={fieldCls(isDark)}
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 self-end pb-2.5 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={newPublished}
                      onChange={(e) => setNewPublished(e.target.checked)}
                    />
                    Langsung publikasikan ke siswa
                  </label>
                </div>

                {/* Multi-class target selection */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold">
                      Kelas Target ({selectedKelasIds.length} dipilih — bisa pilih lebih dari 1 kelas sekaligus)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => selectOnlyFinalGrades(setSelectedKelasIds)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                          isDark
                            ? "border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                            : "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                        }`}
                      >
                        <GraduationCap size={12} aria-hidden="true" />
                        Pilih Kelas Akhir (6/9/12)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedKelasIds(kelasList.map((k) => k.id))}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                          isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-700"
                        }`}
                      >
                        Semua Kelas
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedKelasIds([])}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                          isDark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"
                        }`}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-slate-200/70 p-3 sm:grid-cols-3 lg:grid-cols-4">
                    {kelasList.map((k) => {
                      const checked = selectedKelasIds.includes(k.id);
                      const isFinal = isFinalGradeClass(k.nama);
                      return (
                        <label
                          key={k.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                            checked
                              ? isDark
                                ? "border-amber-400/60 bg-amber-500/15 font-bold text-white"
                                : "border-sky-500 bg-sky-50 font-bold text-sky-950"
                              : isDark
                                ? "border-slate-800 text-slate-300"
                                : "border-slate-200 text-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleClassSelection(k.id, selectedKelasIds, setSelectedKelasIds)}
                          />
                          <span className="truncate">{k.nama}</span>
                          {isFinal && (
                            <span className={`ml-auto shrink-0 text-[10px] font-semibold ${isDark ? "text-amber-300" : "text-indigo-700"}`}>
                              Akhir
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Upload File or Paste Text */}
          <div className="space-y-3 border-t border-slate-200/70 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">3. Sumber Soal (Excel/CSV atau Tempel dari Word)</h3>
              <div className={`inline-flex gap-1 rounded-lg p-1 ${isDark ? "bg-slate-950/70" : "bg-slate-100"}`}>
                <button
                  type="button"
                  onClick={() => setInputMode("file")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold ${
                    inputMode === "file"
                      ? isDark
                        ? "bg-slate-800 text-white"
                        : "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500"
                  }`}
                >
                  <UploadCloud size={13} aria-hidden="true" />
                  File Excel / CSV
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("text")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold ${
                    inputMode === "text"
                      ? isDark
                        ? "bg-slate-800 text-white"
                        : "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500"
                  }`}
                >
                  <FileText size={13} aria-hidden="true" />
                  Tempel Teks Word
                </button>
              </div>
            </div>

            {inputMode === "file" ? (
              <div
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
                  isDark ? "border-slate-700 bg-slate-950/40" : "border-sky-300 bg-sky-50/40"
                }`}
              >
                <UploadCloud size={28} className="text-sky-600" aria-hidden="true" />
                <p className="mt-2 text-sm font-bold">
                  {questionFileName || "Pilih file Excel (.xlsx / .xls) atau CSV berisi soal PG / Esai"}
                </p>
                <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Kolom didukung: Tipe (PG/ESAI), Pertanyaan, Opsi A–E, Kunci, Bobot, Pembahasan. Maksimal 200 soal per unggahan.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => questionFileRef.current?.click()}
                    className="master-primary px-4 py-2 text-xs"
                  >
                    Pilih File Soal
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadQuestionTemplate(category)}
                    className={`rounded-xl border px-4 py-2 text-xs font-bold ${
                      isDark ? "border-slate-700 text-slate-200" : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    Unduh Template Excel
                  </button>
                </div>
                <input
                  ref={questionFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => void handleQuestionFileChange(e.target.files?.[0])}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    Tempel soal bernomor dari Microsoft Word / Notepad (contoh: <code>1. Pertanyaan</code>, <code>A. Opsi</code>, <code>Kunci: A</code>).
                  </p>
                  <button
                    type="button"
                    onClick={() => handleParsePastedText(SAMPLE_PASTE_TEXT)}
                    className="text-xs font-bold text-sky-600 underline"
                  >
                    Isi Contoh Format
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={pasteText}
                  onChange={(e) => handleParsePastedText(e.target.value)}
                  placeholder={SAMPLE_PASTE_TEXT}
                  className={`${fieldCls(isDark)} font-mono text-xs`}
                />
              </div>
            )}

            {/* Preview Table */}
            {(parsedQuestions.length > 0 || questionSkipped.length > 0) && (
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-emerald-700 tabular-nums">
                    Siap diimpor: {parsedQuestions.length} soal ({parsedQuestions.filter((q) => q.tipe === "PG").length} PG ·{" "}
                    {parsedQuestions.filter((q) => q.tipe === "ESAI").length} Esai)
                  </span>
                  {questionSkipped.length > 0 && (
                    <span className="font-bold text-amber-700 tabular-nums">
                      {questionSkipped.length} baris dilewati
                    </span>
                  )}
                </div>

                {questionSkipped.length > 0 && (
                  <ul className="max-h-28 space-y-1 overflow-y-auto rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    {questionSkipped.slice(0, 15).map((s, idx) => (
                      <li key={`${s.row}-${idx}`}>
                        Baris {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                )}

                {parsedQuestions.length > 0 && (
                  <div className="max-h-72 overflow-auto rounded-xl border border-slate-200/80">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className={`border-b ${isDark ? "border-slate-800 bg-slate-950/60 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Tipe</th>
                          <th className="px-3 py-2">Pertanyaan</th>
                          <th className="px-3 py-2">Opsi / Kunci</th>
                          <th className="px-3 py-2 text-right">Bobot</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200/70"}`}>
                        {parsedQuestions.slice(0, 25).map((q, idx) => (
                          <tr key={`${q.row}-${idx}`}>
                            <td className="px-3 py-2 tabular-nums font-semibold">{idx + 1}</td>
                            <td className="px-3 py-2 font-bold">{q.tipe}</td>
                            <td className="max-w-md px-3 py-2">{q.teks}</td>
                            <td className="px-3 py-2">
                              {q.tipe === "PG" ? (
                                <span>
                                  {[q.opsiA, q.opsiB, q.opsiC, q.opsiD, q.opsiE].filter(Boolean).length} opsi ·{" "}
                                  <strong className="text-emerald-700">Kunci {q.kunci}</strong>
                                </span>
                              ) : (
                                <span className="italic">{q.kunciEsai ? q.kunciEsai.slice(0, 50) : "Pedoman esai manual"}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{q.bobot}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedQuestions.length > 25 && (
                      <p className="border-t border-slate-200/70 px-3 py-2 text-center text-[11px] text-slate-500">
                        Menampilkan 25 dari {parsedQuestions.length} butir soal yang siap diimpor.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200/70 pt-4">
            <button
              type="submit"
              disabled={busy || parsedQuestions.length === 0}
              className="master-primary gap-2 px-5 py-2.5 text-xs disabled:opacity-50"
            >
              <UploadCloud size={15} aria-hidden="true" />
              {busy
                ? "Mengimpor Soal..."
                : targetMode === "existing"
                  ? `Impor ${parsedQuestions.length} Soal ke Paket Terpilih`
                  : `Buat ${selectedKelasIds.length} Paket ${activeCategoryMeta.shortLabel} & Impor ${parsedQuestions.length} Soal`}
            </button>
          </div>
        </form>
      )}

      {/* ================================================== */}
      {/* TAB 2: IMPOR TUGAS (UTS / AS / UJIAN AKHIR)        */}
      {/* ================================================== */}
      {importTab === "tugas" && (
        <div className="space-y-5">
          <form onSubmit={handleSubmitTaskImport} className={`space-y-5 rounded-2xl p-5 ${panelCls(isDark)}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">2. Target Default Kelas &amp; Mata Pelajaran</h3>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Digunakan untuk form cepat atau bila kolom Kelas / Mapel pada file Excel dikosongkan. Tugas langsung tampil di Ruang Kelas siswa.
                </p>
              </div>
              <div className={`inline-flex gap-1 rounded-lg p-1 ${isDark ? "bg-slate-950/70" : "bg-slate-100"}`}>
                <button
                  type="button"
                  onClick={() => setTaskInputMode("file")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold ${
                    taskInputMode === "file"
                      ? isDark
                        ? "bg-slate-800 text-white"
                        : "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500"
                  }`}
                >
                  <FileSpreadsheet size={13} aria-hidden="true" />
                  Impor Excel / CSV
                </button>
                <button
                  type="button"
                  onClick={() => setTaskInputMode("manual")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold ${
                    taskInputMode === "manual"
                      ? isDark
                        ? "bg-slate-800 text-white"
                        : "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500"
                  }`}
                >
                  <ClipboardList size={13} aria-hidden="true" />
                  Input Cepat Multi-Kelas
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold">
                Mata Pelajaran Default
                <select value={taskDefaultMapelId} onChange={(e) => setTaskDefaultMapelId(e.target.value)} className={fieldCls(isDark)}>
                  {mapelList.map((m) => (
                    <option key={m.id} value={m.id}>{m.nama}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold">
                Tutor Pembuat Tugas
                <select value={taskDefaultGuruId} onChange={(e) => setTaskDefaultGuruId(e.target.value)} className={fieldCls(isDark)}>
                  {guruList.map((g) => (
                    <option key={g.id} value={g.id}>{g.nama}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold">
                  Kelas Target Default ({taskDefaultKelasIds.length} dipilih)
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => selectOnlyFinalGrades(setTaskDefaultKelasIds)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                      isDark
                        ? "border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                        : "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                    }`}
                  >
                    <GraduationCap size={12} aria-hidden="true" />
                    Pilih Kelas Akhir (6/9/12)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskDefaultKelasIds(kelasList.map((k) => k.id))}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                      isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-700"
                    }`}
                  >
                    Semua Kelas
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskDefaultKelasIds([])}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                      isDark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"
                    }`}
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-slate-200/70 p-3 sm:grid-cols-3 lg:grid-cols-4">
                {kelasList.map((k) => {
                  const checked = taskDefaultKelasIds.includes(k.id);
                  const isFinal = isFinalGradeClass(k.nama);
                  return (
                    <label
                      key={k.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                        checked
                          ? isDark
                            ? "border-amber-400/60 bg-amber-500/15 font-bold text-white"
                            : "border-sky-500 bg-sky-50 font-bold text-sky-950"
                          : isDark
                            ? "border-slate-800 text-slate-300"
                            : "border-slate-200 text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleClassSelection(k.id, taskDefaultKelasIds, setTaskDefaultKelasIds)}
                      />
                      <span className="truncate">{k.nama}</span>
                      {isFinal && (
                        <span className={`ml-auto shrink-0 text-[10px] font-semibold ${isDark ? "text-amber-300" : "text-indigo-700"}`}>
                          Akhir
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {taskInputMode === "file" ? (
              <div className="space-y-3 border-t border-slate-200/70 pt-4">
                <div
                  className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center ${
                    isDark ? "border-slate-700 bg-slate-950/40" : "border-sky-300 bg-sky-50/40"
                  }`}
                >
                  <FileSpreadsheet size={28} className="text-sky-600" aria-hidden="true" />
                  <p className="mt-2 text-sm font-bold">
                    {taskFileName || "Unggah file Excel (.xlsx / .xls) atau CSV daftar tugas UTS / AS / Ujian Akhir"}
                  </p>
                  <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    Kolom: Judul Tugas, Kategori (UTS/AS/UJIAN_AKHIR/TUGAS), Kelas, Mata Pelajaran, Instruksi, Batas Waktu, Tautan HTTPS.
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => taskFileRef.current?.click()}
                      className="master-primary px-4 py-2 text-xs"
                    >
                      Pilih File Tugas
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadTaskTemplate(category)}
                      className={`rounded-xl border px-4 py-2 text-xs font-bold ${
                        isDark ? "border-slate-700 text-slate-200" : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      Unduh Template Excel Tugas
                    </button>
                  </div>
                  <input
                    ref={taskFileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => void handleTaskFileChange(e.target.files?.[0])}
                  />
                </div>

                {(parsedTasks.length > 0 || taskSkipped.length > 0) && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-emerald-700 tabular-nums">
                      Siap diimpor: {parsedTasks.length} baris tugas
                      {taskSkipped.length > 0 ? ` · ${taskSkipped.length} baris dilewati` : ""}
                    </p>
                    {taskSkipped.length > 0 && (
                      <ul className="max-h-24 space-y-1 overflow-y-auto rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                        {taskSkipped.map((s, idx) => (
                          <li key={`${s.row}-${idx}`}>
                            Baris {s.row}: {s.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                    {parsedTasks.length > 0 && (
                      <div className="max-h-60 overflow-auto rounded-xl border border-slate-200/80">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className={`border-b ${isDark ? "border-slate-800 bg-slate-950/60 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                              <th className="px-3 py-2">Kategori</th>
                              <th className="px-3 py-2">Judul Tugas</th>
                              <th className="px-3 py-2">Kelas / Mapel</th>
                              <th className="px-3 py-2">Instruksi</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200/70"}`}>
                            {parsedTasks.map((t, idx) => (
                              <tr key={`${t.row}-${idx}`}>
                                <td className="px-3 py-2 font-bold">{categoryBadgeLabel(t.kategori)}</td>
                                <td className="px-3 py-2 font-semibold">{t.judul}</td>
                                <td className="px-3 py-2">
                                  {t.kelasNama || `${taskDefaultKelasIds.length} kelas default`} · {t.mapelNama || "Mapel default"}
                                </td>
                                <td className="max-w-xs truncate px-3 py-2">{t.instruksi}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 border-t border-slate-200/70 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-bold">
                    Judul Tugas ({activeCategoryMeta.shortLabel})
                    <input
                      required
                      value={manualTaskJudul}
                      onChange={(e) => setManualTaskJudul(e.target.value)}
                      placeholder={`Contoh: ${activeCategoryMeta.sampleTaskTitle}`}
                      className={fieldCls(isDark)}
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    Batas Waktu Pengumpulan (WIB, Opsional)
                    <input
                      type="datetime-local"
                      value={manualTaskDeadline}
                      onChange={(e) => setManualTaskDeadline(e.target.value)}
                      className={fieldCls(isDark)}
                    />
                  </label>
                </div>
                <label className="block text-xs font-bold">
                  Instruksi / Soal Tugas
                  <textarea
                    required
                    rows={4}
                    value={manualTaskInstruksi}
                    onChange={(e) => setManualTaskInstruksi(e.target.value)}
                    placeholder="Tuliskan soal uraian, proyek portofolio, atau petunjuk pengerjaan tugas di sini..."
                    className={fieldCls(isDark)}
                  />
                </label>
                <label className="block text-xs font-bold">
                  Tautan Referensi HTTPS (Opsional)
                  <input
                    type="url"
                    value={manualTaskLink}
                    onChange={(e) => setManualTaskLink(e.target.value)}
                    placeholder="https://..."
                    className={fieldCls(isDark)}
                  />
                </label>
              </div>
            )}

            <div className="flex justify-end border-t border-slate-200/70 pt-4">
              <button
                type="submit"
                disabled={busy || (taskInputMode === "file" && parsedTasks.length === 0)}
                className="master-primary gap-2 px-5 py-2.5 text-xs disabled:opacity-50"
              >
                <ClipboardList size={15} aria-hidden="true" />
                {busy
                  ? "Menyimpan Tugas..."
                  : taskInputMode === "file"
                    ? `Impor ${parsedTasks.length} Tugas ke Ruang Kelas`
                    : `Bagikan Tugas ${activeCategoryMeta.shortLabel} ke ${taskDefaultKelasIds.length} Kelas`}
              </button>
            </div>
          </form>

          {/* Recently Imported / Active Tasks List */}
          <div className={`space-y-3 rounded-2xl p-5 ${panelCls(isDark)}`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold">Daftar Tugas Evaluasi Terbaru ({importedTasks.length})</h4>
              <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Terhubung langsung ke Ruang Kelas warga belajar
              </span>
            </div>
            {tasksLoading ? (
              <p className="text-xs text-slate-500">Memuat daftar tugas...</p>
            ) : importedTasks.length === 0 ? (
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Belum ada tugas yang dibagikan. Gunakan formulir di atas untuk mengimpor tugas UTS, AS, atau Ujian Akhir Kelas Akhir.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className={`border-b ${isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600"}`}>
                      <th className="px-3 py-2">Judul Tugas</th>
                      <th className="px-3 py-2">Kelas</th>
                      <th className="px-3 py-2">Mata Pelajaran</th>
                      <th className="px-3 py-2">Tenggat</th>
                      <th className="px-3 py-2 text-center">Terkumpul</th>
                      <th className="px-3 py-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200/70"}`}>
                    {importedTasks.slice(0, 20).map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-2.5">
                          <p className="font-bold">{t.judul}</p>
                          <p className={`line-clamp-1 text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            {t.instruksi || "-"}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{t.kelas.nama}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{t.mapel.nama}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                          {t.batasWaktu ? new Date(t.batasWaktu).toLocaleDateString("id-ID") : "Tanpa batas"}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums font-bold">{t._count.pengumpulan}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDeleteTask(t.id)}
                            aria-label={`Hapus tugas ${t.judul}`}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={13} aria-hidden="true" />
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
