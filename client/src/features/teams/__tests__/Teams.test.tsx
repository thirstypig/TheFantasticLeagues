import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock API module
vi.mock("../../../api", () => ({
  getPlayerSeasonStats: vi.fn(),
}));

// Mock ogbaTeams (maps team codes to display names)
vi.mock("../../../lib/ogbaTeams", () => ({
  getOgbaTeamName: (code: string) => {
    const names: Record<string, string> = {
      ACES: "Aces",
      BOMB: "Bombers",
    };
    return names[code] || "";
  },
}));

// Mock playerDisplay
vi.mock("../../../lib/playerDisplay", () => ({
  isPitcher: (p: any) => p.is_pitcher === true || p.group === "P",
}));

import { getPlayerSeasonStats } from "../../../api";
import Teams from "../pages/Teams";

const mockPlayers = [
  { mlb_id: "1", player_name: "Mike Trout", ogba_team_code: "ACES", group: "H", is_pitcher: false },
  { mlb_id: "2", player_name: "Mookie Betts", ogba_team_code: "ACES", group: "H", is_pitcher: false },
  { mlb_id: "3", player_name: "Gerrit Cole", ogba_team_code: "ACES", group: "P", is_pitcher: true },
  { mlb_id: "4", player_name: "Juan Soto", ogba_team_code: "BOMB", group: "H", is_pitcher: false },
  { mlb_id: "5", player_name: "Max Scherzer", ogba_team_code: "BOMB", group: "P", is_pitcher: true },
];

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPlayerSeasonStats).mockResolvedValue(mockPlayers as any);
});

describe("Teams", () => {
  it("renders page header", async () => {
    renderWithRouter(<Teams />);
    expect(screen.getByText("Teams")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading teams…")).not.toBeInTheDocument());
  });

  it("shows loading state initially", () => {
    vi.mocked(getPlayerSeasonStats).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<Teams />);
    expect(screen.getByText("Loading teams…")).toBeInTheDocument();
  });

  it("renders team rows with roster counts", async () => {
    renderWithRouter(<Teams />);

    await waitFor(() => {
      // Team names from ogbaTeams mock
      expect(screen.getByText("Aces")).toBeInTheDocument();
      expect(screen.getByText("Bombers")).toBeInTheDocument();
    });

    // Check ACES code is displayed
    expect(screen.getByText("ACES")).toBeInTheDocument();
    expect(screen.getByText("BOMB")).toBeInTheDocument();
  });

  it("shows correct roster counts per team", async () => {
    renderWithRouter(<Teams />);

    await waitFor(() => {
      expect(screen.getByText("Aces")).toBeInTheDocument();
    });

    // Find all rows, check that Aces has 2 hitters, 1 pitcher, 3 total
    const rows = screen.getAllByRole("row");
    const acesRow = rows.find((r) => r.textContent?.includes("Aces"));
    expect(acesRow).toBeDefined();
    // Aces: 2H, 1P, 3 total
    expect(acesRow!.textContent).toContain("2");
    expect(acesRow!.textContent).toContain("1");
    expect(acesRow!.textContent).toContain("3");
  });

  it("renders 'View roster' links for each team", async () => {
    renderWithRouter(<Teams />);

    await waitFor(() => {
      const links = screen.getAllByText("View roster");
      expect(links).toHaveLength(2);
    });
  });

  it("shows empty state when no players loaded", async () => {
    vi.mocked(getPlayerSeasonStats).mockResolvedValue([]);
    renderWithRouter(<Teams />);

    await waitFor(() => {
      expect(screen.getByText("No teams found.")).toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    vi.mocked(getPlayerSeasonStats).mockRejectedValue(new Error("Network failure"));
    renderWithRouter(<Teams />);

    await waitFor(() => {
      expect(screen.getByText(/Network failure/)).toBeInTheDocument();
    });
  });

  it("excludes FA players from team list", async () => {
    vi.mocked(getPlayerSeasonStats).mockResolvedValue([
      ...mockPlayers,
      { mlb_id: "99", player_name: "Free Agent", ogba_team_code: "FA", group: "H", is_pitcher: false },
    ] as any);

    renderWithRouter(<Teams />);

    await waitFor(() => {
      expect(screen.getByText("Aces")).toBeInTheDocument();
    });

    // FA should not appear as a team
    const rows = screen.getAllByRole("row");
    const faRow = rows.find((r) => r.textContent?.includes("FA") && !r.textContent?.includes("Aces"));
    // FA row should not exist as a standalone team
    expect(rows.length).toBe(3); // header + 2 teams
  });
});
