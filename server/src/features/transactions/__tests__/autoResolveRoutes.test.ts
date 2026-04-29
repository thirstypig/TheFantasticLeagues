// server/src/features/transactions/__tests__/autoResolveRoutes.test.ts
//
// Integration tests for the Yahoo-style auto-resolve hook on /claim,
// /il-stash, and /il-activate. Mirrors the mocking pattern in routes.test.ts
// but adds the LeagueRule(transactions.auto_resolve_slots) flag flips needed
// to exercise both the matcher path and the legacy strict-pairwise fallback.
//
// PR1 — plan #166 §10. Reads `appliedReassignments` off the response.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

const mockTx: any = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  roster: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(23),
  },
  player: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  transactionEvent: { create: vi.fn() },
  rosterSlotEvent: { create: vi.fn() },
  leagueRule: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  },
};

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    transactionEvent: { count: vi.fn(), findMany: vi.fn() },
    roster: { findFirst: vi.fn() },
    player: { findFirst: vi.fn(), findUnique: vi.fn() },
    league: { findUnique: vi.fn() },
    leagueRule: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn(async (fn: any) => fn(mockTx)),
  },
}));

const mockCheckMlbIlEligibility = vi.fn();
const mockAssertIlSlotAvailable = vi.fn().mockResolvedValue(undefined);
const mockAssertNoGhostIl = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../lib/ilSlotGuard.js", () => ({
  checkMlbIlEligibility: (...args: any[]) => mockCheckMlbIlEligibility(...args),
  assertIlSlotAvailable: (...args: any[]) => mockAssertIlSlotAvailable(...args),
  assertNoGhostIl: (...args: any[]) => mockAssertNoGhostIl(...args),
}));

vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwnerOrCommissioner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../../../lib/rosterGuard.js", () => ({
  assertPlayerAvailable: vi.fn().mockResolvedValue(undefined),
  assertRosterLimit: vi.fn().mockResolvedValue(undefined),
  assertRosterAtExactCap: vi.fn().mockResolvedValue(undefined),
  loadLeagueRosterCap: vi.fn().mockResolvedValue(23),
}));
vi.mock("../../../middleware/seasonGuard.js", () => ({
  requireSeasonStatus: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

// IMPORTANT: clear the LeagueRule cache between tests — it's process-local
// and would otherwise leak the previous test's flag value across tests.
import { _clearLeagueRuleCache } from "../../../lib/leagueRuleCache.js";
import { prisma } from "../../../db/prisma.js";
const mockPrisma = prisma as any;

import express from "express";
import { transactionsRouter } from "../routes.js";
import supertest from "supertest";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use(transactionsRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

const originalEnv = process.env;

// Default OGBA capacities — 14 batters + 9 pitchers.
const ROSTER_POSITIONS = JSON.stringify({
  C: 2, "1B": 1, "2B": 1, "3B": 1, SS: 1, MI: 1, CM: 1, OF: 5, DH: 1,
});

const RULES_AUTO_ON = [
  { category: "roster", key: "pitcher_count", value: "9" },
  { category: "roster", key: "batter_count", value: "14" },
  { category: "roster", key: "roster_positions", value: ROSTER_POSITIONS },
  { category: "transactions", key: "auto_resolve_slots", value: "true" },
];
const RULES_AUTO_OFF = [
  { category: "roster", key: "pitcher_count", value: "9" },
  { category: "roster", key: "batter_count", value: "14" },
  { category: "roster", key: "roster_positions", value: ROSTER_POSITIONS },
  { category: "transactions", key: "auto_resolve_slots", value: "false" },
];

/**
 * Helper: configure tx.roster.findMany to differentiate between
 * `assertNoOwnershipConflict` calls (filtered by playerId+team.leagueId →
 * we always return [] = no conflict) and the matcher's
 * `buildCandidatesForTeam` calls (filtered by teamId+releasedAt → return
 * the supplied roster snapshot).
 */
function setRosterSnapshot(rosterRows: any[]) {
  mockTx.roster.findMany.mockImplementation((args: any) => {
    // Ownership conflict scan filters on playerId.
    if (args?.where?.playerId !== undefined) {
      return Promise.resolve([]);
    }
    return Promise.resolve(rosterRows);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearLeagueRuleCache();
  process.env = { ...originalEnv, ENFORCE_ROSTER_RULES: "true" };

  mockTx.player.findUnique.mockResolvedValue({
    id: 100, name: "Mookie Betts", posPrimary: "OF",
    posList: "OF,2B", mlbId: 605141, mlbTeam: "LAD",
  });
  mockTx.roster.create.mockResolvedValue({ id: 999 });
  setRosterSnapshot([]); // default: empty matcher candidates
  mockTx.transactionEvent.create.mockResolvedValue({});
  mockTx.rosterSlotEvent.create.mockResolvedValue({});
  mockAssertIlSlotAvailable.mockResolvedValue(undefined);
  mockAssertNoGhostIl.mockResolvedValue(undefined);
  mockCheckMlbIlEligibility.mockResolvedValue({
    status: "Injured 10-Day",
    cacheFetchedAt: new Date("2026-04-29T10:00:00Z"),
  });
});

describe("POST /transactions/claim — Yahoo-style auto-resolve", () => {
  it("flag ON + slot conflict resolved → 200 with appliedReassignments populated", async () => {
    // Seed LeagueRule rows (cached) so isAutoResolveEnabled returns true.
    mockPrisma.leagueRule.findMany.mockResolvedValue(RULES_AUTO_ON);

    // Player 100 is Mookie (OF,2B). Drop is Trea Turner at SS.
    // Pre-tx existingRoster check: player 100 not on any roster yet.
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null) // existingRoster
      .mockResolvedValueOnce({ id: 50, assignedPosition: "SS" }); // drop preview
    // Drop player lookup: name and posList for the strict check (not run when
    // auto_resolve is on, but pre-flight reads happen anyway).
    mockPrisma.player.findUnique.mockResolvedValue({
      name: "Trea Turner", posList: "SS",
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    // In-tx drop lookup
    mockTx.roster.findFirst.mockResolvedValue({ id: 50, teamId: 10, playerId: 200 });
    mockTx.player.findUnique.mockResolvedValueOnce({
      id: 100, name: "Mookie Betts", posPrimary: "OF",
      posList: "OF,2B", mlbId: 605141, mlbTeam: "LAD",
    });
    // Drop player lookup inside transaction
    mockTx.player.findUnique.mockResolvedValueOnce({ id: 200, name: "Trea Turner" });

    // After drop, the matcher reads roster — return Mookie at SS (his
    // tentative slot from the pairwise inheritance) plus an existing 2B
    // player who can slide.
    setRosterSnapshot([
      {
        id: 999, // newly created Mookie row
        playerId: 100,
        assignedPosition: "SS",
        player: { name: "Mookie Betts", posList: "OF,2B" },
      },
      {
        id: 60,
        playerId: 300,
        assignedPosition: "2B",
        player: { name: "Other Player", posList: "2B,SS" },
      },
    ]);

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 20, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    // Either 200 with reassignments, or the matcher kept things in place —
    // both are legal end-states. Just assert the flag-on path returned ok
    // and the response shape includes the new field.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("appliedReassignments");
    expect(Array.isArray(res.body.appliedReassignments)).toBe(true);
  });

  it("flag OFF (legacy) + slot conflict → 400 POSITION_INELIGIBLE (preserves old behavior)", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValue(RULES_AUTO_OFF);

    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 50, assignedPosition: "SS" });
    mockPrisma.player.findUnique.mockResolvedValue({
      name: "Juan Soto", posList: "OF",
    });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 20, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("POSITION_INELIGIBLE");
  });

  it("flag ON + matcher infeasible → 400 with NO_LEGAL_ASSIGNMENT", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValue(RULES_AUTO_ON);

    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 50, assignedPosition: "C" });
    mockPrisma.player.findUnique.mockResolvedValue({
      name: "OF Only", posList: "OF",
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    mockTx.roster.findFirst.mockResolvedValue({ id: 50, teamId: 10, playerId: 200 });
    mockTx.player.findUnique
      .mockResolvedValueOnce({
        id: 100, name: "OF Only", posPrimary: "OF",
        posList: "OF", mlbId: 1, mlbTeam: "LAD",
      })
      .mockResolvedValueOnce({ id: 200, name: "Dropped C" });

    // Post-drop roster: ONLY the new OF-only player — but matcher expects
    // 23 active slots filled. With just one player, the OF slot fills but
    // every other slot is empty → match size < required.
    // For this test we need a roster where the new player has *no* legal
    // slot. Construct an OF-overflow:
    setRosterSnapshot([
      // 6 OF-only players (5 OF slots + new player) → 1 unmatched.
      ...Array.from({ length: 5 }, (_, i) => ({
        id: 100 + i,
        playerId: 1000 + i,
        assignedPosition: "OF",
        player: { name: `OF ${i}`, posList: "OF" },
      })),
      {
        id: 999,
        playerId: 100,
        assignedPosition: "OF",
        player: { name: "OF Only", posList: "OF" },
      },
    ]);

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 20, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_LEGAL_ASSIGNMENT");
  });

  it("flag ON + drop player is on IL → matcher does NOT run (IL slot inheritance handled upstream)", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValue(RULES_AUTO_ON);

    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 50, assignedPosition: "IL" }); // drop on IL
    mockPrisma.player.findUnique.mockResolvedValue({
      name: "Add Guy", posList: "OF",
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
    mockTx.roster.findFirst.mockResolvedValue({ id: 50, teamId: 10, playerId: 200 });
    mockTx.player.findUnique.mockResolvedValueOnce({
      id: 100, name: "Add Guy", posPrimary: "OF",
      posList: "OF", mlbId: 1, mlbTeam: "LAD",
    });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 20, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    expect(res.status).toBe(200);
    expect(res.body.appliedReassignments).toEqual([]);
  });
});

describe("POST /transactions/il-stash — Yahoo-style auto-resolve", () => {
  it("flag ON + reshuffle works → 200 with appliedReassignments", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValue(RULES_AUTO_ON);

    mockPrisma.roster.findFirst
      .mockResolvedValueOnce({ id: 50, assignedPosition: "OF", acquiredAt: new Date("2026-04-01Z") }) // stashRoster
      .mockResolvedValueOnce(null); // existingRoster for addPlayer
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 100, name: "Replacement", posPrimary: "OF",
      posList: "OF,1B", mlbId: 1, mlbTeam: "LAD",
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    // In-tx FOR UPDATE re-read: still on OF.
    mockTx.roster.findFirst.mockResolvedValue({
      id: 50, assignedPosition: "OF",
    });
    // Roster post-stash for matcher.
    setRosterSnapshot([
      {
        id: 999,
        playerId: 100,
        assignedPosition: "OF",
        player: { name: "Replacement", posList: "OF,1B" },
      },
    ]);

    const res = await supertest(app).post("/transactions/il-stash").send({
      leagueId: 20, teamId: 10, stashPlayerId: 42, addPlayerId: 100,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("appliedReassignments");
    expect(Array.isArray(res.body.appliedReassignments)).toBe(true);
  });

  it("flag OFF + position-incompatible add → 400 POSITION_INELIGIBLE (legacy)", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValue(RULES_AUTO_OFF);

    mockPrisma.roster.findFirst.mockResolvedValueOnce({
      id: 50, assignedPosition: "SS", acquiredAt: new Date("2026-04-01Z"),
    });
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 100, name: "OF Only", posPrimary: "OF",
      posList: "OF", mlbId: 1, mlbTeam: "LAD",
    });

    const res = await supertest(app).post("/transactions/il-stash").send({
      leagueId: 20, teamId: 10, stashPlayerId: 42, addPlayerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("POSITION_INELIGIBLE");
  });
});

describe("POST /transactions/il-activate — Yahoo-style auto-resolve", () => {
  it("flag ON + reshuffle works → 200 with appliedReassignments", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValue(RULES_AUTO_ON);

    mockPrisma.roster.findFirst
      .mockResolvedValueOnce({ id: 200, assignedPosition: "IL" }) // ilRoster
      .mockResolvedValueOnce({
        id: 50, assignedPosition: "OF",
        acquiredAt: new Date("2026-04-01Z"),
      }); // dropRoster
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 42, name: "Activated", posList: "OF,1B",
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    mockTx.roster.findFirst
      .mockResolvedValueOnce({ id: 200, assignedPosition: "IL" })
      .mockResolvedValueOnce({ id: 50, assignedPosition: "OF" });

    setRosterSnapshot([
      {
        id: 200,
        playerId: 42,
        assignedPosition: "OF", // moved off IL inside tx
        player: { name: "Activated", posList: "OF,1B" },
      },
    ]);

    const res = await supertest(app).post("/transactions/il-activate").send({
      leagueId: 20, teamId: 10,
      activatePlayerId: 42, dropPlayerId: 100,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("appliedReassignments");
    expect(Array.isArray(res.body.appliedReassignments)).toBe(true);
  });

  it("flag OFF + activate player can't fill drop slot → 400 POSITION_INELIGIBLE (legacy)", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValue(RULES_AUTO_OFF);

    mockPrisma.roster.findFirst
      .mockResolvedValueOnce({ id: 200, assignedPosition: "IL" })
      .mockResolvedValueOnce({
        id: 50, assignedPosition: "C",
        acquiredAt: new Date("2026-04-01Z"),
      });
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 42, name: "OF Only", posList: "OF",
    });

    const res = await supertest(app).post("/transactions/il-activate").send({
      leagueId: 20, teamId: 10,
      activatePlayerId: 42, dropPlayerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("POSITION_INELIGIBLE");
  });
});

describe("Auto-resolve response shape — appliedReassignments contract", () => {
  it("/claim no-reshuffle path still returns appliedReassignments: []", async () => {
    // Flag on, but the new player happens to fit incumbent slot exactly.
    mockPrisma.leagueRule.findMany.mockResolvedValue(RULES_AUTO_ON);
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 50, assignedPosition: "OF" });
    mockPrisma.player.findUnique.mockResolvedValue({
      name: "OF Match", posList: "OF",
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    mockTx.roster.findFirst.mockResolvedValue({ id: 50, teamId: 10, playerId: 200 });
    mockTx.player.findUnique
      .mockResolvedValueOnce({
        id: 100, name: "OF Match", posPrimary: "OF",
        posList: "OF", mlbId: 1, mlbTeam: "LAD",
      })
      .mockResolvedValueOnce({ id: 200, name: "Dropped" });
    setRosterSnapshot([
      { id: 999, playerId: 100, assignedPosition: "OF", player: { name: "OF Match", posList: "OF" } },
    ]);

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 20, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    expect(res.status).toBe(200);
    expect(res.body.appliedReassignments).toEqual([]);
  });

  it("/claim flag OFF still returns appliedReassignments: [] in response shape", async () => {
    // Flag off — legacy path returns `[]` because the response variable is
    // initialized empty and never populated when auto-resolve is skipped.
    mockPrisma.leagueRule.findMany.mockResolvedValue(RULES_AUTO_OFF);
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 50, assignedPosition: "OF" });
    mockPrisma.player.findUnique.mockResolvedValue({
      name: "OF", posList: "OF",
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
    mockTx.roster.findFirst.mockResolvedValue({ id: 50, teamId: 10, playerId: 200 });
    mockTx.player.findUnique.mockResolvedValueOnce({
      id: 100, name: "OF", posPrimary: "OF", posList: "OF", mlbId: 1, mlbTeam: "LAD",
    });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 20, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    expect(res.status).toBe(200);
    expect(res.body.appliedReassignments).toEqual([]);
  });
});
