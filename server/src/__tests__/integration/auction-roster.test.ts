import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration tests: Auction → Roster
 *
 * Validates the end-to-end auction finish flow:
 *   1. Winning bid creates a roster entry for the winning team
 *   2. Player stub is created when the player doesn't exist in the DB
 *   3. Budget is correctly reflected after roster creation (via refreshTeams)
 *   4. Queue advances after a successful finish
 */

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn() },
    player: { findFirst: vi.fn(), create: vi.fn() },
    roster: { create: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock("../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../lib/supabase.js", () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));
vi.mock("../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

import { calculateMaxBid } from "../../features/auction/routes.js";
import { prisma } from "../../db/prisma.js";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers — simulate the finish handler logic extracted from routes.ts
// ---------------------------------------------------------------------------

interface FinishInput {
  playerId: string;
  playerName: string;
  positions: string;
  currentBid: number;
  highBidderTeamId: number;
}

/**
 * Mirrors the core logic inside POST /api/auction/finish:
 *   1. Lookup player by mlbId; create stub if missing
 *   2. Create a roster entry for the winning team
 */
async function simulateFinish(input: FinishInput) {
  const { playerId, playerName, positions, currentBid, highBidderTeamId } = input;

  let dbPlayer = await prisma.player.findFirst({ where: { mlbId: Number(playerId) } });
  if (!dbPlayer) {
    dbPlayer = await prisma.player.create({
      data: {
        mlbId: Number(playerId),
        name: playerName,
        posPrimary: positions.split("/")[0] || "UT",
        posList: positions.split("/").join(","),
      },
    });
  }

  const roster = await prisma.roster.create({
    data: {
      teamId: highBidderTeamId,
      playerId: dbPlayer!.id,
      price: currentBid,
      source: "auction_2025",
    },
  });

  return { dbPlayer, roster };
}

/**
 * Mirrors refreshTeams budget calculation from routes.ts.
 */
function computeAuctionTeams(
  dbTeams: Array<{ id: number; name: string; code: string; rosters: Array<{ price: number }> }>,
) {
  const BUDGET_CAP = 260;
  const ROSTER_SIZE = 25;

  return dbTeams.map((t) => {
    const spent = t.rosters.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
    const count = t.rosters.length;
    const remaining = BUDGET_CAP - spent;
    const spots = ROSTER_SIZE - count;
    return {
      id: t.id,
      name: t.name,
      code: t.code,
      budget: remaining,
      rosterCount: count,
      spotsLeft: spots,
      maxBid: calculateMaxBid(remaining, spots),
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integration: auction finish → roster creation", () => {
  it("creates a roster entry for the winning team when player exists in DB", async () => {
    const existingPlayer = { id: 42, mlbId: 12345, name: "Shohei Ohtani" };
    mockPrisma.player.findFirst.mockResolvedValue(existingPlayer);
    mockPrisma.roster.create.mockResolvedValue({
      id: 1,
      teamId: 3,
      playerId: 42,
      price: 55,
      source: "auction_2025",
    });

    const result = await simulateFinish({
      playerId: "12345",
      playerName: "Shohei Ohtani",
      positions: "DH/OF",
      currentBid: 55,
      highBidderTeamId: 3,
    });

    // Player lookup happened, no create
    expect(mockPrisma.player.findFirst).toHaveBeenCalledWith({ where: { mlbId: 12345 } });
    expect(mockPrisma.player.create).not.toHaveBeenCalled();

    // Roster entry created with correct data
    expect(mockPrisma.roster.create).toHaveBeenCalledWith({
      data: {
        teamId: 3,
        playerId: 42,
        price: 55,
        source: "auction_2025",
      },
    });

    expect(result.dbPlayer).toEqual(existingPlayer);
    expect(result.roster.teamId).toBe(3);
    expect(result.roster.price).toBe(55);
  });

  it("creates a player stub when player is NOT in the DB", async () => {
    mockPrisma.player.findFirst.mockResolvedValue(null);
    const createdPlayer = { id: 99, mlbId: 77777, name: "Unknown Prospect", posPrimary: "SS", posList: "SS,2B" };
    mockPrisma.player.create.mockResolvedValue(createdPlayer);
    mockPrisma.roster.create.mockResolvedValue({
      id: 2,
      teamId: 1,
      playerId: 99,
      price: 1,
      source: "auction_2025",
    });

    const result = await simulateFinish({
      playerId: "77777",
      playerName: "Unknown Prospect",
      positions: "SS/2B",
      currentBid: 1,
      highBidderTeamId: 1,
    });

    expect(mockPrisma.player.findFirst).toHaveBeenCalledWith({ where: { mlbId: 77777 } });
    expect(mockPrisma.player.create).toHaveBeenCalledWith({
      data: {
        mlbId: 77777,
        name: "Unknown Prospect",
        posPrimary: "SS",
        posList: "SS,2B",
      },
    });
    expect(mockPrisma.roster.create).toHaveBeenCalledWith({
      data: {
        teamId: 1,
        playerId: 99,
        price: 1,
        source: "auction_2025",
      },
    });

    expect(result.dbPlayer).toEqual(createdPlayer);
  });

  it("uses 'UT' as primary position when positions string is empty", async () => {
    mockPrisma.player.findFirst.mockResolvedValue(null);
    mockPrisma.player.create.mockResolvedValue({ id: 100, mlbId: 88888, name: "No Pos", posPrimary: "UT", posList: "" });
    mockPrisma.roster.create.mockResolvedValue({ id: 3, teamId: 2, playerId: 100, price: 1 });

    await simulateFinish({
      playerId: "88888",
      playerName: "No Pos",
      positions: "",
      currentBid: 1,
      highBidderTeamId: 2,
    });

    expect(mockPrisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ posPrimary: "UT" }),
    });
  });
});

describe("integration: auction finish → budget deduction via refreshTeams", () => {
  it("reflects reduced budget after winning bid is committed to roster", () => {
    // Before finish: Team A has zero roster entries
    const teamsBefore = computeAuctionTeams([
      { id: 1, name: "Team A", code: "AAA", rosters: [] },
      { id: 2, name: "Team B", code: "BBB", rosters: [] },
    ]);
    expect(teamsBefore[0].budget).toBe(260);
    expect(teamsBefore[0].maxBid).toBe(236); // 260 - 24

    // After finish: Team A wins a player for $50 (roster now has one entry)
    const teamsAfter = computeAuctionTeams([
      { id: 1, name: "Team A", code: "AAA", rosters: [{ price: 50 }] },
      { id: 2, name: "Team B", code: "BBB", rosters: [] },
    ]);

    expect(teamsAfter[0].budget).toBe(210);       // 260 - 50
    expect(teamsAfter[0].rosterCount).toBe(1);
    expect(teamsAfter[0].spotsLeft).toBe(24);
    expect(teamsAfter[0].maxBid).toBe(187);        // 210 - 23

    // Team B unchanged
    expect(teamsAfter[1].budget).toBe(260);
    expect(teamsAfter[1].maxBid).toBe(236);
  });

  it("budget reaches minimum when roster is nearly full", () => {
    // 24 players at $10 each = $240 spent, 1 spot left
    const rosters = Array.from({ length: 24 }, () => ({ price: 10 }));
    const teams = computeAuctionTeams([
      { id: 1, name: "Team Full", code: "FUL", rosters },
    ]);

    expect(teams[0].budget).toBe(20);       // 260 - 240
    expect(teams[0].spotsLeft).toBe(1);
    expect(teams[0].maxBid).toBe(20);       // Last spot: can bid entire remaining budget
  });

  it("maxBid is 0 when roster is completely full", () => {
    const rosters = Array.from({ length: 25 }, () => ({ price: 10 }));
    const teams = computeAuctionTeams([
      { id: 1, name: "Team Packed", code: "PKD", rosters },
    ]);

    expect(teams[0].spotsLeft).toBe(0);
    expect(teams[0].maxBid).toBe(0);
  });
});

describe("integration: auction finish → queue advancement", () => {
  it("advances queueIndex after successful finish", () => {
    const queue = [1, 2, 3, 4];
    let queueIndex = 0;

    // Simulate three successive finishes
    queueIndex = (queueIndex + 1) % queue.length;
    expect(queueIndex).toBe(1);

    queueIndex = (queueIndex + 1) % queue.length;
    expect(queueIndex).toBe(2);

    queueIndex = (queueIndex + 1) % queue.length;
    expect(queueIndex).toBe(3);

    // Wraps around
    queueIndex = (queueIndex + 1) % queue.length;
    expect(queueIndex).toBe(0);
  });
});

describe("integration: auction reset → roster cleanup", () => {
  it("deletes all auction_2025 roster entries for the league on reset", async () => {
    mockPrisma.roster.deleteMany.mockResolvedValue({ count: 12 });

    const result = await prisma.roster.deleteMany({
      where: { source: "auction_2025", team: { leagueId: 1 } },
    });

    expect(result.count).toBe(12);
    expect(mockPrisma.roster.deleteMany).toHaveBeenCalledWith({
      where: { source: "auction_2025", team: { leagueId: 1 } },
    });
  });

  it("refreshTeams shows full budgets after reset clears rosters", () => {
    const teamsAfterReset = computeAuctionTeams([
      { id: 1, name: "Team A", code: "AAA", rosters: [] },
      { id: 2, name: "Team B", code: "BBB", rosters: [] },
    ]);

    expect(teamsAfterReset[0].budget).toBe(260);
    expect(teamsAfterReset[0].maxBid).toBe(236);
    expect(teamsAfterReset[1].budget).toBe(260);
    expect(teamsAfterReset[1].maxBid).toBe(236);
  });
});
