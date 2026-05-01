import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  rateLimitPerUser,
  __resetRateLimitPerUserForTests,
} from "../rateLimitPerUser.js";

function mockReq(userId: number | undefined): any {
  return { user: typeof userId === "number" ? { id: userId } : undefined };
}

function mockRes(): any {
  const res: any = {
    statusCode: 200,
    body: null,
    headers: {} as Record<string, string>,
  };
  res.setHeader = vi.fn((k: string, v: string) => {
    res.headers[k] = v;
  });
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.body = data;
    return res;
  });
  return res;
}

beforeEach(() => {
  __resetRateLimitPerUserForTests();
  vi.useRealTimers();
});

describe("rateLimitPerUser", () => {
  it("allows requests up to capacity, then 429s the next one", () => {
    const mw = rateLimitPerUser({ capacity: 3, windowMs: 60_000, bucketName: "test-burst" });

    for (let i = 0; i < 3; i++) {
      const next = vi.fn();
      mw(mockReq(42), mockRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }

    // 4th request → 429
    const res = mockRes();
    const next = vi.fn();
    mw(mockReq(42), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe("RATE_LIMIT");
    expect(res.body.retryAfterMs).toBeGreaterThan(0);
    expect(res.headers["Retry-After"]).toBeDefined();
  });

  it("isolates buckets per user — one user's exhaustion doesn't affect others", () => {
    const mw = rateLimitPerUser({ capacity: 2, windowMs: 60_000, bucketName: "test-isolate" });

    // User 1 burns through 2 tokens
    mw(mockReq(1), mockRes(), vi.fn());
    mw(mockReq(1), mockRes(), vi.fn());

    // User 1's 3rd is blocked
    const res1 = mockRes();
    mw(mockReq(1), res1, vi.fn());
    expect(res1.statusCode).toBe(429);

    // User 2 has full capacity
    const next2 = vi.fn();
    const res2 = mockRes();
    mw(mockReq(2), res2, next2);
    expect(next2).toHaveBeenCalled();
    expect(res2.statusCode).toBe(200);
  });

  it("isolates buckets per bucketName — same user, different routes", () => {
    const mwA = rateLimitPerUser({ capacity: 1, windowMs: 60_000, bucketName: "test-route-a" });
    const mwB = rateLimitPerUser({ capacity: 1, windowMs: 60_000, bucketName: "test-route-b" });

    // User 1 burns route A
    mwA(mockReq(1), mockRes(), vi.fn());
    const resA2 = mockRes();
    mwA(mockReq(1), resA2, vi.fn());
    expect(resA2.statusCode).toBe(429);

    // Route B still has its own capacity for user 1
    const nextB = vi.fn();
    const resB = mockRes();
    mwB(mockReq(1), resB, nextB);
    expect(nextB).toHaveBeenCalled();
    expect(resB.statusCode).toBe(200);
  });

  it("refills tokens over time at capacity / windowMs rate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00Z"));

    const mw = rateLimitPerUser({ capacity: 60, windowMs: 60_000, bucketName: "test-refill" });

    // Burn the entire bucket
    for (let i = 0; i < 60; i++) {
      mw(mockReq(7), mockRes(), vi.fn());
    }
    // 61st = 429
    const blocked = mockRes();
    mw(mockReq(7), blocked, vi.fn());
    expect(blocked.statusCode).toBe(429);

    // Advance 1 second → refilled 1 token (60/60_000 * 1000 = 1)
    vi.advanceTimersByTime(1000);
    const allowed = mockRes();
    const nextOk = vi.fn();
    mw(mockReq(7), allowed, nextOk);
    expect(nextOk).toHaveBeenCalled();
    expect(allowed.statusCode).toBe(200);

    // Immediately again → no time passed → 429
    const blocked2 = mockRes();
    mw(mockReq(7), blocked2, vi.fn());
    expect(blocked2.statusCode).toBe(429);
  });

  it("passes through anonymous requests (no req.user) — auth runs first elsewhere", () => {
    const mw = rateLimitPerUser({ capacity: 1, windowMs: 60_000, bucketName: "test-anon" });

    const next = vi.fn();
    const res = mockRes();
    mw(mockReq(undefined), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);

    // Even after many anon hits, no 429 (we don't track anon)
    for (let i = 0; i < 10; i++) {
      const r = mockRes();
      mw(mockReq(undefined), r, vi.fn());
      expect(r.statusCode).toBe(200);
    }
  });

  it("throws on invalid options at construction time", () => {
    expect(() => rateLimitPerUser({ capacity: 0, windowMs: 1000 })).toThrow();
    expect(() => rateLimitPerUser({ capacity: 10, windowMs: 0 })).toThrow();
    expect(() => rateLimitPerUser({ capacity: NaN, windowMs: 1000 })).toThrow();
  });
});
