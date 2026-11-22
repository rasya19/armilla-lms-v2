import type { Request } from "express";

export type RateLimitResult =
  | { allowed: true; remaining: number; retryAfter: 0 }
  | { allowed: false; remaining: 0; retryAfter: number };

type Bucket = {
  count: number;
  resetAt: number;
};

export interface MemoryRateLimiter {
  check(key: string, now?: number): RateLimitResult;
  hit(key: string, now?: number): RateLimitResult;
  reset(key: string): void;
  clearAll(): void;
}

export function createMemoryRateLimiter(options: {
  windowMs: number;
  maxAttempts: number;
  maxKeys?: number;
}): MemoryRateLimiter {
  const { windowMs, maxAttempts, maxKeys = 20_000 } = options;
  const store = new Map<string, Bucket>();

  function prune(now: number) {
    for (const [key, bucket] of store) {
      if (bucket.resetAt <= now) {
        store.delete(key);
      }
    }
    if (store.size > maxKeys) {
      const overflow = store.size - maxKeys;
      let removed = 0;
      for (const key of store.keys()) {
        store.delete(key);
        removed += 1;
        if (removed >= overflow) break;
      }
    }
  }

  function check(key: string, now = Date.now()): RateLimitResult {
    const bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (bucket) store.delete(key);
      return { allowed: true, remaining: maxAttempts, retryAfter: 0 };
    }
    if (bucket.count >= maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return { allowed: false, remaining: 0, retryAfter };
    }
    return { allowed: true, remaining: Math.max(0, maxAttempts - bucket.count), retryAfter: 0 };
  }

  function hit(key: string, now = Date.now()): RateLimitResult {
    prune(now);
    const bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: Math.max(0, maxAttempts - 1), retryAfter: 0 };
    }
    if (bucket.count >= maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return { allowed: false, remaining: 0, retryAfter };
    }
    bucket.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, maxAttempts - bucket.count),
      retryAfter: 0,
    };
  }

  return {
    check,
    hit,
    reset(key: string) {
      store.delete(key);
    },
    clearAll() {
      store.clear();
    },
  };
}

export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 5 * 60 * 1000;

export const PPDB_MAX_SUBMISSIONS = 5;
export const PPDB_WINDOW_MS = 10 * 60 * 1000;

export function createLoginFailureLimiter(options?: {
  maxFailures?: number;
  windowMs?: number;
}) {
  const maxAttempts = options?.maxFailures ?? LOGIN_MAX_FAILURES;
  const windowMs = options?.windowMs ?? LOGIN_WINDOW_MS;
  const byIp = createMemoryRateLimiter({ windowMs, maxAttempts });
  const byIdentity = createMemoryRateLimiter({ windowMs, maxAttempts });

  const normIp = (ip: string) => `ip:${(ip || "unknown").trim().toLowerCase()}`;
  const normId = (identity: string) => `id:${(identity || "").trim().toLowerCase()}`;

  return {
    check(ip: string, identity: string, now = Date.now()): RateLimitResult {
      const ipCheck = byIp.check(normIp(ip), now);
      if (!ipCheck.allowed) return ipCheck;
      const cleanId = identity.trim().toLowerCase();
      if (cleanId) {
        const idCheck = byIdentity.check(normId(cleanId), now);
        if (!idCheck.allowed) return idCheck;
        return {
          allowed: true,
          remaining: Math.min(ipCheck.remaining, idCheck.remaining),
          retryAfter: 0,
        };
      }
      return ipCheck;
    },
    recordFailure(ip: string, identity: string, now = Date.now()): RateLimitResult {
      const ipRes = byIp.hit(normIp(ip), now);
      const cleanId = identity.trim().toLowerCase();
      const idRes = cleanId ? byIdentity.hit(normId(cleanId), now) : { allowed: true as const, remaining: maxAttempts, retryAfter: 0 as const };
      if (!ipRes.allowed) return ipRes;
      if (!idRes.allowed) return idRes;
      return {
        allowed: true,
        remaining: Math.min(ipRes.remaining, idRes.remaining),
        retryAfter: 0,
      };
    },
    recordSuccess(ip: string, identity: string) {
      const cleanId = identity.trim().toLowerCase();
      if (cleanId) byIdentity.reset(normId(cleanId));
      byIp.reset(normIp(ip));
    },
    clearAll() {
      byIp.clearAll();
      byIdentity.clearAll();
    },
  };
}

export function createPpdbSubmissionLimiter(options?: {
  maxSubmissions?: number;
  windowMs?: number;
}) {
  const maxAttempts = options?.maxSubmissions ?? PPDB_MAX_SUBMISSIONS;
  const windowMs = options?.windowMs ?? PPDB_WINDOW_MS;
  const byIp = createMemoryRateLimiter({ windowMs, maxAttempts });

  return {
    consume(ip: string, now = Date.now()): RateLimitResult {
      return byIp.hit(`ppdb:${(ip || "unknown").trim().toLowerCase()}`, now);
    },
    clearAll() {
      byIp.clearAll();
    },
  };
}

export function resolveSafeClientIp(req: Request): string {
  const vercelIp = req.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelIp) return vercelIp;
  const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return req.ip || req.socket?.remoteAddress || "unknown";
}
