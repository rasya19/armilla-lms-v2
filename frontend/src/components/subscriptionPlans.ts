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
    tagline: 'Operasional dasar digital untuk PKBM & lembaga pendidikan yang mulai bertumbuh.',
    price: 'Rp 150.000',
    period: '/ bulan',
    annualPrice: 1500000,
    annualPriceLabel: 'Rp 1.500.000 / tahun',
    billingNote: 'Ditagih Rp 1.500.000 / tahun (Aktif 12 Bulan)',
    badge: 'Hemat 2 Bulan',
    features: [
      'Dashboard, PPDB Online, Data Siswa, Guru & Verval Dapodik',
      'Manajemen Kelas, Kelola Mapel & Bobot SKK Kesetaraan',
      'Ruang Belajar: Materi Ajar, Tugas, Presensi & Diskusi',
      'Profil & Identitas Sekolah dengan tema seragam platform',
    ],
  },
  {
    slug: 'reguler',
    planValue: 'Reguler',
    name: 'Paket Reguler',
    tagline: 'Skala penuh untuk lembaga berkembang dengan Ujian Online CBT dan E-Raport digital.',
    price: 'Rp 175.000',
    period: '/ bulan',
    annualPrice: 1750000,
    annualPriceLabel: 'Rp 1.750.000 / tahun',
    billingNote: 'Ditagih Rp 1.750.000 / tahun (Aktif 12 Bulan)',
    badge: 'Pilihan Populer • Hemat 2 Bulan',
    popular: true,
    features: [
      'Seluruh fitur Paket Basic',
      'Ujian Online CBT (Bank Soal, Jadwal & Token, Monitoring)',
      'Cek & Cetak E-Raport serta Kartu Pelajar Digital QR',
      'Impor siswa massal Excel & kenaikan kelas otomatis',
    ],
  },
  {
    slug: 'pro',
    planValue: 'Pro',
    name: 'Paket Pro',
    tagline: 'Solusi lengkap manajemen keuangan, akreditasi SNP, alumni, sarpras, dan Asisten AI.',
    price: 'Rp 200.000',
    period: '/ bulan',
    annualPrice: 2000000,
    annualPriceLabel: 'Rp 2.000.000 / tahun',
    billingNote: 'Ditagih Rp 2.000.000 / tahun (Aktif 12 Bulan)',
    badge: 'Hemat 2 Bulan',
    features: [
      'Seluruh fitur Paket Reguler',
      'Keuangan & SPP, Data Alumni & Tracer Study',
      'Manajemen Aset & Sarpras serta Akreditasi 8 SNP',
      'Asisten Belajar AI & pengaturan lanjutan tenant',
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
