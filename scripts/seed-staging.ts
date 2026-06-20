/**
 * Seed script for the TFL staging environment.
 *
 * Connects to the STAGING Supabase project (from .env.staging) and populates
 * it with test users, a test league, teams, and live MLB player data.
 *
 * Idempotent — safe to run multiple times (upserts, not inserts).
 *
 * Usage:
 *   npm run seed:staging              # Full seed (MLB)
 *   npm run seed:staging -- --reset   # Destructive reset + re-seed
 *   npm run seed:staging -- --delay 500  # 500ms delay between API batches
 *
 * Prerequisites:
 *   1. Copy .env.staging.template → .env.staging and fill in your staging
 *      Supabase project credentials.
 *   2. Run prisma migrate deploy against staging DB first:
 *      DATABASE_URL=$(grep ^DATABASE_URL .env.staging | cut -d= -f2-) \
 *        npx prisma migrate deploy --schema ./prisma/schema.prisma
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// ─── Load .env.staging BEFORE any other imports ──────────────────────────────
// Must happen before Prisma client is imported so it picks up the staging DB URL.

const stagingEnvPath = path.resolve(process.cwd(), ".env.staging");

if (!fs.existsSync(stagingEnvPath)) {
  console.error(
    "❌  .env.staging not found.\n" +
    "    Copy .env.staging.template → .env.staging and fill in your staging\n" +
    "    Supabase project credentials, then re-run."
  );
  process.exit(1);
}

dotenv.config({ path: stagingEnvPath, override: true });

if (!process.env.DATABASE_URL?.includes("supabase")) {
  console.error(
    "❌  DATABASE_URL in .env.staging does not look like a Supabase URL.\n" +
    "    Check that .env.staging is correct and that it is not pointing to prod."
  );
  process.exit(1);
}

// ─── Now safe to import Prisma (uses the staging DATABASE_URL) ───────────────

import { PrismaClient } from "../server/node_modules/.prisma/client/index.js";
import { syncAllPlayers } from "../server/src/features/players/services/mlbSyncService.js";

const prisma = new PrismaClient();

// ─── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const RESET = args.includes("--reset");
const DELAY_MS = (() => {
  const idx = args.indexOf("--delay");
  return idx !== -1 ? parseInt(args[idx + 1] ?? "0", 10) : 0;
})();
const SEASON = 2026;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_USER = {
  email: "admin@staging.tfl",
  name: "Staging Admin",
  isAdmin: true,
};

const COMMISSIONER_USER = {
  email: "commissioner@staging.tfl",
  name: "Staging Commissioner",
  isAdmin: false,
};

const PLAYER_USERS = [
  { email: "player1@staging.tfl", name: "Alice Player"  },
  { email: "player2@staging.tfl", name: "Bob Player"    },
  { email: "player3@staging.tfl", name: "Carol Player"  },
  { email: "player4@staging.tfl", name: "Dave Player"   },
  { email: "player5@staging.tfl", name: "Eve Player"    },
  { email: "player6@staging.tfl", name: "Frank Player"  },
  { email: "player7@staging.tfl", name: "Grace Player"  },
  { email: "player8@staging.tfl", name: "Hank Player"   },
];

const STAGING_FRANCHISE_NAME = "TFL Staging Franchise";

// Mirrors OGBA structure for validation comparisons
const STAGING_LEAGUE = {
  name: "OGBA Staging",
  sport: "MLB",
  season: SEASON,
  draftMode: "AUCTION" as const,
  faabBudget: 260,
};

const TEAM_DEFS = [
  { name: "Alpha Dogs",     code: "ADS", ownerEmail: "player1@staging.tfl" },
  { name: "Beta Bears",     code: "BBR", ownerEmail: "player2@staging.tfl" },
  { name: "Gamma Rays",     code: "GRY", ownerEmail: "player3@staging.tfl" },
  { name: "Delta Force",    code: "DLF", ownerEmail: "player4@staging.tfl" },
  { name: "Epsilon Squad",  code: "EPS", ownerEmail: "player5@staging.tfl" },
  { name: "Zeta Zone",      code: "ZTZ", ownerEmail: "player6@staging.tfl" },
  { name: "Eta Heroes",     code: "ETH", ownerEmail: "player7@staging.tfl" },
  { name: "Theta Thunder",  code: "THT", ownerEmail: "player8@staging.tfl" },
  { name: "Iota Storm",     code: "ITS", ownerEmail: "commissioner@staging.tfl" },
  { name: "Kappa Kings",    code: "KKS", ownerEmail: "admin@staging.tfl" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[seed-staging] ${msg}`);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Reset ────────────────────────────────────────────────────────────────────

async function resetStagingData() {
  log("⚠️  --reset: clearing all staging data…");
  // Order respects FK constraints
  await prisma.transactionEvent.deleteMany({});
  await prisma.roster.deleteMany({});
  await prisma.playerStatsPeriod.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.league.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.user.deleteMany({});
  log("   Reset complete.");
}

// ─── Seed users ───────────────────────────────────────────────────────────────

async function seedUsers() {
  const allUsers = [
    { ...ADMIN_USER,        isAdmin: true  },
    { ...COMMISSIONER_USER, isAdmin: false },
    ...PLAYER_USERS.map((u) => ({ ...u, isAdmin: false })),
  ];

  let created = 0;
  let updated = 0;

  for (const u of allUsers) {
    const result = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        isAdmin: u.isAdmin,
      },
      update: {
        name: u.name,
        isAdmin: u.isAdmin,
      },
    });
    if (result.createdAt.getTime() === result.updatedAt?.getTime()) created++;
    else updated++;
  }

  log(`   Users: ${created} created, ${updated} updated`);
  return allUsers.length;
}

// ─── Seed franchise + league + teams ─────────────────────────────────────────

async function seedLeagueAndTeams() {
  // Franchise is required by League (org-level parent)
  const franchise = await prisma.franchise.upsert({
    where: { name: STAGING_FRANCHISE_NAME },
    create: { name: STAGING_FRANCHISE_NAME },
    update: {},
  });

  const league = await prisma.league.upsert({
    where: { name_season: { name: STAGING_LEAGUE.name, season: STAGING_LEAGUE.season } },
    create: {
      ...STAGING_LEAGUE,
      franchiseId: franchise.id,
    },
    update: { sport: STAGING_LEAGUE.sport, faabBudget: STAGING_LEAGUE.faabBudget },
  });

  log(`   Franchise: ${franchise.name} (id=${franchise.id})`);
  log(`   League: ${league.name} (id=${league.id})`);

  let teamsCreated = 0;
  for (const td of TEAM_DEFS) {
    const owner = await prisma.user.findUnique({ where: { email: td.ownerEmail } });
    if (!owner) {
      log(`   ⚠️  Owner not found for ${td.code}: ${td.ownerEmail} — skipping`);
      continue;
    }

    await prisma.team.upsert({
      where: { leagueId_code: { leagueId: league.id, code: td.code } },
      create: {
        name: td.name,
        code: td.code,
        leagueId: league.id,
        ownerUserId: owner.id,
        budget: STAGING_LEAGUE.faabBudget,
      },
      update: { name: td.name, ownerUserId: owner.id },
    });

    // LeagueMembership is required for the app to recognize league members
    const role = td.ownerEmail === "commissioner@staging.tfl" ? "COMMISSIONER" : "OWNER";
    const existing = await prisma.leagueMembership.findFirst({
      where: { leagueId: league.id, userId: owner.id },
    });
    await prisma.leagueMembership.upsert({
      where: { id: existing?.id ?? 0 },
      create: { leagueId: league.id, userId: owner.id, role },
      update: { role },
    });

    teamsCreated++;
    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  // admin user gets COMMISSIONER membership too (for admin access to draft tools)
  const admin = await prisma.user.findUnique({ where: { email: "admin@staging.tfl" } });
  if (admin) {
    const existing = await prisma.leagueMembership.findFirst({
      where: { leagueId: league.id, userId: admin.id },
    });
    await prisma.leagueMembership.upsert({
      where: { id: existing?.id ?? 0 },
      create: { leagueId: league.id, userId: admin.id, role: "COMMISSIONER" },
      update: { role: "COMMISSIONER" },
    });
  }

  log(`   Teams: ${teamsCreated} upserted (+ LeagueMembership rows)`);
  return { leagueId: league.id, teamsCreated };
}

// ─── Seed MLB players ─────────────────────────────────────────────────────────

async function seedMlbPlayers() {
  log("   Syncing MLB players from MLB Stats API (live)…");
  if (DELAY_MS > 0) {
    log(`   Using ${DELAY_MS}ms delay between batches (--delay flag)`);
  }

  const result = await syncAllPlayers(SEASON);
  log(`   Players: ${result.created} created, ${result.updated} updated`);
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  log(`Connecting to: ${dbUrl.replace(/:[^:@]+@/, ":***@")}`);
  log(`Season: ${SEASON} | Reset: ${RESET} | Delay: ${DELAY_MS}ms\n`);

  if (RESET) {
    await resetStagingData();
  }

  log("1/3  Seeding users…");
  const userCount = await seedUsers();

  log("2/3  Seeding league and teams…");
  const { leagueId, teamsCreated } = await seedLeagueAndTeams();

  log("3/3  Syncing MLB players from live API…");
  const playerResult = await seedMlbPlayers();

  console.log("\n✅  Staging seed complete:");
  console.log(`    Users:   ${userCount}`);
  console.log(`    League:  ${STAGING_LEAGUE.name} (id=${leagueId})`);
  console.log(`    Teams:   ${teamsCreated}`);
  console.log(`    Players: ${playerResult.created} created, ${playerResult.updated} updated`);
  console.log("\n    Next: create Auth users in the Supabase staging console");
  console.log("    (Authentication → Users → Add User) using the emails above.");
}

main()
  .catch((err) => {
    console.error("\n❌  Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
