import React, { useState, useRef } from "react";
import { 
  Download, Upload, Plus, Edit2, Trash2, X, AlertCircle, Save, CheckCircle, HelpCircle, FileSpreadsheet 
} from "lucide-react";
import { Nilai, Siswa, Mapel } from "../types";

interface RekapNilaiProps {
  nilaiList: Nilai[];
  siswaList: Siswa[];
  mapelList: Mapel[];
  onAdd: (data: Omit<Nilai, "id" | "nilaiAkhir">) => Promise<void>;
  onUpdate: (id: string, data: Partial<Nilai>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBulkImport: (data: Array<{
    nisn: string;
    kodeMapel: string;
    nilaiMandiri: number;
    nilaiSimulasi: number;
    tanggalSimulasi: string;
  }>) => Promise<{ successCount: number; errors: string[] }>;
}

export default function RekapNilai({
  nilaiList,
  siswaList,
  mapelList,
  onAdd,
  onUpdate,
  onDelete,
  onBulkImport
}: RekapNilaiProps) {
  const [selectedMapelId, setSelectedMapelId] = useState("");
  const [selectedSiswaId, setSelectedSiswaId] = useState("");

  // CRUD Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNilai, setEditingNilai] = useState<Nilai | null>(null);

  // Form State
  const [formSiswaId, setFormSiswaId] = useState("");
  const [formMapelId, setFormMapelId] = useState("");
  const [formNilaiMandiri, setFormNilaiMandiri] = useState<number>(0);
  const [formNilaiSimulasi, setFormNilaiSimulasi] = useState<number>(0);
  const [formTanggal, setFormTanggal] = useState("");
  const [formError, setFormError] = useState("");

  // Import Section State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccessMessage, setImportSuccessMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handlers
  const handleOpenAdd = () => {
    setEditingNilai(null);
    setFormSiswaId(siswaList[0]?.id || "");
    setFormMapelId(mapelList[0]?.id || "");
    setFormNilaiMandiri(80);
    setFormNilaiSimulasi(80);
    setFormTanggal(new Date().toISOString().split("T")[0]);
    setFormError("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (n: Nilai) => {
    setEditingNilai(n);
    setFormSiswaId(n.siswaId);
    setFormMapelId(n.mapelId);
    setFormNilaiMandiri(n.nilaiMandiri);
    setFormNilaiSimulasi(n.nilaiSimulasi);
    setFormTanggal(n.tanggalSimulasi);
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formSiswaId || !formMapelId) {
      setFormError("Siswa dan Mata Pelajaran wajib dipilih.");
      return;
    }

    if (formNilaiMandiri < 0 || formNilaiMandiri > 100 || formNilaiSimulasi < 0 || formNilaiSimulasi > 100) {
      setFormError("Nilai harus berada di rentang rentang 0 - 100.");
      return;
    }

    try {
      if (editingNilai) {
        await onUpdate(editingNilai.id, {
          siswaId: formSiswaId,
          mapelId: formMapelId,
          nilaiMandiri: Number(formNilaiMandiri),
          nilaiSimulasi: Number(formNilaiSimulasi),
          tanggalSimulasi: formTanggal
        });
      } else {
        // Prevent duplicate score record for student-subject
        const isDuplicate = nilaiList.some(n => n.siswaId === formSiswaId && n.mapelId === formMapelId);
        if (isDuplicate) {
          setFormError("Siswa tersebut sudah memiliki rekaman nilai untuk mata pelajaran ini. Silakan edit nilai yang ada.");
          return;
        }

        await onAdd({
          siswaId: formSiswaId,
          mapelId: formMapelId,
          nilaiMandiri: Number(formNilaiMandiri),
          nilaiSimulasi: Number(formNilaiSimulasi),
          tanggalSimulasi: formTanggal
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || "Gagal menyimpan nilai.");
    }
  };

  const handleDeleteClick = async (id: string, siswaNama: string, mapelNama: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus data nilai "${mapelNama}" dari siswa "${siswaNama}"?`)) {
      try {
        await onDelete(id);
      } catch (err: any) {
        alert("Gagal menghapus nilai: " + err.message);
      }
    }
  };

  // EXPORT ACTION: Triggers file download from API
  const handleExportCSV = async () => {
    try {
      const response = await fetch("/api/nilai/export");
      if (!response.ok) throw new Error("Gagal mengekspor berkas");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rekap_nilai_simulasi_unbk.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Error ekspor: " + err.message);
    }
  };

  // CSV Template Downloader
  const handleDownloadTemplate = () => {
    // Generate a perfect standard CSV template
    const headers = "NISN,KodeMapel,NilaiMandiri,NilaiSimulasi,TanggalSimulasi";
    const sampleRows = [
      "0052348512,MTK,85,82,2026-06-15",
      "0048375122,BIN,90,88,2026-06-16",
      "0068312543,BIG,75,70,2026-06-17",
      "0057412355,IPA,80,78,2026-06-18"
    ].join("\n");
    const content = `${headers}\n${sampleRows}`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template_import_nilai_unbk.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // CSV Frontend Parser
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportErrors([]);
    setImportSuccessMessage("");
    setParsedRows([]);

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        // Split by lines
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          setImportErrors(["Berkas CSV kosong atau tidak memiliki baris data."]);
          return;
        }

        // Parse headers
        const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
        const reqHeaders = ["NISN", "KODEMAPEL", "NILAIMANDIRI", "NILAISIMULASI"];
        
        // Validation headers
        const headerMatches = reqHeaders.every(req => 
          headers.some(h => h.toUpperCase() === req)
        );

        if (!headerMatches) {
          setImportErrors([
            `Format kolom salah. Kolom minimal wajib berisi: ${reqHeaders.join(", ")}. Header yang terdeteksi: ${headers.join(", ")}`
          ]);
          return;
        }

        const nisnIdx = headers.findIndex(h => h.toUpperCase() === "NISN");
        const codeIdx = headers.findIndex(h => h.toUpperCase() === "KODEMAPEL");
        const mandiriIdx = headers.findIndex(h => h.toUpperCase() === "NILAIMANDIRI");
        const simulasiIdx = headers.findIndex(h => h.toUpperCase() === "NILAISIMULASI");
        const dateIdx = headers.findIndex(h => h.toUpperCase() === "TANGGALSIMULASI");

        const rows: any[] = [];
        const parseErrors: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Simple CSV line parser handling optional quotes
          const columns = line.split(",").map(col => col.trim().replace(/^["']|["']$/g, ""));
          if (columns.length < 4) {
            parseErrors.push(`Baris ${i + 1}: Kolom tidak lengkap.`);
            continue;
          }

          const nisn = columns[nisnIdx];
          const kodeMapel = columns[codeIdx];
          const nilaiMandiri = Number(columns[mandiriIdx]);
          const nilaiSimulasi = Number(columns[simulasiIdx]);
          const tanggalSimulasi = dateIdx !== -1 && columns[dateIdx] ? columns[dateIdx] : new Date().toISOString().split("T")[0];

          // Basic value checks
          if (!nisn) {
            parseErrors.push(`Baris ${i + 1}: NISN kosong.`);
            continue;
          }
          if (!kodeMapel) {
            parseErrors.push(`Baris ${i + 1}: Kode Mapel kosong.`);
            continue;
          }
          if (isNaN(nilaiMandiri) || nilaiMandiri < 0 || nilaiMandiri > 100) {
            parseErrors.push(`Baris ${i + 1}: Nilai Mandiri (${columns[mandiriIdx]}) harus angka 0-100.`);
            continue;
          }
          if (isNaN(nilaiSimulasi) || nilaiSimulasi < 0 || nilaiSimulasi > 100) {
            parseErrors.push(`Baris ${i + 1}: Nilai Simulasi (${columns[simulasiIdx]}) harus angka 0-100.`);
            continue;
          }

          rows.push({
            nisn,
            kodeMapel,
            nilaiMandiri,
            nilaiSimulasi,
            tanggalSimulasi
          });
        }

        if (parseErrors.length > 0) {
          setImportErrors(parseErrors);
        } else {
          setParsedRows(rows);
        }
      } catch (err: any) {
        setImportErrors(["Gagal membaca berkas: " + err.message]);
      }
    };

    reader.readAsText(file);
  };

  // Submit bulk CSV import to backend API
  const handleImportSubmit = async () => {
    if (parsedRows.length === 0) return;
    try {
      const res = await onBulkImport(parsedRows);
      
      if (res.errors && res.errors.length > 0) {
        setImportErrors(res.errors);
      } else {
        setImportSuccessMessage(`Sukses! Sebanyak ${res.successCount} rekap nilai UNBK berhasil di-import/di-update.`);
        setParsedRows([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setTimeout(() => {
          setIsImportOpen(false);
          setImportSuccessMessage("");
        }, 3500);
      }
    } catch (err: any) {
      setImportErrors([err.message || "Gagal meng-import data ke server."]);
    }
  };

  // Filtered List
  const filteredNilai = nilaiList.filter(n => {
    const matchesMapel = selectedMapelId ? n.mapelId === selectedMapelId : true;
    const matchesSiswa = selectedSiswaId ? n.siswaId === selectedSiswaId : true;
    return matchesMapel && matchesSiswa;
  });

  // Calculations for filtered list
  const totalRecords = filteredNilai.length;
  const averageAkhir = totalRecords > 0 
    ? Number((filteredNilai.reduce((sum, n) => sum + n.nilaiAkhir, 0) / totalRecords).toFixed(1))
    : 0;
  const highSimulasi = totalRecords > 0 ? Math.max(...filteredNilai.map(n => n.nilaiSimulasi)) : 0;
  const lowSimulasi = totalRecords > 0 ? Math.min(...filteredNilai.map(n => n.nilaiSimulasi)) : 0;

  const passingRate = (() => {
    if (totalRecords === 0) return 0;
    const passedCount = filteredNilai.filter(n => {
      const mapel = mapelList.find(m => m.id === n.mapelId);
      const kkm = mapel?.kkm || 70;
      return n.nilaiAkhir >= kkm;
    }).length;
    return Number(((passedCount / totalRecords) * 100).toFixed(0));
  })();

  return (
    <div className="space-y-6" id="rekap-nilai-container">
      {/* Header and Action Button Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Nilai Hasil Simulasi UNBK</h1>
          <p className="text-xs text-slate-500 font-medium">Rekapitulasi nilai ujian mandiri, skor simulasi UNBK, kalkulasi nilai akhir dan export/import</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {/* Export */}
          <button
            onClick={handleExportCSV}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 py-1.5 px-3 rounded transition flex items-center gap-1 shadow-xs"
            title="Download CSV"
          >
            <Download size={13} /> Export CSV
          </button>

          {/* Open Import */}
          <button
            onClick={() => {
              setIsImportOpen(!isImportOpen);
              setImportErrors([]);
              setImportSuccessMessage("");
              setParsedRows([]);
            }}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 py-1.5 px-3 rounded transition flex items-center gap-1"
          >
            <Upload size={13} /> Import Rekap
          </button>

          {/* Add score manually */}
          <button
            onClick={handleOpenAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded transition flex items-center gap-1 shadow-xs"
          >
            <Plus size={13} /> Input Manual
          </button>
        </div>
      </div>

      {/* CSV Import Panel */}
      {isImportOpen && (
        <div className="bg-blue-50/40 border border-blue-200 p-5 rounded-lg space-y-3.5 animate-in slide-in-from-top-4 duration-200" id="import-panel">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-blue-200/60 pb-2.5 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <FileSpreadsheet className="text-blue-700" size={18} />
              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wide">Bulk Import Rekap Nilai Simulasi UNBK via CSV</h3>
            </div>
            <button 
              onClick={handleDownloadTemplate}
              className="text-blue-700 hover:text-blue-800 font-semibold underline flex items-center gap-1"
            >
              Unduh Template Contoh.csv
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
            <div className="space-y-1.5 md:col-span-1">
              <span className="font-bold text-slate-700 block uppercase tracking-wider text-[10px]">Langkah-langkah:</span>
              <ol className="text-slate-600 space-y-1 list-decimal list-inside pl-1 leading-relaxed">
                <li>Unduh template CSV yang disediakan.</li>
                <li>Isi data siswa menggunakan kolom <strong>NISN</strong> siswa aktif di sistem.</li>
                <li>Gunakan <strong>KodeMapel</strong> kurikulum (Contoh: <code className="bg-slate-100 text-slate-800 px-1 font-mono rounded">MTK</code>, <code className="bg-slate-100 text-slate-800 px-1 font-mono rounded">BIN</code>).</li>
                <li>Unggah file CSV Anda di bawah ini dan klik proses.</li>
              </ol>
            </div>

            <div className="md:col-span-2 space-y-3 flex flex-col justify-center border-l border-slate-200 md:pl-5">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-100 file:text-blue-800 hover:file:bg-blue-200 cursor-pointer"
                />
              </div>

              {/* Error log inside panel */}
              {importErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded text-xs space-y-1">
                  <span className="font-bold flex items-center gap-1.5"><AlertCircle size={14} /> Terjadi Kendala Validasi Berkas:</span>
                  <div className="max-h-24 overflow-y-auto pl-5 list-disc space-y-0.5 font-mono">
                    {importErrors.map((err, i) => <div key={i}>{err}</div>)}
                  </div>
                </div>
              )}

              {/* Parsed Rows preview */}
              {parsedRows.length > 0 && (
                <div className="space-y-2 bg-white border border-slate-200 p-2.5 rounded">
                  <span className="text-xs font-semibold text-slate-700 block">Validasi Sukses: {parsedRows.length} Baris data siap diproses</span>
                  <button
                    onClick={handleImportSubmit}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 rounded transition"
                  >
                    Proses Unggah & Sinkronisasi
                  </button>
                </div>
              )}

              {importSuccessMessage && (
                <div className="bg-green-50 border border-green-200 text-green-700 p-2.5 rounded text-xs flex items-center gap-2 font-medium">
                  <CheckCircle size={14} className="text-green-600 shrink-0" />
                  <span>{importSuccessMessage}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mini Stats Summary Boxes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" id="stats-nilai">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Rekor Terbaca</span>
          <h3 className="text-lg font-bold text-slate-800 font-mono mt-0.5">{totalRecords}</h3>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rata-rata Nilai Akhir</span>
          <h3 className="text-lg font-bold text-blue-600 font-mono mt-0.5">{averageAkhir} <span className="text-xs text-slate-400 font-normal">/100</span></h3>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Skor Simulasi Tertinggi</span>
          <h3 className="text-lg font-bold text-slate-800 font-mono mt-0.5">{highSimulasi}</h3>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tingkat Kelulusan KKM</span>
          <h3 className="text-lg font-bold text-slate-800 font-mono mt-0.5">{passingRate}%</h3>
        </div>
      </div>

      {/* Filter and Search Section */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3" id="filters-nilai">
        {/* Filter Siswa */}
        <div className="flex-1">
          <select
            value={selectedSiswaId}
            onChange={(e) => setSelectedSiswaId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="">Semua Siswa Terdaftar</option>
            {siswaList.map(s => (
              <option key={s.id} value={s.id}>{s.nama} (NISN: {s.nisn})</option>
            ))}
          </select>
        </div>

        {/* Filter Mapel */}
        <div className="w-full sm:w-56">
          <select
            value={selectedMapelId}
            onChange={(e) => setSelectedMapelId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="">Semua Mata Pelajaran</option>
            {mapelList.map(m => (
              <option key={m.id} value={m.id}>{m.nama} ({m.kode})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Scores Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" id="nilai-table-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs" id="table-nilai">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Identitas Siswa</th>
                <th className="py-3 px-4">Mata Pelajaran</th>
                <th className="py-3 px-4">Ujian Mandiri (50%)</th>
                <th className="py-3 px-4">Simulasi UNBK (50%)</th>
                <th className="py-3 px-4">Nilai Akhir (Rata)</th>
                <th className="py-3 px-4">Status KKM</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredNilai.map((nilai) => {
                const siswa = siswaList.find(s => s.id === nilai.siswaId);
                const mapel = mapelList.find(m => m.id === nilai.mapelId);
                const kkm = mapel?.kkm || 70;
                const isPassed = nilai.nilaiAkhir >= kkm;

                return (
                  <tr key={nilai.id} className="hover:bg-slate-50 transition duration-150">
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{siswa ? siswa.nama : "Siswa Tidak Ditemukan"}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">NISN: {siswa ? siswa.nisn : "-"}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-800">{mapel ? mapel.nama : "Mapel Terhapus"}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">Kode: {mapel ? mapel.kode : "-"}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{nilai.nilaiMandiri}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{nilai.nilaiSimulasi}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900 text-sm">{nilai.nilaiAkhir}</td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${
                        isPassed ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${isPassed ? "bg-green-600" : "bg-red-600"}`}></span>
                        {isPassed ? "Lulus KKM" : `Di bawah KKM (${kkm})`}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(nilai)}
                          className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition"
                          title="Edit Nilai"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(nilai.id, siswa?.nama || "Siswa", mapel?.nama || "Pelajaran")}
                          className="p-1 hover:bg-red-50 text-red-600 hover:text-red-800 rounded transition"
                          title="Hapus Nilai"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredNilai.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <AlertCircle size={30} className="mx-auto mb-2 opacity-50 text-blue-500" />
                    <p className="text-xs">Tidak ada rekam nilai yang sesuai filter pencarian.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRUD Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">
                {editingNilai ? "Edit Rekaman Nilai Ujian" : "Input Manual Nilai Ujian"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition p-1 rounded">
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-3.5">
                {/* Siswa */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Pilih Siswa *</label>
                  <select
                    value={formSiswaId}
                    onChange={(e) => setFormSiswaId(e.target.value)}
                    disabled={editingNilai != null}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="" disabled>Pilih Siswa Terdaftar...</option>
                    {siswaList.map(s => (
                      <option key={s.id} value={s.id}>{s.nama} (NISN: {s.nisn})</option>
                    ))}
                  </select>
                </div>

                {/* Mapel */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Mata Pelajaran *</label>
                  <select
                    value={formMapelId}
                    disabled={editingNilai != null}
                    onChange={(e) => setFormMapelId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="" disabled>Pilih Pelajaran...</option>
                    {mapelList.map(m => (
                      <option key={m.id} value={m.id}>{m.nama} ({m.kode})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  {/* Nilai Mandiri */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Nilai Mandiri (50%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formNilaiMandiri}
                      onChange={(e) => setFormNilaiMandiri(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                    />
                  </div>

                  {/* Nilai Simulasi */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Simulasi UNBK (50%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formNilaiSimulasi}
                      onChange={(e) => setFormNilaiSimulasi(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                {/* Tanggal */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Tanggal Pelaksanaan Simulasi *</label>
                  <input
                    type="date"
                    required
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-2 pt-3.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-100 text-slate-700 font-semibold py-1.5 px-3 rounded transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded transition flex items-center gap-1"
                >
                  <Save size={13} /> Simpan Nilai
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
