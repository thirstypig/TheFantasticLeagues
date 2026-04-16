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
  };
}
