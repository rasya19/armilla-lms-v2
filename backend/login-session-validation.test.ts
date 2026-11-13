import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isLoginAccountUnchanged, type LoginAccount, type LockedAccount } from "./login-session-validation.js";

test("session creation revalidates account state after password verification", () => {
  const account: LoginAccount = { id: "test", passwordHash: "old", peran: "ADMIN", sekolahId: "school-a" };
  const current: LockedAccount = { passwordHash: "old", aktif: true, peran: "ADMIN", sekolahId: "school-a" };
  assert.equal(isLoginAccountUnchanged(account, current), true);
  assert.equal(isLoginAccountUnchanged(account, undefined), false);
  for (const change of [{ aktif: false }, { passwordHash: "new" }, { peran: "MASTER_ADMIN" }, { sekolahId: "school-b" }, { sekolahId: null }]) {
    assert.equal(isLoginAccountUnchanged(account, { ...current, ...change }), false);
  }
});
