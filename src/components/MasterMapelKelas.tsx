import React, { useState } from "react";
import { Plus, Edit2, Trash2, X, AlertCircle, Save, BookOpen, Layers } from "lucide-react";
import { Mapel, Kelas, Guru } from "../types";

interface MasterMapelKelasProps {
  mapelList: Mapel[];
  kelasList: Kelas[];
  guruList: Guru[];
  onAddMapel: (data: Omit<Mapel, "id">) => Promise<void>;
  onUpdateMapel: (id: string, data: Partial<Mapel>) => Promise<void>;
  onDeleteMapel: (id: string) => Promise<void>;
  onAddKelas: (data: Omit<Kelas, "id">) => Promise<void>;
  onUpdateKelas: (id: string, data: Partial<Kelas>) => Promise<void>;
  onDeleteKelas: (id: string) => Promise<void>;
}

export default function MasterMapelKelas({
  mapelList,
  kelasList,
  guruList,
  onAddMapel,
  onUpdateMapel,
  onDeleteMapel,
  onAddKelas,
  onUpdateKelas,
  onDeleteKelas
}: MasterMapelKelasProps) {
  const [activeTab, setActiveTab] = useState<"mapel" | "kelas">("mapel");

  // Modal State
  const [isMapelModalOpen, setIsMapelModalOpen] = useState(false);
  const [isKelasModalOpen, setIsKelasModalOpen] = useState(false);
  const [editingMapel, setEditingMapel] = useState<Mapel | null>(null);
  const [editingKelas, setEditingKelas] = useState<Kelas | null>(null);

  // Mapel Form State
  const [formMapelKode, setFormMapelKode] = useState("");
  const [formMapelNama, setFormMapelNama] = useState("");
  const [formMapelKKM, setFormMapelKKM] = useState<number>(70);
  const [mapelError, setMapelError] = useState("");

  // Kelas Form State
  const [formKelasKode, setFormKelasKode] = useState("");
  const [formKelasNama, setFormKelasNama] = useState("");
  const [formKelasWaliId, setFormKelasWaliId] = useState("");
  const [kelasError, setKelasError] = useState("");

  // Mapel Handlers
  const handleOpenAddMapel = () => {
    setEditingMapel(null);
    setFormMapelKode("");
    setFormMapelNama("");
    setFormMapelKKM(70);
    setMapelError("");
    setIsMapelModalOpen(true);
  };

  const handleOpenEditMapel = (m: Mapel) => {
    setEditingMapel(m);
    setFormMapelKode(m.kode);
    setFormMapelNama(m.nama);
    setFormMapelKKM(m.kkm);
    setMapelError("");
    setIsMapelModalOpen(true);
  };

  const handleMapelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMapelError("");
    if (!formMapelKode || !formMapelNama || !formMapelKKM) {
      setMapelError("Semua bidang wajib diisi.");
      return;
    }
    try {
      if (editingMapel) {
        await onUpdateMapel(editingMapel.id, {
          kode: formMapelKode,
          nama: formMapelNama,
          kkm: Number(formMapelKKM)
        });
      } else {
        await onAddMapel({
          kode: formMapelKode,
          nama: formMapelNama,
          kkm: Number(formMapelKKM)
        });
      }
      setIsMapelModalOpen(false);
    } catch (err: any) {
      setMapelError(err.message || "Gagal menyimpan data.");
    }
  };

  const handleDeleteMapel = async (id: string, nama: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus "${nama}"? Semua data nilai ujian yang berkaitan juga akan dihapus.`)) {
      try {
        await onDeleteMapel(id);
      } catch (err: any) {
        alert(err.message || "Gagal menghapus mata pelajaran.");
      }
    }
  };

  // Kelas Handlers
  const handleOpenAddKelas = () => {
    setEditingKelas(null);
    setFormKelasKode("");
    setFormKelasNama("");
    setFormKelasWaliId(guruList[0]?.id || "");
    setKelasError("");
    setIsKelasModalOpen(true);
  };

  const handleOpenEditKelas = (k: Kelas) => {
    setEditingKelas(k);
    setFormKelasKode(k.kode);
    setFormKelasNama(k.nama);
    setFormKelasWaliId(k.waliGuruId);
    setKelasError("");
    setIsKelasModalOpen(true);
  };

  const handleKelasSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setKelasError("");
    if (!formKelasKode || !formKelasNama || !formKelasWaliId) {
      setKelasError("Semua bidang wajib diisi.");
      return;
    }
    try {
      if (editingKelas) {
        await onUpdateKelas(editingKelas.id, {
          kode: formKelasKode,
          nama: formKelasNama,
          waliGuruId: formKelasWaliId
        });
      } else {
        await onAddKelas({
          kode: formKelasKode,
          nama: formKelasNama,
          waliGuruId: formKelasWaliId
        });
      }
      setIsKelasModalOpen(false);
    } catch (err: any) {
      setKelasError(err.message || "Gagal menyimpan data.");
    }
  };

  const handleDeleteKelas = async (id: string, nama: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus kelas "${nama}"?`)) {
      try {
        await onDeleteKelas(id);
      } catch (err: any) {
        alert(err.message || "Gagal menghapus kelas.");
      }
    }
  };

  return (
    <div className="space-y-6" id="master-mapel-kelas-container">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-bold text-slate-800">Kurikulum & Manajemen Kelas</h1>
        <p className="text-xs text-slate-500 font-medium font-medium">Kelola kurikulum mata pelajaran wajib serta konfigurasi kelas pengajaran</p>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 gap-1" id="tabs-mapel-kelas">
        <button
          onClick={() => setActiveTab("mapel")}
          className={`flex items-center gap-1.5 py-2 px-4 text-xs font-semibold border-b-2 transition duration-150 ${
            activeTab === "mapel"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BookOpen size={14} /> Mata Pelajaran
        </button>
        <button
          onClick={() => setActiveTab("kelas")}
          className={`flex items-center gap-1.5 py-2 px-4 text-xs font-semibold border-b-2 transition duration-150 ${
            activeTab === "kelas"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Layers size={14} /> Manajemen Kelas
        </button>
      </div>

      {/* CONTENT TAB 1: MATA PELAJARAN */}
      {activeTab === "mapel" && (
        <div className="space-y-3" id="tab-mapel-content">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Mata Pelajaran Ujian</h2>
              <p className="text-[11px] text-slate-500">Daftar pelajaran wajib untuk simulasi kelulusan UNBK</p>
            </div>
            <button
              onClick={handleOpenAddMapel}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 px-3 rounded transition flex items-center gap-1 shadow-xs"
            >
              <Plus size={13} /> Tambah Mapel
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">Kode Mapel</th>
                    <th className="py-2.5 px-4">Nama Pelajaran</th>
                    <th className="py-2.5 px-4">Target KKM</th>
                    <th className="py-2.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mapelList.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 transition">
                      <td className="py-2 px-4">
                        <span className="font-mono text-xs font-extrabold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {m.kode}
                        </span>
                      </td>
                      <td className="py-2 px-4 font-semibold text-slate-900">{m.nama}</td>
                      <td className="py-2 px-4 font-mono text-slate-800 font-bold">{m.kkm}</td>
                      <td className="py-2 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditMapel(m)}
                            className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteMapel(m.id, m.nama)}
                            className="p-1 hover:bg-red-50 text-red-600 rounded transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {mapelList.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-400 text-xs">
                        Belum ada data mata pelajaran. Silakan tambahkan baru.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT TAB 2: MANAJEMEN KELAS */}
      {activeTab === "kelas" && (
        <div className="space-y-3" id="tab-kelas-content">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Manajemen Kelas & Pembagian Wali</h2>
              <p className="text-[11px] text-slate-500">Susun rombongan belajar dan delegasikan wali kelas</p>
            </div>
            <button
              onClick={handleOpenAddKelas}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 px-3 rounded transition flex items-center gap-1 shadow-xs"
            >
              <Plus size={13} /> Tambah Kelas
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">Kode Rombel</th>
                    <th className="py-2.5 px-4">Nama Kelas / Jenjang</th>
                    <th className="py-2.5 px-4">Wali Kelas</th>
                    <th className="py-2.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {kelasList.map((k) => {
                    const wali = guruList.find(g => g.id === k.waliGuruId);
                    return (
                      <tr key={k.id} className="hover:bg-slate-50 transition">
                        <td className="py-2 px-4">
                          <span className="font-mono text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                            {k.kode}
                          </span>
                        </td>
                        <td className="py-2 px-4 font-semibold text-slate-900">{k.nama}</td>
                        <td className="py-2 px-4 text-slate-700">
                          {wali ? wali.nama : <span className="text-red-500 font-medium text-[11px]">Belum Ditentukan</span>}
                        </td>
                        <td className="py-2 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditKelas(k)}
                              className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteKelas(k.id, k.nama)}
                              className="p-1 hover:bg-red-50 text-red-600 rounded transition"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {kelasList.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-400 text-xs">
                        Belum ada data rombongan kelas. Silakan tambahkan baru.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Mapel Form Modal */}
      {isMapelModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">
                {editingMapel ? "Edit Mata Pelajaran" : "Tambah Mata Pelajaran"}
              </h3>
              <button onClick={() => setIsMapelModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleMapelSubmit} className="p-5 space-y-3.5 text-xs">
              {mapelError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{mapelError}</span>
                </div>
              )}

              <div className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Kode Pelajaran *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: MTK, BIN, IPA"
                    value={formMapelKode}
                    onChange={(e) => setFormMapelKode(e.target.value.toUpperCase().replace(/\s/g, ""))}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Nama Pelajaran *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Matematika"
                    value={formMapelNama}
                    onChange={(e) => setFormMapelNama(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Nilai Kelulusan Minimal (KKM) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={formMapelKKM}
                    onChange={(e) => setFormMapelKKM(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsMapelModalOpen(false)}
                  className="bg-slate-100 text-slate-700 font-semibold py-1.5 px-3 rounded transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded transition flex items-center gap-1"
                >
                  <Save size={13} /> Simpan Mapel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kelas Form Modal */}
      {isKelasModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">
                {editingKelas ? "Edit Rombongan Kelas" : "Tambah Rombongan Kelas"}
              </h3>
              <button onClick={() => setIsKelasModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleKelasSubmit} className="p-5 space-y-3.5 text-xs">
              {kelasError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{kelasError}</span>
                </div>
              )}

              <div className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Kode Rombel *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PKC-XII, PKB-IX"
                    value={formKelasKode}
                    onChange={(e) => setFormKelasKode(e.target.value.toUpperCase().replace(/\s/g, ""))}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Nama Kelas / Jenjang *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Paket C - Kelas XII"
                    value={formKelasNama}
                    onChange={(e) => setFormKelasNama(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Delegasikan Wali Kelas *</label>
                  <select
                    value={formKelasWaliId}
                    onChange={(e) => setFormKelasWaliId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="" disabled>Pilih Tenaga Pendidik...</option>
                    {guruList.map(g => (
                      <option key={g.id} value={g.id}>{g.nama}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsKelasModalOpen(false)}
                  className="bg-slate-100 text-slate-700 font-semibold py-1.5 px-3 rounded transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded transition flex items-center gap-1"
                >
                  <Save size={13} /> Simpan Kelas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
