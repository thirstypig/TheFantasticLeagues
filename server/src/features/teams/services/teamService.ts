
import { prisma } from "../../../db/prisma.js";
import { POINTS_CANDIDATES } from "../../../constants/stats.js";
import { isPosGamesRecord } from "../../../lib/jsonGuards.js";
import type { RosterHubResponse } from "@shared/api/teams.js";

const POS_ORDER = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P", "SP", "RP", "IL"];
const PITCHER_POS = new Set(["P", "SP", "RP"]);

function posScore(pos?: string | null): number {
  if (!pos) return 99;
  const idx = POS_ORDER.indexOf(pos);
  return idx < 0 ? 50 : idx;
}

export class TeamService {
  /**
   * Helper to pull a numeric "points" value out of any stats object
   */
  static calculatePoints(obj: Record<string, unknown> | null | undefined): number {
    if (!obj) return 0;

    // 1) Try exact names from our constants
    for (const key of POINTS_CANDIDATES) {
      if (obj[key] != null) {
        const n = Number(obj[key]);
        if (!Number.isNaN(n)) return n;
      }
    }

    // 2) Fallback: any field whose name includes "point"
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase().includes("point")) {
        const n = Number(value);
        if (!Number.isNaN(n)) return n;
      }
    }

    return 0;
  }

  /**
   * Calculate games by position for a player
   */
  static buildGamesByPos(
    posPrimary: string,
    posList: string | null,
    posGames?: Record<string, number> | null,
  ): Record<string, number> {
    // Use real per-position GP from the MLB Stats API when available.
    if (posGames && Object.keys(posGames).length > 0) return posGames;

    // Synthetic fallback — used until the daily cron populates posGames.
    const positionsRaw = (posList || posPrimary || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const positions =
      positionsRaw.length > 0 ? positionsRaw : [posPrimary || "UTIL"];
    const totalGames = 20;
    const gamesByPos: Record<string, number> = {};

    if (positions.length === 1) {
      gamesByPos[positions[0]] = totalGames;
    } else {
      const primary = positions[0];
      const remaining = positions.slice(1);

      gamesByPos[primary] = Math.round(totalGames * 0.6);
      const perOther =
        remaining.length > 0
          ? Math.round((totalGames * 0.4) / remaining.length)
          : 0;

      for (const pos of remaining) {
        gamesByPos[pos] = perOther;
      }
    }

    return gamesByPos;
  }

  async getTeamSummary(teamId: number) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        leagueId: true,
        name: true,
        owner: true,
        budget: true,
      },
    });

    if (!team) {
        throw new Error("Team not found");
    }

    // Run independent DB queries in parallel
    const [period, seasonStats, periodRows, rosterRows, droppedRows] = await Promise.all([
      // active period for this team's league
      prisma.period.findFirst({
        where: { status: "active", leagueId: team.leagueId },
        orderBy: { startDate: "asc" },
      }).then((p) => p || prisma.period.findFirst({ where: { leagueId: team.leagueId }, orderBy: { id: "desc" } })),

      // TeamStatsSeason deprecated — season totals derived from period summaries
      Promise.resolve(null),

      prisma.teamStatsPeriod.findMany({
        where: { teamId: team.id },
        include: { period: true },
        orderBy: { periodId: "asc" },
      }),

      prisma.roster.findMany({
        where: { teamId: team.id, releasedAt: null },
        include: { player: true },
        orderBy: { acquiredAt: "asc" },
      }),

      prisma.roster.findMany({
        where: {
          teamId: team.id,
          NOT: { releasedAt: null },
        },
        include: { player: true },
        orderBy: { releasedAt: "desc" },
      }),
    ]);

    // Period stats for the active period (depends on period lookup above)
    let periodStats = null;
    if (period) {
      periodStats = await prisma.teamStatsPeriod.findUnique({
        where: {
          teamId_periodId: {
            teamId: team.id,
            periodId: period.id,
          },
        },
      });
    }

    // ---------- period-by-period summary ----------
    let runningTotal = 0;
    const periodSummaries = periodRows.map((row) => {
      const periodPoints = TeamService.calculatePoints({ ...row } as Record<string, unknown>);
      runningTotal += periodPoints;

      const p = row.period;

      const label =
        (p as Record<string, unknown>)?.["label"] as string ||
        p?.name ||
        (p as Record<string, unknown>)?.["code"] as string ||
        (p as Record<string, unknown>)?.["displayName"] as string ||
        (p?.startDate
          ? new Date(p.startDate).toLocaleDateString("en-US", {
              month: "short",
              day: "2-digit",
            })
          : `P${row.periodId}`);

      return {
        periodId: row.periodId,
        label,
        periodPoints,
        seasonPoints: runningTotal,
      };
    });

    const seasonTotal = periodSummaries.length
      ? periodSummaries[periodSummaries.length - 1].seasonPoints
      : 0;

    // ---------- Roster ----------
    // Load per-player period stats for the active period (for players not in CSV, e.g., synthetic Ohtani pitcher)
    const playerPeriodStatsMap = new Map<number, { W: number; SV: number; K: number; IP: number; ER: number; BB_H: number; R: number; HR: number; RBI: number; SB: number; AB: number; H: number }>();
    if (period) {
      const playerIds = rosterRows.map((r) => r.playerId);
      const pStats = await prisma.playerStatsPeriod.findMany({
        where: { playerId: { in: playerIds }, periodId: period.id },
      });
      for (const ps of pStats) {
        playerPeriodStatsMap.set(ps.playerId, {
          W: ps.W, SV: ps.SV, K: ps.K, IP: ps.IP as number, ER: ps.ER, BB_H: ps.BB_H,
          R: ps.R, HR: ps.HR, RBI: ps.RBI, SB: ps.SB, AB: ps.AB, H: ps.H,
        });
      }
    }

    const currentRoster = rosterRows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      mlbId: r.player.mlbId,
      name: r.player.name,
      posPrimary: r.player.posPrimary,
      posList: r.player.posList,
      mlbTeam: r.player.mlbTeam,
      mlbStatus: r.player.mlbStatus ?? null,
      acquiredAt: r.acquiredAt,
      price: r.price,
      assignedPosition: r.assignedPosition,
      isKeeper: r.isKeeper,
      gamesByPos: TeamService.buildGamesByPos(r.player.posPrimary, r.player.posList, isPosGamesRecord(r.player.posGames) ? r.player.posGames : null),
      posGamesSource: isPosGamesRecord(r.player.posGames) && Object.keys(r.player.posGames as object).length > 0 ? "real" as const : "synthetic" as const,
      periodStats: playerPeriodStatsMap.get(r.playerId) ?? null,
    }));

    const droppedPlayers = droppedRows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      name: r.player.name,
      posPrimary: r.player.posPrimary,
      posList: r.player.posList,
      acquiredAt: r.acquiredAt,
      releasedAt: r.releasedAt!,
      price: r.price,
      // Intentionally pass null: dropped players are a historical log; showing
      // current-state posGames (which grows all season) would misrepresent GP
      // at the time the player was on the roster.
      gamesByPos: TeamService.buildGamesByPos(r.player.posPrimary, r.player.posList, null),
    }));

    return {
      team,
      period,
      periodStats,
      seasonStats,
      currentRoster,
      droppedPlayers,
      periodSummaries,
      seasonTotal,
    };
  }

  async getTeamRosterHub(teamId: number): Promise<RosterHubResponse> {
    const [summary, teamMeta] = await Promise.all([
      this.getTeamSummary(teamId),
      prisma.team.findUnique({ where: { id: teamId }, select: { rosterVersion: true } }),
    ]);

    const rows = summary.currentRoster.map((row) => {
      const assignedPosition = row.assignedPosition ?? row.posPrimary;
      const isPitcher = PITCHER_POS.has((assignedPosition || row.posPrimary || "").toUpperCase());
      const stats = row.periodStats;
      const AB = stats?.AB;
      const H = stats?.H;
      const IP = stats?.IP;
      const ER = stats?.ER;
      const BB_H = stats?.BB_H;

      return {
        rosterId: row.id,
        playerId: row.playerId,
        mlbId: row.mlbId ?? undefined,
        playerName: row.name,
        posPrimary: row.posPrimary,
        posList: row.posList ?? row.posPrimary,
        position: row.posPrimary,
        assignedPosition,
        isPitcher,
        price: row.price,
        mlbTeam: row.mlbTeam ?? undefined,
        isKeeper: row.isKeeper,
        gamesByPos: row.gamesByPos,
        posGamesSource: row.posGamesSource,
        mlbStatus: row.mlbStatus,
        AB,
        H,
        AVG: AB && AB > 0 && H != null ? H / AB : undefined,
        HR: stats?.HR,
        R: stats?.R,
        RBI: stats?.RBI,
        SB: stats?.SB,
        IP,
        BB_H,
        ER,
        W: stats?.W,
        SV: stats?.SV,
        K: stats?.K,
        ERA: IP && IP > 0 && ER != null ? (ER / IP) * 9 : undefined,
        WHIP: IP && IP > 0 && BB_H != null ? BB_H / IP : undefined,
      };
    });

    const activeRows = rows.filter((row) => row.assignedPosition !== "IL");
    const hitters = activeRows
      .filter((row) => !row.isPitcher)
      .sort((a, b) => {
        const posDelta = posScore(a.assignedPosition || a.posPrimary) - posScore(b.assignedPosition || b.posPrimary);
        if (posDelta !== 0) return posDelta;
        return (b.price ?? 0) - (a.price ?? 0);
      });
    const pitchers = activeRows
      .filter((row) => row.isPitcher)
      .sort((a, b) => {
        const aPos = a.assignedPosition || a.posPrimary || "";
        const bPos = b.assignedPosition || b.posPrimary || "";
        if (aPos !== bPos) return aPos.localeCompare(bPos);
        return (b.price ?? 0) - (a.price ?? 0);
      });

    return {
      team: summary.team,
      period: summary.period,
      hitters,
      pitchers,
      ilPlayers: rows.filter((row) => row.assignedPosition === "IL"),
      droppedPlayers: summary.droppedPlayers,
      rosterVersion: teamMeta?.rosterVersion ?? 0,
    };
  }
}
