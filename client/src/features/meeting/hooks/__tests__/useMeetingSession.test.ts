import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { MeetingSessionResponse } from "@shared/api/meeting";

vi.mock("../../api", () => ({ getCurrentMeeting: vi.fn() }));

import { getCurrentMeeting } from "../../api";
import { useMeetingSession } from "../useMeetingSession";

function response(status: "running" | "ended", version = 3): MeetingSessionResponse {
  return {
    session: {
      id: 1,
      leagueId: 7,
      periodId: 9,
      handedOffAt: null,
      state: {
        status,
        order: [1, 2],
        round: 1,
        turnIndex: 0,
        turnEndsAt: null,
        pausedRemainingMs: null,
        passedThisRound: [],
        moves: [],
        turnsLog: [],
        settings: { turnSeconds: 90, canAddTime: true, overtimeFee: 0 },
      },
    },
    version,
    serverNow: new Date().toISOString(),
    online: [],
  };
}

function setVisibility(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
}

const get = vi.mocked(getCurrentMeeting);

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
  setVisibility("visible");
});
afterEach(() => {
  vi.useRealTimers();
  setVisibility("visible");
});

describe("useMeetingSession polling", () => {
  it("fetches on mount then every 2s while visible (2 polls in 4s)", async () => {
    get.mockResolvedValue(response("running"));
    const { unmount } = renderHook(() => useMeetingSession(7));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(get).toHaveBeenCalledTimes(3);
    unmount();
  });

  it("polls every 15s while hidden (1 poll in 15s)", async () => {
    setVisibility("hidden");
    get.mockResolvedValue(response("running"));
    const { unmount } = renderHook(() => useMeetingSession(7));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(14000); });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(get).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("stops polling once the meeting has ended", async () => {
    get.mockResolvedValue(response("ended"));
    const { result, unmount } = renderHook(() => useMeetingSession(7));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.data?.session?.state.status).toBe("ended");
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(get).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does nothing without a league", async () => {
    renderHook(() => useMeetingSession(null));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(get).not.toHaveBeenCalled();
  });
});

describe("useMeetingSession act", () => {
  it("passes the current version and applies the response", async () => {
    get.mockResolvedValue(response("running", 3));
    const { result, unmount } = renderHook(() => useMeetingSession(7));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const fn = vi.fn().mockResolvedValue(response("running", 4));
    await act(async () => { await result.current.act(fn); });
    expect(fn).toHaveBeenCalledWith(3);
    expect(result.current.data?.version).toBe(4);
    unmount();
  });

  it("a 409 triggers a refresh and throws the retry message", async () => {
    get.mockResolvedValue(response("running", 3));
    const { result, unmount } = renderHook(() => useMeetingSession(7));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(get).toHaveBeenCalledTimes(1);
    const conflict = Object.assign(new Error("The meeting just changed"), { status: 409 });
    let thrown: unknown;
    await act(async () => {
      await result.current.act(() => Promise.reject(conflict)).catch((e) => { thrown = e; });
    });
    expect((thrown as Error).message).toBe("The meeting just changed. Try again.");
    expect(get).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("rethrows non-409 errors without refreshing", async () => {
    get.mockResolvedValue(response("running", 3));
    const { result, unmount } = renderHook(() => useMeetingSession(7));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const bad = Object.assign(new Error("Pick a different player to drop"), { status: 400 });
    let thrown: unknown;
    await act(async () => {
      await result.current.act(() => Promise.reject(bad)).catch((e) => { thrown = e; });
    });
    expect(thrown).toBe(bad);
    expect(get).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("useMeetingSession races", () => {
  it("ignores a stale poll that lands after an act response", async () => {
    get.mockResolvedValueOnce(response("running", 3));
    const { result, unmount } = renderHook(() => useMeetingSession(7));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    let resolvePoll!: (r: MeetingSessionResponse) => void;
    get.mockImplementationOnce(() => new Promise((r) => { resolvePoll = r; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); // poll in flight
    await act(async () => { await result.current.act(() => Promise.resolve(response("running", 5))); });
    expect(result.current.data?.version).toBe(5);
    await act(async () => { resolvePoll(response("running", 4)); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.data?.version).toBe(5);
    const fn = vi.fn().mockResolvedValue(response("running", 6));
    await act(async () => { await result.current.act(fn); });
    expect(fn).toHaveBeenCalledWith(5);
    unmount();
  });

  it("applies a response for a different session even with a lower version", async () => {
    get.mockResolvedValueOnce(response("running", 9));
    const { result, unmount } = renderHook(() => useMeetingSession(7));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const other = response("running", 1);
    other.session!.id = 2;
    get.mockResolvedValue(other);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.data?.session?.id).toBe(2);
    unmount();
  });

  it("refresh during an in-flight poll does not stack poll chains", async () => {
    get.mockResolvedValueOnce(response("running", 3));
    const { result, unmount } = renderHook(() => useMeetingSession(7));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(get).toHaveBeenCalledTimes(1);
    let resolvePoll!: (r: MeetingSessionResponse) => void;
    get.mockImplementationOnce(() => new Promise((r) => { resolvePoll = r; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); // poll #2 in flight
    expect(get).toHaveBeenCalledTimes(2);
    get.mockResolvedValue(response("running", 3));
    await act(async () => { result.current.refresh(); await vi.advanceTimersByTimeAsync(0); }); // fetch #3
    expect(get).toHaveBeenCalledTimes(3);
    await act(async () => { resolvePoll(response("running", 3)); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(get).toHaveBeenCalledTimes(3 + 5); // one chain: 5 polls in 10s
    unmount();
    const n = get.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(get).toHaveBeenCalledTimes(n);
  });

  it("refreshes immediately when the tab becomes visible again", async () => {
    setVisibility("hidden");
    get.mockResolvedValue(response("running", 3));
    const { unmount } = renderHook(() => useMeetingSession(7));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(get).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0); });
    expect(get).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(get).toHaveBeenCalledTimes(3);
    unmount();
  });
});
