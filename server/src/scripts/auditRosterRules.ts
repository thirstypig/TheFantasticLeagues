// server/src/scripts/auditRosterRules.ts
// Pre-ship audit for the roster-rules enforcement plan.
//
// Prints a markdown report of:
//   1. Teams off-cap in an IN_SEASON season (would be rejected in-season
//      once enforcement goes live)
//   2. Ghost-IL players (assignedPosition='IL' but MLB status is no longer
//      "Injured List …") — prevents the team from doing new stashes
//   3. Retroactive IL fee estimate per team under policy Q17=b + Q15=bundle +
//      R15 (Option B full retroactive) — how many $ each team will owe at
//      enforcement flip, based on Roster.acquiredAt stint windows and
//      currently-COMPLETED periods.
//
// Run: npx tsx server/src/scripts/auditRosterRules.ts [leagueId]
// If leagueId is omitted, runs against every league.
//
// Read-only: no writes to any table. Output to stdout so it can be piped or
// pasted into commissioner communication.

import { prisma } from "../db/prisma.js";
import { loadLeagueRosterCap } from "../lib/rosterGuard.js";
import { loadLeagueIlSlotCount, listGhostIlPlayersForTeam } from "../lib/ilSlotGuard.js";

type IlFeeRule = { il_slot_1_cost: number; il_slot_2_cost: number };

async function loadIlFeeRule(leagueId: number): Promise<IlFeeRule> {
  const rules = await prisma.leagueRule.findMany({
    where: { leagueId, category: "il", key: { in: ["il_slot_1_cost", "il_slot_2_cost"] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rules.map(r => [r.key, Number(r.value)]));
  return {
    il_slot_1_cost: byKey.get("il_slot_1_cost") ?? 10,
    il_slot_2_cost: byKey.get("il_slot_2_cost") ?? 15,
  };
}

function printHeader(title: string): void {
  console.log(`\n## ${title}\n`);
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function auditLeague(leagueId: number): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, name: true, season: true },
  });
  if (!league) {
    console.error(`League ${leagueId} not found`);
    return;
  }

  const season = await prisma.season.findFirst({
    where: { leagueId, year: league.season },
    select: { id: true, status: true },
  });

  const isInSeason = season?.status === "IN_SEASON";
  const cap = await loadLeagueRosterCap(prisma, leagueId);
  const ilSlotCount = await loadLeagueIlSlotCount(prisma, leagueId);
  const feeRule = await loadIlFeeRule(leagueId);

  console.log(`# Roster Rules Audit — ${league.name} (${league.season})\n`);
  console.log(`- **Season status:** ${season?.status ?? "unknown"}`);
  console.log(`- **Active roster cap:** ${cap}`);
  console.log(`- **IL slot count:** ${ilSlotCount}`);
  console.log(`- **IL fees:** $${feeRule.il_slot_1_cost} (rank 1) / $${feeRule.il_slot_2_cost} (rank 2) per period`);

  const teams = await prisma.team.findMany({
    where: { leagueId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  // ═══ 1. Roster cap violations ═══
  printHeader("1. Roster cap violations");
  if (!isInSeason) {
    console.log("_(season not IN_SEASON — strict cap check deferred)_");
  } else {
    const offCap: Array<{ teamId: number; name: string; activeCount: number; ilCount: number }> = [];
    for (const team of teams) {
      const activeCount = await prisma.roster.count({
        where: { teamId: team.id, releasedAt: null, assignedPosition: { not: "IL" } },
      });
      const ilCount = await prisma.roster.count({
        where: { teamId: team.id, releasedAt: null, assignedPosition: "IL" },
      });
      if (activeCount !== cap || ilCount > ilSlotCount) {
        offCap.push({ teamId: team.id, name: team.name, activeCount, ilCount });
      }
    }
    if (offCap.length === 0) {
      console.log("✅ All teams at exactly cap, within IL slot limit.");
    } else {
      console.log("| Team | Active | IL | Issue |");
      console.log("|------|--------|----|-------|");
      for (const t of offCap) {
        const issues: string[] = [];
        if (t.activeCount !== cap) issues.push(`active ${t.activeCount} ≠ cap ${cap}`);
        if (t.ilCount > ilSlotCount) issues.push(`IL ${t.ilCount} > cap ${ilSlotCount}`);
        console.log(`| ${t.name} | ${t.activeCount} | ${t.ilCount} | ${issues.join("; ")} |`);
      }
    }
  }

  // ═══ 2. Ghost-IL players ═══
  printHeader("2. Ghost-IL players (MLB active, stashed in IL slot)");
  let totalGhosts = 0;
  for (const team of teams) {
    try {
      const ghosts = await listGhostIlPlayersForTeam(prisma, team.id);
      if (ghosts.length === 0) continue;
      if (totalGhosts === 0) {
        console.log("| Team | Player | Current MLB Status |");
        console.log("|------|--------|--------------------|");
      }
      for (const g of ghosts) {
        console.log(`| ${team.name} | ${g.playerName} | ${g.currentMlbStatus} |`);
      }
      totalGhosts += ghosts.length;
    } catch (err) {
      console.log(`⚠️  ${team.name}: error fetching MLB status (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  if (totalGhosts === 0) console.log("✅ No ghost-IL players.");

  // ═══ 3. Retroactive IL fee estimate (Option B — full retroactive) ═══
  printHeader("3. Retroactive IL fee estimate (at enforcement flip)");
  console.log("Policy: full retroactive from Roster.acquiredAt. A synthesized");
  console.log("RosterSlotEvent(IL_STASH, effDate=acquiredAt) makes these stints");
  console.log("billable for every completed period they overlap.\n");

  const completedPeriods = await prisma.period.findMany({
    where: { leagueId, status: "completed" },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  console.log(`_Completed periods on file: ${completedPeriods.length}_\n`);

  if (completedPeriods.length === 0) {
    console.log("_No completed periods yet — no retroactive fees._");
    return;
  }

  let grandTotal = 0;
  const perTeamTotals: Array<{ teamName: string; total: number; details: string[] }> = [];

  for (const team of teams) {
    const ilRosters = await prisma.roster.findMany({
      where: { teamId: team.id, releasedAt: null, assignedPosition: "IL" },
      orderBy: { acquiredAt: "asc" }, // earliest = rank 1
      select: {
        id: true,
        acquiredAt: true,
        player: { select: { name: true } },
      },
    });
    if (ilRosters.length === 0) continue;

    const details: string[] = [];
    let teamTotal = 0;

    ilRosters.forEach((row, idx) => {
      const rank = idx + 1; // 1-based
      const rate = rank === 1 ? feeRule.il_slot_1_cost : feeRule.il_slot_2_cost;
      const overlapping = completedPeriods.filter(p =>
        p.startDate <= new Date() && p.endDate >= row.acquiredAt,
      );
      if (overlapping.length === 0) return;
      const subtotal = overlapping.length * rate;
      teamTotal += subtotal;
      details.push(
        `  - ${row.player.name} (IL since ${fmtDate(row.acquiredAt)}, rank ${rank}): ${overlapping.length} periods × $${rate} = **$${subtotal}**`,
      );
    });

    if (teamTotal > 0) {
      perTeamTotals.push({ teamName: team.name, total: teamTotal, details });
      grandTotal += teamTotal;
    }
  }

  if (perTeamTotals.length === 0) {
    console.log("✅ No retroactive fees pending (no current IL stashes overlap completed periods).");
  } else {
    perTeamTotals.sort((a, b) => b.total - a.total);
    for (const t of perTeamTotals) {
      console.log(`### ${t.teamName} — $${t.total}`);
      for (const line of t.details) console.log(line);
      console.log("");
    }
    console.log(`### League retroactive total: **$${grandTotal}**`);
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg) {
    const leagueId = Number(arg);
    if (!Number.isFinite(leagueId)) {
      console.error(`Usage: auditRosterRules.ts [leagueId]`);
      process.exit(1);
    }
    await auditLeague(leagueId);
  } else {
    const leagues = await prisma.league.findMany({
      orderBy: { id: "asc" },
      select: { id: true },
    });
    for (const l of leagues) {
      await auditLeague(l.id);
      console.log("\n---\n");
    }
  }
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
