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
    let pitchers = 0;
    let hitters = 0;
    const posCounts: Record<string, number> = {};
    for (const r of t.rosters) {
      const pos = (r.player?.posPrimary ?? "").toUpperCase();
      const isPitch = PITCHER_CODES.has(pos);
      if (isPitch) {
        pitchers++;
        posCounts["P"] = (posCounts["P"] || 0) + 1;
      } else {
        hitters++;
        // Map to roster slots
        const slots = positionToSlots(pos);
        for (const slot of slots) {
          posCounts[slot] = (posCounts[slot] || 0) + 1;
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
 * Only the total pitcher count (9) and hitter count (14) are hard limits.
 *
 * Uses in-memory auction state (refreshed after each lot finishes) instead of
 * querying the DB on every bid.
 */
function checkPositionLimit(
  teamId: number,
  isPitcher: boolean,
  state: AuctionState,
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

    const posErr = checkPositionLimit(teamId, nom.isPitcher, state);
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

  // Note: position limits are NOT checked on nomination — the nominator puts any
  // available player up for bid.  Limits are enforced on /bid (bidder validation).

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
    bidderTeamId, state.nomination.isPitcher, state
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
  const posError = checkPositionLimit(bidderTeamId, state.nomination.isPitcher, state);
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

export const auctionRouter = router;
export default auctionRouter;
