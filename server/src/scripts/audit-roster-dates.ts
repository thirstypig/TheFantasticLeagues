/**
 * Roster-date audit: every in-season add, drop and trade in FBST vs OnRoto's
 * transaction log. READ-ONLY.
 *
 *   1. Save OnRoto's log from a browser (Cloudflare blocks curl):
 *      https://onroto.fangraphs.com/baseball/webnew/display_trans.pl?OGBA+6+all+YTD+2026&session_id=guest
 *   2. ./scripts/with-prod-db.sh npx tsx src/scripts/audit-roster-dates.ts 20 2026 path/to/onroto_trans.html
 *
 * Exit 0 = PASS (every move matches by date). Exit 1 = differences listed:
 * each one needs a named cause before the period counts as closed. OnRoto is
 * the reference for roster dates (decided 2026-11-11) but has been wrong
 * before — a difference is a question, not an automatic repair.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../db/prisma.js";
import { parseOnrotoTransactions } from "../lib/audit/onrotoTransParser.js";
import { compareRosterDates, type FbstStint } from "../lib/audit/rosterDateCompare.js";

const day = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const [leagueArg, seasonArg, file] = process.argv.slice(2);
  const leagueId = Number(leagueArg);
  const season = Number(seasonArg);
  if (!leagueId || !season || !file) {
    throw new Error("usage: audit-roster-dates.ts <leagueId> <season> <onroto_trans.html>");
  }

  const periods = await prisma.period.findMany({
    where: { leagueId, startDate: { gte: new Date(`${season}-01-01`), lt: new Date(`${season + 1}-01-01`) } },
    orderBy: { startDate: "asc" },
  });
  if (!periods.length) throw new Error(`League ${leagueId} has no ${season} periods`);
  const window = { start: day(periods[0]!.startDate), end: day(periods[periods.length - 1]!.endDate) };

  const rows = await prisma.roster.findMany({
    where: {
      team: { leagueId },
      acquiredAt: { lte: periods[periods.length - 1]!.endDate },
      OR: [{ releasedAt: null }, { releasedAt: { gte: periods[0]!.startDate } }],
    },
    select: { id: true, acquiredAt: true, releasedAt: true, team: { select: { name: true } }, player: { select: { name: true } } },
  });
  const stints: FbstStint[] = rows.map((r) => ({
    rosterId: r.id, team: r.team.name, playerName: r.player.name, acquiredAt: r.acquiredAt, releasedAt: r.releasedAt,
  }));

  const { transactions, unknown } = parseOnrotoTransactions(readFileSync(file, "utf8"), season);
  const r = compareRosterDates(transactions, stints, { ...window, periodStarts: periods.map((p) => day(p.startDate)) });

  console.log(`Roster-date audit — league ${leagueId}, ${season} (${window.start}..${window.end})`);
  console.log(`OnRoto: ${transactions.filter((t) => t.move).length} moves parsed; FBST: ${stints.length} stints`);
  console.log(`Matched by date: ${r.matched}${r.duplicatesMerged ? ` (${r.duplicatesMerged} duplicate OnRoto row(s) merged)` : ""}`);
  const section = (title: string, lines: string[]) => {
    if (!lines.length) return;
    console.log(`\n${title} (${lines.length})`);
    for (const l of lines) console.log(`  ${l}`);
  };
  section("UNRECOGNISED OnRoto wording — comparison incomplete", unknown);
  section("OnRoto teams with no FBST team", r.unmappedTeams);
  section("Dated differently", r.dateDiffs.map((e) => `${e.team}: ${e.player} ${e.move} — OnRoto ${e.onrotoDate}, FBST ${e.fbstDate}`));
  section("In OnRoto, missing from FBST", r.missingInFbst.map((e) => `${e.date} ${e.team}: ${e.player} ${e.move}`));
  section("In FBST, missing from OnRoto", r.missingInOnroto.map((e) => `${e.date} ${e.team}: ${e.player} ${e.move}`));
  section("Stamped with a time of day — confirm the day", r.timeOfDay.map((t) => `roster ${t.rosterId} ${t.team}: ${t.player} ${t.field} ${t.value}`));

  section("Paired on last name only — glance at each (not a failure)", r.matchedByLastName.map((e) => `${e.date} ${e.team}: OnRoto "${e.onrotoAlias}" = ${e.player} ${e.move}`));
  section("Opening-day moves — draft-day roster, not compared (not a failure)", r.openingDay.map((e) => `${e.source}: ${e.team}: ${e.player} ${e.move}`));

  const pass = r.pass && !unknown.length;
  console.log(`\n${pass ? "PASS" : "FINDINGS"}`);
  process.exitCode = pass ? 0 : 1;
}

main()
  .catch((err) => { console.error(err); process.exitCode = 2; })
  .finally(() => prisma.$disconnect());
