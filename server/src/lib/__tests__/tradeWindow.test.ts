import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockGetLeagueRules } = vi.hoisted(() => ({
  mockPrisma: { period: { findFirst: vi.fn() } },
  mockGetLeagueRules: vi.fn(),
}));

vi.mock("../../db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../leagueRuleCache.js", () => ({ getLeagueRules: mockGetLeagueRules }));

import { getTradeWindow } from "../tradeWindow.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTradeWindow", () => {
  it("is open when the rule is missing (existing leagues), even with an active period", async () => {
    mockGetLeagueRules.mockResolvedValue({ transactions: { owner_self_serve: "false" } });
    mockPrisma.period.findFirst.mockResolvedValue({ name: "Period 8" });
    expect(await getTradeWindow(20)).toEqual({ open: true });
    expect(mockGetLeagueRules).toHaveBeenCalledWith(mockPrisma, 20);
  });

  it("is open when the rule is missing entirely (no transactions category)", async () => {
    mockGetLeagueRules.mockResolvedValue({});
    mockPrisma.period.findFirst.mockResolvedValue({ name: "Period 8" });
    expect(await getTradeWindow(20)).toEqual({ open: true });
  });

  it("is open for 'anytime' with an active period", async () => {
    mockGetLeagueRules.mockResolvedValue({ transactions: { trade_window: "anytime" } });
    mockPrisma.period.findFirst.mockResolvedValue({ name: "Period 8" });
    expect(await getTradeWindow(20)).toEqual({ open: true });
  });

  it("is open for 'meeting_day' when no period is active (preseason / between periods)", async () => {
    mockGetLeagueRules.mockResolvedValue({ transactions: { trade_window: "meeting_day" } });
    mockPrisma.period.findFirst.mockResolvedValue(null);
    expect(await getTradeWindow(20)).toEqual({ open: true });
    expect(mockPrisma.period.findFirst).toHaveBeenCalledWith({
      where: { leagueId: 20, status: "active" },
      orderBy: { startDate: "desc" },
      select: { name: true },
    });
  });

  it("is closed for 'meeting_day' while a period is active, naming the period", async () => {
    mockGetLeagueRules.mockResolvedValue({ transactions: { trade_window: "meeting_day" } });
    mockPrisma.period.findFirst.mockResolvedValue({ name: "Period 8" });
    expect(await getTradeWindow(20)).toEqual({
      open: false,
      message: "Trades open at the next meeting, after Period 8 closes.",
    });
    expect(mockPrisma.period.findFirst).toHaveBeenCalledWith({
      where: { leagueId: 20, status: "active" },
      orderBy: { startDate: "desc" },
      select: { name: true },
    });
  });

  it("does not query periods when the rule is not meeting_day", async () => {
    mockGetLeagueRules.mockResolvedValue({ transactions: { trade_window: "anytime" } });
    await getTradeWindow(20);
    expect(mockPrisma.period.findFirst).not.toHaveBeenCalled();
  });
});
