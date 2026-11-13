import { createHash, randomBytes } from "crypto";
import { prisma } from "./db.js";
import { isLoginAccountUnchanged, type LockedAccount, type LoginAccount } from "./login-session-validation.js";

export async function createLoginSession(account: LoginAccount, expiresAt: Date): Promise<string | null> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const created = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<LockedAccount[]>`
      SELECT "passwordHash", "aktif", "peran", "sekolahId" FROM "Akun" WHERE "id" = ${account.id} FOR UPDATE
    `;
    if (!isLoginAccountUnchanged(account, locked[0])) return false;
    await tx.sesiAkun.create({ data: { akunId: account.id, tokenHash, expiresAt } });
    return true;
  });
  return created ? token : null;
}
