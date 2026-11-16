// Commissioner ledger: list league fees with their void state, and void one
// (todo #315). Mounted on the commissioner router via index.ts.
//
// The ledger is append-only (see lib/financeLedger.ts): a void stamps the
// original and appends a negated contra-entry. Balances always sum every row.
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireCommissionerOrAdmin } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { voidLedgerEntry } from "../../lib/financeLedger.js";
import {
  VOIDABLE_LEDGER_TYPES,
  type LedgerEntriesResponse,
  type VoidLedgerEntryResponse,
} from "../../../../shared/api/commissioner.js";

export const ledgerRouter = Router();

function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const isVoidableType = (t: unknown): t is (typeof VOIDABLE_LEDGER_TYPES)[number] =>
  typeof t === "string" && (VOIDABLE_LEDGER_TYPES as readonly string[]).includes(t);

/**
 * GET /api/commissioner/:leagueId/ledger?type=meeting_overtime
 *
 * Original charges of one voidable type, newest first, each with its void
 * state. Reversal rows are left out of the LIST because each one is already
 * shown as its original's "Voided" state; this is a display choice, never a
 * sum — balances come from `leagueBalances`, which counts every row.
 */
ledgerRouter.get(
  "/commissioner/:leagueId/ledger",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = parseId(req.params.leagueId);
    if (!leagueId) return res.status(400).json({ error: "Invalid leagueId" });
    const type = req.query.type ?? VOIDABLE_LEDGER_TYPES[0];
    if (!isVoidableType(type)) return res.status(400).json({ error: "Unsupported ledger type" });

    const rows = await prisma.financeLedger.findMany({
      where: { type, reversalOf: null, team: { leagueId } },
      select: {
        id: true, teamId: true, periodId: true, type: true, amount: true, reason: true,
        ts: true, voidedAt: true,
        team: { select: { name: true } },
        period: { select: { name: true } },
      },
      orderBy: [{ ts: "desc" }, { id: "desc" }],
    });

    const body: LedgerEntriesResponse = {
      entries: rows.map((r) => ({
        id: r.id,
        teamId: r.teamId,
        teamName: r.team.name,
        periodId: r.periodId,
        periodName: r.period?.name ?? null,
        type: r.type,
        amount: r.amount,
        reason: r.reason,
        ts: r.ts.toISOString(),
        voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
      })),
    };
    return res.json(body);
  }),
);

/**
 * POST /api/commissioner/:leagueId/ledger/:entryId/void
 *
 * Voids one meeting fee: `voidedAt` on the original plus a negated reversal,
 * in one transaction. 404 for another league's row, 409 when already voided
 * (including a lost race), 400 for a type that can't be voided here.
 */
ledgerRouter.post(
  "/commissioner/:leagueId/ledger/:entryId/void",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = parseId(req.params.leagueId);
    const entryId = parseId(req.params.entryId);
    if (!leagueId || !entryId) return res.status(400).json({ error: "Invalid id" });
    const actorUserId = req.user!.id;

    const result = await prisma.$transaction((tx) =>
      voidLedgerEntry(tx, { leagueId, entryId, actorUserId, voidableTypes: VOIDABLE_LEDGER_TYPES }),
    );
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    writeAuditLog({
      userId: actorUserId,
      action: "LEDGER_VOID",
      resourceType: "FinanceLedger",
      resourceId: result.entryId,
      metadata: { leagueId, teamId: result.teamId, amount: result.amount, reversalId: result.reversalId },
    });

    const body: VoidLedgerEntryResponse = {
      entryId: result.entryId,
      reversalId: result.reversalId,
      teamId: result.teamId,
      amount: result.amount,
    };
    return res.json(body);
  }),
);
