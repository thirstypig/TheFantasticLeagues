import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../../../db/prisma.js";
import { isLocalThrowawayDbUrl } from "../../../../test-support/dbSafety.js";
import { reconcileIlFeesForPeriod } from "../ilFeeService.js";

/**
 * Real-Postgres regression for the IL-fee advisory lock.
 *
 * The unit suite (ilFeeService.test.ts) mocks `$queryRaw` to return `[]`, so it
 * can NEVER exercise the `pg_advisory_xact_lock(...)` SQL — which is exactly why
 * two bugs on that one line silently killed every IL_FEE_RECONCILE outbox event
 * for ~30 days (see docs/reports/pipeline-staleness-audit-2026-07-02.md):
 *   1. `pg_advisory_xact_lock(integer, bigint)` — no such overload (42883).
 *   2. the blocking lock returns `void` → `$queryRaw` P2010 deserialize failure.
 * This test runs the real reconcile against Postgres so both regress loudly.
 *
 * Gated with the same fail-closed guard as draftIntegration.test.ts: runs only
 * against an explicit local throwaway DB with ALLOW_DESTRUCTIVE_DB_TESTS=1 (and
 * in the CI db-integration job). It is scoped — it creates + tears down only its
 * own rows and never wipes tables.
 */
const DB_OK =
  isLocalThrowawayDbUrl(process.env.DATABASE_URL) &&
  process.env.ALLOW_DESTRUCTIVE_DB_TESTS === "1";

describe.skipIf(!DB_OK)("ilFeeService — advisory-lock real-Postgres regression", () => {
  let franchiseId: number;
  let leagueId: number;
  let teamId: number;
  let playerId: number;
  let periodId: number;

  beforeAll(async () => {
    const tag = `ilfee-it-${process.pid}`;
    const fr = await prisma.franchise.create({ data: { name: tag } });
    franchiseId = fr.id;
    const lg = await prisma.league.create({
      data: { name: tag, season: 2026, sport: "MLB", draftMode: "DRAFT", franchiseId: fr.id },
    });
    leagueId = lg.id;
    const tm = await prisma.team.create({ data: { leagueId: lg.id, name: "IL Fee Test Team", code: "ILT" } });
    teamId = tm.id;
    const pl = await prisma.player.create({ data: { name: "IL Fee Test Player", posPrimary: "OF", posList: "OF" } });
    playerId = pl.id;
    const pd = await prisma.period.create({
      data: {
        name: "IL Fee Test Period",
        startDate: new Date("2026-01-01T12:00:00Z"),
        endDate: new Date("2026-01-31T12:00:00Z"),
        status: "completed",
        leagueId: lg.id,
      },
    });
    periodId = pd.id;
    // One open IL stint mid-period → billable (rank 1, default $10).
    await prisma.rosterSlotEvent.create({
      data: { teamId, playerId, leagueId, event: "IL_STASH", effDate: new Date("2026-01-05T12:00:00Z") },
    });
  });

  afterAll(async () => {
    if (!DB_OK) return;
    await prisma.financeLedger.deleteMany({ where: { teamId } });
    await prisma.rosterSlotEvent.deleteMany({ where: { leagueId } });
    await prisma.period.deleteMany({ where: { leagueId } });
    await prisma.team.deleteMany({ where: { leagueId } });
    await prisma.player.deleteMany({ where: { id: playerId } });
    await prisma.league.deleteMany({ where: { id: leagueId } });
    await prisma.franchise.deleteMany({ where: { id: franchiseId } });
  });

  it("acquires the advisory lock and previews the fee (no 42883, no void-deserialize P2010)", async () => {
    const r = await reconcileIlFeesForPeriod(leagueId, periodId, { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.added).toBe(1);
    expect(r.preview).toHaveLength(1);
    expect(r.preview![0]).toMatchObject({ action: "add", teamId, playerId, rank: 1, amount: 10 });
  });

  it("writes nothing to the ledger on dryRun", async () => {
    await reconcileIlFeesForPeriod(leagueId, periodId, { dryRun: true });
    const rows = await prisma.financeLedger.count({ where: { periodId, type: "il_fee" } });
    expect(rows).toBe(0);
  });

  it("enforces the IDOR guard (period must belong to the league)", async () => {
    await expect(
      reconcileIlFeesForPeriod(leagueId + 9_000_000, periodId, { dryRun: true }),
    ).rejects.toThrow(/does not belong/);
  });
});
