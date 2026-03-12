import { prisma } from '../../../db/prisma.js';
import { getSeasonEnd } from './archiveImportService.js';

export class ArchiveExportService {
  /**
   * Migrate current live league/season to the historical archive.
   */
  async archiveLeague(leagueId: number): Promise<{ success: boolean; message: string; logs: string[] }> {
    const logs: string[] = [];
    const log = (msg: string) => { console.log(msg); logs.push(msg); };

    try {
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        include: { teams: { include: { rosters: { include: { player: true } } } } }
      });

      if (!league) throw new Error('League not found');

      const year = league.season;
      const seasonEndStr = getSeasonEnd(year);
      const seasonEndDate = new Date(seasonEndStr);
      const now = new Date();

      // Rule: Only allow archiving after the season has ended
      if (now < seasonEndDate) {
        throw new Error(`Season ${year} has not ended yet (Ends: ${seasonEndStr})`);
      }

      log(`Starting Archive Export for League: ${league.name} (${year})`);

      // 1. Create or get HistoricalSeason
      const historicalSeason = await prisma.historicalSeason.upsert({
        where: { year_leagueId: { year, leagueId } },
        update: {},
        create: { year, leagueId }
      });

      // 2. Clear existing archive for this year to ensure atomicity
      await prisma.historicalStanding.deleteMany({ where: { seasonId: historicalSeason.id } });
      await prisma.historicalPeriod.deleteMany({ where: { seasonId: historicalSeason.id } });

      // 3. Migrate Standings
      const teamStatsSeason = await prisma.teamStatsSeason.findMany({
        where: { teamId: { in: league.teams.map(t => t.id) } },
        include: { team: true }
      });

      // Sort by some heuristic or just migrate
      const sortedStats = [...teamStatsSeason].sort((a, b) => b.gamesPlayed - a.gamesPlayed); // Placeholder sorting

      for (let i = 0; i < sortedStats.length; i++) {
        const ts = sortedStats[i];
        await prisma.historicalStanding.create({
          data: {
            seasonId: historicalSeason.id,
            teamCode: ts.team.code || ts.team.name.substring(0, 3).toUpperCase(),
            teamName: ts.team.name,
            totalScore: 0, // In actual system, we'd compute Roto points here
            finalRank: i + 1,
            R_score: ts.R,
            HR_score: ts.HR,
            RBI_score: ts.RBI,
            SB_score: ts.SB,
            AVG_score: Math.round((ts.AVG || 0) * 1000), // Standardize to 3 decimals as integer representation
            W_score: ts.W,
            SV_score: ts.S,
            K_score: ts.K,
            ERA_score: ts.ERA,
            WHIP_score: ts.WHIP
          }
        });
      }
      log(`Migrated ${sortedStats.length} team standings.`);

      // 4. Migrate Periods
      const periods = await prisma.period.findMany({
        orderBy: { startDate: 'asc' }
      });

      for (let i = 0; i < periods.length; i++) {
        const p = periods[i];
        const histPeriod = await prisma.historicalPeriod.create({
          data: {
            seasonId: historicalSeason.id,
            periodNumber: i + 1,
            startDate: p.startDate,
            endDate: p.endDate
          }
        });

        log(`Migrated Period ${i + 1}: ${p.name}`);

        // 5. Migrate Player Stats for this period
        // For each team, find players who were on roster during this period
        for (const team of league.teams) {
          const playersOnTeam = team.rosters.filter(r => {
            // Simplistic: was active during this period
            return r.acquiredAt <= (p.endDate || now) && (!r.releasedAt || r.releasedAt >= p.startDate);
          });

          for (const rosterEntry of playersOnTeam) {
            // Note: In a production environment, we would fetch historical stats from MLB API here.
            // For this implementation, we migrate the roster record as a "HistoricalPlayerStat" entry.
            // The stats themselves will remain 0 until an "Auto-Match" or "Recalculate" is run.
            await prisma.historicalPlayerStat.create({
              data: {
                periodId: histPeriod.id,
                playerName: rosterEntry.player.name,
                mlbId: String(rosterEntry.player.mlbId || ''),
                teamCode: team.code || team.name.substring(0, 3).toUpperCase(),
                isPitcher: rosterEntry.player.posPrimary === 'P',
                position: rosterEntry.player.posPrimary,
                draftDollars: rosterEntry.price,
                isKeeper: rosterEntry.source === 'KEEPER'
              }
            });
          }
        }
      }

      log(`✅ Season ${year} Successfully Archived.`);
      return { success: true, message: `Successfully archived season ${year}`, logs };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "unknown error";
      log(`❌ Archiving Failed: ${errMsg}`);
      return { success: false, message: errMsg, logs };
    }
  }
}
