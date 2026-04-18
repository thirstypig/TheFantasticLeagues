/**
 * Rule-based insight engine for the admin dashboard.
 * Zero API cost, instant. Each rule checks a condition against dashboard
 * metrics and returns an actionable insight.
 *
 * Priority: high (action needed) > medium (opportunity) > low (positive signal)
 * Cap: 1 insight per tile to avoid noise.
 */

import type { DashboardResponse, StatTileData } from "./dashboardService.js";

export interface InlineInsight {
  analysis: string;
  action: string;
  priority: "high" | "medium" | "low";
  generatedBy: "rules" | "ai";
}

type InsightRule = (ctx: DashboardResponse) => {
  tileId: string;
  insight: InlineInsight;
} | null;

// ─── Rules ────────────────────────────────────────────────────

const rules: InsightRule[] = [

  // ─── HERO ───────────────────────────────────────────────────

  // Low active users
  (ctx) => {
    const { hero } = ctx;
    const totalUsers = ctx.tiles.find(t => t.id === "users")?.value ?? 0;
    if (hero.value === 0) return {
      tileId: "hero",
      insight: { priority: "high", analysis: "Zero active users this period. Nobody is logging in.", action: "Check server health and verify login flow is working. Try logging in yourself to confirm.", generatedBy: "rules" },
    };
    const pct = totalUsers > 0 ? Math.round((hero.value / totalUsers) * 100) : 0;
    if (pct < 30) return {
      tileId: "hero",
      insight: { priority: "high", analysis: `Only ${pct}% of users (${hero.value}/${totalUsers}) are active. Over two-thirds of accounts are dormant.`, action: "Send a re-engagement email highlighting new features. Push notifications for league activity can pull owners back.", generatedBy: "rules" },
    };
    if (pct < 60) return {
      tileId: "hero",
      insight: { priority: "medium", analysis: `${pct}% of users are active (${hero.value}/${totalUsers}). Room to re-engage ${totalUsers - hero.value} dormant accounts.`, action: "Consider a 'what you missed' email digest for inactive owners summarizing recent trades and standings changes.", generatedBy: "rules" },
    };
    return {
      tileId: "hero",
      insight: { priority: "low", analysis: `${pct}% of users are active (${hero.value}/${totalUsers}) — strong engagement across the user base.`, action: "Engagement is healthy. Focus on deepening features rather than acquisition.", generatedBy: "rules" },
    };
  },

  // ─── USERS ──────────────────────────────────────────────────

  // User growth stall
  (ctx) => {
    const tile = ctx.tiles.find(t => t.id === "users");
    if (!tile) return null;
    if (tile.delta <= 0) return {
      tileId: "users",
      insight: { priority: "high", analysis: `No new signups this period (${tile.delta}% change). User acquisition has stalled.`, action: "Launch an invite campaign — give each owner a shareable link. Enable the public league discovery page.", generatedBy: "rules" },
    };
    if (tile.delta > 0 && tile.delta <= 20) return {
      tileId: "users",
      insight: { priority: "medium", analysis: `Slow growth — ${tile.subtitle}. Organic acquisition is modest.`, action: "Ask current owners to invite friends for next season. Word-of-mouth is the #1 driver for fantasy leagues.", generatedBy: "rules" },
    };
    // Strong growth
    return {
      tileId: "users",
      insight: { priority: "low", analysis: `Strong signup momentum — ${tile.subtitle}. New users are finding the platform.`, action: "Ensure onboarding is smooth. Check that new signups can quickly join a league and see value.", generatedBy: "rules" },
    };
  },

  // ─── SESSIONS ───────────────────────────────────────────────

  (ctx) => {
    const tile = ctx.tiles.find(t => t.id === "sessions");
    if (!tile) return null;
    // Check retention funnel first
    const retFunnel = ctx.funnels.find(f => f.id === "retention");
    const active7d = retFunnel?.stages.find(s => s.label === "Active last 7d");
    if (active7d && active7d.percent < 50) return {
      tileId: "sessions",
      insight: { priority: "high", analysis: `Only ${active7d.percent}% of eligible users were active in the last 7 days. Weekly retention is below the 50% healthy threshold.`, action: "Enable push notifications for trade proposals and waiver results to bring owners back weekly.", generatedBy: "rules" },
    };
    if (tile.delta < -10) return {
      tileId: "sessions",
      insight: { priority: "high", analysis: `Sessions dropped ${Math.abs(tile.delta)}% vs prior period. Users are logging in less frequently.`, action: "Check if the season is in a lull. Send a weekly digest email or push notification to re-engage owners.", generatedBy: "rules" },
    };
    if (tile.delta >= 20) return {
      tileId: "sessions",
      insight: { priority: "low", analysis: `Sessions up ${tile.delta}% — engagement is growing. Users are returning more frequently.`, action: "Great momentum. Consider adding a feature announcement banner to capitalize on high engagement.", generatedBy: "rules" },
    };
    // Moderate / steady
    const avgPerUser = tile.value > 0 ? tile.subtitle : "";
    return {
      tileId: "sessions",
      insight: { priority: "medium", analysis: `${tile.formattedValue} sessions this period (${avgPerUser}). Engagement is steady but not accelerating.`, action: "Try adding in-app notifications for standings changes and trade proposals to drive return visits.", generatedBy: "rules" },
    };
  },

  // ─── SEASONS ────────────────────────────────────────────────

  (ctx) => {
    const tile = ctx.tiles.find(t => t.id === "seasons");
    if (!tile) return null;
    const lifecycle = ctx.funnels.find(f => f.id === "season-lifecycle");
    const completed = lifecycle?.stages.find(s => s.label === "Season Completed");
    if (completed && completed.percent < 50 && tile.value >= 2) return {
      tileId: "seasons",
      insight: { priority: "medium", analysis: `Only ${completed.percent}% of seasons have reached completion (${completed.count}/${tile.value}). Most seasons are still in progress or abandoned.`, action: "Check if any seasons are stuck in SETUP or DRAFT status. Reach out to commissioners of stalled leagues.", generatedBy: "rules" },
    };
    if (tile.value <= 1) return {
      tileId: "seasons",
      insight: { priority: "medium", analysis: `Only ${tile.value} season${tile.value === 1 ? "" : "s"} in the system. The platform is in early adoption.`, action: "Focus on making the current season a great experience. Happy owners will return and bring friends for next season.", generatedBy: "rules" },
    };
    return {
      tileId: "seasons",
      insight: { priority: "low", analysis: `${tile.formattedValue} seasons tracked. The league lifecycle funnel shows ${completed?.percent ?? 0}% completion rate.`, action: "Season lifecycle is healthy. Plan ahead for next season's onboarding experience.", generatedBy: "rules" },
    };
  },

  // ─── TRADES ─────────────────────────────────────────────────

  (ctx) => {
    const tile = ctx.tiles.find(t => t.id === "trades");
    if (!tile) return null;
    if (tile.value === 0) return {
      tileId: "trades",
      insight: { priority: "medium", analysis: "Zero trades this period. A quiet market may mean owners don't see value in dealing.", action: "Use the weekly digest's 'Trade of the Week' proposal to spark conversations. Post to the trading block.", generatedBy: "rules" },
    };
    if (tile.value <= 3) return {
      tileId: "trades",
      insight: { priority: "low", analysis: `${tile.value} trade${tile.value === 1 ? "" : "s"} this period — light activity. ${tile.subtitle}.`, action: "Trade activity picks up mid-season as standings tighten. The trade block and Board can encourage more dealing.", generatedBy: "rules" },
    };
    return {
      tileId: "trades",
      insight: { priority: "low", analysis: `${tile.formattedValue} trades this period — the trade market is active. ${tile.subtitle}.`, action: "Active trade market is a strong league health signal. Owners are engaged and competing.", generatedBy: "rules" },
    };
  },

  // ─── AI INSIGHTS ────────────────────────────────────────────

  (ctx) => {
    const tile = ctx.tiles.find(t => t.id === "ai-insights");
    if (!tile) return null;
    if (tile.value === 0) return {
      tileId: "ai-insights",
      insight: { priority: "high", analysis: "No AI insights generated this period. Weekly digests and team analyses are not running.", action: "Visit the Home page to trigger digest generation. Verify GEMINI_API_KEY is set in environment variables.", generatedBy: "rules" },
    };
    if (tile.value < 10) return {
      tileId: "ai-insights",
      insight: { priority: "medium", analysis: `Only ${tile.value} AI insights generated. Some team analyses may be missing or the digest cron may have issues.`, action: "Check that all 8 teams have weekly insights by visiting each team page. Run /api/teams/ai-insights/generate-all if needed.", generatedBy: "rules" },
    };
    return {
      tileId: "ai-insights",
      insight: { priority: "low", analysis: `${tile.formattedValue} AI insights generated — the digest and team analysis pipeline is healthy. ${tile.subtitle}.`, action: "All AI features are operational. Check /report to review the latest weekly digest.", generatedBy: "rules" },
    };
  },

  // ─── ROSTER MOVES ───────────────────────────────────────────

  (ctx) => {
    const tile = ctx.tiles.find(t => t.id === "roster-moves");
    if (!tile) return null;
    if (tile.value === 0) return {
      tileId: "roster-moves",
      insight: { priority: "medium", analysis: "No roster moves this period. Owners aren't picking up free agents or making waiver claims.", action: "Highlight available free agents in the weekly digest. IL injuries often create roster needs that owners should address.", generatedBy: "rules" },
    };
    if (tile.value < 5) return {
      tileId: "roster-moves",
      insight: { priority: "low", analysis: `${tile.value} roster move${tile.value === 1 ? "" : "s"} this period. ${tile.subtitle}.`, action: "Light activity is normal early or late season. The add/drop tab and waiver system are available for roster management.", generatedBy: "rules" },
    };
    return {
      tileId: "roster-moves",
      insight: { priority: "low", analysis: `${tile.formattedValue} roster moves — owners are actively managing rosters. ${tile.subtitle}.`, action: "Active roster management is a strong health signal. The waiver and add/drop systems are being used well.", generatedBy: "rules" },
    };
  },
];

// ─── Engine ───────────────────────────────────────────────────

export function computeInsights(dashboard: DashboardResponse): Record<string, InlineInsight> {
  const insights: Record<string, InlineInsight> = {};

  for (const rule of rules) {
    const result = rule(dashboard);
    if (!result) continue;
    // First insight per tile wins (highest priority rules should be listed first)
    if (!insights[result.tileId]) {
      insights[result.tileId] = result.insight;
    }
  }

  return insights;
}
