import { createHmac } from "crypto";
import type { Request } from "express";
import type { Pool } from "pg";

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

const memoryBuckets = new Map<string, { count: number; expiresAt: number }>();

function checkMemoryBucket(key: string, maxRequests: number, windowSeconds: number): RateLimitDecision {
  const now = Date.now();
  if (memoryBuckets.size > 5000) {
    for (const [k, v] of memoryBuckets) {
      if (v.expiresAt <= now) memoryBuckets.delete(k);
    }
  }
  const existing = memoryBuckets.get(key);
  if (!existing || existing.expiresAt <= now) {
    memoryBuckets.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return { allowed: true };
  }
  if (existing.count >= maxRequests) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)) };
  }
  existing.count += 1;
  return { allowed: true };
}

export function extractRequestIp(req: Request): string {
  const vercelIp = req.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  return vercelIp || forwarded || req.ip || "unknown";
}

/**
 * Shared serverless-safe rate limiter backed by PostgreSQL ("LoginRateLimit" table)
 * with graceful bounded in-memory fallback when database pool is unavailable in dev/tests.
 */
export function createActionRateLimiter(pool: Pool, secret: string) {
  const digest = (namespace: string, subject: string) =>
    createHmac("sha256", secret).update(`action-v1\0${namespace}\0${subject}`).digest("hex");

  return async function checkActionRateLimit(options: {
    namespace: string;
    subject: string;
    maxRequests: number;
    windowSeconds: number;
  }): Promise<RateLimitDecision> {
    const key = digest(options.namespace, options.subject.trim().toLowerCase());
    if (!process.env.DATABASE_URL) {
      return checkMemoryBucket(key, options.maxRequests, options.windowSeconds);
    }
    try {
      const result = await pool.query<{ count: number; remaining: number }>(
        `INSERT INTO "LoginRateLimit" ("key", "count", "expiresAt")
         VALUES ($1, 1, clock_timestamp() + make_interval(secs => $2))
         ON CONFLICT ("key") DO UPDATE SET
           "count" = CASE
             WHEN "LoginRateLimit"."expiresAt" <= clock_timestamp() THEN 1
             ELSE LEAST("LoginRateLimit"."count" + 1, 2147483647)
           END,
           "expiresAt" = CASE
             WHEN "LoginRateLimit"."expiresAt" <= clock_timestamp() THEN clock_timestamp() + make_interval(secs => $2)
             ELSE "LoginRateLimit"."expiresAt"
           END
         RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - clock_timestamp()))))::integer AS remaining`,
        [key, options.windowSeconds],
      );
      const row = result.rows[0];
      if (row && row.count > options.maxRequests) {
        return { allowed: false, retryAfter: row.remaining };
      }
      return { allowed: true };
    } catch {
      // Fallback to bounded in-memory limiter if DB is temporarily unreachable
      return checkMemoryBucket(key, options.maxRequests, options.windowSeconds);
    }
  };
}
