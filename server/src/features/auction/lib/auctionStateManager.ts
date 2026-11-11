import { Request } from "express";
import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import { writeAuditLog } from "../../../lib/auditLog.js";
import { assertPlayerAvailable } from "../../../lib/rosterGuard.js";
import { positionToSlots, PITCHER_CODES_SET as PITCHER_CODES, isPitcher as isPitcherPos } from "../../../lib/sportConfig.js";
import { broadcastState } from "../services/auctionWsService.js";
import { saveState, loadState, clearState } from "../services/auctionPersistence.js";

import { sanitizeStateForBroadcast } from "./sanitizeState.js";

import type { AuctionState } from "../types.js";

// Strips proxy bids and my-lists; lives in a dependency-free module so the
// WebSocket service can share it without an import cycle.
export { sanitizeStateForBroadcast };

// Re-export for external consumers that import from this module
export { clearState };

// --- In-Memory Store (scoped per league) ---
// Backed by DB persistence — hydrates from AuctionSession on cold read.
export const auctionStates = new Map<number, AuctionState>();

// --- Server-Side Timers ---
export const autoFinishTimers = new Map<number, NodeJS.Timeout>();
export const nominationTimers = new Map<number, NodeJS.Timeout>();

// --- Concurrent Finish Protection ---
export const finishLocks = new Map<number, boolean>();

// --- Concurrent Nominate Protection ---
// Held by nominatePlayer from its first line (before any await) until it
// returns, so a manual /nominate and the turn-timeout auto-put-up can never
// both create a lot for the same turn.
export const nominateLocks = new Map<number, boolean>();

// Leagues whose turn clock ran out while a nomination held the lock. The
// timeout is deferred, not dropped: nominatePlayer runs it when that
// nomination fails (so a doomed /nominate at 0:00 can't buy a fresh clock).
// Cleared by clearNominationTimer, the choke point every pause/skip/init/
// reset/complete/resume path goes through.
export const timeoutPending = new Set<number>();

// Leagues whose timeout handler is running right now (from the clock firing
// until the handler settles). The turn counts as expired throughout, and a
// failed nomination in that window must not re-arm a fresh clock.
export const timeoutRunning = new Map<number, symbol>();

export function createDefaultState(leagueId: number): AuctionState {
  return {
    leagueId,
    status: "not_started",
    nomination: null,
    teams: [],
    queue: [],
    queueIndex: 0,
    nominationEndTime: null,
    paused: false,
    config: {
      sport: "baseball",
      bidTimer: 15, // seconds
      nominationTimer: 30,
      budgetCap: 400,
      rosterSize: 23,
      pitcherCount: 9,
      batterCount: 14,
      positionLimits: null,
    },
    log: [],
    lastUpdate: Date.now(),
  };
}

export async function getState(leagueId: number): Promise<AuctionState> {
  let state = auctionStates.get(leagueId);
  if (!state) {
    // Try to hydrate from DB
    const persisted = await loadState(leagueId);
    if (persisted) {
      // Backfill config fields for states persisted before this change
      if (!persisted.config.sport) persisted.config.sport = "baseball";
      if (!persisted.config.budgetCap) persisted.config.budgetCap = 400;
      if (!persisted.config.rosterSize) persisted.config.rosterSize = 23;
      // Backfill state fields added in UX step F. No timer survives a cold
      // load, so the turn clock is never running at this point.
      persisted.paused = persisted.paused ?? false;
      persisted.nominationEndTime = null;
      if (!persisted.config.positionLimits) {
        persisted.config.positionLimits = await loadPositionLimits(leagueId);
      }
      // Refresh teams from DB to ensure fresh budgets/rosters/position counts
      await refreshTeams(persisted);
      auctionStates.set(leagueId, persisted);
      return persisted;
    }
    state = createDefaultState(leagueId);
    auctionStates.set(leagueId, state);
  }
  return state;
}

/** Read leagueId from query (GET) or body (POST). */
export function readLeagueId(req: Request): number | null {
  const raw = req.body?.leagueId ?? req.query.leagueId;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Check if user is admin or commissioner for the given league. */
export async function isAdminOrCommissioner(req: Request, leagueId: number): Promise<boolean> {
  if (req.user!.isAdmin) return true;
  const m = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId: req.user!.id } },
    select: { role: true },
  });
  return m?.role === "COMMISSIONER";
}

// --- Helpers ---

export const calculateMaxBid = (budget: number, spots: number) => {
  if (spots <= 0) return 0;
  if (spots === 1) return budget;
  return Math.max(0, budget - (spots - 1));
};

/**
 * Advance queueIndex to the next team that still has roster spots.
 * Skips teams that are already full. Returns false if ALL teams are full.
 */
export function advanceQueue(state: AuctionState): boolean {
  const startIdx = state.queueIndex;
  let attempts = 0;
  do {
    state.queueIndex = (state.queueIndex + 1) % state.queue.length;
    attempts++;
    const teamId = state.queue[state.queueIndex];
    const team = state.teams.find(t => t.id === teamId);
    if (team && team.spotsLeft > 0) return true;
  } while (attempts < state.queue.length);
  // All teams full
  return false;
}

/** Persist state to DB (fire-and-forget). */
export function persistState(leagueId: number, state: AuctionState): void {
  saveState(leagueId, state).catch((err) =>
    logger.error({ error: String(err), leagueId }, "Failed to persist auction state")
  );
}

export const refreshTeams = async (state: AuctionState) => {
  const teams = await prisma.team.findMany({
    where: { leagueId: state.leagueId },
    include: {
      rosters: {
        where: { releasedAt: null },
        include: { player: { select: { id: true, name: true, posPrimary: true, posList: true, mlbId: true, mlbTeam: true } } }
      }
    },
    orderBy: { id: 'asc' }
  });

  const budgetCap = state.config.budgetCap;
  const rosterSize = state.config.rosterSize;

  state.teams = teams.map(t => {
    const spent = t.rosters.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
    const count = t.rosters.length;
    // Use team's actual budget (reflects trade adjustments) instead of league-wide budgetCap.
    // Team.budget starts at budgetCap and is adjusted by budget trades (increment/decrement).
    const teamBudget = t.budget ?? budgetCap;
    const remaining = teamBudget - spent;
    const spots = rosterSize - count;

    // Count pitchers/hitters and positions
    // Use assignedPosition if available (the actual roster slot filled),
    // otherwise fall back to player's primary position mapped to eligible slots.
    let pitchers = 0;
    let hitters = 0;
    const posCounts: Record<string, number> = {};
    for (const r of t.rosters) {
      const assignedPos = (r.assignedPosition ?? "").toUpperCase();
      const playerPos = (r.player?.posPrimary ?? "").toUpperCase();
      const isPitch = PITCHER_CODES.has(playerPos);
      if (isPitch) {
        pitchers++;
        posCounts["P"] = (posCounts["P"] || 0) + 1;
      } else {
        hitters++;
        if (assignedPos && assignedPos !== "BN") {
          // Use actual assigned slot — only count that one slot
          posCounts[assignedPos] = (posCounts[assignedPos] || 0) + 1;
        } else {
          // No assigned position yet — count the primary position slot only
          const primarySlot = positionToSlots(playerPos)[0];
          if (primarySlot) posCounts[primarySlot] = (posCounts[primarySlot] || 0) + 1;
        }
      }
    }

    // Keeper vs auction spend breakdown
    const keeperSpend = t.rosters
      .filter(r => r.source === "prior_season")
      .reduce((sum, r) => sum + (Number(r.price) || 0), 0);
    const auctionSpend = spent - keeperSpend;

    return {
      id: t.id,
      name: t.name,
      code: t.code || 'UNK',
      budget: remaining,
      dbBudget: teamBudget,  // raw DB budget (includes pre-draft trade adjustments)
      keeperSpend,
      auctionSpend,
      rosterCount: count,
      spotsLeft: spots,
      pitcherCount: pitchers,
      hitterCount: hitters,
      positionCounts: posCounts,
      maxBid: calculateMaxBid(remaining, spots),
      roster: t.rosters.map(r => ({
          id: r.id,
          playerId: r.playerId,
          mlbId: r.player?.mlbId ?? null,
          playerName: r.player?.name ?? null,
          posPrimary: r.player?.posPrimary ?? null,
          posList: r.player?.posList ?? r.player?.posPrimary ?? null,
          mlbTeam: r.player?.mlbTeam ?? null,
          price: Number(r.price),
          assignedPosition: r.assignedPosition,
          source: r.source ?? null,
      }))
    };
  });

  if (state.queue.length === 0) {
      state.queue = state.teams.map(t => t.id);
  }
};

/** Load budget/roster config from LeagueRule, falling back to defaults. */
export async function loadLeagueConfig(leagueId: number): Promise<{ budgetCap: number; rosterSize: number; pitcherCount: number; batterCount: number; bidTimer: number; nominationTimer: number }> {
  const rules = await prisma.leagueRule.findMany({
    where: {
      leagueId,
      key: { in: ["auction_budget", "pitcher_count", "batter_count", "bid_timer", "nomination_timer"] },
    },
    select: { key: true, value: true },
  });

  const ruleMap = new Map(rules.map(r => [r.key, r.value]));
  const budgetCap = Number(ruleMap.get("auction_budget")) || 400;
  const pitcherCount = Number(ruleMap.get("pitcher_count")) || 9;
  const batterCount = Number(ruleMap.get("batter_count")) || 14;
  const rosterSize = pitcherCount + batterCount;
  const bidTimer = Number(ruleMap.get("bid_timer")) || 15;
  const nominationTimer = Number(ruleMap.get("nomination_timer")) || 30;

  return { budgetCap, rosterSize, pitcherCount, batterCount, bidTimer, nominationTimer };
}

/** Load per-position roster limits from LeagueRule. */
export async function loadPositionLimits(leagueId: number): Promise<Record<string, number> | null> {
  const rule = await prisma.leagueRule.findUnique({
    where: { leagueId_category_key: { leagueId, category: "roster", key: "roster_positions" } },
  });
  if (!rule?.value) return null;
  try { return JSON.parse(rule.value); } catch { return null; }
}


/**
 * Check pitcher/hitter totals for a team during the auction.
 *
 * Per-position limits (C:2, OF:5, etc.) are NOT enforced during the draft —
 * they are informational for planning and enforced during in-season roster moves.
 * Enforces both pitcher/hitter totals AND per-position slot limits.
 * A player is only blocked when ALL eligible slots are full.
 * E.g., SS maps to [SS, MI] — blocked only when both SS and MI slots are filled.
 *
 * Uses in-memory auction state (refreshed after each lot finishes) instead of
 * querying the DB on every bid.
 */
export function checkPositionLimit(
  teamId: number,
  isPitcher: boolean,
  state: AuctionState,
  positions?: string,
): string | null {
  const teamObj = state.teams.find(t => t.id === teamId);
  if (!teamObj) return null;

  const pitcherMax = state.config.pitcherCount;
  const batterMax = state.config.batterCount;

  if (isPitcher && teamObj.pitcherCount >= pitcherMax) {
    return `Team already has ${pitcherMax} pitchers (max)`;
  }
  if (!isPitcher && teamObj.hitterCount >= batterMax) {
    return `Team already has ${batterMax} hitters (max)`;
  }

  // Per-position slot limits (hitters only — pitchers are all lumped under "P")
  if (!isPitcher && positions && state.config.positionLimits) {
    const posLimits = state.config.positionLimits;
    const primaryPos = positions.split(/[,\/]/)[0].trim().toUpperCase();
    const slots = positionToSlots(primaryPos);
    if (slots.length > 0) {
      const allFull = slots.every(slot => {
        const limit = posLimits[slot];
        if (limit === undefined) return false;
        return (teamObj.positionCounts[slot] ?? 0) >= limit;
      });
      if (allFull) {
        return `All eligible position slots full for ${primaryPos} (${slots.join(", ")})`;
      }
    }
  }

  return null;
}

/**
 * Process proxy bids after a manual bid lands.
 * If another team has a proxy bid higher than the current bid,
 * auto-bid on their behalf at currentBid + 1 (or their max if lower).
 * Returns true if a proxy bid was triggered (caller should broadcast).
 */
export function processProxyBids(state: AuctionState): boolean {
  const nom = state.nomination;
  if (!nom || nom.status !== 'running' || !nom.proxyBids) return false;

  // Find the highest proxy bid from a team OTHER than the current high bidder
  let bestTeamId: number | null = null;
  let bestMax = 0;

  for (const [teamIdStr, maxAmount] of Object.entries(nom.proxyBids)) {
    const teamId = Number(teamIdStr);
    if (teamId === nom.highBidderTeamId) continue; // skip current winner
    if (maxAmount <= nom.currentBid) continue; // can't outbid

    // Verify team can still afford it and has position room
    const team = state.teams.find(t => t.id === teamId);
    if (!team) continue;
    const effectiveMax = Math.min(maxAmount, team.maxBid);
    if (effectiveMax <= nom.currentBid) continue;

    const posErr = checkPositionLimit(teamId, nom.isPitcher, state, nom.positions);
    if (posErr) continue;

    if (effectiveMax > bestMax) {
      bestMax = effectiveMax;
      bestTeamId = teamId;
    }
  }

  if (bestTeamId === null) return false;

  // Auto-bid: just enough to win, or their max if that's all they need
  const autoBidAmount = Math.min(bestMax, nom.currentBid + 1);

  // But wait — if the current high bidder also has a proxy bid, we need to
  // resolve the two proxy bids against each other
  const currentHolderMax = nom.proxyBids[nom.highBidderTeamId] ?? nom.currentBid;
  if (currentHolderMax >= bestMax) {
    // Current holder's proxy wins — they auto-bid at bestMax + 1 (or their max)
    const counterBid = Math.min(currentHolderMax, bestMax + 1);
    if (counterBid > nom.currentBid) {
      nom.currentBid = counterBid;
      // highBidderTeamId stays the same
      const team = state.teams.find(t => t.id === nom.highBidderTeamId);

      // Persist bid to DB
      if (nom.lotId) {
        prisma.auctionBid.create({
          data: { lotId: nom.lotId, teamId: nom.highBidderTeamId, amount: counterBid },
        }).catch((err) => logger.error({ error: String(err) }, "Failed to persist proxy bid"));
      }

      state.log.unshift({
        type: 'BID',
        teamId: nom.highBidderTeamId,
        teamName: team?.name,
        playerName: nom.playerName,
        amount: counterBid,
        timestamp: Date.now(),
        message: `${team?.name || 'Team'} auto-bid $${counterBid}`
      });
    }
    // Remove the losing proxy bid since it's been exhausted
    delete nom.proxyBids[bestTeamId];
    return true;
  }

  // Challenger's proxy wins — they become the new high bidder
  // They bid at currentHolderMax + 1 (just enough to beat the current holder's proxy)
  const winningBid = Math.min(bestMax, currentHolderMax + 1);
  const previousHighBidder = nom.highBidderTeamId;
  nom.currentBid = winningBid;
  nom.highBidderTeamId = bestTeamId;

  const team = state.teams.find(t => t.id === bestTeamId);

  // Persist bid to DB
  if (nom.lotId) {
    prisma.auctionBid.create({
      data: { lotId: nom.lotId, teamId: bestTeamId, amount: winningBid },
    }).catch((err) => logger.error({ error: String(err) }, "Failed to persist proxy bid"));
  }

  state.log.unshift({
    type: 'BID',
    teamId: bestTeamId,
    teamName: team?.name,
    playerName: nom.playerName,
    amount: winningBid,
    timestamp: Date.now(),
    message: `${team?.name || 'Team'} auto-bid $${winningBid}`
  });

  // Remove the exhausted proxy bid of the previous holder
  delete nom.proxyBids[previousHighBidder];

  return true;
}

// --- Auto-Finish Timer ---

export function clearAutoFinishTimer(leagueId: number): void {
  const existing = autoFinishTimers.get(leagueId);
  if (existing) {
    clearTimeout(existing);
    autoFinishTimers.delete(leagueId);
  }
}

export function scheduleAutoFinish(leagueId: number, durationMs: number): void {
  clearAutoFinishTimer(leagueId);
  const timer = setTimeout(() => {
    autoFinishTimers.delete(leagueId);
    finishCurrentLot(leagueId).catch(err => {
      logger.error({ error: String(err), leagueId }, "Auto-finish failed");
    });
  }, durationMs);
  autoFinishTimers.set(leagueId, timer);
}

// --- Nomination Timer (Auto-Skip) ---

/** Stops the turn clock and clears the state's `nominationEndTime`. */
export function clearNominationTimer(leagueId: number): void {
  const existing = nominationTimers.get(leagueId);
  if (existing) {
    clearTimeout(existing);
    nominationTimers.delete(leagueId);
  }
  timeoutPending.delete(leagueId);
  const state = auctionStates.get(leagueId);
  if (state) state.nominationEndTime = null;
}

/**
 * Starts the current team's turn clock with full time and records its end in
 * `state.nominationEndTime`. While the auction is paused no clock runs; /resume
 * schedules it again. When the clock runs out, `handleNominationTimeout` puts
 * up the top eligible player on the team's list, or skips the turn.
 */
export function scheduleNominationTimer(leagueId: number, state: AuctionState): void {
  clearNominationTimer(leagueId);
  state.nominationEndTime = null;
  if (state.paused) return;
  const durationMs = state.config.nominationTimer * 1000;
  state.nominationEndTime = new Date(Date.now() + durationMs).toISOString();
  const timer = setTimeout(() => {
    nominationTimers.delete(leagueId);
    // nominationEndTime is deliberately kept: it marks the turn as expired
    // (isTurnTimeUp) until the turn resolves and the clock is cleared or reset.
    runNominationTimeout(leagueId, state);
  }, durationMs);
  nominationTimers.set(leagueId, timer);
}

/**
 * Run the timeout for the team on the clock. If the handler throws (e.g. a DB
 * error), fall back to the plain skip: the turn is already expired, so leaving
 * it would refuse every /nominate with no clock running.
 */
function runNominationTimeout(leagueId: number, state: AuctionState): void {
  const teamId = state.queue[state.queueIndex];
  const run = Symbol("nomination-timeout");
  timeoutRunning.set(leagueId, run);
  handleNominationTimeout(leagueId, state)
    .catch(err => {
      logger.error({ error: String(err), leagueId }, "Nomination timeout handling failed; skipping turn");
      if (isStillTurnOf(state, teamId) && !nominateLocks.get(leagueId)) {
        skipTurnOnTimeout(leagueId, state, teamId);
      }
    })
    .finally(() => {
      // Only clear our own mark, never a newer run's.
      if (timeoutRunning.get(leagueId) === run) timeoutRunning.delete(leagueId);
    });
}

/** True while `teamId` still holds an unpaused nominating turn. */
function isStillTurnOf(state: AuctionState, teamId: number): boolean {
  return state.status === 'nominating' && !state.paused && state.queue[state.queueIndex] === teamId;
}

/**
 * Turn clock ran out (Ruling 7). Walk the team's list in order and nominate
 * the first player that is in the Player table, not rostered in this league,
 * not already sold in this auction, and not blocked by the team's position
 * limits, at $1 through the shared `nominatePlayer` core. If none qualifies,
 * skip the turn (log SKIP, reason 'timeout') as before.
 *
 * The list itself is left untouched: a nominated player simply becomes
 * ineligible once sold.
 */
export async function handleNominationTimeout(leagueId: number, state: AuctionState): Promise<void> {
  const teamId = state.queue[state.queueIndex];
  if (!isStillTurnOf(state, teamId)) return;

  const list = state.nominationLists?.[teamId] ?? [];
  const candidate = list.length > 0 ? await findFirstEligible(leagueId, state, teamId, list) : null;

  // Something may have changed while we were querying (pause, manual
  // nomination, commissioner skip). Only act if the turn is still ours, and
  // never skip a turn while a manual nomination for it is mid-flight.
  if (!isStillTurnOf(state, teamId)) return;
  if (nominateLocks.get(leagueId)) {
    // A nomination for this turn is mid-flight: defer the timeout to it.
    timeoutPending.add(leagueId);
    return;
  }

  if (candidate) {
    const result = await nominatePlayer(
      leagueId, state, { ...candidate, nominatorTeamId: teamId, startBid: 1 }, { fromTimeout: true },
    );
    if (result.ok) {
      logger.info({ leagueId, teamId, playerId: candidate.playerId }, "Auto-nominated from list on turn timeout");
      return;
    }
    // Another nomination got there first, or the turn moved on: nothing to do.
    if (result.conflict) return;
    // A late validity check refused it. Fall through to the skip so the
    // auction never stalls on a team.
    logger.warn({ leagueId, teamId, error: result.error }, "Auto-nominate refused; skipping turn");
    if (!isStillTurnOf(state, teamId)) return;
    if (nominateLocks.get(leagueId)) {
      timeoutPending.add(leagueId);
      return;
    }
  }

  skipTurnOnTimeout(leagueId, state, teamId);
}

type NominationInput = Omit<NominatePlayerInput, 'nominatorTeamId' | 'startBid'>;

async function findFirstEligible(
  leagueId: number,
  state: AuctionState,
  teamId: number,
  list: number[],
): Promise<NominationInput | null> {
  const players = await prisma.player.findMany({
    where: { mlbId: { in: list } },
    select: { id: true, mlbId: true, name: true, posPrimary: true, posList: true, mlbTeam: true },
  });
  if (players.length === 0) return null;

  const rostered = await prisma.roster.findMany({
    where: { playerId: { in: players.map(p => p.id) }, team: { leagueId }, releasedAt: null },
    select: { playerId: true },
  });
  const rosteredIds = new Set(rostered.map(r => r.playerId));
  const soldMlbIds = soldInThisAuction(state);
  const byMlbId = new Map(players.map(p => [p.mlbId, p]));

  for (const mlbId of list) {
    const p = byMlbId.get(mlbId);
    if (!p) continue;                       // not in the Player table
    if (rosteredIds.has(p.id)) continue;    // rostered in this league
    if (soldMlbIds.has(mlbId)) continue;    // already sold in this auction
    const primary = (p.posPrimary ?? "").toUpperCase();
    const isPitcher = PITCHER_CODES.has(primary);
    // Primary first: checkPositionLimit reads the first listed position.
    const others = (p.posList ?? "").split(",").map(x => x.trim()).filter(x => x && x.toUpperCase() !== primary);
    const positions = [p.posPrimary, ...others].filter(Boolean).join(",") || (isPitcher ? "P" : "UT");
    if (checkPositionLimit(teamId, isPitcher, state, positions)) continue;
    return {
      playerId: String(mlbId),
      playerName: p.name,
      positions,
      team: p.mlbTeam ?? "",
      isPitcher,
    };
  }
  return null;
}

/** mlbIds already on a roster in this auction's in-memory team state. */
function soldInThisAuction(state: AuctionState): Set<number> {
  const ids = new Set<number>();
  for (const t of state.teams) {
    for (const r of t.roster) if (r.mlbId != null) ids.add(r.mlbId);
  }
  return ids;
}

/** Skip the timed-out team's turn: log SKIP, advance (or complete), broadcast, persist. */
function skipTurnOnTimeout(leagueId: number, state: AuctionState, teamId: number): void {
  const team = state.teams.find(t => t.id === teamId);
  state.log.unshift({
    type: 'SKIP',
    teamId,
    teamName: team?.name,
    reason: 'timeout',
    timestamp: Date.now(),
    message: `${team?.name ?? 'Team'} ran out of time; turn skipped`,
  });

  // Auto-advance queue index (skips full teams)
  if (!advanceQueue(state)) {
    // All teams full — auction complete
    clearNominationTimer(leagueId);
    state.status = 'completed';
    state.nomination = null;
    state.nominationEndTime = null;
    state.lastUpdate = Date.now();
    broadcastState(leagueId, state);
    persistState(leagueId, state);
    logger.info({ leagueId }, "Auction completed — all rosters full (nomination timer)");
    return;
  }
  // Start the next team's clock before broadcasting so clients see it
  scheduleNominationTimer(leagueId, state);
  state.lastUpdate = Date.now();
  broadcastState(leagueId, state);
  persistState(leagueId, state);
  logger.info({ leagueId, queueIndex: state.queueIndex }, "Auto-skipped nomination turn");
}

// --- Shared Nominate Core (POST /nominate + turn-timeout auto-put-up) ---

export interface NominatePlayerInput {
  nominatorTeamId: number;
  playerId: string;   // mlbId
  playerName: string;
  startBid: number;
  positions: string;
  team: string;       // MLB team abbreviation
  isPitcher: boolean;
}

/**
 * `conflict: true` means another nomination or a turn change won a race
 * (route maps it to 409); otherwise the request itself was invalid (400).
 */
export type NominatePlayerResult = { ok: true } | { ok: false; error: string; conflict: boolean };

export const NOMINATION_IN_PROGRESS = "Nomination already in progress";
export const TURN_NO_LONGER_ACTIVE = "Turn no longer active";
export const TIME_IS_UP = "Time is up";

/** Same grace /bid allows after a lot's end time. */
const TURN_GRACE_MS = 500;

/**
 * True once the current turn's clock has run out: a timeout is pending, or the
 * recorded end time is more than the grace in the past. After that the turn
 * belongs to the server (auto-put-up or skip); /nominate is refused, for
 * owners and commissioners alike (a commissioner can Skip instead).
 */
export function isTurnTimeUp(leagueId: number, state: AuctionState): boolean {
  if (timeoutPending.has(leagueId) || timeoutRunning.has(leagueId)) return true;
  if (!state.nominationEndTime) return false;
  return Date.now() > new Date(state.nominationEndTime).getTime() + TURN_GRACE_MS;
}

/**
 * Put a player up for bids. Holds ONLY the shared mechanics: budget, rostered,
 * already-sold and position checks, the AuctionLot row, nomination state,
 * clocks, log, broadcast and persist. Auth and phase/pause/turn checks belong
 * to the caller (the /nominate route, or the turn-timeout handler, which acts
 * for the team on the clock and passes `fromTimeout` so the expired-turn
 * check doesn't refuse it).
 */
export async function nominatePlayer(
  leagueId: number,
  state: AuctionState,
  input: NominatePlayerInput,
  opts: { fromTimeout?: boolean } = {},
): Promise<NominatePlayerResult> {
  // Taken synchronously, before the first await (same pattern as finishLocks).
  if (nominateLocks.get(leagueId)) return { ok: false, error: NOMINATION_IN_PROGRESS, conflict: true };
  nominateLocks.set(leagueId, true);
  let result: NominatePlayerResult = { ok: false, error: TURN_NO_LONGER_ACTIVE, conflict: true };
  try {
    result = await nominateUnderLock(leagueId, state, input, opts);
    return result;
  } finally {
    nominateLocks.delete(leagueId);
    afterNomination(leagueId, state, result);
  }
}

/**
 * Settle the turn clock once a nomination releases the lock.
 * - Succeeded: bidding started, so any deferred timeout is moot.
 * - Failed with a deferred timeout: run it now (auto-put-up, else SKIP
 *   'timeout'). Never re-arm a full clock here, or a team could stall the
 *   auction by sending a doomed /nominate at every expiry.
 * - Failed, nothing deferred, no clock running (e.g. after a cold restart):
 *   start the turn clock so the turn can't sit clockless.
 */
function afterNomination(leagueId: number, state: AuctionState, result: NominatePlayerResult): void {
  if (result.ok) {
    timeoutPending.delete(leagueId);
    return;
  }
  const turnLive = state.status === 'nominating' && !state.paused;
  if (timeoutPending.has(leagueId)) {
    timeoutPending.delete(leagueId);
    if (turnLive) runNominationTimeout(leagueId, state);
    return;
  }
  // A running timeout will settle the turn itself; don't hand it a new clock.
  if (turnLive && !nominationTimers.has(leagueId) && !timeoutRunning.has(leagueId)) {
    scheduleNominationTimer(leagueId, state);
  }
}

/** True while it is still `teamId`'s unpaused turn and no lot is up. */
function turnStillOpenFor(state: AuctionState, teamId: number): boolean {
  return state.status === 'nominating' && !state.paused && !state.nomination
    && state.queue[state.queueIndex] === teamId;
}

async function nominateUnderLock(
  leagueId: number,
  state: AuctionState,
  input: NominatePlayerInput,
  opts: { fromTimeout?: boolean },
): Promise<NominatePlayerResult> {
  const { nominatorTeamId, playerId, playerName, startBid, positions, team, isPitcher } = input;

  const teamObj = state.teams.find(t => t.id === nominatorTeamId);
  if (!teamObj) return { ok: false, error: "Invalid team", conflict: false };
  if (teamObj.maxBid < startBid) return { ok: false, error: "Insufficent funds", conflict: false };

  // Guard: prevent nominating already-drafted players
  if (soldInThisAuction(state).has(Number(playerId))) {
    return { ok: false, error: "Player already on a roster", conflict: false };
  }
  const dbPlayer = await prisma.player.findFirst({ where: { mlbId: Number(playerId) } });
  if (dbPlayer) {
    const existing = await prisma.roster.findFirst({
      where: { playerId: dbPlayer.id, team: { leagueId }, releasedAt: null }
    });
    if (existing) return { ok: false, error: "Player already on a roster", conflict: false };
  }

  // Check position limits for the nominating team
  const nomPosError = checkPositionLimit(nominatorTeamId, isPitcher, state, positions);
  if (nomPosError) return { ok: false, error: nomPosError, conflict: false };

  // The awaits above yielded; re-check the turn right before the first write
  // (a pause, skip or undo may have landed meanwhile).
  if (!turnStillOpenFor(state, nominatorTeamId)) {
    return { ok: false, error: TURN_NO_LONGER_ACTIVE, conflict: true };
  }
  // A request that started before the clock ran out and resumed after it
  // cannot win; only the timeout path itself may nominate an expired turn.
  if (!opts.fromTimeout && isTurnTimeUp(leagueId, state)) {
    return { ok: false, error: TIME_IS_UP, conflict: true };
  }

  // Clear nomination timer (team is nominating)
  clearNominationTimer(leagueId);

  // Persist AuctionLot to DB for bid history tracking
  let lotId: number | undefined;
  if (dbPlayer) {
    const lot = await prisma.auctionLot.create({
      data: {
        playerId: dbPlayer.id,
        nominatingTeamId: nominatorTeamId,
        status: "active",
      },
    });
    lotId = lot.id;

    // Record the nominator's opening bid
    await prisma.auctionBid.create({
      data: { lotId: lot.id, teamId: nominatorTeamId, amount: Number(startBid) },
    });
  }

  const now = Date.now();
  state.nomination = {
    playerId,
    playerName,
    playerTeam: team,
    positions,
    isPitcher,
    nominatorTeamId,
    currentBid: Number(startBid),
    highBidderTeamId: nominatorTeamId,
    endTime: new Date(now + state.config.bidTimer * 1000).toISOString(),
    timerDuration: state.config.bidTimer,
    status: 'running',
    lotId,
  };

  state.log.unshift({
    type: 'NOMINATION',
    teamId: nominatorTeamId,
    teamName: teamObj.name,
    playerId,
    playerName,
    amount: startBid,
    timestamp: now,
    message: `${teamObj.name} nominated ${playerName} for $${startBid}`
  });

  state.status = 'bidding';
  state.lastUpdate = Date.now();

  // Schedule server-side auto-finish
  scheduleAutoFinish(leagueId, state.config.bidTimer * 1000);

  broadcastState(leagueId, state);
  persistState(leagueId, state);
  return { ok: true };
}

// --- Core Finish Logic (shared by auto-finish timer + manual /finish route) ---

export async function finishCurrentLot(leagueId: number, userId?: number): Promise<AuctionState | null> {
  // Concurrent finish protection
  if (finishLocks.get(leagueId)) return null;
  finishLocks.set(leagueId, true);

  try {
    const state = await getState(leagueId);
    if (!state.nomination) return null;

    clearAutoFinishTimer(leagueId);

    const { playerId, currentBid, highBidderTeamId, playerName, positions, lotId, playerTeam } = state.nomination;

    // Look up league season for the source tag
    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
    const season = league?.season ?? new Date().getFullYear();
    const auctionSource = `auction_${season}`;

    const mlbTeamAbbr = playerTeam || undefined;

    let dbPlayer = await prisma.player.findFirst({ where: { mlbId: Number(playerId) } });
    if (!dbPlayer) {
      dbPlayer = await prisma.player.create({
        data: {
          mlbId: Number(playerId),
          name: playerName,
          posPrimary: positions.split('/')[0] || 'UT',
          posList: positions.split('/').join(','),
          mlbTeam: mlbTeamAbbr,
        }
      });
    } else if (!dbPlayer.mlbTeam && mlbTeamAbbr) {
      // Backfill mlbTeam on existing player if it was missing
      dbPlayer = await prisma.player.update({
        where: { id: dbPlayer.id },
        data: { mlbTeam: mlbTeamAbbr },
      });
    }

    await assertPlayerAvailable(prisma, dbPlayer.id, leagueId);

    // Set assignedPosition from auction — defaults to player's primary position.
    // Owners can override via the Team page position dropdown later.
    const primaryPos = (dbPlayer.posPrimary ?? positions.split('/')[0] ?? "UT").toUpperCase();

    await prisma.roster.create({
      data: {
        teamId: highBidderTeamId,
        playerId: dbPlayer.id,
        price: currentBid,
        source: auctionSource,
        assignedPosition: primaryPos,
      }
    });

    // Update AuctionLot with final results
    if (lotId) {
      await prisma.auctionLot.update({
        where: { id: lotId },
        data: { status: "completed", endTs: new Date(), finalPrice: currentBid, winnerTeamId: highBidderTeamId },
      });
    }

    await refreshTeams(state);

    const winner = state.teams.find(t => t.id === highBidderTeamId);
    state.log.unshift({
      type: 'WIN',
      teamId: highBidderTeamId,
      teamName: winner?.name,
      playerName,
      amount: currentBid,
      timestamp: Date.now(),
      message: `${winner?.name || 'Winner'} won ${playerName} for $${currentBid}`
    });

    // Advance queue to next team with open spots
    const hasMore = advanceQueue(state);
    if (!hasMore) {
      state.status = 'completed';
      state.nomination = null;
      logger.info({ leagueId }, "Auction completed — all rosters full");
    } else {
      state.status = 'nominating';
      state.nomination = null;
      // Start nomination timer for next team
      scheduleNominationTimer(leagueId, state);
    }
    state.lastUpdate = Date.now();

    broadcastState(leagueId, state);
    persistState(leagueId, state);

    writeAuditLog({
      userId: userId ?? 0,
      action: "AUCTION_FINISH",
      resourceType: "Auction",
      resourceId: String(dbPlayer.id),
      metadata: { leagueId, playerId: dbPlayer.id, playerName, price: currentBid, winnerTeamId: highBidderTeamId, auto: !userId },
    });

    return state;
  } finally {
    finishLocks.set(leagueId, false);
  }
}
