// Auction-day snapshot — the frozen view of every team's roster the moment
// the auction closed, independent of in-season churn. Extracted from
// `routes.ts` `/results` (task #54) so consumers other than the public
// /api/auction/results endpoint (e.g. the Draft Report Card) can reuse the
// exact same inclusion semantics without re-deriving the cutoff or the
// source allowlist.
//
// Inclusion rules (mirror the comment block at the original `/results` site):
// - source IN (auction_2026, prior_season) — clean auction-time rows
// - source IN (DROP, SEASON_IMPORT) — mis-labeled auction-time rows from
//   early import code paths (4 rows in OGBA 2026). Surface as auction wins.
// - acquiredAt < AUCTION_CUTOFF — drafted/kept before the auction window closed
// - releasedAt IS NULL OR releasedAt >= AUCTION_CUTOFF — exclude pre-auction
//   keeper cuts, include in-season drops
//
// AUCTION_CUTOFF = first Period.startDate + 7d safety buffer.
import { prisma } from "../../../db/prisma.js";
import { PITCHER_CODES_SET as PITCHER_CODES } from "../../../lib/sportConfig.js";

export interface AuctionSnapshotRoster {
  rosterId: number;
  playerId: number;
  mlbId: number | null;
  playerName: string | null;
  posPrimary: string | null;
  posList: string | null;
  mlbTeam: string | null;
  price: number;
  assignedPosition: string | null;
  source: string;
  isPitcher: boolean;
}

export interface AuctionSnapshotTeam {
  teamId: number;
  teamName: string;
  teamCode: string;
  budget: number | null;
  rosters: AuctionSnapshotRoster[];
}

export interface AuctionDaySnapshot {
  leagueId: number;
  auctionCutoff: Date;
  teams: AuctionSnapshotTeam[];
}

const AUCTION_SOURCES = ["auction_2026", "prior_season", "DROP", "SEASON_IMPORT"] as const;
const NORMALIZE_TO_AUCTION = new Set(["DROP", "SEASON_IMPORT"]);

/**
 * Derive the auction cutoff from a league's first period startDate + 7d.
 * Exported so tests and the route handler can verify the value cheaply
 * without duplicating the query.
 */
export async function getAuctionCutoff(leagueId: number): Promise<Date> {
  const firstPeriod = await prisma.period.findFirst({
    where: { season: { leagueId } },
    orderBy: { startDate: "asc" },
    select: { startDate: true },
  });
  return firstPeriod
    ? new Date(firstPeriod.startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    : new Date(`${new Date().getFullYear()}-04-01T00:00:00Z`);
}

/**
 * Load the auction-day snapshot for every team in `leagueId`. Caller chooses
 * what to do with it — `/api/auction/results` wraps in the legacy wire
 * shape, the Draft Report Card intersects with current rosters before
 * scoring.
 */
export async function getAuctionDaySnapshot(leagueId: number): Promise<AuctionDaySnapshot> {
  const cutoff = await getAuctionCutoff(leagueId);

  const teams = await prisma.team.findMany({
    where: { leagueId },
    include: {
      rosters: {
        where: {
          source: { in: [...AUCTION_SOURCES] },
          acquiredAt: { lt: cutoff },
          OR: [{ releasedAt: null }, { releasedAt: { gte: cutoff } }],
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              posPrimary: true,
              posList: true,
              mlbId: true,
              mlbTeam: true,
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  return {
    leagueId,
    auctionCutoff: cutoff,
    teams: teams.map((t) => ({
      teamId: t.id,
      teamName: t.name,
      teamCode: t.code || "UNK",
      budget: t.budget ?? null,
      rosters: t.rosters.map((r) => {
        const pos = r.player?.posPrimary ?? null;
        return {
          rosterId: r.id,
          playerId: r.playerId,
          mlbId: r.player?.mlbId ?? null,
          playerName: r.player?.name ?? null,
          posPrimary: pos,
          posList: r.player?.posList ?? pos,
          mlbTeam: r.player?.mlbTeam ?? null,
          price: Number(r.price) || 0,
          assignedPosition: r.assignedPosition ?? null,
          // Normalize the 4 known mis-labeled rows so consumers don't have
          // to special-case them; matches the legacy /results behavior.
          source: NORMALIZE_TO_AUCTION.has(r.source) ? "auction_2026" : r.source,
          isPitcher: pos ? PITCHER_CODES.has(pos) : false,
        };
      }),
    })),
  };
}
