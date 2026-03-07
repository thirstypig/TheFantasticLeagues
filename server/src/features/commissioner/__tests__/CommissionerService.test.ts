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
  it("rejects updates when rules are locked", async () => {
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce({ id: 1, isLocked: true });

    await expect(
      service.updateRules(1, [{ id: 10, value: "new" }])
    ).rejects.toThrow("Rules are locked for this season");
  });

  it("rejects updates when season has started (active periods exist)", async () => {
    // No locked rules
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce(null);
    // Active period exists
    mockPrisma.period.findFirst.mockResolvedValueOnce({ id: 1, status: "active" });

    await expect(
      service.updateRules(1, [{ id: 10, value: "new" }])
    ).rejects.toThrow("Rules cannot be changed once the season has started");
  });

  it("rejects updates when rule IDs belong to a different league (IDOR prevention)", async () => {
    // No locked rules
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce(null);
    // No active periods
    mockPrisma.period.findFirst.mockResolvedValueOnce(null);
    // Rule 10 belongs to league 2, not league 1 — findMany returns empty
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([]);

    await expect(
      service.updateRules(1, [{ id: 10, value: "hacked" }])
    ).rejects.toThrow("One or more rule IDs do not belong to this league");
  });

  it("rejects when some rule IDs belong to different league", async () => {
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce(null);
    mockPrisma.period.findFirst.mockResolvedValueOnce(null);
    // Only rule 10 belongs to league 1; rule 20 does not
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([{ id: 10 }]);

    await expect(
      service.updateRules(1, [
        { id: 10, value: "ok" },
        { id: 20, value: "not-my-league" },
      ])
    ).rejects.toThrow("One or more rule IDs do not belong to this league");
  });

  it("succeeds when all rule IDs belong to the league", async () => {
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce(null);
    mockPrisma.period.findFirst.mockResolvedValueOnce(null);
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([{ id: 10 }, { id: 11 }]);
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
