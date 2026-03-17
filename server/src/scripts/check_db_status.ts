// server/src/scripts/check_db_status.ts
/**
 * Consolidated database diagnostic script.
 * Replaces: check_db.ts, check-db-connection.ts, check_db_state.ts,
 *           check_players.ts, check_player_mlbids.ts, check_mlb_ids.ts
 *
 * Usage:
 *   npx tsx src/scripts/check_db_status.ts                # run all checks
 *   npx tsx src/scripts/check_db_status.ts --connection    # connection only
 *   npx tsx src/scripts/check_db_status.ts --players       # player table stats
 *   npx tsx src/scripts/check_db_status.ts --mlb-ids       # MLB ID coverage
 *   npx tsx src/scripts/check_db_status.ts --tables        # list DB tables
 *   npx tsx src/scripts/check_db_status.ts --duplicates    # check duplicate hashes
 */

import 'dotenv/config';
import { prisma } from '../db/prisma';

// ── Helpers ────────────────────────────────────────────────────────────────

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const runAll =
  !hasFlag('--connection') &&
  !hasFlag('--players') &&
  !hasFlag('--mlb-ids') &&
  !hasFlag('--tables') &&
  !hasFlag('--duplicates');

// ── Checks ─────────────────────────────────────────────────────────────────

async function checkConnection() {
  console.log('\n--- Connection ---');
  const url = process.env.DATABASE_URL || '';
  const masked = url.replace(/:([^@]+)@/, ':****@');
  console.log(`DATABASE_URL: ${masked}`);

  try {
    await prisma.$connect();
    const count = await prisma.user.count();
    console.log(`Connected. User count: ${count}`);
  } catch (e: any) {
    console.error(`Connection failed: ${e.message}`);
  }
}

async function checkTables() {
  console.log('\n--- Tables ---');
  const tables: Array<{ table_name: string }> =
    await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
  tables.forEach((t) => console.log(`  ${t.table_name}`));
  console.log(`Total: ${tables.length} tables`);
}

async function checkPlayers() {
  console.log('\n--- Player Table ---');
  const total = await prisma.player.count();
  const withMlbId = await prisma.player.count({ where: { mlbId: { not: null } } });

  console.log(`Total players: ${total}`);
  console.log(`With MLB ID:  ${withMlbId}`);
  console.log(`Missing MLB ID: ${total - withMlbId}`);

  const sample = await prisma.player.findMany({
    take: 10,
    select: { name: true, mlbId: true },
  });
  console.log('\nSample:');
  sample.forEach((p) => console.log(`  ${p.name} (MLB ID: ${p.mlbId})`));
}

async function checkMlbIds() {
  console.log('\n--- Historical MLB ID Coverage ---');

  const seasons = await prisma.historicalSeason.findMany({
    select: { year: true },
    orderBy: { year: 'asc' },
  });

  for (const { year } of seasons) {
    const total = await prisma.historicalPlayerStat.count({
      where: { period: { season: { year } } },
    });
    const withId = await prisma.historicalPlayerStat.count({
      where: { period: { season: { year } }, mlbId: { not: null } },
    });
    const uniqueWithId = await prisma.historicalPlayerStat.findMany({
      where: { period: { season: { year } }, mlbId: { not: null } },
      select: { playerName: true },
      distinct: ['playerName'],
    });
    console.log(
      `  ${year}: ${uniqueWithId.length} unique players with MLB IDs (${withId}/${total} rows)`
    );
  }

  // Cross-reference: sample historical MLB IDs against Player table
  const historicalSample = await prisma.historicalPlayerStat.findMany({
    where: { mlbId: { not: null } },
    select: { mlbId: true, playerName: true },
    take: 10,
    distinct: ['mlbId'],
  });

  const mlbIds = historicalSample.map((s) => parseInt(s.mlbId!)).filter(Number.isFinite);
  const matching = await prisma.player.findMany({
    where: { mlbId: { in: mlbIds } },
    select: { mlbId: true, name: true },
  });

  console.log(`\nPlayer table cross-reference (sample of ${mlbIds.length}):`);
  console.log(`  Matched: ${matching.length}/${mlbIds.length}`);
}

async function checkDuplicates() {
  console.log('\n--- Duplicate Checks ---');
  try {
    const dupes = await prisma.transactionEvent.groupBy({
      by: ['rowHash'],
      _count: { rowHash: true },
      having: { rowHash: { _count: { gt: 1 } } },
    });
    console.log(`Duplicate TransactionEvent rowHashes: ${dupes.length}`);
  } catch (e: any) {
    console.log(`Could not check duplicates: ${e.message}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== FBST Database Status ===');

  if (runAll || hasFlag('--connection')) await checkConnection();
  if (runAll || hasFlag('--tables')) await checkTables();
  if (runAll || hasFlag('--players')) await checkPlayers();
  if (runAll || hasFlag('--mlb-ids')) await checkMlbIds();
  if (runAll || hasFlag('--duplicates')) await checkDuplicates();

  console.log('\nDone.\n');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
