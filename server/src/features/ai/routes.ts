import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import { Prisma } from "@prisma/client";

const router = Router();

router.get("/insights/history", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 30), 1), 100);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Missing leagueId" });

  const [insights, trades] = await Promise.all([
    prisma.aiInsight.findMany({
      where: { leagueId },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.trade.findMany({
      where: { leagueId, aiAnalysis: { not: Prisma.JsonNull } },
      include: { proposer: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const rows = [
    ...insights.map((row) => ({
      id: `insight-${row.id}`,
      type: row.type,
      weekKey: row.weekKey,
      generatedAt: row.createdAt.toISOString(),
      teamName: row.team?.name ?? null,
      data: row.data,
    })),
    ...trades.filter((trade) => trade.aiAnalysis).map((trade) => ({
      id: `trade-${trade.id}`,
      type: "processed_trade_analysis",
      weekKey: null,
      generatedAt: trade.createdAt.toISOString(),
      teamName: trade.proposer?.name ?? null,
      data: trade.aiAnalysis,
    })),
  ]
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
    .slice(0, limit);

  res.json({ insights: rows });
}));

export const aiRouter = router;
