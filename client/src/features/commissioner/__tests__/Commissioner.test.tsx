import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mock commissioner API
vi.mock("../api", () => ({
  getCommissionerOverview: vi.fn(),
  getAvailableUsers: vi.fn(),
  getPriorTeams: vi.fn(),
  createTeam: vi.fn(),
  deleteTeam: vi.fn(),
  inviteMember: vi.fn(),
  assignTeamOwner: vi.fn(),
  removeTeamOwner: vi.fn(),
  updateLeague: vi.fn(),
}));

// Mock leagues API
vi.mock("../../leagues/api", () => ({
  getInviteCode: vi.fn().mockResolvedValue({ inviteCode: "ABC123" }),
  regenerateInviteCode: vi.fn(),
}));

// Mock top-level API
vi.mock("../../../api", () => ({
  getLeagues: vi.fn().mockResolvedValue({
    leagues: [{ id: 1, name: "Test League", access: { type: "MEMBER", role: "COMMISSIONER" } }],
  }),
  getMe: vi.fn().mockResolvedValue({
    user: { id: 1, email: "admin@test.com", isAdmin: true },
  }),
}));

// Mock ToastContext
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn(), confirm: vi.fn().mockResolvedValue(true) }),
}));

// Mock useSeasonGating
vi.mock("../../../hooks/useSeasonGating", () => ({
  useSeasonGating: () => ({
    seasonStatus: "IN_SEASON",
    isReadOnly: false,
    canTrade: true,
    canKeepers: false,
    canAuction: false,
    phaseGuidance: "Season is active.",
  }),
}));

// Mock child components
vi.mock("../components/CommissionerRosterTool", () => ({
  default: () => <div data-testid="roster-tool" />,
}));
vi.mock("../components/CommissionerControls", () => ({
  default: () => <div data-testid="controls" />,
}));
vi.mock("../components/CommissionerTradeTool", () => ({
  default: () => <div data-testid="trade-tool" />,
}));
vi.mock("../../keeper-prep/components/KeeperPrepDashboard", () => ({
  default: () => <div data-testid="keeper-dashboard" />,
}));
vi.mock("../components/SeasonManager", () => ({
  default: () => <div data-testid="season-manager" />,
}));

import { getCommissionerOverview, getAvailableUsers, getPriorTeams } from "../api";
import Commissioner from "../pages/Commissioner";

function renderWithRoute() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/1"]}>
      <Routes>
        <Route path="/commissioner/:leagueId" element={<Commissioner />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCommissionerOverview).mockResolvedValue({
    league: { id: 1, name: "Test League", season: 2025, draftMode: "AUCTION", isPublic: false },
    teams: [{ id: 10, leagueId: 1, name: "Aces", budget: 400, ownerships: [] }],
    memberships: [{ id: 1, leagueId: 1, userId: 1, role: "COMMISSIONER", user: { id: 1, email: "admin@test.com" } }],
  });
  vi.mocked(getAvailableUsers).mockResolvedValue([]);
  vi.mocked(getPriorTeams).mockResolvedValue([]);
});

describe("Commissioner", () => {
  it("renders page header", async () => {
    renderWithRoute();
    expect(screen.getByText("Commissioner")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    vi.mocked(getCommissionerOverview).mockReturnValue(new Promise(() => {}));
    renderWithRoute();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows error when API fails", async () => {
    vi.mocked(getCommissionerOverview).mockRejectedValue(new Error("Access denied"));
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText("Access denied")).toBeInTheDocument();
    });
  });

  it("renders league name after loading", async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText(/Test League/)).toBeInTheDocument();
    });
  });

  it("renders navigation tabs", async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
      expect(screen.getByText("Season")).toBeInTheDocument();
      expect(screen.getByText("Rosters")).toBeInTheDocument();
      expect(screen.getByText("Trades")).toBeInTheDocument();
    });
  });

  it("renders team name in overview", async () => {
    renderWithRoute();
    await waitFor(() => {
      // "Aces" appears in both the team card and the owner-assignment dropdown
      const matches = screen.getAllByText("Aces");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows season phase badge", async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText("IN SEASON")).toBeInTheDocument();
    });
  });

  it("renders Back to Home link", async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText(/Back to Home/)).toBeInTheDocument();
    });
  });
});
