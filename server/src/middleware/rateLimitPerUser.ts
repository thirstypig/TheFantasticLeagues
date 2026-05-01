// server/src/middleware/rateLimitPerUser.ts
//
// Per-user token-bucket rate limit. Keyed by `req.user.id` (must run after
// `requireAuth`). Token-bucket semantics so short bursts succeed but long-
// term throughput is capped at the requested rate. In-memory only — sticky
// to a single process. Cross-instance abuse is bounded by adjacent guards
// (DoS hardening — todo #135).
//
// Usage:
//   router.get("/expensive", requireAuth, rateLimitPerUser({ capacity: 60, windowMs: 60_000 }), handler);
//
// On limit breach the middleware responds 429 with a `retryAfterMs` hint
// and a Retry-After header (seconds, ceil). Anonymous requests are passed
// through — that's the contract: requireAuth runs first, so by the time we
// see a request `req.user.id` is set.

import type { Request, Response, NextFunction, RequestHandler } from "express";

type Bucket = {
  /** Tokens currently in the bucket (float — refilled fractionally per ms). */
  tokens: number;
  /** Last time we refilled (ms epoch). */
  lastRefillMs: number;
};

export interface RateLimitPerUserOptions {
  /** Max tokens (= max burst); also the steady-state count per `windowMs`. */
  capacity: number;
  /** Window over which `capacity` tokens are replenished, in ms. */
  windowMs: number;
  /**
   * Optional bucket-name suffix so distinct routes don't share a bucket.
   * Default = "default". Use distinct names when you have multiple routes
   * with different caps that should not deplete each other's tokens.
   */
  bucketName?: string;
}

// Module-level registry — separate Map per bucketName so per-route caps are
// independent. Keyed Map<userId, Bucket>.
const registry = new Map<string, Map<number, Bucket>>();

function getBucketMap(name: string): Map<number, Bucket> {
  let m = registry.get(name);
  if (!m) {
    m = new Map();
    registry.set(name, m);
  }
  return m;
}

/** Test-only: clear all rate-limit state. */
export function __resetRateLimitPerUserForTests(): void {
  registry.clear();
}

/**
 * Build a per-user token-bucket rate-limiter middleware.
 *
 * Bucket starts full (= capacity). Refills at `capacity / windowMs` tokens
 * per millisecond, capped at `capacity`. Each request consumes 1 token; if
 * fewer than 1 is available we 429.
 */
export function rateLimitPerUser(opts: RateLimitPerUserOptions): RequestHandler {
  const { capacity, windowMs } = opts;
  const bucketName = opts.bucketName ?? "default";

  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error(`rateLimitPerUser: capacity must be positive, got ${capacity}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error(`rateLimitPerUser: windowMs must be positive, got ${windowMs}`);
  }

  const refillPerMs = capacity / windowMs;
  const buckets = getBucketMap(bucketName);

  return function rateLimitPerUserMw(req: Request, res: Response, next: NextFunction): void {
    const userId = req.user?.id;
    // requireAuth should have set this. If not, we're in test/anon territory —
    // pass through (the handler will likely 401 anyway).
    if (typeof userId !== "number") {
      next();
      return;
    }

    const now = Date.now();
    let bucket = buckets.get(userId);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefillMs: now };
      buckets.set(userId, bucket);
    } else {
      const elapsed = Math.max(0, now - bucket.lastRefillMs);
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
      bucket.lastRefillMs = now;
    }

    if (bucket.tokens < 1) {
      const tokensNeeded = 1 - bucket.tokens;
      const retryAfterMs = Math.ceil(tokensNeeded / refillPerMs);
      res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      res.status(429).json({
        error: "Too many requests",
        code: "RATE_LIMIT",
        retryAfterMs,
      });
      return;
    }

    bucket.tokens -= 1;
    next();
  };
}
