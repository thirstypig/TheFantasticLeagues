import { describe, it, expect } from "vitest";
import { findIlLogDrift } from "../ilLogDrift.js";

/**
 * IL fees are billed from `RosterSlotEvent`, but several code paths write only
 * `TransactionEvent`. A stash missing from the billing log is not billable, so
 * the fee is silently never charged.
 *
 * Found in prod 2026-08-31: Daniel Palencia (RGing) and Logan Henderson (The
 * Show) each had a full period's IL stint with an IL_ACTIVATE in the billing log
 * and no matching IL_STASH — both stashed through the 3-way claim path, which
 * writes only TransactionEvent. Neither was ever billed.
 *
 * Extracting a shared writer fixes the two known paths. This check is what
 * catches the next path that forgets — including one nobody has written yet.
 */

const tx = (teamId: number, playerId: number, effDate: string, type: string) => ({
  teamId, playerId, effDate: new Date(effDate), transactionType: type,
});
const slot = (teamId: number, playerId: number, effDate: string, event: string) => ({
  teamId, playerId, effDate: new Date(effDate), event,
});

describe("findIlLogDrift", () => {
  it("reports nothing when both logs agree", () => {
    const out = findIlLogDrift(
      [tx(10, 1, "2026-04-19", "IL_STASH"), tx(10, 1, "2026-05-17", "IL_ACTIVATE")],
      [slot(10, 1, "2026-04-19", "IL_STASH"), slot(10, 1, "2026-05-17", "IL_ACTIVATE")],
    );
    expect(out).toEqual([]);
  });

  it("flags a stash present in TransactionEvent but MISSING from the billing log", () => {
    // The Palencia / Henderson case — an unbillable stint.
    const out = findIlLogDrift(
      [tx(145, 1339, "2026-04-19", "IL_STASH"), tx(145, 1339, "2026-05-17", "IL_ACTIVATE")],
      [slot(145, 1339, "2026-05-17", "IL_ACTIVATE")],
    );
    expect(out).toEqual([
      { teamId: 145, playerId: 1339, effDate: "2026-04-19", event: "IL_STASH", missingFrom: "RosterSlotEvent" },
    ]);
  });

  it("flags an event in the billing log with no transaction behind it", () => {
    // The Betts case — a spurious duplicate pair that no transaction explains.
    const out = findIlLogDrift(
      [tx(147, 1, "2026-04-19", "IL_STASH")],
      [slot(147, 1, "2026-04-19", "IL_STASH"), slot(147, 1, "2026-04-23", "IL_STASH")],
    );
    expect(out).toEqual([
      { teamId: 147, playerId: 1, effDate: "2026-04-23", event: "IL_STASH", missingFrom: "TransactionEvent" },
    ]);
  });

  it("compares on the DATE, not the timestamp — the logs anchor differently", () => {
    const out = findIlLogDrift(
      [tx(10, 1, "2026-04-19T12:00:00Z", "IL_STASH")],
      [slot(10, 1, "2026-04-19T00:00:00Z", "IL_STASH")],
    );
    expect(out).toEqual([]);
  });

  it("keeps teams and players distinct — same date must not cross-match", () => {
    const out = findIlLogDrift(
      [tx(10, 1, "2026-04-19", "IL_STASH")],
      [slot(11, 1, "2026-04-19", "IL_STASH")],
    );
    expect(out).toHaveLength(2);
    expect(out.map((d) => d.missingFrom).sort()).toEqual(["RosterSlotEvent", "TransactionEvent"]);
  });

  it("does not cross-match different event types on the same date", () => {
    const out = findIlLogDrift(
      [tx(10, 1, "2026-04-19", "IL_STASH")],
      [slot(10, 1, "2026-04-19", "IL_ACTIVATE")],
    );
    expect(out).toHaveLength(2);
  });

  it("ignores non-IL transaction types", () => {
    const out = findIlLogDrift([tx(10, 1, "2026-04-19", "CLAIM")], []);
    expect(out).toEqual([]);
  });

  it("returns results in a stable order", () => {
    const a = findIlLogDrift([tx(10, 2, "2026-04-19", "IL_STASH"), tx(10, 1, "2026-04-19", "IL_STASH")], []);
    const b = findIlLogDrift([tx(10, 1, "2026-04-19", "IL_STASH"), tx(10, 2, "2026-04-19", "IL_STASH")], []);
    expect(a).toEqual(b);
  });

  // ── A DROP closes an IL stint (prod, 2026-08-31) ──────────────────
  //
  // Quinn Priester was dropped while sitting on IL. The transaction log
  // records that as `DROP`; the billing log records the stint closing as
  // `IL_RELEASE`. Both are correct and they describe the same event — but a
  // literal event-name comparison calls it drift, forever.
  //
  // That matters because this check runs on every boot through the dead-man's
  // switch. A permanent false positive on a money alarm is how the next REAL
  // under-billing gets scrolled past.

  it("accepts a DROP as the transaction behind an IL_RELEASE", () => {
    const out = findIlLogDrift(
      [tx(146, 1090, "2026-04-19", "IL_STASH"), tx(146, 1090, "2026-06-07", "DROP")],
      [slot(146, 1090, "2026-04-19", "IL_STASH"), slot(146, 1090, "2026-06-07", "IL_RELEASE")],
    );
    expect(out).toEqual([]);
  });

  it("still flags an IL_RELEASE with no transaction of any kind behind it", () => {
    // The guard must not become "any IL_RELEASE is fine".
    const out = findIlLogDrift(
      [tx(146, 1090, "2026-04-19", "IL_STASH")],
      [slot(146, 1090, "2026-04-19", "IL_STASH"), slot(146, 1090, "2026-06-07", "IL_RELEASE")],
    );
    expect(out).toEqual([
      { teamId: 146, playerId: 1090, effDate: "2026-06-07", event: "IL_RELEASE", missingFrom: "TransactionEvent" },
    ]);
  });

  it("does not let a DROP excuse a missing IL_ACTIVATE", () => {
    // A drop closes a stint; an activation is a different event and a DROP
    // says nothing about it.
    const out = findIlLogDrift(
      [tx(146, 1090, "2026-06-07", "DROP")],
      [slot(146, 1090, "2026-06-07", "IL_ACTIVATE")],
    );
    expect(out).toEqual([
      { teamId: 146, playerId: 1090, effDate: "2026-06-07", event: "IL_ACTIVATE", missingFrom: "TransactionEvent" },
    ]);
  });

  it("a DROP on a different day does not close the stint", () => {
    const out = findIlLogDrift(
      [tx(146, 1090, "2026-06-09", "DROP")],
      [slot(146, 1090, "2026-06-07", "IL_RELEASE")],
    );
    expect(out).toEqual([
      { teamId: 146, playerId: 1090, effDate: "2026-06-07", event: "IL_RELEASE", missingFrom: "TransactionEvent" },
    ]);
  });
});
