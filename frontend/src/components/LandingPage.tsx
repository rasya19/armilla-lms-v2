import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  Eye,
  GraduationCap,
  LockKeyhole,
  LogIn,
  Menu,
  Palette,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { SUBSCRIPTION_PLANS } from './subscriptionPlans';
import { fetchWithTimeout, isCallerAborted } from './fetchWithTimeout';
import {
  dispatchTenantThemeChange,
  getPreferredTheme,
  isThemeKey,
  TENANT_THEME_EVENT,
  type ThemeKey,
} from './TenantThemeProvider';

const programs = [
  {
    name: 'Administrasi',
    level: 'Data lembaga',
    number: '01',
    description: 'Kelola data siswa, guru, dan kelas di sekolah Anda.',
  },
  {
    name: 'Pembelajaran',
    level: 'Kegiatan belajar',
    number: '02',
    description: 'Kelola jadwal, materi, dan tugas untuk kegiatan belajar.',
  },
  {
    name: 'Evaluasi',
    level: 'Hasil belajar',
    number: '03',
    description: 'Guru dapat memberi nilai dan komentar pada pengumpulan tugas.',
  },
];

type PublicStats = { totalVisitors: number; totalSchools: number };

const LANDING_THEME_OPTIONS: Array<{ key: ThemeKey; label: string; dot: string }> = [
  { key: 'ocean', label: 'Ocean & Gold', dot: 'bg-gradient-to-br from-sky-500 to-amber-400' },
  { key: 'emerald', label: 'Emerald Fresh', dot: 'bg-gradient-to-br from-emerald-500 to-teal-400' },
  { key: 'sunset', label: 'Sunset Violet', dot: 'bg-gradient-to-br from-violet-500 to-rose-400' },
  { key: 'dark', label: 'Rasyatech Dark', dot: 'bg-gradient-to-br from-amber-400 to-amber-600' },
];

type LandingThemeStyles = {
  logoBg: string;
  brandSub: string;
  navLink: string;
  mobileMenuBtn: string;
  mobileDrawer: string;
  mobileCta: string;
  themeBarWrap: string;
  themeBarLabel: string;
  themeBtnActive: string;
  themeBtnInactive: string;
  ringBorder: string;
  eyebrow: string;
  eyebrowLine: string;
  heading: string;
  bodyText: string;
  mutedText: string;
  statCard: string;
  statLabel: string;
  statIcon: string;
  statValue: string;
  sparkleIcon: string;
  heroArtShell: string;
  heroArtGradient: string;
  heroArtCircle: string;
  heroArtCaption: string;
  heroArtBadgeText: string;
  heroArrowCircle: string;
  stripAccent: string;
  divider: string;
  featureIcon: string;
  planPopularRing: string;
  planPopularBadge: string;
  planDefaultBadge: string;
  planCheckWrap: string;
  planNote: string;
  footerDot: string;
};

const LANDING_THEMES: Record<ThemeKey, LandingThemeStyles> = {
  dark: {
    logoBg: 'bg-gradient-to-br from-emerald-400 via-lime-400 to-amber-400 text-slate-950 shadow-[0_0_20px_rgba(52,211,153,0.3)]',
    brandSub: 'text-emerald-300/80',
    navLink: 'text-slate-300 hover:text-amber-300',
    mobileMenuBtn: 'border border-slate-700/80 bg-slate-900/70 text-slate-100 hover:bg-slate-800',
    mobileDrawer: 'border-t border-slate-700/60 bg-[#091325]/95 text-slate-200',
    mobileCta: 'text-amber-300',
    themeBarWrap: 'border-b border-slate-400/15 bg-[#081222]/75 backdrop-blur-xl',
    themeBarLabel: 'text-slate-400',
    themeBtnActive: 'border-amber-400/70 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_16px_rgba(245,158,11,0.35)]',
    themeBtnInactive: 'border-slate-700/80 bg-slate-900/75 text-slate-300 hover:border-slate-500 hover:text-white',
    ringBorder: 'border-amber-400/10',
    eyebrow: 'text-amber-300',
    eyebrowLine: 'bg-amber-400',
    heading: 'text-slate-50',
    bodyText: 'text-slate-300',
    mutedText: 'text-slate-400',
    statCard: 'border-slate-400/18 bg-[#0b1629]/80 backdrop-blur-md',
    statLabel: 'text-amber-300',
    statIcon: 'text-emerald-400',
    statValue: 'text-white',
    sparkleIcon: 'text-amber-400',
    heroArtShell: 'bg-[#081222] border border-slate-700/70',
    heroArtGradient: 'bg-gradient-to-br from-[#0c2c34] via-[#0e1b35] to-[#1a1f36]',
    heroArtCircle: 'border-amber-400/10',
    heroArtCaption: 'text-emerald-300',
    heroArtBadgeText: 'text-slate-300',
    heroArrowCircle: 'border-slate-600/80 bg-slate-900/70 text-amber-300',
    stripAccent: 'text-amber-300',
    divider: 'border-slate-700/70',
    featureIcon: 'text-amber-400',
    planPopularRing: 'ring-2 ring-amber-400/80 shadow-[0_0_32px_rgba(245,158,11,0.18)]',
    planPopularBadge: 'border border-amber-400/50 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950',
    planDefaultBadge: 'border border-emerald-400/30 bg-emerald-500/15 text-emerald-300',
    planCheckWrap: 'border border-emerald-400/30 bg-emerald-500/15 text-emerald-300',
    planNote: 'text-amber-300',
    footerDot: 'text-amber-400',
  },
  ocean: {
    logoBg: 'bg-gradient-to-br from-sky-700 to-cyan-500 text-white shadow-md shadow-sky-700/25',
    brandSub: 'text-sky-700',
    navLink: 'text-slate-700 hover:text-sky-900',
    mobileMenuBtn: 'text-sky-950 hover:bg-sky-100',
    mobileDrawer: 'border-t border-sky-200/70 bg-white/95 text-sky-950',
    mobileCta: 'text-sky-800',
    themeBarWrap: 'border-b border-sky-200/70 bg-white/70 backdrop-blur-xl',
    themeBarLabel: 'text-sky-800',
    themeBtnActive: 'border-amber-400 bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 shadow-sm',
    themeBtnInactive: 'border-sky-200 bg-white/80 text-slate-700 hover:border-sky-400 hover:text-sky-950',
    ringBorder: 'border-sky-400/25',
    eyebrow: 'text-sky-800',
    eyebrowLine: 'bg-amber-500',
    heading: 'text-sky-950',
    bodyText: 'text-slate-700',
    mutedText: 'text-slate-600',
    statCard: 'border-white/90 bg-white/75 backdrop-blur-md',
    statLabel: 'text-sky-800',
    statIcon: 'text-sky-700',
    statValue: 'text-sky-950',
    sparkleIcon: 'text-amber-600',
    heroArtShell: 'bg-sky-100',
    heroArtGradient: 'bg-gradient-to-br from-[#d9f3ff] via-[#bae6fd] to-[#fde68a]/65',
    heroArtCircle: 'border-white/35',
    heroArtCaption: 'text-sky-900',
    heroArtBadgeText: 'text-slate-700',
    heroArrowCircle: 'border-sky-900/20 text-sky-900',
    stripAccent: 'text-sky-800',
    divider: 'border-sky-200/80',
    featureIcon: 'text-sky-700',
    planPopularRing: 'ring-2 ring-amber-400/90',
    planPopularBadge: 'bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950',
    planDefaultBadge: 'bg-sky-100 text-sky-900',
    planCheckWrap: 'bg-sky-100 text-sky-700',
    planNote: 'text-sky-900',
    footerDot: 'text-amber-500',
  },
  emerald: {
    logoBg: 'bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/25',
    brandSub: 'text-emerald-700',
    navLink: 'text-slate-700 hover:text-emerald-900',
    mobileMenuBtn: 'text-emerald-950 hover:bg-emerald-100',
    mobileDrawer: 'border-t border-emerald-200/70 bg-white/95 text-emerald-950',
    mobileCta: 'text-emerald-800',
    themeBarWrap: 'border-b border-emerald-200/70 bg-white/70 backdrop-blur-xl',
    themeBarLabel: 'text-emerald-800',
    themeBtnActive: 'border-emerald-600 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm',
    themeBtnInactive: 'border-emerald-200 bg-white/80 text-slate-700 hover:border-emerald-400 hover:text-emerald-950',
    ringBorder: 'border-emerald-400/25',
    eyebrow: 'text-emerald-800',
    eyebrowLine: 'bg-emerald-600',
    heading: 'text-emerald-950',
    bodyText: 'text-slate-700',
    mutedText: 'text-slate-600',
    statCard: 'border-white/90 bg-white/75 backdrop-blur-md',
    statLabel: 'text-emerald-800',
    statIcon: 'text-emerald-700',
    statValue: 'text-emerald-950',
    sparkleIcon: 'text-emerald-700',
    heroArtShell: 'bg-emerald-100',
    heroArtGradient: 'bg-gradient-to-br from-[#d1fae5] via-[#99f6e4] to-[#a7f3d0]',
    heroArtCircle: 'border-white/35',
    heroArtCaption: 'text-emerald-900',
    heroArtBadgeText: 'text-slate-700',
    heroArrowCircle: 'border-emerald-900/20 text-emerald-900',
    stripAccent: 'text-emerald-800',
    divider: 'border-emerald-200/80',
    featureIcon: 'text-emerald-700',
    planPopularRing: 'ring-2 ring-emerald-500/90',
    planPopularBadge: 'bg-emerald-600 text-white',
    planDefaultBadge: 'bg-emerald-100 text-emerald-900',
    planCheckWrap: 'bg-emerald-100 text-emerald-700',
    planNote: 'text-emerald-900',
    footerDot: 'text-emerald-600',
  },
  sunset: {
    logoBg: 'bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white shadow-md shadow-fuchsia-600/25',
    brandSub: 'text-violet-700',
    navLink: 'text-slate-700 hover:text-violet-900',
    mobileMenuBtn: 'text-violet-950 hover:bg-violet-100',
    mobileDrawer: 'border-t border-violet-200/70 bg-white/95 text-violet-950',
    mobileCta: 'text-violet-800',
    themeBarWrap: 'border-b border-violet-200/70 bg-white/70 backdrop-blur-xl',
    themeBarLabel: 'text-violet-800',
    themeBtnActive: 'border-violet-600 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 text-white shadow-sm',
    themeBtnInactive: 'border-violet-200 bg-white/80 text-slate-700 hover:border-violet-400 hover:text-violet-950',
    ringBorder: 'border-violet-400/25',
    eyebrow: 'text-violet-800',
    eyebrowLine: 'bg-fuchsia-600',
    heading: 'text-violet-950',
    bodyText: 'text-slate-700',
    mutedText: 'text-slate-600',
    statCard: 'border-white/90 bg-white/75 backdrop-blur-md',
    statLabel: 'text-violet-800',
    statIcon: 'text-fuchsia-700',
    statValue: 'text-violet-950',
    sparkleIcon: 'text-fuchsia-700',
    heroArtShell: 'bg-violet-100',
    heroArtGradient: 'bg-gradient-to-br from-[#ede9fe] via-[#fbcfe8] to-[#fed7aa]',
    heroArtCircle: 'border-white/35',
    heroArtCaption: 'text-violet-900',
    heroArtBadgeText: 'text-slate-700',
    heroArrowCircle: 'border-violet-900/20 text-violet-900',
    stripAccent: 'text-violet-800',
    divider: 'border-violet-200/80',
    featureIcon: 'text-violet-700',
    planPopularRing: 'ring-2 ring-fuchsia-500/85',
    planPopularBadge: 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white',
    planDefaultBadge: 'bg-violet-100 text-violet-900',
    planCheckWrap: 'bg-violet-100 text-violet-700',
    planNote: 'text-violet-900',
    footerDot: 'text-fuchsia-600',
  },
};

export const LandingPage: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [theme, setTheme] = useState<ThemeKey>(() => getPreferredTheme('dark'));
  const masterClicks = useRef(0);
  const navigate = useNavigate();

  const palette = LANDING_THEMES[theme];

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tenantTheme = theme;
    return () => {
      if (root.dataset.tenantTheme === theme) {
        delete root.dataset.tenantTheme;
      }
    };
  }, [theme]);

  useEffect(() => {
    function handleThemeSync(event: Event) {
      const custom = event as CustomEvent<unknown>;
      if (isThemeKey(custom.detail)) {
        setTheme(custom.detail);
      }
    }
    window.addEventListener(TENANT_THEME_EVENT, handleThemeSync);
    return () => window.removeEventListener(TENANT_THEME_EVENT, handleThemeSync);
  }, []);

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

  const handleSelectTheme = (next: ThemeKey) => {
    setTheme(next);
    dispatchTenantThemeChange(next);
  };

  const openMasterLogin = () => {
    masterClicks.current += 1;
    if (masterClicks.current === 5) {
      masterClicks.current = 0;
      navigate('/master/login');
    }
  };

  const nav = (
    <>
      <a href="#profil" onClick={() => setMenuOpen(false)} className={`transition ${palette.navLink}`}>Tentang</a>
      <a href="#program" onClick={() => setMenuOpen(false)} className={`transition ${palette.navLink}`}>Fitur</a>
      <a href="#paket" onClick={() => setMenuOpen(false)} className={`transition ${palette.navLink}`}>Paket</a>
      <a href="#registrasi" onClick={() => setMenuOpen(false)} className={`transition ${palette.navLink}`}>Mitra</a>
    </>
  );

  return (
    <div data-tenant-theme={theme} className="landing-page min-h-screen antialiased">
      {/* Bar Pemilih Tema Multi-Theme (Ocean & Gold, Emerald Fresh, Sunset Violet, Rasyatech Dark) */}
      <div className={`relative z-50 px-4 py-2 sm:px-8 ${palette.themeBarWrap}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className={`flex items-center gap-1.5 text-[11px] font-bold ${palette.themeBarLabel}`}>
            <Palette size={13} />
            <span>Tema Tampilan:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Pilih tema landing page">
            {LANDING_THEME_OPTIONS.map((option) => {
              const active = theme === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectTheme(option.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                    active ? palette.themeBtnActive : palette.themeBtnInactive
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${option.dot}`} aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <header className="landing-header sticky top-0 z-40">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
          <a href="#" className="flex items-center gap-3" aria-label="Rasyatech Digital Zenith, kembali ke beranda">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${palette.logoBg}`}>
              <BookOpen size={20} />
            </span>
            <span>
              <span className={`block text-sm font-bold tracking-tight sm:text-base ${palette.heading}`}>
                Rasyatech Digital Zenith
              </span>
              <span className={`block text-[9px] font-semibold uppercase tracking-[0.18em] ${palette.brandSub}`}>
                Platform pendidikan
              </span>
            </span>
          </a>
          <nav aria-label="Navigasi utama" className="hidden items-center gap-7 text-sm font-medium lg:flex">
            {nav}
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/dinas" className="landing-secondary hidden items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition sm:flex">
              Portal Dinas
            </Link>
            <Link to="/login" className="landing-secondary hidden items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition sm:flex">
              <LogIn size={15} /> Masuk LMS
            </Link>
            <Link to="/daftar" className="landing-primary hidden rounded-full px-5 py-2.5 text-sm font-bold transition md:block">
              Daftar lembaga
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
              aria-expanded={menuOpen}
              className={`rounded-lg p-2 transition lg:hidden ${palette.mobileMenuBtn}`}
            >
              {menuOpen ? <X size={23} /> : <Menu size={23} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav aria-label="Navigasi seluler" className={`flex flex-col gap-5 px-6 py-6 text-sm font-semibold lg:hidden ${palette.mobileDrawer}`}>
            {nav}
            <Link to="/dinas" onClick={() => setMenuOpen(false)}>Portal Dinas</Link>
            <Link to="/login" onClick={() => setMenuOpen(false)}>Masuk LMS</Link>
            <Link to="/daftar" onClick={() => setMenuOpen(false)} className={palette.mobileCta}>
              Daftar lembaga <ArrowRight size={15} className="inline" />
            </Link>
          </nav>
        )}
      </header>

      <main>
        <section className="landing-hero relative overflow-hidden">
          <div aria-hidden="true" className={`pointer-events-none absolute -right-36 -top-56 h-[650px] w-[650px] rounded-full border ${palette.ringBorder}`} />
          <div aria-hidden="true" className={`pointer-events-none absolute -right-16 top-4 h-[450px] w-[450px] rounded-full border ${palette.ringBorder}`} />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-16 pt-14 sm:px-8 md:pb-20 md:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-20">
            <div className="glass-panel rounded-3xl p-6 sm:p-10">
              <span className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] ${palette.eyebrow}`}>
                <span className={`h-px w-8 ${palette.eyebrowLine}`} /> Pendidikan untuk semua
              </span>
              <h1 className={`mt-7 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-[-0.04em] sm:text-6xl lg:text-[4.3rem] ${palette.heading}`}>
                Ruang digital untuk pendidikan yang terus bertumbuh.
              </h1>
              <p className={`mt-6 max-w-xl text-base leading-8 sm:text-lg ${palette.bodyText}`}>
                Platform pendidikan untuk membantu berbagai lembaga mengelola administrasi dan kegiatan belajar dalam satu tempat.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#paket" className="landing-primary inline-flex items-center gap-4 rounded-full px-6 py-4 text-sm font-bold transition">
                  Lihat paket langganan <ArrowRight size={17} />
                </a>
                <a href="#program" className="landing-secondary inline-flex items-center gap-3 rounded-full px-6 py-4 text-sm font-semibold transition">
                  Jelajahi fitur <ArrowDown size={16} />
                </a>
              </div>
              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                <div className={`rounded-2xl border p-4 ${palette.statCard}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-bold uppercase tracking-[0.15em] ${palette.statLabel}`}>
                      Total Pengunjung
                    </span>
                    <Eye size={16} className={palette.statIcon} />
                  </div>
                  <p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${palette.statValue}`} data-testid="stat-visitors">
                    {stats ? stats.totalVisitors.toLocaleString('id-ID') : '—'}
                  </p>
                  <p className={`mt-1 text-xs ${palette.mutedText}`}>Kunjungan ke beranda platform</p>
                </div>
                <div className={`rounded-2xl border p-4 ${palette.statCard}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-bold uppercase tracking-[0.15em] ${palette.statLabel}`}>
                      Lembaga Bergabung
                    </span>
                    <Building2 size={16} className={palette.statIcon} />
                  </div>
                  <p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${palette.statValue}`} data-testid="stat-schools">
                    {stats ? stats.totalSchools.toLocaleString('id-ID') : '—'}
                  </p>
                  <p className={`mt-1 text-xs ${palette.mutedText}`}>Sekolah &amp; PKBM aktif terdaftar</p>
                </div>
              </div>
              <div className={`mt-7 flex items-center gap-3 text-xs ${palette.bodyText}`}>
                <Sparkles size={16} className={palette.sparkleIcon} /> Belajar hari ini, bertumbuh untuk esok.
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[500px]">
              <div className={`absolute -inset-5 rounded-[2rem] border ${palette.ringBorder}`} aria-hidden="true" />
              <div className="glass-panel relative overflow-hidden rounded-[1.5rem] p-5 sm:p-8">
                <div className={`relative min-h-[310px] overflow-hidden rounded-xl sm:min-h-[360px] ${palette.heroArtShell}`}>
                  <div className={`absolute inset-0 ${palette.heroArtGradient}`} />
                  <div className={`absolute -right-8 -top-20 h-80 w-80 rounded-full border-[40px] ${palette.heroArtCircle}`} />
                  <div className="absolute bottom-0 left-0 right-0 h-40 bg-slate-950/10" />
                  <div className={`absolute left-7 top-8 text-[10px] font-bold uppercase tracking-[0.22em] ${palette.heroArtCaption}`}>
                    Ruang untuk bertumbuh
                  </div>
                  <div className="glass-panel absolute bottom-9 left-7 right-7 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${palette.logoBg}`}>
                        <GraduationCap size={22} />
                      </span>
                      <div>
                        <p className={`text-sm font-bold ${palette.heading}`}>Platform pendidikan</p>
                        <p className={`mt-1 text-xs ${palette.heroArtBadgeText}`}>Langkah baru, kesempatan baru.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 pt-5">
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-[0.16em] ${palette.mutedText}`}>
                      Rasyatech Digital Zenith
                    </p>
                    <p className={`mt-1 text-sm font-semibold ${palette.heading}`}>
                      Mendukung perjalanan pendidikan.
                    </p>
                  </div>
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full border ${palette.heroArrowCircle}`}>
                    <ArrowRight size={17} />
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="landing-strip border-t">
            <div className={`mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 text-xs font-medium sm:px-8 ${palette.bodyText}`}>
              <span>Teknologi untuk pendidikan yang lebih terhubung.</span>
              <span className={`font-semibold ${palette.stripAccent}`}>Lembaga &nbsp; / &nbsp; Guru &nbsp; / &nbsp; Siswa</span>
            </div>
          </div>
        </section>

        <section id="profil" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
          <div className="glass-panel mx-auto grid max-w-7xl gap-10 rounded-3xl p-6 sm:p-10 md:grid-cols-[.8fr_1.2fr] md:gap-20">
            <div>
              <p className={`text-xs font-bold uppercase tracking-[0.2em] ${palette.eyebrow}`}>Tentang kami</p>
              <h2 className={`mt-5 max-w-md text-3xl font-semibold leading-tight tracking-tight sm:text-5xl ${palette.heading}`}>
                Setiap orang berhak punya kesempatan belajar.
              </h2>
            </div>
            <div className="md:pt-8">
              <p className={`max-w-2xl text-base leading-8 ${palette.bodyText}`}>
                Rasyatech Digital Zenith mengembangkan platform untuk membantu lembaga pendidikan mengelola kegiatan akademik dan mendukung perjalanan belajar di berbagai lingkungan.
              </p>
              <div className={`mt-8 grid gap-5 border-t pt-7 sm:grid-cols-2 ${palette.divider}`}>
                <div className="flex gap-3">
                  <BookOpen className={`shrink-0 ${palette.featureIcon}`} size={21} />
                  <div>
                    <h3 className={`font-bold ${palette.heading}`}>Belajar berkelanjutan</h3>
                    <p className={`mt-1 text-sm leading-6 ${palette.bodyText}`}>
                      Pendidikan sebagai bekal untuk membuka lebih banyak peluang.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Users className={`shrink-0 ${palette.featureIcon}`} size={21} />
                  <div>
                    <h3 className={`font-bold ${palette.heading}`}>Tumbuh bersama</h3>
                    <p className={`mt-1 text-sm leading-6 ${palette.bodyText}`}>
                      Lingkungan belajar yang mendukung perjalanan setiap warga belajar.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="program" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="glass-panel flex flex-col justify-between gap-4 rounded-3xl p-6 sm:flex-row sm:items-end sm:p-10">
              <div>
                <p className={`text-xs font-bold uppercase tracking-[0.2em] ${palette.eyebrow}`}>Fitur platform</p>
                <h2 className={`mt-4 text-3xl font-semibold tracking-tight sm:text-4xl ${palette.heading}`}>
                  Dukungan untuk setiap langkah belajar.
                </h2>
              </div>
              <p className={`max-w-sm text-sm leading-6 ${palette.bodyText}`}>
                Layanan administrasi dan pembelajaran tersedia melalui subdomain masing-masing sekolah.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {programs.map((program) => (
                <article key={program.name} className="glass-panel group rounded-2xl p-7 transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${palette.logoBg}`}>
                      <BookOpen size={20} />
                    </span>
                    <span className={`font-mono text-xs font-semibold tracking-widest ${palette.mutedText}`}>
                      {program.number}
                    </span>
                  </div>
                  <p className={`mt-8 text-xs font-bold uppercase tracking-[0.15em] ${palette.eyebrow}`}>
                    {program.level}
                  </p>
                  <h3 className={`mt-2 text-2xl font-semibold ${palette.heading}`}>{program.name}</h3>
                  <p className={`mt-3 min-h-[72px] text-sm leading-6 ${palette.bodyText}`}>{program.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="paket" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="glass-panel flex flex-col justify-between gap-4 rounded-3xl p-6 sm:flex-row sm:items-end sm:p-10">
              <div>
                <p className={`text-xs font-bold uppercase tracking-[0.2em] ${palette.eyebrow}`}>
                  Pilihan paket langganan
                </p>
                <h2 className={`mt-4 text-3xl font-semibold tracking-tight sm:text-4xl ${palette.heading}`}>
                  Paket sesuai kebutuhan lembaga Anda.
                </h2>
              </div>
              <p className={`max-w-sm text-sm leading-6 ${palette.bodyText}`}>
                Pilih paket langganan untuk memulai pendaftaran lembaga dan aktivasi subdomain sekolah.
              </p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {SUBSCRIPTION_PLANS.map((plan) => (
                <article
                  key={plan.slug}
                  className={`glass-panel relative flex flex-col justify-between rounded-3xl p-7 transition hover:-translate-y-1 hover:shadow-xl ${
                    plan.popular ? palette.planPopularRing : ''
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`text-xs font-bold uppercase tracking-[0.15em] ${palette.eyebrow}`}>
                        {plan.planValue}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                          plan.popular ? palette.planPopularBadge : palette.planDefaultBadge
                        }`}
                      >
                        {plan.badge}
                      </span>
                    </div>
                    <h3 className={`mt-4 text-2xl font-bold ${palette.heading}`}>{plan.name}</h3>
                    <p className={`mt-2 min-h-[48px] text-sm leading-6 ${palette.bodyText}`}>{plan.tagline}</p>
                    <div className={`mt-6 border-y py-5 ${palette.divider}`}>
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className={`text-3xl font-extrabold tracking-tight tabular-nums sm:text-[2rem] ${palette.heading}`}>
                          {plan.price}
                        </span>
                        <span className={`text-sm font-semibold ${palette.mutedText}`}>{plan.period}</span>
                      </div>
                      <p className={`mt-2 text-xs font-semibold ${palette.planNote}`}>{plan.billingNote}</p>
                    </div>
                    <ul className={`mt-6 space-y-3 text-sm ${palette.bodyText}`}>
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${palette.planCheckWrap}`}>
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

        <section id="registrasi" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
          <div className="glass-panel mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-3xl p-7 sm:flex-row sm:items-center sm:p-10">
            <div>
              <p className={`text-xs font-bold uppercase tracking-[0.2em] ${palette.eyebrow}`}>
                Untuk pengelola lembaga
              </p>
              <h2 className={`mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl ${palette.heading}`}>
                Bertumbuh bersama dalam pendidikan.
              </h2>
              <p className={`mt-5 max-w-xl text-sm leading-7 ${palette.bodyText}`}>
                Daftarkan lembaga untuk menggunakan layanan LMS Kesetaraan.
              </p>
            </div>
            <Link to="/daftar" className="landing-primary inline-flex shrink-0 items-center gap-3 rounded-full px-6 py-4 text-sm font-bold transition">
              Daftar lembaga <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 text-xs sm:flex-row sm:items-center">
          <div>
            <p className={`text-lg font-bold ${palette.heading}`}>
              Rasyatech Digital Zenith<span className={palette.footerDot}>.</span>
            </p>
            <p className={`mt-2 ${palette.bodyText}`}>Platform digital untuk mendukung lembaga pendidikan.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/dinas" className="landing-secondary rounded-full px-4 py-2 font-semibold transition">
              Portal Dinas
            </Link>
            <button
              type="button"
              onClick={openMasterLogin}
              aria-label="Akses master admin"
              title="Akses master admin"
              className="landing-secondary self-start rounded-full p-3 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <LockKeyhole size={18} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
