/**
 * /api/wire-list — Two-list waiver model (owner CRUD + commissioner period mgmt).
 *
 * Coexists with the legacy /api/waivers (paired-row WaiverClaim auto-engine).
 * Processor + commissioner-override endpoints + UI ship in follow-up PRs.
 *
 * Spec: memory `waiver_wire_list_feature.md`, ADR-012 in `docs/decisions.md`.
 */
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import {
  requireAuth,
  requireTeamOwner,
  requireCommissionerOrAdmin,
  requireLeagueMember,
  isTeamOwner,
} from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { getLeagueStatsSource, getTeamsForSource } from "../../lib/mlbTeams.js";
import {
  CreatePeriodBodySchema,
  CreateAddEntryBodySchema,
  UpdateAddEntryBodySchema,
  CreateDropEntryBodySchema,
  UpdateDropEntryBodySchema,
} from "../../../../shared/api/wireList.js";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Ensure a period exists and is in PENDING status (mutations only allowed
 * before the deadline locks). Returns the period or sends 404/403 and
 * `null`.
 */
async function loadPendingPeriod(
  res: import("express").Response,
  periodId: number,
): Promise<{ id: number; leagueId: number; createdAt: Date; status: string } | null> {
  const period = await prisma.waiverPeriod.findUnique({
    where: { id: periodId },
    select: { id: true, leagueId: true, createdAt: true, status: true },
  });
  if (!period) {
    res.status(404).json({ error: "Waiver period not found", code: "PERIOD_NOT_FOUND" });
    return null;
  }
  if (period.status !== "PENDING") {
    res.status(403).json({
      error: `Period is ${period.status} — cannot modify entries`,
      code: "PERIOD_NOT_PENDING",
    });
    return null;
  }
  return period;
}

/**
 * Translate a Prisma unique-constraint violation into the right wire-list
 * error code based on which compound key tripped.
 */
function translateUniqueViolation(
  err: unknown,
  table: "WaiverAddEntry" | "WaiverDropEntry",
): { status: number; body: { error: string; code: string } } | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return null;
  }
  const target = (err.meta?.target ?? []) as string[];
  if (target.includes("playerId")) {
    return {
      status: 409,
      body: { error: `Player already in this team's ${table === "WaiverAddEntry" ? "Add" : "Drop"} list for this period`, code: "DUPLICATE_PLAYER" },
    };
  }
  if (target.includes("priority")) {
    return {
      status: 409,
      body: { error: "Another entry already holds that priority — pick a different slot", code: "DUPLICATE_PRIORITY" },
    };
  }
  return null;
}

/** Next priority slot for a (period, team) — append-to-end default. */
async function nextAddPriority(periodId: number, teamId: number): Promise<number> {
  const max = await prisma.waiverAddEntry.aggregate({
    where: { periodId, teamId },
    _max: { priority: true },
  });
  return (max._max.priority ?? 0) + 1;
}

async function nextDropPriority(periodId: number, teamId: number): Promise<number> {
  const max = await prisma.waiverDropEntry.aggregate({
    where: { periodId, teamId },
    _max: { priority: true },
  });
  return (max._max.priority ?? 0) + 1;
}

/**
 * Verify the player is a free agent in this league — i.e. not on any
 * roster, and on an MLB team allowed by the league's stats_source.
 */
async function assertPlayerIsFA(leagueId: number, playerId: number): Promise<{ ok: true } | { ok: false; status: number; body: { error: string; code: string } }> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, mlbTeam: true },
  });
  if (!player) {
    return { ok: false, status: 404, body: { error: "Player not found", code: "PLAYER_NOT_FA" } };
  }

  const onRoster = await prisma.roster.findFirst({
    where: { playerId, releasedAt: null, team: { leagueId } },
    select: { id: true },
  });
  if (onRoster) {
    return { ok: false, status: 400, body: { error: "Player is already on a roster in this league", code: "PLAYER_NOT_FA" } };
  }

  const allowed = getTeamsForSource(await getLeagueStatsSource(leagueId));
  const team = player.mlbTeam ?? "";
  const isAllowed = !allowed || !team || team === "FA" || allowed.has(team);
  if (!isAllowed) {
    return { ok: false, status: 400, body: { error: "Player's MLB team is outside this league's stats source", code: "PLAYER_NOT_FA" } };
  }
  return { ok: true };
}

/**
 * Spec direction-lock #2: hard block on adding a player who was acquired
 * during the current waiver period. Falls out of `Roster.acquiredAt`.
 */
async function assertNotAcquiredThisPeriod(
  teamId: number,
  playerId: number,
  periodCreatedAt: Date,
): Promise<{ ok: true } | { ok: false; status: number; body: { error: string; code: string } }> {
  const recent = await prisma.roster.findFirst({
    where: { teamId, playerId, acquiredAt: { gt: periodCreatedAt } },
    select: { id: true },
  });
  if (recent) {
    return { ok: false, status: 400, body: { error: "Player was acquired during this waiver period — not eligible", code: "ACQUIRED_THIS_PERIOD" } };
  }
  return { ok: true };
}

// ─── Periods ─────────────────────────────────────────────────────────

// POST /api/wire-list/leagues/:leagueId/periods — commissioner creates a new period
router.post(
  "/leagues/:leagueId/periods",
  requireAuth,
  requireCommissionerOrAdmin("leagueId"),
  validateBody(CreatePeriodBodySchema),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const { deadlineAt } = req.body as { deadlineAt: string };
    const deadline = new Date(deadlineAt);
    if (deadline.getTime() <= Date.now()) {
      return res.status(400).json({ error: "deadlineAt must be in the future", code: "DEADLINE_IN_PAST" });
    }

    const period = await prisma.waiverPeriod.create({
      data: { leagueId, deadlineAt: deadline, status: "PENDING" },
    });

    writeAuditLog({
      userId: req.user!.id,
      action: "WIRE_LIST_PERIOD_CREATE",
      resourceType: "WaiverPeriod",
      resourceId: period.id,
      metadata: { leagueId, deadlineAt },
    });

    res.status(201).json(period);
  }),
);

// GET /api/wire-list/periods/active?leagueId= — current PENDING period (if any)
router.get(
  "/periods/active",
  requireAuth,
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.query.leagueId);
    if (!Number.isFinite(leagueId)) {
      return res.status(400).json({ error: "leagueId query parameter is required" });
    }
    const period = await prisma.waiverPeriod.findFirst({
      where: { leagueId, status: "PENDING" },
      orderBy: { deadlineAt: "asc" },
    });
    res.json({ period });
  }),
);

// ─── Add entries ─────────────────────────────────────────────────────

// GET /api/wire-list/periods/:periodId/adds?teamId=
router.get(
  "/periods/:periodId/adds",
  requireAuth,
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const teamId = Number(req.query.teamId);
    if (!Number.isFinite(teamId)) {
      return res.status(400).json({ error: "teamId query parameter is required" });
    }
    if (!req.user!.isAdmin) {
      const owns = await isTeamOwner(teamId, req.user!.id);
      if (!owns) return res.status(403).json({ error: "You do not own this team" });
    }
    const entries = await prisma.waiverAddEntry.findMany({
      where: { periodId, teamId },
      include: {
        player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true } },
      },
      orderBy: { priority: "asc" },
    });
    res.json({ entries });
  }),
);

// POST /api/wire-list/periods/:periodId/adds
router.post(
  "/periods/:periodId/adds",
  requireAuth,
  validateBody(CreateAddEntryBodySchema),
  requireTeamOwner("teamId"),
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const { teamId, playerId, priority } = req.body as {
      teamId: number;
      playerId: number;
      priority?: number;
    };

    const period = await loadPendingPeriod(res, periodId);
    if (!period) return;

    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leagueId: true } });
    if (!team || team.leagueId !== period.leagueId) {
      return res.status(400).json({ error: "Team does not belong to this period's league" });
    }

    const fa = await assertPlayerIsFA(period.leagueId, playerId);
    if (!fa.ok) return res.status(fa.status).json(fa.body);

    const acq = await assertNotAcquiredThisPeriod(teamId, playerId, period.createdAt);
    if (!acq.ok) return res.status(acq.status).json(acq.body);

    const finalPriority = priority ?? (await nextAddPriority(periodId, teamId));

    try {
      const entry = await prisma.waiverAddEntry.create({
        data: { periodId, teamId, playerId, priority: finalPriority, outcome: "PENDING" },
      });
      writeAuditLog({
        userId: req.user!.id,
        action: "WIRE_LIST_ADD_CREATE",
        resourceType: "WaiverAddEntry",
        resourceId: entry.id,
        metadata: { periodId, teamId, playerId, priority: finalPriority },
      });
      res.status(201).json(entry);
    } catch (err) {
      const tx = translateUniqueViolation(err, "WaiverAddEntry");
      if (tx) return res.status(tx.status).json(tx.body);
      throw err;
    }
  }),
);

// PATCH /api/wire-list/adds/:id — reorder (priority change)
router.patch(
  "/adds/:id",
  requireAuth,
  validateBody(UpdateAddEntryBodySchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { priority } = req.body as { priority: number };

    const entry = await prisma.waiverAddEntry.findUnique({
      where: { id },
      select: { id: true, periodId: true, teamId: true, outcome: true, period: { select: { status: true } } },
    });
    if (!entry) return res.status(404).json({ error: "Entry not found", code: "ENTRY_NOT_FOUND" });
    if (!req.user!.isAdmin) {
      const owns = await isTeamOwner(entry.teamId, req.user!.id);
      if (!owns) return res.status(403).json({ error: "You do not own this entry", code: "ENTRY_NOT_OWNED" });
    }
    if (entry.period.status !== "PENDING") {
      return res.status(403).json({ error: "Period locked — cannot reorder", code: "PERIOD_NOT_PENDING" });
    }
    if (entry.outcome !== "PENDING") {
      return res.status(409).json({ error: "Entry already processed", code: "ENTRY_ALREADY_PROCESSED" });
    }

    try {
      const updated = await prisma.waiverAddEntry.update({ where: { id }, data: { priority } });
      writeAuditLog({
        userId: req.user!.id,
        action: "WIRE_LIST_ADD_UPDATE",
        resourceType: "WaiverAddEntry",
        resourceId: id,
        metadata: { priority },
      });
      res.json(updated);
    } catch (err) {
      const tx = translateUniqueViolation(err, "WaiverAddEntry");
      if (tx) return res.status(tx.status).json(tx.body);
      throw err;
    }
  }),
);

// DELETE /api/wire-list/adds/:id
router.delete(
  "/adds/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const entry = await prisma.waiverAddEntry.findUnique({
      where: { id },
      select: { id: true, teamId: true, periodId: true, outcome: true, period: { select: { status: true } } },
    });
    if (!entry) return res.status(404).json({ error: "Entry not found", code: "ENTRY_NOT_FOUND" });
    if (!req.user!.isAdmin) {
      const owns = await isTeamOwner(entry.teamId, req.user!.id);
      if (!owns) return res.status(403).json({ error: "You do not own this entry", code: "ENTRY_NOT_OWNED" });
    }
    if (entry.period.status !== "PENDING") {
      return res.status(403).json({ error: "Period locked — cannot delete", code: "PERIOD_NOT_PENDING" });
    }
    if (entry.outcome !== "PENDING") {
      return res.status(409).json({ error: "Entry already processed", code: "ENTRY_ALREADY_PROCESSED" });
    }
    await prisma.waiverAddEntry.delete({ where: { id } });
    writeAuditLog({
      userId: req.user!.id,
      action: "WIRE_LIST_ADD_DELETE",
      resourceType: "WaiverAddEntry",
      resourceId: id,
      metadata: { periodId: entry.periodId, teamId: entry.teamId },
    });
    res.json({ success: true });
  }),
);

// ─── Drop entries ────────────────────────────────────────────────────

// GET /api/wire-list/periods/:periodId/drops?teamId=
router.get(
  "/periods/:periodId/drops",
  requireAuth,
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const teamId = Number(req.query.teamId);
    if (!Number.isFinite(teamId)) {
      return res.status(400).json({ error: "teamId query parameter is required" });
    }
    if (!req.user!.isAdmin) {
      const owns = await isTeamOwner(teamId, req.user!.id);
      if (!owns) return res.status(403).json({ error: "You do not own this team" });
    }
    const entries = await prisma.waiverDropEntry.findMany({
      where: { periodId, teamId },
      include: {
        player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true } },
      },
      orderBy: { priority: "asc" },
    });
    res.json({ entries });
  }),
);

// POST /api/wire-list/periods/:periodId/drops
router.post(
  "/periods/:periodId/drops",
  requireAuth,
  validateBody(CreateDropEntryBodySchema),
  requireTeamOwner("teamId"),
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const { teamId, playerId, priority, dropMode } = req.body as {
      teamId: number;
      playerId: number;
      priority?: number;
      dropMode?: "RELEASE" | "IL_STASH";
    };

    const period = await loadPendingPeriod(res, periodId);
    if (!period) return;

    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leagueId: true } });
    if (!team || team.leagueId !== period.leagueId) {
      return res.status(400).json({ error: "Team does not belong to this period's league" });
    }

    // Drop list eligibility: player must currently be on this team's active roster.
    const onRoster = await prisma.roster.findFirst({
      where: { teamId, playerId, releasedAt: null },
      select: { id: true },
    });
    if (!onRoster) {
      return res.status(400).json({ error: "Player is not on this team's active roster", code: "PLAYER_NOT_ON_TEAM" });
    }

    const finalPriority = priority ?? (await nextDropPriority(periodId, teamId));

    try {
      const entry = await prisma.waiverDropEntry.create({
        data: {
          periodId,
          teamId,
          playerId,
          priority: finalPriority,
          dropMode: dropMode ?? "RELEASE",
          status: "PENDING",
        },
      });
      writeAuditLog({
        userId: req.user!.id,
        action: "WIRE_LIST_DROP_CREATE",
        resourceType: "WaiverDropEntry",
        resourceId: entry.id,
        metadata: { periodId, teamId, playerId, priority: finalPriority, dropMode: entry.dropMode },
      });
      res.status(201).json(entry);
    } catch (err) {
      const tx = translateUniqueViolation(err, "WaiverDropEntry");
      if (tx) return res.status(tx.status).json(tx.body);
      throw err;
    }
  }),
);

// PATCH /api/wire-list/drops/:id — change priority and/or dropMode
router.patch(
  "/drops/:id",
  requireAuth,
  validateBody(UpdateDropEntryBodySchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { priority, dropMode } = req.body as { priority?: number; dropMode?: "RELEASE" | "IL_STASH" };

    const entry = await prisma.waiverDropEntry.findUnique({
      where: { id },
      select: { id: true, periodId: true, teamId: true, status: true, period: { select: { status: true } } },
    });
    if (!entry) return res.status(404).json({ error: "Entry not found", code: "ENTRY_NOT_FOUND" });
    if (!req.user!.isAdmin) {
      const owns = await isTeamOwner(entry.teamId, req.user!.id);
      if (!owns) return res.status(403).json({ error: "You do not own this entry", code: "ENTRY_NOT_OWNED" });
    }
    if (entry.period.status !== "PENDING") {
      return res.status(403).json({ error: "Period locked — cannot reorder", code: "PERIOD_NOT_PENDING" });
    }
    if (entry.status !== "PENDING") {
      return res.status(409).json({ error: "Entry already processed", code: "ENTRY_ALREADY_PROCESSED" });
    }

    try {
      const updated = await prisma.waiverDropEntry.update({
        where: { id },
        data: {
          ...(priority !== undefined ? { priority } : {}),
          ...(dropMode !== undefined ? { dropMode } : {}),
        },
      });
      writeAuditLog({
        userId: req.user!.id,
        action: "WIRE_LIST_DROP_UPDATE",
        resourceType: "WaiverDropEntry",
        resourceId: id,
        metadata: { priority, dropMode },
      });
      res.json(updated);
    } catch (err) {
      const tx = translateUniqueViolation(err, "WaiverDropEntry");
      if (tx) return res.status(tx.status).json(tx.body);
      throw err;
    }
  }),
);

// DELETE /api/wire-list/drops/:id
router.delete(
  "/drops/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const entry = await prisma.waiverDropEntry.findUnique({
      where: { id },
      select: { id: true, teamId: true, periodId: true, status: true, period: { select: { status: true } } },
    });
    if (!entry) return res.status(404).json({ error: "Entry not found", code: "ENTRY_NOT_FOUND" });
    if (!req.user!.isAdmin) {
      const owns = await isTeamOwner(entry.teamId, req.user!.id);
      if (!owns) return res.status(403).json({ error: "You do not own this entry", code: "ENTRY_NOT_OWNED" });
    }
    if (entry.period.status !== "PENDING") {
      return res.status(403).json({ error: "Period locked — cannot delete", code: "PERIOD_NOT_PENDING" });
    }
    if (entry.status !== "PENDING") {
      return res.status(409).json({ error: "Entry already processed", code: "ENTRY_ALREADY_PROCESSED" });
    }
    await prisma.waiverDropEntry.delete({ where: { id } });
    writeAuditLog({
      userId: req.user!.id,
      action: "WIRE_LIST_DROP_DELETE",
      resourceType: "WaiverDropEntry",
      resourceId: id,
      metadata: { periodId: entry.periodId, teamId: entry.teamId },
    });
    res.json({ success: true });
  }),
);

export const wireListRouter = router;
export default wireListRouter;
