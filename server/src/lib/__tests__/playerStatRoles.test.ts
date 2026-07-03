import { describe, it, expect } from "vitest";
import { playerStatRoles } from "../sportConfig.js";

describe("playerStatRoles", () => {
  it("a position player counts hitting only — mop-up pitching excluded (the bug this fixes)", () => {
    for (const posPrimary of ["C", "OF", "DH", "1B", "SS", "2B", "3B"]) {
      const r = playerStatRoles({ posPrimary, assignedPosition: posPrimary, isTwoWay: false });
      expect(r, `${posPrimary} should count hitting only`).toEqual({ countHitting: true, countPitching: false });
    }
  });

  it("a real pitcher counts pitching only — their rare hitting excluded", () => {
    for (const posPrimary of ["P", "SP", "RP", "CL"]) {
      const r = playerStatRoles({ posPrimary, assignedPosition: posPrimary, isTwoWay: false });
      expect(r, `${posPrimary} should count pitching only`).toEqual({ countHitting: false, countPitching: true });
    }
  });

  it("keys on primary position, not roster slot — a benched pitcher still counts pitching", () => {
    // assignedPosition="BN" must NOT drop a real pitcher's stats.
    expect(playerStatRoles({ posPrimary: "P", assignedPosition: "BN", isTwoWay: false }))
      .toEqual({ countHitting: false, countPitching: true });
    // and a position player parked on the bench still counts hitting, not pitching.
    expect(playerStatRoles({ posPrimary: "C", assignedPosition: "BN", isTwoWay: false }))
      .toEqual({ countHitting: true, countPitching: false });
  });

  it("two-way players follow the assigned slot, not primary position", () => {
    // Assigned as pitcher → pitching only.
    expect(playerStatRoles({ posPrimary: "DH", assignedPosition: "P", isTwoWay: true }))
      .toEqual({ countHitting: false, countPitching: true });
    // Assigned as hitter → hitting only.
    expect(playerStatRoles({ posPrimary: "P", assignedPosition: "DH", isTwoWay: true }))
      .toEqual({ countHitting: true, countPitching: false });
  });

  it("handles null/blank positions safely (defaults to hitter)", () => {
    expect(playerStatRoles({ posPrimary: null, assignedPosition: null, isTwoWay: false }))
      .toEqual({ countHitting: true, countPitching: false });
  });
});
