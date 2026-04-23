import { describe, it, expect } from "vitest";
import {
  slotsFor,
  isSlotCode,
  SLOT_CODES,
  STRUCTURAL_SLOTS,
} from "../positionEligibility";

// The consolidated `slotsFor` / `SlotCode` helper replaces byte-for-byte
// duplication that was previously in PlaceOnIlModal, ActivateFromIlModal,
// and WaiverClaimForm. These tests pin down the behaviors those duplicated
// functions relied on: multi-position splits, OF-family collapse, invalid
// inputs silently dropped, and the slot vocabulary type.

describe("SLOT_CODES vocabulary", () => {
  it("contains exactly the 10 canonical roster slots", () => {
    expect([...SLOT_CODES]).toEqual([
      "C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P",
    ]);
  });

  it("does not include structural slots (BN/IL)", () => {
    // Structural slots are valid `assignedPosition` values but never produced
    // by positionToSlots. They're tracked separately as STRUCTURAL_SLOTS.
    for (const s of STRUCTURAL_SLOTS) {
      expect(SLOT_CODES).not.toContain(s);
    }
  });
});

describe("slotsFor — single-position inputs", () => {
  it("2B yields {2B, MI}", () => {
    expect([...slotsFor("2B")]).toEqual(["2B", "MI"]);
  });

  it("SS yields {SS, MI}", () => {
    expect([...slotsFor("SS")]).toEqual(["SS", "MI"]);
  });

  it("1B yields {1B, CM}", () => {
    expect([...slotsFor("1B")]).toEqual(["1B", "CM"]);
  });

  it("3B yields {3B, CM}", () => {
    expect([...slotsFor("3B")]).toEqual(["3B", "CM"]);
  });

  it("C yields {C}", () => {
    expect([...slotsFor("C")]).toEqual(["C"]);
  });

  it("OF yields {OF}", () => {
    expect([...slotsFor("OF")]).toEqual(["OF"]);
  });

  it("all LF/CF/RF collapse to {OF}", () => {
    expect([...slotsFor("LF")]).toEqual(["OF"]);
    expect([...slotsFor("CF")]).toEqual(["OF"]);
    expect([...slotsFor("RF")]).toEqual(["OF"]);
  });

  it("DH yields {DH}", () => {
    expect([...slotsFor("DH")]).toEqual(["DH"]);
  });

  it("P, SP, RP, CL, TWP all yield {P}", () => {
    expect([...slotsFor("P")]).toEqual(["P"]);
    expect([...slotsFor("SP")]).toEqual(["P"]);
    expect([...slotsFor("RP")]).toEqual(["P"]);
    expect([...slotsFor("CL")]).toEqual(["P"]);
    expect([...slotsFor("TWP")]).toEqual(["P"]);
  });
});

describe("slotsFor — multi-position inputs", () => {
  it("parses comma-separated '2B,SS' into {2B, SS, MI}", () => {
    const s = slotsFor("2B,SS");
    expect([...s].sort()).toEqual(["2B", "MI", "SS"]);
  });

  it("parses slash-separated '2B/SS/3B' into {2B, SS, 3B, MI, CM}", () => {
    const s = slotsFor("2B/SS/3B");
    expect([...s].sort()).toEqual(["2B", "3B", "CM", "MI", "SS"]);
  });

  it("parses pipe-separated '1B|OF' into {1B, CM, OF}", () => {
    const s = slotsFor("1B|OF");
    expect([...s].sort()).toEqual(["1B", "CM", "OF"]);
  });

  it("parses whitespace-separated 'OF DH' into {OF, DH}", () => {
    const s = slotsFor("OF DH");
    expect([...s].sort()).toEqual(["DH", "OF"]);
  });

  it("two-way player 'TWP,OF' yields {P, OF}", () => {
    // Shohei-shape: two-way pitcher + outfielder.
    const s = slotsFor("TWP,OF");
    expect([...s].sort()).toEqual(["OF", "P"]);
  });

  it("deduplicates redundant positions (OF,LF → {OF})", () => {
    const s = slotsFor("OF,LF");
    expect([...s]).toEqual(["OF"]);
  });
});

describe("slotsFor — empty and malformed inputs", () => {
  it("returns empty set for null", () => {
    expect([...slotsFor(null)]).toEqual([]);
  });

  it("returns empty set for undefined", () => {
    expect([...slotsFor(undefined)]).toEqual([]);
  });

  it("returns empty set for empty string", () => {
    expect([...slotsFor("")]).toEqual([]);
  });

  it("returns empty set for whitespace-only string", () => {
    expect([...slotsFor("   ")]).toEqual([]);
  });

  it("silently drops unknown positions, keeps valid ones", () => {
    // "XYZ" is not a recognized position — it gets dropped without throwing.
    // Matches the behavior the old inline helpers had.
    const s = slotsFor("2B,XYZ,OF");
    expect([...s].sort()).toEqual(["2B", "MI", "OF"]);
  });

  it("case-insensitive via the underlying positionToSlots upcase", () => {
    // positionToSlots accepts lowercase input via trim().toUpperCase().
    const s = slotsFor("2b");
    expect([...s].sort()).toEqual(["2B", "MI"]);
  });
});

describe("isSlotCode — type guard", () => {
  it("returns true for every canonical slot code", () => {
    for (const code of SLOT_CODES) {
      expect(isSlotCode(code)).toBe(true);
    }
  });

  it("returns false for structural slots (BN / IL) — they aren't eligibility slots", () => {
    expect(isSlotCode("BN")).toBe(false);
    expect(isSlotCode("IL")).toBe(false);
  });

  it("returns false for input-only positions (LF / CF / RF / SP / RP / CL / TWP)", () => {
    // These inputs COLLAPSE into a SlotCode but aren't themselves SlotCodes.
    expect(isSlotCode("LF")).toBe(false);
    expect(isSlotCode("CF")).toBe(false);
    expect(isSlotCode("RF")).toBe(false);
    expect(isSlotCode("SP")).toBe(false);
    expect(isSlotCode("RP")).toBe(false);
    expect(isSlotCode("CL")).toBe(false);
    expect(isSlotCode("TWP")).toBe(false);
  });

  it("returns false for unknown strings", () => {
    expect(isSlotCode("")).toBe(false);
    expect(isSlotCode("XYZ")).toBe(false);
    expect(isSlotCode("utility")).toBe(false);
  });
});
