export type TenantAccessStatus = {
  status: "ACTIVE" | "SUSPENDED";
  expiresAt?: Date | null;
};

export type TenantBlockReason = "NOT_FOUND" | "SUSPENDED" | "EXPIRED" | null;

export function tenantAccessible(tenant: TenantAccessStatus | null, now = new Date()): boolean {
  return tenant !== null && tenant.status === "ACTIVE" && (tenant.expiresAt == null || tenant.expiresAt > now);
}

export function tenantBlockReason(tenant: TenantAccessStatus | null, now = new Date()): TenantBlockReason {
  if (!tenant) return "NOT_FOUND";
  if (tenant.status !== "ACTIVE") return "SUSPENDED";
  if (tenant.expiresAt != null && tenant.expiresAt <= now) return "EXPIRED";
  return null;
}
