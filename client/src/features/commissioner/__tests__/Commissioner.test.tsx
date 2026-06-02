import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ── Commissioner API mock ─────────────────────────────────────────────────────
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
  // Required by loadAll — omitting these causes a synchronous TypeError that
  // flushes the loading state before any assertion can see it.
  getInvites: vi.fn().mockResolvedValue([]),
  getLockedFields: vi.fn().mockResolvedValue({ lockedFields: [] }),
  cancelInvite: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));

// ── Leagues API mock ─────────────────────────────────────────────────────────
vi.mock("../../leagues/api", () => ({
  getInviteCode: vi.fn().mockResolvedValue({ inviteCode: "ABC123" }),
  regenerateInviteCode: vi.fn(),
}));

// ── Top-level API mock ───────────────────────────────────────────────────────
vi.mock("../../../api", () => ({
  getLeagues: vi.fn().mockResolvedValue({
    leagues: [{ id: 1, name: "Test League", access: { type: "MEMBER", role: "COMMISSIONER" } }],
  }),
  getMe: vi.fn().mockResolvedValue({
    user: { id: 1, email: "admin@test.com", isAdmin: true },
  }),
}));

// ── Transactions API mock ────────────────────────────────────────────────────
vi.mock("../../transactions/api", () => ({
  getTransactions: vi.fn().mockResolvedValue({ transactions: [] }),
}));

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn(), confirm: vi.fn().mockResolvedValue(true) }),
}));

// ── useSeasonGating — mutable so tests can set phase ────────────────────────
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

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({
    leagueId: 1, setLeagueId: vi.fn(), leagues: [], outfieldMode: "OF", seasonStatus: "IN_SEASON",
  }),
}));

// ── Child component mocks ────────────────────────────────────────────────────
vi.mock("../components/CommissionerRosterTool", () => ({
  default: () => <div data-testid="roster-tool" />,
}));
vi.mock("../components/BulkOpsPanel", () => ({
  default: () => <div data-testid="bulk-ops-panel" />,
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
// LeagueHealthTab fetches its own data — mock to isolate Commissioner tests.
vi.mock("../components/LeagueHealthTab", () => ({
  default: () => <div data-testid="league-health-tab" />,
}));
vi.mock("../../roster/components/RosterControls", () => ({
  default: () => <div data-testid="roster-controls" />,
}));

// ── Imports ──────────────────────────────────────────────────────────────────
import {
  getCommissionerOverview, getAvailableUsers, getPriorTeams, getGhostIlSummary,
} from "../api";
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
  vi.mocked(getGhostIlSummary).mockResolvedValue({
    teams: [], totalTeamsWithGhosts: 0, totalGhosts: 0,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Commissioner", () => {
  it("renders page header", async () => {
    renderWithRoute();
    expect(screen.getByText("Commissioner")).toBeInTheDocument();
  });

  it("shows loading state while data is in flight", () => {
    vi.mocked(getCommissionerOverview).mockReturnValue(new Promise(() => {}));
    renderWithRoute();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows error when overview API fails", async () => {
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

  it("renders v2 navigation tabs — Overview / Teams & People / Settings / Operations / Finances / Archive", async () => {
    renderWithRoute();
    await waitFor(() => {
      const labels = screen.getAllByRole("button").map(b => b.textContent?.trim());
      expect(labels).toContain("Overview");
      expect(labels).toContain("Teams & People");
      expect(labels).toContain("Settings");
      expect(labels).toContain("Operations");
      expect(labels).toContain("Finances");
      expect(labels).toContain("Archive");
      // Old tab names removed in the v2 redesign
      expect(labels).not.toContain("League");
      expect(labels).not.toContain("Manage Rosters");
      expect(labels).not.toContain("Members");
      expect(labels).not.toContain("Season");
    });
  });

  it("shows season phase badge", async () => {
    renderWithRoute();
    await waitFor(() => {
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

// ─────────────────────────────────────────────────────────────────────────────
describe("Commissioner — ghost-IL banner on Operations tab", () => {
  async function openOpsTab() {
    renderWithRoute();
    await waitFor(() => expect(screen.getByText(/Test League/)).toBeInTheDocument());
    const tabBtn = screen.getAllByRole("button").find(b => b.textContent?.trim() === "Operations")!;
    fireEvent.click(tabBtn);
  }

  it("does not fetch ghost-IL before the Operations tab is opened (lazy load)", async () => {
    renderWithRoute();
    await waitFor(() => expect(screen.getByText(/Test League/)).toBeInTheDocument());
    expect(getGhostIlSummary).not.toHaveBeenCalled();
  });

  it("fetches ghost-IL once the Operations tab is opened", async () => {
    await openOpsTab();
    await waitFor(() => expect(getGhostIlSummary).toHaveBeenCalledWith(1));
  });

  it("renders the ghost-IL banner when ghosts exist; Fix now switches to the IL sub-tab with player list", async () => {
    vi.mocked(getGhostIlSummary).mockResolvedValue({
      totalTeamsWithGhosts: 2,
      totalGhosts: 3,
      teams: [
        {
          teamId: 10, teamName: "Aces", teamCode: "ACES",
          ghosts: [
            { rosterId: 1, playerId: 100, playerName: "Mike Trout", currentMlbStatus: "Active" },
            { rosterId: 2, playerId: 101, playerName: "Mookie Betts", currentMlbStatus: "Active" },
          ],
        },
        {
          teamId: 20, teamName: "Titans", teamCode: "TITN",
          ghosts: [
            { rosterId: 3, playerId: 200, playerName: "Aaron Judge", currentMlbStatus: "Active" },
          ],
        },
      ],
    });
    await openOpsTab();
    // Banner appears with team count; player table is not yet shown
    await waitFor(() => expect(screen.getByText(/2 teams/i)).toBeInTheDocument());
    expect(screen.queryByText(/Mike Trout/)).not.toBeInTheDocument();
    // "Fix now" switches to the IL & Ghost-IL sub-tab, which renders the table
    fireEvent.click(screen.getByRole("button", { name: /Fix now/i }));
    await waitFor(() => expect(screen.getByText(/Mike Trout/)).toBeInTheDocument());
    expect(screen.getByText(/Aaron Judge/)).toBeInTheDocument();
  });

  it("hides the activation-needed banner when no teams have flagged players", async () => {
    await openOpsTab();
    await waitFor(() => expect(getGhostIlSummary).toHaveBeenCalled());
    expect(screen.queryByText(/needing activation/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Legacy hash redirects — v2 tab keys replace the old 6-tab slug names.
// Every old slug now maps to the nearest v2 tab so stale bookmarks still land
// somewhere sensible.
describe("Commissioner — legacy hash redirects (v1 → v2 tab renames)", () => {
  it("redirects #teams → #ops (roster ops live in Operations)", async () => {
    window.location.hash = "#teams";
    renderWithRoute();
    await waitFor(() => expect(window.location.hash).toBe("#ops"));
  });

  it("redirects #trades → #ops (trades live in Operations)", async () => {
    window.location.hash = "#trades";
    renderWithRoute();
    await waitFor(() => expect(window.location.hash).toBe("#ops"));
  });

  it("redirects #manage-rosters → #ops", async () => {
    window.location.hash = "#manage-rosters";
    renderWithRoute();
    await waitFor(() => expect(window.location.hash).toBe("#ops"));
  });

  it("redirects #league → #settings (league settings moved to Settings tab)", async () => {
    window.location.hash = "#league";
    renderWithRoute();
    await waitFor(() => expect(window.location.hash).toBe("#settings"));
  });

  it("redirects #members → #people (members now live in Teams & People)", async () => {
    window.location.hash = "#members";
    renderWithRoute();
    await waitFor(() => expect(window.location.hash).toBe("#people"));
  });

  it("redirects #season → #archive", async () => {
    window.location.hash = "#season";
    renderWithRoute();
    await waitFor(() => expect(window.location.hash).toBe("#archive"));
  });

  it("redirects #health → #overview", async () => {
    window.location.hash = "#health";
    renderWithRoute();
    await waitFor(() => expect(window.location.hash).toBe("#overview"));
  });

  it("passes known v2 hashes through unchanged — #ops", async () => {
    window.location.hash = "#ops";
    renderWithRoute();
    await waitFor(() => expect(screen.getByText(/Test League/)).toBeInTheDocument());
    expect(window.location.hash).toBe("#ops");
  });

  it("passes known v2 hashes through unchanged — #people", async () => {
    window.location.hash = "#people";
    renderWithRoute();
    await waitFor(() => expect(screen.getByText(/Test League/)).toBeInTheDocument());
    expect(window.location.hash).toBe("#people");
  });

  it("does not redirect an unrecognised hash slug", async () => {
    window.location.hash = "#unknown-slug";
    renderWithRoute();
    await waitFor(() => expect(screen.getByText(/Test League/)).toBeInTheDocument());
    expect(window.location.hash).toBe("#unknown-slug");
  });
});
