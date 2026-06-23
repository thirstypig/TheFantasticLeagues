import { describe, it, expect } from "vitest";
import {
  getLeagueCategories,
  getCategoryValue,
  hasComponentStats,
} from "../categoryEngine.js";
import type { CategoryDef } from "../categoryEngine.js";

describe("categoryEngine", () => {
  describe("getLeagueCategories", () => {
    it("returns MLB default categories when no custom categories provided", () => {
      const categories = getLeagueCategories("baseball");
      expect(categories.length).toBeGreaterThan(0);
      expect(categories.some((c) => c.key === "R")).toBe(true);
      expect(categories.some((c) => c.key === "ERA")).toBe(true);
    });

    it("marks ERA and WHIP as lower-is-better", () => {
      const categories = getLeagueCategories("baseball");
      const era = categories.find((c) => c.key === "ERA");
      const whip = categories.find((c) => c.key === "WHIP");
      expect(era?.lowerIsBetter).toBe(true);
      expect(whip?.lowerIsBetter).toBe(true);
    });

    it("marks R, HR, RBI as higher-is-better", () => {
      const categories = getLeagueCategories("baseball");
      const r = categories.find((c) => c.key === "R");
      const hr = categories.find((c) => c.key === "HR");
      const rbi = categories.find((c) => c.key === "RBI");
      expect(r?.lowerIsBetter).toBe(false);
      expect(hr?.lowerIsBetter).toBe(false);
      expect(rbi?.lowerIsBetter).toBe(false);
    });

    it("returns custom categories when provided", () => {
      const custom = ["R", "HR", "AVG"];
      const categories = getLeagueCategories("baseball", custom);
      expect(categories.length).toBe(3);
      expect(categories.map((c) => c.key)).toEqual(["R", "HR", "AVG"]);
    });

    it("returns NFL categories for NFL sport", () => {
      const categories = getLeagueCategories("nfl");
      expect(categories.length).toBeGreaterThan(0);
      // NFL should have passing/rushing/receiving stats
      const hasPassYd = categories.some((c) => c.key === "pass_yd");
      const hasRushYd = categories.some((c) => c.key === "rush_yd");
      expect(hasPassYd || hasRushYd).toBe(true);
    });

    it("returns NBA categories for NBA sport", () => {
      const categories = getLeagueCategories("nba");
      expect(categories.length).toBeGreaterThan(0);
      // NBA should have pts, reb, ast, etc.
      const hasPts = categories.some((c) => c.key === "pts");
      expect(hasPts).toBe(true);
    });

    it("defaults to baseball when sport not specified", () => {
      const categories = getLeagueCategories();
      expect(categories.some((c) => c.key === "R")).toBe(true);
      expect(categories.some((c) => c.key === "ERA")).toBe(true);
    });
  });

  describe("getCategoryValue", () => {
    const teamStats: Record<string, number> = {
      R: 100,
      HR: 50,
      RBI: 90,
      AVG: 0.280,
      H: 140,
      AB: 500,
      W: 15,
      ERA: 3.45,
      IP: 200,
      ER: 76.67,
      BB_H: 250,
      WHIP: 1.25,
    };

    const baseballCategories = getLeagueCategories("baseball");

    it("returns direct stat value for counting stats", () => {
      const rCat = baseballCategories.find((c) => c.key === "R")!;
      const value = getCategoryValue(teamStats, rCat, "baseball");
      expect(value).toBe(100);
    });

    it("computes AVG from H and AB components", () => {
      const avgCat = baseballCategories.find((c) => c.key === "AVG")!;
      const value = getCategoryValue(teamStats, avgCat, "baseball");
      expect(value).toBeCloseTo(0.28, 2); // 140 / 500
    });

    it("computes ERA from ER and IP components", () => {
      const eraCat = baseballCategories.find((c) => c.key === "ERA")!;
      const value = getCategoryValue(teamStats, eraCat, "baseball");
      expect(value).toBeCloseTo(3.45, 1); // (76.67 / 200) * 9
    });

    it("computes WHIP from BB_H and IP components", () => {
      const whipCat = baseballCategories.find((c) => c.key === "WHIP")!;
      const value = getCategoryValue(teamStats, whipCat, "baseball");
      expect(value).toBeCloseTo(1.25, 2); // 250 / 200
    });

    it("returns 0 for AVG when AB is 0", () => {
      const stats = { H: 10, AB: 0 };
      const avgCat = baseballCategories.find((c) => c.key === "AVG")!;
      const value = getCategoryValue(stats, avgCat, "baseball");
      expect(value).toBe(0);
    });

    it("returns 0 for ERA when IP is 0", () => {
      const stats = { ER: 5, IP: 0 };
      const eraCat = baseballCategories.find((c) => c.key === "ERA")!;
      const value = getCategoryValue(stats, eraCat, "baseball");
      expect(value).toBe(0);
    });

    it("returns 0 for WHIP when IP is 0", () => {
      const stats = { BB_H: 5, IP: 0 };
      const whipCat = baseballCategories.find((c) => c.key === "WHIP")!;
      const value = getCategoryValue(stats, whipCat, "baseball");
      expect(value).toBe(0);
    });

    it("returns 0 for missing category in non-baseball sports", () => {
      const unknownCat: CategoryDef = { key: "unknown", label: "Unknown", lowerIsBetter: false };
      const value = getCategoryValue(teamStats, unknownCat, "nfl");
      expect(value).toBe(0);
    });

    it("returns 0 for missing stats in team record", () => {
      const stats: Record<string, number> = { R: 100 };
      const hrCat = baseballCategories.find((c) => c.key === "HR")!;
      const value = getCategoryValue(stats, hrCat, "baseball");
      expect(value).toBe(0);
    });
  });

  describe("hasComponentStats", () => {
    it("returns true when H and AB present (AVG components)", () => {
      const stats = { H: 140, AB: 500 };
      expect(hasComponentStats(stats, "baseball")).toBe(true);
    });

    it("returns true when ER and IP present (ERA components)", () => {
      const stats = { ER: 75, IP: 200 };
      expect(hasComponentStats(stats, "baseball")).toBe(true);
    });

    it("returns true when BB_H and IP present (WHIP components)", () => {
      const stats = { BB_H: 250, IP: 200 };
      expect(hasComponentStats(stats, "baseball")).toBe(true);
    });

    it("returns false when no component stats present", () => {
      const stats = { R: 100, HR: 50, RBI: 90 };
      expect(hasComponentStats(stats, "baseball")).toBe(false);
    });

    it("returns false for non-baseball sports", () => {
      const stats = { H: 140, AB: 500 };
      expect(hasComponentStats(stats, "nfl")).toBe(false);
      expect(hasComponentStats(stats, "nba")).toBe(false);
    });

    it("returns false for empty stats", () => {
      expect(hasComponentStats({}, "baseball")).toBe(false);
    });
  });

  describe("integration: full category flow", () => {
    it("loads categories, checks for components, and computes values", () => {
      const teamStats: Record<string, number> = {
        R: 100,
        HR: 50,
        H: 140,
        AB: 500,
        ER: 75,
        IP: 200,
        BB_H: 250,
      };

      // 1. Load categories
      const categories = getLeagueCategories("baseball");
      expect(categories.length).toBeGreaterThan(0);

      // 2. Check for component stats
      const hasComponents = hasComponentStats(teamStats, "baseball");
      expect(hasComponents).toBe(true);

      // 3. Compute values for rate stats (no pre-computed values, so should compute from components)
      const avgCat = categories.find((c) => c.key === "AVG")!;
      const avg = getCategoryValue(teamStats, avgCat, "baseball");
      expect(avg).toBeCloseTo(0.28, 2); // 140 / 500

      const eraCat = categories.find((c) => c.key === "ERA")!;
      const era = getCategoryValue(teamStats, eraCat, "baseball");
      expect(era).toBeCloseTo(3.375, 2); // (75 / 200) * 9

      const whipCat = categories.find((c) => c.key === "WHIP")!;
      const whip = getCategoryValue(teamStats, whipCat, "baseball");
      expect(whip).toBeCloseTo(1.25, 2); // 250 / 200
    });
  });
});
