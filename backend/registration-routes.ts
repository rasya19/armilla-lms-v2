import { createHmac, randomUUID } from "crypto";
import { Router } from "express";
import type { ErrorRequestHandler, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import type { Pool } from "pg";
import { loginClientIp } from "./login-rate-limit.js";
import { parseRegistration } from "./school-registration.js";
import { RegistrationDeliveryError } from "./registration-delivery-error.js";

type Registration = NonNullable<ReturnType<typeof parseRegistration>>;
type LimitResult = { allowed: boolean; retryAfter: number };

export function registrationLimitKey(secret: string, ip: string, preview = false, purpose: "registration" | "ppdb" = "registration"): string {
  const namespace = purpose === "ppdb" ? "ppdb-v1" : preview ? "registration-preview-v1" : "registration-short-v1";
  return createHmac("sha256", secret).update(`${namespace}\0${ip}`).digest("hex");
}

export function registrationRateLimit(pool: Pool, secret: string, preview = false, purpose: "registration" | "ppdb" = "registration") {
  return async (ip: string): Promise<LimitResult> => {
    const key = registrationLimitKey(secret, ip, preview, purpose);
    const result = await pool.query<{ count: number; remaining: number }>(`
      INSERT INTO "LoginRateLimit" ("key", "count", "expiresAt")
      VALUES ($1, 1, clock_timestamp() + $2 * interval '1 second')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "LoginRateLimit"."expiresAt" <= clock_timestamp() THEN 1 ELSE LEAST("LoginRateLimit"."count" + 1, 2147483647) END,
        "expiresAt" = CASE WHEN "LoginRateLimit"."expiresAt" <= clock_timestamp() THEN clock_timestamp() + $2 * interval '1 second' ELSE "LoginRateLimit"."expiresAt" END
      RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - clock_timestamp()))))::integer AS remaining
    `, [key, purpose === "ppdb" ? 3600 : 300]);
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

function isMissingColumnError(error: unknown): boolean {
  return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") ||
    (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2022");
}

function formatRupiah(amount: number): string {
  return `Rp ${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export function formatPaketNote(paket?: string, nominalTahunan?: number): string | null {
  if (!paket) return null;
  return typeof nominalTahunan === "number" ? `Paket: ${paket} (${formatRupiah(nominalTahunan)} / tahun)` : `Paket: ${paket}`;
}

export function extractPaketFromNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const match = note.match(/(?:^|\|\s*)Paket:\s*([A-Za-z]+)/);
  return match ? match[1] : null;
}

export type PendaftaranSekolahCreateArgs = {
  data: {
    id: string;
    namaSekolah: string;
    npsn: string;
    wilayah?: string | null;
    namaKontak: string;
    emailKontak: string;
    teleponKontak: string;
    paket?: string;
    catatanTinjauan?: string;
  };
  select: { id: true };
};

export async function saveRegistrationRecord(
  pendaftaranSekolah: { create: (args: PendaftaranSekolahCreateArgs) => Promise<unknown> },
  registrationId: string,
  data: Registration,
): Promise<void> {
  const { nominalTahunan, paket, wilayah, namaSekolah, npsn, namaKontak, emailKontak, teleponKontak } = data;
  const baseRequired = { id: registrationId, namaSekolah, npsn, namaKontak, emailKontak, teleponKontak };
  const paketNote = formatPaketNote(paket, nominalTahunan);
  const wilayahNote = wilayah ? `Wilayah: ${wilayah}` : null;

  try {
    await pendaftaranSekolah.create({
      data: {
        ...baseRequired,
        wilayah,
        ...(paket ? { paket } : {}),
      },
      select: { id: true },
    });
    return;
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
  }

  try {
    await pendaftaranSekolah.create({
      data: {
        ...baseRequired,
        wilayah,
        ...(paketNote ? { catatanTinjauan: paketNote } : {}),
      },
      select: { id: true },
    });
    return;
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
  }

  const combinedNote = [paketNote, wilayahNote].filter((item): item is string => Boolean(item)).join(" | ");
  await pendaftaranSekolah.create({
    data: {
      ...baseRequired,
      ...(combinedNote ? { catatanTinjauan: combinedNote } : {}),
    },
    select: { id: true },
  });
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
  save: (data: Registration, registrationId: string) => Promise<void>;
}) {
  const router = Router();
  async function processRegistration(req: Request, res: Response) {
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
    if (!data) return res.status(400).json({ error: "Periksa kembali nama sekolah, kontak, email, telepon, dan NPSN (wajib: 8 angka atau huruf P/K diikuti 7 angka).", code: "REGISTRATION_INVALID" });
    const registrationId = randomUUID();
    try {
      await options.save(data, registrationId);
      return res.status(201).json({ message: "Pendaftaran diterima Rasyatech Admin dan menunggu verifikasi.", registrationId });
    } catch (error) {
      if (error instanceof RegistrationDeliveryError) {
        console.error("Pendaftaran sekolah: penerusan ke Rasyatech Admin gagal", {
          registrationId,
          code: error.code,
        });
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
          registrationId,
        });
      }
      const reference = randomUUID();
      const code = databaseErrorCode(error);
      const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
      console.error("Pendaftaran sekolah: penyimpanan database gagal", { reference, code, prismaCode, errorType: error instanceof Error ? error.name : "UnknownError" });
      return res.status(code === "REGISTRATION_CONFLICT" ? 409 : 503).json({ error: "Pendaftaran belum dapat disimpan. Coba lagi nanti.", code, reference });
    }
  }
  router.post("/", (req, res, next) => {
    void processRegistration(req, res).catch(next);
  });
  const unexpectedError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    const reference = randomUUID();
    console.error("Pendaftaran sekolah: kesalahan tidak terduga", { reference, errorType: error instanceof Error ? error.name : "UnknownError" });
    if (res.headersSent) return next(error);
    return res.status(503).json({ error: "Pendaftaran belum dapat diproses.", code: "REGISTRATION_UNEXPECTED_ERROR", reference });
  };
  router.use(unexpectedError);
  return router;
}
