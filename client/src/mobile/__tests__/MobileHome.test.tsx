import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileHome } from "../pages/MobileHome";
import { getSeasonStandings } from "../../api";
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

vi.mock("../../api", () => ({ getSeasonStandings: vi.fn() }));
vi.mock("../../features/transactions/api", () => ({ getTransactions: vi.fn() }));
vi.mock("../../features/trades/api", () => ({ getTrades: vi.fn() }));
vi.mock("../../features/board/api", () => ({ getBoardCards: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSeasonStandings).mockResolvedValue({
    periodIds: [1, 2],
    rows: [
      { teamId: 202, teamName: "Demolition Lumber Co.", teamCode: "DLC", owner: "DLC Owner", periodPoints: [35, 31], P1: 35, P2: 31 },
      { teamId: 101, teamName: "Los Doyers", teamCode: "LDY", owner: "James", periodPoints: [30, 28], P1: 30, P2: 28 },
      { teamId: 303, teamName: "Skunk Dogs", teamCode: "SKU", owner: "Skunk", periodPoints: [25, 22], P1: 25, P2: 22 },
    ],
  } as any);
  vi.mocked(getTransactions).mockResolvedValue({
    transactions: [
      { id: 1, type: "ADD", transactionType: "ADD", team: { name: "Los Doyers" }, ogbaTeamName: "Los Doyers", player: { name: "Marcus Semien" }, submittedAt: new Date(Date.now() - 60_000).toISOString() } as any,
      { id: 2, type: "DROP", transactionType: "DROP", team: { name: "Skunk Dogs" }, ogbaTeamName: "Skunk Dogs", player: { name: "Joey Gallo" }, submittedAt: new Date(Date.now() - 3_600_000).toISOString() } as any,
    ],
    total: 2,
  });
  vi.mocked(getTrades).mockResolvedValue({
    trades: [
      {
        id: 50,
        leagueId: 20,
        proposerId: 5,
        proposingTeamId: 5,
        status: "PROPOSED",
        items: [
          { senderId: 5, recipientId: 7, player: { id: 1, name: "Mookie Betts", posPrimary: "OF" } },
          { senderId: 7, recipientId: 5, player: { id: 2, name: "Tyler Glasnow", posPrimary: "SP" } },
        ],
        createdAt: new Date().toISOString(),
        proposingTeam: { id: 5, name: "Skunk Dogs", code: "SKU" },
        acceptingTeam: { id: 7, name: "Demolition Lumber Co.", code: "DLC" },
      } as any,
    ],
  });
  vi.mocked(getBoardCards).mockResolvedValue({
    items: [
      { id: 11, leagueId: 20, userId: 7, column: "ANNOUNCE", title: "Trade deadline reminder", body: null, type: "POST", metadata: null, pinned: false, periodId: null, expiresAt: null, thumbsUp: 2, thumbsDown: 0, createdAt: new Date().toISOString(), deletedAt: null, user: { id: 7, name: "Commish", avatarUrl: null }, replies: [], myVote: null, replyCount: 0 } as any,
    ],
    total: 1,
    limit: 3,
    offset: 0,
  });
});

function renderHome() {
  return render(
    <MemoryRouter>
      <MobileHome />
    </MemoryRouter>,
  );
}

describe("MobileHome", () => {
  it("renders the hero card with team name and total points", async () => {
    renderHome();
    // "Los Doyers" appears in both hero and top-5 row, "58.0" too — assert
    // the rank label (which is hero-only) plus that both names are rendered.
    expect(await screen.findByText(/Your team · 2nd of 3/i)).toBeInTheDocument();
    expect(screen.getAllByText("Los Doyers").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("58.0").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the standings top 5 with the user's team highlighted", async () => {
    renderHome();
    await screen.findByText("Demolition Lumber Co.");
    const rows = await screen.findAllByTestId("mobile-home-standings-row");
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const myRow = rows.find((r) => within(r).queryByText("YOU"));
    expect(myRow).toBeTruthy();
  });

  it("renders the activity feed with kind chips", async () => {
    renderHome();
    await waitFor(() => {
      expect(screen.getAllByTestId("mobile-home-activity-row").length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText("Add")).toBeInTheDocument();
    expect(screen.getByText("Drop")).toBeInTheDocument();
    expect(screen.getByText(/added Marcus Semien/)).toBeInTheDocument();
  });

  it("renders the Trade Proposals section with team names and player names", async () => {
    renderHome();
    // Header shows both team names linked with ↔
    expect(await screen.findByText(/Skunk Dogs.*↔.*Demolition Lumber Co\./)).toBeInTheDocument();
    // Player names from each side of the trade
    expect(screen.getByText("Mookie Betts")).toBeInTheDocument();
    expect(screen.getByText("Tyler Glasnow")).toBeInTheDocument();
    // Review CTA
    expect(screen.getByText(/Review →/)).toBeInTheDocument();
  });

  it("renders the League Board section with card title and metadata", async () => {
    renderHome();
    // Board card title
    expect(await screen.findByText("Trade deadline reminder")).toBeInTheDocument();
    // Author name
    expect(screen.getByText("Commish")).toBeInTheDocument();
  });

  it("renders the View roster link to the user's team", async () => {
    renderHome();
    const link = await screen.findByTestId("mobile-home-view-roster");
    expect(link).toHaveAttribute("href", "/teams/LDY");
  });
});
