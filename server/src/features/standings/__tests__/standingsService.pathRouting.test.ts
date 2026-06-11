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

  it("takes PSP path when acquiredAt is later the same day as period start (todo #285)", async () => {
    // Import scripts and admin tools stamp acquiredAt with a time-of-day; an
    // acquisition at noon on the period's start DATE is boundary-aligned, not a
    // mid-period pickup. Regression: Andrew Vaughn's 2026-03-25T12:00 row flipped
    // all of P1 onto the gappy daily table (audit report Section 5.4).
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, acquiredAt: new Date("2026-04-19T12:00:00.000Z") },
    ]);
    mockPeriodStatsCount.mockResolvedValueOnce(4);
    mockPeriodStatsFindMany.mockResolvedValueOnce([
      { playerId: 1, ...ZERO_STATS, R: 4 },
    ]);

    await computeTeamStatsFromDb(20, 36);

    expect(mockPeriodStatsFindMany).toHaveBeenCalledTimes(1);
    expect(mockDailyFindMany).not.toHaveBeenCalled();
  });

  it("takes PSP path when acquiredAt is earlier the same day as period end (todo #285)", async () => {
    // Same date-granularity rule on the end boundary: the existing convention
    // already treats acquiredAt === endDate as boundary-aligned (exclusive
    // comparison); time-of-day on that date must not change the answer.
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, acquiredAt: new Date("2026-05-16T08:00:00.000Z") },
    ]);
    mockPeriodStatsCount.mockResolvedValueOnce(4);
    mockPeriodStatsFindMany.mockResolvedValueOnce([
      { playerId: 1, ...ZERO_STATS, R: 4 },
    ]);

    await computeTeamStatsFromDb(20, 36);

    expect(mockPeriodStatsFindMany).toHaveBeenCalledTimes(1);
    expect(mockDailyFindMany).not.toHaveBeenCalled();
  });

  it("still takes daily path when acquired the day AFTER period start (todo #285 guard)", async () => {
    // Date normalization must not swallow real mid-period pickups: one calendar
    // day inside the period is still mid-period.
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, acquiredAt: new Date("2026-04-20T00:30:00.000Z") },
    ]);
    mockPeriodStatsCount.mockResolvedValueOnce(4);

    await computeTeamStatsFromDb(20, 36);

    expect(mockPeriodStatsFindMany).not.toHaveBeenCalled();
    expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
  });

  it("hybrid (todo #286): PSP for boundary-aligned players, daily windows only for the mid-period player", async () => {
    // Player 1: clean (pre-period, has a PSP row). Player 2: acquired mid-period.
    // Old behavior forced the WHOLE period onto the daily table, degrading player 1
    // (doubleheader collapse, gaps). Hybrid keeps player 1 on PSP and windows only
    // player 2 through daily stats — pre-acquisition days must not count (ADR-013).
    const acquiredAt = new Date("2026-05-02T00:00:00.000Z");
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, playerId: 1, acquiredAt: new Date("2026-03-22") },
      { ...BASE_ROSTER_ROW, playerId: 2, player: { id: 2, mlbId: 2000, posPrimary: "OF" }, acquiredAt },
    ]);
    mockPeriodStatsCount.mockResolvedValueOnce(10);
    // PSP rows exist for both players — player 2's must be IGNORED (mid-period)
    mockPeriodStatsFindMany.mockResolvedValueOnce([
      { playerId: 1, ...ZERO_STATS, R: 10 },
      { playerId: 2, ...ZERO_STATS, R: 99 },
    ]);
    // Daily rows for player 2: one before acquisition (must not count), one after
    mockDailyFindMany.mockResolvedValueOnce([
      { playerId: 2, gameDate: new Date("2026-04-25T00:00:00.000Z"), ...ZERO_STATS, R: 7 },
      { playerId: 2, gameDate: new Date("2026-05-05T00:00:00.000Z"), ...ZERO_STATS, R: 3 },
    ]);

    const rows = await computeTeamStatsFromDb(20, 36);

    expect(mockPeriodStatsFindMany).toHaveBeenCalledTimes(1);
    expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
    const team = (rows as any[]).find(r => r.team.id === 1001);
    expect(team.R).toBe(13); // 10 (PSP, player 1) + 3 (post-acquisition daily, player 2)
  });

  it("hybrid (todo #286): same-team same-day drop-and-re-add counts the boundary day exactly once", async () => {
    // Regression: DMK released and re-acquired Aaron Ashby on 2026-05-22. The two
    // windows [start, 5/22] and [5/22, end] both matched 5/22 under inclusive
    // clamping, double-counting that day's stats. releasedAt at UTC midnight is
    // EXCLUSIVE (half-open convention): the release day belongs to the new window only.
    const boundary = new Date("2026-05-02T00:00:00.000Z");
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, playerId: 2, player: { id: 2, mlbId: 2000, posPrimary: "P" }, assignedPosition: "P", acquiredAt: new Date("2026-03-22"), releasedAt: boundary },
      { ...BASE_ROSTER_ROW, playerId: 2, player: { id: 2, mlbId: 2000, posPrimary: "P" }, assignedPosition: "P", acquiredAt: boundary, releasedAt: null },
    ]);
    mockPeriodStatsCount.mockResolvedValueOnce(10);
    mockDailyFindMany.mockResolvedValueOnce([
      { playerId: 2, gameDate: boundary, ...ZERO_STATS, K: 2 },
      { playerId: 2, gameDate: new Date("2026-05-05T00:00:00.000Z"), ...ZERO_STATS, K: 3 },
    ]);

    const rows = await computeTeamStatsFromDb(20, 36);

    const team = (rows as any[]).find(r => r.team.id === 1001);
    expect(team.K).toBe(5); // 2 + 3, never 7
  });

  it("hybrid (todo #286): mid-period release to free agency credits the dropper only before the release day", async () => {
    // A mid-period DROP (no re-add anywhere) previously left the period on the pure
    // PSP path, where end-of-period attribution gives the dropper NOTHING. FG credits
    // stats accrued while rostered — the dropper keeps days strictly before a
    // midnight releasedAt, and the release day itself is unowned.
    const releasedAt = new Date("2026-05-02T00:00:00.000Z");
    mockRosterFindMany.mockResolvedValueOnce([
      { ...BASE_ROSTER_ROW, playerId: 2, player: { id: 2, mlbId: 2000, posPrimary: "OF" }, acquiredAt: new Date("2026-03-22"), releasedAt },
    ]);
    mockPeriodStatsCount.mockResolvedValueOnce(10);
    mockDailyFindMany.mockResolvedValueOnce([
      { playerId: 2, gameDate: new Date("2026-05-01T00:00:00.000Z"), ...ZERO_STATS, R: 1 },
      { playerId: 2, gameDate: releasedAt, ...ZERO_STATS, R: 4 },
    ]);

    const rows = await computeTeamStatsFromDb(20, 36);

    const team = (rows as any[]).find(r => r.team.id === 1001);
    expect(team.R).toBe(1); // 5/1 counts; the 5/2 release day does not
  });
});
