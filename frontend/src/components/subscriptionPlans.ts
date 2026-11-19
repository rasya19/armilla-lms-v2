export type PlanSlug = 'standar' | 'pro' | 'tahunan';

export type SubscriptionPlan = {
  slug: PlanSlug;
  planValue: 'Standar' | 'Pro' | 'Tahunan';
  name: string;
  tagline: string;
  price: string;
  period: string;
  duration: string;
  badge?: string;
  popular?: boolean;
  features: string[];
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    slug: 'standar',
    planValue: 'Standar',
    name: 'Paket Standar',
    tagline: 'Fondasi digital untuk lembaga & PKBM yang mulai beroperasi.',
    price: 'Rp 299.000',
    period: '/ bulan',
    duration: 'Langganan Bulanan (30 Hari)',
    features: [
      'Subdomain khusus lembaga (*.pkbm.siput.id)',
      'Manajemen data siswa, guru, & kelas standar',
      'Formulir PPDB online & peninjauan pendaftar',
      'Ruang KBM: jadwal, materi ajar, tugas & presensi',
    ],
  },
  {
    slug: 'pro',
    planValue: 'Pro',
    name: 'Paket Pro',
    tagline: 'Skala penuh untuk lembaga berkembang dengan banyak rombel.',
    price: 'Rp 549.000',
    period: '/ bulan',
    duration: 'Langganan Bulanan (30 Hari)',
    badge: 'Pilihan Populer',
    popular: true,
    features: [
      'Seluruh fitur Paket Standar',
      'Impor siswa massal Excel (format Dapodik)',
      'Penempatan & kenaikan kelas massal otomatis',
      'Kustomisasi tema dashboard & dukungan prioritas',
    ],
  },
  {
    slug: 'tahunan',
    planValue: 'Tahunan',
    name: 'Paket Tahunan',
    tagline: 'Solusi institusi mapan dengan efisiensi biaya jangka panjang.',
    price: 'Rp 4.990.000',
    period: '/ tahun',
    duration: 'Langganan Tahunan (12 Bulan)',
    badge: 'Hemat 2+ Bulan',
    features: [
      'Seluruh fitur Paket Pro untuk 12 bulan penuh',
      'Pengelolaan multi-tahun ajaran & evaluasi nilai',
      'Pendampingan onboarding & migrasi data lembaga',
      'Prioritas SLA & konsultasi teknis berkala',
    ],
  },
];

export function resolvePlanSlug(value: string | null | undefined): PlanSlug {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'pro' || normalized === 'paket pro') return 'pro';
  if (normalized === 'tahunan' || normalized === 'paket tahunan' || normalized === 'enterprise' || normalized === 'paket enterprise') return 'tahunan';
  return 'standar';
}

export function getPlanBySlug(slug: PlanSlug): SubscriptionPlan {
  return SUBSCRIPTION_PLANS.find((plan) => plan.slug === slug) ?? SUBSCRIPTION_PLANS[0];
}
