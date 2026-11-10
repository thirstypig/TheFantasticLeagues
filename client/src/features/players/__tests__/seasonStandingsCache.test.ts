/**
 * getSeasonStandings cache: a rejected fetch must not poison the cache, and
 * entries expire after 5 minutes so the Today landing page doesn't show
 * standings from whenever the SPA first loaded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../api/base", async () => {
  const actual = await vi.importActual<typeof import("../../../api/base")>("../../../api/base");
  return { ...actual, fetchJsonApi: vi.fn() };
});

import { fetchJsonApi } from "../../../api/base";
import { getSeasonStandings, _resetSeasonStandingsCache } from "../api";

const mockFetch = fetchJsonApi as unknown as ReturnType<typeof vi.fn>;
const payload = (n: number) => ({ periodIds: [1], periodNames: ["P1"], categoryKeys: [], rows: [{ teamId: n }] });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-02T14:00:00Z"));
  mockFetch.mockReset();
  _resetSeasonStandingsCache();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("getSeasonStandings cache", () => {
  it("shares one request between calls within 5 minutes", async () => {
    mockFetch.mockResolvedValue(payload(1));
    await getSeasonStandings(20);
    vi.setSystemTime(new Date("2026-07-02T14:04:59Z"));
    await getSeasonStandings(20);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on the next call after a rejected fetch", async () => {
    mockFetch.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(payload(2));
    await expect(getSeasonStandings(20)).rejects.toThrow("boom");
    const res = await getSeasonStandings(20);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(res.rows).toEqual([{ teamId: 2 }]);
  });

  it("refetches an entry older than 5 minutes", async () => {
    mockFetch.mockResolvedValueOnce(payload(1)).mockResolvedValueOnce(payload(3));
    await getSeasonStandings(20);
    vi.setSystemTime(new Date("2026-07-02T14:05:01Z"));
    const res = await getSeasonStandings(20);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(res.rows).toEqual([{ teamId: 3 }]);
  });
});
