import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Request, Response } from "express";
import { rateLimitPerUser, _resetRateLimitPerUserBuckets } from "../rateLimitPerUser.js";

type MockRes = {
  setHeader: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  statusCode?: number;
};

function makeReq(userId: number | null): Request {
  return {
    user: userId == null ? null : { id: userId, email: "u@x", name: null, avatarUrl: null, isAdmin: false },
  } as unknown as Request;
}

function makeRes(): MockRes {
  const res: MockRes = {
    setHeader: vi.fn(),
    status: vi.fn(function (this: MockRes, code: number) {
      this.statusCode = code;
      return this as unknown as Response;
    }),
    json: vi.fn(),
  };
  return res;
}

describe("rateLimitPerUser", () => {
  beforeEach(() => {
    _resetRateLimitPerUserBuckets();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to capacity requests in a single burst, then 429s the next one", () => {
    const mw = rateLimitPerUser({ capacity: 3, windowMs: 60_000, bucketName: "t" });
    const req = makeReq(42);
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      const res = makeRes();
      mw(req, res as unknown as Response, next);
      expect(res.status).not.toHaveBeenCalled();
    }
    expect(next).toHaveBeenCalledTimes(3);

    // 4th request — bucket empty, must 429
    const res = makeRes();
    mw(req, res as unknown as Response, next);
    expect(res.statusCode).toBe(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ retryAfter: expect.any(Number) }));
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    expect(next).toHaveBeenCalledTimes(3); // unchanged
  });

  it("refills proportionally over time — full window restores full capacity", () => {
    const mw = rateLimitPerUser({ capacity: 2, windowMs: 60_000, bucketName: "t" });
    const req = makeReq(7);
    const next = vi.fn();

    // Drain
    mw(req, makeRes() as unknown as Response, next);
    mw(req, makeRes() as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(2);

    // 3rd is denied
    const denied = makeRes();
    mw(req, denied as unknown as Response, next);
    expect(denied.statusCode).toBe(429);

    // After full window, bucket refills
    vi.advanceTimersByTime(60_000);
    const res = makeRes();
    mw(req, res as unknown as Response, next);
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("isolates buckets by userId — one user's burst doesn't affect another", () => {
    const mw = rateLimitPerUser({ capacity: 1, windowMs: 60_000, bucketName: "t" });
    const next = vi.fn();

    // User 1 drains their bucket
    mw(makeReq(1), makeRes() as unknown as Response, next);
    const denied1 = makeRes();
    mw(makeReq(1), denied1 as unknown as Response, next);
    expect(denied1.statusCode).toBe(429);

    // User 2 still has a full bucket
    const ok2 = makeRes();
    mw(makeReq(2), ok2 as unknown as Response, next);
    expect(ok2.status).not.toHaveBeenCalled();
  });

  it("isolates buckets by bucketName — separate routes don't share state", () => {
    const a = rateLimitPerUser({ capacity: 1, windowMs: 60_000, bucketName: "a" });
    const b = rateLimitPerUser({ capacity: 1, windowMs: 60_000, bucketName: "b" });
    const req = makeReq(99);
    const next = vi.fn();

    a(req, makeRes() as unknown as Response, next);
    const deniedA = makeRes();
    a(req, deniedA as unknown as Response, next);
    expect(deniedA.statusCode).toBe(429);

    // Same user, different bucket — fresh capacity
    const okB = makeRes();
    b(req, okB as unknown as Response, next);
    expect(okB.status).not.toHaveBeenCalled();
  });

  it("fails open when req.user is missing (delegates to requireAuth's 401)", () => {
    const mw = rateLimitPerUser({ capacity: 1, windowMs: 60_000, bucketName: "t" });
    const req = makeReq(null);
    const next = vi.fn();
    const res = makeRes();

    mw(req, res as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("throws on invalid options", () => {
    expect(() => rateLimitPerUser({ capacity: 0, windowMs: 1000 })).toThrow();
    expect(() => rateLimitPerUser({ capacity: 5, windowMs: 0 })).toThrow();
    expect(() => rateLimitPerUser({ capacity: -1, windowMs: 1000 })).toThrow();
  });
});
