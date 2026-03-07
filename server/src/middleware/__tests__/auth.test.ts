import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma and Supabase before importing auth module to avoid DB connection
vi.mock("../../db/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
  },
}));

vi.mock("../../lib/supabase.js", () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
  },
}));

import { requireAuth, requireAdmin } from "../auth.js";

/**
 * Tests for the auth middleware functions.
 * These test the synchronous middleware functions (requireAuth, requireAdmin).
 * attachUser and middleware factories are tested in authExtended.test.ts.
 */

function mockReq(user?: any): any {
  return { user: user ?? null };
}

function mockRes(): any {
  const res: any = {
    statusCode: 200,
    body: null,
  };
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

describe("requireAuth", () => {
  it("calls next() when user is present", () => {
    const req = mockReq({ id: 1, email: "test@test.com", isAdmin: false });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when user is null", () => {
    const req = mockReq(null);
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: "Not authenticated" });
  });

  it("returns 401 when user is undefined", () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("requireAdmin", () => {
  it("calls next() when user is admin", () => {
    const req = mockReq({ id: 1, email: "admin@test.com", isAdmin: true });
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not admin", () => {
    const req = mockReq({ id: 1, email: "user@test.com", isAdmin: false });
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toEqual({ error: "Admin only" });
  });

  it("returns 401 when user is null", () => {
    const req = mockReq(null);
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: "Not authenticated" });
  });
});

