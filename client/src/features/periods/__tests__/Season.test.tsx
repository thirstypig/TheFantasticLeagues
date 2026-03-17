import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock API
vi.mock("../../../api", () => ({
  getSeasonStandings: vi.fn(),
  getPeriodCategoryStandings: vi.fn(),
}));

// Mock seasons API
vi.mock("../../seasons/api", () => ({
  getCurrentSeason: vi.fn().mockResolvedValue({ status: "IN_SEASON", year: 2025 }),
}));

// Mock teams API
vi.mock("../../teams/api", () => ({
  getTeamDetails: vi.fn(),
}));

// Mock LeagueContext
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1, outfieldMode: "OF" }),
}));

// Mock ThemeContext
vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

// Mock baseballUtils
vi.mock("../../../lib/baseballUtils", () => ({
  POS_ORDER: ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SP", "RP"],
}));

// Mock sportConfig
vi.mock("../../../lib/sportConfig", () => ({
  mapPosition: (pos: string) => pos,
}));

// Mock ogbaTeams
vi.mock("../../../lib/ogbaTeams", () => ({
  OGBA_TEAM_NAMES: { ACES: "Aces", BOMB: "Bombers" },
}));

import { getSeasonStandings } from "../../../api";
import SeasonPage from "../pages/Season";

const mockSeasonData = {
  periodIds: [1, 2, 3],
  rows: [
    { teamId: 1, teamName: "Aces", teamCode: "ACES", periodPoints: [20, 25, 22], totalPoints: 67 },
    { teamId: 2, teamName: "Bombers", teamCode: "BOMB", periodPoints: [18, 22, 24], totalPoints: 64 },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SeasonPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSeasonStandings).mockResolvedValue(mockSeasonData as any);
});

describe("SeasonPage", () => {
  it("renders page title", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Season Standings")).toBeInTheDocument();
    });
  });

  it("shows loading state while data loads", () => {
    vi.mocked(getSeasonStandings).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading season data...")).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    vi.mocked(getSeasonStandings).mockRejectedValue(new Error("Failed to fetch"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch/)).toBeInTheDocument();
    });
  });

  it("renders team names in standings", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Aces")).toBeInTheDocument();
      expect(screen.getByText("Bombers")).toBeInTheDocument();
    });
  });

  it("renders period column headers", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("P1")).toBeInTheDocument();
      expect(screen.getByText("P2")).toBeInTheDocument();
      expect(screen.getByText("P3")).toBeInTheDocument();
    });
  });

  it("renders Point Matrix section heading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Point Matrix")).toBeInTheDocument();
    });
  });

  it("shows Season and Period toggle buttons", async () => {
    renderPage();
    expect(screen.getByText("Season")).toBeInTheDocument();
    expect(screen.getByText("Period")).toBeInTheDocument();
  });

  it("shows empty state when no rows", async () => {
    vi.mocked(getSeasonStandings).mockResolvedValue({ periodIds: [], rows: [] } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No season records available.")).toBeInTheDocument();
    });
  });
});
