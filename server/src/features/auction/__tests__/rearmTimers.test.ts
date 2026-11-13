/**
 * Timers live only in memory. A restart mid-auction (Railway redeploy) used to
 * reload the saved state with no lot timer and no turn clock, so the lot never
 * sold and the team choosing never timed out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { loadState, seasonStatus, sessions } = vi.hoisted(() => ({
  loadState: vi.fn(),
  seasonStatus: vi.fn(),
  sessions: vi.fn(),
}));

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn().mockResolvedValue([]) },
    league: { findUnique: vi.fn().mockResolvedValue({ season: 2026 }) },
    leagueRule: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
    player: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    auctionSession: { findMany: sessions },
  },
}));
vi.mock("../../../lib/logger.js", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../lib/rosterGuard.js", () => ({ assertPlayerAvailable: vi.fn() }));
vi.mock("../../../middleware/seasonGuard.js", () => ({ getCurrentSeasonStatus: seasonStatus }));
vi.mock("../services/auctionWsService.js", () => ({ broadcastState: vi.fn() }));
vi.mock("../services/auctionPersistence.js", () => ({
  saveState: vi.fn().mockResolvedValue(undefined),
  loadState,
  clearState: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../../db/prisma.js";
import {
  auctionStates, autoFinishTimers, nominationTimers, createDefaultState, getState,
  rehydrateLiveAuctions, clearAutoFinishTimer, clearNominationTimer,
} from "../lib/auctionStateManager.js";
import type { AuctionState } from "../types.js";

const NOW = new Date("2026-11-13T20:00:00Z").getTime();
const L = 7;

function saved(over: Partial<AuctionState>): AuctionState {
  return { ...createDefaultState(L), queue: [1, 2], ...over };
}
function liveLot(endOffsetMs: number): AuctionState {
  return saved({
    status: "bidding",
    nomination: {
      playerId: "660271", playerName: "Shohei Ohtani", playerTeam: "LAD", positions: "DH",
      isPitcher: false, nominatorTeamId: 1, currentBid: 5, highBidderTeamId: 1,
      endTime: new Date(NOW + endOffsetMs).toISOString(), timerDuration: 15, status: "running",
    } as AuctionState["nomination"],
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  seasonStatus.mockResolvedValue("DRAFT");
  for (const id of [...auctionStates.keys()]) { clearAutoFinishTimer(id); clearNominationTimer(id); }
  auctionStates.clear();
});
afterEach(() => vi.useRealTimers());

describe("restarting auction timers after a cold load", () => {
  it("a running lot keeps the time it had left, then sells", async () => {
    loadState.mockResolvedValue(liveLot(8_000));
    const state = await getState(L);
    expect(autoFinishTimers.has(L)).toBe(true);
    expect(state.nomination!.endTime).toBe(new Date(NOW + 8_000).toISOString());

    await vi.advanceTimersByTimeAsync(7_900);
    expect(prisma.league.findUnique).not.toHaveBeenCalled(); // finishCurrentLot not run yet
    await vi.advanceTimersByTimeAsync(200);
    expect(prisma.league.findUnique).toHaveBeenCalled(); // the lot is being sold
  });

  it("a lot whose time ran out while the server was down gets a fresh bid timer", async () => {
    loadState.mockResolvedValue(liveLot(-60_000));
    const state = await getState(L);
    expect(autoFinishTimers.has(L)).toBe(true);
    expect(state.nomination!.endTime).toBe(new Date(NOW + 15_000).toISOString());
    await vi.advanceTimersByTimeAsync(14_900);
    expect(prisma.league.findUnique).not.toHaveBeenCalled();
  });

  it("the team choosing a player gets a fresh turn clock", async () => {
    loadState.mockResolvedValue(saved({ status: "nominating", nominationEndTime: new Date(NOW - 5_000).toISOString() }));
    const state = await getState(L);
    expect(nominationTimers.has(L)).toBe(true);
    expect(state.nominationEndTime).toBe(new Date(NOW + 30_000).toISOString());
  });

  it("nothing restarts while paused", async () => {
    loadState.mockResolvedValue({ ...liveLot(8_000), paused: true });
    await getState(L);
    expect(autoFinishTimers.has(L)).toBe(false);
    expect(nominationTimers.has(L)).toBe(false);
  });

  it("nothing restarts outside the DRAFT season (a stale state must never sell)", async () => {
    seasonStatus.mockResolvedValue("IN_SEASON");
    loadState.mockResolvedValue(liveLot(8_000));
    await getState(L);
    expect(autoFinishTimers.has(L)).toBe(false);
  });

  it("two requests racing after a restart share one load and one state", async () => {
    loadState.mockResolvedValue(saved({ status: "nominating" }));
    const [a, b] = await Promise.all([getState(L), getState(L)]);
    expect(a).toBe(b);
    expect(loadState).toHaveBeenCalledTimes(1);
  });
});

describe("rehydrateLiveAuctions (on boot)", () => {
  it("loads only auctions that were live", async () => {
    sessions.mockResolvedValue([
      { leagueId: 7, state: { status: "nominating" } },
      { leagueId: 8, state: { status: "completed" } },
      { leagueId: 9, state: { status: "bidding" } },
      { leagueId: 10, state: { status: "not_started" } },
    ]);
    loadState.mockImplementation(async (id: number) => saved({ leagueId: id, status: id === 7 ? "nominating" : "completed" }));
    expect(await rehydrateLiveAuctions()).toEqual([7, 9]);
    expect(loadState.mock.calls.map(c => c[0])).toEqual([7, 9]);
    expect(nominationTimers.has(7)).toBe(true);
  });
});
