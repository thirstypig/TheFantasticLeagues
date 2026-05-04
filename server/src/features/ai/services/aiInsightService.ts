import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import type { AiInsightHistoryItem, AiInsightType } from "../../../../../shared/api/aiInsights.js";

/**
 * Per-side fetch safety margin. We need at most `limit` rows after the merge,
 * so each side could in theory yield only `ceil(limit/2)`. The +5 safety
 * margin covers the case where one store is much denser than the other in
 * the recency window — without the margin, a burst of trades within the same
 * day could push older AiInsight rows out of the merged result even though
 * they would be included if we'd fetched a couple more.
 */
const PER_SIDE_SAFETY_MARGIN = 5;

export function perSideTake(limit: number): number {
  return Math.ceil(limit / 2) + PER_SIDE_SAFETY_MARGIN;
}

/**
 * Fetch AI insight history for a league, merged from `AiInsight` rows and
 * synthetic `processed_trade_analysis` rows (lifted from `Trade.aiAnalysis`).
 *
 * Performance note (todo #155): we previously took `take: limit` (up to 100)
 * from each store, fetching 200 rows to return 100. Now each side takes
 * `ceil(limit/2) + safety`, so the worst case is ~limit+10 rows fetched.
 * Composite indexes on `(leagueId, createdAt DESC)` keep both queries
 * index-only.
 */
export async function getInsightHistory(
  leagueId: number,
  limit: number,
): Promise<AiInsightHistoryItem[]> {
  const take = perSideTake(limit);

  const [insights, trades] = await Promise.all([
    prisma.aiInsight.findMany({
      where: { leagueId },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.trade.findMany({
      where: { leagueId, aiAnalysis: { not: Prisma.JsonNull } },
      include: { proposer: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);

  const rows: AiInsightHistoryItem[] = [
    ...insights.map((row): AiInsightHistoryItem => ({
      id: `insight-${row.id}`,
      kind: "insight",
      type: row.type as AiInsightType,
      weekKey: row.weekKey,
      generatedAt: row.createdAt.toISOString(),
      teamName: row.team?.name ?? null,
      data: row.data as unknown,
    })),
    ...trades
      .filter((trade) => trade.aiAnalysis)
      .map((trade): AiInsightHistoryItem => ({
        id: `trade-${trade.id}`,
        kind: "trade_analysis",
        type: "processed_trade_analysis",
        weekKey: null,
        generatedAt: trade.createdAt.toISOString(),
        teamName: trade.proposer?.name ?? null,
        data: trade.aiAnalysis as unknown,
      })),
  ];

  rows.sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
  );

  return rows.slice(0, limit);
}
