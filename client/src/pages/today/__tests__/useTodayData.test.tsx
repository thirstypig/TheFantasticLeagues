import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
vi.mock("../../../api/base", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/base")>();
  return { ...actual, fetchJsonApi: (url: string) => fetchMock(url) };
});

import { useTodayData } from "../useTodayData";

function respond(overrides: Record<string, () => unknown> = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    for (const [frag, fn] of Object.entries(overrides)) {
      if (url.includes(frag)) return fn();
    }
    if (url.includes("/mlb/my-players-today")) return { players: [] };
    if (url.includes("/mlb/my-player-news")) return { items: [] };
    if (url.includes("/wire-list/periods/active")) return { period: null };
    if (url.includes("/periods?")) return { data: [] };
    if (url.includes("/season?")) return { periodIds: [1], periodNames: ["P1"], rows: [] };
    throw new Error(`unexpected url ${url}`);
  });
}
const urls = () => fetchMock.mock.calls.map((c) => c[0] as string);

describe("useTodayData", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("requests the five sources with the league id", async () => {
    respond();
    const { result } = renderHook(() => useTodayData(5, true));
    await waitFor(() => {
      const r = result.current;
      expect([r.standings, r.periods, r.wirePeriod, r.tonight, r.news].every((s) => s.status === "ok")).toBe(true);
    });
    const u = urls();
    for (const frag of [
      "/mlb/my-players-today?leagueId=5",
      "/mlb/my-player-news?leagueId=5",
      "/periods?leagueId=5",
      "/wire-list/periods/active?leagueId=5",
      "/season?leagueId=5",
    ]) {
      expect(u.some((x) => x.endsWith(frag))).toBe(true);
    }
  });

  it("a failed source leaves the others intact", async () => {
    respond({ "/mlb/my-players-today": () => { throw new Error("boom"); } });
    const { result } = renderHook(() => useTodayData(6, true));
    await waitFor(() => expect(result.current.tonight.status).toBe("error"));
    await waitFor(() => {
      const r = result.current;
      expect([r.standings, r.periods, r.wirePeriod, r.news].every((s) => s.status === "ok")).toBe(true);
    });
  });

  it("skips team-only sources when the user has no team", async () => {
    respond();
    const { result } = renderHook(() => useTodayData(7, false));
    await waitFor(() => {
      expect(result.current.standings.status).toBe("ok");
      expect(result.current.periods.status).toBe("ok");
    });
    expect(result.current.wirePeriod).toEqual({ status: "ok", data: null });
    expect(result.current.tonight).toEqual({ status: "ok", data: [] });
    expect(result.current.news).toEqual({ status: "ok", data: [] });
    const u = urls();
    expect(u.some((x) => x.includes("/season?leagueId=7"))).toBe(true);
    expect(u.some((x) => x.includes("/periods?leagueId=7"))).toBe(true);
    expect(u.some((x) => x.includes("/mlb/"))).toBe(false);
    expect(u.some((x) => x.includes("/wire-list/"))).toBe(false);
  });
  it("resets to loading when the league clears", async () => {
    respond();
    const { result, rerender } = renderHook(({ id }: { id: number | null }) => useTodayData(id, true), {
      initialProps: { id: 8 as number | null },
    });
    await waitFor(() => expect(result.current.standings.status).toBe("ok"));
    rerender({ id: null });
    await waitFor(() => expect(result.current.standings.status).toBe("loading"));
    expect(result.current.periods.status).toBe("loading");
    expect(result.current.tonight.status).toBe("loading");
  });

  it("ignores a late response from a previous league", async () => {
    let resolve9!: (v: unknown) => void;
    const late9 = new Promise((r) => { resolve9 = r; });
    respond({
      "/season?leagueId=9": () => late9,
      "/season?leagueId=10": () => ({ periodIds: [1], periodNames: ["L10"], rows: [] }),
    });
    const { result, rerender } = renderHook(({ id }: { id: number | null }) => useTodayData(id, true), {
      initialProps: { id: 9 as number | null },
    });
    rerender({ id: 10 });
    await waitFor(() => expect(result.current.standings).toEqual({ status: "ok", data: { rows: [], periodNames: ["L10"] } }));
    resolve9({ periodIds: [1], periodNames: ["L9"], rows: [] });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.standings).toEqual({ status: "ok", data: { rows: [], periodNames: ["L10"] } });
  });
});
