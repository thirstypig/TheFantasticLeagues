// server/src/routes/transactions.ts
import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireSeasonStatus } from "../../middleware/seasonGuard.js";
import { logger } from "../../lib/logger.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { assertRosterLimit } from "../../lib/rosterGuard.js";
import { resolveEffectiveDate, assertNoOwnershipConflict } from "../../lib/rosterWindow.js";

// ISO date (YYYY-MM-DD) or full ISO datetime. Commissioner/admin only;
// validated per-route. Null/omit = default to nextDayEffective().
const effectiveDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}($|T)/, "effectiveDate must be YYYY-MM-DD or ISO datetime")
  .optional();

const dropSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  effectiveDate: effectiveDateSchema,
});

const claimSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive().optional(),
  mlbId: z.union([z.number(), z.string()]).optional(),
  dropPlayerId: z.number().int().positive().optional(),
  effectiveDate: effectiveDateSchema,
}).refine((d) => d.playerId || d.mlbId, { message: "playerId or mlbId required" });

const router = Router();

/**
 * GET /api/transactions
 * Requires leagueId query param + membership check
 */
router.get("/transactions", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  const skip = req.query.skip ? Number(req.query.skip) : 0;
  const take = req.query.take ? Number(req.query.take) : 50;

  const where: Prisma.TransactionEventWhereInput = { leagueId };
  if (teamId) where.teamId = teamId;

  const [total, transactions] = await Promise.all([
    prisma.transactionEvent.count({ where }),
    prisma.transactionEvent.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip,
      take,
      include: {
        team: { select: { name: true } },
        player: { select: { name: true } },
      },
    }),
  ]);

  return res.json({ transactions, total, skip, take });
}));

/**
 * POST /api/transactions/claim
 * Claims a player for a team. Commissioner-only per league rules.
 */
router.post("/transactions/claim", requireAuth, validateBody(claimSchema), requireSeasonStatus(["IN_SEASON"]), asyncHandler(async (req, res) => {
  const { leagueId, teamId, dropPlayerId, effectiveDate: effDateRaw } = req.body;

  // Commissioner-only: verify user is commissioner of this league or site admin
  const isPrivileged = req.user!.isAdmin;
  if (!isPrivileged) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (!membership || membership.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Add/Drop is commissioner-only" });
    }
  }

  let effective: Date;
  try {
    effective = resolveEffectiveDate(effDateRaw);
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Invalid effectiveDate",
    });
  }
  const isBackdated = effDateRaw != null;

  let { playerId } = req.body;
  const { mlbId } = req.body;

  // 1. Resolve Player Identity (Lazy Create if needed)
  if (!playerId && mlbId) {
    const mlbIdNum = Number(mlbId);
    let player = await prisma.player.findFirst({ where: { mlbId: mlbIdNum }});

    if (!player) {
      return res.status(404).json({ error: `Player with MLB ID ${mlbId} not found in database.` });
    }
    playerId = player.id;
  }

  if (!playerId) {
    return res.status(400).json({ error: "Missing playerId or mlbId" });
  }

  // 2. Current-owner check
  //    Live claim (no backdate): refuse if already active on another team.
  //    Backdated claim: commissioner god-mode — we'll auto-release from the
  //    current owner at `effective` inside the transaction (unless it's the
  //    same team being claimed). Cross-team reassign gets the same rule.
  const existingRoster = await prisma.roster.findFirst({
    where: { playerId, team: { leagueId }, releasedAt: null },
    include: { team: true }
  });

  if (existingRoster && !isBackdated && existingRoster.teamId !== teamId) {
    return res.status(400).json({ error: `Player is already on team: ${existingRoster.team.name}` });
  }
  if (existingRoster && existingRoster.teamId === teamId) {
    return res.status(400).json({ error: `Player is already on this team's active roster` });
  }

  // 3. Look up league season for transaction records
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();

  // 4. Perform Transaction (Atomic) — lock team row to prevent concurrent roster limit bypass
  try {
  await prisma.$transaction(async (tx) => {
    // Acquire row-level lock on the team to serialize concurrent claims
    await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;

    // Commissioner god-mode: if backdating and the player is on another team,
    // release them first at `effective`. For live (non-backdated) claims this
    // branch doesn't run (we 400'd above).
    const excludeRosterIds: number[] = [];
    if (existingRoster && existingRoster.teamId !== teamId) {
      await tx.roster.update({
        where: { id: existingRoster.id },
        data: { releasedAt: effective, source: "COMMISSIONER_REASSIGN" },
      });
      excludeRosterIds.push(existingRoster.id);
      await tx.transactionEvent.create({
        data: {
          rowHash: `REASSIGN-DROP-${crypto.randomUUID()}-${playerId}`,
          leagueId,
          season,
          effDate: effective,
          submittedAt: new Date(),
          teamId: existingRoster.teamId,
          playerId,
          transactionRaw: `Commissioner reassign — released from ${existingRoster.team.name}`,
          transactionType: 'DROP',
        },
      });
    }

    // Overlap guard — rejects if the new window would collide with a historical
    // Roster entry (including any released rows that span the target date).
    await assertNoOwnershipConflict(tx, {
      leagueId,
      playerId,
      acquiredAt: effective,
      releasedAt: null,
      excludeRosterIds,
    });
    await assertRosterLimit(tx, teamId, !!dropPlayerId);

    const player = await tx.player.findUnique({ where: { id: playerId }, select: { id: true, name: true, posPrimary: true, mlbId: true, mlbTeam: true } });
    const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);
    const primaryPos = (player?.posPrimary ?? "UT").toUpperCase();
    const assignedPos = PITCHER_POS.has(primaryPos) ? "P" : primaryPos;

    await tx.roster.create({
      data: { teamId, playerId, source: 'waiver_claim', acquiredAt: effective, assignedPosition: assignedPos }
    });
    const rowHash = `CLAIM-${crypto.randomUUID()}-${playerId}`;

    await tx.transactionEvent.create({
      data: {
        rowHash,
        leagueId,
        season,
        effDate: effective,
        submittedAt: new Date(),
        teamId,
        playerId,
        transactionRaw: `Claimed ${player?.name}`,
        transactionType: 'ADD'
      }
    });

    if (dropPlayerId) {
      const dropRoster = await tx.roster.findFirst({
        where: { teamId, playerId: dropPlayerId, releasedAt: null }
      });

      if (dropRoster) {
        await tx.roster.update({ where: { id: dropRoster.id }, data: { releasedAt: effective, source: "DROP" } });

        const dropPlayer = await tx.player.findUnique({ where: { id: dropPlayerId } });
        await tx.transactionEvent.create({
          data: {
            rowHash: `DROP-${crypto.randomUUID()}-${dropPlayerId}`,
            leagueId,
            season,
            effDate: effective,
            submittedAt: new Date(),
            teamId,
            playerId: dropPlayerId,
            transactionRaw: `Dropped ${dropPlayer?.name}`,
            transactionType: 'DROP'
          }
        });
      }
    }
  }, { timeout: 30_000 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Claim failed";
    // Guard errors (roster limit, player unavailable, window conflict) are user errors, not server errors
    if (msg.includes("Roster limit") || msg.includes("already on") || msg.includes("Ownership conflict") || msg.includes("Invalid effectiveDate")) {
      return res.status(400).json({ error: msg });
    }
    throw err; // Re-throw unexpected errors for asyncHandler
  }

  writeAuditLog({
    userId: req.user!.id,
    action: "TRANSACTION_CLAIM",
    resourceType: "Transaction",
    metadata: {
      leagueId, teamId, playerId,
      dropPlayerId: dropPlayerId || null,
      effectiveDate: effective.toISOString(),
      backdated: isBackdated,
      reassignedFromTeamId: existingRoster && existingRoster.teamId !== teamId ? existingRoster.teamId : null,
    },
  });

  return res.json({ success: true, playerId });
}));

/**
 * POST /api/transactions/drop
 * Drops a player from a team roster. Commissioner-only.
 */
router.post("/transactions/drop", requireAuth, validateBody(dropSchema), requireSeasonStatus(["IN_SEASON"]), asyncHandler(async (req, res) => {
  const { leagueId, teamId, playerId, effectiveDate: effDateRaw } = req.body;

  // Commissioner-only check
  if (!req.user!.isAdmin) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (!membership || membership.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Drop is commissioner-only" });
    }
  }

  // Verify player is on team roster
  const rosterEntry = await prisma.roster.findFirst({
    where: { teamId, playerId, releasedAt: null },
  });
  if (!rosterEntry) {
    return res.status(400).json({ error: "Player is not on this team's active roster" });
  }

  let effective: Date;
  try {
    effective = resolveEffectiveDate(effDateRaw);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid effectiveDate" });
  }
  // Guard: backdated releasedAt must be at or after acquiredAt.
  if (effective <= rosterEntry.acquiredAt) {
    return res.status(400).json({
      error: `effectiveDate (${effective.toISOString().slice(0, 10)}) must be after the player was acquired (${rosterEntry.acquiredAt.toISOString().slice(0, 10)})`,
    });
  }

  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();

  await prisma.$transaction(async (tx) => {
    await tx.roster.update({ where: { id: rosterEntry.id }, data: { releasedAt: effective, source: "DROP" } });

    const player = await tx.player.findUnique({ where: { id: playerId } });
    await tx.transactionEvent.create({
      data: {
        rowHash: `DROP-${crypto.randomUUID()}-${playerId}`,
        leagueId,
        season,
        effDate: effective,
        submittedAt: new Date(),
        teamId,
        playerId,
        transactionRaw: `Dropped ${player?.name}`,
        transactionType: 'DROP'
      }
    });
  }, { timeout: 30_000 });

  writeAuditLog({
    userId: req.user!.id,
    action: "TRANSACTION_DROP",
    resourceType: "Transaction",
    metadata: {
      leagueId, teamId, playerId,
      effectiveDate: effective.toISOString(),
      backdated: effDateRaw != null,
    },
  });

  return res.json({ success: true, playerId });
}));

export const transactionsRouter = router;
export default transactionsRouter;
