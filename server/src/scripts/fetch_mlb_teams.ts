// server/src/scripts/fetch_mlb_teams.ts
/**
 * Consolidated MLB team lookup for historical player stats.
 * Replaces: populate_historical_teams.ts, fetch_period_teams.ts
 *
 * Fetches the correct MLB team for each player during their specific
 * period date ranges using the MLB Stats API.
 *
 * Usage:
 *   npx tsx src/scripts/fetch_mlb_teams.ts                # 2025 by default
 *   npx tsx src/scripts/fetch_mlb_teams.ts --year 2024    # specific year
 *   npx tsx src/scripts/fetch_mlb_teams.ts --overwrite     # re-fetch even if team already set
 */

import 'dotenv/config';
import { prisma } from '../db/prisma';

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

// MLB team ID to abbreviation
const TEAM_ABBREVS: Record<number, string> = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'OAK',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

// ── API helpers ────────────────────────────────────────────────────────────

async function fetchTeamDuringDateRange(
  mlbId: number,
  startDate: string,
  endDate: string
): Promise<string | null> {
  try {
    const url = `${MLB_API_BASE}/people/${mlbId}/stats?stats=byDateRange&startDate=${startDate}&endDate=${endDate}&group=hitting,pitching`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.stats) {
      for (const group of data.stats) {
        for (const split of group.splits || []) {
          const teamId = split?.team?.id;
          if (teamId && TEAM_ABBREVS[teamId]) {
            return TEAM_ABBREVS[teamId];
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchTeamFromPlayerInfo(mlbId: number): Promise<string | null> {
  try {
    const url = `${MLB_API_BASE}/people/${mlbId}?hydrate=currentTeam`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const person = data.people?.[0];
    if (!person?.currentTeam) return null;

    const teamId = person.currentTeam.id;
    if (TEAM_ABBREVS[teamId]) return TEAM_ABBREVS[teamId];

    // Try parent org for minor league players
    const parentOrgId = person.currentTeam.parentOrgId;
    if (parentOrgId && TEAM_ABBREVS[parentOrgId]) return TEAM_ABBREVS[parentOrgId];

    return null;
  } catch {
    return null;
  }
}

// ── Core logic ─────────────────────────────────────────────────────────────

async function fetchTeamsForYear(year: number, overwrite: boolean) {
  console.log(`\n=== Fetching MLB teams for ${year} ===`);

  const teamFilter = overwrite ? {} : { OR: [{ mlbTeam: null }, { mlbTeam: '' }] as const };

  const periods = await prisma.historicalPeriod.findMany({
    where: {
      season: { year },
      startDate: { not: null },
      endDate: { not: null },
    },
    include: {
      stats: {
        where: { mlbId: { not: null }, ...teamFilter },
        select: {
          id: true,
          mlbId: true,
          fullName: true,
          playerName: true,
          mlbTeam: true,
        },
      },
    },
    orderBy: { periodNumber: 'asc' },
  });

  console.log(`  Found ${periods.length} periods with dates`);

  let totalUpdated = 0;

  for (const period of periods) {
    const startDate = period.startDate!.toISOString().split('T')[0];
    const endDate = period.endDate!.toISOString().split('T')[0];

    console.log(
      `\n  Period ${period.periodNumber} (${startDate} to ${endDate}): ${period.stats.length} players`
    );

    // Deduplicate by MLB ID to reduce API calls
    const mlbIdMap = new Map<string, number[]>();
    for (const stat of period.stats) {
      const ids = mlbIdMap.get(stat.mlbId!) || [];
      ids.push(stat.id);
      mlbIdMap.set(stat.mlbId!, ids);
    }

    let periodUpdated = 0;
    let idx = 0;

    for (const [mlbId, statIds] of mlbIdMap) {
      idx++;
      if (idx > 1) await new Promise((r) => setTimeout(r, 100));

      // Try date-range lookup first, fall back to player info
      let team = await fetchTeamDuringDateRange(parseInt(mlbId), startDate, endDate);
      if (!team) {
        team = await fetchTeamFromPlayerInfo(parseInt(mlbId));
      }

      if (team) {
        for (const id of statIds) {
          await prisma.historicalPlayerStat.update({
            where: { id },
            data: { mlbTeam: team },
          });
        }
        periodUpdated += statIds.length;
        const name =
          period.stats.find((s) => s.mlbId === mlbId)?.fullName ||
          period.stats.find((s) => s.mlbId === mlbId)?.playerName;
        console.log(`    ${name}: ${team}`);
      }

      if (idx % 25 === 0) {
        console.log(`    --- Progress: ${idx}/${mlbIdMap.size} ---`);
      }
    }

    totalUpdated += periodUpdated;
    console.log(`  Updated ${periodUpdated} stats`);
  }

  return totalUpdated;
}

// ── CLI ────────────────────────────────────────────────────────────────────

function parseYear(): number {
  const idx = process.argv.indexOf('--year');
  if (idx === -1) return 2025;
  const val = parseInt(process.argv[idx + 1]);
  if (!Number.isFinite(val)) {
    console.error('Invalid --year value');
    process.exit(1);
  }
  return val;
}

async function main() {
  const year = parseYear();
  const overwrite = process.argv.includes('--overwrite');

  const total = await fetchTeamsForYear(year, overwrite);
  console.log(`\n=== Done: ${total} total stats updated ===\n`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
