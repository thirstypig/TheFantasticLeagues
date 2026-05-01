import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Per-authenticated-user token-bucket rate limiter.
 *
 * Used as a defense-in-depth layer on read endpoints that fan out to
 * Prisma or third-party feeds — the global IP-based `express-rate-limit`
 * already throttles raw request volume, but a logged-in user can still
 * hammer a single endpoint hard enough to starve other tenants. Keying
 * on `req.user.id` and per-route bucket gives us cheap, isolated control
 * without DB writes.
 *
 * Bucket semantics: classic token bucket. Each user gets a `capacity`
 * pool that refills at `capacity / windowMs` tokens per ms. A request
 * costs 1 token; if no token is available the response is 429 with a
 * `Retry-After` header (seconds until the next refill). Buckets are
 * lazily created on first hit and never proactively pruned — Map size
 * is bounded by total user count, which is small (<10k for any
 * realistic tenant), so the memory cost is negligible.
 *
 * Sticky to a single process. Across instances, the effective cap is
 * `instances * capacity` per window — acceptable for the read endpoints
 * we apply this to (eligible-slots, awards). For mutation endpoints
 * the existing in-tx serialization + global rate limiter cover the
 * worst case.
 *
 * MUST be placed after `requireAuth` so `req.user.id` is populated.
 * If `req.user` is missing the middleware fails open (delegates to
 * the next handler) so the 401 from `requireAuth` is what the caller
 * sees, not a confusing 429.
 */
export interface RateLimitPerUserOptions {
  /** Max tokens in the bucket — also the burst capacity. */
  capacity: number;
  /** Window over which the bucket fully refills, in ms. */
  windowMs: number;
  /** Optional bucket name; lets two routes share state if desired. Default: `${capacity}/${windowMs}` */
  bucketName?: string;
}

type Bucket = { tokens: number; lastRefillMs: number };

/**
 * Map of buckets keyed on `<bucketName>:<userId>`. Module-scoped so
 * multiple route registrations using the same name share state.
 */
const allBuckets = new Map<string, Bucket>();

/**
 * Test-only helper — clear all rate limiter state between cases. The
 * leading underscore matches the codebase's other test-reset helpers
 * (e.g. `_clearLeagueRuleCache`, `__resetSessionRateLimitersForTests`).
 */
export function _resetRateLimitPerUserBuckets(): void {
  allBuckets.clear();
}

export function rateLimitPerUser(opts: RateLimitPerUserOptions): RequestHandler {
  const { capacity, windowMs } = opts;
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error("rateLimitPerUser: capacity must be a positive number");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("rateLimitPerUser: windowMs must be a positive number");
  }
  const refillPerMs = capacity / windowMs;
  const bucketName = opts.bucketName ?? `${capacity}/${windowMs}`;

  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (userId == null) {
      // Fail open — `requireAuth` (which must run first) handles the 401.
      return next();
    }

    const key = `${bucketName}:${userId}`;
    const now = Date.now();
    let bucket = allBuckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefillMs: now };
      allBuckets.set(key, bucket);
    } else {
      const elapsed = now - bucket.lastRefillMs;
      if (elapsed > 0) {
        bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
        bucket.lastRefillMs = now;
      }
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return next();
    }

    // No token available — compute seconds until 1 full token refills.
    const msUntilToken = (1 - bucket.tokens) / refillPerMs;
    const retryAfterSec = Math.max(1, Math.ceil(msUntilToken / 1000));
    res.setHeader("Retry-After", String(retryAfterSec));
    return res.status(429).json({
      error: "Too many requests — please slow down.",
      retryAfter: retryAfterSec,
    });
  };
}
