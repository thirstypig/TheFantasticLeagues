import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Mock the API module
vi.mock("../../../api", () => ({
  getPlayerProfile: vi.fn(),
  getPlayerRecentStats: vi.fn(),
  getPlayerCareerStats: vi.fn(),
}));

import { getPlayerProfile, getPlayerRecentStats, getPlayerCareerStats } from "../../../api";
import PlayerDetailModal from "../../../components/PlayerDetailModal";

const mockPlayer = {
  mlb_id: "545361",
  player_name: "Mike Trout",
  positions: "CF",
  ogba_team_code: "TEAM_A",
  mlb_team: "LAA",
  group: "H",
  is_pitcher: false,
} as any;

const mockProfile = {
  fullName: "Mike Trout",
  currentTeam: "Los Angeles Angels",
  primaryPosition: "CF",
  bats: "R",
  throws: "R",
  height: "6'2\"",
  weight: "235",
  birthDate: "1991-08-07",
  mlbDebutDate: "2011-07-08",
};

const mockRecentHitting = {
  rows: [
    { label: "7 Days", AB: 25, H: 8, R: 4, HR: 2, RBI: 5, SB: 0, AVG: ".320" },
    { label: "14 Days", AB: 50, H: 15, R: 7, HR: 3, RBI: 9, SB: 1, AVG: ".300" },
  ],
};

const mockCareerHitting = {
  rows: [
    { year: "2023", tm: "LAA", R: 82, HR: 18, RBI: 44, SB: 2, H: 108, AB: 387, AVG: ".263" },
    { year: "2024", tm: "LAA", R: 55, HR: 14, RBI: 35, SB: 1, H: 80, AB: 310, AVG: ".258" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPlayerProfile).mockResolvedValue(mockProfile as any);
  vi.mocked(getPlayerRecentStats).mockResolvedValue(mockRecentHitting as any);
  vi.mocked(getPlayerCareerStats).mockResolvedValue(mockCareerHitting as any);
});

describe("PlayerDetailModal", () => {
  it("renders nothing when player is null", () => {
    const { container } = render(
      <PlayerDetailModal player={null} onClose={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <PlayerDetailModal player={mockPlayer} onClose={vi.fn()} open={false} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders modal with player name when open", async () => {
    render(
      <PlayerDetailModal player={mockPlayer} onClose={vi.fn()} open={true} />
    );

    expect(screen.getByText("Mike Trout")).toBeInTheDocument();
  });

  it("shows Hitting badge for hitter", async () => {
    render(
      <PlayerDetailModal player={mockPlayer} onClose={vi.fn()} open={true} />
    );

    expect(screen.getByText("Hitting")).toBeInTheDocument();
  });

  it("shows position info", async () => {
    render(
      <PlayerDetailModal player={mockPlayer} onClose={vi.fn()} open={true} />
    );

    expect(screen.getByText("CF")).toBeInTheDocument();
  });

  it("fetches player data on mount", async () => {
    render(
      <PlayerDetailModal player={mockPlayer} onClose={vi.fn()} open={true} />
    );

    await waitFor(() => {
      expect(getPlayerProfile).toHaveBeenCalledWith("545361");
      expect(getPlayerRecentStats).toHaveBeenCalledWith("545361", "hitting");
      expect(getPlayerCareerStats).toHaveBeenCalledWith("545361", "hitting");
    });
  });

  it("shows loading state initially", () => {
    // Make API calls hang
    vi.mocked(getPlayerProfile).mockReturnValue(new Promise(() => {}));
    vi.mocked(getPlayerRecentStats).mockReturnValue(new Promise(() => {}));
    vi.mocked(getPlayerCareerStats).mockReturnValue(new Promise(() => {}));

    render(
      <PlayerDetailModal player={mockPlayer} onClose={vi.fn()} open={true} />
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders recent stats table after load", async () => {
    render(
      <PlayerDetailModal player={mockPlayer} onClose={vi.fn()} open={true} />
    );

    await waitFor(() => {
      expect(screen.getByText("7 Days")).toBeInTheDocument();
      expect(screen.getByText("14 Days")).toBeInTheDocument();
    });
  });

  it("renders career stats table after load", async () => {
    render(
      <PlayerDetailModal player={mockPlayer} onClose={vi.fn()} open={true} />
    );

    await waitFor(() => {
      expect(screen.getByText("2023")).toBeInTheDocument();
      expect(screen.getByText("2024")).toBeInTheDocument();
    });
  });

  it("calls onClose when clicking overlay", async () => {
    const onClose = vi.fn();
    render(
      <PlayerDetailModal player={mockPlayer} onClose={onClose} open={true} />
    );

    // Click the overlay (the outermost div with role="dialog")
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog);

    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", async () => {
    const onClose = vi.fn();
    render(
      <PlayerDetailModal player={mockPlayer} onClose={onClose} open={true} />
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  it("switches to Profile tab and shows profile data", async () => {
    render(
      <PlayerDetailModal player={mockPlayer} onClose={vi.fn()} open={true} />
    );

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    const profileTab = screen.getByText("Profile");
    fireEvent.click(profileTab);

    await waitFor(() => {
      // "Mike Trout" appears in both header and profile section
      expect(screen.getAllByText("Mike Trout").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Los Angeles Angels")).toBeInTheDocument();
      expect(screen.getByText("Bats/Throws")).toBeInTheDocument();
    });
  });

  it("shows error message when API fails", async () => {
    vi.mocked(getPlayerProfile).mockRejectedValue(new Error("Network error"));
    vi.mocked(getPlayerRecentStats).mockRejectedValue(new Error("Network error"));
    vi.mocked(getPlayerCareerStats).mockRejectedValue(new Error("Network error"));

    render(
      <PlayerDetailModal player={mockPlayer} onClose={vi.fn()} open={true} />
    );

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("renders Pitching badge for pitcher", async () => {
    const pitcher = {
      ...mockPlayer,
      group: "P",
      is_pitcher: true,
      positions: "SP",
    };

    vi.mocked(getPlayerRecentStats).mockResolvedValue({ rows: [] } as any);
    vi.mocked(getPlayerCareerStats).mockResolvedValue({ rows: [] } as any);

    render(
      <PlayerDetailModal player={pitcher} onClose={vi.fn()} open={true} />
    );

    expect(screen.getByText("Pitching")).toBeInTheDocument();
  });
});
