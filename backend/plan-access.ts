export type PlanTier = "basic" | "reguler" | "pro";

export function isPlanTier(value: unknown): value is PlanTier {
  return value === "basic" || value === "reguler" || value === "pro";
}

export function canAccessPlan(current: unknown, required: PlanTier): boolean {
  const rank: Record<PlanTier, number> = { basic: 0, reguler: 1, pro: 2 };
  return isPlanTier(current) && rank[current] >= rank[required];
}
