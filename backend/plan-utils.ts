export type TenantPlan = "basic" | "reguler" | "pro";

const PLAN_RANK: Record<TenantPlan, number> = {
  basic: 1,
  reguler: 2,
  pro: 3,
};

export function normalizeTenantPlan(value: string | null | undefined): TenantPlan {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  if (
    normalized === "reguler" ||
    normalized === "paket reguler" ||
    normalized === "regular" ||
    normalized === "paket regular"
  ) {
    return "reguler";
  }
  if (
    normalized === "pro" ||
    normalized === "paket pro" ||
    normalized === "tahunan" ||
    normalized === "paket tahunan" ||
    normalized === "enterprise" ||
    normalized === "paket enterprise"
  ) {
    return "pro";
  }
  return "basic";
}

export function hasPlanAccess(currentPlan: TenantPlan, requiredPlan: TenantPlan): boolean {
  return PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan];
}
