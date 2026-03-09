
import fs from 'fs';
import path from 'path';
import { prisma } from '../../../db/prisma.js';
import { parseCsv, norm, toNum, toBool } from '../../../lib/utils.js';
import { logger } from '../../../lib/logger.js';
import { chunk } from '../../../lib/utils.js';
import { normCode } from "../../../lib/utils.js";
import { SeasonStatRow, PeriodStatRow } from '../../../types/stats.js';
import { warmMlbTeamCache } from '../../../lib/mlbApi.js';

/** A parsed CSV row used for auction values, keyed by column header. */
type AuctionValueRow = Record<string, string> & {
  mlbTeam?: string;
  mlb_team?: string;
  team?: string;
  ogba_team_code?: string;
};

/** Shape returned by getNormalizedSeasonStats after normalization. */
export interface NormalizedSeasonStat {
  mlb_id: string;
  player_name: string;
  mlb_full_name: string;
  ogba_team_code: string;
  positions: string;
  is_pitcher: boolean;
  AB: number;
  H: number;
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AVG: number;
  GS: number;
  W: number;
  SV: number;
  K: number;
  ERA: number;
  WHIP: number;
  SO: number;
  mlb_team: string;
  mlbTeam: string;
  fantasy_value?: number;
  [key: string]: unknown;
}

/** Shape returned by getNormalizedPeriodStats after normalization. */
export interface NormalizedPeriodStat {
  periodId: number;
  mlbId: string;
  AB: number;
  H: number;
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AVG: number;
  W: number;
  SV: number;
  K: number;
  ERA: number;
  WHIP: number;
  GS: number;
  [key: string]: unknown;
}

/** Shape of the season standings JSON file. */
interface SeasonStandingsData {
  rows?: unknown[];
  [key: string]: unknown;
}

export class DataService {
  private static instance: DataService;
  private auctionValues: AuctionValueRow[] = [];
  private seasonStats: SeasonStatRow[] = [];
  private seasonStandings: SeasonStandingsData | null = null;
  private periodStats: PeriodStatRow[] = [];

  // Cache normalized stats to avoid re-calculation
  private normalizedSeasonStats: NormalizedSeasonStat[] | null = null;
  private normalizedPeriodStats: NormalizedPeriodStat[] | null = null;

  // Cache standings computations (static between data reloads)
  private standingsCache = new Map<string, unknown>();

  private constructor() {}

  public static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  public resolveDataFile(filename: string): string {
    const p1 = path.join(process.cwd(), "src", "data", filename);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(process.cwd(), "data", filename);
    if (fs.existsSync(p2)) return p2;
    return p1;
  }

  public async loadAllData(seasonFile: string) {
    try {
      // 1. Auction Values
      const auctionPath = this.resolveDataFile("ogba_auction_values_2025.csv");
      if (fs.existsSync(auctionPath)) {
        this.auctionValues = parseCsv(fs.readFileSync(auctionPath, "utf-8")) as AuctionValueRow[];
        
        // Merge with DB Player Data (for MLB Team)
        try {
            const dbPlayers = await prisma.player.findMany({
                where: { mlbId: { not: null } },
                select: { mlbId: true, mlbTeam: true }
            });
            const teamMap = new Map<string, string>();
            for (const p of dbPlayers) {
                if (p.mlbId && p.mlbTeam) {
                    teamMap.set(String(p.mlbId), p.mlbTeam);
                }
            }
            
            this.auctionValues.forEach((av) => {
                const pid = String(av.mlb_id ?? av.mlbId ?? "");
                if (teamMap.has(pid)) {
                    const tm = teamMap.get(pid) || "";
                    av.mlbTeam = tm;
                    av.mlb_team = tm;
                }
            });
            logger.info({ count: this.auctionValues.length, merged: dbPlayers.length }, 'Loaded auction values with DB merge');
        } catch (dbErr) {
             logger.warn({ error: String(dbErr) }, 'Failed to merge DB players into auction values');
        }
      }

      // 1.5 Fetch DB Rosters (Fantasy Teams & Prices)
      let rosterMap = new Map<string, { teamCode: string, price: number }>();
      try {
          const rosters = await prisma.roster.findMany({
              where: { 
                  team: { leagueId: 1 }, 
                  releasedAt: null 
              },
              include: { team: true, player: true }
          });
          
          for (const r of rosters) {
              if (r.player?.mlbId) {
                  rosterMap.set(String(r.player.mlbId), { 
                      teamCode: r.team.code ?? "",
                      price: Number(r.price) 
                  });
              }
          }
          logger.info({ count: rosters.length }, 'Loaded DB Rosters for merge');
      } catch (e) {
          logger.warn({ error: String(e) }, 'Failed to load DB rosters');
      }

      // 2. Season Stats
      const seasonPath = this.resolveDataFile(seasonFile);
      if (fs.existsSync(seasonPath)) {
        this.seasonStats = parseCsv(fs.readFileSync(seasonPath, "utf-8")) as unknown as SeasonStatRow[];
        
        // Merge DB Roster Info (Fantasy Team + Price)
        this.seasonStats.forEach(p => {
            const mlb = String(p.mlb_id ?? p.mlbId ?? "");
            if (rosterMap.has(mlb)) {
                const r = rosterMap.get(mlb)!;
                p.ogba_team_code = r.teamCode;
                p.team = r.teamCode; 
                p.fantasy_value = r.price; 
                
                // Also update auctionValues cache for consistency
                const av = this.auctionValues.find(a => String(a.mlb_id) === mlb);
                if (av) {
                    av.team = r.teamCode;
                    av.ogba_team_code = r.teamCode;
                }
            }
        });

        logger.info({ count: this.seasonStats.length, file: seasonFile }, 'Loaded season stat rows');
      }

      // 3. Standings
      const standingsPath = this.resolveDataFile("ogba_season_standings_2025.json");
      if (fs.existsSync(standingsPath)) {
        this.seasonStandings = JSON.parse(fs.readFileSync(standingsPath, "utf-8")) as SeasonStandingsData;
        logger.info({ count: this.seasonStandings?.rows?.length || this.seasonStandings?.length }, 'Loaded season standings');
      }

      // 4. Period Stats
      const periodPath = this.resolveDataFile("ogba_player_period_totals_2025.csv");
      if (fs.existsSync(periodPath)) {
        this.periodStats = parseCsv(fs.readFileSync(periodPath, "utf-8")) as unknown as PeriodStatRow[];
        logger.info({ count: this.periodStats.length }, 'Loaded period stat rows');
      }
      
      // Clear cache on reload
      this.normalizedSeasonStats = null;
      this.normalizedPeriodStats = null;
      this.standingsCache.clear();

    } catch (err) {
      logger.error({ error: String(err) }, 'Failed to load initial data');
    }
  }

  public async getNormalizedSeasonStats() {
    if (this.normalizedSeasonStats) return this.normalizedSeasonStats;

    const seasonStatsRaw = this.seasonStats;
    const mlbIds = seasonStatsRaw.map((r) => String(r.mlb_id ?? r.mlbId ?? "").trim()).filter(Boolean);
    const teamCache = await warmMlbTeamCache(mlbIds);

    this.normalizedSeasonStats = seasonStatsRaw.map((r) => {
      const mlb_id = String(r.mlb_id ?? r.mlbId ?? "").trim();
      const tm = String(r.mlb_team ?? r.mlbTeam ?? teamCache[mlb_id] ?? "").trim();

      return {
        ...r,
        mlb_id,
        player_name: r.player_name ?? r.name ?? r.playerName ?? "",
        mlb_full_name: r.mlb_full_name ?? "",
        ogba_team_code: r.ogba_team_code ?? r.team ?? "",
        positions: r.positions ?? r.pos ?? "",
        is_pitcher: toBool(r.is_pitcher ?? r.isPitcher),
        AB: toNum(r.AB),
        H: toNum(r.H),
        R: toNum(r.R),
        HR: toNum(r.HR),
        RBI: toNum(r.RBI),
        SB: toNum(r.SB),
        AVG: toNum(r.AVG),
        GS: toNum(r.GS),
        W: toNum(r.W),
        SV: toNum(r.SV),
        K: toNum(r.K),
        ERA: toNum(r.ERA),
        WHIP: toNum(r.WHIP),
        SO: toNum(r.SO ?? r.shutouts),
        mlb_team: tm,
        mlbTeam: tm,
      };
    });

    return this.normalizedSeasonStats;
  }

  public getNormalizedPeriodStats() {
      if (this.normalizedPeriodStats) return this.normalizedPeriodStats;

      const periodStatsRaw = this.periodStats;
      this.normalizedPeriodStats = periodStatsRaw.map((r) => ({
          ...r,
          periodId: toNum(r.period_id ?? r.periodId),
          mlbId: String(r.mlb_id ?? r.mlbId ?? "").trim(),
          AB: toNum(r.AB),
          H: toNum(r.H),
          R: toNum(r.R),
          HR: toNum(r.HR),
          RBI: toNum(r.RBI),
          SB: toNum(r.SB),
          AVG: toNum(r.AVG),
          W: toNum(r.W),
          SV: toNum(r.SV),
          K: toNum(r.K),
          ERA: toNum(r.ERA),
          WHIP: toNum(r.WHIP),
          GS: toNum(r.GS),
      }));

      return this.normalizedPeriodStats;
  }

  /**
   * Query players from DB for a given league, returning NormalizedSeasonStat[] with zero stats.
   * Used for leagues that don't have CSV data (e.g., League 2 / 2026 season).
   */
  public async getLeaguePlayersFromDb(leagueId: number): Promise<NormalizedSeasonStat[]> {
    // Get all players from DB
    const allPlayers = await prisma.player.findMany({
      select: { id: true, mlbId: true, name: true, posPrimary: true, posList: true, mlbTeam: true },
    });

    // Get active rosters for this league
    const rosters = await prisma.roster.findMany({
      where: { team: { leagueId }, releasedAt: null },
      include: { team: true },
    });

    // Build playerId → team info map
    const rosterMap = new Map<number, { teamCode: string; price: number }>();
    for (const r of rosters) {
      rosterMap.set(r.playerId, {
        teamCode: r.team.code ?? r.team.name.substring(0, 3).toUpperCase(),
        price: Number(r.price),
      });
    }

    return allPlayers.map((p) => {
      const mlbId = String(p.mlbId ?? p.id);
      const roster = rosterMap.get(p.id);
      const isPitcher = (p.posPrimary ?? "").toUpperCase() === "P";
      const mlbTeam = p.mlbTeam ?? "";

      return {
        mlb_id: mlbId,
        player_name: p.name,
        mlb_full_name: p.name,
        ogba_team_code: roster?.teamCode ?? "",
        positions: p.posList || p.posPrimary || "",
        is_pitcher: isPitcher,
        AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, AVG: 0,
        GS: 0, W: 0, SV: 0, K: 0, ERA: 0, WHIP: 0, SO: 0,
        mlb_team: mlbTeam,
        mlbTeam: mlbTeam,
        fantasy_value: roster?.price,
      };
    });
  }

  public getAuctionValues() { return this.auctionValues; }
  public getSeasonStats() { return this.seasonStats; }
  public getSeasonStandings() { return this.seasonStandings; }
  public getPeriodStats() { return this.periodStats; }

  /** Get or compute a cached standings result. Cache clears on data reload. */
  public getCachedStandings<T>(key: string, compute: () => T): T {
    if (this.standingsCache.has(key)) {
      return this.standingsCache.get(key) as T;
    }
    const result = compute();
    this.standingsCache.set(key, result);
    return result;
  }
}
