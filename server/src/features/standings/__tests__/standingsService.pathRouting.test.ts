/**
 * Path-routing tests for `computeTeamStatsFromDb` (todo #260).
 *
 * Verifies that the function selects the correct attribution path:
 *  - PSP path (computeWithPeriodStats) when PlayerStatsPeriod rows exist AND
 *    no mid-period pickups occurred.
 *  - Daily-stats path (computeWithDailyStats) when PSP data exists BUT a player
 *    was acquired strictly between period.startDate and period.endDate (mid-period
 *    pickup would over-credit the acquiring team under PSP semantics per ADR-013).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPeriodFindUnique = vi.fn();
const mockTeamFindMany = vi.fn();
const mockRosterFindMany = vi.fn();
const mockDailyFindMany = vi.fn();
const mockPeriodStatsFindMany = vi.fn();
const mockPeriodStatsCount = vi.fn();
const mockTransactionEventFindMany = vi.fn();

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findUnique: (...a: unknown[]) => mockPeriodFindUnique(...a) },
    team: { findMany: (...a: unknown[]) => mockTeamFindMany(...a) },
    roster: { findMany: (...a: unknown[]) => mockRosterFindMany(...a) },
    playerStatsDaily: {
      findMany: (...a: unknown[]) => mockDailyFindMany(...a),
      groupBy: vi.fn(),
    },
    playerStatsPeriod: {
      findMany: (...a: unknown[]) => mockPeriodStatsFindMany(...a),
      count: (...a: unknown[]) => mockPeriodStatsCount(...a),
    },
    transactionEvent: {
      findMany: (...a: unknown[]) => mockTransactionEventFindMany(...a),
    },
  },
}));

import { computeTeamStatsFromDb } from "../services/standingsService.js";

const PERIOD_START = new Date("2026-04-19T00:00:00.000Z");
const PERIOD_END = new Date("2026-05-16T12:00:00.000Z");
const ZERO_STATS = { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 };

const BASE_ROSTER_ROW = {
  teamId: 1001,
  playerId: 1,
  releasedAt: null,
  assignedPosition: "OF",
  player: { id: 1, mlbId: 1000, posPrimary: "OF" },
};

beforeEach(() => {
  mockPeriodFindUnique.mockReset();
  mockTeamFindMany.mockReset();
  mockRosterFindMany.mockReset();
  mockDailyFindMany.mockReset();
  mockPeriodStatsFindMany.mockReset();
  mockPeriodStatsCount.mockReset();
  mockTransactionEventFindMany.mockReset();

  mockTransactionEventFindMany.mockResolvedValue([]);
  mockDailyFindMany.mockResolvedValue([]);
  mockPeriodStatsFindMany.mockResolvedValue([]);

  mockPeriodFindUnique.mockResolvedValue({ id: 36, startDate: PERIOD_START, endDate: PERIOD_END });
  mockTeamFindMany.mockResolvedValue([
    { id: 1001, name: "Alpha", code: "AAA" },
    { id: 1002, name: "Bravo", code: "BBB" },
  ]);
});

describe("computeTeamStatsFromDb — path routing (todo #260)", () => {
  it("takes PSP path when PSP data exists and no mid-period pickups", async () => {
    // Player held since before period start — no mid-period pickup
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, acquiredAt: new Date("2026-03-22") },
    ]);
    mockPeriodStatsCount.mockResolvedValueOnce(5);
    mockPeriodStatsFindMany.mockResolvedValueOnce([
      { playerId: 1, ...ZERO_STATS, R: 10, HR: 2 },
    ]);

    await computeTeamStatsFromDb(20, 36);

    expect(mockPeriodStatsFindMany).toHaveBeenCalledTimes(1);
    expect(mockDailyFindMany).not.toHaveBeenCalled();
  });

  it("takes daily-stats path when a player was acquired strictly mid-period, even with PSP data", async () => {
    // acquiredAt is strictly between PERIOD_START and PERIOD_END — mid-period pickup
    const midPeriodAcquiredAt = new Date("2026-05-01T00:00:00.000Z");
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, acquiredAt: midPeriodAcquiredAt },
    ]);
    // PSP data exists (count > 0), but the mid-period pickup should override the path choice
    mockPeriodStatsCount.mockResolvedValueOnce(5);

    await computeTeamStatsFromDb(20, 36);

    // Must NOT have called PSP — would over-credit the acquiring team (ADR-013)
    expect(mockPeriodStatsFindMany).not.toHaveBeenCalled();
    expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
  });

  it("takes PSP path when acquiredAt === period.startDate (boundary: not mid-period)", async () => {
    // Acquired exactly on startDate — boundary is exclusive; this is NOT a mid-period pickup
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, acquiredAt: PERIOD_START },
    ]);
    mockPeriodStatsCount.mockResolvedValueOnce(3);
    mockPeriodStatsFindMany.mockResolvedValueOnce([
      { playerId: 1, ...ZERO_STATS, R: 5 },
    ]);

    await computeTeamStatsFromDb(20, 36);

    expect(mockPeriodStatsFindMany).toHaveBeenCalledTimes(1);
    expect(mockDailyFindMany).not.toHaveBeenCalled();
  });

  it("takes PSP path when acquiredAt === period.endDate (boundary: not mid-period)", async () => {
    // Acquired exactly on endDate — boundary is exclusive; this is NOT a mid-period pickup
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, acquiredAt: PERIOD_END },
    ]);
    mockPeriodStatsCount.mockResolvedValueOnce(2);
    mockPeriodStatsFindMany.mockResolvedValueOnce([
      { playerId: 1, ...ZERO_STATS, R: 3 },
    ]);

    await computeTeamStatsFromDb(20, 36);

    expect(mockPeriodStatsFindMany).toHaveBeenCalledTimes(1);
    expect(mockDailyFindMany).not.toHaveBeenCalled();
  });

  it("takes daily-stats path when PSP count is 0 regardless of roster dates", async () => {
    // No PSP data yet (new period) — always falls back to daily
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, acquiredAt: new Date("2026-03-22") },
    ]);
    mockPeriodStatsCount.mockResolvedValueOnce(0);

    await computeTeamStatsFromDb(20, 36);

    expect(mockPeriodStatsFindMany).not.toHaveBeenCalled();
    expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
  });

  it("forces daily-stats when ANY roster row has a mid-period pickup (multi-player case)", async () => {
    // Player 1: clean (pre-period). Player 2: mid-period pickup. Should force daily for all.
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, playerId: 1, acquiredAt: new Date("2026-03-22") },
      { ...BASE_ROSTER_ROW, playerId: 2, acquiredAt: new Date("2026-05-02T00:00:00.000Z") },
    ]);
    mockPeriodStatsCount.mockResolvedValueOnce(10);

    await computeTeamStatsFromDb(20, 36);

    expect(mockPeriodStatsFindMany).not.toHaveBeenCalled();
    expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
  });
});
