// server/src/routes/transactions.ts
import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireSeasonStatus } from "../../middleware/seasonGuard.js";
import { logger } from "../../lib/logger.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import {
  assertRosterLimit,
  assertRosterAtExactCap,
  loadLeagueRosterCap,
} from "../../lib/rosterGuard.js";
import { resolveEffectiveDate, assertNoOwnershipConflict } from "../../lib/rosterWindow.js";
import {
  checkMlbIlEligibility,
  assertIlSlotAvailable,
  assertNoGhostIl,
  type MlbStatusCheck,
} from "../../lib/ilSlotGuard.js";
import { RosterRuleError, isRosterRuleError } from "../../lib/rosterRuleError.js";
import { enforceRosterRules } from "../../lib/featureFlags.js";
import { assertAddEligibleForDropSlot } from "./lib/positionInherit.js";
import { enqueueIlFeeReconcile } from "../../lib/outboxDrainer.js";

/**
 * Find completed periods whose date range is touched by a backdated
 * transaction at `effective`, and enqueue an IL fee reconcile for each.
 *
 * Defensive over-reconcile: we enqueue for every completed period whose
 * endDate >= effective. The reconciler is idempotent, so over-enqueuing
 * is a drainer-throughput cost, not a correctness concern.
 */
async function enqueueReconcileForEffective(
  leagueId: number,
  effective: Date,
): Promise<void> {
  try {
    const completed = await prisma.period.findMany({
      where: { leagueId, status: "completed", endDate: { gte: effective } },
      select: { id: true },
    });
    if (completed.length === 0) return;
    await enqueueIlFeeReconcile(null, leagueId, completed.map(p => p.id));
  } catch (err) {
    // Never fail the originating transaction on outbox enqueue failure —
    // commissioner can run /reconcile-il-fees manually if the drainer
    // missed a window.
    logger.error({ error: String(err), leagueId, effective },
      "Failed to enqueue IL fee reconcile for backdated transaction");
  }
}

// ISO date (YYYY-MM-DD) or full ISO datetime. Commissioner/admin only;
// validated per-route. Null/omit = default to nextDayEffective().
const effectiveDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}($|T)/, "effectiveDate must be YYYY-MM-DD or ISO datetime")
  .optional();

const dropSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  effectiveDate: effectiveDateSchema,
});

const claimSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive().optional(),
  mlbId: z.union([z.number(), z.string()]).optional(),
  dropPlayerId: z.number().int().positive().optional(),
  effectiveDate: effectiveDateSchema,
}).refine((d) => d.playerId || d.mlbId, { message: "playerId or mlbId required" });

const router = Router();

/**
 * GET /api/transactions
 * Requires leagueId query param + membership check
 */
router.get("/transactions", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  const skip = req.query.skip ? Number(req.query.skip) : 0;
  const take = req.query.take ? Number(req.query.take) : 50;

  const where: Prisma.TransactionEventWhereInput = { leagueId };
  if (teamId) where.teamId = teamId;

  const [total, transactions] = await Promise.all([
    prisma.transactionEvent.count({ where }),
    prisma.transactionEvent.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip,
      take,
      include: {
        team: { select: { name: true } },
        player: { select: { name: true } },
      },
    }),
  ]);

  return res.json({ transactions, total, skip, take });
}));

/**
 * POST /api/transactions/claim
 * Claims a player for a team. Commissioner-only per league rules.
 */
router.post("/transactions/claim", requireAuth, validateBody(claimSchema), requireSeasonStatus(["IN_SEASON"]), asyncHandler(async (req, res) => {
  const { leagueId, teamId, dropPlayerId, effectiveDate: effDateRaw } = req.body;

  // Commissioner-only: verify user is commissioner of this league or site admin
  const isPrivileged = req.user!.isAdmin;
  if (!isPrivileged) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (!membership || membership.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Add/Drop is commissioner-only" });
    }
  }

  let effective: Date;
  try {
    effective = resolveEffectiveDate(effDateRaw);
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Invalid effectiveDate",
    });
  }
  const isBackdated = effDateRaw != null;
  const enforce = enforceRosterRules();

  // Phase 2 invariant (plan Q1=b): once in-season, every claim requires a
  // matching drop. The middleware has already confirmed Season.status ===
  // "IN_SEASON", so this branch fires for every request that reaches here.
  if (enforce && !dropPlayerId) {
    return res.status(400).json({
      error: "In-season claims require a dropPlayerId — every add must pair with a drop.",
      code: "DROP_REQUIRED",
    });
  }

  let { playerId } = req.body;
  const { mlbId } = req.body;

  // 1. Resolve Player Identity (Lazy Create if needed)
  if (!playerId && mlbId) {
    const mlbIdNum = Number(mlbId);
    let player = await prisma.player.findFirst({ where: { mlbId: mlbIdNum }});

    if (!player) {
      return res.status(404).json({ error: `Player with MLB ID ${mlbId} not found in database.` });
    }
    playerId = player.id;
  }

  if (!playerId) {
    return res.status(400).json({ error: "Missing playerId or mlbId" });
  }

  // 2. Current-owner check
  //    Live claim (no backdate): refuse if already active on another team.
  //    Backdated claim: commissioner god-mode — we'll auto-release from the
  //    current owner at `effective` inside the transaction (unless it's the
  //    same team being claimed). Cross-team reassign gets the same rule.
  const existingRoster = await prisma.roster.findFirst({
    where: { playerId, team: { leagueId }, releasedAt: null },
    include: { team: true }
  });

  if (existingRoster && !isBackdated && existingRoster.teamId !== teamId) {
    return res.status(400).json({ error: `Player is already on team: ${existingRoster.team.name}` });
  }
  if (existingRoster && existingRoster.teamId === teamId) {
    return res.status(400).json({ error: `Player is already on this team's active roster` });
  }

  // 3. Ghost-IL pre-check (plan Q12=b). A team with a player stashed in an
  //    IL slot whose MLB status is no longer "Injured List …" cannot do any
  //    new roster operation until they resolve it. Fails open on feed
  //    unavailability (listGhostIlPlayersForTeam never speculatively labels
  //    a player ghost when the MLB status can't be read).
  if (enforce) {
    try {
      await assertNoGhostIl(prisma, teamId);
    } catch (err) {
      if (isRosterRuleError(err)) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  }

  // 4. Position-inherit pre-check (plan Q8 follow-on). Added player must be
  //    eligible for the dropped player's exact slot. Only fires when enforce
  //    is true — pre-flight DB lookups stay out of the legacy path.
  let dropRosterPreview: { id: number; assignedPosition: string | null } | null = null;
  if (enforce && dropPlayerId) {
    dropRosterPreview = await prisma.roster.findFirst({
      where: { teamId, playerId: dropPlayerId, releasedAt: null },
      select: { id: true, assignedPosition: true },
    });
    if (!dropRosterPreview) {
      return res.status(400).json({
        error: `Drop player (id ${dropPlayerId}) is not on this team's active roster.`,
        code: "IL_UNKNOWN_PLAYER",
      });
    }
    if (dropRosterPreview.assignedPosition && dropRosterPreview.assignedPosition !== "IL") {
      const add = await prisma.player.findUnique({
        where: { id: playerId },
        select: { name: true, posList: true },
      });
      if (add) {
        try {
          assertAddEligibleForDropSlot(
            { name: add.name, posList: add.posList },
            dropRosterPreview.assignedPosition,
          );
        } catch (err) {
          if (isRosterRuleError(err)) {
            return res.status(400).json({ error: err.message, code: err.code });
          }
          throw err;
        }
      }
    }
  }

  // 5. Look up league season for transaction records
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();

  // 4. Perform Transaction (Atomic) — lock team row to prevent concurrent roster limit bypass
  try {
  await prisma.$transaction(async (tx) => {
    // Acquire row-level lock on the team to serialize concurrent claims
    await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;

    // Commissioner god-mode: if backdating and the player is on another team,
    // release them first at `effective`. For live (non-backdated) claims this
    // branch doesn't run (we 400'd above).
    const excludeRosterIds: number[] = [];
    if (existingRoster && existingRoster.teamId !== teamId) {
      await tx.roster.update({
        where: { id: existingRoster.id },
        data: { releasedAt: effective, source: "COMMISSIONER_REASSIGN" },
      });
      excludeRosterIds.push(existingRoster.id);
      await tx.transactionEvent.create({
        data: {
          rowHash: `REASSIGN-DROP-${crypto.randomUUID()}-${playerId}`,
          leagueId,
          season,
          effDate: effective,
          submittedAt: new Date(),
          teamId: existingRoster.teamId,
          playerId,
          transactionRaw: `Commissioner reassign — released from ${existingRoster.team.name}`,
          transactionType: 'DROP',
        },
      });
    }

    // Overlap guard — rejects if the new window would collide with a historical
    // Roster entry (including any released rows that span the target date).
    await assertNoOwnershipConflict(tx, {
      leagueId,
      playerId,
      acquiredAt: effective,
      releasedAt: null,
      excludeRosterIds,
    });

    // Roster-size invariant. In-season: must be exactly at cap after the
    // transaction. Pre-season (or ENFORCE off): fall back to the looser
    // <=-cap guard for backward compatibility with legacy callsites.
    if (enforce) {
      const cap = await loadLeagueRosterCap(tx, leagueId);
      // Delta = +1 (add) − (dropPlayerId ? 1 : 0) = 0 when paired, +1 otherwise.
      // We already required dropPlayerId above when enforce is true, so delta=0.
      const delta = dropPlayerId ? 0 : 1;
      await assertRosterAtExactCap(tx, teamId, cap, delta);
    } else {
      await assertRosterLimit(tx, teamId, !!dropPlayerId);
    }

    const player = await tx.player.findUnique({ where: { id: playerId }, select: { id: true, name: true, posPrimary: true, posList: true, mlbId: true, mlbTeam: true } });

    // Position inheritance: added player takes the dropped player's exact
    // slot. If there's no drop (pre-season or flag off), fall back to the
    // legacy "primary position" slot mapping.
    const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);
    const primaryPos = (player?.posPrimary ?? "UT").toUpperCase();
    const legacyAssignedPos = PITCHER_POS.has(primaryPos) ? "P" : primaryPos;
    const inheritedPos = dropRosterPreview?.assignedPosition ?? null;
    const assignedPos = (enforce && inheritedPos && inheritedPos !== "IL")
      ? inheritedPos
      : legacyAssignedPos;

    await tx.roster.create({
      data: { teamId, playerId, source: 'waiver_claim', acquiredAt: effective, assignedPosition: assignedPos }
    });
    const rowHash = `CLAIM-${crypto.randomUUID()}-${playerId}`;

    await tx.transactionEvent.create({
      data: {
        rowHash,
        leagueId,
        season,
        effDate: effective,
        submittedAt: new Date(),
        teamId,
        playerId,
        transactionRaw: `Claimed ${player?.name}`,
        transactionType: 'ADD'
      }
    });

    if (dropPlayerId) {
      const dropRoster = await tx.roster.findFirst({
        where: { teamId, playerId: dropPlayerId, releasedAt: null }
      });

      if (dropRoster) {
        await tx.roster.update({ where: { id: dropRoster.id }, data: { releasedAt: effective, source: "DROP" } });

        const dropPlayer = await tx.player.findUnique({ where: { id: dropPlayerId } });
        await tx.transactionEvent.create({
          data: {
            rowHash: `DROP-${crypto.randomUUID()}-${dropPlayerId}`,
            leagueId,
            season,
            effDate: effective,
            submittedAt: new Date(),
            teamId,
            playerId: dropPlayerId,
            transactionRaw: `Dropped ${dropPlayer?.name}`,
            transactionType: 'DROP'
          }
        });
      }
    }
  }, { timeout: 30_000 });
  } catch (err: unknown) {
    // Typed guard errors from Phase 1 libs (roster cap, overlap, ghost-IL,
    // position-inherit) carry a code for programmatic handling.
    if (isRosterRuleError(err)) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    const msg = err instanceof Error ? err.message : "Claim failed";
    // Legacy substring matches — kept as a safety net until all guard code
    // paths throw RosterRuleError.
    if (msg.includes("Roster limit") || msg.includes("already on") || msg.includes("Ownership conflict") || msg.includes("Invalid effectiveDate")) {
      return res.status(400).json({ error: msg });
    }
    throw err; // Re-throw unexpected errors for asyncHandler
  }

  writeAuditLog({
    userId: req.user!.id,
    action: "TRANSACTION_CLAIM",
    resourceType: "Transaction",
    metadata: {
      leagueId, teamId, playerId,
      dropPlayerId: dropPlayerId || null,
      effectiveDate: effective.toISOString(),
      backdated: isBackdated,
      reassignedFromTeamId: existingRoster && existingRoster.teamId !== teamId ? existingRoster.teamId : null,
      enforceRosterRules: enforce,
    },
  });

  return res.json({ success: true, playerId });
}));

/**
 * POST /api/transactions/drop
 * Drops a player from a team roster. Commissioner-only.
 */
router.post("/transactions/drop", requireAuth, validateBody(dropSchema), requireSeasonStatus(["IN_SEASON"]), asyncHandler(async (req, res) => {
  const { leagueId, teamId, playerId, effectiveDate: effDateRaw } = req.body;

  // Commissioner-only check
  if (!req.user!.isAdmin) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (!membership || membership.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Drop is commissioner-only" });
    }
  }

  // Verify player is on team roster
  const rosterEntry = await prisma.roster.findFirst({
    where: { teamId, playerId, releasedAt: null },
  });
  if (!rosterEntry) {
    return res.status(400).json({ error: "Player is not on this team's active roster" });
  }

  // Phase 2 invariant (plan Q1=b): in-season, standalone drops of an active
  // (non-IL) player are rejected — every active-slot departure must pair
  // with an add via /transactions/claim. IL-slot drops are still allowed
  // (they reduce IL occupancy by 1 without touching active roster).
  const enforce = enforceRosterRules();
  if (enforce && rosterEntry.assignedPosition !== "IL") {
    return res.status(400).json({
      error: "In-season standalone drops of active players are not allowed. Use POST /transactions/claim with a dropPlayerId to replace.",
      code: "DROP_REQUIRED",
    });
  }

  let effective: Date;
  try {
    effective = resolveEffectiveDate(effDateRaw);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid effectiveDate" });
  }
  // Guard: backdated releasedAt must be at or after acquiredAt.
  if (effective <= rosterEntry.acquiredAt) {
    return res.status(400).json({
      error: `effectiveDate (${effective.toISOString().slice(0, 10)}) must be after the player was acquired (${rosterEntry.acquiredAt.toISOString().slice(0, 10)})`,
    });
  }

  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();

  await prisma.$transaction(async (tx) => {
    await tx.roster.update({ where: { id: rosterEntry.id }, data: { releasedAt: effective, source: "DROP" } });

    const player = await tx.player.findUnique({ where: { id: playerId } });
    await tx.transactionEvent.create({
      data: {
        rowHash: `DROP-${crypto.randomUUID()}-${playerId}`,
        leagueId,
        season,
        effDate: effective,
        submittedAt: new Date(),
        teamId,
        playerId,
        transactionRaw: `Dropped ${player?.name}`,
        transactionType: 'DROP'
      }
    });
  }, { timeout: 30_000 });

  writeAuditLog({
    userId: req.user!.id,
    action: "TRANSACTION_DROP",
    resourceType: "Transaction",
    metadata: {
      leagueId, teamId, playerId,
      effectiveDate: effective.toISOString(),
      backdated: effDateRaw != null,
    },
  });

  return res.json({ success: true, playerId });
}));

// ─── IL Endpoints (Phase 2a) ──────────────────────────────────────
// Atomic "stash + add" and "activate + drop" flows per plan Q10=a and Q11=b.
// No standalone IL moves. Both endpoints are commissioner/admin-only.

const ilStashSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  stashPlayerId: z.number().int().positive(),
  addPlayerId: z.number().int().positive().optional(),
  addMlbId: z.union([z.number(), z.string()]).optional(),
  effectiveDate: effectiveDateSchema,
  reason: z.string().max(500).optional(),
}).refine(d => d.addPlayerId || d.addMlbId, {
  message: "addPlayerId or addMlbId required",
});

async function requireCommishOrAdmin(req: any, res: any, leagueId: number): Promise<boolean> {
  if (req.user!.isAdmin) return true;
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId: req.user!.id } },
    select: { role: true },
  });
  if (!membership || membership.role !== "COMMISSIONER") {
    res.status(403).json({ error: "IL operations are commissioner-only" });
    return false;
  }
  return true;
}

/**
 * POST /api/transactions/il-stash
 *
 * Atomic: move `stashPlayerId` from the team's active roster to an IL slot,
 * AND add `addPlayerId` (or resolve via `addMlbId`) to the active slot the
 * stash player just vacated. Both operations succeed, or neither.
 *
 * Guards:
 *   - stashPlayer's MLB status must start with "Injured List" (pre-tx, fail
 *     closed on feed unavailability — plan R9)
 *   - team must have an open IL slot (`il.slot_count` rule)
 *   - team cannot have a ghost-IL player blocking further stashes
 *   - addPlayer must be position-eligible for stashPlayer's current slot
 *   - no ownership-window collision on addPlayer
 *   - addPlayer's current owner (if another team) is released at `effective`
 *     (commissioner god-mode cross-team reassign)
 *
 * Writes:
 *   - Update stashPlayer's Roster row: assignedPosition = "IL"
 *   - Create addPlayer's Roster row at acquiredAt = effective,
 *     assignedPosition = stashPlayer's former slot
 *   - Create RosterSlotEvent(event="IL_STASH") with MLB-status evidence
 *   - Create TransactionEvent rows for both halves (IL_STASH + ADD)
 */
router.post(
  "/transactions/il-stash",
  requireAuth,
  validateBody(ilStashSchema),
  requireSeasonStatus(["IN_SEASON"]),
  asyncHandler(async (req, res) => {
    const { leagueId, teamId, stashPlayerId, addPlayerId: addPlayerIdInput, addMlbId, reason, effectiveDate: effDateRaw } = req.body;

    if (!(await requireCommishOrAdmin(req, res, leagueId))) return;

    // Pre-transaction: resolve effective date.
    let effective: Date;
    try {
      effective = resolveEffectiveDate(effDateRaw);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid effectiveDate" });
    }
    const isBackdated = effDateRaw != null;

    // Pre-transaction: resolve addPlayer (by id or via mlbId lookup).
    let addPlayerId = addPlayerIdInput as number | undefined;
    if (!addPlayerId && addMlbId != null) {
      const mlbIdNum = Number(addMlbId);
      const p = await prisma.player.findFirst({ where: { mlbId: mlbIdNum } });
      if (!p) {
        return res.status(404).json({ error: `Player with MLB ID ${addMlbId} not found in database.` });
      }
      addPlayerId = p.id;
    }
    if (!addPlayerId) {
      return res.status(400).json({ error: "Missing addPlayerId or addMlbId" });
    }

    // Pre-transaction: fetch stashPlayer's current Roster row on this team.
    const stashRoster = await prisma.roster.findFirst({
      where: { teamId, playerId: stashPlayerId, releasedAt: null },
      select: { id: true, assignedPosition: true, acquiredAt: true },
    });
    if (!stashRoster) {
      return res.status(400).json({
        error: "Stash player is not on this team's active roster.",
        code: "IL_UNKNOWN_PLAYER",
      });
    }
    if (stashRoster.assignedPosition === "IL") {
      return res.status(400).json({
        error: "Stash player is already on IL.",
        code: "NOT_ON_IL",
      });
    }
    const stashSlot = stashRoster.assignedPosition ?? "UT";

    // Pre-transaction: MLB IL eligibility check. Fails CLOSED on feed
    // unavailability so malicious timing attacks can't stash non-IL players
    // during an outage (plan R9).
    let mlbCheck: MlbStatusCheck;
    try {
      mlbCheck = await checkMlbIlEligibility(stashPlayerId);
    } catch (err) {
      if (isRosterRuleError(err)) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    // Pre-transaction: position-inherit eligibility for add player.
    const addPlayer = await prisma.player.findUnique({
      where: { id: addPlayerId },
      select: { id: true, name: true, posPrimary: true, posList: true, mlbId: true, mlbTeam: true },
    });
    if (!addPlayer) {
      return res.status(404).json({ error: `Add player #${addPlayerId} not found.` });
    }
    try {
      assertAddEligibleForDropSlot(
        { name: addPlayer.name, posList: addPlayer.posList },
        stashSlot,
      );
    } catch (err) {
      if (isRosterRuleError(err)) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    // Pre-transaction: addPlayer's current owner (for god-mode cross-team release).
    const existingRoster = await prisma.roster.findFirst({
      where: { playerId: addPlayerId, team: { leagueId }, releasedAt: null },
      include: { team: true },
    });
    if (existingRoster && !isBackdated && existingRoster.teamId !== teamId) {
      return res.status(400).json({ error: `Add player is already on team: ${existingRoster.team.name}` });
    }
    if (existingRoster && existingRoster.teamId === teamId) {
      return res.status(400).json({ error: "Add player is already on this team's active roster" });
    }

    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
    const season = league?.season ?? new Date().getFullYear();

    // Transaction: atomic stash + add.
    try {
      await prisma.$transaction(async (tx) => {
        // Row-lock the team to serialize concurrent stashes.
        await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;

        // Re-read stashRoster FOR UPDATE to guard against concurrent drop.
        const locked = await tx.roster.findFirst({
          where: { id: stashRoster.id, releasedAt: null },
          select: { id: true, assignedPosition: true },
        });
        if (!locked || locked.assignedPosition === "IL") {
          throw new RosterRuleError("IL_UNKNOWN_PLAYER",
            "Stash player's roster entry changed mid-transaction.");
        }

        // IL slot availability + ghost-IL block.
        await assertIlSlotAvailable(tx, teamId, leagueId);
        await assertNoGhostIl(tx, teamId);

        // Ownership-window overlap guard for addPlayer.
        const excludeRosterIds: number[] = [];
        if (existingRoster && existingRoster.teamId !== teamId) {
          await tx.roster.update({
            where: { id: existingRoster.id },
            data: { releasedAt: effective, source: "COMMISSIONER_REASSIGN" },
          });
          excludeRosterIds.push(existingRoster.id);
          await tx.transactionEvent.create({
            data: {
              rowHash: `REASSIGN-DROP-${crypto.randomUUID()}-${addPlayerId}`,
              leagueId, season, effDate: effective, submittedAt: new Date(),
              teamId: existingRoster.teamId, playerId: addPlayerId,
              transactionRaw: `Commissioner reassign (IL stash) — released from ${existingRoster.team.name}`,
              transactionType: 'DROP',
            },
          });
        }
        await assertNoOwnershipConflict(tx, {
          leagueId, playerId: addPlayerId!,
          acquiredAt: effective, releasedAt: null,
          excludeRosterIds,
        });

        // Move stashPlayer to IL slot.
        await tx.roster.update({
          where: { id: stashRoster.id },
          data: { assignedPosition: "IL" },
        });
        // Create addPlayer on the slot stashPlayer just vacated (position-inherit).
        await tx.roster.create({
          data: {
            teamId, playerId: addPlayerId!, source: "il_stash",
            acquiredAt: effective, assignedPosition: stashSlot,
          },
        });

        // Append-only IL stint log — authoritative record for Phase 3 fee reconciler.
        await tx.rosterSlotEvent.create({
          data: {
            teamId, playerId: stashPlayerId, leagueId,
            event: "IL_STASH", effDate: effective,
            createdBy: req.user!.id, reason: reason ?? null,
            mlbStatusSnapshot: mlbCheck.status,
            mlbStatusFetchedAt: mlbCheck.cacheFetchedAt,
          },
        });

        // TransactionEvent rows (auditability).
        await tx.transactionEvent.create({
          data: {
            rowHash: `IL_STASH-${crypto.randomUUID()}-${stashPlayerId}`,
            leagueId, season, effDate: effective, submittedAt: new Date(),
            teamId, playerId: stashPlayerId,
            transactionRaw: `IL stash — MLB status "${mlbCheck.status}"`,
            transactionType: "IL_STASH",
          },
        });
        await tx.transactionEvent.create({
          data: {
            rowHash: `CLAIM-${crypto.randomUUID()}-${addPlayerId}`,
            leagueId, season, effDate: effective, submittedAt: new Date(),
            teamId, playerId: addPlayerId!,
            transactionRaw: `IL stash — added ${addPlayer.name}`,
            transactionType: "ADD",
          },
        });
      }, { timeout: 30_000 });
    } catch (err) {
      if (isRosterRuleError(err)) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      const msg = err instanceof Error ? err.message : "IL stash failed";
      if (msg.includes("already on") || msg.includes("Ownership conflict")) {
        return res.status(400).json({ error: msg });
      }
      throw err;
    }

    writeAuditLog({
      userId: req.user!.id,
      action: "TRANSACTION_IL_STASH",
      resourceType: "Transaction",
      metadata: {
        leagueId, teamId, stashPlayerId, addPlayerId,
        effectiveDate: effective.toISOString(),
        backdated: isBackdated,
        mlbStatusSnapshot: mlbCheck.status,
        mlbStatusFetchedAt: mlbCheck.cacheFetchedAt.toISOString(),
        reassignedFromTeamId: existingRoster && existingRoster.teamId !== teamId ? existingRoster.teamId : null,
      },
    });

    // Phase 3 backdate reconcile hook: if the effective date falls inside
    // (or before) any completed period, the IL stint window affects that
    // period's billing. Enqueue an OutboxEvent so the drainer recomputes
    // fees via the ilFeeService. Same-period (current open period) is
    // picked up at period close; we only enqueue for backdates that cross
    // into already-completed periods.
    if (isBackdated) {
      await enqueueReconcileForEffective(leagueId, effective);
    }

    return res.json({ success: true, stashPlayerId, addPlayerId });
  }),
);

const ilActivateSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  activatePlayerId: z.number().int().positive(),
  dropPlayerId: z.number().int().positive(),
  effectiveDate: effectiveDateSchema,
  reason: z.string().max(500).optional(),
});

/**
 * POST /api/transactions/il-activate
 *
 * Atomic: move `activatePlayerId` from an IL slot back to the active roster,
 * AND drop `dropPlayerId`. Both succeed or neither.
 *
 * Guards:
 *   - activatePlayer must be on this team's IL slot
 *   - dropPlayer must be on this team's active roster (not IL)
 *   - activatePlayer must be position-eligible for dropPlayer's slot
 *
 * Writes:
 *   - Update dropPlayer's Roster row: releasedAt = effective, source = "DROP"
 *   - Update activatePlayer's Roster row: assignedPosition = dropPlayer's former slot
 *   - Create RosterSlotEvent(event="IL_ACTIVATE")
 *   - Create two TransactionEvent rows (IL_ACTIVATE + DROP)
 */
router.post(
  "/transactions/il-activate",
  requireAuth,
  validateBody(ilActivateSchema),
  requireSeasonStatus(["IN_SEASON"]),
  asyncHandler(async (req, res) => {
    const { leagueId, teamId, activatePlayerId, dropPlayerId, reason, effectiveDate: effDateRaw } = req.body;

    if (!(await requireCommishOrAdmin(req, res, leagueId))) return;

    let effective: Date;
    try {
      effective = resolveEffectiveDate(effDateRaw);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid effectiveDate" });
    }
    const isBackdated = effDateRaw != null;

    // Pre-transaction: fetch both roster rows + position-inherit check.
    const ilRoster = await prisma.roster.findFirst({
      where: { teamId, playerId: activatePlayerId, releasedAt: null },
      select: { id: true, assignedPosition: true },
    });
    if (!ilRoster || ilRoster.assignedPosition !== "IL") {
      return res.status(400).json({
        error: "Activate player is not on this team's IL slot.",
        code: "NOT_ON_IL",
      });
    }

    const dropRoster = await prisma.roster.findFirst({
      where: { teamId, playerId: dropPlayerId, releasedAt: null },
      select: { id: true, assignedPosition: true, acquiredAt: true },
    });
    if (!dropRoster) {
      return res.status(400).json({
        error: "Drop player is not on this team's roster.",
        code: "IL_UNKNOWN_PLAYER",
      });
    }
    if (dropRoster.assignedPosition === "IL") {
      return res.status(400).json({
        error: "Drop player is on IL — cannot drop an IL player via /il-activate. Use /transactions/drop to release them.",
        code: "DROP_REQUIRED",
      });
    }
    const targetSlot = dropRoster.assignedPosition ?? "UT";

    const activatePlayer = await prisma.player.findUnique({
      where: { id: activatePlayerId },
      select: { id: true, name: true, posList: true },
    });
    if (!activatePlayer) {
      return res.status(404).json({ error: `Activate player #${activatePlayerId} not found.` });
    }
    try {
      assertAddEligibleForDropSlot(
        { name: activatePlayer.name, posList: activatePlayer.posList },
        targetSlot,
      );
    } catch (err) {
      if (isRosterRuleError(err)) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    // Guard: effective must be after dropRoster.acquiredAt (symmetric with /drop).
    if (effective <= dropRoster.acquiredAt) {
      return res.status(400).json({
        error: `effectiveDate (${effective.toISOString().slice(0, 10)}) must be after the drop player was acquired (${dropRoster.acquiredAt.toISOString().slice(0, 10)})`,
        code: "INVALID_EFFECTIVE_DATE",
      });
    }

    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
    const season = league?.season ?? new Date().getFullYear();

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;

        // Re-verify both rows FOR UPDATE.
        const il = await tx.roster.findFirst({
          where: { id: ilRoster.id, releasedAt: null, assignedPosition: "IL" },
          select: { id: true },
        });
        const drop = await tx.roster.findFirst({
          where: { id: dropRoster.id, releasedAt: null },
          select: { id: true, assignedPosition: true },
        });
        if (!il) {
          throw new RosterRuleError("NOT_ON_IL",
            "Activate player is no longer on IL.");
        }
        if (!drop || drop.assignedPosition === "IL") {
          throw new RosterRuleError("IL_UNKNOWN_PLAYER",
            "Drop player's roster entry changed mid-transaction.");
        }

        // Release the drop player.
        await tx.roster.update({
          where: { id: dropRoster.id },
          data: { releasedAt: effective, source: "DROP" },
        });
        // Move activatePlayer from IL → dropped slot.
        await tx.roster.update({
          where: { id: ilRoster.id },
          data: { assignedPosition: targetSlot },
        });

        await tx.rosterSlotEvent.create({
          data: {
            teamId, playerId: activatePlayerId, leagueId,
            event: "IL_ACTIVATE", effDate: effective,
            createdBy: req.user!.id, reason: reason ?? null,
          },
        });

        await tx.transactionEvent.create({
          data: {
            rowHash: `IL_ACTIVATE-${crypto.randomUUID()}-${activatePlayerId}`,
            leagueId, season, effDate: effective, submittedAt: new Date(),
            teamId, playerId: activatePlayerId,
            transactionRaw: `IL activate — returned ${activatePlayer.name} to ${targetSlot}`,
            transactionType: "IL_ACTIVATE",
          },
        });
        await tx.transactionEvent.create({
          data: {
            rowHash: `DROP-${crypto.randomUUID()}-${dropPlayerId}`,
            leagueId, season, effDate: effective, submittedAt: new Date(),
            teamId, playerId: dropPlayerId,
            transactionRaw: `IL activate — dropped from ${targetSlot}`,
            transactionType: "DROP",
          },
        });
      }, { timeout: 30_000 });
    } catch (err) {
      if (isRosterRuleError(err)) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    writeAuditLog({
      userId: req.user!.id,
      action: "TRANSACTION_IL_ACTIVATE",
      resourceType: "Transaction",
      metadata: {
        leagueId, teamId, activatePlayerId, dropPlayerId,
        effectiveDate: effective.toISOString(),
        backdated: isBackdated,
        targetSlot,
      },
    });

    // Phase 3 backdate reconcile hook (same pattern as /il-stash).
    if (isBackdated) {
      await enqueueReconcileForEffective(leagueId, effective);
    }

    return res.json({ success: true, activatePlayerId, dropPlayerId });
  }),
);

export const transactionsRouter = router;
export default transactionsRouter;
