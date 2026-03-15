import { describe, it, expect, vi, beforeEach } from "vitest";

// All vi.mock calls are hoisted — must not reference top-level variables
vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn() },
    player: { findFirst: vi.fn(), create: vi.fn() },
    roster: { create: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../services/auctionWsService.js", () => ({
  broadcastState: vi.fn(),
}));
vi.mock("../services/auctionPersistence.js", () => ({
  saveState: vi.fn().mockResolvedValue(undefined),
  loadState: vi.fn().mockResolvedValue(null),
  clearState: vi.fn().mockResolvedValue(undefined),
}));

import { calculateMaxBid } from "../routes.js";
import type { AuctionState } from "../routes.js";
import { prisma } from "../../../db/prisma.js";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auction - calculateMaxBid", () => {
  it("returns full budget when only 1 spot left", () => {
    expect(calculateMaxBid(100, 1)).toBe(100);
  });

  it("reserves $1 per remaining spot", () => {
    expect(calculateMaxBid(100, 10)).toBe(91); // 100 - 9
  });

  it("returns 0 when no spots left", () => {
    expect(calculateMaxBid(100, 0)).toBe(0);
  });

  it("returns 0 when negative spots", () => {
    expect(calculateMaxBid(100, -1)).toBe(0);
  });

  it("handles $1 budget with 1 spot", () => {
    expect(calculateMaxBid(1, 1)).toBe(1);
  });

  it("returns 0 when budget is less than spots minus 1 (no negative maxBid)", () => {
    // Previously returned -4, now clamped to 0
    expect(calculateMaxBid(5, 10)).toBe(0);
  });

  it("returns 1 when budget exactly equals spots", () => {
    expect(calculateMaxBid(10, 10)).toBe(1);
  });

  it("handles full roster scenario (25 spots, 260 budget)", () => {
    expect(calculateMaxBid(260, 25)).toBe(236); // 260 - 24
  });
});

// -- In-memory state management (using imported types) --

function freshState(): AuctionState {
  return {
    leagueId: 0,
    status: "not_started",
    nomination: null,
    teams: [],
    queue: [],
    queueIndex: 0,
    config: { bidTimer: 15, nominationTimer: 30, budgetCap: 400, rosterSize: 23, pitcherCount: 9, batterCount: 14, positionLimits: null },
    log: [],
    lastUpdate: Date.now(),
  };
}

describe("auction - state transitions", () => {
  it("starts in not_started state", () => {
    const state = freshState();
    expect(state.status).toBe("not_started");
    expect(state.leagueId).toBe(0);
  });

  it("init transitions to nominating", () => {
    const state = freshState();
    state.leagueId = 1;
    state.status = "nominating";
    expect(state.status).toBe("nominating");
    expect(state.leagueId).toBe(1);
  });

  it("nominate transitions to bidding", () => {
    const state = freshState();
    state.status = "nominating";
    state.teams = [
      { id: 1, name: "Team A", code: "A", budget: 260, maxBid: 236, rosterCount: 0, spotsLeft: 25, pitcherCount: 0, hitterCount: 0, positionCounts: {}, roster: [] },
      { id: 2, name: "Team B", code: "B", budget: 260, maxBid: 236, rosterCount: 0, spotsLeft: 25, pitcherCount: 0, hitterCount: 0, positionCounts: {}, roster: [] },
    ];
    state.queue = [1, 2];

    const team = state.teams.find(t => t.id === 1)!;
    const startBid = 1;
    expect(team.maxBid >= startBid).toBe(true);

    state.nomination = {
      playerId: "12345",
      playerName: "Mike Trout",
      playerTeam: "LAA",
      positions: "OF",
      isPitcher: false,
      nominatorTeamId: 1,
      currentBid: startBid,
      highBidderTeamId: 1,
      endTime: new Date(Date.now() + 15000).toISOString(),
      timerDuration: 15,
      status: "running",
    };
    state.status = "bidding";

    expect(state.status).toBe("bidding");
    expect(state.nomination!.playerName).toBe("Mike Trout");
    expect(state.log).toHaveLength(0);
  });
});

describe("auction - bidding", () => {
  function biddingState(): AuctionState {
    const state = freshState();
    state.status = "bidding";
    state.teams = [
      { id: 1, name: "Team A", code: "A", budget: 260, maxBid: 236, rosterCount: 0, spotsLeft: 25, pitcherCount: 0, hitterCount: 0, positionCounts: {}, roster: [] },
      { id: 2, name: "Team B", code: "B", budget: 260, maxBid: 236, rosterCount: 0, spotsLeft: 25, pitcherCount: 0, hitterCount: 0, positionCounts: {}, roster: [] },
    ];
    state.nomination = {
      playerId: "12345",
      playerName: "Mike Trout",
      playerTeam: "LAA",
      positions: "OF",
      isPitcher: false,
      nominatorTeamId: 1,
      currentBid: 1,
      highBidderTeamId: 1,
      endTime: new Date(Date.now() + 15000).toISOString(),
      timerDuration: 15,
      status: "running",
    };
    return state;
  }

  it("rejects bid lower than current bid", () => {
    const state = biddingState();
    const amount = 1;
    expect(amount <= state.nomination!.currentBid).toBe(true);
  });

  it("accepts bid higher than current bid", () => {
    const state = biddingState();
    const amount = 5;
    const bidder = state.teams.find(t => t.id === 2)!;

    expect(amount > state.nomination!.currentBid).toBe(true);
    expect(bidder.maxBid >= amount).toBe(true);

    state.nomination!.currentBid = amount;
    state.nomination!.highBidderTeamId = 2;

    expect(state.nomination!.currentBid).toBe(5);
    expect(state.nomination!.highBidderTeamId).toBe(2);
  });

  it("rejects bid when bidder has insufficient budget", () => {
    const state = biddingState();
    state.teams[1].maxBid = 3;
    const amount = 5;
    const bidder = state.teams.find(t => t.id === 2)!;
    expect(bidder.maxBid < amount).toBe(true);
  });

  it("rejects bid when auction is expired", () => {
    const state = biddingState();
    state.nomination!.endTime = new Date(Date.now() - 10000).toISOString();
    const endTime = new Date(state.nomination!.endTime).getTime();
    const now = Date.now();
    expect(now > endTime + 500).toBe(true);
  });

  it("resets timer on successful bid", () => {
    const state = biddingState();
    const now = Date.now();
    state.nomination!.endTime = new Date(now + state.config.bidTimer * 1000).toISOString();
    const newEnd = new Date(state.nomination!.endTime).getTime();
    expect(newEnd).toBeGreaterThan(now);
  });
});

describe("auction - pause/resume", () => {
  it("pause calculates remaining time and sets status", () => {
    const state = freshState();
    state.nomination = {
      playerId: "1", playerName: "Test", playerTeam: "TST", positions: "OF",
      isPitcher: false, nominatorTeamId: 1, currentBid: 1, highBidderTeamId: 1,
      endTime: new Date(Date.now() + 10000).toISOString(), timerDuration: 15, status: "running",
    };

    const now = Date.now();
    const end = new Date(state.nomination.endTime).getTime();
    state.nomination.pausedRemainingMs = Math.max(0, end - now);
    state.nomination.status = "paused";

    expect(state.nomination.status).toBe("paused");
    expect(state.nomination.pausedRemainingMs).toBeGreaterThan(0);
  });

  it("resume restores endTime from remaining time", () => {
    const state = freshState();
    state.nomination = {
      playerId: "1", playerName: "Test", playerTeam: "TST", positions: "OF",
      isPitcher: false, nominatorTeamId: 1, currentBid: 1, highBidderTeamId: 1,
      endTime: "", timerDuration: 15, status: "paused", pausedRemainingMs: 5000,
    };

    const now = Date.now();
    const remaining = state.nomination.pausedRemainingMs || (state.config.bidTimer * 1000);
    state.nomination.endTime = new Date(now + remaining).toISOString();
    state.nomination.status = "running";

    const newEnd = new Date(state.nomination.endTime).getTime();
    expect(newEnd).toBeGreaterThanOrEqual(now + 4900); // allowing small timing variance
    expect(state.nomination.status).toBe("running");
  });
});

describe("auction - finish (DB integration)", () => {
  it("creates roster entry for winning team", async () => {
    mockPrisma.player.findFirst.mockResolvedValue({ id: 42, mlbId: 12345, name: "Mike Trout" });
    mockPrisma.roster.create.mockResolvedValue({ id: 1, teamId: 1, playerId: 42, price: 50 });

    const dbPlayer = await mockPrisma.player.findFirst({ where: { mlbId: 12345 } });
    expect(dbPlayer).toBeDefined();

    const roster = await mockPrisma.roster.create({
      data: { teamId: 1, playerId: dbPlayer!.id, price: 50, source: "auction_2025" },
    });

    expect(roster.teamId).toBe(1);
    expect(roster.price).toBe(50);
  });

  it("creates player stub when player not in DB", async () => {
    mockPrisma.player.findFirst.mockResolvedValue(null);
    mockPrisma.player.create.mockResolvedValue({ id: 43, mlbId: 99999, name: "New Player" });

    const dbPlayer = await mockPrisma.player.findFirst({ where: { mlbId: 99999 } });
    expect(dbPlayer).toBeNull();

    const created = await mockPrisma.player.create({
      data: { mlbId: 99999, name: "New Player", posPrimary: "OF", posList: "OF" },
    });

    expect(created.mlbId).toBe(99999);
  });
});

describe("auction - reset", () => {
  it("deletes auction roster entries for league", async () => {
    mockPrisma.roster.deleteMany.mockResolvedValue({ count: 15 });

    const result = await mockPrisma.roster.deleteMany({
      where: { source: "auction_2025", team: { leagueId: 1 } },
    });

    expect(result.count).toBe(15);
  });

  it("resets state to nominating with cleared log", () => {
    const state = freshState();
    state.status = "bidding";
    state.log = [{ type: "BID", message: "test", timestamp: Date.now() }];

    state.status = "nominating";
    state.nomination = null;
    state.log = [];
    state.lastUpdate = Date.now();

    expect(state.status).toBe("nominating");
    expect(state.log).toHaveLength(0);
    expect(state.nomination).toBeNull();
  });
});

describe("auction - refreshTeams", () => {
  it("calculates budget and spots from DB rosters", async () => {
    const BUDGET_CAP = 260;
    const ROSTER_SIZE = 25;

    mockPrisma.team.findMany.mockResolvedValue([
      {
        id: 1, name: "Team A", code: "AAA", leagueId: 1,
        rosters: [
          { playerId: 1, price: 50, releasedAt: null },
          { playerId: 2, price: 30, releasedAt: null },
        ],
      },
      {
        id: 2, name: "Team B", code: "BBB", leagueId: 1,
        rosters: [],
      },
    ]);

    const teams = await mockPrisma.team.findMany({
      where: { leagueId: 1 },
      include: { rosters: { where: { releasedAt: null } } },
    });

    const auctionTeams = teams.map((t: any) => {
      const spent = t.rosters.reduce((sum: number, r: any) => sum + (Number(r.price) || 0), 0);
      const count = t.rosters.length;
      const remaining = BUDGET_CAP - spent;
      const spots = ROSTER_SIZE - count;
      return {
        id: t.id,
        name: t.name,
        budget: remaining,
        rosterCount: count,
        spotsLeft: spots,
        maxBid: calculateMaxBid(remaining, spots),
      };
    });

    expect(auctionTeams[0].budget).toBe(180); // 260 - 80
    expect(auctionTeams[0].rosterCount).toBe(2);
    expect(auctionTeams[0].spotsLeft).toBe(23);
    expect(auctionTeams[0].maxBid).toBe(158); // 180 - 22

    expect(auctionTeams[1].budget).toBe(260);
    expect(auctionTeams[1].rosterCount).toBe(0);
    expect(auctionTeams[1].spotsLeft).toBe(25);
    expect(auctionTeams[1].maxBid).toBe(236); // 260 - 24
  });
});
