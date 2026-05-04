import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../Home";
import { getSeasonStandings } from "../../api";
import { fetchJsonApi } from "../../api/base";
import { getTransactions } from "../../features/transactions/api";
import { getTrades } from "../../features/trades/api";
import { getBoardCards } from "../../features/board/api";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: { id: 1, name: "James" } } }),
}));

vi.mock("../../contexts/LeagueContext", () => ({
  useLeague: () => ({
    leagueId: 20,
    currentLeagueName: "OGBA",
    currentSeason: 2026,
    myTeamId: 101,
    myTeamCode: "LDY",
  }),
}));

vi.mock("../../api", () => ({
  getSeasonStandings: vi.fn(),
}));

vi.mock("../../api/base", () => ({
  API_BASE: "/api",
  fetchJsonApi: vi.fn(),
}));

vi.mock("../../features/transactions/api", () => ({
  getTransactions: vi.fn(),
}));

vi.mock("../../features/trades/api", () => ({
  getTrades: vi.fn(),
  cancelTrade: vi.fn(),
}));

vi.mock("../../features/board/api", () => ({
  getBoardCards: vi.fn(),
}));

vi.mock("../components/MyTeamTodayPanel", () => ({
  default: ({ leagueId }: { leagueId: number }) => <section>My Team Today {leagueId}</section>,
}));

vi.mock("../components/HistoricalInsightsTab", () => ({
  default: ({ leagueId }: { leagueId: number }) => <section>Weekly Insights {leagueId}</section>,
}));

vi.mock("../components/NewsFeedsPanel", () => ({
  default: ({ compact, limit }: { compact?: boolean; limit?: number }) => (
    <section data-testid="news-panel">
      Around the League compact:{String(Boolean(compact))} limit:{limit}
    </section>
  ),
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getSeasonStandings).mockResolvedValue({
    periodIds: [1, 2],
    rows: [
      { teamId: 101, teamName: "Los Doyers", teamCode: "LDY", owner: "James", periodPoints: [30, 28], P1: 30, P2: 28 },
      { teamId: 202, teamName: "Demolition Lumber Co.", teamCode: "DLC", owner: "DLC Owner", periodPoints: [35, 31], P1: 35, P2: 31 },
    ],
  } as any);

  vi.mocked(getTransactions).mockResolvedValue({
    total: 2,
    transactions: [
      {
        id: 1,
        leagueId: 20,
        teamId: 202,
        playerId: 9,
        type: "ADD",
        amount: null,
        relatedTransactionId: null,
        submittedAt: "2026-05-02T12:00:00.000Z",
        processedAt: null,
        status: "APPROVED",
        team: { name: "Dodger Dawgs" },
        transactionRaw: "Claimed Dominic Smith",
      },
    ],
  } as any);

  vi.mocked(getTrades).mockResolvedValue({
    trades: [
      {
        id: 55,
        leagueId: 20,
        proposerId: 101,
        proposingTeamId: 101,
        acceptingTeamId: 202,
        status: "PROPOSED",
        createdAt: "2026-05-03T10:00:00.000Z",
        items: [],
        proposingTeam: { id: 101, name: "Los Doyers", code: "LDY" },
        acceptingTeam: { id: 202, name: "Demolition Lumber Co.", code: "DLC" },
      },
    ],
  } as any);

  vi.mocked(getBoardCards).mockResolvedValue({
    total: 1,
    limit: 3,
    offset: 0,
    items: [
      {
        id: 7,
        leagueId: 20,
        userId: 1,
        column: "banter",
        title: "Trade block chatter",
        body: "Looking for steals and saves.",
        type: "user",
        metadata: {},
        pinned: false,
        periodId: null,
        expiresAt: null,
        thumbsUp: 0,
        thumbsDown: 0,
        createdAt: "2026-05-01T10:00:00.000Z",
        deletedAt: null,
        user: { id: 1, name: "James Chang", avatarUrl: null },
        replies: [],
        myVote: null,
        replyCount: 2,
      },
    ],
  });

  vi.mocked(fetchJsonApi).mockResolvedValue({ players: [] });
});

describe("Home dashboard", () => {
  it("renders compact league news, board summary, pending trade notice, and expanded quick links", async () => {
    renderHome();

    expect(await screen.findByText(/My Team Today 20/)).toBeInTheDocument();

    const news = screen.getByTestId("news-panel");
    expect(news).toHaveTextContent("compact:true");
    expect(news).toHaveTextContent("limit:5");

    expect(screen.getByText("League board")).toBeInTheDocument();
    expect(screen.getByText("Trade block chatter")).toBeInTheDocument();
    expect(screen.getByText("Looking for steals and saves.")).toBeInTheDocument();
    expect(screen.getByText("2 replies")).toBeInTheDocument();

    expect(screen.getByText(/Pending trade proposals · 1/)).toBeInTheDocument();
    expect(document.body).toHaveTextContent(/Los Doyers proposed a trade with Demolition Lumber Co\./);
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeInTheDocument();

    expect(screen.getByText("League activity")).toBeInTheDocument();
    expect(screen.getByText("Dodger Dawgs")).toBeInTheDocument();
    expect(screen.getByText("Claimed Dominic Smith")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /League Board/ })).toHaveAttribute("href", "/board");
    expect(screen.getByRole("link", { name: /Draft Report/ })).toHaveAttribute("href", "/draft-report");
    expect(screen.getByRole("link", { name: /Rules/ })).toHaveAttribute("href", "/rules");

    await waitFor(() => expect(getBoardCards).toHaveBeenCalledWith({ leagueId: 20, limit: 3 }));
  });
});
