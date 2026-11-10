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

import { CommissionerService, RulesLockedError } from "../services/CommissionerService.js";

const service = new CommissionerService();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CommissionerService.assertRulesEditable", () => {
  const service = new CommissionerService();

  it("returns without querying when every category is mutable any time", async () => {
    mockPrisma.leagueRule.findFirst.mockClear();
    mockPrisma.season.findFirst.mockClear();
    await expect(service.assertRulesEditable(1, ["transactions", "transactions"])).resolves.toBeUndefined();
    expect(mockPrisma.leagueRule.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.season.findFirst).not.toHaveBeenCalled();
  });

  it("throws RulesLockedError (locked rule) for a non-exempt category", async () => {
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce({ id: 1, isLocked: true });
    await expect(service.assertRulesEditable(1, ["transactions", "il"])).rejects.toBeInstanceOf(RulesLockedError);
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce({ id: 1, isLocked: true });
    await expect(service.assertRulesEditable(1, ["il"])).rejects.toThrow("Rules are locked for this season");
  });

  it("throws the season-setup error when a season is past SETUP", async () => {
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce(null);
    mockPrisma.season.findFirst.mockResolvedValueOnce({ id: 2, status: "IN_SEASON" });
    await expect(service.assertRulesEditable(1, ["roster"])).rejects.toThrow(
      "Rules cannot be changed after season setup.",
    );
  });

  it("resolves when nothing is locked and no season is past SETUP", async () => {
    mockPrisma.leagueRule.findFirst.mockResolvedValueOnce(null);
    mockPrisma.season.findFirst.mockResolvedValueOnce(null);
    await expect(service.assertRulesEditable(1, ["roster"])).resolves.toBeUndefined();
  });
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

  it("rejects an invalid trade_window value before writing", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([
      { id: 10, category: "transactions", key: "trade_window" },
    ]);
    await expect(
      service.updateRules(1, [{ id: 10, value: "sometimes" }])
    ).rejects.toThrow("When trades are allowed must be anytime or meeting_day");
    expect(mockPrisma.leagueRule.update).not.toHaveBeenCalled();
  });

  it("accepts meeting_day for trade_window", async () => {
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([
      { id: 10, category: "transactions", key: "trade_window" },
    ]);
    mockPrisma.leagueRule.update.mockResolvedValue({});
    expect(await service.updateRules(1, [{ id: 10, value: "meeting_day" }])).toBe(1);
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

describe("CommissionerService.getRules backfill", () => {
  const orderBy = [{ category: "asc" }, { key: "asc" }];

  it("inserts only the missing trade_window default for a league with existing rules", async () => {
    const { DEFAULT_RULES } = await import("../../../lib/sportConfig.js");
    // Existing league: every default EXCEPT trade_window.
    const existing = DEFAULT_RULES.filter((r) => r.key !== "trade_window").map((r, i) => ({
      id: i + 1, leagueId: 7, ...r,
    }));
    const reloaded = [
      ...existing,
      { id: 999, leagueId: 7, category: "transactions", key: "trade_window", value: "anytime", label: "When trades are allowed" },
    ];
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce(existing).mockResolvedValueOnce(reloaded);
    mockPrisma.leagueRule.createMany.mockResolvedValue({ count: 1 });

    const result = await service.getRules(7);

    expect(mockPrisma.leagueRule.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.leagueRule.createMany).toHaveBeenCalledWith({
      data: [
        { category: "transactions", key: "trade_window", value: "anytime", label: "When trades are allowed", leagueId: 7 },
      ],
      skipDuplicates: true,
    });
    expect(mockPrisma.leagueRule.findMany).toHaveBeenNthCalledWith(1, { where: { leagueId: 7 }, orderBy });
    expect(mockPrisma.leagueRule.findMany).toHaveBeenNthCalledWith(2, { where: { leagueId: 7 }, orderBy });
    expect(mockPrisma.leagueRule.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.leagueRule.update).not.toHaveBeenCalled();
    expect(result).toBe(reloaded);
  });

  it("does not create anything when the league already has every default key", async () => {
    const { DEFAULT_RULES } = await import("../../../lib/sportConfig.js");
    const all = DEFAULT_RULES.map((r, i) => ({ id: i + 1, leagueId: 7, ...r }));
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce(all);

    const result = await service.getRules(7);

    expect(mockPrisma.leagueRule.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.leagueRule.findMany).toHaveBeenCalledTimes(1);
    expect(result).toBe(all);
  });

  it("seeds every default (no skipDuplicates path change) when the league has no rules", async () => {
    const { DEFAULT_RULES } = await import("../../../lib/sportConfig.js");
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1 }]);
    mockPrisma.leagueRule.createMany.mockResolvedValue({ count: DEFAULT_RULES.length });

    await service.getRules(7);

    expect(mockPrisma.leagueRule.createMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.leagueRule.createMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(DEFAULT_RULES.length);
    expect(arg.data.some((r: any) => r.key === "trade_window" && r.value === "anytime")).toBe(true);
  });

  it("backfills ONLY trade_window when the league also lacks a non-backfill default (payout)", async () => {
    const { DEFAULT_RULES } = await import("../../../lib/sportConfig.js");
    const existing = DEFAULT_RULES.filter((r) => r.key !== "trade_window" && r.key !== "payout_3rd").map((r, i) => ({
      id: i + 1, leagueId: 7, ...r,
    }));
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce(existing).mockResolvedValueOnce(existing);
    mockPrisma.leagueRule.createMany.mockResolvedValue({ count: 1 });

    await service.getRules(7);

    expect(mockPrisma.leagueRule.createMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.leagueRule.createMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(1);
    expect(arg.data[0]).toMatchObject({ category: "transactions", key: "trade_window", leagueId: 7 });
    expect(arg.skipDuplicates).toBe(true);
  });

  it("creates nothing when the league lacks only a non-backfill key", async () => {
    const { DEFAULT_RULES } = await import("../../../lib/sportConfig.js");
    const existing = DEFAULT_RULES.filter((r) => r.key !== "payout_3rd").map((r, i) => ({
      id: i + 1, leagueId: 7, ...r,
    }));
    mockPrisma.leagueRule.findMany.mockResolvedValueOnce(existing);

    const result = await service.getRules(7);

    expect(mockPrisma.leagueRule.createMany).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });
});
