import { createHmac, randomUUID } from "crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import type { Pool } from "pg";
import { loginClientIp } from "./login-rate-limit.js";
import { parseRegistration } from "./school-registration.js";

type Registration = NonNullable<ReturnType<typeof parseRegistration>>;
type LimitResult = { allowed: boolean; retryAfter: number };

export function registrationLimitKey(secret: string, ip: string): string {
  return createHmac("sha256", secret).update(`registration-v1\0${ip}`).digest("hex");
}

export function registrationRateLimit(pool: Pool, secret: string) {
  return async (ip: string): Promise<LimitResult> => {
    const key = registrationLimitKey(secret, ip);
    const result = await pool.query<{ count: number; remaining: number }>(`
      INSERT INTO "LoginRateLimit" ("key", "count", "expiresAt")
      VALUES ($1, 1, clock_timestamp() + interval '1 hour')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "LoginRateLimit"."expiresAt" <= clock_timestamp() THEN 1 ELSE LEAST("LoginRateLimit"."count" + 1, 2147483647) END,
        "expiresAt" = CASE WHEN "LoginRateLimit"."expiresAt" <= clock_timestamp() THEN clock_timestamp() + interval '1 hour' ELSE "LoginRateLimit"."expiresAt" END
      RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - clock_timestamp()))))::integer AS remaining
    `, [key]);
    const row = result.rows[0];
    if (!row) throw new Error("Pembatas pendaftaran tidak mengembalikan hasil.");
    if (Math.random() < 0.01) {
      try {
        await pool.query(`DELETE FROM "LoginRateLimit" WHERE "key" IN (SELECT "key" FROM "LoginRateLimit" WHERE "expiresAt" < now() - interval '1 day' LIMIT 1000)`);
      } catch (error) {
        console.error("Gagal membersihkan pembatas pendaftaran kedaluwarsa:", error instanceof Error ? error.name : "UnknownError");
      }
    }
    return { allowed: row.count <= 5, retryAfter: row.remaining };
  };
}

function databaseErrorCode(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") return "REGISTRATION_SCHEMA_ERROR";
    if (error.code === "P2002") return "REGISTRATION_CONFLICT";
    if (error.code === "P1001" || error.code === "P1002" || error.code === "P1017") return "REGISTRATION_DATABASE_UNAVAILABLE";
    return "REGISTRATION_DATABASE_ERROR";
  }
  if (error instanceof Prisma.PrismaClientInitializationError) return "REGISTRATION_DATABASE_UNAVAILABLE";
  return "REGISTRATION_SAVE_FAILED";
}

export function registrationRoutes(options: {
  production: boolean;
  vercel: boolean;
  limit: (ip: string) => Promise<LimitResult>;
  save: (data: Registration) => Promise<void>;
}) {
  const router = Router();
  router.post("/", async (req, res) => {
    let ip: string;
    try {
      ip = loginClientIp(options.production, options.vercel, req.ip, req.get("x-vercel-forwarded-for"));
    } catch (error) {
      console.error("Pendaftaran sekolah: identifikasi IP gagal:", error instanceof Error ? error.message : "UnknownError");
      return res.status(503).json({ error: "Perlindungan pendaftaran tidak tersedia.", code: "REGISTRATION_IP_UNAVAILABLE" });
    }
    try {
      const result = await options.limit(ip);
      if (!result.allowed) {
        res.setHeader("Retry-After", String(result.retryAfter));
        return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi nanti.", code: "REGISTRATION_RATE_LIMITED" });
      }
    } catch (error) {
      const reference = randomUUID();
      console.error("Pendaftaran sekolah: pembatas database gagal", { reference, errorType: error instanceof Error ? error.name : "UnknownError" });
      return res.status(503).json({ error: "Perlindungan pendaftaran tidak tersedia.", code: "REGISTRATION_LIMIT_UNAVAILABLE", reference });
    }
    const data = parseRegistration(req.body);
    if (!data) return res.status(400).json({ error: "Periksa kembali nama sekolah, kontak, email, telepon, dan NPSN (8 angka atau huruf P/K diikuti 7 angka jika diisi).", code: "REGISTRATION_INVALID" });
    try {
      await options.save(data);
      return res.status(201).json({ message: "Pendaftaran diterima dan menunggu pemeriksaan master admin." });
    } catch (error) {
      const reference = randomUUID();
      const code = databaseErrorCode(error);
      const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
      console.error("Pendaftaran sekolah: penyimpanan database gagal", { reference, code, prismaCode, errorType: error instanceof Error ? error.name : "UnknownError" });
      return res.status(code === "REGISTRATION_CONFLICT" ? 409 : 503).json({ error: "Pendaftaran belum dapat disimpan. Coba lagi nanti.", code, reference });
    }
  });
  return router;
}
