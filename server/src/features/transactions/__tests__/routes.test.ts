import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

const mockTx = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  roster: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    update: vi.fn(),
    count: vi.fn().mockResolvedValue(10),
  },
  player: { findUnique: vi.fn() },
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
    leagueMembership: { findUnique: vi.fn() },
    leagueRule: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn(async (fn: any) => fn(mockTx)),
  },
}));

// Mock the ilSlotGuard module so MLB-feed calls and ghost-IL scans don't
// hit real network/DB. Individual tests override these return values.
const mockCheckMlbIlEligibility = vi.fn();
const mockAssertIlSlotAvailable = vi.fn().mockResolvedValue(undefined);
const mockAssertNoGhostIl = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../lib/ilSlotGuard.js", () => ({
  checkMlbIlEligibility: (...args: any[]) => mockCheckMlbIlEligibility(...args),
  assertIlSlotAvailable: (...args: any[]) => mockAssertIlSlotAvailable(...args),
  assertNoGhostIl: (...args: any[]) => mockAssertNoGhostIl(...args),
}));

// Control enforcement at test-time via env. Phase 1 guards only fire when
// this is true — default false so existing tests see legacy behavior.
const originalEnv = process.env;
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const mockWriteAuditLog = vi.fn();
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args) }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
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
  // Phase 2 adds these — default to passing for existing tests; individual
  // Phase 2 tests can override by controlling tx.roster.count / leagueRule.findMany.
  assertRosterAtExactCap: vi.fn().mockResolvedValue(undefined),
  loadLeagueRosterCap: vi.fn().mockResolvedValue(23),
}));
vi.mock("../../../middleware/seasonGuard.js", () => ({
  requireSeasonStatus: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

import { prisma } from "../../../db/prisma.js";

const mockPrisma = prisma as any;

// ── Express test app ─────────────────────────────────────────────

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

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.player.findUnique.mockResolvedValue({ id: 100, name: "Mike Trout", posPrimary: "OF", posList: "OF", mlbId: 545361, mlbTeam: "LAA" });
  mockTx.roster.create.mockResolvedValue({});
  mockTx.roster.findMany.mockResolvedValue([]);
  mockTx.transactionEvent.create.mockResolvedValue({});
  mockTx.rosterSlotEvent.create.mockResolvedValue({});
  mockTx.leagueRule.findMany.mockResolvedValue([]);
  mockTx.leagueRule.findFirst.mockResolvedValue(null);
  mockAssertIlSlotAvailable.mockResolvedValue(undefined);
  mockAssertNoGhostIl.mockResolvedValue(undefined);
  // Default: ENFORCE off so existing legacy tests see pre-Phase-2 behavior.
  // Phase 2 describe blocks override to "true".
  process.env = { ...originalEnv, ENFORCE_ROSTER_RULES: "false" };
});

// ── GET /transactions ────────────────────────────────────────────

describe("GET /transactions", () => {
  it("returns paginated transactions for a league", async () => {
    const txns = [{ id: 1, transactionType: "ADD", submittedAt: new Date() }];
    mockPrisma.transactionEvent.count.mockResolvedValue(1);
    mockPrisma.transactionEvent.findMany.mockResolvedValue(txns);

    const res = await supertest(app).get("/transactions?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.skip).toBe(0);
    expect(res.body.take).toBe(50);
  });

  it("filters by teamId", async () => {
    mockPrisma.transactionEvent.count.mockResolvedValue(0);
    mockPrisma.transactionEvent.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/transactions?leagueId=1&teamId=10");
    expect(res.status).toBe(200);
    expect(mockPrisma.transactionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamId: 10 }),
      })
    );
  });

  it("supports custom skip/take", async () => {
    mockPrisma.transactionEvent.count.mockResolvedValue(100);
    mockPrisma.transactionEvent.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/transactions?leagueId=1&skip=10&take=25");
    expect(res.status).toBe(200);
    expect(res.body.skip).toBe(10);
    expect(res.body.take).toBe(25);
  });
});

// ── POST /transactions/claim ─────────────────────────────────────

describe("POST /transactions/claim", () => {
  it("claims a player by playerId", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null); // not rostered
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.playerId).toBe(100);
  });

  it("claims a player by mlbId", async () => {
    mockPrisma.player.findFirst.mockResolvedValue({ id: 100 });
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, mlbId: 545361,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 404 when mlbId player not in DB", async () => {
    mockPrisma.player.findFirst.mockResolvedValue(null);

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, mlbId: 999999,
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("returns 400 when player already rostered", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      playerId: 100,
      team: { name: "Rival Team" },
    });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already on team");
  });

  it("handles claim with drop player", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
    mockTx.roster.findFirst.mockResolvedValue({ id: 50, teamId: 10, playerId: 200 });
    mockTx.player.findUnique.mockResolvedValue({ id: 200, name: "Dropped Guy" });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    expect(res.status).toBe(200);
    // Drop now uses soft-delete (update with releasedAt) instead of hard delete
    expect(mockTx.roster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50 },
        data: expect.objectContaining({ source: "DROP" }),
      })
    );
  });
});

// ── POST /transactions/claim with effectiveDate (backdate) ──────

describe("POST /transactions/claim — effectiveDate backdate", () => {
  const EFFECTIVE = "2026-04-11";
  const EFFECTIVE_UTC = new Date("2026-04-11T00:00:00.000Z");

  it("stamps Roster.acquiredAt with the override date", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
      effectiveDate: EFFECTIVE,
    });

    expect(res.status).toBe(200);
    expect(mockTx.roster.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acquiredAt: EFFECTIVE_UTC }),
      }),
    );
  });

  it("stamps TransactionEvent.effDate with the override date", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
      effectiveDate: EFFECTIVE,
    });

    const txnCreateCalls = (mockTx.transactionEvent.create as any).mock.calls;
    expect(txnCreateCalls.length).toBeGreaterThan(0);
    expect(txnCreateCalls[0][0]).toMatchObject({
      data: expect.objectContaining({
        effDate: EFFECTIVE_UTC,
        transactionType: "ADD",
      }),
    });
  });

  it("parses ISO datetime override and normalizes to UTC midnight of that day", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
      effectiveDate: "2026-04-11T18:30:00Z",
    });

    expect(mockTx.roster.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acquiredAt: EFFECTIVE_UTC }),
      }),
    );
  });

  it("commissioner god-mode: backdates cross-team reassign — releases from old team at effective", async () => {
    // Player 100 currently on team 99 (another team). Admin backdates claim
    // to team 10.
    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 7, teamId: 99, playerId: 100, team: { name: "Rival Team" },
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
      effectiveDate: EFFECTIVE,
    });

    expect(res.status).toBe(200);

    // Old team's Roster row gets released at effective with reassign marker
    expect(mockTx.roster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({
          releasedAt: EFFECTIVE_UTC,
          source: "COMMISSIONER_REASSIGN",
        }),
      }),
    );

    // REASSIGN-DROP TransactionEvent written for the old team
    const reassignDropCalls = (mockTx.transactionEvent.create as any).mock.calls
      .filter((c: any[]) => c[0].data.rowHash?.startsWith("REASSIGN-DROP"));
    expect(reassignDropCalls).toHaveLength(1);
    expect(reassignDropCalls[0][0]).toMatchObject({
      data: expect.objectContaining({
        teamId: 99,
        transactionType: "DROP",
        effDate: EFFECTIVE_UTC,
      }),
    });

    // New team's Roster row at effective
    expect(mockTx.roster.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: 10,
          acquiredAt: EFFECTIVE_UTC,
        }),
      }),
    );
  });

  it("non-backdated claim preserves legacy behavior — 400 when player is on another team", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 7, teamId: 99, playerId: 100, team: { name: "Rival Team" },
    });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
      // no effectiveDate
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already on team");
    // Must NOT have started the reassign transaction
    expect(mockTx.roster.update).not.toHaveBeenCalled();
  });

  it("rejects with 400 when player is already on the target team", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 7, teamId: 10, playerId: 100, team: { name: "Target Team" },
    });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
      effectiveDate: EFFECTIVE,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already on this team's active roster");
  });

  it("returns 400 for malformed effectiveDate", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
      effectiveDate: "not-a-date",
    });

    // Zod validation middleware is mocked as passthrough in these tests, so
    // the regex-based effectiveDateSchema check happens but doesn't reject
    // until resolveEffectiveDate throws inside the handler. Either path
    // surfaces as a 400.
    expect(res.status).toBe(400);
  });

  it("audit log includes effectiveDate, backdated flag, and reassignedFromTeamId for cross-team reassign", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 7, teamId: 99, playerId: 100, team: { name: "Rival Team" },
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
      effectiveDate: EFFECTIVE,
    });

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TRANSACTION_CLAIM",
        metadata: expect.objectContaining({
          effectiveDate: EFFECTIVE_UTC.toISOString(),
          backdated: true,
          reassignedFromTeamId: 99,
        }),
      }),
    );
  });

  it("audit log has backdated=false and reassignedFromTeamId=null for non-backdated claim", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          backdated: false,
          reassignedFromTeamId: null,
        }),
      }),
    );
  });
});

// ── POST /transactions/drop with effectiveDate (backdate) ───────

describe("POST /transactions/drop — effectiveDate backdate", () => {
  const EFFECTIVE = "2026-04-11";
  const EFFECTIVE_UTC = new Date("2026-04-11T00:00:00.000Z");

  beforeEach(() => {
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
  });

  it("stamps Roster.releasedAt with the override date", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 5,
      teamId: 10,
      playerId: 100,
      acquiredAt: new Date("2026-04-01T00:00:00Z"),
    });

    const res = await supertest(app).post("/transactions/drop").send({
      leagueId: 1, teamId: 10, playerId: 100,
      effectiveDate: EFFECTIVE,
    });

    expect(res.status).toBe(200);
    expect(mockTx.roster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({
          releasedAt: EFFECTIVE_UTC,
          source: "DROP",
        }),
      }),
    );
  });

  it("rejects 400 when effectiveDate is before the player's acquiredAt", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 5,
      teamId: 10,
      playerId: 100,
      acquiredAt: new Date("2026-04-15T00:00:00Z"), // acquired AFTER effective
    });

    const res = await supertest(app).post("/transactions/drop").send({
      leagueId: 1, teamId: 10, playerId: 100,
      effectiveDate: EFFECTIVE,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must be after the player was acquired/);
    expect(mockTx.roster.update).not.toHaveBeenCalled();
  });

  it("rejects 400 when effectiveDate equals acquiredAt (strict >)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 5,
      teamId: 10,
      playerId: 100,
      acquiredAt: new Date("2026-04-11T00:00:00Z"),
    });

    const res = await supertest(app).post("/transactions/drop").send({
      leagueId: 1, teamId: 10, playerId: 100,
      effectiveDate: EFFECTIVE,
    });

    expect(res.status).toBe(400);
  });

  it("stamps TransactionEvent.effDate with override and writes backdated audit metadata", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 5,
      teamId: 10,
      playerId: 100,
      acquiredAt: new Date("2026-04-01T00:00:00Z"),
    });

    await supertest(app).post("/transactions/drop").send({
      leagueId: 1, teamId: 10, playerId: 100,
      effectiveDate: EFFECTIVE,
    });

    expect(mockTx.transactionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          effDate: EFFECTIVE_UTC,
          transactionType: "DROP",
        }),
      }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TRANSACTION_DROP",
        metadata: expect.objectContaining({
          effectiveDate: EFFECTIVE_UTC.toISOString(),
          backdated: true,
        }),
      }),
    );
  });

  it("non-backdated drop defaults to nextDayEffective (any Date, just not the override)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 5,
      teamId: 10,
      playerId: 100,
      acquiredAt: new Date("2026-04-01T00:00:00Z"),
    });

    await supertest(app).post("/transactions/drop").send({
      leagueId: 1, teamId: 10, playerId: 100,
      // no effectiveDate
    });

    const updateCall = (mockTx.roster.update as any).mock.calls[0][0];
    // releasedAt is a Date, and specifically NOT our override date
    expect(updateCall.data.releasedAt).toBeInstanceOf(Date);
    expect(updateCall.data.releasedAt.getTime()).not.toBe(EFFECTIVE_UTC.getTime());
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ backdated: false }),
      }),
    );
  });
});

// ══════════════════════════════════════════════════════════════════
//  Phase 2a — Roster rules enforcement behind ENFORCE_ROSTER_RULES=true
// ══════════════════════════════════════════════════════════════════

describe("POST /transactions/claim — Phase 2 enforcement (ENFORCE=true)", () => {
  const OGBA_RULES = [
    { category: "roster", key: "pitcher_count", value: "9" },
    { category: "roster", key: "batter_count", value: "14" },
  ];

  beforeEach(() => {
    process.env.ENFORCE_ROSTER_RULES = "true";
    mockTx.leagueRule.findMany.mockResolvedValue(OGBA_RULES);
    mockTx.roster.count.mockResolvedValue(23); // team at cap
  });

  it("rejects claim without dropPlayerId (DROP_REQUIRED)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DROP_REQUIRED");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects claim with position-incompatible drop (POSITION_INELIGIBLE)", async () => {
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)  // existingRoster check (player 100 not rostered)
      .mockResolvedValueOnce({ id: 50, assignedPosition: "SS" }); // drop player at SS
    mockPrisma.player.findUnique.mockResolvedValue({
      name: "Juan Soto", posList: "OF",
    });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("POSITION_INELIGIBLE");
    expect(res.body.error).toContain("SS");
    expect(res.body.error).toContain("Juan Soto");
  });

  it("accepts claim when added player is eligible for drop slot; added player inherits the slot", async () => {
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)  // existingRoster
      .mockResolvedValueOnce({ id: 50, assignedPosition: "MI" }); // drop at MI
    mockPrisma.player.findUnique.mockResolvedValue({
      name: "Replacement Mookie", posList: "2B,OF",
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
    mockTx.roster.findFirst.mockResolvedValue({ id: 50, teamId: 10, playerId: 200 });
    mockTx.player.findUnique.mockResolvedValue({ id: 200, name: "Dropped" });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    expect(res.status).toBe(200);
    // Added player's Roster row inherits the MI slot (not the primary 2B).
    expect(mockTx.roster.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assignedPosition: "MI" }),
      }),
    );
  });

  it("rejects claim when team has a ghost-IL player (GHOST_IL)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockAssertNoGhostIl.mockRejectedValue(
      new (await import("../../../lib/rosterRuleError.js")).RosterRuleError(
        "GHOST_IL",
        "Team has ghost-IL player Reactivated Guy — activate before stashing.",
      ),
    );

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("GHOST_IL");
  });

  it("rejects claim when dropPlayerId is not on team (IL_UNKNOWN_PLAYER)", async () => {
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)  // existingRoster
      .mockResolvedValueOnce(null); // drop not on team

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100, dropPlayerId: 999,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("IL_UNKNOWN_PLAYER");
  });
});

describe("POST /transactions/drop — Phase 2 enforcement (ENFORCE=true)", () => {
  beforeEach(() => {
    process.env.ENFORCE_ROSTER_RULES = "true";
  });

  it("rejects standalone drop of an active player (DROP_REQUIRED)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 5, teamId: 10, playerId: 100,
      acquiredAt: new Date("2026-04-01T00:00:00Z"),
      assignedPosition: "OF",
    });

    const res = await supertest(app).post("/transactions/drop").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DROP_REQUIRED");
    expect(res.body.error).toContain("Use POST /transactions/claim");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("allows drop of an IL-slotted player", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 5, teamId: 10, playerId: 100,
      acquiredAt: new Date("2026-04-01T00:00:00Z"),
      assignedPosition: "IL",
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/drop").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(res.status).toBe(200);
    expect(mockTx.roster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ source: "DROP" }),
      }),
    );
  });
});

describe("POST /transactions/il-stash", () => {
  const IL_STATUS = {
    status: "Injured 10-Day",
    cacheFetchedAt: new Date("2026-04-21T10:00:00Z"),
  };

  beforeEach(() => {
    process.env.ENFORCE_ROSTER_RULES = "true";
    mockCheckMlbIlEligibility.mockResolvedValue(IL_STATUS);
    mockAssertIlSlotAvailable.mockResolvedValue(undefined);
    mockAssertNoGhostIl.mockResolvedValue(undefined);
  });

  it("atomically stashes + adds: writes RosterSlotEvent, both TransactionEvents, and inherits slot", async () => {
    // Stash player is on team 10 in OF slot.
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce({ id: 50, assignedPosition: "OF", acquiredAt: new Date("2026-04-01Z") }) // stashRoster (pre-tx)
      .mockResolvedValueOnce(null); // existingRoster for addPlayer (not on any team)
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 100, name: "Jo Adell", posPrimary: "OF", posList: "OF",
      mlbId: 123, mlbTeam: "LAA",
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/il-stash").send({
      leagueId: 1, teamId: 10,
      stashPlayerId: 42, addPlayerId: 100,
    });

    expect(res.status).toBe(200);
    expect(res.body.stashPlayerId).toBe(42);
    expect(res.body.addPlayerId).toBe(100);

    // Stash player's Roster row updated to assignedPosition = "IL"
    expect(mockTx.roster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50 },
        data: expect.objectContaining({ assignedPosition: "IL" }),
      }),
    );
    // Add player's new Roster row inherits OF (the slot stashPlayer vacated)
    expect(mockTx.roster.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          playerId: 100,
          assignedPosition: "OF",
          source: "il_stash",
        }),
      }),
    );
    // RosterSlotEvent IL_STASH with MLB evidence capture
    expect(mockTx.rosterSlotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          playerId: 42,
          event: "IL_STASH",
          mlbStatusSnapshot: "Injured 10-Day",
          mlbStatusFetchedAt: IL_STATUS.cacheFetchedAt,
        }),
      }),
    );
    // Two TransactionEvents: IL_STASH + ADD
    const types = (mockTx.transactionEvent.create as any).mock.calls
      .map((c: any[]) => c[0].data.transactionType);
    expect(types).toContain("IL_STASH");
    expect(types).toContain("ADD");
  });

  it("rejects when MLB status is not an 'Injured …-Day' designation (NOT_MLB_IL)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValueOnce({
      id: 50, assignedPosition: "OF", acquiredAt: new Date("2026-04-01Z"),
    });
    mockCheckMlbIlEligibility.mockRejectedValue(
      new (await import("../../../lib/rosterRuleError.js")).RosterRuleError(
        "NOT_MLB_IL",
        "Mike Trout's MLB status is \"Active\" — not eligible for IL.",
      ),
    );

    const res = await supertest(app).post("/transactions/il-stash").send({
      leagueId: 1, teamId: 10, stashPlayerId: 42, addPlayerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NOT_MLB_IL");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects when MLB feed is unavailable (MLB_FEED_UNAVAILABLE, fail-closed)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValueOnce({
      id: 50, assignedPosition: "OF", acquiredAt: new Date("2026-04-01Z"),
    });
    mockCheckMlbIlEligibility.mockRejectedValue(
      new (await import("../../../lib/rosterRuleError.js")).RosterRuleError(
        "MLB_FEED_UNAVAILABLE",
        "MLB status feed unavailable; cannot verify IL status.",
      ),
    );

    const res = await supertest(app).post("/transactions/il-stash").send({
      leagueId: 1, teamId: 10, stashPlayerId: 42, addPlayerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MLB_FEED_UNAVAILABLE");
  });

  it("rejects when add player is position-incompatible with stash player's slot", async () => {
    mockPrisma.roster.findFirst.mockResolvedValueOnce({
      id: 50, assignedPosition: "SS", acquiredAt: new Date("2026-04-01Z"),
    });
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 100, name: "OF Only", posPrimary: "OF", posList: "OF",
      mlbId: 123, mlbTeam: "LAA",
    });

    const res = await supertest(app).post("/transactions/il-stash").send({
      leagueId: 1, teamId: 10, stashPlayerId: 42, addPlayerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("POSITION_INELIGIBLE");
  });

  it("rejects when stash player is not on the team's active roster", async () => {
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null);

    const res = await supertest(app).post("/transactions/il-stash").send({
      leagueId: 1, teamId: 10, stashPlayerId: 42, addPlayerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("IL_UNKNOWN_PLAYER");
  });

  it("rejects when stash player is already on IL (NOT_ON_IL)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValueOnce({
      id: 50, assignedPosition: "IL", acquiredAt: new Date("2026-04-01Z"),
    });

    const res = await supertest(app).post("/transactions/il-stash").send({
      leagueId: 1, teamId: 10, stashPlayerId: 42, addPlayerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NOT_ON_IL");
  });

  it("requires addPlayerId or addMlbId", async () => {
    const res = await supertest(app).post("/transactions/il-stash").send({
      leagueId: 1, teamId: 10, stashPlayerId: 42,
    });
    // Zod validator is mocked as passthrough in these tests; the handler's
    // own check catches this case.
    expect(res.status).toBe(400);
  });
});

describe("POST /transactions/il-activate", () => {
  beforeEach(() => {
    process.env.ENFORCE_ROSTER_RULES = "true";
  });

  it("atomically activates + drops: updates slot, releases drop, writes RosterSlotEvent and both TransactionEvents", async () => {
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce({ id: 200, assignedPosition: "IL" }) // ilRoster
      .mockResolvedValueOnce({ id: 50, assignedPosition: "OF", acquiredAt: new Date("2026-04-01Z") }); // dropRoster
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 42, name: "Activated Guy", posList: "OF,1B",
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
    // Transaction-inner re-verifications
    mockTx.roster.findFirst
      .mockResolvedValueOnce({ id: 200, assignedPosition: "IL" })
      .mockResolvedValueOnce({ id: 50, assignedPosition: "OF" });

    const res = await supertest(app).post("/transactions/il-activate").send({
      leagueId: 1, teamId: 10,
      activatePlayerId: 42, dropPlayerId: 100,
    });

    expect(res.status).toBe(200);
    // Drop player released
    expect(mockTx.roster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50 },
        data: expect.objectContaining({ source: "DROP" }),
      }),
    );
    // Activate player slot updated to dropped player's slot (OF)
    expect(mockTx.roster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 200 },
        data: expect.objectContaining({ assignedPosition: "OF" }),
      }),
    );
    // RosterSlotEvent IL_ACTIVATE
    expect(mockTx.rosterSlotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: "IL_ACTIVATE", playerId: 42 }),
      }),
    );
    // Two TransactionEvents
    const types = (mockTx.transactionEvent.create as any).mock.calls
      .map((c: any[]) => c[0].data.transactionType);
    expect(types).toContain("IL_ACTIVATE");
    expect(types).toContain("DROP");
  });

  it("rejects when activate player is not on IL (NOT_ON_IL)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValueOnce({
      id: 200, assignedPosition: "OF", // active, not IL
    });

    const res = await supertest(app).post("/transactions/il-activate").send({
      leagueId: 1, teamId: 10,
      activatePlayerId: 42, dropPlayerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NOT_ON_IL");
  });

  it("rejects when activate player is not position-eligible for drop slot", async () => {
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce({ id: 200, assignedPosition: "IL" })
      .mockResolvedValueOnce({ id: 50, assignedPosition: "C", acquiredAt: new Date("2026-04-01Z") });
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 42, name: "OF-Only", posList: "OF",
    });

    const res = await supertest(app).post("/transactions/il-activate").send({
      leagueId: 1, teamId: 10,
      activatePlayerId: 42, dropPlayerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("POSITION_INELIGIBLE");
  });

  it("rejects when drop player is on IL (should use /transactions/drop instead)", async () => {
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce({ id: 200, assignedPosition: "IL" })
      .mockResolvedValueOnce({ id: 50, assignedPosition: "IL", acquiredAt: new Date("2026-04-01Z") });

    const res = await supertest(app).post("/transactions/il-activate").send({
      leagueId: 1, teamId: 10,
      activatePlayerId: 42, dropPlayerId: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DROP_REQUIRED");
  });
});
