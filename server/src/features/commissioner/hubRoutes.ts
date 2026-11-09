// Commissioner hub read endpoints: roster check, close readiness, moves since
// period start, recent changes, unbilled periods. Read-only; mounted on the
// commissioner router via index.ts.
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireCommissionerOrAdmin } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { loadLeagueRosterCap } from "../../lib/rosterGuard.js";

export const hubRouter = Router();

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

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
 * ready = period is active AND now >= 13:00 UTC the day after endDate
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
    const readyAt = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1, 13);
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

    const events = await prisma.transactionEvent.findMany({
      where: { leagueId, effDate: { gte: period.startDate } },
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

function metaLeagueId(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const n = Number((metadata as Record<string, unknown>).leagueId);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/commissioner/:leagueId/recent-changes?limit=N (default 50, max 100)
 * Latest AuditLog rows for this league. Filters in memory on metadata.leagueId
 * over the newest 500 rows (portable; no JSON-path query or migration).
 */
hubRouter.get(
  "/commissioner/:leagueId/recent-changes",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = parseId(req.params.leagueId);
    if (leagueId === null) return res.status(400).json({ error: "Invalid leagueId" });

    const rawLimit = Math.floor(Number(req.query.limit));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { name: true } } },
    });

    const changes = rows
      .filter((r) => metaLeagueId(r.metadata) === leagueId)
      .slice(0, limit)
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
 * A period is unbilled when its latest PERIOD_CLOSE has metadata.billed === false
 * and no IL_FEE_RECONCILE for the same period was recorded after that close.
 */
hubRouter.get(
  "/commissioner/:leagueId/unbilled-periods",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = parseId(req.params.leagueId);
    if (leagueId === null) return res.status(400).json({ error: "Invalid leagueId" });

    const rows = await prisma.auditLog.findMany({
      where: { action: { in: ["PERIOD_CLOSE", "IL_FEE_RECONCILE"] }, resourceType: "Period" },
      orderBy: { createdAt: "asc" },
    });

    const latestClose = new Map<string, (typeof rows)[number]>();
    const latestReconcile = new Map<string, Date>();
    for (const r of rows) {
      if (r.resourceId == null || metaLeagueId(r.metadata) !== leagueId) continue;
      if (r.action === "PERIOD_CLOSE") {
        const prev = latestClose.get(r.resourceId);
        if (!prev || r.createdAt >= prev.createdAt) latestClose.set(r.resourceId, r);
      } else {
        const prev = latestReconcile.get(r.resourceId);
        if (!prev || r.createdAt > prev) latestReconcile.set(r.resourceId, r.createdAt);
      }
    }

    const periods: { periodId: number; closedAt: string }[] = [];
    for (const [resourceId, close] of latestClose) {
      const billed = (close.metadata as Record<string, unknown> | null)?.billed;
      if (billed !== false) continue;
      const reconciledAt = latestReconcile.get(resourceId);
      if (reconciledAt && reconciledAt > close.createdAt) continue;
      periods.push({ periodId: Number(resourceId), closedAt: close.createdAt.toISOString() });
    }
    periods.sort((a, b) => a.periodId - b.periodId);

    res.json({ periods });
  }),
);
