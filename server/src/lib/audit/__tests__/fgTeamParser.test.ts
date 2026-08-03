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
  const { players } = parseFgTeamPage(html);

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
});
