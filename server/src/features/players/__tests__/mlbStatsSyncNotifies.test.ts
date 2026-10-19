/**
 * The stats syncers must announce their writes (todo #305) — that signal is
 * the only thing that invalidates the standings cache. If a refactor drops the
 * call, standings silently go back to TTL-only and serve pre-sync numbers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findUnique: vi.fn() },
    roster: { findMany: vi.fn() },
    player: { findFirst: vi.fn() },
    playerStatsPeriod: { upsert: vi.fn(), findUnique: vi.fn() },
    playerStatsDaily: { upsert: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../../lib/mlbApi.js", () => ({ mlbGetJson: vi.fn() }));
vi.mock("../../../lib/statsChanged.js", () => ({ notifyStatsChanged: vi.fn() }));

import { prisma } from "../../../db/prisma.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { notifyStatsChanged } from "../../../lib/statsChanged.js";
import { syncPeriodStats, syncDailyStats } from "../services/mlbStatsSyncService.js";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  // First roster query builds the mlbId map; the second is the two-way
  // pitcher mirror, which finds nothing.
  mockPrisma.roster.findMany
    .mockResolvedValueOnce([{ player: { id: 1, mlbId: 672695 } }])
    .mockResolvedValueOnce([]);
  (mlbGetJson as any).mockResolvedValue({ people: [] });
});

describe("stats syncers notify on write", () => {
  it("syncPeriodStats notifies with the period's league", async () => {
    mockPrisma.period.findUnique.mockResolvedValue({
      id: 40,
      leagueId: 20,
      startDate: new Date("2026-08-02T00:00:00Z"),
      endDate: new Date("2026-08-29T00:00:00Z"),
    });

    await syncPeriodStats(40);

    expect(notifyStatsChanged).toHaveBeenCalledExactlyOnceWith(20);
  });

  it("syncDailyStats notifies unscoped — daily rows serve every league", async () => {
    await syncDailyStats("2026-08-10");

    expect(notifyStatsChanged).toHaveBeenCalledExactlyOnceWith();
  });
});
