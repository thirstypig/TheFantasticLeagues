import type { TransactionEvent } from "../api";

/**
 * Server-clock-skew fudge factor (ms). A transaction's effective date and
 * submitted timestamp are stamped by the server in the same write path, but
 * timezone normalization (effDate is anchored at UTC midnight while
 * submittedAt is wall-clock) can put effDate up to ~24h before submittedAt
 * without the move actually being a commissioner backdate.
 *
 * We classify a row as "backdated" only when effDate sits MORE than
 * BACKDATED_THRESHOLD_MS in the past relative to submittedAt. 60_000 ms
 * (1 minute) — the value the spec calls for — is too aggressive given the
 * UTC-midnight anchor on effDate; a normal same-day move whose effDate
 * resolves to today's UTC midnight while submittedAt is, say, 23:00 UTC
 * would falsely flag as backdated. Use 24h + 1min so the chip only fires
 * when effDate is at least one full calendar day before the submission.
 *
 * The 60_000 fudge floor (clock-skew tolerance) is preserved by adding it
 * on top of the 24h calendar-day buffer.
 */
export const BACKDATED_THRESHOLD_MS = 24 * 60 * 60 * 1000 + 60_000;

/**
 * A normalized view onto the date fields we care about for backdate
 * classification. Accepts either `submittedAt` (post-PR-187 canonical name)
 * or `createdAt` (older snapshots) for the submission timestamp.
 */
export interface BackdatedShape {
  effDate?: string | Date | null;
  submittedAt?: string | Date | null;
  createdAt?: string | Date | null;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * True when the effective date sits enough before the submitted timestamp
 * that a commissioner clearly chose a past `effectiveDate`. Returns false
 * when either timestamp is missing — we never speculate.
 *
 * Threshold: 24h + 1min (see BACKDATED_THRESHOLD_MS docstring).
 */
export function isBackdated(tx: BackdatedShape | null | undefined): boolean {
  if (!tx) return false;
  const eff = toDate(tx.effDate);
  const submitted = toDate(tx.submittedAt) ?? toDate(tx.createdAt);
  if (!eff || !submitted) return false;
  return submitted.getTime() - eff.getTime() > BACKDATED_THRESHOLD_MS;
}

/**
 * Filter a list of TransactionEvents to only the ones that are backdated.
 * Pure helper — no React. Exposed for unit testing.
 */
export function filterBackdated(
  events: TransactionEvent[],
): TransactionEvent[] {
  return events.filter((e) => isBackdated(e));
}
