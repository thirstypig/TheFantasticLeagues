/**
 * Wire List processor — commissioner-driven consume/free reducer.
 *
 * The state machine: PENDING → LOCKED → PROCESSED.
 *
 *   PENDING:   owners freely mutate Add/Drop entries (handled in routes.ts)
 *   LOCKED:    commissioner clicks succeed/fail/skip on each Add. Each
 *              SUCCEEDED Add consumes the next PENDING Drop top-down.
 *              No roster mutation yet — outcomes are reversible.
 *   PROCESSED: roster mutations + TransactionEvents committed atomically;
 *              remaining PENDING drops marked UNUSED. No more changes.
 *
 * Why hold roster mutations until finalize: makes /revert trivial (just
 * reset DB rows), keeps the audit log clean (no "added then removed"
 * noise), and lets the commissioner finalize the entire period in one
 * atomic Prisma transaction with a coherent rollback story.
 */
import { Router } from "express";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { writeAuditLogAwait, type AuditLogParams } from "../../lib/auditLog.js";
import * as errorBuffer from "../../lib/errorBuffer.js";
import { nextDayEffective } from "../../lib/utils.js";
import { enforceRosterRules } from "../../lib/featureFlags.js";
import { isEligibleForSlot } from "../transactions/lib/positionInherit.js";
import { getLeagueStatsSource, getTeamsForSource } from "../../lib/mlbTeams.js";
import { sendPushToUser } from "../../lib/pushService.js";
import { logger } from "../../lib/logger.js";
import { FailOutcomeBodySchema, SkipOutcomeBodySchema } from "../../../../shared/api/wireList.js";

const router = Router();

// ─── Audit log helper (todo #165) ────────────────────────────────────
//
// Wire-list state-changing endpoints (lock, finalize, succeed, fail,
// skip, revert) MUST await audit-log writes so a transient DB failure
// surfaces as a structured log line — not a silent gap in the audit
// trail. The underlying mutation has already committed by the time
// this runs, so we never propagate the failure as a 5xx; the response
// stays 200 and the failure is captured server-side.
//
// /finalize additionally pushes the failure into the admin errorBuffer
// (visible via /api/admin/errors) because the mutation is irreversible
// and zero-loss visibility matters most there.
async function safeWriteAuditLog(
  params: AuditLogParams,
  opts?: { req?: import("express").Request; pushToErrorBuffer?: boolean },
): Promise<void> {
  try {
    await writeAuditLogAwait(params);
  } catch (err) {
    const requestId = (opts?.req as { requestId?: string } | undefined)?.requestId ?? "unknown";
    logger.error(
      { error: String(err), audit: params, requestId },
      "wire-list: failed to write audit log",
    );
    if (opts?.pushToErrorBuffer) {
      errorBuffer.push({
        ref: `ERR-${requestId}`,
        requestId,
        message: `Audit log write failed for ${params.action} (resourceId=${params.resourceId ?? "?"}): ${String(err)}`,
        stack: err instanceof Error ? (err.stack ?? null) : null,
        path: opts?.req?.path ?? "(unknown)",
        method: opts?.req?.method ?? "(unknown)",
        userId: opts?.req?.user?.id ?? null,
        userEmail: (opts?.req?.user as { email?: string | null } | undefined)?.email ?? null,
        statusCode: 200,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// ─── Authorization helper ────────────────────────────────────────────

/**
 * Outcome endpoints are addressed by add-entry id, but commissioner auth
 * needs leagueId. Loads the entry, derives leagueId, then runs the same
 * commissioner check `requireCommissionerOrAdmin` would do — fail-closed.
 */
async function loadAddEntryAsCommissioner(
  req: import("express").Request,
  res: import("express").Response,
  addId: number,
): Promise<{
  id: number;
  periodId: number;
  teamId: number;
  playerId: number;
  outcome: string;
  consumedDropEntryId: number | null;
  reason: string | null;
  period: { id: number; leagueId: number; createdAt: Date; status: string };
} | null> {
  const entry = await prisma.waiverAddEntry.findUnique({
    where: { id: addId },
    select: {
      id: true,
      periodId: true,
      teamId: true,
      playerId: true,
      outcome: true,
      consumedDropEntryId: true,
      reason: true,
      period: { select: { id: true, leagueId: true, createdAt: true, status: true } },
    },
  });
  if (!entry) {
    res.status(404).json({ error: "Add entry not found", code: "ENTRY_NOT_FOUND" });
    return null;
  }
  if (req.user!.isAdmin) return entry;

  const m = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId: entry.period.leagueId, userId: req.user!.id } },
    select: { role: true },
  });
  if (m?.role !== "COMMISSIONER") {
    res.status(403).json({ error: "Commissioner only" });
    return null;
  }
  return entry;
}

// ─── Period transitions ──────────────────────────────────────────────

// POST /api/wire-list/periods/:periodId/lock
router.post(
  "/periods/:periodId/lock",
  requireAuth,
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const period = await prisma.waiverPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, leagueId: true, status: true },
    });
    if (!period) return res.status(404).json({ error: "Period not found", code: "PERIOD_NOT_FOUND" });

    if (!req.user!.isAdmin) {
      const m = await prisma.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId: period.leagueId, userId: req.user!.id } },
        select: { role: true },
      });
      if (m?.role !== "COMMISSIONER") return res.status(403).json({ error: "Commissioner only" });
    }

    if (period.status !== "PENDING") {
      return res.status(403).json({
        error: `Period is ${period.status} — only PENDING periods can be locked`,
        code: "PERIOD_NOT_PENDING",
      });
    }

    const updated = await prisma.waiverPeriod.update({
      where: { id: periodId },
      data: { status: "LOCKED", lockedAt: new Date() },
    });
    await safeWriteAuditLog(
      {
        userId: req.user!.id,
        action: "WIRE_LIST_PERIOD_LOCK",
        resourceType: "WaiverPeriod",
        resourceId: periodId,
      },
      { req },
    );
    res.json(updated);
  }),
);

// POST /api/wire-list/periods/:periodId/finalize
router.post(
  "/periods/:periodId/finalize",
  requireAuth,
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const period = await prisma.waiverPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, leagueId: true, status: true, createdAt: true },
    });
    if (!period) return res.status(404).json({ error: "Period not found", code: "PERIOD_NOT_FOUND" });

    if (!req.user!.isAdmin) {
      const m = await prisma.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId: period.leagueId, userId: req.user!.id } },
        select: { role: true },
      });
      if (m?.role !== "COMMISSIONER") return res.status(403).json({ error: "Commissioner only" });
    }

    if (period.status !== "LOCKED") {
      return res.status(403).json({
        error: `Period is ${period.status} — only LOCKED periods can be finalized`,
        code: "PERIOD_NOT_LOCKED",
      });
    }

    // Block finalize if any Add is still PENDING — commissioner must decide every row.
    const pendingAdds = await prisma.waiverAddEntry.count({
      where: { periodId, outcome: "PENDING" },
    });
    if (pendingAdds > 0) {
      return res.status(409).json({
        error: `${pendingAdds} Add ${pendingAdds === 1 ? "entry has" : "entries have"} no outcome — succeed/fail/skip every row before finalizing`,
        code: "FINALIZE_BLOCKED",
        pendingAdds,
      });
    }

    const effective = nextDayEffective();
    const seasonYear = (await prisma.league.findUnique({ where: { id: period.leagueId }, select: { season: true } }))?.season ?? new Date().getFullYear();
    const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);
    const allowed = getTeamsForSource(await getLeagueStatsSource(period.leagueId));

    // ────────────────────────────────────────────────────────────────
    // Atomicity (todo #156): the period-status check, blocker
    // re-validation, and roster mutations all happen inside ONE
    // $transaction. The first write is a CAS on period.status — if a
    // concurrent finalize already flipped it to PROCESSED, our update
    // matches zero rows (count===0) and we throw a typed error that
    // rolls everything back, returning 409 PERIOD_NOT_LOCKED. Every
    // roster.updateMany for a drop also asserts count===1 — if the
    // drop player slipped off the roster between commissioner-decision
    // time and finalize, the transaction rolls back rather than
    // silently producing a ghost-add row.
    // ────────────────────────────────────────────────────────────────
    type FinalizeError = { code: "PERIOD_NOT_LOCKED" } | { code: "FINALIZE_BLOCKED"; blockers: Array<{ addId: number; code: string; detail: string }> } | { code: "DROP_NOT_ON_ROSTER"; addId: number; playerId: number };

    type Summary = {
      period: Awaited<ReturnType<typeof prisma.waiverPeriod.update>>;
      dropsConsumed: number;
      dropsUnused: number;
      addsApplied: number;
      // Per-team success names harvested INSIDE the tx so the push fan-out
      // doesn't have to re-query waiverAddEntry afterwards (todo #171).
      successesByTeam: Map<number, string[]>;
    };
    let summary: Summary;
    try {
      summary = await prisma.$transaction(async (tx) => {
        // CAS: status MUST still be LOCKED. We update the row atomically
        // (no-op data) so a concurrent finalize that already moved the
        // period to PROCESSED matches zero rows here.
        const cas = await tx.waiverPeriod.updateMany({
          where: { id: periodId, status: "LOCKED" },
          data: { status: "LOCKED" },
        });
        if (cas.count === 0) {
          const err: FinalizeError = { code: "PERIOD_NOT_LOCKED" };
          throw err;
        }

        // Re-load succeeded adds INSIDE the tx (snapshot consistency).
        // `consumedDrop.player` is included so the per-iteration body never
        // needs to re-fetch the dropped player's name (previously a
        // redundant `tx.player.findUnique` per loop — todo #160).
        const succeededAdds = await tx.waiverAddEntry.findMany({
          where: { periodId, outcome: "SUCCEEDED" },
          include: {
            consumedDrop: { include: { player: { select: { name: true } } } },
            player: { select: { id: true, name: true, posPrimary: true, posList: true } },
          },
          orderBy: [{ teamId: "asc" }, { priority: "asc" }],
        });

        // Blocker re-validation pass — tx-scoped reads only. Trade or
        // earlier roster mutation between commissioner-decision time
        // and finalize will surface here as a clean 409.
        const blockers: Array<{ addId: number; code: string; detail: string }> = [];
        for (const add of succeededAdds) {
          const stillFA = await tx.roster.findFirst({
            where: { playerId: add.playerId, releasedAt: null, team: { leagueId: period.leagueId } },
            select: { id: true },
          });
          if (stillFA) {
            blockers.push({ addId: add.id, code: "PLAYER_NOT_FA", detail: "Player is now on a roster" });
            continue;
          }
          const teamCode = (await tx.player.findUnique({ where: { id: add.playerId }, select: { mlbTeam: true } }))?.mlbTeam ?? "";
          if (allowed && teamCode && teamCode !== "FA" && !allowed.has(teamCode)) {
            blockers.push({ addId: add.id, code: "PLAYER_NOT_FA", detail: "Player's MLB team outside league source" });
            continue;
          }
          if (!add.consumedDrop) {
            blockers.push({ addId: add.id, code: "NO_DROP_AVAILABLE", detail: "Consumed drop record missing" });
            continue;
          }
          const dropRoster = await tx.roster.findFirst({
            where: { teamId: add.teamId, playerId: add.consumedDrop.playerId, releasedAt: null },
            select: { id: true },
          });
          if (!dropRoster) {
            blockers.push({ addId: add.id, code: "PLAYER_NOT_ON_TEAM", detail: "Drop player no longer on team" });
          }
        }
        if (blockers.length > 0) {
          const err: FinalizeError = { code: "FINALIZE_BLOCKED", blockers };
          throw err;
        }

        // ─── Batch I/O setup (todo #160) ─────────────────────────────
        // Preload every drop roster row in ONE query, keyed by
        // (teamId, playerId). Replaces N per-iteration findFirst calls.
        const succeededWithDrop = succeededAdds.filter((a) => a.consumedDrop);
        const dropRosters = succeededWithDrop.length === 0
          ? []
          : await tx.roster.findMany({
              where: {
                releasedAt: null,
                OR: succeededWithDrop.map((a) => ({
                  teamId: a.teamId,
                  playerId: a.consumedDrop!.playerId,
                })),
              },
              select: { id: true, teamId: true, playerId: true, assignedPosition: true },
            });
        const dropRosterByKey = new Map(
          dropRosters.map((r) => [`${r.teamId}-${r.playerId}`, r]),
        );

        // Accumulators for end-of-loop batched writes.
        const eventRows: Array<{
          rowHash: string;
          leagueId: number;
          season: number;
          effDate: Date;
          submittedAt: Date;
          teamId: number;
          playerId: number;
          transactionRaw: string;
          transactionType: string;
        }> = [];
        const processedAddIds: number[] = [];
        const processedDropIds: number[] = [];

        let dropsConsumed = 0;
        const now = new Date();
        for (const add of succeededAdds) {
          if (!add.consumedDrop) continue;
          const drop = add.consumedDrop;

          const dropRoster = dropRosterByKey.get(`${add.teamId}-${drop.playerId}`);
          if (!dropRoster) {
            const err: FinalizeError = { code: "DROP_NOT_ON_ROSTER", addId: add.id, playerId: drop.playerId };
            throw err;
          }

          // Atomic release with count assertion (todo #156): scope on
          // the preloaded id AND releasedAt: null — preserves the
          // exactly-one-row guarantee even if a parallel writer raced
          // us between preload and now.
          const released = await tx.roster.updateMany({
            where: { id: dropRoster.id, releasedAt: null },
            data: {
              releasedAt: effective,
              source: drop.dropMode === "IL_STASH" ? "WIRE_LIST_IL_STASH" : "WIRE_LIST_DROP",
            },
          });
          if (released.count !== 1) {
            const err: FinalizeError = { code: "DROP_NOT_ON_ROSTER", addId: add.id, playerId: drop.playerId };
            throw err;
          }

          // Position-inherit (matches legacy waivers/routes.ts convention):
          // under ENFORCE, take the drop's slot when it isn't IL; otherwise
          // primary-position fallback.
          const inherited = dropRoster.assignedPosition && dropRoster.assignedPosition !== "IL"
            ? dropRoster.assignedPosition
            : null;
          const primary = (add.player.posPrimary ?? "UT").toUpperCase();
          const fallback = PITCHER_POS.has(primary) ? "P" : primary;
          const assignedPos = enforceRosterRules() && inherited ? inherited : fallback;

          await tx.roster.create({
            data: {
              teamId: add.teamId,
              playerId: add.playerId,
              source: "WIRE_LIST",
              price: 0,
              acquiredAt: effective,
              assignedPosition: assignedPos,
            },
          });

          // Accumulate transaction events; flushed via createMany after
          // the loop. Uses consumedDrop.player.name (preloaded) instead
          // of a per-iteration tx.player.findUnique (todo #160).
          eventRows.push({
            rowHash: `WIRE-LIST-ADD-${crypto.randomUUID()}-${add.playerId}`,
            leagueId: period.leagueId,
            season: seasonYear,
            effDate: effective,
            submittedAt: now,
            teamId: add.teamId,
            playerId: add.playerId,
            transactionRaw: `Wire List: added ${add.player.name}`,
            transactionType: "ADD",
          });
          eventRows.push({
            rowHash: `WIRE-LIST-DROP-${crypto.randomUUID()}-${drop.playerId}`,
            leagueId: period.leagueId,
            season: seasonYear,
            effDate: effective,
            submittedAt: now,
            teamId: add.teamId,
            playerId: drop.playerId,
            transactionRaw: `Wire List: ${drop.dropMode === "IL_STASH" ? "IL-stashed" : "released"} ${drop.player?.name ?? `#${drop.playerId}`}`,
            transactionType: "DROP",
          });

          processedAddIds.push(add.id);
          processedDropIds.push(drop.id);
          dropsConsumed++;
        }

        // ─── Batched flush (todo #160) ───────────────────────────────
        if (eventRows.length > 0) {
          await tx.transactionEvent.createMany({ data: eventRows });
        }
        if (processedAddIds.length > 0) {
          await tx.waiverAddEntry.updateMany({
            where: { id: { in: processedAddIds } },
            data: { processedAt: now },
          });
        }
        if (processedDropIds.length > 0) {
          await tx.waiverDropEntry.updateMany({
            where: { id: { in: processedDropIds } },
            data: { processedAt: now },
          });
        }

      const unusedDrops = await tx.waiverDropEntry.updateMany({
        where: { periodId, status: "PENDING" },
        data: { status: "UNUSED", processedAt: new Date() },
      });

        const updatedPeriod = await tx.waiverPeriod.update({
          where: { id: periodId },
          data: { status: "PROCESSED", processedAt: new Date() },
        });

        // Group success names by team for the push fan-out (todo #171).
        // Only SUCCEEDED adds contribute names; FAILED/SKIPPED counts are
        // computed outside the tx with a leaner query.
        const successesByTeam = new Map<number, string[]>();
        for (const add of succeededAdds) {
          const list = successesByTeam.get(add.teamId);
          if (list) list.push(add.player.name);
          else successesByTeam.set(add.teamId, [add.player.name]);
        }

        return {
          period: updatedPeriod,
          dropsConsumed,
          dropsUnused: unusedDrops.count,
          addsApplied: succeededAdds.length,
          successesByTeam,
        };
      });
    } catch (err) {
      // Translate our typed in-tx errors back to HTTP responses.
      if (err && typeof err === "object" && "code" in err) {
        const e = err as FinalizeError;
        if (e.code === "PERIOD_NOT_LOCKED") {
          return res.status(409).json({
            error: "Period status changed during finalize — already finalized or no longer LOCKED",
            code: "PERIOD_NOT_LOCKED",
          });
        }
        if (e.code === "FINALIZE_BLOCKED") {
          return res.status(409).json({
            error: "One or more SUCCEEDED outcomes are no longer valid — revert and re-decide before finalizing",
            code: "FINALIZE_BLOCKED",
            blockers: e.blockers,
          });
        }
        if (e.code === "DROP_NOT_ON_ROSTER") {
          return res.status(409).json({
            error: "Drop player is no longer on this team's roster — revert the affected entry and re-decide",
            code: "FINALIZE_BLOCKED",
            blockers: [{ addId: e.addId, code: "PLAYER_NOT_ON_TEAM", detail: `Player #${e.playerId} not on roster at finalize time` }],
          });
        }
      }
      throw err;
    }

    await safeWriteAuditLog(
      {
        userId: req.user!.id,
        action: "WIRE_LIST_PERIOD_FINALIZE",
        resourceType: "WaiverPeriod",
        resourceId: periodId,
        metadata: { addsApplied: summary.addsApplied, dropsConsumed: summary.dropsConsumed, dropsUnused: summary.dropsUnused },
      },
      // /finalize is irreversible — push failures to admin errorBuffer
      // for zero-loss visibility (todo #165 recommended action).
      { req, pushToErrorBuffer: true },
    );

    // Fire-and-forget: push notifications to each team owner with their
    // outcome summary. Aggregate per-team so a team owner sees one push,
    // not one per Add. Mirrors legacy waivers/process notification flow.
    //
    // todo #171: structure is "1 lean query for fail/skip counts + 1 batch
    // teamOwnership query, group in memory" — replaces the prior shape of
    // (a) re-querying every WaiverAddEntry with player includes and
    // (b) issuing teamOwnership.findMany INSIDE a per-team loop, which
    // was a textbook N+1 (12 teams = 12 round-trips).
    const successesByTeam = summary.successesByTeam;
    (async () => {
      try {
        // Single lean query for FAILED/SKIPPED counts. Names aren't needed
        // for these — just per-team counts — so no player include.
        const nonSucceeded = await prisma.waiverAddEntry.findMany({
          where: { periodId, outcome: { in: ["FAILED", "SKIPPED"] } },
          select: { teamId: true },
        });
        const failsByTeam = new Map<number, number>();
        for (const a of nonSucceeded) {
          failsByTeam.set(a.teamId, (failsByTeam.get(a.teamId) ?? 0) + 1);
        }

        const teamIds = Array.from(
          new Set([...successesByTeam.keys(), ...failsByTeam.keys()]),
        );
        if (teamIds.length === 0) return;

        // Single teamOwnership query — replaces N per-team findMany calls.
        const ownerships = await prisma.teamOwnership.findMany({
          where: { teamId: { in: teamIds } },
          select: { teamId: true, userId: true },
        });
        const ownersByTeam = new Map<number, Set<number>>();
        for (const o of ownerships) {
          let set = ownersByTeam.get(o.teamId);
          if (!set) {
            set = new Set();
            ownersByTeam.set(o.teamId, set);
          }
          // Set dedupes (teamId, userId) — a user with multiple push
          // devices on the same team still gets one sendPushToUser call;
          // the per-device fan-out happens inside pushService.
          set.add(o.userId);
        }

        let teamsNotified = 0;
        let subscriptionsHit = 0;
        for (const teamId of teamIds) {
          const successes = successesByTeam.get(teamId) ?? [];
          const fails = failsByTeam.get(teamId) ?? 0;
          const userIds = ownersByTeam.get(teamId);
          if (!userIds || userIds.size === 0) continue;

          const title =
            successes.length > 0 ? `Wire List: ${successes.length} added`
            : fails > 0 ? "Wire List: no adds went through"
            : "Wire List: period finalized";
          const body =
            successes.length > 0
              ? `Added: ${successes.slice(0, 3).join(", ")}${successes.length > 3 ? "…" : ""}`
              : fails > 0
              ? `${fails} ${fails === 1 ? "claim" : "claims"} did not succeed.`
              : "No claims this period.";

          teamsNotified++;
          subscriptionsHit += userIds.size;
          for (const userId of userIds) {
            sendPushToUser(userId, {
              title,
              body,
              tag: `wire-list-finalize-${periodId}`,
              url: `/teams/${teamId}/wire-list`,
            }, "waiverResult").catch((err) =>
              logger.warn({ err, userId }, "Wire-list finalize push failed"),
            );
          }
        }

        const subscriptionsMissing = teamIds.length - teamsNotified;
        logger.info(
          { periodId, teamsNotified, subscriptionsHit, subscriptionsMissing },
          "Wire-list finalize notifications dispatched",
        );
      } catch (err) {
        logger.warn({ err }, "Wire-list finalize notification fan-out failed");
      }
    })();

    res.json({
      period: summary.period,
      addsApplied: summary.addsApplied,
      dropsConsumed: summary.dropsConsumed,
      dropsUnused: summary.dropsUnused,
    });
  }),
);

// ─── Outcome endpoints (consume/free reducer) ────────────────────────

// POST /api/wire-list/adds/:id/succeed
router.post(
  "/adds/:id/succeed",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const entry = await loadAddEntryAsCommissioner(req, res, id);
    if (!entry) return;

    if (entry.period.status !== "LOCKED") {
      return res.status(403).json({
        error: "Outcomes can only be set on LOCKED periods",
        code: "PERIOD_NOT_LOCKED",
      });
    }
    if (entry.outcome !== "PENDING") {
      return res.status(409).json({
        error: `Entry already ${entry.outcome} — revert before changing`,
        code: "ENTRY_ALREADY_PROCESSED",
      });
    }

    // Re-validate eligibility at outcome time. State may have moved since
    // the owner submitted (e.g. earlier wire-list outcome consumed this
    // player; trade brought a player onto the roster).
    const onRoster = await prisma.roster.findFirst({
      where: { playerId: entry.playerId, releasedAt: null, team: { leagueId: entry.period.leagueId } },
      select: { id: true },
    });
    if (onRoster) {
      return res.status(409).json({ error: "Player is no longer a free agent", code: "PLAYER_NOT_FA" });
    }
    const acquired = await prisma.roster.findFirst({
      where: { teamId: entry.teamId, playerId: entry.playerId, acquiredAt: { gt: entry.period.createdAt } },
      select: { id: true },
    });
    if (acquired) {
      return res.status(400).json({
        error: "Player was acquired during this period — not eligible",
        code: "ACQUIRED_THIS_PERIOD",
      });
    }

    // ────────────────────────────────────────────────────────────────
    // Atomicity (todo #157): everything from "find next drop" through
    // "mark drop CONSUMED + add SUCCEEDED" runs in ONE transaction.
    // The drop transition uses a status-CAS (`updateMany where status:
    // PENDING`) so a sibling add that already won the same drop gives
    // count===0, not P2002. We still also catch P2002 on the add side
    // (consumedDropEntryId @unique) as a belt-and-suspenders guard
    // and translate it to 409 DROP_RACE_LOST.
    // ────────────────────────────────────────────────────────────────
    type SucceedError =
      | { kind: "NO_DROP_AVAILABLE" }
      | { kind: "PLAYER_NOT_ON_TEAM" }
      | { kind: "POSITION_INCOMPATIBLE"; slot: string }
      | { kind: "DROP_RACE_LOST"; dropId: number };

    let updated;
    let consumedDropEntryId: number;
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Find the next PENDING drop for this team in this period.
        const nextDrop = await tx.waiverDropEntry.findFirst({
          where: { periodId: entry.periodId, teamId: entry.teamId, status: "PENDING" },
          orderBy: { priority: "asc" },
        });
        if (!nextDrop) {
          const err: SucceedError = { kind: "NO_DROP_AVAILABLE" };
          throw err;
        }

        // Re-confirm drop player is still on the team's active roster.
        const dropRoster = await tx.roster.findFirst({
          where: { teamId: entry.teamId, playerId: nextDrop.playerId, releasedAt: null },
          select: { id: true, assignedPosition: true },
        });
        if (!dropRoster) {
          const err: SucceedError = { kind: "PLAYER_NOT_ON_TEAM" };
          throw err;
        }

        // Position-eligibility re-check (matches legacy waivers gate).
        if (
          enforceRosterRules() &&
          nextDrop.dropMode !== "IL_STASH" &&
          dropRoster.assignedPosition &&
          dropRoster.assignedPosition !== "IL"
        ) {
          const addPlayer = await tx.player.findUnique({
            where: { id: entry.playerId },
            select: { posList: true },
          });
          const compatible = addPlayer
            ? isEligibleForSlot(addPlayer.posList, dropRoster.assignedPosition)
            : false;
          if (!compatible) {
            const err: SucceedError = { kind: "POSITION_INCOMPATIBLE", slot: dropRoster.assignedPosition };
            throw err;
          }
        }

        // Status-CAS on the drop: only flip if still PENDING. A
        // sibling add that already consumed this drop will see
        // count===0 here.
        const consume = await tx.waiverDropEntry.updateMany({
          where: { id: nextDrop.id, status: "PENDING" },
          data: { status: "CONSUMED" },
        });
        if (consume.count === 0) {
          const err: SucceedError = { kind: "DROP_RACE_LOST", dropId: nextDrop.id };
          throw err;
        }

        const u = await tx.waiverAddEntry.update({
          where: { id: entry.id },
          data: { outcome: "SUCCEEDED", consumedDropEntryId: nextDrop.id, reason: null },
        });
        return { updated: u, consumedDropEntryId: nextDrop.id };
      });
      updated = result.updated;
      consumedDropEntryId = result.consumedDropEntryId;
    } catch (err) {
      if (err && typeof err === "object" && "kind" in err) {
        const e = err as SucceedError;
        if (e.kind === "NO_DROP_AVAILABLE") {
          return res.status(409).json({
            error: "No drop slot available — team has used all pending drops. Mark this Add as SKIPPED instead.",
            code: "NO_DROP_AVAILABLE",
          });
        }
        if (e.kind === "PLAYER_NOT_ON_TEAM") {
          return res.status(409).json({
            error: "Drop player is no longer on this team's roster — drop entry is stale",
            code: "PLAYER_NOT_ON_TEAM",
          });
        }
        if (e.kind === "POSITION_INCOMPATIBLE") {
          return res.status(400).json({
            error: `Add player is not eligible for the dropped player's ${e.slot} slot`,
            code: "POSITION_INCOMPATIBLE",
          });
        }
        if (e.kind === "DROP_RACE_LOST") {
          return res.status(409).json({
            error: "Another add for this team consumed the next drop slot first — refresh and retry",
            code: "DROP_RACE_LOST",
          });
        }
      }
      // Translate Prisma's unique-constraint violation on
      // consumedDropEntryId (sibling add wrote the same drop in the
      // racing window) to the same DROP_RACE_LOST code instead of a 500.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return res.status(409).json({
          error: "Another add for this team consumed the next drop slot first — refresh and retry",
          code: "DROP_RACE_LOST",
        });
      }
      throw err;
    }

    await safeWriteAuditLog(
      {
        userId: req.user!.id,
        action: "WIRE_LIST_ADD_SUCCEED",
        resourceType: "WaiverAddEntry",
        resourceId: id,
        metadata: { consumedDropEntryId },
      },
      { req },
    );

    res.json(updated);
  }),
);

// POST /api/wire-list/adds/:id/fail
router.post(
  "/adds/:id/fail",
  requireAuth,
  validateBody(FailOutcomeBodySchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { reason } = req.body as { reason: string };
    const entry = await loadAddEntryAsCommissioner(req, res, id);
    if (!entry) return;

    if (entry.period.status !== "LOCKED") {
      return res.status(403).json({ error: "Outcomes can only be set on LOCKED periods", code: "PERIOD_NOT_LOCKED" });
    }
    if (entry.outcome !== "PENDING") {
      return res.status(409).json({ error: `Entry already ${entry.outcome} — revert before changing`, code: "ENTRY_ALREADY_PROCESSED" });
    }

    const updated = await prisma.waiverAddEntry.update({
      where: { id },
      data: { outcome: "FAILED", reason: reason ?? null },
    });
    await safeWriteAuditLog(
      {
        userId: req.user!.id,
        action: "WIRE_LIST_ADD_FAIL",
        resourceType: "WaiverAddEntry",
        resourceId: id,
        metadata: { reason },
      },
      { req },
    );
    res.json(updated);
  }),
);

// POST /api/wire-list/adds/:id/skip
router.post(
  "/adds/:id/skip",
  requireAuth,
  validateBody(SkipOutcomeBodySchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { reason } = req.body as { reason?: string };
    const entry = await loadAddEntryAsCommissioner(req, res, id);
    if (!entry) return;

    if (entry.period.status !== "LOCKED") {
      return res.status(403).json({ error: "Outcomes can only be set on LOCKED periods", code: "PERIOD_NOT_LOCKED" });
    }
    if (entry.outcome !== "PENDING") {
      return res.status(409).json({ error: `Entry already ${entry.outcome} — revert before changing`, code: "ENTRY_ALREADY_PROCESSED" });
    }

    const updated = await prisma.waiverAddEntry.update({
      where: { id },
      data: { outcome: "SKIPPED", reason: reason ?? null },
    });
    await safeWriteAuditLog(
      {
        userId: req.user!.id,
        action: "WIRE_LIST_ADD_SKIP",
        resourceType: "WaiverAddEntry",
        resourceId: id,
        metadata: { reason },
      },
      { req },
    );
    res.json(updated);
  }),
);

// POST /api/wire-list/adds/:id/revert
router.post(
  "/adds/:id/revert",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const entry = await loadAddEntryAsCommissioner(req, res, id);
    if (!entry) return;

    if (entry.period.status !== "LOCKED") {
      return res.status(403).json({
        error: "Revert only allowed before finalize — period must be LOCKED",
        code: "PERIOD_NOT_LOCKED",
      });
    }
    if (entry.outcome === "PENDING") {
      return res.status(409).json({
        error: "Entry is already PENDING — nothing to revert",
        code: "ENTRY_ALREADY_PROCESSED",
      });
    }

    // ────────────────────────────────────────────────────────────────
    // Atomicity (todo #157): freeing the drop and clearing the
    // consumedDropEntryId on the add must happen in one tx. We clear
    // the FK on the add FIRST so the unique constraint on
    // consumedDropEntryId is released before any sibling tries to
    // claim the same drop. P2002 from a concurrent succeed is
    // translated to 409 DROP_RACE_LOST.
    // ────────────────────────────────────────────────────────────────
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const u = await tx.waiverAddEntry.update({
          where: { id },
          data: { outcome: "PENDING", consumedDropEntryId: null, reason: null },
        });
        if (entry.consumedDropEntryId) {
          // Only flip back to PENDING if we still own the drop link
          // (i.e. nobody else managed to slot in between). status-CAS
          // here is defensive — under normal flow the drop is
          // CONSUMED by *this* add so updateMany hits exactly 1.
          await tx.waiverDropEntry.updateMany({
            where: { id: entry.consumedDropEntryId, status: "CONSUMED" },
            data: { status: "PENDING", processedAt: null },
          });
        }
        return u;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return res.status(409).json({
          error: "Concurrent succeed claimed the same drop — refresh and retry",
          code: "DROP_RACE_LOST",
        });
      }
      throw err;
    }

    await safeWriteAuditLog(
      {
        userId: req.user!.id,
        action: "WIRE_LIST_ADD_REVERT",
        resourceType: "WaiverAddEntry",
        resourceId: id,
        metadata: { fromOutcome: entry.outcome, freedDropEntryId: entry.consumedDropEntryId },
      },
      { req },
    );

    res.json(updated);
  }),
);

// ─── Read endpoint ───────────────────────────────────────────────────

// GET /api/wire-list/periods/:periodId/results — multi-team view
router.get(
  "/periods/:periodId/results",
  requireAuth,
  asyncHandler(async (req, res) => {
    const periodId = Number(req.params.periodId);
    const period = await prisma.waiverPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period) return res.status(404).json({ error: "Period not found", code: "PERIOD_NOT_FOUND" });

    if (!req.user!.isAdmin) {
      const m = await prisma.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId: period.leagueId, userId: req.user!.id } },
        select: { role: true },
      });
      if (!m) return res.status(403).json({ error: "Not a member of this league" });
    }

    const [adds, drops] = await Promise.all([
      prisma.waiverAddEntry.findMany({
        where: { periodId },
        include: { player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } } },
        orderBy: [{ teamId: "asc" }, { priority: "asc" }],
      }),
      prisma.waiverDropEntry.findMany({
        where: { periodId },
        include: { player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } } },
        orderBy: [{ teamId: "asc" }, { priority: "asc" }],
      }),
    ]);

    // One-pass groupBy (todo #172) — was three nested filter() calls,
    // O(teams × (adds + drops)). The filter approach is fine at 12×80 today
    // but degrades quadratically and is needless work given a single linear
    // scan does it.
    type TeamBucket = { teamId: number; adds: typeof adds; drops: typeof drops };
    const buckets = new Map<number, TeamBucket>();
    const ensure = (teamId: number): TeamBucket => {
      let b = buckets.get(teamId);
      if (!b) {
        b = { teamId, adds: [], drops: [] };
        buckets.set(teamId, b);
      }
      return b;
    };
    for (const a of adds) ensure(a.teamId).adds.push(a);
    for (const d of drops) ensure(d.teamId).drops.push(d);
    const byTeam = Array.from(buckets.values()).sort((a, b) => a.teamId - b.teamId);

    res.json({ period, byTeam });
  }),
);

export const wireListProcessorRouter = router;
export default wireListProcessorRouter;
