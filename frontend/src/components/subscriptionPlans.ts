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
      'Subdomain khusus lembaga (*.pkbm.siput.id)',
      'Manajemen data siswa, guru, & kelas standar',
      'Formulir PPDB online & peninjauan pendaftar',
      'Ruang KBM: jadwal, materi ajar, tugas & presensi',
    ],
  },
  {
    slug: 'reguler',
    planValue: 'Reguler',
    name: 'Paket Reguler',
    tagline: 'Skala penuh untuk lembaga berkembang dengan banyak rombel dan kebutuhan impor data.',
    price: 'Rp 175.000',
    period: '/ bulan',
    annualPrice: 1750000,
    annualPriceLabel: 'Rp 1.750.000 / tahun',
    billingNote: 'Ditagih Rp 1.750.000 / tahun (Aktif 12 Bulan)',
    badge: 'Pilihan Populer • Hemat 2 Bulan',
    popular: true,
    features: [
      'Seluruh fitur Paket Basic',
      'Impor siswa massal Excel (format Dapodik)',
      'Penempatan & kenaikan kelas massal otomatis',
      'Evaluasi nilai & pemantauan aktivitas belajar',
    ],
  },
  {
    slug: 'pro',
    planValue: 'Pro',
    name: 'Paket Pro',
    tagline: 'Solusi lengkap dengan kustomisasi tampilan lembaga dan dukungan teknis prioritas.',
    price: 'Rp 200.000',
    period: '/ bulan',
    annualPrice: 2000000,
    annualPriceLabel: 'Rp 2.000.000 / tahun',
    billingNote: 'Ditagih Rp 2.000.000 / tahun (Aktif 12 Bulan)',
    badge: 'Hemat 2 Bulan',
    features: [
      'Seluruh fitur Paket Reguler',
      'Kustomisasi tema dashboard lembaga terpusat',
      'Pendampingan onboarding & migrasi data lembaga',
      'Dukungan teknis prioritas & konsultasi berkala',
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
