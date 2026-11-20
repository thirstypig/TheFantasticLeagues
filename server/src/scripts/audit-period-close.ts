/**
 * Period-close audit: one command, one PASS/FINDINGS answer. READ-ONLY.
 *
 *   Leg 1 — player stats vs MLB. Every stored PlayerStatsPeriod row for a
 *           player on a team in this league during the period, against the
 *           sum of his statsapi game log (per-game, not the syncer's
 *           byDateRange totals), with the league's NL/AL-only rule applied.
 *   Leg 2 — roster dates vs OnRoto. Every in-season add/drop/trade against
 *           OnRoto's saved transaction log.
 *
 * Not covered here: team points vs OnRoto's period standings. That still needs
 * OnRoto's per-period standings (Kent's workbook for 2026) — see the
 * audit-standings skill. With both legs here passing, a points difference can
 * only come from scoring math, which the standings real-DB test covers in CI.
 *
 * Run (from server/):
 *   1. Save OnRoto's transaction log from a browser (Cloudflare blocks curl):
 *      https://onroto.fangraphs.com/baseball/webnew/display_trans.pl?OGBA+6+all+YTD+2026&session_id=guest
 *   2. ./scripts/with-prod-db.sh npx tsx src/scripts/audit-period-close.ts 20 2026 path/to/onroto_trans.html [--period <id>]
 *
 * Without --period, leg 1 checks every completed period of the season.
 * Exit 0 = PASS, 1 = FINDINGS (each needs a named cause), 2 = could not run.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../db/prisma.js";
import { getLeagueScoringLeague } from "../lib/mlbTeams.js";
import { loadSeasonPeriods, runRosterDateLeg, type SeasonPeriod } from "../lib/audit/rosterDateAudit.js";
import {
  diffScored, formatDiffs, pspToScored, roleFor, sumGameLogs, TWO_WAY_OFFSET, type GameLogSplit,
} from "../lib/audit/pspVsMlb.js";

const PROD_REF = "oaogpsshewmcazhehryl";
const STATSAPI = "https://statsapi.mlb.com/api/v1";
const day = (d: Date) => d.toISOString().slice(0, 10);

async function getJson(url: string): Promise<any> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      last = new Error(`HTTP ${res.status}`);
    } catch (err) { last = err; }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error(`${url}: ${String(last)}`);
}

/** MLB team ids whose games count, from statsapi itself (not FBST's team table). */
async function countedTeamIds(leagueId: number, season: number): Promise<{ ids: Set<number> | null; label: string }> {
  const scoring = await getLeagueScoringLeague(leagueId);
  if (!scoring) return { ids: null, label: "all MLB games count" };
  const mlbLeagueId = scoring === "NL" ? 104 : 103;
  const data = await getJson(`${STATSAPI}/teams?sportId=1&season=${season}`);
  const ids = new Set<number>(data.teams.filter((t: any) => t.league?.id === mlbLeagueId).map((t: any) => t.id as number));
  if (ids.size !== 15) throw new Error(`statsapi returned ${ids.size} ${scoring} teams, expected 15`);
  return { ids, label: `${scoring} games only` };
}

async function statsLeg(leagueId: number, season: number, periods: SeasonPeriod[]): Promise<{ pass: boolean; lines: string[] }> {
  const lines: string[] = [];
  const counted = await countedTeamIds(leagueId, season);
  lines.push(`Scoring rule: ${counted.label}`);

  type Row = { periodId: number; mlbId: number; name: string; psp: Parameters<typeof pspToScored>[0]; scored: boolean };
  const rows: Row[] = [];
  let noMlbId = 0;
  for (const p of periods) {
    const owned = await prisma.roster.findMany({
      where: { team: { leagueId }, acquiredAt: { lte: p.endDate }, OR: [{ releasedAt: null }, { releasedAt: { gt: p.startDate } }] },
      select: { playerId: true },
    });
    const ownedIds = new Set(owned.map((r) => r.playerId));
    const psp = await prisma.playerStatsPeriod.findMany({
      where: { periodId: p.id },
      select: {
        playerId: true, AB: true, H: true, R: true, HR: true, RBI: true, SB: true,
        W: true, SV: true, K: true, IP: true, ER: true, BB_H: true,
        player: { select: { mlbId: true, name: true } },
      },
    });
    for (const r of psp) {
      if (r.player.mlbId == null) { noMlbId++; continue; }
      rows.push({ periodId: p.id, mlbId: r.player.mlbId, name: r.player.name, psp: r, scored: ownedIds.has(r.playerId) });
    }
  }
  if (noMlbId) lines.push(`${noMlbId} stored row(s) have no MLB id and cannot be checked`);

  // One game log per real MLB id covers both halves of a two-way player.
  const baseIds = [...new Set(rows.filter((r) => r.scored).map((r) => (r.mlbId >= TWO_WAY_OFFSET ? r.mlbId - TWO_WAY_OFFSET : r.mlbId)))];
  const logs = new Map<number, { hitting: GameLogSplit[]; pitching: GameLogSplit[] }>();
  const failed: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < baseIds.length) {
      const id = baseIds[next++]!;
      try {
        const [h, pi] = await Promise.all(["hitting", "pitching"].map((g) =>
          getJson(`${STATSAPI}/people/${id}/stats?stats=gameLog&group=${g}&season=${season}`)));
        logs.set(id, { hitting: h.stats?.[0]?.splits ?? [], pitching: pi.stats?.[0]?.splits ?? [] });
      } catch (err) { failed.push(`${id}: ${String(err)}`); }
    }
  }));
  lines.push(`Fetched ${logs.size}/${baseIds.length} players' game logs from statsapi`);
  if (failed.length) lines.push("", `COULD NOT FETCH — leg incomplete (${failed.length})`, ...failed.map((f) => `  ${f}`));

  let pass = failed.length === 0;
  for (const p of periods) {
    const inPeriod = rows.filter((r) => r.periodId === p.id);
    const idsInPeriod = new Set(inPeriod.map((r) => r.mlbId));
    const scored = inPeriod.filter((r) => r.scored);
    const diffs: string[] = [];
    for (const r of scored) {
      const base = r.mlbId >= TWO_WAY_OFFSET ? r.mlbId - TWO_WAY_OFFSET : r.mlbId;
      const log = logs.get(base);
      if (!log) continue; // already listed under COULD NOT FETCH
      const mlb = sumGameLogs(log, { start: day(p.startDate), end: day(p.endDate) }, counted.ids, roleFor(r.mlbId, idsInPeriod));
      const d = diffScored(pspToScored(r.psp), mlb);
      if (d.length) diffs.push(`  ${r.name} (${r.mlbId}): ${formatDiffs(d)}  [FBST≠MLB]`);
    }
    const other = inPeriod.length - scored.length;
    const note = other ? `; ${other} stored row(s) for players on no team in this league, not checked` : "";
    lines.push(`${p.name} (${day(p.startDate)}..${day(p.endDate)}): ${scored.length} players, ${diffs.length ? `${diffs.length} DIFFER` : "all match MLB"}${note}`);
    lines.push(...diffs);
    if (diffs.length) pass = false;
  }
  return { pass, lines };
}

async function main() {
  const args = process.argv.slice(2);
  const pIdx = args.indexOf("--period");
  const periodId = pIdx > -1 ? Number(args[pIdx + 1]) : null;
  if (pIdx > -1) args.splice(pIdx, 2);
  const [leagueArg, seasonArg, file] = args;
  const leagueId = Number(leagueArg);
  const season = Number(seasonArg);
  if (!leagueId || !season || !file || (pIdx > -1 && !periodId)) {
    throw new Error("usage: audit-period-close.ts <leagueId> <season> <onroto_trans.html> [--period <id>]");
  }
  const html = readFileSync(file, "utf8");

  const db = (process.env.DATABASE_URL ?? "").includes(PROD_REF) ? "PROD" : "NOT PROD (local or staging data)";
  const periods = await loadSeasonPeriods(leagueId, season);
  const statPeriods = periodId ? periods.filter((p) => p.id === periodId) : periods.filter((p) => p.status === "completed");
  if (!statPeriods.length) throw new Error(periodId ? `Period ${periodId} is not a ${season} period of league ${leagueId}` : `No completed ${season} periods`);

  console.log(`Period-close audit — league ${leagueId}, ${season} — database: ${db}\n`);

  console.log("== Leg 1: player stats vs MLB game logs ==");
  const stats = await statsLeg(leagueId, season, statPeriods);
  for (const l of stats.lines) console.log(l);
  console.log(stats.pass ? "Leg 1 PASS" : "Leg 1 FINDINGS");

  console.log("\n== Leg 2: roster dates vs OnRoto transaction log ==");
  const roster = await runRosterDateLeg(leagueId, season, periods, html);
  for (const l of roster.lines) console.log(l);
  console.log(roster.pass ? "Leg 2 PASS" : "Leg 2 FINDINGS");

  console.log("\nNot covered: team points vs OnRoto's period standings — compare by hand (audit-standings skill).");
  const pass = stats.pass && roster.pass;
  console.log(`\n${pass ? "PASS" : "FINDINGS"}`);
  process.exitCode = pass ? 0 : 1;
}

main()
  .catch((err) => { console.error(err); process.exitCode = 2; })
  .finally(() => prisma.$disconnect());
