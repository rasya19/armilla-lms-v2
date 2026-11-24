import { useMemo, useState } from "react";
import { CheckCircle2, GraduationCap, Loader2, Save, Sparkles, Trash2 } from "lucide-react";
import { buildSandboxHeaders } from "../utils/safeUrl";
import { describeFetchError, fetchWithTimeout } from "./fetchWithTimeout";
import { useTenantTheme } from "./TenantThemeProvider";

type RefItem = { id: string; nama: string };
type AiCategory = "UTS" | "UAS" | "UJIAN_AKHIR";

type DraftQuestion = {
  teks: string;
  opsiA: string;
  opsiB: string;
  opsiC: string;
  opsiD: string;
  opsiE: string;
  kunciJawaban: "A" | "B" | "C" | "D" | "E";
  pembahasan: string;
  bobot: number;
};

function isFinalGradeClass(name: string): boolean {
  return /\b(kelas\s*)?(6|9|12|vi|ix|xii)\b/i.test(name);
}

export function CbtAiGeneratorPanel({
  kelasList,
  mapelList,
  guruList,
  sandboxRole,
  onSaved,
}: {
  kelasList: RefItem[];
  mapelList: RefItem[];
  guruList: RefItem[];
  sandboxRole?: "GURU" | "SISWA";
  onSaved: (createdId?: string) => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const [kategori, setKategori] = useState<AiCategory>("UTS");
  const [kelasId, setKelasId] = useState(kelasList[0]?.id ?? "");
  const [mapelId, setMapelId] = useState(mapelList[0]?.id ?? "");
  const [guruId, setGuruId] = useState(guruList[0]?.id ?? "");
  const [topik, setTopik] = useState("");
  const [jumlahSoal, setJumlahSoal] = useState(10);
  const [durasiMenit, setDurasiMenit] = useState(60);
  const [kkm, setKkm] = useState(75);
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [dipublikasikan, setDipublikasikan] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([]);

  const finalGradeClasses = useMemo(
    () => kelasList.filter((k) => isFinalGradeClass(k.nama)),
    [kelasList],
  );

  const panelCls = isDark
    ? "border border-slate-700/60 bg-slate-900/75 text-slate-100"
    : "border border-slate-200/90 bg-white/95 text-slate-900 shadow-xs";

  const fieldCls = isDark
    ? "mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400"
    : "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500";

  function handleSelectCategory(next: AiCategory) {
    setKategori(next);
    if (next === "UJIAN_AKHIR") {
      setDurasiMenit(90);
      if (finalGradeClasses.length > 0 && !finalGradeClasses.some((k) => k.id === kelasId)) {
        setKelasId(finalGradeClasses[0].id);
      }
    } else {
      setDurasiMenit(60);
    }
  }

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generating || saving) return;
    const effectiveKelasId = kelasId || kelasList[0]?.id || "";
    const effectiveMapelId = mapelId || mapelList[0]?.id || "";
    if (!effectiveKelasId || !effectiveMapelId) {
      setError("Pastikan data kelas dan mata pelajaran sudah tersedia terlebih dahulu.");
      return;
    }

    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const headers = buildSandboxHeaders(sandboxRole === "GURU" ? "GURU" : undefined, {
        "Content-Type": "application/json",
      });
      const res = await fetchWithTimeout(
        "/api/sekolah/cbt/generate-ai",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            kategori,
            kelasId: effectiveKelasId,
            mapelId: effectiveMapelId,
            topik,
            jumlahSoal,
          }),
        },
        55_000,
      );
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
        model?: string;
        draft?: { judulPaket?: string; deskripsiPaket?: string; butirSoal?: DraftQuestion[] };
      } | null;
      if (!res.ok || !body?.draft?.butirSoal?.length) {
        throw new Error(body?.error || `Draf soal AI belum dapat dibuat (HTTP ${res.status}).`);
      }
      setDraftTitle(body.draft.judulPaket || "");
      setDraftDescription(body.draft.deskripsiPaket || "");
      setDraftQuestions(body.draft.butirSoal);
      setNotice(
        `Berhasil menyusun ${body.draft.butirSoal.length} soal dengan AI${body.model ? ` (${body.model})` : ""}. Periksa draf di bawah lalu simpan ke CBT.`,
      );
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal menghasilkan soal dengan AI."));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveToCbt() {
    if (saving || generating || draftQuestions.length === 0) return;
    const effectiveKelasId = kelasId || kelasList[0]?.id || "";
    const effectiveMapelId = mapelId || mapelList[0]?.id || "";
    const effectiveGuruId = guruId || guruList[0]?.id || "";

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const headers = buildSandboxHeaders(sandboxRole === "GURU" ? "GURU" : undefined, {
        "Content-Type": "application/json",
      });
      const res = await fetchWithTimeout(
        "/api/sekolah/cbt/save-ai-draft",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            judul: draftTitle.trim() || "Paket Ujian AI",
            kategori,
            kelasId: effectiveKelasId,
            mapelId: effectiveMapelId,
            guruId: effectiveGuruId,
            durasiMenit,
            kkm,
            dipublikasikan,
            visibility,
            butirSoal: draftQuestions,
          }),
        },
        25_000,
      );
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
        ujian?: { id: string };
      } | null;
      if (!res.ok) {
        throw new Error(body?.error || "Gagal menyimpan paket soal AI ke CBT.");
      }
      setDraftQuestions([]);
      setDraftTitle("");
      setDraftDescription("");
      setTopik("");
      onSaved(body?.ujian?.id);
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal menyimpan paket soal AI ke CBT."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
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

      <form onSubmit={handleGenerate} className={`space-y-4 rounded-2xl p-5 ${panelCls}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-extrabold">
              <Sparkles size={18} className="text-violet-600" aria-hidden="true" />
              Generator Soal AI (UTS, UAS &amp; Ujian Akhir Kelas Akhir)
            </h3>
            <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Susun paket soal pilihan ganda lengkap dengan kunci jawaban &amp; pembahasan secara otomatis menggunakan Gemini AI, lalu simpan langsung ke CBT sekolah.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            { id: "UTS" as const, label: "UTS (Tengah Semester)" },
            { id: "UAS" as const, label: "UAS / AS (Akhir Semester)" },
            { id: "UJIAN_AKHIR" as const, label: "Ujian Akhir / UPK (Kelas 6, 9, 12)" },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectCategory(item.id)}
              aria-pressed={kategori === item.id}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-extrabold transition ${
                kategori === item.id
                  ? item.id === "UJIAN_AKHIR"
                    ? "border-rose-500 bg-rose-600 text-white"
                    : "border-violet-600 bg-violet-600 text-white"
                  : isDark
                    ? "border-slate-700 bg-slate-950/60 text-slate-300 hover:bg-slate-800"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.id === "UJIAN_AKHIR" && <GraduationCap size={14} aria-hidden="true" />}
              {item.label}
            </button>
          ))}
        </div>

        {kategori === "UJIAN_AKHIR" && (
          <div className={`rounded-xl border px-3.5 py-2.5 text-xs ${isDark ? "border-rose-500/40 bg-rose-950/30 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
            <strong>Mode Kelas Akhir (UPK):</strong> Dirancang khusus untuk evaluasi kelulusan <strong>Kelas 6 (Paket A)</strong>, <strong>Kelas 9 (Paket B)</strong>, dan <strong>Kelas 12 (Paket C)</strong>. Paket akan otomatis berkode <code className="font-mono font-bold">UAK-</code> sehingga tampil di tab <strong>Ujian Akhir / UPK</strong> portal siswa.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-bold">
            Kelas Tujuan
            <select
              value={kelasId || kelasList[0]?.id || ""}
              onChange={(e) => setKelasId(e.target.value)}
              className={fieldCls}
            >
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}{isFinalGradeClass(k.nama) ? " (Kelas Akhir)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold">
            Mata Pelajaran
            <select
              value={mapelId || mapelList[0]?.id || ""}
              onChange={(e) => setMapelId(e.target.value)}
              className={fieldCls}
            >
              {mapelList.map((m) => (
                <option key={m.id} value={m.id}>{m.nama}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold">
            Jumlah Soal (3–20)
            <input
              type="number"
              min={3}
              max={20}
              value={jumlahSoal}
              onChange={(e) => setJumlahSoal(Math.max(3, Math.min(20, Number(e.target.value) || 5)))}
              className={fieldCls}
            />
          </label>
          <label className="block text-xs font-bold">
            Durasi (Menit)
            <input
              type="number"
              min={10}
              max={240}
              value={durasiMenit}
              onChange={(e) => setDurasiMenit(Math.max(10, Math.min(240, Number(e.target.value) || 60)))}
              className={fieldCls}
            />
          </label>
        </div>

        <label className="block text-xs font-bold">
          Topik / Kisi-kisi Materi (Opsional, makin spesifik makin akurat)
          <textarea
            rows={2}
            maxLength={300}
            value={topik}
            onChange={(e) => setTopik(e.target.value)}
            placeholder="Contoh: Persamaan linear dua variabel, statistika dasar, dan peluang kontekstual kehidupan sehari-hari"
            className={fieldCls}
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="inline-flex items-center gap-1.5 font-semibold">
              KKM:
              <input
                type="number"
                min={0}
                max={100}
                value={kkm}
                onChange={(e) => setKkm(Math.max(0, Math.min(100, Number(e.target.value) || 75)))}
                className={`w-16 rounded-lg border px-2 py-1 text-xs ${isDark ? "border-slate-700 bg-slate-950" : "border-slate-300 bg-white"}`}
              />
            </label>
            {guruList.length > 0 && (
              <label className="inline-flex items-center gap-1.5 font-semibold">
                Tutor:
                <select
                  value={guruId || guruList[0]?.id || ""}
                  onChange={(e) => setGuruId(e.target.value)}
                  className={`rounded-lg border px-2 py-1 text-xs ${isDark ? "border-slate-700 bg-slate-950" : "border-slate-300 bg-white"}`}
                >
                  {guruList.map((g) => (
                    <option key={g.id} value={g.id}>{g.nama}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <button
            type="submit"
            disabled={generating || saving || kelasList.length === 0 || mapelList.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-violet-500 disabled:opacity-50"
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {generating ? "Menyusun Soal AI..." : "Generate Draf Soal dengan AI"}
          </button>
        </div>
      </form>

      {draftQuestions.length > 0 && (
        <div className={`space-y-4 rounded-2xl p-5 ${panelCls}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 pb-4">
            <div className="min-w-0 flex-1">
              <label className="block text-xs font-bold">
                Judul Paket Ujian CBT
                <input
                  type="text"
                  maxLength={180}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className={fieldCls}
                />
              </label>
              {draftDescription && (
                <p className={`mt-1.5 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>{draftDescription}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={dipublikasikan}
                  onChange={(e) => setDipublikasikan(e.target.checked)}
                  className="accent-emerald-600"
                />
                Langsung publikasikan ke siswa
              </label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as "PRIVATE" | "PUBLIC")}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${isDark ? "border-slate-700 bg-slate-950" : "border-slate-300 bg-white"}`}
              >
                <option value="PRIVATE">Privat Sekolah</option>
                <option value="PUBLIC">Bagikan Publik</option>
              </select>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveToCbt()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Menyimpan..." : `Simpan ${draftQuestions.length} Soal ke CBT`}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {draftQuestions.map((q, idx) => (
              <div
                key={`${idx}-${q.teks.slice(0, 20)}`}
                className={`rounded-xl border p-4 text-xs ${isDark ? "border-slate-700/70 bg-slate-950/60" : "border-slate-200 bg-slate-50/70"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold leading-relaxed">
                    {idx + 1}. {q.teks}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDraftQuestions((prev) => prev.filter((_, i) => i !== idx))}
                    title="Hapus soal ini dari draf"
                    className="shrink-0 rounded-lg border border-rose-300 p-1.5 text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                  {(["A", "B", "C", "D", "E"] as const).map((code) => {
                    const text = q[`opsi${code}`];
                    if (!text) return null;
                    const isKey = q.kunciJawaban === code;
                    return (
                      <div
                        key={code}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                          isKey
                            ? "border-emerald-400 bg-emerald-50 font-bold text-emerald-900"
                            : isDark
                              ? "border-slate-800 bg-slate-900 text-slate-300"
                              : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <span className="font-mono font-extrabold">{code}.</span>
                        <span className="flex-1">{text}</span>
                        {isKey && <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />}
                      </div>
                    );
                  })}
                </div>
                {q.pembahasan && (
                  <p className={`mt-2 text-[11px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    <strong>Pembahasan:</strong> {q.pembahasan}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
