import React, { useState } from "react";
import { Plus, Search, Edit2, Trash2, X, AlertCircle, Save } from "lucide-react";
import { Guru, Mapel } from "../types";

interface MasterGuruProps {
  guruList: Guru[];
  mapelList: Mapel[];
  onAdd: (data: Omit<Guru, "id">) => Promise<void>;
  onUpdate: (id: string, data: Partial<Guru>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function MasterGuru({ guruList, mapelList, onAdd, onUpdate, onDelete }: MasterGuruProps) {
  const [search, setSearch] = useState("");
  const [selectedMapelId, setSelectedMapelId] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGuru, setEditingGuru] = useState<Guru | null>(null);

  // Form State
  const [formNUPTK, setFormNUPTK] = useState("");
  const [formNama, setFormNama] = useState("");
  const [formMapelUtama, setFormMapelUtama] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTelepon, setFormTelepon] = useState("");
  const [formStatus, setFormStatus] = useState<"Aktif" | "Nonaktif">("Aktif");
  const [errorMessage, setErrorMessage] = useState("");

  const handleOpenAddModal = () => {
    setEditingGuru(null);
    setFormNUPTK("");
    setFormNama("");
    setFormMapelUtama(mapelList[0]?.id || "");
    setFormEmail("");
    setFormTelepon("");
    setFormStatus("Aktif");
    setErrorMessage("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (guru: Guru) => {
    setEditingGuru(guru);
    setFormNUPTK(guru.nuptk);
    setFormNama(guru.nama);
    setFormMapelUtama(guru.mapelUtama);
    setFormEmail(guru.email);
    setFormTelepon(guru.telepon);
    setFormStatus(guru.status);
    setErrorMessage("");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!formNUPTK || !formNama || !formMapelUtama) {
      setErrorMessage("NUPTK, Nama Lengkap, dan Mata Pelajaran Utama wajib diisi.");
      return;
    }

    try {
      if (editingGuru) {
        await onUpdate(editingGuru.id, {
          nuptk: formNUPTK,
          nama: formNama,
          mapelUtama: formMapelUtama,
          email: formEmail,
          telepon: formTelepon,
          status: formStatus
        });
      } else {
        const nuptkDuplicate = guruList.some(g => g.nuptk === formNUPTK);
        if (nuptkDuplicate) {
          setErrorMessage("Tenaga pendidik dengan NUPTK tersebut sudah terdaftar.");
          return;
        }

        await onAdd({
          nuptk: formNUPTK,
          nama: formNama,
          mapelUtama: formMapelUtama,
          email: formEmail,
          telepon: formTelepon,
          status: formStatus
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal menyimpan data.");
    }
  };

  const handleDeleteClick = async (id: string, nama: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus tenaga pendidik "${nama}"?`)) {
      try {
        await onDelete(id);
      } catch (err: any) {
        alert(err.message || "Gagal menghapus guru.");
      }
    }
  };

  // Filtered List
  const filteredGuru = guruList.filter(g => {
    const matchesSearch = g.nama.toLowerCase().includes(search.toLowerCase()) || g.nuptk.includes(search);
    const matchesMapel = selectedMapelId ? g.mapelUtama === selectedMapelId : true;
    return matchesSearch && matchesMapel;
  });

  return (
    <div className="space-y-6" id="master-guru-container">
      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Master Data Tenaga Pendidik</h1>
          <p className="text-xs text-slate-500 font-medium">Kelola dan atur data guru pengajar beserta spesialisasi mata pelajaran</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-3.5 rounded transition flex items-center justify-center gap-1.5 self-start sm:self-auto shadow-xs"
          id="btn-add-guru"
        >
          <Plus size={14} /> Tambah Guru Baru
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3" id="filters-guru">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Cari guru berdasarkan nama atau NUPTK..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded py-2 pl-9 pr-3 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* Filter Mapel */}
        <div className="w-full sm:w-52">
          <select
            value={selectedMapelId}
            onChange={(e) => setSelectedMapelId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="">Semua Spesialisasi</option>
            {mapelList.map(m => (
              <option key={m.id} value={m.id}>{m.nama}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Guru Table Content */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" id="guru-table-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs" id="table-guru">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">NUPTK</th>
                <th className="py-3 px-4">Nama Lengkap</th>
                <th className="py-3 px-4">Mata Pelajaran Utama</th>
                <th className="py-3 px-4">Informasi Kontak</th>
                <th className="py-3 px-4">Status Kepegawaian</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredGuru.map((guru) => {
                const mapel = mapelList.find(m => m.id === guru.mapelUtama);
                return (
                  <tr key={guru.id} className="hover:bg-slate-50 transition duration-150">
                    <td className="py-2.5 px-4">
                      <span className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {guru.nuptk}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{guru.nama}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 font-semibold px-2 py-0.5 rounded">
                        {mapel ? mapel.nama : "Tidak Spesifik"}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="space-y-0.5 text-[11px] text-slate-500">
                        <div>{guru.email || "-"}</div>
                        <div className="font-mono">{guru.telepon || "-"}</div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${
                        guru.status === "Aktif" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${
                          guru.status === "Aktif" ? "bg-green-600" : "bg-red-600"
                        }`}></span>
                        {guru.status === "Aktif" ? "Aktif Mengajar" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(guru)}
                          className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition"
                          title="Edit Guru"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(guru.id, guru.nama)}
                          className="p-1 hover:bg-red-50 text-red-600 hover:text-red-800 rounded transition"
                          title="Hapus Guru"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredGuru.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <AlertCircle size={30} className="mx-auto mb-2 opacity-50 text-blue-500" />
                    <p className="text-xs">Tidak ada data guru ditemukan.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">
                {editingGuru ? "Edit Informasi Guru" : "Tambah Guru Baru"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition p-1 rounded">
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
              {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* NUPTK */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">NUPTK Guru *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 1827364509"
                    value={formNUPTK}
                    onChange={(e) => setFormNUPTK(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>

                {/* Nama */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Nama Lengkap & Gelar *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Linda Kartika, S.S."
                    value={formNama}
                    onChange={(e) => setFormNama(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* Mapel Utama */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Mata Pelajaran Utama *</label>
                  <select
                    value={formMapelUtama}
                    onChange={(e) => setFormMapelUtama(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="" disabled>Pilih Bidang Pengajaran...</option>
                    {mapelList.map(m => (
                      <option key={m.id} value={m.id}>{m.nama}</option>
                    ))}
                  </select>
                </div>

                {/* Status Kepegawaian */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Status Kepegawaian *</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="Aktif">Aktif Mengajar</option>
                    <option value="Nonaktif">Nonaktif</option>
                  </select>
                </div>

                {/* Email */}
                <div className="space-y-1 col-span-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600">Alamat E-mail</label>
                  <input
                    type="email"
                    placeholder="guru@domain.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* Telepon */}
                <div className="space-y-1 col-span-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600">No. HP / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="Contoh: 0812XXXXXXXX"
                    value={formTelepon}
                    onChange={(e) => setFormTelepon(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-2 pt-3.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-1.5 px-3 rounded transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded transition flex items-center gap-1"
                >
                  <Save size={13} /> Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
