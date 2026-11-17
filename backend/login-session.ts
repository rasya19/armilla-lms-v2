import { createHash, randomBytes } from "crypto";
import { prisma } from "./db.js";
import { isLoginAccountUnchanged, type LockedAccount, type LoginAccount } from "./login-session-validation.js";
import { tenantAccessible } from "./tenant-access.js";

export async function createLoginSession(account: LoginAccount, expiresAt: Date): Promise<string | null> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const created = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<LockedAccount[]>`
      SELECT "passwordHash", "aktif", "peran", "sekolahId" FROM "Akun" WHERE "id" = ${account.id} FOR UPDATE
    `;
    if (!isLoginAccountUnchanged(account, locked[0])) return false;
    if (account.peran !== "MASTER_ADMIN") {
      if (!account.sekolahId) return false;
      const schools = await tx.$queryRaw<{ status: "ACTIVE" | "SUSPENDED"; expiresAt: Date | null }[]>`
        SELECT "status", "expiresAt" FROM "Sekolah" WHERE "id" = ${account.sekolahId} FOR UPDATE
      `;
      if (!tenantAccessible(schools[0] ?? null)) return false;
    }
    await tx.sesiAkun.create({ data: { akunId: account.id, tokenHash, expiresAt } });
    return true;
  });
  return created ? token : null;
}
