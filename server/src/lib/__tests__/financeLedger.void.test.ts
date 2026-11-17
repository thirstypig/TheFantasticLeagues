import { describe, it, expect, beforeEach } from "vitest";
import { voidLedgerEntry, leagueBalances } from "../financeLedger.js";

/**
 * A stateful fake of the two tables `voidLedgerEntry` touches. It applies the
 * WHERE clauses the helper sends, so a missing league scope or a missing
 * `voidedAt: null` guard changes the result instead of passing silently.
 */
type Row = {
  id: number; teamId: number; periodId: number | null; playerId: number | null;
  type: string; amount: number; reason: string | null;
  voidedAt: Date | null; reversalOf: number | null; createdBy: number | null;
};
const TEAMS = [
  { id: 1, leagueId: 20, name: "Alpha" },
  { id: 2, leagueId: 20, name: "Bravo" },
  { id: 9, leagueId: 99, name: "Other league" },
];

let rows: Row[];
let writes: { op: string; args: any }[];

function inLeague(r: Row, where: any) {
  if (!where?.team) return true;
  return TEAMS.find((t) => t.id === r.teamId)?.leagueId === where.team.leagueId;
}
const tx: any = {
  team: {
    findMany: async ({ where }: any) => TEAMS.filter((t) => t.leagueId === where.leagueId).map(({ id, name }) => ({ id, name })),
  },
  financeLedger: {
    findFirst: async ({ where }: any) =>
      rows.find((r) => r.id === where.id && inLeague(r, where)) ?? null,
    findMany: async ({ where }: any) => rows.filter((r) => inLeague(r, where)),
    updateMany: async (args: any) => {
      writes.push({ op: "updateMany", args });
      const hit = rows.filter((r) => r.id === args.where.id && (args.where.voidedAt !== null || r.voidedAt === null));
      for (const r of hit) Object.assign(r, args.data);
      return { count: hit.length };
    },
    create: async (args: any) => {
      writes.push({ op: "create", args });
      const row = { id: rows.length + 100, periodId: null, playerId: null, reason: null, voidedAt: null, reversalOf: null, createdBy: null, ...args.data };
      rows.push(row);
      return row;
    },
  },
};

const fee = (id: number, teamId: number, amount = 5, type = "meeting_overtime"): Row => ({
  id, teamId, periodId: 41, playerId: null, type, amount,
  reason: "Over time at the Period 9 meeting", voidedAt: null, reversalOf: null, createdBy: 7,
});
const balanceOf = async (teamId: number) =>
  (await leagueBalances(tx, 20)).find((b) => b.teamId === teamId)!.balance;
const VOIDABLE = ["meeting_overtime"] as const;

beforeEach(() => {
  rows = [fee(1, 1, 5), { ...fee(2, 1, 50), type: "entry_fee", reason: null }, fee(3, 9, 5)];
  writes = [];
});

describe("voidLedgerEntry", () => {
  it("stamps voidedAt and appends one negated reversal, and the team's balance drops by the fee once", async () => {
    expect(await balanceOf(1)).toBe(55);

    const r = await voidLedgerEntry(tx, { leagueId: 20, entryId: 1, actorUserId: 4, voidableTypes: VOIDABLE });

    expect(r).toMatchObject({ ok: true, teamId: 1, amount: 5 });
    expect(writes.map((w) => w.op)).toEqual(["updateMany", "create"]);
    // The CAS guard: only a row that is still un-voided can be stamped.
    expect(writes[0].args.where).toEqual({ id: 1, voidedAt: null });
    expect(writes[0].args.data.voidedAt).toBeInstanceOf(Date);
    expect(writes[1].args.data).toEqual({
      teamId: 1, periodId: 41, playerId: null, type: "meeting_overtime",
      amount: -5, reversalOf: 1, createdBy: 4,
      reason: "Void of ledger #1 by commissioner",
    });
    // Net, not double-removed: 55 − 5 = 50 (a voidedAt filter would give 45).
    expect(await balanceOf(1)).toBe(50);
  });

  it("refuses a second void with 409 and writes nothing", async () => {
    await voidLedgerEntry(tx, { leagueId: 20, entryId: 1, actorUserId: 4, voidableTypes: VOIDABLE });
    writes = [];
    const r = await voidLedgerEntry(tx, { leagueId: 20, entryId: 1, actorUserId: 4, voidableTypes: VOIDABLE });
    expect(r).toEqual({ ok: false, status: 409, error: "This fee was already voided." });
    expect(writes).toEqual([]);
    expect(await balanceOf(1)).toBe(50);
  });

  it("loses a race cleanly: when the CAS stamps nothing, no reversal is written", async () => {
    // Another request voided the row between our read and our write.
    const realUpdate = tx.financeLedger.updateMany;
    tx.financeLedger.updateMany = async (args: any) => {
      rows[0].voidedAt = new Date();
      return realUpdate(args);
    };
    try {
      const r = await voidLedgerEntry(tx, { leagueId: 20, entryId: 1, actorUserId: 4, voidableTypes: VOIDABLE });
      expect(r).toEqual({ ok: false, status: 409, error: "This fee was already voided." });
      expect(writes.map((w) => w.op)).toEqual(["updateMany"]);
    } finally {
      tx.financeLedger.updateMany = realUpdate;
    }
  });

  it("404s on a row from another league, scoping the read to the league", async () => {
    const r = await voidLedgerEntry(tx, { leagueId: 20, entryId: 3, actorUserId: 4, voidableTypes: VOIDABLE });
    expect(r).toEqual({ ok: false, status: 404, error: "Ledger entry not found." });
    expect(writes).toEqual([]);
  });

  it("refuses a type it wasn't given (an entry fee) and a reversal row", async () => {
    expect(await voidLedgerEntry(tx, { leagueId: 20, entryId: 2, actorUserId: 4, voidableTypes: VOIDABLE }))
      .toEqual({ ok: false, status: 400, error: "This kind of entry can't be voided here." });
    await voidLedgerEntry(tx, { leagueId: 20, entryId: 1, actorUserId: 4, voidableTypes: VOIDABLE });
    const reversal = rows.find((r) => r.reversalOf === 1)!;
    writes = [];
    expect(await voidLedgerEntry(tx, { leagueId: 20, entryId: reversal.id, actorUserId: 4, voidableTypes: VOIDABLE }))
      .toEqual({ ok: false, status: 409, error: "A reversal can't be voided." });
    expect(writes).toEqual([]);
  });
});
