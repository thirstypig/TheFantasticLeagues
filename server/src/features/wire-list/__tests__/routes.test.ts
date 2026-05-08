import { describe, it, expect } from "vitest";
import {
  CreatePeriodBodySchema,
  CreateAddEntryBodySchema,
  CreateDropEntryBodySchema,
  UpdateAddEntryBodySchema,
  UpdateDropEntryBodySchema,
  WireListErrorCodeSchema,
  WaiverDropModeSchema,
} from "../../../../../shared/api/wireList.js";

describe("wire-list — schema validation", () => {
  describe("CreatePeriodBodySchema", () => {
    it("accepts a valid ISO timestamp", () => {
      const r = CreatePeriodBodySchema.safeParse({ deadlineAt: "2026-12-31T23:59:59.000Z" });
      expect(r.success).toBe(true);
    });

    it("rejects a non-ISO string", () => {
      const r = CreatePeriodBodySchema.safeParse({ deadlineAt: "next Friday" });
      expect(r.success).toBe(false);
    });

    it("rejects missing deadlineAt", () => {
      const r = CreatePeriodBodySchema.safeParse({});
      expect(r.success).toBe(false);
    });
  });

  describe("CreateAddEntryBodySchema", () => {
    it("accepts minimal valid body (no priority — server assigns)", () => {
      const r = CreateAddEntryBodySchema.safeParse({ teamId: 1, playerId: 100 });
      expect(r.success).toBe(true);
    });

    it("strips an unexpected priority field (server assigns next slot)", () => {
      // priority is intentionally not part of the schema (todo #177); Zod
      // strips unknown keys by default. Reorder uses POST /reorder.
      const r = CreateAddEntryBodySchema.safeParse({ teamId: 1, playerId: 100, priority: 3 } as any);
      expect(r.success).toBe(true);
      if (r.success) expect((r.data as Record<string, unknown>).priority).toBeUndefined();
    });

    it("rejects negative IDs", () => {
      const r = CreateAddEntryBodySchema.safeParse({ teamId: -1, playerId: 100 });
      expect(r.success).toBe(false);
    });
  });

  describe("CreateDropEntryBodySchema", () => {
    it("accepts minimal body and defaults dropMode at server", () => {
      const r = CreateDropEntryBodySchema.safeParse({ teamId: 1, playerId: 100 });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.dropMode).toBeUndefined();
    });

    it("accepts dropMode IL_STASH", () => {
      const r = CreateDropEntryBodySchema.safeParse({
        teamId: 1, playerId: 100, dropMode: "IL_STASH",
      });
      expect(r.success).toBe(true);
    });

    it("rejects invalid dropMode", () => {
      const r = CreateDropEntryBodySchema.safeParse({
        teamId: 1, playerId: 100, dropMode: "TRADE",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("UpdateAddEntryBodySchema", () => {
    it("requires priority", () => {
      const r = UpdateAddEntryBodySchema.safeParse({});
      expect(r.success).toBe(false);
    });
  });

  describe("UpdateDropEntryBodySchema", () => {
    it("accepts priority-only update", () => {
      const r = UpdateDropEntryBodySchema.safeParse({ priority: 2 });
      expect(r.success).toBe(true);
    });

    it("accepts dropMode-only update", () => {
      const r = UpdateDropEntryBodySchema.safeParse({ dropMode: "IL_STASH" });
      expect(r.success).toBe(true);
    });

    it("rejects empty update", () => {
      const r = UpdateDropEntryBodySchema.safeParse({});
      expect(r.success).toBe(false);
    });
  });

  describe("WireListErrorCodeSchema", () => {
    it("contains the spec-confirmed error codes", () => {
      const codes = [
        "PERIOD_NOT_PENDING",
        "DEADLINE_IN_PAST",
        "PLAYER_NOT_FA",
        "PLAYER_NOT_ON_TEAM",
        "ACQUIRED_THIS_PERIOD",
        "DUPLICATE_PLAYER",
        "DUPLICATE_PRIORITY",
      ];
      for (const c of codes) {
        expect(WireListErrorCodeSchema.safeParse(c).success).toBe(true);
      }
    });

    it("rejects unrecognized codes (parse-time guard against drift)", () => {
      expect(WireListErrorCodeSchema.safeParse("MADE_UP_CODE").success).toBe(false);
    });
  });

  describe("WaiverDropModeSchema", () => {
    it("only accepts the two enum values", () => {
      expect(WaiverDropModeSchema.safeParse("RELEASE").success).toBe(true);
      expect(WaiverDropModeSchema.safeParse("IL_STASH").success).toBe(true);
      expect(WaiverDropModeSchema.safeParse("KEEP").success).toBe(false);
    });
  });
});
