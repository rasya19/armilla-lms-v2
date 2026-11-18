import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Info, UploadCloud } from "lucide-react";
import { emptyStudentMapping, mappedStudentRows, readStudentSheet, studentFields } from "./studentImportData";
import type { SheetRow, StudentMapping } from "./studentImportData";

export type StudentImportResult = { created: number; updated: number; skipped: { number: number; nama: string }[] };

export function StudentImport({ onImported, onBusyChange }: { onImported: (result: StudentImportResult) => void; onBusyChange?: (busy: boolean) => void }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [cells, setCells] = useState<SheetRow[]>([]);
  const [mapping, setMapping] = useState<StudentMapping>(emptyStudentMapping);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);

  function clearFile() {
    loadSequence.current++;
    setHeaders([]); setCells([]); setMapping(emptyStudentMapping); setError(""); setFileInfo(null);
  }

  async function loadFile(file: File | undefined) {
    clearFile();
    const sequence = loadSequence.current;
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name) || file.size > 3 * 1024 * 1024) {
      setError("Pilih file .xlsx dengan ukuran maksimal 3 MB."); return;
    }
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", sheetRows: 517, cellFormula: false });
      if (workbook.SheetNames.length !== 1) throw new Error("File harus berisi satu sheet. Simpan sheet data siswa sebagai file terpisah.");
      const result = readStudentSheet(workbook.Sheets[workbook.SheetNames[0]], XLSX);
      if (sequence !== loadSequence.current) return;
      setHeaders(result.headers); setCells(result.rows); setMapping(result.mapping); setFileInfo({ name: file.name, size: file.size });
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      console.error("Gagal membaca file siswa:", error);
      setError(error instanceof Error ? error.message : "File tidak dapat dibaca.");
    }
  }

  const selected = Object.values(mapping).filter((value) => value !== "");
  const mappingValid = mapping.nisn !== "" && mapping.nama !== "" && new Set(selected).size === selected.length;
  const { ready: rows, readyNumbers, skipped } = mappingValid ? mappedStudentRows(cells, mapping) : { ready: [], readyNumbers: [], skipped: [] };

  async function submit() {
    setError(""); setBusy(true); onBusyChange?.(true);
    try {
      const response = await fetch("/api/sekolah/siswa/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error(`Respons server tidak valid (status ${response.status}). Periksa daftar siswa sebelum mencoba lagi.`);
      const body: unknown = await response.json();
      if (!response.ok) {
        if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") throw new Error(body.error);
        throw new Error("Impor tidak dapat disimpan.");
      }
      if (typeof body !== "object" || body === null || !("created" in body) || typeof body.created !== "number" || !("updated" in body) || typeof body.updated !== "number") throw new Error("Respons impor tidak valid. Muat ulang daftar sebelum mencoba lagi.");
      onImported({ created: body.created, updated: body.updated, skipped });
    } catch (error) {
      console.error("Gagal mengimpor siswa:", error);
      setError(error instanceof TypeError ? "Koneksi terputus. Periksa daftar siswa sebelum mencoba lagi karena hasil penyimpanan belum diketahui." : error instanceof Error ? error.message : "Impor tidak dapat disimpan.");
    } finally { setBusy(false); onBusyChange?.(false); }
  }

  return <section className="mt-5">
    <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-sm leading-6 text-emerald-900"><Info size={19} className="mt-0.5 shrink-0" aria-hidden="true" /><p>Mendukung langsung file Excel (.xlsx) hasil unduhan dari Dapodik (maks. 500 siswa per file). Anda dapat memeriksa pemetaan kolom dan pratinjau data sebelum disimpan.</p></div>
    <input ref={inputRef} type="file" accept=".xlsx" disabled={busy} aria-label="File Excel" tabIndex={-1} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void loadFile(file); }} />
    <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); if (!busy) { event.dataTransfer.dropEffect = "copy"; setDragging(true); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); if (busy) return; if (event.dataTransfer.files.length !== 1) { clearFile(); setError("Pilih satu file Excel."); return; } void loadFile(event.dataTransfer.files[0]); }} className={`mt-4 flex w-full flex-col items-center rounded-2xl border-2 border-dashed p-8 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${dragging ? "border-indigo-500 bg-indigo-50/60" : "border-indigo-300 bg-indigo-50/30 hover:border-indigo-500 hover:bg-indigo-50/60"}`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-cyan-100 text-indigo-600"><UploadCloud size={26} aria-hidden="true" /></span>
      <span className="mt-3 text-sm font-bold text-slate-800">Klik untuk pilih file atau seret file Excel ke sini</span>
      <span className="mt-1 text-xs leading-5 text-slate-600">Format yang didukung: .xlsx (Unduhan Dapodik / Template Standar)</span>
    </button>
    {fileInfo && <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white/80 p-3"><FileSpreadsheet size={22} className="shrink-0 text-emerald-700" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold text-slate-800">{fileInfo.name}</p><p className="text-xs text-slate-500">{(fileInfo.size / 1024).toFixed(1)} KB</p></div><CheckCircle2 size={20} className="shrink-0 text-emerald-600" aria-hidden="true" /><button type="button" disabled={busy} onClick={clearFile} className="rounded-lg px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Hapus file</button></div>}
    {headers.length > 0 && <>
      <p className="mt-4 text-xs leading-5 text-slate-600">Hanya kolom yang dipetakan diimpor; RT, RW, wilayah dan rombel tidak disimpan. Tanggal harus YYYY-MM-DD. Sel kosong mempertahankan data lama; siswa baru belum memiliki akun atau kelas.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{studentFields.map((field) => <label key={field.key} className="text-sm font-semibold">{field.label}{field.required ? " (wajib)" : " (opsional)"}<select value={mapping[field.key]} onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value })} disabled={busy} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 font-normal"><option value="">Tidak dipilih</option>{headers.map((header, index) => <option key={index} value={index}>{header || `(Kolom ${index + 1} tanpa nama)`} (kolom {index + 1})</option>)}</select></label>)}</div>
      {!mappingValid && <p className="mt-3 text-sm text-rose-700">Pilih kolom NISN dan nama yang berbeda. Satu kolom tidak boleh dipakai untuk beberapa data.</p>}
      {mappingValid && <><p className="mt-4 text-sm font-semibold">Pratinjau {rows.length} siswa yang akan diimpor</p>{skipped.length > 0 && <div role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p>{skipped.length} siswa tanpa NISN dilewati:</p><ul className="mt-1 list-inside list-disc">{skipped.map((row) => <li key={row.number}>Baris {row.number}: {row.nama || "(nama kosong)"}</li>)}</ul><p className="mt-1">Lengkapi NISN di file sebelum mengimpor siswa tersebut.</p></div>}<div className="mt-2 max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="whitespace-nowrap p-2">Urutan impor / baris Excel</th>{studentFields.filter((field) => mapping[field.key] !== "").map((field) => <th key={field.key} className="whitespace-nowrap p-2">{field.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t border-[#e6dfd0]"><td className="whitespace-nowrap p-2">{index + 1} / {readyNumbers[index]}</td>{studentFields.filter((field) => mapping[field.key] !== "").map((field) => <td key={field.key} className="whitespace-nowrap p-2">{row[field.key] || "—"}</td>)}</tr>)}</tbody></table></div><button type="button" disabled={busy || rows.length === 0} onClick={submit} className="mt-4 rounded-xl bg-[#0c192d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan impor"}</button></>}
    </>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
  </section>;
}
