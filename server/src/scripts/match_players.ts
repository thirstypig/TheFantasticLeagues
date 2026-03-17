// server/src/scripts/match_players.ts
/**
 * Consolidated MLB player matching script.
 * Replaces: autoMatchPlayers.ts, fullMatchAllSeasons.ts
 *
 * Matches abbreviated player names (e.g., "A. Riley") to full MLB names,
 * MLB IDs, and optionally MLB teams using the MLB Stats API.
 *
 * Usage:
 *   npx tsx src/scripts/match_players.ts                  # match all seasons
 *   npx tsx src/scripts/match_players.ts --year 2024      # single year
 *   npx tsx src/scripts/match_players.ts --dry-run        # preview without writing
 *   npx tsx src/scripts/match_players.ts --with-teams     # also fetch MLB teams
 */

import 'dotenv/config';
import { prisma } from '../db/prisma';

interface MLBPerson {
  id: number;
  fullName: string;
  firstName: string;
  lastName: string;
  primaryPosition?: { abbreviation: string };
  currentTeam?: { abbreviation: string };
}

// Opening day dates for team lookups
const OPENING_DAYS: Record<number, string> = {
  2008: '2008-03-25', 2009: '2009-04-05', 2010: '2010-04-04',
  2011: '2011-03-31', 2012: '2012-03-28', 2013: '2013-03-31',
  2014: '2014-03-22', 2015: '2015-04-05', 2016: '2016-04-03',
  2017: '2017-04-02', 2018: '2018-03-29', 2019: '2019-03-20',
  2020: '2020-07-23', 2021: '2021-04-01', 2022: '2022-04-07',
  2023: '2023-03-30', 2024: '2024-03-20', 2025: '2025-03-18',
};

const PITCHER_CODES = new Set(['P', 'SP', 'RP', 'TWP']);

// ── Name parsing ───────────────────────────────────────────────────────────

function parseAbbreviatedName(name: string): { firstInitial: string; lastName: string } | null {
  const match = name.match(/^([A-Za-z]+)\.?\s+(.+)$/);
  if (!match) return null;
  return { firstInitial: match[1].charAt(0).toUpperCase(), lastName: match[2].trim() };
}

// ── API helpers ────────────────────────────────────────────────────────────

async function searchMLBPlayer(lastName: string, season: number): Promise<MLBPerson[]> {
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(lastName)}&sportIds=1&seasons=${season}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = (await response.json()) as any;
    return data.people || [];
  } catch {
    return [];
  }
}

async function getMLBTeamOnDate(mlbId: string, date: string): Promise<string | null> {
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${mlbId}?hydrate=currentTeam&date=${date}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as any;
    return data.people?.[0]?.currentTeam?.abbreviation || null;
  } catch {
    return null;
  }
}

// ── Core matching logic ────────────────────────────────────────────────────

interface MatchStats {
  matched: number;
  unmatched: number;
  teamsUpdated: number;
}

async function matchPlayersForYear(
  year: number,
  dryRun: boolean,
  withTeams: boolean
): Promise<MatchStats> {
  console.log(`\n=== Matching players for ${year} ===`);

  const periods = await prisma.historicalPeriod.findMany({
    where: { season: { year } },
    orderBy: { periodNumber: 'asc' },
    select: { id: true, periodNumber: true, startDate: true },
  });

  console.log(`  Found ${periods.length} periods`);

  const nameCache = new Map<string, MLBPerson[]>();
  let totalMatched = 0;
  let totalUnmatched = 0;
  let totalTeamsUpdated = 0;

  for (const period of periods) {
    const dateForTeam =
      period.periodNumber === 1
        ? OPENING_DAYS[year] || `${year}-04-01`
        : period.startDate?.toISOString().split('T')[0] || OPENING_DAYS[year] || `${year}-04-01`;

    console.log(`\n  Period ${period.periodNumber} (date: ${dateForTeam})`);

    // Get players needing name match
    const needMatch = await prisma.historicalPlayerStat.findMany({
      where: {
        periodId: period.id,
        OR: [{ mlbId: null }, { mlbId: '' }],
      },
      select: { id: true, playerName: true, isPitcher: true, position: true },
    });

    // Get players needing team lookup (only if --with-teams)
    const needTeam = withTeams
      ? await prisma.historicalPlayerStat.findMany({
          where: {
            periodId: period.id,
            mlbId: { not: null },
            OR: [{ mlbTeam: null }, { mlbTeam: '' }],
          },
          select: { id: true, playerName: true, mlbId: true },
        })
      : [];

    console.log(
      `    ${needMatch.length} need name match` +
        (withTeams ? `, ${needTeam.length} need team lookup` : '')
    );

    // Match names via MLB API
    for (const player of needMatch) {
      const parsed = parseAbbreviatedName(player.playerName);
      if (!parsed) continue;

      let candidates = nameCache.get(parsed.lastName);
      if (!candidates) {
        candidates = await searchMLBPlayer(parsed.lastName, year);
        nameCache.set(parsed.lastName, candidates);
        await new Promise((r) => setTimeout(r, 50));
      }

      // Filter by first initial
      let matches = candidates.filter(
        (c) => c.firstName?.charAt(0).toUpperCase() === parsed.firstInitial
      );

      // Filter by pitcher status
      if (matches.length > 1 && player.isPitcher !== null) {
        const filtered = matches.filter((c) => {
          const isPitcher = PITCHER_CODES.has(c.primaryPosition?.abbreviation?.toUpperCase() || '');
          return isPitcher === player.isPitcher;
        });
        if (filtered.length > 0) matches = filtered;
      }

      // Filter by position
      if (matches.length > 1 && player.position) {
        const posMatches = matches.filter(
          (c) => c.primaryPosition?.abbreviation?.toUpperCase() === player.position?.toUpperCase()
        );
        if (posMatches.length === 1) matches = posMatches;
      }

      if (matches.length === 1) {
        const m = matches[0];
        const mlbId = String(m.id);

        // Optionally fetch team
        let mlbTeam: string | null = null;
        if (withTeams) {
          mlbTeam = await getMLBTeamOnDate(mlbId, dateForTeam);
          await new Promise((r) => setTimeout(r, 30));
          if (mlbTeam) totalTeamsUpdated++;
        }

        if (!dryRun) {
          await prisma.historicalPlayerStat.update({
            where: { id: player.id },
            data: {
              fullName: m.fullName,
              mlbId,
              ...(mlbTeam ? { mlbTeam } : {}),
            },
          });
        }

        console.log(
          `      ${player.playerName} -> ${m.fullName} (${mlbId})${mlbTeam ? ` [${mlbTeam}]` : ''}`
        );
        totalMatched++;
      } else if (matches.length === 0) {
        totalUnmatched++;
      } else {
        totalUnmatched++;
        console.log(
          `      ? ${player.playerName} - ${matches.length} matches: ${matches.map((m) => m.fullName).join(', ')}`
        );
      }
    }

    // Update teams for players who have mlbId but no team
    if (withTeams) {
      for (const player of needTeam) {
        if (!player.mlbId) continue;
        const mlbTeam = await getMLBTeamOnDate(player.mlbId, dateForTeam);
        await new Promise((r) => setTimeout(r, 30));

        if (mlbTeam) {
          if (!dryRun) {
            await prisma.historicalPlayerStat.update({
              where: { id: player.id },
              data: { mlbTeam },
            });
          }
          totalTeamsUpdated++;
        }
      }
    }
  }

  return { matched: totalMatched, unmatched: totalUnmatched, teamsUpdated: totalTeamsUpdated };
}

// ── CLI ────────────────────────────────────────────────────────────────────

function parseYear(): number | null {
  const idx = process.argv.indexOf('--year');
  if (idx === -1) return null;
  const val = parseInt(process.argv[idx + 1]);
  if (!Number.isFinite(val)) {
    console.error('Invalid --year value');
    process.exit(1);
  }
  return val;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const withTeams = process.argv.includes('--with-teams');
  const targetYear = parseYear();

  if (dryRun) console.log('DRY-RUN MODE - no changes will be made\n');

  let years: number[];
  if (targetYear) {
    years = [targetYear];
  } else {
    const seasons = await prisma.historicalSeason.findMany({
      select: { year: true },
      orderBy: { year: 'asc' },
    });
    years = seasons.map((s) => s.year);
  }

  console.log(`Processing years: ${years.join(', ')}`);

  let grandMatched = 0;
  let grandUnmatched = 0;
  let grandTeams = 0;

  for (const year of years) {
    const stats = await matchPlayersForYear(year, dryRun, withTeams);
    grandMatched += stats.matched;
    grandUnmatched += stats.unmatched;
    grandTeams += stats.teamsUpdated;
  }

  console.log('\n=== Summary ===');
  console.log(`Total Matched:  ${grandMatched}`);
  console.log(`Total Unmatched: ${grandUnmatched}`);
  if (grandMatched + grandUnmatched > 0) {
    console.log(
      `Match Rate: ${(((grandMatched) / (grandMatched + grandUnmatched)) * 100).toFixed(1)}%`
    );
  }
  if (withTeams) console.log(`Teams Updated: ${grandTeams}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
