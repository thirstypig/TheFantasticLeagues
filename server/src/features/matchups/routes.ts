// server/src/features/matchups/routes.ts
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireCommissionerOrAdmin, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";
import { generateRoundRobinSchedule } from "./services/scheduleGenerator.js";
import { scoreH2HCategories, scoreH2HPoints } from "./services/matchupScoring.js";

const router = Router();

// POST /api/matchups/generate — Generate schedule (commissioner only)
const generateSchema = z.object({
  leagueId: z.number().int().positive(),
  totalWeeks: z.number().int().min(1).max(30).default(20),
});

router.post("/generate", requireAuth, validateBody(generateSchema), asyncHandler(async (req, res) => {
  const { leagueId, totalWeeks } = req.body;

  // Verify commissioner
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId: req.user!.id } },
  });
  if (!membership || (membership.role !== "COMMISSIONER" && !req.user!.isAdmin)) {
    return res.status(403).json({ error: "Commissioner access required" });
  }

  // Get all teams
  const teams = await prisma.team.findMany({ where: { leagueId }, select: { id: true, name: true } });
  if (teams.length < 2) return res.status(400).json({ error: "Need at least 2 teams" });

  const teamIds = teams.map(t => t.id);
  const schedule = generateRoundRobinSchedule(teamIds, totalWeeks);

  // Clear existing matchups for this league
  await prisma.matchup.deleteMany({ where: { leagueId } });

  // Create matchups in bulk
  await prisma.matchup.createMany({
    data: schedule.map(m => ({
      leagueId,
      week: m.week,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
    })),
  });

  logger.info({ leagueId, weeks: totalWeeks, matchups: schedule.length }, "H2H schedule generated");
  res.json({ success: true, matchups: schedule.length, weeks: totalWeeks });
}));

// GET /api/matchups?leagueId=X&week=Y — Get matchups for a specific week
router.get("/", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const week = req.query.week ? Number(req.query.week) : undefined;

  const where: any = { leagueId };
  if (week) where.week = week;

  const matchups = await prisma.matchup.findMany({
    where,
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
    },
    orderBy: [{ week: "asc" }, { id: "asc" }],
  });

  res.json({ matchups });
}));

// GET /api/matchups/my-matchup?leagueId=X&week=Y — Get current user's matchup
router.get("/my-matchup", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const week = Number(req.query.week);
  if (!Number.isFinite(week)) return res.status(400).json({ error: "Missing week" });

  // Find user's team
  const team = await prisma.team.findFirst({
    where: { leagueId, OR: [{ ownerUserId: req.user!.id }, { ownerships: { some: { userId: req.user!.id } } }] },
    select: { id: true },
  });
  if (!team) return res.status(404).json({ error: "No team found" });

  const matchup = await prisma.matchup.findFirst({
    where: { leagueId, week, OR: [{ teamAId: team.id }, { teamBId: team.id }] },
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
    },
  });

  res.json({ matchup, myTeamId: team.id });
}));

// POST /api/matchups/score — Score a week's matchups
const scoreSchema = z.object({
  leagueId: z.number().int().positive(),
  week: z.number().int().positive(),
  periodId: z.number().int().positive(),
});

router.post("/score", requireAuth, validateBody(scoreSchema), asyncHandler(async (req, res) => {
  const { leagueId, week, periodId } = req.body;

  // Get league scoring format
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { scoringFormat: true } });
  if (!league) return res.status(404).json({ error: "League not found" });

  const matchups = await prisma.matchup.findMany({ where: { leagueId, week } });
  if (matchups.length === 0) return res.status(404).json({ error: "No matchups for this week" });

  const results: { matchupId: number; result: any }[] = [];

  for (const matchup of matchups) {
    let result;
    if (league.scoringFormat === "H2H_POINTS") {
      // Default point values — in production, read from league rules
      const pointValues: Record<string, number> = { R: 1, HR: 4, RBI: 1, SB: 2, W: 5, SV: 5, K: 1 };
      result = await scoreH2HPoints(matchup.teamAId, matchup.teamBId, periodId, pointValues);
    } else {
      result = await scoreH2HCategories(matchup.teamAId, matchup.teamBId, periodId);
    }

    await prisma.matchup.update({
      where: { id: matchup.id },
      data: { result: result as any },
    });

    results.push({ matchupId: matchup.id, result });
  }

  logger.info({ leagueId, week, scored: results.length }, "Matchups scored");
  res.json({ success: true, results });
}));

// GET /api/matchups/standings?leagueId=X — H2H standings (W-L-T record)
router.get("/standings", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);

  const matchups = await prisma.matchup.findMany({
    where: { leagueId, result: { not: Prisma.JsonNull } },
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
    },
  });

  // Compute W-L-T for each team
  const records: Record<number, { teamId: number; teamName: string; wins: number; losses: number; ties: number; points: number }> = {};

  const getOrCreate = (id: number, name: string) => {
    if (!records[id]) records[id] = { teamId: id, teamName: name, wins: 0, losses: 0, ties: 0, points: 0 };
    return records[id];
  };

  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { scoringFormat: true } });
  const isPoints = league?.scoringFormat === "H2H_POINTS";

  for (const m of matchups) {
    const result = m.result as any;
    if (!result) continue;

    const recA = getOrCreate(m.teamAId, m.teamA.name);
    const recB = getOrCreate(m.teamBId, m.teamB.name);

    if (isPoints) {
      const ptsA = result.teamA?.totalPoints ?? 0;
      const ptsB = result.teamB?.totalPoints ?? 0;
      recA.points += ptsA;
      recB.points += ptsB;
      if (ptsA > ptsB) { recA.wins++; recB.losses++; }
      else if (ptsB > ptsA) { recB.wins++; recA.losses++; }
      else { recA.ties++; recB.ties++; }
    } else {
      // H2H Categories: count category wins as the matchup result
      const catA = result.teamA?.catWins ?? 0;
      const catB = result.teamB?.catWins ?? 0;
      // Each individual category win/loss counts toward season record
      recA.wins += catA;
      recA.losses += result.teamA?.catLosses ?? 0;
      recA.ties += result.teamA?.catTies ?? 0;
      recB.wins += catB;
      recB.losses += result.teamB?.catLosses ?? 0;
      recB.ties += result.teamB?.catTies ?? 0;
    }
  }

  const standings = Object.values(records)
    .map(r => ({
      ...r,
      pct: (r.wins + r.losses + r.ties) > 0
        ? Math.round(((r.wins + 0.5 * r.ties) / (r.wins + r.losses + r.ties)) * 1000) / 1000
        : 0,
    }))
    .sort((a, b) => b.pct - a.pct || b.wins - a.wins);

  // Add GB (games back from leader)
  const leader = standings[0];
  const result = standings.map((s, i) => ({
    ...s,
    rank: i + 1,
    gb: i === 0 ? 0 : Math.round(((leader.wins - s.wins) + (s.losses - leader.losses)) / 2 * 10) / 10,
  }));

  res.json({ standings: result });
}));

export const matchupsRouter = router;
