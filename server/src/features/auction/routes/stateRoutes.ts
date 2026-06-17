import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.js";
import { requireLeagueMember } from "../../../middleware/auth.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { getAuctionDaySnapshot } from "../lib/auctionDaySnapshot.js";
import { getState, readLeagueId } from "../lib/auctionStateManager.js";

const router = Router();

// GET /api/auction/state?leagueId=N
router.get("/state", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const state = await getState(leagueId);
  // Strip proxy bids (private) — client fetches their own via /proxy-bid
  const sanitized = state.nomination?.proxyBids
    ? { ...state, nomination: { ...state.nomination, proxyBids: undefined } }
    : state;
  res.json({ ...sanitized, computedAt: new Date().toISOString() });
}));

// GET /api/auction/results?leagueId=N
//
// Returns an AUCTION-DAY SNAPSHOT of every team's roster — the frozen view of
// the auction outcome, independent of in-season churn. Used by the /auction-
// results page so its totals match Excel and the commissioner Team budget caps.
//
// Distinction from /state:
// - /state.teams[].roster = CURRENT active rosters (drops removed, waivers added).
//   Right for live auction + post-auction "where do we stand today".
// - /results.teams[].roster = AUCTION-DAY rosters (post-auction snapshot, before
//   any in-season churn). Right for "what was the auction outcome".
//
// Auction-day inclusion rules:
// - source IN (auction_2026, prior_season) — clean auction-time rows
// - source IN (DROP, SEASON_IMPORT) — known mis-labeled auction-time rows from
//   early import code paths (4 rows in OGBA 2026: Busch, Vaughn, Palencia,
//   Priester). Surface as auction wins.
// - acquiredAt < AUCTION_CUTOFF — drafted/kept before the auction window closed
// - releasedAt IS NULL OR releasedAt >= AUCTION_CUTOFF — exclude pre-auction
//   keeper cuts (mass release on the cut deadline), include in-season drops
//
// AUCTION_CUTOFF derivation: first Period.startDate of the season + 7d safety
// buffer to include any post-acquisition data backfills (e.g., Ohtani two-way
// synthetic rows added a few days after the auction closes).
router.get("/results", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const state = await getState(leagueId);
  // Snapshot query + cutoff derivation live in lib/auctionDaySnapshot.ts so
  // the Draft Report Card can reuse the exact inclusion semantics (task #54).
  const snapshot = await getAuctionDaySnapshot(leagueId);

  const PRIOR_SEASON = "prior_season";
  const snapshotTeams = snapshot.teams.map((t) => {
    const totalSpent = t.rosters.reduce((s, r) => s + r.price, 0);
    const keeperSpend = t.rosters
      .filter((r) => r.source === PRIOR_SEASON)
      .reduce((s, r) => s + r.price, 0);
    const auctionSpend = totalSpent - keeperSpend;
    const dbBudget = t.budget ?? state.config.budgetCap;
    return {
      id: t.teamId,
      name: t.teamName,
      code: t.teamCode,
      budget: dbBudget - totalSpent,
      dbBudget,
      keeperSpend,
      auctionSpend,
      rosterCount: t.rosters.length,
      roster: t.rosters.map((r) => ({
        id: r.rosterId,
        playerId: r.playerId,
        mlbId: r.mlbId,
        playerName: r.playerName,
        posPrimary: r.posPrimary,
        posList: r.posList,
        mlbTeam: r.mlbTeam,
        price: r.price,
        assignedPosition: r.assignedPosition,
        source: r.source,
      })),
    };
  });

  res.json({
    leagueId,
    status: state.status,
    config: state.config,
    teams: snapshotTeams,
    log: state.log ?? [],
    auctionCutoff: snapshot.auctionCutoff.toISOString(),
    computedAt: new Date().toISOString(),
  });
}));

export default router;
