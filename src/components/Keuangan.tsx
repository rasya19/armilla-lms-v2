import React, { useState, useEffect } from "react";
import { CheckCircle2, ShieldAlert, CheckSquare, Square, Banknote, AlertCircle, RefreshCw } from "lucide-react";

interface Tabungan {
  id: string;
  siswaId: string;
  siswaNama: string;
  siswaNisn: string;
  tanggal: string;
  jumlah: number;
  status: "Pending" | "Valid";
  tenantId: string;
}

export default function Keuangan() {
  const [pendingTabungan, setPendingTabungan] = useState<Tabungan[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const fetchPending = async () => {
    setIsLoading(true);
    setNotification(null);
    try {
      const res = await fetch("/api/keuangan/tabungan/pending", {
        headers: { "x-tenant-id": "tenant_armilla" }
      });
      if (!res.ok) throw new Error("Gagal mengambil data tabungan");
      const json = await res.json();
      setPendingTabungan(json.data || []);
      setSelectedIds(new Set()); // Reset selection
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleSelectAll = () => {
    if (selectedIds.size === pendingTabungan.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all
      setSelectedIds(new Set(pendingTabungan.map(t => t.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleValidasiMassal = async () => {
    if (selectedIds.size === 0) return;
    setIsValidating(true);
    try {
      const res = await fetch("/api/keuangan/tabungan/validasi-massal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": "tenant_armilla"
        },
        body: JSON.stringify({ tabunganIds: Array.from(selectedIds) })
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memvalidasi tabungan");
      
      setNotification({ type: 'success', message: json.message });
      // Refresh data
      await fetchPending();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setIsValidating(false);
    }
  };

  const formatRupiah = (angka: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
  };

  const allSelected = pendingTabungan.length > 0 && selectedIds.size === pendingTabungan.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert className="text-amber-500" size={24} /> Keuangan (Secure)
          </h1>
          <p className="text-xs text-slate-500 font-medium">Validasi Setoran Tabungan Siswa (Bendahara/SuperAdmin Only)</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchPending}
            disabled={isLoading}
            className="p-1.5 rounded bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          </button>
          
          <button
            onClick={handleValidasiMassal}
            disabled={selectedIds.size === 0 || isValidating}
            className={`text-xs font-semibold py-1.5 px-3 rounded transition flex items-center gap-1.5 shadow-xs ${
              selectedIds.size > 0
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            <CheckCircle2 size={14} /> 
            {isValidating ? "Memvalidasi..." : `Validasi Massal (${selectedIds.size})`}
          </button>
        </div>
      </div>

      {notification && (
        <div className={`p-3 rounded text-xs font-medium flex items-center gap-2 ${
          notification.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {notification.message}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 w-12 text-center">
                  <button onClick={handleSelectAll} className="text-slate-400 hover:text-amber-500 transition">
                    {allSelected ? <CheckSquare size={16} className="text-amber-500" /> : <Square size={16} />}
                  </button>
                </th>
                <th className="py-3 px-4">Identitas Siswa</th>
                <th className="py-3 px-4">Tanggal Setor</th>
                <th className="py-3 px-4 text-right">Nominal</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 opacity-50 text-amber-500" />
                    <p className="text-xs">Memuat data tabungan...</p>
                  </td>
                </tr>
              ) : pendingTabungan.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <CheckCircle2 size={30} className="mx-auto mb-2 opacity-50 text-green-500" />
                    <p className="text-xs">Semua setoran tabungan sudah tervalidasi.</p>
                  </td>
                </tr>
              ) : (
                pendingTabungan.map((tabungan) => {
                  const isSelected = selectedIds.has(tabungan.id);
                  return (
                    <tr 
                      key={tabungan.id} 
                      className={`transition duration-150 cursor-pointer ${isSelected ? 'bg-amber-50/50' : 'hover:bg-slate-50'}`}
                      onClick={() => handleSelectOne(tabungan.id)}
                    >
                      <td className="py-2.5 px-4 text-center">
                        <button className="text-slate-400 transition">
                          {isSelected ? <CheckSquare size={16} className="text-amber-500" /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-900">{tabungan.siswaNama}</div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">NISN: {tabungan.siswaNisn}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 font-mono">
                        {tabungan.tanggal}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="font-bold text-slate-800 font-mono bg-slate-50 px-2 py-0.5 rounded inline-block border border-slate-100">
                          {formatRupiah(tabungan.jumlah)}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border bg-yellow-50 text-yellow-700 border-yellow-200">
                          <span className="w-1 h-1 rounded-full bg-yellow-500 animate-pulse"></span>
                          Menunggu Validasi
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
