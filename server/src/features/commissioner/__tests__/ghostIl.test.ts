import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn() },
    // Other models referenced by the broader router file but unused by the
    // ghost-IL endpoint — stubbed so module load doesn't blow up.
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

const mockListGhosts = vi.fn();
vi.mock("../../../lib/ilSlotGuard.js", () => ({
  listGhostIlPlayersForTeam: (...args: any[]) => mockListGhosts(...args),
}));

// Pass-through middleware
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
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
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

const mockPrisma = prisma as any;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use(commissionerRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error", message: err?.message });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /commissioner/:leagueId/ghost-il", () => {
  it("rejects non-numeric leagueId with 400", async () => {
    const res = await supertest(app).get("/commissioner/not-a-number/ghost-il");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid leagueId/i);
  });

  it("returns an empty payload when no team has ghosts", async () => {
    mockPrisma.team.findMany.mockResolvedValue([
      { id: 10, name: "Aces", code: "ACES" },
      { id: 20, name: "Titans", code: "TITN" },
    ]);
    mockListGhosts.mockResolvedValue([]);

    const res = await supertest(app).get("/commissioner/1/ghost-il");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ teams: [], totalTeamsWithGhosts: 0, totalGhosts: 0 });
    expect(mockListGhosts).toHaveBeenCalledTimes(2); // once per team
  });

  it("aggregates ghosts across teams and filters zero-ghost teams out", async () => {
    mockPrisma.team.findMany.mockResolvedValue([
      { id: 10, name: "Aces", code: "ACES" },
      { id: 20, name: "Titans", code: "TITN" },
      { id: 30, name: "Rays", code: "RAYS" },
    ]);
    mockListGhosts.mockImplementation(async (_tx: unknown, teamId: number) => {
      if (teamId === 10) return [
        { rosterId: 1, playerId: 100, playerName: "Mike Trout", currentMlbStatus: "Active" },
        { rosterId: 2, playerId: 101, playerName: "Mookie Betts", currentMlbStatus: "Active" },
      ];
      if (teamId === 30) return [
        { rosterId: 3, playerId: 200, playerName: "Aaron Judge", currentMlbStatus: "Active" },
      ];
      return []; // team 20 has no ghosts
    });

    const res = await supertest(app).get("/commissioner/1/ghost-il");
    expect(res.status).toBe(200);
    expect(res.body.totalTeamsWithGhosts).toBe(2);
    expect(res.body.totalGhosts).toBe(3);
    expect(res.body.teams).toHaveLength(2);

    const aces = res.body.teams.find((t: any) => t.teamId === 10);
    expect(aces).toMatchObject({ teamName: "Aces", teamCode: "ACES" });
    expect(aces.ghosts).toHaveLength(2);
    expect(aces.ghosts[0].playerName).toBe("Mike Trout");

    // Titans (empty ghosts) must be filtered out
    expect(res.body.teams.find((t: any) => t.teamId === 20)).toBeUndefined();
  });

  it("scopes team lookup to the requested leagueId", async () => {
    mockPrisma.team.findMany.mockResolvedValue([]);
    await supertest(app).get("/commissioner/42/ghost-il");
    expect(mockPrisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { leagueId: 42 },
    }));
  });
});
