import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBbrefGameLog, sumWindow } from "../bbrefParser.js";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/bbref_acuna.html"),
  "utf-8",
);

describe("parseBbrefGameLog", () => {
  const games = parseBbrefGameLog(html);

  it("parses a non-empty game log", () => {
    // The whole point: wrong data-stat keys return [] silently. Assert loudly.
    expect(games.length).toBeGreaterThan(20);
  });

  it("reads dates from data-stat='date', not 'date_game'", () => {
    expect(games[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("sumWindow", () => {
  const games = parseBbrefGameLog(html);

  it("reproduces the verified Period 5 window for Acuna", () => {
    // Ground truth, 2026-08-03: FBST PSP == MLB statsapi == BBRef.
    const got = sumWindow(games, "2026-07-05", "2026-08-01");
    expect(got.games).toBe(6);
    expect(got.stats.R).toBe(5);
    expect(got.stats.HR).toBe(2);
    expect(got.stats.RBI).toBe(2);
    expect(got.stats.SB).toBe(0);
    expect(got.stats.AB).toBe(22);
  });

  it("counts both halves of the 2026-07-29 doubleheader as separate games", () => {
    const got = sumWindow(games, "2026-07-29", "2026-07-29");
    expect(got.games).toBe(2);
  });

  it("throws rather than returning zeros when a window matches nothing", () => {
    expect(() => sumWindow(games, "2030-01-01", "2030-12-31")).toThrow(/no games/i);
  });
});
