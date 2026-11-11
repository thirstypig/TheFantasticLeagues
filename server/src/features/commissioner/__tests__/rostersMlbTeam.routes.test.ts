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
vi.mock("../../../lib/positionInherit.js", () => ({
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
import { prisma } from "../../../db/prisma.js";
import { commissionerRouter } from "../routes.js";

const m = prisma as any;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use("/api", commissionerRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error", message: err?.message });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/commissioner/:leagueId/rosters", () => {
  it("selects player.mlbTeam and scopes to the league's unreleased rows", async () => {
    m.roster.findMany.mockResolvedValue([]);
    const res = await supertest(app).get("/api/commissioner/20/rosters");
    expect(res.status).toBe(200);
    const args = m.roster.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ team: { leagueId: 20 }, releasedAt: null });
    expect(args.include.player.select.mlbTeam).toBe(true);
  });
});
