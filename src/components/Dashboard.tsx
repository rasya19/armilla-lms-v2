import React from "react";
import { Users, GraduationCap, Award, FileText, Clock, ArrowUpRight, TrendingUp, AlertCircle, BookOpen } from "lucide-react";
import { DashboardStats, Siswa, Guru, Nilai, Mapel } from "../types";

interface DashboardProps {
  stats: DashboardStats;
  siswa: Siswa[];
  guru: Guru[];
  nilai: Nilai[];
  mapel: Mapel[];
  onNavigate: (view: string) => void;
}

export default function Dashboard({ stats, siswa, guru, nilai, mapel, onNavigate }: DashboardProps) {
  // Calculate average per subject
  const subjectAverages = mapel.map(m => {
    const scores = nilai.filter(n => n.mapelId === m.id);
    const avg = scores.length > 0 
      ? Number((scores.reduce((sum, current) => sum + current.nilaiSimulasi, 0) / scores.length).toFixed(1))
      : 0;
    return {
      nama: m.nama,
      kode: m.kode,
      avg,
      count: scores.length
    };
  });

  return (
    <div className="space-y-6" id="dashboard-container">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-5 rounded-xl shadow-sm relative overflow-hidden" id="welcome-banner">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
        <div className="relative z-10 space-y-1.5">
          <span className="bg-blue-500/30 text-blue-100 text-[10px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider">
            High Density Dashboard v2.4.0
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">Selamat Datang di Portal PKBM Armilla</h1>
          <p className="text-blue-50/90 text-xs max-w-xl leading-relaxed">
            Sistem Informasi Manajemen Institusi Pendidikan Kesetaraan yang andal, aman, dan modular. 
            Kelola data akademis, tenaga pengajar, pendaftaran PPDB, serta nilai simulasi UNBK secara tersentralisasi.
          </p>
        </div>
      </div>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="kpi-grid">
        {/* KPI: Siswa */}
        <div 
          onClick={() => onNavigate("siswa")}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition duration-150 cursor-pointer group"
          id="kpi-siswa"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Siswa Aktif</span>
            <div className="bg-blue-50 text-blue-600 p-2.5 rounded group-hover:bg-blue-600 group-hover:text-white transition duration-150">
              <Users size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-slate-800 font-mono leading-none">{stats.totalSiswa}</span>
              <span className="text-green-500 text-xs font-medium mb-0.5">Siswa</span>
            </div>
          </div>
        </div>

        {/* KPI: Guru */}
        <div 
          onClick={() => onNavigate("guru")}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition duration-150 cursor-pointer group"
          id="kpi-guru"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Guru Aktif</span>
            <div className="bg-blue-50 text-blue-600 p-2.5 rounded group-hover:bg-blue-600 group-hover:text-white transition duration-150">
              <GraduationCap size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-slate-800 font-mono leading-none">{stats.totalGuru}</span>
              <span className="text-slate-400 text-xs font-medium mb-0.5">Tetap</span>
            </div>
          </div>
        </div>

        {/* KPI: Rata-Rata UNBK */}
        <div 
          onClick={() => onNavigate("nilai")}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition duration-150 cursor-pointer group"
          id="kpi-unbk"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rata-Rata UNBK</span>
            <div className="bg-blue-50 text-blue-600 p-2.5 rounded group-hover:bg-blue-600 group-hover:text-white transition duration-150">
              <Award size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-slate-800 font-mono leading-none">{stats.averageNilaiAkhir}</span>
              <span className="text-amber-500 text-xs font-medium mb-0.5">Simulasi</span>
            </div>
          </div>
        </div>

        {/* KPI: PPDB */}
        <div 
          onClick={() => onNavigate("ppdb")}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition duration-150 cursor-pointer group"
          id="kpi-ppdb"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pendaftar Baru</span>
            <div className="bg-blue-50 text-blue-600 p-2.5 rounded group-hover:bg-blue-600 group-hover:text-white transition duration-150">
              <FileText size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-slate-800 font-mono leading-none">{stats.totalPPDB}</span>
              <span className="text-blue-500 text-xs font-medium mb-0.5">PPDB 2026</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts & Statistics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-statistics">
        {/* Performance Chart per Subject */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4" id="performance-chart-card">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-bold text-slate-800">Statistik Nilai Rata-rata Mapel</h2>
              <p className="text-[11px] text-slate-500">Nilai rata-rata simulasi ujian UNBK siswa terdaftar</p>
            </div>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded font-mono">
              UNBK 2026
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {subjectAverages.map((m, index) => {
              const kkm = mapel.find(item => item.nama === m.nama)?.kkm || 70;
              const isAboveKKM = m.avg >= kkm;
              return (
                <div key={index} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      {m.nama} ({m.kode})
                    </span>
                    <span className="text-slate-500 flex items-center gap-2">
                      Rata-rata: <strong className="text-slate-800 font-mono text-xs">{m.avg || "0.0"}</strong>
                      <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-500">KKM: {kkm}</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded overflow-hidden flex">
                    <div 
                      className={`h-full rounded transition-all duration-500 ${isAboveKKM ? 'bg-blue-600' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, Math.max(5, m.avg))}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}

            {subjectAverages.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <BookOpen size={30} className="mx-auto mb-2 opacity-50 text-blue-500" />
                <p className="text-xs">Belum ada data mata pelajaran atau nilai.</p>
              </div>
            )}
          </div>
          
          <div className="bg-slate-50 p-3.5 rounded border border-slate-150 flex items-start gap-2.5 text-[11px] text-slate-600">
            <AlertCircle size={14} className="text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-normal">
              Indikator bar biru menunjukkan nilai rata-rata kelas di atas atau sama dengan KKM. Warna merah mengindikasikan 
              bahwa rata-rata nilai siswa di mata pelajaran tersebut masih berada di bawah target KKM.
            </p>
          </div>
        </div>

        {/* PPDB Funnel & Action Container */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between" id="ppdb-summary-card">
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-800">Aliran Pendaftar PPDB</h2>
              <p className="text-[11px] text-slate-500">Status calon peserta didik tahun ajaran baru</p>
            </div>

            {/* Circle Pipeline Visualizer */}
            <div className="py-1 flex items-center justify-center">
              <div className="relative flex items-center justify-center w-32 h-32">
                {/* Simulated donut chart using simple border trick */}
                <div className="absolute inset-0 rounded-full border-8 border-slate-100"></div>
                <div className="absolute inset-0 rounded-full border-8 border-blue-500 border-t-transparent border-r-transparent animate-spin-slow"></div>
                <div className="absolute inset-0 rounded-full border-8 border-yellow-500 border-b-transparent border-l-transparent" style={{ transform: 'rotate(120deg)' }}></div>
                <div className="z-10 text-center">
                  <span className="text-2xl font-bold text-slate-800 font-mono">
                    {stats.totalPPDB}
                  </span>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pendaftar</p>
                </div>
              </div>
            </div>

            {/* Pipeline list */}
            <div className="space-y-1 text-xs pt-1">
              <div className="flex items-center justify-between p-1.5 rounded hover:bg-slate-50">
                <span className="flex items-center gap-2 text-slate-600 font-medium">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  Pemeriksaan Berkas
                </span>
                <span className="font-bold text-slate-800 font-mono">{stats.ppdbStatus.pending}</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded hover:bg-slate-50">
                <span className="flex items-center gap-2 text-slate-600 font-medium">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Dinyatakan Diterima
                </span>
                <span className="font-bold text-slate-800 font-mono">{stats.ppdbStatus.diterima}</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded hover:bg-slate-50">
                <span className="flex items-center gap-2 text-slate-600 font-medium">
                  <span className="w-2 h-2 rounded-full bg-red-400"></span>
                  Pendaftaran Ditolak
                </span>
                <span className="font-bold text-slate-800 font-mono">{stats.ppdbStatus.ditolak}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => onNavigate("ppdb")}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded transition flex items-center justify-center gap-1.5"
          >
            Selesaikan Seleksi PPDB <ArrowUpRight size={14} />
          </button>
        </div>
      </div>

      {/* Bottom Row: Recent Activities & System Integrations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-system">
        {/* Recent Platform Activities */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-3 flex flex-col justify-between" id="recent-activities-card">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
              <h2 className="font-bold text-slate-800 flex items-center gap-1.5">
                <Clock size={16} className="text-slate-400" />
                Aktivitas Sistem Terkini
              </h2>
              <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold font-mono">Live Logs</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[160px] overflow-y-auto pr-1">
              {stats.recentActivities.map((act, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between first:pt-0 last:pb-0 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    <span className="text-slate-700">{act.message}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">{act.time}</span>
                </div>
              ))}
              {stats.recentActivities.length === 0 && (
                <div className="text-center py-6 text-slate-400 text-xs">
                  Belum ada aktivitas tercatat.
                </div>
              )}
            </div>
          </div>
          
          <button 
            onClick={() => onNavigate("ppdb")}
            className="w-full py-2 mt-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded text-xs font-medium"
          >
            Lihat Semua Pendaftar
          </button>
        </div>

        {/* Senior DevOps Specs */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between" id="devops-specs-card">
          <div className="space-y-4">
            <div className="border-b border-slate-150 pb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">Infrastructure</h2>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] border border-blue-200 font-bold uppercase tracking-wider font-mono">
                DOCKER COMPOSE
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">PostgreSQL Database</span>
                  <span className="text-[11px] text-green-600 font-bold uppercase font-mono">Online : 5432</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-green-500 h-full rounded-full" style={{ width: '82%' }}></div>
                </div>
              </div>
              
              <div className="flex justify-between items-center text-slate-500 text-[11px]">
                <span>Storage Used</span>
                <span className="font-mono font-semibold text-slate-700">14.2 GB / 50 GB</span>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Environment</span>
                  <span className="font-mono text-slate-700">Production</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">REST API Engine</span>
                  <span className="font-mono text-slate-700">Node/Express</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Microservice Ports</span>
                  <span className="font-mono text-blue-600">3000 (React + API)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
            <span className="font-mono">CORS: ENABLED</span>
            <span className="text-blue-600 font-bold font-mono">NEXT / EXPRESS / SQL</span>
          </div>
        </div>
      </div>
    </div>
  );
}
