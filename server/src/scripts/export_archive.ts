// server/src/scripts/export_archive.ts
/**
 * Export historical archive data to CSV files.
 * Replaces: export_archive_2025.ts (now parameterized by year)
 *
 * Usage:
 *   npx tsx src/scripts/export_archive.ts 2025       # export specific year
 *   npx tsx src/scripts/export_archive.ts             # export all years
 */

import 'dotenv/config';
import { prisma } from '../db/prisma';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Core logic ─────────────────────────────────────────────────────────────

async function exportYear(year: number) {
  const outputDir = path.join(__dirname, `../data/archive/${year}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const season = await prisma.historicalSeason.findFirst({ where: { year } });
  if (!season) {
    console.log(`  No season found for ${year}, skipping.`);
    return;
  }

  const periods = await prisma.historicalPeriod.findMany({
    where: { seasonId: season.id },
    orderBy: { periodNumber: 'asc' },
    include: { stats: true },
  });

  console.log(`\n=== Exporting ${year}: ${periods.length} periods ===`);

  const periodHeaders = [
    'player_name', 'team_code', 'mlb_team', 'position', 'is_pitcher',
    'is_keeper', 'draft_dollars',
    'R', 'HR', 'RBI', 'SB', 'AVG', 'GS',
    'W', 'SV', 'K', 'ERA', 'WHIP', 'SO',
  ];

  for (const period of periods) {
    const csvLines = [periodHeaders.join(',')];

    period.stats.forEach((s) => {
      const row = [
        `"${s.playerName}"`,
        s.teamCode,
        s.mlbTeam || '',
        s.position || '',
        s.isPitcher ? 'TRUE' : 'FALSE',
        s.isKeeper ? 'TRUE' : 'FALSE',
        s.draftDollars || 0,
        s.R ?? 0,
        s.HR ?? 0,
        s.RBI ?? 0,
        s.SB ?? 0,
        (s.AVG || 0).toFixed(3).replace(/^0/, ''),
        s.GS ?? 0,
        s.W ?? 0,
        s.SV ?? 0,
        s.K ?? 0,
        (s.ERA || 0).toFixed(2),
        (s.WHIP || 0).toFixed(2),
        s.SO ?? 0,
      ];
      csvLines.push(row.join(','));
    });

    const periodFile = path.join(outputDir, `period_${period.periodNumber}.csv`);
    fs.writeFileSync(periodFile, csvLines.join('\n'));
    console.log(`  Saved ${periodFile} (${period.stats.length} players)`);

    // Export draft results from period 1
    if (period.periodNumber === 1) {
      const draftHeaders = [
        'player_name', 'team_code', 'mlb_team', 'position',
        'is_pitcher', 'is_keeper', 'draft_dollars',
      ];
      const draftLines = [draftHeaders.join(',')];

      period.stats.forEach((s) => {
        const row = [
          `"${s.playerName}"`,
          s.teamCode,
          s.mlbTeam || '',
          s.position || '',
          s.isPitcher ? 'TRUE' : 'FALSE',
          s.isKeeper ? 'TRUE' : 'FALSE',
          s.draftDollars || 0,
        ];
        draftLines.push(row.join(','));
      });

      const draftFile = path.join(outputDir, `draft_${year}_auction.csv`);
      fs.writeFileSync(draftFile, draftLines.join('\n'));
      console.log(`  Saved ${draftFile} (Draft Results)`);
    }
  }

  // Export period dates
  const dateLines = ['period,start_date,end_date'];
  periods.forEach((p) => {
    const start = p.startDate?.toISOString().split('T')[0] || '';
    const end = p.endDate?.toISOString().split('T')[0] || '';
    dateLines.push(`${p.periodNumber},${start},${end}`);
  });
  const dateFile = path.join(outputDir, `period_dates_${year}.csv`);
  fs.writeFileSync(dateFile, dateLines.join('\n'));
  console.log(`  Saved ${dateFile}`);
}

// ── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const yearArg = process.argv[2];

  if (yearArg) {
    const year = parseInt(yearArg);
    if (!Number.isFinite(year)) {
      console.error('Usage: npx tsx src/scripts/export_archive.ts [year]');
      process.exit(1);
    }
    await exportYear(year);
  } else {
    // Export all years
    const seasons = await prisma.historicalSeason.findMany({
      select: { year: true },
      orderBy: { year: 'asc' },
    });
    for (const { year } of seasons) {
      await exportYear(year);
    }
  }

  console.log('\n--- EXPORT COMPLETE ---\n');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
