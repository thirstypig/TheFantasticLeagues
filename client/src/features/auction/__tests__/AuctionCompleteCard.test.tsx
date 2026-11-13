/**
 * Post-auction report (design review 2026-11-12, suggestion 2): results by
 * team are rows that open to the roster; player names open the player card
 * with the right MLB id; full team names, no codes.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const openCard = vi.fn();
vi.mock("../../../components/shared/playerCard/PlayerCardProvider", () => ({
  usePlayerCard: () => ({ open: openCard, close: vi.fn() }),
  // Mirrors the real PlayerLink: a button only when there is an mlbId, plain text otherwise.
  PlayerLink: ({ mlbId, name }: { mlbId?: number | null; name: string }) =>
    mlbId ? <button onClick={() => openCard(mlbId)}>{name}</button> : <span>{name}</span>,
}));
vi.mock("../../../api", () => ({
  getPlayerSeasonStatsMeta: vi.fn().mockResolvedValue({
    stats: [{ mlb_id: "660271", player_name: "Test Hitter", positions: "OF", is_pitcher: false }],
    computedAt: null,
  }),
}));
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1, outfieldMode: "OF" }),
}));
vi.mock("../../../lib/posthog", () => ({ track: vi.fn() }));
vi.mock("../components/AuctionReplay", () => ({ default: () => null }));
vi.mock("../components/BidHistoryChart", () => ({ default: () => null }));
vi.mock("../components/DraftReport", () => ({ default: () => null }));

import AuctionComplete, { teamDetail } from "../components/AuctionComplete";

const auctionState = {
  leagueId: 1,
  status: "completed",
  nomination: null,
  queue: [],
  queueIndex: 0,
  config: { bidTimer: 30, nominationTimer: 30, budgetCap: 400 },
  log: [],
  lastUpdate: 0,
  teams: [
    {
      id: 5, name: "Los Doyers", code: "LDY", budget: 100, maxBid: 50, rosterCount: 4, spotsLeft: 0,
      keeperSpend: 10, auctionSpend: 28,
      roster: [
        { id: 1, playerId: 11, playerName: "Test Hitter", price: 20, assignedPosition: "OF", mlbTeam: "LAD", source: "auction" },
        { id: 2, playerId: 77, playerName: "No Stats Guy", price: 5, assignedPosition: "OF", source: "auction" },
        { id: 3, playerId: 88, mlbId: 543037, playerName: "Id Only Guy", price: 3, assignedPosition: "C", source: "auction" },
        { id: 4, playerId: 99, mlbId: 111, playerName: "Old Arm", price: 10, assignedPosition: "SP", source: "prior_season" },
      ],
    },
    {
      id: 6, name: "Devil Dawgs", code: "DVD", budget: 400, maxBid: 300, rosterCount: 1, spotsLeft: 0,
      keeperSpend: 0, auctionSpend: 450,
      roster: [{ id: 5, playerId: 12, mlbId: 222, playerName: "Pricey Guy", price: 450, assignedPosition: "1B", source: "auction" }],
    },
  ],
} as never;

beforeEach(() => openCard.mockClear());

async function openTeam(name: RegExp) {
  render(<AuctionComplete auctionState={auctionState} myTeamId={5} />);
  await new Promise((r) => setTimeout(r, 0)); // let the stats lookup resolve
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("results by team", () => {
  it("one row per team, highest total first, full names and no team codes", () => {
    render(<AuctionComplete auctionState={auctionState} myTeamId={5} />);
    const rows = screen.getAllByTestId("team-result");
    expect(rows.map((r) => within(r).getByRole("button").textContent)).toEqual([
      "Devil Dawgs1 player · $450 auction$450-$50 left▾",
      "Los DoyersYou4 players · $10 keepers · $28 auction$38$362 left▾",
    ]);
    expect(screen.queryByText("LDY")).toBeNull();
    expect(screen.queryByText("DVD")).toBeNull();
  });

  it("over budget shows the left amount flagged", () => {
    render(<AuctionComplete auctionState={auctionState} />);
    expect(screen.getByText("-$50 left")).toHaveClass("over");
    expect(screen.getByText("$362 left")).not.toHaveClass("over");
  });

  it("a row opens and closes its roster, hitters then pitchers, keeper labelled", async () => {
    await openTeam(/^Los Doyers/);
    const row = screen.getByRole("button", { name: /^Los Doyers/ });
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Hitters · 3")).toBeInTheDocument();
    expect(screen.getByText("Pitchers · 1")).toBeInTheDocument();
    expect(screen.getByText("SP · keeper")).toBeInTheDocument();
    // position order: C before OF
    const names = Array.from(document.querySelectorAll(".ar-player b")).map((b) => b.textContent);
    expect(names).toEqual(["Id Only Guy", "Test Hitter", "No Stats Guy", "Old Arm"]);
    fireEvent.click(row);
    expect(screen.queryByText("Hitters · 3")).toBeNull();
  });

  it("teamDetail drops keepers when there are none", () => {
    expect(teamDetail({ roster: [{} as never], keeperSpend: 0, auctionSpend: 7 })).toBe("1 player · $7 auction");
  });
});

describe("player card", () => {
  it("a player without a roster mlbId opens the card with the stats row's mlbId", async () => {
    await openTeam(/^Los Doyers/);
    fireEvent.click(await screen.findByRole("button", { name: "Test Hitter" }));
    expect(openCard).toHaveBeenCalledWith(660271);
  });

  it("a player with no stats row and no mlbId is plain text, never the Prisma playerId", async () => {
    await openTeam(/^Los Doyers/);
    expect(screen.queryByRole("button", { name: "No Stats Guy" })).toBeNull();
    expect(screen.getByText("No Stats Guy")).toBeInTheDocument();
  });

  it("a player with a roster mlbId opens the card with that mlbId", async () => {
    await openTeam(/^Los Doyers/);
    fireEvent.click(screen.getByRole("button", { name: "Id Only Guy" }));
    expect(openCard).toHaveBeenCalledWith(543037);
  });
});
