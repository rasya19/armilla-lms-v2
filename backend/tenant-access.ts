export function tenantAccessible(tenant: { status: "ACTIVE" | "SUSPENDED"; expiresAt: Date | null } | null, now = new Date()): boolean {
  return tenant !== null && tenant.status === "ACTIVE" && (tenant.expiresAt === null || tenant.expiresAt > now);
}
