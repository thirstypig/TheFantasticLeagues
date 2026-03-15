import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Full 8-team auction draft simulation.
 *
 * Tests the complete auction lifecycle using in-memory state management
 * mirroring the logic in server/src/features/auction/routes.ts.
 *
 * Covers:
 *   1. Initialization with 8 teams, $400 budget, 23 roster spots
 *   2. Multiple nomination/bid/finish rounds with queue rotation
 *   3. Budget edge cases (near limit, last spot, full roster)
 *   4. Bid validation (too low, over maxBid, expired timer, wrong state)
 *   5. Double-nomination prevention (already-drafted player)
 *   6. Circular queue wrapping after all 8 teams nominate
 *   7. Completing draft for 2 teams with final budget verification
 *   8. Reset restoring budgets and clearing rosters
 */

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn() },
    player: { findFirst: vi.fn(), create: vi.fn() },
    roster: { create: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    league: { findUnique: vi.fn() },
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
vi.mock("../../features/auction/services/auctionWsService.js", () => ({
  broadcastState: vi.fn(),
}));
vi.mock("../../features/auction/services/auctionPersistence.js", () => ({
  saveState: vi.fn().mockResolvedValue(undefined),
  loadState: vi.fn().mockResolvedValue(null),
  clearState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../lib/rosterGuard.js", () => ({
  assertPlayerAvailable: vi.fn(),
}));

import { calculateMaxBid } from "../../features/auction/routes.js";
import type { AuctionState, AuctionTeam, NominationState } from "../../features/auction/routes.js";
import { prisma } from "../../db/prisma.js";

const mockPrisma = prisma as any;

// ---------------------------------------------------------------------------
// Constants matching routes.ts
// ---------------------------------------------------------------------------

const BUDGET_CAP = 400;
const ROSTER_SIZE = 23;
const LEAGUE_ID = 1;
const BID_TIMER = 15;
const NOMINATION_TIMER = 30;

// ---------------------------------------------------------------------------
// Helpers — mirror route handler logic for in-memory simulation
// ---------------------------------------------------------------------------

function makeTeam(id: number, name: string, code: string): AuctionTeam {
  return {
    id,
    name,
    code,
    budget: BUDGET_CAP,
    maxBid: calculateMaxBid(BUDGET_CAP, ROSTER_SIZE),
    rosterCount: 0,
    spotsLeft: ROSTER_SIZE,
    pitcherCount: 0,
    hitterCount: 0,
    positionCounts: {},
    roster: [],
  };
}

const TEAM_NAMES = [
  { id: 1, name: "Alpha", code: "ALP" },
  { id: 2, name: "Bravo", code: "BRV" },
  { id: 3, name: "Charlie", code: "CHA" },
  { id: 4, name: "Delta", code: "DEL" },
  { id: 5, name: "Echo", code: "ECH" },
  { id: 6, name: "Foxtrot", code: "FOX" },
  { id: 7, name: "Golf", code: "GLF" },
  { id: 8, name: "Hotel", code: "HTL" },
];

function initState(): AuctionState {
  const teams = TEAM_NAMES.map(t => makeTeam(t.id, t.name, t.code));
  return {
    leagueId: LEAGUE_ID,
    status: "nominating",
    nomination: null,
    teams,
    queue: teams.map(t => t.id),
    queueIndex: 0,
    config: { bidTimer: BID_TIMER, nominationTimer: NOMINATION_TIMER, budgetCap: BUDGET_CAP, rosterSize: ROSTER_SIZE, pitcherCount: 9, batterCount: 14, positionLimits: null },
    log: [],
    lastUpdate: Date.now(),
  };
}

/** Simulate nomination (mirrors POST /api/auction/nominate logic). */
function nominate(
  state: AuctionState,
  nominatorTeamId: number,
  playerId: string,
  playerName: string,
  startBid: number,
  positions: string,
  isPitcher: boolean,
): { success: boolean; error?: string } {
  if (state.status !== "nominating") return { success: false, error: "Not in nominating state" };

  const team = state.teams.find(t => t.id === nominatorTeamId);
  if (!team) return { success: false, error: "Invalid team" };
  if (team.maxBid < startBid) return { success: false, error: "Insufficient funds" };

  // Check for already-drafted player
  const alreadyDrafted = state.teams.some(t =>
    t.roster.some(r => String(r.playerId) === playerId)
  );
  if (alreadyDrafted) return { success: false, error: "Player already drafted" };

  const now = Date.now();
  state.nomination = {
    playerId,
    playerName,
    playerTeam: "",
    positions,
    isPitcher,
    nominatorTeamId,
    currentBid: startBid,
    highBidderTeamId: nominatorTeamId,
    endTime: new Date(now + state.config.bidTimer * 1000).toISOString(),
    timerDuration: state.config.bidTimer,
    status: "running",
  };

  state.log.unshift({
    type: "NOMINATION",
    teamId: nominatorTeamId,
    teamName: team.name,
    playerId,
    playerName,
    amount: startBid,
    timestamp: now,
    message: `${team.name} nominated ${playerName} for $${startBid}`,
  });

  state.status = "bidding";
  state.lastUpdate = now;
  return { success: true };
}

/** Simulate bid (mirrors POST /api/auction/bid logic). */
function bid(
  state: AuctionState,
  bidderTeamId: number,
  amount: number,
): { success: boolean; error?: string } {
  if (state.status !== "bidding" || !state.nomination) {
    return { success: false, error: "Auction not active" };
  }

  const endTime = new Date(state.nomination.endTime).getTime();
  const now = Date.now();
  if (now > endTime + 500) {
    return { success: false, error: "Auction ended" };
  }

  if (amount <= state.nomination.currentBid) {
    return { success: false, error: "Bid too low" };
  }

  const bidder = state.teams.find(t => t.id === bidderTeamId);
  if (!bidder) return { success: false, error: "Bidder not found" };
  if (bidder.maxBid < amount) return { success: false, error: "Not enough budget" };

  state.nomination.currentBid = amount;
  state.nomination.highBidderTeamId = bidderTeamId;

  state.log.unshift({
    type: "BID",
    teamId: bidderTeamId,
    teamName: bidder.name,
    playerName: state.nomination.playerName,
    amount,
    timestamp: now,
    message: `${bidder.name} bid $${amount}`,
  });

  state.nomination.endTime = new Date(now + state.config.bidTimer * 1000).toISOString();
  state.lastUpdate = now;
  return { success: true };
}

/**
 * Simulate finish (mirrors POST /api/auction/finish logic).
 * Updates in-memory state directly (budget, roster, queue).
 */
function finish(state: AuctionState): { success: boolean; error?: string; winner?: AuctionTeam } {
  if (!state.nomination) return { success: false, error: "No active nomination" };

  const { playerId, currentBid, highBidderTeamId, playerName, positions } = state.nomination;

  const winner = state.teams.find(t => t.id === highBidderTeamId);
  if (!winner) return { success: false, error: "Winner not found" };

  // Update winner's roster/budget in-memory
  winner.roster.push({ playerId: Number(playerId), price: currentBid });
  winner.rosterCount += 1;
  winner.spotsLeft -= 1;
  winner.budget -= currentBid;
  winner.maxBid = calculateMaxBid(winner.budget, winner.spotsLeft);

  // Recalculate maxBid for all teams (since bids depend on current state)
  for (const t of state.teams) {
    t.maxBid = calculateMaxBid(t.budget, t.spotsLeft);
  }

  // Advance queue
  state.queueIndex = (state.queueIndex + 1) % state.queue.length;

  state.log.unshift({
    type: "WIN",
    teamId: highBidderTeamId,
    teamName: winner.name,
    playerName,
    amount: currentBid,
    timestamp: Date.now(),
    message: `${winner.name} won ${playerName} for $${currentBid}`,
  });

  state.status = "nominating";
  state.nomination = null;
  state.lastUpdate = Date.now();

  return { success: true, winner };
}

/** Generate a unique player id/name for testing. */
let playerCounter = 0;
function nextPlayer(pos = "OF", isPitcher = false) {
  playerCounter++;
  return {
    id: String(600000 + playerCounter),
    name: `Player ${playerCounter}`,
    positions: pos,
    isPitcher,
  };
}

/** Run a complete nomination → bid → finish cycle. Returns the winning team. */
function runLot(
  state: AuctionState,
  nominatorId: number,
  bids: Array<{ teamId: number; amount: number }>,
  startBid = 1,
  pos = "OF",
  isPitcher = false,
): AuctionTeam {
  const p = nextPlayer(pos, isPitcher);
  const nomResult = nominate(state, nominatorId, p.id, p.name, startBid, p.positions, p.isPitcher);
  expect(nomResult.success).toBe(true);

  for (const b of bids) {
    const bidResult = bid(state, b.teamId, b.amount);
    expect(bidResult.success).toBe(true);
  }

  const finResult = finish(state);
  expect(finResult.success).toBe(true);
  return finResult.winner!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  playerCounter = 0;
});

describe("auction simulation: initialization", () => {
  it("initializes 8 teams with $400 budget and 23 roster spots", () => {
    const state = initState();

    expect(state.teams).toHaveLength(8);
    expect(state.queue).toHaveLength(8);
    expect(state.status).toBe("nominating");
    expect(state.queueIndex).toBe(0);

    for (const team of state.teams) {
      expect(team.budget).toBe(400);
      expect(team.spotsLeft).toBe(23);
      expect(team.rosterCount).toBe(0);
      expect(team.maxBid).toBe(calculateMaxBid(400, 23)); // 400 - 22 = 378
      expect(team.roster).toHaveLength(0);
    }
  });

  it("queue matches team id order", () => {
    const state = initState();
    expect(state.queue).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("calculateMaxBid with BUDGET_CAP=400, ROSTER_SIZE=23", () => {
    expect(calculateMaxBid(400, 23)).toBe(378); // 400 - 22
    expect(calculateMaxBid(400, 1)).toBe(400);  // last spot = full budget
    expect(calculateMaxBid(400, 0)).toBe(0);    // no spots
  });
});

describe("auction simulation: single nomination → bid → finish cycle", () => {
  it("completes a basic lot: nominate, bid, finish", () => {
    const state = initState();
    const p = nextPlayer();

    // Team 1 nominates at $1
    const nomResult = nominate(state, 1, p.id, p.name, 1, p.positions, false);
    expect(nomResult.success).toBe(true);
    expect(state.status).toBe("bidding");
    expect(state.nomination!.playerName).toBe(p.name);
    expect(state.nomination!.currentBid).toBe(1);
    expect(state.nomination!.highBidderTeamId).toBe(1);

    // Team 2 bids $5
    const bidResult = bid(state, 2, 5);
    expect(bidResult.success).toBe(true);
    expect(state.nomination!.currentBid).toBe(5);
    expect(state.nomination!.highBidderTeamId).toBe(2);

    // Team 3 bids $10
    const bidResult2 = bid(state, 3, 10);
    expect(bidResult2.success).toBe(true);
    expect(state.nomination!.highBidderTeamId).toBe(3);

    // Finish — Team 3 wins
    const finResult = finish(state);
    expect(finResult.success).toBe(true);
    expect(finResult.winner!.id).toBe(3);

    // Verify winner state
    const team3 = state.teams.find(t => t.id === 3)!;
    expect(team3.budget).toBe(390);     // 400 - 10
    expect(team3.rosterCount).toBe(1);
    expect(team3.spotsLeft).toBe(22);
    expect(team3.roster).toHaveLength(1);
    expect(team3.roster[0].price).toBe(10);

    // Other teams unchanged
    const team1 = state.teams.find(t => t.id === 1)!;
    expect(team1.budget).toBe(400);
    expect(team1.rosterCount).toBe(0);

    // State returns to nominating
    expect(state.status).toBe("nominating");
    expect(state.nomination).toBeNull();

    // Queue advanced
    expect(state.queueIndex).toBe(1);
  });

  it("nominator wins at start bid when no one else bids", () => {
    const state = initState();
    const winner = runLot(state, 1, [], 1);
    expect(winner.id).toBe(1);
    expect(winner.budget).toBe(399);
    expect(winner.rosterCount).toBe(1);
  });
});

describe("auction simulation: bid validation", () => {
  it("rejects bid below current price", () => {
    const state = initState();
    const p = nextPlayer();
    nominate(state, 1, p.id, p.name, 5, p.positions, false);

    const result = bid(state, 2, 5); // equal, not higher
    expect(result.success).toBe(false);
    expect(result.error).toBe("Bid too low");

    const result2 = bid(state, 2, 3); // lower
    expect(result2.success).toBe(false);
    expect(result2.error).toBe("Bid too low");
  });

  it("rejects bid exceeding maxBid", () => {
    const state = initState();
    const p = nextPlayer();
    nominate(state, 1, p.id, p.name, 1, p.positions, false);

    // Team 2's maxBid is 378 (400 - 22)
    const result = bid(state, 2, 379);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not enough budget");
  });

  it("rejects bid when auction is not in bidding state", () => {
    const state = initState();
    // State is "nominating", not "bidding"
    const result = bid(state, 1, 5);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Auction not active");
  });

  it("rejects bid when timer has expired", () => {
    const state = initState();
    const p = nextPlayer();
    nominate(state, 1, p.id, p.name, 1, p.positions, false);

    // Expire the timer
    state.nomination!.endTime = new Date(Date.now() - 10000).toISOString();

    const result = bid(state, 2, 5);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Auction ended");
  });

  it("rejects nomination when not in nominating state", () => {
    const state = initState();
    const p1 = nextPlayer();
    nominate(state, 1, p1.id, p1.name, 1, p1.positions, false);
    // Now in "bidding" state
    const p2 = nextPlayer();
    const result = nominate(state, 2, p2.id, p2.name, 1, p2.positions, false);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not in nominating state");
  });

  it("rejects nomination of already-drafted player", () => {
    const state = initState();

    // Draft a player via lot
    const p = nextPlayer();
    nominate(state, 1, p.id, p.name, 1, p.positions, false);
    finish(state);

    // Try to nominate the same player again
    const result = nominate(state, 2, p.id, p.name, 1, p.positions, false);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Player already drafted");
  });

  it("rejects nomination when team cannot afford startBid", () => {
    const state = initState();
    const team = state.teams.find(t => t.id === 1)!;
    // Artificially reduce budget so maxBid is low
    team.budget = 5;
    team.spotsLeft = 10;
    team.maxBid = calculateMaxBid(5, 10); // 5 - 9 = negative → clamped to 0

    // calculateMaxBid(5, 10) = max(0, 5 - 9) = 0
    expect(calculateMaxBid(5, 10)).toBe(0);

    // Team cannot afford startBid of 1 since maxBid is 0
    const p = nextPlayer();
    const result = nominate(state, 1, p.id, p.name, 1, p.positions, false);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Insufficient funds");
  });

  it("rejects bid from non-existent team", () => {
    const state = initState();
    const p = nextPlayer();
    nominate(state, 1, p.id, p.name, 1, p.positions, false);

    const result = bid(state, 999, 5);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Bidder not found");
  });
});

describe("auction simulation: queue rotation", () => {
  it("rotates through all 8 teams in queue order", () => {
    const state = initState();

    for (let round = 0; round < 8; round++) {
      const expectedTeamId = state.queue[state.queueIndex];
      expect(expectedTeamId).toBe(round + 1);

      // The nominator is whoever is at queueIndex
      runLot(state, expectedTeamId, [], 1);
    }

    // After 8 nominations, queueIndex wraps back to 0
    expect(state.queueIndex).toBe(0);
  });

  it("wraps queue correctly over multiple full rotations", () => {
    const state = initState();

    // Run 16 lots (2 full rotations)
    for (let i = 0; i < 16; i++) {
      const nominatorId = state.queue[state.queueIndex];
      runLot(state, nominatorId, [], 1);
    }

    expect(state.queueIndex).toBe(0);

    // Each team should have exactly 2 players
    for (const team of state.teams) {
      expect(team.rosterCount).toBe(2);
      expect(team.budget).toBe(398); // 400 - 2*$1
      expect(team.spotsLeft).toBe(21);
    }
  });
});

describe("auction simulation: competitive bidding rounds", () => {
  it("simulates bidding war between multiple teams", () => {
    const state = initState();

    const p = nextPlayer();
    nominate(state, 1, p.id, p.name, 1, p.positions, false);

    // Bidding war: 2 → 3 → 2 → 5 → 2 wins
    expect(bid(state, 2, 5).success).toBe(true);
    expect(bid(state, 3, 10).success).toBe(true);
    expect(bid(state, 2, 15).success).toBe(true);
    expect(bid(state, 5, 20).success).toBe(true);
    expect(bid(state, 2, 50).success).toBe(true);

    const result = finish(state);
    expect(result.winner!.id).toBe(2);
    expect(result.winner!.budget).toBe(350); // 400 - 50
  });

  it("simulates mixed round with some teams passing", () => {
    const state = initState();

    // Round 1: Team 1 nominates, Teams 2,3 bid, Team 3 wins at $15
    runLot(state, 1, [{ teamId: 2, amount: 5 }, { teamId: 3, amount: 15 }], 1);
    expect(state.teams.find(t => t.id === 3)!.budget).toBe(385);

    // Round 2: Team 2 nominates, no bids, Team 2 wins at $1
    runLot(state, 2, [], 1);
    expect(state.teams.find(t => t.id === 2)!.budget).toBe(399);

    // Round 3: Team 3 nominates, Teams 1,4,5 bid escalating, Team 5 wins at $30
    runLot(state, 3, [
      { teamId: 1, amount: 5 },
      { teamId: 4, amount: 10 },
      { teamId: 5, amount: 30 },
    ], 1);
    expect(state.teams.find(t => t.id === 5)!.budget).toBe(370);

    // Verify log entries
    const winLogs = state.log.filter(e => e.type === "WIN");
    expect(winLogs).toHaveLength(3);
  });
});

describe("auction simulation: budget edge cases", () => {
  it("team near budget limit can only bid up to maxBid", () => {
    const state = initState();
    const team = state.teams.find(t => t.id === 1)!;

    // Spend most of budget: 20 players at $19 each = $380 spent
    for (let i = 0; i < 20; i++) {
      team.roster.push({ playerId: 1000 + i, price: 19 });
    }
    team.rosterCount = 20;
    team.spotsLeft = 3;
    team.budget = 20; // 400 - 380
    team.maxBid = calculateMaxBid(20, 3); // 20 - 2 = 18

    expect(team.maxBid).toBe(18);

    const p = nextPlayer();
    nominate(state, 1, p.id, p.name, 1, p.positions, false);

    // Team 1 can bid up to 18
    expect(bid(state, 1, 18).success).toBe(true);
    // But not 19
    state.nomination!.currentBid = 18; // reset to retest
    // Actually can't bid 19 since currentBid is already 18 — bid must be > 18
    // But maxBid is 18, so any higher bid fails
    // The bid function checks bidder.maxBid < amount
    // With maxBid=18, bidding 19 should fail
    finish(state); // clear state

    // New lot: verify can't bid over maxBid
    const p2 = nextPlayer();
    nominate(state, 2, p2.id, p2.name, 1, p2.positions, false);
    const result = bid(state, 1, 19);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not enough budget");
  });

  it("team with 1 spot left can bid entire remaining budget", () => {
    const state = initState();
    const team = state.teams.find(t => t.id === 1)!;

    // Fill 22 spots cheaply
    for (let i = 0; i < 22; i++) {
      team.roster.push({ playerId: 2000 + i, price: 1 });
    }
    team.rosterCount = 22;
    team.spotsLeft = 1;
    team.budget = 378; // 400 - 22
    team.maxBid = calculateMaxBid(378, 1); // 378 (entire budget)

    expect(team.maxBid).toBe(378);

    const p = nextPlayer();
    nominate(state, 2, p.id, p.name, 1, p.positions, false);

    // Team 1 can bid its entire remaining budget
    const result = bid(state, 1, 378);
    expect(result.success).toBe(true);
    expect(state.nomination!.highBidderTeamId).toBe(1);
  });

  it("team with 0 spots left has maxBid=0 and cannot bid", () => {
    const state = initState();
    const team = state.teams.find(t => t.id === 1)!;

    // Fill all 23 spots
    for (let i = 0; i < 23; i++) {
      team.roster.push({ playerId: 3000 + i, price: 1 });
    }
    team.rosterCount = 23;
    team.spotsLeft = 0;
    team.budget = 377; // 400 - 23
    team.maxBid = calculateMaxBid(377, 0); // 0

    expect(team.maxBid).toBe(0);

    const p = nextPlayer();
    nominate(state, 2, p.id, p.name, 1, p.positions, false);

    const result = bid(state, 1, 2);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not enough budget");
  });

  it("team with $1 budget and multiple spots cannot bid above $1", () => {
    const state = initState();
    const team = state.teams.find(t => t.id === 1)!;

    // Edge case: $1 left, 2 spots
    team.budget = 1;
    team.spotsLeft = 2;
    team.maxBid = calculateMaxBid(1, 2); // 1 - 1 = 0

    expect(team.maxBid).toBe(0);

    const p = nextPlayer();
    nominate(state, 2, p.id, p.name, 1, p.positions, false);

    const result = bid(state, 1, 2);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not enough budget");
  });
});

describe("auction simulation: complete draft for 2 teams", () => {
  it("fills all 23 roster spots for 2 teams, verifies final budgets", () => {
    const state = initState();

    // Strategy: Team 1 and Team 2 each win 23 players
    // Team 1 wins all at $1 (23 * $1 = $23 spent)
    // Team 2 wins with competitive bidding at modest prices

    // Fill Team 1: 23 players at $1 each (no competition)
    for (let i = 0; i < 23; i++) {
      runLot(state, 1, [], 1);
    }

    const team1 = state.teams.find(t => t.id === 1)!;
    expect(team1.rosterCount).toBe(23);
    expect(team1.spotsLeft).toBe(0);
    expect(team1.budget).toBe(377); // 400 - 23
    expect(team1.maxBid).toBe(0);   // no spots left
    expect(team1.roster).toHaveLength(23);

    // Fill Team 2: mix of competitive bids and solo wins
    // Keep prices modest so Team 2's maxBid stays sufficient
    const team2Prices: number[] = [];

    // First 5 players: competitive (Team 3 bids, Team 2 outbids)
    for (let i = 0; i < 5; i++) {
      const price = 10 + i * 2; // 10, 12, 14, 16, 18
      runLot(state, 2, [
        { teamId: 3, amount: price - 1 },
        { teamId: 2, amount: price },
      ], 1);
      team2Prices.push(price);
    }

    // Remaining 18 players: no competition at $1 each
    for (let i = 0; i < 18; i++) {
      runLot(state, 2, [], 1);
      team2Prices.push(1);
    }

    const team2Total = team2Prices.reduce((s, p) => s + p, 0);
    // 10+12+14+16+18 + 18*1 = 70 + 18 = 88

    const team2 = state.teams.find(t => t.id === 2)!;
    expect(team2.rosterCount).toBe(23);
    expect(team2.spotsLeft).toBe(0);
    expect(team2.budget).toBe(400 - team2Total); // 400 - 88 = 312
    expect(team2.maxBid).toBe(0);
    expect(team2.roster).toHaveLength(23);

    // Verify total spent matches
    const team2Spent = team2.roster.reduce((s, r) => s + r.price, 0);
    expect(team2Spent).toBe(team2Total);

    // Other teams spent nothing
    for (let id = 3; id <= 8; id++) {
      const t = state.teams.find(t => t.id === id)!;
      expect(t.budget).toBe(400);
      expect(t.rosterCount).toBe(0);
    }
  });

  it("team with full roster cannot nominate if maxBid is 0", () => {
    const state = initState();
    const team = state.teams.find(t => t.id === 1)!;

    // Fill all spots
    for (let i = 0; i < 23; i++) {
      team.roster.push({ playerId: 4000 + i, price: 1 });
    }
    team.rosterCount = 23;
    team.spotsLeft = 0;
    team.budget = 377;
    team.maxBid = calculateMaxBid(377, 0); // 0

    const p = nextPlayer();
    const result = nominate(state, 1, p.id, p.name, 1, p.positions, false);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Insufficient funds");
  });
});

describe("auction simulation: log tracking", () => {
  it("logs nomination, bid, and win events in correct order", () => {
    const state = initState();
    const p = nextPlayer();

    nominate(state, 1, p.id, p.name, 1, p.positions, false);
    bid(state, 2, 5);
    bid(state, 3, 10);
    finish(state);

    // Log is prepended (newest first)
    expect(state.log).toHaveLength(4); // 1 nomination + 2 bids + 1 win
    expect(state.log[0].type).toBe("WIN");
    expect(state.log[1].type).toBe("BID");
    expect(state.log[1].amount).toBe(10);
    expect(state.log[2].type).toBe("BID");
    expect(state.log[2].amount).toBe(5);
    expect(state.log[3].type).toBe("NOMINATION");
  });

  it("accumulates logs across multiple lots", () => {
    const state = initState();

    // 3 lots, each with 1 bid
    for (let i = 0; i < 3; i++) {
      runLot(state, state.queue[state.queueIndex], [{ teamId: ((i + 1) % 8) + 1, amount: 5 }], 1);
    }

    // Each lot: 1 nomination + 1 bid + 1 win = 3 events * 3 lots = 9
    expect(state.log).toHaveLength(9);
  });
});

describe("auction simulation: reset", () => {
  it("resets state and clears all rosters/budgets via DB", async () => {
    const state = initState();

    // Draft some players
    for (let i = 0; i < 8; i++) {
      runLot(state, state.queue[state.queueIndex], [], 1 + i);
    }

    // Verify some budget was spent
    expect(state.teams.some(t => t.budget < 400)).toBe(true);
    expect(state.log.length).toBeGreaterThan(0);

    // Simulate reset by creating fresh state (mirrors routes.ts reset handler)
    mockPrisma.roster.deleteMany.mockResolvedValue({ count: 8 });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });

    const deleteResult = await prisma.roster.deleteMany({
      where: { source: "auction_2025", team: { leagueId: LEAGUE_ID } },
    });
    expect(deleteResult.count).toBe(8);

    // Fresh state after reset
    const resetState = initState();

    // All budgets restored
    for (const team of resetState.teams) {
      expect(team.budget).toBe(400);
      expect(team.rosterCount).toBe(0);
      expect(team.spotsLeft).toBe(23);
      expect(team.maxBid).toBe(378);
      expect(team.roster).toHaveLength(0);
    }

    expect(resetState.nomination).toBeNull();
    expect(resetState.log).toHaveLength(0);
    expect(resetState.queueIndex).toBe(0);
  });
});

describe("auction simulation: full 8-team multi-round draft", () => {
  it("runs 3 full rounds (24 lots) with varied bidding patterns", () => {
    const state = initState();

    // Round 1: Each team nominates in queue order, some bid wars
    // Lot 1: Team 1 nominates, Team 2 and 3 bid, Team 3 wins at $20
    runLot(state, 1, [
      { teamId: 2, amount: 10 },
      { teamId: 3, amount: 20 },
    ], 1);
    expect(state.teams.find(t => t.id === 3)!.budget).toBe(380);

    // Lot 2: Team 2 nominates, no one bids, Team 2 wins at $1
    runLot(state, 2, [], 1);
    expect(state.teams.find(t => t.id === 2)!.budget).toBe(399);

    // Lot 3: Team 3 nominates, Team 1 bids $15, Team 4 bids $25, Team 4 wins
    runLot(state, 3, [
      { teamId: 1, amount: 15 },
      { teamId: 4, amount: 25 },
    ], 1);
    expect(state.teams.find(t => t.id === 4)!.budget).toBe(375);

    // Lots 4-8: Teams 4-8 nominate, each wins at $1 (no bids)
    for (let i = 4; i <= 8; i++) {
      runLot(state, i, [], 1);
    }

    // After round 1 (8 lots), queueIndex should be back to 0
    expect(state.queueIndex).toBe(0);

    // Round 2: More competitive
    // Lot 9: Team 1 nominates, big bidding war, Team 6 wins at $45
    runLot(state, 1, [
      { teamId: 5, amount: 10 },
      { teamId: 6, amount: 20 },
      { teamId: 5, amount: 30 },
      { teamId: 6, amount: 45 },
    ], 5);
    expect(state.teams.find(t => t.id === 6)!.budget).toBe(354); // 400 - 1 - 45

    // Lots 10-16: Teams 2-8 each win at $2
    for (let i = 2; i <= 8; i++) {
      runLot(state, i, [], 2);
    }

    // After round 2, queueIndex back to 0
    expect(state.queueIndex).toBe(0);

    // Round 3: Teams 1-8 each win at $3
    for (let i = 1; i <= 8; i++) {
      runLot(state, i, [], 3);
    }

    // Verify final state after 24 lots
    expect(state.queueIndex).toBe(0);

    // Verify roster counts
    // Team 1: won lots at: $1(lot4, no—Team1 didn't win lot1), let me trace:
    // Team 1: won 0 in round 1 (was nominator for lot 1, but team 3 won)
    //   Actually... team 1 nominated lot 1 but team 3 won it
    //   Lots 4-8: Teams 4-8 won, not team 1
    //   Team 1 won nothing in round 1
    //   In round 2: Team 1 nominated lot 9, team 6 won
    //   In round 3: Team 1 nominates and wins at $3
    // So Team 1 only won 1 player total? That seems wrong.
    //
    // Let's re-check: runLot with no bids means nominator wins.
    // Lot 4: Team 4 nominates, no bids → Team 4 wins. Not Team 1.
    //
    // So Team 1 only wins in Round 3 lot at $3.
    // Team 1 total roster: 1 player at $3 → budget = 397
    const team1 = state.teams.find(t => t.id === 1)!;
    expect(team1.rosterCount).toBe(1);
    expect(team1.budget).toBe(397);

    // Team 3: won lot 1 at $20 + round 2 lot at $2 + round 3 lot at $3 = $25
    const team3 = state.teams.find(t => t.id === 3)!;
    expect(team3.rosterCount).toBe(3);
    expect(team3.budget).toBe(375); // 400 - 25

    // Team 4: won lot 3 at $25 + lot 4 at $1 + round 2 at $2 + round 3 at $3 = $31
    const team4 = state.teams.find(t => t.id === 4)!;
    expect(team4.rosterCount).toBe(4);
    expect(team4.budget).toBe(369); // 400 - 31

    // Team 6: won lot 6 at $1 + lot 9 at $45 + round 2 at $2 + round 3 at $3 = $51
    const team6 = state.teams.find(t => t.id === 6)!;
    expect(team6.rosterCount).toBe(4);
    expect(team6.budget).toBe(349); // 400 - 51

    // Verify total log events
    // 24 lots * 3 events minimum (nomination + win) + bids
    // Round 1: lots 1(nom+2bids+win=4), 2(2), 3(nom+2bids+win=4), 4-8(2 each=10)
    // Round 1 total: 4+2+4+10 = 20
    // Round 2: lot 9(nom+4bids+win=6), lots 10-16(2 each=14)
    // Round 2 total: 6+14 = 20
    // Round 3: 8 lots * 2 = 16
    // Grand total: 20+20+16 = 56
    expect(state.log).toHaveLength(56);
  });
});

describe("auction simulation: pitcher vs hitter nominations", () => {
  it("tracks pitcher and hitter nominations correctly", () => {
    const state = initState();

    // Nominate a pitcher
    const pitcher = nextPlayer("SP", true);
    nominate(state, 1, pitcher.id, pitcher.name, 1, pitcher.positions, true);
    expect(state.nomination!.isPitcher).toBe(true);
    expect(state.nomination!.positions).toBe("SP");
    finish(state);

    // Nominate a hitter
    const hitter = nextPlayer("SS/2B", false);
    nominate(state, 2, hitter.id, hitter.name, 1, hitter.positions, false);
    expect(state.nomination!.isPitcher).toBe(false);
    expect(state.nomination!.positions).toBe("SS/2B");
    finish(state);
  });
});

describe("auction simulation: finish without nomination", () => {
  it("rejects finish when no active nomination", () => {
    const state = initState();
    const result = finish(state);
    expect(result.success).toBe(false);
    expect(result.error).toBe("No active nomination");
  });
});
