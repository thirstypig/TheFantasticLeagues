import { Router } from "express";
import { prisma } from "../../../db/prisma.js";
import { requireAuth } from "../../../middleware/auth.js";
import { requireLeagueMember, requireTeamOwner } from "../../../middleware/auth.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { validateBody } from "../../../middleware/validate.js";
import { requireSeasonStatus } from "../../../middleware/seasonGuard.js";
import { nominateSchema, bidSchema, proxyBidSchema } from "../lib/schemas.js";
import {
  getState,
  readLeagueId,
  checkPositionLimit,
  processProxyBids,
  sanitizeStateForBroadcast,
  clearNominationTimer,
  scheduleAutoFinish,
  persistState,
} from "../lib/auctionStateManager.js";
import { broadcastState } from "../services/auctionWsService.js";
import { logger } from "../../../lib/logger.js";

const router = Router();

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
router.get("/my-proxy-bid", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
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

export default router;
