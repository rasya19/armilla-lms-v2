import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Info, UploadCloud } from "lucide-react";
import { emptyStudentMapping, mappedStudentRows, readStudentSheet, studentFields } from "./studentImportData";
import type { SheetRow, SkippedRow, StudentMapping } from "./studentImportData";
import { describeFetchError, fetchWithTimeout } from "./fetchWithTimeout";

export type StudentImportResult = {
  created: number;
  updated: number;
  skippedEmpty: number;
  skipped: SkippedRow[];
  accountsCreated?: number;
  matchedClasses?: number;
  createdClasses?: string[];
  unmatchedClasses?: string[];
  withoutClassCount?: number;
};

export function StudentImportSummary({
  result,
  isDark = false,
  onDismiss,
  action,
}: {
  result: StudentImportResult;
  isDark?: boolean;
  onDismiss?: () => void;
  action?: React.ReactNode;
}) {
  const skippedCount = result.skippedEmpty ?? result.skipped.length;
  return (
    <div
      role="status"
      className={`mt-4 rounded-xl border p-4 text-sm ${
        isDark
          ? "border-emerald-500/35 bg-emerald-950/50 text-emerald-100"
          : "border-emerald-200 bg-emerald-50 text-emerald-950"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="font-bold">
            Impor selesai: {result.created} berhasil ditambahkan, {result.updated} diperbarui, {skippedCount} baris kosong dilewati.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {typeof result.accountsCreated === "number" && result.accountsCreated > 0 && (
              <span
                className={`rounded-md px-2 py-0.5 font-semibold ${
                  isDark ? "bg-emerald-500/20 text-emerald-200" : "bg-emerald-100 text-emerald-900"
                }`}
              >
                {result.accountsCreated} akun login dibuat otomatis (sandi awal DDMMYYYY / 123456)
              </span>
            )}
            {result.createdClasses && result.createdClasses.length > 0 && (
              <span
                className={`rounded-md px-2 py-0.5 font-semibold ${
                  isDark ? "bg-cyan-500/20 text-cyan-200" : "bg-sky-100 text-sky-900"
                }`}
              >
                Rombel dibuat otomatis: {result.createdClasses.join(", ")}
              </span>
            )}
            {result.unmatchedClasses && result.unmatchedClasses.length > 0 && (
              <span
                className={`rounded-md px-2 py-0.5 font-semibold ${
                  isDark ? "bg-amber-500/20 text-amber-200" : "bg-amber-100 text-amber-900"
                }`}
              >
                Rombel belum ada (siswa tanpa rombel): {result.unmatchedClasses.join(", ")}
              </span>
            )}
            {typeof result.withoutClassCount === "number" && result.withoutClassCount > 0 && !(result.unmatchedClasses && result.unmatchedClasses.length > 0) && (
              <span
                className={`rounded-md px-2 py-0.5 font-semibold ${
                  isDark ? "bg-slate-700/70 text-slate-200" : "bg-white/80 text-slate-700"
                }`}
              >
                {result.withoutClassCount} siswa masuk tanpa rombel
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {onDismiss && (
            <button type="button" onClick={onDismiss} className="font-bold underline">
              Tutup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function StudentImport({
  onImported,
  onBusyChange,
}: {
  onImported: (result: StudentImportResult) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [cells, setCells] = useState<SheetRow[]>([]);
  const [blankRows, setBlankRows] = useState<SkippedRow[]>([]);
  const [headerRowNumber, setHeaderRowNumber] = useState<number | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [mapping, setMapping] = useState<StudentMapping>(emptyStudentMapping);
  const [autoCreateClasses, setAutoCreateClasses] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);

  function clearFile() {
    loadSequence.current++;
    setHeaders([]);
    setCells([]);
    setBlankRows([]);
    setHeaderRowNumber(null);
    setSheetName("");
    setMapping(emptyStudentMapping);
    setError("");
    setFileInfo(null);
  }

  async function loadFile(file: File | undefined) {
    clearFile();
    const sequence = loadSequence.current;
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setError("Pilih file .xlsx, .xls, atau .csv dengan ukuran maksimal 5 MB.");
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        sheetRows: 1200,
        cellFormula: false,
      });
      if (!workbook.SheetNames.length) throw new Error("File tidak memiliki sheet data.");

      let chosenSheetName = workbook.SheetNames[0];
      let chosenResult: ReturnType<typeof readStudentSheet> | null = null;
      let firstError: unknown = null;

      for (const name of workbook.SheetNames) {
        try {
          const parsed = readStudentSheet(workbook.Sheets[name], XLSX);
          if (!chosenResult) {
            chosenResult = parsed;
            chosenSheetName = name;
          }
          if (parsed.mapping.nama !== "") {
            chosenResult = parsed;
            chosenSheetName = name;
            break;
          }
        } catch (err) {
          if (!firstError) firstError = err;
        }
      }

      if (!chosenResult) {
        throw firstError instanceof Error ? firstError : new Error("Sheet tidak berisi data siswa.");
      }
      if (sequence !== loadSequence.current) return;

      setHeaders(chosenResult.headers);
      setCells(chosenResult.rows);
      setBlankRows(chosenResult.blankRows);
      setHeaderRowNumber(chosenResult.headerRowNumber);
      setSheetName(chosenSheetName);
      setMapping(chosenResult.mapping);
      setFileInfo({ name: file.name, size: file.size });
    } catch (err) {
      if (sequence !== loadSequence.current) return;
      console.error("Gagal membaca file siswa:", err);
      setError(err instanceof Error ? err.message : "File tidak dapat dibaca.");
    }
  }

  const selected = Object.values(mapping).filter((value) => value !== "");
  const mappingValid = mapping.nama !== "" && new Set(selected).size === selected.length;
  const { ready: rows, readyNumbers, skipped } = mappingValid
    ? mappedStudentRows(cells, mapping, blankRows)
    : { ready: [], readyNumbers: [], skipped: [] };

  const overLimit = rows.length > 500;

  async function submit() {
    setError("");
    setBusy(true);
    onBusyChange?.(true);
    try {
      const response = await fetchWithTimeout("/api/sekolah/siswa/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, autoCreateClasses }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(`Respons server tidak valid (status ${response.status}). Periksa daftar siswa sebelum mencoba lagi.`);
      }
      const body: unknown = await response.json();
      if (!response.ok) {
        if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
          throw new Error(body.error);
        }
        throw new Error("Impor tidak dapat disimpan.");
      }
      if (
        typeof body !== "object" ||
        body === null ||
        !("created" in body) ||
        typeof body.created !== "number" ||
        !("updated" in body) ||
        typeof body.updated !== "number"
      ) {
        throw new Error("Respons impor tidak valid. Muat ulang daftar sebelum mencoba lagi.");
      }
      const record = body as Record<string, unknown>;
      const backendSkipped = typeof record.skippedEmpty === "number" ? record.skippedEmpty : 0;
      onImported({
        created: body.created,
        updated: body.updated,
        skippedEmpty: skipped.length + backendSkipped,
        skipped,
        accountsCreated: typeof record.accountsCreated === "number" ? record.accountsCreated : undefined,
        matchedClasses: typeof record.matchedClasses === "number" ? record.matchedClasses : undefined,
        createdClasses: Array.isArray(record.createdClasses) ? (record.createdClasses as string[]) : undefined,
        unmatchedClasses: Array.isArray(record.unmatchedClasses) ? (record.unmatchedClasses as string[]) : undefined,
        withoutClassCount: typeof record.withoutClassCount === "number" ? record.withoutClassCount : undefined,
      });
    } catch (failure) {
      setError(describeFetchError(failure, "Impor tidak dapat disimpan."));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section className="mt-5">
      <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-sm leading-6 text-emerald-900">
        <Info size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          Mendukung langsung file mentah unduhan Dapodik (<strong>.xlsx, .xls, .csv</strong>, maks. 500 siswa). Baris kop/header terdeteksi otomatis, hanya kolom <strong>Nama</strong> yang wajib, akun login dibuat otomatis, dan siswa dengan NISN/NIPD sama akan diperbarui tanpa duplikat.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        disabled={busy}
        aria-label="File Excel atau CSV"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void loadFile(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) {
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (busy) return;
          if (event.dataTransfer.files.length !== 1) {
            clearFile();
            setError("Pilih satu file Excel atau CSV.");
            return;
          }
          void loadFile(event.dataTransfer.files[0]);
        }}
        className={`mt-4 flex w-full flex-col items-center rounded-2xl border-2 border-dashed p-8 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
          dragging
            ? "border-indigo-500 bg-indigo-50/60"
            : "border-indigo-300 bg-indigo-50/30 hover:border-indigo-500 hover:bg-indigo-50/60"
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-cyan-100 text-indigo-600">
          <UploadCloud size={26} aria-hidden="true" />
        </span>
        <span className="mt-3 text-sm font-bold text-slate-800">Klik untuk pilih file atau seret file Excel/CSV ke sini</span>
        <span className="mt-1 text-xs leading-5 text-slate-600">Format yang didukung: .xlsx, .xls, .csv (Unduhan Mentah Dapodik / Template Standar)</span>
      </button>

      {fileInfo && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white/80 p-3">
          <FileSpreadsheet size={22} className="shrink-0 text-emerald-700" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="break-all text-sm font-semibold text-slate-800">{fileInfo.name}</p>
            <p className="text-xs text-slate-500">
              {(fileInfo.size / 1024).toFixed(1)} KB
              {sheetName ? ` · Sheet "${sheetName}"` : ""}
              {headerRowNumber ? ` · Header terdeteksi di baris ${headerRowNumber}` : ""}
            </p>
          </div>
          <CheckCircle2 size={20} className="shrink-0 text-emerald-600" aria-hidden="true" />
          <button
            type="button"
            disabled={busy}
            onClick={clearFile}
            className="rounded-lg px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            Hapus file
          </button>
        </div>
      )}

      {headers.length > 0 && (
        <>
          <p className="mt-4 text-xs leading-5 text-slate-600">
            Kolom kosong atau bernilai <code>-</code> / <code>0</code> otomatis diabaikan (data lama tetap dipertahankan). Akun login dibuat otomatis dengan sandi awal tanggal lahir (<code>DDMMYYYY</code>) atau <code>123456</code>.
          </p>

          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={autoCreateClasses}
              disabled={busy}
              onChange={(event) => setAutoCreateClasses(event.target.checked)}
              className="h-4 w-4 rounded accent-indigo-600"
            />
            Buat rombel otomatis jika nama rombel di file belum ada di sistem
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {studentFields.map((field) => (
              <label key={field.key} className="text-sm font-semibold">
                {field.label}
                {field.required ? " (wajib)" : " (opsional)"}
                <select
                  value={mapping[field.key]}
                  onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value })}
                  disabled={busy}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 font-normal"
                >
                  <option value="">Tidak dipilih</option>
                  {headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header || `(Kolom ${index + 1} tanpa nama)`} (kolom {index + 1})
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {!mappingValid && (
            <p className="mt-3 text-sm text-rose-700">
              Pilih kolom Nama siswa terlebih dahulu dan pastikan tidak ada kolom yang dipetakan ganda.
            </p>
          )}

          {mappingValid && (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  Pratinjau {rows.length} siswa siap diimpor
                  {skipped.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-slate-600">
                      ({skipped.length} baris kosong/catatan dilewati)
                    </span>
                  )}
                </p>
              </div>

              {overLimit && (
                <p role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  File memiliki {rows.length} siswa valid (maks. 500 siswa per unggahan). Pecah file menjadi beberapa bagian.
                </p>
              )}

              {skipped.length > 0 && (
                <div role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">
                    {skipped.length} baris kosong / catatan akan dilewati otomatis.
                  </p>
                  <ul className="mt-1 list-inside list-disc">
                    {skipped.slice(0, 5).map((row) => (
                      <li key={row.number}>
                        Baris {row.number}: {row.nama || "(kosong)"} — {row.reason}
                      </li>
                    ))}
                    {skipped.length > 5 && <li>...dan {skipped.length - 5} baris kosong/catatan lainnya.</li>}
                  </ul>
                </div>
              )}

              <div className="mt-2 max-h-96 overflow-auto rounded-xl border border-slate-200/80">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs">
                    <tr>
                      <th className="whitespace-nowrap p-2">No / Baris</th>
                      {studentFields
                        .filter((field) => mapping[field.key] !== "")
                        .map((field) => (
                          <th key={field.key} className="whitespace-nowrap p-2">
                            {field.label}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((row, index) => (
                      <tr key={index} className="border-t border-[#e6dfd0]">
                        <td className="whitespace-nowrap p-2 text-xs tabular-nums">
                          {index + 1} / {readyNumbers[index]}
                        </td>
                        {studentFields
                          .filter((field) => mapping[field.key] !== "")
                          .map((field) => (
                            <td key={field.key} className="whitespace-nowrap p-2 text-xs">
                              {row[field.key] || "—"}
                            </td>
                          ))}
                      </tr>
                    ))}
                    {rows.length > 100 && (
                      <tr className="border-t border-[#e6dfd0] bg-slate-50/70">
                        <td colSpan={studentFields.filter((f) => mapping[f.key] !== "").length + 1} className="p-2 text-center text-xs text-slate-600">
                          Menampilkan 100 pratinjau pertama dari total {rows.length} siswa yang akan diimpor.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                disabled={busy || rows.length === 0 || overLimit}
                onClick={submit}
                className="mt-4 rounded-xl bg-[#0c192d] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? "Menyimpan..." : `Simpan impor (${rows.length} siswa)`}
              </button>
            </>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
