import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn().mockResolvedValue([]) },
    player: { findFirst: vi.fn(), create: vi.fn() },
    roster: { create: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    league: { findUnique: vi.fn() },
    leagueRule: { findMany: vi.fn().mockResolvedValue([]) },
    auctionSession: { upsert: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
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
vi.mock("../../../lib/rosterGuard.js", () => ({
  assertPlayerAvailable: vi.fn(),
}));

import { createDefaultState, calculateMaxBid } from "../routes.js";
import type { AuctionState } from "../routes.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("auction - auto-finish timer logic", () => {
  it("createDefaultState includes budgetCap and rosterSize", () => {
    const state = createDefaultState(1);
    expect(state.config.budgetCap).toBe(400);
    expect(state.config.rosterSize).toBe(23);
    expect(state.config.bidTimer).toBe(15);
    expect(state.config.nominationTimer).toBe(30);
  });

  it("calculateMaxBid clamps negative results to 0", () => {
    expect(calculateMaxBid(5, 10)).toBe(0);
    expect(calculateMaxBid(0, 5)).toBe(0);
    expect(calculateMaxBid(1, 3)).toBe(0);
  });

  it("state config has correct default values", () => {
    const state = createDefaultState(42);
    expect(state.leagueId).toBe(42);
    expect(state.status).toBe("not_started");
    expect(state.nomination).toBeNull();
    expect(state.teams).toEqual([]);
    expect(state.queue).toEqual([]);
    expect(state.queueIndex).toBe(0);
    expect(state.log).toEqual([]);
  });
});
