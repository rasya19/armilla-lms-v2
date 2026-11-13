import { strict as assert } from "node:assert";
import { test } from "node:test";
import { generateTemporaryPassword, hashPassword, isValidPasswordLength, verifyPassword } from "./password.js";

test("temporary passwords use 144 random bits and URL-safe characters", () => {
  const first = generateTemporaryPassword();
  const second = generateTemporaryPassword();
  assert.match(first, /^[A-Za-z0-9_-]{24}$/);
  assert.match(second, /^[A-Za-z0-9_-]{24}$/);
  assert.notEqual(first, second);
});

test("master password length must be between 6 and 1024 characters", () => {
  assert.equal(isValidPasswordLength("a".repeat(5)), false);
  assert.equal(isValidPasswordLength("a".repeat(6)), true);
  assert.equal(isValidPasswordLength("a".repeat(1024)), true);
  assert.equal(isValidPasswordLength("a".repeat(1025)), false);
});

test("password hashes are salted and validate only the original password", async () => {
  const first = await hashPassword("kata sandi untuk pengujian");
  const second = await hashPassword("kata sandi untuk pengujian");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("kata sandi untuk pengujian", first), true);
  assert.equal(await verifyPassword("kata sandi berbeda", first), false);
  assert.equal(await verifyPassword("kata sandi untuk pengujian", "invalid"), false);
});
