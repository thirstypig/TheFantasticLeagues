import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock API
vi.mock("../../../api", () => ({
  getTransactions: vi.fn(),
  getPlayerSeasonStats: vi.fn(),
  getLeague: vi.fn(),
  getSeasonStandings: vi.fn(),
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
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1 }),
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
vi.mock("../../roster/components/AddDropTab", () => ({
  default: () => <div data-testid="add-drop-tab">AddDropTab</div>,
}));
vi.mock("../../waivers/components/WaiverClaimForm", () => ({
  default: () => <div data-testid="waiver-claim-form">WaiverClaimForm</div>,
}));
vi.mock("../../trades/pages/TradesPage", () => ({
  TradeCard: () => <div data-testid="trade-card" />,
  LeagueTradeCard: () => <div data-testid="league-trade-card" />,
  CreateTradeForm: () => <div data-testid="create-trade-form" />,
}));
vi.mock("../../teams/components/TeamRosterView", () => ({
  default: () => <div data-testid="team-roster-view" />,
}));
vi.mock("../components/ActivityWaiversTab", () => ({
  default: () => <div data-testid="waivers-tab">WaiversTab</div>,
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

import { getTransactions, getPlayerSeasonStats, getLeague, getSeasonStandings } from "../../../api";
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
  vi.mocked(getTransactions).mockResolvedValue({ transactions: [] });
  vi.mocked(getPlayerSeasonStats).mockResolvedValue([]);
  vi.mocked(getLeague).mockResolvedValue({
    league: { teams: [{ id: 10, name: "Aces", ownerUserId: 1, ownerships: [] }] },
  } as any);
  vi.mocked(getSeasonStandings).mockResolvedValue({ rows: [] } as any);
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
      expect(screen.getByText("Add / Drop")).toBeInTheDocument();
      expect(screen.getByText("Trades")).toBeInTheDocument();
      expect(screen.getByText("Waivers")).toBeInTheDocument();
      expect(screen.getByText("History")).toBeInTheDocument();
    });
  });

  it("defaults to waivers tab", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("waivers-tab")).toBeInTheDocument();
    });
  });

  it("does not show add/drop tab content by default", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.queryByTestId("add-drop-tab")).not.toBeInTheDocument();
    });
  });

  it("calls all APIs on mount", async () => {
    renderPage();
    await waitFor(() => {
      expect(getTransactions).toHaveBeenCalled();
      expect(getPlayerSeasonStats).toHaveBeenCalled();
      expect(getLeague).toHaveBeenCalled();
      expect(getSeasonStandings).toHaveBeenCalled();
    });
  });
});
