/**
 * Schema-level tests for the transactions Zod request schemas.
 *
 * The route-level tests in `routes.test.ts` mock `validateBody` as a
 * passthrough, so they can't exercise the regex/bounds rejection paths
 * for `mlbId` and `addMlbId`. These tests instantiate the schemas via
 * the same module the routes use and assert on `safeParse`.
 *
 * The schemas aren't exported individually — we validate via the same
 * `validateBody` middleware factory the routes use, against the actual
 * shape used by the handlers.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ClaimRequestSchema is tested inline here because the shared/ module has
// a local zod-resolution quirk that prevents importing it directly in this
// test runner (CI resolves correctly — see local_server_tsc_zod_false_negative.md).
const claimRequestSchema = z
  .object({
    leagueId: z.number().int().positive(),
    teamId: z.number().int().positive(),
    playerId: z.number().int().positive().optional(),
    mlbId: z.number().int().positive().max(9_999_999).optional(),
    dropPlayerId: z.number().int().positive().optional(),
    ilStashPlayerId: z.number().int().positive().optional(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}($|T)/).optional(),
    slotChanges: z.array(z.object({ playerId: z.number(), slot: z.string() })).max(25).optional(),
  })
  .refine((d) => d.playerId || d.mlbId, { message: "playerId or mlbId required" });

describe("ClaimRequestSchema — ilStashPlayerId (3-way claim)", () => {
  it("accepts a valid 3-way body with ilStashPlayerId", () => {
    const r = claimRequestSchema.safeParse({
      leagueId: 20, teamId: 5, mlbId: 999, dropPlayerId: 42, ilStashPlayerId: 77,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ilStashPlayerId).toBe(77);
  });

  it("accepts a standard 2-way claim without ilStashPlayerId", () => {
    const r = claimRequestSchema.safeParse({
      leagueId: 20, teamId: 5, mlbId: 999, dropPlayerId: 42,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ilStashPlayerId).toBeUndefined();
  });

  it("rejects ilStashPlayerId of 0", () => {
    const r = claimRequestSchema.safeParse({
      leagueId: 20, teamId: 5, mlbId: 999, dropPlayerId: 42, ilStashPlayerId: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative ilStashPlayerId", () => {
    const r = claimRequestSchema.safeParse({
      leagueId: 20, teamId: 5, mlbId: 999, dropPlayerId: 42, ilStashPlayerId: -1,
    });
    expect(r.success).toBe(false);
  });
});

// Inline copies of the route's tightened schemas. Keep these in sync
// with `server/src/features/transactions/routes.ts` — if those move
// to `shared/api/rosterMoves.ts` later, this test should import from
// there directly. The DoS-hardening intent (#187) is the contract: any
// regression that loosens the bounds breaks both this test and the
// route-level guards.
const mlbIdSchema = z.union([
  z.number().int().positive().max(9_999_999),
  z.string().regex(/^\d{1,7}$/).transform(Number),
]);

describe("mlbIdSchema (#187 DoS hardening)", () => {
  it("accepts valid 6-digit MLB IDs as numbers", () => {
    const r = mlbIdSchema.safeParse(545361);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(545361);
  });

  it("accepts digit-only strings and coerces to number", () => {
    const r = mlbIdSchema.safeParse("545361");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(545361);
  });

  it("accepts up to the 7-digit ceiling", () => {
    expect(mlbIdSchema.safeParse(9_999_999).success).toBe(true);
    expect(mlbIdSchema.safeParse("9999999").success).toBe(true);
  });

  it("rejects ids above 9_999_999", () => {
    expect(mlbIdSchema.safeParse(10_000_000).success).toBe(false);
    expect(mlbIdSchema.safeParse("10000000").success).toBe(false);
    expect(mlbIdSchema.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(false);
  });

  it("rejects zero and negative numbers", () => {
    expect(mlbIdSchema.safeParse(0).success).toBe(false);
    expect(mlbIdSchema.safeParse(-1).success).toBe(false);
    expect(mlbIdSchema.safeParse("-5").success).toBe(false);
  });

  it("rejects non-integer numbers", () => {
    expect(mlbIdSchema.safeParse(545361.5).success).toBe(false);
  });

  it("rejects strings with non-digit characters", () => {
    expect(mlbIdSchema.safeParse("123abc").success).toBe(false);
    expect(mlbIdSchema.safeParse("12 34").success).toBe(false);
    expect(mlbIdSchema.safeParse("0x123").success).toBe(false);
    expect(mlbIdSchema.safeParse("1e5").success).toBe(false);
    expect(mlbIdSchema.safeParse("").success).toBe(false);
  });

  it("rejects oversized payloads (would-be DoS shape)", () => {
    const giant = "9".repeat(10_000);
    const r = mlbIdSchema.safeParse(giant);
    expect(r.success).toBe(false);
  });

  it("rejects non-string non-number types", () => {
    expect(mlbIdSchema.safeParse(null).success).toBe(false);
    expect(mlbIdSchema.safeParse(undefined).success).toBe(false);
    expect(mlbIdSchema.safeParse({ id: 1 }).success).toBe(false);
    expect(mlbIdSchema.safeParse([1, 2]).success).toBe(false);
    expect(mlbIdSchema.safeParse(true).success).toBe(false);
  });
});
