import { describe, it, expect } from "vitest";
import { categoryChip, rosterChips } from "../pages/Rules";

describe("Rules overview chips", () => {
  it("spells out category names and keeps the abbreviation", () => {
    expect(categoryChip("HR")).toEqual({ name: "Home Runs", abbr: "HR", lowerIsBetter: false });
    expect(categoryChip("SV")).toEqual({ name: "Saves", abbr: "SV", lowerIsBetter: false });
  });

  it("does not repeat an abbreviation that is already the name", () => {
    expect(categoryChip("RBI")).toEqual({ name: "RBI", abbr: null, lowerIsBetter: false });
  });

  it("marks ERA and WHIP lower-is-better, and nothing else", () => {
    expect(categoryChip("ERA").lowerIsBetter).toBe(true);
    expect(categoryChip("WHIP").lowerIsBetter).toBe(true);
    expect(["R", "HR", "RBI", "SB", "AVG", "W", "SV", "K"].some((id) => categoryChip(id).lowerIsBetter)).toBe(false);
  });

  it("adds the pitcher slot when roster_positions stores hitters only", () => {
    const chips = rosterChips({ C: 2, "1B": 1, OF: 5 }, 9);
    expect(chips[chips.length - 1]).toEqual(["P", 9]);
  });

  it("does not duplicate a stored P slot", () => {
    expect(rosterChips({ C: 2, P: 9 }, 9).filter(([pos]) => pos === "P")).toHaveLength(1);
  });
});

import { statsSourceLabel } from "../pages/Rules";

describe("Rules overview stats source", () => {
  it("says NL players only for an NL-only league", () => {
    expect(statsSourceLabel("NL")).toBe("NL players only");
  });
  it("says all MLB for ALL/MLB", () => {
    expect(statsSourceLabel("ALL")).toBe("All MLB players");
    expect(statsSourceLabel("MLB")).toBe("All MLB players");
  });
});
