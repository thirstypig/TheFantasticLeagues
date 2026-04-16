import { describe, it, expect } from "vitest";
import { createPlayerNameMatcher } from "../services/playerNameMatcher.js";

describe("createPlayerNameMatcher", () => {
  describe("Will Smith disambiguation (the motivating bug)", () => {
    const willSmith = createPlayerNameMatcher("Will Smith");

    it("matches articles about Will Smith by full name", () => {
      expect(willSmith.matches("Will Smith homers in Dodgers win")).toBe(true);
      expect(willSmith.matches("will smith extends hit streak")).toBe(true);
      expect(willSmith.matches("Catcher Will Smith signs extension")).toBe(true);
    });

    it("does NOT match articles about other Smiths", () => {
      expect(willSmith.matches("Dominic Smith hits walk-off")).toBe(false);
      expect(willSmith.matches("Derek Smith called up from AAA")).toBe(false);
      expect(willSmith.matches("Kevan Smith signs minor league deal")).toBe(false);
    });

    it("does NOT match articles with bare 'Smith' reference", () => {
      expect(willSmith.matches("Smith grand slam in 9th")).toBe(false);
      expect(willSmith.matches("The Smith trade rumors heat up")).toBe(false);
    });

    it("does NOT match substring artifacts", () => {
      expect(willSmith.matches("Smithson debut at Citi Field")).toBe(false);
      expect(willSmith.matches("Blacksmith Hill stadium renovation")).toBe(false);
    });

    it("disables last-name matching for Smith", () => {
      expect(willSmith.canMatchByLast).toBe(false);
      expect(willSmith.fullName).toBe("will smith");
      expect(willSmith.lastName).toBe("smith");
    });
  });

  describe("Distinctive last names (should match by last name)", () => {
    const ohtani = createPlayerNameMatcher("Shohei Ohtani");

    it("matches full name", () => {
      expect(ohtani.matches("Shohei Ohtani throws 7 scoreless")).toBe(true);
    });

    it("matches last name alone", () => {
      expect(ohtani.matches("Ohtani set to return Tuesday")).toBe(true);
      expect(ohtani.matches("Dodgers' Ohtani hits 30th HR")).toBe(true);
    });

    it("respects word boundaries on last name", () => {
      expect(ohtani.matches("Ohtanis are everywhere")).toBe(false);
    });

    it("enables last-name matching for Ohtani", () => {
      expect(ohtani.canMatchByLast).toBe(true);
    });
  });

  describe("Ambiguous last names are all disabled", () => {
    const cases = [
      ["Fernando Tatis Jr.", "tatis"], // jr. handled via full-name match
      ["Jose Martinez", "martinez"],
      ["Freddy Garcia", "garcia"],
      ["Randal Grichuk", "grichuk"],
    ];

    it("Martinez / Garcia / Rodriguez / etc. only match on full name", () => {
      const martinez = createPlayerNameMatcher("Jose Martinez");
      expect(martinez.canMatchByLast).toBe(false);
      expect(martinez.matches("Jose Martinez signs with Reds")).toBe(true);
      expect(martinez.matches("J.D. Martinez clears waivers")).toBe(false);
      expect(martinez.matches("Michael Martinez DFAd")).toBe(false);
    });

    it("Rodriguez does not match other Rodriguezes", () => {
      const erod = createPlayerNameMatcher("Eduardo Rodriguez");
      expect(erod.matches("Eduardo Rodriguez wins 10th game")).toBe(true);
      expect(erod.matches("Julio Rodriguez 3-for-4 with homer")).toBe(false);
    });
  });

  describe("Short last names disabled (≤4 chars)", () => {
    it("'Lee' does not last-name-match", () => {
      const khrisLee = createPlayerNameMatcher("Khris Lee");
      expect(khrisLee.canMatchByLast).toBe(false);
      expect(khrisLee.matches("Khris Lee hits debut HR")).toBe(true);
      expect(khrisLee.matches("Lee struggles in 7th inning")).toBe(false);
    });

    it("'Cruz' does not last-name-match", () => {
      const nelsonCruz = createPlayerNameMatcher("Nelson Cruz");
      expect(nelsonCruz.canMatchByLast).toBe(false);
    });
  });

  describe("Punctuation and edge cases", () => {
    const trout = createPlayerNameMatcher("Mike Trout");

    it("handles possessive apostrophe", () => {
      expect(trout.matches("Mike Trout's 3-run shot wins it")).toBe(true);
      expect(trout.matches("Trout's injury update")).toBe(true);
    });

    it("handles punctuation-adjacent match", () => {
      expect(trout.matches("Trout, Ohtani both homer")).toBe(true);
      expect(trout.matches("(Trout) returns from IL")).toBe(true);
    });

    it("handles period/sentence boundary", () => {
      expect(trout.matches("Angels win. Trout led off with a double.")).toBe(true);
    });
  });

  describe("Input normalization", () => {
    it("trims leading/trailing whitespace", () => {
      const m = createPlayerNameMatcher("  Mike Trout  ");
      expect(m.fullName).toBe("mike trout");
      expect(m.matches("Mike Trout homers")).toBe(true);
    });

    it("collapses multiple whitespace runs", () => {
      const m = createPlayerNameMatcher("Mike    Trout");
      expect(m.fullName).toBe("mike trout");
    });

    it("is case-insensitive on input and text", () => {
      const m = createPlayerNameMatcher("MIKE TROUT");
      expect(m.fullName).toBe("mike trout");
      expect(m.matches("mike trout")).toBe(true);
      expect(m.matches("MIKE TROUT")).toBe(true);
      expect(m.matches("Mike TROUT")).toBe(true);
    });

    it("returns a no-op matcher for inputs under 2 chars", () => {
      const m = createPlayerNameMatcher("A");
      expect(m.matches("anything")).toBe(false);
    });

    it("returns a no-op matcher for empty input", () => {
      const m = createPlayerNameMatcher("");
      expect(m.matches("Mike Trout")).toBe(false);
    });
  });

  describe("Regex metacharacter safety", () => {
    it("escapes dots in suffixes like Jr.", () => {
      // "Jr." has a period that would match any character if unescaped.
      const m = createPlayerNameMatcher("Ronald Acuna Jr.");
      expect(m.matches("Ronald Acuna Jr. steals 4th base")).toBe(true);
      expect(m.matches("Ronald Acuna JrX steals")).toBe(false); // dot is literal, not wildcard
    });

    it("does not throw on names with special chars", () => {
      expect(() => createPlayerNameMatcher("O'Brien")).not.toThrow();
      expect(() => createPlayerNameMatcher("José Ramírez")).not.toThrow();
    });
  });

  describe("Single-word names", () => {
    it("single-word input matches word-boundary on that word only", () => {
      const m = createPlayerNameMatcher("Ichiro");
      expect(m.matches("Ichiro returns to Mariners")).toBe(true);
      expect(m.matches("Ichirohi debut")).toBe(false); // word boundary
      expect(m.canMatchByLast).toBe(false); // no separate last name
    });
  });

  describe("Empty or null text input", () => {
    const matcher = createPlayerNameMatcher("Mike Trout");
    it("returns false for empty text", () => {
      expect(matcher.matches("")).toBe(false);
    });
  });
});
