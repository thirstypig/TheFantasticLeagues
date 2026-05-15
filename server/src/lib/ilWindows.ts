export type IlWindow = { start: Date; end: Date | null };

/**
 * Builds per-player IL windows from a pre-sorted (by effDate asc) event list.
 * Single-pass: tracks open stints in a side map; closes them on IL_ACTIVATE.
 * Events must arrive globally sorted by effDate — both call sites query with
 * `orderBy: { effDate: "asc" }`, which guarantees per-player ordering is
 * preserved in the globally sorted stream.
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
    } else if (e.transactionType === "IL_ACTIVATE") {
      const start = openStart.get(pid);
      if (start != null) {
        const list = windows.get(pid) ?? [];
        list.push({ start, end: e.effDate });
        windows.set(pid, list);
        openStart.delete(pid);
      }
    }
  }

  for (const [pid, start] of openStart) {
    const list = windows.get(pid) ?? [];
    list.push({ start, end: null });
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
  return stints.some(w => w.start <= periodStart && (w.end === null || w.end > periodStart));
}
