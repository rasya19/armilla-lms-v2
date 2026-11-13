import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { prisma, pool } from "./db.js";
import { hashPassword, isValidPasswordLength } from "./password.js";
import { readPassword } from "./read-password.js";

async function main() {
  if (!stdin.isTTY) throw new Error("Pembuatan akun harus dijalankan di terminal interaktif.");
  const rl = createInterface({ input: stdin, output: stdout });
  const email = (process.env.MASTER_ADMIN_EMAIL || await rl.question("Email master admin: ")).trim().toLowerCase();
  const nama = (process.env.MASTER_ADMIN_NAME || await rl.question("Nama master admin: ")).trim();
  rl.close();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !nama) throw new Error("Email atau nama tidak valid.");
  console.log(`Membuat akun master untuk ${email}.`);
  const password = await readPassword();
  if (!isValidPasswordLength(password)) throw new Error("Kata sandi harus 6–1024 karakter.");
  const confirmation = await readPassword();
  if (password !== confirmation) throw new Error("Kata sandi tidak cocok.");
  const passwordHash = await hashPassword(password);
  await prisma.akun.create({ data: { email, nama, passwordHash, peran: "MASTER_ADMIN" } });
  console.log("Akun master admin berhasil dibuat.");
}

main().catch((error) => {
  console.error("Akun tidak dibuat:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
