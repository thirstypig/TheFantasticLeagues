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
import { weekKeyLabel, weekKeyToMonday } from "../../../lib/utils.js";
import { getSeasonStandings } from "../../standings/services/standingsService.js";

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
  }>;
  standings: {
    /** Rows ordered by totalPoints descending. Empty array when no active/completed periods. */
    rows: Array<{
      rank: number;
      teamId: number;
      teamName: string;
      totalPoints: number;
    }>;
  };
}

const DIGEST_SAFE_KEYS = new Set([
  "weekInOneSentence", "powerRankings", "hotTeam", "coldTeam",
  "statOfTheWeek", "categoryMovers", "proposedTrade", "boldPrediction",
  "fantasyMVP", "fantasyCyYoung",
]);

const INSIGHT_SAFE_KEYS = new Set([
  "insights", "overallGrade", "grade", "summary", "highlights",
  "concerns", "recommendations", "weeklyPerformance", "categoryBreakdown",
]);

function filterSafeFields(
  data: Record<string, unknown> | null,
  safeKeys: Set<string>,
): Record<string, unknown> | null {
  if (!data) return null;
  const filtered: Record<string, unknown> = {};
  for (const key of safeKeys) {
    if (key in data) filtered[key] = data[key];
  }
  return Object.keys(filtered).length > 0 ? filtered : null;
}

interface BuildOpts {
  leagueId: number;
  weekKey: string;
  currentWeekKey: string;
}

export async function buildWeeklyReport(opts: BuildOpts): Promise<WeeklyReport> {
  const { leagueId, weekKey, currentWeekKey } = opts;

  const [league, digest, teams, transactions, standingsResult] = await Promise.all([
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
    // Activity: transactions within this week's date bounds
    (() => {
      const weekStart = weekKeyToMonday(weekKey);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return prisma.transactionEvent.findMany({
        where: {
          leagueId,
          submittedAt: { gte: weekStart, lt: weekEnd },
        },
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          transactionType: true,
          submittedAt: true,
          createdAt: true,
          ogbaTeamName: true,
          playerAliasRaw: true,
        },
      });
    })(),
    getSeasonStandings(leagueId),
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
      data: filterSafeFields(
        (row?.data ?? null) as Record<string, unknown> | null,
        INSIGHT_SAFE_KEYS,
      ),
    };
  });

  const activity = transactions.map((tx) => ({
    id: tx.id,
    at: (tx.submittedAt ?? tx.createdAt).toISOString(),
    type: tx.transactionType,
    teamName: tx.ogbaTeamName,
    playerName: tx.playerAliasRaw,
  }));

  const { seasonRows: standingsRows } = standingsResult;

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
      data: filterSafeFields(
        (digest?.data ?? null) as Record<string, unknown> | null,
        DIGEST_SAFE_KEYS,
      ),
    },
    teamInsights,
    activity,
    standings: {
      rows: standingsRows,
    },
  };
}
