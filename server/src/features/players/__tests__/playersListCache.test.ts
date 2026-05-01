import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  withPlayersCache,
  clearPlayersCache,
  _playersCacheSize,
} from "../services/playersListCache.js";

describe("playersListCache", () => {
  beforeEach(() => {
    clearPlayersCache();
  });

  it("returns cached value on second call within TTL", async () => {
    const loader = vi.fn().mockResolvedValue(["a", "b"]);

    const first = await withPlayersCache(1, "all", "all", loader);
    const second = await withPlayersCache(1, "all", "all", loader);

    expect(first).toEqual(["a", "b"]);
    expect(second).toEqual(["a", "b"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("differentiates by leagueId", async () => {
    const loader1 = vi.fn().mockResolvedValue(["league-1"]);
    const loader2 = vi.fn().mockResolvedValue(["league-2"]);

    await withPlayersCache(1, "all", "all", loader1);
    await withPlayersCache(2, "all", "all", loader2);

    expect(loader1).toHaveBeenCalledTimes(1);
    expect(loader2).toHaveBeenCalledTimes(1);
    expect(_playersCacheSize()).toBe(2);
  });

  it("differentiates by availability + type", async () => {
    const loader = vi.fn().mockResolvedValue([]);

    await withPlayersCache(1, "all", "all", loader);
    await withPlayersCache(1, "available", "all", loader);
    await withPlayersCache(1, "all", "pitchers", loader);

    expect(loader).toHaveBeenCalledTimes(3);
    expect(_playersCacheSize()).toBe(3);
  });

  it("clearPlayersCache(leagueId) invalidates only that league", async () => {
    await withPlayersCache(1, "all", "all", () => Promise.resolve([1]));
    await withPlayersCache(1, "available", "all", () => Promise.resolve([1]));
    await withPlayersCache(2, "all", "all", () => Promise.resolve([2]));

    clearPlayersCache(1);

    expect(_playersCacheSize()).toBe(1);

    // League 1 is fresh, league 2 still cached.
    const reload1 = vi.fn().mockResolvedValue([1]);
    const reload2 = vi.fn().mockResolvedValue([2]);
    await withPlayersCache(1, "all", "all", reload1);
    await withPlayersCache(2, "all", "all", reload2);
    expect(reload1).toHaveBeenCalled();
    expect(reload2).not.toHaveBeenCalled();
  });

  it("stampede prevention — concurrent misses share one Promise", async () => {
    let resolve: (v: number[]) => void = () => {};
    const pending = new Promise<number[]>((r) => { resolve = r; });
    const loader = vi.fn().mockReturnValue(pending);

    // Fire two concurrent reads. They must share the same in-flight Promise,
    // not issue parallel queries.
    const p1 = withPlayersCache(1, "all", "all", loader);
    const p2 = withPlayersCache(1, "all", "all", loader);

    expect(loader).toHaveBeenCalledTimes(1);

    resolve([42]);
    expect(await p1).toEqual([42]);
    expect(await p2).toEqual([42]);
  });

  it("loader rejection clears the cache slot — next call retries", async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(["recovered"]);

    await expect(withPlayersCache(1, "all", "all", loader)).rejects.toThrow("transient");
    const second = await withPlayersCache(1, "all", "all", loader);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(second).toEqual(["recovered"]);
  });
});
