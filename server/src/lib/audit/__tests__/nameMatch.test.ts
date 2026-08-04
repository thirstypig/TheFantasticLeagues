import { describe, it, expect } from "vitest";
import { normalizeName, matchByName } from "../nameMatch.js";

describe("normalizeName", () => {
  it("strips accents so FanGraphs and FBST spellings converge", () => {
    expect(normalizeName("Ronald Acuña Jr.")).toBe(normalizeName("Ronald Acuna Jr"));
    expect(normalizeName("Andrés Chaparro")).toBe(normalizeName("Andres Chaparro"));
    expect(normalizeName("Jesús Luzardo")).toBe(normalizeName("Jesus Luzardo"));
  });

  it("ignores suffix punctuation but keeps the suffix token", () => {
    expect(normalizeName("Ronald Acuna Jr.")).toBe("ronald acuna jr");
  });

  it("does not collapse two different players", () => {
    expect(normalizeName("Will Smith")).not.toBe(normalizeName("Will Klein"));
  });
});

describe("matchByName", () => {
  const roster = [{ name: "Ronald Acuña Jr." }, { name: "Michael Busch" }];

  it("matches across accent spellings", () => {
    expect(matchByName("Ronald Acuna Jr", roster)?.name).toBe("Ronald Acuña Jr.");
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(matchByName("Shohei Ohtani", roster)).toBeNull();
  });

  it("returns null on an ambiguous match instead of picking one", () => {
    const dupes = [{ name: "Will Smith" }, { name: "Will Smith" }];
    expect(matchByName("Will Smith", dupes)).toBeNull();
  });
});
