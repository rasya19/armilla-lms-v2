import React, { useState } from "react";
import { Plus, Search, Edit2, Trash2, X, AlertCircle, Save } from "lucide-react";
import { Siswa, Kelas } from "../types";

interface MasterSiswaProps {
  siswaList: Siswa[];
  kelasList: Kelas[];
  onAdd: (data: Omit<Siswa, "id">) => Promise<void>;
  onUpdate: (id: string, data: Partial<Siswa>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function MasterSiswa({ siswaList, kelasList, onAdd, onUpdate, onDelete }: MasterSiswaProps) {
  const [search, setSearch] = useState("");
  const [selectedKelasId, setSelectedKelasId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSiswa, setEditingSiswa] = useState<Siswa | null>(null);

  // Form State
  const [formNISN, setFormNISN] = useState("");
  const [formNama, setFormNama] = useState("");
  const [formKelasId, setFormKelasId] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTelepon, setFormTelepon] = useState("");
  const [formStatus, setFormStatus] = useState<"Aktif" | "Alumni" | "Cuti">("Aktif");
  const [errorMessage, setErrorMessage] = useState("");

  const handleOpenAddModal = () => {
    setEditingSiswa(null);
    setFormNISN("");
    setFormNama("");
    setFormKelasId(kelasList[0]?.id || "");
    setFormEmail("");
    setFormTelepon("");
    setFormStatus("Aktif");
    setErrorMessage("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (siswa: Siswa) => {
    setEditingSiswa(siswa);
    setFormNISN(siswa.nisn);
    setFormNama(siswa.nama);
    setFormKelasId(siswa.kelasId);
    setFormEmail(siswa.email);
    setFormTelepon(siswa.telepon);
    setFormStatus(siswa.status);
    setErrorMessage("");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    // Simple Validations
    if (!formNISN || !formNama || !formKelasId) {
      setErrorMessage("NISN, Nama, dan Kelas wajib diisi.");
      return;
    }

    if (formNISN.length < 8) {
      setErrorMessage("NISN harus memiliki minimal 8 digit angka.");
      return;
    }

    try {
      if (editingSiswa) {
        await onUpdate(editingSiswa.id, {
          nisn: formNISN,
          nama: formNama,
          kelasId: formKelasId,
          email: formEmail,
          telepon: formTelepon,
          status: formStatus
        });
      } else {
        // Check for NISN duplicate locally before submitting
        const nisnDuplicate = siswaList.some(s => s.nisn === formNISN);
        if (nisnDuplicate) {
          setErrorMessage("Siswa dengan NISN tersebut sudah terdaftar.");
          return;
        }

        await onAdd({
          nisn: formNISN,
          nama: formNama,
          kelasId: formKelasId,
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
    if (confirm(`Apakah Anda yakin ingin menghapus siswa "${nama}"? Semua data nilai ujian yang berkaitan juga akan dihapus.`)) {
      try {
        await onDelete(id);
      } catch (err: any) {
        alert(err.message || "Gagal menghapus siswa.");
      }
    }
  };

  // Filtered List
  const filteredSiswa = siswaList.filter(s => {
    const matchesSearch = s.nama.toLowerCase().includes(search.toLowerCase()) || s.nisn.includes(search);
    const matchesKelas = selectedKelasId ? s.kelasId === selectedKelasId : true;
    const matchesStatus = selectedStatus ? s.status === selectedStatus : true;
    return matchesSearch && matchesKelas && matchesStatus;
  });

  return (
    <div className="space-y-6" id="master-siswa-container">
      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Master Data Siswa</h1>
          <p className="text-xs text-slate-500 font-medium">Kelola informasi data pribadi dan kelas siswa PKBM Armilla</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-3.5 rounded transition flex items-center justify-center gap-1.5 self-start sm:self-auto shadow-xs"
          id="btn-add-siswa"
        >
          <Plus size={14} /> Tambah Siswa Baru
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3" id="filters-siswa">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Cari siswa berdasarkan nama atau NISN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded py-2 pl-9 pr-3 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* Filter Kelas */}
        <div className="w-full md:w-44">
          <select
            value={selectedKelasId}
            onChange={(e) => setSelectedKelasId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="">Semua Kelas</option>
            {kelasList.map(k => (
              <option key={k.id} value={k.id}>{k.nama}</option>
            ))}
          </select>
        </div>

        {/* Filter Status */}
        <div className="w-full md:w-40">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="">Semua Status</option>
            <option value="Aktif">Aktif</option>
            <option value="Alumni">Alumni</option>
            <option value="Cuti">Cuti</option>
          </select>
        </div>
      </div>

      {/* Siswa Table Content */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" id="siswa-table-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs" id="table-siswa">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">NISN / Identitas</th>
                <th className="py-3 px-4">Nama Lengkap</th>
                <th className="py-3 px-4">Kelas</th>
                <th className="py-3 px-4">Kontak</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSiswa.map((siswa) => {
                const kelas = kelasList.find(k => k.id === siswa.kelasId);
                return (
                  <tr key={siswa.id} className="hover:bg-slate-50 transition duration-150">
                    <td className="py-2.5 px-4">
                      <span className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {siswa.nisn}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{siswa.nama}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-slate-600 font-medium">
                        {kelas ? kelas.nama : <span className="text-red-400">Belum Berkelas</span>}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="space-y-0.5 text-[11px] text-slate-500">
                        <div>{siswa.email || "-"}</div>
                        <div className="font-mono">{siswa.telepon || "-"}</div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${
                        siswa.status === "Aktif" ? "bg-green-50 text-green-700 border-green-200" :
                        siswa.status === "Alumni" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${
                          siswa.status === "Aktif" ? "bg-green-600" :
                          siswa.status === "Alumni" ? "bg-blue-600" : "bg-amber-600"
                        }`}></span>
                        {siswa.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(siswa)}
                          className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition"
                          title="Edit Siswa"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(siswa.id, siswa.nama)}
                          className="p-1 hover:bg-red-50 text-red-600 hover:text-red-800 rounded transition"
                          title="Hapus Siswa"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredSiswa.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <AlertCircle size={30} className="mx-auto mb-2 opacity-50 text-blue-500" />
                    <p className="text-xs">Tidak ada data siswa ditemukan.</p>
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
                {editingSiswa ? "Edit Informasi Siswa" : "Tambah Siswa Baru"}
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
                {/* NISN */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">NISN Siswa *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 0054812300"
                    value={formNISN}
                    onChange={(e) => setFormNISN(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>

                {/* Nama */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Nama Lengkap *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Ahmad Subardjo"
                    value={formNama}
                    onChange={(e) => setFormNama(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* Kelas */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Pilih Kelas *</label>
                  <select
                    value={formKelasId}
                    onChange={(e) => setFormKelasId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="" disabled>Pilih Kelas...</option>
                    {kelasList.map(k => (
                      <option key={k.id} value={k.id}>{k.nama}</option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Status Akademis *</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Alumni">Alumni</option>
                    <option value="Cuti">Cuti</option>
                  </select>
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">E-mail Siswa</label>
                  <input
                    type="email"
                    placeholder="siswa@domain.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* Telepon */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">No. Telepon / WhatsApp</label>
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
