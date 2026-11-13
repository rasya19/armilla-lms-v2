import React, { useState } from "react";
import { Plus, UserCheck, UserX, Trash2, ClipboardList, CheckCircle, XCircle, AlertCircle, Send, Search } from "lucide-react";
import { PPDB } from "../types";

interface DataPPDBProps {
  ppdbList: PPDB[];
  onAdd: (data: Omit<PPDB, "id" | "noDaftar" | "status" | "tanggalDaftar">) => Promise<void>;
  onUpdateStatus: (id: string, status: "Diterima" | "Ditolak") => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function DataPPDB({ ppdbList, onAdd, onUpdateStatus, onDelete }: DataPPDBProps) {
  const [search, setSearch] = useState("");
  const [selectedFilterStatus, setSelectedFilterStatus] = useState("");

  // Form registration state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [telepon, setTelepon] = useState("");
  const [alamat, setAlamat] = useState("");
  const [jenjang, setJenjang] = useState<"Paket A" | "Paket B" | "Paket C">("Paket C");

  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!nama || !email || !telepon || !alamat) {
      setFormError("Semua bidang form pendaftaran wajib diisi.");
      return;
    }

    try {
      await onAdd({ nama, email, telepon, alamat, jenjang });
      setFormSuccess("Formulir pendaftaran PPDB berhasil diajukan! Berkas pendaftar segera diverifikasi.");
      // Reset form
      setNama("");
      setEmail("");
      setTelepon("");
      setAlamat("");
      setJenjang("Paket C");
      setTimeout(() => {
        setIsFormOpen(false);
        setFormSuccess("");
      }, 3000);
    } catch (err: any) {
      setFormError(err.message || "Gagal mengirim formulir pendaftaran.");
    }
  };

  const handleApprove = async (id: string, namaSiswa: string) => {
    if (confirm(`Apakah Anda yakin ingin MENERIMA pendaftar "${namaSiswa}" di PKBM Armilla?`)) {
      try {
        await onUpdateStatus(id, "Diterima");
      } catch (err: any) {
        alert("Gagal merubah status: " + err.message);
      }
    }
  };

  const handleReject = async (id: string, namaSiswa: string) => {
    if (confirm(`Apakah Anda yakin ingin MENOLAK berkas pendaftaran dari "${namaSiswa}"?`)) {
      try {
        await onUpdateStatus(id, "Ditolak");
      } catch (err: any) {
        alert("Gagal merubah status: " + err.message);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Apakah Anda yakin ingin menghapus arsip pendaftaran PPDB ini secara permanen?")) {
      try {
        await onDelete(id);
      } catch (err: any) {
        alert("Gagal menghapus data: " + err.message);
      }
    }
  };

  const filteredPPDB = ppdbList.filter(p => {
    const matchesSearch = p.nama.toLowerCase().includes(search.toLowerCase()) || p.noDaftar.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = selectedFilterStatus ? p.status === selectedFilterStatus : true;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6" id="ppdb-container">
      {/* Header and Toggle Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Penerimaan Peserta Didik Baru (PPDB)</h1>
          <p className="text-xs text-slate-500 font-medium">Kelola berkas calon pendaftar, seleksi administrasi, dan registrasi siswa</p>
        </div>
        <button
          onClick={() => {
            setIsFormOpen(!isFormOpen);
            setFormError("");
            setFormSuccess("");
          }}
          className={`text-xs font-semibold py-2 px-3.5 rounded transition flex items-center justify-center gap-1.5 self-start sm:self-auto shadow-xs ${
            isFormOpen 
              ? "bg-slate-855 hover:bg-slate-700 text-white" 
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
          id="btn-toggle-ppdb-form"
        >
          {isFormOpen ? "Tutup Form Pendaftaran" : "Buka Form Pendaftaran Baru"}
        </button>
      </div>

      {/* Slide down form registration */}
      {isFormOpen && (
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-lg space-y-3 animate-in slide-in-from-top-4 duration-200" id="ppdb-form-card">
          <div className="flex items-center gap-1.5 pb-2 border-b border-slate-200">
            <ClipboardList className="text-blue-600" size={18} />
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide">Formulir Pendaftaran Siswa Baru (PPDB Online)</h3>
          </div>

          <form onSubmit={handleRegisterSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded col-span-1 sm:col-span-2 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 p-2.5 col-span-1 sm:col-span-2 rounded flex items-center gap-2 font-medium">
                <CheckCircle size={14} className="text-green-600 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            {/* Nama */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Nama Lengkap Calon Siswa *</label>
              <input
                type="text"
                required
                placeholder="Contoh: Rendi Pangestu"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Program Jenjang */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Jenjang Program Kesetaraan *</label>
              <select
                value={jenjang}
                onChange={(e) => setJenjang(e.target.value as any)}
                className="w-full bg-white border border-slate-200 rounded py-1.5 px-2 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="Paket A">Paket A (Setara SD)</option>
                <option value="Paket B">Paket B (Setara SMP)</option>
                <option value="Paket C">Paket C (Setara SMA)</option>
              </select>
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Alamat Email Aktif *</label>
              <input
                type="email"
                required
                placeholder="rendi@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Telepon */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">No. WhatsApp Calon Siswa *</label>
              <input
                type="text"
                required
                placeholder="Contoh: 0852XXXXXXXX"
                value={telepon}
                onChange={(e) => setTelepon(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
              />
            </div>

            {/* Alamat Rumah */}
            <div className="space-y-1 col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Alamat Domisili Lengkap *</label>
              <textarea
                required
                rows={2}
                placeholder="Isi alamat rumah lengkap calon peserta didik..."
                value={alamat}
                onChange={(e) => setAlamat(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded py-1.5 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              ></textarea>
            </div>

            <div className="col-span-1 sm:col-span-2 flex justify-end">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded transition flex items-center gap-1 shadow-sm"
              >
                Kirim Formulir <Send size={13} />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3" id="filters-ppdb">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Cari berdasarkan nomor pendaftaran atau nama calon siswa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded py-2 pl-9 pr-3 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* Filter Status */}
        <div className="w-full sm:w-48">
          <select
            value={selectedFilterStatus}
            onChange={(e) => setSelectedFilterStatus(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="">Semua Status Seleksi</option>
            <option value="Pending">Pending (Verifikasi)</option>
            <option value="Diterima">Diterima</option>
            <option value="Ditolak">Ditolak</option>
          </select>
        </div>
      </div>

      {/* Applicants Table List */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" id="ppdb-table-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs" id="table-ppdb">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">No. Pendaftaran</th>
                <th className="py-3 px-4">Calon Siswa</th>
                <th className="py-3 px-4">Pilihan Program</th>
                <th className="py-3 px-4">Tanggal Pengajuan</th>
                <th className="py-3 px-4">Status Seleksi</th>
                <th className="py-3 px-4 text-right">Aksi Administrator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPPDB.map((ppdb) => (
                <tr key={ppdb.id} className="hover:bg-slate-50 transition duration-150">
                  <td className="py-2.5 px-4">
                    <span className="font-mono text-xs font-extrabold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {ppdb.noDaftar}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-slate-900">{ppdb.nama}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{ppdb.email} • {ppdb.telepon}</div>
                    <div className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-1 max-w-sm">Alamat: {ppdb.alamat}</div>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                      {ppdb.jenjang}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="font-mono text-xs text-slate-500">{ppdb.tanggalDaftar}</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${
                      ppdb.status === "Pending" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                      ppdb.status === "Diterima" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                    }`}>
                      {ppdb.status === "Pending" && <span className="w-1 h-1 rounded-full bg-yellow-500 animate-pulse"></span>}
                      {ppdb.status === "Diterima" && <CheckCircle size={10} className="text-green-600" />}
                      {ppdb.status === "Ditolak" && <XCircle size={10} className="text-red-600" />}
                      {ppdb.status === "Pending" ? "Verifikasi Berkas" : ppdb.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {ppdb.status === "Pending" && (
                        <>
                          <button
                            onClick={() => handleApprove(ppdb.id, ppdb.nama)}
                            className="bg-green-600 hover:bg-green-700 text-white p-1 rounded transition flex items-center gap-1 text-[10px] font-bold px-2"
                            title="Terima Siswa"
                          >
                            <UserCheck size={12} /> Terima
                          </button>
                          <button
                            onClick={() => handleReject(ppdb.id, ppdb.nama)}
                            className="bg-red-50 hover:bg-red-100 text-red-700 p-1 rounded transition flex items-center gap-1 text-[10px] font-bold px-2 border border-red-200"
                            title="Tolak Berkas"
                          >
                            <UserX size={12} /> Tolak
                          </button>
                        </>
                      )}
                      
                      <button
                        onClick={() => handleDelete(ppdb.id)}
                        className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded transition"
                        title="Hapus Arsip"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredPPDB.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <AlertCircle size={30} className="mx-auto mb-2 opacity-50 text-blue-500" />
                    <p className="text-xs">Tidak ada berkas calon siswa ditemukan.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
