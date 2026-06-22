import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DraftResults from "../pages/DraftResults";

// Mock contexts
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1 }),
}));

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1, email: "test@example.com" } }),
}));

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("DraftResults Component", () => {
  const mockPicks = [
    {
      pickNum: 1,
      round: 1,
      teamId: 1,
      playerId: 100,
      playerName: "Player A",
      position: "C",
      isAutoPick: false,
      timestamp: 1000,
    },
  ];

  const mockTeams = [
    { id: 1, name: "Team Alpha", code: "ALP" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the component container", () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ picks: [], teams: [] }),
      })
    );

    const { container } = render(<DraftResults />);
    // Component renders a main container
    expect(container.querySelector(".p-4")).toBeInTheDocument();
  });

  it("should call fetch for picks on mount", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ picks: mockPicks, teams: mockTeams }),
      })
    );
    global.fetch = mockFetch;

    render(<DraftResults />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  it("should handle loading state with animate-pulse", () => {
    global.fetch = vi.fn(() =>
      new Promise(() => {}) // Never resolves
    );

    const { container } = render(<DraftResults />);

    // While loading, should show pulse animation
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("should handle API error gracefully", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        statusText: "Server Error",
      })
    );

    const { container } = render(<DraftResults />);

    // Component should render error state container
    await waitFor(() => {
      expect(container.querySelector(".p-4")).toBeInTheDocument();
    });
  });
});
