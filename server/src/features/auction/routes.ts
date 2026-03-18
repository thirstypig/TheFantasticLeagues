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
  saveState(leagueId, state).catch(() => {});
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
async function loadLeagueConfig(leagueId: number): Promise<{ budgetCap: number; rosterSize: number; pitcherCount: number; batterCount: number }> {
  const rules = await prisma.leagueRule.findMany({
    where: {
      leagueId,
      key: { in: ["auction_budget", "pitcher_count", "batter_count"] },
    },
    select: { key: true, value: true },
  });

  const ruleMap = new Map(rules.map(r => [r.key, r.value]));
  const budgetCap = Number(ruleMap.get("auction_budget")) || 400;
  const pitcherCount = Number(ruleMap.get("pitcher_count")) || 9;
  const batterCount = Number(ruleMap.get("batter_count")) || 14;
  const rosterSize = pitcherCount + batterCount;

  return { budgetCap, rosterSize, pitcherCount, batterCount };
}

/** Load per-position roster limits from LeagueRule. */
async function loadPositionLimits(leagueId: number): Promise<Record<string, number> | null> {
  const rule = await prisma.leagueRule.findUnique({
    where: { leagueId_category_key: { leagueId, category: "roster", key: "roster_positions" } },
  });
  if (!rule?.value) return null;
  try { return JSON.parse(rule.value); } catch { return null; }
}

/** Map a player's MLB position to the roster slot(s) it can fill. */
function positionToSlots(pos: string): string[] {
  const p = pos.trim().toUpperCase();
  if (p === "C") return ["C"];
  if (p === "1B") return ["1B", "CI"];
  if (p === "2B") return ["2B", "MI"];
  if (p === "3B") return ["3B", "CI"];
  if (p === "SS") return ["SS", "MI"];
  if (p === "LF" || p === "CF" || p === "RF" || p === "OF") return ["OF"];
  if (p === "DH") return ["DH"];
  if (p === "P" || p === "SP" || p === "RP" || p === "TWP") return ["P"];
  return [];
}

const PITCHER_CODES = new Set(["P", "SP", "RP", "TWP"]);

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
 */
async function checkPositionLimit(
  leagueId: number,
  teamId: number,
  _playerPositions: string,
  isPitcher: boolean,
  state: AuctionState,
): Promise<string | null> {
  const { pitcherCount, batterCount } = await loadLeagueConfig(leagueId);

  const teamObj = state.teams.find(t => t.id === teamId);
  if (!teamObj) return null;

  // Count current pitchers/hitters on roster via DB positions
  const rosterPlayers = await prisma.roster.findMany({
    where: { teamId, releasedAt: null },
    include: { player: { select: { posPrimary: true } } },
  });

  const currentPitchers = rosterPlayers.filter(r => PITCHER_CODES.has((r.player.posPrimary ?? "").toUpperCase())).length;
  const currentHitters = rosterPlayers.length - currentPitchers;

  if (isPitcher && currentPitchers >= pitcherCount) {
    return `Team already has ${pitcherCount} pitchers (max)`;
  }
  if (!isPitcher && currentHitters >= batterCount) {
    return `Team already has ${batterCount} hitters (max)`;
  }

  return null;
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

    const { playerId, currentBid, highBidderTeamId, playerName, positions } = state.nomination;

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
  res.json(state);
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
  const { budgetCap, rosterSize, pitcherCount, batterCount } = await loadLeagueConfig(leagueId);
  const positionLimits = await loadPositionLimits(leagueId);

  const state = createDefaultState(leagueId);
  state.config.budgetCap = budgetCap;
  state.config.rosterSize = rosterSize;
  state.config.pitcherCount = pitcherCount;
  state.config.batterCount = batterCount;
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
    metadata: { leagueId, teamCount: state.teams.length, budgetCap, rosterSize },
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
    status: 'running'
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
  const posError = await checkPositionLimit(
    leagueId, bidderTeamId, state.nomination.positions, state.nomination.isPitcher, state
  );
  if (posError) return res.status(400).json({ error: posError });

  state.nomination.currentBid = amount;
  state.nomination.highBidderTeamId = bidderTeamId;

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

  // Reset auto-finish timer
  scheduleAutoFinish(leagueId, state.config.bidTimer * 1000);

  broadcastState(leagueId, state);
  persistState(leagueId, state);
  res.json(state);
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

    // Load budget/roster config from league rules
    const { budgetCap, rosterSize, pitcherCount, batterCount } = await loadLeagueConfig(leagueId);
    const positionLimits = await loadPositionLimits(leagueId);

    const state = createDefaultState(leagueId);
    state.config.budgetCap = budgetCap;
    state.config.rosterSize = rosterSize;
    state.config.pitcherCount = pitcherCount;
    state.config.batterCount = batterCount;
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

export const auctionRouter = router;
export default auctionRouter;
