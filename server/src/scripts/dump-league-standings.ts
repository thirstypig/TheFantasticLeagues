/**
 * READ-ONLY standings dump: the Phase 3.5 "OGBA-identical" gate tool.
 *
 * Run it on the code BEFORE the category change and AFTER, against the same
 * database; the two JSON files must be identical.
 *
 *   npx tsx src/scripts/dump-league-standings.ts --leagues 1,20 --out /path/file.json
 *
 * Performs no writes (no create/update/delete/upsert/raw execute).
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../db/prisma.js";
import {
  computeTeamStatsFromDb,
  computeStandingsFromStats,
  computeCategoryRows,
  getSeasonStandings,
} from "../features/standings/services/standingsService.js";
import { computePeriodAwards } from "../services/periodAwardsService.js";
import { getLeagueCategories } from "../lib/leagueCategories.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "(unknown)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/** Recursively sort object keys; Dates become ISO strings. */
function canon(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, canon(o[k])]),
    );
  }
  return v;
}

async function main() {
  const out = arg("out");
  const leaguesArg = arg("leagues");
  if (!out || !leaguesArg) {
    console.error("Usage: dump-league-standings.ts --leagues 1,20 --out <file.json> (both required)");
    process.exit(1);
  }
  const leagueIds = leaguesArg.split(",").map((s) => Number(s.trim()));
  if (leagueIds.some((n) => !Number.isInteger(n) || n <= 0)) {
    console.error(`Bad --leagues value: ${leaguesArg}`);
    process.exit(1);
  }

  console.log(`Database host: ${dbHost()}`);

  const result: Record<string, unknown> = {};
  for (const leagueId of leagueIds) {
    const categories = await getLeagueCategories(leagueId);
    const periods = await prisma.period.findMany({
      where: { leagueId, status: { in: ["active", "completed"] } },
      orderBy: { startDate: "asc" },
    });

    const periodDumps = [];
    for (const p of periods) {
      const stats = await computeTeamStatsFromDb(leagueId, p.id);
      const standings = computeStandingsFromStats(stats, categories);
      const categoryRows: Record<string, unknown> = {};
      for (const c of categories) {
        categoryRows[c.key] = computeCategoryRows(stats, c.key, c.lowerIsBetter);
      }
      const awards = await computePeriodAwards(leagueId, p.id);
      periodDumps.push({ id: p.id, name: p.name, stats, standings, categoryRows, awards });
    }

    const { computedAt: _omit, ...season } = (await getSeasonStandings(leagueId)) as unknown as Record<
      string,
      unknown
    >;
    void _omit;

    result[String(leagueId)] = {
      categories: categories.map((c) => c.key),
      periods: periodDumps,
      season,
    };
    console.log(`League ${leagueId}: ${categories.length} categories, ${periods.length} periods`);
  }

  writeFileSync(out, JSON.stringify(canon(result), null, 2) + "\n");
  console.log(`Wrote ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
