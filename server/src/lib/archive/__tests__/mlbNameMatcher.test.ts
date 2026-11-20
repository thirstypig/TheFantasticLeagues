import { describe, expect, it } from "vitest";
import { archivePlayerKey, isAbbreviationOf, matchPlayer, splitWorkbookName, type MlbCandidate } from "../mlbNameMatcher.js";

// Real people and the workbook spellings that refer to them (2004–2025 sheets).
const c = (mlbId: number, fullName: string, firstName: string, lastName: string, position: string, nl = true): MlbCandidate =>
  ({ mlbId, fullName, firstName, lastName, position, nl });

const william = c(661388, "William Contreras", "William", "Contreras", "C");
const willson = c(575929, "Willson Contreras", "Willson", "Contreras", "C");
const ranger = c(605452, "Ranger Suárez", "Ranger", "Suárez", "P");
const robert = c(663158, "Robert Suarez", "Robert", "Suarez", "P");
const eugenio = c(553993, "Eugenio Suárez", "Eugenio", "Suárez", "3B");
const realmuto = c(592663, "J.T. Realmuto", "Jacob", "Realmuto", "C");
const alvarez = c(682626, "Francisco Alvarez", "Francisco", "Alvarez", "C");
const pca = c(691718, "Pete Crow-Armstrong", "Peter", "Crow-Armstrong", "CF");
const ankiel = c(407886, "Rick Ankiel", "Richard", "Ankiel", "P");
const ohtani = c(660271, "Shohei Ohtani", "Shohei", "Ohtani", "TWP");
const willSmithC = c(669257, "Will Smith", "William", "Smith", "C");
const willSmithP = c(519293, "Will Smith", "William", "Smith", "P");
const ad = c(456781, "Adrián González", "Adrián", "González", "1B");
const alexG = c(134181, "Alex Gonzalez", "Alexander", "Gonzalez", "SS");
const pool = [william, willson, ranger, robert, eugenio, realmuto, alvarez, pca, ankiel, ohtani, willSmithC, willSmithP, ad, alexG];

describe("splitWorkbookName", () => {
  it("separates initials from the surname, whatever the punctuation", () => {
    expect(splitWorkbookName("J.D. Martinez")).toEqual({ abbr: "jd", surname: "martinez" });
    expect(splitWorkbookName("J-H. Lee")).toEqual({ abbr: "jh", surname: "lee" });
    expect(splitWorkbookName("Wm. Contreras")).toEqual({ abbr: "wm", surname: "contreras" });
    expect(splitWorkbookName("L. Gurriel Jr,")).toEqual({ abbr: "l", surname: "gurriel" });
    expect(splitWorkbookName("E. De La Cruz")).toEqual({ abbr: "e", surname: "de la cruz" });
  });
});

describe("isAbbreviationOf", () => {
  it("needs the abbreviation's letters in order from the first letter", () => {
    expect(isAbbreviationOf("wm", "William")).toBe(true);
    expect(isAbbreviationOf("wm", "Willson")).toBe(false);
    expect(isAbbreviationOf("wiln", "Willson")).toBe(true);
    expect(isAbbreviationOf("ra", "Ranger")).toBe(true);
    expect(isAbbreviationOf("ra", "Robert")).toBe(false);
    expect(isAbbreviationOf("jt", "J.T.")).toBe(true);
  });
});

describe("matchPlayer: middle names", () => {
  it("uses middle initials and multi-word given names", () => {
    const scott = { ...c(114924, "Alex Gonzalez", "Alexander", "Gonzalez", "SS"), middleName: "Scott" };
    const luis = { ...c(136460, "Álex González", "Álexander", "González", "SS"), middleName: "Luis" };
    const wilyMo = c(276377, "Wily Mo Peña", "Wily", "Peña", "RF");
    expect(matchPlayer("A. S. Gonzalez", "SS", [scott, luis])).toMatchObject({ status: "matched", candidate: { mlbId: 114924 } });
    expect(matchPlayer("A. Gonzalez", "SS", [scott, luis])).toMatchObject({ status: "ambiguous" });
    expect(matchPlayer("W.M. Pena", "OF", [wilyMo])).toMatchObject({ status: "matched", candidate: { mlbId: 276377 } });
  });
});

describe("matchPlayer", () => {
  it("uses the first-name abbreviation to split brothers and namesakes", () => {
    expect(matchPlayer("Wm. Contreras", "C", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 661388 } });
    expect(matchPlayer("Wiln. Contreras", "C", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 575929 } });
    expect(matchPlayer("Ra. Suarez", "P", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 605452 } });
    expect(matchPlayer("Ro. Suarez", "P", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 663158 } });
    expect(matchPlayer("Ad. Gonzalez", "1B", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 456781 } });
  });

  it("uses the slot's role: a P slot is a pitcher, a hitter slot isn't", () => {
    expect(matchPlayer("E. Suarez", "3B", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 553993 } });
    expect(matchPlayer("W. Smith", "C", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 669257 } });
    expect(matchPlayer("W. Smith", "P", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 519293 } });
  });

  it("lets a two-way player fill either kind of slot", () => {
    expect(matchPlayer("S. Ohtani", "DH", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 660271 } });
    expect(matchPlayer("S. Ohtani", "P", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 660271 } });
  });

  it("survives typos, truncation and initials-style first names", () => {
    expect(matchPlayer("F. Alverez", "C", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 682626 }, how: "typo" });
    expect(matchPlayer("P. Crow-Armstron", "OF", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 691718 } });
    expect(matchPlayer("JT. Realmuto", "C", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 592663 } });
    expect(matchPlayer("R. Ankiel", "P", pool)).toMatchObject({ status: "matched", candidate: { mlbId: 407886 } });
  });

  it("reports ambiguity instead of guessing, and unmatched when nothing fits", () => {
    const res = matchPlayer("W. Smith", "IL1", pool);
    expect(res.status).toBe("ambiguous");
    expect(res.status === "ambiguous" && res.candidates.map((x) => x.mlbId).sort()).toEqual([519293, 669257]);
    // Two hitters named Gonzalez with first names starting "A": a real ambiguity for review.
    expect(matchPlayer("A. Gonzalez", "1B", pool)).toMatchObject({ status: "ambiguous" });
    expect(matchPlayer("Z. Nobody", "OF", pool)).toEqual({ status: "unmatched" });
  });

  it("prefers the NL player when an AL namesake also fits", () => {
    const al = c(999, "Francisco Alvarez", "Francisco", "Alvarez", "C", false);
    expect(matchPlayer("F. Alvarez", "C", [alvarez, al])).toMatchObject({ status: "matched", candidate: { mlbId: 682626 } });
  });
});

describe("archivePlayerKey", () => {
  it("keeps two same-spelling players on one team apart by role (2021 RGS: Edwin and Elias Díaz)", () => {
    expect(archivePlayerKey("RGS", "E. Diaz", "P")).not.toBe(archivePlayerKey("RGS", "E. Diaz", "C"));
    expect(archivePlayerKey("RGS", "E. Diaz", "C")).toBe(archivePlayerKey("RGS", "E. Díaz", "1B"));
    expect(archivePlayerKey("RGS", "E. Diaz", "IL1")).toBe("RGS|e|diaz|X");
  });
});
