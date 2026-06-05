// server/src/routes/transactions.ts
import crypto from "crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireLeagueMember, requireTeamOwnerOrCommissioner } from "../../middleware/auth.js";
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
import { getMlbPlayerStatus } from "../../lib/mlbApi.js";
import {
  SyncIlStatusBodySchema,
  ClaimRequestSchema,
  DropRequestSchema,
  IlStashRequestSchema,
  IlActivateRequestSchema,
  type ClaimResponse,
  type IlStashResponse,
  type IlActivateResponse,
  type SlotChange,
} from "../../../../shared/api/rosterMoves.js";
import { RosterRuleError, isRosterRuleError } from "../../lib/rosterRuleError.js";
import { enforceRosterRules } from "../../lib/featureFlags.js";
import {
  loadSlotCapacities,
  buildCandidatesForTeam,
  verifyEligibilityUnchanged,
  applyAssignments,
  resolveLineup,
  type AppliedReassignment,
} from "./lib/autoResolveLineup.js";
import { slotsFor } from "./lib/slotMatcher.js";
import { negotiateInheritedSlot } from "./lib/positionInherit.js";
import { enqueueIlFeeReconcile } from "../../lib/outboxDrainer.js";
import { clearPlayersCache } from "../players/services/playersListCache.js";
import { clearStandingsCache } from "../standings/services/standingsService.js";
import { clearAwardsCache } from "../awards/services/awardsService.js";

/**
 * Invalidate every cache keyed on (leagueId, ...) after a successful roster
 * mutation (claim, drop, il-stash, il-activate). The `/api/players` cache is
 * the primary target (todo #137); the standings cache is a free addition that
 * also satisfies todo #143 (standings invalidation on mutations); the awards
 * cache (todo #119) joins the same fan-out so MVP/Cy Young rankings reflect
 * roster moves on the next refresh.
 *
 * Sync, lightweight, must run after the transaction commits but before the
 * response is sent — otherwise a follow-up request can read a stale cache
 * before the in-memory entry is purged.
 */
function invalidateLeagueCaches(leagueId: number): void {
  clearPlayersCache(leagueId);
  clearStandingsCache(leagueId);
  clearAwardsCache(leagueId);
}

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

// Drop / Claim envelopes are sourced from `shared/api/rosterMoves.ts` so client
// and server can never drift (todo #123). The tightened `mlbId` regex/bounds
// (#187) live in MlbIdSchema inside the shared file.
const dropSchema = DropRequestSchema;
const claimSchema = ClaimRequestSchema;

const router = Router();

router.post(
  "/transactions/claim/preview",
  requireAuth,
  validateBody(claimSchema),
  requireSeasonStatus(["IN_SEASON"]),
  requireTeamOwnerOrCommissioner(),
  asyncHandler(async (req, res) => {
    const { leagueId, teamId, dropPlayerId } = req.body;
    const enforce = enforceRosterRules();

    if (enforce && !dropPlayerId) {
      return res.status(400).json({
        ok: false,
        error: "In-season claims require a dropPlayerId — every add must pair with a drop.",
        code: "DROP_REQUIRED",
      });
    }

    let { playerId } = req.body;
    const { mlbId } = req.body;
    if (!playerId && mlbId) {
      const player = await prisma.player.findFirst({ where: { mlbId: Number(mlbId) } });
      if (!player) {
        return res.status(404).json({
          ok: false,
          error: `Player with MLB ID ${mlbId} not found in database.`,
          code: "IL_UNKNOWN_PLAYER",
        });
      }
      playerId = player.id;
    }
    if (!playerId) {
      return res.status(400).json({ ok: false, error: "Missing playerId or mlbId" });
    }

    const existingRoster = await prisma.roster.findFirst({
      where: { playerId, team: { leagueId }, releasedAt: null },
      include: { team: true },
    });
    if (existingRoster && existingRoster.teamId !== teamId) {
      return res.status(400).json({
        ok: false,
        error: `Player is already on team: ${existingRoster.team.name}`,
        code: "OWNERSHIP_CONFLICT",
      });
    }
    if (existingRoster && existingRoster.teamId === teamId) {
      return res.status(400).json({
        ok: false,
        error: "Player is already on this team's active roster",
        code: "OWNERSHIP_CONFLICT",
      });
    }

    let dropRosterPreview: { id: number; assignedPosition: string | null } | null = null;
    if (dropPlayerId) {
      dropRosterPreview = await prisma.roster.findFirst({
        where: { teamId, playerId: dropPlayerId, releasedAt: null },
        select: { id: true, assignedPosition: true },
      });
      if (!dropRosterPreview) {
        return res.status(400).json({
          ok: false,
          error: `Drop player (id ${dropPlayerId}) is not on this team's active roster.`,
          code: "IL_UNKNOWN_PLAYER",
        });
      }
      if (dropRosterPreview.assignedPosition === "IL") {
        return res.status(400).json({
          ok: false,
          error: "Drop player is on IL — choose an active roster player.",
          code: "IL_UNKNOWN_PLAYER",
        });
      }
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true, posList: true },
    });
    if (!player) {
      return res.status(404).json({
        ok: false,
        error: `Player #${playerId} not found.`,
        code: "IL_UNKNOWN_PLAYER",
      });
    }

    // Parallel reads — slotCapacities (LeagueRule) and candidates (roster +
    // players) take independent inputs. Per todo #139 these were serial,
    // pinning the only Supabase connection across two round trips.
    const [slotCapacities, candidatesResult] = await Promise.all([
      loadSlotCapacities(prisma as any, leagueId),
      buildCandidatesForTeam(prisma as any, teamId, {
        excludeRosterIds: dropRosterPreview ? [dropRosterPreview.id] : [],
        includeNewPlayer: { playerId: player.id, posList: player.posList ?? "" },
      }),
    ]);
    const { candidates } = candidatesResult;
    let result = resolveLineup(candidates, slotCapacities);
    if (result.ok === false) {
      const refreshed = await verifyEligibilityUnchanged(prisma as any, candidates);
      if (refreshed) result = resolveLineup(refreshed, slotCapacities);
    }
    if (result.ok === false) {
      return res.status(400).json({
        ok: false,
        error: result.reason,
        code: result.code,
        unfilledSlots: result.unfilledSlots,
        unassignedPlayers: result.unassignedPlayers,
      });
    }

    return res.json({
      ok: true,
      message: "Roster rules satisfied.",
      appliedReassignments: result.assignments.filter((a) => a.rosterId !== 0),
    });
  }),
);

/**
 * GET /api/transactions
 * Requires leagueId query param + membership check
 */
router.get("/transactions", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  // Bound take in [1, 200] and skip in [0, 100_000]. Without these clamps a
  // caller can pass `take=999999` and force Prisma to materialize the full
  // TransactionEvent table for a league — same DoS shape as #187. Default
  // page size stays 50 to preserve existing client behavior.
  const skip = Math.min(Math.max(Number(req.query.skip) || 0, 0), 100_000);
  const take = Math.min(Math.max(Number(req.query.take) || 50, 1), 200);

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
router.post("/transactions/claim", requireAuth, validateBody(claimSchema), requireSeasonStatus(["IN_SEASON"]), requireTeamOwnerOrCommissioner(), asyncHandler(async (req, res) => {
  const { leagueId, teamId, dropPlayerId, effectiveDate: effDateRaw, slotChanges } = req.body as {
    leagueId: number; teamId: number; dropPlayerId?: number; effectiveDate?: string;
    slotChanges?: SlotChange[];
  };

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

  // 3. Drop-target preview. The bipartite matcher (inside the transaction)
  //    figures out the legal end-state and may shuffle other players to make
  //    room — those reassignments are echoed back via `appliedReassignments`.
  //    The pre-flight strict-pairwise check was removed when auto-resolve
  //    became unconditional (PR2 cuts §0).
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
  }

  // 5. Look up league season for transaction records
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();

  // Pre-tx read of the claimed player's identity so the response envelope
  // can echo `mlbId` + `name` (#194). The tx body re-reads inside the
  // transaction for the position-inheritance branch; this read is read-
  // only and only feeds the response shape.
  const claimedPlayerInfo = await prisma.player.findUnique({
    where: { id: playerId },
    select: { mlbId: true, name: true },
  });

  // 4. Perform Transaction (Atomic) — lock team row to prevent concurrent roster limit bypass
  let appliedReassignments: AppliedReassignment[] = [];
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

    // Process drop FIRST so matcher (when on) sees the post-drop state.
    let droppedRosterId: number | null = null;
    let dropPlayerPosList = "";
    if (dropPlayerId) {
      const dropRoster = await tx.roster.findFirst({
        where: { teamId, playerId: dropPlayerId, releasedAt: null }
      });

      if (dropRoster) {
        droppedRosterId = dropRoster.id;
        await tx.roster.update({ where: { id: dropRoster.id }, data: { releasedAt: effective, source: "DROP" } });

        const dropPlayer = await tx.player.findUnique({ where: { id: dropPlayerId } });
        dropPlayerPosList = dropPlayer?.posList ?? "";
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

    // Position inheritance: added player takes the dropped player's slot.
    // If the drop player's slot isn't one the new player can fill, find the
    // best shared slot (intersection of both players' eligible slots) so the
    // new player is placed correctly from the start rather than relying on
    // the bipartite matcher to fix a bad initial assignment.
    const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);
    const primaryPos = (player?.posPrimary ?? "UT").toUpperCase();
    const legacyAssignedPos = PITCHER_POS.has(primaryPos) ? "P" : primaryPos;
    const inheritedPos = dropRosterPreview?.assignedPosition ?? null;
    const resolvedInheritedPos = (enforce && inheritedPos && inheritedPos !== "IL" && player?.posList)
      ? negotiateInheritedSlot(player.posList, inheritedPos, dropPlayerPosList)
      : inheritedPos;
    const assignedPos = (enforce && resolvedInheritedPos && resolvedInheritedPos !== "IL")
      ? resolvedInheritedPos
      : legacyAssignedPos;

    const newRoster = await tx.roster.create({
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

    // Owner-directed slot changes: pre-assign specific players to
    // requested slots before the bipartite matcher runs. Each changed
    // player is "owner-pinned" — the matcher won't reassign them.
    const ownerPinnedRosterIds = new Set<number>();
    const ownerAppliedChanges: AppliedReassignment[] = [];
    if (enforce && slotChanges && slotChanges.length > 0) {
      const activeRows = await tx.roster.findMany({
        where: { teamId, releasedAt: null },
        select: {
          id: true, playerId: true, assignedPosition: true,
          player: { select: { posList: true, name: true, mlbId: true } },
        },
      });
      const byPlayerId = new Map(activeRows.map((r) => [r.playerId, r]));
      for (const change of slotChanges) {
        const row = byPlayerId.get(change.playerId);
        if (!row) {
          throw new RosterRuleError(
            "INVALID_SLOT_CHANGE",
            `Player ${change.playerId} is not on this team's active roster`,
            {},
          );
        }
        const eligible = slotsFor(row.player.posList ?? "");
        if (!eligible.has(change.slot)) {
          throw new RosterRuleError(
            "INVALID_SLOT_CHANGE",
            `${row.player.name ?? "Player"} is not eligible for the ${change.slot} slot`,
            {},
          );
        }
        const oldSlot = row.assignedPosition ?? "";
        if (oldSlot !== change.slot) {
          await tx.roster.update({ where: { id: row.id }, data: { assignedPosition: change.slot } });
          ownerAppliedChanges.push({
            rosterId: row.id,
            playerId: row.playerId,
            mlbId: row.player.mlbId ?? null,
            playerName: row.player.name ?? `Player #${row.playerId}`,
            oldSlot,
            newSlot: change.slot,
          });
        }
        ownerPinnedRosterIds.add(row.id);
      }
    }

    // Yahoo-style auto-resolve: run bipartite matcher to resolve position
    // conflicts. Reads a fresh in-tx view so the daily eligibility sync
    // doesn't race us.
    if (enforce && dropPlayerId && resolvedInheritedPos && resolvedInheritedPos !== "IL") {
      // Parallel reads inside the tx — both touch independent rows.
      // Holds the connection ~300ms→~150ms per claim under
      // connection_limit=1 (todo #139).
      const [slotCapacities, candidatesResult] = await Promise.all([
        loadSlotCapacities(tx, leagueId),
        buildCandidatesForTeam(tx, teamId, { ownerPinnedRosterIds }),
      ]);
      const { candidates, playerNames, playerMlbIds } = candidatesResult;

      // Build rosterRowToPlayerId for echo (newRoster id → playerId).
      const rosterRowToPlayerId = new Map<number, number>();
      for (const c of candidates) rosterRowToPlayerId.set(c.rosterId, c.playerId);
      // Augment names and mlbIds maps with the new player for the toast.
      if (player?.name) playerNames.set(newRoster.id, player.name);
      if (player?.mlbId != null) playerMlbIds.set(newRoster.id, player.mlbId);

      let result = resolveLineup(candidates, slotCapacities);

      if (result.ok === false) {
        // Re-read posList for involved players. If they shifted, retry once.
        const refreshed = await verifyEligibilityUnchanged(tx, candidates);
        if (refreshed) {
          result = resolveLineup(refreshed, slotCapacities);
          if (result.ok === false) {
            throw new RosterRuleError(
              "ELIGIBILITY_LOST_MID_OPERATION",
              "Player eligibility changed during processing. Please retry.",
              { unfilledSlots: result.unfilledSlots, unassignedPlayers: result.unassignedPlayers },
            );
          }
        } else {
          throw new RosterRuleError(
            "NO_LEGAL_ASSIGNMENT",
            result.reason,
            { unfilledSlots: result.unfilledSlots, unassignedPlayers: result.unassignedPlayers },
          );
        }
      }

      // Apply slot reassignments (excluding the new row's already-set slot
      // if matcher kept it). Filter out no-op assignments where the matcher
      // picked the same slot the row already has.
      if (result.ok) {
        const matcherChanges = await applyAssignments(
          tx,
          result.assignments,
          playerNames,
          rosterRowToPlayerId,
          playerMlbIds,
        );
        // Owner-directed changes come first in the echo (they're the
        // explicit ones). Matcher changes follow for any auto-resolved rows.
        appliedReassignments = [...ownerAppliedChanges, ...matcherChanges];
      }
    } else {
      // Even when the matcher doesn't run (e.g. no drop), echo owner changes.
      appliedReassignments = ownerAppliedChanges;
    }

    // Emit a SLOT_CHANGE event per cascade reassignment (whether owner-
    // directed or auto-resolved) so the activity log shows the full
    // story of the move — not just the headline claim. The claimed
    // player's own slot is captured by the ADD event above; skip if
    // the reassignment is for the claimed player.
    for (const r of appliedReassignments) {
      if (r.playerId === playerId) continue;
      await tx.transactionEvent.create({
        data: {
          rowHash: `SLOT_CHANGE-${crypto.randomUUID()}-${r.playerId}`,
          leagueId, season, effDate: effective, submittedAt: new Date(),
          teamId, playerId: r.playerId,
          transactionRaw: `${r.playerName}: ${r.oldSlot} → ${r.newSlot} (auto-resolve from claim)`,
          transactionType: "SLOT_CHANGE",
          toPosition: r.newSlot,
        },
      });
    }
  }, { timeout: 30_000 });
  } catch (err: unknown) {
    // Typed guard errors from Phase 1 libs (roster cap, overlap, ghost-IL,
    // position-inherit) carry a code for programmatic handling.
    if (isRosterRuleError(err)) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    // Do NOT echo err.message — it can leak Prisma constraint names, SQL
    // fragments, or internal invariant text. Log server-side and return a
    // generic envelope (todo #158).
    logger.error(
      {
        err: err instanceof Error ? err.message : String(err),
        leagueId,
        teamId,
        playerId,
        userId: req.user?.id,
      },
      "transactions/claim: unhandled error",
    );
    return res.status(500).json({ error: "Transaction failed", code: "INTERNAL" });
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

  invalidateLeagueCaches(leagueId);
  const claimResp: ClaimResponse = {
    success: true,
    playerId,
    mlbId: claimedPlayerInfo?.mlbId ?? null,
    name: claimedPlayerInfo?.name ?? undefined,
    appliedReassignments,
  };
  return res.json(claimResp);
}));

/**
 * POST /api/transactions/drop
 * Drops a player from a team roster. Commissioner-only.
 */
router.post("/transactions/drop", requireAuth, validateBody(dropSchema), requireSeasonStatus(["IN_SEASON"]), requireTeamOwnerOrCommissioner(), asyncHandler(async (req, res) => {
  const { leagueId, teamId, playerId, effectiveDate: effDateRaw } = req.body;

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
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        leagueId,
        teamId,
        playerId,
        userId: req.user?.id,
      },
      "transactions/drop: invalid effectiveDate",
    );
    return res.status(400).json({ error: "Invalid effectiveDate" });
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

  invalidateLeagueCaches(leagueId);
  return res.json({ success: true, playerId });
}));

// ─── IL Endpoints (Phase 2a) ──────────────────────────────────────
// Atomic "stash + add" and "activate + drop" flows per plan Q10=a and Q11=b.
// No standalone IL moves. Both endpoints are commissioner/admin-only.

// IL stash envelope sourced from `shared/api/rosterMoves.ts` (#194).
// Stash-only mode (omit both addPlayerId and addMlbId) is documented in
// the shared schema's JSDoc.
const ilStashSchema = IlStashRequestSchema;

router.post(
  "/transactions/il-stash/preview",
  requireAuth,
  validateBody(ilStashSchema),
  requireSeasonStatus(["IN_SEASON"]),
  requireTeamOwnerOrCommissioner(),
  asyncHandler(async (req, res) => {
    const { leagueId, teamId, stashPlayerId, addPlayerId: addPlayerIdInput, addMlbId, effectiveDate: effDateRaw } = req.body;

    let effective: Date;
    try {
      effective = resolveEffectiveDate(effDateRaw);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Invalid effectiveDate",
        code: "INVALID_EFFECTIVE_DATE",
      });
    }
    const isBackdated = effDateRaw != null;

    let addPlayerId = addPlayerIdInput as number | undefined;
    if (!addPlayerId && addMlbId != null) {
      const mlbIdNum = Number(addMlbId);
      const p = await prisma.player.findFirst({ where: { mlbId: mlbIdNum } });
      if (!p) {
        return res.status(404).json({
          ok: false,
          error: `Player with MLB ID ${addMlbId} not found in database.`,
          code: "IL_UNKNOWN_PLAYER",
        });
      }
      addPlayerId = p.id;
    }
    const stashOnly = addPlayerId == null;

    const stashRoster = await prisma.roster.findFirst({
      where: { teamId, playerId: stashPlayerId, releasedAt: null },
      select: { id: true, assignedPosition: true },
    });
    if (!stashRoster) {
      return res.status(400).json({
        ok: false,
        error: "Stash player is not on this team's active roster.",
        code: "IL_UNKNOWN_PLAYER",
      });
    }
    if (stashRoster.assignedPosition === "IL") {
      return res.status(400).json({
        ok: false,
        error: "Stash player is already on IL.",
        code: "NOT_ON_IL",
      });
    }

    try {
      await checkMlbIlEligibility(stashPlayerId);
    } catch (err) {
      if (isRosterRuleError(err)) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      throw err;
    }

    const addPlayer = stashOnly
      ? null
      : await prisma.player.findUnique({
          where: { id: addPlayerId! },
          select: { id: true, name: true, posList: true, mlbId: true },
        });
    if (!stashOnly && !addPlayer) {
      return res.status(404).json({
        ok: false,
        error: `Add player #${addPlayerId} not found.`,
        code: "IL_UNKNOWN_PLAYER",
      });
    }

    const existingRoster = stashOnly
      ? null
      : await prisma.roster.findFirst({
          where: { playerId: addPlayerId!, team: { leagueId }, releasedAt: null },
          include: { team: true },
        });
    if (existingRoster && !isBackdated && existingRoster.teamId !== teamId) {
      return res.status(400).json({
        ok: false,
        error: `Add player is already on team: ${existingRoster.team.name}`,
        code: "OWNERSHIP_CONFLICT",
      });
    }
    if (existingRoster && existingRoster.teamId === teamId) {
      return res.status(400).json({
        ok: false,
        error: "Add player is already on this team's active roster",
        code: "OWNERSHIP_CONFLICT",
      });
    }

    try {
      await assertIlSlotAvailable(prisma as any, teamId, leagueId);
      await assertNoGhostIl(prisma, teamId);
    } catch (err) {
      if (isRosterRuleError(err)) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      throw err;
    }

    // Parallel reads — independent inputs (todo #139).
    const [slotCapacities, candidatesResult] = await Promise.all([
      loadSlotCapacities(prisma as any, leagueId),
      buildCandidatesForTeam(prisma as any, teamId, {
        excludeRosterIds: [stashRoster.id],
        includeNewPlayer: addPlayer ? { playerId: addPlayer.id, posList: addPlayer.posList ?? "" } : undefined,
      }),
    ]);
    const { candidates } = candidatesResult;
    let result = resolveLineup(candidates, slotCapacities);
    if (result.ok === false) {
      const refreshed = await verifyEligibilityUnchanged(prisma as any, candidates);
      if (refreshed) result = resolveLineup(refreshed, slotCapacities);
    }
    if (result.ok === false) {
      return res.status(400).json({
        ok: false,
        error: result.reason,
        code: result.code,
        unfilledSlots: result.unfilledSlots,
        unassignedPlayers: result.unassignedPlayers,
      });
    }

    return res.json({
      ok: true,
      message: "Roster rules satisfied.",
      appliedReassignments: result.assignments.filter((a) => a.rosterId !== 0),
    });
  }),
);

/**
 * POST /api/transactions/il-stash
 *
 * Atomic: move `stashPlayerId` from the team's active roster to an IL slot,
 * AND add `addPlayerId` (or resolve via `addMlbId`) to the active slot the
 * stash player just vacated. Both operations succeed, or neither.
 *
 * Guards:
 *   - stashPlayer's MLB status must be an "Injured …-Day" designation (10/15/
 *     60-Day IL, per the MLB statsapi 40-man feed format; pre-tx, fail closed
 *     on feed unavailability — plan R9)
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
  requireTeamOwnerOrCommissioner(),
  asyncHandler(async (req, res) => {
    const { leagueId, teamId, stashPlayerId, addPlayerId: addPlayerIdInput, addMlbId, reason, effectiveDate: effDateRaw } = req.body;

    // Pre-transaction: resolve effective date.
    let effective: Date;
    try {
      effective = resolveEffectiveDate(effDateRaw);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid effectiveDate" });
    }
    const isBackdated = effDateRaw != null;

    // Pre-transaction: resolve addPlayer (by id or via mlbId lookup).
    // Stash-only mode (v3 hub IL scenario) — skip when neither id nor
    // mlbId is provided. The IL slot transition still fires; the active
    // roster shape just changes by -1.
    let addPlayerId = addPlayerIdInput as number | undefined;
    if (!addPlayerId && addMlbId != null) {
      const mlbIdNum = Number(addMlbId);
      const p = await prisma.player.findFirst({ where: { mlbId: mlbIdNum } });
      if (!p) {
        return res.status(404).json({ error: `Player with MLB ID ${addMlbId} not found in database.` });
      }
      addPlayerId = p.id;
    }
    const stashOnly = addPlayerId == null;

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

    // Pre-tx read of stash player identity so the response envelope can
    // echo `stashMlbId` + `stashName` (#194). Read-only — only feeds the
    // response shape.
    const stashPlayerInfo = await prisma.player.findUnique({
      where: { id: stashPlayerId },
      select: { mlbId: true, name: true },
    });

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
    // Stash-only mode: skip the add-player resolution entirely.
    const addPlayer = stashOnly
      ? null
      : await prisma.player.findUnique({
          where: { id: addPlayerId! },
          select: { id: true, name: true, posPrimary: true, posList: true, mlbId: true, mlbTeam: true },
        });
    if (!stashOnly && !addPlayer) {
      return res.status(404).json({ error: `Add player #${addPlayerId} not found.` });
    }

    // Yahoo-style auto-resolve: position-fit is deferred to the bipartite
    // matcher (runs in-tx). The strict pre-flight pairwise check was removed
    // when auto-resolve became unconditional (PR2 cuts §0).

    // Pre-transaction: addPlayer's current owner (for god-mode cross-team release).
    const existingRoster = stashOnly
      ? null
      : await prisma.roster.findFirst({
          where: { playerId: addPlayerId!, team: { leagueId }, releasedAt: null },
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
    let stashAppliedReassignments: AppliedReassignment[] = [];
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
        // Skipped entirely in stash-only mode (no add player to validate).
        const excludeRosterIds: number[] = [];
        if (!stashOnly && existingRoster && existingRoster.teamId !== teamId) {
          await tx.roster.update({
            where: { id: existingRoster.id },
            data: { releasedAt: effective, source: "COMMISSIONER_REASSIGN" },
          });
          excludeRosterIds.push(existingRoster.id);
          await tx.transactionEvent.create({
            data: {
              rowHash: `REASSIGN-DROP-${crypto.randomUUID()}-${addPlayerId}`,
              leagueId, season, effDate: effective, submittedAt: new Date(),
              teamId: existingRoster.teamId, playerId: addPlayerId!,
              transactionRaw: `Commissioner reassign (IL stash) — released from ${existingRoster.team.name}`,
              transactionType: 'DROP',
            },
          });
        }
        if (!stashOnly) {
          await assertNoOwnershipConflict(tx, {
            leagueId, playerId: addPlayerId!,
            acquiredAt: effective, releasedAt: null,
            excludeRosterIds,
          });
        }

        // Move stashPlayer to IL slot.
        await tx.roster.update({
          where: { id: stashRoster.id },
          data: { assignedPosition: "IL" },
        });
        // Create addPlayer on the slot stashPlayer just vacated (position-inherit).
        // Stash-only mode: skip the create — the freed slot stays empty
        // and the matcher reshuffles the rest of the roster to fill it
        // from BN if a position-eligible bench player exists.
        let newStashRoster: { id: number } | null = null;
        if (!stashOnly) {
          newStashRoster = await tx.roster.create({
            data: {
              teamId, playerId: addPlayerId!, source: "il_stash",
              acquiredAt: effective, assignedPosition: stashSlot,
            },
          });
        }

        // Yahoo-style auto-resolve: re-shuffle the active roster if the
        // strict inherited slot turned out to be infeasible (e.g., the
        // added player can't actually play the stashed player's slot).
        {
          // Parallel reads inside the tx (todo #139).
          const [slotCapacities, candidatesResult] = await Promise.all([
            loadSlotCapacities(tx, leagueId),
            buildCandidatesForTeam(tx, teamId),
          ]);
          const { candidates, playerNames, playerMlbIds: stashPlayerMlbIds } = candidatesResult;
          const rosterRowToPlayerId = new Map<number, number>();
          for (const c of candidates) rosterRowToPlayerId.set(c.rosterId, c.playerId);
          if (addPlayer && newStashRoster && addPlayer.name) {
            playerNames.set(newStashRoster.id, addPlayer.name);
          }
          if (addPlayer && newStashRoster && addPlayer.mlbId != null) {
            stashPlayerMlbIds.set(newStashRoster.id, addPlayer.mlbId);
          }

          let result = resolveLineup(candidates, slotCapacities);
          if (result.ok === false) {
            const refreshed = await verifyEligibilityUnchanged(tx, candidates);
            if (refreshed) {
              result = resolveLineup(refreshed, slotCapacities);
              if (result.ok === false) {
                throw new RosterRuleError(
                  "ELIGIBILITY_LOST_MID_OPERATION",
                  "Player eligibility changed during processing. Please retry.",
                  { unfilledSlots: result.unfilledSlots, unassignedPlayers: result.unassignedPlayers },
                );
              }
            } else {
              throw new RosterRuleError(
                "NO_LEGAL_ASSIGNMENT",
                result.reason,
                { unfilledSlots: result.unfilledSlots, unassignedPlayers: result.unassignedPlayers },
              );
            }
          }
          if (result.ok) {
            stashAppliedReassignments = await applyAssignments(
              tx,
              result.assignments,
              playerNames,
              rosterRowToPlayerId,
              stashPlayerMlbIds,
            );
          }
        }

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
        if (!stashOnly && addPlayer) {
          await tx.transactionEvent.create({
            data: {
              rowHash: `CLAIM-${crypto.randomUUID()}-${addPlayerId}`,
              leagueId, season, effDate: effective, submittedAt: new Date(),
              teamId, playerId: addPlayerId!,
              transactionRaw: `IL stash — added ${addPlayer.name}`,
              transactionType: "ADD",
            },
          });
        }

        // SLOT_CHANGE event per cascade reassignment so the activity
        // log captures any auto-resolve shuffling. Excludes the stashed
        // player (their IL move is the IL_STASH event) and the added
        // player (their slot is the ADD event).
        for (const r of stashAppliedReassignments) {
          if (r.playerId === stashPlayerId || (addPlayerId && r.playerId === addPlayerId)) continue;
          await tx.transactionEvent.create({
            data: {
              rowHash: `SLOT_CHANGE-${crypto.randomUUID()}-${r.playerId}`,
              leagueId, season, effDate: effective, submittedAt: new Date(),
              teamId, playerId: r.playerId,
              transactionRaw: `${r.playerName}: ${r.oldSlot} → ${r.newSlot} (auto-resolve from IL stash)`,
              transactionType: "SLOT_CHANGE",
              toPosition: r.newSlot,
            },
          });
        }
      }, { timeout: 30_000 });
    } catch (err) {
      if (isRosterRuleError(err)) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      // Do NOT echo err.message — it can leak Prisma constraint names, SQL
      // fragments, or internal invariant text. Log server-side and return a
      // generic envelope (todo #158).
      logger.error(
        {
          err: err instanceof Error ? err.message : String(err),
          leagueId,
          teamId,
          stashPlayerId,
          addPlayerId: addPlayerId ?? null,
          userId: req.user?.id,
        },
        "transactions/il-stash: unhandled error",
      );
      return res.status(500).json({ error: "Transaction failed", code: "INTERNAL" });
    }

    writeAuditLog({
      userId: req.user!.id,
      action: "TRANSACTION_IL_STASH",
      resourceType: "Transaction",
      metadata: {
        leagueId, teamId, stashPlayerId, addPlayerId: addPlayerId ?? null,
        stashOnly,
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

    invalidateLeagueCaches(leagueId);
    const stashResp: IlStashResponse = {
      success: true,
      stashPlayerId,
      addPlayerId: addPlayerId ?? null,
      stashOnly,
      stashMlbId: stashPlayerInfo?.mlbId ?? null,
      stashName: stashPlayerInfo?.name ?? undefined,
      addMlbId: addPlayer?.mlbId ?? null,
      addName: addPlayer?.name ?? null,
      appliedReassignments: stashAppliedReassignments,
    };
    return res.json(stashResp);
  }),
);

// IL activate envelope sourced from `shared/api/rosterMoves.ts` (#194).
const ilActivateSchema = IlActivateRequestSchema;

router.post(
  "/transactions/il-activate/preview",
  requireAuth,
  validateBody(ilActivateSchema),
  requireSeasonStatus(["IN_SEASON"]),
  requireTeamOwnerOrCommissioner(),
  asyncHandler(async (req, res) => {
    const { leagueId, teamId, activatePlayerId, dropPlayerId, effectiveDate: effDateRaw } = req.body;

    let effective: Date;
    try {
      effective = resolveEffectiveDate(effDateRaw);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Invalid effectiveDate",
        code: "INVALID_EFFECTIVE_DATE",
      });
    }

    const ilRoster = await prisma.roster.findFirst({
      where: { teamId, playerId: activatePlayerId, releasedAt: null },
      select: { id: true, assignedPosition: true },
    });
    if (!ilRoster || ilRoster.assignedPosition !== "IL") {
      return res.status(400).json({
        ok: false,
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
        ok: false,
        error: "Drop player is not on this team's roster.",
        code: "IL_UNKNOWN_PLAYER",
      });
    }
    if (dropRoster.assignedPosition === "IL") {
      return res.status(400).json({
        ok: false,
        error: "Drop player is on IL — cannot drop an IL player via /il-activate. Use /transactions/drop to release them.",
        code: "DROP_REQUIRED",
      });
    }
    if (effective <= dropRoster.acquiredAt) {
      return res.status(400).json({
        ok: false,
        error: `effectiveDate (${effective.toISOString().slice(0, 10)}) must be after the drop player was acquired (${dropRoster.acquiredAt.toISOString().slice(0, 10)})`,
        code: "INVALID_EFFECTIVE_DATE",
      });
    }

    const activatePlayer = await prisma.player.findUnique({
      where: { id: activatePlayerId },
      select: { id: true, name: true, posList: true, mlbId: true },
    });
    if (!activatePlayer) {
      return res.status(404).json({
        ok: false,
        error: `Activate player #${activatePlayerId} not found.`,
        code: "IL_UNKNOWN_PLAYER",
      });
    }

    // Parallel reads — independent inputs (todo #139).
    const [slotCapacities, candidatesResult] = await Promise.all([
      loadSlotCapacities(prisma as any, leagueId),
      buildCandidatesForTeam(prisma as any, teamId, {
        excludeRosterIds: [ilRoster.id, dropRoster.id],
        includeNewPlayer: { playerId: activatePlayer.id, posList: activatePlayer.posList ?? "" },
      }),
    ]);
    const { candidates } = candidatesResult;
    let result = resolveLineup(candidates, slotCapacities);
    if (result.ok === false) {
      const refreshed = await verifyEligibilityUnchanged(prisma as any, candidates);
      if (refreshed) result = resolveLineup(refreshed, slotCapacities);
    }
    if (result.ok === false) {
      return res.status(400).json({
        ok: false,
        error: result.reason,
        code: result.code,
        unfilledSlots: result.unfilledSlots,
        unassignedPlayers: result.unassignedPlayers,
      });
    }

    return res.json({
      ok: true,
      message: "Roster rules satisfied.",
      appliedReassignments: result.assignments.filter((a) => a.rosterId !== 0),
    });
  }),
);

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
  requireTeamOwnerOrCommissioner(),
  asyncHandler(async (req, res) => {
    const { leagueId, teamId, activatePlayerId, dropPlayerId, reason, effectiveDate: effDateRaw } = req.body;

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
      select: { id: true, name: true, posList: true, mlbId: true },
    });
    if (!activatePlayer) {
      return res.status(404).json({ error: `Activate player #${activatePlayerId} not found.` });
    }

    // Pre-tx read of drop player identity so the response can echo
    // `dropMlbId` + `dropName` (#194).
    const dropPlayerInfo = await prisma.player.findUnique({
      where: { id: dropPlayerId },
      select: { mlbId: true, name: true },
    });

    // Yahoo-style auto-resolve: position-fit is deferred to the bipartite
    // matcher (runs in-tx). The strict pre-flight pairwise check was removed
    // when auto-resolve became unconditional (PR2 cuts §0).

    // Guard: effective must be after dropRoster.acquiredAt (symmetric with /drop).
    if (effective <= dropRoster.acquiredAt) {
      return res.status(400).json({
        error: `effectiveDate (${effective.toISOString().slice(0, 10)}) must be after the drop player was acquired (${dropRoster.acquiredAt.toISOString().slice(0, 10)})`,
        code: "INVALID_EFFECTIVE_DATE",
      });
    }

    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
    const season = league?.season ?? new Date().getFullYear();

    let activateAppliedReassignments: AppliedReassignment[] = [];
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

        // Yahoo-style auto-resolve: re-shuffle the active roster if the
        // strict inherited slot turned out to be infeasible.
        {
          // Parallel reads inside the tx (todo #139).
          const [slotCapacities, candidatesResult] = await Promise.all([
            loadSlotCapacities(tx, leagueId),
            buildCandidatesForTeam(tx, teamId),
          ]);
          const { candidates, playerNames, playerMlbIds: activatePlayerMlbIds } = candidatesResult;
          const rosterRowToPlayerId = new Map<number, number>();
          for (const c of candidates) rosterRowToPlayerId.set(c.rosterId, c.playerId);

          let result = resolveLineup(candidates, slotCapacities);
          if (result.ok === false) {
            const refreshed = await verifyEligibilityUnchanged(tx, candidates);
            if (refreshed) {
              result = resolveLineup(refreshed, slotCapacities);
              if (result.ok === false) {
                throw new RosterRuleError(
                  "ELIGIBILITY_LOST_MID_OPERATION",
                  "Player eligibility changed during processing. Please retry.",
                  { unfilledSlots: result.unfilledSlots, unassignedPlayers: result.unassignedPlayers },
                );
              }
            } else {
              throw new RosterRuleError(
                "NO_LEGAL_ASSIGNMENT",
                result.reason,
                { unfilledSlots: result.unfilledSlots, unassignedPlayers: result.unassignedPlayers },
              );
            }
          }
          if (result.ok) {
            activateAppliedReassignments = await applyAssignments(
              tx,
              result.assignments,
              playerNames,
              rosterRowToPlayerId,
              activatePlayerMlbIds,
            );
          }
        }

        await tx.rosterSlotEvent.create({
          data: {
            teamId, playerId: activatePlayerId, leagueId,
            event: "IL_ACTIVATE", effDate: effective,
            createdBy: req.user!.id, reason: reason ?? null,
          },
        });

        // Activity-log accuracy fix: if auto-resolve reshuffled the
        // activated player to a slot other than `targetSlot`, log the
        // ACTUAL post-resolve slot. Without this, the activity history
        // misreports the landing position (e.g. "returned Vaughn to OF"
        // when he actually ended up at CM/1B). #356 follow-up.
        const activatedReassignment = activateAppliedReassignments.find(
          (r) => r.playerId === activatePlayerId,
        );
        const finalActivatedSlot = activatedReassignment?.newSlot ?? targetSlot;

        await tx.transactionEvent.create({
          data: {
            rowHash: `IL_ACTIVATE-${crypto.randomUUID()}-${activatePlayerId}`,
            leagueId, season, effDate: effective, submittedAt: new Date(),
            teamId, playerId: activatePlayerId,
            transactionRaw: `IL activate — returned ${activatePlayer.name} to ${finalActivatedSlot}`,
            transactionType: "IL_ACTIVATE",
            toPosition: finalActivatedSlot,
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

        // Emit a SLOT_CHANGE event per cascade reassignment so the
        // activity log shows what actually moved (e.g. "Troy Johnston:
        // CM → OF (auto-resolve from IL activate)"). Excludes the
        // activated player — his move is already captured by the
        // IL_ACTIVATE event above.
        for (const r of activateAppliedReassignments) {
          if (r.playerId === activatePlayerId) continue;
          await tx.transactionEvent.create({
            data: {
              rowHash: `SLOT_CHANGE-${crypto.randomUUID()}-${r.playerId}`,
              leagueId, season, effDate: effective, submittedAt: new Date(),
              teamId, playerId: r.playerId,
              transactionRaw: `${r.playerName}: ${r.oldSlot} → ${r.newSlot} (auto-resolve from IL activate)`,
              transactionType: "SLOT_CHANGE",
              toPosition: r.newSlot,
            },
          });
        }
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

    invalidateLeagueCaches(leagueId);
    const activateResp: IlActivateResponse = {
      success: true,
      activatePlayerId,
      dropPlayerId,
      activateMlbId: activatePlayer.mlbId ?? null,
      activateName: activatePlayer.name,
      dropMlbId: dropPlayerInfo?.mlbId ?? null,
      dropName: dropPlayerInfo?.name ?? undefined,
      appliedReassignments: activateAppliedReassignments,
    };
    return res.json(activateResp);
  }),
);

/**
 * POST /api/transactions/sync-il-status
 *
 * Out-of-band MLB status refetch for a single roster player. Powers the
 * v3 hub's ghost-IL "Resync" affordance (IL scenario direction-lock #3).
 *
 * Read-only — does NOT mutate any roster row or transaction event. Calls
 * the existing `getMlbPlayerStatus` helper (cached 6h, MLB statsapi 40-man
 * feed) and echoes the raw status string back per IL #1 (verbatim, no
 * normalization). When the player isn't on their MLB team's 40-man (e.g.
 * minor league assignment) the response carries `mlbStatus: null` so the
 * client can dismiss the chip.
 *
 * Permission gate mirrors the IL stash/activate routes — owner or
 * commissioner; everyone else gets a 403 from `requireTeamOwnerOrCommissioner`.
 */
router.post(
  "/transactions/sync-il-status",
  requireAuth,
  validateBody(SyncIlStatusBodySchema),
  requireTeamOwnerOrCommissioner(),
  asyncHandler(async (req, res) => {
    const { teamId, playerId } = req.body as {
      leagueId: number;
      teamId: number;
      playerId: number;
    };

    // IDOR guard: confirm the player is actually on this team's active
    // roster before exposing MLB status. Without this, any authenticated
    // owner could query MLB status for arbitrary playerIds by pairing them
    // with their own teamId (which passes requireTeamOwnerOrCommissioner).
    // Generic 404 to avoid leaking whether the player exists at all.
    const rosterEntry = await prisma.roster.findFirst({
      where: { teamId, playerId, releasedAt: null },
      select: { id: true },
    });
    if (!rosterEntry) {
      return res.status(404).json({ error: "Player not found on roster." });
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true, mlbId: true, mlbTeam: true },
    });
    if (!player) {
      return res.status(404).json({ error: "Player not found on roster." });
    }
    if (!player.mlbId || !player.mlbTeam) {
      return res.status(200).json({
        playerId: player.id,
        mlbId: player.mlbId ?? null,
        mlbStatus: null,
        fetchedAt: new Date().toISOString(),
      });
    }

    let mlbStatus: string | null = null;
    let fetchedAt = new Date();
    try {
      const result = await getMlbPlayerStatus(player.mlbId, player.mlbTeam);
      if (result) {
        mlbStatus = result.status;
        fetchedAt = new Date(result.fetchedAt);
      }
    } catch (err) {
      // Read-only — fail OPEN here. The chip stays visible; the user can
      // retry later. Log for ops visibility.
      logger.error(
        { error: String(err), playerId, mlbId: player.mlbId, mlbTeam: player.mlbTeam },
        "sync-il-status: MLB feed fetch failed",
      );
      return res.status(503).json({
        error: "MLB status feed is unavailable right now. Try again in a few minutes.",
        code: "MLB_FEED_UNAVAILABLE",
      });
    }

    return res.json({
      playerId: player.id,
      mlbId: player.mlbId,
      mlbStatus,
      fetchedAt: fetchedAt.toISOString(),
    });
  }),
);

export const transactionsRouter = router;
export default transactionsRouter;
