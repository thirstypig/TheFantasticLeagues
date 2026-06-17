import { Router } from "express";
import { prisma } from "../../../db/prisma.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";
import { requireLeagueMember } from "../../../middleware/auth.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { validateBody } from "../../../middleware/validate.js";
import { writeAuditLog } from "../../../lib/auditLog.js";
import { logger } from "../../../lib/logger.js";
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
} from "../lib/auctionStateManager.js";
import { broadcastState } from "../services/auctionWsService.js";

const router = Router();

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

  const state = createDefaultState(leagueId);
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

    const state = createDefaultState(leagueId);
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

    res.json(state);
}));

// POST /api/auction/complete
// Commissioner/admin action to manually end the auction.
// If a nomination is in progress, it is canceled (not awarded).
router.post("/complete", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

    const state = auctionStates.get(leagueId);
    if (!state) return res.status(404).json({ error: "No active auction" });

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
    state.status = "completed";
    state.nomination = null;
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
router.post("/force-assign", requireAuth, validateBody(forceAssignSchema), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  if (!(await isAdminOrCommissioner(req, leagueId))) return res.status(403).json({ error: "Commissioner or admin only" });

  const { teamId, playerId, playerName, price, positions, team: mlbTeamParam, isPitcher } = req.body;

  // Verify team belongs to this league
  const teamRow = await prisma.team.findFirst({ where: { id: teamId, leagueId } });
  if (!teamRow) return res.status(400).json({ error: "Team not found in this league" });

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

  await prisma.roster.create({
    data: {
      teamId,
      playerId: player.id,
      price,
      source: `auction_${season}`,
      assignedPosition: importPrimaryPos,
    }
  });

  // Refresh auction state if active
  const state = auctionStates.get(leagueId);
  if (state) {
    await refreshTeams(state);
    state.log.unshift({
      type: 'WIN',
      teamId,
      teamName: teamRow.name,
      playerName,
      amount: price,
      timestamp: Date.now(),
      message: `Commissioner assigned ${playerName} to ${teamRow.name} for $${price}`
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

  res.json({ success: true, playerName, teamName: teamRow.name, price });
}));

export default router;
