// Draft Report Card — values & busts per team, anchored to auction-day
// prices and computed against z-score performance vs league peers.
//
// Surplus formula:
//   composite_z = Σ category_z (5 cats per pool; ERA/WHIP signs flipped)
//   price_z     = standardize(log(auction_price + 1)) league-wide
//   surplus     = composite_z − price_z
//
// Candidate pool per team = auction-day roster ∩ current active roster.
// We split the league-wide pool into hitter / pitcher buckets and z-score
// within each (so the AVG of a 1B is normalized against other hitters,
// not pitchers). Hitters and pitchers then compete head-to-head for the
// values/busts slots because both composite_z and price_z share a
// unit-variance scale.
//
// Min-sample floor: hitters AB >= 30, pitchers IP >= 10. Below-threshold
// players are excluded from ranking (they'd dominate the busts list on
// noise alone — a $40 SS who's spent the season on IL isn't a "bust" in
// any actionable sense).
import { prisma } from "../../../db/prisma.js";
import {
  getAuctionDaySnapshot,
  type AuctionSnapshotRoster,
} from "../../auction/lib/auctionDaySnapshot.js";
import {
  resolveCheckpoint,
  checkpointCount,
  type Checkpoint,
} from "../lib/checkpoints.js";

export type { Checkpoint };

export interface PlayerPick {
  playerId: number;
  mlbId: number | null;
  name: string;
  team: string; // MLB team abbr
  posPrimary: string;
  isPitcher: boolean;
  auctionPrice: number;
  compositeZ: number;
  priceZ: number;
  surplus: number;
  stats: Record<string, number>;
}

export interface TeamReport {
  teamId: number;
  teamName: string;
  teamCode: string;
  values: PlayerPick[];
  busts: PlayerPick[];
}

export interface DraftReportCard {
  leagueId: number;
  checkpoint: Checkpoint;
  checkpointLabel: string;
  periodRange: {
    firstPeriodId: number;
    lastPeriodId: number;
    firstStart: string;
    lastEnd: string;
  };
  isPreview: boolean;
  teams: TeamReport[];
  computedAt: string;
}

export class CheckpointUnavailableError extends Error {
  unlocksAt: Date;
  constructor(unlocksAt: Date) {
    super("Checkpoint not yet available");
    this.unlocksAt = unlocksAt;
  }
}

const MIN_AB_FOR_HITTER = 30;
const MIN_IP_FOR_PITCHER = 10;
const TOP_VALUES = 3;
const TOP_BUSTS = 3;

// Duplicated from awardsService:136 — kept independent to avoid coupling
// the report card to the awards module's stat-pool semantics.
function zScores(vals: number[]): number[] {
  if (vals.length === 0) return [];
  const safe = vals.map((v) => (Number.isFinite(v) ? v : 0));
  const mean = safe.reduce((a, b) => a + b, 0) / safe.length;
  const sd = Math.sqrt(safe.reduce((s, v) => s + (v - mean) ** 2, 0) / safe.length) || 1;
  return safe.map((v) => (v - mean) / sd);
}

interface HitterStats {
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AVG: number;
  AB: number;
  H: number;
}

interface PitcherStats {
  W: number;
  SV: number;
  K: number;
  ERA: number;
  WHIP: number;
  IP: number;
}

/**
 * Compute the Draft Report Card for `leagueId` at `checkpoint`. Throws
 * CheckpointUnavailableError when the checkpoint hasn't started yet.
 */
export async function computeDraftReportCard(
  leagueId: number,
  checkpoint: Checkpoint,
): Promise<DraftReportCard> {
  const resolution = await resolveCheckpoint(leagueId, checkpoint);
  if (resolution === null) {
    throw new CheckpointUnavailableError(new Date(Date.now() + 86_400_000));
  }
  if (!("periodIds" in resolution)) {
    throw new CheckpointUnavailableError(resolution.unlocksAt);
  }

  // Auction-day snapshot — the price/identity anchor.
  const snapshot = await getAuctionDaySnapshot(leagueId);

  // Current active rosters per team — used to filter auction-day picks down
  // to "still on the team". A dropped/traded player can't be a value or a
  // bust because he's no longer this owner's problem (or asset).
  const currentTeams = await prisma.team.findMany({
    where: { leagueId },
    select: {
      id: true,
      rosters: {
        where: { releasedAt: null },
        select: { playerId: true },
      },
    },
  });
  const currentByTeam = new Map<number, Set<number>>(
    currentTeams.map((t) => [t.id, new Set(t.rosters.map((r) => r.playerId))]),
  );

  // Candidate set = (auction-day player) AND (still on that exact team).
  // Trades intentionally drop the player from the original drafter — the
  // surplus belongs to the team that owns the present, not the past.
  interface Candidate {
    teamId: number;
    snapshot: AuctionSnapshotRoster;
  }
  const candidates: Candidate[] = [];
  for (const t of snapshot.teams) {
    const current = currentByTeam.get(t.teamId) ?? new Set<number>();
    for (const r of t.rosters) {
      if (!current.has(r.playerId)) continue;
      candidates.push({ teamId: t.teamId, snapshot: r });
    }
  }

  if (candidates.length === 0) {
    return emptyReport(leagueId, checkpoint, resolution);
  }

  // Pull all candidate stats in a single groupBy across the checkpoint span.
  const candidatePlayerIds = [...new Set(candidates.map((c) => c.snapshot.playerId))];
  const playerStats = await prisma.playerStatsPeriod.groupBy({
    by: ["playerId"],
    where: { playerId: { in: candidatePlayerIds }, periodId: { in: resolution.periodIds } },
    _sum: {
      AB: true, H: true, R: true, HR: true, RBI: true, SB: true,
      W: true, SV: true, K: true, IP: true, ER: true, BB_H: true,
    },
  });
  const statsByPlayer = new Map(playerStats.map((p) => [p.playerId, p._sum]));

  // Split candidates into hitter / pitcher pools by snapshot.isPitcher.
  // Filter by min-sample floor so a single $40 IL stash doesn't dominate
  // the busts list with -Inf surplus.
  interface PoolEntry {
    candidate: Candidate;
    hitter?: HitterStats;
    pitcher?: PitcherStats;
  }
  const hitterPool: PoolEntry[] = [];
  const pitcherPool: PoolEntry[] = [];
  for (const c of candidates) {
    const s = statsByPlayer.get(c.snapshot.playerId);
    if (!s) continue;
    if (c.snapshot.isPitcher) {
      const ip = s.IP ?? 0;
      if (ip < MIN_IP_FOR_PITCHER) continue;
      const er = s.ER ?? 0;
      const bbh = s.BB_H ?? 0;
      pitcherPool.push({
        candidate: c,
        pitcher: {
          W: s.W ?? 0,
          SV: s.SV ?? 0,
          K: s.K ?? 0,
          ERA: ip > 0 ? (er * 9) / ip : 99,
          WHIP: ip > 0 ? bbh / ip : 99,
          IP: ip,
        },
      });
    } else {
      const ab = s.AB ?? 0;
      if (ab < MIN_AB_FOR_HITTER) continue;
      const h = s.H ?? 0;
      hitterPool.push({
        candidate: c,
        hitter: {
          R: s.R ?? 0,
          HR: s.HR ?? 0,
          RBI: s.RBI ?? 0,
          SB: s.SB ?? 0,
          AVG: ab > 0 ? h / ab : 0,
          AB: ab,
          H: h,
        },
      });
    }
  }

  // Per-category z-scores within each pool (sign-flip ERA/WHIP).
  const hitterZ = {
    R: zScores(hitterPool.map((p) => p.hitter!.R)),
    HR: zScores(hitterPool.map((p) => p.hitter!.HR)),
    RBI: zScores(hitterPool.map((p) => p.hitter!.RBI)),
    SB: zScores(hitterPool.map((p) => p.hitter!.SB)),
    AVG: zScores(hitterPool.map((p) => p.hitter!.AVG)),
  };
  const pitcherZ = {
    W: zScores(pitcherPool.map((p) => p.pitcher!.W)),
    SV: zScores(pitcherPool.map((p) => p.pitcher!.SV)),
    K: zScores(pitcherPool.map((p) => p.pitcher!.K)),
    ERA: zScores(pitcherPool.map((p) => p.pitcher!.ERA)).map((v) => -v),
    WHIP: zScores(pitcherPool.map((p) => p.pitcher!.WHIP)).map((v) => -v),
  };

  // League-wide log-price z. Both pools share the same scale so they can
  // compete head-to-head for the per-team value/bust slots.
  const allPriceLog = [
    ...hitterPool.map((p) => Math.log(p.candidate.snapshot.price + 1)),
    ...pitcherPool.map((p) => Math.log(p.candidate.snapshot.price + 1)),
  ];
  const allPriceZ = zScores(allPriceLog);
  const hitterPriceZ = allPriceZ.slice(0, hitterPool.length);
  const pitcherPriceZ = allPriceZ.slice(hitterPool.length);

  const allPicks: { teamId: number; pick: PlayerPick }[] = [];
  hitterPool.forEach((p, i) => {
    const compositeZ =
      hitterZ.R[i] + hitterZ.HR[i] + hitterZ.RBI[i] + hitterZ.SB[i] + hitterZ.AVG[i];
    const priceZ = hitterPriceZ[i];
    allPicks.push({
      teamId: p.candidate.teamId,
      pick: makeHitterPick(p.candidate.snapshot, p.hitter!, compositeZ, priceZ),
    });
  });
  pitcherPool.forEach((p, i) => {
    const compositeZ =
      pitcherZ.W[i] + pitcherZ.SV[i] + pitcherZ.K[i] + pitcherZ.ERA[i] + pitcherZ.WHIP[i];
    const priceZ = pitcherPriceZ[i];
    allPicks.push({
      teamId: p.candidate.teamId,
      pick: makePitcherPick(p.candidate.snapshot, p.pitcher!, compositeZ, priceZ),
    });
  });

  // Group by team, sort, slice top/bottom.
  const teamReports: TeamReport[] = snapshot.teams.map((t) => {
    const teamPicks = allPicks.filter((p) => p.teamId === t.teamId).map((p) => p.pick);
    const sorted = teamPicks.slice().sort((a, b) => b.surplus - a.surplus);
    return {
      teamId: t.teamId,
      teamName: t.teamName,
      teamCode: t.teamCode,
      values: sorted.slice(0, TOP_VALUES),
      // Bottom-N — separate slice so a team with only 4 candidates returns
      // 3 values + 1 bust (the last sorted entry), not 3 values + 3 dups.
      busts: sorted.length >= TOP_VALUES + TOP_BUSTS
        ? sorted.slice(-TOP_BUSTS).reverse()
        : sorted.slice(TOP_VALUES).reverse(),
    };
  });

  // Stable alphabetical sort for predictable rendering.
  teamReports.sort((a, b) => a.teamName.localeCompare(b.teamName));

  return {
    leagueId,
    checkpoint,
    checkpointLabel: resolution.label,
    periodRange: {
      firstPeriodId: resolution.periodIds[0],
      lastPeriodId: resolution.periodIds[resolution.periodIds.length - 1],
      firstStart: resolution.firstStart.toISOString(),
      lastEnd: resolution.lastEnd.toISOString(),
    },
    isPreview: resolution.isPreview,
    teams: teamReports,
    computedAt: new Date().toISOString(),
  };
}

function makeHitterPick(
  s: AuctionSnapshotRoster,
  h: HitterStats,
  compositeZ: number,
  priceZ: number,
): PlayerPick {
  return {
    playerId: s.playerId,
    mlbId: s.mlbId,
    name: s.playerName ?? "?",
    team: s.mlbTeam ?? "",
    posPrimary: s.posPrimary ?? "",
    isPitcher: false,
    auctionPrice: s.price,
    compositeZ,
    priceZ,
    surplus: compositeZ - priceZ,
    stats: { R: h.R, HR: h.HR, RBI: h.RBI, SB: h.SB, AVG: h.AVG, AB: h.AB },
  };
}

function makePitcherPick(
  s: AuctionSnapshotRoster,
  p: PitcherStats,
  compositeZ: number,
  priceZ: number,
): PlayerPick {
  return {
    playerId: s.playerId,
    mlbId: s.mlbId,
    name: s.playerName ?? "?",
    team: s.mlbTeam ?? "",
    posPrimary: s.posPrimary ?? "",
    isPitcher: true,
    auctionPrice: s.price,
    compositeZ,
    priceZ,
    surplus: compositeZ - priceZ,
    stats: { W: p.W, SV: p.SV, K: p.K, ERA: p.ERA, WHIP: p.WHIP, IP: p.IP },
  };
}

function emptyReport(
  leagueId: number,
  checkpoint: Checkpoint,
  resolution: { periodIds: number[]; firstStart: Date; lastEnd: Date; isPreview: boolean; label: string },
): DraftReportCard {
  return {
    leagueId,
    checkpoint,
    checkpointLabel: resolution.label,
    periodRange: {
      firstPeriodId: resolution.periodIds[0],
      lastPeriodId: resolution.periodIds[resolution.periodIds.length - 1],
      firstStart: resolution.firstStart.toISOString(),
      lastEnd: resolution.lastEnd.toISOString(),
    },
    isPreview: resolution.isPreview,
    teams: [],
    computedAt: new Date().toISOString(),
  };
}

// Re-export checkpoint helper for the route handler.
export { checkpointCount };
