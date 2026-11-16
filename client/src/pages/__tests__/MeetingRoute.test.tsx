import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const league = vi.hoisted(() => ({ leagueId: 7, leagueRules: { meeting: { live: "false" } } as Record<string, Record<string, string>> | null }));
vi.mock("../../contexts/LeagueContext", () => ({ useLeague: () => league }));
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: { isAdmin: false, memberships: [{ leagueId: "7", role: "COMMISSIONER" }] } } }),
}));
vi.mock("../../features/commissioner/pages/MeetingPage", () => ({ default: () => <div>TODAY MEETING PAGE</div> }));
vi.mock("../../features/commissioner/api", () => ({ getCommissionerOverview: vi.fn() }));
vi.mock("../../features/meeting/api", () => ({
  getCurrentMeeting: vi.fn(),
  getSeasonOrder: vi.fn(),
  markHandedOff: vi.fn(),
  getChoices: vi.fn(),
  searchFreeAgents: vi.fn(),
}));

import * as commissionerApi from "../../features/commissioner/api";
import * as meetingApi from "../../features/meeting/api";
import MeetingRoute from "../MeetingRoute";
import { draftKey } from "../../features/commissioner/lib/meetingDraft";
import { FRALEY, HAYS, CASAS, ALONSO, TEAMS, sessionResponse, state } from "../../features/meeting/__tests__/fixtures";

const c = vi.mocked(commissionerApi);
const mt = vi.mocked(meetingApi);

const MOVES = [{ id: "m1", teamId: 3, add: FRALEY, drop: HAYS }];

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/7/meeting/9"]}>
      <Routes>
        <Route path="/commissioner/:leagueId/meeting/:periodId" element={<MeetingRoute />} />
        <Route path="/commissioner/:leagueId/meeting/:periodId/review" element={<div>REVIEW STUB</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const stored = () => JSON.parse(localStorage.getItem(draftKey(7, 9)) as string);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  league.leagueId = 7;
  league.leagueRules = { meeting: { live: "true" } };
  c.getCommissionerOverview.mockResolvedValue({ league: { id: 7, name: "OGBA", season: 2026 }, teams: TEAMS } as any);
  mt.getSeasonOrder.mockResolvedValue([3, 1, 2]);
  mt.getCurrentMeeting.mockResolvedValue(sessionResponse(state({ status: "ended", moves: MOVES }), { version: 9 }));
  mt.markHandedOff.mockResolvedValue(
    sessionResponse(state({ status: "ended", moves: MOVES }), { version: 9, handedOffAt: "2026-11-15T03:00:00.000Z" }),
  );
});

describe("MeetingRoute", () => {
  it("live off renders today's meeting page", async () => {
    league.leagueRules = { meeting: { live: "false" } };
    renderRoute();
    expect(await screen.findByText("TODAY MEETING PAGE")).toBeTruthy();
    expect(mt.getCurrentMeeting).not.toHaveBeenCalled();
  });

  it("missing meeting rules render today's meeting page", async () => {
    league.leagueRules = {};
    renderRoute();
    expect(await screen.findByText("TODAY MEETING PAGE")).toBeTruthy();
  });

  it("live on renders the live screen", async () => {
    renderRoute();
    expect(await screen.findByRole("button", { name: "Review all moves" })).toBeTruthy();
    expect(screen.queryByText("TODAY MEETING PAGE")).toBeNull();
  });

  it("Review all moves writes the draft and navigates", async () => {
    renderRoute();
    fireEvent.click(await screen.findByRole("button", { name: "Review all moves" }));
    expect(await screen.findByText("REVIEW STUB")).toBeTruthy();
    expect(stored()).toEqual({ leagueId: 7, periodId: 9, moves: MOVES, marks: {}, selectedTeamId: null });
    expect(mt.markHandedOff).toHaveBeenCalledWith(55);
  });

  it("existing local draft asks before replacing", async () => {
    const old = { leagueId: 7, periodId: 9, moves: [{ id: "x", teamId: 1, add: CASAS, drop: ALONSO }], marks: { 2: "passed" }, selectedTeamId: 1 };
    localStorage.setItem(draftKey(7, 9), JSON.stringify(old));
    renderRoute();
    fireEvent.click(await screen.findByRole("button", { name: "Review all moves" }));
    expect(await screen.findByText("Replace the moves already in Review?")).toBeTruthy();
    expect(stored()).toEqual(old);
    expect(mt.markHandedOff).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Replace the moves already in Review?")).toBeNull();
    expect(stored()).toEqual(old);

    fireEvent.click(screen.getByRole("button", { name: "Review all moves" }));
    fireEvent.click(await screen.findByRole("button", { name: "Replace them" }));
    expect(await screen.findByText("REVIEW STUB")).toBeTruthy();
    expect(stored().moves).toEqual(MOVES);
    await waitFor(() => expect(mt.markHandedOff).toHaveBeenCalledWith(55));
  });
});
