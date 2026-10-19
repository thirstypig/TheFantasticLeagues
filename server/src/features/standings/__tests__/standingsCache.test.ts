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

  it("a clear for ANOTHER league mid-compute does not wedge this league", async () => {
    let release!: (rows: unknown[]) => void;
    findMany.mockImplementationOnce(() => new Promise((r) => { release = r; }));

    const inFlight = getSeasonStandings(20);
    notifyStatsChanged(1); // unrelated league
    release([]);
    await inFlight;

    // League 20 was never invalidated: its result is cached and served warm.
    await getSeasonStandings(20);
    expect(findMany).toHaveBeenCalledTimes(1);
    // ...and it still expires on the TTL, rather than a settled in-flight
    // promise being served until the next clear.
    vi.useFakeTimers({ now: Date.now() + 121_000, toFake: ["Date"] });
    try {
      await getSeasonStandings(20);
    } finally {
      vi.useRealTimers();
    }
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("a failed compute is not kept as the in-flight marker", async () => {
    findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(getSeasonStandings(20)).rejects.toThrow("db down");

    // The next request must retry, not re-receive the rejected promise.
    await expect(getSeasonStandings(20)).resolves.toBeDefined();
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("a stale compute failing does not evict the newer compute that replaced it", async () => {
    let failA!: (e: Error) => void;
    let releaseB!: (rows: unknown[]) => void;
    findMany
      .mockImplementationOnce(() => new Promise((_, rej) => { failA = rej; }))
      .mockImplementationOnce(() => new Promise((r) => { releaseB = r; }));

    const a = getSeasonStandings(20);
    notifyStatsChanged(20);
    const b = getSeasonStandings(20); // B now owns the entry
    failA(new Error("db down"));
    await expect(a).rejects.toThrow("db down");

    const c = getSeasonStandings(20); // must share B, not start a third compute
    releaseB([]);
    await Promise.all([b, c]);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("a failed compute during an unrelated clear is not kept as the in-flight marker", async () => {
    let fail!: (e: Error) => void;
    findMany.mockImplementationOnce(() => new Promise((_, rej) => { fail = rej; }));

    const inFlight = getSeasonStandings(20);
    notifyStatsChanged(1);
    fail(new Error("db down"));
    await expect(inFlight).rejects.toThrow("db down");

    await expect(getSeasonStandings(20)).resolves.toBeDefined();
  });
});
