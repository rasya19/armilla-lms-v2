import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resetSchoolAdminPassword } from "./reset-school-admin-password.js";

test("reset changes only an active school admin and revokes sessions transactionally", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma, pool, loginPool } = await import("./db.js");
  let account: { id: string; peran: string; aktif: boolean; sekolahId: string | null; passwordHash: string } | null = {
    id: "admin-id", peran: "ADMIN", aktif: true, sekolahId: "school-id", passwordHash: "old-hash",
  };
  let updated = 0;
  let revoked = 0;
  let changedConcurrently = false;
  let revokeFails = false;
  const tx = {
    akun: {
      findUnique: async (args: { where: { email: string } }) => {
        assert.equal(args.where.email, "admin@example.invalid");
        return account;
      },
      updateMany: async (args: { where: { passwordHash: string; peran: string; sekolahId: string }; data: { passwordHash: string; wajibGantiPassword: boolean } }) => {
        assert.equal(args.where.passwordHash, "old-hash");
        assert.equal(args.where.peran, "ADMIN");
        assert.equal(args.where.sekolahId, "school-id");
        assert.deepEqual(args.data, { passwordHash: "new-hash", wajibGantiPassword: false });
        if (changedConcurrently) return { count: 0 };
        updated++;
        return { count: 1 };
      },
    },
    sesiAkun: {
      updateMany: async (args: { where: { akunId: string; revokedAt: null }; data: { revokedAt: Date } }) => {
        assert.deepEqual(args.where, { akunId: "admin-id", revokedAt: null });
        assert.ok(args.data.revokedAt instanceof Date);
        if (revokeFails) throw new Error("session revocation failed");
        revoked++;
        return { count: 1 };
      },
    },
  };
  Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (callback: (client: typeof tx) => Promise<boolean>) => callback(tx) });
  try {
    assert.equal(await resetSchoolAdminPassword(prisma, "admin@example.invalid", "new-hash"), true);
    assert.equal(updated, 1);
    assert.equal(revoked, 1);
    for (const invalid of [null, { ...account, peran: "MASTER_ADMIN" }, { ...account, aktif: false }, { ...account, sekolahId: null }]) {
      account = invalid;
      assert.equal(await resetSchoolAdminPassword(prisma, "admin@example.invalid", "new-hash"), false);
    }
    assert.equal(updated, 1);
    assert.equal(revoked, 1);
    account = { id: "admin-id", peran: "ADMIN", aktif: true, sekolahId: "school-id", passwordHash: "old-hash" };
    changedConcurrently = true;
    assert.equal(await resetSchoolAdminPassword(prisma, "admin@example.invalid", "new-hash"), false);
    assert.equal(revoked, 1);
    changedConcurrently = false;
    revokeFails = true;
    await assert.rejects(() => resetSchoolAdminPassword(prisma, "admin@example.invalid", "new-hash"), /session revocation failed/);
  } finally {
    await prisma.$disconnect();
    await Promise.all([pool.end(), loginPool.end()]);
  }
});
