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
  const { games, skipped } = parseBbrefGameLog(html);

  it("parses the exact number of games in the fixture", () => {
    // Loose thresholds (toBeGreaterThan) are the exact smell that let 18 of
    // 41 rows silently vanish in the sibling FanGraphs parser. This count
    // was independently derived from the raw fixture before implementing:
    // 67 rows carry a data-stat="date" cell, 7 are non-game (6 repeated
    // table headers + 1 blank separator), leaving 60 real games.
    expect(games.length).toBe(60);
  });

  it("reads dates from data-stat='date', not 'date_game'", () => {
    expect(games[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("surfaces every non-game row with a date-stat cell instead of dropping it silently", () => {
    // Exactly the 6 repeated "Date" header rows plus the 1 blank separator
    // row identified by manual audit of the fixture. A caller sees this list
    // and can decide whether the run is INCOMPLETE — it must never just be
    // absorbed into a shrunken `games` count.
    expect(skipped).toEqual(["Date", "Date", "Date", "Date", "Date", "Date", "<blank>"]);
  });
});

describe("sumWindow", () => {
  const { games } = parseBbrefGameLog(html);

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

describe("parseBbrefGameLog NaN-safety", () => {
  it("defaults missing, blank, or non-numeric stat cells to 0 instead of NaN", () => {
    // The real fixture has no empty/non-numeric stat cells, so this branch
    // (bbrefParser.ts: `n = v === null || v === "" ? NaN : Number(v)` /
    // `Number.isFinite(n) ? n : 0`) has zero coverage from the fixture-driven
    // tests above. A small synthetic row closes it.
    const syntheticHtml = `
      <table><tbody>
        <tr>
          <td data-stat="date">2026-05-01</td>
          <td data-stat="b_r">3</td>
          <td data-stat="b_hr"></td>
          <td data-stat="b_rbi">not-a-number</td>
          <td data-stat="b_ab">4</td>
          <td data-stat="b_h">2</td>
        </tr>
      </tbody></table>
    `;
    const { games, skipped } = parseBbrefGameLog(syntheticHtml);
    expect(skipped).toEqual([]);
    expect(games).toHaveLength(1);
    expect(games[0]!.stats).toEqual({
      R: 3,
      HR: 0, // blank cell
      RBI: 0, // non-numeric cell
      SB: 0, // missing data-stat entirely
      AB: 4,
      H: 2,
    });
  });
});
