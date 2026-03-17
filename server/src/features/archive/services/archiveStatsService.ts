import { prisma } from '../../../db/prisma.js';
import { logger } from '../../../lib/logger.js';

/** Shape of a player returned from the MLB Stats API people/search endpoint. */
export interface MlbSearchPerson {
  id: number;
  fullName: string;
  firstName?: string;
  active?: boolean;
  primaryPosition?: { abbreviation?: string };
  currentTeam?: { name?: string };
}

/** Shape of the MLB Stats API search response. */
export interface MlbSearchResponse {
  people?: MlbSearchPerson[];
}

export class ArchiveStatsService {
  private OPENING_DAYS: Record<number, string> = {
    2008: '2008-03-25', 2009: '2009-04-05', 2010: '2010-04-04',
    2011: '2011-03-31', 2012: '2012-03-28', 2013: '2013-03-31',
    2014: '2014-03-22', 2015: '2015-04-05', 2016: '2016-04-03',
    2017: '2017-04-02', 2018: '2018-03-29', 2019: '2019-03-20',
    2020: '2020-07-23', 2021: '2021-04-01', 2022: '2022-04-07',
    2023: '2023-03-30', 2024: '2024-03-20', 2025: '2025-03-18',
    2026: '2026-03-25',
  };

  async lookupMlbId(name: string): Promise<string | null> {
    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}`);
      const data = await response.json() as any;
      return data.people?.[0]?.id?.toString() || null;
    } catch (e) {
      logger.error({ error: String(e), name }, "Error looking up MLB ID");
      return null;
    }
  }

  async syncRosterEntries(year: number) {
    const season = await prisma.historicalSeason.findFirst({ where: { year } });
    if (!season) return;

    const periods = await prisma.historicalPeriod.findMany({ where: { seasonId: season.id } });
    const rosterEntries = await prisma.rosterEntry.findMany({ where: { year } });

    logger.info({ count: rosterEntries.length, year }, "Syncing roster entries");

    for (const entry of rosterEntries) {
      let mlbId = await this.lookupMlbId(entry.playerName);
      
      for (const period of periods) {
        const existing = await prisma.historicalPlayerStat.findFirst({
          where: {
            periodId: period.id,
            teamCode: entry.teamCode,
            playerName: entry.playerName
          }
        });

        if (!existing) {
          await prisma.historicalPlayerStat.create({
            data: {
              periodId: period.id,
              teamCode: entry.teamCode,
              playerName: entry.playerName,
              position: entry.position,
              mlbTeam: entry.mlbTeam,
              isPitcher: ['P', 'SP', 'RP'].includes(entry.position),
              draftDollars: entry.acquisitionCost,
              mlbId: mlbId,
              fullName: entry.playerName
            }
          });
        } else if (mlbId && !existing.mlbId) {
          await prisma.historicalPlayerStat.update({
            where: { id: existing.id },
            data: { mlbId }
          });
        }
      }
    }
  }

  async recalculateYear(year: number, tab?: string, periodNumber?: number, fetchStats = true): Promise<{ updated: number }> {
    await this.syncRosterEntries(year);

    const openingDay = this.OPENING_DAYS[year] || `${year}-03-28`;
    
    // Load team abbreviations
    const teamsResponse = await fetch(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${year}`);
    const teamsData = await teamsResponse.json() as any;
    const teamAbbreviations = new Map<number, string>();
    for (const team of teamsData.teams || []) {
      teamAbbreviations.set(team.id, team.abbreviation);
    }

    let updated = 0;

    const getPlayerData = async (mlbId: string, start: string, end: string) => {
      try {
        const hydrate = `currentTeam${fetchStats ? `,stats(group=[hitting,pitching],type=[statsByDateRange],startDate=${start},endDate=${end})` : ''}`;
        const url = `https://statsapi.mlb.com/api/v1/people/${mlbId}?hydrate=${hydrate}&date=${start}`;
        const response = await fetch(url);
        const data = await response.json() as any;
        const person = data.people?.[0];
        
        const updateData: any = {};
        
        // 1. Team
        let mlbTeam = person?.currentTeam?.abbreviation;
        if (!mlbTeam && person?.currentTeam?.id) {
          mlbTeam = teamAbbreviations.get(person.currentTeam.id);
        }
        if (mlbTeam) updateData.mlbTeam = mlbTeam;

        // 2. Stats
        if (fetchStats && person?.stats) {
          for (const statGroup of person.stats) {
            const split = statGroup.group?.displayName?.toLowerCase();
            const group = statGroup.splits?.[0]?.stat;
            if (!group) continue;

            if (split === 'hitting') {
              updateData.AB = group.atBats || 0;
              updateData.H = group.hits || 0;
              updateData.R = group.runs || 0;
              updateData.HR = group.homeRuns || 0;
              updateData.RBI = group.rbi || 0;
              updateData.SB = group.stolenBases || 0;
              updateData.AVG = group.avg ? parseFloat(group.avg) : 0;
              updateData.GS = group.grandSlams || 0;
            } else if (split === 'pitching') {
              updateData.W = group.wins || 0;
              updateData.SV = group.saves || 0;
              updateData.K = group.strikeOuts || 0;
              updateData.IP = group.inningsPitched ? parseFloat(group.inningsPitched) : 0;
              updateData.ER = group.earnedRuns || 0;
              updateData.ERA = group.era ? parseFloat(group.era) : 0;
              updateData.WHIP = group.whip ? parseFloat(group.whip) : 0;
              updateData.SO = group.shutouts || 0;
            }
          }
        }
        
        return Object.keys(updateData).length > 0 ? updateData : null;
      } catch (err) {
        logger.error({ error: String(err), mlbId }, "Error fetching MLB data");
        return null;
      }
    };

    let targetPeriods: any[] = [];
    if (tab === 'draft') {
      const p1 = await prisma.historicalPeriod.findFirst({
        where: { season: { year }, periodNumber: 1 }
      });
      if (p1) targetPeriods = [p1];
    } else if (tab === 'stats' && periodNumber) {
      const p = await prisma.historicalPeriod.findFirst({
        where: { season: { year }, periodNumber }
      });
      if (p) targetPeriods = [p];
    } else {
      targetPeriods = await prisma.historicalPeriod.findMany({
        where: { season: { year } },
        orderBy: { periodNumber: 'asc' }
      });
    }

    for (const period of targetPeriods) {
      const start = period.startDate?.toISOString().split('T')[0] || openingDay;
      const end = period.endDate?.toISOString().split('T')[0] || start;
      const stats = await prisma.historicalPlayerStat.findMany({
        where: { periodId: period.id, mlbId: { not: null } },
        select: { id: true, mlbId: true }
      });

      for (const s of stats) {
        if (!s.mlbId) continue;
        const data = await getPlayerData(s.mlbId, start, end);
        if (data) {
          await prisma.historicalPlayerStat.update({
            where: { id: s.id },
            data
          });
          updated++;
        }
        await new Promise(r => setTimeout(r, 20));
      }
    }

    return { updated };
  }

  /**
   * Auto-match abbreviated player names (e.g. "A. Riley") to full MLB names
   * by searching the MLB Stats API and filtering by first initial + pitcher status.
   */
  async autoMatchPlayersForYear(year: number): Promise<{ matched: number; unmatched: number }> {
    const players = await prisma.historicalPlayerStat.findMany({
      where: {
        period: { season: { year } },
        OR: [{ mlbId: null }, { mlbId: '' }],
      },
      select: { id: true, playerName: true, position: true, isPitcher: true },
      distinct: ['playerName'],
    });

    const cache = new Map<string, MlbSearchPerson[]>();
    let matched = 0;
    let unmatched = 0;

    for (const player of players) {
      const match = player.playerName.match(/^([A-Za-z]+)\.?\s+(.+)$/);
      if (!match) { unmatched++; continue; }
      const firstInitial = match[1].charAt(0).toUpperCase();
      const lastName = match[2].trim();

      let candidates: MlbSearchPerson[] | undefined = cache.get(lastName);
      if (!candidates) {
        try {
          const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(lastName)}&sportIds=1&seasons=${year}`;
          const response = await fetch(url);
          const data = await response.json() as MlbSearchResponse;
          candidates = data.people || [];
          cache.set(lastName, candidates);
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch {
          candidates = [];
          cache.set(lastName, []);
        }
      }

      let matches = (candidates || []).filter(c => c.firstName?.charAt(0).toUpperCase() === firstInitial);

      if (matches.length > 1 && player.isPitcher !== null) {
        const pitcherCodes = ['P', 'SP', 'RP', 'TWP'];
        const pitcherMatches = matches.filter(c => {
          const isPitcher = pitcherCodes.includes(c.primaryPosition?.abbreviation?.toUpperCase() || '');
          return isPitcher === player.isPitcher;
        });
        if (pitcherMatches.length > 0) matches = pitcherMatches;
      }

      if (matches.length === 1) {
        const m = matches[0];
        await prisma.historicalPlayerStat.updateMany({
          where: { playerName: player.playerName, period: { season: { year } } },
          data: { fullName: m.fullName, mlbId: String(m.id) },
        });
        matched++;
        logger.info({ playerName: player.playerName, fullName: m.fullName, mlbId: m.id }, "Auto-matched player");
      } else {
        unmatched++;
      }

      // Fix isPitcher for players with pitcher stats
      await prisma.historicalPlayerStat.updateMany({
        where: {
          playerName: player.playerName,
          period: { season: { year } },
          isPitcher: false,
          OR: [
            { W: { gt: 0 } }, { SV: { gt: 0 } }, { IP: { gt: 0 } },
            { position: { in: ['P', 'SP', 'RP', 'PITCHER', 'STAFF'] } },
          ],
        },
        data: { isPitcher: true },
      });
    }

    return { matched, unmatched };
  }

  /**
   * Calculate cumulative standings across all periods for a year.
   * Stats accumulate period-over-period, with roto scoring at each snapshot.
   */
  async calculateCumulativePeriodResults(year: number) {
    const season = await prisma.historicalSeason.findFirst({
      where: { year },
      include: {
        periods: { include: { stats: true }, orderBy: { periodNumber: 'asc' } },
      },
    });

    if (!season) return null;

    const results: { periodNumber: number; standings: { teamCode: string; totalScore: number }[] }[] = [];
    const teamStats: Record<string, {
      R: number; HR: number; RBI: number; SB: number;
      W: number; SV: number; K: number;
      total_ab: number; total_h: number; total_er: number; total_ip: number; total_whip_comp: number;
    }> = {};

    for (const period of season.periods) {
      for (const stat of period.stats) {
        if (!teamStats[stat.teamCode]) {
          teamStats[stat.teamCode] = {
            R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0,
            total_ab: 0, total_h: 0, total_er: 0, total_ip: 0, total_whip_comp: 0,
          };
        }
        const ts = teamStats[stat.teamCode];
        ts.R += stat.R || 0; ts.HR += stat.HR || 0; ts.RBI += stat.RBI || 0; ts.SB += stat.SB || 0;
        ts.total_ab += stat.AB || 0; ts.total_h += stat.H || 0;
        ts.W += stat.W || 0; ts.SV += stat.SV || 0; ts.K += stat.K || 0;
        ts.total_ip += stat.IP || 0; ts.total_er += stat.ER || 0;
        ts.total_whip_comp += (stat.WHIP || 0) * (stat.IP || 0);
      }

      const teams = Object.keys(teamStats).map(code => {
        const ts = teamStats[code];
        return {
          teamCode: code,
          R: ts.R, HR: ts.HR, RBI: ts.RBI, SB: ts.SB,
          AVG: ts.total_ab > 0 ? ts.total_h / ts.total_ab : 0,
          W: ts.W, SV: ts.SV, K: ts.K,
          ERA: ts.total_ip > 0 ? (ts.total_er * 9) / ts.total_ip : 0,
          WHIP: ts.total_ip > 0 ? ts.total_whip_comp / ts.total_ip : 0,
        };
      });

      const categories = ['R', 'HR', 'RBI', 'SB', 'AVG', 'W', 'SV', 'K', 'ERA', 'WHIP'];
      const teamScores: Record<string, number> = {};
      teams.forEach(t => (teamScores[t.teamCode] = 0));

      categories.forEach(cat => {
        const sorted = [...teams].sort((a, b) => {
          const valA = a[cat as keyof typeof a] as number;
          const valB = b[cat as keyof typeof b] as number;
          return cat === 'ERA' || cat === 'WHIP' ? valA - valB : valB - valA;
        });
        sorted.forEach((t, i) => { teamScores[t.teamCode] += teams.length - i; });
      });

      results.push({
        periodNumber: period.periodNumber,
        standings: teams.length > 0
          ? teams.map(t => ({ teamCode: t.teamCode, totalScore: teamScores[t.teamCode] }))
              .sort((a, b) => b.totalScore - a.totalScore)
          : [],
      });
    }

    return { year, results };
  }

  /*
   * aggregated 'standings' for a single period
   * (R, HR, RBI, SB, AVG) + (W, SV, K, ERA, WHIP)
   * Roto scoring 1..N
   */
  async calculatePeriodStandings(year: number, periodNumber: number) {
    const period = await prisma.historicalPeriod.findFirst({
        where: { season: { year }, periodNumber },
        include: { stats: true }
    });

    if (!period) throw new Error(`Period ${periodNumber} not found for ${year}`);

    // Aggregate stats by team
    const teamStats: Record<string, {
        teamCode: string;
        R: number; HR: number; RBI: number; SB: number;
        total_h: number; total_ab: number;
        W: number; SV: number; K: number;
        total_er: number; total_ip: number; total_whip_comp: number;
    }> = {};

    for (const stat of period.stats) {
        if (!teamStats[stat.teamCode]) {
            teamStats[stat.teamCode] = {
                teamCode: stat.teamCode,
                R: 0, HR: 0, RBI: 0, SB: 0, total_h: 0, total_ab: 0,
                W: 0, SV: 0, K: 0, total_er: 0, total_ip: 0, total_whip_comp: 0
            };
        }
        const t = teamStats[stat.teamCode];
        
        // Hitting
        t.R += (stat.R || 0);
        t.HR += (stat.HR || 0);
        t.RBI += (stat.RBI || 0);
        t.SB += (stat.SB || 0);
        t.total_h += (stat.H || 0);
        t.total_ab += (stat.AB || 0);
        
        // Pitching
        t.W += (stat.W || 0);
        t.SV += (stat.SV || 0);
        t.K += (stat.K || 0);
        t.total_er += (stat.ER || 0);
        t.total_ip += (stat.IP || 0);
        t.total_whip_comp += ((stat.WHIP || 0) * (stat.IP || 0));
    }

    const teams = Object.values(teamStats).map(t => ({
        teamCode: t.teamCode,
        R: t.R,
        HR: t.HR,
        RBI: t.RBI,
        SB: t.SB,
        AVG: t.total_ab > 0 ? t.total_h / t.total_ab : 0,
        W: t.W,
        SV: t.SV,
        K: t.K,
        ERA: t.total_ip > 0 ? (t.total_er * 9) / t.total_ip : 0,
        WHIP: t.total_ip > 0 ? t.total_whip_comp / t.total_ip : 0
    }));

    // Calculate Roto Scores (1 to N points)
    const points: Record<string, number> = {};
    teams.forEach(t => points[t.teamCode] = 0);

    const categories = ['R', 'HR', 'RBI', 'SB', 'AVG', 'W', 'SV', 'K', 'ERA', 'WHIP'];
    
    categories.forEach(cat => {
        // Sort teams for this category
        const sorted = [...teams].sort((a: any, b: any) => {
            if (cat === 'ERA' || cat === 'WHIP') {
                // ASC is better
                if (a[cat] === b[cat]) return 0;
                return a[cat] - b[cat];
            } else {
                // DESC is better
                if (a[cat] === b[cat]) return 0;
                return b[cat] - a[cat];
            }
        });

        // Assign points (simple 1..N rank)
        sorted.forEach((t: any, i) => {
             points[t.teamCode] += (teams.length - i);
        });
    });

    // Format output
    return teams.map(t => ({
        ...t,
        stats: { R: t.R, HR: t.HR, RBI: t.RBI, SB: t.SB, AVG: t.AVG, W: t.W, SV: t.SV, K: t.K, ERA: t.ERA, WHIP: t.WHIP },
        totalScore: points[t.teamCode]
    })).sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Calculate standings for ALL periods of a season in a single call.
   * Returns a matrix: { year, periods: [{ periodNumber, standings }] }
   * This avoids the client making N separate requests.
   */
  async calculateAllPeriodStandings(year: number) {
    const season = await prisma.historicalSeason.findFirst({
      where: { year },
      include: {
        periods: { include: { stats: true }, orderBy: { periodNumber: 'asc' } },
      },
    });

    if (!season) return null;

    const periodsResult: {
      periodNumber: number;
      standings: { teamCode: string; totalScore: number; stats: Record<string, number>; [key: string]: unknown }[];
    }[] = [];

    for (const period of season.periods) {
      const standings = this.computeStandingsFromStats(period.stats);
      periodsResult.push({ periodNumber: period.periodNumber, standings });
    }

    return { year, periods: periodsResult };
  }

  /**
   * Compute roto standings from a list of player stats (shared logic).
   */
  private computeStandingsFromStats(stats: { teamCode: string; R: number | null; HR: number | null; RBI: number | null; SB: number | null; H: number | null; AB: number | null; W: number | null; SV: number | null; K: number | null; ER: number | null; IP: number | null; WHIP: number | null; AVG: number | null; ERA: number | null; isPitcher: boolean }[]) {
    const teamStats: Record<string, {
      teamCode: string;
      R: number; HR: number; RBI: number; SB: number;
      total_h: number; total_ab: number;
      W: number; SV: number; K: number;
      total_er: number; total_ip: number; total_whip_comp: number;
    }> = {};

    for (const stat of stats) {
      if (!teamStats[stat.teamCode]) {
        teamStats[stat.teamCode] = {
          teamCode: stat.teamCode,
          R: 0, HR: 0, RBI: 0, SB: 0, total_h: 0, total_ab: 0,
          W: 0, SV: 0, K: 0, total_er: 0, total_ip: 0, total_whip_comp: 0
        };
      }
      const t = teamStats[stat.teamCode];
      t.R += (stat.R || 0);
      t.HR += (stat.HR || 0);
      t.RBI += (stat.RBI || 0);
      t.SB += (stat.SB || 0);
      t.total_h += (stat.H || 0);
      t.total_ab += (stat.AB || 0);
      t.W += (stat.W || 0);
      t.SV += (stat.SV || 0);
      t.K += (stat.K || 0);
      t.total_er += (stat.ER || 0);
      t.total_ip += (stat.IP || 0);
      t.total_whip_comp += ((stat.WHIP || 0) * (stat.IP || 0));
    }

    const teams = Object.values(teamStats).map(t => ({
      teamCode: t.teamCode,
      R: t.R, HR: t.HR, RBI: t.RBI, SB: t.SB,
      AVG: t.total_ab > 0 ? t.total_h / t.total_ab : 0,
      W: t.W, SV: t.SV, K: t.K,
      ERA: t.total_ip > 0 ? (t.total_er * 9) / t.total_ip : 0,
      WHIP: t.total_ip > 0 ? t.total_whip_comp / t.total_ip : 0,
    }));

    const points: Record<string, number> = {};
    teams.forEach(t => points[t.teamCode] = 0);

    const categories = ['R', 'HR', 'RBI', 'SB', 'AVG', 'W', 'SV', 'K', 'ERA', 'WHIP'];
    categories.forEach(cat => {
      const sorted = [...teams].sort((a: any, b: any) => {
        if (cat === 'ERA' || cat === 'WHIP') return a[cat] - b[cat];
        return b[cat] - a[cat];
      });
      sorted.forEach((t: any, i) => { points[t.teamCode] += (teams.length - i); });
    });

    return teams.map(t => ({
      ...t,
      stats: { R: t.R, HR: t.HR, RBI: t.RBI, SB: t.SB, AVG: t.AVG, W: t.W, SV: t.SV, K: t.K, ERA: t.ERA, WHIP: t.WHIP },
      totalScore: points[t.teamCode]
    })).sort((a, b) => b.totalScore - a.totalScore);
  }
}
