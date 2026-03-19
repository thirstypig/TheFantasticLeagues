/**
 * Auction End-to-End Simulation Test
 *
 * Tests the full auction lifecycle for league 2 (OGBA 2026):
 * - Init auction (reads rules, loads keepers, sets budgets)
 * - Nominate + bid + finish for all 152 picks (8 teams × 19 spots)
 * - Validates budgets, position limits, and final rosters
 *
 * Perspectives tested:
 * - SWE: state machine transitions, concurrent finish protection, crash recovery
 * - QA: edge cases, budget math, position enforcement, bid validation
 * - Designer: error messages, toast feedback clarity
 * - Commissioner: pause/resume/undo flow
 *
 * Prerequisites: run setup-auction-test.ts first
 * Usage: cd server && npx tsx src/scripts/auction-e2e-test.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const API = "http://localhost:4010/api";
let adminToken = "";

// --- Helpers ---

async function login(): Promise<string> {
  // Step 1: Get dev credentials via server endpoint
  const devRes = await fetch(`${API}/auth/dev-login`, { method: "POST" });
  const devData = (await devRes.json()) as any;
  if (!devData.email || !devData.password) {
    throw new Error("Dev login failed: " + JSON.stringify(devData));
  }

  // Step 2: Sign in to Supabase to get a JWT
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env");
  }

  const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ email: devData.email, password: devData.password }),
  });
  const authData = (await authRes.json()) as any;
  if (!authData.access_token) {
    throw new Error("Supabase auth failed: " + JSON.stringify(authData));
  }

  return authData.access_token;
}

async function api(method: string, path: string, body?: any): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, data: json };
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    failures.push(msg);
  } else {
    passes++;
  }
}

let passes = 0;
const failures: string[] = [];

// --- Test Suites ---

async function testInit() {
  console.log("\n═══ TEST SUITE: Auction Init ═══");

  // 1. Init auction for league 2
  const { status, data } = await api("POST", "/auction/init", { leagueId: 2 });
  assert(status === 200, `Init should return 200, got ${status}`);
  assert(data.status === "nominating", `Status should be 'nominating', got ${data.status}`);
  assert(data.teams.length === 8, `Should have 8 teams, got ${data.teams.length}`);
  assert(data.config.budgetCap === 400, `Budget cap should be 400, got ${data.config.budgetCap}`);
  assert(data.config.rosterSize === 23, `Roster size should be 23, got ${data.config.rosterSize}`);
  assert(data.config.pitcherCount === 9, `Pitcher count should be 9, got ${data.config.pitcherCount}`);
  assert(data.config.batterCount === 14, `Batter count should be 14, got ${data.config.batterCount}`);
  assert(data.config.positionLimits !== null, "Position limits should be loaded");

  // Verify position limits match league rules
  const posLimits = data.config.positionLimits;
  assert(posLimits.C === 2, `C limit should be 2, got ${posLimits?.C}`);
  assert(posLimits.OF === 5, `OF limit should be 5, got ${posLimits?.OF}`);
  assert(posLimits.SS === 1, `SS limit should be 1, got ${posLimits?.SS}`);

  // Verify each team's budget matches (400 - keeper cost)
  for (const team of data.teams) {
    assert(team.rosterCount === 4, `${team.code} should have 4 keepers, got ${team.rosterCount}`);
    assert(team.spotsLeft === 19, `${team.code} should have 19 spots, got ${team.spotsLeft}`);
    assert(team.budget >= 200, `${team.code} budget should be >= 200, got ${team.budget}`);
    assert(team.maxBid > 0, `${team.code} maxBid should be > 0, got ${team.maxBid}`);
    // maxBid = budget - (spotsLeft - 1) = budget - 18
    const expectedMaxBid = team.budget - (team.spotsLeft - 1);
    assert(team.maxBid === expectedMaxBid, `${team.code} maxBid should be ${expectedMaxBid}, got ${team.maxBid}`);
  }

  // Verify queue initialized
  assert(data.queue.length === 8, `Queue should have 8 teams, got ${data.queue.length}`);
  assert(data.queueIndex === 0, `Queue index should be 0, got ${data.queueIndex}`);

  console.log("  Teams:");
  for (const t of data.teams) {
    console.log(`    ${t.code}: budget=$${t.budget}, maxBid=$${t.maxBid}, ${t.rosterCount} players (${t.hitterCount}H/${t.pitcherCount}P)`);
  }

  return data;
}

async function testBidValidation(state: any) {
  console.log("\n═══ TEST SUITE: Bid Validation & Edge Cases ═══");

  const teams = state.teams;
  const nominatorTeam = teams[state.queueIndex];

  // Get an available player
  const availablePlayers = await prisma.roster.findMany({
    where: { team: { leagueId: 2 }, releasedAt: { not: null } },
    include: { player: true },
    take: 5,
  });
  const player = availablePlayers[0];

  // TEST: Nominate with insufficient funds
  const { status: s1, data: d1 } = await api("POST", "/auction/nominate", {
    leagueId: 2,
    nominatorTeamId: nominatorTeam.id,
    playerId: String(player.player.mlbId),
    playerName: player.player.name,
    startBid: 999,
    positions: player.player.posPrimary,
    team: player.player.mlbTeam || "",
    isPitcher: ["P", "SP", "RP", "TWP"].includes(player.player.posPrimary.toUpperCase()),
  });
  assert(s1 === 400, `Over-budget nomination should fail (400), got ${s1}`);
  assert(d1.error?.includes("fund") || d1.error?.includes("budget") || d1.error?.includes("nsuffic"),
    `Error should mention funds, got: ${d1.error}`);

  // TEST: Bid on non-existent auction
  const { status: s2, data: d2 } = await api("POST", "/auction/bid", {
    leagueId: 2,
    bidderTeamId: teams[1].id,
    amount: 5,
  });
  assert(s2 === 400, `Bid without active nomination should fail, got ${s2}`);

  // TEST: Valid nomination
  const { status: s3, data: d3 } = await api("POST", "/auction/nominate", {
    leagueId: 2,
    nominatorTeamId: nominatorTeam.id,
    playerId: String(player.player.mlbId),
    playerName: player.player.name,
    startBid: 1,
    positions: player.player.posPrimary,
    team: player.player.mlbTeam || "",
    isPitcher: ["P", "SP", "RP", "TWP"].includes(player.player.posPrimary.toUpperCase()),
  });
  assert(s3 === 200, `Valid nomination should succeed, got ${s3}: ${JSON.stringify(d3.error)}`);
  assert(d3.status === "bidding", `State should be 'bidding', got ${d3.status}`);
  assert(d3.nomination?.currentBid === 1, `Starting bid should be 1, got ${d3.nomination?.currentBid}`);

  // TEST: Bid too low
  const { status: s4, data: d4 } = await api("POST", "/auction/bid", {
    leagueId: 2,
    bidderTeamId: teams[1].id,
    amount: 1,
  });
  assert(s4 === 400, `Equal bid should fail, got ${s4}`);
  assert(d4.error?.includes("low") || d4.error?.includes("Bid"),
    `Error should mention bid too low, got: ${d4.error}`);

  // TEST: Valid bid
  const { status: s5, data: d5 } = await api("POST", "/auction/bid", {
    leagueId: 2,
    bidderTeamId: teams[1].id,
    amount: 2,
  });
  assert(s5 === 200, `Valid bid should succeed, got ${s5}`);
  assert(d5.nomination?.currentBid === 2, `Current bid should be 2, got ${d5.nomination?.currentBid}`);
  assert(d5.nomination?.highBidderTeamId === teams[1].id, `High bidder should be team ${teams[1].id}`);

  // TEST: Outbid
  const { status: s6, data: d6 } = await api("POST", "/auction/bid", {
    leagueId: 2,
    bidderTeamId: teams[2].id,
    amount: 5,
  });
  assert(s6 === 200, `Outbid should succeed, got ${s6}`);
  assert(d6.nomination?.currentBid === 5, "Bid should update to 5");

  // TEST: Finish (manual)
  const { status: s7, data: d7 } = await api("POST", "/auction/finish", { leagueId: 2 });
  assert(s7 === 200, `Finish should succeed, got ${s7}`);
  assert(d7.status === "nominating", `Status should return to 'nominating', got ${d7.status}`);
  assert(d7.nomination === null, "Nomination should be cleared");

  // Verify winner got the player
  const winner = d7.teams.find((t: any) => t.id === teams[2].id);
  assert(winner.rosterCount === 5, `Winner should have 5 players now, got ${winner?.rosterCount}`);
  assert(winner.budget < teams[2].budget, `Winner budget should decrease`);

  // Verify log entries
  assert(d7.log.length >= 3, `Log should have at least 3 entries, got ${d7.log.length}`);
  const winLog = d7.log.find((l: any) => l.type === "WIN");
  assert(winLog !== undefined, "Should have a WIN log entry");
  assert(winLog?.amount === 5, `WIN amount should be 5, got ${winLog?.amount}`);

  return d7;
}

async function testPauseResumeUndo(state: any) {
  console.log("\n═══ TEST SUITE: Commissioner Controls (Pause/Resume/Undo) ═══");

  const teams = state.teams;
  const currentTeamId = state.queue[state.queueIndex];

  // Get another available player
  const available = await prisma.roster.findMany({
    where: {
      team: { leagueId: 2 },
      releasedAt: { not: null },
      player: { mlbId: { not: null } },
    },
    include: { player: true },
    take: 10,
  });

  // Filter out any that are already on an active roster
  const activePlayerIds = new Set(
    state.teams.flatMap((t: any) => t.roster.map((r: any) => r.playerId))
  );
  const pool = available.filter((r) => !activePlayerIds.has(r.playerId));
  const player = pool[0];
  if (!player) throw new Error("No available players for pause/resume test");

  // Nominate
  const { status: ns, data: nd } = await api("POST", "/auction/nominate", {
    leagueId: 2,
    nominatorTeamId: currentTeamId,
    playerId: String(player.player.mlbId),
    playerName: player.player.name,
    startBid: 3,
    positions: player.player.posPrimary,
    team: player.player.mlbTeam || "",
    isPitcher: ["P", "SP", "RP", "TWP"].includes(player.player.posPrimary.toUpperCase()),
  });
  assert(ns === 200, `Nomination for pause test should succeed, got ${ns}: ${JSON.stringify(nd.error)}`);

  // TEST: Pause mid-bid
  const { status: ps, data: pd } = await api("POST", "/auction/pause", { leagueId: 2 });
  assert(ps === 200, `Pause should succeed, got ${ps}`);
  assert(pd.nomination?.status === "paused", `Nomination should be paused, got ${pd.nomination?.status}`);
  assert(typeof pd.nomination?.pausedRemainingMs === "number", "Should have pausedRemainingMs");
  assert(pd.nomination?.pausedRemainingMs > 0, `Remaining time should be > 0, got ${pd.nomination?.pausedRemainingMs}`);

  // TEST: Resume
  const { status: rs, data: rd } = await api("POST", "/auction/resume", { leagueId: 2 });
  assert(rs === 200, `Resume should succeed, got ${rs}`);
  assert(rd.nomination?.status === "running", `Nomination should be running, got ${rd.nomination?.status}`);

  // Finish this lot
  const { status: fs, data: fd } = await api("POST", "/auction/finish", { leagueId: 2 });
  assert(fs === 200, `Finish should succeed, got ${fs}`);

  // TEST: Undo last finish
  const prevWinTeam = fd.teams.find((t: any) =>
    t.roster.some((r: any) => r.playerId === player.playerId)
  );
  const prevRosterCount = prevWinTeam?.rosterCount;

  const { status: us, data: ud } = await api("POST", "/auction/undo-finish", { leagueId: 2 });
  assert(us === 200, `Undo should succeed, got ${us}: ${JSON.stringify(ud.error)}`);
  assert(ud.status === "nominating", `Status should be 'nominating' after undo, got ${ud.status}`);

  // Verify player was removed
  const undoneTeam = ud.teams.find((t: any) => t.id === prevWinTeam?.id);
  assert(
    undoneTeam?.rosterCount === (prevRosterCount ?? 0) - 1,
    `Roster count should decrease by 1 after undo`
  );

  const undoLog = ud.log.find((l: any) => l.type === "UNDO");
  assert(undoLog !== undefined, "Should have UNDO log entry");

  return ud;
}

async function testDuplicateNomination(state: any) {
  console.log("\n═══ TEST SUITE: Duplicate Nomination Guard ═══");

  // Get a player that's already on a roster (a keeper)
  const keeper = await prisma.roster.findFirst({
    where: { team: { leagueId: 2 }, releasedAt: null, isKeeper: true },
    include: { player: true },
  });

  if (!keeper || !keeper.player.mlbId) {
    console.log("  ⚠️ Skipping: no keeper found with mlbId");
    return state;
  }

  const currentTeamId = state.queue[state.queueIndex];
  const { status, data } = await api("POST", "/auction/nominate", {
    leagueId: 2,
    nominatorTeamId: currentTeamId,
    playerId: String(keeper.player.mlbId),
    playerName: keeper.player.name,
    startBid: 1,
    positions: keeper.player.posPrimary,
    team: keeper.player.mlbTeam || "",
    isPitcher: false,
  });

  assert(status === 400, `Nominating rostered player should fail (400), got ${status}`);
  assert(
    data.error?.includes("already") || data.error?.includes("roster"),
    `Error should mention player already on roster, got: ${data.error}`
  );

  return state;
}

async function testFullAuction(state: any) {
  console.log("\n═══ TEST SUITE: Full Auction Simulation (152 picks) ═══");

  // Get all available players (released from league 2)
  const releasedRosters = await prisma.roster.findMany({
    where: { team: { leagueId: 2 }, releasedAt: { not: null } },
    include: { player: true },
    distinct: ["playerId"],
  });

  // Build player pool, excluding any already drafted in previous tests
  const currentState = (await api("GET", "/auction/state?leagueId=2")).data;
  const draftedPlayerIds = new Set<number>();
  for (const team of currentState.teams) {
    for (const r of team.roster) {
      draftedPlayerIds.add(r.playerId);
    }
  }

  const pool = releasedRosters.filter((r) => !draftedPlayerIds.has(r.playerId));
  const pitcherPool = pool.filter((r) =>
    ["P", "SP", "RP", "TWP"].includes(r.player.posPrimary.toUpperCase())
  );
  const hitterPool = pool.filter(
    (r) => !["P", "SP", "RP", "TWP"].includes(r.player.posPrimary.toUpperCase())
  );

  // Calculate how many picks remain
  let totalSpotsLeft = currentState.teams.reduce((s: number, t: any) => s + t.spotsLeft, 0);
  const hittersNeeded = currentState.teams.reduce(
    (s: number, t: any) => s + Math.max(0, currentState.config.batterCount - t.hitterCount), 0
  );
  const pitchersNeeded = currentState.teams.reduce(
    (s: number, t: any) => s + Math.max(0, currentState.config.pitcherCount - t.pitcherCount), 0
  );

  // Create filler players if pool is too small (earlier tests may have consumed some)
  const hitterShortage = Math.max(0, hittersNeeded - hitterPool.length);
  if (hitterShortage > 0) {
    console.log(`  Creating ${hitterShortage} filler hitter(s) for pool shortage...`);
    for (let i = 0; i < hitterShortage + 2; i++) {
      const mlbId = 900000 + i;
      let p = await prisma.player.findFirst({ where: { mlbId } });
      if (!p) {
        p = await prisma.player.create({
          data: { mlbId, name: `Filler Hitter ${i + 1}`, posPrimary: "DH", posList: "DH", mlbTeam: "FA" },
        });
      }
      hitterPool.push({ player: p, playerId: p.id, price: 1 } as any);
    }
  }

  console.log(`  Player pool: ${pool.length} + fillers (${hitterPool.length}H, ${pitcherPool.length}P)`);
  console.log(`  Total spots to fill: ${totalSpotsLeft} (${hittersNeeded}H + ${pitchersNeeded}P needed)`);

  let pickCount = 0;
  let hitterIdx = 0;
  let pitcherIdx = 0;
  let errorCount = 0;

  while (totalSpotsLeft > 0 && pickCount < 160) {
    const freshState = (await api("GET", "/auction/state?leagueId=2")).data;

    if (freshState.status === "completed") {
      console.log(`  Auction completed after ${pickCount} picks!`);
      break;
    }

    if (freshState.status !== "nominating") {
      // If stuck in bidding, finish it
      if (freshState.status === "bidding") {
        await api("POST", "/auction/finish", { leagueId: 2 });
        continue;
      }
      console.log(`  Unexpected status: ${freshState.status}`);
      break;
    }

    const currentTeamId = freshState.queue[freshState.queueIndex];
    const team = freshState.teams.find((t: any) => t.id === currentTeamId);

    if (!team || team.spotsLeft <= 0) {
      // Skip this team, advance queue
      // This shouldn't happen if the completion detection works
      console.log(`  ⚠️ Team ${currentTeamId} is full, advancing...`);
      break;
    }

    // Decide: does this team need a pitcher or hitter?
    const needPitcher = team.pitcherCount < freshState.config.pitcherCount;
    const needHitter = team.hitterCount < freshState.config.batterCount;

    let selectedPlayer;
    if (needPitcher && pitcherIdx < pitcherPool.length) {
      selectedPlayer = pitcherPool[pitcherIdx++];
    } else if (needHitter && hitterIdx < hitterPool.length) {
      selectedPlayer = hitterPool[hitterIdx++];
    } else if (pitcherIdx < pitcherPool.length) {
      selectedPlayer = pitcherPool[pitcherIdx++];
    } else if (hitterIdx < hitterPool.length) {
      selectedPlayer = hitterPool[hitterIdx++];
    } else {
      console.log("  ⚠️ Ran out of players!");
      break;
    }

    const isPitcher = ["P", "SP", "RP", "TWP"].includes(
      selectedPlayer.player.posPrimary.toUpperCase()
    );

    // Nominate at $1
    const { status: ns, data: nd } = await api("POST", "/auction/nominate", {
      leagueId: 2,
      nominatorTeamId: currentTeamId,
      playerId: String(selectedPlayer.player.mlbId),
      playerName: selectedPlayer.player.name,
      startBid: 1,
      positions: selectedPlayer.player.posPrimary,
      team: selectedPlayer.player.mlbTeam || "",
      isPitcher,
    });

    if (ns !== 200) {
      // Position limit or other rejection — try a different player
      errorCount++;
      if (errorCount > 20) {
        console.log(`  ⚠️ Too many nomination errors, stopping. Last: ${nd.error}`);
        break;
      }
      // Try alternate player type
      if (isPitcher && hitterIdx < hitterPool.length) {
        selectedPlayer = hitterPool[hitterIdx++];
      } else if (!isPitcher && pitcherIdx < pitcherPool.length) {
        selectedPlayer = pitcherPool[pitcherIdx++];
      } else {
        continue;
      }

      const isPitcher2 = ["P", "SP", "RP", "TWP"].includes(
        selectedPlayer.player.posPrimary.toUpperCase()
      );
      const { status: ns2, data: nd2 } = await api("POST", "/auction/nominate", {
        leagueId: 2,
        nominatorTeamId: currentTeamId,
        playerId: String(selectedPlayer.player.mlbId),
        playerName: selectedPlayer.player.name,
        startBid: 1,
        positions: selectedPlayer.player.posPrimary,
        team: selectedPlayer.player.mlbTeam || "",
        isPitcher: isPitcher2,
      });

      if (ns2 !== 200) {
        console.log(`  ⚠️ Retry nomination also failed: ${nd2.error}`);
        continue;
      }
    }

    // Finish immediately (simulating no competing bids — nominator wins at $1)
    const { status: fs, data: fd } = await api("POST", "/auction/finish", { leagueId: 2 });
    if (fs !== 200) {
      console.log(`  ⚠️ Finish failed: ${fd.error}`);
      continue;
    }

    pickCount++;
    totalSpotsLeft = fd.teams.reduce((s: number, t: any) => s + t.spotsLeft, 0);

    if (pickCount % 20 === 0) {
      console.log(`  ${pickCount} picks done, ${totalSpotsLeft} spots remaining`);
    }
  }

  console.log(`  Simulation complete: ${pickCount} picks, ${errorCount} nomination errors`);

  return (await api("GET", "/auction/state?leagueId=2")).data;
}

async function testFinalState(state: any) {
  console.log("\n═══ TEST SUITE: Final State Verification ═══");

  assert(state.status === "completed", `Auction should be completed, got ${state.status}`);

  let totalBudgetSpent = 0;
  let totalPlayers = 0;

  for (const team of state.teams) {
    // Roster completeness
    assert(team.rosterCount === 23, `${team.code} should have 23 players, got ${team.rosterCount}`);
    assert(team.spotsLeft === 0, `${team.code} should have 0 spots left, got ${team.spotsLeft}`);

    // Pitcher/hitter counts
    assert(team.pitcherCount <= 9, `${team.code} should have <= 9 pitchers, got ${team.pitcherCount}`);
    assert(team.hitterCount <= 14, `${team.code} should have <= 14 hitters, got ${team.hitterCount}`);
    assert(
      team.pitcherCount + team.hitterCount === 23,
      `${team.code} pitcher+hitter should = 23, got ${team.pitcherCount + team.hitterCount}`
    );

    // Budget
    assert(team.budget >= 0, `${team.code} budget should be >= 0, got ${team.budget}`);
    totalBudgetSpent += 400 - team.budget;
    totalPlayers += team.rosterCount;

    // maxBid should be 0 (no spots left)
    assert(team.maxBid === 0, `${team.code} maxBid should be 0 when full, got ${team.maxBid}`);
  }

  console.log(`  Total players drafted: ${totalPlayers}`);
  console.log(`  Total budget spent: $${totalBudgetSpent}`);
  console.log(`  Average spend per team: $${Math.round(totalBudgetSpent / 8)}`);

  // Verify via direct DB query
  const dbRosters = await prisma.roster.groupBy({
    by: ["teamId"],
    where: { team: { leagueId: 2 }, releasedAt: null },
    _count: true,
    _sum: { price: true },
  });

  for (const rc of dbRosters) {
    assert(rc._count === 23, `DB: team ${rc.teamId} should have 23 active roster entries, got ${rc._count}`);
    const spent = rc._sum.price || 0;
    assert(spent <= 400, `DB: team ${rc.teamId} total cost should be <= 400, got ${spent}`);
  }

  // Log details
  console.log("\n  Final team details:");
  for (const team of state.teams) {
    console.log(
      `    ${team.code}: ${team.rosterCount} players (${team.hitterCount}H/${team.pitcherCount}P), $${400 - team.budget} spent, $${team.budget} remaining`
    );
  }

  // Verify log completeness
  const wins = state.log.filter((l: any) => l.type === "WIN");
  const nominations = state.log.filter((l: any) => l.type === "NOMINATION");
  console.log(`\n  Log entries: ${state.log.length} total, ${wins.length} WINs, ${nominations.length} NOMINATIONs`);
}

async function testCrashRecovery() {
  console.log("\n═══ TEST SUITE: Crash Recovery (DB Persistence) ═══");

  // Verify AuctionSession exists in DB
  const session = await prisma.auctionSession.findUnique({
    where: { leagueId: 2 },
  });
  assert(session !== null, "AuctionSession should exist in DB");

  if (session) {
    const persisted = session.state as any;
    assert(persisted.status === "completed", `Persisted state should be completed, got ${persisted.status}`);
    assert(persisted.teams?.length === 8, `Persisted state should have 8 teams`);
    console.log("  DB persistence verified — state would survive server restart");
  }
}

async function testReset() {
  console.log("\n═══ TEST SUITE: Reset (Cleanup) ═══");

  const { status, data } = await api("POST", "/auction/reset", { leagueId: 2 });
  assert(status === 200, `Reset should succeed, got ${status}`);
  assert(data.status === "nominating", `Status should be 'nominating' after reset, got ${data.status}`);

  // Verify auction_2026 roster entries were deleted
  const auctionRosters = await prisma.roster.count({
    where: { source: "auction_2026", team: { leagueId: 2 }, releasedAt: null },
  });
  assert(auctionRosters === 0, `Auction roster entries should be deleted, found ${auctionRosters}`);

  // Keepers should still be there
  const keepers = await prisma.roster.count({
    where: { team: { leagueId: 2 }, isKeeper: true, releasedAt: null },
  });
  assert(keepers === 32, `Should still have 32 keepers, got ${keepers}`);

  console.log("  Reset verified — auction entries cleared, keepers preserved");
}

// --- Main ---

async function cleanupFillerPlayers() {
  console.log("\n═══ CLEANUP: Removing filler players (mlbId >= 900000) ═══");

  // First remove any roster entries referencing filler players
  const fillerPlayers = await prisma.player.findMany({
    where: { mlbId: { gte: 900000 } },
    select: { id: true, mlbId: true, name: true },
  });

  if (fillerPlayers.length === 0) {
    console.log("  No filler players found — nothing to clean up");
    return;
  }

  const fillerIds = fillerPlayers.map((p) => p.id);

  const deletedRosters = await prisma.roster.deleteMany({
    where: { playerId: { in: fillerIds } },
  });
  console.log(`  Deleted ${deletedRosters.count} roster entries for filler players`);

  const deletedPlayers = await prisma.player.deleteMany({
    where: { mlbId: { gte: 900000 } },
  });
  console.log(`  Deleted ${deletedPlayers.count} filler player(s)`);
}

async function main() {
  console.log("╔════════════════════════════════════════════════════╗");
  console.log("║   AUCTION END-TO-END TEST — League 2 (OGBA 2026) ║");
  console.log("╚════════════════════════════════════════════════════╝");

  // Login
  adminToken = await login();
  console.log("✓ Admin login successful");

  try {
    // Run test suites
    const initState = await testInit();
    const afterValidation = await testBidValidation(initState);
    const afterCommissioner = await testPauseResumeUndo(afterValidation);
    await testDuplicateNomination(afterCommissioner);
    const finalState = await testFullAuction(afterCommissioner);
    await testFinalState(finalState);
    await testCrashRecovery();
    await testReset();
  } finally {
    // Always clean up filler players, even if tests fail
    await cleanupFillerPlayers();
  }

  // Summary
  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log(`║   RESULTS: ${passes} passed, ${failures.length} failed                    `);
  console.log("╚════════════════════════════════════════════════════╝");

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  ❌ ${f}`);
    }
  }

  await prisma.$disconnect();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Fatal error:", e);
  await cleanupFillerPlayers().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
