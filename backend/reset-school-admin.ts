import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { prisma, pool, loginPool } from "./db.js";
import { hashPassword, isValidPasswordLength } from "./password.js";
import { readPassword } from "./read-password.js";
import { resetSchoolAdminPassword } from "./reset-school-admin-password.js";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Reset ini hanya tersedia untuk pengujian lokal.");
  if (!stdin.isTTY) throw new Error("Gunakan terminal interaktif.");
  const rl = createInterface({ input: stdin, output: stdout });
  let email: string;
  let confirmation: string;
  try {
    email = (await rl.question("Email admin sekolah yang terdaftar: ")).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Email tidak valid.");
    console.log("PERHATIAN: Perintah ini mengubah database yang dikonfigurasi untuk backend, termasuk jika database tersebut dipakai bersama deployment lain.");
    confirmation = (await rl.question(`Pastikan database sudah benar. Ketik RESET untuk mereset ${email}: `)).trim();
  } finally {
    rl.close();
  }
  if (confirmation !== "RESET") throw new Error("Reset dibatalkan.");
  const password = await readPassword();
  if (!isValidPasswordLength(password)) throw new Error("Kata sandi harus 6–1024 karakter.");
  if (password !== await readPassword()) throw new Error("Kata sandi tidak cocok.");
  if (!await resetSchoolAdminPassword(prisma, email, await hashPassword(password))) {
    throw new Error("Admin sekolah aktif tidak ditemukan atau akun telah berubah. Periksa email dan database.");
  }
  console.log("Password admin sekolah berhasil direset. Semua sesi akun sebelumnya telah dicabut.");
}

main().catch((error: unknown) => {
  console.error("Password tidak direset:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
  await Promise.all([pool.end(), loginPool.end()]);
});
