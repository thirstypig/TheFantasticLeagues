// Auction-day snapshot — the frozen view of every team's roster the moment
// the auction closed, independent of in-season churn. Extracted from
// `routes.ts` `/results` (task #54) so consumers other than the public
// /api/auction/results endpoint (e.g. the Draft Report Card) can reuse the
// exact same inclusion semantics without re-deriving the cutoff or the
// source allowlist.
//
// Inclusion rules (mirror the comment block at the original `/results` site):
// - source IN (auction_<season>, prior_season) — clean auction-time rows,
//   where <season> is the league's `League.season` (auction_2026 for OGBA 2026)
// - source IN (DROP, SEASON_IMPORT) — mis-labeled auction-time rows from
//   early import code paths (4 rows in OGBA 2026). Surface as auction wins.
// - acquiredAt < AUCTION_CUTOFF — drafted/kept before the auction window closed
// - releasedAt IS NULL OR releasedAt >= AUCTION_CUTOFF — exclude pre-auction
//   keeper cuts, include in-season drops
//
// AUCTION_CUTOFF = first Period.startDate of THAT season + 7d safety buffer;
// "now" when the season has no periods yet (the auction is still running or
// just ended, so everything acquired so far is auction-day).
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

const NORMALIZE_TO_AUCTION = new Set(["DROP", "SEASON_IMPORT"]);

/** Source tag of rows bought in `season`'s auction (matches finishCurrentLot / force-assign). */
function auctionSourceFor(season: number): string {
  return `auction_${season}`;
}

function auctionSources(season: number): string[] {
  return [auctionSourceFor(season), "prior_season", "DROP", "SEASON_IMPORT"];
}

/** The league's season year (League.season), current year if the league row is missing. */
async function getLeagueSeason(leagueId: number): Promise<number> {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  return league?.season ?? new Date().getFullYear();
}

/**
 * Derive the auction cutoff from the first period of the league's season
 * (startDate + 7d), or "now" when that season has no periods yet.
 * Exported so tests and the route handler can verify the value cheaply
 * without duplicating the query.
 */
export async function getAuctionCutoff(leagueId: number, season?: number): Promise<Date> {
  const year = season ?? (await getLeagueSeason(leagueId));
  const firstPeriod = await prisma.period.findFirst({
    where: { season: { leagueId, year } },
    orderBy: { startDate: "asc" },
    select: { startDate: true },
  });
  return firstPeriod
    ? new Date(firstPeriod.startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    : new Date();
}

/**
 * Load the auction-day snapshot for every team in `leagueId`. Caller chooses
 * what to do with it — `/api/auction/results` wraps in the legacy wire
 * shape, the Draft Report Card intersects with current rosters before
 * scoring.
 */
export async function getAuctionDaySnapshot(leagueId: number): Promise<AuctionDaySnapshot> {
  const season = await getLeagueSeason(leagueId);
  const cutoff = await getAuctionCutoff(leagueId, season);
  const auctionSource = auctionSourceFor(season);

  const teams = await prisma.team.findMany({
    where: { leagueId },
    include: {
      rosters: {
        where: {
          source: { in: auctionSources(season) },
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
          source: NORMALIZE_TO_AUCTION.has(r.source) ? auctionSource : r.source,
          isPitcher: pos ? PITCHER_CODES.has(pos) : false,
        };
      }),
    })),
  };
}
