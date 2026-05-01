/**
 * Contract tests for `shared/api/awards.ts` (todo #118).
 *
 * These tests pin the wire contract for the awards endpoint and the
 * persisted `AiInsight.data.awards` blob. Concretely:
 *
 *  1. A known-good fixture round-trips through `AwardsResponseSchema`
 *     unchanged — locks down the field set so re-shuffling output structure
 *     is a deliberate, test-failing change.
 *  2. The `source` discriminator works in both directions: persisted
 *     payloads MUST carry `digestGeneratedAt`; computed payloads MUST NOT
 *     (the schema rejects an extra unknown key on the computed branch).
 *  3. Adding an unknown field to a candidate fails parsing — confirms the
 *     `.strict()` mode is actually catching drift, which is the whole point
 *     of lifting these interfaces into a Zod schema.
 */
import { describe, it, expect } from "vitest";
import {
  AwardsRankingsSchema,
  AwardsResponseSchema,
  MvpCandidateSchema,
  CyYoungCandidateSchema,
  type AwardsRankings,
} from "../awards";

// ─── Fixtures ────────────────────────────────────────────────────

/**
 * Mirrors the persisted-awards fixture used in
 * `server/src/features/awards/__tests__/routes.test.ts` so the same shape is
 * exercised by both the route test and the schema test. If the shapes ever
 * diverge, both tests will fail and the source-of-truth schema makes the
 * mismatch obvious.
 */
const goodRankings: AwardsRankings = {
  leagueId: 1,
  weekKey: "2026-W13",
  computedAt: "2026-04-29T00:00:00.000Z",
  hitterPool: 5,
  starterPool: 3,
  mvp: [
    {
      rank: 1,
      playerId: 100,
      name: "Slugger",
      team: "Bombers",
      mvpScore: 11.2,
      stats: {
        AB: 200, H: 70, HR: 25, RBI: 60, R: 50, SB: 5,
        BB: 30, TB: 160, SO: 40,
        AVG: 0.35, OBP: 0.43, SLG: 0.80, OPS: 1.23,
      },
      zScores: {
        OPS: 2.0, HR: 2.0, OBP: 1.5, RBI: 1.0, R: 1.0,
        SB: 0, TB: 1.0, BB: 0.5, SO: -0.5,
      },
    },
  ],
  cyYoung: [
    {
      rank: 1,
      playerId: 200,
      name: "Ace",
      team: "Aces",
      role: "SP",
      cyScore: 9.4,
      stats: {
        W: 8, L: 2, K: 100, SV: 0, IP: 80,
        ERA: 2.50, WHIP: 1.05, K9: 11.25, BB9: 2.0, HR_A: 4,
      },
      zScores: {
        ERA: 1.5, WHIP: 1.2, K: 1.8, K9: 1.5, IP: 1.0,
        W: 1.0, L: -0.5, HR_A: 0.2, BB9: 0.5, SV: 0,
      },
    },
  ],
};

// ─── 1. Known-good round-trip ────────────────────────────────────

describe("AwardsResponseSchema — known-good fixtures round-trip", () => {
  it("accepts a persisted-source payload with digestGeneratedAt", () => {
    const payload = {
      ...goodRankings,
      source: "persisted" as const,
      digestGeneratedAt: "2026-04-29T01:00:00.000Z",
    };
    const parsed = AwardsResponseSchema.parse(payload);
    expect(parsed).toEqual(payload);
    expect(parsed.source).toBe("persisted");
  });

  it("accepts a computed-source payload without digestGeneratedAt", () => {
    const payload = {
      ...goodRankings,
      source: "computed" as const,
    };
    const parsed = AwardsResponseSchema.parse(payload);
    expect(parsed).toEqual(payload);
    expect(parsed.source).toBe("computed");
  });

  it("AwardsRankingsSchema accepts the bare rankings shape (no envelope)", () => {
    // The persisted blob in `AiInsight.data.awards` is the bare shape — no
    // `source` discriminator. Locking this case down means the dev-only
    // schema check in `digestRoutes.ts` won't flag a freshly computed
    // payload as malformed.
    const parsed = AwardsRankingsSchema.parse(goodRankings);
    expect(parsed).toEqual(goodRankings);
  });
});

// ─── 2. Discriminator enforcement ───────────────────────────────

describe("AwardsResponseSchema — discriminator enforcement", () => {
  it("rejects a persisted payload missing digestGeneratedAt", () => {
    const payload = {
      ...goodRankings,
      source: "persisted" as const,
      // intentionally omit digestGeneratedAt
    };
    const result = AwardsResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects a persisted payload with non-ISO-datetime digestGeneratedAt", () => {
    const payload = {
      ...goodRankings,
      source: "persisted" as const,
      digestGeneratedAt: "yesterday",
    };
    const result = AwardsResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects a computed payload that smuggles digestGeneratedAt", () => {
    // Strict mode on the computed branch means consumers can't sneak the
    // persisted-only field through. If we relax this, callers will start
    // depending on it being present on computed responses too.
    const payload = {
      ...goodRankings,
      source: "computed" as const,
      digestGeneratedAt: "2026-04-29T01:00:00.000Z",
    };
    const result = AwardsResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown source value", () => {
    const payload = {
      ...goodRankings,
      source: "stale" as unknown as "computed",
    };
    const result = AwardsResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

// ─── 3. Drift detection (strict mode catches new fields) ─────────

describe("Candidate schemas — drift detection", () => {
  it("MvpCandidateSchema rejects an extra unknown field", () => {
    // Pretend a future PR added a `wRC_plus` field on the server but forgot
    // to extend the shared schema. If strict mode were off, this would
    // silently slip through to consumers and recreate the PR #183 drift bug.
    const drifted = {
      ...goodRankings.mvp[0],
      wRC_plus: 165, // not in the schema
    };
    const result = MvpCandidateSchema.safeParse(drifted);
    expect(result.success).toBe(false);
  });

  it("CyYoungCandidateSchema rejects an extra unknown field", () => {
    const drifted = {
      ...goodRankings.cyYoung[0],
      FIP: 2.85, // not in the schema
    };
    const result = CyYoungCandidateSchema.safeParse(drifted);
    expect(result.success).toBe(false);
  });

  it("AwardsRankingsSchema rejects an extra unknown top-level field", () => {
    const drifted = {
      ...goodRankings,
      // e.g. someone added a `rookieOfYear: [...]` list without updating shared schema
      rookieOfYear: [],
    };
    const result = AwardsRankingsSchema.safeParse(drifted);
    expect(result.success).toBe(false);
  });

  it("MvpCandidateSchema rejects a missing required field", () => {
    const { mvpScore: _omit, ...withoutScore } = goodRankings.mvp[0];
    const result = MvpCandidateSchema.safeParse(withoutScore);
    expect(result.success).toBe(false);
  });
});
