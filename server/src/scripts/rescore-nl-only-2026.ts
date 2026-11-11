// server/src/scripts/rescore-nl-only-2026.ts
//
// One-time: re-score OGBA 2026 under the NL-only rule (DOC-040). Stats a player earned
// on an AL team stop counting. Run AFTER the scoring change is deployed.
//
// DRY RUN BY DEFAULT: re-fetches every 2026 period through the new filter and lists each
// stored stat that would change (that is exactly the reconciler's diff). Writes nothing.
//
//   ./scripts/with-prod-db.sh npx tsx src/scripts/rescore-nl-only-2026.ts
//   ./scripts/with-prod-db.sh npx tsx src/scripts/rescore-nl-only-2026.ts --apply
//
// --apply re-syncs each period's PlayerStatsPeriod rows, then rebuilds that period's
// TeamStatsPeriod cache, the same as Admin's sync-stats + recompute-period-cache.
// Re-running is harmless: a second dry run should print no changes.

import { prisma } from "../db/prisma.js";
import { reconcilePeriodStats, syncPeriodStats } from "../features/players/services/mlbStatsSyncService.js";
import { computeTeamStatsFromDb } from "../features/standings/services/standingsService.js";
import { getLeagueScoringLeague } from "../lib/mlbTeams.js";

const LEAGUE_ID = 20;
const CACHED = ["R", "HR", "RBI", "SB", "AVG", "W", "S", "ERA", "WHIP", "K"] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const scoring = await getLeagueScoringLeague(LEAGUE_ID);
  console.log(`League ${LEAGUE_ID} scores: ${scoring ?? "MIXED (everything)"} games only`);
  if (scoring !== "NL") throw new Error("expected OGBA to resolve to NL — stop and check League.rules.leagueType");

  const periods = await prisma.period.findMany({
    where: { leagueId: LEAGUE_ID, startDate: { gte: new Date("2026-01-01") } },
    orderBy: { startDate: "asc" },
  });
  const names = new Map((await prisma.player.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]));

  for (const p of periods) {
    const report = await reconcilePeriodStats(p.id);
    const byPlayer = new Map<number, string[]>();
    for (const m of report.mismatches) {
      byPlayer.set(m.playerId, [...(byPlayer.get(m.playerId) ?? []), `${m.field} ${m.stored}→${m.fresh}`]);
    }
    console.log(`\n${p.name} (id ${p.id}): ${byPlayer.size} player(s) change`);
    for (const [pid, diffs] of byPlayer) console.log(`  ${names.get(pid) ?? pid}: ${diffs.join(", ")}`);

    if (!apply) continue;
    const r = await syncPeriodStats(p.id);
    const teamStats = await computeTeamStatsFromDb(LEAGUE_ID, p.id);
    await prisma.$transaction(teamStats.map(({ team, stats }) => {
      const values = Object.fromEntries(CACHED.map((k) => [k, stats[k] ?? 0])) as Record<(typeof CACHED)[number], number>;
      return prisma.teamStatsPeriod.upsert({
        where: { teamId_periodId: { teamId: team.id, periodId: p.id } },
        update: values,
        create: { teamId: team.id, periodId: p.id, ...values },
      });
    }));
    console.log(`  applied: ${r.synced} stat rows re-synced, ${teamStats.length} team caches rebuilt`);
  }
  console.log(apply ? "\nAPPLIED. Standings refresh within 2 minutes, or bounce Railway." : "\nDRY RUN — nothing written.");
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
