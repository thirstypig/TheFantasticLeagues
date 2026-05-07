import { describe, it, expect } from "vitest";
import {
  RecordOutcomeBodySchema,
  PeriodResultsResponseSchema,
  WireListErrorCodeSchema,
} from "../../../../../shared/api/wireList.js";

describe("wire-list processor — schema validation", () => {
  describe("RecordOutcomeBodySchema", () => {
    it("accepts empty body (reason optional)", () => {
      expect(RecordOutcomeBodySchema.safeParse({}).success).toBe(true);
    });

    it("accepts a reason string", () => {
      const r = RecordOutcomeBodySchema.safeParse({ reason: "Player just got injured" });
      expect(r.success).toBe(true);
    });

    it("rejects empty-string reason (use undefined instead)", () => {
      const r = RecordOutcomeBodySchema.safeParse({ reason: "" });
      expect(r.success).toBe(false);
    });

    it("rejects reason over 280 chars", () => {
      const r = RecordOutcomeBodySchema.safeParse({ reason: "x".repeat(281) });
      expect(r.success).toBe(false);
    });
  });

  describe("PeriodResultsResponseSchema", () => {
    it("accepts a fully-populated response shape", () => {
      const fixture = {
        period: {
          id: 1,
          leagueId: 2,
          deadlineAt: "2026-05-10T00:00:00.000Z",
          lockedAt: null,
          processedAt: null,
          status: "PENDING",
          createdAt: "2026-05-06T00:00:00.000Z",
        },
        byTeam: [
          {
            teamId: 5,
            adds: [
              {
                id: 100,
                periodId: 1,
                teamId: 5,
                playerId: 999,
                priority: 1,
                outcome: "PENDING",
                consumedDropEntryId: null,
                reason: null,
                processedAt: null,
                createdAt: "2026-05-06T01:00:00.000Z",
              },
            ],
            drops: [
              {
                id: 200,
                periodId: 1,
                teamId: 5,
                playerId: 888,
                priority: 1,
                dropMode: "RELEASE",
                status: "PENDING",
                processedAt: null,
                createdAt: "2026-05-06T01:00:00.000Z",
              },
            ],
          },
        ],
      };
      expect(PeriodResultsResponseSchema.safeParse(fixture).success).toBe(true);
    });

    it("rejects byTeam with missing fields", () => {
      const r = PeriodResultsResponseSchema.safeParse({
        period: { id: 1, leagueId: 2, status: "PENDING" },
        byTeam: [],
      });
      expect(r.success).toBe(false);
    });
  });

  describe("WireListErrorCodeSchema — processor codes", () => {
    it("includes processor-specific codes", () => {
      const codes = [
        "PERIOD_NOT_LOCKED",
        "NO_DROP_AVAILABLE",
        "POSITION_INCOMPATIBLE",
        "FINALIZE_BLOCKED",
      ];
      for (const c of codes) {
        expect(WireListErrorCodeSchema.safeParse(c).success).toBe(true);
      }
    });
  });
});
