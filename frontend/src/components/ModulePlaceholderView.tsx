import { ArrowLeft, CheckCircle2, Clock, Layers, Sparkles, type LucideIcon } from "lucide-react";
import { DashboardHero } from "./DashboardUI";
import type { PlanSlug } from "./subscriptionPlans";

export type DevelopmentModuleId =
  | "modul-kesetaraan"
  | "akreditasi-snp"
  | "agenda-mengajar"
  | "data-alumni"
  | "cek-raport"
  | "cbt-bank-soal"
  | "cbt-jadwal"
  | "cbt-monitoring"
  | "cbt-pengaturan"
  | "keuangan-spp"
  | "ruang-diskusi"
  | "asisten-ai"
  | "manajemen-aset"
  | "kartu-digital-qr";

type ModuleLayoutKind = "grid-3" | "snp-list" | "center-focus";

type GridHighlight = {
  badge: string;
  title: string;
  detail: string;
};

export type DevelopmentModuleConfig = {
  id: DevelopmentModuleId;
  title: string;
  group: string;
  layout: ModuleLayoutKind;
  requiredPlan?: Exclude<PlanSlug, "basic">;
  description: string;
  pkbmRoleNote: string;
  highlights?: GridHighlight[];
  focusHint?: string;
  subFeatures: string[];
};

const SNP_STANDARDS = [
  { code: "SNP-1", name: "Standar Kompetensi Lulusan (SKL)", desc: "Capaian sikap, pengetahuan, dan keterampilan lulusan Paket A, B, dan C.", readiness: 80 },
  { code: "SNP-2", name: "Standar Isi", desc: "Struktur kurikulum pendidikan kesetaraan, silabus, dan beban SKK.", readiness: 75 },
  { code: "SNP-3", name: "Standar Proses", desc: "Perencanaan modul ajar, jadwal tutorial/mandiri, dan jurnal KBM.", readiness: 70 },
  { code: "SNP-4", name: "Standar Penilaian Pendidikan", desc: "Instrumen evaluasi harian, CBT, tugas terstruktur, dan E-Raport.", readiness: 65 },
  { code: "SNP-5", name: "Standar Pendidik & Tenaga Kependidikan", desc: "Kualifikasi tutor, NUPTK, kompetensi pedagogik, dan data staf.", readiness: 85 },
  { code: "SNP-6", name: "Standar Sarana & Prasarana", desc: "Kelayakan ruang belajar, perangkat TIK, modul cetak, dan inventaris.", readiness: 60 },
  { code: "SNP-7", name: "Standar Pengelolaan", desc: "Rencana kerja lembaga, PPDB transparan, dan tata kelola PKBM.", readiness: 80 },
  { code: "SNP-8", name: "Standar Pembiayaan", desc: "Transparansi anggaran operasional, BOP Kesetaraan, dan laporan kas.", readiness: 55 },
] as const;

export const DEVELOPMENT_MODULES: Record<DevelopmentModuleId, DevelopmentModuleConfig> = {
  "modul-kesetaraan": {
    id: "modul-kesetaraan",
    title: "Modul Kesetaraan",
    group: "Master Data",
    layout: "grid-3",
    requiredPlan: "reguler",
    description:
      "Pengelolaan kurikulum kesetaraan berbasis SKK untuk Paket A (setara SD), Paket B (setara SMP), dan Paket C (setara SMA).",
    pkbmRoleNote:
      "Memudahkan PKBM memetakan beban belajar tatap muka, tutorial, dan belajar mandiri warga belajar sesuai jenjang masing-masing.",
    highlights: [
      { badge: "PAKET A", title: "Tingkat Setara SD (Kelas 1–6)", detail: "Pemetaan modul literasi, numerasi, dan ketuntasan belajar dasar." },
      { badge: "PAKET B", title: "Tingkat Setara SMP (Kelas 7–9)", detail: "Pengelolaan SKK mata pelajaran inti, keterampilan, dan evaluasi tengah jenjang." },
      { badge: "PAKET C", title: "Tingkat Setara SMA (Kelas 10–12)", detail: "Modul peminatan, pendalaman materi kejuruan, dan kesiapan kelulusan." },
    ],
    subFeatures: [
      "Pemetaan Struktur Kurikulum & SKK Paket A, B, dan C",
      "Katalog & Distribusi Modul Ajar Kesetaraan per Tingkatan Kelas",
      "Pemantauan Progres Ketuntasan Modul Mandiri Warga Belajar",
      "Pengaturan Bobot Tatap Muka, Tutorial, & Tugas Mandiri",
    ],
  },
  "akreditasi-snp": {
    id: "akreditasi-snp",
    title: "Akreditasi 8 SNP",
    group: "Master Data",
    layout: "snp-list",
    requiredPlan: "pro",
    description:
      "Pusat dokumentasi dan evaluasi diri berbasis 8 Standar Nasional Pendidikan (SNP) untuk persiapan visitasi BAN-PDM lembaga PKBM.",
    pkbmRoleNote:
      "Menyatukan portofolio dokumen standar isi, proses, lulusan, pendidik, sarpras, pengelolaan, pembiayaan, dan penilaian secara terstruktur.",
    subFeatures: [
      "Matriks Kelengkapan Instrumen 8 Standar Nasional Pendidikan",
      "Arsip & Verifikasi Dokumen Bukti Fisik per Butir Standar",
      "Simulasi Skor Kesiapan Visitasi Akreditasi BAN-PDM",
      "Rekap & Ekspor Paket Berkas Pendukung Akreditasi Lembaga",
    ],
  },
  "agenda-mengajar": {
    id: "agenda-mengajar",
    title: "Agenda & Jurnal Mengajar",
    group: "Akademik & Rapor",
    layout: "center-focus",
    description:
      "Catatan agenda harian tutor meliputi pokok bahasan materi, metode pembelajaran, serta catatan perkembangan kelas PKBM.",
    pkbmRoleNote:
      "Menjadi rekam jejak resmi pelaksanaan KBM tatap muka maupun daring sebagai dasar supervisi akademik dan laporan kinerja tutor.",
    focusHint: "Terhubung langsung ke jadwal mengajar tutor dan rekap pertemuan per rombel.",
    subFeatures: [
      "Input Jurnal Mengajar Harian Tutor Terhubung ke Jadwal & Kelas",
      "Catatan Pokok Bahasan, Metode Belajar, & Kendala Pertemuan",
      "Dokumentasi Kehadiran Tutor & Ringkasan Aktivitas Kelas",
      "Rekapitulasi Jurnal Mengajar Bulanan untuk Admin Lembaga",
    ],
  },
  "data-alumni": {
    id: "data-alumni",
    title: "Data Alumni (Tracer Study)",
    group: "Akademik & Rapor",
    layout: "grid-3",
    requiredPlan: "reguler",
    description:
      "Basis data lulusan PKBM beserta pelacakan rekam jejak alumni pasca-kelulusan untuk kebutuhan evaluasi mutu dan pelaporan dinas.",
    pkbmRoleNote:
      "Membantu lembaga memantau sebaran lulusan yang bekerja, berwirausaha, atau melanjutkan ke jenjang pendidikan lebih tinggi.",
    highlights: [
      { badge: "KARIER", title: "Alumni Bekerja", detail: "Pelacakan bidang pekerjaan, instansi, dan kesesuaian keterampilan pasca-lulus." },
      { badge: "MANDIRI", title: "Wirausaha & UMKM", detail: "Pendataan lulusan yang merintis usaha mandiri maupun kelompok binaan PKBM." },
      { badge: "LANJUT STUDI", title: "Melanjutkan Pendidikan", detail: "Rekap warga belajar yang melanjutkan ke jenjang Paket berikutnya atau perguruan tinggi." },
    ],
    subFeatures: [
      "Direktori Arsip Lulusan Paket A, B, dan C per Tahun Angkatan",
      "Formulir Tracer Study Karier, Wirausaha, & Pendidikan Lanjutan",
      "Statistik Serapan Lulusan & Sebaran Aktivitas Alumni",
      "Pencatatan Nomor Seri Ijazah & Riwayat Kelulusan Warga Belajar",
    ],
  },
  "cek-raport": {
    id: "cek-raport",
    title: "Cek & Cetak E-Raport",
    group: "Akademik & Rapor",
    layout: "center-focus",
    requiredPlan: "reguler",
    description:
      "Penyusunan rapor digital semester pendidikan kesetaraan yang menghimpun nilai pengetahuan, keterampilan, deskripsi capaian kompetensi, dan catatan wali kelas.",
    pkbmRoleNote:
      "Mengotomasi kompilasi nilai akhir dari aktivitas KBM hingga menghasilkan dokumen E-Raport resmi siap cetak dan dapat dicek warga belajar.",
    focusHint: "Mendukung format rapor resmi Paket A, Paket B, dan Paket C per semester.",
    subFeatures: [
      "Kompilasi Otomatis Nilai Tugas, Praktik, & Evaluasi Akhir",
      "Input Deskripsi Capaian Kompetensi, Sikap, & Catatan Wali Kelas",
      "Pratinjau & Cetak E-Raport PDF Sesuai Format Kesetaraan Paket A/B/C",
      "Validasi Tanda Tangan Kepala PKBM & Akses Cek Raport di LMS Siswa",
    ],
  },
  "cbt-bank-soal": {
    id: "cbt-bank-soal",
    title: "Kelola Bank Soal & Ujian",
    group: "Ujian Online (CBT)",
    layout: "center-focus",
    requiredPlan: "reguler",
    description:
      "Repositori soal ujian terstruktur per mata pelajaran dan tingkatan kesetaraan lengkap dengan paket soal pilihan ganda maupun esai.",
    pkbmRoleNote:
      "Mempermudah tutor menyusun bank soal jangka panjang yang dapat dipakai ulang untuk ulangan harian, UTS, UAS, dan simulasi ujian.",
    focusHint: "Mendukung butir soal pilihan ganda, uraian, bobot skor, dan impor soal massal.",
    subFeatures: [
      "Penyusunan Soal Pilihan Ganda, Esai, & Bobot Nilai per Butir",
      "Pengelompokan Bank Soal Berdasarkan Jenjang Paket A/B/C & Mapel",
      "Pengacakan Nomor Soal & Pilihan Jawaban Otomatis",
      "Impor Bank Soal dari Template Spreadsheet",
    ],
  },
  "cbt-jadwal": {
    id: "cbt-jadwal",
    title: "Jadwal Ujian CBT",
    group: "Ujian Online (CBT)",
    layout: "center-focus",
    requiredPlan: "reguler",
    description:
      "Penjadwalan sesi ujian online lengkap dengan jendela waktu mulai-selesai, durasi pengerjaan, serta pembuatan token akses peserta.",
    pkbmRoleNote:
      "Menjaga ketertiban pelaksanaan evaluasi warga belajar yang mengakses ujian secara serentak maupun bergelombang.",
    focusHint: "Token sesi ujian dapat digenerasi otomatis dan dibagikan menjelang ujian dimulai.",
    subFeatures: [
      "Penentuan Rentang Tanggal, Jam Mulai, & Durasi Ujian Otomatis",
      "Pembuatan & Rotasi Token Akses Ujian Peserta",
      "Penugasan Sesi Ujian per Kelas atau Kelompok Belajar",
      "Publikasi Jadwal Ujian Otomatis ke Kalender LMS Siswa",
    ],
  },
  "cbt-monitoring": {
    id: "cbt-monitoring",
    title: "Monitoring Ujian Live",
    group: "Ujian Online (CBT)",
    layout: "center-focus",
    requiredPlan: "reguler",
    description:
      "Panel pemantauan langsung status pengerjaan ujian warga belajar secara real-time selama sesi CBT berlangsung.",
    pkbmRoleNote:
      "Membantu pengawas ujian mendeteksi kendala koneksi peserta, mereset sesi bila diperlukan, dan memantau progres penyelesaian soal.",
    focusHint: "Menampilkan status peserta: Belum Mulai, Sedang Mengerjakan, atau Selesai.",
    subFeatures: [
      "Status Pengerjaan Real-Time per Peserta & Progres Soal Terjawab",
      "Deteksi Kendala Koneksi & Opsi Reset Sesi / Tambah Waktu Darurat",
      "Log Aktivitas Ujian & Penutupan Sesi Paksa untuk Pengawas",
      "Rekap Nilai Langsung Setelah Peserta Menyelesaikan Ujian",
    ],
  },
  "cbt-pengaturan": {
    id: "cbt-pengaturan",
    title: "Pengaturan Ujian",
    group: "Ujian Online (CBT)",
    layout: "center-focus",
    requiredPlan: "reguler",
    description:
      "Konfigurasi standar pelaksanaan ujian CBT lembaga meliputi nilai KKM default, kebijakan tampilan hasil, dan keamanan peramban ujian.",
    pkbmRoleNote:
      "Memberikan kontrol penuh kepada admin dan tim kurikulum PKBM dalam menetapkan aturan evaluasi yang seragam.",
    focusHint: "Pengaturan terintegrasi ke seluruh paket soal dan sesi ujian pada tenant PKBM.",
    subFeatures: [
      "Konfigurasi Standar KKM & Aturan Remedial Otomatis",
      "Pengaturan Tampilkan/Sembunyikan Skor & Pembahasan Pasca-Ujian",
      "Pembatasan Perpindahan Tab & Kunci Token Masuk Ujian",
      "Integrasi Nilai Ujian CBT ke Buku Nilai & E-Raport",
    ],
  },
  "keuangan-spp": {
    id: "keuangan-spp",
    title: "Keuangan & SPP",
    group: "Layanan & Operasional",
    layout: "grid-3",
    requiredPlan: "pro",
    description:
      "Pengelolaan administrasi biaya pendidikan PKBM mencakup pos tagihan SPP/iuran, keringanan biaya, pencatatan pembayaran, dan laporan kas.",
    pkbmRoleNote:
      "Memberikan transparansi tagihan serta kuitansi digital bagi warga belajar sekaligus mempermudah bendahara memantau arus kas lembaga.",
    highlights: [
      { badge: "TAGIHAN", title: "Pos SPP & Daftar Ulang", detail: "Pengaturan tarif iuran bulanan, biaya ujian, dan skema beasiswa." },
      { badge: "PEMBAYARAN", title: "Verifikasi & Kuitansi", detail: "Pencatatan pembayaran tunai atau transfer beserta cetak kuitansi resmi." },
      { badge: "LAPORAN", title: "Arus Kas & Tunggakan", detail: "Ringkasan pemasukan harian/bulanan dan pengingat tagihan jatuh tempo." },
    ],
    subFeatures: [
      "Pengaturan Pos Tagihan SPP, Daftar Ulang, & Beasiswa/Keringanan",
      "Pencatatan Pembayaran Tunai/Transfer & Kuitansi Digital Otomatis",
      "Pemantauan Status Tunggakan & Riwayat Transaksi per Warga Belajar",
      "Laporan Rekapitulasi Penerimaan & Arus Kas Lembaga per Periode",
    ],
  },
  "ruang-diskusi": {
    id: "ruang-diskusi",
    title: "Ruang Diskusi",
    group: "Layanan & Operasional",
    layout: "center-focus",
    description:
      "Forum diskusi interaktif antara tutor dan warga belajar di luar jam tatap muka untuk membahas materi modul, tanya-jawab tugas, dan koordinasi kelas.",
    pkbmRoleNote:
      "Menjaga keterlibatan warga belajar dewasa maupun usia sekolah agar tetap aktif berdiskusi meskipun jadwal kerja berbeda.",
    focusHint: "Terorganisir per kelas dan mata pelajaran dengan moderasi penuh oleh tutor & admin.",
    subFeatures: [
      "Thread Diskusi Terkelompok Berdasarkan Kelas & Mata Pelajaran",
      "Tanya-Jawab Materi Modul & Pembahasan Tugas bersama Tutor",
      "Pin Jawaban Terbaik Tutor & Lampiran Referensi Belajar",
      "Notifikasi Balasan & Aktivitas Diskusi Terbaru di Portal LMS",
    ],
  },
  "asisten-ai": {
    id: "asisten-ai",
    title: "Asisten Belajar AI",
    group: "Layanan & Operasional",
    layout: "center-focus",
    requiredPlan: "pro",
    description:
      "Pendamping belajar cerdas berbasis AI untuk membantu warga belajar memahami materi modul dan membantu tutor menyusun bahan ajar.",
    pkbmRoleNote:
      "Mendukung pembelajaran mandiri warga belajar PKBM kapan saja dengan penjelasan bertahap dalam bahasa Indonesia yang mudah dipahami.",
    focusHint: "Dilengkapi kontrol kebijakan penggunaan oleh Admin Lembaga PKBM.",
    subFeatures: [
      "Tanya-Jawab Konsep Materi Kesetaraan Paket A, B, dan C secara Interaktif",
      "Ringkasan Otomatis Modul Ajar & Kisi-Kisi Latihan Pemahaman",
      "Bantuan Penyusunan Soal Latihan & Rubrik Penilaian bagi Tutor",
      "Pengaturan Kebijakan Akses & Konteks Kurikulum oleh Admin Lembaga",
    ],
  },
  "manajemen-aset": {
    id: "manajemen-aset",
    title: "Manajemen Aset & Sarpras",
    group: "Layanan & Operasional",
    layout: "grid-3",
    requiredPlan: "pro",
    description:
      "Inventarisasi sarana dan prasarana pembelajaran PKBM meliputi ruang belajar, perangkat TIK/CBT, buku modul cetak, serta pemeliharaan barang.",
    pkbmRoleNote:
      "Menjamin pendataan aset milik lembaga maupun pinjam-pakai tertib terdokumentasi untuk operasional harian dan pelaporan akreditasi.",
    highlights: [
      { badge: "INVENTARIS", title: "Daftar Aset & Kondisi", detail: "Kode barang, kategori perangkat/buku, kondisi fisik, dan lokasi ruang." },
      { badge: "SIRKULASI", title: "Peminjaman Fasilitas", detail: "Catat peminjaman modul cetak maupun perangkat belajar oleh tutor dan siswa." },
      { badge: "PERAWATAN", title: "Jadwal Pemeliharaan", detail: "Riwayat servis perangkat TIK serta laporan Daftar Inventaris Ruangan." },
    ],
    subFeatures: [
      "Katalog Inventaris Barang, Kode Aset, Sumber Dana, & Kondisi",
      "Pengelompokan Daftar Inventaris Ruangan (DIR) & Fasilitas Belajar",
      "Pencatatan Peminjaman Perangkat/Modul & Pengembalian Barang",
      "Jadwal Perawatan Berkala & Riwayat Perbaikan Aset Lembaga",
    ],
  },
  "kartu-digital-qr": {
    id: "kartu-digital-qr",
    title: "Kartu Pelajar Digital QR",
    group: "Layanan & Operasional",
    layout: "center-focus",
    requiredPlan: "pro",
    description:
      "Pembuatan kartu identitas warga belajar digital dilengkapi kode QR unik untuk verifikasi status siswa aktif serta dukungan presensi scan QR.",
    pkbmRoleNote:
      "Mempermudah identifikasi resmi warga belajar Paket A/B/C secara modern serta terhubung langsung ke akun LMS siswa.",
    focusHint: "Kode QR terenkripsi per subdomain sekolah untuk validasi status keaktifan siswa.",
    subFeatures: [
      "Generator Otomatis Kartu Warga Belajar dari Master Data Siswa",
      "Kode QR Terverifikasi Unik per Siswa & Subdomain Lembaga",
      "Tampilan Kartu Digital di Akun LMS Siswa & Ekspor Cetak Massal",
      "Pemindaian QR untuk Verifikasi Identitas & Presensi Kegiatan KBM",
    ],
  },
};

export function ModulePlaceholderView({
  moduleId,
  icon: Icon,
  onBackToDashboard,
}: {
  moduleId: DevelopmentModuleId;
  icon: LucideIcon;
  onBackToDashboard: () => void;
}) {
  const mod = DEVELOPMENT_MODULES[moduleId];
  const planBadge =
    mod.requiredPlan === "pro" ? "Paket Pro" : mod.requiredPlan === "reguler" ? "Paket Reguler+" : "Paket Basic+";

  return (
    <section className="dashboard-glass space-y-6 rounded-2xl p-6">
      <DashboardHero
        eyebrow={`${mod.group} · ${planBadge}`}
        title={mod.title}
        description={mod.description}
        action={
          <button type="button" onClick={onBackToDashboard} className="dashboard-hero-action">
            <ArrowLeft size={16} aria-hidden="true" />
            Kembali ke Dashboard
          </button>
        }
      />

      {mod.layout === "grid-3" && mod.highlights && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {mod.highlights.map((card) => (
              <div
                key={card.title}
                className="flex flex-col justify-between rounded-2xl border border-white bg-white/90 p-5 text-slate-900 shadow-xs backdrop-blur-md"
              >
                <div>
                  <span className="inline-flex rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-800">
                    {card.badge}
                  </span>
                  <h3 className="mt-3 text-base font-bold text-slate-900">{card.title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600">{card.detail}</p>
                </div>
                <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-800">
                  <Clock size={13} aria-hidden="true" />
                  Modul Siap Dikembangkan
                </p>
              </div>
            ))}
          </div>

          <SubFeaturesPanel mod={mod} icon={Icon} planBadge={planBadge} />
        </div>
      )}

      {mod.layout === "snp-list" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white bg-white/90 p-6 text-slate-900 shadow-xs backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Instrumen 8 Standar Nasional Pendidikan</h3>
                  <p className="text-xs text-slate-600">Pratinjau progres kesiapan struktur 8 SNP lembaga PKBM</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-900">
                <Clock size={14} aria-hidden="true" />
                Modul Siap Dikembangkan
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {SNP_STANDARDS.map((snp) => (
                <div
                  key={snp.code}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/90 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold text-indigo-900">
                        {snp.code}
                      </span>
                      <p className="truncate text-sm font-bold text-slate-900">{snp.name}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{snp.desc}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 sm:w-52">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                        style={{ width: `${snp.readiness}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-extrabold text-indigo-900">{snp.readiness}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SubFeaturesPanel mod={mod} icon={Icon} planBadge={planBadge} />
        </div>
      )}

      {mod.layout === "center-focus" && (
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-2xl border border-white bg-white/90 p-6 text-slate-900 shadow-xs backdrop-blur-md">
            <div className="flex flex-col items-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-md">
                <Icon size={26} aria-hidden="true" />
              </span>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-extrabold text-sky-900">
                <Clock size={13} aria-hidden="true" />
                Modul Siap Dikembangkan · {planBadge}
              </span>
              <h3 className="mt-3 text-xl font-bold text-slate-900">{mod.title}</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{mod.pkbmRoleNote}</p>
              {mod.focusHint && (
                <div className="mt-4 w-full rounded-xl border border-indigo-100 bg-indigo-50/75 px-4 py-3 text-xs font-semibold text-indigo-950">
                  {mod.focusHint}
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Sparkles size={16} className="text-indigo-600" aria-hidden="true" />
                Daftar Sub-Fitur yang Akan Diaktifkan
              </h4>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {mod.subFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/90 p-3.5 text-xs font-medium leading-5 text-slate-800"
                  >
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SubFeaturesPanel({
  mod,
  icon: Icon,
  planBadge,
}: {
  mod: DevelopmentModuleConfig;
  icon: LucideIcon;
  planBadge: string;
}) {
  return (
    <div className="rounded-2xl border border-white bg-white/90 p-6 text-slate-900 shadow-xs backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <Icon size={19} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-700">Fungsi Utama PKBM</p>
            <p className="text-sm font-bold text-slate-900">{mod.pkbmRoleNote}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-900">
          <Layers size={13} aria-hidden="true" />
          {planBadge}
        </span>
      </div>

      <h4 className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-900">
        <Sparkles size={16} className="text-indigo-600" aria-hidden="true" />
        Daftar Sub-Fitur yang Akan Diaktifkan
      </h4>
      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {mod.subFeatures.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/90 p-3.5 text-xs font-medium leading-5 text-slate-800"
          >
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
