import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
    leagueRule: { findMany: vi.fn() },
    team: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
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
  requireTeamOwnerOrCommissioner,
  isTeamOwner,
  getOwnedTeamIds,
  clearUserCache,
  clearMembershipCache,
} from "../auth.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { _clearLeagueRuleCache } from "../../lib/leagueRuleCache.js";

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
  _clearLeagueRuleCache();
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

// ═══════════════════════════════════════════════════════════════════════
// requireTeamOwnerOrCommissioner
// ═══════════════════════════════════════════════════════════════════════
//
// Exercises the full role × toggle × ownership × IDOR matrix from the
// Roster Moves plan (docs/plans/2026-04-23-roster-moves-unified-redesign-plan.md).
// Every denial path must return 403 with the generic "Not authorized." message
// — distinct messages would leak membership/toggle state to attackers.

describe("requireTeamOwnerOrCommissioner", () => {
  const mkReq = (user: any, body: any = { leagueId: 1, teamId: 10 }) =>
    mockReq({ user, body });

  const setRule = (selfServe: boolean) => {
    mockPrisma.leagueRule.findMany.mockResolvedValue(
      selfServe
        ? [{ category: "transactions", key: "owner_self_serve", value: "true" }]
        : [{ category: "transactions", key: "owner_self_serve", value: "false" }],
    );
  };

  const setTeamInLeague = (inLeague: boolean) => {
    mockPrisma.team.findFirst.mockResolvedValue(inLeague ? { id: 10 } : null);
  };

  it("admin short-circuits without DB lookups for league/team", async () => {
    const req = mkReq({ id: 99, isAdmin: true });
    const res = mockRes();
    const next = vi.fn();

    await requireTeamOwnerOrCommissioner()(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authorizedVia).toBe("admin");
    // Admin path bypasses all of these.
    expect(mockPrisma.team.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.leagueMembership.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.leagueRule.findMany).not.toHaveBeenCalled();
  });

  it("rejects with 400 when leagueId or teamId is missing/non-numeric", async () => {
    const req = mockReq({ user: { id: 1, isAdmin: false }, body: {} });
    const res = mockRes();
    const next = vi.fn();

    await requireTeamOwnerOrCommissioner()(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects (403) when team does not belong to the claimed league — C1 IDOR", async () => {
    setTeamInLeague(false); // cross-league attack path
    const req = mkReq({ id: 7, isAdmin: false });
    const res = mockRes();
    const next = vi.fn();

    await requireTeamOwnerOrCommissioner()(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Not authorized." });
    expect(next).not.toHaveBeenCalled();
    // Must stop before hitting the expensive path.
    expect(mockPrisma.leagueMembership.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.leagueRule.findMany).not.toHaveBeenCalled();
  });

  it("allows a commissioner on any team in their league (toggle irrelevant)", async () => {
    setTeamInLeague(true);
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "COMMISSIONER" });
    const req = mkReq({ id: 7, isAdmin: false });
    const res = mockRes();
    const next = vi.fn();

    await requireTeamOwnerOrCommissioner()(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authorizedVia).toBe("commissioner");
    // Commissioner path short-circuits BEFORE the toggle lookup.
    expect(mockPrisma.leagueRule.findMany).not.toHaveBeenCalled();
  });

  it("denies (403) a non-commissioner owner when toggle is false", async () => {
    setTeamInLeague(true);
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "OWNER" });
    setRule(false);
    const req = mkReq({ id: 7, isAdmin: false });
    const res = mockRes();
    const next = vi.fn();

    await requireTeamOwnerOrCommissioner()(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Not authorized." });
    expect(next).not.toHaveBeenCalled();
    // Doesn't probe ownership when toggle is off — avoids leaking ownership signal.
    expect(mockPrisma.team.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.teamOwnership.findUnique).not.toHaveBeenCalled();
  });

  it("denies (403) a non-member when toggle is false (fail-closed on missing membership)", async () => {
    setTeamInLeague(true);
    mockPrisma.leagueMembership.findUnique.mockResolvedValue(null);
    setRule(false);
    const req = mkReq({ id: 7, isAdmin: false });
    const res = mockRes();
    const next = vi.fn();

    await requireTeamOwnerOrCommissioner()(req, res, next);

    expect(res.statusCode).toBe(403);
  });

  it("denies (403) a non-member when toggle is true (must still own the team)", async () => {
    setTeamInLeague(true);
    mockPrisma.leagueMembership.findUnique.mockResolvedValue(null);
    setRule(true);
    mockPrisma.team.findUnique.mockResolvedValue({ ownerUserId: 999 }); // not our user
    mockPrisma.teamOwnership.findUnique.mockResolvedValue(null);

    const req = mkReq({ id: 7, isAdmin: false });
    const res = mockRes();
    const next = vi.fn();

    await requireTeamOwnerOrCommissioner()(req, res, next);

    expect(res.statusCode).toBe(403);
  });

  it("allows an owner on their own team when toggle is true — legacy ownerUserId path", async () => {
    setTeamInLeague(true);
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "OWNER" });
    setRule(true);
    // Single-owner team that predates multi-owner support.
    mockPrisma.team.findUnique.mockResolvedValue({ ownerUserId: 7 });
    mockPrisma.teamOwnership.findUnique.mockResolvedValue(null);

    const req = mkReq({ id: 7, isAdmin: false });
    const res = mockRes();
    const next = vi.fn();

    await requireTeamOwnerOrCommissioner()(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authorizedVia).toBe("owner_self_serve");
  });

  it("allows an owner on their own team when toggle is true — co-owner via TeamOwnership", async () => {
    setTeamInLeague(true);
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "OWNER" });
    setRule(true);
    // Multi-owner team: ownerUserId is a different user (the "primary"),
    // but our user is listed in TeamOwnership.
    mockPrisma.team.findUnique.mockResolvedValue({ ownerUserId: 1 });
    mockPrisma.teamOwnership.findUnique.mockResolvedValue({ id: 42 });

    const req = mkReq({ id: 7, isAdmin: false });
    const res = mockRes();
    const next = vi.fn();

    await requireTeamOwnerOrCommissioner()(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authorizedVia).toBe("owner_self_serve");
  });

  it("denies (403) an owner of a DIFFERENT team in the same league when toggle is true", async () => {
    setTeamInLeague(true);
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "OWNER" });
    setRule(true);
    mockPrisma.team.findUnique.mockResolvedValue({ ownerUserId: 999 });
    mockPrisma.teamOwnership.findUnique.mockResolvedValue(null);

    const req = mkReq({ id: 7, isAdmin: false });
    const res = mockRes();
    const next = vi.fn();

    await requireTeamOwnerOrCommissioner()(req, res, next);

    expect(res.statusCode).toBe(403);
  });

  // Fail-closed matrix for the rule value. Any value other than the literal
  // string "true" must deny, with no trimming or coercion. A future refactor
  // to toBool() would silently weaken authorization — this matrix guards it.
  describe("rule value fail-closed matrix (toggle must be exactly 'true')", () => {
    const denyCases: Array<[string, any]> = [
      ["rule row missing", []],
      ["empty string", [{ category: "transactions", key: "owner_self_serve", value: "" }]],
      ["capitalized False", [{ category: "transactions", key: "owner_self_serve", value: "False" }]],
      ["capitalized TRUE", [{ category: "transactions", key: "owner_self_serve", value: "TRUE" }]],
      ["numeric 1", [{ category: "transactions", key: "owner_self_serve", value: "1" }]],
      ["whitespace-padded true", [{ category: "transactions", key: "owner_self_serve", value: " true " }]],
    ];

    for (const [label, rules] of denyCases) {
      it(`denies (403) when value is ${label}`, async () => {
        setTeamInLeague(true);
        mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "OWNER" });
        mockPrisma.leagueRule.findMany.mockResolvedValue(rules);

        const req = mkReq({ id: 7, isAdmin: false });
        const res = mockRes();
        const next = vi.fn();

        await requireTeamOwnerOrCommissioner()(req, res, next);

        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
      });
    }
  });
});
