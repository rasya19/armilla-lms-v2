import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { randomUUID } from "crypto";
import { prisma, pool } from "./db.js";
import { hashPassword, isValidPasswordLength } from "./password.js";
import { readPassword } from "./read-password.js";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Pembuatan manual hanya tersedia untuk pengujian lokal.");
  if (!stdin.isTTY) throw new Error("Gunakan terminal interaktif.");
  const rl = createInterface({ input: stdin, output: stdout });
  const registrationId = (await rl.question("ID pendaftaran sekolah yang disetujui: ")).trim();
  rl.close();
  const registration = await prisma.pendaftaranSekolah.findUnique({ where: { id: registrationId } });
  if (!registration || registration.status !== "DISETUJUI" || registration.sekolahId) throw new Error("Pendaftaran tidak ditemukan, belum disetujui, atau sudah dibuatkan sekolah.");
  const password = await readPassword();
  if (!isValidPasswordLength(password)) throw new Error("Kata sandi harus 6–1024 karakter.");
  if (password !== await readPassword()) throw new Error("Kata sandi tidak cocok.");
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const slug = `sekolah-${randomUUID()}`;
    const school = await tx.sekolah.create({ data: { nama: registration.namaSekolah, npsn: registration.npsn, slug } });
    const claimed = await tx.pendaftaranSekolah.updateMany({ where: { id: registration.id, status: "DISETUJUI", sekolahId: null }, data: { sekolahId: school.id } });
    if (claimed.count !== 1) throw new Error("Pendaftaran telah berubah; pembuatan dibatalkan.");
    await tx.akun.create({ data: { sekolahId: school.id, nama: registration.namaKontak, email: registration.emailKontak, passwordHash, peran: "ADMIN" } });
  });
  console.log("Sekolah dan akun admin berhasil dibuat untuk pengujian lokal.");
}

main().catch((error) => {
  console.error("Akun tidak dibuat:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); await pool.end(); });
