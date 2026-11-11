// Roster validation for trades: active players only (IL rows are extra
// capacity), measured against the league cap. A team fails only when its
// active count goes UP and ends OVER the cap, so a team already over cap can
// still make an even or shrinking trade.
import { loadLeagueRosterCap } from "../../../lib/rosterGuard.js";

/** A trade problem the caller should show verbatim (HTTP 400). */
export class TradeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeValidationError";
  }
}

export interface TradeItemLike {
  assetType: string;
  playerId: number | null | undefined;
  senderId: number;
  recipientId: number;
}

export function projectTradeCounts(
  items: TradeItemLike[],
  active: Map<number, Set<number>>,
): Map<number, { before: number; after: number }> {
  const counts = new Map<number, { before: number; after: number }>();
  const entry = (teamId: number) => {
    let c = counts.get(teamId);
    if (!c) {
      const n = active.get(teamId)?.size ?? 0;
      c = { before: n, after: n };
      counts.set(teamId, c);
    }
    return c;
  };
  for (const item of items) {
    if (item.assetType !== "PLAYER" || item.playerId == null) continue;
    const from = entry(item.senderId);
    const to = entry(item.recipientId);
    if (!active.get(item.senderId)?.has(item.playerId)) continue; // IL or missing: no active change
    from.after -= 1;
    to.after += 1;
  }
  return counts;
}

export function tradeCapViolations(
  counts: Map<number, { before: number; after: number }>,
  cap: number,
): { teamId: number; after: number }[] {
  const out: { teamId: number; after: number }[] = [];
  for (const [teamId, c] of counts) {
    if (c.after > c.before && c.after > cap) out.push({ teamId, after: c.after });
  }
  return out;
}

type Db = {
  roster: { findMany: (args: any) => Promise<any[]> };
  team: { findMany: (args: any) => Promise<any[]> };
  player: { findMany: (args: any) => Promise<any[]> };
};

/**
 * Throws TradeValidationError if any PLAYER item is not on the sender's
 * active roster (gone, or on the IL) or if the trade pushes a team over the
 * league cap. Reads only; call before any write.
 */
export async function assertTradeRosters(
  db: Db,
  leagueId: number,
  items: TradeItemLike[],
): Promise<void> {
  const playerItems = items.filter((i) => i.assetType === "PLAYER" && i.playerId != null);
  if (playerItems.length === 0) return;

  const teamIds = [...new Set(playerItems.flatMap((i) => [i.senderId, i.recipientId]))];
  const rows = await db.roster.findMany({
    where: { teamId: { in: teamIds }, releasedAt: null },
    select: { teamId: true, playerId: true, assignedPosition: true },
  });
  const active = new Map<number, Set<number>>();
  const onIl = new Map<number, Set<number>>();
  for (const t of teamIds) {
    active.set(t, new Set());
    onIl.set(t, new Set());
  }
  for (const r of rows) {
    (r.assignedPosition === "IL" ? onIl : active).get(r.teamId)?.add(r.playerId);
  }

  const [teams, players] = await Promise.all([
    db.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
    db.player.findMany({
      where: { id: { in: playerItems.map((i) => i.playerId as number) } },
      select: { id: true, name: true },
    }),
  ]);
  const teamName = (id: number) => teams.find((t) => t.id === id)?.name ?? `Team #${id}`;
  const playerName = (id: number) => players.find((p) => p.id === id)?.name ?? `Player #${id}`;

  for (const item of playerItems) {
    const pid = item.playerId as number;
    if (onIl.get(item.senderId)?.has(pid)) {
      throw new TradeValidationError(`${playerName(pid)} is on the IL`);
    }
    if (!active.get(item.senderId)?.has(pid)) {
      throw new TradeValidationError(`${playerName(pid)} is no longer on ${teamName(item.senderId)}`);
    }
  }

  const cap = await loadLeagueRosterCap(db as any, leagueId);
  const violations = tradeCapViolations(projectTradeCounts(items, active), cap);
  if (violations.length > 0) {
    const v = violations[0];
    throw new TradeValidationError(`${teamName(v.teamId)} would have ${v.after} players (limit ${cap})`);
  }
}
