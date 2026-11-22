import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookMarked,
  BookOpen,
  CheckCircle2,
  Layers,
  Loader2,
  X,
} from "lucide-react";
import { describeFetchError, fetchWithTimeout } from "./fetchWithTimeout";
import {
  JENJANG_OPTIONS,
  KATEGORI_OPTIONS,
  jenjangBadgeCls,
  jenjangLabel,
  kategoriBadgeCls,
  kategoriLabel,
  type CloneMasterSummary,
  type MasterBankSoalItem,
  type MasterJenjang,
  type MasterKategori,
  type MasterModulItem,
} from "./masterContentData";

type CatalogResponse = {
  modul: MasterModulItem[];
  bankSoal: MasterBankSoalItem[];
  mataPelajaranList: string[];
  kelasSekolah: Array<{ id: string; nama: string }>;
  mapelSekolah: Array<{ id: string; nama: string }>;
  error?: string;
};

interface ImportMasterContentModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  defaultMode?: "all" | "modul" | "soal";
  defaultKelasId?: string | null;
  sandboxRole?: "GURU" | "SISWA";
}

export function ImportMasterContentModal({
  open,
  onClose,
  onImported,
  defaultMode = "all",
  defaultKelasId = null,
  sandboxRole,
}: ImportMasterContentModalProps) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resultMsg, setResultMsg] = useState("");
  const [resultSummary, setResultSummary] = useState<CloneMasterSummary | null>(null);

  const [selectedJenjang, setSelectedJenjang] = useState<MasterJenjang[]>(["PAKET_A", "PAKET_B", "PAKET_C"]);
  const [selectedMapel, setSelectedMapel] = useState("");
  const [selectedKategori, setSelectedKategori] = useState<MasterKategori[]>(() => {
    if (defaultMode === "modul") return ["MATERI"];
    if (defaultMode === "soal") return ["UTS", "UAS", "UJIAN_AKHIR"];
    return ["MATERI", "UTS", "UAS", "UJIAN_AKHIR"];
  });
  const [targetKelasId, setTargetKelasId] = useState(defaultKelasId ?? "");
  const [checkedModulIds, setCheckedModulIds] = useState<Set<string>>(new Set());
  const [checkedBankIds, setCheckedBankIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setTargetKelasId(defaultKelasId ?? "");
    setResultMsg("");
    setResultSummary(null);
    setError("");
    setSelectedKategori(
      defaultMode === "modul"
        ? ["MATERI"]
        : defaultMode === "soal"
          ? ["UTS", "UAS", "UJIAN_AKHIR"]
          : ["MATERI", "UTS", "UAS", "UJIAN_AKHIR"],
    );

    const controller = new AbortController();
    setLoading(true);
    fetchWithTimeout("/api/school/master-content", {
      signal: controller.signal,
      ...(sandboxRole ? { headers: { "X-Dev-Sandbox-Role": sandboxRole } } : {}),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as CatalogResponse | null;
        if (!res.ok || !body) {
          throw new Error(body?.error || "Katalog Pustaka Pusat belum dapat dimuat.");
        }
        setCatalog(body);
        setCheckedModulIds(new Set(body.modul.map((m) => m.id)));
        setCheckedBankIds(new Set(body.bankSoal.map((b) => b.id)));
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(describeFetchError(failure, "Katalog Pustaka Pusat belum dapat dimuat."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, defaultMode, defaultKelasId, sandboxRole]);

  const filteredModuls = useMemo(() => {
    if (!catalog || !selectedKategori.includes("MATERI")) return [];
    return catalog.modul.filter((item) => {
      if (selectedJenjang.length > 0 && !selectedJenjang.includes(item.jenjang)) return false;
      if (selectedMapel && item.mataPelajaran.toLowerCase() !== selectedMapel.toLowerCase()) return false;
      return true;
    });
  }, [catalog, selectedJenjang, selectedMapel, selectedKategori]);

  const filteredBankSoal = useMemo(() => {
    if (!catalog) return [];
    const examCats: MasterKategori[] = selectedKategori.filter((k) => k !== "MATERI");
    if (examCats.length === 0) return [];
    return catalog.bankSoal.filter((item) => {
      if (selectedJenjang.length > 0 && !selectedJenjang.includes(item.jenjang)) return false;
      if (selectedMapel && item.mataPelajaran.toLowerCase() !== selectedMapel.toLowerCase()) return false;
      if (!examCats.includes(item.kategoriUjian)) return false;
      return true;
    });
  }, [catalog, selectedJenjang, selectedMapel, selectedKategori]);

  const selectedVisibleModulIds = useMemo(
    () => filteredModuls.filter((m) => checkedModulIds.has(m.id)).map((m) => m.id),
    [filteredModuls, checkedModulIds],
  );
  const selectedVisibleBankIds = useMemo(
    () => filteredBankSoal.filter((b) => checkedBankIds.has(b.id)).map((b) => b.id),
    [filteredBankSoal, checkedBankIds],
  );

  if (!open) return null;

  function toggleJenjang(value: MasterJenjang) {
    setSelectedJenjang((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

  function toggleKategori(value: MasterKategori) {
    setSelectedKategori((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

  function selectAllVisible(checked: boolean) {
    setCheckedModulIds((prev) => {
      const next = new Set(prev);
      for (const m of filteredModuls) {
        if (checked) next.add(m.id);
        else next.delete(m.id);
      }
      return next;
    });
    setCheckedBankIds((prev) => {
      const next = new Set(prev);
      for (const b of filteredBankSoal) {
        if (checked) next.add(b.id);
        else next.delete(b.id);
      }
      return next;
    });
  }

  async function handleImport() {
    if (selectedVisibleModulIds.length === 0 && selectedVisibleBankIds.length === 0) {
      setError("Centang minimal satu Modul Ajar atau Paket Bank Soal untuk disalin.");
      return;
    }
    setSubmitting(true);
    setError("");
    setResultMsg("");
    setResultSummary(null);
    try {
      const res = await fetchWithTimeout("/api/school/import-master-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
        },
        body: JSON.stringify({
          jenjangList: selectedJenjang,
          kategoriList: selectedKategori,
          ...(selectedMapel ? { mataPelajaranList: [selectedMapel] } : {}),
          modulIds: selectedVisibleModulIds,
          bankSoalIds: selectedVisibleBankIds,
          ...(targetKelasId ? { targetKelasId } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        summary?: CloneMasterSummary;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(body?.error || "Gagal menyalin konten dari Pustaka Pusat.");
      }
      setResultMsg(body?.message || "Konten berhasil disalin ke sekolah Anda.");
      setResultSummary(body?.summary ?? null);
      onImported();
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Gagal menyalin konten dari Pustaka Pusat."));
    } finally {
      setSubmitting(false);
    }
  }

  const totalSelected = selectedVisibleModulIds.length + selectedVisibleBankIds.length;
  const totalVisible = filteredModuls.length + filteredBankSoal.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
              <BookMarked size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700">
                PUSTAKA KONTEN PUSAT
              </p>
              <h2 className="mt-0.5 text-lg font-extrabold text-slate-900">Ambil Modul & Bank Soal Siap Pakai</h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Salin template Modul Ajar serta paket Soal UTS, UAS, dan Ujian Akhir / UPK langsung ke kelas & bank soal sekolah Anda.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-200/70"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Filters */}
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-extrabold text-slate-700">1. Pilih Jenjang / Paket</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {JENJANG_OPTIONS.map((opt) => {
                  const active = selectedJenjang.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleJenjang(opt.value)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                        active
                          ? "border-indigo-600 bg-indigo-600 text-white shadow-xs"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-extrabold text-slate-700">2. Pilih Jenis Konten</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {KATEGORI_OPTIONS.map((opt) => {
                  const active = selectedKategori.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
                        active
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleKategori(opt.value)}
                        className="accent-emerald-600"
                      />
                      {opt.shortLabel}
                    </label>
                  );
                })}
              </div>
            </div>

            <label className="block text-xs font-extrabold text-slate-700">
              3. Filter Mata Pelajaran
              <select
                value={selectedMapel}
                onChange={(e) => setSelectedMapel(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
              >
                <option value="">Semua Mata Pelajaran</option>
                {(catalog?.mataPelajaranList ?? []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-extrabold text-slate-700">
              4. Rombel / Kelas Tujuan (Opsional)
              <select
                value={targetKelasId}
                onChange={(e) => setTargetKelasId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
              >
                <option value="">Otomatis sesuaikan Jenjang & Tingkat (buat kelas jika belum ada)</option>
                {(catalog?.kelasSekolah ?? []).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {resultMsg && (
            <div role="status" className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
              <p className="flex items-center gap-2 font-bold">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                {resultMsg}
              </p>
              {resultSummary && (
                <p className="text-[11px] text-emerald-800">
                  Disalin: {resultSummary.copiedModul} modul, {resultSummary.copiedBankSoal} paket soal ({resultSummary.copiedSoalCount} butir soal).
                  {(resultSummary.skippedModul > 0 || resultSummary.skippedBankSoal > 0) && (
                    <> · Dilewati karena sudah ada: {resultSummary.skippedModul} modul, {resultSummary.skippedBankSoal} paket soal.</>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Catalog Items */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-600">
              <Loader2 size={18} className="animate-spin text-indigo-600" />
              Memuat katalog Pustaka Konten Pusat...
            </div>
          ) : totalVisible === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <p className="text-sm font-bold text-slate-800">Belum ada konten pusat yang cocok dengan filter ini.</p>
              <p className="mt-1 text-xs text-slate-500">
                Ubah pilihan jenjang/kategori di atas, atau minta Master Admin menambahkan materi & bank soal pada Pustaka Konten Pusat.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-700 tabular-nums">
                  Menampilkan {filteredModuls.length} modul ajar dan {filteredBankSoal.length} paket soal ·{" "}
                  <span className="text-indigo-700">{totalSelected} item dicentang</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selectAllVisible(true)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Centang Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAllVisible(false)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              {filteredBankSoal.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-600">
                    <Layers size={14} className="text-indigo-600" /> Paket Bank Soal CBT ({filteredBankSoal.length})
                  </h3>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {filteredBankSoal.map((item) => {
                      const checked = checkedBankIds.has(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                            checked
                              ? "border-indigo-400 bg-indigo-50/60 shadow-2xs"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setCheckedBankIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              });
                            }}
                            className="mt-1 accent-indigo-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap gap-1.5">
                              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${jenjangBadgeCls(item.jenjang)}`}>
                                {jenjangLabel(item.jenjang)} · {item.tingkatKelas}
                              </span>
                              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${kategoriBadgeCls(item.kategoriUjian)}`}>
                                {kategoriLabel(item.kategoriUjian)}
                              </span>
                            </div>
                            <p className="mt-1.5 truncate text-xs font-extrabold text-slate-900">{item.judul}</p>
                            <p className="mt-0.5 text-[11px] text-slate-600 tabular-nums">
                              {item.mataPelajaran} · {item._count?.butirSoal ?? 0} soal · {item.durasiMenit} mnt
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredModuls.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-600">
                    <BookOpen size={14} className="text-emerald-600" /> Modul Ajar Siap Pakai ({filteredModuls.length})
                  </h3>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {filteredModuls.map((item) => {
                      const checked = checkedModulIds.has(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                            checked
                              ? "border-emerald-400 bg-emerald-50/60 shadow-2xs"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setCheckedModulIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              });
                            }}
                            className="mt-1 accent-emerald-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap gap-1.5">
                              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${jenjangBadgeCls(item.jenjang)}`}>
                                {jenjangLabel(item.jenjang)} · {item.tingkatKelas}
                              </span>
                              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${kategoriBadgeCls(item.kategoriUjian)}`}>
                                Modul Ajar
                              </span>
                            </div>
                            <p className="mt-1.5 truncate text-xs font-extrabold text-slate-900">{item.judul}</p>
                            <p className="mt-0.5 text-[11px] text-slate-600">{item.mataPelajaran}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs font-semibold text-slate-600 tabular-nums">
            {totalSelected} item siap disalin ke sekolah Anda
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Tutup
            </button>
            <button
              type="button"
              disabled={submitting || totalSelected === 0}
              onClick={() => void handleImport()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <BookMarked size={14} />}
              {submitting ? "Menyalin Konten..." : `Salin ${totalSelected} Konten Terpilih`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
