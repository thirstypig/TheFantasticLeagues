/**
 * C2 + C3 (UX step F final fix wave): the report pages must not count sales
 * the commissioner undid, and the header must not claim every roster is full
 * when the auction was ended with open spots.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../components/shared/playerCard/PlayerCardProvider", () => ({
  usePlayerCard: () => ({ open: vi.fn(), close: vi.fn() }),
  PlayerLink: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock("../../../api", () => ({
  getPlayerSeasonStatsMeta: vi.fn().mockResolvedValue({ stats: [], computedAt: null }),
}));
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1, outfieldMode: "OF" }),
}));
vi.mock("../../../lib/posthog", () => ({ track: vi.fn() }));
vi.mock("../components/AuctionReplay", async (orig) => ({ ...(await orig<object>()), default: () => null }));
vi.mock("../components/BidHistoryChart", async (orig) => ({ ...(await orig<object>()), default: () => null }));
vi.mock("../components/DraftReport", () => ({ default: () => null }));
const xlsx = vi.hoisted(() => ({
  utils: { book_new: vi.fn(() => ({})), json_to_sheet: vi.fn((rows: unknown) => rows), book_append_sheet: vi.fn() },
  writeFile: vi.fn(),
}));
vi.mock("xlsx", () => xlsx);

import AuctionComplete from "../components/AuctionComplete";
import { buildLots } from "../components/AuctionReplay";
import { buildLotData } from "../components/BidHistoryChart";

// Newest first, as the server stores it. Alonso was sold, then undone.
const log = [
  { type: "UNDO", teamId: 2, teamName: "Beta", playerId: "624413", playerName: "Pete Alonso", amount: 21, rosterId: 902, timestamp: 9, message: "" },
  { type: "WIN", teamId: 2, teamName: "Beta", playerId: "624413", playerName: "Pete Alonso", amount: 21, rosterId: 902, saleKind: "lot", undone: true, timestamp: 8, message: "" },
  { type: "BID", teamId: 2, teamName: "Beta", playerName: "Pete Alonso", amount: 21, timestamp: 7, message: "" },
  { type: "NOMINATION", teamId: 1, teamName: "Alpha", playerId: "624413", playerName: "Pete Alonso", amount: 1, timestamp: 6, message: "" },
  { type: "WIN", teamId: 1, teamName: "Alpha", playerId: "656941", playerName: "Kyle Schwarber", amount: 14, rosterId: 901, saleKind: "lot", timestamp: 5, message: "" },
  { type: "BID", teamId: 1, teamName: "Alpha", playerName: "Kyle Schwarber", amount: 14, timestamp: 4, message: "" },
  { type: "NOMINATION", teamId: 2, teamName: "Beta", playerId: "656941", playerName: "Kyle Schwarber", amount: 1, timestamp: 3, message: "" },
];

function stateWith(rosterSize: number, rostersFull: boolean) {
  const keeper = (id: number) => ({ id, playerId: id, playerName: `Keeper ${id}`, price: 10, assignedPosition: "OF", source: "prior_season" });
  return {
    leagueId: 1, status: "completed", nomination: null, queue: [], queueIndex: 0, lastUpdate: 0,
    config: { bidTimer: 30, nominationTimer: 30, budgetCap: 400, rosterSize },
    log,
    teams: [
      { id: 1, name: "Alpha", code: "ALP", budget: 400, roster: rostersFull ? [keeper(1), keeper(2)] : [keeper(1)] },
      { id: 2, name: "Beta", code: "BET", budget: 400, roster: [keeper(3), keeper(4)] },
    ],
  } as never;
}

beforeEach(() => vi.clearAllMocks());

describe("C2: undone sales are not counted", () => {
  it("bid history: the undone lot is gone, so 1 lot and avg price $14", () => {
    const lots = buildLotData(log as never);
    expect(lots.map((l) => l.playerName)).toEqual(["Kyle Schwarber"]);
    expect(lots.reduce((s, l) => s + l.finalPrice, 0) / lots.length).toBe(14);
  });

  it("replay: the undone lot is gone and the earlier sale is NOT popped by its UNDO", () => {
    const lots = buildLots(log as never);
    expect(lots.map((l) => l.playerName)).toEqual(["Kyle Schwarber"]);
  });

  it("replay: a legacy UNDO (no rosterId, WIN not marked undone) still removes the last lot", () => {
    const legacy = log.map((e) => {
      const { undone: _u, rosterId: _r, ...rest } = e as Record<string, unknown>;
      return rest;
    });
    expect(buildLots(legacy as never).map((l) => l.playerName)).toEqual(["Kyle Schwarber"]);
  });

  it("Excel 'All Picks' leaves out the undone sale", async () => {
    render(<AuctionComplete auctionState={stateWith(2, true)} />);
    fireEvent.click(screen.getByRole("button", { name: /Export to Excel/ }));
    await waitFor(() => expect(xlsx.writeFile).toHaveBeenCalled());
    const picks = xlsx.utils.json_to_sheet.mock.calls.map((c) => c[0] as Array<Record<string, unknown>>)
      .find((rows) => rows.length > 0 && "Pick" in rows[0]);
    expect(picks).toEqual([{ Pick: 1, Player: "Kyle Schwarber", Team: "Alpha", Price: 14 }]);
  });
});

describe("C3: report header", () => {
  it("every roster full: 'All rosters filled.'", () => {
    render(<AuctionComplete auctionState={stateWith(2, true)} />);
    expect(screen.getByText("All rosters filled.")).toBeInTheDocument();
  });

  it("ended with open spots: 'Auction ended · {n} spots left open'", () => {
    render(<AuctionComplete auctionState={stateWith(3, false)} />);
    expect(screen.queryByText("All rosters filled.")).toBeNull();
    // rosterSize 3: Alpha has 1 (2 open), Beta has 2 (1 open)
    expect(screen.getByText("Auction ended · 3 spots left open")).toBeInTheDocument();
  });

  it("'lots sold' counts auction sales (non-undone WINs), not roster rows with keepers", () => {
    render(<AuctionComplete auctionState={stateWith(2, true)} />);
    expect(screen.getByTestId("stat-lots").textContent).toBe("1lots sold");
  });
});
