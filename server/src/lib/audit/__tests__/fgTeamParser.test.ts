import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFgTeamPage } from "../fgTeamParser.js";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/fg_team_0.html"),
  "utf-8",
);

describe("parseFgTeamPage", () => {
  const { players, skipped } = parseFgTeamPage(html);

  it("parses a full roster, not an empty list", () => {
    // Silent-zero guard: a wrong selector yields [] which reads as "no deltas".
    expect(players.length).toBeGreaterThan(15);
  });

  it("reads the season value from each two-value cell", () => {
    // Cells hold "season\nweek" — e.g. "419\n3". We want 419.
    const busch = players.find((p) => p.name === "Michael Busch");
    expect(busch?.stats.AB).toBe("419");
  });

  it("captures FG's own active/reserved status", () => {
    const busch = players.find((p) => p.name === "Michael Busch");
    expect(busch?.status).toBe("act");
    expect(busch?.reserved).toBe(false);
  });

  it("parses pitchers with the pitching column set", () => {
    const sale = players.find((p) => p.name === "Chris Sale");
    expect(sale?.stats.IP).toBe("117.0");
    expect(sale?.stats.SO).toBe("143");
  });

  it("does not carry the reserved-section flag across a table boundary", () => {
    // Chris Sale is an active pitcher (Sta "act"). The "previously reserved
    // hitters" divider earlier in the document must not bleed into the
    // Active Pitchers table.
    const sale = players.find((p) => p.name === "Chris Sale");
    expect(sale?.status).toBe("act");
    expect(sale?.reserved).toBe(false);
  });

  it("parses previously-reserved carryover rows instead of dropping them", () => {
    // The "previously reserved hitters" subsection holds real rostered
    // players (Ronald Acuna, Andrew Vaughn) whose stat cells are flat
    // single values, not "season\nweek" pairs. These must not vanish.
    const acunaRows = players.filter((p) => p.name === "Ronald Acuna");
    expect(acunaRows.length).toBeGreaterThan(0);
    expect(acunaRows.some((p) => p.reserved === true)).toBe(true);

    const vaughn = players.find((p) => p.name === "Andrew Vaughn");
    expect(vaughn).toBeDefined();
  });

  it("keeps multi-stint players as distinguishable rows, not name collisions", () => {
    // `name` is not a key. Acuna has a current active line plus a reserved
    // carryover stint; Vaughn is released and carries a stint in BOTH tables.
    // A consumer doing .find(p => p.name === X) picks an arbitrary one.
    const acuna = players.filter((p) => p.name === "Ronald Acuna");
    expect(acuna).toHaveLength(2);
    expect(acuna.map((p) => ({ r: p.reserved, c: p.carryover, ab: p.stats.AB }))).toEqual([
      { r: false, c: false, ab: "199" }, // current stint, Active table
      { r: true, c: true, ab: "22" }, // prior stint, Reserved table
    ]);

    const vaughn = players.filter((p) => p.name === "Andrew Vaughn");
    expect(vaughn).toHaveLength(2);
    // Both are carryover and both say status "rel" — but only ONE is in the
    // Reserved table. Deriving `reserved` from status marked both, which
    // moved 50 AB into the wrong table's total.
    expect(vaughn.every((p) => p.carryover && p.status === "rel")).toBe(true);
    expect(vaughn.map((p) => p.reserved)).toEqual([false, true]);
  });

  it("reproduces the page's own TOTAL: rows when each table is summed", () => {
    // The strongest available check on this parser: OnRoto publishes a TOTAL:
    // row per table, so the fixture self-checks. Every row must be present
    // AND filed under the right table — a dropped row or a misfiled one
    // breaks the identity. Carryover rows ARE included in FG's totals.
    //
    // Read straight off fg_team_0.html's two hitter TOTAL: rows (2026-08-03).
    const hitters = players.filter((p) => p.stats.AB !== undefined);
    const sum = (rows: typeof hitters, k: string) =>
      rows.reduce((acc, p) => acc + Number(p.stats[k] ?? 0), 0);

    const active = hitters.filter((p) => !p.reserved);
    expect({ AB: sum(active, "AB"), H: sum(active, "H"), R: sum(active, "R"),
             HR: sum(active, "HR"), RBI: sum(active, "RBI"), SB: sum(active, "SB") })
      .toEqual({ AB: 4813, H: 1280, R: 699, HR: 167, RBI: 646, SB: 124 });

    const reserved = hitters.filter((p) => p.reserved);
    expect({ AB: sum(reserved, "AB"), H: sum(reserved, "H"), R: sum(reserved, "R"),
             HR: sum(reserved, "HR"), RBI: sum(reserved, "RBI"), SB: sum(reserved, "SB") })
      .toEqual({ AB: 49, H: 11, R: 10, HR: 3, RBI: 7, SB: 0 });
  });

  it("parses every real player row in the fixture, with none skipped", () => {
    // Derived directly from the fixture: 22 Active_Hitters_prev rows + 17
    // Active_Pitchers_prev rows + 2 Reserved_Hitters_prev rows (Reserved
    // Pitchers has none this week) = 41. Verified via
    // `grep -oE '<tr class="[A-Za-z_]+_prev">' fg_team_0.html | wc -l`.
    // A loose `> 15` threshold would not have caught the 23-vs-41 drop.
    expect(players.length).toBe(41);
    expect(skipped).toEqual([]);
  });
});
