import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
    team: { findUnique: vi.fn(), findMany: vi.fn() },
    teamOwnership: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("../../db/prisma.js", () => ({ prisma: mockPrisma }));

vi.mock("../../lib/supabase.js", () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
  },
}));

vi.mock("../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  attachUser,
  requireCommissionerOrAdmin,
  requireLeagueMember,
  requireTeamOwner,
  isTeamOwner,
  getOwnedTeamIds,
  clearUserCache,
  clearMembershipCache,
} from "../auth.js";
import { supabaseAdmin } from "../../lib/supabase.js";

function mockReq(overrides: any = {}): any {
  return { user: null, headers: {}, params: {}, body: {}, ...overrides };
}

function mockRes(): any {
  const res: any = { statusCode: 200, body: null };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((data: any) => { res.body = data; return res; });
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearUserCache();
  clearMembershipCache();
});

describe("attachUser", () => {
  it("sets req.user to null when no Authorization header", async () => {
    const req = mockReq({ headers: {} });
    const res = mockRes();
    const next = vi.fn();

    await attachUser(req, res, next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  it("sets req.user to null when Supabase returns error", async () => {
    vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: { message: "invalid token" },
    } as any);

    const req = mockReq({ headers: { authorization: "Bearer bad-token" } });
    const res = mockRes();
    const next = vi.fn();

    await attachUser(req, res, next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  it("looks up user by email when Supabase token is valid", async () => {
    vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
      data: { user: { email: "test@test.com", user_metadata: {} } },
      error: null,
    } as any);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1, email: "test@test.com", name: "Test", avatarUrl: null, isAdmin: false,
    });

    const req = mockReq({ headers: { authorization: "Bearer good-token" } });
    const res = mockRes();
    const next = vi.fn();

    await attachUser(req, res, next);

    expect(req.user).toEqual({
      id: 1, email: "test@test.com", name: "Test", avatarUrl: null, isAdmin: false,
    });
    expect(next).toHaveBeenCalled();
  });

  it("auto-creates user when not found in DB", async () => {
    vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
      data: { user: { email: "new@test.com", user_metadata: { name: "New User" } } },
      error: null,
    } as any);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 2, email: "new@test.com", name: "New User", avatarUrl: null, isAdmin: false,
    });

    const req = mockReq({ headers: { authorization: "Bearer token" } });
    const res = mockRes();
    const next = vi.fn();

    await attachUser(req, res, next);

    expect(mockPrisma.user.create).toHaveBeenCalled();
    expect(req.user).toEqual({
      id: 2, email: "new@test.com", name: "New User", avatarUrl: null, isAdmin: false,
    });
  });

  it("sets req.user to null and calls next on unexpected error", async () => {
    vi.mocked(supabaseAdmin.auth.getUser).mockRejectedValue(new Error("network error"));

    const req = mockReq({ headers: { authorization: "Bearer token" } });
    const res = mockRes();
    const next = vi.fn();

    await attachUser(req, res, next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalled();
  });
});

describe("requireCommissionerOrAdmin", () => {
  const middleware = requireCommissionerOrAdmin("leagueId");

  it("returns 400 for invalid leagueId param", async () => {
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: { leagueId: "abc" } });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid leagueId" });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes for admins without DB check", async () => {
    const req = mockReq({ user: { id: 1, isAdmin: true }, params: { leagueId: "1" } });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockPrisma.leagueMembership.findUnique).not.toHaveBeenCalled();
  });

  it("passes for commissioners", async () => {
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "COMMISSIONER" });
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: { leagueId: "1" } });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("returns 403 for owners (not commissioner)", async () => {
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "OWNER" });
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: { leagueId: "1" } });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Commissioner only" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when no membership found", async () => {
    mockPrisma.leagueMembership.findUnique.mockResolvedValue(null);
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: { leagueId: "1" } });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireLeagueMember", () => {
  const middleware = requireLeagueMember("leagueId");

  it("bypasses check for admins", async () => {
    const req = mockReq({ user: { id: 1, isAdmin: true }, params: { leagueId: "1" }, query: {} });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockPrisma.leagueMembership.findUnique).not.toHaveBeenCalled();
  });

  it("passes for league members", async () => {
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "OWNER" });
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: { leagueId: "1" }, query: {} });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("returns 403 for non-members", async () => {
    mockPrisma.leagueMembership.findUnique.mockResolvedValue(null);
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: { leagueId: "1" }, query: {} });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Not a member of this league" });
    expect(next).not.toHaveBeenCalled();
  });

  it("reads leagueId from query when not in params", async () => {
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "OWNER" });
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: {}, query: { leagueId: "2" } });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockPrisma.leagueMembership.findUnique).toHaveBeenCalledWith({
      where: { leagueId_userId: { leagueId: 2, userId: 1 } },
      select: { role: true },
    });
  });

  it("returns 400 for invalid leagueId", async () => {
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: { leagueId: "abc" }, query: {} });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid leagueId" });
    expect(next).not.toHaveBeenCalled();
  });

  it("reads leagueId from body when not in params or query", async () => {
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "OWNER" });
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: {}, query: {}, body: { leagueId: 3 } });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockPrisma.leagueMembership.findUnique).toHaveBeenCalledWith({
      where: { leagueId_userId: { leagueId: 3, userId: 1 } },
      select: { role: true },
    });
  });
});

describe("isTeamOwner", () => {
  it("returns true when user is ownerUserId", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ ownerUserId: 5 });

    expect(await isTeamOwner(1, 5)).toBe(true);
  });

  it("returns true when user is in TeamOwnership table", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ ownerUserId: 99 });
    mockPrisma.teamOwnership.findUnique.mockResolvedValue({ teamId: 1, userId: 5 });

    expect(await isTeamOwner(1, 5)).toBe(true);
  });

  it("returns false when team not found", async () => {
    mockPrisma.team.findUnique.mockResolvedValue(null);

    expect(await isTeamOwner(999, 5)).toBe(false);
  });

  it("returns false when user does not own team", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ ownerUserId: 99 });
    mockPrisma.teamOwnership.findUnique.mockResolvedValue(null);

    expect(await isTeamOwner(1, 5)).toBe(false);
  });
});

describe("requireTeamOwner", () => {
  const middleware = requireTeamOwner("teamId");

  it("returns 400 for invalid teamId", async () => {
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: { teamId: "abc" }, body: {} });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid teamId" });
  });

  it("bypasses check for admins", async () => {
    const req = mockReq({ user: { id: 1, isAdmin: true }, params: { teamId: "5" } });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockPrisma.team.findUnique).not.toHaveBeenCalled();
  });

  it("reads teamId from req.body when not in params", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ ownerUserId: 1 });
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: {}, body: { teamId: 5 } });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("returns 403 when user does not own team", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ ownerUserId: 99 });
    mockPrisma.teamOwnership.findUnique.mockResolvedValue(null);
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: { teamId: "5" } });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "You do not own this team" });
  });

  it("passes when user owns the team via ownerUserId", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ ownerUserId: 1 });
    const req = mockReq({ user: { id: 1, isAdmin: false }, params: { teamId: "5" } });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe("getOwnedTeamIds", () => {
  it("returns team IDs from both direct ownership and TeamOwnership table", async () => {
    mockPrisma.team.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockPrisma.teamOwnership.findMany.mockResolvedValue([{ teamId: 3 }, { teamId: 2 }]);

    const ids = await getOwnedTeamIds(5);

    expect(ids).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(ids).toHaveLength(3); // deduped: 1, 2, 3
  });

  it("returns empty array when user owns no teams", async () => {
    mockPrisma.team.findMany.mockResolvedValue([]);
    mockPrisma.teamOwnership.findMany.mockResolvedValue([]);

    const ids = await getOwnedTeamIds(99);

    expect(ids).toEqual([]);
  });

  it("deduplicates teams owned via both mechanisms", async () => {
    mockPrisma.team.findMany.mockResolvedValue([{ id: 5 }]);
    mockPrisma.teamOwnership.findMany.mockResolvedValue([{ teamId: 5 }]);

    const ids = await getOwnedTeamIds(1);

    expect(ids).toEqual([5]);
  });
});
