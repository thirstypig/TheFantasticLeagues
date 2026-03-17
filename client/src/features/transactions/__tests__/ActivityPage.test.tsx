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
}));

// Mock ToastContext
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn(), confirm: vi.fn().mockResolvedValue(true) }),
}));

// Mock child components
vi.mock("../../roster/components/AddDropTab", () => ({
  default: () => <div data-testid="add-drop-tab">AddDropTab</div>,
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

// Mock lucide-react
vi.mock("lucide-react", () => ({
  Plus: () => <span>Plus</span>,
  ChevronDown: () => <span>ChevronDown</span>,
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

  it("shows loading state initially", () => {
    vi.mocked(getTransactions).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading activity...")).toBeInTheDocument();
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

  it("shows AddDropTab by default", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("add-drop-tab")).toBeInTheDocument();
    });
  });

  it("renders subtitle text", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Manage roster moves/)).toBeInTheDocument();
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
