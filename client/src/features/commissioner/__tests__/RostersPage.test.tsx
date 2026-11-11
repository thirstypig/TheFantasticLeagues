import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = vi.hoisted(() => ({ user: { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] } as any }));
vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => ({ me: { user: auth.user } }) }));

vi.mock("../api", () => ({
  getCommissionerOverview: vi.fn(),
  getLeaguePeriods: vi.fn(),
  getRosterCheck: vi.fn(),
  getCommissionerRosters: vi.fn(),
  getGhostIlSummary: vi.fn(),
}));

import * as api from "../api";
import RostersPage from "../pages/RostersPage";
import { draftKey } from "../lib/meetingDraft";

const m = vi.mocked(api);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/20/rosters"]}>
      <Routes>
        <Route path="/commissioner/:leagueId/rosters" element={<RostersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const P8 = { id: 8, name: "Period 8", startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-06-14T00:00:00.000Z", status: "completed" };
const P9 = { id: 9, name: "Period 9", startDate: "2026-06-15T00:00:00.000Z", endDate: "2026-06-28T00:00:00.000Z", status: "pending" };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.user = { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-10T15:00:00.000Z"));
  m.getCommissionerOverview.mockResolvedValue({
    league: { id: 20, name: "OGBA", season: 2026 },
    teams: [{ id: 3, name: "Los Doyers" }, { id: 1, name: "Black Sox" }, { id: 2, name: "Demolition Lumber" }],
  } as any);
  m.getLeaguePeriods.mockResolvedValue([P8, P9]);
  m.getRosterCheck.mockResolvedValue({
    cap: 23,
    teams: [
      { teamId: 1, teamName: "Black Sox", activeCount: 23, over: false },
      { teamId: 2, teamName: "Demolition Lumber", activeCount: 23, over: false },
      { teamId: 3, teamName: "Los Doyers", activeCount: 24, over: true },
    ],
  });
  m.getCommissionerRosters.mockResolvedValue([
    { id: 1, teamId: 3, assignedPosition: "IL", player: { id: 1, name: "A", posPrimary: "P" }, price: 1 },
    { id: 2, teamId: 3, assignedPosition: "IL", player: { id: 2, name: "B", posPrimary: "P" }, price: 1 },
    { id: 3, teamId: 3, assignedPosition: "OF", player: { id: 3, name: "C", posPrimary: "OF" }, price: 1 },
  ] as any);
  m.getGhostIlSummary.mockResolvedValue({
    teams: [{ teamId: 2, teamName: "Demolition Lumber", teamCode: "DL", ghosts: [{ rosterId: 9, playerId: 9, playerName: "Kyle Gallen", currentMlbStatus: "IL" }] }],
    totalTeamsWithGhosts: 1,
    totalGhosts: 1,
  });
});
afterEach(() => vi.useRealTimers());

describe("RostersPage", () => {
  it("shows the meeting card with exact copy and a link to the meeting", async () => {
    renderPage();
    expect(await screen.findByText("Between Period 8 and 9")).toBeTruthy();
    expect(screen.getByText("Period 9 meeting moves")).toBeTruthy();
    expect(screen.getByText(/Enter every owner’s adds and drops, review, then save them all at once\. Dated Mon Jun 15\./)).toBeTruthy();
    const btn = screen.getByText("Enter meeting moves").closest("a");
    expect(btn?.getAttribute("href")).toBe("/commissioner/20/meeting/9");
  });

  it("hides the meeting card while a period is being played", async () => {
    m.getLeaguePeriods.mockResolvedValue([{ ...P8, status: "active", endDate: "2026-06-30T00:00:00.000Z" }, P9]);
    renderPage();
    await screen.findByText("Teams · A to Z");
    await screen.findAllByText("Black Sox");
    expect(screen.queryByText("Period 9 meeting moves")).toBeNull();
  });

  it("asks to set up the next period when there is none", async () => {
    m.getLeaguePeriods.mockResolvedValue([P8]);
    renderPage();
    expect(await screen.findByText("Set up the next period first")).toBeTruthy();
    expect(screen.getByText("Season and periods ›").closest("a")?.getAttribute("href")).toBe("/commissioner/20/season");
  });

  it("lists teams A to Z with roster counts and row links", async () => {
    renderPage();
    const phone = await screen.findByTestId("rosters-phone");
    await within(phone).findByText("Black Sox");
    const rows = within(phone).getAllByTestId("team-row");
    expect(rows.map((r) => r.querySelector("b")?.textContent)).toEqual(["Black Sox", "Demolition Lumber", "Los Doyers"]);
    expect(within(rows[0]).getByText("23 / 23")).toBeTruthy();
    expect(rows[0].getAttribute("href")).toBe("/commissioner/20/rosters/1");
    expect(rows[2].getAttribute("href")).toBe("/commissioner/20/rosters/3");
  });

  it("flags over-cap and ghost IL players with exact copy", async () => {
    renderPage();
    const phone = await screen.findByTestId("rosters-phone");
    await within(phone).findByText("Black Sox");
    expect(within(phone).getByText("1 over")).toBeTruthy();
    expect(within(phone).getByText("Gallen back from MLB IL")).toBeTruthy();
    expect(within(phone).getByText("Fix")).toBeTruthy();
    const desk = screen.getByTestId("rosters-desk");
    expect(within(desk).getByText("1 over the limit")).toBeTruthy();
    expect(within(desk).getByText("Gallen back from MLB IL")).toBeTruthy();
    const doyers = within(desk).getAllByTestId("team-tr")[2];
    expect(within(doyers).getByText("2")).toBeTruthy(); // IL count
  });

  it("shows Continue meeting moves (2) when the draft has two complete moves", async () => {
    const pl = { playerId: 1, name: "X", pos: "OF", mlbTeam: null, mlbId: null };
    localStorage.setItem(draftKey(20, 9), JSON.stringify({
      leagueId: 20, periodId: 9, marks: {}, selectedTeamId: null,
      moves: [
        { id: "a", teamId: 1, add: pl, drop: pl },
        { id: "b", teamId: 2, add: pl, drop: pl },
        { id: "c", teamId: 2, add: pl, drop: null },
      ],
    }));
    renderPage();
    expect(await screen.findByText("Continue meeting moves (2)")).toBeTruthy();
  });

  it("links to preseason tools", async () => {
    renderPage();
    expect((await screen.findByText("Preseason tools ›")).closest("a")?.getAttribute("href")).toBe("/commissioner/20/roster-setup");
  });

  it("non-commissioners see only the notice", () => {
    auth.user = { isAdmin: false, memberships: [{ leagueId: "20", role: "OWNER" }] };
    renderPage();
    expect(screen.getByText("Commissioners only.")).toBeTruthy();
    expect(m.getCommissionerOverview).not.toHaveBeenCalled();
  });

  it("step start with a completed Period 8 still says Between Period 8 and 9", async () => {
    vi.setSystemTime(new Date("2026-06-16T15:00:00.000Z"));
    renderPage();
    expect(await screen.findByText("Between Period 8 and 9")).toBeTruthy();
  });

  it("phone row shows the over flag and ghost flags together", async () => {
    m.getGhostIlSummary.mockResolvedValue({
      teams: [{ teamId: 3, teamName: "Los Doyers", teamCode: "LD", ghosts: [{ rosterId: 9, playerId: 9, playerName: "Kyle Gallen", currentMlbStatus: "IL" }] }],
      totalTeamsWithGhosts: 1, totalGhosts: 1,
    });
    renderPage();
    const phone = await screen.findByTestId("rosters-phone");
    await within(phone).findByText("Black Sox");
    const doyers = within(phone).getAllByTestId("team-row")[2];
    expect(within(doyers).getByText("1 over")).toBeTruthy();
    expect(within(doyers).getByText("Gallen back from MLB IL")).toBeTruthy();
    expect(within(doyers).getByText("Fix")).toBeTruthy();
  });

  it("applies over and IL counts to the right team only", async () => {
    renderPage();
    const phone = await screen.findByTestId("rosters-phone");
    await within(phone).findByText("Black Sox");
    const rows = within(phone).getAllByTestId("team-row");
    expect(within(rows[0]).queryByText(/over/)).toBeNull();
    expect(within(rows[1]).queryByText(/over/)).toBeNull();
    const trs = within(screen.getByTestId("rosters-desk")).getAllByTestId("team-tr");
    const ilCells = trs.map((r) => r.querySelectorAll("td")[2].textContent);
    expect(ilCells).toEqual(["0", "0", "2"]);
  });

  it("roster-check failure still lists teams with dashes and a note", async () => {
    m.getRosterCheck.mockRejectedValue(new Error("x"));
    renderPage();
    const phone = await screen.findByTestId("rosters-phone");
    await within(phone).findByText("Black Sox");
    expect(within(phone).getAllByTestId("team-row")).toHaveLength(3);
    expect(within(phone).getAllByText("–")).toHaveLength(2);
    expect(screen.getByText("Couldn’t check roster sizes.")).toBeTruthy();
  });

  it("ghost-IL failure shows a note", async () => {
    m.getGhostIlSummary.mockRejectedValue(new Error("x"));
    renderPage();
    expect(await screen.findByText("Couldn’t check IL status.")).toBeTruthy();
    expect(screen.getAllByText("Black Sox").length).toBeGreaterThan(0);
  });

  it("rosters failure shows a dash in the IL column", async () => {
    m.getCommissionerRosters.mockRejectedValue(new Error("x"));
    renderPage();
    await screen.findAllByText("Black Sox");
    const trs = within(screen.getByTestId("rosters-desk")).getAllByTestId("team-tr");
    expect(trs.map((r) => r.querySelectorAll("td")[2].textContent)).toEqual(["–", "–", "–"]);
  });

  it("overview failure shows the error card", async () => {
    m.getCommissionerOverview.mockRejectedValue(new Error("x"));
    renderPage();
    expect(await screen.findByText("Couldn’t load teams.")).toBeTruthy();
  });
});
