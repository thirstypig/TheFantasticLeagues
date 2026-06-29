/**
 * FanGraphs Audit — prints FBST season standings in OnRoto display format
 * for cell-by-cell comparison against https://onroto.fangraphs.com (OGBA league).
 *
 * Reads `PlayerStatsPeriod` — the SAME source the production standings UI
 * uses (`server/src/features/standings/services/standingsService.ts:464`),
 * so the audit output matches what owners see live.
 *
 * History: this script previously aggregated `PlayerStatsDaily`, which has
 * an Opening Day cold-start gap (no daily-sync ran for 3/25–3/28) and also
 * dropped pitcher blown appearances + hitter sac flies via the old
 * `hasStats` filter (fixed in PR #362). Both bugs disappear at the PSP
 * layer because `syncAllActivePeriods` queries MLB `byDateRange` for the
 * full period aggregate — no per-day filter, no cold-start gap.
 *
 * Trust hierarchy (documented in
 * `docs/solutions/integration-issues/mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md`):
 *
 *   MLB statsapi  >  PSP (production standings)  >  PSD (audit-tool legacy)  >  FanGraphs (derived view)
 *
 * Audit the same source production reads from. Discrepancies at the audit
 * layer can be entirely tooling artifacts.
 *
 * Run:
 *   cd server && npx tsx src/scripts/fangraphs-audit.ts [leagueId]
 *
 * Default leagueId = 20 (2026 OGBA live season per project memory).
 */

import { fileURLToPath } from "node:url";
import { prisma } from "../db/prisma.js";
import { computeCategoryRows, computeStandingsFromStats } from "../features/standings/services/standingsService.js";
import { TWO_WAY_PLAYERS } from "../lib/sportConfig.js";
import { buildIlWindows, wasOnIlAtPeriodStart, type IlWindow } from "../lib/ilWindows.js";

const PITCHER_CODES = ["P", "SP", "RP", "CL"];

export type Accum = {
  R: number; HR: number; RBI: number; SB: number; H: number; AB: number;
  W: number; S: number; K: number; ER: number; IP: number; BB_H: number;
};
export const zeroAccum = (): Accum => ({ R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, W: 0, S: 0, K: 0, ER: 0, IP: 0, BB_H: 0 });

/** PSP fields the audit reads (subset of the Prisma row). */
export type AuditPspRow = {
  R: number; HR: number; RBI: number; SB: number; H: number; AB: number;
  W: number; SV: number; K: number; ER: number; IP: number; BB_H: number;
};

/** Roster fields the audit reads (subset of the Prisma roster row). */
export type AuditRoster = {
  teamId: number; playerId: number; acquiredAt: Date; releasedAt: Date | null;
  assignedPosition: string | null;
  player: { mlbId: number | null; posPrimary: string | null };
};

/**
 * Accumulate ONE period's PSP into per-team totals using ownership-window
 * overlap, mutating `teamAccum` in place. Mirrors the closed-period
 * attribution model FanGraphs/OnRoto and the OGBA Excel snapshot use —
 * stats credited to whoever owned the player WHEN they earned them.
 *
 * Dedup guard: a player can have multiple roster rows on the SAME team
 * within one period (drop-and-re-add cycle, e.g. Aaron Ashby on Diamond
 * Kings dropped + re-added 2026-05-22 in Period 3). The whole-period PSP is
 * credited to that team ONCE, not once per row — mirrors production
 * `computeWithPeriodStats`'s `countedPlayers` guard (standingsService.ts:701).
 * Keyed by team+player so a player traded mid-period still counts under each
 * owning team per the overlap model.
 *
 * Exported for unit testing (see __tests__/fangraphs-audit.test.ts).
 */
export function accumulatePeriodStats(
  rosters: AuditRoster[],
  period: { startDate: Date; endDate: Date },
  pspByPlayer: ReadonlyMap<number, AuditPspRow>,
  ilWindowsByPlayer: Map<number, IlWindow[]>,
  teamAccum: Map<number, Accum>,
): void {
  const counted = new Set<string>();

  for (const roster of rosters) {
    // Overlap test for THIS period only.
    if (roster.acquiredAt > period.endDate) continue;
    if (roster.releasedAt && roster.releasedAt <= period.startDate) continue;
    // IL window check — same as production (lib/ilWindows.ts).
    if (wasOnIlAtPeriodStart(roster.playerId, period.startDate, ilWindowsByPlayer)) continue;

    const dedupKey = `${roster.teamId}:${roster.playerId}`;
    if (counted.has(dedupKey)) continue;
    counted.add(dedupKey);

    const ps = pspByPlayer.get(roster.playerId);
    if (!ps) continue;

    const isTwoWay = roster.player.mlbId ? TWO_WAY_PLAYERS.has(roster.player.mlbId) : false;
    const assignedAsP = PITCHER_CODES.includes(
      (roster.assignedPosition ?? roster.player.posPrimary ?? "").toUpperCase(),
    );
    const countHitting = !isTwoWay || !assignedAsP;
    const countPitching = !isTwoWay || assignedAsP;

    const acc = teamAccum.get(roster.teamId);
    if (!acc) continue;
    if (countHitting) {
      acc.R += ps.R; acc.HR += ps.HR; acc.RBI += ps.RBI; acc.SB += ps.SB;
      acc.H += ps.H; acc.AB += ps.AB;
    }
    if (countPitching) {
      acc.W += ps.W; acc.S += ps.SV; acc.K += ps.K;
      acc.ER += ps.ER; acc.IP += ps.IP; acc.BB_H += ps.BB_H;
    }
  }
}

async function main() {
  const leagueId = Number(process.argv[2] ?? 20);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, name: true, scoringFormat: true },
  });
  if (!league) {
    console.error(`League ${leagueId} not found.`);
    process.exit(1);
  }

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true },
    orderBy: { id: "asc" },
  });
  if (teams.length === 0) {
    console.error(`No teams in league ${leagueId}.`);
    process.exit(1);
  }

  // Include both active and completed periods (mirrors what the standings
  // route does when it sums across all in-season periods).
  const periods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] } },
    select: { id: true, name: true, startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  });
  if (periods.length === 0) {
    console.error(`No active/completed periods for league ${leagueId}.`);
    process.exit(1);
  }
  const seasonStart = periods[0]!.startDate;
  const seasonEnd = new Date(Math.min(periods[periods.length - 1]!.endDate.getTime(), Date.now()));

  // All roster entries — used for per-period ownership-window attribution.
  // Same overlap test the standings route uses: `acquiredAt <= period.endDate`
  // AND (`releasedAt IS NULL` OR `releasedAt > period.startDate`).
  const rosters = await prisma.roster.findMany({
    where: { team: { leagueId } },
    select: {
      teamId: true,
      playerId: true,
      acquiredAt: true,
      releasedAt: true,
      assignedPosition: true,
      player: { select: { mlbId: true, posPrimary: true } },
    },
  });

  // Historical IL windows — same approach the production standings route uses
  // (`standingsService.ts:442`). Reconstructs each player's IL stints from
  // IL_STASH/IL_ACTIVATE TransactionEvent rows so closed-period attribution
  // doesn't depend on the CURRENT `assignedPosition` value.
  const rosterPlayerIds = [...new Set(rosters.map((r) => r.playerId))];
  const ilEvents = await prisma.transactionEvent.findMany({
    where: {
      playerId: { in: rosterPlayerIds },
      transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] },
      effDate: { not: null },
    },
    select: { playerId: true, transactionType: true, effDate: true },
    orderBy: { effDate: "asc" },
  });
  const ilWindowsByPlayer = buildIlWindows(ilEvents);

  const teamAccum = new Map<number, Accum>(teams.map((t) => [t.id, zeroAccum()]));

  // Sum each period's PSP into per-team totals via `accumulatePeriodStats`
  // (ownership-window overlap + same-team drop-and-re-add dedup). Extracted
  // and unit-tested in __tests__/fangraphs-audit.test.ts.
  for (const period of periods) {
    const psp = await prisma.playerStatsPeriod.findMany({ where: { periodId: period.id } });
    const pspByPlayer = new Map(psp.map((p) => [p.playerId, p]));
    accumulatePeriodStats(rosters, period, pspByPlayer, ilWindowsByPlayer, teamAccum);
  }

  // Build TeamStatRow shape for standingsService
  const teamStats = teams.map((t) => {
    const a = teamAccum.get(t.id)!;
    return {
      team: { id: t.id, name: t.name, code: t.code ?? t.name.substring(0, 3).toUpperCase() },
      R: a.R, HR: a.HR, RBI: a.RBI, SB: a.SB,
      AVG: a.AB > 0 ? a.H / a.AB : 0,
      W: a.W, S: a.S, K: a.K,
      ERA: a.IP > 0 ? (a.ER / a.IP) * 9 : 0,
      WHIP: a.IP > 0 ? a.BB_H / a.IP : 0,
    };
  });

  const standings = computeStandingsFromStats(teamStats);
  standings.sort((a, b) => b.points - a.points);

  // Print FanGraphs OnRoto-style table
  console.log("");
  console.log(`FanGraphs Audit — ${league.name} (league ${leagueId})`);
  console.log(`Season window: ${seasonStart.toISOString().slice(0, 10)} → ${seasonEnd.toISOString().slice(0, 10)}`);
  console.log(`Periods summed: ${periods.map((p) => p.name).join(", ")}`);
  console.log(`Source: PlayerStatsPeriod (production standings source)`);
  console.log(`Scoring: ${league.scoringFormat ?? "ROTO"}`);
  console.log("");

  const cats = ["R", "HR", "RBI", "SB", "AVG", "W", "S", "K", "ERA", "WHIP"] as const;
  const rateCatSet = new Set(["AVG", "ERA", "WHIP"]);
  const lowerBetter = new Set(["ERA", "WHIP"]);

  // Per-category ranks (points) — same scheme the app uses
  const rankByCategory = new Map<string, Map<number, number>>();
  for (const cat of cats) {
    const rows = computeCategoryRows(teamStats, cat, lowerBetter.has(cat));
    const m = new Map<number, number>();
    for (const r of rows) m.set(r.teamId, r.points);
    rankByCategory.set(cat, m);
  }

  // Header row
  const headerTeam = "Team".padEnd(26);
  const headerCats = cats
    .map((c) => c.padStart(rateCatSet.has(c) ? 8 : 5))
    .join(" ");
  const headerPts = "Pts".padStart(5);
  console.log(`${headerTeam}  ${headerCats}  ${headerPts}`);
  console.log(`${"-".repeat(26)}  ${cats.map((c) => "-".repeat(rateCatSet.has(c) ? 8 : 5)).join(" ")}  ${"-----"}`);

  // Data rows — raw values
  for (const s of standings) {
    const ts = teamStats.find((t) => t.team.id === s.teamId)!;
    const name = ts.team.name.slice(0, 24).padEnd(26);
    const values = cats
      .map((c) => {
        const v = (ts as Record<string, unknown>)[c] as number;
        if (c === "AVG") return v.toFixed(4).padStart(8);
        if (c === "WHIP") return v.toFixed(3).padStart(8);
        if (c === "ERA") return v.toFixed(2).padStart(8);
        return String(Math.round(v)).padStart(5);
      })
      .join(" ");
    const pts = s.points.toFixed(1).padStart(5);
    console.log(`${name}  ${values}  ${pts}`);
  }

  console.log("");
  console.log("Per-category points (1–8 higher is better, ties averaged):");
  const ptsTeam = "Team".padEnd(26);
  const ptsCats = cats.map((c) => c.padStart(5)).join(" ");
  console.log(`${ptsTeam}  ${ptsCats}  ${"Total".padStart(6)}`);
  console.log(`${"-".repeat(26)}  ${cats.map(() => "-----").join(" ")}  ${"------"}`);
  for (const s of standings) {
    const ts = teamStats.find((t) => t.team.id === s.teamId)!;
    const name = ts.team.name.slice(0, 24).padEnd(26);
    const pts = cats
      .map((c) => (rankByCategory.get(c)!.get(s.teamId) ?? 0).toFixed(1).padStart(5))
      .join(" ");
    const total = s.points.toFixed(1).padStart(6);
    console.log(`${name}  ${pts}  ${total}`);
  }
  console.log("");
  console.log("Next: open https://onroto.fangraphs.com (OGBA league) and eyeball-compare.");
  console.log("Look for: raw cat values match (counting stats exact, rates to displayed precision)");
  console.log("         + per-category points match + total points match.");
  console.log("");

  await prisma.$disconnect();
}

// Only run when invoked directly (`tsx fangraphs-audit.ts`), not when the
// module is imported by the unit test for `accumulatePeriodStats`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
