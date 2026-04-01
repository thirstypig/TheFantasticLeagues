/**
 * Seed script for local development database (fbst_dev).
 *
 * Populates the database with test data for testing trades and waivers.
 * Idempotent — deletes existing data first, then re-creates everything.
 *
 * Usage:
 *   npx tsx scripts/seed-local-db.ts
 */

// Point Prisma at the local dev database BEFORE importing the client
process.env.DATABASE_URL = "postgresql://jameschang@localhost:5432/fbst_dev";
process.env.DIRECT_URL = "postgresql://jameschang@localhost:5432/fbst_dev";

import { PrismaClient } from "../server/node_modules/.prisma/client/index.js";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const SEASON_YEAR = 2026;
const BUDGET_CAP = 260;
const SOURCE = "auction_2026";

const USERS = [
  { email: "jimmychang316@gmail.com", name: "Jimmy Chang", isAdmin: true },
  { email: "testuser2@test.com", name: "Test User 2", isAdmin: false },
  { email: "testuser3@test.com", name: "Test User 3", isAdmin: false },
  { email: "testuser4@test.com", name: "Test User 4", isAdmin: false },
];

const TEAM_DEFS = [
  { name: "Alpha Dogs", code: "AD", ownerIdx: 0 },
  { name: "Beta Bears", code: "BB", ownerIdx: 1 },
  { name: "Gamma Rays", code: "GR", ownerIdx: 2 },
  { name: "Delta Force", code: "DF", ownerIdx: 3 },
];

// 42 NL-heavy players with realistic data
const PLAYERS: { name: string; pos: string; posList: string; mlbTeam: string; mlbId: number }[] = [
  // --- Hitters (0-27) ---
  { name: "Freddie Freeman", pos: "1B", posList: "1B", mlbTeam: "LAD", mlbId: 518692 },
  { name: "Mookie Betts", pos: "SS", posList: "SS,2B,RF", mlbTeam: "LAD", mlbId: 605141 },
  { name: "Bryce Harper", pos: "1B", posList: "1B,DH", mlbTeam: "PHI", mlbId: 547180 },
  { name: "Trea Turner", pos: "SS", posList: "SS", mlbTeam: "PHI", mlbId: 607208 },
  { name: "Ronald Acuna Jr.", pos: "RF", posList: "RF,CF", mlbTeam: "ATL", mlbId: 660670 },
  { name: "Matt Olson", pos: "1B", posList: "1B", mlbTeam: "ATL", mlbId: 621566 },
  { name: "Ozzie Albies", pos: "2B", posList: "2B", mlbTeam: "ATL", mlbId: 645277 },
  { name: "Pete Alonso", pos: "1B", posList: "1B", mlbTeam: "NYM", mlbId: 624413 },
  { name: "Francisco Lindor", pos: "SS", posList: "SS", mlbTeam: "NYM", mlbId: 596019 },
  { name: "Starling Marte", pos: "CF", posList: "CF,RF", mlbTeam: "NYM", mlbId: 516782 },
  { name: "Fernando Tatis Jr.", pos: "RF", posList: "RF,SS", mlbTeam: "SD", mlbId: 665487 },
  { name: "Manny Machado", pos: "3B", posList: "3B", mlbTeam: "SD", mlbId: 592518 },
  { name: "Ha-Seong Kim", pos: "SS", posList: "SS,2B,3B", mlbTeam: "SD", mlbId: 673490 },
  { name: "Christian Yelich", pos: "LF", posList: "LF", mlbTeam: "MIL", mlbId: 592885 },
  { name: "Willy Adames", pos: "SS", posList: "SS", mlbTeam: "SF", mlbId: 642715 },
  { name: "William Contreras", pos: "C", posList: "C,DH", mlbTeam: "MIL", mlbId: 661388 },
  { name: "Ketel Marte", pos: "2B", posList: "2B,OF", mlbTeam: "ARI", mlbId: 606466 },
  { name: "Corbin Carroll", pos: "CF", posList: "CF,LF", mlbTeam: "ARI", mlbId: 682998 },
  { name: "Elly De La Cruz", pos: "SS", posList: "SS,3B", mlbTeam: "CIN", mlbId: 682829 },
  { name: "Spencer Steer", pos: "3B", posList: "3B,1B,2B", mlbTeam: "CIN", mlbId: 668715 },
  { name: "CJ Abrams", pos: "SS", posList: "SS,2B", mlbTeam: "WSH", mlbId: 682928 },
  { name: "Bryan Reynolds", pos: "CF", posList: "CF,LF", mlbTeam: "PIT", mlbId: 668804 },
  { name: "Cody Bellinger", pos: "CF", posList: "CF,1B", mlbTeam: "CHC", mlbId: 641355 },
  { name: "Ian Happ", pos: "LF", posList: "LF,3B", mlbTeam: "CHC", mlbId: 664023 },
  { name: "Lars Nootbaar", pos: "RF", posList: "RF,LF", mlbTeam: "STL", mlbId: 663457 },
  { name: "Nolan Arenado", pos: "3B", posList: "3B", mlbTeam: "STL", mlbId: 571448 },
  { name: "J.T. Realmuto", pos: "C", posList: "C", mlbTeam: "PHI", mlbId: 592663 },
  { name: "Will Smith", pos: "C", posList: "C", mlbTeam: "LAD", mlbId: 669257 },
  // --- Pitchers (28-41) ---
  { name: "Zack Wheeler", pos: "SP", posList: "SP", mlbTeam: "PHI", mlbId: 554430 },
  { name: "Spencer Strider", pos: "SP", posList: "SP", mlbTeam: "ATL", mlbId: 675911 },
  { name: "Kodai Senga", pos: "SP", posList: "SP", mlbTeam: "NYM", mlbId: 694973 },
  { name: "Yu Darvish", pos: "SP", posList: "SP", mlbTeam: "SD", mlbId: 506433 },
  { name: "Logan Webb", pos: "SP", posList: "SP", mlbTeam: "SF", mlbId: 657277 },
  { name: "Zac Gallen", pos: "SP", posList: "SP", mlbTeam: "ARI", mlbId: 668678 },
  { name: "Corbin Burnes", pos: "SP", posList: "SP", mlbTeam: "ARI", mlbId: 669203 },
  { name: "Hunter Greene", pos: "SP", posList: "SP", mlbTeam: "CIN", mlbId: 668881 },
  { name: "Chris Sale", pos: "SP", posList: "SP", mlbTeam: "ATL", mlbId: 519242 },
  { name: "Devin Williams", pos: "RP", posList: "RP", mlbTeam: "NYY", mlbId: 642207 },
  { name: "Edwin Diaz", pos: "RP", posList: "RP", mlbTeam: "NYM", mlbId: 621242 },
  { name: "Ryan Helsley", pos: "RP", posList: "RP", mlbTeam: "STL", mlbId: 664854 },
  { name: "Alexis Diaz", pos: "RP", posList: "RP", mlbTeam: "CIN", mlbId: 664747 },
  { name: "Robert Suarez", pos: "RP", posList: "RP", mlbTeam: "SD", mlbId: 660761 },
];

// Roster assignments: [teamIdx, playerIdx, price]
// Every player (0-41) assigned exactly once. Budget = 260 - sum(prices).
const ROSTERS: [number, number, number][] = [
  // Team 0: Alpha Dogs — spend 195, budget 65
  [0, 0, 35],  // Freeman 1B
  [0, 1, 30],  // Betts SS
  [0, 10, 25], // Tatis RF
  [0, 16, 18], // Ketel Marte 2B
  [0, 17, 12], // Carroll CF
  [0, 24, 3],  // Nootbaar RF
  [0, 27, 10], // Will Smith C
  [0, 28, 22], // Wheeler SP
  [0, 34, 20], // Burnes SP
  [0, 36, 15], // Chris Sale SP
  [0, 37, 5],  // Devin Williams RP

  // Team 1: Beta Bears — spend 188, budget 72
  [1, 2, 35],  // Harper 1B
  [1, 3, 28],  // Turner SS
  [1, 8, 25],  // Lindor SS
  [1, 15, 16], // Contreras C
  [1, 22, 12], // Bellinger CF
  [1, 23, 8],  // Happ LF
  [1, 26, 10], // Realmuto C
  [1, 29, 20], // Strider SP
  [1, 32, 14], // Webb SP
  [1, 38, 6],  // Edwin Diaz RP
  [1, 39, 14], // Helsley RP

  // Team 2: Gamma Rays — spend 205, budget 55
  [2, 4, 38],  // Acuna RF
  [2, 5, 26],  // Olson 1B
  [2, 6, 18],  // Albies 2B
  [2, 9, 6],   // Starling Marte CF
  [2, 14, 22], // Adames SS
  [2, 18, 28], // De La Cruz SS
  [2, 21, 10], // Reynolds CF
  [2, 25, 12], // Arenado 3B
  [2, 30, 14], // Senga SP
  [2, 33, 16], // Gallen SP
  [2, 35, 10], // Hunter Greene SP
  [2, 40, 5],  // Alexis Diaz RP

  // Team 3: Delta Force — spend 182, budget 78
  [3, 7, 40],  // Alonso 1B
  [3, 11, 30], // Machado 3B
  [3, 12, 18], // Ha-Seong Kim SS
  [3, 13, 22], // Yelich LF
  [3, 19, 14], // Steer 3B
  [3, 20, 25], // Abrams SS
  [3, 31, 22], // Darvish SP
  [3, 41, 11], // Robert Suarez RP
];

const RULES = [
  { category: "roster", key: "roster_size", value: "23", label: "Roster Size" },
  { category: "roster", key: "hitter_count", value: "14", label: "Hitter Count" },
  { category: "roster", key: "pitcher_count", value: "9", label: "Pitcher Count" },
  { category: "draft", key: "budget_cap", value: "260", label: "Auction Budget" },
  { category: "overview", key: "team_count", value: "4", label: "Team Count" },
  { category: "roster", key: "outfield_mode", value: "INDIVIDUAL", label: "Outfield Mode" },
  { category: "trades", key: "trade_deadline", value: "2026-08-15", label: "Trade Deadline" },
  { category: "trades", key: "trade_review_hours", value: "48", label: "Trade Review Period (hours)" },
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  console.log("Seeding local dev database (fbst_dev)...\n");

  // --- Clean ---
  console.log("  Deleting existing data...");
  await prisma.$transaction([
    prisma.aiInsight.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.playerStatsDaily.deleteMany(),
    prisma.playerStatsPeriod.deleteMany(),
    prisma.teamStatsSeason.deleteMany(),
    prisma.teamStatsPeriod.deleteMany(),
    prisma.waiverClaim.deleteMany(),
    prisma.tradeItem.deleteMany(),
    prisma.trade.deleteMany(),
    prisma.roster.deleteMany(),
    prisma.auctionBid.deleteMany(),
    prisma.auctionLot.deleteMany(),
    prisma.auctionSession.deleteMany(),
    prisma.snakeDraftSession.deleteMany(),
    prisma.draftPick.deleteMany(),
    prisma.matchup.deleteMany(),
    prisma.financeLedger.deleteMany(),
    prisma.transactionEvent.deleteMany(),
    prisma.playerAlias.deleteMany(),
    prisma.playerValue.deleteMany(),
    prisma.leagueRule.deleteMany(),
    prisma.leagueInvite.deleteMany(),
    prisma.leagueMembership.deleteMany(),
    prisma.teamOwnership.deleteMany(),
    prisma.historicalPlayerStat.deleteMany(),
    prisma.historicalStanding.deleteMany(),
    prisma.historicalPeriod.deleteMany(),
    prisma.historicalSeason.deleteMany(),
    prisma.period.deleteMany(),
    prisma.season.deleteMany(),
    prisma.team.deleteMany(),
    prisma.player.deleteMany(),
    prisma.rosterEntry.deleteMany(),
    prisma.league.deleteMany(),
    prisma.franchiseMembership.deleteMany(),
    prisma.franchise.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  console.log("  Done.\n");

  // --- Users ---
  console.log("  Creating users...");
  const users = [];
  for (const u of USERS) {
    const created = await prisma.user.create({
      data: { email: u.email, name: u.name, isAdmin: u.isAdmin },
    });
    users.push(created);
  }
  console.log(`  Created ${users.length} users.\n`);

  // --- Franchise ---
  console.log("  Creating franchise...");
  const franchise = await prisma.franchise.create({
    data: { name: "Test Franchise", inviteCode: "TEST-INV-001" },
  });
  for (let i = 0; i < users.length; i++) {
    await prisma.franchiseMembership.create({
      data: {
        franchiseId: franchise.id,
        userId: users[i].id,
        role: i === 0 ? "COMMISSIONER" : "OWNER",
      },
    });
  }
  console.log(`  Franchise id=${franchise.id} + ${users.length} memberships.\n`);

  // --- League ---
  console.log("  Creating league...");
  const league = await prisma.league.create({
    data: {
      name: "Test League",
      season: SEASON_YEAR,
      draftMode: "AUCTION",
      franchiseId: franchise.id,
      scoringFormat: "ROTO",
      tradeReviewPolicy: "COMMISSIONER",
      vetoThreshold: 4,
    },
  });
  console.log(`  League id=${league.id}.\n`);

  // --- League Memberships ---
  console.log("  Creating league memberships...");
  for (let i = 0; i < users.length; i++) {
    await prisma.leagueMembership.create({
      data: {
        leagueId: league.id,
        userId: users[i].id,
        role: i === 0 ? "COMMISSIONER" : "OWNER",
      },
    });
  }
  console.log(`  ${users.length} league memberships.\n`);

  // --- League Rules ---
  console.log("  Creating league rules...");
  for (const r of RULES) {
    await prisma.leagueRule.create({
      data: { leagueId: league.id, ...r, isLocked: true },
    });
  }
  console.log(`  ${RULES.length} rules.\n`);

  // --- Season ---
  console.log("  Creating season...");
  const season = await prisma.season.create({
    data: { leagueId: league.id, year: SEASON_YEAR, status: "IN_SEASON" },
  });
  console.log(`  Season id=${season.id} (IN_SEASON).\n`);

  // --- Periods ---
  console.log("  Creating periods...");
  await prisma.period.create({
    data: {
      name: "Period 1",
      startDate: new Date("2026-03-27"),
      endDate: new Date("2026-04-27"),
      status: "active",
      leagueId: league.id,
      seasonId: season.id,
    },
  });
  await prisma.period.create({
    data: {
      name: "Period 2",
      startDate: new Date("2026-04-28"),
      endDate: new Date("2026-05-25"),
      status: "pending",
      leagueId: league.id,
      seasonId: season.id,
    },
  });
  console.log("  2 periods (1 active, 1 pending).\n");

  // --- Teams ---
  console.log("  Creating teams...");

  // Pre-compute budget per team from roster assignments
  const spendByTeam: Record<number, number> = {};
  for (const [t, , price] of ROSTERS) {
    spendByTeam[t] = (spendByTeam[t] ?? 0) + price;
  }

  const teams = [];
  for (const td of TEAM_DEFS) {
    const spent = spendByTeam[teams.length] ?? 0;
    const budget = BUDGET_CAP - spent;
    const team = await prisma.team.create({
      data: {
        leagueId: league.id,
        name: td.name,
        code: td.code,
        owner: users[td.ownerIdx].name,
        ownerUserId: users[td.ownerIdx].id,
        budget,
      },
    });
    await prisma.teamOwnership.create({
      data: { teamId: team.id, userId: users[td.ownerIdx].id },
    });
    teams.push(team);
  }
  for (const td of TEAM_DEFS) {
    const idx = TEAM_DEFS.indexOf(td);
    const spent = spendByTeam[idx] ?? 0;
    console.log(`    ${td.name} (${td.code}): budget=$${BUDGET_CAP - spent}`);
  }
  console.log(`  ${teams.length} teams.\n`);

  // --- Players ---
  console.log("  Creating players...");
  const players = [];
  for (const p of PLAYERS) {
    const created = await prisma.player.create({
      data: {
        name: p.name,
        posPrimary: p.pos,
        posList: p.posList,
        mlbTeam: p.mlbTeam,
        mlbId: p.mlbId,
      },
    });
    players.push(created);
  }
  console.log(`  ${players.length} players.\n`);

  // --- Rosters ---
  console.log("  Creating roster entries...");
  for (const [t, p, price] of ROSTERS) {
    await prisma.roster.create({
      data: {
        teamId: teams[t].id,
        playerId: players[p].id,
        source: SOURCE,
        price,
      },
    });
  }
  const countByTeam = [0, 0, 0, 0];
  for (const [t] of ROSTERS) countByTeam[t]++;
  for (let i = 0; i < 4; i++) {
    console.log(`    ${TEAM_DEFS[i].name}: ${countByTeam[i]} players`);
  }
  console.log(`  ${ROSTERS.length} roster entries total.\n`);

  // --- Summary ---
  console.log("========================================");
  console.log("  Seed complete!");
  console.log(`  League: "${league.name}" (id=${league.id})`);
  console.log(`  Season: ${SEASON_YEAR} - IN_SEASON`);
  console.log(`  Users: ${users.length} (1 admin/commissioner + 3 owners)`);
  console.log(`  Teams: ${teams.length}`);
  console.log(`  Players: ${players.length}`);
  console.log(`  Roster entries: ${ROSTERS.length}`);
  console.log(`  Periods: 2 (1 active, 1 pending)`);
  console.log(`  Rules: ${RULES.length}`);
  console.log("========================================\n");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
