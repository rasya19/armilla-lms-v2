import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Download, FileSpreadsheet, GraduationCap, Lock, Printer, Save, Unlock } from "lucide-react";
import { buildSandboxHeaders } from "../utils/safeUrl";
import { CardGridSkeleton, EmptyState } from "./DashboardUI";
import { buildKopSuratProfile, KopSurat } from "./KopSurat";
import { QrCodeSvg } from "./QrCodeSvg";
import type { SchoolProfile } from "./schoolProfile";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { useTenantTheme } from "./TenantThemeProvider";
import {
  detectDefaultPaketCTrack,
  detectKesetaraanProgram,
  filterItemsByKesetaraanTrack,
  groupTranscriptSubjects,
  predikatFromScore,
  savePaketCTrackPreference,
  type PaketCTrack,
} from "../utils/kesetaraanSubjects";

export type LegerRaportData = {
  sekolah: { nama: string; npsn: string | null; alamat: string | null; kabupatenKota: string | null; kepalaSekolah: string | null; logoUrl: string | null };
  kopSurat?: SchoolProfile;
  kelasName: string;
  tahunLabel: string;
  waliKelasNama: string | null;
  mapel: Array<{ id: string; nama: string; kkm: number; skk: number }>;
  siswa: Array<{ id: string; nama: string; nisn: string; jenjang: string | null }>;
  nilai: Array<{ siswaId: string; mapelId: string; nilaiAkhir: number }>;
};

export function RaportLegerPanel({ data }: { data: LegerRaportData }) {
  const isDark = useTenantTheme() === "dark";

  const rows = useMemo(() => {
    const scoreMap = new Map<string, number>();
    for (const n of data.nilai) {
      const key = `${n.siswaId}::${n.mapelId}`;
      if (!scoreMap.has(key)) scoreMap.set(key, n.nilaiAkhir);
    }

    const base = data.siswa.map((st) => {
      const scores = data.mapel.map((m) => scoreMap.get(`${st.id}::${m.id}`) ?? null);
      const filled = scores.filter((v): v is number => v !== null);
      const total = filled.reduce((a, b) => a + b, 0);
      const avg = filled.length > 0 ? Math.round((total / filled.length) * 100) / 100 : null;
      return { siswa: st, scores, total: Math.round(total * 100) / 100, avg, filledCount: filled.length };
    });

    const sortedAvgs = [...base]
      .filter((r) => r.avg !== null)
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));

    return base.map((r) => {
      const rankIdx = r.avg === null ? -1 : sortedAvgs.findIndex((s) => s.siswa.id === r.siswa.id);
      return { ...r, rank: rankIdx >= 0 ? rankIdx + 1 : null };
    });
  }, [data]);

  async function handleExportExcel() {
    const XLSX = await import("xlsx");
    const sheetRows = rows.map((row, idx) => {
      const obj: Record<string, string | number> = {
        No: idx + 1,
        NISN: row.siswa.nisn,
        "Nama Warga Belajar": row.siswa.nama,
      };
      data.mapel.forEach((m, i) => {
        obj[m.nama] = row.scores[i] ?? "-";
      });
      obj["Jumlah Nilai"] = row.filledCount > 0 ? row.total : "-";
      obj["Rata-rata"] = row.avg ?? "-";
      obj["Peringkat"] = row.rank ?? "-";
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leger Raport");
    const safeName = `${data.kelasName}-${data.tahunLabel}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
    XLSX.writeFile(wb, `Leger_Raport_${safeName}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-extrabold">
            <FileSpreadsheet size={18} className="text-sky-600" />
            Leger Nilai Raport — {data.kelasName} ({data.tahunLabel})
          </h3>
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Rekap matriks seluruh nilai warga belajar dan mata pelajaran beserta total, rata-rata, dan peringkat kelas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => void handleExportExcel()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            <Download size={14} />
            Unduh Leger Excel (.xlsx)
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Printer size={14} />
            Cetak Leger
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Belum ada siswa pada kelas ini" description="Pilih kelas yang sudah memiliki warga belajar untuk melihat leger raport." />
      ) : (
        <article className="print-sheet rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 shadow-xs sm:p-6">
          <KopSurat profile={buildKopSuratProfile(data.kopSurat, data.sekolah)} />
          <div className="mb-4 mt-4 text-center">
            <h4 className="text-sm font-black uppercase tracking-wide text-slate-950 sm:text-base">
              Leger Nilai Raport Pendidikan Kesetaraan
            </h4>
            <p className="mt-0.5 text-xs text-slate-600">
              Kelas: <strong>{data.kelasName}</strong> · Tahun Ajaran: <strong>{data.tahunLabel}</strong> · Wali Kelas: <strong>{data.waliKelasNama || "-"}</strong>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse border border-slate-300 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 font-bold text-slate-800">
                  <th className="border border-slate-300 px-2.5 py-2 text-center">No</th>
                  <th className="border border-slate-300 px-2.5 py-2">Nama Warga Belajar</th>
                  <th className="border border-slate-300 px-2.5 py-2 font-mono">NISN</th>
                  {data.mapel.map((m) => (
                    <th key={m.id} className="border border-slate-300 px-2 py-2 text-center" title={m.nama}>
                      <span className="line-clamp-2 max-w-[96px]">{m.nama}</span>
                    </th>
                  ))}
                  <th className="border border-slate-300 bg-sky-50 px-2.5 py-2 text-center">Jumlah</th>
                  <th className="border border-slate-300 bg-sky-50 px-2.5 py-2 text-center">Rata-rata</th>
                  <th className="border border-slate-300 bg-amber-50 px-2.5 py-2 text-center">Rank</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.siswa.id} className="hover:bg-slate-50">
                    <td className="border border-slate-300 px-2.5 py-2 text-center tabular-nums">{idx + 1}</td>
                    <td className="border border-slate-300 px-2.5 py-2 font-semibold">{row.siswa.nama}</td>
                    <td className="border border-slate-300 px-2.5 py-2 font-mono text-[11px]">{row.siswa.nisn}</td>
                    {row.scores.map((val, i) => (
                      <td
                        key={`${row.siswa.id}-${data.mapel[i].id}`}
                        className={`border border-slate-300 px-2 py-2 text-center tabular-nums ${
                          val !== null && val < data.mapel[i].kkm ? "bg-rose-50 font-bold text-rose-700" : ""
                        }`}
                      >
                        {val !== null ? val : "-"}
                      </td>
                    ))}
                    <td className="border border-slate-300 bg-sky-50/60 px-2.5 py-2 text-center font-bold tabular-nums">
                      {row.filledCount > 0 ? row.total : "-"}
                    </td>
                    <td className="border border-slate-300 bg-sky-50/60 px-2.5 py-2 text-center font-extrabold tabular-nums">
                      {row.avg !== null ? row.avg : "-"}
                    </td>
                    <td className="border border-slate-300 bg-amber-50/60 px-2.5 py-2 text-center font-extrabold tabular-nums">
                      {row.rank !== null ? `#${row.rank}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </div>
  );
}

type TranscriptSubject = {
  mapelId: string;
  mapelNama: string;
  kkm: number;
  skk: number;
  semesterBreakdown: Array<{
    tahunAjaranId: string;
    label: string;
    tahunNama?: string;
    nilai: number | null;
    source?: "raport" | "pindahan" | "empty";
  }>;
  upkSource: "manual" | "cbt" | "none";
  semesterCount: number;
  rataRaport: number | null;
  kontribusiRaport: number | null;
  nilaiUpk: number | null;
  kontribusiUpk: number | null;
  nilaiTranskrip: number | null;
  predikat: string;
};

type TranscriptStudentRow = {
  siswa: { id: string; nama: string; nisn: string; jenjang: string | null; tempatLahir?: string | null; tanggalLahir?: string | null };
  subjects: TranscriptSubject[];
  rataRaportKeseluruhan: number | null;
  rataUpkKeseluruhan: number | null;
  rataTranskrip: number | null;
  predikatKeseluruhan: string;
  mapelLengkapCount: number;
  totalMapelCount: number;
  statusKelulusan: "LULUS" | "PERLU_PERBAIKAN" | "BELUM_LENGKAP";
};

type TranscriptPayload = {
  bobot: { raport: number; upk: number };
  sekolah: { nama: string; npsn: string | null; alamat: string | null; kabupatenKota: string | null; kepalaSekolah: string | null; logoUrl: string | null };
  kopSurat?: SchoolProfile;
  kelasList: Array<{ id: string; nama: string }>;
  selectedKelasId: string;
  selectedKelasNama: string;
  semesters: Array<{ id: string; label: string; nama: string }>;
  mapel: Array<{ id: string; nama: string; kkm: number; skk: number }>;
  rows: TranscriptStudentRow[];
};

export function RaportSixSemesterLegerPanel({
  initialKelasId,
  sandboxRole,
  paketCTrack: externalTrack,
  onChangePaketCTrack,
  onOpenTranscript,
}: {
  initialKelasId?: string;
  sandboxRole?: "GURU" | "SISWA";
  paketCTrack?: PaketCTrack;
  onChangePaketCTrack?: (next: PaketCTrack) => void;
  onOpenTranscript?: () => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const [data, setData] = useState<TranscriptPayload | null>(null);
  const [kelasId, setKelasId] = useState(initialKelasId ?? "");
  const [selectedSiswaId, setSelectedSiswaId] = useState("");
  const [localTrack, setLocalTrack] = useState<PaketCTrack>(() => externalTrack ?? detectDefaultPaketCTrack(""));
  const paketCTrack = externalTrack ?? localTrack;
  const setTrack = (next: PaketCTrack) => {
    setLocalTrack(next);
    savePaketCTrackPreference(next);
    onChangePaketCTrack?.(next);
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lockRaportCells, setLockRaportCells] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [grid, setGrid] = useState<
    Record<
      string,
      { sem1: string; sem2: string; sem3: string; sem4: string; sem5: string; sem6: string; nilaiUpk: string }
    >
  >({});

  const loadData = useCallback(
    async (targetKelasId: string, signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const qs = targetKelasId ? `?kelasId=${encodeURIComponent(targetKelasId)}` : "";
        const headers = buildSandboxHeaders(sandboxRole === "GURU" ? "GURU" : undefined);
        const res = await fetchWithTimeout(`/api/sekolah/raport/transkrip${qs}`, {
          signal,
          ...(headers ? { headers } : {}),
        });
        const body = (await res.json().catch(() => null)) as (TranscriptPayload & { error?: string }) | null;
        if (!res.ok || !body) throw new Error(body?.error || "Data leger semester 1–6 belum dapat dimuat.");
        setData(body);
        setKelasId(body.selectedKelasId);
        setSelectedSiswaId((prev) =>
          body.rows.some((r) => r.siswa.id === prev) ? prev : (body.rows[0]?.siswa.id ?? ""),
        );
      } catch (failure) {
        if (!isCallerAborted(failure, signal)) {
          setError(describeFetchError(failure, "Data leger semester 1–6 belum dapat dimuat."));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [sandboxRole],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadData(kelasId, controller.signal);
    return () => controller.abort();
  }, [kelasId, loadData]);

  const activeRow = data?.rows.find((r) => r.siswa.id === selectedSiswaId) ?? data?.rows[0] ?? null;
  const activeProgram = detectKesetaraanProgram(data?.selectedKelasNama ?? "", activeRow?.siswa.jenjang);
  const visibleSubjects = useMemo(
    () =>
      activeRow
        ? filterItemsByKesetaraanTrack(
            activeRow.subjects,
            (s) => s.mapelNama,
            data?.selectedKelasNama ?? "",
            paketCTrack,
            activeRow.siswa.jenjang,
          )
        : [],
    [activeRow, data?.selectedKelasNama, paketCTrack],
  );

  useEffect(() => {
    if (!activeRow) {
      setGrid({});
      return;
    }
    const nextGrid: typeof grid = {};
    for (const sub of activeRow.subjects) {
      const vals = [0, 1, 2, 3, 4, 5].map((i) => {
        const v = sub.semesterBreakdown[i]?.nilai;
        return v !== null && v !== undefined ? String(v) : "";
      });
      nextGrid[sub.mapelId] = {
        sem1: vals[0],
        sem2: vals[1],
        sem3: vals[2],
        sem4: vals[3],
        sem5: vals[4],
        sem6: vals[5],
        nilaiUpk: sub.nilaiUpk !== null && sub.nilaiUpk !== undefined ? String(sub.nilaiUpk) : "",
      };
    }
    setGrid(nextGrid);
  }, [activeRow]);

  function updateCell(
    mapelId: string,
    field: "sem1" | "sem2" | "sem3" | "sem4" | "sem5" | "sem6" | "nilaiUpk",
    value: string,
  ) {
    setGrid((prev) => ({
      ...prev,
      [mapelId]: {
        ...(prev[mapelId] ?? { sem1: "", sem2: "", sem3: "", sem4: "", sem5: "", sem6: "", nilaiUpk: "" }),
        [field]: value,
      },
    }));
  }

  async function handleSaveAll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeRow || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const entries = visibleSubjects.map((sub) => {
        const row = grid[sub.mapelId] ?? { sem1: "", sem2: "", sem3: "", sem4: "", sem5: "", sem6: "", nilaiUpk: "" };
        const toNum = (raw: string) => {
          const trimmed = raw.trim();
          if (!trimmed) return null;
          const n = Number(trimmed);
          return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
        };
        return {
          mapelId: sub.mapelId,
          sem1: toNum(row.sem1),
          sem2: toNum(row.sem2),
          sem3: toNum(row.sem3),
          sem4: toNum(row.sem4),
          sem5: toNum(row.sem5),
          sem6: toNum(row.sem6),
          nilaiUpk: toNum(row.nilaiUpk),
        };
      });

      const headers = buildSandboxHeaders(sandboxRole === "GURU" ? "GURU" : undefined, {
        "Content-Type": "application/json",
      });
      const res = await fetchWithTimeout("/api/sekolah/raport/leger-semester", {
        method: "POST",
        headers,
        body: JSON.stringify({
          siswaId: activeRow.siswa.id,
          allowOverwriteRaport: !lockRaportCells,
          entries,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menyimpan leger raport semester 1–6.");
      setNotice(body?.message || "Leger raport semester 1–6 berhasil disimpan.");
      await loadData(kelasId);
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal menyimpan leger raport semester 1–6."));
    } finally {
      setSaving(false);
    }
  }

  const cardCls = isDark
    ? "border border-slate-700/60 bg-slate-900/75 text-slate-100"
    : "border border-slate-200/90 bg-white/95 text-slate-900 shadow-xs";

  const fieldCls = isDark
    ? "mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
    : "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900";

  const cellCls = isDark
    ? "w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs font-semibold tabular-nums text-white focus:border-amber-400 focus:outline-none"
    : "w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs font-semibold tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-4 ${cardCls}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-extrabold">
              <FileSpreadsheet size={18} className="text-sky-600" />
              Form Input Leger Raport Semester 1–6
            </h3>
            <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Isi nilai raport Semester 1 s.d. Semester 6 (dan nilai UPK jika diperlukan) untuk setiap mata pelajaran. Setelah disimpan, tab <strong>Transkrip Nilai Ijazah</strong> otomatis menarik nilai akhirnya.
            </p>
          </div>
          {onOpenTranscript && (
            <button
              type="button"
              onClick={onOpenTranscript}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-indigo-500"
            >
              <GraduationCap size={14} />
              Lihat Transkrip Nilai →
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold">
            Pilih Kelas / Program
            <select value={kelasId} onChange={(e) => setKelasId(e.target.value)} className={fieldCls}>
              {(data?.kelasList ?? []).map((k) => (
                <option key={k.id} value={k.id}>{k.nama}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold">
            Pilih Warga Belajar
            <select value={selectedSiswaId} onChange={(e) => setSelectedSiswaId(e.target.value)} className={fieldCls}>
              {(data?.rows ?? []).map((r) => (
                <option key={r.siswa.id} value={r.siswa.id}>
                  {r.siswa.nama} ({r.siswa.nisn})
                </option>
              ))}
            </select>
          </label>
        </div>

        {activeProgram === "PAKET_C" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-3 text-xs">
            <span className="font-bold">Jurusan Paket C:</span>
            {(["IPA", "IPS"] as const).map((tr) => (
              <button
                key={tr}
                type="button"
                aria-pressed={paketCTrack === tr}
                onClick={() => setTrack(tr)}
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
        )}
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}

      {loading ? (
        <CardGridSkeleton count={2} columns={2} />
      ) : !activeRow ? (
        <EmptyState title="Belum ada warga belajar di kelas ini" description="Pilih kelas yang memiliki siswa aktif untuk mengisi leger raport semester 1–6." />
      ) : (
        <form onSubmit={handleSaveAll} className={`space-y-4 rounded-2xl p-4 sm:p-5 ${cardCls}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-extrabold">{activeRow.siswa.nama}</p>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                NISN: <span className="font-mono">{activeRow.siswa.nisn}</span> · {data?.selectedKelasNama}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setLockRaportCells((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  lockRaportCells
                    ? isDark
                      ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : isDark
                      ? "border-amber-400/35 bg-amber-500/15 text-amber-200"
                      : "border-amber-300 bg-amber-50 text-amber-900"
                }`}
              >
                {lockRaportCells ? <Lock size={13} /> : <Unlock size={13} />}
                {lockRaportCells ? "Nilai E-Raport Terkunci" : "Mode Edit Semua Nilai"}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? "Menyimpan..." : "Simpan Leger Semester 1–6"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className={isDark ? "text-slate-300" : "text-slate-600"}>Otomatis dari E-Raport (terkunci)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
              <span className={isDark ? "text-slate-300" : "text-slate-600"}>Input Manual / WB Pindahan</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-slate-400 bg-white" />
              <span className={isDark ? "text-slate-300" : "text-slate-600"}>Kosong (siap diisi)</span>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-xs">
              <thead>
                <tr className={isDark ? "border-b border-slate-700 text-slate-300" : "border-b border-slate-200 bg-slate-50 text-slate-700"}>
                  <th className="px-2.5 py-2 text-center">No</th>
                  <th className="px-2.5 py-2">Mata Pelajaran</th>
                  {[0, 1, 2, 3, 4, 5].map((idxSem) => {
                    const semInfo = data?.semesters[idxSem];
                    return (
                      <th key={idxSem} className="px-1.5 py-2 text-center">
                        <div>Sem {idxSem + 1}</div>
                        {semInfo?.nama && (
                          <div className="text-[9px] font-medium text-slate-400">{semInfo.nama}</div>
                        )}
                      </th>
                    );
                  })}
                  <th className="px-1.5 py-2 text-center">Nilai UPK</th>
                  <th className="px-2.5 py-2 text-center">Nilai Akhir</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"}`}>
                {visibleSubjects.map((sub, idx) => {
                  const r = grid[sub.mapelId] ?? { sem1: "", sem2: "", sem3: "", sem4: "", sem5: "", sem6: "", nilaiUpk: "" };
                  const semVals = [r.sem1, r.sem2, r.sem3, r.sem4, r.sem5, r.sem6]
                    .map((v) => (v.trim() === "" ? null : Number(v)))
                    .filter((n): n is number => n !== null && Number.isFinite(n));
                  const avgSem = semVals.length > 0 ? semVals.reduce((a, b) => a + b, 0) / semVals.length : null;
                  const upkVal = r.nilaiUpk.trim() === "" ? null : Number(r.nilaiUpk);
                  const liveFinal =
                    avgSem !== null && upkVal !== null && Number.isFinite(upkVal)
                      ? Math.round((avgSem * 0.6 + upkVal * 0.4) * 100) / 100
                      : avgSem !== null
                        ? Math.round(avgSem * 100) / 100
                        : null;

                  return (
                    <tr key={sub.mapelId}>
                      <td className="px-2.5 py-2 text-center tabular-nums">{idx + 1}</td>
                      <td className="px-2.5 py-2 font-semibold">{sub.mapelNama}</td>
                      {(["sem1", "sem2", "sem3", "sem4", "sem5", "sem6", "nilaiUpk"] as const).map((field, fIdx) => {
                        const semMeta = fIdx < 6 ? sub.semesterBreakdown[fIdx] : undefined;
                        const isFromRaport = semMeta?.source === "raport";
                        const isFromPindahan = semMeta?.source === "pindahan";
                        const disabledCell = isFromRaport && lockRaportCells;
                        const statusRing = isFromRaport
                          ? isDark
                            ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-200"
                            : "border-emerald-400 bg-emerald-50/80 text-emerald-950"
                          : isFromPindahan
                            ? isDark
                              ? "border-sky-500/50 bg-sky-950/40 text-sky-200"
                              : "border-sky-400 bg-sky-50/80 text-sky-950"
                            : "";
                        return (
                          <td key={field} className="px-1.5 py-1.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              disabled={disabledCell}
                              title={
                                isFromRaport
                                  ? "Otomatis dari E-Raport (klik 'Nilai E-Raport Terkunci' untuk membuka edit)"
                                  : isFromPindahan
                                    ? "Input manual / nilai bawaan WB pindahan"
                                    : "Belum ada nilai — isi manual jika WB pindahan"
                              }
                              aria-label={`${sub.mapelNama} ${field}`}
                              value={r[field]}
                              onChange={(e) => updateCell(sub.mapelId, field, e.target.value)}
                              placeholder="-"
                              className={`${cellCls} ${statusRing} ${disabledCell ? "cursor-not-allowed opacity-85" : ""}`}
                            />
                          </td>
                        );
                      })}
                      <td className="px-2.5 py-2 text-center font-extrabold tabular-nums text-indigo-600">
                        {liveFinal !== null ? liveFinal : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? "Menyimpan..." : "Simpan Leger Semester 1–6"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function RaportTranscriptPanel({
  initialKelasId,
  sandboxRole,
  paketCTrack: externalTrack,
  onChangePaketCTrack,
}: {
  initialKelasId?: string;
  sandboxRole?: "GURU" | "SISWA";
  paketCTrack?: PaketCTrack;
  onChangePaketCTrack?: (next: PaketCTrack) => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const [data, setData] = useState<TranscriptPayload | null>(null);
  const [kelasId, setKelasId] = useState(initialKelasId ?? "");
  const [selectedSiswaId, setSelectedSiswaId] = useState("");
  const [localTrack, setLocalTrack] = useState<PaketCTrack>(() => externalTrack ?? detectDefaultPaketCTrack(""));
  const paketCTrack = externalTrack ?? localTrack;
  const setTrack = (next: PaketCTrack) => {
    setLocalTrack(next);
    savePaketCTrackPreference(next);
    onChangePaketCTrack?.(next);
  };
  const [loading, setLoading] = useState(true);
  const [savingUpk, setSavingUpk] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Quick manual UPK score form
  const [upkMapelId, setUpkMapelId] = useState("");
  const [upkScore, setUpkScore] = useState("85");

  // Optional official transcript metadata for print
  const [nomorTranskrip, setNomorTranskrip] = useState("");
  const [nomorIjazah, setNomorIjazah] = useState("");
  const [tanggalKelulusan, setTanggalKelulusan] = useState("");

  const loadTranscript = useCallback(async (targetKelasId: string, signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const qs = targetKelasId ? `?kelasId=${encodeURIComponent(targetKelasId)}` : "";
      const headers = buildSandboxHeaders(sandboxRole === "GURU" ? "GURU" : undefined);
      const res = await fetchWithTimeout(`/api/sekolah/raport/transkrip${qs}`, {
        signal,
        ...(headers ? { headers } : {}),
      });
      const body = (await res.json().catch(() => null)) as (TranscriptPayload & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error || "Transkrip nilai belum dapat dimuat.");
      setData(body);
      setKelasId(body.selectedKelasId);
      setSelectedSiswaId((prev) =>
        body.rows.some((r) => r.siswa.id === prev) ? prev : (body.rows[0]?.siswa.id ?? ""),
      );
      setUpkMapelId((prev) => prev || body.mapel[0]?.id || "");
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Transkrip nilai belum dapat dimuat."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [sandboxRole]);

  useEffect(() => {
    const controller = new AbortController();
    void loadTranscript(kelasId, controller.signal);
    return () => controller.abort();
  }, [kelasId, loadTranscript]);

  const rawActiveRow = data?.rows.find((r) => r.siswa.id === selectedSiswaId) ?? data?.rows[0] ?? null;
  const transcriptProgram = detectKesetaraanProgram(data?.selectedKelasNama ?? "", rawActiveRow?.siswa.jenjang);
  const visibleMapels = useMemo(
    () =>
      filterItemsByKesetaraanTrack(
        data?.mapel ?? [],
        (m) => m.nama,
        data?.selectedKelasNama ?? "",
        paketCTrack,
        rawActiveRow?.siswa.jenjang,
      ),
    [data?.mapel, data?.selectedKelasNama, paketCTrack, rawActiveRow?.siswa.jenjang],
  );
  const filteredRows = useMemo(() => {
    if (!data) return [];
    return data.rows.map((r) => {
      const subjects = filterItemsByKesetaraanTrack(
        r.subjects,
        (s) => s.mapelNama,
        data.selectedKelasNama,
        paketCTrack,
        r.siswa.jenjang,
      );
      const vals = subjects.map((s) => s.nilaiTranskrip).filter((v): v is number => v !== null && Number.isFinite(v));
      const avg = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
      return {
        ...r,
        subjects,
        rataTranskrip: avg,
        predikatKeseluruhan: predikatFromScore(avg),
      };
    });
  }, [data, paketCTrack]);
  const activeRow = filteredRows.find((r) => r.siswa.id === selectedSiswaId) ?? filteredRows[0] ?? null;
  const groupedActiveSubjects = useMemo(
    () =>
      activeRow
        ? groupTranscriptSubjects(
            activeRow.subjects,
            (s) => s.mapelNama,
            data?.selectedKelasNama ?? "",
            paketCTrack,
            activeRow.siswa.jenjang,
          )
        : [],
    [activeRow, data?.selectedKelasNama, paketCTrack],
  );

  function formatTtl(tempat?: string | null, tanggal?: string | null): string {
    const cleanTempat = (tempat ?? "").trim();
    let formattedDate = "";
    if (tanggal) {
      const parsed = new Date(tanggal);
      if (!Number.isNaN(parsed.getTime())) {
        formattedDate = parsed.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
      }
    }
    if (cleanTempat && formattedDate) return `${cleanTempat}, ${formattedDate}`;
    return cleanTempat || formattedDate || "...........................................";
  }

  function formatTanggalKelulusan(raw: string): string {
    if (!raw.trim()) return "...........................................";
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    }
    return raw.trim();
  }

  async function handleSaveUpk(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingUpk || !activeRow || !upkMapelId) return;
    const score = Number(upkScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      setError("Nilai UPK harus berupa angka antara 0 sampai 100.");
      return;
    }
    setSavingUpk(true);
    setError("");
    setNotice("");
    try {
      const headers = buildSandboxHeaders(sandboxRole === "GURU" ? "GURU" : undefined, {
        "Content-Type": "application/json",
      });
      const res = await fetchWithTimeout("/api/sekolah/raport/upk-nilai", {
        method: "POST",
        headers,
        body: JSON.stringify({
          siswaId: activeRow.siswa.id,
          mapelId: upkMapelId,
          nilaiUpk: score,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Gagal menyimpan nilai UPK.");
      setNotice(body?.message || "Nilai UPK disimpan.");
      await loadTranscript(kelasId);
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal menyimpan nilai UPK."));
    } finally {
      setSavingUpk(false);
    }
  }

  async function handleExportTranscriptExcel() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const summaryRows = filteredRows.map((r, idx) => ({
      No: idx + 1,
      NISN: r.siswa.nisn,
      "Nama Warga Belajar": r.siswa.nama,
      "Nilai Akhir Transkrip": r.rataTranskrip ?? "-",
      Predikat: r.predikatKeseluruhan,
      Status: r.statusKelulusan,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Leger Transkrip");

    if (activeRow) {
      const detailRows = activeRow.subjects.map((s, idx) => ({
        No: idx + 1,
        "Mata Pelajaran": s.mapelNama,
        "Nilai Akhir": s.nilaiTranskrip ?? "-",
        Predikat: s.predikat,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Transkrip Siswa");
    }

    const safeClass = (data.selectedKelasNama || "kelas").replace(/[^a-zA-Z0-9_-]+/g, "_");
    XLSX.writeFile(wb, `Transkrip_Nilai_Ijazah_${safeClass}.xlsx`);
  }

  const cardCls = isDark
    ? "border border-slate-700/60 bg-slate-900/75 text-slate-100"
    : "border border-slate-200/90 bg-white/95 text-slate-900 shadow-xs";

  const fieldCls = isDark
    ? "mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
    : "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900";

  return (
    <div className="space-y-5">
      <div className="no-print space-y-4">
        <div className={`rounded-2xl p-4 ${cardCls}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-base font-extrabold">
                <GraduationCap size={18} className="text-indigo-600" />
                Transkrip Nilai Kelulusan (Pendamping Ijazah)
              </h3>
              <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Nilai akhir transkrip dihitung otomatis dari rekap nilai raport dan hasil UPK/Ujian Akhir. Dokumen cetak hanya menampilkan Nilai Akhir &amp; Predikat secara bersih dan siap cetak.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!data || data.rows.length === 0}
                onClick={() => void handleExportTranscriptExcel()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <Download size={14} />
                Unduh Excel (.xlsx)
              </button>
              <button
                type="button"
                disabled={!activeRow}
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Printer size={14} />
                Cetak Transkrip Ijazah
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold">
              Pilih Kelas (Prioritas Kelas Akhir: 6 / 9 / 12)
              <select value={kelasId} onChange={(e) => setKelasId(e.target.value)} className={fieldCls}>
                {(data?.kelasList ?? []).map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold">
              Pilih Warga Belajar untuk Pratinjau Transkrip
              <select value={selectedSiswaId} onChange={(e) => setSelectedSiswaId(e.target.value)} className={fieldCls}>
                {filteredRows.map((r) => (
                  <option key={r.siswa.id} value={r.siswa.id}>
                    {r.siswa.nama} ({r.siswa.nisn}) {r.rataTranskrip !== null ? `· Nilai Akhir ${r.rataTranskrip}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {transcriptProgram === "PAKET_C" && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-3 text-xs">
              <span className="font-bold">Jurusan Paket C (Transkrip):</span>
              {(["IPA", "IPS"] as const).map((tr) => (
                <button
                  key={tr}
                  type="button"
                  aria-pressed={paketCTrack === tr}
                  onClick={() => setTrack(tr)}
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
                {paketCTrack === "IPA"
                  ? "(Kelompok Peminatan MIPA · Mapel IPS disembunyikan)"
                  : "(Kelompok Peminatan Ilmu-Ilmu Sosial · Mapel IPA disembunyikan)"}
              </span>
            </div>
          )}

          <div className="mt-3 grid gap-3 border-t border-slate-200/60 pt-3 sm:grid-cols-3">
            <label className="block text-xs font-bold">
              Nomor Transkrip (Opsional)
              <input
                type="text"
                value={nomorTranskrip}
                onChange={(e) => setNomorTranskrip(e.target.value)}
                placeholder="Contoh: 421/012/PKBM/2026"
                className={fieldCls}
              />
            </label>
            <label className="block text-xs font-bold">
              Nomor Ijazah (Opsional)
              <input
                type="text"
                value={nomorIjazah}
                onChange={(e) => setNomorIjazah(e.target.value)}
                placeholder="Contoh: DN-02/PC/K13/26/0001234"
                className={fieldCls}
              />
            </label>
            <label className="block text-xs font-bold">
              Tanggal Kelulusan (Opsional)
              <input
                type="date"
                value={tanggalKelulusan}
                onChange={(e) => setTanggalKelulusan(e.target.value)}
                className={fieldCls}
              />
            </label>
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}

        {activeRow && data && data.mapel.length > 0 && (
          <form onSubmit={handleSaveUpk} className={`flex flex-wrap items-end gap-3 rounded-2xl p-4 ${cardCls}`}>
            <div className="min-w-[200px] flex-1">
              <label className="block text-xs font-bold">
                Input / Sesuaikan Nilai UPK Manual ({activeRow.siswa.nama})
                <select value={upkMapelId} onChange={(e) => setUpkMapelId(e.target.value)} className={fieldCls}>
                  {visibleMapels.map((m) => (
                    <option key={m.id} value={m.id}>{m.nama}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block w-32 text-xs font-bold">
              Nilai UPK (0–100)
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={upkScore}
                onChange={(e) => setUpkScore(e.target.value)}
                className={fieldCls}
              />
            </label>
            <button
              type="submit"
              disabled={savingUpk}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              <Save size={14} />
              {savingUpk ? "Menyimpan..." : "Simpan Nilai UPK"}
            </button>
          </form>
        )}
      </div>

      {loading ? (
        <CardGridSkeleton count={2} columns={2} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title="Belum ada data siswa pada kelas ini" description="Pilih kelas yang sudah memiliki warga belajar untuk menghitung Transkrip Nilai 60/40." />
      ) : (
        <>
          {/* Ringkasan Leger Transkrip Kelas */}
          <div className={`no-print rounded-2xl p-4 ${cardCls}`}>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-extrabold">
              <Award size={16} className="text-amber-500" />
              Leger Transkrip Kelulusan Kelas — {data.selectedKelasNama}
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-left text-xs">
                <thead>
                  <tr className={isDark ? "border-b border-slate-700 text-slate-300" : "border-b border-slate-200 bg-slate-50 text-slate-700"}>
                    <th className="px-3 py-2">No</th>
                    <th className="px-3 py-2">Nama Warga Belajar</th>
                    <th className="px-3 py-2 text-center">Nilai Akhir</th>
                    <th className="px-3 py-2 text-center">Predikat</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r, idx) => (
                    <tr
                      key={r.siswa.id}
                      onClick={() => setSelectedSiswaId(r.siswa.id)}
                      className={`cursor-pointer border-b transition ${
                        r.siswa.id === activeRow?.siswa.id
                          ? isDark
                            ? "border-slate-700 bg-indigo-950/40"
                            : "border-indigo-200 bg-indigo-50/70"
                          : isDark
                            ? "border-slate-800 hover:bg-slate-800/40"
                            : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-3 py-2 tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-2 font-bold">{r.siswa.nama}</td>
                      <td className="px-3 py-2 text-center font-extrabold tabular-nums text-indigo-700">{r.rataTranskrip ?? "-"}</td>
                      <td className="px-3 py-2 text-center font-bold">{r.predikatKeseluruhan}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                          r.statusKelulusan === "LULUS"
                            ? "bg-emerald-100 text-emerald-800"
                            : r.statusKelulusan === "PERLU_PERBAIKAN"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                        }`}>
                          {r.statusKelulusan === "LULUS" && <CheckCircle2 size={11} />}
                          {r.statusKelulusan === "LULUS" ? "LULUS" : r.statusKelulusan === "PERLU_PERBAIKAN" ? "PERLU PERBAIKAN" : "MENUNGGU DATA"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dokumen Resmi Transkrip Nilai (1 Lembar A4) */}
          {activeRow && (
            <article className="print-sheet transcript-print-sheet rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 shadow-sm sm:p-6">
              <KopSurat profile={buildKopSuratProfile(data.kopSurat, data.sekolah)} />

              <div className="mt-2.5 text-center">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-950">
                  TRANSKRIP NILAI
                </h3>
                <p className="mt-0.5 text-[11px] font-medium text-slate-800">
                  Nomor: {nomorTranskrip.trim() || "................................................."}
                </p>
              </div>

              <div className="mt-2.5 text-[11px] leading-snug text-slate-900">
                <div className="transcript-meta-row flex py-0.5">
                  <span className="w-52 shrink-0">Satuan Pendidikan</span>
                  <span className="mr-2">:</span>
                  <span className="font-semibold text-slate-950">{data.sekolah.nama}</span>
                </div>
                <div className="transcript-meta-row flex py-0.5">
                  <span className="w-52 shrink-0">Nomor Pokok Sekolah Nasional</span>
                  <span className="mr-2">:</span>
                  <span className="font-mono font-semibold text-slate-950">{data.sekolah.npsn || "-"}</span>
                </div>
                <div className="transcript-meta-row flex py-0.5">
                  <span className="w-52 shrink-0">Nama Lengkap</span>
                  <span className="mr-2">:</span>
                  <span className="font-bold text-slate-950">{activeRow.siswa.nama}</span>
                </div>
                <div className="transcript-meta-row flex py-0.5">
                  <span className="w-52 shrink-0">Tempat, Tanggal Lahir</span>
                  <span className="mr-2">:</span>
                  <span className="text-slate-950">
                    {formatTtl(activeRow.siswa.tempatLahir, activeRow.siswa.tanggalLahir)}
                  </span>
                </div>
                <div className="transcript-meta-row flex py-0.5">
                  <span className="w-52 shrink-0">Nomor Induk Siswa Nasional</span>
                  <span className="mr-2">:</span>
                  <span className="font-mono font-semibold text-slate-950">{activeRow.siswa.nisn}</span>
                </div>
                <div className="transcript-meta-row flex py-0.5">
                  <span className="w-52 shrink-0">Nomor Ijazah</span>
                  <span className="mr-2">:</span>
                  <span className="font-mono text-slate-950">
                    {nomorIjazah.trim() || "..........................................."}
                  </span>
                </div>
                <div className="transcript-meta-row flex py-0.5">
                  <span className="w-52 shrink-0">Tanggal Kelulusan</span>
                  <span className="mr-2">:</span>
                  <span className="text-slate-950">{formatTanggalKelulusan(tanggalKelulusan)}</span>
                </div>
              </div>

              <div className="mt-2.5 overflow-x-auto">
                <table className="transcript-table w-full border-collapse border border-slate-800 text-left text-[11px] leading-tight">
                  <thead>
                    <tr className="bg-slate-100 font-bold text-slate-950">
                      <th className="w-10 border border-slate-800 px-2 py-1 text-center">No.</th>
                      <th className="border border-slate-800 px-2.5 py-1 text-center">Mata Pelajaran</th>
                      <th className="w-24 border border-slate-800 px-2 py-1 text-center">Nilai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedActiveSubjects.map((group) => (
                      <Fragment key={group.key}>
                        <tr className="bg-slate-50/90 font-semibold text-slate-950">
                          <td colSpan={2} className="border border-slate-800 px-2 py-1">
                            {group.title}
                          </td>
                          <td className="border border-slate-800 px-2 py-1" />
                        </tr>
                        {group.items.map((sub, idx) => (
                          <tr key={sub.mapelId}>
                            <td className="border border-slate-800 px-2 py-0.5 text-center tabular-nums">
                              {idx + 1}.
                            </td>
                            <td className="border border-slate-800 px-2.5 py-0.5 text-slate-900">
                              {sub.mapelNama}
                            </td>
                            <td className="border border-slate-800 px-2 py-0.5 text-center font-semibold tabular-nums text-slate-950">
                              {sub.nilaiTranskrip !== null ? sub.nilaiTranskrip : "-"}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold text-slate-950">
                      <td colSpan={2} className="border border-slate-800 px-2.5 py-1 text-center">
                        Rata-rata
                      </td>
                      <td className="border border-slate-800 px-2 py-1 text-center tabular-nums">
                        {activeRow.rataTranskrip !== null ? activeRow.rataTranskrip : "-"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="print-avoid-break mt-4 flex flex-wrap items-end justify-between gap-4 text-center text-[11px] leading-snug">
                <div className="flex flex-col items-center">
                  <QrCodeSvg
                    value={`TRANSKRIP-IJAZAH|${data.sekolah.npsn || data.sekolah.nama}|${activeRow.siswa.nisn}|${activeRow.rataTranskrip ?? "N/A"}`}
                    size={62}
                    label="QR Verifikasi Transkrip Nilai"
                    className="rounded border border-slate-300 p-0.5"
                  />
                  <p className="mt-0.5 text-[9px] font-medium text-slate-500">QR Verifikasi Keaslian</p>
                </div>
                <div className="w-60">
                  <p>
                    {data.sekolah.kabupatenKota || "Setempat"},{" "}
                    {tanggalKelulusan
                      ? formatTanggalKelulusan(tanggalKelulusan)
                      : new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  <p className="font-bold">Kepala {data.sekolah.nama}</p>
                  <div className="h-12" />
                  <p className="font-bold underline">{data.sekolah.kepalaSekolah || "Kepala Lembaga"}</p>
                  <p className="text-[10px] text-slate-600">NPSN: {data.sekolah.npsn || "-"}</p>
                </div>
              </div>
            </article>
          )}
        </>
      )}
    </div>
  );
}
