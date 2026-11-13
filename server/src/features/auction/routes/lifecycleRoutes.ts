import { Router } from "express";
import { prisma } from "../../../db/prisma.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";
import { requireLeagueMember } from "../../../middleware/auth.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { validateBody } from "../../../middleware/validate.js";
import { writeAuditLog } from "../../../lib/auditLog.js";
import { logger } from "../../../lib/logger.js";
import { requireSeasonStatus } from "../../../middleware/seasonGuard.js";
import { forceAssignSchema } from "../lib/schemas.js";
import {
  auctionStates,
  createDefaultState,
  getState,
  readLeagueId,
  isAdminOrCommissioner,
  refreshTeams,
  loadLeagueConfig,
  loadPositionLimits,
  persistState,
  clearAutoFinishTimer,
  clearNominationTimer,
  scheduleNominationTimer,
  scheduleAutoFinish,
  finishCurrentLot,
  clearState,
  advanceQueue,
  sanitizeStateForBroadcast,
  calculateMaxBid,
  nominateLocks,
  undoLocks,
  nominationTimers,
  timeoutPending,
  timeoutRunning,
} from "../lib/auctionStateManager.js";
import { broadcastState } from "../services/auctionWsService.js";

const router = Router();

// Season guard for commissioner routes that take leagueId from body OR query.
const draftOnly = requireSeasonStatus(["DRAFT"], "body.or.query.leagueId");

export const NOMINATION_IN_PROGRESS_RETRY = "Nomination in progress, try again";
export const UNDO_IN_PROGRESS_RETRY = "Undo in progress, try again";
export const SALES_CHANGED = "Sales changed — refresh";

/**
 * A nomination holds its lock across DB writes. Pause, end, skip and undo
 * would change the turn under it, so they are refused until it settles.
 */
function nominationInProgress(leagueId: number): boolean {
  return nominateLocks.get(leagueId) === true;
}

function isPrismaNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2025";
}

// POST /api/auction/init
router.post("/init", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  // The league's commissioner starts its auction (the Start screen already
  // offers them the button). Starting again replaces the whole auction state,
  // so a commissioner can't do that to a live or finished auction; a site
  // admin still can (and has /reset).
  if (!(await isAdminOrCommissioner(req, leagueId))) return res.status(403).json({ error: "Commissioner or admin only" });
  if (!req.user!.isAdmin) {
    const current = await getState(leagueId);
    if (current.status !== "not_started") {
      return res.status(409).json({
        error: current.status === "completed" ? "This auction has already finished" : "The auction is already running",
      });
    }
  }

  // Safety net: auto-lock rules and transition Season SETUP → DRAFT if applicable
  try {
    const setupSeason = await prisma.season.findFirst({
      where: { leagueId, status: "SETUP" },
    });
    if (setupSeason) {
      const { transitionStatus } = await import("../../seasons/services/seasonService.js");
      await transitionStatus(setupSeason.id, "DRAFT");
      logger.info({ leagueId, seasonId: setupSeason.id }, "Auto-transitioned season to DRAFT on auction init");
    }
  } catch (err) {
    logger.warn({ error: String(err), leagueId }, "Season auto-transition on auction init failed (non-blocking)");
  }

  // Load budget/roster config from league rules
  const { budgetCap, rosterSize, pitcherCount, batterCount, bidTimer, nominationTimer } = await loadLeagueConfig(leagueId);
  const positionLimits = await loadPositionLimits(leagueId);

  // Load league sport for sport-aware position checking
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { sport: true } });

  // Owners' "my lists" are pre-auction prep: carry them into the new state.
  const priorLists = (await getState(leagueId)).nominationLists;
  const state = createDefaultState(leagueId);
  if (priorLists) state.nominationLists = priorLists;
  state.config.sport = league?.sport ?? "baseball";
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

  res.json(sanitizeStateForBroadcast(state));
}));

// POST /api/auction/finish
router.post("/finish", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const state = await finishCurrentLot(leagueId, req.user!.id);
  if (!state) return res.status(400).json({ error: "No active nomination or finish already in progress" });

  res.json(sanitizeStateForBroadcast(state));
}));

// POST /api/auction/undo-finish (commissioner or admin)
// Body: { leagueId, expectedRosterId } — the rosterId of the newest live sale
// the client is showing. Required when that sale carries a rosterId.
router.post("/undo-finish", requireAuth, draftOnly, asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  // Taken synchronously, before the first await: a double press can't delete twice.
  if (undoLocks.get(leagueId)) return res.status(409).json({ error: UNDO_IN_PROGRESS_RETRY });
  undoLocks.set(leagueId, true);
  try {
    await undoLastSale(req, res, leagueId);
  } finally {
    undoLocks.delete(leagueId);
    // A turn clock that ran out while the undo held the lock was deferred
    // (a successful undo already restarted the clock and cleared this).
    if (timeoutPending.has(leagueId)) {
      timeoutPending.delete(leagueId);
      const st = await getState(leagueId);
      if (st.status === 'nominating' && !st.paused && !nominationTimers.has(leagueId) && !timeoutRunning.has(leagueId)) {
        scheduleNominationTimer(leagueId, st);
        broadcastState(leagueId, st);
        persistState(leagueId, st);
      }
    }
  }
}));

async function undoLastSale(req: import("express").Request, res: import("express").Response, leagueId: number) {
  if (!(await isAdminOrCommissioner(req, leagueId))) return res.status(403).json({ error: "Commissioner or admin only" });
  const state = await getState(leagueId);

  if (nominationInProgress(leagueId)) return res.status(409).json({ error: NOMINATION_IN_PROGRESS_RETRY });
  if (state.status !== 'nominating' && state.status !== 'completed') {
    return res.status(400).json({ error: "Can only undo when in nominating or completed state" });
  }

  // Look up league season for the source tag
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();
  const auctionSource = `auction_${season}`;

  // The sale to undo: the newest WIN in the log that hasn't been undone.
  const target = state.log.find(e => e.type === 'WIN' && !e.undone);
  const hasWins = state.log.some(e => e.type === 'WIN');
  if (hasWins && !target) {
    return res.status(400).json({ error: "No auction sales to undo" });
  }
  // The client names the sale it means. If a newer sale landed (or the one it
  // showed was already undone), refuse instead of undoing a different sale.
  // Legacy WINs without a rosterId can't be named, so they skip this check.
  if (target && typeof target.rosterId === 'number' && Number(req.body?.expectedRosterId) !== target.rosterId) {
    return res.status(409).json({ error: SALES_CHANGED });
  }

  const rosterInclude = { player: { select: { name: true } }, team: { select: { name: true } } } as const;
  let lastRoster;
  if (target && typeof target.rosterId === 'number') {
    // Exactly the row this sale created; the source/league guard stays as a safety check.
    lastRoster = await prisma.roster.findFirst({
      where: { id: target.rosterId, source: auctionSource, team: { leagueId }, releasedAt: null },
      include: rosterInclude,
    });
    if (!lastRoster) return res.status(409).json({ error: "Sale already undone" });
  } else {
    // LEGACY: WINs persisted before rosterId was logged (or a state with no WINs at all)
    // fall back to the most recent auction roster row in this league.
    lastRoster = await prisma.roster.findFirst({
      where: { source: auctionSource, team: { leagueId }, releasedAt: null },
      orderBy: { acquiredAt: 'desc' },
      include: rosterInclude,
    });
    if (!lastRoster) {
      return res.status(400).json({ error: "No auction roster entries to undo" });
    }
  }

  // Delete the roster entry (a row deleted under us is the same as already undone)
  try {
    await prisma.roster.delete({ where: { id: lastRoster.id } });
  } catch (err) {
    if (isPrismaNotFound(err)) return res.status(409).json({ error: "Sale already undone" });
    throw err;
  }

  // Refresh teams to recalculate budgets
  await refreshTeams(state);

  // A lot sale advanced the turn, so hand it back. A force-assign never advanced it.
  // Legacy WINs without saleKind rewind as before.
  if (target?.saleKind !== 'assign' && state.queue.length > 0) {
    state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
  }

  if (target) target.undone = true;
  state.log.unshift({
    type: 'UNDO',
    teamId: target?.teamId,
    teamName: lastRoster.team.name,
    playerId: target?.playerId,
    playerName: lastRoster.player.name,
    amount: lastRoster.price,
    rosterId: lastRoster.id,
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

  return res.json(sanitizeStateForBroadcast(state));
}

// POST /api/auction/pause
router.post("/pause", requireAuth, asyncHandler(async (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
    if (!(await isAdminOrCommissioner(req, leagueId))) return res.status(403).json({ error: "Commissioner or admin only" });
    const state = await getState(leagueId);
    if (nominationInProgress(leagueId)) return res.status(409).json({ error: NOMINATION_IN_PROGRESS_RETRY });

    if (state.status === 'nominating' || state.status === 'bidding') {
        state.paused = true;
    }
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
    res.json(sanitizeStateForBroadcast(state));
}));

// POST /api/auction/resume
router.post("/resume", requireAuth, draftOnly, asyncHandler(async (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
    if (!(await isAdminOrCommissioner(req, leagueId))) return res.status(403).json({ error: "Commissioner or admin only" });
    const state = await getState(leagueId);
    // Not paused: nothing to resume. Don't restart a running clock.
    // (A lot persisted paused before the `paused` flag existed still resumes.)
    if (!state.paused && state.nomination?.status !== 'paused') {
        return res.json(sanitizeStateForBroadcast(state));
    }
    state.paused = false;

    if (state.nomination && state.nomination.status === 'paused') {
        const now = Date.now();
        const remaining = state.nomination.pausedRemainingMs || (state.config.bidTimer * 1000);
        state.nomination.endTime = new Date(now + remaining).toISOString();
        state.nomination.status = 'running';
        // Reschedule auto-finish with remaining time
        scheduleAutoFinish(leagueId, remaining);
    } else if (state.status === 'nominating') {
        // Resuming from pause while in nominating — restart that team's clock
        // with full time (also sets nominationEndTime)
        scheduleNominationTimer(leagueId, state);
    }
    broadcastState(leagueId, state);
    persistState(leagueId, state);
    res.json(sanitizeStateForBroadcast(state));
}));

// POST /api/auction/skip-turn?leagueId=N
// Commissioner/admin skips the team on the clock. Only during the nominating phase.
router.post("/skip-turn", requireAuth, draftOnly, asyncHandler(async (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
    if (!(await isAdminOrCommissioner(req, leagueId))) return res.status(403).json({ error: "Commissioner or admin only" });
    const state = await getState(leagueId);
    if (nominationInProgress(leagueId)) return res.status(409).json({ error: NOMINATION_IN_PROGRESS_RETRY });

    if (state.status !== 'nominating') {
      return res.status(409).json({ error: "Can only skip a turn while a team is putting a player up" });
    }

    const skippedTeamId = state.queue[state.queueIndex];
    const skippedTeam = state.teams.find(t => t.id === skippedTeamId);
    clearNominationTimer(leagueId);

    state.log.unshift({
      type: 'SKIP',
      teamId: skippedTeamId,
      teamName: skippedTeam?.name,
      reason: 'commissioner',
      timestamp: Date.now(),
      message: `Commissioner skipped ${skippedTeam?.name ?? 'Team'}'s turn`,
    });

    if (!advanceQueue(state)) {
      // Every roster is full — the auction is over
      state.status = 'completed';
      state.nomination = null;
      state.paused = false;
      state.nominationEndTime = null;
      logger.info({ leagueId }, "Auction completed — all rosters full (skip turn)");
    } else {
      // Full clock for the next team (stays stopped while paused)
      scheduleNominationTimer(leagueId, state);
    }
    state.lastUpdate = Date.now();

    broadcastState(leagueId, state);
    persistState(leagueId, state);

    writeAuditLog({
      userId: req.user!.id,
      action: "AUCTION_SKIP_TURN",
      resourceType: "Auction",
      resourceId: skippedTeamId != null ? String(skippedTeamId) : undefined,
      metadata: { leagueId, skippedTeamId, nextTeamId: state.queue[state.queueIndex], completed: state.status === 'completed' },
    });

    res.json(sanitizeStateForBroadcast(state));
}));

// POST /api/auction/reset
router.post("/reset", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

    // Clear all timers
    clearAutoFinishTimer(leagueId);
    clearNominationTimer(leagueId);

    // Look up league season and sport for the source tag
    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true, sport: true } });
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

    // Owners' "my lists" survive a reset (they are prep, not auction results).
    const priorLists = (await getState(leagueId)).nominationLists;
    const state = createDefaultState(leagueId);
    if (priorLists) state.nominationLists = priorLists;
    state.config.sport = league?.sport ?? "baseball";
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

    res.json(sanitizeStateForBroadcast(state));
}));

// POST /api/auction/complete
// Commissioner/admin action to manually end the auction.
// If a nomination is in progress, it is canceled (not awarded).
router.post("/complete", requireAuth, asyncHandler(async (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
    if (!(await isAdminOrCommissioner(req, leagueId))) return res.status(403).json({ error: "Commissioner or admin only" });

    const state = auctionStates.get(leagueId);
    if (!state) return res.status(404).json({ error: "No active auction" });
    if (nominationInProgress(leagueId)) return res.status(409).json({ error: NOMINATION_IN_PROGRESS_RETRY });

    if (state.status === "completed") {
      return res.status(400).json({ error: "Auction is already completed" });
    }
    if (state.status === "not_started") {
      return res.status(400).json({ error: "Auction has not started" });
    }

    // Clear all timers
    clearAutoFinishTimer(leagueId);
    clearNominationTimer(leagueId);

    // Mark as completed — cancel any in-progress nomination (don't award it)
    const canceledLot = state.nomination?.playerName;
    state.status = "completed";
    state.nomination = null;
    state.paused = false;
    state.log.unshift({
      type: 'END',
      playerName: canceledLot,
      timestamp: Date.now(),
      message: canceledLot
        ? `Commissioner ended the auction (lot for ${canceledLot} canceled)`
        : "Commissioner ended the auction",
    });
    state.lastUpdate = Date.now();

    broadcastState(leagueId, state);
    persistState(leagueId, state);

    writeAuditLog({
      userId: req.user!.id,
      action: "AUCTION_COMPLETE",
      resourceType: "Auction",
      metadata: { leagueId, manualEnd: true },
    });

    logger.info({ leagueId, userId: req.user!.id }, "Auction manually completed by commissioner/admin");

    res.json({ success: true, status: state.status });
}));

// POST /api/auction/refresh-teams
// Triggers a refresh of team data (rosters, budgets, position counts) and broadcasts to all clients.
// Used after position assignments or roster changes to sync the auction matrix.
router.post("/refresh-teams", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

    const state = auctionStates.get(leagueId);
    if (!state) return res.status(404).json({ error: "No active auction" });

    await refreshTeams(state);
    broadcastState(leagueId, state);

    res.json({ success: true });
}));

// POST /api/auction/force-assign — Commissioner manually assigns a player to a team
router.post("/force-assign", requireAuth, validateBody(forceAssignSchema), requireSeasonStatus(["DRAFT"]), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  if (!(await isAdminOrCommissioner(req, leagueId))) return res.status(403).json({ error: "Commissioner or admin only" });

  const { teamId, playerId, playerName, price, positions, team: mlbTeamParam, isPitcher } = req.body;

  // Only while the auction is live (paused counts).
  const liveState = await getState(leagueId);
  const live = liveState.status === 'nominating' || liveState.status === 'bidding' || liveState.status === 'paused';
  if (!live) return res.status(409).json({ error: "The auction isn't running" });
  // The player up for bid right now is settled by bidding, not by a fix.
  if (liveState.nomination && liveState.nomination.playerId === String(playerId)) {
    return res.status(409).json({ error: "That player is up for bid now" });
  }

  // Verify team belongs to this league
  const teamRow = await prisma.team.findFirst({ where: { id: teamId, leagueId } });
  if (!teamRow) return res.status(400).json({ error: "Team not found in this league" });

  // Same money rules as bidding: an open spot, and no more than the team's max bid.
  const stateTeam = liveState.teams.find(t => t.id === teamId);
  if (!stateTeam) return res.status(400).json({ error: "Team not found in this league" });
  if (stateTeam.spotsLeft <= 0) return res.status(400).json({ error: `${stateTeam.name} has no open roster spot` });
  const maxBid = calculateMaxBid(stateTeam.budget, stateTeam.spotsLeft);
  if (price > maxBid) return res.status(400).json({ error: `${stateTeam.name} can spend up to $${maxBid}` });

  // Verify player not already on a roster in this league
  const dbPlayer = await prisma.player.findFirst({ where: { mlbId: Number(playerId) } });
  if (dbPlayer) {
    const existing = await prisma.roster.findFirst({
      where: { playerId: dbPlayer.id, team: { leagueId }, releasedAt: null }
    });
    if (existing) return res.status(400).json({ error: "Player already on a roster" });
  }

  const mlbTeamAbbr = mlbTeamParam || undefined;

  // Find or create player record
  let player = dbPlayer;
  if (!player) {
    player = await prisma.player.create({
      data: {
        mlbId: Number(playerId),
        name: playerName,
        posPrimary: positions.split('/')[0] || 'UT',
        posList: positions.split('/').join(','),
        mlbTeam: mlbTeamAbbr,
      }
    });
  } else if (!player.mlbTeam && mlbTeamAbbr) {
    player = await prisma.player.update({
      where: { id: player.id },
      data: { mlbTeam: mlbTeamAbbr },
    });
  }

  // Look up league season for the source tag
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();

  const importPrimaryPos = (player.posPrimary ?? positions.split('/')[0] ?? "UT").toUpperCase();

  const created = await prisma.roster.create({
    data: {
      teamId,
      playerId: player.id,
      price,
      source: `auction_${season}`,
      assignedPosition: importPrimaryPos,
    }
  });

  // Refresh the live auction state
  const state = liveState;
  await refreshTeams(state);
  state.log.unshift({
    type: 'WIN',
    teamId,
    teamName: teamRow.name,
    playerId: String(playerId),
    playerName,
    amount: price,
    rosterId: created.id,
    saleKind: 'assign',
    timestamp: Date.now(),
    message: `Commissioner assigned ${playerName} to ${teamRow.name} for $${price}`
  });
  // The WIN entry above stays: draft report, last sales and replay read WIN.
  // ASSIGN marks that this sale was a commissioner fix.
  state.log.unshift({
    type: 'ASSIGN',
    teamId,
    teamName: teamRow.name,
    playerId: String(playerId),
    playerName,
    amount: price,
    timestamp: Date.now(),
    message: `Commissioner gave ${playerName} to ${teamRow.name} for $${price}`
  });
  state.lastUpdate = Date.now();
  broadcastState(leagueId, state);
  persistState(leagueId, state);

  writeAuditLog({
    userId: req.user!.id,
    action: "AUCTION_FORCE_ASSIGN",
    resourceType: "Auction",
    resourceId: String(player.id),
    metadata: { leagueId, teamId, playerId: player.id, playerName, price },
  });

  res.json({ success: true, playerName, teamName: teamRow.name, price });
}));

export default router;
