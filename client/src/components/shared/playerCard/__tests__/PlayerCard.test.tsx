import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20, myTeamId: 7 }),
}));
vi.mock("../playerCardApi", () => ({
  getPlayerCard: vi.fn(),
  getWatchlistMlbIds: vi.fn(),
  addWatchlist: vi.fn(),
  removeWatchlist: vi.fn(),
}));

import * as api from "../playerCardApi";
import { PlayerCardProvider, PlayerLink } from "../PlayerCardProvider";
import type { PlayerCardData } from "../playerCardApi";

const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const hitter: PlayerCardData = {
  mlbId: 1, playerId: 11, name: "Mookie Betts", pos: "SS", mlbTeam: "LAD",
  isPitcher: false, isTwoWay: false, fantasyTeam: { id: 3, name: "Doyers", code: "DOY" },
  nextGame: { opp: "SD", home: true, startUtc: new Date(Date.now() + 3600_000).toISOString() },
  splits: {
    last7: { hitting: { atBats: 20, runs: 1, homeRuns: 1, rbi: 2, stolenBases: 0, avg: ".111" } },
    last14: {}, last30: {},
    season: { hitting: { atBats: 400, runs: 80, homeRuns: 25, rbi: 70, stolenBases: 9, avg: ".301" } },
    lastSeason: { hitting: null },
  },
  recent: { hitting: [{ date: "2026-06-14", opp: "SF", home: true, line: { hits: 2, atBats: 4, homeRuns: 1, rbi: 2, stolenBases: 0 } }] },
};
const pitcher: PlayerCardData = {
  ...hitter, mlbId: 2, playerId: 22, name: "Zack Wheeler", pos: "SP", isPitcher: true, nextGame: null,
  splits: {
    last7: {}, last14: {}, last30: {},
    season: { pitching: { inningsPitched: "180.0", wins: 12, saves: 0, strikeOuts: 200, era: "2.90", whip: "1.01" } },
    lastSeason: { pitching: null },
  },
  recent: { pitching: [{ date: "2026-06-13", opp: "COL", home: false, line: { inningsPitched: "6.0", hits: 4, earnedRuns: 1, strikeOuts: 8 } }] },
};
const offseason: PlayerCardData = {
  ...hitter, mlbId: 3, name: "Off Season",
  splits: {
    ...hitter.splits,
    season: { hitting: null },
    lastSeason: { hitting: { atBats: 500, runs: 90, homeRuns: 31, rbi: 99, stolenBases: 5, avg: ".280" } },
  },
};

function mount(player = hitter) {
  return render(
    <MemoryRouter>
      <PlayerCardProvider>
        <PlayerLink mlbId={1} name="Mookie Betts" />
        <PlayerLink mlbId={2} name="Zack Wheeler" />
        <PlayerLink mlbId={3} name="Off Season" />
      </PlayerCardProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  m.getPlayerCard.mockImplementation(async (id: number) => ({ 1: hitter, 2: pitcher, 3: offseason }[id]));
  m.getWatchlistMlbIds.mockResolvedValue(new Set<number>());
  m.addWatchlist.mockResolvedValue(undefined);
  m.removeWatchlist.mockResolvedValue(undefined);
});

describe("PlayerCard", () => {
  it("opens on Season and switches to Last 7 days", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Mookie Betts" }));
    await screen.findByText(".301");
    expect(screen.getByRole("button", { name: "Season" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Last 5 games")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    expect(screen.getByText(".111")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Last 14" }));
    expect(screen.getAllByText("No games yet").length).toBeGreaterThan(0);
  });

  it("pitcher shows IP W SV K ERA WHIP and Last 3 starts", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Zack Wheeler" }));
    await screen.findByText("2.90");
    for (const h of ["IP", "W", "SV", "K", "ERA", "WHIP"]) expect(screen.getAllByText(h).length).toBeGreaterThan(0);
    expect(screen.getByText("Last 3 starts")).toBeTruthy();
    expect(screen.getByText("@COL")).toBeTruthy();
  });

  it("off-season opens on Last season", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Off Season" }));
    await screen.findByText(".280");
    expect(screen.getByRole("button", { name: "Last season" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opening a second player replaces the first", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Mookie Betts" }));
    await screen.findByText(".301");
    fireEvent.click(screen.getByRole("button", { name: "Zack Wheeler" }));
    await screen.findByText("2.90");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Zack Wheeler");
  });

  it("Escape closes and focus returns to the name", async () => {
    mount();
    const link = screen.getByRole("button", { name: "Mookie Betts" });
    link.focus();
    fireEvent.click(link);
    await screen.findByText(".301");
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(link);
  });

  it("fetch failure shows retry copy", async () => {
    m.getPlayerCard.mockRejectedValueOnce(new Error("boom"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Mookie Betts" }));
    await screen.findByText("Couldn't load stats. Try again.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText(".301");
  });

  it("watchlist star toggles", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Mookie Betts" }));
    await screen.findByText(".301");
    const star = await screen.findByRole("button", { name: "Add to watchlist" });
    await act(async () => { fireEvent.click(star); });
    expect(m.addWatchlist).toHaveBeenCalledWith(7, 11);
    const on = await screen.findByRole("button", { name: "Remove from watchlist" });
    await act(async () => { fireEvent.click(on); });
    expect(m.removeWatchlist).toHaveBeenCalledWith(7, 11);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add to watchlist" })).toBeTruthy());
  });
});
