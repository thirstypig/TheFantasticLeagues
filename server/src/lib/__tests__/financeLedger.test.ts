import { describe, it, expect } from "vitest";
import { netBalance, teamBalance, leagueBalances } from "../financeLedger.js";

/**
 * `FinanceLedger` is append-only. A correction is TWO writes, not an edit:
 * the original row is stamped `voidedAt`, AND a negative contra-entry
 * (`reversalOf` = the original's id) is appended. The replacement charge is a
 * third row.
 *
 * That makes `voidedAt` an audit marker, NOT a filter. Summing only live rows
 * counts the reversal but not the row it reverses, so a corrected charge is
 * removed twice. The wrong reading looks entirely plausible — which is the
 * whole reason this helper exists rather than a documented convention.
 *
 * This already cost real time on 2026-08-31: a `voidedAt: null` filter reported
 * the ledger empty right after a successful $150 write, and separately made a
 * repaired period read low.
 */

let nextId = 1;
const charge = (amount: number): LedgerLike =>
  ({ id: nextId++, amount, voidedAt: null, reversalOf: null });
/** A charge that was later superseded: stamped voided, but still counted. */
const voidedCharge = (amount: number): LedgerLike =>
  ({ id: nextId++, amount, voidedAt: new Date("2026-08-31T00:00:00Z"), reversalOf: null });
/** The contra-entry that cancels a voided charge. Never itself voided. */
const reversalOf = (row: LedgerLike): LedgerLike =>
  ({ id: nextId++, amount: -row.amount, voidedAt: null, reversalOf: row.id });

type LedgerLike = { id: number; amount: number; voidedAt: Date | null; reversalOf: number | null };

describe("netBalance", () => {
  it("returns 0 for an empty ledger", () => {
    expect(netBalance([])).toBe(0);
  });

  it("sums plain charges", () => {
    expect(netBalance([charge(10), charge(25), charge(10)])).toBe(45);
  });

  it("nets a voided charge against its reversal to zero", () => {
    const original = voidedCharge(10);
    expect(netBalance([original, reversalOf(original)])).toBe(0);
  });

  it("counts a corrected charge ONCE, at the replacement amount", () => {
    // The Los Doyers Period 6 shape: $10 charged, found wrong, replaced by $25.
    // Reading live-rows-only would give -10 + 25 = 15 and silently under-report.
    const original = voidedCharge(10);
    const rows = [original, reversalOf(original), charge(25)];

    expect(netBalance(rows)).toBe(25);
  });

  it("is unaffected by row order", () => {
    const original = voidedCharge(10);
    const contra = reversalOf(original);
    const replacement = charge(25);

    expect(netBalance([replacement, contra, original])).toBe(25);
    expect(netBalance([contra, replacement, original])).toBe(25);
  });

  it("handles a charge voided with no replacement (the fee no longer applies)", () => {
    const original = voidedCharge(10);
    expect(netBalance([charge(50), original, reversalOf(original)])).toBe(50);
  });
});

// ── The prisma-touching wrappers ────────────────────────────────────
//
// A fake client rather than vi.mock: these two functions are only shaping and
// grouping, and the arithmetic they delegate to is pinned above. What can
// actually break here is a team silently vanishing from the list.

const fakeTx = (
  teams: Array<{ id: number; name: string }>,
  ledger: Array<{ teamId: number; amount: number; voidedAt?: Date | null; reversalOf?: number | null }>,
) => ({
  team: { findMany: async () => teams },
  financeLedger: {
    findMany: async () =>
      ledger.map((r) => ({ ...r, voidedAt: r.voidedAt ?? null, reversalOf: r.reversalOf ?? null })),
  },
}) as never;

describe("teamBalance", () => {
  it("nets every row for the team, voided ones included", async () => {
    const tx = fakeTx([], [
      { teamId: 7, amount: 10, voidedAt: new Date("2026-08-31Z") },
      { teamId: 7, amount: -10, reversalOf: 1 },
      { teamId: 7, amount: 25 },
    ]);
    await expect(teamBalance(tx, 7)).resolves.toBe(25);
  });

  it("returns 0 for a team with no ledger rows", async () => {
    await expect(teamBalance(fakeTx([], []), 7)).resolves.toBe(0);
  });
});

describe("leagueBalances", () => {
  it("includes a team with NO ledger rows, balancing to 0", async () => {
    // A team missing from the response reads as "still loading" on the
    // commissioner's screen, not as "owes nothing".
    const tx = fakeTx(
      [{ id: 1, name: "Los Doyers" }, { id: 2, name: "Demolition" }],
      [{ teamId: 1, amount: 25 }],
    );

    await expect(leagueBalances(tx, 20)).resolves.toEqual([
      { teamId: 1, teamName: "Los Doyers", balance: 25 },
      { teamId: 2, teamName: "Demolition", balance: 0 },
    ]);
  });

  it("keeps each team's rows separate", async () => {
    const tx = fakeTx(
      [{ id: 1, name: "A" }, { id: 2, name: "B" }],
      [
        { teamId: 1, amount: 10 },
        { teamId: 2, amount: 50 },
        { teamId: 1, amount: 15 },
      ],
    );

    await expect(leagueBalances(tx, 20)).resolves.toEqual([
      { teamId: 1, teamName: "A", balance: 25 },
      { teamId: 2, teamName: "B", balance: 50 },
    ]);
  });
});
