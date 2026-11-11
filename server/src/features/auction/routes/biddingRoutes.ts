import { Router, type Request, type Response } from "express";
import { prisma } from "../../../db/prisma.js";
import { requireAuth } from "../../../middleware/auth.js";
import { requireLeagueMember, requireTeamOwner, isTeamOwner } from "../../../middleware/auth.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { validateBody } from "../../../middleware/validate.js";
import { requireSeasonStatus } from "../../../middleware/seasonGuard.js";
import { nominateSchema, bidSchema, proxyBidSchema, myListSchema } from "../lib/schemas.js";
import {
  getState,
  readLeagueId,
  isAdminOrCommissioner,
  checkPositionLimit,
  processProxyBids,
  sanitizeStateForBroadcast,
  scheduleAutoFinish,
  persistState,
  nominatePlayer,
} from "../lib/auctionStateManager.js";
import { broadcastState } from "../services/auctionWsService.js";
import { logger } from "../../../lib/logger.js";
import type { AuctionState } from "../types.js";

const router = Router();

const PAUSED_ERROR = "Auction is paused";

/** A lot can take bids only when the auction isn't paused and the lot's clock is running. */
function isBiddingPaused(state: AuctionState): boolean {
  return state.paused || state.nomination?.status !== 'running';
}

// POST /api/auction/nominate
// Owner of the team on the clock, or a commissioner/admin on that team's behalf.
// (Ownership is checked inline instead of via requireTeamOwner so the
// commissioner exception can be scoped to the team whose turn it is.)
router.post("/nominate", requireAuth, validateBody(nominateSchema), requireSeasonStatus(["DRAFT"]), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  const state = await getState(leagueId);

  const { nominatorTeamId, playerId, playerName, startBid, positions, team, isPitcher } = req.body;

  // Auth: owner of the nominating team, else commissioner/admin (turn check below
  // limits them to the team on the clock).
  const ownsTeam = await isTeamOwner(nominatorTeamId, req.user!.id);
  if (!ownsTeam && !(await isAdminOrCommissioner(req, leagueId))) {
    return res.status(403).json({ error: "You do not own this team" });
  }

  // Turn / phase / pause — route-level, never inside the shared nominate core.
  if (state.status !== 'nominating') {
    return res.status(409).json({ error: "Not accepting nominations right now" });
  }
  if (state.paused) {
    return res.status(409).json({ error: PAUSED_ERROR });
  }
  if (nominatorTeamId !== state.queue[state.queueIndex]) {
    return res.status(409).json({ error: "It is not this team's turn to nominate" });
  }

  const result = await nominatePlayer(leagueId, state, {
    nominatorTeamId, playerId, playerName, startBid, positions, team, isPitcher,
  });
  if (!result.ok) return res.status(400).json({ error: result.error });

  res.json(sanitizeStateForBroadcast(state));
}));

// POST /api/auction/bid
router.post("/bid", requireAuth, validateBody(bidSchema), requireSeasonStatus(["DRAFT"]), requireTeamOwner("bidderTeamId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  const state = await getState(leagueId);

  if (state.status !== 'bidding' || !state.nomination) {
    return res.status(400).json({ error: "Auction not active" });
  }
  if (isBiddingPaused(state)) {
    return res.status(409).json({ error: PAUSED_ERROR });
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

  // Placing a proxy can immediately raise the current bid, so it is refused
  // while paused exactly like /bid.
  if (isBiddingPaused(state)) {
    return res.status(409).json({ error: PAUSED_ERROR });
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

// ── "My list" (Ruling 7) ──────────────────────────────────────────
// A team's private, ordered list of players to put up. Stored in auction
// state (persisted, never broadcast) so the server can auto-nominate from it
// when the team's turn clock runs out.

/**
 * Owner-only check for /my-list. The team must belong to this league (404
 * otherwise); then the caller must own it or be an admin, matching
 * requireTeamOwner (which can't be used here: GET carries teamId in the query).
 */
async function authorizeMyList(req: Request, res: Response, leagueId: number, teamId: number): Promise<boolean> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leagueId: true } });
  if (!team || team.leagueId !== leagueId) {
    res.status(404).json({ error: "Team not found in this league" });
    return false;
  }
  if (!req.user!.isAdmin && !(await isTeamOwner(teamId, req.user!.id))) {
    res.status(403).json({ error: "You do not own this team" });
    return false;
  }
  return true;
}

// GET /api/auction/my-list?leagueId=N&teamId=N
router.get("/my-list", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  const teamId = Number(req.query.teamId);
  if (!Number.isInteger(teamId) || teamId <= 0) return res.status(400).json({ error: "Missing teamId" });
  if (!(await authorizeMyList(req, res, leagueId, teamId))) return;

  const state = await getState(leagueId);
  res.json({ teamId, mlbIds: state.nominationLists?.[teamId] ?? [] });
}));

// PUT /api/auction/my-list?leagueId=N  body: { teamId, mlbIds }
router.put("/my-list", requireAuth, requireLeagueMember("leagueId"), validateBody(myListSchema), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  const { teamId, mlbIds } = req.body as { teamId: number; mlbIds: number[] };
  if (!(await authorizeMyList(req, res, leagueId, teamId))) return;

  const deduped = [...new Set(mlbIds)];
  const state = await getState(leagueId);
  state.nominationLists = { ...(state.nominationLists ?? {}), [teamId]: deduped };
  persistState(leagueId, state);
  res.json({ teamId, mlbIds: deduped });
}));

export default router;
