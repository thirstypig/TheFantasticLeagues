import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findUnique: vi.fn() },
    roster: { findMany: vi.fn() },
    playerValue: { findMany: vi.fn().mockResolvedValue([]) },
    leagueRule: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("multer", () => {
  const multerFn: any = () => ({
    single: () => (_req: any, _res: any, next: () => void) => next(),
  });
  return { default: multerFn };
});
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireCommissionerOrAdmin: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../services/playerValueService.js", () => ({
  PlayerValueService: class {
    getValueMap = vi.fn().mockResolvedValue(new Map());
    getValues = vi.fn().mockResolvedValue([]);
    clearValues = vi.fn().mockResolvedValue(0);
    importFromFile = vi.fn().mockResolvedValue({ matched: 10, unmatched: 2, total: 12, unmatchedNames: [] });
  },
}));
vi.mock("../services/keeperPrepService.js", () => {
  const populateRostersFromPriorSeason = vi.fn().mockResolvedValue({ teamsPopulated: 8, playersAdded: 184 });
  const getKeeperStatus = vi.fn().mockResolvedValue([{ teamId: 1, teamName: "Aces", keeperCount: 5, maxKeepers: 8 }]);
  const isKeepersLocked = vi.fn().mockResolvedValue(false);
  const getKeeperLimit = vi.fn().mockResolvedValue(8);
  const saveKeepersForTeam = vi.fn().mockResolvedValue({ kept: 5, released: 18 });
  const lockKeepers = vi.fn().mockResolvedValue({ releasedCount: 19 });
  const unlockKeepers = vi.fn().mockResolvedValue(undefined);
  return {
    KeeperPrepService: class {
      populateRostersFromPriorSeason = populateRostersFromPriorSeason;
      getKeeperStatus = getKeeperStatus;
      isKeepersLocked = isKeepersLocked;
      getKeeperLimit = getKeeperLimit;
      saveKeepersForTeam = saveKeepersForTeam;
      lockKeepers = lockKeepers;
      unlockKeepers = unlockKeepers;
    },
    __mockFns: { populateRostersFromPriorSeason, getKeeperStatus, isKeepersLocked, getKeeperLimit, saveKeepersForTeam, lockKeepers, unlockKeepers },
  };
});

import { prisma } from "../../../db/prisma.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vi.mock injects __mockFns at runtime
const { __mockFns } = await import("../services/keeperPrepService.js") as any;

const mockPrisma = prisma as any;
const mockService = __mockFns as any;

// ── Express test app ─────────────────────────────────────────────

import express from "express";
import { keeperPrepRouter } from "../routes.js";
import supertest from "supertest";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use(keeperPrepRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

beforeEach(() => {
  vi.clearAllMocks();
  // Re-set default return values
  mockService.isKeepersLocked.mockResolvedValue(false);
  mockService.getKeeperLimit.mockResolvedValue(8);
});

// ── POST /commissioner/:leagueId/keeper-prep/populate ────────────

describe("POST /commissioner/:leagueId/keeper-prep/populate", () => {
  it("populates rosters from prior season", async () => {
    const res = await supertest(app).post("/commissioner/1/keeper-prep/populate");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.teamsPopulated).toBe(8);
    expect(mockService.populateRostersFromPriorSeason).toHaveBeenCalledWith(1);
  });
});

// ── GET /commissioner/:leagueId/keeper-prep/status ───────────────

describe("GET /commissioner/:leagueId/keeper-prep/status", () => {
  it("returns keeper status for all teams", async () => {
    const res = await supertest(app).get("/commissioner/1/keeper-prep/status");
    expect(res.status).toBe(200);
    expect(res.body.statuses).toHaveLength(1);
    expect(res.body.isLocked).toBe(false);
  });
});

// ── GET /commissioner/:leagueId/keeper-prep/team/:teamId/roster ──

describe("GET /commissioner/:leagueId/keeper-prep/team/:teamId/roster", () => {
  it("returns team roster with keeper info", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ id: 10, leagueId: 1, name: "Aces" });
    mockPrisma.roster.findMany.mockResolvedValue([
      { id: 1, isKeeper: true, price: 25, player: { id: 100, name: "Mike Trout", posPrimary: "CF" } },
    ]);

    const res = await supertest(app).get("/commissioner/1/keeper-prep/team/10/roster");
    expect(res.status).toBe(200);
    expect(res.body.roster).toHaveLength(1);
    expect(res.body.keeperLimit).toBe(8);
    expect(res.body.isLocked).toBe(false);
  });

  it("returns 404 when team not in league", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ id: 10, leagueId: 2 }); // wrong league

    const res = await supertest(app).get("/commissioner/1/keeper-prep/team/10/roster");
    expect(res.status).toBe(404);
  });

  it("returns 404 when team not found", async () => {
    mockPrisma.team.findUnique.mockResolvedValue(null);

    const res = await supertest(app).get("/commissioner/1/keeper-prep/team/999/roster");
    expect(res.status).toBe(404);
  });
});

// ── POST /commissioner/:leagueId/keeper-prep/save ────────────────

describe("POST /commissioner/:leagueId/keeper-prep/save", () => {
  it("saves keeper selections for a team", async () => {
    const res = await supertest(app)
      .post("/commissioner/1/keeper-prep/save")
      .send({ teamId: 10, keeperIds: [1, 2, 3] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.kept).toBe(5);
    expect(mockService.saveKeepersForTeam).toHaveBeenCalledWith(1, 10, [1, 2, 3]);
  });
});

// ── POST /commissioner/:leagueId/keeper-prep/lock ────────────────

describe("POST /commissioner/:leagueId/keeper-prep/lock", () => {
  it("locks keeper selections", async () => {
    const res = await supertest(app).post("/commissioner/1/keeper-prep/lock");
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(mockService.lockKeepers).toHaveBeenCalledWith(1);
  });
});

// ── POST /commissioner/:leagueId/keeper-prep/unlock ──────────────

describe("POST /commissioner/:leagueId/keeper-prep/unlock", () => {
  it("unlocks keeper selections", async () => {
    const res = await supertest(app).post("/commissioner/1/keeper-prep/unlock");
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(mockService.unlockKeepers).toHaveBeenCalledWith(1);
  });
});
