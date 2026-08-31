// server/src/lib/ilLogDrift.ts
//
// Cross-check the two IL logs (todo #310).
//
// IL fees are billed from `RosterSlotEvent`, but not every path that stashes a
// player writes to it. The 3-way claim (`/transactions/claim` with
// `ilStashPlayerId`) and the wire-list processor both wrote only
// `TransactionEvent` — so the stint had no opening event, was not billable, and
// the fee was silently never charged.
//
// Found 2026-08-31: Daniel Palencia (RGing) and Logan Henderson (The Show) each
// had a full period's stint invisible to billing this way.
//
// Extracting a shared writer fixes the two known paths. THIS is what catches the
// next path that forgets — including one nobody has written yet. Same reasoning
// as the outbox sweeper: check the end state, don't trust that every writer
// remembered.

const IL_EVENTS = new Set(["IL_STASH", "IL_ACTIVATE", "IL_RELEASE"]);

export interface IlLogDrift {
  teamId: number;
  playerId: number;
  effDate: string;
  event: string;
  /** Which log is missing this event. */
  missingFrom: "RosterSlotEvent" | "TransactionEvent";
}

/** Compare on the DATE only — the two logs anchor their timestamps differently. */
const key = (teamId: number, playerId: number, effDate: Date, event: string) =>
  `${teamId}|${playerId}|${effDate.toISOString().slice(0, 10)}|${event}`;

const parse = (k: string): Omit<IlLogDrift, "missingFrom"> => {
  const [teamId, playerId, effDate, event] = k.split("|");
  return { teamId: Number(teamId), playerId: Number(playerId), effDate, event };
};

/**
 * IL events present in one log but not the other.
 *
 * Missing from `RosterSlotEvent` is the money-losing direction: the fee service
 * reads that log, so the stint is unbillable. Missing from `TransactionEvent`
 * means a billing event exists that no recorded transaction explains — the
 * Betts case, a spurious duplicate.
 */
export function findIlLogDrift(
  txEvents: { teamId: number; playerId: number; effDate: Date; transactionType: string }[],
  slotEvents: { teamId: number; playerId: number; effDate: Date; event: string }[],
): IlLogDrift[] {
  const txKeys = new Set(
    txEvents
      .filter((e) => IL_EVENTS.has(e.transactionType))
      .map((e) => key(e.teamId, e.playerId, e.effDate, e.transactionType)),
  );
  const slotKeys = new Set(
    slotEvents
      .filter((e) => IL_EVENTS.has(e.event))
      .map((e) => key(e.teamId, e.playerId, e.effDate, e.event)),
  );

  const out: IlLogDrift[] = [];
  for (const k of txKeys) {
    if (!slotKeys.has(k)) out.push({ ...parse(k), missingFrom: "RosterSlotEvent" });
  }
  for (const k of slotKeys) {
    if (!txKeys.has(k)) out.push({ ...parse(k), missingFrom: "TransactionEvent" });
  }

  // Stable order so a diff of two runs is meaningful.
  return out.sort((a, b) =>
    a.missingFrom.localeCompare(b.missingFrom) ||
    a.teamId - b.teamId ||
    a.playerId - b.playerId ||
    a.effDate.localeCompare(b.effDate) ||
    a.event.localeCompare(b.event),
  );
}
