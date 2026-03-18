/**
 * Setup Keeper Test Scenarios — End-to-End Keeper Lock Verification
 *
 * Creates test leagues for 2026 under the OGBA franchise, then locks keepers
 * and verifies post-lock roster state + auction readiness.
 *
 * Phase 1: Setup (create leagues, populate rosters, select keepers, execute trades)
 * Phase 2: Lock & Verify (release non-keepers, verify only keepers remain active)
 * Phase 3: Auction Readiness (verify budget math, spots, maxBid per team)
 *
 * Test 1: "OGBA Test1" — Baseline: 4 keepers per team, no trades
 * Test 2: "OGBA Test2" — Different keepers + budget trade ($25 LDY→DMK)
 * Test 3: "OGBA Test3" — Mixed keeper counts (2-4) + player+budget trade (Schwarber/Harper swap)
 *
 * Usage: node scripts/setup-keeper-tests.js
 *
 * For a fresh run, delete existing test leagues first:
 *   DELETE FROM "League" WHERE name LIKE 'OGBA Test%' AND season = 2026;
 */

const { PrismaClient } = require("../server/node_modules/.prisma/client/index.js");

const prisma = new PrismaClient();

const SOURCE_LEAGUE_ID = 1; // OGBA 2025
const FRANCHISE_ID = 1;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createTestLeague(name, season) {
  const existing = await prisma.league.findFirst({ where: { name, season } });
  if (existing) {
    console.log(`  League "${name}" season ${season} already exists (id=${existing.id}), skipping`);
    return existing.id;
  }

  const league = await prisma.league.create({
    data: { name, season, draftMode: "AUCTION", isPublic: false, franchiseId: FRANCHISE_ID },
  });

  // Copy teams from source
  const sourceTeams = await prisma.team.findMany({
    where: { leagueId: SOURCE_LEAGUE_ID },
    include: { ownerships: true },
  });

  for (const t of sourceTeams) {
    const newTeam = await prisma.team.create({
      data: {
        leagueId: league.id,
        name: t.name,
        code: t.code,
        owner: t.owner,
        ownerUserId: t.ownerUserId,
        budget: 400,
      },
    });
    for (const o of t.ownerships) {
      try {
        await prisma.teamOwnership.create({ data: { teamId: newTeam.id, userId: o.userId } });
      } catch (_) { /* ignore */ }
    }
  }

  // Copy memberships
  const sourceMembers = await prisma.leagueMembership.findMany({ where: { leagueId: SOURCE_LEAGUE_ID } });
  for (const m of sourceMembers) {
    await prisma.leagueMembership.upsert({
      where: { leagueId_userId: { leagueId: league.id, userId: m.userId } },
      create: { leagueId: league.id, userId: m.userId, role: m.role },
      update: {},
    });
  }

  // Copy rules (unlocked)
  const sourceRules = await prisma.leagueRule.findMany({ where: { leagueId: SOURCE_LEAGUE_ID } });
  if (sourceRules.length > 0) {
    await prisma.leagueRule.createMany({
      data: sourceRules.map((r) => ({
        leagueId: league.id,
        category: r.category,
        key: r.key,
        value: r.value,
        label: r.label,
        isLocked: false,
      })),
    });
  }

  console.log(`  Created league "${name}" (id=${league.id})`);
  return league.id;
}

async function ensureSeasonExists(leagueId, year, status) {
  const existing = await prisma.season.findUnique({
    where: { leagueId_year: { leagueId, year } },
  });
  if (existing) {
    if (existing.status !== status) {
      await prisma.season.update({ where: { id: existing.id }, data: { status } });
      console.log(`  Season ${year} league ${leagueId}: updated to ${status} (id=${existing.id})`);
    } else {
      console.log(`  Season ${year} league ${leagueId}: already ${status} (id=${existing.id})`);
    }
    return existing.id;
  }

  const season = await prisma.season.create({ data: { leagueId, year, status } });
  console.log(`  Season ${year} league ${leagueId}: created as ${status} (id=${season.id})`);
  return season.id;
}

async function populateFromPrior(leagueId) {
  const existingCount = await prisma.roster.count({
    where: { team: { leagueId }, releasedAt: null },
  });
  if (existingCount > 0) {
    console.log(`  League ${leagueId} already has ${existingCount} roster entries, skipping populate`);
    return;
  }

  const currentLeague = await prisma.league.findUnique({ where: { id: leagueId } });
  const priorLeague = await prisma.league.findFirst({
    where: { franchiseId: currentLeague.franchiseId, season: currentLeague.season - 1 },
  });
  if (!priorLeague) throw new Error(`No prior season league found for franchise ${currentLeague.franchiseId}`);

  const teams = await prisma.team.findMany({ where: { leagueId } });
  const priorTeams = await prisma.team.findMany({
    where: { leagueId: priorLeague.id },
    include: { rosters: { where: { releasedAt: null }, include: { player: true } } },
  });

  const codeToTeam = new Map();
  for (const t of teams) {
    if (t.code) codeToTeam.set(t.code.toUpperCase(), t);
  }

  let totalAdded = 0;
  for (const priorTeam of priorTeams) {
    const currentTeam = priorTeam.code ? codeToTeam.get(priorTeam.code.toUpperCase()) : undefined;
    if (!currentTeam) {
      console.log(`  Warning: No match for "${priorTeam.name}" (${priorTeam.code})`);
      continue;
    }
    for (const roster of priorTeam.rosters) {
      await prisma.roster.create({
        data: {
          teamId: currentTeam.id,
          playerId: roster.playerId,
          source: "prior_season",
          price: roster.price,
          isKeeper: false,
        },
      });
      totalAdded++;
    }
  }
  console.log(`  Populated ${totalAdded} roster entries from prior season (league ${priorLeague.id})`);
}

async function selectKeepers(leagueId, selections) {
  const teams = await prisma.team.findMany({ where: { leagueId } });

  for (const team of teams) {
    const code = team.code ? team.code.toUpperCase() : null;
    if (!code) continue;

    const playerNames = selections[code];
    if (!playerNames || playerNames.length === 0) {
      console.log(`  ${team.name} (${code}): 0 keepers`);
      continue;
    }

    await prisma.roster.updateMany({ where: { teamId: team.id }, data: { isKeeper: false } });

    const rosters = await prisma.roster.findMany({
      where: { teamId: team.id, releasedAt: null },
      include: { player: true },
    });

    let keeperCount = 0;
    let keeperCost = 0;
    for (const name of playerNames) {
      const match = rosters.find((r) => r.player.name.toLowerCase().includes(name.toLowerCase()));
      if (match) {
        await prisma.roster.update({ where: { id: match.id }, data: { isKeeper: true } });
        keeperCount++;
        keeperCost += match.price;
      } else {
        console.log(`    Warning: "${name}" not found on ${team.name}`);
      }
    }
    console.log(`  ${team.name} (${code}): ${keeperCount} keepers, cost $${keeperCost}, auction budget $${400 - keeperCost}`);
  }
}

async function executeTrade(leagueId, description, items) {
  const teams = await prisma.team.findMany({ where: { leagueId } });
  const codeToTeam = new Map();
  for (const t of teams) {
    if (t.code) codeToTeam.set(t.code.toUpperCase(), t);
  }

  console.log(`  Trade: ${description}`);

  const tradeItems = [];
  for (const item of items) {
    const sender = codeToTeam.get(item.senderCode.toUpperCase());
    const recipient = codeToTeam.get(item.recipientCode.toUpperCase());
    if (!sender || !recipient) {
      console.log(`    Warning: Team not found: ${item.senderCode} or ${item.recipientCode}`);
      return;
    }

    if (item.assetType === "PLAYER" && item.playerName) {
      const allRosters = await prisma.roster.findMany({
        where: { teamId: sender.id, releasedAt: null },
        include: { player: true },
      });
      const match = allRosters.find((r) => r.player.name.toLowerCase().includes(item.playerName.toLowerCase()));
      if (!match) {
        console.log(`    Warning: "${item.playerName}" not found on ${sender.name}`);
        return;
      }
      tradeItems.push({ senderId: sender.id, recipientId: recipient.id, assetType: "PLAYER", playerId: match.playerId });
    } else if (item.assetType === "BUDGET") {
      tradeItems.push({ senderId: sender.id, recipientId: recipient.id, assetType: "BUDGET", amount: item.amount });
    }
  }

  await prisma.$transaction(async (tx) => {
    const trade = await tx.trade.create({
      data: {
        leagueId,
        proposerId: tradeItems[0].senderId,
        status: "PROCESSED",
        processedAt: new Date(),
        items: {
          create: tradeItems.map((item) => ({
            senderId: item.senderId,
            recipientId: item.recipientId,
            assetType: item.assetType,
            playerId: item.playerId || undefined,
            amount: item.amount || undefined,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of trade.items) {
      if (item.assetType === "PLAYER" && item.playerId) {
        const rosterEntry = await tx.roster.findFirst({
          where: { teamId: item.senderId, playerId: item.playerId, releasedAt: null },
        });
        if (rosterEntry) {
          await tx.roster.update({
            where: { id: rosterEntry.id },
            data: { releasedAt: new Date(), source: "TRADE_OUT" },
          });
          await tx.roster.create({
            data: {
              teamId: item.recipientId,
              playerId: item.playerId,
              source: "TRADE_IN",
              acquiredAt: new Date(),
              price: rosterEntry.price,
            },
          });
          const player = await tx.player.findUnique({ where: { id: item.playerId } });
          console.log(`    Player: ${player?.name} ($${rosterEntry.price}) moved to team ${item.recipientId}`);
        }
      } else if (item.assetType === "BUDGET") {
        const amt = item.amount || 0;
        await tx.team.update({ where: { id: item.senderId }, data: { budget: { decrement: amt } } });
        await tx.team.update({ where: { id: item.recipientId }, data: { budget: { increment: amt } } });
        console.log(`    Budget: $${amt} transferred (team ${item.senderId} -> team ${item.recipientId})`);
      }
    }
  }, { timeout: 30000 });
}

// ─── Lock & Verify ──────────────────────────────────────────────────────────

const ROSTER_SIZE = 23; // 14 hitters + 9 pitchers

async function markTradedKeepers(leagueId, markings) {
  const teams = await prisma.team.findMany({ where: { leagueId } });
  const codeToTeam = new Map();
  for (const t of teams) {
    if (t.code) codeToTeam.set(t.code.toUpperCase(), t);
  }

  for (const { teamCode, playerName } of markings) {
    const team = codeToTeam.get(teamCode.toUpperCase());
    if (!team) {
      console.log(`    Warning: Team ${teamCode} not found`);
      continue;
    }
    const roster = await prisma.roster.findFirst({
      where: { teamId: team.id, releasedAt: null, player: { name: { contains: playerName } } },
      include: { player: true },
    });
    if (!roster) {
      console.log(`    Warning: "${playerName}" not found on ${team.name}`);
      continue;
    }
    await prisma.roster.update({ where: { id: roster.id }, data: { isKeeper: true } });
    console.log(`    Marked ${roster.player.name} as keeper on ${team.name}`);
  }
}

async function lockKeepersAndVerify(leagueId, label, expectedCounts) {
  console.log(`\n=== LOCK & VERIFY: ${label} ===`);

  // Pre-lock counts
  const preLockAll = await prisma.roster.count({
    where: { team: { leagueId }, releasedAt: null },
  });
  const preLockKeepers = await prisma.roster.count({
    where: { team: { leagueId }, releasedAt: null, isKeeper: true },
  });
  const preLockNonKeepers = preLockAll - preLockKeepers;

  console.log(`  Pre-lock:  ${preLockAll} active (${preLockKeepers} keepers, ${preLockNonKeepers} non-keepers)`);

  // Lock: release non-keepers (same logic as keeperPrepService.lockKeepers)
  const released = await prisma.roster.updateMany({
    where: { team: { leagueId }, releasedAt: null, isKeeper: false },
    data: { releasedAt: new Date() },
  });

  // Set the lock flag
  await prisma.leagueRule.upsert({
    where: { leagueId_category_key: { leagueId, category: "status", key: "keepers_locked" } },
    create: { leagueId, category: "status", key: "keepers_locked", value: "true", label: "Keepers Locked" },
    update: { value: "true" },
  });

  console.log(`  Locking keepers... released ${released.count} non-keepers`);

  // Post-lock counts
  const postLockAll = await prisma.roster.count({
    where: { team: { leagueId }, releasedAt: null },
  });

  console.log(`  Post-lock: ${postLockAll} active (all keepers)`);

  // Assertions
  let allPassed = true;
  const errors = [];

  if (postLockAll !== preLockKeepers) {
    errors.push(`Post-lock active (${postLockAll}) !== pre-lock keepers (${preLockKeepers})`);
    allPassed = false;
  }
  if (released.count !== preLockNonKeepers) {
    errors.push(`Released (${released.count}) !== pre-lock non-keepers (${preLockNonKeepers})`);
    allPassed = false;
  }

  // Per-team breakdown
  const teams = await prisma.team.findMany({
    where: { leagueId },
    orderBy: { name: "asc" },
  });

  console.log("");
  console.log("  Team                       | Keep | Released | Budget | Keeper$ | Auction$ | Spots | MaxBid");
  console.log("  ---------------------------|------|----------|--------|---------|----------|-------|-------");

  let totalKeepers = 0;
  for (const team of teams) {
    const activeRosters = await prisma.roster.findMany({
      where: { teamId: team.id, releasedAt: null },
      select: { isKeeper: true, price: true },
    });
    const releasedCount = await prisma.roster.count({
      where: { teamId: team.id, releasedAt: { not: null }, isKeeper: false },
    });

    const keeperCount = activeRosters.length;
    const keeperCost = activeRosters.reduce((s, r) => s + r.price, 0);
    const auctionBudget = team.budget - keeperCost;
    const spots = ROSTER_SIZE - keeperCount;
    const maxBid = Math.max(0, auctionBudget - (spots - 1));

    totalKeepers += keeperCount;

    // Verify all active entries are keepers
    const nonKeeperActive = activeRosters.filter((r) => !r.isKeeper);
    if (nonKeeperActive.length > 0) {
      errors.push(`${team.name}: ${nonKeeperActive.length} non-keeper entries still active`);
      allPassed = false;
    }

    // Check expected counts if provided
    const expectedCode = team.code ? team.code.toUpperCase() : null;
    if (expectedCounts && expectedCode && expectedCounts[expectedCode] !== undefined) {
      if (keeperCount !== expectedCounts[expectedCode]) {
        errors.push(`${team.name}: expected ${expectedCounts[expectedCode]} keepers, got ${keeperCount}`);
        allPassed = false;
      }
    }

    // Check budget sanity
    if (auctionBudget < 0) {
      errors.push(`${team.name}: negative auction budget ($${auctionBudget})`);
      allPassed = false;
    }

    const nameCol = `${team.name} (${team.code})`.padEnd(27);
    console.log(
      `  ${nameCol}| ${String(keeperCount).padStart(4)} | ${String(releasedCount).padStart(8)} | $${String(team.budget).padStart(4)}  | $${String(keeperCost).padStart(5)} | $${String(auctionBudget).padStart(6)} | ${String(spots).padStart(5)} | $${String(maxBid).padStart(5)}`
    );
  }

  console.log("");
  if (allPassed) {
    console.log(`  ✓ PASS: All ${totalKeepers} keepers verified — budgets correct, no non-keepers remain`);
  } else {
    console.log("  ✗ FAIL:");
    for (const e of errors) console.log(`    - ${e}`);
  }

  return allPassed;
}

async function verifyAuctionReadiness(leagueId, label) {
  console.log(`\n=== AUCTION READINESS: ${label} ===`);

  const teams = await prisma.team.findMany({
    where: { leagueId },
    orderBy: { name: "asc" },
  });

  let allPassed = true;
  const errors = [];

  console.log("  Team                       | Keepers | Spots | Budget | Spent  | Remaining | MaxBid");
  console.log("  ---------------------------|---------|-------|--------|--------|-----------|-------");

  for (const team of teams) {
    const activeRosters = await prisma.roster.findMany({
      where: { teamId: team.id, releasedAt: null },
      select: { price: true },
    });

    const keeperCount = activeRosters.length;
    const spent = activeRosters.reduce((s, r) => s + r.price, 0);
    const remaining = team.budget - spent;
    const spots = ROSTER_SIZE - keeperCount;
    const maxBid = Math.max(0, remaining - Math.max(0, spots - 1));

    if (remaining < 0) {
      errors.push(`${team.name}: spent ($${spent}) exceeds budget ($${team.budget})`);
      allPassed = false;
    }
    if (maxBid < 0) {
      errors.push(`${team.name}: negative maxBid ($${maxBid})`);
      allPassed = false;
    }
    if (spots < 0) {
      errors.push(`${team.name}: negative spots (${spots})`);
      allPassed = false;
    }

    const nameCol = `${team.name} (${team.code})`.padEnd(27);
    console.log(
      `  ${nameCol}| ${String(keeperCount).padStart(7)} | ${String(spots).padStart(5)} | $${String(team.budget).padStart(4)}  | $${String(spent).padStart(4)}  | $${String(remaining).padStart(7)}   | $${String(maxBid).padStart(5)}`
    );
  }

  console.log("");
  if (allPassed) {
    console.log(`  ✓ PASS: All teams auction-ready — budgets valid, spots available`);
  } else {
    console.log("  ✗ FAIL:");
    for (const e of errors) console.log(`    - ${e}`);
  }

  return allPassed;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Keeper Test Setup ===\n");

  // Step 0: Ensure League 1 has a COMPLETED 2025 season
  console.log("Step 0: Ensure League 1 (OGBA) has a COMPLETED 2025 season");
  await ensureSeasonExists(SOURCE_LEAGUE_ID, 2025, "COMPLETED");

  // ─── TEST 1: Baseline ────────────────────────────────────────────────────
  console.log("\n=== TEST 1: OGBA Test1 — Baseline Keepers ===");
  const test1Id = await createTestLeague("OGBA Test1", 2026);
  await ensureSeasonExists(test1Id, 2026, "SETUP");
  await populateFromPrior(test1Id);
  console.log("  Selecting keepers (same as League 1):");
  await selectKeepers(test1Id, {
    LDY: ["Mookie Betts", "Teoscar Hernández", "Juan Soto", "Jesús Luzardo"],
    SKD: ["Matt Olson", "Trea Turner", "Ketel Marte", "Cristopher Sánchez"],
    DLC: ["Corbin Carroll", "Ronald Acuña", "Shohei Ohtani", "Paul Skenes"],
    DMK: ["Elly De La Cruz", "Fernando Tatis", "Bryan Reynolds", "Edwin Díaz"],
    DDG: ["Francisco Lindor", "Jackson Chourio", "James Wood", "CJ Abrams"],
    DVD: ["Geraldo Perdomo", "Jackson Merrill", "Agustín Ramírez", "Kyle Tucker"],
    RGS: ["Freddie Freeman", "William Contreras", "Kyle Schwarber", "Logan Webb"],
    TSH: ["Manny Machado", "Pete Crow-Armstrong", "Bryce Harper", "Willson Contreras"],
  });

  // ─── TEST 2: Different keepers + budget trade ────────────────────────────
  console.log("\n=== TEST 2: OGBA Test2 — Different Keepers + Budget Trade ===");
  const test2Id = await createTestLeague("OGBA Test2", 2026);
  await ensureSeasonExists(test2Id, 2026, "SETUP");
  await populateFromPrior(test2Id);
  console.log("  Selecting keepers (LDY swaps Betts/Hernandez for Smith/Winn):");
  await selectKeepers(test2Id, {
    LDY: ["Juan Soto", "Will Smith", "Jesús Luzardo", "Masyn Winn"],
    SKD: ["Trea Turner", "Ketel Marte", "Cristopher Sánchez", "Matt Olson"],
    DLC: ["Shohei Ohtani", "Paul Skenes", "Corbin Carroll", "Ronald Acuña"],
    DMK: ["Elly De La Cruz", "Fernando Tatis", "Bryan Reynolds", "Edwin Díaz"],
    DDG: ["Francisco Lindor", "Jackson Chourio", "CJ Abrams", "James Wood"],
    DVD: ["Kyle Tucker", "Agustín Ramírez", "Jackson Merrill", "Geraldo Perdomo"],
    RGS: ["Kyle Schwarber", "Logan Webb", "William Contreras", "Freddie Freeman"],
    TSH: ["Bryce Harper", "Manny Machado", "Pete Crow-Armstrong", "Willson Contreras"],
  });
  console.log("  Executing budget trade:");
  await executeTrade(test2Id, "LDY sends $25 to DMK", [
    { senderCode: "LDY", recipientCode: "DMK", assetType: "BUDGET", amount: 25 },
  ]);

  // ─── TEST 3: Mixed keepers + player+budget trade ─────────────────────────
  console.log("\n=== TEST 3: OGBA Test3 — Mixed Keepers + Player Trade ===");
  const test3Id = await createTestLeague("OGBA Test3", 2026);
  await ensureSeasonExists(test3Id, 2026, "SETUP");
  await populateFromPrior(test3Id);
  console.log("  Selecting keepers (LDY=3, SKD=2, DVD=3, TSH=2, others=4):");
  await selectKeepers(test3Id, {
    LDY: ["Juan Soto", "Mookie Betts", "Jesús Luzardo"],
    SKD: ["Trea Turner", "Ketel Marte"],
    DLC: ["Shohei Ohtani", "Paul Skenes", "Corbin Carroll", "Ronald Acuña"],
    DMK: ["Elly De La Cruz", "Fernando Tatis", "Bryan Reynolds", "Edwin Díaz"],
    DDG: ["Francisco Lindor", "Jackson Chourio", "James Wood", "CJ Abrams"],
    DVD: ["Kyle Tucker", "Jackson Merrill", "Agustín Ramírez"],
    RGS: ["Freddie Freeman", "Kyle Schwarber", "Logan Webb", "William Contreras"],
    TSH: ["Bryce Harper", "Pete Crow-Armstrong"],
  });
  console.log("  Executing player+budget trade:");
  await executeTrade(test3Id, "RGS sends Schwarber + $10 to TSH for Harper", [
    { senderCode: "RGS", recipientCode: "TSH", assetType: "PLAYER", playerName: "Kyle Schwarber" },
    { senderCode: "RGS", recipientCode: "TSH", assetType: "BUDGET", amount: 10 },
    { senderCode: "TSH", recipientCode: "RGS", assetType: "PLAYER", playerName: "Bryce Harper" },
  ]);

  // Mark traded-in players as keepers on their new teams
  console.log("  Marking traded players as keepers on new teams:");
  await markTradedKeepers(test3Id, [
    { teamCode: "TSH", playerName: "Kyle Schwarber" },
    { teamCode: "RGS", playerName: "Bryce Harper" },
  ]);

  // ─── PHASE 2: Lock & Verify ──────────────────────────────────────────────
  console.log("\n========================================");
  console.log("       PHASE 2: LOCK & VERIFY");
  console.log("========================================");

  const results = [];

  // Test1: Baseline — 4 keepers per team
  results.push(await lockKeepersAndVerify(test1Id, "OGBA Test1 — Baseline", {
    LDY: 4, SKD: 4, DLC: 4, DMK: 4, DDG: 4, DVD: 4, RGS: 4, TSH: 4,
  }));

  // Test2: Budget trade — 4 keepers per team, LDY=$375, DMK=$425
  results.push(await lockKeepersAndVerify(test2Id, "OGBA Test2 — Budget Trade", {
    LDY: 4, SKD: 4, DLC: 4, DMK: 4, DDG: 4, DVD: 4, RGS: 4, TSH: 4,
  }));

  // Test3: Mixed keepers + player trade
  // RGS: Freeman, Webb, Contreras + Harper (traded in, marked keeper) = 4
  // TSH: Crow-Armstrong + Schwarber (traded in, marked keeper) = 2
  results.push(await lockKeepersAndVerify(test3Id, "OGBA Test3 — Mixed + Player Trade", {
    LDY: 3, SKD: 2, DLC: 4, DMK: 4, DDG: 4, DVD: 3, RGS: 4, TSH: 2,
  }));

  // ─── PHASE 3: Auction Readiness ──────────────────────────────────────────
  console.log("\n========================================");
  console.log("     PHASE 3: AUCTION READINESS");
  console.log("========================================");

  results.push(await verifyAuctionReadiness(test1Id, "OGBA Test1 — Baseline"));
  results.push(await verifyAuctionReadiness(test2Id, "OGBA Test2 — Budget Trade"));
  results.push(await verifyAuctionReadiness(test3Id, "OGBA Test3 — Mixed + Player Trade"));

  // ─── Final Summary ─────────────────────────────────────────────────────
  console.log("\n========================================");
  console.log("          FINAL SUMMARY");
  console.log("========================================");

  const allPassed = results.every((r) => r);
  if (allPassed) {
    console.log("\n  ✓ ALL TESTS PASSED");
  } else {
    console.log(`\n  ✗ ${results.filter((r) => !r).length} of ${results.length} checks FAILED`);
  }

  console.log("\nDone! Switch leagues in the app to verify each scenario.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  prisma.$disconnect();
  process.exit(1);
});
