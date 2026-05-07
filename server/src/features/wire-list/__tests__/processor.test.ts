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

    // Race-recovery codes added by the wire-list atomicity fix
    // (todos #156, #157, #158). Clients switch on these to know
    // "the state changed under you — refresh and retry" vs a real
    // validation failure.
    it("includes the race-recovery codes (todos #156, #157)", () => {
      expect(WireListErrorCodeSchema.safeParse("DROP_RACE_LOST").success).toBe(true);
      expect(WireListErrorCodeSchema.safeParse("FINALIZE_RACE_LOST").success).toBe(true);
    });

    it("PERIOD_NOT_LOCKED is reused for the finalize CAS conflict (todo #156)", () => {
      // The finalize handler returns PERIOD_NOT_LOCKED whether the
      // period was never locked OR a sibling finalize already
      // flipped it to PROCESSED — the code stays the same so
      // existing client handling still works.
      expect(WireListErrorCodeSchema.safeParse("PERIOD_NOT_LOCKED").success).toBe(true);
    });

    it("PERIOD_NOT_PENDING is reused for the cron-vs-mutation race (todo #158)", () => {
      // Owner POST/PATCH/DELETE handlers use status-CAS via
      // updateMany/deleteMany. When the auto-lock cron flips the
      // period mid-request, count===0 and we return 403
      // PERIOD_NOT_PENDING — same code as the pre-existing
      // pre-check, so client handling is unchanged.
      expect(WireListErrorCodeSchema.safeParse("PERIOD_NOT_PENDING").success).toBe(true);
    });
  });
});
