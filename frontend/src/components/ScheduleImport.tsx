import { useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { useGlassConfirm } from "./GlassConfirm";
import { headers, readScheduleSheet } from "./scheduleImportData";
import type { Preview, References } from "./scheduleImportData";

export function ScheduleImport({ references, onImported, onBusyChange }: { references: References; onImported: (count: number) => void; onBusyChange: (busy: boolean) => void }) {
  const confirm = useGlassConfirm();
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const [preview, setPreview] = useState<Preview[]>([]);
  const [file, setFile] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function download() {
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers]), "Jadwal");
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
        ["Tahun Ajaran", "Semester", "ID Tahun Ajaran", "Kelas", "ID Kelas", "Mata Pelajaran", "ID Mapel", "Guru Aktif", "ID Guru"],
        ...Array.from({ length: Math.max(references.tahun.length, references.kelas.length, references.mapel.length, references.guru.length) }, (_, index) => [
          references.tahun[index]?.nama ?? "", references.tahun[index]?.semester ?? "", references.tahun[index]?.id ?? "",
          references.kelas[index]?.nama ?? "", references.kelas[index]?.id ?? "", references.mapel[index]?.nama ?? "",
          references.mapel[index]?.id ?? "", references.guru[index]?.nama ?? "", references.guru[index]?.id ?? "",
        ]),
      ]), "Referensi");
      XLSX.writeFile(book, "Template_Import_Jadwal.xlsx");
    } catch (failure) { console.error("Gagal mengunduh template jadwal:", failure); setError("Template belum dapat diunduh."); }
  }

  async function load(selected: File | undefined) {
    const current = ++sequence.current;
    setPreview([]); setFile(""); setError("");
    if (!selected) return;
    if (!/\.xlsx$/i.test(selected.name) || selected.size > 3 * 1024 * 1024) { setError("Pilih file .xlsx dengan ukuran maksimal 3 MB."); return; }
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await selected.arrayBuffer(), { type: "array", sheetRows: 502, cellFormula: false });
      const sheet = book.Sheets.Jadwal;
      if (!sheet?.["!ref"]) throw new Error('Sheet "Jadwal" tidak ditemukan atau kosong. Gunakan template yang disediakan.');
      const result = readScheduleSheet(sheet, XLSX, references);
      if (current === sequence.current) { setFile(selected.name); setPreview(result); }
    } catch (failure) {
      if (current !== sequence.current) return;
      console.error("Gagal membaca jadwal:", failure);
      setError(failure instanceof Error ? failure.message : "File jadwal tidak dapat dibaca.");
    }
  }

  async function submit() {
    if (busy || preview.some((row) => !row.schedule) || !await confirm("Impor jadwal dapat mengubah izin guru untuk kelas terkait. Lanjutkan?")) return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const response = await fetch("/api/sekolah/akademik/jadwal/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: preview.map((row) => row.schedule) }) });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "Impor jadwal gagal.");
      if (typeof result !== "object" || result === null || !("created" in result) || typeof result.created !== "number") throw new Error("Respons impor tidak valid. Periksa daftar jadwal sebelum mencoba lagi.");
      onImported(result.created);
    } catch (failure) {
      console.error("Gagal mengimpor jadwal:", failure);
      setError(failure instanceof TypeError ? "Koneksi terputus. Periksa daftar jadwal sebelum mencoba lagi karena hasil impor belum diketahui." : failure instanceof Error ? failure.message : "Impor jadwal gagal.");
    } finally { setBusy(false); onBusyChange(false); }
  }

  return <div className="space-y-4">
    <p className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900">Unduh template, isi sheet Jadwal, lalu unggah kembali (maksimal 500 jadwal). Nama harus sesuai data sekolah; jika nama sama, gunakan ID dari sheet Referensi. Gunakan hari Senin–Minggu dan jam seperti 08:00. Jadwal yang sama akan ditolak; bentrok jam belum diperiksa.</p>
    <button type="button" disabled={busy} onClick={() => void download()} className="master-outline inline-flex items-center gap-2"><FileSpreadsheet size={18} /> Unduh Template Excel</button>
    <input ref={input} type="file" accept=".xlsx" className="sr-only" aria-label="File jadwal Excel" disabled={busy} onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; void load(selected); }} />
    <button type="button" disabled={busy} onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!busy) { if (event.dataTransfer.files.length !== 1) { sequence.current++; setPreview([]); setFile(""); setError("Pilih satu file Excel."); } else void load(event.dataTransfer.files[0]); } }} className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/30 p-6 text-center text-sm font-bold text-indigo-800 hover:border-indigo-500 hover:bg-indigo-50/60 disabled:opacity-50"><UploadCloud size={26} /><span className="mt-2">Klik atau seret file Excel ke sini</span></button>
    {file && <p className="break-all text-sm font-semibold">File: {file}</p>}
    {preview.length > 0 && <><p className="text-sm font-bold">Pratinjau {preview.length} jadwal</p><div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Baris</th>{headers.map((header) => <th key={header} className="whitespace-nowrap p-2">{header}</th>)}<th className="p-2">Status</th></tr></thead><tbody>{preview.map((row) => <tr key={row.number} className="border-t"><td className="p-2">{row.number}</td>{row.values.map((value, index) => <td key={index} className="whitespace-nowrap p-2">{value || "—"}</td>)}<td className="min-w-40 p-2">{row.error || "Siap"}</td></tr>)}</tbody></table></div><button type="button" disabled={busy || preview.some((row) => !row.schedule)} onClick={() => void submit()} className="master-primary disabled:opacity-50">{busy ? "Menyimpan..." : `Impor ${preview.length} Jadwal`}</button></>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}
