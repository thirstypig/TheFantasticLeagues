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
  mvpCandidates?: string;
  cyYoungCandidates?: string;
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
          include: { player: { select: { id: true, name: true, posPrimary: true, mlbId: true, mlbTeam: true } } },
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

  // Compute Fantasy MVP and Cy Young candidates via z-score composite scoring.
  // Z-scores normalize stats to a common scale (standard deviations above league mean),
  // then each stat is weighted by its historical correlation with award voting.
  let mvpCandidates = "";
  let cyYoungCandidates = "";

  const activePeriods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] } },
    select: { id: true },
  });
  if (activePeriods.length > 0) {
    const periodIds = activePeriods.map(p => p.id);
    const rosteredPlayerIds = [...new Set(teams.flatMap(t => t.rosters.map(r => r.player.id)))];

    if (rosteredPlayerIds.length > 0) {
      const [playerStats, ipSums] = await Promise.all([
        prisma.playerStatsPeriod.groupBy({
          by: ["playerId"],
          where: { playerId: { in: rosteredPlayerIds }, periodId: { in: periodIds } },
          _sum: {
            AB: true, H: true, R: true, HR: true, RBI: true, SB: true,
            BB: true, TB: true, SO: true,
            W: true, SV: true, K: true, ER: true, L: true, GS: true, HR_A: true,
          },
        }),
        prisma.playerStatsPeriod.groupBy({
          by: ["playerId"],
          where: { playerId: { in: rosteredPlayerIds }, periodId: { in: periodIds } },
          _sum: { IP: true, BB_H: true },
        }),
      ]);
      const ipMap = new Map(ipSums.map(r => [r.playerId, { IP: r._sum.IP ?? 0, BB_H: r._sum.BB_H ?? 0 }]));
      const playerNames = new Map(
        teams.flatMap(t => t.rosters.map(r => [r.player.id, { name: r.player.name, team: t.name }]))
      );

      // ── MVP: z-score composite ──
      const MIN_AB = 50; // lower threshold early season, scale up over time
      const hitterRows = playerStats.filter(p => (p._sum.AB ?? 0) >= MIN_AB).map(p => {
        const ab = p._sum.AB ?? 0, h = p._sum.H ?? 0, hr = p._sum.HR ?? 0;
        const rbi = p._sum.RBI ?? 0, r = p._sum.R ?? 0, sb = p._sum.SB ?? 0;
        const bb = p._sum.BB ?? 0, tb = p._sum.TB ?? 0, so = p._sum.SO ?? 0;
        const obp = (ab + bb) > 0 ? (h + bb) / (ab + bb) : 0;
        const slg = ab > 0 ? tb / ab : 0;
        const ops = obp + slg;
        const avg = ab > 0 ? h / ab : 0;
        const info = playerNames.get(p.playerId);
        return { id: p.playerId, name: info?.name ?? "?", team: info?.team ?? "?", ab, hr, rbi, r, sb, bb, tb, so, avg, obp, slg, ops };
      });

      if (hitterRows.length >= 3) {
        const z = (vals: number[]) => {
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
          return vals.map(v => (v - mean) / sd);
        };
        const zOPS = z(hitterRows.map(h => h.ops));
        const zHR = z(hitterRows.map(h => h.hr));
        const zOBP = z(hitterRows.map(h => h.obp));
        const zRBI = z(hitterRows.map(h => h.rbi));
        const zR = z(hitterRows.map(h => h.r));
        const zSB = z(hitterRows.map(h => h.sb));
        const zTB = z(hitterRows.map(h => h.tb));
        const zBB = z(hitterRows.map(h => h.bb));
        const zSO = z(hitterRows.map(h => h.so));

        const scored = hitterRows.map((h, i) => ({
          ...h,
          mvpScore:
            zOPS[i] * 3.0 + zHR[i] * 2.5 + zOBP[i] * 2.0 +
            zRBI[i] * 1.5 + zR[i] * 1.5 + zSB[i] * 1.5 +
            zTB[i] * 1.0 + zBB[i] * 0.5 - zSO[i] * 0.3,
        })).sort((a, b) => b.mvpScore - a.mvpScore).slice(0, 3);

        mvpCandidates = scored.map((h, i) =>
          `${i + 1}. ${h.name} (${h.team}) — Score: ${h.mvpScore.toFixed(1)} | .${Math.round(h.avg * 1000)} AVG, .${Math.round(h.ops * 1000)} OPS, ${h.hr} HR, ${h.rbi} RBI, ${h.r} R, ${h.sb} SB (${h.ab} AB)`
        ).join("\n");
      }

      // ── Cy Young: z-score composite (starters + relievers separately) ──
      const starterRows = playerStats.filter(p => {
        const ip = ipMap.get(p.playerId)?.IP ?? 0;
        return ip >= 20 && (p._sum.GS ?? 0) >= 3;
      }).map(p => {
        const ipData = ipMap.get(p.playerId) ?? { IP: 0, BB_H: 0 };
        const ip = ipData.IP, bbh = ipData.BB_H;
        const w = p._sum.W ?? 0, l = p._sum.L ?? 0, k = p._sum.K ?? 0;
        const er = p._sum.ER ?? 0, sv = p._sum.SV ?? 0, hra = p._sum.HR_A ?? 0;
        const era = ip > 0 ? (er * 9) / ip : 99;
        const whip = ip > 0 ? bbh / ip : 99;
        const k9 = ip > 0 ? (k * 9) / ip : 0;
        const bb9 = ip > 0 ? ((bbh - (p._sum.H ?? 0)) * 9) / ip : 99; // approx BB from BB_H - H
        const info = playerNames.get(p.playerId);
        return { id: p.playerId, name: info?.name ?? "?", team: info?.team ?? "?", w, l, k, sv, ip, era, whip, k9, bb9, hra, isStarter: (p._sum.GS ?? 0) >= 3 };
      });

      if (starterRows.length >= 3) {
        const z = (vals: number[]) => {
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
          return vals.map(v => (v - mean) / sd);
        };
        // Invert ERA, WHIP, BB9 (lower = better → negate z-score)
        const zERA = z(starterRows.map(p => p.era)).map(v => -v);
        const zWHIP = z(starterRows.map(p => p.whip)).map(v => -v);
        const zK = z(starterRows.map(p => p.k));
        const zK9 = z(starterRows.map(p => p.k9));
        const zIP = z(starterRows.map(p => p.ip));
        const zW = z(starterRows.map(p => p.w));
        const zL = z(starterRows.map(p => p.l));
        const zHRA = z(starterRows.map(p => p.hra));
        const zBB9 = z(starterRows.map(p => p.bb9)).map(v => -v);
        const zSV = z(starterRows.map(p => p.sv));

        const scored = starterRows.map((p, i) => {
          // Starters: ERA/WHIP/K dominate, W matters less
          const starterScore =
            zERA[i] * 3.5 + zWHIP[i] * 2.5 + zK[i] * 2.0 + zK9[i] * 1.5 +
            zIP[i] * 1.5 + zW[i] * 1.0 - zL[i] * 0.5 - zHRA[i] * 0.5 + zBB9[i] * 0.5;
          // Relievers: saves + rate stats, no IP/W
          const relieverScore =
            zSV[i] * 3.0 + zERA[i] * 3.0 + zWHIP[i] * 2.0 + zK9[i] * 1.5 +
            zK[i] * 1.0 + zBB9[i] * 0.5 - zHRA[i] * 0.5;
          // Use starter formula if GS >= 5, reliever if mostly relief
          const isRelief = p.sv > 0 && !p.isStarter;
          const cyScore = isRelief ? relieverScore * 0.7 : starterScore; // 0.7x discount for relievers
          const role = isRelief ? "RP" : "SP";
          return { ...p, cyScore, role };
        }).sort((a, b) => b.cyScore - a.cyScore).slice(0, 3);

        cyYoungCandidates = scored.map((p, i) =>
          `${i + 1}. ${p.name} (${p.team}, ${p.role}) — Score: ${p.cyScore.toFixed(1)} | ${p.era.toFixed(2)} ERA, ${p.whip.toFixed(2)} WHIP, ${p.k} K, ${p.w}-${p.l} W-L, ${p.k9.toFixed(1)} K/9, ${p.sv} SV (${p.ip.toFixed(1)} IP)`
        ).join("\n");
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
    mvpCandidates,
    cyYoungCandidates,
  };
}
