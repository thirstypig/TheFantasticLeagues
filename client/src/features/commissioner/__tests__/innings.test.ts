import { describe, it, expect } from "vitest";
import { teamsUnderInnings, formatInnings } from "../api";

describe("teamsUnderInnings", () => {
  const resp = (ip: number, minInnings: number | null) => ({ teamInnings: [{ teamId: 1, teamName: "Bombers", ip }], minInnings });

  it("flags a team under the minimum", () => {
    expect(teamsUnderInnings(resp(46.3333, 50))).toEqual([{ teamName: "Bombers", ip: 46.3333, min: 50 }]);
  });
  it("does not flag exactly 50", () => expect(teamsUnderInnings(resp(50, 50))).toEqual([]));
  it("does not flag a float sum like 49.99999", () => expect(teamsUnderInnings(resp(49.99999, 50))).toEqual([]));
  it("flags 49 and two thirds", () => expect(teamsUnderInnings(resp(49.6667, 50))).toHaveLength(1));
  it("returns [] when there is no minimum", () => expect(teamsUnderInnings(resp(10, null))).toEqual([]));
  it("returns [] when the server sent no innings", () => expect(teamsUnderInnings({ minInnings: 50 })).toEqual([]));
});

describe("formatInnings", () => {
  it.each([[46.3333, "46⅓"], [49.6667, "49⅔"], [50, "50"], [0, "0"], [49.99999, "50"]])("%s -> %s", (ip, out) => {
    expect(formatInnings(ip)).toBe(out);
  });
});
