import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowRight, BookOpen, GraduationCap, LogIn,
  Menu, Sparkles, Users, X, LockKeyhole,
} from 'lucide-react';
const programs = [
  { name: 'Administrasi', level: 'Data lembaga', number: '01', description: 'Direncanakan untuk membantu lembaga mengelola data siswa, guru, dan kelas.' },
  { name: 'Pembelajaran', level: 'Kegiatan belajar', number: '02', description: 'Direncanakan untuk mendukung jadwal, presensi, materi, dan tugas.' },
  { name: 'Evaluasi', level: 'Hasil belajar', number: '03', description: 'Direncanakan untuk mendukung pengelolaan nilai dan ujian daring.' },
];

export const LandingPage: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const masterClicks = useRef(0);
  const navigate = useNavigate();

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
      <a href="#registrasi" onClick={() => setMenuOpen(false)}>Mitra</a>
    </>
  );

  return (
    <div className="landing-page min-h-screen bg-[#f7f6f1] text-[#142137]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0c192d]/95 text-white backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
          <a href="#" className="flex items-center gap-3" aria-label="Rasyatech Digital Zenith, kembali ke beranda">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#d6bb87]/40 bg-white/5">
              <BookOpen size={22} className="text-[#e7ca91]" />
            </span>
            <span><span className="block text-sm font-bold tracking-tight sm:text-base">Rasyatech Digital Zenith</span><span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">Platform pendidikan</span></span>
          </a>
          <nav aria-label="Navigasi utama" className="hidden items-center gap-7 text-sm font-medium text-slate-300 lg:flex">{nav}</nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10 sm:flex"><LogIn size={15} /> Masuk LMS</Link>
            <Link to="/daftar" className="hidden rounded-full bg-[#dfc18d] px-5 py-2.5 text-sm font-bold text-[#132038] transition hover:bg-[#efd6a8] md:block">Daftar lembaga</Link>
            <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'} aria-expanded={menuOpen} className="rounded-lg p-2 text-white lg:hidden">{menuOpen ? <X size={23} /> : <Menu size={23} />}</button>
          </div>
        </div>
        {menuOpen && <nav aria-label="Navigasi seluler" className="flex flex-col gap-5 border-t border-white/10 px-6 py-6 text-sm font-semibold text-slate-200 lg:hidden">{nav}<Link to="/login" onClick={() => setMenuOpen(false)}>Masuk LMS</Link><Link to="/daftar" onClick={() => setMenuOpen(false)} className="text-[#e7ca91]">Daftar lembaga <ArrowRight size={15} className="inline" /></Link></nav>}
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#0c192d] text-white">
          <div aria-hidden="true" className="absolute -right-36 -top-56 h-[650px] w-[650px] rounded-full border border-[#d4b578]/10" />
          <div aria-hidden="true" className="absolute -right-16 top-4 h-[450px] w-[450px] rounded-full border border-[#d4b578]/10" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 md:pb-24 md:pt-24 lg:grid-cols-[1.05fr_.95fr] lg:gap-20">
            <div>
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#dfc18d]"><span className="h-px w-8 bg-[#dfc18d]" /> Pendidikan untuk semua</span>
              <h1 className="mt-7 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-[-0.04em] sm:text-6xl lg:text-[4.3rem]">Ruang digital untuk pendidikan yang terus bertumbuh.</h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">Platform pendidikan yang sedang disiapkan untuk membantu berbagai lembaga mengelola administrasi dan kegiatan belajar dalam satu tempat.</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/daftar" className="inline-flex items-center gap-4 rounded-full bg-[#dfc18d] px-6 py-4 text-sm font-bold text-[#132038] transition hover:bg-[#efd6a8]">Daftar lembaga <ArrowRight size={17} /></Link>
                <a href="#program" className="inline-flex items-center gap-3 rounded-full border border-white/25 px-6 py-4 text-sm font-semibold transition hover:bg-white/10">Jelajahi fitur <ArrowDown size={16} /></a>
              </div>
              <div className="mt-12 flex items-center gap-3 text-xs text-slate-400"><Sparkles size={16} className="text-[#dfc18d]" /> Belajar hari ini, bertumbuh untuk esok.</div>
            </div>
            <div className="relative mx-auto w-full max-w-[500px]">
              <div className="absolute -inset-5 rounded-[2rem] border border-white/10" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[1.5rem] bg-[#e6dfd0] p-5 text-[#142137] shadow-2xl sm:p-8">
                <div className="relative min-h-[310px] overflow-hidden rounded-xl bg-[#bdc8c0] sm:min-h-[360px]">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#dce2d4] via-[#b5c5b9] to-[#829c98]" />
                  <div className="absolute -right-8 -top-20 h-80 w-80 rounded-full border-[40px] border-white/20" />
                  <div className="absolute bottom-0 left-0 right-0 h-40 bg-[#122a39]/10" />
                  <div className="absolute left-7 top-8 text-[10px] font-bold uppercase tracking-[0.22em] text-[#29443e]">Ruang untuk bertumbuh</div>
                  <div className="absolute bottom-9 left-7 right-7 rounded-2xl border border-white/50 bg-[#f8f6ef]/90 p-5 backdrop-blur">
                    <div className="flex items-center gap-3"><span className="rounded-xl bg-[#0c192d] p-3 text-[#dfc18d]"><GraduationCap size={24} /></span><div><p className="text-sm font-bold">Platform pendidikan</p><p className="mt-1 text-xs text-slate-500">Langkah baru, kesempatan baru.</p></div></div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 pt-5"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Rasyatech Digital Zenith</p><p className="mt-1 text-sm font-semibold">Mendukung perjalanan pendidikan.</p></div><span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#142137]/20"><ArrowRight size={17} /></span></div>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 text-xs font-medium text-slate-400 sm:px-8"><span>Teknologi untuk pendidikan yang lebih terhubung.</span><span className="text-[#dfc18d]">Lembaga &nbsp; / &nbsp; Guru &nbsp; / &nbsp; Siswa</span></div></div>
        </section>

        <section id="profil" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[.8fr_1.2fr] md:gap-20">
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#967846]">Tentang kami</p><h2 className="mt-5 max-w-md text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">Setiap orang berhak punya kesempatan belajar.</h2></div>
            <div className="md:pt-8"><p className="max-w-2xl text-base leading-8 text-slate-600">Rasyatech Digital Zenith mengembangkan platform untuk membantu lembaga pendidikan mengelola kegiatan akademik dan mendukung perjalanan belajar di berbagai lingkungan.</p><div className="mt-8 grid gap-5 border-t border-[#d9d9d0] pt-7 sm:grid-cols-2"><div className="flex gap-3"><BookOpen className="shrink-0 text-[#9b7c49]" size={21} /><div><h3 className="font-bold">Belajar berkelanjutan</h3><p className="mt-1 text-sm leading-6 text-slate-500">Pendidikan sebagai bekal untuk membuka lebih banyak peluang.</p></div></div><div className="flex gap-3"><Users className="shrink-0 text-[#9b7c49]" size={21} /><div><h3 className="font-bold">Tumbuh bersama</h3><p className="mt-1 text-sm leading-6 text-slate-500">Lingkungan belajar yang mendukung perjalanan setiap warga belajar.</p></div></div></div></div>
          </div>
        </section>

        <section id="program" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#967846]">Rencana platform</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Dukungan untuk setiap langkah belajar.</h2></div><p className="max-w-sm text-sm leading-6 text-slate-500">Fitur-fitur berikut masih dalam pengembangan dan belum dapat digunakan.</p></div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">{programs.map(program => <article key={program.name} className="group rounded-2xl border border-[#e5e6e2] bg-[#f9f9f6] p-7 transition hover:-translate-y-1 hover:border-[#d3bc94] hover:shadow-lg"><div className="flex items-center justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e9ede9] text-[#526c61]"><BookOpen size={22} /></span><span className="text-xs font-semibold tracking-widest text-slate-400">{program.number}</span></div><p className="mt-8 text-xs font-bold uppercase tracking-[0.15em] text-[#967846]">{program.level}</p><h3 className="mt-2 text-2xl font-semibold">{program.name}</h3><p className="mt-3 min-h-[72px] text-sm leading-6 text-slate-500">{program.description}</p></article>)}</div>
          </div>
        </section>

        <section id="registrasi" className="scroll-mt-24 bg-[#14243a] px-5 py-20 text-white sm:px-8 sm:py-24"><div className="mx-auto max-w-7xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#dfc18d]">Untuk pengelola lembaga</p><h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Bertumbuh bersama dalam pendidikan.</h2><p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">Pendaftaran lembaga sedang diuji secara lokal; akun sekolah dan undangan belum tersedia.</p></div></section>
      </main>
      <footer className="bg-[#091526] px-5 py-10 text-slate-400 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 text-xs sm:flex-row sm:items-center"><div><p className="text-lg font-bold text-white">Rasyatech Digital Zenith<span className="text-[#dfc18d]">.</span></p><p className="mt-2">Platform digital untuk mendukung lembaga pendidikan.</p></div><button type="button" onClick={openMasterLogin} aria-label="Akses master admin" title="Akses master admin" className="self-start rounded-full border border-white/20 p-3 text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#dfc18d]"><LockKeyhole size={18} /></button></div></footer>
    </div>
  );
};
