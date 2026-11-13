import { useState } from "react";

type Field = "nisn" | "nama" | "email" | "telepon";
type Mapping = Record<Field, string>;
type PreviewRow = { nisn: string; nama: string; email?: string; telepon?: string };
const fields: { key: Field; label: string; aliases: string[]; required: boolean }[] = [
  { key: "nisn", label: "NISN", aliases: ["nisn"], required: true },
  { key: "nama", label: "Nama siswa", aliases: ["nama", "nama siswa", "nama peserta didik"], required: true },
  { key: "email", label: "Email", aliases: ["email", "e mail"], required: false },
  { key: "telepon", label: "Telepon", aliases: ["telepon", "no telepon", "nomor telepon", "no hp", "nomor hp"], required: false },
];
const emptyMapping: Mapping = { nisn: "", nama: "", email: "", telepon: "" };

export function StudentImport({ onImported }: { onImported: () => void }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [cells, setCells] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>(emptyMapping);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  async function loadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setHeaders([]); setCells([]); setMapping(emptyMapping); setMessage(""); setError(""); setFileName("");
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name) || file.size > 3 * 1024 * 1024) {
      setError("Pilih file .xlsx dengan ukuran maksimal 3 MB."); return;
    }
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", sheetRows: 503, cellFormula: false });
      if (workbook.SheetNames.length !== 1) throw new Error("File harus berisi satu sheet. Simpan sheet data siswa sebagai file terpisah.");
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet["!ref"]) throw new Error("Sheet tidak berisi data.");
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      if (range.s.r !== 0) throw new Error("Header harus berada pada baris pertama.");
      if (range.e.c - range.s.c + 1 > 100 || range.e.r - range.s.r + 1 > 501 || sheet["!fullref"] && XLSX.utils.decode_range(sheet["!fullref"]).e.r - range.s.r + 1 > 501) throw new Error("Maksimal 100 kolom dan 500 baris data, dengan header pada baris pertama.");
      const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
      const first = matrix[0]?.map((cell) => String(cell).trim());
      if (!first?.length) throw new Error("Header kolom tidak ditemukan pada baris pertama.");
      const rows = matrix.slice(1).map((row) => row.map((cell) => String(cell).trim())).filter((row) => row.some(Boolean));
      if (!rows.length || rows.length > 500) throw new Error("File harus berisi 1 sampai 500 baris siswa.");
      const next = { ...emptyMapping };
      for (const field of fields) {
        const matches = first.map((name, index) => ({ name: name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), index })).filter(({ name }) => field.aliases.includes(name));
        if (matches.length === 1) next[field.key] = String(matches[0].index);
      }
      setHeaders(first); setCells(rows); setMapping(next); setFileName(file.name);
    } catch (error) {
      console.error("Gagal membaca file siswa:", error);
      setError(error instanceof Error ? error.message : "File tidak dapat dibaca.");
    }
  }

  const selected = Object.values(mapping).filter((value) => value !== "");
  const mappingValid = mapping.nisn !== "" && mapping.nama !== "" && new Set(selected).size === selected.length;
  const rows: PreviewRow[] = mappingValid ? cells.map((row) => ({
    nisn: row[Number(mapping.nisn)] || "", nama: row[Number(mapping.nama)] || "",
    ...(mapping.email !== "" && row[Number(mapping.email)] ? { email: row[Number(mapping.email)] } : {}),
    ...(mapping.telepon !== "" && row[Number(mapping.telepon)] ? { telepon: row[Number(mapping.telepon)] } : {}),
  })) : [];

  async function submit() {
    setError(""); setMessage(""); setBusy(true);
    try {
      const response = await fetch("/api/sekolah/siswa/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error(`Respons server tidak valid (status ${response.status}). Periksa daftar siswa sebelum mencoba lagi.`);
      const body: unknown = await response.json();
      if (!response.ok) {
        if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") throw new Error(body.error);
        throw new Error("Impor tidak dapat disimpan.");
      }
      if (typeof body !== "object" || body === null || !("created" in body) || typeof body.created !== "number" || !("updated" in body) || typeof body.updated !== "number") throw new Error("Respons impor tidak valid. Muat ulang daftar sebelum mencoba lagi.");
      setMessage(`Impor selesai: ${body.created} siswa baru, ${body.updated} siswa diperbarui.`);
      setHeaders([]); setCells([]); setMapping(emptyMapping); setFileName("");
      onImported();
    } catch (error) {
      console.error("Gagal mengimpor siswa:", error);
      setError(error instanceof TypeError ? "Koneksi terputus. Periksa daftar siswa sebelum mencoba lagi karena hasil penyimpanan belum diketahui." : error instanceof Error ? error.message : "Impor tidak dapat disimpan.");
    } finally { setBusy(false); }
  }

  return <section className="mt-6 rounded-xl border border-[#e6dfd0] bg-[#f8f6ef] p-5">
    <h3 className="font-bold">Impor siswa dari Excel</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">Uji lokal saja. Pilih file .xlsx dengan satu sheet dan header di baris pertama; periksa pemetaan dan seluruh data sebelum menyimpan. File diproses di browser.</p>
    <p className="mt-2 text-sm leading-6 text-slate-600">Kolom yang diimpor: NISN, nama, email dan telepon. Kelas serta kolom lain tidak diimpor. Sel kosong mempertahankan data lama; siswa baru berstatus Aktif.</p>
    <label className="mt-4 block text-sm font-semibold">File Excel<input type="file" accept=".xlsx" disabled={busy} onChange={loadFile} className="mt-2 block w-full text-sm font-normal" /></label>
    {fileName && <p className="mt-3 break-all text-sm">File: {fileName}</p>}
    {headers.length > 0 && <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map((field) => <label key={field.key} className="text-sm font-semibold">{field.label}{field.required ? " (wajib)" : " (opsional)"}<select value={mapping[field.key]} onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value })} disabled={busy} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 font-normal"><option value="">Tidak dipilih</option>{headers.map((header, index) => <option key={index} value={index}>{header || `(Kolom ${index + 1} tanpa nama)`} (kolom {index + 1})</option>)}</select></label>)}</div>
      {!mappingValid && <p className="mt-3 text-sm text-rose-700">Pilih kolom NISN dan nama yang berbeda. Satu kolom tidak boleh dipakai untuk beberapa data.</p>}
      {mappingValid && <><p className="mt-4 text-sm font-semibold">Pratinjau {rows.length} siswa</p><div className="mt-2 max-h-96 overflow-auto"><table className="w-full min-w-[36rem] text-left text-sm"><thead><tr><th className="p-2">No.</th><th className="p-2">NISN</th><th className="p-2">Nama</th><th className="p-2">Email</th><th className="p-2">Telepon</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t border-[#e6dfd0]"><td className="p-2">{index + 1}</td><td className="p-2">{row.nisn}</td><td className="p-2">{row.nama}</td><td className="p-2">{row.email || "—"}</td><td className="p-2">{row.telepon || "—"}</td></tr>)}</tbody></table></div><button type="button" disabled={busy} onClick={submit} className="mt-4 rounded-xl bg-[#0c192d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan impor"}</button></>}
    </>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="mt-4 text-sm text-green-700">{message}</p>}
  </section>;
}
