/**
 * Weekly Report aggregator — bundles pre-existing AI artifacts + live standings
 * into a single payload for the "This Week in Baseball" report page.
 *
 * Data sources (all existing):
 *   - AiInsight `type=league_digest`  → power rankings, hot/cold team, digest sections
 *   - AiInsight `type=weekly` × N teams → per-team AI insights
 *   - standings live compute           → current snapshot
 *   - TransactionEvent                  → activity log (trades, waivers, add/drops)
 *
 * No new AI calls. No new cron. Pure aggregator for the MVP.
 */

import { prisma } from "../../../db/prisma.js";
import { weekKeyLabel } from "../../../lib/utils.js";
import {
  computeTeamStatsFromDb,
  computeStandingsFromStats,
} from "../../standings/services/standingsService.js";

export interface WeeklyReport {
  meta: {
    leagueId: number;
    leagueName: string;
    weekKey: string;
    label: string;
    generatedAt: string | null;
    isCurrentWeek: boolean;
  };
  digest: {
    available: boolean;
    data: Record<string, unknown> | null;
  };
  teamInsights: Array<{
    teamId: number;
    teamName: string;
    available: boolean;
    data: Record<string, unknown> | null;
  }>;
  activity: Array<{
    id: number;
    at: string;
    type: string | null;
    teamName: string | null;
    playerName: string | null;
    raw: string | null;
  }>;
  standings: {
    /** Rows ordered by totalPoints descending. */
    rows: Array<{
      rank: number;
      teamId: number;
      teamName: string;
      totalPoints: number;
    }>;
    /** True if ≥1 active/completed period existed for this league. */
    available: boolean;
  };
}

interface BuildOpts {
  leagueId: number;
  weekKey: string;
  currentWeekKey: string;
}

export async function buildWeeklyReport(opts: BuildOpts): Promise<WeeklyReport> {
  const { leagueId, weekKey, currentWeekKey } = opts;

  const [league, digest, teams, transactions] = await Promise.all([
    prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, name: true },
    }),
    prisma.aiInsight.findFirst({
      where: { type: "league_digest", leagueId, weekKey },
    }),
    prisma.team.findMany({
      where: { leagueId },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
    // Activity: transactions posted during this weekKey window.
    // For MVP we pull recent and client-filter; future: use weekStart/weekEnd bounds.
    prisma.transactionEvent.findMany({
      where: { leagueId },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        transactionType: true,
        submittedAt: true,
        createdAt: true,
        ogbaTeamName: true,
        playerAliasRaw: true,
        transactionRaw: true,
      },
    }),
  ]);

  // Per-team weekly insights for this week
  const teamInsightRows = await prisma.aiInsight.findMany({
    where: {
      type: "weekly",
      leagueId,
      weekKey,
      teamId: { in: teams.map((t) => t.id) },
    },
  });
  const insightByTeam = new Map(teamInsightRows.map((r) => [r.teamId!, r]));

  const teamInsights = teams.map((t) => {
    const row = insightByTeam.get(t.id);
    return {
      teamId: t.id,
      teamName: t.name,
      available: !!row,
      data: (row?.data ?? null) as Record<string, unknown> | null,
    };
  });

  // Activity — flat list for MVP; client renders with type badges.
  // Future: filter by weekStart/weekEnd bounds from weekKey.
  const activity = transactions.map((tx) => ({
    id: tx.id,
    at: (tx.submittedAt ?? tx.createdAt).toISOString(),
    type: tx.transactionType,
    teamName: tx.ogbaTeamName,
    playerName: tx.playerAliasRaw,
    raw: tx.transactionRaw,
  }));

  // Standings — sum roto points across all active/completed periods.
  // Mirrors the /api/season aggregation. No rate-recomputation needed here since
  // we only surface totalPoints (category-level detail lives on the Season page).
  const periods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] } },
    select: { id: true },
    orderBy: { startDate: "asc" },
  });
  const pointsByTeam = new Map<number, number>(teams.map((t) => [t.id, 0]));
  for (const p of periods) {
    const teamStats = await computeTeamStatsFromDb(leagueId, p.id);
    const periodStandings = computeStandingsFromStats(teamStats);
    for (const entry of periodStandings) {
      pointsByTeam.set(entry.teamId, (pointsByTeam.get(entry.teamId) ?? 0) + entry.points);
    }
  }
  const standingsRows = teams
    .map((t) => ({
      teamId: t.id,
      teamName: t.name,
      totalPoints: pointsByTeam.get(t.id) ?? 0,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((row, i) => ({ rank: i + 1, ...row }));

  return {
    meta: {
      leagueId,
      leagueName: league?.name ?? `League ${leagueId}`,
      weekKey,
      label: weekKeyLabel(weekKey),
      generatedAt: digest?.createdAt.toISOString() ?? null,
      isCurrentWeek: weekKey === currentWeekKey,
    },
    digest: {
      available: !!digest,
      data: (digest?.data ?? null) as Record<string, unknown> | null,
    },
    teamInsights,
    activity,
    standings: {
      rows: standingsRows,
      available: periods.length > 0,
    },
  };
}
