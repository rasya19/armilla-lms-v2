import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Download, FileSpreadsheet, GraduationCap, Printer, Save } from "lucide-react";
import { buildSandboxHeaders } from "../utils/safeUrl";
import { CardGridSkeleton, EmptyState } from "./DashboardUI";
import { QrCodeSvg } from "./QrCodeSvg";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { useTenantTheme } from "./TenantThemeProvider";

export type LegerRaportData = {
  sekolah: { nama: string; npsn: string | null; alamat: string | null; kabupatenKota: string | null; kepalaSekolah: string | null; logoUrl: string | null };
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
        <div className="rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 shadow-xs sm:p-6">
          <div className="mb-4 border-b-2 border-slate-900 pb-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-sky-800">Leger Nilai Raport Pendidikan Kesetaraan</p>
            <h4 className="text-lg font-black uppercase">{data.sekolah.nama}</h4>
            <p className="text-xs text-slate-600">
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
        </div>
      )}
    </div>
  );
}

type TranscriptSubject = {
  mapelId: string;
  mapelNama: string;
  kkm: number;
  skk: number;
  semesterBreakdown: Array<{ tahunAjaranId: string; label: string; nilai: number | null }>;
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
  kelasList: Array<{ id: string; nama: string }>;
  selectedKelasId: string;
  selectedKelasNama: string;
  semesters: Array<{ id: string; label: string; nama: string }>;
  mapel: Array<{ id: string; nama: string; kkm: number; skk: number }>;
  rows: TranscriptStudentRow[];
};

export function RaportTranscriptPanel({
  initialKelasId,
  sandboxRole,
}: {
  initialKelasId?: string;
  sandboxRole?: "GURU" | "SISWA";
}) {
  const isDark = useTenantTheme() === "dark";
  const [data, setData] = useState<TranscriptPayload | null>(null);
  const [kelasId, setKelasId] = useState(initialKelasId ?? "");
  const [selectedSiswaId, setSelectedSiswaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingUpk, setSavingUpk] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Quick manual UPK score form
  const [upkMapelId, setUpkMapelId] = useState("");
  const [upkScore, setUpkScore] = useState("85");

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

  const activeRow = data?.rows.find((r) => r.siswa.id === selectedSiswaId) ?? data?.rows[0] ?? null;

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
    const summaryRows = data.rows.map((r, idx) => ({
      No: idx + 1,
      NISN: r.siswa.nisn,
      "Nama Warga Belajar": r.siswa.nama,
      "Rata-rata Raport 6 Sem": r.rataRaportKeseluruhan ?? "-",
      "Rata-rata UPK": r.rataUpkKeseluruhan ?? "-",
      "Nilai Transkrip Ijazah (60/40)": r.rataTranskrip ?? "-",
      Predikat: r.predikatKeseluruhan,
      Status: r.statusKelulusan,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Leger Transkrip 60-40");

    if (activeRow) {
      const detailRows = activeRow.subjects.map((s, idx) => ({
        No: idx + 1,
        "Mata Pelajaran": s.mapelNama,
        SKK: s.skk,
        "Rata-rata Raport (6 Sem)": s.rataRaport ?? "-",
        "Bobot 60% Raport": s.kontribusiRaport ?? "-",
        "Nilai UPK": s.nilaiUpk ?? "-",
        "Bobot 40% UPK": s.kontribusiUpk ?? "-",
        "Nilai Transkrip (Ijazah)": s.nilaiTranskrip ?? "-",
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
                Rumus resmi: <strong>60% Rata-rata Nilai Raport (6 Semester)</strong> + <strong>40% Nilai UPK / Ujian Akhir</strong>. Nilai UPK diambil otomatis dari hasil CBT berkode <code className="font-mono font-bold">UAK-</code>/<code className="font-mono font-bold">UPK-</code> atau dapat diinput manual di bawah.
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
                {(data?.rows ?? []).map((r) => (
                  <option key={r.siswa.id} value={r.siswa.id}>
                    {r.siswa.nama} ({r.siswa.nisn}) {r.rataTranskrip !== null ? `· Transkrip ${r.rataTranskrip}` : ""}
                  </option>
                ))}
              </select>
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
                  {data.mapel.map((m) => (
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
                    <th className="px-3 py-2 text-center">Rata Raport (60%)</th>
                    <th className="px-3 py-2 text-center">Rata UPK (40%)</th>
                    <th className="px-3 py-2 text-center">Nilai Transkrip</th>
                    <th className="px-3 py-2 text-center">Predikat</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, idx) => (
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
                      <td className="px-3 py-2 text-center tabular-nums">{r.rataRaportKeseluruhan ?? "-"}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{r.rataUpkKeseluruhan ?? "-"}</td>
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

          {/* Dokumen Resmi Transkrip Nilai Pendamping Ijazah */}
          {activeRow && (
            <div className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-900 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-900 pb-4">
                <div className="flex items-center gap-4">
                  {data.sekolah.logoUrl ? (
                    <img src={data.sekolah.logoUrl} alt={data.sekolah.nama} className="h-14 w-14 rounded-lg object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-900 text-xl font-black text-white">
                      {data.sekolah.nama.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-800">Transkrip Nilai Pendamping Ijazah · Pendidikan Kesetaraan</p>
                    <h3 className="text-xl font-black uppercase text-slate-900">{data.sekolah.nama}</h3>
                    <p className="text-xs text-slate-600">
                      NPSN: {data.sekolah.npsn || "-"} · {data.sekolah.alamat || data.sekolah.kabupatenKota || "Indonesia"}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <p className="font-extrabold text-indigo-900">Komposisi Nilai Akhir</p>
                  <p className="text-slate-600">60% Raport (6 Semester) + 40% UPK</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2">
                <div><span className="text-slate-500">Nama Lengkap:</span> <strong className="ml-1">{activeRow.siswa.nama}</strong></div>
                <div><span className="text-slate-500">NISN / No. Induk:</span> <strong className="ml-1 font-mono">{activeRow.siswa.nisn}</strong></div>
                <div><span className="text-slate-500">Program / Kelas Akhir:</span> <strong className="ml-1">{data.selectedKelasNama}</strong></div>
                <div>
                  <span className="text-slate-500">Rata-rata Transkrip Ijazah:</span>{" "}
                  <strong className="ml-1 text-indigo-800">
                    {activeRow.rataTranskrip !== null ? `${activeRow.rataTranskrip} (Predikat ${activeRow.predikatKeseluruhan})` : "Belum lengkap"}
                  </strong>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse border border-slate-300 text-left text-xs">
                  <thead>
                    <tr className="bg-slate-100 font-bold text-slate-800">
                      <th className="border border-slate-300 px-2.5 py-2 text-center">No</th>
                      <th className="border border-slate-300 px-2.5 py-2">Mata Pelajaran</th>
                      <th className="border border-slate-300 px-2.5 py-2 text-center">Rata Raport (6 Sem)</th>
                      <th className="border border-slate-300 bg-sky-50 px-2.5 py-2 text-center">60% Raport</th>
                      <th className="border border-slate-300 px-2.5 py-2 text-center">Nilai UPK</th>
                      <th className="border border-slate-300 bg-amber-50 px-2.5 py-2 text-center">40% UPK</th>
                      <th className="border border-slate-300 bg-indigo-50 px-2.5 py-2 text-center">Nilai Transkrip (Ijazah)</th>
                      <th className="border border-slate-300 px-2.5 py-2 text-center">Predikat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRow.subjects.map((sub, idx) => (
                      <tr key={sub.mapelId}>
                        <td className="border border-slate-300 px-2.5 py-2 text-center tabular-nums">{idx + 1}</td>
                        <td className="border border-slate-300 px-2.5 py-2">
                          <div className="font-semibold">{sub.mapelNama}</div>
                          <div className="text-[10px] text-slate-500">
                            {sub.semesterCount} semester tercatat · Sumber UPK:{" "}
                            {sub.upkSource === "cbt" ? "Otomatis CBT" : sub.upkSource === "manual" ? "Input Manual" : "Belum ada"}
                          </div>
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 text-center tabular-nums">{sub.rataRaport ?? "-"}</td>
                        <td className="border border-slate-300 bg-sky-50/50 px-2.5 py-2 text-center font-semibold tabular-nums">{sub.kontribusiRaport ?? "-"}</td>
                        <td className="border border-slate-300 px-2.5 py-2 text-center tabular-nums">{sub.nilaiUpk ?? "-"}</td>
                        <td className="border border-slate-300 bg-amber-50/50 px-2.5 py-2 text-center font-semibold tabular-nums">{sub.kontribusiUpk ?? "-"}</td>
                        <td className="border border-slate-300 bg-indigo-50/60 px-2.5 py-2 text-center font-black tabular-nums text-indigo-900">
                          {sub.nilaiTranskrip ?? "-"}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 text-center font-bold">{sub.predikat}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-extrabold">
                      <td colSpan={2} className="border border-slate-300 px-2.5 py-2 text-right">Rata-rata Keseluruhan</td>
                      <td className="border border-slate-300 px-2.5 py-2 text-center tabular-nums">{activeRow.rataRaportKeseluruhan ?? "-"}</td>
                      <td className="border border-slate-300 px-2.5 py-2 text-center tabular-nums">
                        {activeRow.rataRaportKeseluruhan !== null ? Math.round(activeRow.rataRaportKeseluruhan * 60) / 100 : "-"}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-2 text-center tabular-nums">{activeRow.rataUpkKeseluruhan ?? "-"}</td>
                      <td className="border border-slate-300 px-2.5 py-2 text-center tabular-nums">
                        {activeRow.rataUpkKeseluruhan !== null ? Math.round(activeRow.rataUpkKeseluruhan * 40) / 100 : "-"}
                      </td>
                      <td className="border border-slate-300 bg-indigo-100 px-2.5 py-2 text-center text-indigo-950 tabular-nums">
                        {activeRow.rataTranskrip ?? "-"}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-2 text-center">{activeRow.predikatKeseluruhan}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-8 flex flex-wrap items-end justify-between gap-6 text-center text-xs">
                <div className="flex flex-col items-center">
                  <QrCodeSvg
                    value={`TRANSKRIP-IJAZAH|${data.sekolah.npsn || data.sekolah.nama}|${activeRow.siswa.nisn}|${activeRow.rataTranskrip ?? "N/A"}`}
                    size={84}
                    label="QR Verifikasi Transkrip Ijazah"
                    className="rounded-lg border border-slate-200 p-1"
                  />
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">QR Verifikasi Keaslian Transkrip</p>
                </div>
                <div className="w-64">
                  <p>
                    {data.sekolah.kabupatenKota || "Setempat"},{" "}
                    {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  <p className="font-bold">Kepala {data.sekolah.nama}</p>
                  <div className="h-16" />
                  <p className="font-bold underline">{data.sekolah.kepalaSekolah || "Kepala Lembaga"}</p>
                  <p className="text-[11px] text-slate-500">NPSN: {data.sekolah.npsn || "-"}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
