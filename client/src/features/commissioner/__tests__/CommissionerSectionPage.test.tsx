import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, Link } from "react-router-dom";

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: { isAdmin: true, memberships: [] } } }),
}));

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
    leagues: [{ id: 20, name: "Test League", access: { type: "MEMBER", role: "COMMISSIONER" } }],
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
vi.mock("../components/BulkOpsPanel", () => ({
  default: () => <div data-testid="bulk-ops-panel" />,
}));
vi.mock("../components/CommissionerControls", () => ({
  default: () => <div data-testid="controls" />,
}));
vi.mock("../components/CommissionerRosterTool", () => ({
  default: () => <div data-testid="roster-tool" />,
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
import CommissionerSectionPage from "../pages/CommissionerSectionPage";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/commissioner/:leagueId/:section" element={<CommissionerSectionPage />} />
        <Route path="/commissioner/:leagueId" element={<LocationProbe />} />
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
    league: { id: 20, name: "Test League", season: 2025, draftMode: "AUCTION", isPublic: false },
    teams: [{ id: 10, leagueId: 20, name: "Aces", budget: 400, ownerships: [] }],
    memberships: [{ id: 1, leagueId: 20, userId: 1, role: "COMMISSIONER", user: { id: 1, email: "admin@test.com" } }],
  });
  vi.mocked(getAvailableUsers).mockResolvedValue([]);
  vi.mocked(getPriorTeams).mockResolvedValue([]);
  vi.mocked(getGhostIlSummary).mockResolvedValue({
    teams: [], totalTeamsWithGhosts: 0, totalGhosts: 0,
  });
});

describe("CommissionerSectionPage", () => {
  it("money renders the Finances pane with no top-level tab bar", async () => {
    renderAt("/commissioner/20/money");
    await waitFor(() => expect(screen.getByText("Prize Pool")).toBeInTheDocument());
    expect(screen.queryByRole("tablist", { name: "Commissioner sections" })).toBeNull();
    expect(screen.getByRole("link", { name: /Commissioner/ })).toHaveAttribute("href", "/commissioner/20");
    expect(vi.mocked(getCommissionerOverview)).toHaveBeenCalledWith(20);
  });

  it("trade-record renders the Operations trades sub-pane", async () => {
    renderAt("/commissioner/20/trade-record");
    await waitFor(() => expect(screen.getByTestId("trade-tool")).toBeInTheDocument());
    expect(screen.getByText("Record Retroactive Trade")).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Commissioner sections" })).toBeNull();
  });

  it("unknown slug redirects to the hub", async () => {
    renderAt("/commissioner/20/bogus");
    await waitFor(() => expect(screen.getByTestId("loc")).toHaveTextContent("/commissioner/20"));
    expect(screen.getByTestId("loc").textContent).toBe("/commissioner/20");
  });

  // Slug-only navigation matches the same <Route>; the page must remount.
  function renderWithNav(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Link to="/commissioner/20/trade-record">go-trades</Link>
        <Routes>
          <Route path="/commissioner/:leagueId/:section" element={<CommissionerSectionPage />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("money -> trades slug change switches to the trades sub-pane", async () => {
    renderWithNav("/commissioner/20/money");
    await waitFor(() => expect(screen.getByText("Prize Pool")).toBeInTheDocument());
    fireEvent.click(screen.getByText("go-trades"));
    await waitFor(() => expect(screen.getByTestId("trade-tool")).toBeInTheDocument());
    expect(screen.queryByText("Prize Pool")).toBeNull();
  });

  it("roster-advanced renders the Manual Roster (backdated fixes) panel with no sub-tab button", async () => {
    renderAt("/commissioner/20/roster-advanced");
    await waitFor(() => expect(screen.getByTestId("roster-tool")).toBeInTheDocument());
    expect(screen.queryByTestId("trade-tool")).toBeNull();
    expect(screen.queryByRole("button", { name: "Manual Roster" })).toBeNull();
  });

  it("roster-setup renders the legacy Bulk panel", async () => {
    renderAt("/commissioner/20/roster-setup");
    await waitFor(() => expect(screen.getByTestId("bulk-ops-panel")).toBeInTheDocument());
    expect(screen.queryByTestId("trade-tool")).toBeNull();
  });

  it("roster-setup -> trades slug change (same section, different sub-tab) switches sub-pane", async () => {
    renderWithNav("/commissioner/20/roster-setup");
    await waitFor(() => expect(screen.getByTestId("bulk-ops-panel")).toBeInTheDocument());
    fireEvent.click(screen.getByText("go-trades"));
    await waitFor(() => expect(screen.getByTestId("trade-tool")).toBeInTheDocument());
    expect(screen.queryByTestId("bulk-ops-panel")).toBeNull();
  });

  it("trades is no longer a section slug (the queue page owns it)", async () => {
    renderAt("/commissioner/20/trades");
    await waitFor(() => expect(screen.getByTestId("loc")).toHaveTextContent("/commissioner/20"));
    expect(screen.queryByTestId("trade-tool")).toBeNull();
  });

  it("rosters is no longer a section slug (redirects to the hub)", async () => {
    renderAt("/commissioner/20/rosters");
    await waitFor(() => expect(screen.getByTestId("loc")).toHaveTextContent("/commissioner/20"));
    expect(screen.getByTestId("loc").textContent).toBe("/commissioner/20");
  });
});
