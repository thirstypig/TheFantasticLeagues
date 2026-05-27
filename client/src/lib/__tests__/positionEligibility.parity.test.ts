/**
 * Parity test: client positionToSlots must stay in sync with
 * server/src/lib/sports/baseball.ts.
 *
 * If this test fails, update BOTH the client implementation
 * (client/src/lib/sports/baseball.ts) and the server implementation
 * (server/src/lib/sports/baseball.ts) together.
 *
 * The CANONICAL_SLOTS table below is the single source of truth for which
 * slots each MLB position maps to. Any change to the mapping requires updating
 * this table AND both implementation files.
 */
import { describe, it, expect } from "vitest";
import { positionToSlots } from "../sports/baseball";

const CANONICAL_SLOTS: [input: string, expected: string[]][] = [
  // Hitters — positional slots + utility slot
  ["C",   ["C"]],
  ["1B",  ["1B", "CM"]],
  ["2B",  ["2B", "MI"]],
  ["3B",  ["3B", "CM"]],
  ["SS",  ["SS", "MI"]],
  ["OF",  ["OF"]],
  ["LF",  ["OF"]],
  ["CF",  ["OF"]],
  ["RF",  ["OF"]],
  ["DH",  ["DH"]],

  // Pitchers — all map to the generic P slot
  ["SP",  ["P"]],
  ["RP",  ["P"]],
  ["P",   ["P"]],
  ["CL",  ["P"]],
  ["TWP", ["P"]],

  // Unknown positions return empty
  ["DH2",   []],
  ["UTIL",  []],
  ["BN",    []],
  ["",      []],

  // Input is case-insensitive (implementations call toUpperCase internally)
  ["1b",  ["1B", "CM"]],
  ["sp",  ["P"]],
  ["of",  ["OF"]],
];

describe("positionToSlots parity (client ↔ server canonical fixture)", () => {
  it.each(CANONICAL_SLOTS)("positionToSlots(%s) → %j", (input, expected) => {
    expect([...positionToSlots(input)]).toEqual(expected);
  });
});
