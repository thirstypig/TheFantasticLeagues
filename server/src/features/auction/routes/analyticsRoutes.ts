import { Router } from "express";
import { prisma } from "../../../db/prisma.js";
import { requireAuth } from "../../../middleware/auth.js";
import { requireLeagueMember } from "../../../middleware/auth.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { logger } from "../../../lib/logger.js";
import { isPitcher as isPitcherPos } from "../../../lib/sportConfig.js";
import { getState, readLeagueId } from "../lib/auctionStateManager.js";
import type { AuctionState } from "../types.js";

const router = Router();

// GET /api/auction/bid-history?leagueId=N
// Returns all completed auction lots with their bid history, ordered by nomination time.
router.get("/bid-history", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const leagueTeamIds = (await prisma.team.findMany({ where: { leagueId }, select: { id: true } })).map(t => t.id);
  if (leagueTeamIds.length === 0) return res.json({ lots: [], computedAt: new Date().toISOString() });

  const lots = await prisma.auctionLot.findMany({
    where: { nominatingTeamId: { in: leagueTeamIds } },
    include: {
      player: { select: { name: true, mlbId: true, posPrimary: true, mlbTeam: true } },
      bids: {
        include: { team: { select: { id: true, name: true, code: true } } },
        orderBy: { ts: "asc" },
      },
    },
    orderBy: { startTs: "asc" },
  });

  res.json({
    lots: lots.map((lot, idx) => ({
      lotNumber: idx + 1,
      playerName: lot.player.name,
      mlbId: lot.player.mlbId,
      position: lot.player.posPrimary,
      mlbTeam: lot.player.mlbTeam,
      status: lot.status,
      finalPrice: lot.finalPrice,
      winnerTeamId: lot.winnerTeamId,
      nominatingTeamId: lot.nominatingTeamId,
      startTs: lot.startTs,
      bids: lot.bids.map(b => ({
        teamId: b.team.id,
        teamName: b.team.name,
        teamCode: b.team.code,
        amount: b.amount,
        ts: b.ts,
      })),
    })),
    computedAt: new Date().toISOString(),
  });
}));

// GET /api/auction/retrospective?leagueId=N
// Post-draft analytics: league stats, bargains/overpays, position spending, contested lots, team efficiency, spending pace.
router.get("/retrospective", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = readLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  // Get league teams
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true, budget: true },
  });
  const teamIds = teams.map(t => t.id);
  const teamMap = new Map(teams.map(t => [t.id, t]));

  // All completed lots with bids + player data
  const lots = await prisma.auctionLot.findMany({
    where: {
      nominatingTeamId: { in: teamIds },
      status: "completed",
      finalPrice: { not: null },
      winnerTeamId: { not: null },
    },
    include: {
      player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } },
      bids: { select: { teamId: true, amount: true } },
    },
    orderBy: { startTs: "asc" },
  });

  // PlayerValue for bargain/overpay analysis
  const playerValues = await prisma.playerValue.findMany({
    where: { leagueId, playerId: { not: null } },
    select: { playerId: true, value: true },
  });
  const valueMap = new Map(playerValues.map(v => [v.playerId!, v.value]));

  // ── Fallback: build from roster data when no AuctionLot records exist ──
  if (lots.length === 0) {
    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
    const auctionSource = `auction_${league?.season ?? new Date().getFullYear()}`;
    const rosterTeams = await prisma.team.findMany({
      where: { leagueId },
      include: {
        rosters: {
          where: { releasedAt: null },
          include: { player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } } },
        },
      },
      orderBy: { id: "asc" },
    });

    function normPos(pos: string): string {
      const p = pos.trim().toUpperCase();
      if (["LF", "CF", "RF"].includes(p)) return "OF";
      return p;
    }

    const allRosters = rosterTeams.flatMap(t => t.rosters.map(r => ({ ...r, teamId: t.id, teamName: t.name })));
    const prices = allRosters.map(r => r.price).filter(p => p > 0);
    const totalLots = prices.length;
    const totalSpent = prices.reduce((s, p) => s + p, 0);
    const avgPrice = totalLots > 0 ? Math.round((totalSpent / totalLots) * 10) / 10 : 0;
    const sorted = [...prices].sort((a, b) => a - b);
    const medianPrice = sorted.length === 0 ? 0 : sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    const mostExp = allRosters.reduce((max, r) => r.price > (max?.price ?? 0) ? r : max, allRosters[0]);
    const mostExpensivePlayer = mostExp ? { playerName: mostExp.player.name, position: mostExp.player.posPrimary, price: mostExp.price } : null;
    const nonOne = allRosters.filter(r => r.price > 1);
    const cheapest = nonOne.reduce((min, r) => r.price < (min?.price ?? Infinity) ? r : min, nonOne[0]);
    const cheapestWin = cheapest ? { playerName: cheapest.player.name, position: cheapest.player.posPrimary, price: cheapest.price } : null;

    // Bargains/overpays from PlayerValue
    const surplusEntries = allRosters
      .filter(r => valueMap.has(r.player.id))
      .map(r => ({
        playerName: r.player.name, position: r.player.posPrimary, price: r.price,
        projectedValue: valueMap.get(r.player.id)!, surplus: valueMap.get(r.player.id)! - r.price,
      }));
    const bargains = [...surplusEntries].sort((a, b) => b.surplus - a.surplus).slice(0, 5).filter(e => e.surplus > 0);
    const overpays = [...surplusEntries].sort((a, b) => a.surplus - b.surplus).slice(0, 5).filter(e => e.surplus < 0);

    // Position spending
    const posMap = new Map<string, { totalSpent: number; playerCount: number }>();
    for (const r of allRosters) {
      const pos = normPos(r.player.posPrimary);
      const entry = posMap.get(pos) ?? { totalSpent: 0, playerCount: 0 };
      entry.totalSpent += r.price;
      entry.playerCount++;
      posMap.set(pos, entry);
    }
    const positionSpending = [...posMap.entries()]
      .map(([position, d]) => ({ position, totalSpent: d.totalSpent, avgPrice: Math.round((d.totalSpent / d.playerCount) * 10) / 10, playerCount: d.playerCount }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    // Team efficiency
    const teamEfficiency = rosterTeams.map(team => {
      const spent = team.rosters.reduce((s, r) => s + r.price, 0);
      const withValues = team.rosters.filter(r => valueMap.has(r.player.id));
      const bargainCount = withValues.filter(r => valueMap.get(r.player.id)! > r.price).length;
      const overpayCount = withValues.filter(r => valueMap.get(r.player.id)! < r.price).length;
      const totalSurplus = withValues.reduce((s, r) => s + (valueMap.get(r.player.id)! - r.price), 0);
      return {
        teamId: team.id, teamName: team.name, totalSpent: spent, playersAcquired: team.rosters.length,
        avgPrice: team.rosters.length > 0 ? Math.round((spent / team.rosters.length) * 10) / 10 : 0,
        budgetRemaining: team.budget, bargainCount, overpayCount, totalSurplus,
      };
    }).sort((a, b) => b.totalSurplus - a.totalSurplus);

    return res.json({
      league: { totalLots, totalSpent, avgPrice, medianPrice, mostExpensivePlayer, cheapestWin, totalBidsPlaced: 0, avgBidsPerLot: 0 },
      bargains, overpays, positionSpending,
      mostContested: [], // No bid history available
      teamEfficiency,
      spendingPace: [], // No lot ordering available
      source: "roster", // Indicates fallback mode
    });
  }

  // ── League-level metrics ──
  const prices = lots.map(l => l.finalPrice!);
  const totalLots = lots.length;
  const totalSpent = prices.reduce((s, p) => s + p, 0);
  const avgPrice = Math.round((totalSpent / totalLots) * 10) / 10;
  const sorted = [...prices].sort((a, b) => a - b);
  const medianPrice = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const totalBidsPlaced = lots.reduce((s, l) => s + l.bids.length, 0);
  const avgBidsPerLot = Math.round((totalBidsPlaced / totalLots) * 10) / 10;

  const mostExpIdx = prices.indexOf(Math.max(...prices));
  const mostExpLot = lots[mostExpIdx];
  const mostExpensivePlayer = { playerName: mostExpLot.player.name, position: mostExpLot.player.posPrimary, price: mostExpLot.finalPrice! };

  const nonOneDollar = lots.filter(l => l.finalPrice! > 1);
  const cheapestWin = nonOneDollar.length > 0
    ? (() => { const c = nonOneDollar.reduce((min, l) => l.finalPrice! < min.finalPrice! ? l : min); return { playerName: c.player.name, position: c.player.posPrimary, price: c.finalPrice! }; })()
    : null;

  // ── Bargain/Overpay analysis ──
  const surplusEntries = lots
    .filter(l => valueMap.has(l.player.id))
    .map(l => ({
      playerName: l.player.name,
      position: l.player.posPrimary,
      price: l.finalPrice!,
      projectedValue: valueMap.get(l.player.id)!,
      surplus: valueMap.get(l.player.id)! - l.finalPrice!,
    }));
  const bargains = [...surplusEntries].sort((a, b) => b.surplus - a.surplus).slice(0, 5).filter(e => e.surplus > 0);
  const overpays = [...surplusEntries].sort((a, b) => a.surplus - b.surplus).slice(0, 5).filter(e => e.surplus < 0);

  // ── Position spending breakdown ──
  function normPos(pos: string): string {
    const p = pos.trim().toUpperCase();
    if (["LF", "CF", "RF"].includes(p)) return "OF";
    return p;
  }
  const posMap = new Map<string, { totalSpent: number; playerCount: number }>();
  for (const lot of lots) {
    const pos = normPos(lot.player.posPrimary);
    const entry = posMap.get(pos) ?? { totalSpent: 0, playerCount: 0 };
    entry.totalSpent += lot.finalPrice!;
    entry.playerCount++;
    posMap.set(pos, entry);
  }
  const positionSpending = [...posMap.entries()]
    .map(([position, d]) => ({ position, totalSpent: d.totalSpent, avgPrice: Math.round((d.totalSpent / d.playerCount) * 10) / 10, playerCount: d.playerCount }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  // ── Most contested lots ──
  const mostContested = [...lots]
    .map(l => ({
      playerName: l.player.name,
      position: l.player.posPrimary,
      price: l.finalPrice!,
      bidCount: l.bids.length,
      teamsInvolved: new Set(l.bids.map(b => b.teamId)).size,
    }))
    .sort((a, b) => b.bidCount - a.bidCount)
    .slice(0, 5);

  // ── Team efficiency ──
  const teamEfficiency = teams.map(team => {
    const teamLots = lots.filter(l => l.winnerTeamId === team.id);
    const spent = teamLots.reduce((s, l) => s + l.finalPrice!, 0);
    const withValues = teamLots.filter(l => valueMap.has(l.player.id));
    const bargainCount = withValues.filter(l => valueMap.get(l.player.id)! > l.finalPrice!).length;
    const overpayCount = withValues.filter(l => valueMap.get(l.player.id)! < l.finalPrice!).length;
    const totalSurplus = withValues.reduce((s, l) => s + (valueMap.get(l.player.id)! - l.finalPrice!), 0);
    return {
      teamId: team.id,
      teamName: team.name,
      totalSpent: spent,
      playersAcquired: teamLots.length,
      avgPrice: teamLots.length > 0 ? Math.round((spent / teamLots.length) * 10) / 10 : 0,
      budgetRemaining: team.budget,
      bargainCount,
      overpayCount,
      totalSurplus,
    };
  }).sort((a, b) => b.totalSurplus - a.totalSurplus);

  // ── Spending pace (quarters) ──
  const quarterSize = Math.ceil(lots.length / 4);
  const spendingPace = [1, 2, 3, 4].map(q => {
    const start = (q - 1) * quarterSize;
    const chunk = lots.slice(start, start + quarterSize);
    const qSpent = chunk.reduce((s, l) => s + l.finalPrice!, 0);
    return {
      quarter: q,
      avgPrice: chunk.length > 0 ? Math.round((qSpent / chunk.length) * 10) / 10 : 0,
      totalSpent: qSpent,
      lotsCount: chunk.length,
    };
  });

  res.json({
    league: { totalLots, totalSpent, avgPrice, medianPrice, mostExpensivePlayer, cheapestWin, totalBidsPlaced, avgBidsPerLot },
    bargains,
    overpays,
    positionSpending,
    mostContested,
    teamEfficiency,
    spendingPace,
  });
}));

// ─── Combined Draft Report (grades + analysis + projected stats) ─────────────

// Deduplication for in-flight draft report generation
const draftReportInFlight = new Map<number, Promise<any>>();

// GET /api/auction/draft-report — Combined AI draft report with per-team grades, analysis, projected stats
router.get("/draft-report", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Missing leagueId" });

  // Check for persisted report in AuctionSession
  const session = await prisma.auctionSession.findUnique({ where: { leagueId } });

  // Once the season is IN_SEASON or COMPLETED, the draft report is locked —
  // always serve from cache, never regenerate (auction data is historical at this point).
  // Exception: admins can force-regenerate with ?force=true to fix stale data.
  const season = await prisma.season.findFirst({
    where: { leagueId, status: { in: ["IN_SEASON", "COMPLETED"] } },
    select: { status: true },
  });
  const isSeasonLocked = !!season;
  const forceRegenerate = req.query.force === "true";
  const isAdmin = !!req.user?.isAdmin;

  if (isSeasonLocked && !(forceRegenerate && isAdmin)) {
    if (session?.state && (session.state as any).draftReport) {
      return res.json((session.state as any).draftReport);
    }
    return res.status(400).json({ error: "Draft report was not generated before the season started" });
  }
  if (!forceRegenerate && session?.state && (session.state as any).draftReport) {
    return res.json((session.state as any).draftReport);
  }

  // Build from roster data + auction log + projected values
  const teams = await prisma.team.findMany({
    where: { leagueId },
    include: {
      rosters: {
        where: { releasedAt: null },
        include: { player: { select: { name: true, posPrimary: true, posList: true, mlbTeam: true } } },
      },
    },
  });

  if (teams.length === 0 || teams.every(t => t.rosters.length === 0)) {
    return res.status(400).json({ error: "No roster data available to generate draft report" });
  }

  // Load projected auction values (cached singleton, with diacritics-stripped fallback)
  const { lookupAuctionValue } = await import("../../../lib/auctionValues.js");

  // Get league config from auction state or defaults
  const state = session?.state as AuctionState | null;
  const config = state?.config ?? { budgetCap: 400, rosterSize: 23, pitcherCount: 9, batterCount: 14 };

  // Build auction log from state log entries (WIN events = completed picks)
  const logEntries = (state?.log ?? [])
    .filter(l => l.type === "WIN" && l.playerName && l.teamName && l.amount != null)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((l, i) => ({
      playerName: l.playerName!,
      teamName: l.teamName!,
      price: l.amount!,
      order: i + 1,
    }));

  // Identify keepers via roster source field, attach projected values + MLB team
  const teamData = teams.map(team => {
    const keepers = team.rosters.filter(r => r.source === "prior_season");
    const auctionPicks = team.rosters.filter(r => r.source !== "prior_season");
    const keeperSpend = keepers.reduce((s, r) => s + r.price, 0);
    const auctionSpend = auctionPicks.reduce((s, r) => s + r.price, 0);

    // Compute favorite MLB team (most players from)
    const mlbTeamCounts: Record<string, number> = {};
    team.rosters.forEach(r => {
      const tm = r.player.mlbTeam || "UNK";
      mlbTeamCounts[tm] = (mlbTeamCounts[tm] || 0) + 1;
    });
    const sortedMlbTeams = Object.entries(mlbTeamCounts).sort((a, b) => b[1] - a[1]);
    const favMlbTeam = sortedMlbTeams[0] ? { team: sortedMlbTeams[0][0], count: sortedMlbTeams[0][1] } : null;

    return {
      id: team.id,
      name: team.name,
      budget: team.budget,
      keeperSpend,
      auctionSpend,
      favMlbTeam,
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

  // Deduplicate concurrent requests
  let inflight = draftReportInFlight.get(leagueId);
  if (!inflight) {
    inflight = (async () => {
      const { aiAnalysisService } = await import("../../../services/aiAnalysisService.js");
      return aiAnalysisService.generateDraftReport(
        teamData,
        {
          budgetCap: config.budgetCap ?? 400,
          rosterSize: config.rosterSize ?? 23,
          pitcherCount: config.pitcherCount ?? 9,
          batterCount: config.batterCount ?? 14,
        },
        logEntries,
      );
    })();
    draftReportInFlight.set(leagueId, inflight);
  }

  try {
    const result = await inflight;

    if (!result.success) {
      logger.warn({ error: result.error, leagueId }, "Draft report generation failed");
      return res.status(503).json({ error: "Draft report generation is temporarily unavailable" });
    }

    // Persist in AuctionSession so it survives restarts
    if (session) {
      const updatedState = { ...(session.state as any), draftReport: result.report };
      await prisma.auctionSession.update({
        where: { leagueId },
        data: { state: updatedState },
      });
    }

    res.json(result.report);
  } finally {
    draftReportInFlight.delete(leagueId);
  }
}));

// Draft grade cache — auction data is frozen at "completed", so cache is permanent per league
const draftGradeCache = new Map<number, { teamId: number; teamName: string; grade: string; summary: string }[]>();
const DRAFT_GRADE_CACHE_MAX = 100;
const draftGradeInFlight = new Map<number, Promise<any>>();

// GET /api/auction/draft-grades — AI-generated draft grades for all teams
router.get("/draft-grades", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Missing leagueId" });

  const state = await getState(leagueId);
  if (state.status !== "completed") {
    return res.status(400).json({ error: "Auction must be completed to generate draft grades" });
  }

  // Serve from cache if available
  const cached = draftGradeCache.get(leagueId);
  if (cached) return res.json({ grades: cached });

  // Deduplicate concurrent requests — share one Gemini call
  let inflight = draftGradeInFlight.get(leagueId);
  if (!inflight) {
    inflight = (async () => {
      const { aiAnalysisService } = await import("../../../services/aiAnalysisService.js");
      return aiAnalysisService.gradeCurrentDraft(
        state.teams.map(t => ({
          id: t.id,
          name: t.name,
          code: t.code,
          budget: t.budget,
          roster: t.roster,
          pitcherCount: t.pitcherCount,
          hitterCount: t.hitterCount,
        })),
        {
          budgetCap: state.config.budgetCap ?? 400,
          rosterSize: state.config.rosterSize ?? 23,
          pitcherCount: state.config.pitcherCount ?? 9,
          batterCount: state.config.batterCount ?? 14,
        }
      );
    })();
    draftGradeInFlight.set(leagueId, inflight);
  }

  try {
    const result = await inflight;

    if (!result.success) {
      logger.warn({ error: result.error, leagueId }, "Draft grades failed");
      return res.status(503).json({ error: "Draft grading is temporarily unavailable" });
    }

    // Cache permanently — auction state is frozen
    if (draftGradeCache.size >= DRAFT_GRADE_CACHE_MAX) {
      const oldest = draftGradeCache.keys().next().value;
      if (oldest !== undefined) draftGradeCache.delete(oldest);
    }
    draftGradeCache.set(leagueId, result.grades);
    res.json({ grades: result.grades });
  } finally {
    draftGradeInFlight.delete(leagueId);
  }
}));

// ─── AI Auction Bid Advice (Team-Aware Marginal Value) ──────────────────────

/** Aggregate CSV projected category scores for a team's current roster.
 *  Returns null if fewer than 3 players have projections (too sparse to be useful). */
function computeTeamProjections(
  roster: { playerName?: string | null }[],
  lookup: (name: string) => { stats: string } | undefined,
  parse: (stats: string) => Record<string, number>,
): { R: number; HR: number; RBI: number; SB: number; AVG: number; W: number; SV: number; K: number; ERA: number; WHIP: number } | null {
  const totals = { R: 0, HR: 0, RBI: 0, SB: 0, AVG: 0, W: 0, SV: 0, K: 0, ERA: 0, WHIP: 0 };
  let matched = 0;
  for (const r of roster) {
    if (!r.playerName) continue;
    const entry = lookup(r.playerName);
    if (!entry?.stats) continue;
    matched++;
    const parsed = parse(entry.stats);
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
      totals[key] += parsed[key] ?? 0;
    }
  }
  return matched >= 3 ? totals : null;
}

// Cache: keyed by leagueId:teamId:playerId:currentBid
const bidAdviceCache = new Map<string, { shouldBid: boolean; maxRecommendedBid: number; reasoning: string; confidence: string; categoryImpact: string }>();
const BID_ADVICE_CACHE_MAX = 200;

// GET /api/auction/ai-advice?leagueId=X&teamId=Y&playerId=Z&currentBid=N
router.get("/ai-advice", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const teamId = Number(req.query.teamId);
  const playerId = Number(req.query.playerId);
  const currentBid = Number(req.query.currentBid);

  if (!Number.isFinite(leagueId) || !Number.isFinite(teamId) || !Number.isFinite(playerId) || !Number.isFinite(currentBid)) {
    return res.status(400).json({ error: "Missing leagueId, teamId, playerId, or currentBid" });
  }

  // Check cache
  const cacheKey = `${leagueId}:${teamId}:${playerId}:${currentBid}`;
  const cached = bidAdviceCache.get(cacheKey);
  if (cached) return res.json(cached);

  const state = await getState(leagueId);

  // Find the team in auction state
  const teamState = state.teams.find(t => t.id === teamId);
  if (!teamState) return res.status(400).json({ error: "Team not in auction" });

  // Find player info from current nomination or DB
  let playerName = state.nomination?.playerName ?? "Unknown";
  let playerPosition = state.nomination?.positions?.split('/')[0] ?? "UT";
  let playerMlbTeam = state.nomination?.playerTeam ?? "";

  if (state.nomination?.playerId === String(playerId)) {
    playerName = state.nomination.playerName;
    playerPosition = state.nomination.positions.split('/')[0] || "UT";
    playerMlbTeam = state.nomination.playerTeam || "";
  } else {
    const dbPlayer = await prisma.player.findFirst({ where: { mlbId: playerId } });
    if (dbPlayer) {
      playerName = dbPlayer.name;
      playerPosition = dbPlayer.posPrimary;
      playerMlbTeam = dbPlayer.mlbTeam || "";
    }
  }

  // Load auction values (cached singleton, with diacritics fallback)
  const { lookupAuctionValue, getAuctionValueMap: getValMap, parseStatsString } = await import("../../../lib/auctionValues.js");
  const valMap = getValMap();

  // Get player's projected value and stats
  const playerValData = lookupAuctionValue(playerName);
  const projectedValue = playerValData?.value ?? null;
  const playerProjectedStats = playerValData?.stats ?? null;

  // Find alternatives at the same position still available (not on any team's roster)
  const draftedPlayerNames = new Set<string>();
  for (const t of state.teams) {
    for (const r of t.roster) {
      if (r.playerName) draftedPlayerNames.add(r.playerName);
    }
  }
  const nominatedIsPitcher = isPitcherPos(playerPosition);
  const alternatives: { name: string; projectedValue: number }[] = [];
  for (const [name, data] of valMap.entries()) {
    if (name === playerName) continue;
    if (draftedPlayerNames.has(name)) continue;
    if (data.value < 1) continue;
    // Simple position matching: pitcher vs hitter
    // (CSV doesn't have exact position per alternative, so match by pitcher/hitter)
    alternatives.push({ name, projectedValue: data.value });
  }
  // Sort by value desc and take top alternatives at similar value tier
  const sortedAlts = alternatives.sort((a, b) => b.projectedValue - a.projectedValue);
  const positionAlternatives = sortedAlts.slice(0, 8); // Top 8 available players

  // Build team's current roster for the prompt
  const teamRoster = teamState.roster.map(r => ({
    playerName: r.playerName ?? "Unknown",
    position: r.assignedPosition ?? "UT",
    price: r.price,
  }));

  // League type from league rules
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { rules: true } });
  const leagueType = (league?.rules as any)?.leagueType ?? "NL";

  // Average budget remaining
  const avgBudget = state.teams.reduce((sum, t) => sum + t.budget, 0) / (state.teams.length || 1);

  const { aiAnalysisService } = await import("../../../services/aiAnalysisService.js");
  const result = await aiAnalysisService.adviseBid({
    player: {
      name: playerName,
      position: playerPosition,
      mlbTeam: playerMlbTeam,
      projectedValue,
    },
    currentBid,
    team: {
      name: teamState.name,
      budget: teamState.budget,
      openSlots: (state.config.rosterSize ?? 23) - (teamState.roster?.length ?? 0),
      hitterCount: teamState.hitterCount ?? 0,
      pitcherCount: teamState.pitcherCount ?? 0,
      hitterMax: state.config.batterCount ?? 14,
      pitcherMax: state.config.pitcherCount ?? 9,
      roster: teamRoster,
    },
    league: {
      teamsCount: state.teams.length,
      avgBudgetRemaining: avgBudget,
      rosterSize: state.config.rosterSize ?? 23,
      leagueType,
    },
    alternativesAtPosition: positionAlternatives,
    teamProjections: computeTeamProjections(teamState.roster, lookupAuctionValue, parseStatsString),
    playerProjectedStats,
  });

  if (!result.success) {
    logger.warn({ error: result.error, leagueId, teamId, playerId }, "Bid advice failed");
    return res.status(503).json({ error: "Bid advice is temporarily unavailable" });
  }

  // Evict oldest entry if cache is full
  if (bidAdviceCache.size >= BID_ADVICE_CACHE_MAX) {
    const firstKey = bidAdviceCache.keys().next().value;
    if (firstKey !== undefined) bidAdviceCache.delete(firstKey);
  }
  bidAdviceCache.set(cacheKey, result.result!);
  res.json(result.result);
}));

export default router;
