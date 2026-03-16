import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Mock API module
vi.mock("../../../api", () => ({
  getAuctionValues: vi.fn(),
  getLeague: vi.fn(),
}));

// Mock LeagueContext
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1, outfieldMode: "OF" }),
}));

// Mock PlayerDetailModal (avoid deep dependency tree)
vi.mock("../../../components/PlayerDetailModal", () => ({
  default: ({ player, onClose, open }: any) =>
    open && player ? <div data-testid="player-modal">{player.player_name}</div> : null,
}));

import { getAuctionValues, getLeague } from "../../../api";
import AuctionValues from "../pages/AuctionValues";

const mockHitters = [
  {
    mlb_id: "1",
    player_name: "Mike Trout",
    ogba_team_code: "TEAM_A",
    positions: "CF",
    group: "H",
    is_pitcher: false,
    dollar_value: 42.5,
  },
  {
    mlb_id: "2",
    player_name: "Mookie Betts",
    ogba_team_code: "TEAM_B",
    positions: "RF",
    group: "H",
    is_pitcher: false,
    dollar_value: 38.0,
  },
];

const mockPitchers = [
  {
    mlb_id: "3",
    player_name: "Gerrit Cole",
    ogba_team_code: "TEAM_A",
    positions: "SP",
    group: "P",
    is_pitcher: true,
    dollar_value: 35.0,
  },
];

const mockLeague = {
  league: {
    teams: [
      { code: "TEAM_A", name: "Aces" },
      { code: "TEAM_B", name: "Bombers" },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuctionValues).mockResolvedValue([...mockHitters, ...mockPitchers] as any);
  vi.mocked(getLeague).mockResolvedValue(mockLeague as any);
});

describe("AuctionValues", () => {
  it("renders page header", async () => {
    render(<AuctionValues />);
    expect(screen.getByText("Auction Values")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  });

  it("shows loading state initially", () => {
    vi.mocked(getAuctionValues).mockReturnValue(new Promise(() => {}));
    render(<AuctionValues />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders hitter rows by default", async () => {
    render(<AuctionValues />);

    await waitFor(() => {
      expect(screen.getByText("Mike Trout")).toBeInTheDocument();
      expect(screen.getByText("Mookie Betts")).toBeInTheDocument();
    });

    // Pitcher should NOT be visible in hitters tab
    expect(screen.queryByText("Gerrit Cole")).not.toBeInTheDocument();
  });

  it("maps team codes to team names", async () => {
    render(<AuctionValues />);

    await waitFor(() => {
      expect(screen.getByText("Aces")).toBeInTheDocument();
      expect(screen.getByText("Bombers")).toBeInTheDocument();
    });
  });

  it("switches to pitchers tab", async () => {
    render(<AuctionValues />);

    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    fireEvent.click(screen.getByText("Pitchers"));

    await waitFor(() => {
      expect(screen.getByText("Gerrit Cole")).toBeInTheDocument();
    });

    // Hitters should NOT be visible in pitchers tab
    expect(screen.queryByText("Mike Trout")).not.toBeInTheDocument();
  });

  it("filters players by search query", async () => {
    render(<AuctionValues />);

    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText("Search player / team / pos…");
    fireEvent.change(searchInput, { target: { value: "trout" } });

    await waitFor(() => {
      expect(screen.getByText("Mike Trout")).toBeInTheDocument();
      expect(screen.queryByText("Mookie Betts")).not.toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    vi.mocked(getAuctionValues).mockRejectedValue(new Error("Server error"));

    render(<AuctionValues />);

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows empty state when no results match", async () => {
    render(<AuctionValues />);

    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText("Search player / team / pos…");
    fireEvent.change(searchInput, { target: { value: "zzzzzzz" } });

    await waitFor(() => {
      expect(screen.getByText("No results.")).toBeInTheDocument();
    });
  });

  it("sorts players by value descending", async () => {
    render(<AuctionValues />);

    await waitFor(() => {
      expect(screen.getByText("Mike Trout")).toBeInTheDocument();
    });

    // Get all rows — Trout ($42.5) should appear before Betts ($38.0)
    const rows = screen.getAllByRole("row");
    const playerCells = rows.slice(1).map((row) => row.textContent);
    const troutIdx = playerCells.findIndex((t) => t?.includes("Mike Trout"));
    const bettsIdx = playerCells.findIndex((t) => t?.includes("Mookie Betts"));
    expect(troutIdx).toBeLessThan(bettsIdx);
  });

  it("opens player detail modal on row click", async () => {
    render(<AuctionValues />);

    await waitFor(() => expect(screen.getByText("Mike Trout")).toBeInTheDocument());

    // Click the row containing Mike Trout
    fireEvent.click(screen.getByText("Mike Trout"));

    await waitFor(() => {
      expect(screen.getByTestId("player-modal")).toBeInTheDocument();
    });
  });
});
