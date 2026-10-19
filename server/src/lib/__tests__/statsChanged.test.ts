import { describe, it, expect, vi } from "vitest";
import { onStatsChanged, notifyStatsChanged } from "../statsChanged.js";

describe("statsChanged", () => {
  it("passes the leagueId through to every listener", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onStatsChanged(a);
    const offB = onStatsChanged(b);

    notifyStatsChanged(20);
    notifyStatsChanged();

    expect(a.mock.calls).toEqual([[20], [undefined]]);
    expect(b.mock.calls).toEqual([[20], [undefined]]);
    offA();
    offB();
  });

  it("stops calling a listener once it unsubscribes", () => {
    const fn = vi.fn();
    const off = onStatsChanged(fn);
    off();

    notifyStatsChanged(20);

    expect(fn).not.toHaveBeenCalled();
  });

  it("a throwing listener does not stop the others or throw into the syncer", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    const offBad = onStatsChanged(bad);
    const offGood = onStatsChanged(good);

    expect(() => notifyStatsChanged(20)).not.toThrow();
    expect(good).toHaveBeenCalledWith(20);
    offBad();
    offGood();
  });
});
