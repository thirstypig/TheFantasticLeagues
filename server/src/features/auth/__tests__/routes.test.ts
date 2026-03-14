import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("../../../lib/supabase.js", () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
      admin: { listUsers: vi.fn(), updateUserById: vi.fn(), createUser: vi.fn() },
    },
  },
}));

vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../middleware/auth.js", () => ({
  evictUserCache: vi.fn(),
  requireAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: () => vi.fn((_req: any, _res: any, next: any) => next()),
}));

import { handleAuthHealth, handleGetMe, handleDevLogin, handleLogout } from "../routes.js";
import { prisma } from "../../../db/prisma.js";
import { supabaseAdmin } from "../../../lib/supabase.js";
import { logger } from "../../../lib/logger.js";
import { evictUserCache } from "../../../middleware/auth.js";

const mockPrisma = prisma as any;
const mockSupabase = supabaseAdmin as any;

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

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── handleAuthHealth ────────────────────────────────────────────────

describe("handleAuthHealth", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("returns status 'ok' when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "secret-key";

    const req = mockReq();
    const res = mockRes();

    handleAuthHealth(req, res);

    expect(res.json).toHaveBeenCalledWith({
      status: "ok",
      provider: "supabase",

    });
  });

  it("returns status 'degraded' when SUPABASE_URL is missing", () => {
    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "secret-key";

    const req = mockReq();
    const res = mockRes();

    handleAuthHealth(req, res);

    expect(res.json).toHaveBeenCalledWith({
      status: "degraded",
      provider: "supabase",

    });
  });

  it("returns status 'degraded' when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const req = mockReq();
    const res = mockRes();

    handleAuthHealth(req, res);

    expect(res.json).toHaveBeenCalledWith({
      status: "degraded",
      provider: "supabase",

    });
  });
});

// ─── handleGetMe ─────────────────────────────────────────────────────

describe("handleGetMe", () => {
  it("returns { user: null } when no session user", async () => {
    const req = mockReq(null);
    const res = mockRes();

    await handleGetMe(req, res);

    expect(res.json).toHaveBeenCalledWith({ user: null });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns { user: null } when session user has no id", async () => {
    const req = mockReq({});
    const res = mockRes();

    await handleGetMe(req, res);

    expect(res.json).toHaveBeenCalledWith({ user: null });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns user with memberships when found in DB", async () => {
    const dbUser = {
      id: 1,
      email: "test@example.com",
      name: "Test User",
      avatarUrl: "https://avatar.example.com/test.jpg",
      isAdmin: false,
      memberships: [
        {
          leagueId: 10,
          role: "OWNER",
          league: { id: 10, name: "Test League", season: 2025 },
        },
      ],
    };
    mockPrisma.user.findUnique.mockResolvedValue(dbUser);

    const req = mockReq({ id: 1 });
    const res = mockRes();

    await handleGetMe(req, res);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      include: {
        memberships: {
          select: {
            leagueId: true,
            role: true,
            league: { select: { id: true, name: true, season: true } },
          },
        },
      },
    });

    expect(res.json).toHaveBeenCalledWith({
      user: {
        id: 1,
        email: "test@example.com",
        name: "Test User",
        avatarUrl: "https://avatar.example.com/test.jpg",
        isAdmin: false,
        venmoHandle: undefined,
        zelleHandle: undefined,
        paypalHandle: undefined,
        memberships: [
          {
            leagueId: 10,
            role: "OWNER",
            league: { id: 10, name: "Test League", season: 2025 },
          },
        ],
      },
    });
  });

  it("returns { user: null } when user not found in DB", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const req = mockReq({ id: 999 });
    const res = mockRes();

    await handleGetMe(req, res);

    expect(mockPrisma.user.findUnique).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ user: null });
  });

  it("throws on DB error (caught by asyncHandler)", async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error("DB connection failed"));

    const req = mockReq({ id: 1 });
    const res = mockRes();

    await expect(handleGetMe(req, res)).rejects.toThrow("DB connection failed");
  });
});

// ─── handleDevLogin ──────────────────────────────────────────────────

describe("handleDevLogin", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("returns 500 when DEV_LOGIN_PASSWORD is not set", async () => {
    delete process.env.DEV_LOGIN_PASSWORD;

    const req = mockReq();
    const res = mockRes();

    await handleDevLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: "DEV_LOGIN_PASSWORD env var is required" });
  });

  it("returns 404 when no admin user exists in DB", async () => {
    process.env.DEV_LOGIN_PASSWORD = "TestPass!456";
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const req = mockReq();
    const res = mockRes();

    await handleDevLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body).toEqual({ error: "No admin user found in DB" });
  });

  it("updates password for existing Supabase user", async () => {
    process.env.DEV_LOGIN_PASSWORD = "TestPass!456";
    mockPrisma.user.findFirst.mockResolvedValue({ email: "admin@example.com" });
    mockSupabase.auth.admin.listUsers.mockResolvedValue({
      data: {
        users: [{ id: "sb-123", email: "admin@example.com" }],
      },
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({});

    const req = mockReq();
    const res = mockRes();

    await handleDevLogin(req, res);

    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledWith("sb-123", {
      password: "TestPass!456",
    });
    expect(mockSupabase.auth.admin.createUser).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "TestPass!456",
    });
  });

  it("creates Supabase user when not found in Supabase", async () => {
    process.env.DEV_LOGIN_PASSWORD = "TestPass!456";
    mockPrisma.user.findFirst.mockResolvedValue({ email: "admin@example.com" });
    mockSupabase.auth.admin.listUsers.mockResolvedValue({
      data: { users: [] },
    });
    mockSupabase.auth.admin.createUser.mockResolvedValue({});

    const req = mockReq();
    const res = mockRes();

    await handleDevLogin(req, res);

    expect(mockSupabase.auth.admin.createUser).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "TestPass!456",
      email_confirm: true,
    });
    expect(mockSupabase.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "TestPass!456",
    });
  });

  it("throws on DB error (caught by asyncHandler)", async () => {
    process.env.DEV_LOGIN_PASSWORD = "TestPass!456";
    mockPrisma.user.findFirst.mockRejectedValue(new Error("DB exploded"));

    const req = mockReq();
    const res = mockRes();

    await expect(handleDevLogin(req, res)).rejects.toThrow("DB exploded");
  });
});

// ─── handleLogout ──────────────────────────────────────────────────

describe("handleLogout", () => {
  it("evicts cache when Bearer token is present", () => {
    const req = mockReq();
    req.headers = { authorization: "Bearer test-token-123" };
    const res = mockRes();

    handleLogout(req, res);

    expect(evictUserCache).toHaveBeenCalledWith("test-token-123");
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it("returns success even without auth header", () => {
    const req = mockReq();
    req.headers = {};
    const res = mockRes();

    handleLogout(req, res);

    expect(evictUserCache).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it("handles empty Bearer token gracefully", () => {
    const req = mockReq();
    req.headers = { authorization: "Bearer " };
    const res = mockRes();

    handleLogout(req, res);

    expect(evictUserCache).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
