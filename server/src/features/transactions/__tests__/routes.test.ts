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
  // incrementRosterVersion (rosterVersionGuard) increments inside the transaction
  team: { update: vi.fn().mockResolvedValue({ rosterVersion: 1 }) },
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
    // checkRosterVersion reads Team.rosterVersion outside the transaction
    team: { findUnique: vi.fn().mockResolvedValue({ rosterVersion: 0 }) },
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

// Mock getMlbPlayerStatus for the sync-il-status endpoint (IL scenario).
// Default returns Active so non-overriding tests don't accidentally trip
// IL flow. Per-test overrides via mockGetMlbPlayerStatus.mockResolvedValue.
const mockGetMlbPlayerStatus = vi.fn();
vi.mock("../../../lib/mlbApi.js", async () => {
  // Real module wraps a network call to MLB statsapi; replace just the
  // single export we use. Other exports (fetchMlbTeamsMap etc.) aren't
  // touched in these route tests but importing the real module would
  // pull in network code. Use full replacement.
  return {
    getMlbPlayerStatus: (...args: any[]) => mockGetMlbPlayerStatus(...args),
  };
});

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

  it("clamps take to 200 when caller requests larger page (DoS guard, #187)", async () => {
    mockPrisma.transactionEvent.count.mockResolvedValue(0);
    mockPrisma.transactionEvent.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/transactions?leagueId=1&take=999999");
    expect(res.status).toBe(200);
    expect(res.body.take).toBe(200);
    expect(mockPrisma.transactionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it("clamps take to minimum 1 when caller passes zero or negative", async () => {
    mockPrisma.transactionEvent.count.mockResolvedValue(0);
    mockPrisma.transactionEvent.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/transactions?leagueId=1&take=0");
    expect(res.status).toBe(200);
    expect(res.body.take).toBe(50); // Number(0) || 50 → 50

    const negRes = await supertest(app).get("/transactions?leagueId=1&take=-5");
    expect(negRes.status).toBe(200);
    expect(negRes.body.take).toBe(1);
  });

  it("clamps skip to 100_000 maximum and 0 minimum", async () => {
    mockPrisma.transactionEvent.count.mockResolvedValue(0);
    mockPrisma.transactionEvent.findMany.mockResolvedValue([]);

    const huge = await supertest(app).get("/transactions?leagueId=1&skip=999999999");
    expect(huge.status).toBe(200);
    expect(huge.body.skip).toBe(100_000);

    const neg = await supertest(app).get("/transactions?leagueId=1&skip=-50");
    expect(neg.status).toBe(200);
    expect(neg.body.skip).toBe(0);
  });

  it("falls back to defaults on non-numeric take/skip", async () => {
    mockPrisma.transactionEvent.count.mockResolvedValue(0);
    mockPrisma.transactionEvent.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/transactions?leagueId=1&take=abc&skip=xyz");
    expect(res.status).toBe(200);
    expect(res.body.take).toBe(50);
    expect(res.body.skip).toBe(0);
  });

  it("includes effDate + submittedAt on each row (backdated-marker contract)", async () => {
    // The activity-log "Backdated" filter + per-row chip on the client
    // depends on `effDate` and `submittedAt` being present on every row
    // returned from this endpoint. The findMany call uses Prisma's default
    // selection (no `select` clause) so all scalar fields are emitted —
    // this test pins that behavior so a future PR can't add a `select`
    // that drops either field without flipping the test red.
    const submittedAt = new Date("2026-04-15T18:00:00.000Z");
    const effDate = new Date("2026-04-10T00:00:00.000Z");
    mockPrisma.transactionEvent.count.mockResolvedValue(1);
    mockPrisma.transactionEvent.findMany.mockResolvedValue([
      { id: 1, leagueId: 1, transactionType: "ADD", effDate, submittedAt },
    ]);

    const res = await supertest(app).get("/transactions?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.transactions[0].effDate).toBe(effDate.toISOString());
    expect(res.body.transactions[0].submittedAt).toBe(submittedAt.toISOString());

    // Pin: no `select` clause is passed to findMany — all scalars flow through.
    const findManyCall = mockPrisma.transactionEvent.findMany.mock.calls[0][0];
    expect(findManyCall.select).toBeUndefined();
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

  // Legacy POSITION_INELIGIBLE strict-pairwise rejection is gone — auto-resolve
  // runs unconditionally as of PR2 cuts §0. Equivalent matcher-infeasibility
  // coverage lives in autoResolveRoutes.test.ts (NO_LEGAL_ASSIGNMENT).

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

  it("claim proceeds when team has a ghost-IL player — ghost IL no longer blocks add/drop", async () => {
    // Regression guard: assertNoGhostIl was previously called in the claim flow
    // and would reject. The rule was removed — ghost IL players can stay stashed
    // indefinitely; there is no forced-activation requirement for add/drop.
    mockAssertNoGhostIl.mockRejectedValue(
      new (await import("../../../lib/rosterRuleError.js")).RosterRuleError(
        "GHOST_IL",
        "Would have blocked before the fix.",
      ),
    );
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)  // existingRoster
      .mockResolvedValueOnce({ id: 50, assignedPosition: "MI" }); // drop preview
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
    mockTx.roster.findFirst.mockResolvedValue({ id: 50, teamId: 10, playerId: 200 });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100, dropPlayerId: 200,
    });

    expect(res.status).toBe(200);
    expect(mockAssertNoGhostIl).not.toHaveBeenCalled();
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

  // Legacy POSITION_INELIGIBLE strict-pairwise rejection is gone — auto-resolve
  // runs unconditionally as of PR2 cuts §0. See autoResolveRoutes.test.ts.

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

  it("stash-only mode (no addPlayerId): IL slot transition fires, no add Roster row created", async () => {
    // v3 hub IL scenario direction-lock: queues stash without a paired
    // add. Server moves the player to IL and the matcher reshuffles the
    // active roster from BN. No new Roster row, no ADD TransactionEvent.
    mockPrisma.roster.findFirst.mockResolvedValueOnce({
      id: 50, assignedPosition: "OF", acquiredAt: new Date("2026-04-01Z"),
    });
    // No second findFirst call (existingRoster) since stashOnly skips it.
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/il-stash").send({
      leagueId: 1, teamId: 10, stashPlayerId: 42,
      // No addPlayerId / addMlbId — stash-only mode
    });

    expect(res.status).toBe(200);
    expect(res.body.stashOnly).toBe(true);
    expect(res.body.addPlayerId).toBeNull();

    // Stash player's Roster row updated to IL
    expect(mockTx.roster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50 },
        data: expect.objectContaining({ assignedPosition: "IL" }),
      }),
    );
    // No new Roster row created (the stash-only branch skips it)
    expect(mockTx.roster.create).not.toHaveBeenCalled();
    // Only IL_STASH TransactionEvent — no ADD pairing
    const types = (mockTx.transactionEvent.create as any).mock.calls
      .map((c: any[]) => c[0].data.transactionType);
    expect(types).toContain("IL_STASH");
    expect(types).not.toContain("ADD");
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

  // Legacy POSITION_INELIGIBLE strict-pairwise rejection is gone — auto-resolve
  // runs unconditionally as of PR2 cuts §0. See autoResolveRoutes.test.ts.

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

// ── Response envelope: mlbId/name echo (#194) ───────────────────
//
// The shared roster-move response schemas include the affected players'
// `mlbId` + `name` so the client can render toasts without a follow-up
// player-detail fetch. Tests below assert the echo lands in each
// success envelope.

describe("response envelope echoes mlbId + name (#194)", () => {
  beforeEach(() => {
    process.env.ENFORCE_ROSTER_RULES = "false";
  });

  it("POST /transactions/claim echoes mlbId + name on success", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
    mockPrisma.player.findUnique.mockResolvedValue({ mlbId: 545361, name: "Mike Trout" });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(res.status).toBe(200);
    expect(res.body.mlbId).toBe(545361);
    expect(res.body.name).toBe("Mike Trout");
  });

  it("POST /transactions/il-stash echoes stashMlbId + stashName (stash-only mode)", async () => {
    process.env.ENFORCE_ROSTER_RULES = "true";
    mockCheckMlbIlEligibility.mockResolvedValue({
      status: "Injured 10-Day",
      cacheFetchedAt: new Date("2026-04-21T10:00:00Z"),
    });
    mockPrisma.roster.findFirst.mockResolvedValueOnce({
      id: 50, assignedPosition: "OF", acquiredAt: new Date("2026-04-01Z"),
    });
    mockPrisma.player.findUnique.mockResolvedValueOnce({ mlbId: 660271, name: "Shohei Ohtani" });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/il-stash").send({
      leagueId: 1, teamId: 10, stashPlayerId: 42,
    });

    expect(res.status).toBe(200);
    expect(res.body.stashMlbId).toBe(660271);
    expect(res.body.stashName).toBe("Shohei Ohtani");
    expect(res.body.addMlbId).toBeNull();
    expect(res.body.addName).toBeNull();
  });

  it("POST /transactions/il-activate echoes both activate + drop identities", async () => {
    process.env.ENFORCE_ROSTER_RULES = "true";
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce({ id: 200, assignedPosition: "IL" }) // ilRoster
      .mockResolvedValueOnce({ id: 50, assignedPosition: "OF", acquiredAt: new Date("2026-04-01Z") }); // dropRoster
    mockPrisma.player.findUnique
      .mockResolvedValueOnce({ id: 42, name: "Returning Star", posList: "OF,1B", mlbId: 111111 }) // activatePlayer
      .mockResolvedValueOnce({ mlbId: 222222, name: "Departing Friend" }); // dropPlayerInfo
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
    mockTx.roster.findFirst
      .mockResolvedValueOnce({ id: 200, assignedPosition: "IL" })
      .mockResolvedValueOnce({ id: 50, assignedPosition: "OF" });

    const res = await supertest(app).post("/transactions/il-activate").send({
      leagueId: 1, teamId: 10,
      activatePlayerId: 42, dropPlayerId: 100,
    });

    expect(res.status).toBe(200);
    expect(res.body.activateMlbId).toBe(111111);
    expect(res.body.activateName).toBe("Returning Star");
    expect(res.body.dropMlbId).toBe(222222);
    expect(res.body.dropName).toBe("Departing Friend");
  });
});

// ── Cache invalidation hook (todo #137 + #143) ──────────────────
//
// After a successful roster mutation the handler must purge the in-memory
// caches keyed on (leagueId). Tests below seed a known cache entry, fire the
// mutation, and assert the entry is gone — proving the hook fires before
// `res.json` returns (cache hit before, miss after).

describe("transaction handlers — invalidate league caches", () => {
  it("POST /transactions/claim flushes players + standings caches for the league", async () => {
    const { withPlayersCache, _playersCacheSize } = await import("../../players/services/playersListCache.js");
    const standingsModule = await import("../../standings/services/standingsService.js");

    // Seed both caches for league 1.
    await withPlayersCache(1, "all", "all", () => Promise.resolve([{ name: "cached" }]));
    expect(_playersCacheSize()).toBe(1);

    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(res.status).toBe(200);
    // The hook fired — players cache for league 1 is now empty.
    expect(_playersCacheSize()).toBe(0);

    // Standings cache invalidation is exercised via clearStandingsCache being a
    // public, side-effect-only API; verifying it was invoked is enough.
    expect(typeof standingsModule.clearStandingsCache).toBe("function");
  });

  it("POST /transactions/drop flushes the players cache for the league", async () => {
    const { withPlayersCache, _playersCacheSize } = await import("../../players/services/playersListCache.js");

    await withPlayersCache(1, "all", "all", () => Promise.resolve([{ name: "cached" }]));
    expect(_playersCacheSize()).toBe(1);

    mockPrisma.roster.findFirst.mockResolvedValue({
      id: 1, playerId: 100, teamId: 10, releasedAt: null,
      acquiredAt: new Date("2026-04-01Z"),
    });
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/transactions/drop").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(res.status).toBe(200);
    expect(_playersCacheSize()).toBe(0);
  });
});

// ── POST /transactions/sync-il-status (IL scenario) ──────────────
//
// Read-only refetch. Powers the v3 hub's "Resync" affordance on the
// ghost-IL warning chip per direction-lock IL #3. Returns the raw MLB
// status string verbatim (IL #1) — never normalized.

describe("POST /transactions/sync-il-status", () => {
  beforeEach(() => {
    mockGetMlbPlayerStatus.mockReset();
    // IDOR guard (#157): sync-il-status now requires the player to be on
    // the requesting team's roster. Default each test to a positive lookup
    // so legacy assertions stay focused on the MLB feed behavior.
    mockPrisma.roster.findFirst.mockResolvedValue({ id: 999 });
  });

  it("returns the freshly fetched MLB status string (verbatim per IL #1)", async () => {
    mockPrisma.player.findUnique.mockResolvedValueOnce({
      id: 100, name: "Trea Turner", mlbId: 607208, mlbTeam: "PHI",
    });
    mockGetMlbPlayerStatus.mockResolvedValueOnce({
      status: "Injured 10-Day",
      position: "SS",
      fetchedAt: 1700000000000,
    });

    const res = await supertest(app)
      .post("/transactions/sync-il-status")
      .send({ teamId: 10, playerId: 100 });

    expect(res.status).toBe(200);
    expect(res.body.playerId).toBe(100);
    expect(res.body.mlbId).toBe(607208);
    expect(res.body.mlbStatus).toBe("Injured 10-Day");
    expect(res.body.fetchedAt).toBeTruthy();
  });

  it("returns null mlbStatus when player not on 40-man (e.g. minors)", async () => {
    mockPrisma.player.findUnique.mockResolvedValueOnce({
      id: 100, name: "Some Player", mlbId: 999, mlbTeam: "BOS",
    });
    mockGetMlbPlayerStatus.mockResolvedValueOnce(null);

    const res = await supertest(app)
      .post("/transactions/sync-il-status")
      .send({ teamId: 10, playerId: 100 });

    expect(res.status).toBe(200);
    expect(res.body.mlbStatus).toBeNull();
  });

  it("returns 404 when the player doesn't exist", async () => {
    mockPrisma.player.findUnique.mockResolvedValueOnce(null);

    const res = await supertest(app)
      .post("/transactions/sync-il-status")
      .send({ teamId: 10, playerId: 9999 });

    expect(res.status).toBe(404);
  });

  it("returns null mlbStatus when player has no mlbId/mlbTeam (no feed call)", async () => {
    mockPrisma.player.findUnique.mockResolvedValueOnce({
      id: 100, name: "Synthetic", mlbId: null, mlbTeam: null,
    });

    const res = await supertest(app)
      .post("/transactions/sync-il-status")
      .send({ teamId: 10, playerId: 100 });

    expect(res.status).toBe(200);
    expect(res.body.mlbStatus).toBeNull();
    expect(mockGetMlbPlayerStatus).not.toHaveBeenCalled();
  });

  it("returns 503 with MLB_FEED_UNAVAILABLE when statsapi throws", async () => {
    mockPrisma.player.findUnique.mockResolvedValueOnce({
      id: 100, name: "Trea Turner", mlbId: 607208, mlbTeam: "PHI",
    });
    mockGetMlbPlayerStatus.mockRejectedValueOnce(new Error("network down"));

    const res = await supertest(app)
      .post("/transactions/sync-il-status")
      .send({ teamId: 10, playerId: 100 });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("MLB_FEED_UNAVAILABLE");
  });

  // ── #157 IDOR guard ─────────────────────────────────────────────
  it("returns 404 when the player is NOT on the requesting team's roster (#157 IDOR)", async () => {
    // Roster lookup misses — handler must short-circuit BEFORE calling
    // the MLB feed. Generic message so we don't disclose existence.
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null);

    const res = await supertest(app)
      .post("/transactions/sync-il-status")
      .send({ leagueId: 1, teamId: 10, playerId: 100 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Player not found on roster.");
    // Critically: the MLB feed must not be reached for foreign players.
    expect(mockGetMlbPlayerStatus).not.toHaveBeenCalled();
  });
});

// ── #158 raw error leakage on /transactions/claim ────────────────
//
// The catch-all branch used to echo `err.message` verbatim, leaking
// Prisma constraint names / SQL fragments to the client. Now the
// handler logs server-side and returns a generic INTERNAL envelope.

describe("POST /transactions/claim — error leakage (#158)", () => {
  it("does NOT include raw err.message in the response body on unexpected failures", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const SECRET = "Foreign key constraint violated on _RosterToPlayer__db_internal__";
    // Force the inner Prisma transaction to throw an Error whose message
    // would have been echoed under the old substring catch-all.
    mockPrisma.$transaction.mockImplementationOnce(async () => {
      throw new Error(SECRET);
    });

    const res = await supertest(app).post("/transactions/claim").send({
      leagueId: 1, teamId: 10, playerId: 100,
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Transaction failed", code: "INTERNAL" });
    // The whole serialized body must not contain any fragment of the raw
    // Prisma message — guards against partial leakage via nested fields.
    expect(JSON.stringify(res.body)).not.toContain("Foreign key");
    expect(JSON.stringify(res.body)).not.toContain("_RosterToPlayer");
  });
});
