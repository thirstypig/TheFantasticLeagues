// Commissioner hub read endpoints: roster check, close readiness, moves since
// period start. Read-only; mounted on the commissioner router via index.ts.
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
