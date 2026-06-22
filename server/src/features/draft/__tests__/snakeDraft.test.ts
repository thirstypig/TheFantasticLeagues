import { describe, it, expect } from "vitest";
import { generatePickOrder, pickRound, pickInRound } from "../types.js";

describe("Snake Draft Logic", () => {
  describe("generatePickOrder", () => {
    it("should generate correct linear order for LINEAR draft", () => {
      const teamOrder = [1, 2, 3];
      const order = generatePickOrder(teamOrder, 2, "LINEAR");
      expect(order).toEqual([1, 2, 3, 1, 2, 3]);
    });

    it("should reverse order every odd round for SNAKE draft", () => {
      const teamOrder = [1, 2, 3];
      const order = generatePickOrder(teamOrder, 3, "SNAKE");
      // Round 1: 1, 2, 3 (normal)
      // Round 2: 3, 2, 1 (reversed)
      // Round 3: 1, 2, 3 (normal)
      expect(order).toEqual([1, 2, 3, 3, 2, 1, 1, 2, 3]);
    });

    it("should handle 2-team snake draft correctly", () => {
      const teamOrder = [10, 20];
      const order = generatePickOrder(teamOrder, 3, "SNAKE");
      // Round 1: 10, 20 (normal)
      // Round 2: 20, 10 (reversed)
      // Round 3: 10, 20 (normal)
      expect(order).toEqual([10, 20, 20, 10, 10, 20]);
    });

    it("should handle 12-team snake draft correctly", () => {
      const teams = Array.from({ length: 12 }, (_, i) => i + 1);
      const order = generatePickOrder(teams, 2, "SNAKE");
      const round1 = order.slice(0, 12);
      const round2 = order.slice(12, 24);

      expect(round1).toEqual(teams);
      expect(round2).toEqual([...teams].reverse());
    });
  });

  describe("pickRound", () => {
    it("should calculate round 1 for first pick", () => {
      expect(pickRound(0, 12)).toBe(1);
    });

    it("should calculate round 1 for last pick of first round", () => {
      expect(pickRound(11, 12)).toBe(1);
    });

    it("should calculate round 2 for first pick of second round", () => {
      expect(pickRound(12, 12)).toBe(2);
    });

    it("should calculate round 3 for picks in third round", () => {
      expect(pickRound(23, 12)).toBe(2);
      expect(pickRound(24, 12)).toBe(3);
      expect(pickRound(35, 12)).toBe(3);
    });

    it("should handle 4-team league correctly", () => {
      expect(pickRound(0, 4)).toBe(1);
      expect(pickRound(3, 4)).toBe(1);
      expect(pickRound(4, 4)).toBe(2);
      expect(pickRound(7, 4)).toBe(2);
    });
  });

  describe("pickInRound", () => {
    it("should calculate position within round", () => {
      expect(pickInRound(0, 12)).toBe(1);
      expect(pickInRound(1, 12)).toBe(2);
      expect(pickInRound(11, 12)).toBe(12);
      expect(pickInRound(12, 12)).toBe(1);
      expect(pickInRound(23, 12)).toBe(12);
      expect(pickInRound(24, 12)).toBe(1);
    });

    it("should work with 4-team league", () => {
      expect(pickInRound(0, 4)).toBe(1);
      expect(pickInRound(1, 4)).toBe(2);
      expect(pickInRound(3, 4)).toBe(4);
      expect(pickInRound(4, 4)).toBe(1);
    });
  });

  describe("Snake draft pick order verification", () => {
    it("should alternate team picking order each round", () => {
      const teamOrder = [1, 2, 3, 4];
      const order = generatePickOrder(teamOrder, 4, "SNAKE");

      // Round 1: teams in order 1, 2, 3, 4
      const round1 = order.slice(0, 4);
      expect(round1).toEqual([1, 2, 3, 4]);

      // Round 2: teams in reverse 4, 3, 2, 1
      const round2 = order.slice(4, 8);
      expect(round2).toEqual([4, 3, 2, 1]);

      // Round 3: back to normal 1, 2, 3, 4
      const round3 = order.slice(8, 12);
      expect(round3).toEqual([1, 2, 3, 4]);

      // Round 4: reverse again 4, 3, 2, 1
      const round4 = order.slice(12, 16);
      expect(round4).toEqual([4, 3, 2, 1]);
    });

    it("should give last pick in odd rounds to team 1", () => {
      const teamOrder = [1, 2, 3, 4, 5];
      const order = generatePickOrder(teamOrder, 3, "SNAKE");

      // Last pick of round 1 (pick #5)
      expect(order[4]).toBe(5);
      // First pick of round 2 (pick #6) — should be 5 (team reversed)
      expect(order[5]).toBe(5);
      // First pick of round 3 (pick #11) — should be 1 (back to normal)
      expect(order[10]).toBe(1);
    });
  });
});
