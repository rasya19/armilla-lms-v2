export const ADMIN_WA_NUMBER = '6287713737477';
export const ADMIN_WA_DISPLAY = '0877-1373-7477';

export function buildAdminWhatsappUrl(message?: string): string {
  const text =
    message ||
    'Halo Admin SIPUT PKBM, saya ingin mendapatkan informasi lebih lanjut mengenai pemesanan paket langganan.';
  return `https://wa.me/${ADMIN_WA_NUMBER}?text=${encodeURIComponent(text)}`;
}

export type PlanSlug = 'basic' | 'reguler' | 'pro';

export type SubscriptionPlan = {
  slug: PlanSlug;
  planValue: 'Basic' | 'Reguler' | 'Pro';
  name: string;
  tagline: string;
  price: string;
  period: string;
  annualPrice: number;
  annualPriceLabel: string;
  billingNote: string;
  badge: string;
  popular?: boolean;
  features: string[];
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    slug: 'basic',
    planValue: 'Basic',
    name: 'Paket Basic',
    tagline: 'Operasional harian & KBM digital lengkap untuk PKBM yang mulai bertumbuh (tanpa fitur generatif AI).',
    price: 'Rp 150.000',
    period: '/ bulan',
    annualPrice: 1500000,
    annualPriceLabel: 'Rp 1.500.000 / tahun',
    billingNote: 'Ditagih Rp 1.500.000 / tahun (Aktif 12 Bulan)',
    badge: 'Hemat 2 Bulan',
    features: [
      'Website Profil PKBM + Subdomain khusus lembaga',
      'PPDB Online & Verval Siswa / Dapodik (+ Pas Foto Ijazah 4×6)',
      'Master Data lengkap (Siswa, Guru/Tutor, Kelas, Mapel & Bobot SKK)',
      'Portal LMS Guru & Warga Belajar (Materi, Tugas, Presensi, Diskusi & Bank Modul 102 Kemendikdasmen)',
    ],
  },
  {
    slug: 'reguler',
    planValue: 'Reguler',
    name: 'Paket Reguler',
    tagline: 'Skala penuh untuk evaluasi resmi CBT, E-Raport Kurikulum Merdeka, Transkrip, Agenda Surat & layanan QR (tanpa fitur AI).',
    price: 'Rp 175.000',
    period: '/ bulan',
    annualPrice: 1750000,
    annualPriceLabel: 'Rp 1.750.000 / tahun',
    billingNote: 'Ditagih Rp 1.750.000 / tahun (Aktif 12 Bulan)',
    badge: 'Pilihan Populer • Hemat 2 Bulan',
    popular: true,
    features: [
      'Seluruh fitur Paket Basic + Impor Siswa Excel & Kenaikan Kelas Massal',
      'Ujian Online CBT (Bank Soal, Impor Word/Excel, Jadwal & Token, Cetak Naskah, Monitoring)',
      'E-Raport Kurikulum Merdeka, Leger 1–6, Transkrip Nilai & Terbitkan ke Siswa',
      'Agenda Surat (Masuk & Keluar) terintegrasi penomoran otomatis Transkrip Nilai',
      'Kop Surat Resmi Lembaga, Kartu Pelajar Digital QR & Buku Tamu Digital QR',
    ],
  },
  {
    slug: 'pro',
    planValue: 'Pro',
    name: 'Paket Pro',
    tagline: 'Solusi lengkap AI Gemini (kuota wajar bulanan), keuangan, akreditasi 8 SNP, sarpras & alumni.',
    price: 'Rp 200.000',
    period: '/ bulan',
    annualPrice: 2000000,
    annualPriceLabel: 'Rp 2.000.000 / tahun',
    billingNote: 'Ditagih Rp 2.000.000 / tahun (Aktif 12 Bulan)',
    badge: 'Terlengkap • AI Gemini + Akreditasi',
    features: [
      'Seluruh fitur Paket Reguler + Kustomisasi Tema Warna Portal',
      'Generator Soal CBT AI Gemini (25x generate/bln) & Asisten Belajar AI (400 pesan/bln, reset tiap tgl 1)',
      'Opsi API Key Gemini mandiri lembaga (cadangan otomatis jika kuota bulanan habis)',
      'Keuangan & SPP Digital, Akreditasi 8 SNP, Manajemen Aset/Sarpras & Alumni/Tracer Study',
    ],
  },
];

export const PLAN_RANK: Record<PlanSlug, number> = {
  basic: 1,
  reguler: 2,
  pro: 3,
};

export function resolvePlanSlug(value: string | null | undefined): PlanSlug {
  const normalized = value?.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ') ?? '';
  if (!normalized) return 'basic';
  if (/\b(pro|enterprise|premium|gold|ultimate)\b/.test(normalized)) {
    return 'pro';
  }
  if (/\b(reguler|regular|silver)\b/.test(normalized)) {
    return 'reguler';
  }
  if (/\b(basic|standar|standard|starter|free|gratis)\b/.test(normalized)) {
    return 'basic';
  }
  if (/\btahunan\b/.test(normalized)) {
    return 'pro';
  }
  return 'basic';
}

export function hasPlanAccess(currentPlan: PlanSlug, requiredPlan: PlanSlug): boolean {
  return PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan];
}

export function getPlanBySlug(slug: PlanSlug): SubscriptionPlan {
  return SUBSCRIPTION_PLANS.find((plan) => plan.slug === slug) ?? SUBSCRIPTION_PLANS[0];
}
