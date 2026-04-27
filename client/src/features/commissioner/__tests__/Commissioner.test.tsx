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
  getGhostIlSummary: vi.fn(),
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

// Mock useSeasonGating — mutable so each test can pick its phase.
// Used by the hash-redirect block: legacy `#teams` resolves to
// `#manage-rosters` in IN_SEASON, otherwise to `#season`.
const mockGating = {
  value: {
    seasonStatus: "IN_SEASON" as string,
    isReadOnly: false,
    canTrade: true,
    canKeepers: false,
    canAuction: false,
    phaseGuidance: "Season is active.",
  },
};
vi.mock("../../../hooks/useSeasonGating", () => ({
  useSeasonGating: () => mockGating.value,
}));

// Mock LeagueContext
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1, setLeagueId: vi.fn(), leagues: [], outfieldMode: "OF", seasonStatus: "IN_SEASON" }),
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

import { getCommissionerOverview, getAvailableUsers, getPriorTeams, getGhostIlSummary } from "../api";
import Commissioner from "../pages/Commissioner";
import { fireEvent } from "@testing-library/react";

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
  // Reset seasonStatus + hash defaults — tests that need other values
  // override these inline before renderWithRoute().
  mockGating.value = {
    seasonStatus: "IN_SEASON",
    isReadOnly: false,
    canTrade: true,
    canKeepers: false,
    canAuction: false,
    phaseGuidance: "Season is active.",
  };
  window.location.hash = "";
  vi.mocked(getCommissionerOverview).mockResolvedValue({
    league: { id: 1, name: "Test League", season: 2025, draftMode: "AUCTION", isPublic: false },
    teams: [{ id: 10, leagueId: 1, name: "Aces", budget: 400, ownerships: [] }],
    memberships: [{ id: 1, leagueId: 1, userId: 1, role: "COMMISSIONER", user: { id: 1, email: "admin@test.com" } }],
  });
  vi.mocked(getAvailableUsers).mockResolvedValue([]);
  vi.mocked(getPriorTeams).mockResolvedValue([]);
  vi.mocked(getGhostIlSummary).mockResolvedValue({ teams: [], totalTeamsWithGhosts: 0, totalGhosts: 0 });
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
      // Tab buttons contain label text; "Members" appears in quick stats too.
      // Per PR #130 (6→5 restructure): "Teams" → "Manage Rosters", and the
      // standalone "Trades" tab was folded into Manage Rosters.
      const buttons = screen.getAllByRole("button");
      const tabLabels = buttons.map((b) => b.textContent?.trim());
      expect(tabLabels).toContain("League");
      expect(tabLabels).toContain("Members");
      expect(tabLabels).toContain("Manage Rosters");
      expect(tabLabels).toContain("Season");
      expect(tabLabels).not.toContain("Trades");
    });
  });

  it("renders quick stats in league tab", async () => {
    renderWithRoute();
    await waitFor(() => {
      // Quick stats show team count and member count as "1" each
      const ones = screen.getAllByText("1");
      expect(ones.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows season phase badge", async () => {
    renderWithRoute();
    await waitFor(() => {
      // Phase badge appears in both the guidance bar and the quick stats
      const badges = screen.getAllByText("IN SEASON");
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders Back to Home link", async () => {
    renderWithRoute();
    await waitFor(() => {
      expect(screen.getByText(/Back to Home/)).toBeInTheDocument();
    });
  });
});

describe("Commissioner — ghost-IL banner on Manage Rosters tab", () => {
  async function openManageRostersTab() {
    renderWithRoute();
    // Wait for overview to resolve
    await waitFor(() => expect(screen.getByText(/Test League/)).toBeInTheDocument());
    const tabBtn = screen.getAllByRole("button").find(b => b.textContent?.trim() === "Manage Rosters")!;
    fireEvent.click(tabBtn);
  }

  it("does not fetch ghost-IL before the Manage Rosters tab is opened (lazy load)", async () => {
    renderWithRoute();
    await waitFor(() => expect(screen.getByText(/Test League/)).toBeInTheDocument());
    // Give the effect a beat — even so, the ghost-IL call should not have fired.
    expect(getGhostIlSummary).not.toHaveBeenCalled();
  });

  it("fetches ghost-IL once the Manage Rosters tab is opened", async () => {
    await openManageRostersTab();
    await waitFor(() => expect(getGhostIlSummary).toHaveBeenCalledWith(1));
  });

  it("renders the banner when ghosts exist, with a Details button that expands the list", async () => {
    vi.mocked(getGhostIlSummary).mockResolvedValue({
      totalTeamsWithGhosts: 2,
      totalGhosts: 3,
      teams: [
        { teamId: 10, teamName: "Aces", teamCode: "ACES", ghosts: [
          { rosterId: 1, playerId: 100, playerName: "Mike Trout", currentMlbStatus: "Active" },
          { rosterId: 2, playerId: 101, playerName: "Mookie Betts", currentMlbStatus: "Active" },
        ]},
        { teamId: 20, teamName: "Titans", teamCode: "TITN", ghosts: [
          { rosterId: 3, playerId: 200, playerName: "Aaron Judge", currentMlbStatus: "Active" },
        ]},
      ],
    });
    await openManageRostersTab();
    await waitFor(() => expect(screen.getByText(/2 teams/i)).toBeInTheDocument());
    // Details list is initially collapsed
    expect(screen.queryByText(/Mike Trout/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Details/i }));
    expect(screen.getByText(/Mike Trout/)).toBeInTheDocument();
    expect(screen.getByText(/Aaron Judge/)).toBeInTheDocument();
  });

  it("hides the banner when no teams have ghost-IL players", async () => {
    await openManageRostersTab();
    await waitFor(() => expect(getGhostIlSummary).toHaveBeenCalled());
    expect(screen.queryByText(/ghost-IL player/i)).not.toBeInTheDocument();
  });
});

describe("Commissioner — legacy hash redirects (PR #130 6→5 restructure)", () => {
  // The 6-tab structure had `#teams` and `#trades`. After PR #130:
  //   - `#teams` → `#manage-rosters` if IN_SEASON, else `#season`
  //     (Teams tab split: in-season transactions live in Manage Rosters;
  //     pre-season auction-time roster setup lives in Season)
  //   - `#trades` → `#manage-rosters` (Trades tab folded into Manage Rosters
  //     as a collapsible section)
  // These redirects keep old commissioner bookmarks landing somewhere sensible.

  it("redirects #teams → #manage-rosters during IN_SEASON", async () => {
    mockGating.value = { ...mockGating.value, seasonStatus: "IN_SEASON" };
    window.location.hash = "#teams";
    renderWithRoute();
    await waitFor(() => {
      expect(window.location.hash).toBe("#manage-rosters");
    });
  });

  it("redirects #teams → #season during SETUP (pre-auction)", async () => {
    mockGating.value = { ...mockGating.value, seasonStatus: "SETUP", canAuction: true };
    window.location.hash = "#teams";
    renderWithRoute();
    await waitFor(() => {
      expect(window.location.hash).toBe("#season");
    });
  });

  it("redirects #teams → #season during DRAFT", async () => {
    mockGating.value = { ...mockGating.value, seasonStatus: "DRAFT", canAuction: true };
    window.location.hash = "#teams";
    renderWithRoute();
    await waitFor(() => {
      expect(window.location.hash).toBe("#season");
    });
  });

  it("redirects #trades → #manage-rosters regardless of season phase", async () => {
    mockGating.value = { ...mockGating.value, seasonStatus: "IN_SEASON" };
    window.location.hash = "#trades";
    renderWithRoute();
    await waitFor(() => {
      expect(window.location.hash).toBe("#manage-rosters");
    });
  });

  it("does not redirect known hashes — #season passes through unchanged", async () => {
    mockGating.value = { ...mockGating.value, seasonStatus: "IN_SEASON" };
    window.location.hash = "#season";
    renderWithRoute();
    // Wait for overview to settle so the effect has run.
    await waitFor(() => expect(screen.getByText(/Test League/)).toBeInTheDocument());
    expect(window.location.hash).toBe("#season");
  });

  it("does not redirect a no-op hash that doesn't match any legacy slug", async () => {
    mockGating.value = { ...mockGating.value, seasonStatus: "IN_SEASON" };
    window.location.hash = "#unknown-slug";
    renderWithRoute();
    await waitFor(() => expect(screen.getByText(/Test League/)).toBeInTheDocument());
    // Unknown hashes should be left alone — neither redirected nor scrubbed.
    expect(window.location.hash).toBe("#unknown-slug");
  });
});
