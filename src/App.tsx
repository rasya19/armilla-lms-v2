import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, Users, GraduationCap, BookOpen, ClipboardList, Award, 
  Menu, X, RefreshCw, AlertCircle, Sparkles, LogOut, CheckCircle2, ShieldAlert
} from "lucide-react";

import { Siswa, Guru, Mapel, Kelas, PPDB, Nilai, DashboardStats } from "./types";
import Dashboard from "./components/Dashboard";
import MasterSiswa from "./components/MasterSiswa";
import MasterGuru from "./components/MasterGuru";
import MasterMapelKelas from "./components/MasterMapelKelas";
import DataPPDB from "./components/DataPPDB";
import RekapNilai from "./components/RekapNilai";
import Keuangan from "./components/Keuangan";

export default function App() {
  // Navigation State
  const [currentView, setCurrentView] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global Collections State
  const [siswa, setSiswa] = useState<Siswa[]>([]);
  const [guru, setGuru] = useState<Guru[]>([]);
  const [mapel, setMapel] = useState<Mapel[]>([]);
  const [kelas, setKelas] = useState<Kelas[]>([]);
  const [ppdb, setPpdb] = useState<PPDB[]>([]);
  const [nilai, setNilai] = useState<Nilai[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Sync / Loader status
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  // Concurrent Fetch Data
  const refreshAllData = async () => {
    setIsLoading(true);
    setGlobalError("");
    try {
      const [
        resStats, resSiswa, resGuru, resMapel, resKelas, resPpdb, resNilai
      ] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/siswa"),
        fetch("/api/guru"),
        fetch("/api/mapel"),
        fetch("/api/kelas"),
        fetch("/api/ppdb"),
        fetch("/api/nilai")
      ]);

      if (!resStats.ok || !resSiswa.ok || !resGuru.ok || !resMapel.ok || !resKelas.ok || !resPpdb.ok || !resNilai.ok) {
        throw new Error("Gagal mengambil data sinkronisasi dari server.");
      }

      const [dataStats, dataSiswa, dataGuru, dataMapel, dataKelas, dataPpdb, dataNilai] = await Promise.all([
        resStats.json(),
        resSiswa.json(),
        resGuru.json(),
        resMapel.json(),
        resKelas.json(),
        resPpdb.json(),
        resNilai.json()
      ]);

      setStats(dataStats);
      setSiswa(dataSiswa);
      setGuru(dataGuru);
      setMapel(dataMapel);
      setKelas(dataKelas);
      setPpdb(dataPpdb);
      setNilai(dataNilai);
    } catch (err: any) {
      setGlobalError(err.message || "Gagal menghubungi API Express.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  // Show dynamic toast helper
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 4000);
  };

  // Mutator Helpers
  const handleMutate = async (url: string, method: "POST" | "PUT" | "DELETE", body?: any) => {
    setIsMutating(true);
    setGlobalError("");
    try {
      const options: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" }
      };
      if (body) {
        options.body = JSON.stringify(body);
      }

      const res = await fetch(url, options);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP Error ${res.status}`);
      }

      const responseData = await res.json();
      
      // Instantly refresh states to trigger reactive dashboard metrics
      await refreshAllData();
      return responseData;
    } catch (err: any) {
      setGlobalError(err.message || "Gagal melakukan aksi mutasi data.");
      throw err;
    } finally {
      setIsMutating(false);
    }
  };

  // Siswa Actions
  const handleAddSiswa = async (data: Omit<Siswa, "id">) => {
    await handleMutate("/api/siswa", "POST", data);
    triggerToast(`Siswa "${data.nama}" berhasil didaftarkan.`);
  };

  const handleUpdateSiswa = async (id: string, data: Partial<Siswa>) => {
    await handleMutate(`/api/siswa/${id}`, "PUT", data);
    triggerToast("Informasi siswa berhasil diperbarui.");
  };

  const handleDeleteSiswa = async (id: string) => {
    await handleMutate(`/api/siswa/${id}`, "DELETE");
    triggerToast("Data siswa berhasil dihapus.");
  };

  // Guru Actions
  const handleAddGuru = async (data: Omit<Guru, "id">) => {
    await handleMutate("/api/guru", "POST", data);
    triggerToast(`Tenaga pengajar "${data.nama}" berhasil ditambahkan.`);
  };

  const handleUpdateGuru = async (id: string, data: Partial<Guru>) => {
    await handleMutate(`/api/guru/${id}`, "PUT", data);
    triggerToast("Data tenaga pengajar berhasil diperbarui.");
  };

  const handleDeleteGuru = async (id: string) => {
    await handleMutate(`/api/guru/${id}`, "DELETE");
    triggerToast("Data tenaga pengajar berhasil dihapus.");
  };

  // Mapel Actions
  const handleAddMapel = async (data: Omit<Mapel, "id">) => {
    await handleMutate("/api/mapel", "POST", data);
    triggerToast(`Mata pelajaran "${data.nama}" berhasil ditambahkan.`);
  };

  const handleUpdateMapel = async (id: string, data: Partial<Mapel>) => {
    await handleMutate(`/api/mapel/${id}`, "PUT", data);
    triggerToast("Data mata pelajaran berhasil diperbarui.");
  };

  const handleDeleteMapel = async (id: string) => {
    await handleMutate(`/api/mapel/${id}`, "DELETE");
    triggerToast("Mata pelajaran berhasil dihapus dari kurikulum.");
  };

  // Kelas Actions
  const handleAddKelas = async (data: Omit<Kelas, "id">) => {
    await handleMutate("/api/kelas", "POST", data);
    triggerToast(`Rombongan belajar "${data.nama}" berhasil dibuat.`);
  };

  const handleUpdateKelas = async (id: string, data: Partial<Kelas>) => {
    await handleMutate(`/api/kelas/${id}`, "PUT", data);
    triggerToast("Informasi rombongan belajar diperbarui.");
  };

  const handleDeleteKelas = async (id: string) => {
    await handleMutate(`/api/kelas/${id}`, "DELETE");
    triggerToast("Kelas berhasil dihapus.");
  };

  // PPDB Actions
  const handleAddPPDB = async (data: Omit<PPDB, "id" | "noDaftar" | "status" | "tanggalDaftar">) => {
    await handleMutate("/api/ppdb", "POST", data);
  };

  const handleUpdatePPDBStatus = async (id: string, status: "Diterima" | "Ditolak") => {
    const candidate = ppdb.find(p => p.id === id);
    await handleMutate(`/api/ppdb/${id}`, "PUT", { status });
    triggerToast(`Pendaftar "${candidate?.nama}" dinyatakan ${status.toUpperCase()}.`);
  };

  const handleDeletePPDB = async (id: string) => {
    await handleMutate(`/api/ppdb/${id}`, "DELETE");
    triggerToast("Arsip pendaftaran PPDB dihapus.");
  };

  // Nilai Actions
  const handleAddNilai = async (data: Omit<Nilai, "id" | "nilaiAkhir">) => {
    await handleMutate("/api/nilai", "POST", data);
    triggerToast("Nilai simulasi berhasil dimasukkan.");
  };

  const handleUpdateNilai = async (id: string, data: Partial<Nilai>) => {
    await handleMutate(`/api/nilai/${id}`, "PUT", data);
    triggerToast("Nilai simulasi berhasil diperbarui.");
  };

  const handleDeleteNilai = async (id: string) => {
    await handleMutate(`/api/nilai/${id}`, "DELETE");
    triggerToast("Data rekap nilai dihapus.");
  };

  const handleBulkImportNilai = async (data: Array<{
    nisn: string;
    kodeMapel: string;
    nilaiMandiri: number;
    nilaiSimulasi: number;
    tanggalSimulasi: string;
  }>) => {
    const res = await handleMutate("/api/nilai/import", "POST", { data });
    return res; // contains successCount and errors
  };

  // Navigation Config
  const navigationItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "siswa", label: "Master Siswa", icon: Users },
    { id: "guru", label: "Master Guru", icon: GraduationCap },
    { id: "mapelkelas", label: "Kurikulum & Kelas", icon: BookOpen },
    { id: "ppdb", label: "PPDB Online", icon: ClipboardList },
    { id: "nilai", label: "Nilai Simulasi UNBK", icon: Award },
    { id: "keuangan", label: "Keuangan", icon: ShieldAlert },
  ];

  const handleNavigate = (viewId: string) => {
    setCurrentView(viewId);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800" id="pkbm-armilla-app">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white py-2 px-4 rounded-lg shadow-lg flex items-center gap-2.5 border border-slate-800 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <CheckCircle2 size={16} className="text-blue-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="flex flex-1 relative">
        
        {/* SIDEBAR NAVIGATION - DESKTOP */}
        <aside className="hidden lg:flex flex-col w-64 bg-slate-900 text-slate-300 border-r border-slate-800 shrink-0 p-4 justify-between">
          <div className="space-y-5">
            {/* Brand Logo */}
            <div className="flex items-center gap-3 px-2 py-2 border-b border-slate-800">
              <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center font-bold text-white text-base">
                A
              </div>
              <div>
                <h1 className="text-sm font-bold text-white leading-tight tracking-tight">
                  ARMILLA
                  <span className="text-blue-400 text-[10px] block font-normal leading-none mt-0.5">Sistem Informasi PKBM</span>
                </h1>
              </div>
            </div>

            {/* Nav Menu */}
            <nav className="space-y-1">
              <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest px-2 mb-2">Menu Utama</div>
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition duration-200 ${
                      isActive 
                        ? "bg-blue-600 text-white font-semibold" 
                        : "hover:bg-slate-800 hover:text-white text-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={14} className="shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    {item.id === "keuangan" && (
                      <div className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Footer Brand Info */}
          <div className="p-3 bg-slate-800/50 rounded-lg mt-auto space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">System Status: OK</span>
            </div>
            <div className="text-[9px] text-slate-500 font-mono">
              v2.4.0-stable | API: 3000
            </div>
          </div>
        </aside>

        {/* MOBILE SLIDE-OVER DRAWER */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)}></div>
            
            {/* Drawer */}
            <div className="relative w-64 bg-slate-900 text-slate-300 p-4 flex flex-col justify-between z-10 animate-in slide-in-from-left duration-200">
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-500 text-white rounded flex items-center justify-center font-bold text-sm">
                      A
                    </div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider">ARMILLA</span>
                  </div>
                  <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white p-1">
                    <X size={18} />
                  </button>
                </div>

                {/* Nav items */}
                <nav className="space-y-1">
                  <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest px-2 mb-2">Menu Utama</div>
                  {navigationItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentView === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavigate(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-semibold transition ${
                          isActive 
                            ? "bg-blue-600 text-white" 
                            : "hover:bg-slate-800 hover:text-white text-slate-400"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon size={14} />
                          <span>{item.label}</span>
                        </div>
                        {item.id === "keuangan" && (
                          <div className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="text-[9px] text-slate-500 text-center font-mono">
                v2.4.0-stable | © 2026
              </div>
            </div>
          </div>
        )}

        {/* BODY CONTAINER */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          
          {/* TOP BAR / NAVIGATION HEADER */}
          <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-xs" id="app-header">
            <div className="flex items-center gap-3">
              {/* Menu Button for Mobile */}
              <button 
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-1.5 text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200"
              >
                <Menu size={20} />
              </button>

              <div>
                <h1 className="text-base font-extrabold text-slate-800 tracking-tight">Sistem Informasi Manajemen PKBM</h1>
                <p className="text-[10px] text-slate-400 font-mono">Pendidikan Kesetaraan Bandung, Jawa Barat</p>
              </div>
            </div>

            {/* Sync actions status */}
            <div className="flex items-center gap-3">
              {isMutating && (
                <span className="text-[10px] bg-blue-50 text-blue-700 font-mono font-bold px-2 py-1 rounded border border-blue-100 animate-pulse">
                  SYNCING_DB...
                </span>
              )}
              
              <button
                onClick={refreshAllData}
                disabled={isLoading}
                className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded transition flex items-center gap-1.5 text-xs font-semibold"
                title="Penyelarasan Data"
              >
                <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
                <span className="hidden md:inline font-mono text-[11px]">Refresh Data</span>
              </button>

              <div className="w-px h-5 bg-slate-200"></div>

              {/* User Identity Profile */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-mono font-bold text-xs border border-blue-200">
                  AD
                </div>
                <div className="hidden md:block text-left">
                  <div className="text-xs font-bold text-slate-800 leading-tight">Admin (Ismanto)</div>
                  <div className="text-[9px] text-slate-400 font-mono font-medium">NEXT_PUBLIC_API_URL: 3000</div>
                </div>
              </div>
            </div>
          </header>

          {/* MAIN PAGE VIEW CONTENT */}
          <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto" id="main-content">
            {globalError && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-xs flex items-center gap-3">
                <AlertCircle size={20} className="shrink-0 text-red-500" />
                <div className="space-y-0.5">
                  <div className="font-bold">Sambungan Server Terganggu</div>
                  <div>{globalError}</div>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex flex-col items-center justify-center py-24 space-y-3" id="app-loading">
                <RefreshCw size={36} className="text-blue-600 animate-spin" />
                <div className="text-slate-500 text-xs font-semibold font-mono tracking-tight">LOADING_PKBM_DATABASE...</div>
              </div>
            )}

            {!isLoading && (
              <div className="animate-in fade-in duration-200">
                {currentView === "dashboard" && stats && (
                  <Dashboard 
                    stats={stats} 
                    siswa={siswa}
                    guru={guru}
                    nilai={nilai}
                    mapel={mapel}
                    onNavigate={handleNavigate} 
                  />
                )}
                {currentView === "siswa" && (
                  <MasterSiswa 
                    siswaList={siswa}
                    kelasList={kelas}
                    onAdd={handleAddSiswa}
                    onUpdate={handleUpdateSiswa}
                    onDelete={handleDeleteSiswa}
                  />
                )}
                {currentView === "guru" && (
                  <MasterGuru 
                    guruList={guru}
                    mapelList={mapel}
                    onAdd={handleAddGuru}
                    onUpdate={handleUpdateGuru}
                    onDelete={handleDeleteGuru}
                  />
                )}
                {currentView === "mapelkelas" && (
                  <MasterMapelKelas 
                    mapelList={mapel}
                    kelasList={kelas}
                    guruList={guru}
                    onAddMapel={handleAddMapel}
                    onUpdateMapel={handleUpdateMapel}
                    onDeleteMapel={handleDeleteMapel}
                    onAddKelas={handleAddKelas}
                    onUpdateKelas={handleUpdateKelas}
                    onDeleteKelas={handleDeleteKelas}
                  />
                )}
                {currentView === "ppdb" && (
                  <DataPPDB 
                    ppdbList={ppdb}
                    onAdd={handleAddPPDB}
                    onUpdateStatus={handleUpdatePPDBStatus}
                    onDelete={handleDeletePPDB}
                  />
                )}
                {currentView === "nilai" && (
                  <RekapNilai 
                    nilaiList={nilai}
                    siswaList={siswa}
                    mapelList={mapel}
                    onAdd={handleAddNilai}
                    onUpdate={handleUpdateNilai}
                    onDelete={handleDeleteNilai}
                    onBulkImport={handleBulkImportNilai}
                  />
                )}
                {currentView === "keuangan" && (
                  <Keuangan />
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
