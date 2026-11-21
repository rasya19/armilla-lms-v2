import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3, Bell, Building2, CalendarDays, ClipboardList, CreditCard, Database,
  FileText, GraduationCap, Landmark, LayoutDashboard, LogOut, MoreHorizontal, Search, Settings,
  ShieldCheck, Target, UsersRound, WalletCards, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MasterDinasPanel, MasterGlobalThemePanel, MasterSchools } from "./MasterSchools";
import { MasterSchoolRegistrations } from "./MasterSchoolRegistrations";
import { CardGridSkeleton, TableSkeleton } from "./DashboardUI";
import { getCached, setCached } from "./schoolCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type MenuItem = { id: string; label: string; icon: LucideIcon; description: string };
const menuItems: MenuItem[] = [
  { id: "dashboard", label: "Ringkasan", icon: LayoutDashboard, description: "Ikhtisar aktivitas platform." },
  { id: "verifikasi", label: "Pendaftaran Sekolah", icon: ClipboardList, description: "Tinjau permohonan pendaftaran lembaga." },
  { id: "tenant", label: "Kelola Tenant", icon: Building2, description: "Kelola tenant, paket langganan, dan sinkronisasi ke LMS." },
  { id: "dinas", label: "Dinas Wilayah", icon: Landmark, description: "Kelola akun verifikator Dinas Pendidikan & akses portal wilayah." },
  { id: "linimasa", label: "Linimasa", icon: CalendarDays, description: "Linimasa pendaftaran lembaga." },
  { id: "tim", label: "Tim Admin", icon: UsersRound, description: "Kelola tim administrasi." },
  { id: "berkas", label: "Berkas", icon: FileText, description: "Kelola berkas platform." },
  { id: "pembayaran", label: "Semua Pembayaran", icon: WalletCards, description: "Pantau pembayaran dan transaksi platform." },
  { id: "anggaran", label: "Anggaran", icon: CreditCard, description: "Kelola anggaran platform." },
  { id: "pengaturan", label: "Pengaturan", icon: Settings, description: "Pengaturan platform." },
  { id: "rekening", label: "Rekening Bank", icon: CreditCard, description: "Kelola rekening untuk pembayaran." },
  { id: "prospek", label: "CRM Prospek", icon: Target, description: "Kelola informasi calon pelanggan." },
  { id: "afiliasi", label: "Kelola Afiliasi", icon: UsersRound, description: "Kelola mitra dan program afiliasi." },
  { id: "pengumuman", label: "Kelola Pengumuman", icon: Bell, description: "Kelola pengumuman untuk lembaga." },
  { id: "audit", label: "Audit Log", icon: ShieldCheck, description: "Tinjau aktivitas administrasi platform." },
  { id: "analitik", label: "Analytics Sistem", icon: BarChart3, description: "Pantau informasi penggunaan platform." },
  { id: "pendaftar", label: "Rekap Pendaftar", icon: Database, description: "Lihat rekap pendaftaran lembaga." },
];

type Registration = { id: string; namaSekolah: string; npsn: string | null; status: "MENUNGGU" | "DISETUJUI" | "DITOLAK"; dibuatPada: string };
type School = { id: string; nama: string; slug: string; npsn: string | null };
type Overview = { registrations: Registration[]; schools: School[]; moreRegistrations: boolean; moreSchools: boolean; schoolCount: number; adminCount: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOverview(registrations: unknown, schools: unknown, summary: unknown): Overview {
  if (!isRecord(registrations) || !Array.isArray(registrations.pendaftaran) || typeof registrations.hasNext !== "boolean" ||
      !isRecord(schools) || !Array.isArray(schools.sekolah) || typeof schools.hasNext !== "boolean" ||
      !isRecord(summary) || typeof summary.sekolah !== "number" || typeof summary.adminSekolah !== "number") throw new Error("Respons ringkasan tidak valid.");
  const rows: Registration[] = registrations.pendaftaran.map((row: unknown) => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.namaSekolah !== "string" ||
        (row.npsn !== null && typeof row.npsn !== "string") ||
        (row.status !== "MENUNGGU" && row.status !== "DISETUJUI" && row.status !== "DITOLAK") ||
        typeof row.dibuatPada !== "string" || Number.isNaN(Date.parse(row.dibuatPada))) throw new Error("Data pendaftaran tidak valid.");
    return { id: row.id, namaSekolah: row.namaSekolah, npsn: typeof row.npsn === "string" ? row.npsn : null, status: row.status, dibuatPada: row.dibuatPada };
  });
  const institutions: School[] = schools.sekolah.map((row: unknown) => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.nama !== "string" ||
        typeof row.slug !== "string" || (row.npsn !== null && typeof row.npsn !== "string")) throw new Error("Data sekolah tidak valid.");
    return { id: row.id, nama: row.nama, slug: row.slug, npsn: typeof row.npsn === "string" ? row.npsn : null };
  });
  return { registrations: rows, schools: institutions, moreRegistrations: registrations.hasNext, moreSchools: schools.hasNext, schoolCount: summary.sekolah, adminCount: summary.adminSekolah };
}

const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

function OverviewPanel({ search, selectMenu, showBoard }: { search: string; selectMenu: (id: string) => void; showBoard: boolean }) {
  const cacheKey = "/api/master/overview";
  const [data, setData] = useState<Overview | null>(() => getCached<Overview>(cacheKey));
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<Overview>(cacheKey);
    if (cached) setData(cached);
    Promise.all([
      fetchWithTimeout("/api/master/pendaftaran-sekolah?page=1", { signal: controller.signal }),
      fetchWithTimeout("/api/master/sekolah?page=1", { signal: controller.signal }),
      fetchWithTimeout("/api/master/summary", { signal: controller.signal }),
    ]).then(async ([registrations, schools, summary]) => {
      if (!registrations.ok || !schools.ok || !summary.ok) throw new Error(registrations.status === 401 || schools.status === 401 || summary.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : "Data ringkasan tidak tersedia. Coba muat ulang halaman.");
      const [registrationData, schoolData, summaryData]: unknown[] = await Promise.all([registrations.json(), schools.json(), summary.json()]);
      const parsed = parseOverview(registrationData, schoolData, summaryData);
      setCached(cacheKey, parsed);
      setData(parsed);
    }).catch((reason: unknown) => {
      if (!isCallerAborted(reason, controller.signal) && !cached) {
        setError(describeFetchError(reason, "Data ringkasan tidak tersedia."));
      }
    });
    return () => controller.abort();
  }, []);

  const query = search.trim().toLocaleLowerCase("id-ID");
  const registrations = data?.registrations.filter((item) => `${item.namaSekolah} ${item.npsn ?? ""}`.toLocaleLowerCase("id-ID").includes(query)) ?? [];
  const schools = data?.schools.filter((item) => `${item.nama} ${item.slug} ${item.npsn ?? ""}`.toLocaleLowerCase("id-ID").includes(query)) ?? [];
  const waiting = registrations.filter((item) => item.status === "MENUNGGU");
  const approved = registrations.filter((item) => item.status === "DISETUJUI");
  const rejected = registrations.filter((item) => item.status === "DITOLAK");

  const registrationCard = (item: Registration, label: string, color: string) => <button key={item.id} type="button" onClick={() => selectMenu("verifikasi")} className="master-card w-full text-left">
    <span className={`master-badge ${color}`}>{label}</span>
    <strong className="mt-3 block text-sm leading-5 text-white">{item.namaSekolah}</strong>
    <span className="mt-3 block text-xs text-slate-400">{item.npsn ? `NPSN ${item.npsn}` : "NPSN belum diisi"}</span>
    <span className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><CalendarDays size={13} /> {dateFormat.format(new Date(item.dibuatPada))}</span>
  </button>;

  return <>
    {showBoard && <section className="master-section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="master-eyebrow">ALUR LEMBAGA</p><h2 className="mt-2 text-xl font-bold text-white">Panel Pendaftaran Sekolah</h2><p className="mt-1 text-sm text-slate-400">Ikhtisar pendaftaran dan lembaga yang tercatat.</p></div>
        <button type="button" onClick={() => selectMenu("verifikasi")} className="master-outline">Lihat semua pendaftaran <span aria-hidden="true">→</span></button>
      </div>
      {error ? <p role="alert" className="mt-6 text-sm text-rose-300">{error}</p> : !data ? <CardGridSkeleton count={4} columns={4} /> : <>
        <div className="master-metrics mt-5 flex flex-wrap gap-3 text-xs text-slate-300"><span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><strong className="text-white">{data.schoolCount}</strong> sekolah tercatat</span><span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><strong className="text-white">{data.adminCount}</strong> akun admin sekolah</span><span className="master-mobile-metric rounded-lg border border-white/10 bg-white/5 px-3 py-2"><strong className="text-white">{data.registrations.filter((item) => item.status === "MENUNGGU").length}</strong> menunggu <small>(25 terbaru)</small></span></div>
        <p className="mt-5 text-xs text-slate-400">Menampilkan hingga 25 pendaftaran dan 25 lembaga terbaru. Pencarian hanya mencakup data ini{data.moreRegistrations || data.moreSchools ? "; buka daftar lengkap untuk halaman lainnya" : ""}.</p>
        <div className="master-board mt-5">
          <div className="master-column"><div className="master-column-title"><span>Pendaftaran Masuk</span><span>{waiting.length}</span></div><div className="space-y-3">{waiting.map((item) => registrationCard(item, "MENUNGGU", "master-badge-blue"))}{waiting.length === 0 && <p className="master-empty">Tidak ada pendaftaran menunggu.</p>}</div></div>
          <div className="master-column"><div className="master-column-title"><span>Proses Verifikasi</span><span>—</span></div><p className="master-empty">Tahap verifikasi terpisah belum tersedia.</p></div>
          <div className="master-column"><div className="master-column-title"><span>Hasil Pemeriksaan</span><span>{approved.length + rejected.length}</span></div><div className="space-y-3">{approved.map((item) => registrationCard(item, "DISETUJUI", "master-badge-purple"))}{rejected.map((item) => registrationCard(item, "DITOLAK", "master-badge-rose"))}{approved.length + rejected.length === 0 && <p className="master-empty">Belum ada hasil pemeriksaan.</p>}</div></div>
          <div className="master-column"><div className="master-column-title"><span>Lembaga Terdaftar</span><span>{schools.length}</span></div><div className="space-y-3">{schools.map((school) => <button type="button" key={school.id} onClick={() => selectMenu("tenant")} className="master-card w-full text-left"><span className="master-badge master-badge-green">TERCATAT</span><strong className="mt-3 block text-sm text-white">{school.nama}</strong><span className="mt-3 block break-all text-xs text-slate-400">Slug: {school.slug}</span><span className="mt-2 block text-xs text-slate-400">{school.npsn ? `NPSN ${school.npsn}` : "NPSN belum diisi"}</span></button>)}{schools.length === 0 && <p className="master-empty">Tidak ada lembaga tercatat.</p>}</div><p className="mt-3 text-xs leading-5 text-slate-500">Status aktif belum ditampilkan.</p></div>
        </div>
      </>}
    </section>}
    <section className="master-section" id="linimasa-pendaftaran">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="master-eyebrow">AKTIVITAS LEMBAGA</p><h2 className="mt-2 text-xl font-bold text-white">Linimasa Pendaftaran</h2><p className="mt-1 text-sm text-slate-400">Tanggal masuk dari pendaftaran terbaru.</p></div><button type="button" onClick={() => selectMenu("verifikasi")} className="master-outline">Buka pendaftaran <span aria-hidden="true">→</span></button></div>
      <p className="mt-5 text-xs leading-5 text-slate-400">Tanggal verifikasi, persetujuan, dan aktivasi per tahap belum tersedia untuk linimasa. Tanggal di bawah adalah tanggal pendaftaran, bukan durasi proses.</p>
      {error ? <p className="mt-5 text-sm text-rose-300">{error}</p> : !data ? <TableSkeleton rows={4} columns={3} /> : registrations.length === 0 ? <p className="master-empty mt-5">Tidak ada pendaftaran untuk ditampilkan.</p> : <div className="mt-5 divide-y divide-white/10">{registrations.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div className="flex min-w-0 items-center gap-3"><span className="h-2 w-2 shrink-0 rounded-full bg-indigo-400" /><span className="truncate font-medium text-slate-200">{item.namaSekolah}</span></div><div className="flex items-center gap-4 text-xs text-slate-400"><span>{item.status === "MENUNGGU" ? "Menunggu" : item.status === "DISETUJUI" ? "Disetujui" : "Ditolak"}</span><time dateTime={item.dibuatPada}>{dateFormat.format(new Date(item.dibuatPada))}</time></div></div>)}</div>}
    </section>
  </>;
}

interface MasterDashboardProps { name: string; error: string; onLogout: () => void }

export function MasterDashboard({ name, error, onLogout }: MasterDashboardProps) {
  const [activeId, setActiveId] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const active = menuItems.find((item) => item.id === activeId) ?? menuItems[0];
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "M";
  const mobileItems = menuItems.filter((item) => ["dashboard", "verifikasi", "tenant"].includes(item.id));
  function selectMenu(id: string) { setActiveId(id); setMenuOpen(false); }

  return <div className="master-shell master-dashboard">
    {menuOpen && <button type="button" onClick={() => setMenuOpen(false)} aria-label="Tutup menu" className="fixed inset-0 z-30 bg-slate-950/70 md:hidden" />}
    <aside id="master-menu" className={`master-sidebar ${menuOpen ? "master-sidebar-open" : ""}`}>
      <div className="flex items-center justify-between gap-3 px-3 pb-7 pt-2"><div className="flex items-center gap-3"><span className="master-logo"><GraduationCap size={21} /></span><div><p className="font-bold tracking-tight text-white">Kesetaraan LMS</p><p className="mt-0.5 text-[11px] text-slate-400">PANEL PLATFORM</p></div></div><button type="button" onClick={() => setMenuOpen(false)} aria-label="Tutup menu" className="text-slate-300 md:hidden"><X size={20} /></button></div>
      <p className="px-3 pb-3 text-[10px] font-bold tracking-[0.18em] text-slate-500">MENU UTAMA</p>
      <nav aria-label="Menu master admin" className="min-h-0 flex-1 space-y-1 overflow-y-auto">{menuItems.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => selectMenu(item.id)} aria-current={activeId === item.id ? "page" : undefined} className={`master-nav-item ${activeId === item.id ? "master-nav-active" : ""}`}><Icon size={18} /><span>{item.label}</span></button>; })}</nav>
      <div className="master-profile"><span className="master-avatar">{initials}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{name}</p><p className="mt-1 text-xs text-slate-400">Master Admin <span className="text-emerald-400">●</span> Online</p></div><button type="button" onClick={onLogout} aria-label="Keluar" title="Keluar" className="text-slate-400 hover:text-white"><LogOut size={18} /></button></div>
    </aside>
    <main className="master-main">
      <header className="master-header"><div className="flex min-w-0 items-start gap-3"><div><p className="master-eyebrow">WORKSPACE / MASTER ADMIN</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{activeId === "dashboard" ? "LMS Kesetaraan - Master Admin" : active.label}</h1><p className="mt-2 text-sm leading-6 text-slate-400">{activeId === "dashboard" ? `Selamat datang kembali, ${name} — ikhtisar panel platform.` : active.description}</p></div></div>
        <div className="master-mobile-profile"><span className="master-avatar">{initials}</span><div><strong>{name}</strong><span>● Online · Master Admin</span></div></div>
        <div className="flex flex-wrap items-center gap-2"><label className="master-search"><Search size={16} /><span className="sr-only">Cari di ringkasan</span><input value={search} onChange={(event) => { setSearch(event.target.value); setActiveId("dashboard"); }} placeholder="Cari di ringkasan..." /></label><Link to="/daftar" className="master-primary">+ Pendaftaran Baru</Link></div>
      </header>
      {error && <p role="alert" className="mx-5 mt-5 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p>}
      <div className="master-content">
        {activeId === "dashboard" || activeId === "linimasa" ? <OverviewPanel search={search} selectMenu={selectMenu} showBoard={activeId === "dashboard"} /> :
          activeId === "tenant" ? <MasterSchools /> :
          activeId === "dinas" ? <MasterDinasPanel /> :
          activeId === "pengaturan" ? <MasterGlobalThemePanel /> :
          activeId === "verifikasi" || activeId === "pendaftar" ? <MasterSchoolRegistrations /> :
          <section className="master-section"><h2 className="text-lg font-bold text-white">Fitur belum tersedia</h2><p className="mt-2 text-sm leading-6 text-slate-400">Menu ini masih dalam pengembangan dan belum terhubung ke data. Tidak ada perubahan data yang dilakukan.</p><button type="button" onClick={() => selectMenu("dashboard")} className="mt-5 text-sm font-semibold text-indigo-300 hover:text-white">Kembali ke ringkasan →</button></section>}
      </div>
    </main>
    <nav className="master-mobile-nav" aria-label="Navigasi bawah master admin">
      {mobileItems.map((item) => { const Icon = item.icon; const labels: Record<string, string> = { dashboard: "Ringkasan", verifikasi: "Verifikasi", tenant: "Tenant" }; return <button key={item.id} type="button" onClick={() => selectMenu(item.id)} aria-current={activeId === item.id ? "page" : undefined} className={activeId === item.id ? "master-mobile-active" : ""}><Icon size={20} /><span>{labels[item.id]}</span></button>; })}
      <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-controls="master-menu" aria-expanded={menuOpen} className={menuOpen || !mobileItems.some((item) => item.id === activeId) ? "master-mobile-active" : ""}><MoreHorizontal size={20} /><span>Lainnya</span></button>
    </nav>
  </div>;
}
