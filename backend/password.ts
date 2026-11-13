import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);

export function generateTemporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}

export function isValidPasswordLength(password: string): boolean {
  return password.length >= 6 && password.length <= 1024;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, hash, extra] = stored.split("$");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(hash || "") || extra !== undefined) {
    return false;
  }
  const expected = Buffer.from(hash, "hex");
  const actual = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(actual, expected);
}
