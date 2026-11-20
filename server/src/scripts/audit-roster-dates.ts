/**
 * Roster-date audit: every in-season add, drop and trade in FBST vs OnRoto's
 * transaction log. READ-ONLY. Usually run as part of audit-period-close.ts.
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
import { loadSeasonPeriods, runRosterDateLeg } from "../lib/audit/rosterDateAudit.js";

async function main() {
  const [leagueArg, seasonArg, file] = process.argv.slice(2);
  const leagueId = Number(leagueArg);
  const season = Number(seasonArg);
  if (!leagueId || !season || !file) {
    throw new Error("usage: audit-roster-dates.ts <leagueId> <season> <onroto_trans.html>");
  }
  const periods = await loadSeasonPeriods(leagueId, season);
  const r = await runRosterDateLeg(leagueId, season, periods, readFileSync(file, "utf8"));
  console.log(`Roster-date audit — league ${leagueId}, ${season}`);
  for (const l of r.lines) console.log(l);
  console.log(`\n${r.pass ? "PASS" : "FINDINGS"}`);
  process.exitCode = r.pass ? 0 : 1;
}

main()
  .catch((err) => { console.error(err); process.exitCode = 2; })
  .finally(() => prisma.$disconnect());
