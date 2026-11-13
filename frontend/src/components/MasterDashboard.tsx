import { useEffect, useState } from "react";
import {
  BarChart3, Bell, Building2, ClipboardList, CreditCard, Database, LayoutDashboard,
  LogOut, Menu, ShieldCheck, Target, UsersRound, WalletCards, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MasterSchools } from "./MasterSchools";
import { MasterSchoolRegistrations } from "./MasterSchoolRegistrations";

type MenuItem = { id: string; label: string; icon: LucideIcon; description: string };

const menuItems: MenuItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Ringkasan platform dan akses ke pengelolaan lembaga." },
  { id: "verifikasi", label: "Verifikasi Sekolah", icon: ShieldCheck, description: "Tinjau permohonan pendaftaran lembaga." },
  { id: "tenant", label: "Kelola Tenant", icon: Building2, description: "Kelola lembaga yang menggunakan platform." },
  { id: "pembayaran", label: "Semua Pembayaran", icon: WalletCards, description: "Pantau pembayaran dan transaksi platform." },
  { id: "rekening", label: "Rekening Bank", icon: CreditCard, description: "Kelola rekening untuk pembayaran." },
  { id: "prospek", label: "CRM Prospek", icon: Target, description: "Kelola informasi calon pelanggan." },
  { id: "afiliasi", label: "Kelola Afiliasi", icon: UsersRound, description: "Kelola mitra dan program afiliasi." },
  { id: "pengumuman", label: "Kelola Pengumuman", icon: Bell, description: "Kelola pengumuman untuk lembaga." },
  { id: "audit", label: "Audit Log", icon: ClipboardList, description: "Tinjau aktivitas administrasi platform." },
  { id: "analitik", label: "Analytics Sistem", icon: BarChart3, description: "Pantau informasi penggunaan platform." },
  { id: "pendaftar", label: "Rekap Pendaftar", icon: Database, description: "Lihat rekap pendaftaran lembaga." },
];

interface MasterDashboardProps {
  name: string;
  error: string;
  onLogout: () => void;
}

export function MasterDashboard({ name, error, onLogout }: MasterDashboardProps) {
  const [activeId, setActiveId] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [summary, setSummary] = useState<{ sekolah: number; adminSekolah: number } | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const active = menuItems.find((item) => item.id === activeId) ?? menuItems[0];
  const ActiveIcon = active.icon;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/master/summary", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : "Ringkasan tidak tersedia. Muat ulang halaman untuk mencoba kembali.");
      const data: unknown = await response.json();
      if (typeof data !== "object" || data === null || !("sekolah" in data) || !("adminSekolah" in data) || typeof data.sekolah !== "number" || typeof data.adminSekolah !== "number") {
        throw new Error("Respons ringkasan tidak valid.");
      }
      setSummary({ sekolah: data.sekolah, adminSekolah: data.adminSekolah });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        console.error("Gagal memuat ringkasan:", error);
        setSummaryError(error instanceof Error ? error.message : "Ringkasan tidak tersedia.");
      }
    });
    return () => controller.abort();
  }, []);

  function selectMenu(id: string) {
    setActiveId(id);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#f7f6f1] text-[#142137]">
      {menuOpen && <button type="button" onClick={() => setMenuOpen(false)} aria-label="Tutup menu" className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-[#0c192d] text-white transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-start justify-between border-b border-white/15 px-6 py-6">
          <div><p className="text-sm font-extrabold">Rasyatech Digital Zenith</p><p className="mt-1 text-xs text-slate-400">Platform Pendidikan</p></div>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Tutup menu" className="lg:hidden"><X size={20} /></button>
        </div>
        <nav aria-label="Menu master admin" className="flex-1 overflow-y-auto px-3 py-5">
          <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#dfc18d]">Master Admin</p>
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const selected = activeId === item.id;
              return <button type="button" key={item.id} onClick={() => selectMenu(item.id)} aria-current={selected ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${selected ? "bg-[#dfc18d] text-[#132038] shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}><Icon size={19} className="shrink-0" /><span>{item.label}</span></button>;
            })}
          </div>
        </nav>
        <button type="button" onClick={onLogout} className="mx-4 mb-5 flex items-center gap-3 rounded-xl border border-white/20 px-3 py-3 text-sm font-semibold hover:bg-white/10"><LogOut size={18} /> Keluar</button>
      </aside>
      <div className="lg:ml-72">
        <header className="flex min-h-20 items-center justify-between gap-4 border-b border-[#e6dfd0] bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3"><button type="button" onClick={() => setMenuOpen(true)} aria-label="Buka menu" className="rounded-xl border border-[#e6dfd0] p-2 text-[#142137] lg:hidden"><Menu size={21} /></button><div><p className="text-xs font-bold uppercase tracking-wider text-[#80643a]">Panel Platform</p><p className="mt-0.5 text-sm font-semibold text-slate-600">Master Admin</p></div></div>
          <div className="flex items-center gap-3 rounded-xl border border-[#e6dfd0] px-3 py-2"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dfc18d] font-bold text-[#132038]">{name.trim().charAt(0).toUpperCase() || "M"}</span><div className="min-w-0"><p className="max-w-36 truncate text-sm font-bold sm:max-w-56">{name}</p><p className="text-[10px] font-bold uppercase tracking-wide text-[#80643a]">Master Admin</p></div></div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
          {error && <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
          <div className="rounded-3xl border border-[#e6dfd0] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#80643a]">Rasyatech Digital Zenith</p><h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{activeId === "dashboard" ? `Selamat datang, ${name}` : active.label}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{active.description}</p></div><span className="rounded-2xl bg-[#0c192d] p-4 text-[#dfc18d]"><ActiveIcon size={26} /></span></div>
          </div>
          {activeId === "dashboard" ? (
            <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2" aria-live="polite">
              {summaryError ? <p role="alert" className="text-sm text-rose-700">{summaryError}</p> : summary ? <>
                <div className="rounded-2xl border border-[#e6dfd0] bg-white p-6"><p className="text-sm text-slate-600">Sekolah tercatat</p><p className="mt-2 text-3xl font-bold">{summary.sekolah}</p></div>
                <div className="rounded-2xl border border-[#e6dfd0] bg-white p-6"><p className="text-sm text-slate-600">Akun admin sekolah tercatat</p><p className="mt-2 text-3xl font-bold">{summary.adminSekolah}</p></div>
              </> : <p className="text-sm text-slate-600">Memuat ringkasan...</p>}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {menuItems.slice(1, 4).map((item) => {
                const Icon = item.icon;
                return <button key={item.id} type="button" onClick={() => selectMenu(item.id)} className="rounded-2xl border border-[#e6dfd0] bg-white p-6 text-left shadow-sm transition hover:border-[#d6bb87]"><Icon size={22} className="text-[#80643a]" /><h2 className="mt-5 font-bold">{item.label}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p><p className="mt-4 text-xs font-semibold text-[#80643a]">{item.id === "tenant" ? "Daftar sekolah tersedia" : item.id === "verifikasi" ? "Pemeriksaan tersedia untuk uji lokal" : "Belum tersedia"}</p></button>;
              })}
            </div>
            </>
          ) : activeId === "tenant" ? <MasterSchools /> : activeId === "verifikasi" || activeId === "pendaftar" ? <MasterSchoolRegistrations /> : (
            <div className="mt-6 rounded-2xl border border-[#d6bb87] bg-[#f8f6ef] p-6" role="status"><h2 className="font-bold text-[#142137]">Fitur belum tersedia</h2><p className="mt-2 text-sm leading-6 text-slate-600">Menu ini masih dalam pengembangan dan belum terhubung ke data. Tidak ada perubahan data yang dilakukan.</p><button type="button" onClick={() => selectMenu("dashboard")} className="mt-5 text-sm font-bold text-[#80643a] hover:underline">Kembali ke dashboard</button></div>
          )}
        </main>
      </div>
    </div>
  );
}
