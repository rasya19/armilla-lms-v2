import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowRight, BookOpen, Building2, Check, Eye, GraduationCap,
  LogIn, Menu, Sparkles, Users, X, LockKeyhole,
} from 'lucide-react';
import { SUBSCRIPTION_PLANS } from './subscriptionPlans';
import { fetchWithTimeout, isCallerAborted } from './fetchWithTimeout';

const programs = [
  { name: 'Administrasi', level: 'Data lembaga', number: '01', description: 'Kelola data siswa, guru, dan kelas di sekolah Anda.' },
  { name: 'Pembelajaran', level: 'Kegiatan belajar', number: '02', description: 'Kelola jadwal, materi, dan tugas untuk kegiatan belajar.' },
  { name: 'Evaluasi', level: 'Hasil belajar', number: '03', description: 'Guru dapat memberi nilai dan komentar pada pengumpulan tugas.' },
];

type PublicStats = { totalVisitors: number; totalSchools: number };

export const LandingPage: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const masterClicks = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    fetchWithTimeout('/api/public/stats', { method: 'POST', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (
          typeof data === 'object' &&
          data !== null &&
          'totalVisitors' in data &&
          typeof data.totalVisitors === 'number' &&
          'totalSchools' in data &&
          typeof data.totalSchools === 'number'
        ) {
          setStats({ totalVisitors: data.totalVisitors, totalSchools: data.totalSchools });
        }
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          // Public stats remain graceful fallback "—"
        }
      });
    return () => controller.abort();
  }, []);

  const openMasterLogin = () => {
    masterClicks.current += 1;
    if (masterClicks.current === 5) {
      masterClicks.current = 0;
      navigate('/master/login');
    }
  };

  const nav = (
    <>
      <a href="#profil" onClick={() => setMenuOpen(false)}>Tentang</a>
      <a href="#program" onClick={() => setMenuOpen(false)}>Fitur</a>
      <a href="#paket" onClick={() => setMenuOpen(false)}>Paket</a>
      <a href="#registrasi" onClick={() => setMenuOpen(false)}>Mitra</a>
    </>
  );

  return (
    <div className="landing-page min-h-screen text-[#142137]">
      <header className="landing-header sticky top-0 z-40 text-[#1d2d49]">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
          <a href="#" className="flex items-center gap-3" aria-label="Rasyatech Digital Zenith, kembali ke beranda">
            <span className="master-logo">
              <BookOpen size={22} />
            </span>
            <span><span className="block text-sm font-bold tracking-tight sm:text-base">Rasyatech Digital Zenith</span><span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">Platform pendidikan</span></span>
          </a>
          <nav aria-label="Navigasi utama" className="hidden items-center gap-7 text-sm font-medium text-slate-700 lg:flex">{nav}</nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="landing-secondary hidden items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition sm:flex"><LogIn size={15} /> Masuk LMS</Link>
            <Link to="/daftar" className="landing-primary hidden rounded-full px-5 py-2.5 text-sm font-bold transition md:block">Daftar lembaga</Link>
            <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'} aria-expanded={menuOpen} className="rounded-lg p-2 text-slate-800 lg:hidden">{menuOpen ? <X size={23} /> : <Menu size={23} />}</button>
          </div>
        </div>
        {menuOpen && <nav aria-label="Navigasi seluler" className="flex flex-col gap-5 border-t border-slate-300/50 px-6 py-6 text-sm font-semibold text-slate-800 lg:hidden">{nav}<Link to="/login" onClick={() => setMenuOpen(false)}>Masuk LMS</Link><Link to="/daftar" onClick={() => setMenuOpen(false)} className="text-indigo-800">Daftar lembaga <ArrowRight size={15} className="inline" /></Link></nav>}
      </header>

      <main>
        <section className="landing-hero relative overflow-hidden">
          <div aria-hidden="true" className="absolute -right-36 -top-56 h-[650px] w-[650px] rounded-full border border-white/40" />
          <div aria-hidden="true" className="absolute -right-16 top-4 h-[450px] w-[450px] rounded-full border border-white/40" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-16 pt-16 sm:px-8 md:pb-20 md:pt-24 lg:grid-cols-[1.05fr_.95fr] lg:gap-20">
            <div className="glass-panel rounded-3xl p-6 sm:p-10">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-800"><span className="h-px w-8 bg-indigo-600" /> Pendidikan untuk semua</span>
              <h1 className="mt-7 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-[-0.04em] sm:text-6xl lg:text-[4.3rem]">Ruang digital untuk pendidikan yang terus bertumbuh.</h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-slate-700 sm:text-lg">Platform pendidikan untuk membantu berbagai lembaga mengelola administrasi dan kegiatan belajar dalam satu tempat.</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#paket" className="landing-primary inline-flex items-center gap-4 rounded-full px-6 py-4 text-sm font-bold transition">Lihat paket langganan <ArrowRight size={17} /></a>
                <a href="#program" className="landing-secondary inline-flex items-center gap-3 rounded-full px-6 py-4 text-sm font-semibold transition">Jelajahi fitur <ArrowDown size={16} /></a>
              </div>
              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-indigo-800">Total Pengunjung</span>
                    <Eye size={16} className="text-indigo-700" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-[#142137]" data-testid="stat-visitors">
                    {stats ? stats.totalVisitors.toLocaleString('id-ID') : '—'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">Kunjungan ke beranda platform</p>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-indigo-800">Lembaga Bergabung</span>
                    <Building2 size={16} className="text-indigo-700" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-[#142137]" data-testid="stat-schools">
                    {stats ? stats.totalSchools.toLocaleString('id-ID') : '—'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">Sekolah & PKBM aktif terdaftar</p>
                </div>
              </div>
              <div className="mt-7 flex items-center gap-3 text-xs text-slate-700"><Sparkles size={16} className="text-indigo-700" /> Belajar hari ini, bertumbuh untuk esok.</div>
            </div>
            <div className="relative mx-auto w-full max-w-[500px]">
              <div className="absolute -inset-5 rounded-[2rem] border border-white/10" aria-hidden="true" />
              <div className="glass-panel relative overflow-hidden rounded-[1.5rem] p-5 text-[#142137] sm:p-8">
                <div className="relative min-h-[310px] overflow-hidden rounded-xl bg-[#c4d5ef] sm:min-h-[360px]">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#e7efff] via-[#b9c9f0] to-[#aaa8e6]" />
                  <div className="absolute -right-8 -top-20 h-80 w-80 rounded-full border-[40px] border-white/20" />
                  <div className="absolute bottom-0 left-0 right-0 h-40 bg-[#122a39]/10" />
                  <div className="absolute left-7 top-8 text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-900">Ruang untuk bertumbuh</div>
                  <div className="glass-panel absolute bottom-9 left-7 right-7 rounded-2xl p-5">
                    <div className="flex items-center gap-3"><span className="master-logo"><GraduationCap size={24} /></span><div><p className="text-sm font-bold">Platform pendidikan</p><p className="mt-1 text-xs text-slate-700">Langkah baru, kesempatan baru.</p></div></div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 pt-5"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Rasyatech Digital Zenith</p><p className="mt-1 text-sm font-semibold">Mendukung perjalanan pendidikan.</p></div><span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#142137]/20"><ArrowRight size={17} /></span></div>
              </div>
            </div>
          </div>
          <div className="landing-strip border-t border-white/50"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 text-xs font-medium text-slate-700 sm:px-8"><span>Teknologi untuk pendidikan yang lebih terhubung.</span><span className="font-semibold text-indigo-800">Lembaga &nbsp; / &nbsp; Guru &nbsp; / &nbsp; Siswa</span></div></div>
        </section>

        <section id="profil" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
          <div className="glass-panel mx-auto grid max-w-7xl gap-10 rounded-3xl p-6 sm:p-10 md:grid-cols-[.8fr_1.2fr] md:gap-20">
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-800">Tentang kami</p><h2 className="mt-5 max-w-md text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">Setiap orang berhak punya kesempatan belajar.</h2></div>
            <div className="md:pt-8"><p className="max-w-2xl text-base leading-8 text-slate-700">Rasyatech Digital Zenith mengembangkan platform untuk membantu lembaga pendidikan mengelola kegiatan akademik dan mendukung perjalanan belajar di berbagai lingkungan.</p><div className="mt-8 grid gap-5 border-t border-slate-300/70 pt-7 sm:grid-cols-2"><div className="flex gap-3"><BookOpen className="shrink-0 text-indigo-700" size={21} /><div><h3 className="font-bold">Belajar berkelanjutan</h3><p className="mt-1 text-sm leading-6 text-slate-700">Pendidikan sebagai bekal untuk membuka lebih banyak peluang.</p></div></div><div className="flex gap-3"><Users className="shrink-0 text-indigo-700" size={21} /><div><h3 className="font-bold">Tumbuh bersama</h3><p className="mt-1 text-sm leading-6 text-slate-700">Lingkungan belajar yang mendukung perjalanan setiap warga belajar.</p></div></div></div></div>
          </div>
        </section>

        <section id="program" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl"><div className="glass-panel flex flex-col justify-between gap-4 rounded-3xl p-6 sm:flex-row sm:items-end sm:p-10"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-800">Fitur platform</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Dukungan untuk setiap langkah belajar.</h2></div><p className="max-w-sm text-sm leading-6 text-slate-700">Layanan administrasi dan pembelajaran tersedia melalui subdomain masing-masing sekolah.</p></div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">{programs.map(program => <article key={program.name} className="glass-panel group rounded-2xl p-7 transition hover:-translate-y-1 hover:shadow-lg"><div className="flex items-center justify-between"><span className="master-logo"><BookOpen size={22} /></span><span className="text-xs font-semibold tracking-widest text-slate-600">{program.number}</span></div><p className="mt-8 text-xs font-bold uppercase tracking-[0.15em] text-indigo-800">{program.level}</p><h3 className="mt-2 text-2xl font-semibold">{program.name}</h3><p className="mt-3 min-h-[72px] text-sm leading-6 text-slate-700">{program.description}</p></article>)}</div>
          </div>
        </section>

        <section id="paket" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="glass-panel flex flex-col justify-between gap-4 rounded-3xl p-6 sm:flex-row sm:items-end sm:p-10">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-800">Pilihan paket langganan</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Paket sesuai kebutuhan lembaga Anda.</h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-slate-700">Pilih paket langganan untuk memulai pendaftaran lembaga dan aktivasi subdomain sekolah.</p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {SUBSCRIPTION_PLANS.map((plan) => (
                <article
                  key={plan.slug}
                  className={`glass-panel relative flex flex-col justify-between rounded-3xl p-7 transition hover:-translate-y-1 hover:shadow-xl ${
                    plan.popular ? 'ring-2 ring-indigo-600/80' : ''
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-[0.15em] text-indigo-800">{plan.planValue}</span>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                          plan.popular ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-900'
                        }`}
                      >
                        {plan.badge}
                      </span>
                    </div>
                    <h3 className="mt-4 text-2xl font-bold text-[#142137]">{plan.name}</h3>
                    <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-700">{plan.tagline}</p>
                    <div className="mt-6 border-y border-slate-300/60 py-5">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-3xl font-extrabold tracking-tight text-[#142137] sm:text-[2rem]">{plan.price}</span>
                        <span className="text-sm font-semibold text-slate-600">{plan.period}</span>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-indigo-900/90">{plan.billingNote}</p>
                    </div>
                    <ul className="mt-6 space-y-3 text-sm text-slate-700">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                            <Check size={13} />
                          </span>
                          <span className="leading-5">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    to={`/daftar?paket=${plan.slug}`}
                    className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-bold transition ${
                      plan.popular ? 'landing-primary' : 'landing-secondary'
                    }`}
                  >
                    Pilih Paket <ArrowRight size={16} />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="registrasi" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24"><div className="glass-panel mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-3xl p-7 sm:flex-row sm:items-center sm:p-10"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-800">Untuk pengelola lembaga</p><h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Bertumbuh bersama dalam pendidikan.</h2><p className="mt-5 max-w-xl text-sm leading-7 text-slate-700">Daftarkan lembaga untuk menggunakan layanan LMS Kesetaraan.</p></div><Link to="/daftar" className="landing-primary inline-flex shrink-0 items-center gap-3 rounded-full px-6 py-4 text-sm font-bold transition">Daftar lembaga <ArrowRight size={17} /></Link></div></section>
      </main>
      <footer className="landing-footer px-5 py-10 text-slate-700 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 text-xs sm:flex-row sm:items-center"><div><p className="text-lg font-bold text-slate-900">Rasyatech Digital Zenith<span className="text-indigo-700">.</span></p><p className="mt-2">Platform digital untuk mendukung lembaga pendidikan.</p></div><button type="button" onClick={openMasterLogin} aria-label="Akses master admin" title="Akses master admin" className="landing-secondary self-start rounded-full p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"><LockKeyhole size={18} /></button></div></footer>
    </div>
  );
};
