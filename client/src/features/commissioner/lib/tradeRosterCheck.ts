// Roster check for one accepted trade. A local copy of the rule used by the
// owners' trade screens (ADR-015: commissioner code cannot import trades).
// A team fails only if its active count goes UP and ends OVER the cap; IL
// players never change active counts.
import type { LeagueTradeItem } from "../api";

export type CheckLine = { tone: "good" | "bad" | "note"; text: string };

export function checkAcceptedTrade(args: {
  items: LeagueTradeItem[];
  /** teamId -> active (non-IL) playerIds */
  active: Map<number, Set<number>>;
  /** teamId -> active count from the roster check */
  counts: Map<number, number>;
  names: (teamId: number) => string;
  cap: number;
}): { ok: boolean; lines: CheckLine[] } {
  const { items, active, counts, names, cap } = args;
  const delta = new Map<number, number>();
  for (const it of items) {
    if (it.assetType !== "PLAYER" || it.playerId == null) continue;
    if (!active.get(it.senderId)?.has(it.playerId)) continue; // IL or missing: no active change
    delta.set(it.senderId, (delta.get(it.senderId) ?? 0) - 1);
    delta.set(it.recipientId, (delta.get(it.recipientId) ?? 0) + 1);
  }
  const teams = [...new Set(items.flatMap((i) => [i.senderId, i.recipientId]))].map((id) => {
    const before = counts.get(id) ?? active.get(id)?.size ?? 0;
    return { id, name: names(id), before, after: before + (delta.get(id) ?? 0) };
  });

  const lines: CheckLine[] = [];
  let ok = true;
  for (const t of teams) {
    if (t.after > t.before && t.after > cap) {
      ok = false;
      lines.push({ tone: "bad", text: `${t.name} would have ${t.after} players (limit ${cap})` });
    }
  }
  for (const t of teams) {
    if (t.after < t.before) lines.push({ tone: "note", text: `${t.name} goes to ${t.after} and fills the spot at the meeting` });
  }
  if (teams.length > 0 && teams.every((t) => t.after === t.before)) {
    const [a, b] = teams;
    lines.push({
      tone: "good",
      text: b && a.before !== b.before ? "Both rosters stay the same" : `Both rosters stay at ${a.before}`,
    });
  }
  return { ok, lines };
}
