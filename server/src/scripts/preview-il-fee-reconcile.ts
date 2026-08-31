// server/src/scripts/preview-il-fee-reconcile.ts
//
// READ-ONLY. Dry-runs the IL fee reconcile across every CLOSED period of a
// league and prints what would change. There is no --apply flag and no write
// path in this file at all — that is the point. Applying is a separate,
// deliberate act (the commissioner endpoint, or the outbox drainer).
//
// Why this exists: after the todo #310 log repair added stints that were
// previously invisible to billing, "is the ledger current?" stopped being
// answerable by eye. `reconcileIlFeesForPeriod(..., { dryRun: true })` already
// computes exactly that diff per period; this just runs it over all of them and
// totals the money.
//
// A clean run prints "0 to add, 0 to void" for every period — that is the
// evidence that the ledger matches the repaired log.
//
//   npx tsx src/scripts/preview-il-fee-reconcile.ts
//   npx tsx src/scripts/preview-il-fee-reconcile.ts --league 20
//
// Run through ./scripts/with-prod-db.sh to preview production.

import { PrismaClient } from "@prisma/client";
import { reconcileIlFeesForPeriod } from "../features/transactions/services/ilFeeService.js";

const prisma = new PrismaClient();

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const LEAGUE_ID = Number(argValue("--league") ?? 20);

async function main() {
  if (!Number.isInteger(LEAGUE_ID) || LEAGUE_ID <= 0) {
    throw new Error(`Invalid --league: ${LEAGUE_ID}`);
  }

  const periods = await prisma.period.findMany({
    where: { leagueId: LEAGUE_ID, status: "completed" },
    select: { id: true, name: true, startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  });

  console.log(`=== IL fee reconcile PREVIEW (read-only) — league ${LEAGUE_ID} ===`);
  console.log(`${periods.length} closed period(s)\n`);

  let totalAdd = 0;
  let totalVoid = 0;
  let moneyDelta = 0;

  for (const p of periods) {
    const res = await reconcileIlFeesForPeriod(LEAGUE_ID, p.id, { dryRun: true });
    const adds = (res.preview ?? []).filter((r) => r.action === "add");
    const voids = (res.preview ?? []).filter((r) => r.action === "void");
    const delta = (res.preview ?? []).reduce((s, r) => s + r.amount, 0);

    totalAdd += adds.length;
    totalVoid += voids.length;
    moneyDelta += delta;

    const flag = adds.length || voids.length ? "CHANGES" : "clean   ";
    console.log(
      `  ${flag} ${p.name.padEnd(12)} (period ${String(p.id).padStart(3)})  ` +
        `+${adds.length} add / ${voids.length} void / ${res.unchanged} unchanged` +
        (delta !== 0 ? `   Δ $${delta}` : ""),
    );
    for (const r of adds) {
      console.log(`             ADD  ${(r.playerName ?? `#${r.playerId}`).padEnd(22)} team ${r.teamId}  rank ${r.rank}  $${r.amount}`);
    }
    for (const r of voids) {
      console.log(`             VOID ${(r.playerName ?? `#${r.playerId}`).padEnd(22)} team ${r.teamId}  $${r.amount}`);
    }
  }

  console.log(`\n  TOTAL: ${totalAdd} to add, ${totalVoid} to void, net Δ $${moneyDelta}`);
  if (totalAdd === 0 && totalVoid === 0) {
    console.log("  Ledger matches the current IL log — nothing owed, nothing over-billed.");
  } else {
    console.log("  Ledger is STALE vs the IL log. Apply via the commissioner reconcile endpoint.");
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
