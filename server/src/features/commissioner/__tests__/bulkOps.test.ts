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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /commissioner/:leagueId/il-audit", () => {
  it("rejects non-numeric leagueId with 400", async () => {
    const res = await supertest(app).get("/commissioner/not-a-number/il-audit");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid leagueId/i);
  });

  it("delegates to auditLeagueIlPlayers and returns the payload", async () => {
    const payload = {
      rows: [
        {
          teamId: 10, teamName: "Aces", teamCode: "ACE",
          playerId: 100, playerName: "Mike Trout", mlbId: 545361,
          mlbStatus: "Injured 10-Day", assignedPosition: "OF",
        },
      ],
      totalRows: 1,
      totalTeams: 1,
      fetchedAt: "2026-04-30T00:00:00.000Z",
    };
    mockAuditLeagueIlPlayers.mockResolvedValue(payload);

    const res = await supertest(app).get("/commissioner/42/il-audit");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(mockAuditLeagueIlPlayers).toHaveBeenCalledWith(42);
  });

  it("returns the empty shape when no players are surfaced", async () => {
    mockAuditLeagueIlPlayers.mockResolvedValue({
      rows: [], totalRows: 0, totalTeams: 0,
      fetchedAt: "2026-04-30T00:00:00.000Z",
    });
    const res = await supertest(app).get("/commissioner/1/il-audit");
    expect(res.status).toBe(200);
    expect(res.body.totalRows).toBe(0);
  });
});

describe("POST /commissioner/:leagueId/bulk-il-stash", () => {
  it("rejects non-numeric leagueId with 400", async () => {
    const res = await supertest(app)
      .post("/commissioner/oops/bulk-il-stash")
      .send({ entries: [{ teamId: 1, playerId: 2 }] });
    expect(res.status).toBe(400);
  });

  it("rejects an empty entries array (Zod schema requires min 1)", async () => {
    const res = await supertest(app)
      .post("/commissioner/1/bulk-il-stash")
      .send({ entries: [] });
    expect(res.status).toBe(400);
  });

  it("rejects entries with negative ids", async () => {
    const res = await supertest(app)
      .post("/commissioner/1/bulk-il-stash")
      .send({ entries: [{ teamId: -1, playerId: 5 }] });
    expect(res.status).toBe(400);
  });

  it("delegates to performBulkIlStash and returns the result", async () => {
    const fakeResp = {
      succeeded: [
        { teamId: 10, playerId: 100, outcome: "stashed" as const },
        { teamId: 10, playerId: 101, outcome: "noop" as const },
      ],
      failed: [
        { teamId: 20, playerId: 200, reason: "Not on active roster.", code: "IL_UNKNOWN_PLAYER" },
      ],
    };
    mockPerformBulkIlStash.mockResolvedValue(fakeResp);

    const res = await supertest(app)
      .post("/commissioner/42/bulk-il-stash")
      .send({ entries: [
        { teamId: 10, playerId: 100 },
        { teamId: 10, playerId: 101 },
        { teamId: 20, playerId: 200 },
      ]});
    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakeResp);
    expect(mockPerformBulkIlStash).toHaveBeenCalledWith(
      42,
      expect.arrayContaining([{ teamId: 10, playerId: 100 }]),
      99, // req.user.id
    );
  });

  it("treats every entry beyond the 200-cap as a validation rejection", async () => {
    const overflow = Array.from({ length: 201 }, (_, i) => ({ teamId: 1, playerId: i + 1 }));
    const res = await supertest(app)
      .post("/commissioner/1/bulk-il-stash")
      .send({ entries: overflow });
    expect(res.status).toBe(400);
  });
});

describe("POST /commissioner/:leagueId/cleanup-dropped", () => {
  it("rejects non-numeric leagueId with 400", async () => {
    const res = await supertest(app)
      .post("/commissioner/x/cleanup-dropped")
      .send({ olderThanDays: 30 });
    expect(res.status).toBe(400);
  });

  it("rejects olderThanDays below the lower bound", async () => {
    const res = await supertest(app)
      .post("/commissioner/1/cleanup-dropped")
      .send({ olderThanDays: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects olderThanDays above the upper bound", async () => {
    const res = await supertest(app)
      .post("/commissioner/1/cleanup-dropped")
      .send({ olderThanDays: 99999 });
    expect(res.status).toBe(400);
  });

  it("delegates to cleanupDroppedRosterRows and returns the result", async () => {
    const result = { deletedCount: 17, cutoff: "2026-03-31T00:00:00.000Z" };
    mockCleanupDroppedRosterRows.mockResolvedValue(result);

    const res = await supertest(app)
      .post("/commissioner/42/cleanup-dropped")
      .send({ olderThanDays: 30 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    expect(mockCleanupDroppedRosterRows).toHaveBeenCalledWith(42, 30, 99);
  });
});
