export type TenantPlan = "basic" | "reguler" | "pro";

const PLAN_RANK: Record<TenantPlan, number> = {
  basic: 1,
  reguler: 2,
  pro: 3,
};

export function normalizeTenantPlan(value: string | null | undefined): TenantPlan {
  const normalized = value?.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") ?? "";
  if (!normalized) return "basic";
  if (/\b(pro|enterprise|premium|gold|ultimate)\b/.test(normalized)) {
    return "pro";
  }
  if (/\b(reguler|regular|silver)\b/.test(normalized)) {
    return "reguler";
  }
  if (/\b(basic|standar|standard|starter|free|gratis)\b/.test(normalized)) {
    return "basic";
  }
  if (/\btahunan\b/.test(normalized)) {
    return "pro";
  }
  return "basic";
}

export function hasPlanAccess(currentPlan: TenantPlan, requiredPlan: TenantPlan): boolean {
  return PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan];
}
