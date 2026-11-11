// Commissioner hub read endpoints: roster check, close readiness, moves since
// period start, recent changes, unbilled periods. Read-only; mounted on the
// commissioner router via index.ts.
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireCommissionerOrAdmin } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { loadLeagueRosterCap } from "../../lib/rosterGuard.js";
import { findDeferredPeriods } from "../../lib/deferredBilling.js";

export const hubRouter = Router();

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * A period is ready to close at this hour (UTC) on the day after its end date.
 * The stats sync cron STARTS at 13:00 UTC; 14:00 leaves it time to land.
 * Must match CLOSE_READY_HOUR_UTC in client needsYou.ts.
 */
const CLOSE_READY_HOUR_UTC = 14;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Load a period and confirm it belongs to the league; null when missing/mismatched. */
async function loadLeaguePeriod(leagueId: number, periodId: number) {
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period || period.leagueId !== leagueId) return null;
  return period;
}

/**
 * GET /api/commissioner/:leagueId/roster-check
 * Active roster count per team vs the league cap. Active = releasedAt null and
 * not on IL (same definition as assertRosterLimit).
 */
hubRouter.get(
  "/commissioner/:leagueId/roster-check",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = parseId(req.params.leagueId);
    if (leagueId === null) return res.status(400).json({ error: "Invalid leagueId" });

    const cap = await loadLeagueRosterCap(prisma as any, leagueId);
    const teams = await prisma.team.findMany({
      where: { leagueId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const rows = await Promise.all(
      teams.map(async (t) => {
        const activeCount = await prisma.roster.count({
          where: { teamId: t.id, releasedAt: null, assignedPosition: { not: "IL" } },
        });
        return { teamId: t.id, teamName: t.name, activeCount, over: activeCount > cap };
      }),
    );

    res.json({ cap, teams: rows });
  }),
);

/**
 * GET /api/commissioner/:leagueId/periods/:periodId/close-readiness
 * ready = period is active AND now >= CLOSE_READY_HOUR_UTC (14:00 UTC) the day after endDate
 * (stat sync for the final day has landed).
 */
hubRouter.get(
  "/commissioner/:leagueId/periods/:periodId/close-readiness",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = parseId(req.params.leagueId);
    const periodId = parseId(req.params.periodId);
    if (leagueId === null) return res.status(400).json({ error: "Invalid leagueId" });
    if (periodId === null) return res.status(400).json({ error: "Invalid periodId" });

    const period = await loadLeaguePeriod(leagueId, periodId);
    if (!period) return res.status(404).json({ error: "Period not found" });

    const end = period.endDate;
    const readyAt = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1, CLOSE_READY_HOUR_UTC);
    const ready = period.status === "active" && Date.now() >= readyAt;

    const agg = await prisma.playerStatsDaily.aggregate({
      _max: { gameDate: true },
      where: { gameDate: { gte: period.startDate, lte: period.endDate } },
    });

    res.json({
      periodId: period.id,
      name: period.name,
      status: period.status,
      endDate: end.toISOString(),
      lastStatDate: agg._max.gameDate ? ymd(agg._max.gameDate) : null,
      ready,
    });
  }),
);

/**
 * GET /api/commissioner/:leagueId/periods/:periodId/moves-since-start
 * TransactionEvent rows effective on/after the period start, oldest first.
 */
hubRouter.get(
  "/commissioner/:leagueId/periods/:periodId/moves-since-start",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = parseId(req.params.leagueId);
    const periodId = parseId(req.params.periodId);
    if (leagueId === null) return res.status(400).json({ error: "Invalid leagueId" });
    if (periodId === null) return res.status(400).json({ error: "Invalid periodId" });

    const period = await loadLeaguePeriod(leagueId, periodId);
    if (!period) return res.status(404).json({ error: "Period not found" });

    // Periods are stored at T12:00Z but moves are dated at UTC midnight of
    // their day, so compare from the start of the start day.
    const s = period.startDate;
    const startOfDay = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
    const events = await prisma.transactionEvent.findMany({
      where: { leagueId, effDate: { gte: startOfDay } },
      orderBy: { effDate: "asc" },
      include: {
        team: { select: { name: true } },
        player: { select: { name: true } },
      },
    });

    res.json({
      moves: events.map((e) => ({
        id: e.id,
        teamName: e.team?.name ?? e.ogbaTeamName ?? null,
        playerName: e.player?.name ?? e.playerAliasRaw ?? null,
        transactionType: e.transactionType ?? null,
        effDate: e.effDate ? e.effDate.toISOString() : "",
      })),
    });
  }),
);

/**
 * GET /api/commissioner/:leagueId/recent-changes?limit=N (default 50, max 200)
 * Latest AuditLog rows for this league, filtered in the database on the
 * metadata.leagueId JSON path (writers store it as a number), so other leagues'
 * activity never pushes this league's rows out of the window.
 */
hubRouter.get(
  "/commissioner/:leagueId/recent-changes",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = parseId(req.params.leagueId);
    if (leagueId === null) return res.status(400).json({ error: "Invalid leagueId" });

    const rawLimit = Math.floor(Number(req.query.limit));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;

    const rows = await prisma.auditLog.findMany({
      where: { metadata: { path: ["leagueId"], equals: leagueId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { name: true } } },
    });

    const changes = rows
      .map((r) => ({
        id: r.id,
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId ?? null,
        createdAt: r.createdAt.toISOString(),
        userName: r.user?.name ?? null,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      }));

    res.json({ changes });
  }),
);

/**
 * GET /api/commissioner/:leagueId/unbilled-periods
 * Periods whose billing is deferred ("bill later") — the same predicate the
 * outbox drainer and sweeper use to skip automatic billing (lib/deferredBilling).
 * Scoped to this league by the deferring PERIOD_CLOSE row's metadata.leagueId.
 */
hubRouter.get(
  "/commissioner/:leagueId/unbilled-periods",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = parseId(req.params.leagueId);
    if (leagueId === null) return res.status(400).json({ error: "Invalid leagueId" });

    const deferred = await findDeferredPeriods();
    const periods = deferred
      .filter((d) => d.leagueId === leagueId)
      .map((d) => ({ periodId: d.periodId, closedAt: d.closedAt.toISOString() }));

    res.json({ periods });
  }),
);
