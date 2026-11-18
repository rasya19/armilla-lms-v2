import type { PrismaClient } from "@prisma/client";

export async function resetSchoolAdminPassword(prisma: PrismaClient, email: string, passwordHash: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const account = await tx.akun.findUnique({
      where: { email },
      select: { id: true, peran: true, aktif: true, sekolahId: true, passwordHash: true },
    });
    if (!account || account.peran !== "ADMIN" || !account.aktif || !account.sekolahId) return false;
    const updated = await tx.akun.updateMany({
      where: { id: account.id, email, peran: "ADMIN", aktif: true, sekolahId: account.sekolahId, passwordHash: account.passwordHash },
      data: { passwordHash, wajibGantiPassword: false },
    });
    if (updated.count !== 1) return false;
    await tx.sesiAkun.updateMany({ where: { akunId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return true;
  });
}
