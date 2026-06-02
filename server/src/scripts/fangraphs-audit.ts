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

import { prisma } from "../db/prisma.js";
import { computeCategoryRows, computeStandingsFromStats } from "../features/standings/services/standingsService.js";
import { TWO_WAY_PLAYERS } from "../lib/sportConfig.js";

const PITCHER_CODES = ["P", "SP", "RP", "CL"];

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

  type Accum = {
    R: number; HR: number; RBI: number; SB: number; H: number; AB: number;
    W: number; S: number; K: number; ER: number; IP: number; BB_H: number;
  };
  const zero = (): Accum => ({ R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, W: 0, S: 0, K: 0, ER: 0, IP: 0, BB_H: 0 });
  const teamAccum = new Map<number, Accum>(teams.map((t) => [t.id, zero()]));

  // Sum each player's PSP row into the team that owned them during that
  // period. A player can appear on different teams across periods (mid-season
  // trades/drops); ownership-window overlap selects the correct team per period.
  for (const period of periods) {
    const psp = await prisma.playerStatsPeriod.findMany({ where: { periodId: period.id } });
    const pspByPlayer = new Map(psp.map((p) => [p.playerId, p]));

    for (const roster of rosters) {
      // Overlap test for THIS period only.
      if (roster.acquiredAt > period.endDate) continue;
      if (roster.releasedAt && roster.releasedAt <= period.startDate) continue;
      // Players slotted on IL at end-of-period don't get production credit.
      // Best-effort using current assignedPosition (the Roster model doesn't
      // store historical slot transitions). For closed periods this can over-
      // or under-include — same simplification the standings UI lives with.
      if ((roster.assignedPosition ?? "").toUpperCase() === "IL") continue;

      const ps = pspByPlayer.get(roster.playerId);
      if (!ps) continue;

      const isTwoWay = roster.player.mlbId ? TWO_WAY_PLAYERS.has(roster.player.mlbId) : false;
      const assignedAsP = PITCHER_CODES.includes(
        (roster.assignedPosition ?? roster.player.posPrimary ?? "").toUpperCase(),
      );
      const countHitting = !isTwoWay || !assignedAsP;
      const countPitching = !isTwoWay || assignedAsP;

      const acc = teamAccum.get(roster.teamId)!;
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
