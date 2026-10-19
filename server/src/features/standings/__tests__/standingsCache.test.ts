import { describe, it, expect, vi, beforeEach } from "vitest";

// Zero periods keeps getSeasonStandingsUncached to a single query, so
// `period.findMany` call count == number of cold computes.
const findMany = vi.fn();
vi.mock("../../../db/prisma.js", () => ({
  prisma: { period: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const { getSeasonStandings, clearStandingsCache } = await import("../services/standingsService.js");
const { notifyStatsChanged } = await import("../../../lib/statsChanged.js");

beforeEach(() => {
  clearStandingsCache();
  findMany.mockReset();
  findMany.mockResolvedValue([]);
});

describe("standings cache invalidation (todo #305)", () => {
  it("serves a warm hit without recomputing", async () => {
    await getSeasonStandings(20);
    await getSeasonStandings(20);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("a stats write for the league forces the next read to recompute", async () => {
    await getSeasonStandings(20);
    notifyStatsChanged(20);
    await getSeasonStandings(20);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("a stats write for another league leaves this league's entry warm", async () => {
    await getSeasonStandings(20);
    notifyStatsChanged(1);
    await getSeasonStandings(20);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("an unscoped write (daily stats) clears every league", async () => {
    await getSeasonStandings(20);
    await getSeasonStandings(1);
    notifyStatsChanged();
    await getSeasonStandings(20);
    await getSeasonStandings(1);
    expect(findMany).toHaveBeenCalledTimes(4);
  });

  it("a compute in flight during a stats write does not repopulate the cache", async () => {
    let release!: (rows: unknown[]) => void;
    findMany.mockImplementationOnce(() => new Promise((r) => { release = r; }));

    const inFlight = getSeasonStandings(20); // started on pre-sync data
    notifyStatsChanged(20);                  // sync lands mid-compute
    release([]);
    await inFlight;

    await getSeasonStandings(20);
    // Without the generation guard the stale result would be cached and this
    // read would be a hit (1 call). It must recompute.
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
