import { Request } from "express";
import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import { writeAuditLog } from "../../../lib/auditLog.js";
import { assertPlayerAvailable } from "../../../lib/rosterGuard.js";
import { positionToSlots, PITCHER_CODES_SET as PITCHER_CODES, isPitcher as isPitcherPos } from "../../../lib/sportConfig.js";
import { broadcastState } from "../services/auctionWsService.js";
import { saveState, loadState, clearState } from "../services/auctionPersistence.js";

import type { AuctionState } from "../types.js";

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

export function createDefaultState(leagueId: number): AuctionState {
  return {
    leagueId,
    status: "not_started",
    nomination: null,
    teams: [],
    queue: [],
    queueIndex: 0,
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

/**
 * Strip proxy bids from state before broadcasting.
 * Each client only sees their own proxy bid via a separate mechanism.
 */
export function sanitizeStateForBroadcast(state: AuctionState): AuctionState {
  if (!state.nomination?.proxyBids) return state;
  // Deep-clone nomination to avoid mutating the real state
  return {
    ...state,
    nomination: {
      ...state.nomination,
      proxyBids: undefined,
    },
  };
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

export function clearNominationTimer(leagueId: number): void {
  const existing = nominationTimers.get(leagueId);
  if (existing) {
    clearTimeout(existing);
    nominationTimers.delete(leagueId);
  }
}

export function scheduleNominationTimer(leagueId: number, state: AuctionState): void {
  clearNominationTimer(leagueId);
  const timer = setTimeout(() => {
    nominationTimers.delete(leagueId);
    // Auto-advance queue index (skips full teams)
    if (!advanceQueue(state)) {
      // All teams full — auction complete
      state.status = 'completed';
      state.nomination = null;
      state.lastUpdate = Date.now();
      broadcastState(leagueId, state);
      persistState(leagueId, state);
      logger.info({ leagueId }, "Auction completed — all rosters full (nomination timer)");
      return;
    }
    state.lastUpdate = Date.now();
    broadcastState(leagueId, state);
    persistState(leagueId, state);
    // Schedule again for the next team
    scheduleNominationTimer(leagueId, state);
    logger.info({ leagueId, queueIndex: state.queueIndex }, "Auto-skipped nomination turn");
  }, state.config.nominationTimer * 1000);
  nominationTimers.set(leagueId, timer);
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
