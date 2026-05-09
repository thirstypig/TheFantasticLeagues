import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileTeam } from "../pages/MobileTeam";
import { getTeams, getTeamRosterHub } from "../../features/teams/api";
import { getSeasonStandings } from "../../api";

vi.mock("../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20, myTeamId: 101 }),
}));

vi.mock("../../features/teams/api", () => ({
  getTeams: vi.fn(),
  getTeamRosterHub: vi.fn(),
}));

vi.mock("../../api", () => ({
  getSeasonStandings: vi.fn(),
}));

const SAMPLE_HUB = {
  team: { id: 101, leagueId: 20, name: "Los Doyers", owner: "James", budget: 48 },
  period: null,
  hitters: [
    { rosterId: 1, playerId: 1, mlbId: 100, playerName: "Mookie Betts", posPrimary: "OF", position: "OF", assignedPosition: "OF", isPitcher: false, mlbTeam: "LAD", AVG: 0.305, HR: 30, RBI: 90, SB: 12 },
    { rosterId: 2, playerId: 2, mlbId: 200, playerName: "Will Smith", posPrimary: "C", position: "C", assignedPosition: "C", isPitcher: false, mlbTeam: "LAD", AVG: 0.265, HR: 20, RBI: 75, SB: 1 },
  ],
  pitchers: [
    { rosterId: 10, playerId: 10, mlbId: 1000, playerName: "Tyler Glasnow", posPrimary: "SP", position: "SP", assignedPosition: "SP", isPitcher: true, mlbTeam: "LAD", W: 12, K: 200, ERA: 3.45, WHIP: 1.15 },
  ],
  ilPlayers: [
    { rosterId: 20, playerId: 20, mlbId: 2000, playerName: "Clayton Kershaw", posPrimary: "SP", position: "SP", assignedPosition: "IL", isPitcher: true, mlbTeam: "LAD", W: 4, K: 60, ERA: 2.85, WHIP: 1.02 },
  ],
  droppedPlayers: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeams).mockResolvedValue([
    { id: 101, name: "Los Doyers", code: "LDY", budget: 48 } as any,
    { id: 202, name: "Demolition Lumber Co.", code: "DLC", budget: 40 } as any,
  ]);
  vi.mocked(getTeamRosterHub).mockResolvedValue(SAMPLE_HUB as any);
  vi.mocked(getSeasonStandings).mockResolvedValue({
    periodIds: [1, 2],
    rows: [
      { teamId: 101, teamCode: "LDY", teamName: "Los Doyers", periodPoints: [30, 28] },
      { teamId: 202, teamCode: "DLC", teamName: "Demolition Lumber Co.", periodPoints: [35, 31] },
    ],
  } as any);
});

function renderTeam(teamCode = "LDY") {
  return render(
    <MemoryRouter>
      <MobileTeam teamCode={teamCode} />
    </MemoryRouter>,
  );
}

describe("MobileTeam (read-only)", () => {
  it("resolves the team code, fetches the hub, and renders hitter rows", async () => {
    renderTeam();
    expect(await screen.findByText("Mookie Betts")).toBeInTheDocument();
    expect(screen.getByText("Will Smith")).toBeInTheDocument();
    // Pitcher should not be in the hitters tab
    expect(screen.queryByText("Tyler Glasnow")).not.toBeInTheDocument();
  });

  it("switches to the pitchers tab when clicked", async () => {
    renderTeam();
    await screen.findByText("Mookie Betts");
    fireEvent.click(screen.getByRole("tab", { name: "Pitchers" }));
    await screen.findByText("Tyler Glasnow");
    expect(screen.queryByText("Mookie Betts")).not.toBeInTheDocument();
    // Pitcher headers
    expect(screen.getByText("WHIP")).toBeInTheDocument();
  });

  it("exposes an IL tab when the roster has injured players", async () => {
    renderTeam();
    const ilTab = await screen.findByRole("tab", { name: "IL" });
    fireEvent.click(ilTab);
    await screen.findByText("Clayton Kershaw");
  });

  it("renders the hero strip with team name and standings rank", async () => {
    renderTeam();
    await screen.findByText("Mookie Betts");
    // The team name appears in both topbar and hero
    expect(screen.getAllByText("Los Doyers").length).toBeGreaterThanOrEqual(2);
    // Rank: Demolition Lumber Co. is 1st (66 pts) so LDY is 2nd (58 pts)
    expect(screen.getByText(/2nd place/)).toBeInTheDocument();
  });

  it("shows an error when the team code is not found in the league", async () => {
    renderTeam("ZZZ");
    await waitFor(() => {
      expect(screen.getByText(/not found in this league/)).toBeInTheDocument();
    });
  });

  it("hides the IL tab when no players are on IL", async () => {
    vi.mocked(getTeamRosterHub).mockResolvedValueOnce({
      ...SAMPLE_HUB,
      ilPlayers: [],
    } as any);
    renderTeam();
    await screen.findByText("Mookie Betts");
    expect(screen.queryByRole("tab", { name: "IL" })).not.toBeInTheDocument();
  });
});
