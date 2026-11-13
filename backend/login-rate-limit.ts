import { createHmac } from "crypto";
import { isIP } from "net";
import type { Pool } from "pg";

export function rateLimitSecret(value: string | undefined): string {
  if (!value || !/^[a-f0-9]{64,}$/i.test(value)) throw new Error("LOGIN_RATE_LIMIT_SECRET harus berupa minimal 32 byte acak dalam format hex.");
  return value;
}

export function loginClientIp(production: boolean, vercel: boolean, clientIp: string | undefined, forwardedIp: string | undefined): string {
  if (production && !vercel) throw new Error("Pembatas login produksi hanya mendukung Vercel.");
  const ip = production ? forwardedIp : clientIp;
  if (!ip || !isIP(ip)) throw new Error("Alamat IP pembatas login tidak valid.");
  return ip;
}

export type LoginResult<T> =
  | { kind: "success"; value: T }
  | { kind: "failure" }
  | { kind: "limited"; retryAfter: number };

export function loginRateLimit(pool: Pool, secret: string, options: { cleanup?: boolean } = {}) {
  const digest = (kind: string, value: string) => createHmac("sha256", secret).update(`failed-v1\0${kind}\0${value}`).digest("hex");
  return async function <T>(ip: string, identity: string, authenticate: () => Promise<LoginResult<T>>): Promise<LoginResult<T>> {
    if (!isIP(ip)) throw new Error("Alamat IP pembatas login tidak valid.");
    const keys = [digest("ip", ip), digest("identity", identity.trim().toLowerCase())];
    const client = await pool.connect();
    let inTransaction = false;
    let discarded = false;
    try {
      await client.query("BEGIN");
      inTransaction = true;
      await client.query("SET LOCAL lock_timeout = '10s'");
      // IP first, then identity: concurrent attempts cannot pass a stale failure count.
      for (const key of keys) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
      const current = await client.query<{ key: string; count: number; remaining: number }>(`
        SELECT "key", "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - clock_timestamp()))))::integer AS remaining
        FROM "LoginRateLimit" WHERE "key" = ANY($1::text[]) AND "expiresAt" > clock_timestamp()
      `, [keys]);
      const blocked = current.rows.filter((row) => row.count >= (row.key === keys[0] ? 500 : 10));
      if (blocked.length) {
        await client.query("COMMIT");
        inTransaction = false;
        return { kind: "limited", retryAfter: Math.max(...blocked.map((row) => row.remaining)) };
      }
      const result = await authenticate();
      if (result.kind === "failure") {
        await client.query(`
          INSERT INTO "LoginRateLimit" ("key", "count", "expiresAt")
          SELECT k, 1, clock_timestamp() + interval '15 minutes' FROM unnest($1::text[]) AS k
          ON CONFLICT ("key") DO UPDATE SET
            "count" = CASE WHEN "LoginRateLimit"."expiresAt" <= clock_timestamp() THEN 1 ELSE LEAST("LoginRateLimit"."count" + 1, 2147483647) END,
            "expiresAt" = CASE WHEN "LoginRateLimit"."expiresAt" <= clock_timestamp() THEN clock_timestamp() + interval '15 minutes' ELSE "LoginRateLimit"."expiresAt" END
        `, [keys]);
      }
      await client.query("COMMIT");
      inTransaction = false;
      if (options.cleanup !== false && Math.random() < 0.01) {
        try {
          await client.query(`DELETE FROM "LoginRateLimit" WHERE "key" IN (SELECT "key" FROM "LoginRateLimit" WHERE "expiresAt" < now() - interval '1 day' LIMIT 1000)`);
        } catch (error) {
          console.error("Gagal membersihkan pembatas login kedaluwarsa:", error);
        }
      }
      return result;
    } catch (error) {
      if (inTransaction) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          client.release(true);
          discarded = true;
          console.error("Gagal membatalkan transaksi pembatas login:", rollbackError);
          throw error;
        }
      }
      throw error;
    } finally {
      if (!discarded) client.release();
    }
  };
}
