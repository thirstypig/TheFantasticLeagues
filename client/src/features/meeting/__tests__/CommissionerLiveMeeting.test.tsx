import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("../api", () => ({
  getCurrentMeeting: vi.fn(),
  getSeasonOrder: vi.fn(),
  openMeeting: vi.fn(),
  setOrder: vi.fn(),
  startMeeting: vi.fn(),
  pauseMeeting: vi.fn(),
  resumeMeeting: vi.fn(),
  addTime: vi.fn(),
  skipTurn: vi.fn(),
  endMeeting: vi.fn(),
  submitMove: vi.fn(),
  passTurn: vi.fn(),
  markHandedOff: vi.fn(),
  getChoices: vi.fn(),
  searchFreeAgents: vi.fn(),
  getMeetingPeriod: vi.fn(),
}));

import * as api from "../api";
import { CommissionerLiveMeeting } from "../screens/CommissionerLiveMeeting";
import { ALONSO, CASAS, FRALEY, HAYS, TEAMS, choices, sessionResponse, state } from "./fixtures";

const m = vi.mocked(api);

function renderScreen(onHandOff = vi.fn()) {
  render(<CommissionerLiveMeeting leagueId={7} periodId={9} teams={TEAMS} onHandOff={onHandOff} />);
  return onHandOff;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getSeasonOrder.mockResolvedValue([3, 1, 2]);
  m.getMeetingPeriod.mockResolvedValue({ name: "Period 8", status: "active" });
});
afterEach(() => {
  vi.useRealTimers();
});

const rowNames = () => screen.getAllByTestId("order-row").map((r) => within(r).getByTestId("order-name").textContent);

describe("CommissionerLiveMeeting", () => {
  it("setup shows worst-first order and Start", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(null, { version: 0 }));
    m.openMeeting.mockResolvedValue(sessionResponse(state({ status: "setup" }), { version: 1 }));
    renderScreen();

    await waitFor(() => expect(rowNames()).toEqual(["Los Doyers", "Diamond Kings", "Skunk Dogs"]));
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open the meeting" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start" })).toBeTruthy());
    expect(m.openMeeting).toHaveBeenCalledWith(7, { periodId: 9, order: [3, 1, 2] });
    expect(rowNames()).toEqual(["Los Doyers", "Diamond Kings", "Skunk Dogs"]);

    m.startMeeting.mockResolvedValue(sessionResponse(state({ turnEndsAt: new Date(Date.now() + 120_000).toISOString() }), { version: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(m.startMeeting).toHaveBeenCalledWith(55, 1));
    await screen.findByText("On the clock");
  });

  it("reorders with up/down before opening", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(null, { version: 0 }));
    m.openMeeting.mockResolvedValue(sessionResponse(state({ status: "setup", order: [1, 3, 2] }), { version: 1 }));
    renderScreen();
    await waitFor(() => expect(rowNames()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Move Los Doyers down" }));
    expect(rowNames()).toEqual(["Diamond Kings", "Los Doyers", "Skunk Dogs"]);
    fireEvent.click(screen.getByRole("button", { name: "Open the meeting" }));
    await waitFor(() => expect(m.openMeeting).toHaveBeenCalledWith(7, { periodId: 9, order: [1, 3, 2] }));
  });

  it("+1 min hidden when canAddTime false", async () => {
    const ends = new Date(Date.now() + 60_000).toISOString();
    m.getCurrentMeeting.mockResolvedValue(
      sessionResponse(state({ turnEndsAt: ends, settings: { turnSeconds: 120, canAddTime: false, overtimeFee: 0 } })),
    );
    renderScreen();
    await screen.findByText("On the clock");
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+1 min" })).toBeNull();
  });

  it("+1 min shown and sends the version when canAddTime true", async () => {
    const ends = new Date(Date.now() + 60_000).toISOString();
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnEndsAt: ends }), { version: 4 }));
    m.addTime.mockResolvedValue(sessionResponse(state({ turnEndsAt: ends }), { version: 5 }));
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "+1 min" }));
    await waitFor(() => expect(m.addTime).toHaveBeenCalledWith(55, 4));
  });

  it("clock turns red past zero", async () => {
    vi.useFakeTimers();
    const ends = new Date(Date.now() + 1000).toISOString();
    // A real server stamps serverNow on every response.
    m.getCurrentMeeting.mockImplementation(async () => sessionResponse(state({ turnEndsAt: ends })));
    renderScreen();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const clock = screen.getByTestId("countdown");
    expect(clock.getAttribute("data-over")).toBe("false");
    expect(clock.textContent).toBe("0:01");
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(clock.getAttribute("data-over")).toBe("true");
    expect(clock.textContent).toBe("+0:01");
    expect(clock.style.color).toBe("var(--am-negative)");
  });

  it("shows up next with online state and this round's results", async () => {
    const ends = new Date(Date.now() + 60_000).toISOString();
    m.getCurrentMeeting.mockResolvedValue(
      sessionResponse(
        state({
          order: [3, 1, 2, 4, 5],
          turnIndex: 2,
          turnEndsAt: ends,
          moves: [{ id: "m1", teamId: 3, add: FRALEY, drop: HAYS }],
          turnsLog: [
            { teamId: 3, round: 1, result: "move", enteredBy: "owner", overMs: 0 },
            { teamId: 1, round: 1, result: "pass", enteredBy: "owner", overMs: 0 },
          ],
          passedThisRound: [1],
        }),
        { online: [4] },
      ),
    );
    render(
      <CommissionerLiveMeeting
        leagueId={7}
        periodId={9}
        teams={[...TEAMS, { id: 4, name: "Moneyball" }, { id: 5, name: "Big Unit" }]}
        onHandOff={vi.fn()}
      />,
    );
    const next = await screen.findByTestId("up-next");
    expect(within(next).getByText("Moneyball").closest("li")?.textContent).toContain("● Online");
    expect(within(next).getByText("Big Unit").closest("li")?.textContent).toContain("○ Not online");
    const round = screen.getByTestId("this-round");
    expect(within(round).getByText("+ Fraley − Hays")).toBeTruthy();
    expect(within(round).getByText("Passed")).toBeTruthy();
  });

  it("Enter for them submits for the team on the clock", async () => {
    const ends = new Date(Date.now() + 60_000).toISOString();
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnEndsAt: ends }), { version: 3 }));
    m.getChoices.mockResolvedValue(choices({ list: [FRALEY, CASAS], roster: [ALONSO, HAYS], activeCount: 23 }));
    m.submitMove.mockResolvedValue(sessionResponse(state({ turnIndex: 1, turnEndsAt: ends }), { version: 4 }));
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Enter for them" }));
    await waitFor(() => expect(m.getChoices).toHaveBeenCalledWith(55, 3));
    fireEvent.click(await screen.findByRole("button", { name: /Jake Fraley/ }));
    fireEvent.change(screen.getByLabelText("Drop"), { target: { value: String(HAYS.playerId) } });
    fireEvent.click(screen.getByRole("button", { name: "Submit move" }));
    await waitFor(() =>
      expect(m.submitMove).toHaveBeenCalledWith(55, { teamId: 3, addPlayerId: FRALEY.playerId, dropPlayerId: HAYS.playerId, version: 3 }),
    );
  });

  it("End meeting asks first", async () => {
    const ends = new Date(Date.now() + 60_000).toISOString();
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnEndsAt: ends }), { version: 6 }));
    m.endMeeting.mockResolvedValue(sessionResponse(state({ status: "ended" }), { version: 7 }));
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "End meeting" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("End the meeting?")).toBeTruthy();
    expect(within(sheet).getByText("Turns stop for everyone. You can't restart it for this period.")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.endMeeting).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "End meeting" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "End meeting" }));
    await waitFor(() => expect(m.endMeeting).toHaveBeenCalledWith(55, 6));
    await screen.findByText("Meeting over");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("another period's open meeting can be ended from here, after a confirm", async () => {
    const ends = new Date(Date.now() + 60_000).toISOString();
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ turnEndsAt: ends }), { version: 4, id: 44, periodId: 8 }));
    m.endMeeting.mockResolvedValue(sessionResponse(state({ status: "ended" }), { version: 5, id: 44, periodId: 8 }));
    renderScreen();
    expect(await screen.findByText("The Period 8 meeting is still open. End it before opening this one.")).toBeTruthy();
    expect(m.getMeetingPeriod).toHaveBeenCalledWith(7, 8);

    fireEvent.click(screen.getByRole("button", { name: "End that meeting" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("End the Period 8 meeting?")).toBeTruthy();
    expect(within(sheet).getByText("Turns stop for everyone. You can't restart it for Period 8.")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(m.endMeeting).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "End that meeting" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "End meeting" }));
    await waitFor(() => expect(m.endMeeting).toHaveBeenCalledWith(44, 4));
    // The ended session is history for another period, so this period can be opened now.
    expect(await screen.findByRole("button", { name: "Open the meeting" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("another period's open meeting falls back to generic copy without a name", async () => {
    m.getMeetingPeriod.mockRejectedValue(new Error("down"));
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ status: "setup" }), { periodId: 8 }));
    renderScreen();
    expect(await screen.findByText("A meeting for another period is still open. End it before opening this one.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "End that meeting" }));
    expect(within(screen.getByRole("dialog")).getByText("Turns stop for everyone. You can't restart it for that period.")).toBeTruthy();
  });

  it("setup copy says owners see the meeting once it starts", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ status: "setup" })));
    renderScreen();
    expect(await screen.findByText(/Owners see it once you start\./)).toBeTruthy();
  });

  it("Enter for them hides players already added earlier in the meeting", async () => {
    const ends = new Date(Date.now() + 60_000).toISOString();
    m.getCurrentMeeting.mockResolvedValue(
      sessionResponse(state({ turnEndsAt: ends, turnIndex: 1, moves: [{ id: "m1", teamId: 3, add: CASAS, drop: HAYS }] })),
    );
    m.getChoices.mockResolvedValue(choices({ list: [], roster: [ALONSO], activeCount: 23 }));
    m.searchFreeAgents.mockResolvedValue([CASAS, FRALEY]);
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Enter for them" }));
    fireEvent.change(await screen.findByLabelText("Search free agents"), { target: { value: "a" } });
    expect(await screen.findByRole("button", { name: /Jake Fraley/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Triston Casas/ })).toBeNull();
  });

  it("shows Connection lost while polls fail after the first load", async () => {
    vi.useFakeTimers();
    const ends = new Date(Date.now() + 600_000).toISOString();
    m.getCurrentMeeting.mockImplementation(async () => sessionResponse(state({ turnEndsAt: ends })));
    renderScreen();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByText("Connection lost. Retrying…")).toBeNull();
    m.getCurrentMeeting.mockRejectedValue(new Error("Failed to fetch"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText("Connection lost. Retrying…")).toBeTruthy();
    expect(screen.getByText("On the clock")).toBeTruthy();
    m.getCurrentMeeting.mockImplementation(async () => sessionResponse(state({ turnEndsAt: ends })));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.queryByText("Connection lost. Retrying…")).toBeNull();
  });

  it("titles the screen with the period name", async () => {
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(null, { version: 0 }));
    render(<CommissionerLiveMeeting leagueId={7} periodId={9} periodName="Period 9" teams={TEAMS} onHandOff={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Period 9 meeting" })).toBeTruthy();
  });

  it("disables the hand-off buttons while a hand-off is in flight", async () => {
    const moves = [{ id: "m1", teamId: 3, add: FRALEY, drop: HAYS }];
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ status: "ended", moves }), { version: 9 }));
    const { rerender } = render(<CommissionerLiveMeeting leagueId={7} periodId={9} teams={TEAMS} onHandOff={vi.fn()} handOffBusy />);
    expect(((await screen.findByRole("button", { name: "Review all moves" })) as HTMLButtonElement).disabled).toBe(true);
    m.getCurrentMeeting.mockResolvedValue(
      sessionResponse(state({ status: "ended", moves }), { version: 9, handedOffAt: "2026-11-15T03:00:00.000Z" }),
    );
    rerender(<CommissionerLiveMeeting leagueId={8} periodId={9} teams={TEAMS} onHandOff={vi.fn()} handOffBusy />);
    expect(((await screen.findByRole("button", { name: "Copy again" })) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ended: Review all moves hands the moves off", async () => {
    const moves = [{ id: "m1", teamId: 3, add: FRALEY, drop: HAYS }];
    m.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ status: "ended", moves }), { version: 9 }));
    const onHandOff = renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Review all moves" }));
    expect(onHandOff).toHaveBeenCalledWith(moves, 55);
  });

  it("ended and handed off: shows Moves sent to Review and Copy again", async () => {
    const moves = [{ id: "m1", teamId: 3, add: FRALEY, drop: HAYS }];
    m.getCurrentMeeting.mockResolvedValue(
      sessionResponse(state({ status: "ended", moves }), { version: 9, handedOffAt: "2026-11-15T03:00:00.000Z" }),
    );
    const onHandOff = renderScreen();
    await screen.findByText("Moves sent to Review");
    expect(screen.queryByRole("button", { name: "Review all moves" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy again" }));
    expect(onHandOff).toHaveBeenCalledWith(moves, 55);
  });
});
