import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const fetchJsonApi = vi.fn();
vi.mock("../../../../api/base", () => ({ fetchJsonApi: (...a: unknown[]) => fetchJsonApi(...a), API_BASE: "/api" }));

import { useMyList } from "../useMyList";

// Server contract (biddingRoutes.ts): GET -> {teamId, mlbIds}; PUT body {teamId, mlbIds}, leagueId in query.
function server(initial: number[]) {
  let stored = initial;
  fetchJsonApi.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(init.body as string);
      stored = body.mlbIds;
      return { teamId: body.teamId, mlbIds: stored };
    }
    return { teamId: 7, mlbIds: stored };
  });
}
const puts = () => fetchJsonApi.mock.calls.filter(c => c[1]?.method === "PUT");

beforeEach(() => { fetchJsonApi.mockReset(); localStorage.clear(); });

describe("useMyList", () => {
  it("loads the list with GET /auction/my-list?leagueId&teamId", async () => {
    server([11, 22]);
    const { result } = renderHook(() => useMyList(20, 7));
    await waitFor(() => expect(result.current.list).toEqual([11, 22]));
    expect(fetchJsonApi.mock.calls[0][0]).toBe("/api/auction/my-list?leagueId=20&teamId=7");
  });

  it("add / remove / move send PUT /auction/my-list?leagueId with {teamId, mlbIds}", async () => {
    server([1, 2, 3]);
    const { result } = renderHook(() => useMyList(20, 7));
    await waitFor(() => expect(result.current.list).toEqual([1, 2, 3]));

    await act(() => result.current.add(4));
    expect(puts().at(-1)![0]).toBe("/api/auction/my-list?leagueId=20");
    expect(JSON.parse(puts().at(-1)![1].body)).toEqual({ teamId: 7, mlbIds: [1, 2, 3, 4] });

    await act(() => result.current.remove(2));
    expect(JSON.parse(puts().at(-1)![1].body).mlbIds).toEqual([1, 3, 4]);

    await act(() => result.current.move(4, -1));
    expect(JSON.parse(puts().at(-1)![1].body).mlbIds).toEqual([1, 4, 3]);
    expect(result.current.list).toEqual([1, 4, 3]);

    const n = puts().length;
    await act(() => result.current.move(1, -1)); // already first: no request
    expect(puts().length).toBe(n);
  });

  it("add ignores a duplicate; reorder dedupes and caps at 50 before sending", async () => {
    server([5]);
    const { result } = renderHook(() => useMyList(20, 7));
    await waitFor(() => expect(result.current.list).toEqual([5]));
    await act(() => result.current.add(5));
    expect(puts()).toHaveLength(0);

    const many = [...Array.from({ length: 60 }, (_, i) => i + 1), 1, 2];
    await act(() => result.current.reorder(many));
    const sent = JSON.parse(puts()[0][1].body).mlbIds as number[];
    expect(sent).toHaveLength(50);
    expect(new Set(sent).size).toBe(50);
  });

  it("rolls back and reports the error when the server rejects a save", async () => {
    server([1]);
    const { result } = renderHook(() => useMyList(20, 7));
    await waitFor(() => expect(result.current.list).toEqual([1]));
    fetchJsonApi.mockRejectedValueOnce(new Error("boom"));
    await act(() => result.current.add(2));
    expect(result.current.list).toEqual([1]);
    expect(result.current.error).toBe("boom");
  });

  it("migrates localStorage nominationQueue_<teamId> once: PUT then delete the key", async () => {
    localStorage.setItem("nominationQueue_7", JSON.stringify(["660271", "545361", "660271"]));
    server([]);
    const { result } = renderHook(() => useMyList(20, 7));
    await waitFor(() => expect(result.current.list).toEqual([660271, 545361]));
    expect(puts()).toHaveLength(1);
    expect(puts()[0][0]).toBe("/api/auction/my-list?leagueId=20");
    expect(JSON.parse(puts()[0][1].body)).toEqual({ teamId: 7, mlbIds: [660271, 545361] });
    expect(localStorage.getItem("nominationQueue_7")).toBeNull();
  });

  it("keeps the legacy key when the migration PUT fails", async () => {
    localStorage.setItem("nominationQueue_7", JSON.stringify(["9"]));
    fetchJsonApi.mockImplementation(async (_u: string, init?: RequestInit) => {
      if (init?.method === "PUT") throw new Error("down");
      return { teamId: 7, mlbIds: [] };
    });
    const { result } = renderHook(() => useMyList(20, 7));
    await waitFor(() => expect(result.current.error).toBe("down"));
    expect(localStorage.getItem("nominationQueue_7")).not.toBeNull();
  });

  it("does not overwrite a non-empty server list with the legacy queue, but still clears the key", async () => {
    localStorage.setItem("nominationQueue_7", JSON.stringify(["9"]));
    server([1, 2]);
    const { result } = renderHook(() => useMyList(20, 7));
    await waitFor(() => expect(result.current.list).toEqual([1, 2]));
    expect(puts()).toHaveLength(0);
    expect(localStorage.getItem("nominationQueue_7")).toBeNull();
  });

  it("does nothing without a team", async () => {
    const { result } = renderHook(() => useMyList(20, null));
    expect(result.current.list).toEqual([]);
    expect(fetchJsonApi).not.toHaveBeenCalled();
  });
});
