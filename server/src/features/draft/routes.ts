// server/src/features/draft/routes.ts
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireCommissionerOrAdmin, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { requireSeasonStatus } from "../../middleware/seasonGuard.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { generatePickOrder, pickRound, pickInRound, type DraftState, type DraftConfig, type DraftPickEntry } from "./types.js";
import { saveState, loadState, clearState, deserializeState } from "./services/draftPersistence.js";
import { broadcastDraftState, broadcastPick } from "./services/draftWsService.js";

const router = Router();

// ─── In-memory state ───
const draftStates = new Map<number, DraftState>();
const pickLocks = new Map<number, boolean>(); // prevent concurrent picks

async function getState(leagueId: number): Promise<DraftState | null> {
  const cached = draftStates.get(leagueId);
  if (cached) return cached;
  const loaded = await loadState(leagueId);
  if (loaded) draftStates.set(leagueId, loaded);
  return loaded ?? null;
}

// ─── Auto-pick timer management ───
const autoPickTimers = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleAutoPick(leagueId: number, delayMs: number) {
  clearAutoPick(leagueId);
  autoPickTimers.set(leagueId, setTimeout(() => {
    handleAutoPick(leagueId).catch(err =>
      logger.error({ error: String(err), leagueId }, "Auto-pick failed")
    );
  }, delayMs));
}

function clearAutoPick(leagueId: number) {
  const timer = autoPickTimers.get(leagueId);
  if (timer) { clearTimeout(timer); autoPickTimers.delete(leagueId); }
}

async function handleAutoPick(leagueId: number) {
  const state = await getState(leagueId);
  if (!state || state.status !== "active") return;

  // Pick best available player by projected value
  const { lookupAuctionValue, getAuctionValueMap } = await import("../../lib/auctionValues.js");
  const valMap = getAuctionValueMap();

  // Get all available players (not drafted)
  const availablePlayers = await prisma.player.findMany({
    where: { id: { notIn: Array.from(state.draftedPlayerIds) } },
    select: { id: true, name: true, posPrimary: true },
  });

  // Sort by projected value descending (BPA)
  const ranked = availablePlayers
    .map(p => ({ ...p, value: lookupAuctionValue(p.name)?.value ?? 0 }))
    .sort((a, b) => b.value - a.value);

  const bestPlayer = ranked[0];
  if (!bestPlayer) return; // No players left

  // Execute the pick
  await executePick(leagueId, state, bestPlayer.id, bestPlayer.name, bestPlayer.posPrimary, true);
}

async function executePick(
  leagueId: number,
  state: DraftState,
  playerId: number,
  playerName: string,
  position: string,
  isAutoPick: boolean,
): Promise<DraftPickEntry> {
  const idx = state.currentPickIndex;
  const teamId = state.pickOrder[idx];
  const round = pickRound(idx, state.config.teamOrder.length);
  const pickNum = idx + 1;

  const entry: DraftPickEntry = {
    pickNum,
    round,
    teamId,
    playerId,
    playerName,
    position,
    isAutoPick,
    timestamp: Date.now(),
  };

  // Update in-memory state
  state.picks.push(entry);
  (state.draftedPlayerIds as Set<number>).add(playerId);
  state.currentPickIndex++;

  // Check if draft is complete
  if (state.currentPickIndex >= state.pickOrder.length) {
    state.status = "completed";
    state.timerExpiresAt = null;
    clearAutoPick(leagueId);
  } else {
    // Set timer for next pick
    const expiresAt = Date.now() + state.config.secondsPerPick * 1000;
    state.timerExpiresAt = expiresAt;
    scheduleAutoPick(leagueId, state.config.secondsPerPick * 1000);

    // If next team is on auto-pick, fire immediately (1s delay for UX)
    const nextTeamId = state.pickOrder[state.currentPickIndex];
    if ((state.autoPickTeams as Set<number>).has(nextTeamId)) {
      clearAutoPick(leagueId);
      scheduleAutoPick(leagueId, 1500);
    }
  }

  // CRITICAL: Await persistence before confirming (P1 security)
  await saveState(leagueId, state);

  // Broadcast pick + full state to all connected WS clients
  broadcastPick(leagueId, entry);
  broadcastDraftState(leagueId, state);

  // Record pick in audit table (fire-and-forget)
  prisma.draftPick.create({
    data: { leagueId, round, pickNum, teamId, playerId, isAutoPick },
  }).catch(err => logger.error({ error: String(err) }, "Failed to record draft pick"));

  return entry;
}

// ─── Routes ───

// POST /api/draft/init — Initialize a snake draft session
const initSchema = z.object({
  leagueId: z.number().int().positive(),
  teamOrder: z.array(z.number().int().positive()).min(2).max(20),
  totalRounds: z.number().int().min(1).max(50).default(23),
  secondsPerPick: z.number().int().min(15).max(600).default(90),
  orderType: z.enum(["SNAKE", "LINEAR"]).default("SNAKE"),
});

router.post("/init", requireAuth, validateBody(initSchema), asyncHandler(async (req, res) => {
  const { leagueId, teamOrder, totalRounds, secondsPerPick, orderType } = req.body;

  // Verify commissioner/admin
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId: req.user!.id } },
  });
  if (!membership || (membership.role !== "COMMISSIONER" && !req.user!.isAdmin)) {
    return res.status(403).json({ error: "Commissioner access required" });
  }

  const config: DraftConfig = { totalRounds, secondsPerPick, orderType, teamOrder };
  const pickOrder = generatePickOrder(teamOrder, totalRounds, orderType);

  const state: DraftState = {
    leagueId,
    status: "waiting",
    config,
    pickOrder,
    currentPickIndex: 0,
    picks: [],
    draftedPlayerIds: new Set(),
    autoPickTeams: new Set(),
    timerExpiresAt: null,
  };

  await saveState(leagueId, state);
  draftStates.set(leagueId, state);
  broadcastDraftState(leagueId, state);

  writeAuditLog({ userId: req.user!.id, action: "DRAFT_INIT", resourceType: "draft", resourceId: leagueId, metadata: { teamOrder, totalRounds, orderType } });
  logger.info({ leagueId, teamCount: teamOrder.length, totalRounds, orderType }, "Snake draft initialized");

  res.json({ success: true, totalPicks: pickOrder.length });
}));

// POST /api/draft/start — Start the draft (begin timer for first pick)
router.post("/start", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.body.leagueId);
  const state = await getState(leagueId);
  if (!state) return res.status(404).json({ error: "No draft session found" });
  if (state.status !== "waiting") return res.status(400).json({ error: "Draft already started" });

  state.status = "active";
  state.timerExpiresAt = Date.now() + state.config.secondsPerPick * 1000;
  scheduleAutoPick(leagueId, state.config.secondsPerPick * 1000);

  await saveState(leagueId, state);
  broadcastDraftState(leagueId, state);
  res.json({ success: true });
}));

// GET /api/draft/state — Get current draft state
router.get("/state", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const state = await getState(leagueId);
  if (!state) return res.status(404).json({ error: "No draft session found" });

  // Serialize Sets for JSON response
  res.json({
    ...state,
    draftedPlayerIds: Array.from(state.draftedPlayerIds),
    autoPickTeams: Array.from(state.autoPickTeams),
  });
}));

// POST /api/draft/pick — Make a pick (current team's turn only)
const pickSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
});

router.post("/pick", requireAuth, validateBody(pickSchema), asyncHandler(async (req, res) => {
  const { leagueId, teamId, playerId } = req.body;
  const state = await getState(leagueId);
  if (!state || state.status !== "active") return res.status(400).json({ error: "Draft not active" });

  // P1 SECURITY: Turn-order enforcement
  const currentTeamId = state.pickOrder[state.currentPickIndex];
  if (currentTeamId !== teamId) {
    return res.status(403).json({ error: "Not your turn" });
  }

  // Verify the user owns this team
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { ownerUserId: true, ownerships: { select: { userId: true } } } });
  const isOwner = team?.ownerUserId === req.user!.id || team?.ownerships?.some(o => o.userId === req.user!.id);
  if (!isOwner && !req.user!.isAdmin) {
    return res.status(403).json({ error: "Not your team" });
  }

  // Check player not already drafted
  if ((state.draftedPlayerIds as Set<number>).has(playerId)) {
    return res.status(409).json({ error: "Player already drafted" });
  }

  // Prevent concurrent picks
  if (pickLocks.get(leagueId)) {
    return res.status(409).json({ error: "Pick in progress" });
  }
  pickLocks.set(leagueId, true);

  try {
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { name: true, posPrimary: true } });
    if (!player) return res.status(404).json({ error: "Player not found" });

    clearAutoPick(leagueId);
    const entry = await executePick(leagueId, state, playerId, player.name, player.posPrimary, false);

    res.json({ success: true, pick: entry });
  } finally {
    pickLocks.delete(leagueId);
  }
}));

// POST /api/draft/pause — Pause the draft
router.post("/pause", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.body.leagueId);
  const state = await getState(leagueId);
  if (!state || state.status !== "active") return res.status(400).json({ error: "Draft not active" });

  state.status = "paused";
  state.timerExpiresAt = null;
  clearAutoPick(leagueId);
  await saveState(leagueId, state);
  broadcastDraftState(leagueId, state);
  res.json({ success: true });
}));

// POST /api/draft/resume — Resume the draft
router.post("/resume", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.body.leagueId);
  const state = await getState(leagueId);
  if (!state || state.status !== "paused") return res.status(400).json({ error: "Draft not paused" });

  state.status = "active";
  state.timerExpiresAt = Date.now() + state.config.secondsPerPick * 1000;
  scheduleAutoPick(leagueId, state.config.secondsPerPick * 1000);
  await saveState(leagueId, state);
  broadcastDraftState(leagueId, state);
  res.json({ success: true });
}));

// POST /api/draft/undo — Undo last pick (commissioner only)
router.post("/undo", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.body.leagueId);
  const state = await getState(leagueId);
  if (!state || state.picks.length === 0) return res.status(400).json({ error: "Nothing to undo" });

  const lastPick = state.picks.pop()!;
  if (lastPick.playerId) (state.draftedPlayerIds as Set<number>).delete(lastPick.playerId);
  state.currentPickIndex--;
  if (state.status === "completed") state.status = "active";

  // Reset timer
  state.timerExpiresAt = Date.now() + state.config.secondsPerPick * 1000;
  clearAutoPick(leagueId);
  scheduleAutoPick(leagueId, state.config.secondsPerPick * 1000);

  await saveState(leagueId, state);
  broadcastDraftState(leagueId, state);

  // Delete audit record
  await prisma.draftPick.deleteMany({ where: { leagueId, pickNum: lastPick.pickNum } }).catch(() => {});

  res.json({ success: true, undone: lastPick });
}));

// POST /api/draft/skip — Skip current pick (commissioner only)
router.post("/skip", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.body.leagueId);
  const state = await getState(leagueId);
  if (!state || state.status !== "active") return res.status(400).json({ error: "Draft not active" });

  // Execute a skip (null player)
  const idx = state.currentPickIndex;
  const teamId = state.pickOrder[idx];
  const round = pickRound(idx, state.config.teamOrder.length);
  const entry: DraftPickEntry = {
    pickNum: idx + 1, round, teamId, playerId: null, playerName: "SKIPPED", position: null, isAutoPick: false, timestamp: Date.now(),
  };
  state.picks.push(entry);
  state.currentPickIndex++;

  if (state.currentPickIndex >= state.pickOrder.length) {
    state.status = "completed";
    state.timerExpiresAt = null;
    clearAutoPick(leagueId);
  } else {
    state.timerExpiresAt = Date.now() + state.config.secondsPerPick * 1000;
    clearAutoPick(leagueId);
    scheduleAutoPick(leagueId, state.config.secondsPerPick * 1000);
  }

  await saveState(leagueId, state);
  broadcastDraftState(leagueId, state);
  res.json({ success: true, pick: entry });
}));

// POST /api/draft/auto-pick — Toggle auto-pick for a team
const autoPickSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  enabled: z.boolean(),
});

router.post("/auto-pick", requireAuth, validateBody(autoPickSchema), asyncHandler(async (req, res) => {
  const { leagueId, teamId, enabled } = req.body;
  const state = await getState(leagueId);
  if (!state) return res.status(404).json({ error: "No draft session" });

  if (enabled) (state.autoPickTeams as Set<number>).add(teamId);
  else (state.autoPickTeams as Set<number>).delete(teamId);

  await saveState(leagueId, state);
  broadcastDraftState(leagueId, state);

  // If it's this team's turn and auto-pick just enabled, fire immediately
  if (enabled && state.status === "active" && state.pickOrder[state.currentPickIndex] === teamId) {
    clearAutoPick(leagueId);
    scheduleAutoPick(leagueId, 1500);
  }

  res.json({ success: true, enabled });
}));

// POST /api/draft/complete — Finalize draft, create rosters
router.post("/complete", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.body.leagueId);
  const state = await getState(leagueId);
  if (!state) return res.status(404).json({ error: "No draft session" });
  if (state.status !== "completed" && state.status !== "active") {
    return res.status(400).json({ error: "Draft not ready to complete" });
  }

  // Create roster entries for each pick
  const year = new Date().getFullYear();
  const rosterSource = `draft_${year}`;

  for (const pick of state.picks) {
    if (!pick.playerId) continue; // Skip nulls (skipped picks)

    // Check if already on a roster (idempotent)
    const existing = await prisma.roster.findFirst({
      where: { teamId: pick.teamId, playerId: pick.playerId, releasedAt: null },
    });
    if (existing) continue;

    await prisma.roster.create({
      data: {
        teamId: pick.teamId,
        playerId: pick.playerId,
        price: 0, // Snake draft = no price (or derive from pick position)
        source: rosterSource,
        acquiredAt: new Date(pick.timestamp),
      },
    });
  }

  // Transition season DRAFT → IN_SEASON
  try {
    const { getCurrentSeason, transitionStatus } = await import("../seasons/services/seasonService.js");
    const season = await getCurrentSeason(leagueId);
    if (season && season.status === "DRAFT") {
      await transitionStatus(season.id, "IN_SEASON");
    }
  } catch (err) {
    logger.warn({ error: String(err), leagueId }, "Season transition after draft failed");
  }

  state.status = "completed";
  clearAutoPick(leagueId);
  await saveState(leagueId, state);
  broadcastDraftState(leagueId, state);

  writeAuditLog({ userId: req.user!.id, action: "DRAFT_COMPLETE", resourceType: "draft", resourceId: leagueId, metadata: { picks: state.picks.length } });
  logger.info({ leagueId, picks: state.picks.length }, "Snake draft completed");

  res.json({ success: true, picks: state.picks.length });
}));

// POST /api/draft/reset — Clear draft state (commissioner only)
router.post("/reset", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.body.leagueId);
  clearAutoPick(leagueId);
  draftStates.delete(leagueId);
  await clearState(leagueId);
  await prisma.draftPick.deleteMany({ where: { leagueId } });
  res.json({ success: true });
}));

// GET /api/draft/picks — Get all picks for a league
router.get("/picks", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const picks = await prisma.draftPick.findMany({
    where: { leagueId },
    include: { player: { select: { name: true, posPrimary: true } }, team: { select: { name: true } } },
    orderBy: { pickNum: "asc" },
  });
  res.json({ picks });
}));

export const draftRouter = router;
