import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Must mock before imports
const mockGetTrades = vi.fn();
const mockRespondToTrade = vi.fn();
const mockCancelTrade = vi.fn();
const mockVetoTrade = vi.fn();
const mockProcessTrade = vi.fn();

// Mock the trades feature API (the actual source module)
vi.mock("../../trades/api", () => ({
  getTrades: (...args: any[]) => mockGetTrades(...args),
  proposeTrade: vi.fn(),
  respondToTrade: (...args: any[]) => mockRespondToTrade(...args),
  cancelTrade: (...args: any[]) => mockCancelTrade(...args),
  vetoTrade: (...args: any[]) => mockVetoTrade(...args),
  processTrade: (...args: any[]) => mockProcessTrade(...args),
  TradeProposal: {},
}));

// Mock the barrel re-export
vi.mock("../../../api", async () => {
  const tradesApi = await vi.importActual("../../trades/api");
  return {
    ...tradesApi,
    getTrades: (...args: any[]) => mockGetTrades(...args),
    respondToTrade: (...args: any[]) => mockRespondToTrade(...args),
    cancelTrade: (...args: any[]) => mockCancelTrade(...args),
    vetoTrade: (...args: any[]) => mockVetoTrade(...args),
    processTrade: (...args: any[]) => mockProcessTrade(...args),
    getLeague: vi.fn(),
  };
});

const mockUser = {
  id: 1,
  email: "user@test.com",
  isAdmin: false,
  memberships: [{ leagueId: 1, role: "OWNER" }],
};

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: mockUser } }),
}));

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1 }),
}));

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn(), confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock("../../../components/ui/EmptyState", () => ({
  EmptyState: ({ title }: any) => <div>{title}</div>,
}));

vi.mock("../components/TradeAssetSelector", () => ({
  TradeAssetSelector: () => <div data-testid="trade-asset-selector" />,
}));

vi.mock("../../teams/components/TeamRosterView", () => ({
  default: () => <div data-testid="team-roster-view" />,
}));

vi.mock("lucide-react", () => ({
  Eye: () => <span>Eye</span>,
  Plus: () => <span>Plus</span>,
  Sparkles: () => <span>Sparkles</span>,
  Loader2: () => <span>Loader2</span>,
  ArrowLeftRight: () => <span>ArrowLeftRight</span>,
}));

import { TradesPage, TradeCard, LeagueTradeCard } from "../pages/TradesPage";

const mockTrades = [
  {
    id: 1,
    status: "PROPOSED",
    proposingTeamId: 10,
    acceptingTeamId: 20,
    proposingTeam: { name: "Aces", ownerUserId: 1, ownerships: [] },
    acceptingTeam: { name: "Bombers", ownerUserId: 2, ownerships: [] },
    items: [
      { id: 100, senderTeamId: 10, assetType: "PLAYER", player: { name: "Mike Trout", posPrimary: "CF" } },
      { id: 101, senderTeamId: 20, assetType: "PLAYER", player: { name: "Mookie Betts", posPrimary: "RF" } },
    ],
    createdAt: "2025-06-01T00:00:00Z",
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <TradesPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mockGetTrades.mockResolvedValue({ trades: mockTrades });
});

describe("TradesPage", () => {
  it("renders page header", () => {
    renderPage();
    expect(screen.getByText("Trade Negotiation Hub")).toBeInTheDocument();
  });

  it("renders subtitle", () => {
    renderPage();
    expect(screen.getByText(/View current proposals/)).toBeInTheDocument();
  });

  it("shows loading skeleton initially", () => {
    mockGetTrades.mockReturnValue(new Promise(() => {}));
    renderPage();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows error state when API fails", async () => {
    mockGetTrades.mockRejectedValue(new Error("Server down"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Server down/)).toBeInTheDocument();
    });
  });

  it("renders active trades after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Active Trades")).toBeInTheDocument();
    });
  });

  it("shows trade status badge", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("PROPOSED")).toBeInTheDocument();
    });
  });

  it("shows empty state when no trades", async () => {
    mockGetTrades.mockResolvedValue({ trades: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No active trade proposals")).toBeInTheDocument();
    });
  });

  it("calls getTrades with correct params", async () => {
    renderPage();
    await waitFor(() => {
      expect(mockGetTrades).toHaveBeenCalledWith(1, "my");
      expect(mockGetTrades).toHaveBeenCalledWith(1, "all");
    });
  });

  it("switches to League Activity tab", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Active Trades")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("League Activity"));

    expect(screen.getByText("League Trades")).toBeInTheDocument();
  });

  it("shows empty league activity state", async () => {
    mockGetTrades.mockResolvedValue({ trades: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No active trade proposals")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("League Activity"));

    expect(screen.getByText("No league trades found")).toBeInTheDocument();
  });
});

// --- Shared fixture for TradeCard / LeagueTradeCard tests ---

function makeTrade(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    leagueId: 1,
    proposerId: 10,
    status: "PROPOSED",
    createdAt: "2025-06-01T00:00:00Z",
    proposingTeamId: 10,
    acceptingTeamId: 20,
    proposingTeam: { id: 10, name: "Aces", ownerUserId: 1, ownerships: [] },
    acceptingTeam: { id: 20, name: "Bombers", ownerUserId: 2, ownerships: [] },
    items: [
      {
        id: 100,
        senderTeamId: 10,
        assetType: "PLAYER",
        playerId: 500,
        player: { id: 500, name: "Mike Trout", posPrimary: "CF" },
      },
      {
        id: 101,
        senderTeamId: 20,
        assetType: "BUDGET",
        amount: 5,
      },
    ],
    ...overrides,
  } as any;
}

// ==================== TradeCard ====================

describe("TradeCard", () => {
  it("renders trade details with team names, items, and status", () => {
    const trade = makeTrade();
    render(<TradeCard trade={trade} onRefresh={vi.fn()} currentUserId={1} />);

    expect(screen.getAllByText(/Aces/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bombers/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("PROPOSED")).toBeInTheDocument();
    expect(screen.getByText("CF Mike Trout")).toBeInTheDocument();
    expect(screen.getByText("$5 Budget")).toBeInTheDocument();
  });

  it("shows Cancel button for the proposer on pending trade", () => {
    const trade = makeTrade({ status: "PROPOSED" });
    render(<TradeCard trade={trade} onRefresh={vi.fn()} currentUserId={1} />);

    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.queryByText("Accept")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject")).not.toBeInTheDocument();
  });

  it("shows Accept and Reject buttons for the counterparty", () => {
    const trade = makeTrade({ status: "PROPOSED" });
    render(<TradeCard trade={trade} onRefresh={vi.fn()} currentUserId={2} />);

    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("hides action buttons for non-pending trades", () => {
    const trade = makeTrade({ status: "PROCESSED" });
    render(<TradeCard trade={trade} onRefresh={vi.fn()} currentUserId={1} />);

    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    expect(screen.queryByText("Accept")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject")).not.toBeInTheDocument();
    expect(screen.getByText("PROCESSED")).toBeInTheDocument();
  });

  it("calls cancelTrade and refreshes on Cancel click", async () => {
    const trade = makeTrade({ status: "PROPOSED" });
    const onRefresh = vi.fn();
    mockCancelTrade.mockResolvedValue({ success: true });

    render(<TradeCard trade={trade} onRefresh={onRefresh} currentUserId={1} />);
    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(mockCancelTrade).toHaveBeenCalledWith(1);
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("calls respondToTrade with ACCEPT on Accept click", async () => {
    const trade = makeTrade({ status: "PROPOSED" });
    const onRefresh = vi.fn();
    mockRespondToTrade.mockResolvedValue({});

    render(<TradeCard trade={trade} onRefresh={onRefresh} currentUserId={2} />);
    fireEvent.click(screen.getByText("Accept"));

    await waitFor(() => {
      expect(mockRespondToTrade).toHaveBeenCalledWith(1, "ACCEPT");
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("calls respondToTrade with REJECT on Reject click", async () => {
    const trade = makeTrade({ status: "PROPOSED" });
    const onRefresh = vi.fn();
    mockRespondToTrade.mockResolvedValue({});

    render(<TradeCard trade={trade} onRefresh={onRefresh} currentUserId={2} />);
    fireEvent.click(screen.getByText("Reject"));

    await waitFor(() => {
      expect(mockRespondToTrade).toHaveBeenCalledWith(1, "REJECT");
      expect(onRefresh).toHaveBeenCalled();
    });
  });
});

// ==================== LeagueTradeCard ====================

describe("LeagueTradeCard", () => {
  it("renders trade with team names and status badge", () => {
    const trade = makeTrade({ status: "ACCEPTED" });
    render(<LeagueTradeCard trade={trade} onRefresh={vi.fn()} currentUserId={99} />);

    expect(screen.getAllByText(/Aces/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bombers/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("ACCEPTED")).toBeInTheDocument();
  });

  it("shows commissioner reject/accept for uninvolved admin on PROPOSED trade", () => {
    const trade = makeTrade({ status: "PROPOSED" });
    render(
      <LeagueTradeCard trade={trade} onRefresh={vi.fn()} currentUserId={99} isAdmin={true} />
    );

    expect(screen.getByText("Commissioner Reject")).toBeInTheDocument();
    expect(screen.getByText("Commissioner Accept")).toBeInTheDocument();
  });

  it("hides commissioner controls when admin is involved in the trade", () => {
    const trade = makeTrade({ status: "PROPOSED" });
    render(
      <LeagueTradeCard trade={trade} onRefresh={vi.fn()} currentUserId={1} isAdmin={true} />
    );

    expect(screen.queryByText("Commissioner Reject")).not.toBeInTheDocument();
    expect(screen.queryByText("Commissioner Accept")).not.toBeInTheDocument();
  });

  it("shows Process Trade and Veto on ACCEPTED trade for admin", () => {
    const trade = makeTrade({ status: "ACCEPTED" });
    render(
      <LeagueTradeCard trade={trade} onRefresh={vi.fn()} currentUserId={99} isAdmin={true} />
    );

    expect(screen.getByText("Process Trade")).toBeInTheDocument();
    expect(screen.getByText("Commissioner Veto")).toBeInTheDocument();
  });

  it("calls processTrade on Process Trade click", async () => {
    const trade = makeTrade({ status: "ACCEPTED" });
    const onRefresh = vi.fn();
    mockProcessTrade.mockResolvedValue({ success: true });

    render(
      <LeagueTradeCard trade={trade} onRefresh={onRefresh} currentUserId={99} isAdmin={true} />
    );
    fireEvent.click(screen.getByText("Process Trade"));

    await waitFor(() => {
      expect(mockProcessTrade).toHaveBeenCalledWith(1);
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("calls vetoTrade on Commissioner Veto click", async () => {
    const trade = makeTrade({ status: "ACCEPTED" });
    const onRefresh = vi.fn();
    mockVetoTrade.mockResolvedValue({ success: true });

    render(
      <LeagueTradeCard trade={trade} onRefresh={onRefresh} currentUserId={99} isAdmin={true} />
    );
    fireEvent.click(screen.getByText("Commissioner Veto"));

    await waitFor(() => {
      expect(mockVetoTrade).toHaveBeenCalledWith(1);
      expect(onRefresh).toHaveBeenCalled();
    });
  });
});
