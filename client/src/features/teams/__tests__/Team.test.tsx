import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mock API module
vi.mock("../../../api", () => ({
  getPlayerSeasonStats: vi.fn(),
  getTeamDetails: vi.fn(),
  getTeams: vi.fn(),
}));

// Mock LeagueContext
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1, outfieldMode: "OF", seasonStatus: "IN_SEASON" }),
}));

// Mock AuthProvider
vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ isCommissioner: () => false, isAdmin: false }),
}));

// Mock ogbaTeams
vi.mock("../../../lib/ogbaTeams", () => ({
  getOgbaTeamName: (code: string) => {
    const names: Record<string, string> = { ACES: "Aces" };
    return names[code] || "";
  },
}));

// Mock playerDisplay
vi.mock("../../../lib/playerDisplay", () => ({
  isPitcher: (p: any) => p.is_pitcher === true || p.group === "P",
  normalizePosition: (p: string) => p,
  formatAvg: (v: any) => (v != null ? String(v) : "—"),
  getMlbTeamAbbr: (p: any) => p.mlb_team_abbr || p.mlb_team || "—",
  sortByPosition: () => 0,
}));

// Mock sportConfig
vi.mock("../../../lib/sportConfig", () => ({
  mapPosition: (pos: string) => pos,
  positionToSlots: (pos: string) => [pos],
  POS_SCORE: {
    C: 0, "1B": 1, "2B": 2, "3B": 3, SS: 4, MI: 5, CM: 6, OF: 7, SP: 8, RP: 9, P: 10, DH: 11,
  } as Record<string, number>,
}));

// Mock PlayerDetailModal
vi.mock("../../../components/shared/PlayerDetailModal", () => ({
  default: ({ player, onClose }: any) =>
    player ? <div data-testid="player-modal">{player.player_name}</div> : null,
}));

// Mock PlayerExpandedRow (avoid deep dependency tree)
vi.mock("../../auction/components/PlayerExpandedRow", () => ({
  default: () => <tr data-testid="expanded-row"><td>expanded</td></tr>,
}));


import { getPlayerSeasonStats, getTeamDetails, getTeams } from "../../../api";
// Tests target the legacy Team page (trade asset selector, watchlist
// stars, weekly insights history, period roster viewer) which lives
// at /teams/:teamCode/classic post PR #139 and is exported as TeamLegacy.
// The Aurora Team page (current /teams/:teamCode) is a thin port — its
// tests would assert different copy. When Aurora gets these features,
// port these tests to the new component.
import Team from "../pages/TeamLegacy";

const mockDbTeams = [
  { id: 10, code: "ACES", name: "Aces" },
];

const mockRoster = [
  { mlbId: 1, name: "Mike Trout", posPrimary: "CF", posList: "CF/LF", mlbTeam: "LAA", price: 45 },
  { mlbId: 2, name: "Mookie Betts", posPrimary: "RF", posList: "RF/2B", mlbTeam: "LAD", price: 40 },
  { mlbId: 3, name: "Gerrit Cole", posPrimary: "SP", posList: "SP", mlbTeam: "NYY", price: 35 },
];

const mockCsvRows = [
  { mlb_id: "1", player_name: "Mike Trout", ogba_team_code: "ACES", positions: "CF", group: "H", is_pitcher: false, R: 80, HR: 30, RBI: 90, SB: 10, AVG: 0.3, mlb_team_abbr: "LAA" },
  { mlb_id: "2", player_name: "Mookie Betts", ogba_team_code: "ACES", positions: "RF", group: "H", is_pitcher: false, R: 95, HR: 25, RBI: 75, SB: 15, AVG: 0.28, mlb_team_abbr: "LAD" },
  { mlb_id: "3", player_name: "Gerrit Cole", ogba_team_code: "ACES", positions: "SP", group: "P", is_pitcher: true, W: 15, SV: 0, K: 200, IP: 190, ERA: 2.95, WHIP: 1.05, mlb_team_abbr: "NYY" },
];

function renderTeamPage(teamCode: string = "ACES", hash: string = "") {
  return render(
    <MemoryRouter initialEntries={[`/teams/${teamCode}${hash}`]}>
      <Routes>
        <Route path="/teams/:teamCode" element={<Team />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeams).mockResolvedValue(mockDbTeams as any);
  vi.mocked(getTeamDetails).mockResolvedValue({ currentRoster: mockRoster } as any);
  vi.mocked(getPlayerSeasonStats).mockResolvedValue(mockCsvRows as any);
});

describe("Team", () => {
  it("renders team name in header", async () => {
    renderTeamPage();

    await waitFor(() => {
      expect(screen.getByText("Aces")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    vi.mocked(getTeams).mockReturnValue(new Promise(() => {}));
    renderTeamPage();
    expect(screen.getByText("Loading roster…")).toBeInTheDocument();
  });

  it("renders hitter stats table by default", async () => {
    renderTeamPage();

    await waitFor(() => {
      expect(screen.getByText("Mike Trout")).toBeInTheDocument();
      expect(screen.getByText("Mookie Betts")).toBeInTheDocument();
    });

    // Pitcher should NOT be in hitters table
    expect(screen.queryByText("Gerrit Cole")).not.toBeInTheDocument();
  });

  it("shows roster count summary", async () => {
    renderTeamPage();

    await waitFor(() => {
      // "Roster: 2 Hitters • 1 Pitchers"
      expect(screen.getByText(/2 Hitters/)).toBeInTheDocument();
      expect(screen.getByText(/1 Pitchers/)).toBeInTheDocument();
    });
  });

  it("renders pitchers table when hash is #pitchers", async () => {
    renderTeamPage("ACES", "#pitchers");

    await waitFor(() => {
      expect(screen.getByText("Gerrit Cole")).toBeInTheDocument();
    });

    // Hitters should NOT be in pitchers table
    expect(screen.queryByText("Mike Trout")).not.toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    vi.mocked(getTeams).mockRejectedValue(new Error("Network failure"));

    renderTeamPage();

    await waitFor(() => {
      expect(screen.getByText("Network failure")).toBeInTheDocument();
    });
  });

  it("shows empty hitters message when team has no hitters", async () => {
    vi.mocked(getTeamDetails).mockResolvedValue({ currentRoster: [mockRoster[2]] } as any);
    vi.mocked(getPlayerSeasonStats).mockResolvedValue([mockCsvRows[2]] as any);

    renderTeamPage();

    await waitFor(() => {
      expect(screen.getByText("No hitters found for this roster.")).toBeInTheDocument();
    });
  });

  it("fetches data with correct leagueId", async () => {
    renderTeamPage();

    await waitFor(() => {
      expect(getTeams).toHaveBeenCalledWith(1);
    });
  });

  it("navigates back to teams list", async () => {
    renderTeamPage();

    await waitFor(() => {
      expect(screen.getByText("Teams")).toBeInTheDocument();
    });
  });
});
