import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";

const router = Router();

// --- Period standings: /api/standings/period/current ---
// No stats yet for 2026 season — return empty standings with team info

router.get("/period/current", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const period = await prisma.period.findFirst({
    where: { status: "active", leagueId },
    orderBy: { endDate: "desc" },
  });

  if (!period) {
    return res.status(404).json({ error: "No active period found" });
  }

  // Return teams with zero points
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true },
    orderBy: { id: "asc" },
  });

  const standings = teams.map((t) => ({
    teamId: t.id,
    teamName: t.name,
    teamCode: t.code ?? t.name.substring(0, 3).toUpperCase(),
    points: 0,
  }));

  res.json({ periodId: period.id, data: standings });
}));

// --- Period category standings: /api/period-category-standings ---

router.get("/period-category-standings", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const periodId = req.query.periodId ? Number(req.query.periodId) : null;

  let pid = periodId;
  if (!pid) {
    const period = await prisma.period.findFirst({
      where: { status: "active", leagueId },
      orderBy: { endDate: "desc" },
    });
    pid = period?.id ?? null;
  }

  if (!pid) {
    return res.status(404).json({ error: "No active period found" });
  }

  // Return empty categories — no stats data yet
  res.json({ periodId: pid, categories: [], teamCount: 0 });
}));

// --- Season (cumulative) standings: /api/standings/season ---

router.get("/season", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  // Get all periods for this league's season
  const periods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] } },
    orderBy: { startDate: "asc" },
  });

  const periodIds = periods.map((p) => p.id);

  // Get team info from DB
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true },
    orderBy: { id: "asc" },
  });

  // Return teams with zero points across all periods
  const rows = teams.map((t) => ({
    teamId: t.id,
    teamName: t.name,
    teamCode: t.code ?? t.name.substring(0, 3).toUpperCase(),
    periodPoints: periodIds.map(() => 0),
    totalPoints: 0,
  }));

  res.json({ periodIds, rows });
}));

// --- Settlement data: /api/standings/settlement/:leagueId ---

router.get("/standings/settlement/:leagueId", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  // Get payout rules
  const rules = await prisma.leagueRule.findMany({
    where: { leagueId, category: "payouts" },
  });

  const ruleMap = new Map(rules.map(r => [r.key, r.value]));
  const entryFee = Number(ruleMap.get("entry_fee") || "0");
  const payoutPcts: Record<string, number> = {};
  for (let i = 1; i <= 8; i++) {
    const pct = Number(ruleMap.get(`payout_${i}st`) || ruleMap.get(`payout_${i}nd`) || ruleMap.get(`payout_${i}rd`) || ruleMap.get(`payout_${i}th`) || "0");
    if (pct > 0) payoutPcts[String(i)] = pct;
  }

  // Get teams with owners
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: {
      id: true,
      name: true,
      code: true,
      ownerUser: {
        select: {
          id: true,
          name: true,
          email: true,
          venmoHandle: true,
          zelleHandle: true,
          paypalHandle: true,
        },
      },
      ownerships: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              venmoHandle: true,
              zelleHandle: true,
              paypalHandle: true,
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const totalPot = entryFee * teams.length;

  const teamsData = teams.map(t => {
    // Combine legacy owner + multi-owner
    const owners: any[] = [];
    if (t.ownerUser) owners.push(t.ownerUser);
    for (const o of t.ownerships) {
      if (!owners.some(existing => existing.id === o.user.id)) {
        owners.push(o.user);
      }
    }
    return {
      id: t.id,
      name: t.name,
      code: t.code,
      owners,
    };
  });

  res.json({ leagueId, entryFee, totalPot, payoutPcts, teams: teamsData });
}));

export const standingsRouter = router;
export default standingsRouter;
