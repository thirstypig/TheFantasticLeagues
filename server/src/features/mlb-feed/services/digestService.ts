/**
 * Digest service — builds context for AI league digest generation.
 * Follows the standingsService pattern: exported functions, no class.
 */
import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import { getWeekKey } from "../../../lib/utils.js";
import { mlbGetJson, fetchMlbTeamsMap } from "../../../lib/mlbApi.js";

// ─── Types ───

/** Narrow type for AiInsight.data on league_digest rows. */
export interface DigestData {
  votes?: Record<string, string>;
  [key: string]: unknown;
}

/** Narrow type for League.rules JSON. */
interface LeagueRulesPartial {
  leagueType?: string;
  [key: string]: unknown;
}

/** Team data prepared for the AI prompt. */
export interface DigestTeamData {
  id: number;
  name: string;
  keyPlayers: string;
  keeperNames: string;
  recentMoves: string;
  overallRank: number | null;
  totalPoints: number | null;
  statsLine: string;
  categoryRankLine: string;
  injuredPlayers: string;
  minorsPlayers: string;
  previousRank: number | null;
  rankChange: number | null;
}

/** Full context needed to generate a digest. */
export interface DigestContext {
  leagueName: string;
  season: number;
  leagueType: string;
  teams: DigestTeamData[];
  tradeStyle: TradeStyle;
  weekNumber: number;
  previousVotes: { yes: number; no: number } | null;
  narrativeHints: string[];
}

/** Vote results for a digest. */
export interface VoteResults {
  yes: number;
  no: number;
  myVote: string | null;
}

// ─── Constants ───

const TRADE_STYLES = ["conservative", "outrageous", "fun"] as const;
type TradeStyle = typeof TRADE_STYLES[number];

// ─── Helpers ───

/** Ordinal suffix: 1→"st", 2→"nd", 3→"rd", else "th" */
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** Extract vote counts from digest data for a specific user. */
export function extractVoteResults(data: unknown, userId: number): VoteResults {
  const d = (data ?? {}) as DigestData;
  const votes: Record<string, string> = d.votes || {};
  const yes = Object.values(votes).filter(v => v === "yes").length;
  const no = Object.values(votes).filter(v => v === "no").length;
  const myVote = votes[String(userId)] || null;
  return { yes, no, myVote };
}

// ─── Timing ───

/**
 * Check if it's safe to generate a new weekly digest.
 * Don't generate until after the last Sunday MLB game completes.
 * Last MLB game on Sunday typically ends by 11 PM ET = 8 PM PT.
 * Safe window: Monday 3 AM PT (10:00 UTC).
 */
export function isDigestReady(): boolean {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const hour = now.getUTCHours();

  // If it's Sunday, don't generate yet
  if (day === 0) return false;
  // If it's early Monday (before 10:00 UTC = 3 AM PT), don't generate
  if (day === 1 && hour < 10) return false;

  return true;
}

// ─── Injury/IL Status Helpers ───

/** Fetch MLB roster status for all players across the given fantasy teams. */
async function fetchInjuryStatusForLeague(
  teams: Array<{
    id: number;
    rosters: Array<{
      player: { name: string; mlbId: number | null; mlbTeam: string | null; posPrimary: string };
    }>;
  }>
): Promise<{
  injuredByTeam: Map<number, string[]>;
  minorsByTeam: Map<number, string[]>;
}> {
  const injuredByTeam = new Map<number, string[]>();
  const minorsByTeam = new Map<number, string[]>();

  try {
    // Collect all unique MLB teams from rosters
    const mlbTeamAbbrs = new Set<string>();
    for (const t of teams) {
      for (const r of t.rosters) {
        if (r.player.mlbTeam) mlbTeamAbbrs.add(r.player.mlbTeam);
      }
    }

    // Build abbr → MLB team ID lookup
    const teamsMap = await fetchMlbTeamsMap();
    const teamIdMap: Record<string, number> = {};
    for (const [id, abbr] of Object.entries(teamsMap)) {
      teamIdMap[abbr as string] = Number(id);
    }

    // Fetch MLB roster status for each team (cached 6 hours)
    const mlbStatusMap = new Map<number, { status: string; position: string }>();
    for (const teamAbbr of mlbTeamAbbrs) {
      const mlbTeamId = teamIdMap[teamAbbr];
      if (!mlbTeamId) continue;

      try {
        const data = await mlbGetJson(
          // Use 40Man to include 60-day IL players (fullSeason misses them)
          `https://statsapi.mlb.com/api/v1/teams/${mlbTeamId}/roster?rosterType=40Man`,
          21600 // 6-hour cache
        );
        for (const entry of (data as { roster?: Array<{ person?: { id?: number }; status?: { description?: string }; position?: { abbreviation?: string } }> }).roster || []) {
          const mlbId = entry.person?.id;
          const status = entry.status?.description || "Unknown";
          const pos = entry.position?.abbreviation || "";
          if (mlbId) mlbStatusMap.set(mlbId, { status, position: pos });
        }
      } catch (err) {
        logger.warn({ error: String(err), teamAbbr }, "Digest: failed to fetch MLB roster status");
      }
    }

    // Cross-reference with fantasy rosters
    for (const t of teams) {
      const injured: string[] = [];
      const minors: string[] = [];
      for (const r of t.rosters) {
        if (!r.player.mlbId) continue;
        const mlbStatus = mlbStatusMap.get(r.player.mlbId);
        if (!mlbStatus) continue;

        const statusDesc = mlbStatus.status;
        if (statusDesc.includes("Injured")) {
          // Extract IL type from status (e.g., "10-Day Injured List" → "IL-10")
          const ilMatch = statusDesc.match(/(\d+)-Day/);
          const ilLabel = ilMatch ? `IL-${ilMatch[1]}` : "IL";
          injured.push(`${r.player.name} (${ilLabel})`);
        } else if (statusDesc.includes("Minor") || statusDesc === "Reassigned") {
          // Minors — label as AAA/AA/etc. if available, else just "Minors"
          minors.push(`${r.player.name} (Minors)`);
        }
      }
      if (injured.length > 0) injuredByTeam.set(t.id, injured);
      if (minors.length > 0) minorsByTeam.set(t.id, minors);
    }
  } catch (err) {
    logger.warn({ error: String(err) }, "Digest: injury status fetch failed — proceeding without");
  }

  return { injuredByTeam, minorsByTeam };
}

// ─── Main Context Builder ───

/**
 * Build all context needed to generate a league digest.
 * Queries DB for league, teams, rosters, standings, and recent transactions.
 * Returns a DigestContext ready to pass to aiAnalysisService.generateLeagueDigest().
 */
export async function buildDigestContext(leagueId: number, weekKey: string): Promise<DigestContext | null> {
  const prevWeekKey = getWeekKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const [league, teams, prevDigest, activePeriod] = await Promise.all([
    prisma.league.findUnique({ where: { id: leagueId }, select: { name: true, season: true, rules: true } }),
    prisma.team.findMany({
      where: { leagueId },
      include: {
        rosters: {
          where: { releasedAt: null },
          include: { player: { select: { name: true, posPrimary: true, mlbId: true, mlbTeam: true } } },
          orderBy: { price: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.aiInsight.findFirst({ where: { type: "league_digest", leagueId, weekKey: prevWeekKey } }),
    prisma.period.findFirst({ where: { leagueId, status: "active" }, orderBy: { startDate: "desc" } }),
  ]);

  if (!league) return null;

  // Compute real standings if active period exists
  const { computeTeamStatsFromDb, computeStandingsFromStats, computeCategoryRows, CATEGORY_CONFIG } =
    await import("../../standings/services/standingsService.js");

  let standingsCtx: {
    standings: Awaited<ReturnType<typeof computeStandingsFromStats>>;
    categoryRanks: Record<number, Record<string, { value: number; rank: number }>>;
    teamStats: Awaited<ReturnType<typeof computeTeamStatsFromDb>>;
  } | null = null;

  if (activePeriod) {
    try {
      const teamStats = await computeTeamStatsFromDb(leagueId, activePeriod.id);
      const standings = computeStandingsFromStats(teamStats);
      const categoryRanks: Record<number, Record<string, { value: number; rank: number }>> = {};
      for (const t of teamStats) {
        categoryRanks[t.team.id] = {};
      }
      for (const cfg of CATEGORY_CONFIG) {
        const rows = computeCategoryRows(teamStats, cfg.key, cfg.lowerIsBetter);
        for (const r of rows) {
          if (categoryRanks[r.teamId]) {
            categoryRanks[r.teamId][cfg.key] = { value: r.value, rank: r.rank };
          }
        }
      }
      standingsCtx = { standings, categoryRanks, teamStats };
    } catch (err) {
      logger.warn({ error: String(err) }, "Could not compute standings for digest — proceeding without");
    }
  }

  // Recent transactions (last 14 days) per team
  const recentRosters = await prisma.roster.findMany({
    where: {
      teamId: { in: teams.map(t => t.id) },
      acquiredAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      source: { not: "import" },
    },
    include: { player: { select: { name: true, posPrimary: true } }, team: { select: { name: true } } },
    orderBy: { acquiredAt: "desc" },
  });
  const movesByTeam = new Map<number, string[]>();
  for (const r of recentRosters) {
    const moves = movesByTeam.get(r.teamId) || [];
    moves.push(`${r.source}: ${r.player.name} (${r.player.posPrimary})`);
    movesByTeam.set(r.teamId, moves);
  }

  // Fetch injury/IL/minors status for all rostered players
  const { injuredByTeam, minorsByTeam } = await fetchInjuryStatusForLeague(teams);

  // Extract previous week's power rankings for rank movement
  const prevRankByTeamName = new Map<string, number>();
  if (prevDigest) {
    const prevData = (prevDigest.data ?? {}) as DigestData;
    const prevPowerRankings = prevData.powerRankings as
      Array<{ rank: number; teamName: string }> | undefined;
    if (Array.isArray(prevPowerRankings)) {
      for (const pr of prevPowerRankings) {
        if (pr.teamName && typeof pr.rank === "number") {
          prevRankByTeamName.set(pr.teamName, pr.rank);
        }
      }
    }
  }

  // Determine trade style rotation based on week number
  const weekNum = parseInt(weekKey.split("-W")[1]) || 0;
  const tradeStyle = TRADE_STYLES[weekNum % 3];

  // Identify keepers per team and build team data (NO auction prices)
  const { isKeeperRoster } = await import("../../../lib/sportConfig.js");
  const teamData: DigestTeamData[] = teams.map(t => {
    const keepers = t.rosters.filter(r => isKeeperRoster(r));
    const standingsRow = standingsCtx?.standings.find(s => s.teamId === t.id);
    const catRanks = standingsCtx?.categoryRanks[t.id];

    let statsLine = "";
    let categoryRankLine = "";
    if (catRanks) {
      const hitting = ["R", "HR", "RBI", "SB", "AVG"].map(k => {
        const c = catRanks[k];
        if (!c) return null;
        const val = k === "AVG" ? `.${Math.round(c.value * 1000)}` : String(Math.round(c.value));
        return `${k}:${val}(${c.rank}${ordinal(c.rank)})`;
      }).filter(Boolean).join(" ");
      const pitching = ["W", "S", "K", "ERA", "WHIP"].map(k => {
        const c = catRanks[k];
        if (!c) return null;
        const val = (k === "ERA" || k === "WHIP") ? c.value.toFixed(2) : String(Math.round(c.value));
        return `${k}:${val}(${c.rank}${ordinal(c.rank)})`;
      }).filter(Boolean).join(" ");
      statsLine = `${hitting} | ${pitching}`;
      categoryRankLine = Object.entries(catRanks).map(([k, v]) => `${k}:${v.rank}`).join(" ");
    }

    // Injury/IL and minors data
    const injured = injuredByTeam.get(t.id) || [];
    const minors = minorsByTeam.get(t.id) || [];

    // Week-over-week rank movement
    const currentRank = standingsRow?.rank ?? null;
    const prevRank = prevRankByTeamName.get(t.name) ?? null;
    const rankChange = (currentRank !== null && prevRank !== null) ? prevRank - currentRank : null;

    return {
      id: t.id,
      name: t.name,
      keyPlayers: t.rosters.slice(0, 6).map(r => `${r.player.name} (${r.player.posPrimary})`).join(", "),
      keeperNames: keepers.map(k => k.player.name).join(", "),
      recentMoves: (movesByTeam.get(t.id) || []).slice(0, 5).join("; "),
      overallRank: currentRank,
      totalPoints: standingsRow?.points ?? null,
      statsLine,
      categoryRankLine,
      injuredPlayers: injured.join(", "),
      minorsPlayers: minors.join(", "),
      previousRank: prevRank,
      rankChange,
    };
  });

  // Pre-compute narrative hints for the AI
  const narrativeHints: string[] = [];
  if (standingsCtx) {
    for (const cfg of CATEGORY_CONFIG) {
      const rows = computeCategoryRows(standingsCtx.teamStats, cfg.key, cfg.lowerIsBetter);
      if (rows.length >= 7) {
        const third = rows.find(r => r.rank === 3);
        const seventh = rows.find(r => r.rank === 7);
        if (third && seventh) {
          const spread = Math.abs(third.value - seventh.value);
          if (cfg.key === "AVG" && spread < 0.010) {
            narrativeHints.push(`Tight race in AVG: only ${(spread * 1000).toFixed(0)} points separate 3rd-7th`);
          } else if ((cfg.key === "ERA" || cfg.key === "WHIP") && spread < 0.50) {
            narrativeHints.push(`Tight race in ${cfg.key}: only ${spread.toFixed(2)} separates 3rd-7th`);
          } else if (spread < 10 && cfg.key !== "AVG" && cfg.key !== "ERA" && cfg.key !== "WHIP") {
            narrativeHints.push(`Tight race in ${cfg.key}: only ${Math.round(spread)} separates 3rd-7th`);
          }
        }
      }
    }
  }

  // Extract previous week's vote results
  let previousVotes: { yes: number; no: number } | null = null;
  if (prevDigest) {
    const prevData = (prevDigest.data ?? {}) as DigestData;
    const votes: Record<string, string> = prevData.votes || {};
    const yes = Object.values(votes).filter(v => v === "yes").length;
    const no = Object.values(votes).filter(v => v === "no").length;
    if (yes + no > 0) previousVotes = { yes, no };
  }

  return {
    leagueName: league.name,
    season: league.season,
    leagueType: ((league.rules as unknown as LeagueRulesPartial)?.leagueType) ?? "NL",
    teams: teamData,
    tradeStyle,
    weekNumber: weekNum,
    previousVotes,
    narrativeHints,
  };
}
