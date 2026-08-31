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

/**
 * A player dropped while sitting on IL closes his stint. The transaction log
 * calls that `DROP`; the billing log calls it `IL_RELEASE`. Same event, two
 * vocabularies — so a DROP on the same (team, player, day) is the transaction
 * behind an IL_RELEASE.
 *
 * Deliberately narrow: a DROP satisfies an IL_RELEASE and nothing else. It
 * never excuses a missing IL_ACTIVATE, and it never creates an expectation of
 * its own (a plain drop of a healthy player has no IL event and must stay
 * invisible here).
 *
 * Without this, Quinn Priester's 2026-06-07 drop reports as drift on every
 * boot, forever — a permanent false positive on the alarm that exists to catch
 * real under-billing.
 */
const CLOSES_IL_STINT = "DROP";

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

  // (team, player, day) triples that carry a DROP — see CLOSES_IL_STINT.
  const dropDays = new Set(
    txEvents
      .filter((e) => e.transactionType === CLOSES_IL_STINT)
      .map((e) => `${e.teamId}|${e.playerId}|${e.effDate.toISOString().slice(0, 10)}`),
  );

  const out: IlLogDrift[] = [];
  for (const k of txKeys) {
    if (!slotKeys.has(k)) out.push({ ...parse(k), missingFrom: "RosterSlotEvent" });
  }
  for (const k of slotKeys) {
    if (txKeys.has(k)) continue;
    const row = parse(k);
    if (row.event === "IL_RELEASE" && dropDays.has(`${row.teamId}|${row.playerId}|${row.effDate}`)) {
      continue;
    }
    out.push({ ...row, missingFrom: "TransactionEvent" });
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
