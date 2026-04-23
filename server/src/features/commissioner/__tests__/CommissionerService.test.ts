import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    leagueRule: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
    period: {
      findFirst: vi.fn(),
    },
    season: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    league: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    leagueMembership: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    roster: {
      deleteMany: vi.fn(),
    },
    teamOwnership: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../../db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));

import { CommissionerService } from "../services/CommissionerService.js";

const service = new CommissionerService();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CommissionerService.updateRules", () => {
  // Check order (current implementation): IDOR check first (findMany), then
  // lock/season checks (findFirst + season.findFirst) — but only when at
  // least one update targets a non-exempt category. Updates that only touch
  // the `transactions` category bypass lock/season entirely.

  it("rejects updates when rules are locked (non-transactions category)", async () => {
    // Rule 10 exists in category "roster" (non-exempt) — so lock/season checks run.
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([{ id: 10, category: "roster" }]);
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce({ id: 1, isLocked: true });

    await expect(
      service.updateRules(1, [{ id: 10, value: "new" }])
    ).rejects.toThrow("Rules are locked for this season");
  });

  it("rejects updates when season has moved past SETUP (non-transactions category)", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([{ id: 10, category: "roster" }]);
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce(null);
    mockPrisma.season.findFirst.mockResolvedValueOnce({ id: 1, leagueId: 1, status: "DRAFT" });

    await expect(
      service.updateRules(1, [{ id: 10, value: "new" }])
    ).rejects.toThrow("Rules cannot be changed after season setup");
  });

  it("allows updates to `transactions` category mid-season (exempt from lock)", async () => {
    // Rule 10 is in `transactions` (exempt) — lock/season checks are SKIPPED
    // even though a lock exists and a draft is in progress.
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([{ id: 10, category: "transactions" }]);
    mockPrisma.leagueRule.update.mockResolvedValue({});

    const count = await service.updateRules(1, [{ id: 10, value: "true" }]);
    expect(count).toBe(1);
    // The lock/season checks should NEVER have been consulted.
    expect(mockPrisma.leagueRule.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.season.findFirst).not.toHaveBeenCalled();
  });

  it("rejects updates when rule IDs belong to a different league (IDOR prevention)", async () => {
    // findMany returns empty — rule 10 doesn't belong to league 1
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([]);

    await expect(
      service.updateRules(1, [{ id: 10, value: "hacked" }])
    ).rejects.toThrow("One or more rule IDs do not belong to this league");
  });

  it("rejects when some rule IDs belong to different league", async () => {
    // Only rule 10 belongs to league 1; rule 20 does not
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([{ id: 10, category: "roster" }]);

    await expect(
      service.updateRules(1, [
        { id: 10, value: "ok" },
        { id: 20, value: "not-my-league" },
      ])
    ).rejects.toThrow("One or more rule IDs do not belong to this league");
  });

  it("succeeds when all rule IDs belong to the league", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([
      { id: 10, category: "roster" },
      { id: 11, category: "scoring" },
    ]);
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce(null);
    mockPrisma.season.findFirst.mockResolvedValueOnce(null);
    mockPrisma.leagueRule.update.mockResolvedValue({});

    const count = await service.updateRules(1, [
      { id: 10, value: "val1" },
      { id: 11, value: "val2" },
    ]);

    expect(count).toBe(2);
    expect(mockPrisma.leagueRule.update).toHaveBeenCalledTimes(2);
  });
});

describe("CommissionerService.lockRules", () => {
  it("locks all rules for a league", async () => {
    mockPrisma.leagueRule.updateMany.mockResolvedValue({ count: 5 });

    const result = await service.lockRules(1);

    expect(result).toBe(true);
    expect(mockPrisma.leagueRule.updateMany).toHaveBeenCalledWith({
      where: { leagueId: 1 },
      data: { isLocked: true },
    });
  });
});

describe("CommissionerService.unlockRules", () => {
  it("unlocks all rules for a league", async () => {
    mockPrisma.leagueRule.updateMany.mockResolvedValue({ count: 5 });

    const result = await service.unlockRules(1);

    expect(result).toBe(true);
    expect(mockPrisma.leagueRule.updateMany).toHaveBeenCalledWith({
      where: { leagueId: 1 },
      data: { isLocked: false },
    });
  });
});
