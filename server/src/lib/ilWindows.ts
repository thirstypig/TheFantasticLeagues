import { logger } from "./logger.js";

/**
 * TransactionEvent types that open or close an IL stint. Same set the IL
 * billing-log drift check reads: a DROP of a player on IL closes his stint
 * (the billing log records it as IL_RELEASE), so DROP and IL_RELEASE close
 * windows exactly like IL_ACTIVATE does.
 */
export const IL_WINDOW_EVENT_TYPES = ["IL_STASH", "IL_ACTIVATE", "IL_RELEASE", "DROP"] as const;

export type IlWindow = { startDate: Date; endDate: Date | null };

/**
 * Builds per-player IL windows from a pre-sorted (by effDate asc) event list.
 * Single-pass: tracks open stints in a side map; closes them on IL_ACTIVATE
 * (and on IL_RELEASE / DROP, when the caller loads those types).
 * Events must arrive globally sorted by effDate, with `id` breaking ties —
 * callers query with `orderBy: [{ effDate: "asc" }, { id: "asc" }]`. The
 * tie-break matters: a same-day IL_STASH + IL_ACTIVATE pair closes the stint
 * only in that order; reversed, the ACTIVATE is an orphan and the stint stays
 * open forever (todo #305). A global sort preserves each player's order.
 */
export function buildIlWindows(
  events: { playerId: number | null; transactionType: string | null; effDate: Date | null }[],
): Map<number, IlWindow[]> {
  const openStart = new Map<number, Date>();
  const windows = new Map<number, IlWindow[]>();

  for (const e of events) {
    if (!e.playerId || !e.effDate) continue;
    const pid = e.playerId;

    if (e.transactionType === "IL_STASH") {
      if (!openStart.has(pid)) openStart.set(pid, e.effDate);
    } else if (e.transactionType === "IL_RELEASE" || e.transactionType === "DROP") {
      // Close silently: a DROP of a player who was never on IL is normal.
      const start = openStart.get(pid);
      if (start != null) {
        const list = windows.get(pid) ?? [];
        list.push({ startDate: start, endDate: e.effDate });
        windows.set(pid, list);
        openStart.delete(pid);
      }
    } else if (e.transactionType === "IL_ACTIVATE") {
      const start = openStart.get(pid);
      if (start != null) {
        const list = windows.get(pid) ?? [];
        list.push({ startDate: start, endDate: e.effDate });
        windows.set(pid, list);
        openStart.delete(pid);
      } else {
        logger.warn(
          { playerId: pid, effDate: e.effDate },
          "buildIlWindows: orphaned IL_ACTIVATE with no matching IL_STASH",
        );
      }
    }
  }

  for (const [pid, start] of openStart) {
    const list = windows.get(pid) ?? [];
    list.push({ startDate: start, endDate: null });
    windows.set(pid, list);
  }

  return windows;
}

export function wasOnIlAtPeriodStart(
  playerId: number,
  periodStart: Date,
  ilWindowsByPlayer: Map<number, IlWindow[]>,
): boolean {
  const stints = ilWindowsByPlayer.get(playerId);
  if (!stints) return false;
  return stints.some(w => w.startDate <= periodStart && (w.endDate === null || w.endDate > periodStart));
}
