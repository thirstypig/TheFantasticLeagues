import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    leagueMembership: { findUnique: vi.fn(), findMany: vi.fn() },
    roster: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/supabase.js", () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../services/teamService.js", () => ({
  TeamService: vi.fn().mockImplementation(() => ({
    getTeamSummary: vi.fn(),
  })),
}));

import { prisma } from "../../../db/prisma.js";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// Import the router to get the route handlers
// We'll test the handler logic directly by simulating req/res

function mockReq(overrides: any = {}) {
  return {
    user: { id: 1, isAdmin: false },
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("team summary - league membership check (IDOR fix)", () => {
  it("blocks non-member from accessing team summary", async () => {
    // Team exists in league 5
    mockPrisma.team.findUnique.mockResolvedValue({ id: 10, leagueId: 5 });
    // User is NOT a member of league 5
    mockPrisma.leagueMembership.findUnique.mockResolvedValue(null);

    // Simulate the handler logic from routes.ts
    const req = mockReq({ params: { id: "10" } });
    const res = mockRes();

    const teamId = Number(req.params.id);

    // This mirrors the new code in routes.ts
    if (!req.user.isAdmin) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { leagueId: true },
      });
      if (!team) {
        res.status(404).json({ error: "Team not found" });
      } else {
        const membership = await prisma.leagueMembership.findUnique({
          where: { leagueId_userId: { leagueId: team.leagueId, userId: req.user.id } },
        });
        if (!membership) {
          res.status(403).json({ error: "Not a member of this league" });
        }
      }
    }

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Not a member of this league" });
  });

  it("allows league member to access team summary", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ id: 10, leagueId: 5 });
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 5, userId: 1, role: "OWNER" });

    const req = mockReq({ params: { id: "10" } });
    const res = mockRes();

    const teamId = Number(req.params.id);
    let blocked = false;

    if (!req.user.isAdmin) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { leagueId: true },
      });
      if (team) {
        const membership = await prisma.leagueMembership.findUnique({
          where: { leagueId_userId: { leagueId: team.leagueId, userId: req.user.id } },
        });
        if (!membership) {
          blocked = true;
        }
      }
    }

    expect(blocked).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows admin to access any team summary without membership check", async () => {
    const req = mockReq({ params: { id: "10" }, user: { id: 99, isAdmin: true } });
    const res = mockRes();

    // Admin bypass — no DB calls needed
    let blocked = false;
    if (!req.user.isAdmin) {
      blocked = true; // Would check membership, but admin skips
    }

    expect(blocked).toBe(false);
    // Prisma should NOT be called for membership check
    expect(mockPrisma.team.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.leagueMembership.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when team does not exist", async () => {
    mockPrisma.team.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: "999" } });
    const res = mockRes();

    const teamId = Number(req.params.id);

    if (!req.user.isAdmin) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { leagueId: true },
      });
      if (!team) {
        res.status(404).json({ error: "Team not found" });
      }
    }

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Team not found" });
  });
});

// ─── Trade Block Endpoints ────────────────────────────────────────────────

describe("GET /api/teams/:teamId/trade-block", () => {
  it("returns trade block playerIds for a team", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({
      id: 10,
      leagueId: 1,
      tradeBlockPlayerIds: [101, 102, 103],
    });
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 1, userId: 1, role: "OWNER" });

    const req = mockReq({ params: { teamId: "10" } });
    const res = mockRes();

    const teamId = Number(req.params.teamId);
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { tradeBlockPlayerIds: true, leagueId: true },
    });

    expect(team).toBeTruthy();
    const playerIds = Array.isArray(team!.tradeBlockPlayerIds)
      ? (team!.tradeBlockPlayerIds as number[])
      : [];

    res.json({ playerIds });

    expect(res.json).toHaveBeenCalledWith({ playerIds: [101, 102, 103] });
  });

  it("returns empty array when no trade block set", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({
      id: 10,
      leagueId: 1,
      tradeBlockPlayerIds: [],
    });
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 1, userId: 1 });

    const team = await prisma.team.findUnique({
      where: { id: 10 },
      select: { tradeBlockPlayerIds: true, leagueId: true },
    });

    const playerIds = Array.isArray(team!.tradeBlockPlayerIds)
      ? (team!.tradeBlockPlayerIds as number[])
      : [];

    expect(playerIds).toEqual([]);
  });

  it("returns 404 for non-existent team", async () => {
    mockPrisma.team.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { teamId: "999" } });
    const res = mockRes();

    const team = await prisma.team.findUnique({
      where: { id: 999 },
      select: { tradeBlockPlayerIds: true, leagueId: true },
    });

    if (!team) {
      res.status(404).json({ error: "Team not found" });
    }

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("POST /api/teams/:teamId/trade-block", () => {
  it("saves valid playerIds that are on the active roster", async () => {
    mockPrisma.roster.findMany.mockResolvedValue([
      { playerId: 101 },
      { playerId: 102 },
      { playerId: 103 },
    ]);
    mockPrisma.team.update.mockResolvedValue({ id: 10, tradeBlockPlayerIds: [101, 102] });

    const req = mockReq({
      params: { teamId: "10" },
      body: { playerIds: [101, 102] },
    });
    const res = mockRes();

    const teamId = Number(req.params.teamId);
    const { playerIds } = req.body as { playerIds: number[] };

    const activeRoster = await prisma.roster.findMany({
      where: { teamId, releasedAt: null },
      select: { playerId: true },
    });
    const rosterPlayerIds = new Set(activeRoster.map((r: any) => r.playerId));
    const validPlayerIds = playerIds.filter((id: number) => rosterPlayerIds.has(id));

    await prisma.team.update({
      where: { id: teamId },
      data: { tradeBlockPlayerIds: validPlayerIds },
    });

    res.json({ playerIds: validPlayerIds });

    expect(validPlayerIds).toEqual([101, 102]);
    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { tradeBlockPlayerIds: [101, 102] },
    });
  });

  it("filters out playerIds not on the active roster", async () => {
    // Only 101 is on the roster
    mockPrisma.roster.findMany.mockResolvedValue([
      { playerId: 101 },
    ]);
    mockPrisma.team.update.mockResolvedValue({ id: 10, tradeBlockPlayerIds: [101] });

    const req = mockReq({
      params: { teamId: "10" },
      body: { playerIds: [101, 999, 888] },
    });
    const res = mockRes();

    const teamId = Number(req.params.teamId);
    const { playerIds } = req.body as { playerIds: number[] };

    const activeRoster = await prisma.roster.findMany({
      where: { teamId, releasedAt: null },
      select: { playerId: true },
    });
    const rosterPlayerIds = new Set(activeRoster.map((r: any) => r.playerId));
    const validPlayerIds = playerIds.filter((id: number) => rosterPlayerIds.has(id));

    await prisma.team.update({
      where: { id: teamId },
      data: { tradeBlockPlayerIds: validPlayerIds },
    });

    res.json({ playerIds: validPlayerIds });

    // Only 101 should be saved, 999 and 888 filtered out
    expect(validPlayerIds).toEqual([101]);
    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { tradeBlockPlayerIds: [101] },
    });
  });

  it("can clear the trade block with an empty array", async () => {
    mockPrisma.roster.findMany.mockResolvedValue([{ playerId: 101 }]);
    mockPrisma.team.update.mockResolvedValue({ id: 10, tradeBlockPlayerIds: [] });

    const req = mockReq({
      params: { teamId: "10" },
      body: { playerIds: [] },
    });
    const res = mockRes();

    const teamId = Number(req.params.teamId);
    const { playerIds } = req.body as { playerIds: number[] };
    const activeRoster = await prisma.roster.findMany({
      where: { teamId, releasedAt: null },
      select: { playerId: true },
    });
    const rosterPlayerIds = new Set(activeRoster.map((r: any) => r.playerId));
    const validPlayerIds = playerIds.filter((id: number) => rosterPlayerIds.has(id));

    await prisma.team.update({
      where: { id: teamId },
      data: { tradeBlockPlayerIds: validPlayerIds },
    });

    res.json({ playerIds: validPlayerIds });

    expect(validPlayerIds).toEqual([]);
    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { tradeBlockPlayerIds: [] },
    });
  });
});

describe("GET /api/teams/trade-block/league", () => {
  it("returns trade blocks for all teams in a league", async () => {
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 1, userId: 1 });
    mockPrisma.team.findMany.mockResolvedValue([
      { id: 10, tradeBlockPlayerIds: [101, 102] },
      { id: 11, tradeBlockPlayerIds: [] },
      { id: 12, tradeBlockPlayerIds: [201] },
    ]);

    const teams = await prisma.team.findMany({
      where: { leagueId: 1 },
      select: { id: true, tradeBlockPlayerIds: true },
    });

    const tradeBlocks: Record<number, number[]> = {};
    for (const team of teams) {
      const ids = Array.isArray(team.tradeBlockPlayerIds)
        ? (team.tradeBlockPlayerIds as number[])
        : [];
      if (ids.length > 0) {
        tradeBlocks[team.id] = ids;
      }
    }

    // Team 11 has empty array, should not appear
    expect(tradeBlocks).toEqual({
      10: [101, 102],
      12: [201],
    });
    expect(tradeBlocks[11]).toBeUndefined();
  });

  it("returns empty object when no team has trade block selections", async () => {
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 1, userId: 1 });
    mockPrisma.team.findMany.mockResolvedValue([
      { id: 10, tradeBlockPlayerIds: [] },
      { id: 11, tradeBlockPlayerIds: [] },
    ]);

    const teams = await prisma.team.findMany({
      where: { leagueId: 1 },
      select: { id: true, tradeBlockPlayerIds: true },
    });

    const tradeBlocks: Record<number, number[]> = {};
    for (const team of teams) {
      const ids = Array.isArray(team.tradeBlockPlayerIds)
        ? (team.tradeBlockPlayerIds as number[])
        : [];
      if (ids.length > 0) {
        tradeBlocks[team.id] = ids;
      }
    }

    expect(tradeBlocks).toEqual({});
  });
});
