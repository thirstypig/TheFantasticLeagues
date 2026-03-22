import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";
import { requireAuth, requireAdmin, requireTeamOwner, requireLeagueMember, requireCommissionerOrAdmin } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { validateBody } from "../../middleware/validate.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { requireSeasonStatus } from "../../middleware/seasonGuard.js";
import { assertPlayerAvailable } from "../../lib/rosterGuard.js";
import { positionToSlots, PITCHER_CODES as SPORT_PITCHER_CODES } from "../../lib/sportConfig.js";
import { broadcastState } from "./services/auctionWsService.js";
import { saveState, loadState, clearState } from "./services/auctionPersistence.js";

const nominateSchema = z.object({
  leagueId: z.number().int().positive(),
  nominatorTeamId: z.number().int().positive(),
  playerId: z.string().min(1).max(20),
  playerName: z.string().min(1).max(200),
  startBid: z.number().int().min(1).max(999),
  positions: z.string().min(1).max(100),
  team: z.string().max(10).optional().default(""),
  isPitcher: z.boolean(),
});

const bidSchema = z.object({
  leagueId: z.number().int().positive(),
  bidderTeamId: z.number().int().positive(),
  amount: z.number().int().min(1).max(999),
});

const proxyBidSchema = z.object({
  leagueId: z.number().int().positive(),
  bidderTeamId: z.number().int().positive(),
  maxBid: z.number().int().min(1).max(999),
});

const router = Router();

// --- Types (re-exported from types.ts to maintain backwards compatibility) ---

export type { AuctionStatus, AuctionTeam, NominationState, AuctionLogEvent, AuctionState } from "./types.js";
import type { AuctionState } from "./types.js";


// --- In-Memory Store (scoped per league) ---
// Backed by DB persistence — hydrates from AuctionSession on cold read.
const auctionStates = new Map<number, AuctionState>();

// --- Server-Side Timers ---
const autoFinishTimers = new Map<number, NodeJS.Timeout>();
const nominationTimers = new Map<number, NodeJS.Timeout>();

// --- Concurrent Finish Protection ---
const finishLocks = new Map<number, boolean>();

export function createDefaultState(leagueId: number): AuctionState {
  return {
    leagueId,
    status: "not_started",
    nomination: null,
    teams: [],
    queue: [],
    queueIndex: 0,
    config: {
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

async function getState(leagueId: number): Promise<AuctionState> {
  let state = auctionStates.get(leagueId);
  if (!state) {
    // Try to hydrate from DB
    const persisted = await loadState(leagueId);
    if (persisted) {
      // Backfill config fields for states persisted before this change
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
function readLeagueId(req: Request): number | null {
  const raw = req.body?.leagueId ?? req.query.leagueId;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Check if user is admin or commissioner for the given league. */
async function isAdminOrCommissioner(req: Request, leagueId: number): Promise<boolean> {
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
function advanceQueue(state: AuctionState): boolean {
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
function persistState(leagueId: number, state: AuctionState): void {
  saveState(leagueId, state).catch((err) =>
    logger.error({ error: String(err), leagueId }, "Failed to persist auction state")
  );
}

const refreshTeams = async (state: AuctionState) => {
  const teams = await prisma.team.findMany({
    where: { leagueId: state.leagueId },
    include: {
      rosters: {
        where: { releasedAt: null },
        include: { player: true }
      }
    },
    orderBy: { id: 'asc' }
  });

  const budgetCap = state.config.budgetCap;
  const rosterSize = state.config.rosterSize;

  state.teams = teams.map(t => {
    const spent = t.rosters.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
    const count = t.rosters.length;
    const remaining = budgetCap - spent;
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

    return {
      id: t.id,
      name: t.name,
      code: t.code || 'UNK',
      budget: remaining,
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
          price: Number(r.price),
          assignedPosition: r.assignedPosition
      }))
    };
  });

  if (state.queue.length === 0) {
      state.queue = state.teams.map(t => t.id);
  }
};

/** Load budget/roster config from LeagueRule, falling back to defaults. */
async function loadLeagueConfig(leagueId: number): Promise<{ budgetCap: number; rosterSize: number; pitcherCount: number; batterCount: number; bidTimer: number; nominationTimer: number }> {
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
async function loadPositionLimits(leagueId: number): Promise<Record<string, number> | null> {
  const rule = await prisma.leagueRule.findUnique({
    where: { leagueId_category_key: { leagueId, category: "roster", key: "roster_positions" } },
  });
  if (!rule?.value) return null;
  try { return JSON.parse(rule.value); } catch { return null; }
}

const PITCHER_CODES = new Set<string>(SPORT_PITCHER_CODES);

/**
 * Check if a team can roster another player at the given position.
 * Returns null if OK, or an error message if the position is full.
 */
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
function processProxyBids(state: AuctionState): boolean {
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
function sanitizeStateForBroadcast(state: AuctionState): AuctionState {
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

function clearAutoFinishTimer(leagueId: number): void {
  const existing = autoFinishTimers.get(leagueId);
  if (existing) {
    clearTimeout(existing);
    autoFinishTimers.delete(leagueId);
  }
}

function scheduleAutoFinish(leagueId: number, durationMs: number): void {
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

function clearNominationTimer(leagueId: number): void {
  const existing = nominationTimers.get(leagueId);
  if (existing) {
    clearTimeout(existing);
    nominationTimers.delete(leagueId);
  }
}

function scheduleNominationTimer(leagueId: number, state: AuctionState): void {
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

async function finishCurrentLot(leagueId: number, userId?: number): Promise<AuctionState | null> {
  // Concurrent finish protection
  if (finishLocks.get(leagueId)) return null;
  finishLocks.set(leagueId, true);

  try {
    const state = await getState(leagueId);
    if (!state.nomination) return null;

    clearAutoFinishTimer(leagueId);

    const { playerId, currentBid, highBidderTeamId, playerName, positions, lotId } = state.nomination;

    // Look up league season for the source tag
    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
    const season = league?.season ?? new Date().getFullYear();
    const auctionSource = `auction_${season}`;

    let dbPlayer = await prisma.player.findFirst({ where: { mlbId: Number(playerId) } });
    if (!dbPlayer) {
      dbPlayer = await prisma.player.create({
        data: {
          mlbId: Number(playerId),
          name: playerName,
          posPrimary: positions.split('/')[0] || 'UT',
          posList: positions.split('/').join(',')
        }
      });
    }

    await assertPlayerAvailable(prisma, dbPlayer.id, leagueId);

    await prisma.roster.create({
      data: {
        teamId: highBidderTeamId,
        playerId: dbPlayer.id,
        price: currentBid,
        source: auctionSource,
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


// --- Routes ---

// GET /api/auction/state?leagueId=N
router.get("/state", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const state = await getState(leagueId);
  // Strip proxy bids (private) — client fetches their own via /proxy-bid
  const sanitized = state.nomination?.proxyBids
    ? { ...state, nomination: { ...state.nomination, proxyBids: undefined } }
    : state;
  res.json(sanitized);
}));

// POST /api/auction/init
router.post("/init", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  // Safety net: auto-lock rules and transition Season SETUP → DRAFT if applicable
  try {
    const setupSeason = await prisma.season.findFirst({
      where: { leagueId, status: "SETUP" },
    });
    if (setupSeason) {
      const { transitionStatus } = await import("../seasons/services/seasonService.js");
      await transitionStatus(setupSeason.id, "DRAFT");
      logger.info({ leagueId, seasonId: setupSeason.id }, "Auto-transitioned season to DRAFT on auction init");
    }
  } catch (err) {
    logger.warn({ error: String(err), leagueId }, "Season auto-transition on auction init failed (non-blocking)");
  }

  // Load budget/roster config from league rules
  const { budgetCap, rosterSize, pitcherCount, batterCount, bidTimer, nominationTimer } = await loadLeagueConfig(leagueId);
  const positionLimits = await loadPositionLimits(leagueId);

  const state = createDefaultState(leagueId);
  state.config.budgetCap = budgetCap;
  state.config.rosterSize = rosterSize;
  state.config.pitcherCount = pitcherCount;
  state.config.batterCount = batterCount;
  state.config.bidTimer = bidTimer;
  state.config.nominationTimer = nominationTimer;
  state.config.positionLimits = positionLimits;
  auctionStates.set(leagueId, state);
  await refreshTeams(state);

  state.status = "nominating";
  state.lastUpdate = Date.now();

  broadcastState(leagueId, state);
  persistState(leagueId, state);

  // Start nomination timer
  scheduleNominationTimer(leagueId, state);

  writeAuditLog({
    userId: req.user!.id,
    action: "AUCTION_INIT",
    resourceType: "Auction",
    metadata: { leagueId, teamCount: state.teams.length, budgetCap, rosterSize, bidTimer, nominationTimer },
  });

  res.json(state);
}));

// POST /api/auction/nominate
router.post("/nominate", requireAuth, validateBody(nominateSchema), requireSeasonStatus(["DRAFT"]), requireTeamOwner("nominatorTeamId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  const state = await getState(leagueId);

  const { nominatorTeamId, playerId, playerName, startBid, positions, team, isPitcher } = req.body;

  const teamObj = state.teams.find(t => t.id === nominatorTeamId);
  if (!teamObj) return res.status(400).json({ error: "Invalid team" });
  if (teamObj.maxBid < startBid) return res.status(400).json({ error: "Insufficent funds" });

  // Guard: prevent nominating already-drafted players
  const dbPlayer = await prisma.player.findFirst({ where: { mlbId: Number(playerId) } });
  if (dbPlayer) {
    const existing = await prisma.roster.findFirst({
      where: { playerId: dbPlayer.id, team: { leagueId }, releasedAt: null }
    });
    if (existing) return res.status(400).json({ error: "Player already on a roster" });
  }

  // Check position limits for the nominating team
  const nomPosError = checkPositionLimit(nominatorTeamId, isPitcher, state, positions);
  if (nomPosError) return res.status(400).json({ error: nomPosError });

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
  res.json(state);
}));

// POST /api/auction/bid
router.post("/bid", requireAuth, validateBody(bidSchema), requireSeasonStatus(["DRAFT"]), requireTeamOwner("bidderTeamId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  const state = await getState(leagueId);

  if (state.status !== 'bidding' || !state.nomination) {
    return res.status(400).json({ error: "Auction not active" });
  }

  const { bidderTeamId, amount } = req.body;

  const endTime = new Date(state.nomination.endTime).getTime();
  const now = Date.now();
  if (now > endTime + 500) {
      return res.status(400).json({ error: "Auction ended" });
  }

  if (amount <= state.nomination.currentBid) {
      return res.status(400).json({ error: "Bid too low" });
  }

  const bidder = state.teams.find(t => t.id === bidderTeamId);
  if (!bidder) return res.status(400).json({ error: "Bidder not found" });
  if (bidder.maxBid < amount) return res.status(400).json({ error: "Not enough budget" });

  // Guard: check position limits for the bidding team
  const posError = checkPositionLimit(
    bidderTeamId, state.nomination.isPitcher, state, state.nomination.positions
  );
  if (posError) return res.status(400).json({ error: posError });

  state.nomination.currentBid = amount;
  state.nomination.highBidderTeamId = bidderTeamId;

  // Persist bid to DB for bid history tracking
  if (state.nomination.lotId) {
    prisma.auctionBid.create({
      data: { lotId: state.nomination.lotId, teamId: bidderTeamId, amount },
    }).catch((err) => logger.error({ error: String(err) }, "Failed to persist auction bid"));
  }

  state.log.unshift({
    type: 'BID',
    teamId: bidderTeamId,
    teamName: bidder.name,
    playerName: state.nomination.playerName,
    amount: amount,
    timestamp: Date.now(),
    message: `${bidder.name} bid $${amount}`
  });

  state.nomination.endTime = new Date(now + state.config.bidTimer * 1000).toISOString();
  state.lastUpdate = Date.now();

  // Process proxy bids — may trigger auto-responses
  const proxyFired = processProxyBids(state);
  if (proxyFired) {
    // Reset timer again since a proxy bid extended the auction
    const proxyNow = Date.now();
    state.nomination.endTime = new Date(proxyNow + state.config.bidTimer * 1000).toISOString();
    state.lastUpdate = proxyNow;
  }

  // Reset auto-finish timer
  scheduleAutoFinish(leagueId, state.config.bidTimer * 1000);

  broadcastState(leagueId, state);
  persistState(leagueId, state);
  res.json(sanitizeStateForBroadcast(state));
}));

// POST /api/auction/finish
router.post("/finish", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const state = await finishCurrentLot(leagueId, req.user!.id);
  if (!state) return res.status(400).json({ error: "No active nomination or finish already in progress" });

  res.json(state);
}));

// POST /api/auction/undo-finish (admin-only)
router.post("/undo-finish", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  const state = await getState(leagueId);

  if (state.status !== 'nominating' && state.status !== 'completed') {
    return res.status(400).json({ error: "Can only undo when in nominating or completed state" });
  }

  // Look up league season for the source tag
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();
  const auctionSource = `auction_${season}`;

  // Find the most recent auction roster entry in this league
  const lastRoster = await prisma.roster.findFirst({
    where: { source: auctionSource, team: { leagueId }, releasedAt: null },
    orderBy: { acquiredAt: 'desc' },
    include: { player: { select: { name: true } }, team: { select: { name: true } } },
  });

  if (!lastRoster) {
    return res.status(400).json({ error: "No auction roster entries to undo" });
  }

  // Delete the roster entry
  await prisma.roster.delete({ where: { id: lastRoster.id } });

  // Refresh teams to recalculate budgets
  await refreshTeams(state);

  // Decrement queue index (wrap around)
  state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;

  state.log.unshift({
    type: 'UNDO',
    teamName: lastRoster.team.name,
    playerName: lastRoster.player.name,
    amount: lastRoster.price,
    timestamp: Date.now(),
    message: `Undo: ${lastRoster.player.name} removed from ${lastRoster.team.name} ($${lastRoster.price})`
  });

  state.status = 'nominating';
  state.nomination = null;
  state.lastUpdate = Date.now();

  // Restart nomination timer
  scheduleNominationTimer(leagueId, state);

  broadcastState(leagueId, state);
  persistState(leagueId, state);

  writeAuditLog({
    userId: req.user!.id,
    action: "AUCTION_UNDO",
    resourceType: "Auction",
    resourceId: String(lastRoster.id),
    metadata: { leagueId, playerId: lastRoster.playerId, playerName: lastRoster.player.name, price: lastRoster.price },
  });

  res.json(state);
}));

// POST /api/auction/pause
router.post("/pause", requireAuth, asyncHandler(async (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
    if (!(await isAdminOrCommissioner(req, leagueId))) return res.status(403).json({ error: "Commissioner or admin only" });
    const state = await getState(leagueId);

    if (state.nomination && state.nomination.status === 'running') {
        const now = Date.now();
        const end = new Date(state.nomination.endTime).getTime();
        state.nomination.pausedRemainingMs = Math.max(0, end - now);
        state.nomination.status = 'paused';
        clearAutoFinishTimer(leagueId);
    }
    clearNominationTimer(leagueId);
    broadcastState(leagueId, state);
    persistState(leagueId, state);
    res.json(state);
}));

// POST /api/auction/resume
router.post("/resume", requireAuth, asyncHandler(async (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
    if (!(await isAdminOrCommissioner(req, leagueId))) return res.status(403).json({ error: "Commissioner or admin only" });
    const state = await getState(leagueId);

    if (state.nomination && state.nomination.status === 'paused') {
        const now = Date.now();
        const remaining = state.nomination.pausedRemainingMs || (state.config.bidTimer * 1000);
        state.nomination.endTime = new Date(now + remaining).toISOString();
        state.nomination.status = 'running';
        // Reschedule auto-finish with remaining time
        scheduleAutoFinish(leagueId, remaining);
    } else if (state.status === 'nominating') {
        // Resuming from pause while in nominating — restart nomination timer
        scheduleNominationTimer(leagueId, state);
    }
    broadcastState(leagueId, state);
    persistState(leagueId, state);
    res.json(state);
}));

// POST /api/auction/reset
router.post("/reset", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

    // Clear all timers
    clearAutoFinishTimer(leagueId);
    clearNominationTimer(leagueId);

    // Look up league season for the source tag
    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
    const season = league?.season ?? new Date().getFullYear();
    const auctionSource = `auction_${season}`;

    // Delete roster entries created during this auction
    await prisma.roster.deleteMany({
        where: { source: auctionSource, team: { leagueId } }
    });

    // Delete auction lot/bid records for this league
    const leagueTeamIds = (await prisma.team.findMany({ where: { leagueId }, select: { id: true } })).map(t => t.id);
    if (leagueTeamIds.length > 0) {
      const lots = await prisma.auctionLot.findMany({ where: { nominatingTeamId: { in: leagueTeamIds } }, select: { id: true } });
      const lotIds = lots.map(l => l.id);
      if (lotIds.length > 0) {
        await prisma.auctionBid.deleteMany({ where: { lotId: { in: lotIds } } });
        await prisma.auctionLot.deleteMany({ where: { id: { in: lotIds } } });
      }
    }

    // Load budget/roster config from league rules
    const { budgetCap, rosterSize, pitcherCount, batterCount, bidTimer, nominationTimer } = await loadLeagueConfig(leagueId);
    const positionLimits = await loadPositionLimits(leagueId);

    const state = createDefaultState(leagueId);
    state.config.budgetCap = budgetCap;
    state.config.rosterSize = rosterSize;
    state.config.pitcherCount = pitcherCount;
    state.config.batterCount = batterCount;
    state.config.bidTimer = bidTimer;
    state.config.nominationTimer = nominationTimer;
    state.config.positionLimits = positionLimits;
    state.status = "nominating";
    auctionStates.set(leagueId, state);
    await refreshTeams(state);

    broadcastState(leagueId, state);
    await clearState(leagueId);

    // Start nomination timer
    scheduleNominationTimer(leagueId, state);

    writeAuditLog({
      userId: req.user!.id,
      action: "AUCTION_RESET",
      resourceType: "Auction",
      metadata: { leagueId },
    });

    res.json(state);
}));

// GET /api/auction/bid-history?leagueId=N
// Returns all completed auction lots with their bid history, ordered by nomination time.
router.get("/bid-history", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const leagueTeamIds = (await prisma.team.findMany({ where: { leagueId }, select: { id: true } })).map(t => t.id);
  if (leagueTeamIds.length === 0) return res.json({ lots: [] });

  const lots = await prisma.auctionLot.findMany({
    where: { nominatingTeamId: { in: leagueTeamIds } },
    include: {
      player: { select: { name: true, mlbId: true, posPrimary: true, mlbTeam: true } },
      bids: {
        include: { team: { select: { id: true, name: true, code: true } } },
        orderBy: { ts: "asc" },
      },
    },
    orderBy: { startTs: "asc" },
  });

  res.json({
    lots: lots.map((lot, idx) => ({
      lotNumber: idx + 1,
      playerName: lot.player.name,
      mlbId: lot.player.mlbId,
      position: lot.player.posPrimary,
      mlbTeam: lot.player.mlbTeam,
      status: lot.status,
      finalPrice: lot.finalPrice,
      winnerTeamId: lot.winnerTeamId,
      nominatingTeamId: lot.nominatingTeamId,
      startTs: lot.startTs,
      bids: lot.bids.map(b => ({
        teamId: b.team.id,
        teamName: b.team.name,
        teamCode: b.team.code,
        amount: b.amount,
        ts: b.ts,
      })),
    })),
  });
}));

// GET /api/auction/retrospective?leagueId=N
// Post-draft analytics: league stats, bargains/overpays, position spending, contested lots, team efficiency, spending pace.
router.get("/retrospective", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  // Get league teams
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true, budget: true },
  });
  const teamIds = teams.map(t => t.id);
  const teamMap = new Map(teams.map(t => [t.id, t]));

  // All completed lots with bids + player data
  const lots = await prisma.auctionLot.findMany({
    where: {
      nominatingTeamId: { in: teamIds },
      status: "completed",
      finalPrice: { not: null },
      winnerTeamId: { not: null },
    },
    include: {
      player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } },
      bids: { select: { teamId: true, amount: true } },
    },
    orderBy: { startTs: "asc" },
  });

  if (lots.length === 0) {
    return res.status(404).json({ error: "No completed auction data found" });
  }

  // PlayerValue for bargain/overpay analysis
  const playerValues = await prisma.playerValue.findMany({
    where: { leagueId, playerId: { not: null } },
    select: { playerId: true, value: true },
  });
  const valueMap = new Map(playerValues.map(v => [v.playerId!, v.value]));

  // ── League-level metrics ──
  const prices = lots.map(l => l.finalPrice!);
  const totalLots = lots.length;
  const totalSpent = prices.reduce((s, p) => s + p, 0);
  const avgPrice = Math.round((totalSpent / totalLots) * 10) / 10;
  const sorted = [...prices].sort((a, b) => a - b);
  const medianPrice = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const totalBidsPlaced = lots.reduce((s, l) => s + l.bids.length, 0);
  const avgBidsPerLot = Math.round((totalBidsPlaced / totalLots) * 10) / 10;

  const mostExpIdx = prices.indexOf(Math.max(...prices));
  const mostExpLot = lots[mostExpIdx];
  const mostExpensivePlayer = { playerName: mostExpLot.player.name, position: mostExpLot.player.posPrimary, price: mostExpLot.finalPrice! };

  const nonOneDollar = lots.filter(l => l.finalPrice! > 1);
  const cheapestWin = nonOneDollar.length > 0
    ? (() => { const c = nonOneDollar.reduce((min, l) => l.finalPrice! < min.finalPrice! ? l : min); return { playerName: c.player.name, position: c.player.posPrimary, price: c.finalPrice! }; })()
    : null;

  // ── Bargain/Overpay analysis ──
  const surplusEntries = lots
    .filter(l => valueMap.has(l.player.id))
    .map(l => ({
      playerName: l.player.name,
      position: l.player.posPrimary,
      price: l.finalPrice!,
      projectedValue: valueMap.get(l.player.id)!,
      surplus: valueMap.get(l.player.id)! - l.finalPrice!,
    }));
  const bargains = [...surplusEntries].sort((a, b) => b.surplus - a.surplus).slice(0, 5).filter(e => e.surplus > 0);
  const overpays = [...surplusEntries].sort((a, b) => a.surplus - b.surplus).slice(0, 5).filter(e => e.surplus < 0);

  // ── Position spending breakdown ──
  function normPos(pos: string): string {
    const p = pos.trim().toUpperCase();
    if (["LF", "CF", "RF"].includes(p)) return "OF";
    return p;
  }
  const posMap = new Map<string, { totalSpent: number; playerCount: number }>();
  for (const lot of lots) {
    const pos = normPos(lot.player.posPrimary);
    const entry = posMap.get(pos) ?? { totalSpent: 0, playerCount: 0 };
    entry.totalSpent += lot.finalPrice!;
    entry.playerCount++;
    posMap.set(pos, entry);
  }
  const positionSpending = [...posMap.entries()]
    .map(([position, d]) => ({ position, totalSpent: d.totalSpent, avgPrice: Math.round((d.totalSpent / d.playerCount) * 10) / 10, playerCount: d.playerCount }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  // ── Most contested lots ──
  const mostContested = [...lots]
    .map(l => ({
      playerName: l.player.name,
      position: l.player.posPrimary,
      price: l.finalPrice!,
      bidCount: l.bids.length,
      teamsInvolved: new Set(l.bids.map(b => b.teamId)).size,
    }))
    .sort((a, b) => b.bidCount - a.bidCount)
    .slice(0, 5);

  // ── Team efficiency ──
  const teamEfficiency = teams.map(team => {
    const teamLots = lots.filter(l => l.winnerTeamId === team.id);
    const spent = teamLots.reduce((s, l) => s + l.finalPrice!, 0);
    const withValues = teamLots.filter(l => valueMap.has(l.player.id));
    const bargainCount = withValues.filter(l => valueMap.get(l.player.id)! > l.finalPrice!).length;
    const overpayCount = withValues.filter(l => valueMap.get(l.player.id)! < l.finalPrice!).length;
    const totalSurplus = withValues.reduce((s, l) => s + (valueMap.get(l.player.id)! - l.finalPrice!), 0);
    return {
      teamId: team.id,
      teamName: team.name,
      totalSpent: spent,
      playersAcquired: teamLots.length,
      avgPrice: teamLots.length > 0 ? Math.round((spent / teamLots.length) * 10) / 10 : 0,
      budgetRemaining: team.budget,
      bargainCount,
      overpayCount,
      totalSurplus,
    };
  }).sort((a, b) => b.totalSurplus - a.totalSurplus);

  // ── Spending pace (quarters) ──
  const quarterSize = Math.ceil(lots.length / 4);
  const spendingPace = [1, 2, 3, 4].map(q => {
    const start = (q - 1) * quarterSize;
    const chunk = lots.slice(start, start + quarterSize);
    const qSpent = chunk.reduce((s, l) => s + l.finalPrice!, 0);
    return {
      quarter: q,
      avgPrice: chunk.length > 0 ? Math.round((qSpent / chunk.length) * 10) / 10 : 0,
      totalSpent: qSpent,
      lotsCount: chunk.length,
    };
  });

  res.json({
    league: { totalLots, totalSpent, avgPrice, medianPrice, mostExpensivePlayer, cheapestWin, totalBidsPlaced, avgBidsPerLot },
    bargains,
    overpays,
    positionSpending,
    mostContested,
    teamEfficiency,
    spendingPace,
  });
}));

// POST /api/auction/force-assign — Commissioner manually assigns a player to a team
const forceAssignSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  playerId: z.string().min(1).max(20),   // mlbId
  playerName: z.string().min(1).max(200),
  price: z.number().int().min(0).max(999),
  positions: z.string().min(1).max(100),
  isPitcher: z.boolean(),
});

router.post("/force-assign", requireAuth, validateBody(forceAssignSchema), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  if (!(await isAdminOrCommissioner(req, leagueId))) return res.status(403).json({ error: "Commissioner or admin only" });

  const { teamId, playerId, playerName, price, positions, isPitcher } = req.body;

  // Verify team belongs to this league
  const team = await prisma.team.findFirst({ where: { id: teamId, leagueId } });
  if (!team) return res.status(400).json({ error: "Team not found in this league" });

  // Verify player not already on a roster in this league
  const dbPlayer = await prisma.player.findFirst({ where: { mlbId: Number(playerId) } });
  if (dbPlayer) {
    const existing = await prisma.roster.findFirst({
      where: { playerId: dbPlayer.id, team: { leagueId }, releasedAt: null }
    });
    if (existing) return res.status(400).json({ error: "Player already on a roster" });
  }

  // Find or create player record
  let player = dbPlayer;
  if (!player) {
    player = await prisma.player.create({
      data: {
        mlbId: Number(playerId),
        name: playerName,
        posPrimary: positions.split('/')[0] || 'UT',
        posList: positions.split('/').join(','),
      }
    });
  }

  // Look up league season for the source tag
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();

  await prisma.roster.create({
    data: {
      teamId,
      playerId: player.id,
      price,
      source: `auction_${season}`,
    }
  });

  // Refresh auction state if active
  const state = auctionStates.get(leagueId);
  if (state) {
    await refreshTeams(state);
    state.log.unshift({
      type: 'WIN',
      teamId,
      teamName: team.name,
      playerName,
      amount: price,
      timestamp: Date.now(),
      message: `Commissioner assigned ${playerName} to ${team.name} for $${price}`
    });
    state.lastUpdate = Date.now();
    broadcastState(leagueId, state);
    persistState(leagueId, state);
  }

  writeAuditLog({
    userId: req.user!.id,
    action: "AUCTION_FORCE_ASSIGN",
    resourceType: "Auction",
    resourceId: String(player.id),
    metadata: { leagueId, teamId, playerId: player.id, playerName, price },
  });

  res.json({ success: true, playerName, teamName: team.name, price });
}));

// POST /api/auction/proxy-bid — set a max/proxy bid (eBay-style)
router.post("/proxy-bid", requireAuth, validateBody(proxyBidSchema), requireSeasonStatus(["DRAFT"]), requireTeamOwner("bidderTeamId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  const state = await getState(leagueId);

  if (state.status !== 'bidding' || !state.nomination) {
    return res.status(400).json({ error: "No active nomination" });
  }

  if (state.nomination.status !== 'running') {
    return res.status(400).json({ error: "Auction is paused" });
  }

  const { bidderTeamId, maxBid } = req.body;
  const bidder = state.teams.find(t => t.id === bidderTeamId);
  if (!bidder) return res.status(400).json({ error: "Bidder not found" });
  if (bidder.maxBid < maxBid) return res.status(400).json({ error: "Not enough budget for this max bid" });
  if (maxBid <= state.nomination.currentBid) return res.status(400).json({ error: "Max bid must be higher than current bid" });

  // Guard: check position limits
  const posError = checkPositionLimit(bidderTeamId, state.nomination.isPitcher, state, state.nomination.positions);
  if (posError) return res.status(400).json({ error: posError });

  // Store proxy bid
  if (!state.nomination.proxyBids) state.nomination.proxyBids = {};
  state.nomination.proxyBids[bidderTeamId] = maxBid;

  // If this team isn't the current high bidder, trigger an immediate auto-bid
  if (state.nomination.highBidderTeamId !== bidderTeamId) {
    // Place an immediate bid at currentBid + 1 (or maxBid if lower)
    const immediateBid = Math.min(maxBid, state.nomination.currentBid + 1);

    // But first check if current high bidder has a proxy that can counter
    // processProxyBids handles all the logic
    state.nomination.currentBid = immediateBid;
    state.nomination.highBidderTeamId = bidderTeamId;

    // Persist to DB
    if (state.nomination.lotId) {
      prisma.auctionBid.create({
        data: { lotId: state.nomination.lotId, teamId: bidderTeamId, amount: immediateBid },
      }).catch((err) => logger.error({ error: String(err) }, "Failed to persist proxy initial bid"));
    }

    state.log.unshift({
      type: 'BID',
      teamId: bidderTeamId,
      teamName: bidder.name,
      playerName: state.nomination.playerName,
      amount: immediateBid,
      timestamp: Date.now(),
      message: `${bidder.name} bid $${immediateBid}`
    });

    // Now process proxy bids to resolve any counter-proxy
    processProxyBids(state);

    // Reset timer
    const now = Date.now();
    state.nomination.endTime = new Date(now + state.config.bidTimer * 1000).toISOString();
    scheduleAutoFinish(leagueId, state.config.bidTimer * 1000);
  }

  state.lastUpdate = Date.now();
  broadcastState(leagueId, state);
  persistState(leagueId, state);

  // Return the proxy bid amount to the caller (private)
  res.json({ success: true, maxBid, currentBid: state.nomination.currentBid, highBidderTeamId: state.nomination.highBidderTeamId });
}));

// GET /api/auction/my-proxy-bid?leagueId=N&teamId=N — get your current proxy bid
router.get("/my-proxy-bid", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const teamId = Number(req.query.teamId);
  if (!Number.isFinite(teamId)) return res.status(400).json({ error: "Missing teamId" });

  // Verify the requesting user owns this team
  const userId = (req as any).user?.id;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { ownerUserId: true } });
  const ownership = await prisma.teamOwnership.findFirst({ where: { teamId, userId } });
  if (team?.ownerUserId !== userId && !ownership && !(req as any).user?.isAdmin) {
    return res.status(403).json({ error: "Not your team" });
  }

  const state = await getState(leagueId);
  const myProxy = state.nomination?.proxyBids?.[teamId] ?? null;
  res.json({ maxBid: myProxy });
}));

// DELETE /api/auction/proxy-bid — cancel your proxy bid
router.delete("/proxy-bid", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const teamId = Number(req.query.teamId);
  if (!Number.isFinite(leagueId) || !Number.isFinite(teamId)) {
    return res.status(400).json({ error: "Missing leagueId or teamId" });
  }

  // Verify the requesting user owns this team
  const userId = (req as any).user?.id;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { ownerUserId: true } });
  const ownership = await prisma.teamOwnership.findFirst({ where: { teamId, userId } });
  if (team?.ownerUserId !== userId && !ownership && !(req as any).user?.isAdmin) {
    return res.status(403).json({ error: "Not your team" });
  }

  const state = await getState(leagueId);
  if (state.nomination?.proxyBids?.[teamId]) {
    delete state.nomination.proxyBids[teamId];
    persistState(leagueId, state);
  }
  res.json({ success: true });
}));

// Draft grade cache — auction data is frozen at "completed", so cache is permanent per league
const draftGradeCache = new Map<number, { teamId: number; teamName: string; grade: string; summary: string }[]>();
const draftGradeInFlight = new Map<number, Promise<any>>();

// GET /api/auction/draft-grades — AI-generated draft grades for all teams
router.get("/draft-grades", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Missing leagueId" });

  const state = await getState(leagueId);
  if (state.status !== "completed") {
    return res.status(400).json({ error: "Auction must be completed to generate draft grades" });
  }

  // Serve from cache if available
  const cached = draftGradeCache.get(leagueId);
  if (cached) return res.json({ grades: cached });

  // Deduplicate concurrent requests — share one Gemini call
  let inflight = draftGradeInFlight.get(leagueId);
  if (!inflight) {
    inflight = (async () => {
      const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
      return aiAnalysisService.gradeCurrentDraft(
        state.teams.map(t => ({
          id: t.id,
          name: t.name,
          code: t.code,
          budget: t.budget,
          roster: t.roster,
          pitcherCount: t.pitcherCount,
          hitterCount: t.hitterCount,
        })),
        {
          budgetCap: state.config.budgetCap ?? 400,
          rosterSize: state.config.rosterSize ?? 23,
          pitcherCount: state.config.pitcherCount ?? 9,
          batterCount: state.config.batterCount ?? 14,
        }
      );
    })();
    draftGradeInFlight.set(leagueId, inflight);
  }

  try {
    const result = await inflight;

    if (!result.success) {
      logger.warn({ error: result.error, leagueId }, "Draft grades failed");
      return res.status(503).json({ error: "Draft grading is temporarily unavailable" });
    }

    // Cache permanently — auction state is frozen
    draftGradeCache.set(leagueId, result.grades);
    res.json({ grades: result.grades });
  } finally {
    draftGradeInFlight.delete(leagueId);
  }
}));

// ─── AI Auction Bid Advice ──────────────────────────────────────────────────

// Cache: keyed by leagueId:teamId:playerId:currentBid
const bidAdviceCache = new Map<string, { shouldBid: boolean; maxRecommendedBid: number; reasoning: string; confidence: string }>();

// GET /api/auction/ai-advice?leagueId=X&teamId=Y&playerId=Z&currentBid=N
router.get("/ai-advice", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const teamId = Number(req.query.teamId);
  const playerId = Number(req.query.playerId);
  const currentBid = Number(req.query.currentBid);

  if (!Number.isFinite(leagueId) || !Number.isFinite(teamId) || !Number.isFinite(playerId) || !Number.isFinite(currentBid)) {
    return res.status(400).json({ error: "Missing leagueId, teamId, playerId, or currentBid" });
  }

  // Check cache
  const cacheKey = `${leagueId}:${teamId}:${playerId}:${currentBid}`;
  const cached = bidAdviceCache.get(cacheKey);
  if (cached) return res.json(cached);

  const state = await getState(leagueId);

  // Find the team in auction state
  const teamState = state.teams.find(t => t.id === teamId);
  if (!teamState) return res.status(400).json({ error: "Team not in auction" });

  // Find player info from current nomination or DB
  let playerName = state.nomination?.playerName ?? "Unknown";
  let playerPosition = state.nomination?.positions?.split('/')[0] ?? "UT";

  if (state.nomination?.playerId === String(playerId)) {
    playerName = state.nomination.playerName;
    playerPosition = state.nomination.positions.split('/')[0] || "UT";
  } else {
    const dbPlayer = await prisma.player.findFirst({ where: { mlbId: playerId } });
    if (dbPlayer) {
      playerName = dbPlayer.name;
      playerPosition = dbPlayer.posPrimary;
    }
  }

  // Calculate team needs
  const avgBudget = state.teams.reduce((sum, t) => sum + t.budget, 0) / (state.teams.length || 1);

  const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
  const result = await aiAnalysisService.adviseBid(
    playerName,
    playerPosition,
    currentBid,
    teamState.budget,
    {
      pitcherCount: teamState.pitcherCount ?? 0,
      hitterCount: teamState.hitterCount ?? 0,
      pitcherMax: state.config.pitcherCount ?? 9,
      hitterMax: state.config.batterCount ?? 14,
      openSlots: (state.config.rosterSize ?? 23) - (teamState.roster?.length ?? 0),
    },
    {
      avgBudgetRemaining: avgBudget,
      teamsCount: state.teams.length,
      rosterSize: state.config.rosterSize ?? 23,
    },
  );

  if (!result.success) {
    logger.warn({ error: result.error, leagueId, teamId, playerId }, "Bid advice failed");
    return res.status(503).json({ error: "Bid advice is temporarily unavailable" });
  }

  bidAdviceCache.set(cacheKey, result.result!);
  res.json(result.result);
}));

export const auctionRouter = router;
export default auctionRouter;
