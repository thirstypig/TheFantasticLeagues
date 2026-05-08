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
import { rateLimitPerUser } from "../../middleware/rateLimitPerUser.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { getLeagueStatsSource, getTeamsForSource } from "../../lib/mlbTeams.js";
import {
  CreatePeriodBodySchema,
  CreateAddEntryBodySchema,
  UpdateAddEntryBodySchema,
  CreateDropEntryBodySchema,
  UpdateDropEntryBodySchema,
  ReorderEntriesBodySchema,
} from "../../../../shared/api/wireList.js";
import { logger } from "../../lib/logger.js";

const router = Router();

// ─── Per-user rate limiters (todo #167) ──────────────────────────────
//
// Defense-in-depth above the global IP limiter. Token bucket: capacity
// 30, refill 0.5 tokens/sec (full refill in 60s). Caps a single
// authenticated user at 30 mutations/min on each list — well above any
// legitimate UI flow (a click takes seconds), well below the cost
// ceiling of ~5 queries per add. Buckets are per (userId, scope) so
// add and drop traffic don't share capacity. Same shared pattern used
// by `/api/players/:mlbId/eligible-slots` (`players/routes.ts:286`).
const wireListAddRateLimit = rateLimitPerUser({
  capacity: 30,
  windowMs: 60_000,
  bucketName: "wire-list:add",
});
const wireListDropRateLimit = rateLimitPerUser({
  capacity: 30,
  windowMs: 60_000,
  bucketName: "wire-list:drop",
});

/**
 * Sentinel thrown inside a $transaction when the period status check
 * fails. Caught at the route level and translated to a 403. Used by
 * POST/PATCH/DELETE handlers to fold the period-status guard into the
 * same tx as the entry mutation (todo #158).
 */
class RaceLost extends Error {
  constructor(public code: "PERIOD_NOT_PENDING") {
    super(code);
    this.name = "RaceLost";
  }
}

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
 * Probe-oracle guard (todo #161): verify the URL `:periodId` and the
 * body/query `teamId` belong to the same league. Collapse all of
 * {missing period, missing team, cross-league mismatch} into a single
 * 404 PERIOD_NOT_FOUND so an attacker cannot enumerate periods or teams
 * across leagues. Logs the distinguishing reason for ops.
 *
 * Returns the period+team rows on success, or sends 404 and `null`.
 */
async function loadPeriodForTeam(
  res: import("express").Response,
  periodId: number,
  teamId: number,
): Promise<{
  period: { id: number; leagueId: number; createdAt: Date; status: string };
  team: { id: number; leagueId: number };
} | null> {
  const [period, team] = await Promise.all([
    prisma.waiverPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, leagueId: true, createdAt: true, status: true },
    }),
    prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, leagueId: true },
    }),
  ]);
  if (!period || !team || period.leagueId !== team.leagueId) {
    const reason = !period
      ? "period_not_found"
      : !team
        ? "team_not_found"
        : "cross_league_mismatch";
    logger.warn?.({ periodId, teamId, reason }, "wire-list: loadPeriodForTeam rejected");
    res.status(404).json({ error: "Waiver period not found", code: "PERIOD_NOT_FOUND" });
    return null;
  }
  return { period, team };
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

// GET /api/wire-list/leagues/:leagueId/periods — list all periods for a league
router.get(
  "/leagues/:leagueId/periods",
  requireAuth,
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const periods = await prisma.waiverPeriod.findMany({
      where: { leagueId },
      orderBy: { deadlineAt: "desc" },
    });
    res.json({ periods });
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
    // todo #161: verify period and team share a league before any data read.
    const ctx = await loadPeriodForTeam(res, periodId, teamId);
    if (!ctx) return;
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
  wireListAddRateLimit,
  validateBody(CreateAddEntryBodySchema),
  requireTeamOwner("teamId"),
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const { teamId, playerId, priority } = req.body as {
      teamId: number;
      playerId: number;
      priority?: number;
    };

    // todo #161: cross-league probe-oracle guard FIRST — collapses
    // not-found, missing-team, and cross-league mismatch into one 404.
    const ctx = await loadPeriodForTeam(res, periodId, teamId);
    if (!ctx) return;
    const period = ctx.period;
    if (period.status !== "PENDING") {
      return res.status(403).json({
        error: `Period is ${period.status} — cannot modify entries`,
        code: "PERIOD_NOT_PENDING",
      });
    }

    const fa = await assertPlayerIsFA(period.leagueId, playerId);
    if (!fa.ok) return res.status(fa.status).json(fa.body);

    const acq = await assertNotAcquiredThisPeriod(teamId, playerId, period.createdAt);
    if (!acq.ok) return res.status(acq.status).json(acq.body);

    const finalPriority = priority ?? (await nextAddPriority(periodId, teamId));

    // todo #158: re-check period status INSIDE the same tx as the
    // create. The cron flips PENDING→LOCKED on a 5-min schedule;
    // without this guard a flip between loadPendingPeriod and the
    // create could persist the entry on a LOCKED period.
    try {
      const entry = await prisma.$transaction(async (tx) => {
        const fresh = await tx.waiverPeriod.findUnique({
          where: { id: periodId },
          select: { status: true },
        });
        if (!fresh || fresh.status !== "PENDING") {
          throw new RaceLost("PERIOD_NOT_PENDING");
        }
        return tx.waiverAddEntry.create({
          data: { periodId, teamId, playerId, priority: finalPriority, outcome: "PENDING" },
        });
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
      if (err instanceof RaceLost) {
        return res.status(403).json({ error: "Period locked — cannot create entries", code: err.code });
      }
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
  wireListAddRateLimit,
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

    // todo #158: status-CAS via updateMany. The relation filter
    // `period: { status: "PENDING" }` runs in the same statement as
    // the write, so the cron's PENDING→LOCKED flip can't slip in
    // between a stale read and the update.
    try {
      const result = await prisma.waiverAddEntry.updateMany({
        where: { id, period: { status: "PENDING" }, outcome: "PENDING" },
        data: { priority },
      });
      if (result.count === 0) {
        return res.status(403).json({
          error: "Period locked or entry already processed — cannot reorder",
          code: "PERIOD_NOT_PENDING",
        });
      }
      const updated = await prisma.waiverAddEntry.findUnique({ where: { id } });
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
  wireListAddRateLimit,
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
    // todo #158: deleteMany with relation filter so the cron flip
    // can't race the read-then-delete window.
    const result = await prisma.waiverAddEntry.deleteMany({
      where: { id, period: { status: "PENDING" }, outcome: "PENDING" },
    });
    if (result.count === 0) {
      return res.status(403).json({
        error: "Period locked or entry already processed — cannot delete",
        code: "PERIOD_NOT_PENDING",
      });
    }
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
    // todo #161: verify period and team share a league before any data read.
    const ctx = await loadPeriodForTeam(res, periodId, teamId);
    if (!ctx) return;
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
  wireListDropRateLimit,
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

    // todo #161: cross-league probe-oracle guard FIRST.
    const ctx = await loadPeriodForTeam(res, periodId, teamId);
    if (!ctx) return;
    const period = ctx.period;
    if (period.status !== "PENDING") {
      return res.status(403).json({
        error: `Period is ${period.status} — cannot modify entries`,
        code: "PERIOD_NOT_PENDING",
      });
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
      // todo #158: re-check period status inside the same tx.
      const entry = await prisma.$transaction(async (tx) => {
        const fresh = await tx.waiverPeriod.findUnique({
          where: { id: periodId },
          select: { status: true },
        });
        if (!fresh || fresh.status !== "PENDING") {
          throw new RaceLost("PERIOD_NOT_PENDING");
        }
        return tx.waiverDropEntry.create({
          data: {
            periodId,
            teamId,
            playerId,
            priority: finalPriority,
            dropMode: dropMode ?? "RELEASE",
            status: "PENDING",
          },
        });
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
      if (err instanceof RaceLost) {
        return res.status(403).json({ error: "Period locked — cannot create entries", code: err.code });
      }
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
  wireListDropRateLimit,
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

    // todo #158: status-CAS via updateMany.
    try {
      const result = await prisma.waiverDropEntry.updateMany({
        where: { id, period: { status: "PENDING" }, status: "PENDING" },
        data: {
          ...(priority !== undefined ? { priority } : {}),
          ...(dropMode !== undefined ? { dropMode } : {}),
        },
      });
      if (result.count === 0) {
        return res.status(403).json({
          error: "Period locked or entry already processed — cannot reorder",
          code: "PERIOD_NOT_PENDING",
        });
      }
      const updated = await prisma.waiverDropEntry.findUnique({ where: { id } });
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
  wireListDropRateLimit,
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
    // todo #158: deleteMany with relation filter.
    const result = await prisma.waiverDropEntry.deleteMany({
      where: { id, period: { status: "PENDING" }, status: "PENDING" },
    });
    if (result.count === 0) {
      return res.status(403).json({
        error: "Period locked or entry already processed — cannot delete",
        code: "PERIOD_NOT_PENDING",
      });
    }
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

// ─── Reorder (atomic batch update) ───────────────────────────────────

// POST /api/wire-list/periods/:periodId/reorder
// todo #159: replace the legacy 3-call ▲/▼ swap dance with a single
// transaction that rewrites every priority for the (period, team, kind)
// in two passes — negative temps then final values — to dodge the
// `(periodId, teamId, priority)` unique constraint.
router.post(
  "/periods/:periodId/reorder",
  requireAuth,
  validateBody(ReorderEntriesBodySchema),
  requireTeamOwner("teamId"),
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const { kind, teamId, orderedIds } = req.body as {
      kind: "ADD" | "DROP";
      teamId: number;
      orderedIds: number[];
    };

    // Probe-oracle guard (todo #161): cross-league or missing → 404.
    const ctx = await loadPeriodForTeam(res, periodId, teamId);
    if (!ctx) return;
    if (ctx.period.status !== "PENDING") {
      return res.status(403).json({
        error: `Period is ${ctx.period.status} — cannot reorder`,
        code: "PERIOD_NOT_PENDING",
      });
    }

    // Verify all orderedIds belong to this (period, team, kind). Reject
    // mismatches before opening the transaction so the rollback path is
    // never taken for client-side errors.
    const existing =
      kind === "ADD"
        ? await prisma.waiverAddEntry.findMany({
            where: { periodId, teamId },
            select: { id: true },
          })
        : await prisma.waiverDropEntry.findMany({
            where: { periodId, teamId },
            select: { id: true },
          });
    const existingIds = new Set(existing.map((e) => e.id));
    if (existing.length !== orderedIds.length || !orderedIds.every((id) => existingIds.has(id))) {
      return res.status(400).json({
        error: "orderedIds must list every entry for this team/period/kind exactly once",
        code: "REORDER_IDS_MISMATCH",
      });
    }
    if (new Set(orderedIds).size !== orderedIds.length) {
      return res.status(400).json({
        error: "orderedIds contains duplicates",
        code: "REORDER_IDS_MISMATCH",
      });
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Re-check status inside the tx (cron flips PENDING→LOCKED on a
        // 5-min schedule; same guard pattern as todo #158).
        const fresh = await tx.waiverPeriod.findUnique({
          where: { id: periodId },
          select: { status: true },
        });
        if (!fresh || fresh.status !== "PENDING") {
          throw new RaceLost("PERIOD_NOT_PENDING");
        }

        // Phase 1: write all rows to negative temp priorities to dodge the
        // (periodId, teamId, priority) unique constraint, which is checked
        // at statement boundary by Postgres.
        for (let i = 0; i < orderedIds.length; i++) {
          const id = orderedIds[i];
          if (kind === "ADD") {
            await tx.waiverAddEntry.update({
              where: { id },
              data: { priority: -(i + 1) },
            });
          } else {
            await tx.waiverDropEntry.update({
              where: { id },
              data: { priority: -(i + 1) },
            });
          }
        }
        // Phase 2: write final priorities (1-indexed, dense).
        for (let i = 0; i < orderedIds.length; i++) {
          const id = orderedIds[i];
          if (kind === "ADD") {
            await tx.waiverAddEntry.update({
              where: { id },
              data: { priority: i + 1 },
            });
          } else {
            await tx.waiverDropEntry.update({
              where: { id },
              data: { priority: i + 1 },
            });
          }
        }
      });
    } catch (err) {
      if (err instanceof RaceLost) {
        return res.status(403).json({ error: "Period locked — cannot reorder", code: err.code });
      }
      throw err;
    }

    // Return the new ordered list (same include shape as GET).
    const entries =
      kind === "ADD"
        ? await prisma.waiverAddEntry.findMany({
            where: { periodId, teamId },
            include: {
              player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true } },
            },
            orderBy: { priority: "asc" },
          })
        : await prisma.waiverDropEntry.findMany({
            where: { periodId, teamId },
            include: {
              player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true } },
            },
            orderBy: { priority: "asc" },
          });

    writeAuditLog({
      userId: req.user!.id,
      action: kind === "ADD" ? "WIRE_LIST_ADD_REORDER" : "WIRE_LIST_DROP_REORDER",
      resourceType: kind === "ADD" ? "WaiverAddEntry" : "WaiverDropEntry",
      resourceId: periodId,
      metadata: { periodId, teamId, orderedIds },
    });

    res.json({ entries });
  }),
);

export const wireListRouter = router;
export default wireListRouter;
