import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";
import { requireAuth, requireAdmin, requireTeamOwner, requireLeagueMember } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { validateBody } from "../../middleware/validate.js";
import { writeAuditLog } from "../../lib/auditLog.js";

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

// --- Types ---

export type AuctionStatus = "not_started" | "nominating" | "bidding" | "paused" | "completed";

export interface AuctionTeam {
  id: number;
  name: string;
  code: string;
  budget: number;       // Remaining budget
  maxBid: number;       // Calculated max bid
  rosterCount: number;  // Players on roster
  spotsLeft: number;
  roster: { playerId: number; price: number; assignedPosition?: string | null }[];
}

export interface NominationState {
  playerId: string;       // mlbId
  playerName: string;
  playerTeam: string;     // MLB Team
  positions: string;
  isPitcher: boolean;

  nominatorTeamId: number;

  currentBid: number;
  highBidderTeamId: number;

  endTime: string;        // ISO string for when timer expires
  timerDuration: number;
  status: 'running' | 'paused' | 'ended';
  pausedRemainingMs?: number; // If paused, how much time was left
}

export interface AuctionLogEvent {
  type: 'NOMINATION' | 'BID' | 'WIN' | 'PAUSE' | 'RESUME';
  teamId?: number;
  teamName?: string;
  playerId?: string;
  playerName?: string;
  amount?: number;
  timestamp: number;
  message: string;
}

export interface AuctionState {
  leagueId: number;
  status: AuctionStatus;

  // The active item being auctioned
  nomination: NominationState | null;

  // Teams State (Authoritative)
  teams: AuctionTeam[];

  // Nomination Order
  queue: number[]; // Array of Team IDs
  queueIndex: number;

  config: {
    bidTimer: number;
    nominationTimer: number;
  };

  log: AuctionLogEvent[];

  lastUpdate: number;
}


// --- In-Memory Store (scoped per league) ---
// NOTE: This resets on server restart. For prod, use Redis or DB.
const auctionStates = new Map<number, AuctionState>();

function createDefaultState(leagueId: number): AuctionState {
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
    },
    log: [],
    lastUpdate: Date.now(),
  };
}

function getState(leagueId: number): AuctionState {
  let state = auctionStates.get(leagueId);
  if (!state) {
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

// --- Helpers ---

export const calculateMaxBid = (budget: number, spots: number) => {
  if (spots <= 0) return 0;
  if (spots === 1) return budget;
  return budget - (spots - 1);
};

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

  const BUDGET_CAP = 400;
  const ROSTER_SIZE = 23;

  state.teams = teams.map(t => {
    const spent = t.rosters.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
    const count = t.rosters.length;
    const remaining = BUDGET_CAP - spent;
    const spots = ROSTER_SIZE - count;

    return {
      id: t.id,
      name: t.name,
      code: t.code || 'UNK',
      budget: remaining,
      rosterCount: count,
      spotsLeft: spots,
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


// --- Routes ---

// GET /api/auction/state?leagueId=N
router.get("/state", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  res.json(getState(leagueId));
}));

// POST /api/auction/init
router.post("/init", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const state = createDefaultState(leagueId);
  auctionStates.set(leagueId, state);
  await refreshTeams(state);

  state.status = "nominating";
  state.lastUpdate = Date.now();

  writeAuditLog({
    userId: req.user!.id,
    action: "AUCTION_INIT",
    resourceType: "Auction",
    metadata: { leagueId, teamCount: state.teams.length },
  });

  res.json(state);
}));

// POST /api/auction/nominate
router.post("/nominate", requireAuth, validateBody(nominateSchema), requireTeamOwner("nominatorTeamId"), (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  const state = getState(leagueId);

  const { nominatorTeamId, playerId, playerName, startBid, positions, team, isPitcher } = req.body;

  const teamObj = state.teams.find(t => t.id === nominatorTeamId);
  if (!teamObj) return res.status(400).json({ error: "Invalid team" });
  if (teamObj.maxBid < startBid) return res.status(400).json({ error: "Insufficent funds" });

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

  res.json(state);
});

// POST /api/auction/bid
router.post("/bid", requireAuth, validateBody(bidSchema), requireTeamOwner("bidderTeamId"), (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  const state = getState(leagueId);

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

  res.json(state);
});

// POST /api/auction/finish
router.post("/finish", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
  const state = getState(leagueId);

  if (!state.nomination) return res.status(400).json({ error: "No active nomination" });

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

     await prisma.roster.create({
         data: {
             teamId: highBidderTeamId,
             playerId: dbPlayer.id,
             price: currentBid,
             source: auctionSource,
         }
     });

     await refreshTeams(state);

     state.queueIndex = (state.queueIndex + 1) % state.queue.length;

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

     state.status = 'nominating';
     state.nomination = null;
     state.lastUpdate = Date.now();

     writeAuditLog({
       userId: req.user!.id,
       action: "AUCTION_FINISH",
       resourceType: "Auction",
       resourceId: String(dbPlayer.id),
       metadata: { leagueId, playerId: dbPlayer.id, playerName, price: currentBid, winnerTeamId: highBidderTeamId },
     });

     res.json(state);
}));

// POST /api/auction/pause
router.post("/pause", requireAuth, requireAdmin, (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
    const state = getState(leagueId);

    if (state.nomination && state.nomination.status === 'running') {
        const now = Date.now();
        const end = new Date(state.nomination.endTime).getTime();
        state.nomination.pausedRemainingMs = Math.max(0, end - now);
        state.nomination.status = 'paused';
    }
    res.json(state);
});

// POST /api/auction/resume
router.post("/resume", requireAuth, requireAdmin, (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });
    const state = getState(leagueId);

    if (state.nomination && state.nomination.status === 'paused') {
        const now = Date.now();
        const remaining = state.nomination.pausedRemainingMs || (state.config.bidTimer * 1000);
        state.nomination.endTime = new Date(now + remaining).toISOString();
        state.nomination.status = 'running';
    }
    res.json(state);
});

// POST /api/auction/reset
router.post("/reset", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const leagueId = readLeagueId(req);
    if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

    // Look up league season for the source tag
    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
    const season = league?.season ?? new Date().getFullYear();
    const auctionSource = `auction_${season}`;

    // Delete roster entries created during this auction
    await prisma.roster.deleteMany({
        where: { source: auctionSource, team: { leagueId } }
    });

    const state = createDefaultState(leagueId);
    state.status = "nominating";
    auctionStates.set(leagueId, state);
    await refreshTeams(state);

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
