// server/src/features/players/services/closedPeriodAudit.ts
//
// Nightly audit of EVERY closed period against the MLB record (todo #301).
//
// `reconcileRecentlyClosedPeriods` only looks back `windowDays: 5`. Beyond that
// nothing re-checks a period, so a late MLB scoring revision — earned/unearned,
// hit/error, routine days-to-weeks after the game — freezes into the stored PSP
// permanently and silently.
//
// Confirmed live 2026-07-24: Period 4 held Sean Manaea at ER 17 / BB+H 36 while
// MLB.com, Baseball Reference and FanGraphs all reported 14 / 35 on identical
// IP / SO / W. Three independent sources against one, and nothing was watching.
//
// ALERT-ONLY by design. The windowed reconciler auto-heals because a period that
// closed in the last five days has barely been looked at. An old period's
// standings have been seen and acted on by owners — silently rewriting them is a
// worse failure than reporting the drift and letting a human decide.
//
// Pure classification here; the caller owns the I/O and the alerting.

export type PeriodAuditStatus = "clean" | "drift" | "fetch_error";

export interface PeriodAuditEntry {
  periodId: number;
  periodName: string;
  status: string;
  mismatches: number;
}

/**
 * Classify one period's reconcile result.
 *
 * `fetch_error` is deliberately distinct from `clean`: an unreachable MLB means
 * we learned nothing, which is not the same as learning that the data is fine.
 * Real mismatches outrank a partial fetch — if we found drift, that is the
 * finding, even if some players also failed to fetch.
 */
export function classifyPeriodAudit(r: {
  mismatches: unknown[];
  fetchErrors: number;
}): PeriodAuditStatus {
  if (r.mismatches.length > 0) return "drift";
  if (r.fetchErrors > 0) return "fetch_error";
  return "clean";
}

/**
 * Roll the sweep up into something an alert can be built from.
 *
 * A fetch error counts as needing attention. That mirrors the audit skill's
 * standing rule — INCOMPLETE is not a pass — and stops a run of unreachable
 * periods from reading as a clean bill of health.
 */
export function summarizeClosedPeriodAudit(entries: PeriodAuditEntry[]): {
  checked: number;
  needsAttention: boolean;
  drifted: PeriodAuditEntry[];
  unchecked: PeriodAuditEntry[];
  totalMismatches: number;
} {
  const drifted = entries.filter((e) => e.status === "drift");
  const unchecked = entries.filter((e) => e.status === "fetch_error");
  return {
    checked: entries.length,
    needsAttention: drifted.length > 0 || unchecked.length > 0,
    drifted,
    unchecked,
    totalMismatches: drifted.reduce((a, e) => a + e.mismatches, 0),
  };
}
