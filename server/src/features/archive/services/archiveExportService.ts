import { prisma } from '../../../db/prisma.js';
import { logger } from '../../../lib/logger.js';
import { getSeasonEnd } from './archiveImportService.js';

export class ArchiveExportService {
  /**
   * Migrate current live league/season to the historical archive.
   */
  async archiveLeague(leagueId: number): Promise<{ success: boolean; message: string; logs: string[] }> {
    const logs: string[] = [];
    const log = (msg: string) => { logger.info({}, msg); logs.push(msg); };

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

      // 3. Migrate Standings from TeamStatsPeriod aggregation
      const allPeriods = await prisma.period.findMany({
        where: { season: { leagueId } },
        select: { id: true },
      });

      const teamIds = league.teams.map(t => t.id);
      const teamMap = new Map(league.teams.map(t => [t.id, t]));

      if (allPeriods.length > 0) {
        const periodStatsList = await prisma.teamStatsPeriod.findMany({
          where: { periodId: { in: allPeriods.map(p => p.id) }, teamId: { in: teamIds } },
          select: { teamId: true, R: true, HR: true, RBI: true, SB: true, AVG: true, W: true, S: true, K: true, ERA: true, WHIP: true, gamesPlayed: true },
        });

        // Aggregate counting stats per team across all periods
        const aggMap = new Map<number, { R: number; HR: number; RBI: number; SB: number; W: number; S: number; K: number; AVG: number; ERA: number; WHIP: number; gamesPlayed: number; count: number }>();
        for (const stat of periodStatsList) {
          const agg = aggMap.get(stat.teamId) || { R: 0, HR: 0, RBI: 0, SB: 0, W: 0, S: 0, K: 0, AVG: 0, ERA: 0, WHIP: 0, gamesPlayed: 0, count: 0 };
          agg.R += stat.R; agg.HR += stat.HR; agg.RBI += stat.RBI; agg.SB += stat.SB;
          agg.W += stat.W; agg.S += stat.S; agg.K += stat.K; agg.gamesPlayed += stat.gamesPlayed;
          agg.AVG += stat.AVG; agg.ERA += stat.ERA; agg.WHIP += stat.WHIP; agg.count++;
          aggMap.set(stat.teamId, agg);
        }

        // Sort by total counting stats (descending) for rank
        const sortedTeams = [...aggMap.entries()].sort((a, b) => {
          const strengthA = a[1].R + a[1].HR + a[1].RBI + a[1].SB + a[1].W + a[1].S + a[1].K;
          const strengthB = b[1].R + b[1].HR + b[1].RBI + b[1].SB + b[1].W + b[1].S + b[1].K;
          return strengthB - strengthA;
        });

        for (let i = 0; i < sortedTeams.length; i++) {
          const [tId, agg] = sortedTeams[i];
          const team = teamMap.get(tId);
          if (!team) continue;
          const avgDivisor = agg.count || 1;
          await prisma.historicalStanding.create({
            data: {
              seasonId: historicalSeason.id,
              teamCode: team.code || team.name.substring(0, 3).toUpperCase(),
              teamName: team.name,
              totalScore: agg.R + agg.HR + agg.RBI + agg.SB + agg.W + agg.S + agg.K,
              finalRank: i + 1,
              R_score: agg.R, HR_score: agg.HR, RBI_score: agg.RBI, SB_score: agg.SB,
              AVG_score: Math.round((agg.AVG / avgDivisor) * 1000),
              W_score: agg.W, SV_score: agg.S, K_score: agg.K,
              ERA_score: agg.ERA / avgDivisor,
              WHIP_score: agg.WHIP / avgDivisor,
            }
          });
        }
        log(`Migrated ${sortedTeams.length} team standings from period stats.`);
      } else {
        log(`No periods found — skipped standings migration.`);
      }

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
