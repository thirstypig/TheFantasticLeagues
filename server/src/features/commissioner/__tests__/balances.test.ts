import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn() },
    // Stubs for the broader router file's other route handlers.
    league: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    leagueRule: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), upsert: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
    leagueMembership: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
    leagueInvite: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    season: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    period: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    roster: { findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    transactionEvent: { create: vi.fn() },
    waiverClaim: { count: vi.fn() },
    trade: { count: vi.fn() },
    franchise: { findFirst: vi.fn() },
    financeLedger: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const mockAuditLeagueIlPlayers = vi.fn();
const mockPerformBulkIlStash = vi.fn();
const mockCleanupDroppedRosterRows = vi.fn();
vi.mock("../services/bulkOperationsService.js", () => ({
  auditLeagueIlPlayers: (...args: any[]) => mockAuditLeagueIlPlayers(...args),
  performBulkIlStash: (...args: any[]) => mockPerformBulkIlStash(...args),
  cleanupDroppedRosterRows: (...args: any[]) => mockCleanupDroppedRosterRows(...args),
}));

// Pass-through middleware (mirrors ghostIl.test.ts wiring)
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireCommissionerOrAdmin: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  evictMembershipCache: vi.fn(),
}));
vi.mock("../../../middleware/seasonGuard.js", () => ({
  requireSeasonStatus: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/validate.js", () => ({
  // Pass through but actually parse via the schema — ensures the routes
  // still reject malformed bodies even with mocked services.
  validateBody: (schema: any) => (req: any, res: any, next: () => void) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    req.body = parsed.data;
    next();
  },
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next),
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../lib/utils.js", () => ({
  norm: (s: any) => String(s ?? "").trim(),
  normCode: (s: any) => String(s ?? "").trim().toUpperCase(),
  mustOneOf: (v: any) => v,
}));
vi.mock("../../../lib/ruleLock.js", () => ({
  isRuleLocked: vi.fn(() => false),
  getLockedFields: vi.fn(() => []),
  lockMessage: vi.fn(() => ""),
}));
vi.mock("../../../lib/featureFlags.js", () => ({ enforceRosterRules: vi.fn(() => true) }));
vi.mock("../services/CommissionerService.js", () => {
  class CommissionerService {
    updateRules = vi.fn();
    lockRules = vi.fn();
    unlockRules = vi.fn();
  }
  return { CommissionerService };
});
vi.mock("../../transactions/lib/positionInherit.js", () => ({
  isEligibleForSlot: vi.fn(() => true),
}));
vi.mock("../../transactions/services/ilFeeService.js", () => ({
  reconcileIlFeesForPeriod: vi.fn(),
}));
vi.mock("../../../lib/ilSlotGuard.js", () => ({
  listGhostIlPlayersForTeam: vi.fn(),
}));
vi.mock("../../../lib/leagueRuleCache.js", () => ({
  invalidateLeagueRules: vi.fn(),
}));
vi.mock("../../../lib/schemas.js", () => ({ addMemberSchema: { parse: (x: any) => x } }));
vi.mock("multer", () => {
  const multer: any = () => ({ single: () => (_req: unknown, _res: unknown, next: () => void) => next() });
  multer.memoryStorage = () => ({});
  return { default: multer };
});

import express from "express";
import supertest from "supertest";
import { commissionerRouter } from "../routes.js";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 99, isAdmin: true };
  next();
});
app.use(commissionerRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error", message: err?.message });
});

import { prisma } from "../../../db/prisma.js";
const db = prisma as unknown as {
  team: { findMany: ReturnType<typeof vi.fn> };
  financeLedger: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * GET /commissioner/:leagueId/balances — todo #311.
 *
 * `FinanceLedger` is APPEND-ONLY. A correction stamps `voidedAt` on the
 * original row AND appends a negated `reversalOf` contra-entry, so the
 * contra-entry already cancels the charge. Filtering voided rows removes the
 * same money twice and under-reports SILENTLY.
 *
 * `netBalance` is unit-tested directly, but nothing else pins the behaviour at
 * the HTTP boundary. These tests exist so that re-introducing a `voidedAt`
 * filter *in the route or the query* — the one edit that looks most reasonable
 * to someone who has not read the model comment — fails here.
 */
describe("GET /commissioner/:leagueId/balances", () => {
  const LEAGUE = 20;
  const teams = [
    { id: 147, name: "Los Doyers" },
    { id: 148, name: "Demolition" },
  ];

  it("rejects a non-numeric leagueId with 400", async () => {
    const res = await supertest(app).get("/commissioner/not-a-number/balances");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid leagueId/i);
    expect(db.financeLedger.findMany).not.toHaveBeenCalled();
  });

  it("nets a corrected charge ONCE, counting the voided row (the money case)", async () => {
    // The Los Doyers Period 6 shape: $10 charged, found wrong, replaced by $25.
    //   sum ALL rows          -> 25  ✓
    //   sum voidedAt IS NULL  -> 15  ✗ (the contra-entry double-removes)
    db.team.findMany.mockResolvedValue(teams);
    db.financeLedger.findMany.mockResolvedValue([
      { teamId: 147, amount: 10, voidedAt: new Date("2026-08-31T00:00:00Z"), reversalOf: null },
      { teamId: 147, amount: -10, voidedAt: null, reversalOf: 1 },
      { teamId: 147, amount: 25, voidedAt: null, reversalOf: null },
    ]);

    const res = await supertest(app).get(`/commissioner/${LEAGUE}/balances`);

    expect(res.status).toBe(200);
    const doyers = res.body.balances.find((b: { teamId: number }) => b.teamId === 147);
    expect(doyers.balance).toBe(25);
  });

  it("does not filter voided rows out of the query", async () => {
    // NOT belt-and-braces — this is the test that actually catches it.
    // A mock returns whatever rows the test hands it, regardless of the WHERE
    // clause, so the "nets a corrected charge ONCE" test above passes happily
    // with `voidedAt: null` added to the query. Verified: that mutant kills
    // only THIS test. A mock cannot catch a wrong query — the same trap that
    // made findIlLogDriftAll's DROP handling dead code on 2026-08-31.
    db.team.findMany.mockResolvedValue(teams);
    db.financeLedger.findMany.mockResolvedValue([]);

    await supertest(app).get(`/commissioner/${LEAGUE}/balances`);

    const where = db.financeLedger.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ team: { leagueId: LEAGUE } });
    expect(JSON.stringify(where)).not.toContain("voidedAt");
  });

  it("includes a team with NO ledger rows at 0, rather than omitting it", async () => {
    // An omitted team reads as "still loading" on the commissioner's screen,
    // not as "owes nothing".
    db.team.findMany.mockResolvedValue(teams);
    db.financeLedger.findMany.mockResolvedValue([
      { teamId: 147, amount: 25, voidedAt: null, reversalOf: null },
    ]);

    const res = await supertest(app).get(`/commissioner/${LEAGUE}/balances`);

    expect(res.status).toBe(200);
    expect(res.body.balances).toEqual([
      { teamId: 147, teamName: "Los Doyers", balance: 25 },
      { teamId: 148, teamName: "Demolition", balance: 0 },
    ]);
  });

  it("keeps each team's rows separate and preserves a negative net", async () => {
    db.team.findMany.mockResolvedValue(teams);
    db.financeLedger.findMany.mockResolvedValue([
      { teamId: 147, amount: 10, voidedAt: null, reversalOf: null },
      { teamId: 148, amount: -40, voidedAt: null, reversalOf: null },
      { teamId: 147, amount: 15, voidedAt: null, reversalOf: null },
    ]);

    const res = await supertest(app).get(`/commissioner/${LEAGUE}/balances`);

    expect(res.body.balances).toEqual([
      { teamId: 147, teamName: "Los Doyers", balance: 25 },
      { teamId: 148, teamName: "Demolition", balance: -40 },
    ]);
  });
});
