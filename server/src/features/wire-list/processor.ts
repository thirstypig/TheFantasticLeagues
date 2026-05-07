/**
 * Wire List processor — commissioner-driven consume/free reducer.
 *
 * The state machine: PENDING → LOCKED → PROCESSED.
 *
 *   PENDING:   owners freely mutate Add/Drop entries (handled in routes.ts)
 *   LOCKED:    commissioner clicks succeed/fail/skip on each Add. Each
 *              SUCCEEDED Add consumes the next PENDING Drop top-down.
 *              No roster mutation yet — outcomes are reversible.
 *   PROCESSED: roster mutations + TransactionEvents committed atomically;
 *              remaining PENDING drops marked UNUSED. No more changes.
 *
 * Why hold roster mutations until finalize: makes /revert trivial (just
 * reset DB rows), keeps the audit log clean (no "added then removed"
 * noise), and lets the commissioner finalize the entire period in one
 * atomic Prisma transaction with a coherent rollback story.
 */
import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { nextDayEffective } from "../../lib/utils.js";
import { enforceRosterRules } from "../../lib/featureFlags.js";
import { isEligibleForSlot } from "../transactions/lib/positionInherit.js";
import { getLeagueStatsSource, getTeamsForSource } from "../../lib/mlbTeams.js";
import { RecordOutcomeBodySchema } from "../../../../shared/api/wireList.js";

const router = Router();

// ─── Authorization helper ────────────────────────────────────────────

/**
 * Outcome endpoints are addressed by add-entry id, but commissioner auth
 * needs leagueId. Loads the entry, derives leagueId, then runs the same
 * commissioner check `requireCommissionerOrAdmin` would do — fail-closed.
 */
async function loadAddEntryAsCommissioner(
  req: import("express").Request,
  res: import("express").Response,
  addId: number,
): Promise<{
  id: number;
  periodId: number;
  teamId: number;
  playerId: number;
  outcome: string;
  consumedDropEntryId: number | null;
  reason: string | null;
  period: { id: number; leagueId: number; createdAt: Date; status: string };
} | null> {
  const entry = await prisma.waiverAddEntry.findUnique({
    where: { id: addId },
    select: {
      id: true,
      periodId: true,
      teamId: true,
      playerId: true,
      outcome: true,
      consumedDropEntryId: true,
      reason: true,
      period: { select: { id: true, leagueId: true, createdAt: true, status: true } },
    },
  });
  if (!entry) {
    res.status(404).json({ error: "Add entry not found", code: "ENTRY_NOT_FOUND" });
    return null;
  }
  if (req.user!.isAdmin) return entry;

  const m = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId: entry.period.leagueId, userId: req.user!.id } },
    select: { role: true },
  });
  if (m?.role !== "COMMISSIONER") {
    res.status(403).json({ error: "Commissioner only" });
    return null;
  }
  return entry;
}

// ─── Period transitions ──────────────────────────────────────────────

// POST /api/wire-list/periods/:periodId/lock
router.post(
  "/periods/:periodId/lock",
  requireAuth,
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const period = await prisma.waiverPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, leagueId: true, status: true },
    });
    if (!period) return res.status(404).json({ error: "Period not found", code: "PERIOD_NOT_FOUND" });

    if (!req.user!.isAdmin) {
      const m = await prisma.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId: period.leagueId, userId: req.user!.id } },
        select: { role: true },
      });
      if (m?.role !== "COMMISSIONER") return res.status(403).json({ error: "Commissioner only" });
    }

    if (period.status !== "PENDING") {
      return res.status(403).json({
        error: `Period is ${period.status} — only PENDING periods can be locked`,
        code: "PERIOD_NOT_PENDING",
      });
    }

    const updated = await prisma.waiverPeriod.update({
      where: { id: periodId },
      data: { status: "LOCKED", lockedAt: new Date() },
    });
    writeAuditLog({
      userId: req.user!.id,
      action: "WIRE_LIST_PERIOD_LOCK",
      resourceType: "WaiverPeriod",
      resourceId: periodId,
    });
    res.json(updated);
  }),
);

// POST /api/wire-list/periods/:periodId/finalize
router.post(
  "/periods/:periodId/finalize",
  requireAuth,
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const period = await prisma.waiverPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, leagueId: true, status: true, createdAt: true },
    });
    if (!period) return res.status(404).json({ error: "Period not found", code: "PERIOD_NOT_FOUND" });

    if (!req.user!.isAdmin) {
      const m = await prisma.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId: period.leagueId, userId: req.user!.id } },
        select: { role: true },
      });
      if (m?.role !== "COMMISSIONER") return res.status(403).json({ error: "Commissioner only" });
    }

    if (period.status !== "LOCKED") {
      return res.status(403).json({
        error: `Period is ${period.status} — only LOCKED periods can be finalized`,
        code: "PERIOD_NOT_LOCKED",
      });
    }

    // Block finalize if any Add is still PENDING — commissioner must decide every row.
    const pendingAdds = await prisma.waiverAddEntry.count({
      where: { periodId, outcome: "PENDING" },
    });
    if (pendingAdds > 0) {
      return res.status(409).json({
        error: `${pendingAdds} Add ${pendingAdds === 1 ? "entry has" : "entries have"} no outcome — succeed/fail/skip every row before finalizing`,
        code: "FINALIZE_BLOCKED",
        pendingAdds,
      });
    }

    const succeededAdds = await prisma.waiverAddEntry.findMany({
      where: { periodId, outcome: "SUCCEEDED" },
      include: {
        consumedDrop: true,
        player: { select: { id: true, name: true, posPrimary: true, posList: true } },
      },
      orderBy: [{ teamId: "asc" }, { priority: "asc" }],
    });

    // Re-validate every SUCCEEDED add against current state. If any is no longer
    // valid (player now rostered, drop player traded away, etc.), bail loudly
    // so commissioner can revert + re-decide. We'd rather fail finalize than
    // silently downgrade outcomes.
    const blockers: Array<{ addId: number; code: string; detail: string }> = [];
    const allowed = getTeamsForSource(await getLeagueStatsSource(period.leagueId));
    for (const add of succeededAdds) {
      const stillFA = await prisma.roster.findFirst({
        where: { playerId: add.playerId, releasedAt: null, team: { leagueId: period.leagueId } },
        select: { id: true },
      });
      if (stillFA) {
        blockers.push({ addId: add.id, code: "PLAYER_NOT_FA", detail: "Player is now on a roster" });
        continue;
      }
      const team = (await prisma.player.findUnique({ where: { id: add.playerId }, select: { mlbTeam: true } }))?.mlbTeam ?? "";
      if (allowed && team && team !== "FA" && !allowed.has(team)) {
        blockers.push({ addId: add.id, code: "PLAYER_NOT_FA", detail: "Player's MLB team outside league source" });
        continue;
      }
      if (!add.consumedDrop) {
        blockers.push({ addId: add.id, code: "NO_DROP_AVAILABLE", detail: "Consumed drop record missing" });
        continue;
      }
      const dropRoster = await prisma.roster.findFirst({
        where: { teamId: add.teamId, playerId: add.consumedDrop.playerId, releasedAt: null },
        select: { id: true },
      });
      if (!dropRoster) {
        blockers.push({ addId: add.id, code: "PLAYER_NOT_ON_TEAM", detail: "Drop player no longer on team" });
      }
    }
    if (blockers.length > 0) {
      return res.status(409).json({
        error: "One or more SUCCEEDED outcomes are no longer valid — revert and re-decide before finalizing",
        code: "FINALIZE_BLOCKED",
        blockers,
      });
    }

    const effective = nextDayEffective();
    const seasonYear = (await prisma.league.findUnique({ where: { id: period.leagueId }, select: { season: true } }))?.season ?? new Date().getFullYear();
    const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);

    const summary = await prisma.$transaction(async (tx) => {
      let dropsConsumed = 0;
      for (const add of succeededAdds) {
        if (!add.consumedDrop) continue; // already filtered by blocker check
        const drop = add.consumedDrop;

        // Capture the dropped player's slot BEFORE releasing — needed for
        // position-inherit on the added player.
        const dropRoster = await tx.roster.findFirst({
          where: { teamId: add.teamId, playerId: drop.playerId, releasedAt: null },
          select: { id: true, assignedPosition: true },
        });

        await tx.roster.updateMany({
          where: { teamId: add.teamId, playerId: drop.playerId, releasedAt: null },
          data: {
            releasedAt: effective,
            source: drop.dropMode === "IL_STASH" ? "WIRE_LIST_IL_STASH" : "WIRE_LIST_DROP",
          },
        });

        // Position-inherit (matches legacy waivers/routes.ts convention):
        // under ENFORCE, take the drop's slot when it isn't IL; otherwise
        // primary-position fallback.
        const inherited = dropRoster?.assignedPosition && dropRoster.assignedPosition !== "IL"
          ? dropRoster.assignedPosition
          : null;
        const primary = (add.player.posPrimary ?? "UT").toUpperCase();
        const fallback = PITCHER_POS.has(primary) ? "P" : primary;
        const assignedPos = enforceRosterRules() && inherited ? inherited : fallback;

        await tx.roster.create({
          data: {
            teamId: add.teamId,
            playerId: add.playerId,
            source: "WIRE_LIST",
            price: 0,
            acquiredAt: effective,
            assignedPosition: assignedPos,
          },
        });

        await tx.transactionEvent.create({
          data: {
            rowHash: `WIRE-LIST-ADD-${crypto.randomUUID()}-${add.playerId}`,
            leagueId: period.leagueId,
            season: seasonYear,
            effDate: effective,
            submittedAt: new Date(),
            teamId: add.teamId,
            playerId: add.playerId,
            transactionRaw: `Wire List: added ${add.player.name}`,
            transactionType: "ADD",
          },
        });
        const dropPlayer = await tx.player.findUnique({ where: { id: drop.playerId }, select: { name: true } });
        await tx.transactionEvent.create({
          data: {
            rowHash: `WIRE-LIST-DROP-${crypto.randomUUID()}-${drop.playerId}`,
            leagueId: period.leagueId,
            season: seasonYear,
            effDate: effective,
            submittedAt: new Date(),
            teamId: add.teamId,
            playerId: drop.playerId,
            transactionRaw: `Wire List: ${drop.dropMode === "IL_STASH" ? "IL-stashed" : "released"} ${dropPlayer?.name ?? `#${drop.playerId}`}`,
            transactionType: "DROP",
          },
        });

        await tx.waiverAddEntry.update({
          where: { id: add.id },
          data: { processedAt: new Date() },
        });
        await tx.waiverDropEntry.update({
          where: { id: drop.id },
          data: { processedAt: new Date() },
        });
        dropsConsumed++;
      }

      const unusedDrops = await tx.waiverDropEntry.updateMany({
        where: { periodId, status: "PENDING" },
        data: { status: "UNUSED", processedAt: new Date() },
      });

      const updatedPeriod = await tx.waiverPeriod.update({
        where: { id: periodId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });

      return { period: updatedPeriod, dropsConsumed, dropsUnused: unusedDrops.count };
    });

    writeAuditLog({
      userId: req.user!.id,
      action: "WIRE_LIST_PERIOD_FINALIZE",
      resourceType: "WaiverPeriod",
      resourceId: periodId,
      metadata: { addsApplied: succeededAdds.length, ...summary },
    });

    res.json({
      period: summary.period,
      addsApplied: succeededAdds.length,
      dropsConsumed: summary.dropsConsumed,
      dropsUnused: summary.dropsUnused,
    });
  }),
);

// ─── Outcome endpoints (consume/free reducer) ────────────────────────

// POST /api/wire-list/adds/:id/succeed
router.post(
  "/adds/:id/succeed",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const entry = await loadAddEntryAsCommissioner(req, res, id);
    if (!entry) return;

    if (entry.period.status !== "LOCKED") {
      return res.status(403).json({
        error: "Outcomes can only be set on LOCKED periods",
        code: "PERIOD_NOT_LOCKED",
      });
    }
    if (entry.outcome !== "PENDING") {
      return res.status(409).json({
        error: `Entry already ${entry.outcome} — revert before changing`,
        code: "ENTRY_ALREADY_PROCESSED",
      });
    }

    // Re-validate eligibility at outcome time. State may have moved since
    // the owner submitted (e.g. earlier wire-list outcome consumed this
    // player; trade brought a player onto the roster).
    const onRoster = await prisma.roster.findFirst({
      where: { playerId: entry.playerId, releasedAt: null, team: { leagueId: entry.period.leagueId } },
      select: { id: true },
    });
    if (onRoster) {
      return res.status(409).json({ error: "Player is no longer a free agent", code: "PLAYER_NOT_FA" });
    }
    const acquired = await prisma.roster.findFirst({
      where: { teamId: entry.teamId, playerId: entry.playerId, acquiredAt: { gt: entry.period.createdAt } },
      select: { id: true },
    });
    if (acquired) {
      return res.status(400).json({
        error: "Player was acquired during this period — not eligible",
        code: "ACQUIRED_THIS_PERIOD",
      });
    }

    // Find the next PENDING drop for this team in this period.
    const nextDrop = await prisma.waiverDropEntry.findFirst({
      where: { periodId: entry.periodId, teamId: entry.teamId, status: "PENDING" },
      orderBy: { priority: "asc" },
    });
    if (!nextDrop) {
      return res.status(409).json({
        error: "No drop slot available — team has used all pending drops. Mark this Add as SKIPPED instead.",
        code: "NO_DROP_AVAILABLE",
      });
    }

    // Re-confirm drop player is still on the team's active roster.
    const dropRoster = await prisma.roster.findFirst({
      where: { teamId: entry.teamId, playerId: nextDrop.playerId, releasedAt: null },
      select: { id: true, assignedPosition: true },
    });
    if (!dropRoster) {
      return res.status(409).json({
        error: "Drop player is no longer on this team's roster — drop entry is stale",
        code: "PLAYER_NOT_ON_TEAM",
      });
    }

    // Position-eligibility re-check (only meaningful when ENFORCE flag is on
    // and the slot isn't IL — same gate as legacy waivers processor).
    if (
      enforceRosterRules() &&
      nextDrop.dropMode !== "IL_STASH" &&
      dropRoster.assignedPosition &&
      dropRoster.assignedPosition !== "IL"
    ) {
      const addPlayer = await prisma.player.findUnique({
        where: { id: entry.playerId },
        select: { posList: true },
      });
      const compatible = addPlayer
        ? isEligibleForSlot(addPlayer.posList, dropRoster.assignedPosition)
        : false;
      if (!compatible) {
        return res.status(400).json({
          error: `Add player is not eligible for the dropped player's ${dropRoster.assignedPosition} slot`,
          code: "POSITION_INCOMPATIBLE",
        });
      }
    }

    // Atomic consume: link the add to the drop, mark both.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.waiverDropEntry.update({
        where: { id: nextDrop.id },
        data: { status: "CONSUMED" },
      });
      return tx.waiverAddEntry.update({
        where: { id: entry.id },
        data: { outcome: "SUCCEEDED", consumedDropEntryId: nextDrop.id, reason: null },
      });
    });

    writeAuditLog({
      userId: req.user!.id,
      action: "WIRE_LIST_ADD_SUCCEED",
      resourceType: "WaiverAddEntry",
      resourceId: id,
      metadata: { consumedDropEntryId: nextDrop.id },
    });

    res.json(updated);
  }),
);

// POST /api/wire-list/adds/:id/fail
router.post(
  "/adds/:id/fail",
  requireAuth,
  validateBody(RecordOutcomeBodySchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { reason } = req.body as { reason?: string };
    const entry = await loadAddEntryAsCommissioner(req, res, id);
    if (!entry) return;

    if (entry.period.status !== "LOCKED") {
      return res.status(403).json({ error: "Outcomes can only be set on LOCKED periods", code: "PERIOD_NOT_LOCKED" });
    }
    if (entry.outcome !== "PENDING") {
      return res.status(409).json({ error: `Entry already ${entry.outcome} — revert before changing`, code: "ENTRY_ALREADY_PROCESSED" });
    }

    const updated = await prisma.waiverAddEntry.update({
      where: { id },
      data: { outcome: "FAILED", reason: reason ?? null },
    });
    writeAuditLog({
      userId: req.user!.id,
      action: "WIRE_LIST_ADD_FAIL",
      resourceType: "WaiverAddEntry",
      resourceId: id,
      metadata: { reason },
    });
    res.json(updated);
  }),
);

// POST /api/wire-list/adds/:id/skip
router.post(
  "/adds/:id/skip",
  requireAuth,
  validateBody(RecordOutcomeBodySchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { reason } = req.body as { reason?: string };
    const entry = await loadAddEntryAsCommissioner(req, res, id);
    if (!entry) return;

    if (entry.period.status !== "LOCKED") {
      return res.status(403).json({ error: "Outcomes can only be set on LOCKED periods", code: "PERIOD_NOT_LOCKED" });
    }
    if (entry.outcome !== "PENDING") {
      return res.status(409).json({ error: `Entry already ${entry.outcome} — revert before changing`, code: "ENTRY_ALREADY_PROCESSED" });
    }

    const updated = await prisma.waiverAddEntry.update({
      where: { id },
      data: { outcome: "SKIPPED", reason: reason ?? null },
    });
    writeAuditLog({
      userId: req.user!.id,
      action: "WIRE_LIST_ADD_SKIP",
      resourceType: "WaiverAddEntry",
      resourceId: id,
      metadata: { reason },
    });
    res.json(updated);
  }),
);

// POST /api/wire-list/adds/:id/revert
router.post(
  "/adds/:id/revert",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const entry = await loadAddEntryAsCommissioner(req, res, id);
    if (!entry) return;

    if (entry.period.status !== "LOCKED") {
      return res.status(403).json({
        error: "Revert only allowed before finalize — period must be LOCKED",
        code: "PERIOD_NOT_LOCKED",
      });
    }
    if (entry.outcome === "PENDING") {
      return res.status(409).json({
        error: "Entry is already PENDING — nothing to revert",
        code: "ENTRY_ALREADY_PROCESSED",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // If we consumed a drop, free it.
      if (entry.consumedDropEntryId) {
        await tx.waiverDropEntry.update({
          where: { id: entry.consumedDropEntryId },
          data: { status: "PENDING", processedAt: null },
        });
      }
      return tx.waiverAddEntry.update({
        where: { id },
        data: { outcome: "PENDING", consumedDropEntryId: null, reason: null },
      });
    });

    writeAuditLog({
      userId: req.user!.id,
      action: "WIRE_LIST_ADD_REVERT",
      resourceType: "WaiverAddEntry",
      resourceId: id,
      metadata: { fromOutcome: entry.outcome, freedDropEntryId: entry.consumedDropEntryId },
    });

    res.json(updated);
  }),
);

// ─── Read endpoint ───────────────────────────────────────────────────

// GET /api/wire-list/periods/:periodId/results — multi-team view
router.get(
  "/periods/:periodId/results",
  requireAuth,
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const period = await prisma.waiverPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period) return res.status(404).json({ error: "Period not found", code: "PERIOD_NOT_FOUND" });

    if (!req.user!.isAdmin) {
      const m = await prisma.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId: period.leagueId, userId: req.user!.id } },
        select: { role: true },
      });
      if (!m) return res.status(403).json({ error: "Not a member of this league" });
    }

    const [adds, drops] = await Promise.all([
      prisma.waiverAddEntry.findMany({
        where: { periodId },
        include: { player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } } },
        orderBy: [{ teamId: "asc" }, { priority: "asc" }],
      }),
      prisma.waiverDropEntry.findMany({
        where: { periodId },
        include: { player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } } },
        orderBy: [{ teamId: "asc" }, { priority: "asc" }],
      }),
    ]);

    const teamIds = Array.from(new Set([...adds.map((a) => a.teamId), ...drops.map((d) => d.teamId)])).sort((a, b) => a - b);
    const byTeam = teamIds.map((teamId) => ({
      teamId,
      adds: adds.filter((a) => a.teamId === teamId),
      drops: drops.filter((d) => d.teamId === teamId),
    }));

    res.json({ period, byTeam });
  }),
);

export const wireListProcessorRouter = router;
export default wireListProcessorRouter;
