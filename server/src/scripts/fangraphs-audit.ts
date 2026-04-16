/**
 * FanGraphs Audit — prints FBST season standings in OnRoto display format
 * for cell-by-cell comparison against https://onroto.fangraphs.com (OGBA league).
 *
 * Aggregates PlayerStatsDaily across the full season, respecting roster
 * ownership windows (so mid-season trades/drops are attributed to the
 * correct team for the days they held the player).
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

  // Season window = earliest Period.startDate .. latest Period.endDate (or today, whichever is earlier).
  const periods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] } },
    select: { startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  });
  if (periods.length === 0) {
    console.error(`No active/completed periods for league ${leagueId}.`);
    process.exit(1);
  }
  const seasonStart = periods[0]!.startDate;
  const seasonEnd = new Date(Math.min(periods[periods.length - 1]!.endDate.getTime(), Date.now()));

  // All roster entries whose ownership window overlaps the season window
  const rosters = await prisma.roster.findMany({
    where: {
      team: { leagueId },
      acquiredAt: { lt: seasonEnd },
      OR: [{ releasedAt: null }, { releasedAt: { gt: seasonStart } }],
    },
    select: {
      teamId: true,
      playerId: true,
      acquiredAt: true,
      releasedAt: true,
      assignedPosition: true,
      player: { select: { mlbId: true, posPrimary: true } },
    },
  });

  const playerIds = [...new Set(rosters.map((r) => r.playerId))];
  const dailyStats = await prisma.playerStatsDaily.findMany({
    where: {
      playerId: { in: playerIds },
      gameDate: { gte: seasonStart, lte: seasonEnd },
    },
    select: {
      playerId: true,
      gameDate: true,
      AB: true, H: true, R: true, HR: true, RBI: true, SB: true,
      W: true, SV: true, K: true, IP: true, ER: true, BB_H: true,
    },
  });

  // Index dailyStats by playerId -> Map<dateMs, row>
  const statsIndex = new Map<number, Map<number, (typeof dailyStats)[number]>>();
  for (const ds of dailyStats) {
    let m = statsIndex.get(ds.playerId);
    if (!m) {
      m = new Map();
      statsIndex.set(ds.playerId, m);
    }
    m.set(ds.gameDate.getTime(), ds);
  }

  // Accumulate per team, respecting ownership windows + two-way player splits
  type Accum = {
    R: number; HR: number; RBI: number; SB: number; H: number; AB: number;
    W: number; S: number; K: number; ER: number; IP: number; BB_H: number;
  };
  const zero = (): Accum => ({ R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, W: 0, S: 0, K: 0, ER: 0, IP: 0, BB_H: 0 });
  const teamAccum = new Map<number, Accum>(teams.map((t) => [t.id, zero()]));

  for (const roster of rosters) {
    const from = roster.acquiredAt > seasonStart ? roster.acquiredAt : seasonStart;
    const to = roster.releasedAt && roster.releasedAt < seasonEnd ? roster.releasedAt : seasonEnd;
    const playerDaily = statsIndex.get(roster.playerId);
    if (!playerDaily) continue;

    const isTwoWay = roster.player.mlbId ? TWO_WAY_PLAYERS.has(roster.player.mlbId) : false;
    const assignedAsP = PITCHER_CODES.includes(
      (roster.assignedPosition ?? roster.player.posPrimary ?? "").toUpperCase(),
    );
    const countHitting = !isTwoWay || !assignedAsP;
    const countPitching = !isTwoWay || assignedAsP;

    const acc = teamAccum.get(roster.teamId)!;
    for (const [dateMs, ds] of playerDaily) {
      const d = new Date(dateMs);
      if (d >= from && d <= to) {
        if (countHitting) {
          acc.R += ds.R; acc.HR += ds.HR; acc.RBI += ds.RBI; acc.SB += ds.SB;
          acc.H += ds.H; acc.AB += ds.AB;
        }
        if (countPitching) {
          acc.W += ds.W; acc.S += ds.SV; acc.K += ds.K;
          acc.ER += ds.ER; acc.IP += ds.IP; acc.BB_H += ds.BB_H;
        }
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
