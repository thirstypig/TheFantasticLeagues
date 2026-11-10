import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { TodayData } from "../useTodayData";
import type { MyPlayerToday, PlayerNewsTx, TodayStandingsRow } from "../todayModel";

const hooks = vi.hoisted(() => ({
  data: null as unknown,
  league: null as unknown,
  desktop: false,
}));
vi.mock("../useTodayData", () => ({ useTodayData: vi.fn(() => hooks.data) }));
vi.mock("../../../contexts/LeagueContext", () => ({ useLeague: () => hooks.league }));
vi.mock("../../../hooks/useMediaQuery", () => ({ useMediaQuery: () => hooks.desktop }));

import { useTodayData } from "../useTodayData";
import TodayPage from "../TodayPage";

const NOW = new Date(2026, 5, 14, 12, 0, 0); // Sun Jun 14 2026, local

const row = (teamId: number, teamName: string, periodPoints: number[]): TodayStandingsRow => ({
  teamId,
  teamName,
  teamCode: teamName.slice(0, 2).toUpperCase(),
  periodPoints,
  totalPoints: periodPoints.reduce((a, b) => a + b, 0),
});

// Me (id 1) is 3rd now, was 5th before the last period; Demolition is 2.5 ahead.
const baseRows = (): TodayStandingsRow[] => [
  row(10, "Dodger Dawgs", [30, 30, 6]),
  row(11, "Demolition", [25, 25, 11]),
  row(1, "Los Doyers", [20, 20, 18.5]),
  row(12, "RGing Sluggers", [23, 22, 5]),
  row(13, "Skunk Dogs", [22, 22, 5]),
  row(14, "Team F", [5, 5, 1]),
  row(15, "Team G", [4, 4, 1]),
  row(16, "Team H", [3, 3, 1]),
];
const periodNames = ["Period 6", "Period 7", "Period 8"];

const activePeriod = {
  id: 8, name: "Period 8", status: "active", startDate: "2026-06-08", endDate: "2026-06-18",
} as never;

const tx = (over: Partial<PlayerNewsTx>): PlayerNewsTx => ({
  id: 1,
  date: "2026-06-14",
  playerName: "Ronald Acuna",
  mlbId: 1,
  typeCode: "SC",
  description: "Atlanta Braves placed RF Ronald Acuna on the 10-day injured list. Left hamstring strain.",
  fromTeamAbbr: null,
  toTeamAbbr: null,
  fromLeague: null,
  toLeague: null,
  ...over,
});

const ok = <T,>(data: T) => ({ status: "ok" as const, data });

function setData(over: Partial<TodayData> = {}) {
  hooks.data = {
    standings: ok({ rows: baseRows(), periodNames }),
    periods: ok([activePeriod]),
    wirePeriod: ok(null),
    tonight: ok([]),
    news: ok([]),
    ...over,
  };
}

function setLeague(over: Record<string, unknown> = {}) {
  hooks.league = {
    leagueId: 20,
    leagues: [{ id: 20, name: "OGBA", season: 2026 }],
    currentLeagueName: "OGBA",
    currentSeason: 2026,
    myTeamId: 1,
    myTeamCode: "LD",
    myTeamResolved: true,
    ...over,
  };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  );

const player = (over: Partial<MyPlayerToday>): MyPlayerToday => ({
  playerName: "Freddie Freeman",
  mlbId: 1,
  mlbTeam: "LAD",
  posPrimary: "1B",
  gameTime: "2026-06-14T23:10:00Z",
  opponent: "SF",
  homeAway: "home",
  gameStatus: "PRE",
  gameStateDesc: "7:10",
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  hooks.desktop = false;
  setLeague();
  setData();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("TodayPage", () => {
  it("shows rank, trend and gap for an owner", () => {
    renderPage();
    expect(screen.getByText("You're 3rd")).toBeInTheDocument();
    expect(screen.getByText("▲ 2 since Period 7")).toBeInTheDocument();
    expect(screen.getByText(/2\.5 behind Demolition \(2nd\)/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("OGBA · Period 8 · 4 days left · Sun Jun 14")).toBeInTheDocument();
  });

  it("phone keeps the H1 for screen readers but hides it visually (the shell bar says Today)", () => {
    renderPage();
    const h1 = screen.getByRole("heading", { level: 1, name: "Today" });
    expect(h1).toHaveClass("today-sr-only");
  });

  it("does not claim a rank before scoring starts", () => {
    const rows = [row(10, "A", []), row(11, "B", []), row(1, "Me", [])];
    setData({ standings: ok({ rows, periodNames: [] }) });
    renderPage();
    expect(screen.queryByText(/You're 1st/)).toBeNull();
    expect(screen.getByText("Your rank shows up once scoring starts.")).toBeInTheDocument();
  });

  it("does not claim a rank when every team has 0 points", () => {
    const rows = [row(10, "A", [0]), row(11, "B", [0]), row(1, "Me", [0])];
    setData({ standings: ok({ rows, periodNames: ["Period 1"] }) });
    renderPage();
    expect(screen.queryByText(/You're 1st/)).toBeNull();
    expect(screen.getByText("Your rank shows up once scoring starts.")).toBeInTheDocument();
  });

  it("tonight chips: none for PRE, LIVE never doubled, FINAL", () => {
    setData({
      tonight: ok([
        player({ playerName: "Live Bare", mlbId: 1, gameStatus: "LIVE", gameStateDesc: "LIVE" }),
        player({ playerName: "Live Empty", mlbId: 2, gameStatus: "LIVE", gameStateDesc: "" }),
        player({ playerName: "Pre Game", mlbId: 3, gameStatus: "PRE", gameStateDesc: "7:10" }),
        player({ playerName: "Done", mlbId: 4, gameStatus: "FINAL", gameStateDesc: "FINAL" }),
      ]),
    });
    const { container } = renderPage();
    const chips = Array.from(container.querySelectorAll(".today-chip")).map((c) => c.textContent);
    expect(chips).toEqual(["LIVE", "LIVE", "FINAL"]);
    const section = screen.getByRole("region", { name: "Tonight" });
    expect(within(section).queryByText(/LIVE LIVE/)).toBeNull();
    expect(within(section).getByText("LAD vs SF · 7:10")).toBeInTheDocument();
    expect(within(section).queryByText(/· FINAL/)).toBeNull();
  });

  it("names the team above by its tied rank", () => {
    const rows = [row(10, "A", [50]), row(11, "B", [40]), row(12, "C", [40]), row(1, "Me", [30])];
    setData({ standings: ok({ rows, periodNames: ["Period 1"] }) });
    renderPage();
    expect(screen.getByText(/10 behind B \(2nd\)/)).toBeInTheDocument();
  });

  it("does not say the user has no team when their team is missing from standings", () => {
    setData({ standings: ok({ rows: baseRows().filter((r) => r.teamId !== 1), periodNames }) });
    renderPage();
    expect(screen.queryByText("You're not on a team in this league")).toBeNull();
    expect(screen.getByText("Your rank shows up once scoring starts.")).toBeInTheDocument();
  });

  it("calls useTodayData with null until the team is resolved", () => {
    setLeague({ myTeamResolved: false, myTeamId: null, myTeamCode: null });
    renderPage();
    expect(useTodayData).toHaveBeenCalledWith(null, false);
  });

  it("shows player news with a Leaves the NL tag", () => {
    setData({
      news: ok([
        tx({ id: 1 }),
        tx({
          id: 2, typeCode: "TR", playerName: "Ronald Acuna", description: "Traded.",
          fromTeamAbbr: "ARI", toTeamAbbr: "SEA", fromLeague: "NL", toLeague: "AL",
        }),
      ]),
    });
    renderPage();
    expect(screen.getByText("Your player news")).toBeInTheDocument();
    expect(screen.getByText("Past 7 days")).toBeInTheDocument();
    expect(screen.getByText("Acuna placed on the 10-day IL")).toBeInTheDocument();
    expect(screen.getByText("Leaves the NL")).toBeInTheDocument();
  });

  it("player news rows are not links or buttons", () => {
    setData({ news: ok([tx({ id: 1 }), tx({ id: 2, typeCode: "REL", description: "Released." })]) });
    renderPage();
    const section = screen.getByRole("region", { name: "Your player news" });
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
  });

  it("shows the quiet line when there is no news", () => {
    renderPage();
    expect(screen.getByText("No news on your players in the past 7 days.")).toBeInTheDocument();
  });

  it("hides news when the news request failed", () => {
    setData({ news: { status: "error" } });
    renderPage();
    expect(screen.queryByText("Your player news")).toBeNull();
    expect(screen.queryByText("No news on your players in the past 7 days.")).toBeNull();
  });

  it("shows the Wire List reminder linking to the wire list", () => {
    setData({
      wirePeriod: ok({
        id: 1, status: "PENDING", deadlineAt: new Date(NOW.getTime() + 5 * 3_600_000).toISOString(),
      } as never),
    });
    renderPage();
    const link = screen.getByRole("link", { name: /Adds & drops:.*Wire List locks/ });
    expect(link).toHaveAttribute("href", "/teams/LD/wire-list");
  });

  it("renders standings only when the user has no team", () => {
    setLeague({ myTeamId: null, myTeamCode: null });
    setData({ wirePeriod: ok(null), tonight: ok([]), news: ok([]) });
    renderPage();
    expect(screen.getByText("You're not on a team in this league")).toBeInTheDocument();
    expect(screen.getByText("Standings")).toBeInTheDocument();
    expect(screen.queryByText("Your player news")).toBeNull();
    expect(screen.queryByText("Tonight")).toBeNull();
    expect(screen.queryByText(/Adds & drops/)).toBeNull();
  });

  it("hides tonight without an active period", () => {
    setData({
      periods: ok([{ id: 8, name: "Period 8", status: "completed", startDate: "2026-06-08", endDate: "2026-06-13" } as never]),
      tonight: ok([player({})]),
    });
    renderPage();
    expect(screen.getByText(/Final · 3rd of 8/)).toBeInTheDocument();
    expect(screen.queryByText("Tonight")).toBeNull();
  });

  it("hides tonight when its request failed", () => {
    setData({ tonight: { status: "error" } });
    renderPage();
    expect(screen.queryByText("Tonight")).toBeNull();
  });

  it("tonight shows live first and the more count", () => {
    setData({
      tonight: ok([
        player({ playerName: "A Pre", mlbId: 1 }),
        player({ playerName: "B Pre", mlbId: 2 }),
        player({ playerName: "C Pre", mlbId: 3 }),
        player({ playerName: "D Pre", mlbId: 4 }),
        player({ playerName: "E Pre", mlbId: 5 }),
        player({
          playerName: "Pete Alonso", mlbId: 6, mlbTeam: "NYM", opponent: "ATL", homeAway: "away",
          gameStatus: "LIVE", gameStateDesc: "B6",
          line: { hitting: { AB: 1, H: 1, R: 0, HR: 1, RBI: 1, SB: 0 } },
        }),
      ]),
    });
    renderPage();
    const section = screen.getByRole("region", { name: "Tonight" });
    const names = within(section).getAllByTestId("tonight-name").map((n) => n.textContent);
    expect(names[0]).toMatch(/Pete Alonso/);
    expect(within(section).getAllByTestId("tonight-name")).toHaveLength(4);
    expect(within(section).getByText("LIVE B6")).toBeInTheDocument();
    expect(within(section).getByText(/NYM @ ATL · 1-1, HR, RBI/)).toBeInTheDocument();
    expect(within(section).getByText("2 more playing")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "All 6 ›" })).toHaveAttribute("href", "/teams/LD");
  });

  it("shows the quiet line when none of my players play today", () => {
    renderPage();
    expect(screen.getByText("No games for your players today.")).toBeInTheDocument();
  });

  it("standings highlight the user and add their row below the top 5", () => {
    const rows = baseRows();
    rows[2] = row(1, "Los Doyers", [1, 1, 1]); // drops to last
    setData({ standings: ok({ rows: rows.sort((a, b) => b.totalPoints - a.totalPoints), periodNames }) });
    renderPage();
    const section = screen.getByRole("region", { name: "Standings" });
    expect(within(section).getAllByTestId("standings-row")).toHaveLength(6);
    expect(within(section).getByText("Los Doyers (you)")).toBeInTheDocument();
    expect(within(section).queryByText("Team G")).toBeNull();
    expect(within(section).getByRole("link", { name: "See all ›" })).toHaveAttribute("href", "/season");
  });

  it("desktop shows every standings row", () => {
    hooks.desktop = true;
    renderPage();
    const section = screen.getByRole("region", { name: "Standings" });
    expect(within(section).getAllByTestId("standings-row")).toHaveLength(8);
    expect(within(section).getByRole("link", { name: "See all & by category ›" })).toBeInTheDocument();
    expect(screen.getByText(/OGBA 2026 · Period 8/)).toBeInTheDocument();
  });

  it("has no ad, needs-you, activity or depth chart sections", () => {
    setData({ news: ok([tx({})]), tonight: ok([player({})]) });
    renderPage();
    expect(screen.queryByText(/Needs you|League activity|Depth Chart|Fix/i)).toBeNull();
  });

  it("shows skeletons while sources load", () => {
    setData({ standings: { status: "loading" }, news: { status: "loading" } });
    const { container } = renderPage();
    expect(container.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThanOrEqual(2);
  });

  it("tells a user with no league how to find one", () => {
    setLeague({ leagueId: null, leagues: [], myTeamId: null, myTeamCode: null, myTeamResolved: false });
    setData({
      standings: { status: "loading" }, periods: { status: "loading" }, wirePeriod: { status: "loading" },
      tonight: { status: "loading" }, news: { status: "loading" },
    });
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("You're not in a league yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a league ›" })).toHaveAttribute("href", "/discover");
  });

  it("shows skeletons, not the no-league line, while leagues are still loading", () => {
    setLeague({ leagueId: null, leagues: [{ id: 20, name: "OGBA", season: 2026 }], myTeamResolved: false });
    setData({
      standings: { status: "loading" }, periods: { status: "loading" }, wirePeriod: { status: "loading" },
      tonight: { status: "loading" }, news: { status: "loading" },
    });
    renderPage();
    expect(screen.queryByText("You're not in a league yet.")).toBeNull();
    expect(document.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0);
  });
});
