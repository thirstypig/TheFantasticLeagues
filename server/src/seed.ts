// server/src/seed.ts
import { DraftMode, DraftOrder } from "@prisma/client";
import { prisma } from "./db/prisma.js";

async function main() {
  console.log("🌱 Seeding OGBA league, teams, period, stats, and sample roster...");

  // --- 0. Franchise ---
  const franchise = await prisma.franchise.upsert({
    where: { name: "OGBA" },
    update: {},
    create: { name: "OGBA" },
  });

  // --- 1. League ---
  const league = await prisma.league.upsert({
    where: {
      // Uses the @@unique([name, season]) from schema
      name_season: {
        name: "OGBA",
        season: 2025,
      },
    },
    update: {},
    create: {
      name: "OGBA",
      season: 2025,
      draftMode: DraftMode.AUCTION,
      draftOrder: DraftOrder.SNAKE,
      franchiseId: franchise.id,
    },
  });

  console.log(`✅ League ready: ${league.name} ${league.season}`);

  // --- 2. Teams ---
  const teamsData = [
    { name: "Los Doyers", owner: "James Chang" },
    { name: "Skunk Dogs", owner: "Tim Yuba" },
    { name: "Demolition Lumber Co. ", owner: "Yuji Ogasa" },
    { name: "Diamond Kings", owner: "Kent Sakamoto" },
    { name: "Dodger Dawgs", owner: "Kurt Sakamoto" },
    { name: "Devil Dawgs", owner: "Gregg Iwamiya" },
    { name: "RGing Sluggers", owner: "Danny Wong" },
    { name: "The Show", owner: "Jerrod Jue" },
  ];

  const teams = [];

  for (const data of teamsData) {
    const team = await prisma.team.upsert({
      // Team unique is @@unique([leagueId, name]) -> leagueId_name
      where: {
        leagueId_name: {
          leagueId: league.id,
          name: data.name,
        },
      },
      update: {
        owner: data.owner,
      },
      create: {
        leagueId: league.id,
        name: data.name,
        owner: data.owner,
        budget: 400,
      },
    });

    teams.push(team);
  }

  console.log(`✅ Created/updated ${teams.length} teams.`);

  // --- 3. One active scoring period ---
  let period = await prisma.period.findFirst({ where: { name: "Period 1" } });
  if (!period) {
    period = await prisma.period.create({
      data: {
        name: "Period 1",
        startDate: new Date("2025-04-01T00:00:00Z"),
        endDate: new Date("2025-04-30T23:59:59Z"),
        status: "active",
      },
    });
  }

  console.log(`✅ Period ready: ${period.name}`);

  // --- 4. Period stats (all zero for now) ---
  for (const team of teams) {
    await prisma.teamStatsPeriod.upsert({
      where: {
        teamId_periodId: {
          teamId: team.id,
          periodId: period.id,
        },
      },
      update: {},
      create: {
        teamId: team.id,
        periodId: period.id,
        R: 0,
        HR: 0,
        RBI: 0,
        SB: 0,
        AVG: 0,
        W: 0,
        S: 0,
        ERA: 0,
        WHIP: 0,
        K: 0,
        gamesPlayed: 0,
      },
    });
  }

  console.log("✅ Period stats upserted for all teams.");

  // --- 5. Season stats — deprecated (stats computed from TeamStatsPeriod on-demand) ---
  console.log("⏭️  TeamStatsSeason seeding skipped (deprecated — stats from periods).");

  // --- 6. Sample players + roster for one team (Dodger Dawgs) ---
  const playersData = [
    { name: "Mookie Betts", mlbId: null, posPrimary: "2B", posList: "2B,OF" },
    { name: "Freddie Freeman", mlbId: null, posPrimary: "1B", posList: "1B" },
    { name: "Shohei Ohtani", mlbId: null, posPrimary: "UT", posList: "UT" },
  ];

  const players = [];
  for (const p of playersData) {
    const player = await prisma.player.create({
      data: {
        name: p.name,
        mlbId: p.mlbId,
        posPrimary: p.posPrimary,
        posList: p.posList,
      },
    });
    players.push(player);
  }

  const dodgerDawgs = teams.find((t) => t.name === "Dodger Dawgs");
  if (dodgerDawgs) {
    for (const player of players) {
      await prisma.roster.create({
        data: {
          teamId: dodgerDawgs.id,
          playerId: player.id,
          acquiredAt: new Date(),
          source: "seed",
          price: 1,
        },
      });
    }
    console.log("✅ Sample roster created for Dodger Dawgs.");
  } else {
    console.log("⚠️ Dodger Dawgs team not found; skipping sample roster.");
  }

  console.log("🎉 Seeding complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
