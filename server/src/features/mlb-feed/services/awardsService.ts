/**
 * Awards service — Fantasy MVP & Cy Young computation via z-score composite.
 *
 * Extracted from digestService.ts (todo #115) so the structured rankings can
 * be queried independently of digest generation. Z-scores normalize stats to
 * a common scale (standard deviations from the league mean), then each stat
 * is weighted by its historical correlation with award voting.
 *
 * Why extract: previously the rankings were computed inline, formatted as
 * strings for the AI prompt, and discarded. The AI's free-text interpretation
 * was the only persisted artifact, which means agents and downstream UIs had
 * to re-parse prose to recover the underlying numbers. By exposing a typed
 * structure here we make the data agent-native — `GET /api/leagues/:id/awards`
 * returns this shape verbatim.
 */
import { prisma } from "../../../db/prisma.js";

// ─── Types ───

/** One MVP candidate with raw + composite stats. */
export interface MvpCandidate {
  rank: number;
  playerId: number;
  name: string;
  team: string;
  /** Composite z-score weighted by stat → award correlation. */
  mvpScore: number;
  /** Raw counting / rate stats over the period set. */
  stats: {
    AB: number;
    H: number;
    HR: number;
    RBI: number;
    R: number;
    SB: number;
    BB: number;
    TB: number;
    SO: number;
    AVG: number;
    OBP: number;
    SLG: number;
    OPS: number;
  };
  /** Per-component z-scores (signed: positive = above mean). */
  zScores: {
    OPS: number;
    HR: number;
    OBP: number;
    RBI: number;
    R: number;
    SB: number;
    TB: number;
    BB: number;
    SO: number;
  };
}

/** One Cy Young candidate with raw + composite stats. */
export interface CyYoungCandidate {
  rank: number;
  playerId: number;
  name: string;
  team: string;
  /** "SP" if predominantly a starter (GS >= 3), "RP" otherwise. */
  role: "SP" | "RP";
  /** Composite z-score weighted by stat → award correlation. */
  cyScore: number;
  stats: {
    W: number;
    L: number;
    K: number;
    SV: number;
    IP: number;
    ERA: number;
    WHIP: number;
    K9: number;
    BB9: number;
    HR_A: number;
  };
  zScores: {
    ERA: number;
    WHIP: number;
    K: number;
    K9: number;
    IP: number;
    W: number;
    L: number;
    HR_A: number;
    BB9: number;
    SV: number;
  };
}

/** Full awards rankings for a league at a given week. */
export interface AwardsRankings {
  leagueId: number;
  weekKey: string;
  /** ISO timestamp of when this snapshot was computed. */
  computedAt: string;
  /** Total players considered (post-eligibility filter). */
  hitterPool: number;
  starterPool: number;
  /** Top 3 MVP candidates sorted by composite score (desc). Empty if pool < 3. */
  mvp: MvpCandidate[];
  /** Top 3 Cy Young candidates sorted by composite score (desc). Empty if pool < 3. */
  cyYoung: CyYoungCandidate[];
}

// ─── Constants ───

/** Minimum AB to qualify for the MVP pool — early-season floor. */
export const MIN_AB_FOR_MVP = 50;
/** Minimum IP for any pitcher to qualify for the Cy Young pool. */
export const MIN_IP_FOR_CY_YOUNG = 20;
/** Minimum GS to be considered a "starter" for Cy Young role classification. */
export const MIN_GS_FOR_STARTER = 3;

// ─── Helpers ───

/** Z-score: (value - mean) / stddev. SD floor at 1 to avoid divide-by-zero. */
function zScores(vals: number[]): number[] {
  if (vals.length === 0) return [];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
  return vals.map(v => (v - mean) / sd);
}

// ─── Main computation ───

/**
 * Compute MVP / Cy Young rankings for a league, summing stats across all
 * active+completed periods at the time of the call.
 *
 * `weekKey` is included in the output for caching/snapshotting; it does NOT
 * filter the period set (which is always "season-to-date").
 */
export async function computeAwardsRankings(
  leagueId: number,
  weekKey: string,
): Promise<AwardsRankings> {
  const computedAt = new Date().toISOString();

  // Gather active/completed periods + rostered players for this league
  const [activePeriods, teams] = await Promise.all([
    prisma.period.findMany({
      where: { leagueId, status: { in: ["active", "completed"] } },
      select: { id: true },
    }),
    prisma.team.findMany({
      where: { leagueId },
      select: {
        name: true,
        rosters: {
          where: { releasedAt: null },
          select: { player: { select: { id: true, name: true } } },
        },
      },
    }),
  ]);

  if (activePeriods.length === 0) {
    return { leagueId, weekKey, computedAt, hitterPool: 0, starterPool: 0, mvp: [], cyYoung: [] };
  }

  const periodIds = activePeriods.map(p => p.id);
  const rosteredPlayerIds = [...new Set(teams.flatMap(t => t.rosters.map(r => r.player.id)))];
  if (rosteredPlayerIds.length === 0) {
    return { leagueId, weekKey, computedAt, hitterPool: 0, starterPool: 0, mvp: [], cyYoung: [] };
  }

  const playerNames = new Map<number, { name: string; team: string }>(
    teams.flatMap(t => t.rosters.map(r => [r.player.id, { name: r.player.name, team: t.name }])),
  );

  // Aggregate stats across all periods (sum)
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

  // ── MVP: hitters with AB >= MIN_AB_FOR_MVP ──
  const hitterRows = playerStats
    .filter(p => (p._sum.AB ?? 0) >= MIN_AB_FOR_MVP)
    .map(p => {
      const ab = p._sum.AB ?? 0, h = p._sum.H ?? 0, hr = p._sum.HR ?? 0;
      const rbi = p._sum.RBI ?? 0, r = p._sum.R ?? 0, sb = p._sum.SB ?? 0;
      const bb = p._sum.BB ?? 0, tb = p._sum.TB ?? 0, so = p._sum.SO ?? 0;
      const obp = (ab + bb) > 0 ? (h + bb) / (ab + bb) : 0;
      const slg = ab > 0 ? tb / ab : 0;
      const ops = obp + slg;
      const avg = ab > 0 ? h / ab : 0;
      const info = playerNames.get(p.playerId);
      return {
        playerId: p.playerId,
        name: info?.name ?? "?",
        team: info?.team ?? "?",
        ab, h, hr, rbi, r, sb, bb, tb, so, avg, obp, slg, ops,
      };
    });

  let mvp: MvpCandidate[] = [];
  if (hitterRows.length >= 3) {
    const zOPS = zScores(hitterRows.map(h => h.ops));
    const zHR = zScores(hitterRows.map(h => h.hr));
    const zOBP = zScores(hitterRows.map(h => h.obp));
    const zRBI = zScores(hitterRows.map(h => h.rbi));
    const zR = zScores(hitterRows.map(h => h.r));
    const zSB = zScores(hitterRows.map(h => h.sb));
    const zTB = zScores(hitterRows.map(h => h.tb));
    const zBB = zScores(hitterRows.map(h => h.bb));
    const zSO = zScores(hitterRows.map(h => h.so));

    mvp = hitterRows
      .map((h, i) => ({
        h,
        i,
        mvpScore:
          zOPS[i] * 3.0 + zHR[i] * 2.5 + zOBP[i] * 2.0 +
          zRBI[i] * 1.5 + zR[i] * 1.5 + zSB[i] * 1.5 +
          zTB[i] * 1.0 + zBB[i] * 0.5 - zSO[i] * 0.3,
      }))
      .sort((a, b) => b.mvpScore - a.mvpScore)
      .slice(0, 3)
      .map((row, idx): MvpCandidate => ({
        rank: idx + 1,
        playerId: row.h.playerId,
        name: row.h.name,
        team: row.h.team,
        mvpScore: row.mvpScore,
        stats: {
          AB: row.h.ab, H: row.h.h, HR: row.h.hr, RBI: row.h.rbi, R: row.h.r,
          SB: row.h.sb, BB: row.h.bb, TB: row.h.tb, SO: row.h.so,
          AVG: row.h.avg, OBP: row.h.obp, SLG: row.h.slg, OPS: row.h.ops,
        },
        zScores: {
          OPS: zOPS[row.i], HR: zHR[row.i], OBP: zOBP[row.i],
          RBI: zRBI[row.i], R: zR[row.i], SB: zSB[row.i],
          TB: zTB[row.i], BB: zBB[row.i], SO: zSO[row.i],
        },
      }));
  }

  // ── Cy Young: pitchers with IP >= MIN_IP and GS >= MIN_GS ──
  const starterRows = playerStats
    .filter(p => {
      const ip = ipMap.get(p.playerId)?.IP ?? 0;
      return ip >= MIN_IP_FOR_CY_YOUNG && (p._sum.GS ?? 0) >= MIN_GS_FOR_STARTER;
    })
    .map(p => {
      const ipData = ipMap.get(p.playerId) ?? { IP: 0, BB_H: 0 };
      const ip = ipData.IP, bbh = ipData.BB_H;
      const w = p._sum.W ?? 0, l = p._sum.L ?? 0, k = p._sum.K ?? 0;
      const er = p._sum.ER ?? 0, sv = p._sum.SV ?? 0, hra = p._sum.HR_A ?? 0;
      const era = ip > 0 ? (er * 9) / ip : 99;
      const whip = ip > 0 ? bbh / ip : 99;
      const k9 = ip > 0 ? (k * 9) / ip : 0;
      const bb9 = ip > 0 ? ((bbh - (p._sum.H ?? 0)) * 9) / ip : 99; // approx BB from BB_H - H
      const info = playerNames.get(p.playerId);
      return {
        playerId: p.playerId,
        name: info?.name ?? "?",
        team: info?.team ?? "?",
        w, l, k, sv, ip, era, whip, k9, bb9, hra,
        isStarter: (p._sum.GS ?? 0) >= MIN_GS_FOR_STARTER,
      };
    });

  let cyYoung: CyYoungCandidate[] = [];
  if (starterRows.length >= 3) {
    // Invert ERA, WHIP, BB9, and L (lower = better → negate the z-score so higher is "better")
    const zERA = zScores(starterRows.map(p => p.era)).map(v => -v);
    const zWHIP = zScores(starterRows.map(p => p.whip)).map(v => -v);
    const zK = zScores(starterRows.map(p => p.k));
    const zK9 = zScores(starterRows.map(p => p.k9));
    const zIP = zScores(starterRows.map(p => p.ip));
    const zW = zScores(starterRows.map(p => p.w));
    const zL = zScores(starterRows.map(p => p.l));
    const zHRA = zScores(starterRows.map(p => p.hra));
    const zBB9 = zScores(starterRows.map(p => p.bb9)).map(v => -v);
    const zSV = zScores(starterRows.map(p => p.sv));

    cyYoung = starterRows
      .map((p, i) => {
        // Starters: ERA/WHIP/K dominate, W matters less
        const starterScore =
          zERA[i] * 3.5 + zWHIP[i] * 2.5 + zK[i] * 2.0 + zK9[i] * 1.5 +
          zIP[i] * 1.5 + zW[i] * 1.0 - zL[i] * 0.5 - zHRA[i] * 0.5 + zBB9[i] * 0.5;
        // Relievers: saves + rate stats, no IP/W
        const relieverScore =
          zSV[i] * 3.0 + zERA[i] * 3.0 + zWHIP[i] * 2.0 + zK9[i] * 1.5 +
          zK[i] * 1.0 + zBB9[i] * 0.5 - zHRA[i] * 0.5;
        const isRelief = p.sv > 0 && !p.isStarter;
        const cyScore = isRelief ? relieverScore * 0.7 : starterScore; // 0.7x discount for relievers
        return { p, i, cyScore, role: (isRelief ? "RP" : "SP") as "SP" | "RP" };
      })
      .sort((a, b) => b.cyScore - a.cyScore)
      .slice(0, 3)
      .map((row, idx): CyYoungCandidate => ({
        rank: idx + 1,
        playerId: row.p.playerId,
        name: row.p.name,
        team: row.p.team,
        role: row.role,
        cyScore: row.cyScore,
        stats: {
          W: row.p.w, L: row.p.l, K: row.p.k, SV: row.p.sv,
          IP: row.p.ip, ERA: row.p.era, WHIP: row.p.whip,
          K9: row.p.k9, BB9: row.p.bb9, HR_A: row.p.hra,
        },
        zScores: {
          ERA: zERA[row.i], WHIP: zWHIP[row.i], K: zK[row.i], K9: zK9[row.i],
          IP: zIP[row.i], W: zW[row.i], L: zL[row.i],
          HR_A: zHRA[row.i], BB9: zBB9[row.i], SV: zSV[row.i],
        },
      }));
  }

  return {
    leagueId,
    weekKey,
    computedAt,
    hitterPool: hitterRows.length,
    starterPool: starterRows.length,
    mvp,
    cyYoung,
  };
}

// ─── String formatting (back-compat with digest prompts) ───

/** Format MVP rankings as the multi-line string the AI digest prompt expects. */
export function formatMvpForPrompt(rankings: AwardsRankings): string {
  if (!rankings.mvp.length) return "";
  return rankings.mvp
    .map(c =>
      `${c.rank}. ${c.name} (${c.team}) — Score: ${c.mvpScore.toFixed(1)} | ` +
      `.${Math.round(c.stats.AVG * 1000)} AVG, .${Math.round(c.stats.OPS * 1000)} OPS, ` +
      `${c.stats.HR} HR, ${c.stats.RBI} RBI, ${c.stats.R} R, ${c.stats.SB} SB (${c.stats.AB} AB)`,
    )
    .join("\n");
}

/** Format Cy Young rankings as the multi-line string the AI digest prompt expects. */
export function formatCyYoungForPrompt(rankings: AwardsRankings): string {
  if (!rankings.cyYoung.length) return "";
  return rankings.cyYoung
    .map(c =>
      `${c.rank}. ${c.name} (${c.team}, ${c.role}) — Score: ${c.cyScore.toFixed(1)} | ` +
      `${c.stats.ERA.toFixed(2)} ERA, ${c.stats.WHIP.toFixed(2)} WHIP, ${c.stats.K} K, ` +
      `${c.stats.W}-${c.stats.L} W-L, ${c.stats.K9.toFixed(1)} K/9, ${c.stats.SV} SV (${c.stats.IP.toFixed(1)} IP)`,
    )
    .join("\n");
}
