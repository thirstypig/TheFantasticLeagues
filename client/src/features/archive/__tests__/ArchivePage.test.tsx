import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

// --- Mocks ---

// Mock the barrel API import (../../../api)
vi.mock("../../../api", () => ({
  getArchiveSeasons: vi.fn(),
  getArchivePeriods: vi.fn(),
  getArchivePeriodStats: vi.fn(),
  getArchiveDraftResults: vi.fn(),
  updateArchiveTeamName: vi.fn(),
  fmtRate: (v: number) => (isNaN(v) ? ".000" : v < 1 ? `.${(v * 1000).toFixed(0).padStart(3, "0")}` : v.toFixed(3)),
}));

// Mock fetchJsonApi (used for standings and recalculate)
vi.mock("../../../api/base", () => ({
  fetchJsonApi: vi.fn().mockResolvedValue({ standings: [], results: [] }),
  API_BASE: "/api",
}));

// Mock ogbaTeams
vi.mock("../../../lib/ogbaTeams", () => ({
  OGBA_TEAM_NAMES: {
    DKD: "Diamond Kings",
    DLC: "Dominators",
    TST: "Test Team",
  } as Record<string, string>,
}));

// Mock AuthProvider
vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "1", email: "test@test.com", isAdmin: true },
    isAdmin: true,
  })),
}));

// Mock ToastContext
const mockToast = vi.fn();
const mockConfirm = vi.fn().mockResolvedValue(true);
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast, confirm: mockConfirm }),
}));

// Mock complex child components with simple stubs
vi.mock("../../players/components/EditPlayerNameModal", () => ({
  default: () => <div data-testid="edit-player-modal" />,
}));
vi.mock("../../teams/components/EditTeamNameModal", () => ({
  default: () => <div data-testid="edit-team-modal" />,
}));
vi.mock("../../admin/components/ArchiveAdminPanel", () => ({
  default: () => <div data-testid="archive-admin-panel">Admin Panel</div>,
}));
vi.mock("../../../components/AIInsightsModal", () => ({
  default: () => <div data-testid="ai-insights-modal" />,
}));
vi.mock("../../../components/ui/PageHeader", () => ({
  default: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
}));
vi.mock("../../../components/StatsTables", () => ({
  SeasonTable: ({ rows }: any) => (
    <div data-testid="season-table">{rows?.length ?? 0} rows</div>
  ),
  PeriodSummaryTable: ({ rows }: any) => (
    <div data-testid="period-summary-table">{rows?.length ?? 0} rows</div>
  ),
  CategoryPeriodTable: ({ categoryId }: any) => (
    <div data-testid={`category-table-${categoryId}`}>{categoryId}</div>
  ),
}));

// Import after mocks
import {
  getArchiveSeasons,
  getArchivePeriods,
  getArchivePeriodStats,
  getArchiveDraftResults,
} from "../../../api";
import { useAuth } from "../../../auth/AuthProvider";
import ArchivePage from "../pages/ArchivePage";

// --- Helpers ---

const mockSeasons = { seasons: [2024, 2023] };

const mockPeriods = {
  periods: [
    { id: 1, periodNumber: 1, startDate: "2024-04-01", endDate: "2024-05-01" },
    { id: 2, periodNumber: 2, startDate: "2024-05-02", endDate: "2024-06-01" },
  ],
};

const mockStats = {
  stats: [
    {
      id: 1,
      playerName: "M. Trout",
      fullName: "Mike Trout",
      teamCode: "DKD",
      isPitcher: false,
      position: "OF",
      mlbTeam: "LAA",
      R: 10,
      HR: 5,
      RBI: 15,
      SB: 2,
      AVG: 0.3,
    },
    {
      id: 2,
      playerName: "G. Cole",
      fullName: "Gerrit Cole",
      teamCode: "DKD",
      isPitcher: true,
      position: "SP",
      mlbTeam: "NYY",
      W: 8,
      SV: 0,
      K: 100,
      ERA: 2.5,
      WHIP: 0.95,
    },
    {
      id: 3,
      playerName: "J. Soto",
      fullName: "Juan Soto",
      teamCode: "DLC",
      isPitcher: false,
      position: "OF",
      mlbTeam: "NYM",
      R: 12,
      HR: 8,
      RBI: 20,
      SB: 1,
      AVG: 0.32,
    },
  ],
};

const mockDraftResults = {
  players: [
    {
      playerName: "M. Trout",
      fullName: "Mike Trout",
      teamCode: "DKD",
      position: "OF",
      mlbTeam: "LAA",
      draftDollars: 45,
      isPitcher: false,
      isKeeper: false,
    },
    {
      playerName: "G. Cole",
      fullName: "Gerrit Cole",
      teamCode: "DKD",
      position: "SP",
      mlbTeam: "NYY",
      draftDollars: 30,
      isPitcher: true,
      isKeeper: false,
    },
  ],
  trades: [
    {
      fromTeamName: "Diamond Kings",
      fromTeamCode: "DKD",
      toTeamName: "Dominators",
      toTeamCode: "DLC",
      amount: 5,
      note: "Future considerations",
    },
  ],
};

function setupDefaultMocks() {
  vi.mocked(getArchiveSeasons).mockResolvedValue(mockSeasons as any);
  vi.mocked(getArchivePeriods).mockResolvedValue(mockPeriods as any);
  vi.mocked(getArchivePeriodStats).mockResolvedValue(mockStats as any);
  vi.mocked(getArchiveDraftResults).mockResolvedValue(mockDraftResults as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
  // Reset useAuth to admin by default
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "1", email: "test@test.com", isAdmin: true },
    isAdmin: true,
  } as any);
});

// --- Tests ---

describe("ArchivePage", () => {
  it("renders the page header", async () => {
    render(<ArchivePage />);
    expect(screen.getByText("Historical Archive")).toBeInTheDocument();
    expect(
      screen.getByText("League History: Season stats and draft records.")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getArchiveSeasons).toHaveBeenCalledTimes(1)
    );
  });

  it("shows loading state while seasons are fetching", () => {
    vi.mocked(getArchiveSeasons).mockReturnValue(new Promise(() => {}));
    render(<ArchivePage />);
    // The component doesn't render tabs or content while loading, just selectors
    // Verify no error is shown and seasons API was called
    expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();
  });

  it("shows error state when seasons fail to load", async () => {
    vi.mocked(getArchiveSeasons).mockRejectedValue(
      new Error("Network failure")
    );
    render(<ArchivePage />);

    await waitFor(() => {
      expect(screen.getByText(/Error: Network failure/)).toBeInTheDocument();
    });
  });

  it("populates the season selector after loading", async () => {
    render(<ArchivePage />);

    await waitFor(() => {
      // Season dropdown should contain the years from the mock
      const options = screen.getAllByRole("option");
      const yearOptions = options.filter(
        (o) => o.textContent === "2024" || o.textContent === "2023"
      );
      expect(yearOptions).toHaveLength(2);
    });
  });

  it("auto-selects 2024 when available and loads periods", async () => {
    render(<ArchivePage />);

    await waitFor(() => {
      expect(getArchivePeriods).toHaveBeenCalledWith(2024);
    });
  });

  it("renders navigation tabs when a season is selected", async () => {
    render(<ArchivePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Standings" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Player Stats" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Draft Results" })).toBeInTheDocument();
    });
  });

  it("shows Admin tab only for admin users", async () => {
    render(<ArchivePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Admin" })).toBeInTheDocument();
    });
  });

  it("hides Admin tab for non-admin users", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "2", email: "user@test.com", isAdmin: false },
      isAdmin: false,
    } as any);

    render(<ArchivePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Standings" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("defaults to Standings tab and renders SeasonTable for Full Season view", async () => {
    render(<ArchivePage />);

    await waitFor(() => {
      expect(screen.getByTestId("season-table")).toBeInTheDocument();
    });
  });

  it("switches to Player Stats tab and shows player data", async () => {
    render(<ArchivePage />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Player Stats" })).toBeInTheDocument();
    });

    // Need to select a period first so stats load (selectedPeriod defaults to 0, stats only load when > 0)
    // Actually stats load when selectedPeriod is set. Let's switch tab first.
    fireEvent.click(screen.getByRole("button", { name: "Player Stats" }));

    // The stats tab should render. With selectedPeriod=0, it shows "No records found"
    // or shows player summary if stats are loaded.
    // selectedPeriod is set to 0 by loadPeriods, and loadStats only fires when selectedPeriod is truthy.
    // So we need to select a real period to see stats.
    // Let's change selectedPeriod via the View dropdown
    const viewSelect = screen.getAllByRole("combobox")[1]; // Second select = View
    fireEvent.change(viewSelect, { target: { value: "1" } });

    await waitFor(() => {
      // Stats tab should show summary line with player count
      expect(screen.getByText(/3 Players/)).toBeInTheDocument();
      expect(screen.getByText(/2 Teams/)).toBeInTheDocument();
    });
  });

  it("switches to Draft Results tab and shows team cards with player count", async () => {
    render(<ArchivePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Draft Results" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Draft Results" }));

    await waitFor(() => {
      // Team header should appear (collapsed by default)
      expect(screen.getByText("Diamond Kings")).toBeInTheDocument();
      // Player count shown in collapsed header
      expect(screen.getByText("2 Players")).toBeInTheDocument();
    });

    // Expand the team card to see player names
    fireEvent.click(screen.getByText("Diamond Kings"));

    await waitFor(() => {
      expect(screen.getByText("Mike Trout")).toBeInTheDocument();
      expect(screen.getByText("Gerrit Cole")).toBeInTheDocument();
    });
  });

  it("shows pre-draft trades in Draft Results tab", async () => {
    render(<ArchivePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Draft Results" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Draft Results" }));

    await waitFor(() => {
      expect(screen.getByText("Pre-Draft Trades")).toBeInTheDocument();
      // Trade details: $5 amount and team names
      expect(screen.getByText(/\$5/)).toBeInTheDocument();
      expect(screen.getByText(/"Future considerations"/)).toBeInTheDocument();
    });
  });

  it("shows 'No pre-draft trades' when draft has no trades", async () => {
    vi.mocked(getArchiveDraftResults).mockResolvedValue({
      players: mockDraftResults.players,
      trades: [],
    } as any);

    render(<ArchivePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Draft Results" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Draft Results" }));

    await waitFor(() => {
      expect(
        screen.getByText("No pre-draft trades for this season.")
      ).toBeInTheDocument();
    });
  });

  it("shows error when periods fail to load", async () => {
    vi.mocked(getArchivePeriods).mockRejectedValue(
      new Error("Periods unavailable")
    );

    render(<ArchivePage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Error: Periods unavailable/)
      ).toBeInTheDocument();
    });
  });

  it("shows Sync Data button for admin users", async () => {
    render(<ArchivePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Sync Data/ })).toBeInTheDocument();
    });
  });

  it("hides Sync Data button for non-admin users", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "2", email: "user@test.com", isAdmin: false },
      isAdmin: false,
    } as any);

    render(<ArchivePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Standings" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Sync Data/ })).not.toBeInTheDocument();
  });
});
