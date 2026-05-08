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
 * After the todo #174 extraction this file owns ONLY:
 *   - HTTP wiring (Express routes, body parsing, response shaping)
 *   - Auth helpers (`loadAddEntryAsCommissioner`, `assertCommissionerForPeriod`)
 *   - Outcome-handler guards (file-local, todo #170)
 *   - Audit log writes (so the audit action label can vary by outcome)
 *   - Push fan-out (fire-and-forget on /finalize)
 *
 * The reducer / state-machine logic lives in `services/processorService.ts`.
 */
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { writeAuditLogAwait, type AuditLogParams } from "../../lib/auditLog.js";
import * as errorBuffer from "../../lib/errorBuffer.js";
import { sendPushToUser } from "../../lib/pushService.js";
import { logger } from "../../lib/logger.js";
import {
  FailOutcomeBodySchema,
  SkipOutcomeBodySchema,
  type WaiverPeriodStatus,
} from "../../../../shared/api/wireList.js";
import {
  WireListServiceError,
  PROCESSOR_LOADED_ADD_ENTRY_SELECT,
  type LoadedAddEntry,
  lockPeriod as svcLockPeriod,
  finalizePeriod as svcFinalizePeriod,
  succeedAdd as svcSucceedAdd,
  failAdd as svcFailAdd,
  skipAdd as svcSkipAdd,
  revertAdd as svcRevertAdd,
  getPeriodResults as svcGetPeriodResults,
} from "./services/processorService.js";

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

/** Map a service-layer error to the route's HTTP response. */
function sendServiceError(res: import("express").Response, err: WireListServiceError): void {
  res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
}

// ─── Authorization helpers ───────────────────────────────────────────

/**
 * Outcome endpoints are addressed by add-entry id, but commissioner auth
 * needs leagueId. Loads the entry, derives leagueId, then runs the same
 * commissioner check `requireCommissionerOrAdmin` would do — fail-closed.
 */
async function loadAddEntryAsCommissioner(
  req: import("express").Request,
  res: import("express").Response,
  addId: number,
): Promise<LoadedAddEntry | null> {
  const entry = await prisma.waiverAddEntry.findUnique({
    where: { id: addId },
    select: PROCESSOR_LOADED_ADD_ENTRY_SELECT,
  });
  if (!entry) {
    res.status(404).json({ error: "Add entry not found", code: "ENTRY_NOT_FOUND" });
    return null;
  }
  if (req.user!.isAdmin) return entry as LoadedAddEntry;

  const m = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId: entry.period.leagueId, userId: req.user!.id } },
    select: { role: true },
  });
  if (m?.role !== "COMMISSIONER") {
    res.status(403).json({ error: "Commissioner only" });
    return null;
  }
  return entry as LoadedAddEntry;
}

/**
 * Mirror of `loadAddEntryAsCommissioner`'s membership lookup, keyed by
 * periodId instead of entry id. On failure writes the appropriate 404/403
 * to `res` and returns `null`. On success returns the period's
 * `{ leagueId, periodId, status, createdAt }`.
 */
async function assertCommissionerForPeriod(
  req: import("express").Request,
  res: import("express").Response,
  periodIdParam: string | undefined,
): Promise<{ leagueId: number; periodId: number; status: WaiverPeriodStatus; createdAt: Date } | null> {
  const periodId = Number(periodIdParam);
  const period = await prisma.waiverPeriod.findUnique({
    where: { id: periodId },
    select: { id: true, leagueId: true, status: true, createdAt: true },
  });
  if (!period) {
    res.status(404).json({ error: "Period not found", code: "PERIOD_NOT_FOUND" });
    return null;
  }
  if (!req.user!.isAdmin) {
    const m = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId: period.leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (m?.role !== "COMMISSIONER") {
      res.status(403).json({ error: "Commissioner only" });
      return null;
    }
  }
  return {
    leagueId: period.leagueId,
    periodId: period.id,
    status: period.status as WaiverPeriodStatus,
    createdAt: period.createdAt,
  };
}

// ─── Outcome handler guards (file-local) ─────────────────────────────
//
// `/succeed`, `/fail`, `/skip` all require: period LOCKED + entry PENDING.
// `/revert` requires: period LOCKED + entry NOT PENDING (already-processed).

type OutcomeEntry = { outcome: string; period: { status: string } };

/** Guard for `/succeed`, `/fail`, `/skip`. Writes 403/409 + returns false on failure. */
function ensureLockedPeriodAndPendingEntry(
  entry: OutcomeEntry,
  res: import("express").Response,
): boolean {
  if (entry.period.status !== "LOCKED") {
    res.status(403).json({
      error: "Outcomes can only be set on LOCKED periods",
      code: "PERIOD_NOT_LOCKED",
    });
    return false;
  }
  if (entry.outcome !== "PENDING") {
    res.status(409).json({
      error: `Entry already ${entry.outcome} — revert before changing`,
      code: "ENTRY_ALREADY_PROCESSED",
    });
    return false;
  }
  return true;
}

/** Mirror of the above for `/revert`: period LOCKED, entry NOT PENDING. */
function ensureLockedPeriodAndProcessedEntry(
  entry: OutcomeEntry,
  res: import("express").Response,
): boolean {
  if (entry.period.status !== "LOCKED") {
    res.status(403).json({
      error: "Revert only allowed before finalize — period must be LOCKED",
      code: "PERIOD_NOT_LOCKED",
    });
    return false;
  }
  if (entry.outcome === "PENDING") {
    res.status(409).json({
      error: "Entry is already PENDING — nothing to revert",
      code: "ENTRY_ALREADY_PROCESSED",
    });
    return false;
  }
  return true;
}

// ─── Period transitions ──────────────────────────────────────────────

// POST /api/wire-list/periods/:periodId/lock
router.post(
  "/periods/:periodId/lock",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await assertCommissionerForPeriod(req, res, req.params.periodId);
    if (!ctx) return;

    let updated;
    try {
      updated = await svcLockPeriod({ id: ctx.periodId, status: ctx.status });
    } catch (err) {
      if (err instanceof WireListServiceError) return sendServiceError(res, err);
      throw err;
    }
    await safeWriteAuditLog(
      {
        userId: req.user!.id,
        action: "WIRE_LIST_PERIOD_LOCK",
        resourceType: "WaiverPeriod",
        resourceId: ctx.periodId,
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
    const ctx = await assertCommissionerForPeriod(req, res, req.params.periodId);
    if (!ctx) return;

    let summary;
    try {
      summary = await svcFinalizePeriod({
        id: ctx.periodId,
        leagueId: ctx.leagueId,
        status: ctx.status,
        createdAt: ctx.createdAt,
      });
    } catch (err) {
      if (err instanceof WireListServiceError) return sendServiceError(res, err);
      throw err;
    }

    await safeWriteAuditLog(
      {
        userId: req.user!.id,
        action: "WIRE_LIST_PERIOD_FINALIZE",
        resourceType: "WaiverPeriod",
        resourceId: ctx.periodId,
        metadata: {
          addsApplied: summary.addsApplied,
          dropsConsumed: summary.dropsConsumed,
          dropsUnused: summary.dropsUnused,
        },
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
    const periodId = ctx.periodId;
    const successesByTeam = summary.successesByTeam;
    (async () => {
      try {
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
            successes.length > 0
              ? `Wire List: ${successes.length} added`
              : fails > 0
                ? "Wire List: no adds went through"
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
            sendPushToUser(
              userId,
              {
                title,
                body,
                tag: `wire-list-finalize-${periodId}`,
                url: `/teams/${teamId}/wire-list`,
              },
              "waiverResult",
            ).catch((err) => logger.warn({ err, userId }, "Wire-list finalize push failed"));
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
    if (!ensureLockedPeriodAndPendingEntry(entry, res)) return;

    let result;
    try {
      result = await svcSucceedAdd(entry);
    } catch (err) {
      if (err instanceof WireListServiceError) return sendServiceError(res, err);
      // Defensive: any P2002 not already wrapped by the service still maps
      // to DROP_RACE_LOST (matches pre-extraction behavior).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
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
        metadata: { consumedDropEntryId: result.consumedDropEntryId },
      },
      { req },
    );

    res.json(result.updated);
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
    if (!ensureLockedPeriodAndPendingEntry(entry, res)) return;

    const updated = await svcFailAdd(entry, reason);
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
    if (!ensureLockedPeriodAndPendingEntry(entry, res)) return;

    const updated = await svcSkipAdd(entry, reason);
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
    if (!ensureLockedPeriodAndProcessedEntry(entry, res)) return;

    let updated;
    try {
      updated = await svcRevertAdd(entry);
    } catch (err) {
      if (err instanceof WireListServiceError) return sendServiceError(res, err);
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

    const { byTeam } = await svcGetPeriodResults(periodId);
    res.json({ period, byTeam });
  }),
);

export const wireListProcessorRouter = router;
export default wireListProcessorRouter;
