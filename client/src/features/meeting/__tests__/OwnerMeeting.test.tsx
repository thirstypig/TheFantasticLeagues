import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../api", () => ({
  getCurrentMeeting: vi.fn(),
  getLeagueTeams: vi.fn(),
  getMeetingPeriod: vi.fn(),
  submitMove: vi.fn(),
  passTurn: vi.fn(),
  getChoices: vi.fn(),
  searchFreeAgents: vi.fn(),
}));
const league = vi.hoisted(() => ({ value: { leagueId: 7, myTeamId: 1 as number | null } }));
vi.mock("../../../contexts/LeagueContext", () => ({ useLeague: () => league.value }));

import * as api from "../api";
import { OwnerMeetingPage } from "../pages/OwnerMeetingPage";
import { MeetingLiveBanner } from "../components/MeetingLiveBanner";
import { placeInOrder } from "../lib/place";
import { ALONSO, FRALEY, TEAMS, choices, sessionResponse, state } from "./fixtures";

const m = vi.mocked(api);
const IN_ONE_MIN = () => new Date(Date.now() + 60_000).toISOString();

// order [3, 1, 2]; I am team 1 (Diamond Kings is 1, Los Doyers is 3 in TEAMS).
function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/leagues/7/meeting"]}>
      <Routes>
        <Route path="/leagues/:leagueId/meeting" element={<OwnerMeetingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  league.value = { leagueId: 7, myTeamId: 1 };
  m.getLeagueTeams.mockResolvedValue(TEAMS);
  m.getMeetingPeriod.mockResolvedValue({ name: "Period 9", status: "pending" });
  m.getChoices.mockResolvedValue(choices({ list: [FRALEY], roster: [ALONSO], activeCount: 23 }));
  m.searchFreeAgents.mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("OwnerMeetingPage", () => {
  it("my turn shows TurnEntry", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() })));
    renderPage();
    expect(await screen.findByText("You're up")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Submit move" })).toBeTruthy();
    expect(screen.getByText(/Diamond Kings · Round 1/)).toBeTruthy();
    expect(m.getChoices).toHaveBeenCalledWith(55, 1);
  });

  it("submit disabled until add and drop picked", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() })));
    m.submitMove.mockResolvedValue(sessionResponse(state({ turnIndex: 2 })));
    renderPage();
    const submit = (await screen.findByRole("button", { name: "Submit move" })) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: /Jake Fraley/ }));
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Drop"), { target: { value: String(ALONSO.playerId) } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() =>
      expect(m.submitMove).toHaveBeenCalledWith(55, {
        teamId: 1,
        addPlayerId: FRALEY.playerId,
        dropPlayerId: ALONSO.playerId,
        version: 1,
      }),
    );
  });

  it("not my turn shows who is up and my place", async () => {
    const mv = { id: "a", teamId: 1, add: FRALEY, drop: ALONSO };
    m.getCurrentMeeting.mockResolvedValue(
      sessionResponse(state({ turnIndex: 0, turnEndsAt: IN_ONE_MIN(), moves: [mv] })),
    );
    renderPage();
    expect(await screen.findByText("Los Doyers")).toBeTruthy();
    expect(screen.getByText("On the clock")).toBeTruthy();
    expect(screen.getByText(/You.re 2nd/)).toBeTruthy();
    expect(screen.getByText(/\+ Fraley − Alonso/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit move" })).toBeNull();
  });

  it("no live session says so", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(null, { version: 0 }));
    renderPage();
    expect(await screen.findByText("No meeting right now.")).toBeTruthy();
  });

  it("title changes when my turn starts, with one tone, and restores after", async () => {
    const original = document.title;
    const start = vi.fn();
    const osc = { connect: vi.fn(), start, stop: vi.fn(), frequency: { value: 0 }, type: "sine" };
    const ctx = vi.fn(function () { return ({
      createOscillator: () => osc,
      createGain: () => ({ connect: vi.fn(), gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }),
      destination: {},
      currentTime: 0,
      close: vi.fn(),
    }); });
    (window as unknown as { AudioContext: unknown }).AudioContext = ctx;
    vi.useFakeTimers();
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 0, turnEndsAt: IN_ONE_MIN() })));
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(document.title).toBe(original);

    // The poll flips to my turn.
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() }), { version: 2 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(document.title).toBe("You're up · Meeting");
    expect(start).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(start).toHaveBeenCalledTimes(1);

    // My turn ends.
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 2, turnEndsAt: IN_ONE_MIN() }), { version: 3 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(document.title).toBe(original);
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it("no tone when it is already my turn on first load", async () => {
    const ctx = vi.fn(function () {});
    (window as unknown as { AudioContext: unknown }).AudioContext = ctx;
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() })));
    renderPage();
    await screen.findByRole("button", { name: "Submit move" });
    expect(ctx).not.toHaveBeenCalled();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it("header uses the period name, fetched once, and falls back when the lookup fails", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 0, turnEndsAt: IN_ONE_MIN() })));
    const { unmount } = renderPage();
    expect(await screen.findByRole("heading", { name: "Period 9 meeting" })).toBeTruthy();
    expect(m.getMeetingPeriod).toHaveBeenCalledWith(7, 9);
    expect(m.getMeetingPeriod).toHaveBeenCalledTimes(1);
    unmount();
    m.getMeetingPeriod.mockRejectedValue(new Error("down"));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Period meeting" })).toBeTruthy();
  });

  it("a running session for a period that is no longer pending is not live", async () => {
    m.getMeetingPeriod.mockResolvedValue({ name: "Period 8", status: "active" });
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() }), { periodId: 8 }));
    renderPage();
    expect(await screen.findByText("No meeting right now.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit move" })).toBeNull();
  });

  it("a running session is not shown as live, and no tone plays, until the period lookup settles", async () => {
    const ctx = vi.fn(function () {});
    (window as unknown as { AudioContext: unknown }).AudioContext = ctx;
    let settle: (v: { name: string; status: string }) => void = () => {};
    m.getMeetingPeriod.mockImplementation(() => new Promise((res) => { settle = res; }));
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() }), { periodId: 8 }));
    renderPage();
    expect(await screen.findByText("No meeting right now.")).toBeTruthy();
    await waitFor(() => expect(m.getMeetingPeriod).toHaveBeenCalledWith(7, 8));
    expect(screen.queryByText("You're up")).toBeNull();
    await act(async () => { settle({ name: "Period 8", status: "active" }); });
    expect(screen.getByText("No meeting right now.")).toBeTruthy();
    expect(screen.queryByText("You're up")).toBeNull();
    expect(ctx).not.toHaveBeenCalled();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it("pass calls passTurn with the version", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() }), { version: 4 }));
    m.passTurn.mockResolvedValue(sessionResponse(state({ turnIndex: 2 }), { version: 5 }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Pass" }));
    await waitFor(() => expect(m.passTurn).toHaveBeenCalledWith(55, { teamId: 1, version: 4 }));
  });

  it("shows a server error inline", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() })));
    m.passTurn.mockRejectedValue(new Error("It isn't your turn"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Pass" }));
    expect((await screen.findByRole("alert")).textContent).toBe("It isn't your turn");
  });

  it("no tone when my team resolves after the first poll", async () => {
    const ctx = vi.fn(function () {});
    (window as unknown as { AudioContext: unknown }).AudioContext = ctx;
    vi.useFakeTimers();
    league.value = { leagueId: 7, myTeamId: null };
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() })));
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    league.value = { leagueId: 7, myTeamId: 1 };
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() }), { version: 2 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(document.title).toBe("You're up · Meeting");
    expect(ctx).not.toHaveBeenCalled();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it("pause and resume on my turn does not replay the tone", async () => {
    const start = vi.fn();
    const ctx = vi.fn(function () {
      return {
        createOscillator: () => ({ connect: vi.fn(), start, stop: vi.fn(), frequency: { value: 0 }, type: "sine" }),
        createGain: () => ({ connect: vi.fn(), gain: { value: 0 } }),
        destination: {}, currentTime: 0, close: vi.fn(), resume: vi.fn(),
      };
    });
    (window as unknown as { AudioContext: unknown }).AudioContext = ctx;
    vi.useFakeTimers();
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 0, turnEndsAt: IN_ONE_MIN() })));
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() }), { version: 2 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(start).toHaveBeenCalledTimes(1);
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ status: "paused", turnIndex: 1, pausedRemainingMs: 30000 }), { version: 3 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() }), { version: 4 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(start).toHaveBeenCalledTimes(1);
    expect(document.title).toBe("You're up · Meeting");
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it("closes the audio context exactly once, even if the second close would reject", async () => {
    let calls = 0;
    const close = vi.fn(() => (++calls > 1 ? Promise.reject(new Error("closed")) : Promise.resolve()));
    const osc: { connect: () => void; start: () => void; stop: () => void; frequency: { value: number }; type: string; onended: (() => void) | null } =
      { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { value: 0 }, type: "sine", onended: null };
    (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(function () {
      return { createOscillator: () => osc, createGain: () => ({ connect: vi.fn(), gain: { value: 0 } }), destination: {}, currentTime: 0, close, resume: vi.fn() };
    });
    vi.useFakeTimers();
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 0, turnEndsAt: IN_ONE_MIN() })));
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() }), { version: 2 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    osc.onended?.();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(close).toHaveBeenCalledTimes(1);
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it("a new meeting whose first turn is mine still plays the tone", async () => {
    const start = vi.fn();
    (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(function () {
      return { createOscillator: () => ({ connect: vi.fn(), start, stop: vi.fn(), frequency: { value: 0 }, type: "sine" }), createGain: () => ({ connect: vi.fn(), gain: { value: 0 } }), destination: {}, currentTime: 0, close: vi.fn(), resume: vi.fn() };
    });
    vi.useFakeTimers();
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() }), { id: 55 }));
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(start).not.toHaveBeenCalled();
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() }), { id: 56, version: 1 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(start).toHaveBeenCalledTimes(1);
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it("restores the title on unmount", async () => {
    const original = document.title;
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: IN_ONE_MIN() })));
    const { unmount } = renderPage();
    await screen.findByRole("button", { name: "Submit move" });
    expect(document.title).toBe("You're up · Meeting");
    unmount();
    expect(document.title).toBe(original);
  });
});

describe("placeInOrder", () => {
  it("counts from the team on the clock", () => {
    const s = state({ order: [3, 1, 2], turnIndex: 0 });
    expect(placeInOrder(s, 3)).toEqual({ onClock: true, nth: 1 });
    expect(placeInOrder(s, 1)).toEqual({ onClock: false, nth: 2 });
    expect(placeInOrder(s, 2)).toEqual({ onClock: false, nth: 3 });
  });
  it("counts into the next round when my turn already passed", () => {
    const s = state({ order: [3, 1, 2], turnIndex: 1 });
    expect(placeInOrder(s, 2)).toEqual({ onClock: false, nth: 2 });
    expect(placeInOrder(s, 3)).toEqual({ onClock: false, nth: 3 });
  });
  it("returns null when the team is not in the order", () => {
    expect(placeInOrder(state(), 99)).toBeNull();
  });
});

describe("MeetingLiveBanner", () => {
  function renderBanner() {
    return render(
      <MemoryRouter>
        <MeetingLiveBanner leagueId={7} myTeamId={1} />
      </MemoryRouter>,
    );
  }

  it("banner hidden when no running session", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(null, { version: 0 }));
    const { container } = renderBanner();
    await waitFor(() => expect(m.getCurrentMeeting).toHaveBeenCalled());
    await act(async () => {});
    expect(container.textContent).toBe("");
  });

  it("banner hidden for setup and ended sessions", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ status: "ended" })));
    const { container } = renderBanner();
    await waitFor(() => expect(m.getCurrentMeeting).toHaveBeenCalled());
    await act(async () => {});
    expect(container.textContent).toBe("");
  });

  it("banner says you're up", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1 })));
    renderBanner();
    const link = await screen.findByRole("link", { name: /Period 9 meeting is live: you.re up/ });
    expect(link.getAttribute("href")).toBe("/leagues/7/meeting");
  });

  it("banner falls back to Period meeting when the name lookup fails", async () => {
    m.getMeetingPeriod.mockRejectedValue(new Error("down"));
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1 })));
    renderBanner();
    expect(await screen.findByText("Period meeting is live: you're up")).toBeTruthy();
  });

  it("banner hidden for a running session whose period is no longer pending", async () => {
    m.getMeetingPeriod.mockResolvedValue({ name: "Period 8", status: "active" });
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 1 }), { periodId: 8 }));
    const { container } = renderBanner();
    await waitFor(() => expect(m.getMeetingPeriod).toHaveBeenCalledWith(7, 8));
    await act(async () => {});
    expect(container.textContent).toBe("");
  });

  it("banner says my place in the order", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 0, status: "paused" })));
    renderBanner();
    expect(await screen.findByText("Period 9 meeting is live: you're 2nd")).toBeTruthy();
  });

  function setVisibility(v: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  }

  it("polls at 30s while visible, not at all while hidden, and appears once live", async () => {
    vi.useFakeTimers();
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(null, { version: 0 }));
    const { container } = renderBanner();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(m.getCurrentMeeting).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(29_000); });
    expect(m.getCurrentMeeting).toHaveBeenCalledTimes(1);
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnIndex: 0 }), { version: 1 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(m.getCurrentMeeting).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Period 9 meeting is live: you're 2nd");

    // Hidden: an idle chain does not poll.
    vi.useRealTimers();
    vi.useFakeTimers();
    m.getCurrentMeeting.mockReset();
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(null, { version: 0 }));
    setVisibility("hidden");
    const hidden = renderBanner();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(m.getCurrentMeeting).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(m.getCurrentMeeting).toHaveBeenCalledTimes(1);
    hidden.unmount();
    setVisibility("visible");
  });
});
