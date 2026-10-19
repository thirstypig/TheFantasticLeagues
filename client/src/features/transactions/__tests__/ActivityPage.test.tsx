import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock API
vi.mock("../../../api", () => ({
  getTransactions: vi.fn(),
  getPlayerSeasonStats: vi.fn(),
  getLeague: vi.fn(),
}));

// Mock trades API
vi.mock("../../trades/api", () => ({
  getTrades: vi.fn().mockResolvedValue({ trades: [] }),
}));

// Mock fetchJsonApi
vi.mock("../../../api/base", () => ({
  fetchJsonApi: vi.fn(),
}));

// Mock auth
vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: {
      user: { id: 1, email: "user@test.com", isAdmin: false, memberships: [{ leagueId: 1, role: "OWNER" }] },
    },
  }),
}));

// Mock LeagueContext
// Mutable per test: self-serve on by default; set `leagueRules: {}` for a
// commissioner-only league.
let leagueCtx: Record<string, unknown> = {};
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => leagueCtx,
  findMyTeam: <T extends { ownerUserId?: number | null; ownerships?: { userId: number }[] }>(teams: T[], userId: number): T | null =>
    teams.find(t => t.ownerUserId === userId || (t.ownerships ?? []).some(o => o.userId === userId)) ?? null,
}));

// Mock ToastContext
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn(), confirm: vi.fn().mockResolvedValue(true) }),
}));

// Mock child components
vi.mock("../../../components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
// Authorized users get RosterMovesTab. In a commissioner-only league an
// owner instead gets a link to their own Wire List (the legacy
// WaiverClaimForm fallback was retired in todo #303).
vi.mock("../components/RosterMovesTab", () => ({
  default: () => <div data-testid="roster-moves-tab">RosterMovesTab</div>,
}));
vi.mock("../../trades/pages/TradesPage", () => ({
  TradeCard: () => <div data-testid="trade-card" />,
  LeagueTradeCard: () => <div data-testid="league-trade-card" />,
  CreateTradeForm: () => <div data-testid="create-trade-form" />,
}));
vi.mock("../../teams/components/TeamRosterView", () => ({
  default: () => <div data-testid="team-roster-view" />,
}));
vi.mock("../components/ActivityHistoryTab", () => ({
  default: () => <div data-testid="history-tab">HistoryTab</div>,
}));
vi.mock("../../../components/ui/PageHeader", () => ({
  default: ({ title, rightElement }: any) => <div data-testid="page-header">{title}{rightElement}</div>,
}));
vi.mock("../../../components/ui/EmptyState", () => ({
  EmptyState: ({ message }: any) => <div data-testid="empty-state">{message}</div>,
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  Plus: () => <span>Plus</span>,
  ChevronDown: () => <span>ChevronDown</span>,
  ArrowLeftRight: () => <span>ArrowLeftRight</span>,
}));

import { getTransactions, getPlayerSeasonStats, getLeague } from "../../../api";
import ActivityPage from "../pages/ActivityPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  leagueCtx = { leagueId: 1, myTeamId: 10, leagueRules: { transactions: { owner_self_serve: "true" } } };
  vi.mocked(getTransactions).mockResolvedValue({ transactions: [] });
  vi.mocked(getPlayerSeasonStats).mockResolvedValue([]);
  vi.mocked(getLeague).mockResolvedValue({
    league: { teams: [{ id: 10, name: "Aces", code: "ACE", ownerUserId: 1, ownerships: [] }] },
  } as any);
});

describe("ActivityPage", () => {
  it("renders page header", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeInTheDocument();
    });
  });

  it("shows loading skeleton initially", () => {
    vi.mocked(getTransactions).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("renders tab buttons", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Roster Moves")).toBeInTheDocument();
      expect(screen.getByText("Trades")).toBeInTheDocument();
      expect(screen.getByText("History")).toBeInTheDocument();
    });
    // The legacy Waivers tab is gone (todo #303).
    expect(screen.queryByText("Waivers")).not.toBeInTheDocument();
  });

  it("defaults to the Roster Moves tab", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("roster-moves-tab")).toBeInTheDocument();
    });
  });

  it("commissioner-only league: an owner is pointed to their own Wire List", async () => {
    leagueCtx = { leagueId: 1, myTeamId: 10, leagueRules: {} };
    renderPage();
    const link = await screen.findByRole("link", { name: /wire list/i });
    expect(link).toHaveAttribute("href", "/teams/ACE/wire-list");
    expect(screen.queryByTestId("roster-moves-tab")).not.toBeInTheDocument();
  });

  it("a viewer with no team of their own gets no Wire List link", async () => {
    leagueCtx = { leagueId: 1, myTeamId: null, leagueRules: {} };
    vi.mocked(getLeague).mockResolvedValue({
      league: { teams: [{ id: 11, name: "Bats", code: "BAT", ownerUserId: 2, ownerships: [] }] },
    } as any);
    renderPage();
    await screen.findByText(/commissioner-only/i);
    expect(screen.queryByRole("link", { name: /wire list/i })).not.toBeInTheDocument();
  });

  it("calls all APIs on mount", async () => {
    renderPage();
    await waitFor(() => {
      expect(getTransactions).toHaveBeenCalled();
      expect(getPlayerSeasonStats).toHaveBeenCalled();
      expect(getLeague).toHaveBeenCalled();
    });
  });
});
