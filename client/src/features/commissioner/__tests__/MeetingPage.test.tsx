import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = vi.hoisted(() => ({ user: { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] } as any }));
vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => ({ me: { user: auth.user } }) }));

vi.mock("../api", () => ({
  getCommissionerOverview: vi.fn(),
  getLeaguePeriods: vi.fn(),
  getRosterCheck: vi.fn(),
  getCommissionerRosters: vi.fn(),
  searchFreeAgents: vi.fn(),
  previewMove: vi.fn(),
}));

import * as api from "../api";
import MeetingPage from "../pages/MeetingPage";
import { draftKey, emptyDraft } from "../lib/meetingDraft";
import type { MeetingDraft } from "../lib/meetingDraft";

const m = vi.mocked(api);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/20/meeting/9"]}>
      <Routes>
        <Route path="/commissioner/:leagueId/meeting/:periodId" element={<MeetingPage />} />
        <Route path="/commissioner/:leagueId/meeting/:periodId/review" element={<div>REVIEW STUB</div>} />
        <Route path="/commissioner/:leagueId/rosters" element={<div>ROSTERS STUB</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const P8 = { id: 8, name: "Period 8", startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-06-14T00:00:00.000Z", status: "completed" };
const P9 = { id: 9, name: "Period 9", startDate: "2026-06-15T00:00:00.000Z", endDate: "2026-06-28T00:00:00.000Z", status: "pending" };

const FRALEY = { playerId: 101, name: "Jake Fraley", pos: "OF", mlbTeam: "CIN", mlbId: 641584 };
const CASAS = { playerId: 102, name: "Triston Casas", pos: "1B", mlbTeam: "BOS", mlbId: 671213 };
const ALONSO = { playerId: 41, name: "Pete Alonso", pos: "1B", mlbTeam: null, mlbId: 624413 };
const PHAM = { playerId: 51, name: "Tommy Pham", pos: "OF", mlbTeam: null, mlbId: null };

function seed(d: MeetingDraft) {
  localStorage.setItem(draftKey(20, 9), JSON.stringify(d));
}
function stored(): MeetingDraft {
  return JSON.parse(localStorage.getItem(draftKey(20, 9)) as string);
}
const mv = (id: string, teamId: number, add: any, drop: any) => ({ id, teamId, add, drop });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.user = { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] };
  m.getCommissionerOverview.mockResolvedValue({
    league: { id: 20, name: "OGBA", season: 2026 },
    teams: [{ id: 4, name: "Skunk Dogs" }, { id: 1, name: "Black Sox" }, { id: 2, name: "Bombers" }],
  } as any);
  m.getLeaguePeriods.mockResolvedValue([P8, P9]);
  m.getRosterCheck.mockResolvedValue({
    cap: 23,
    teams: [
      { teamId: 1, teamName: "Black Sox", activeCount: 23, over: false },
      { teamId: 2, teamName: "Bombers", activeCount: 23, over: false },
      { teamId: 4, teamName: "Skunk Dogs", activeCount: 23, over: false },
    ],
  });
  m.getCommissionerRosters.mockResolvedValue([
    { id: 1, teamId: 4, assignedPosition: "1B", player: { id: 41, name: "Pete Alonso", posPrimary: "1B", mlbId: 624413 }, price: 1 },
    { id: 2, teamId: 4, assignedPosition: "IL", player: { id: 42, name: "Hurt Guy", posPrimary: "P", mlbId: 1 }, price: 1 },
    { id: 3, teamId: 4, assignedPosition: "OF", player: { id: 43, name: "Bench Joe", posPrimary: "OF", mlbId: 2 }, price: 1 },
    { id: 4, teamId: 2, assignedPosition: "OF", player: { id: 51, name: "Tommy Pham", posPrimary: "OF" }, price: 1 },
  ] as any);
  m.searchFreeAgents.mockResolvedValue([FRALEY, CASAS]);
  m.previewMove.mockResolvedValue({ ok: true } as any);
});

describe("MeetingPage", () => {
  it("restores a saved draft: moves, marks and the selected team", async () => {
    seed({
      ...emptyDraft(20, 9),
      moves: [mv("a", 4, FRALEY, ALONSO), mv("b", 2, CASAS, PHAM)],
      marks: { 1: "passed" },
      selectedTeamId: 4,
    });
    renderPage();
    expect(await screen.findByText("Skunk Dogs · 23 / 23")).toBeTruthy();
    expect(screen.getByText("+ Jake Fraley")).toBeTruthy();
    expect(screen.getByText("− Pete Alonso")).toBeTruthy();
    const rows = screen.getAllByTestId("meeting-team-row");
    expect(within(rows[0]).getByText("Black Sox")).toBeTruthy();
    expect(within(rows[0]).getByText("Passed")).toBeTruthy();
    expect(within(rows[1]).getByText("Bombers")).toBeTruthy();
    expect(within(rows[1]).getByText("1 ✓")).toBeTruthy();
    expect(screen.getByText(/Dated Mon Jun 15 · 3 of 3 teams done · nothing saved until you review/)).toBeTruthy();
    expect(screen.getByText("Period 9 moves")).toBeTruthy();
  });

  it("builds a complete move from search plus a drop and previews it once", async () => {
    seed({ ...emptyDraft(20, 9), selectedTeamId: 4 });
    renderPage();
    const input = await screen.findByPlaceholderText("Add: search NL free agents");
    fireEvent.change(input, { target: { value: "fral" } });
    fireEvent.click(await screen.findByText("Jake Fraley"));
    expect(m.searchFreeAgents).toHaveBeenCalledWith(20, "fral");
    expect(m.previewMove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Drop: choose a player ›"));
    fireEvent.click(within(screen.getByTestId("drop-options")).getByText("Pete Alonso"));
    await waitFor(() => expect(m.previewMove).toHaveBeenCalledTimes(1));
    expect(m.previewMove).toHaveBeenCalledWith(20, 4, 101, 41);
    expect(await screen.findByText("✓ Roster stays at 23 / 23")).toBeTruthy();
    expect(stored().moves[0].add?.playerId).toBe(101);
    expect(stored().moves[0].drop?.playerId).toBe(41);
    expect(screen.getByText("Tonight's moves (1)")).toBeTruthy();
  });

  it("shows the server's message on the card when the preview fails", async () => {
    m.previewMove.mockResolvedValue({ ok: false, error: "Jake Fraley is on Bombers", code: "OWNERSHIP_CONFLICT" } as any);
    seed({ ...emptyDraft(20, 9), selectedTeamId: 4, moves: [mv("a", 4, FRALEY, null)] });
    renderPage();
    fireEvent.click(await screen.findByText("Drop: choose a player ›"));
    fireEvent.click(within(screen.getByTestId("drop-options")).getByText("Pete Alonso"));
    expect(await screen.findByText("Jake Fraley is on Bombers")).toBeTruthy();
    expect(stored().moves[0].error).toBe("Jake Fraley is on Bombers");
    expect(screen.queryByText(/Roster stays at/)).toBeNull();
  });

  it("drop chooser omits IL players and players already being dropped", async () => {
    seed({
      ...emptyDraft(20, 9),
      selectedTeamId: 4,
      moves: [mv("a", 4, FRALEY, ALONSO), mv("b", 4, null, null)],
    });
    renderPage();
    const chooseButtons = await screen.findAllByText("Drop: choose a player ›");
    fireEvent.click(chooseButtons[0]);
    const opts = within(screen.getByTestId("drop-options"));
    expect(opts.getByText("Bench Joe")).toBeTruthy();
    expect(opts.queryByText("Hurt Guy")).toBeNull();
    expect(opts.queryByText("Pete Alonso")).toBeNull();
  });

  it("No moves marks the team Passed and returns to the list", async () => {
    seed({ ...emptyDraft(20, 9), selectedTeamId: 4 });
    renderPage();
    fireEvent.click(await screen.findByText("No moves"));
    await waitFor(() => expect(stored().marks[4]).toBe("passed"));
    expect(stored().selectedTeamId).toBeNull();
    const row = screen.getAllByTestId("meeting-team-row").find((r) => within(r).queryByText("Skunk Dogs"))!;
    expect(within(row).getByText("Passed")).toBeTruthy();
  });

  it("flags a free agent added by two teams and hides it from search", async () => {
    seed({
      ...emptyDraft(20, 9),
      selectedTeamId: 4,
      moves: [mv("a", 2, FRALEY, PHAM), mv("b", 4, FRALEY, ALONSO), mv("c", 4, null, null)],
    });
    renderPage();
    expect(await screen.findByText("Already added by Bombers tonight")).toBeTruthy();
    const inputs = screen.getAllByPlaceholderText("Add: search NL free agents");
    fireEvent.change(inputs[0], { target: { value: "a" } });
    expect(await screen.findByText("Triston Casas")).toBeTruthy();
    expect(within(screen.getByTestId("search-results")).queryByText("Jake Fraley")).toBeNull();
  });

  it("refuses a period that already started", async () => {
    m.getLeaguePeriods.mockResolvedValue([P8, { ...P9, status: "active" }]);
    renderPage();
    expect(await screen.findByText("This period has already started. Meeting moves are for the next period.")).toBeTruthy();
    expect(screen.queryByText("No moves")).toBeNull();
    expect(screen.getByText("‹ Rosters").closest("a")?.getAttribute("href")).toBe("/commissioner/20/rosters");
  });

  it("writes localStorage on every change", async () => {
    seed({ ...emptyDraft(20, 9), selectedTeamId: 4 });
    renderPage();
    fireEvent.click(await screen.findByText("+ Another move"));
    await waitFor(() => expect(stored().moves.filter((x) => x.teamId === 4)).toHaveLength(2));
  });

  it("keeps working when storage throws", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    try {
      renderPage();
      fireEvent.click(await screen.findByText("Skunk Dogs"));
      fireEvent.click(await screen.findByText("+ Another move"));
      expect(screen.getByText("Move 2")).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("Review all moves is disabled until a move is complete, then links to review", async () => {
    seed({ ...emptyDraft(20, 9), selectedTeamId: 4 });
    const { unmount } = renderPage();
    const btn = await screen.findByText("Review all moves");
    expect(btn.closest("a")).toBeNull();
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    unmount();
    seed({ ...emptyDraft(20, 9), selectedTeamId: 4, moves: [mv("a", 4, FRALEY, ALONSO)] });
    renderPage();
    const link = (await screen.findByText("Review all moves")).closest("a")!;
    expect(link.getAttribute("href")).toBe("/commissioner/20/meeting/9/review");
    fireEvent.click(link);
    expect(await screen.findByText("REVIEW STUB")).toBeTruthy();
  });
});
