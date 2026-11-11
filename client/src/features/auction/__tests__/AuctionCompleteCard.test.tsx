import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const openCard = vi.fn();
vi.mock("../../../components/shared/playerCard/PlayerCardProvider", () => ({
  usePlayerCard: () => ({ open: openCard, close: vi.fn() }),
  PlayerLink: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock("../../../api", () => ({
  getPlayerSeasonStatsMeta: vi.fn().mockResolvedValue({
    stats: [{ mlb_id: "660271", player_name: "Test Hitter", positions: "OF", is_pitcher: false }],
    computedAt: null,
  }),
}));
vi.mock("../../teams/api", () => ({
  getTradeBlock: vi.fn().mockResolvedValue({ playerIds: [] }),
  saveTradeBlock: vi.fn(),
  getLeagueTradeBlocks: vi.fn().mockResolvedValue({ tradeBlocks: {} }),
}));
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1, outfieldMode: "OF" }),
}));
vi.mock("../../../lib/posthog", () => ({ track: vi.fn() }));
vi.mock("../components/AuctionReplay", () => ({ default: () => null }));
vi.mock("../components/BidHistoryChart", () => ({ default: () => null }));
vi.mock("../components/DraftReport", () => ({ default: () => null }));
vi.mock("../components/PlayerExpandedRow", () => ({
  default: ({ player, onViewDetail }: any) => (
    <tr><td><button onClick={() => onViewDetail(player)}>view detail</button></td></tr>
  ),
}));

import AuctionComplete from "../components/AuctionComplete";
import AuctionCompleteLegacy from "../components/AuctionCompleteLegacy";

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
      id: 5, name: "Doyers", code: "DOY", budget: 100, maxBid: 50, rosterCount: 1, spotsLeft: 0,
      roster: [
        { id: 1, playerId: 11, playerName: "Test Hitter", price: 20, assignedPosition: "OF", source: "auction" },
        { id: 2, playerId: 77, playerName: "No Stats Guy", price: 5, assignedPosition: "OF", source: "auction" },
        { id: 3, playerId: 88, mlbId: 543037, playerName: "Id Only Guy", price: 3, assignedPosition: "OF", source: "auction" },
      ],
    },
  ],
} as never;

beforeEach(() => openCard.mockClear());

describe.each([
  ["AuctionComplete", AuctionComplete],
  ["AuctionCompleteLegacy", AuctionCompleteLegacy],
])("%s player card", (_name, Component) => {
  it("View detail on an expanded roster row opens the card for the stats row's mlbId", async () => {
    const C = Component as React.ComponentType<{ auctionState: never }>;
    render(<C auctionState={auctionState} />);
    fireEvent.click(await screen.findByText("Doyers"));
    // let the stats lookup resolve so the row carries the real mlb_id
    await screen.findByText("Test Hitter");
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByText("Test Hitter"));
    fireEvent.click(await screen.findByRole("button", { name: "view detail" }));
    expect(openCard).toHaveBeenCalledWith(660271);
  });

  it("a roster player with no stats row never opens the card with the Prisma playerId", async () => {
    const C = Component as React.ComponentType<{ auctionState: never }>;
    render(<C auctionState={auctionState} />);
    fireEvent.click(await screen.findByText("Doyers"));
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(await screen.findByText("No Stats Guy"));
    fireEvent.click(await screen.findByRole("button", { name: "view detail" }));
    expect(openCard).not.toHaveBeenCalled();
  });

  it("a roster player with no stats row but a roster mlbId opens the card with that mlbId", async () => {
    const C = Component as React.ComponentType<{ auctionState: never }>;
    render(<C auctionState={auctionState} />);
    fireEvent.click(await screen.findByText("Doyers"));
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(await screen.findByText("Id Only Guy"));
    fireEvent.click(await screen.findByRole("button", { name: "view detail" }));
    expect(openCard).toHaveBeenCalledWith(543037);
  });
});
