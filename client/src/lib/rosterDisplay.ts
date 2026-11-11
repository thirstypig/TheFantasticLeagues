// Shared roster-display helpers for the team page (desktop hub rows, IL
// section, and the phone team page). Pure — no React, no feature imports.

import { POS_SCORE } from "./sportConfig";

/**
 * Every eligible position as one "/"-joined string ("C/DH"): the primary
 * first, then the rest of `posList` in the app's POS_ORDER, deduped.
 */
export function formatEligiblePositions(
  posList: string | null | undefined,
  posPrimary: string | null | undefined,
): string {
  const norm = (s: string) => s.trim().toUpperCase();
  const primary = posPrimary ? norm(posPrimary) : "";
  const rest = (posList ?? "")
    .split(/[,/]/)
    .map(norm)
    .filter(Boolean)
    .filter((p) => p !== primary);
  const uniq = Array.from(new Set(rest)).sort(
    (a, b) => (POS_SCORE[a] ?? 99) - (POS_SCORE[b] ?? 99),
  );
  const all = primary ? [primary, ...uniq] : uniq;
  return all.length > 0 ? all.join("/") : "—";
}

export interface IlPeriod {
  id: number;
  name?: string | null;
  status?: string | null;
  startDate?: string | Date | null;
}

/**
 * Label for the IL "Period" column: the period containing `ilSince` (the
 * start of the player's current IL stint).
 *   - null/unparseable/no periods  -> "—"
 *   - before the first period      -> "Before Period 1"
 *   - in the active period         -> "This period"
 *   - otherwise                    -> "Since <period name>"
 */
export function ilPeriodLabel(
  ilSince: string | null | undefined,
  periods: readonly IlPeriod[],
): string {
  if (!ilSince) return "—";
  const t = new Date(ilSince).getTime();
  if (!Number.isFinite(t)) return "—";
  const dated = periods
    .map((p) => ({ p, start: p.startDate ? new Date(p.startDate).getTime() : NaN }))
    .filter((x) => Number.isFinite(x.start))
    .sort((a, b) => a.start - b.start);
  if (dated.length === 0) return "—";
  let hit: IlPeriod | null = null;
  for (const x of dated) if (x.start <= t) hit = x.p;
  if (!hit) return "Before Period 1";
  if (hit.status === "active") return "This period";
  return `Since ${hit.name || `Period ${hit.id}`}`;
}
