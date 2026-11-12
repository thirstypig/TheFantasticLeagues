/**
 * Regenerate the AI Draft Report for a league.
 * Usage: npx tsx src/scripts/regen-draft-report.ts [leagueId]
 */
import { prisma } from "../db/prisma.js";
import { lookupAuctionValue } from "../lib/auctionValues.js";
import { aiAnalysisService } from "../services/aiAnalysisService.js";
import { saleEntriesFromLog } from "../features/auction/lib/salesLog.js";

const leagueId = Number(process.argv[2]) || 20;

async function main() {
  console.log(`Regenerating draft report for league ${leagueId}...`);

  const session = await prisma.auctionSession.findUnique({ where: { leagueId } });
  if (!session) {
    console.error("No AuctionSession found for league", leagueId);
    process.exit(1);
  }

  const state = session.state as any;
  const config = state?.config ?? { budgetCap: 400, rosterSize: 23, pitcherCount: 9, batterCount: 14 };

  const teams = await prisma.team.findMany({
    where: { leagueId },
    include: {
      rosters: {
        where: { releasedAt: null },
        include: { player: { select: { name: true, posPrimary: true, posList: true, mlbTeam: true } } },
      },
    },
  });

  console.log(`Found ${teams.length} teams, ${teams.reduce((s, t) => s + t.rosters.length, 0)} total roster entries`);

  // Build auction log
  // Undone sales are excluded (saleEntriesFromLog).
  const logEntries = saleEntriesFromLog(state?.log);

  console.log(`Auction log: ${logEntries.length} WIN events`);

  const teamData = teams.map(team => {
    const keepers = team.rosters.filter(r => r.source === "prior_season");
    const auctionPicks = team.rosters.filter(r => r.source !== "prior_season");

    const mlbTeamCounts: Record<string, number> = {};
    team.rosters.forEach(r => {
      const tm = r.player.mlbTeam || "UNK";
      mlbTeamCounts[tm] = (mlbTeamCounts[tm] || 0) + 1;
    });
    const sortedMlbTeams = Object.entries(mlbTeamCounts).sort((a, b) => b[1] - a[1]);

    return {
      id: team.id,
      name: team.name,
      budget: team.budget,
      keeperSpend: keepers.reduce((s, r) => s + r.price, 0),
      auctionSpend: auctionPicks.reduce((s, r) => s + r.price, 0),
      favMlbTeam: sortedMlbTeams[0] ? { team: sortedMlbTeams[0][0], count: sortedMlbTeams[0][1] } : null,
      roster: team.rosters.map(r => ({
        rosterId: r.id,
        playerName: r.player.name,
        position: r.assignedPosition || r.player.posPrimary,
        posList: r.player.posList ?? r.player.posPrimary ?? "",
        mlbTeam: r.player.mlbTeam || "",
        price: r.price,
        isKeeper: r.source === "prior_season",
        projectedValue: lookupAuctionValue(r.player.name)?.value ?? null,
      })),
    };
  });

  console.log("Calling AI service...");
  const result = await aiAnalysisService.generateDraftReport(
    teamData,
    {
      budgetCap: config.budgetCap ?? 400,
      rosterSize: config.rosterSize ?? 23,
      pitcherCount: config.pitcherCount ?? 9,
      batterCount: config.batterCount ?? 14,
    },
    logEntries,
  );

  if (!result.success) {
    console.error("Draft report generation failed:", result.error);
    process.exit(1);
  }

  console.log("AI draft report generated successfully!");
  console.log(`Teams in report: ${result.report.teams?.length}`);
  console.log(`Generated at: ${result.report.generatedAt}`);

  // Persist
  const updatedState = { ...state, draftReport: result.report };
  await prisma.auctionSession.update({
    where: { leagueId },
    data: { state: updatedState },
  });

  console.log("Draft report persisted to AuctionSession.state.draftReport");

  // Print summary
  for (const t of result.report.teams ?? []) {
    console.log(`  ${t.teamName?.padEnd(25)} Grade: ${t.overallGrade}  — ${t.analysis?.substring(0, 80)}...`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
