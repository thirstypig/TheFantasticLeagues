// server/src/lib/financeLedger.ts
//
// The single sanctioned way to sum FinanceLedger (todo #311).
//
// `FinanceLedger` is APPEND-ONLY. Nothing is ever edited or deleted. A
// correction is two writes, not an update:
//
//   1. the original row is stamped `voidedAt`, and
//   2. a contra-entry carrying the NEGATED amount is appended with
//      `reversalOf` = the original's id.
//
// A replacement charge, when there is one, is a third row.
//
// The consequence, and the entire reason this file exists: **`voidedAt` is an
// audit marker, never a filter.** The reversal already cancels the row it
// points at, so excluding voided rows removes the same money twice.
//
//   rows:            +10 (voided)   −10 (reversal)   +25 (replacement)
//   sum ALL rows  →  25   ✓ correct
//   sum voidedAt IS NULL only → 15   ✗ silently low
//
// Both readings look plausible at a glance, and the wrong one fails quietly —
// it under-reports rather than erroring. That is what makes it dangerous, and
// why the convention lives in a tested helper rather than a comment someone
// has to find. It has already cost real time: on 2026-08-31 a `voidedAt: null`
// filter reported the ledger empty immediately after a successful $150 write.
//
// Do not write ad-hoc `financeLedger.findMany` summing elsewhere. Use these.

import type { PrismaClient } from "@prisma/client";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** The only fields the arithmetic needs. Kept structural so tests need no DB. */
export interface LedgerAmountRow {
  amount: number;
  voidedAt: Date | null;
  reversalOf: number | null;
}

/**
 * Net balance of a set of ledger rows.
 *
 * Sums EVERY row. `voidedAt` and `reversalOf` are deliberately not consulted:
 * they describe how a correction was recorded, not whether the money counts.
 * A voided charge and its contra-entry cancel each other arithmetically, which
 * is exactly the intended behaviour — filtering either one out breaks it.
 */
export function netBalance(rows: LedgerAmountRow[]): number {
  return rows.reduce((sum, r) => sum + r.amount, 0);
}

/** Net ledger balance for one team, across all periods and entry types. */
export async function teamBalance(tx: TxClient, teamId: number): Promise<number> {
  const rows = await tx.financeLedger.findMany({
    where: { teamId },
    select: { amount: true, voidedAt: true, reversalOf: true },
  });
  return netBalance(rows);
}

/**
 * Net ledger balance for every team in a league.
 *
 * Teams with no ledger rows are included at 0 rather than omitted: a team
 * missing from this list reads as "still loading" on the commissioner's
 * screen, not as "owes nothing".
 */
export async function leagueBalances(
  tx: TxClient,
  leagueId: number,
): Promise<Array<{ teamId: number; teamName: string; balance: number }>> {
  const teams = await tx.team.findMany({
    where: { leagueId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const rows = await tx.financeLedger.findMany({
    where: { team: { leagueId } },
    select: { teamId: true, amount: true, voidedAt: true, reversalOf: true },
  });

  const byTeam = new Map<number, LedgerAmountRow[]>();
  for (const r of rows) {
    const list = byTeam.get(r.teamId);
    if (list) list.push(r);
    else byTeam.set(r.teamId, [r]);
  }

  return teams.map((t) => ({
    teamId: t.id,
    teamName: t.name,
    balance: netBalance(byTeam.get(t.id) ?? []),
  }));
}
