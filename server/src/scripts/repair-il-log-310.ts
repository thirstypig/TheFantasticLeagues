// server/src/scripts/repair-il-log-310.ts
//
// One-off repair for todo #310 — reconcile RosterSlotEvent (the log IL fees are
// billed from) with TransactionEvent (the record of what actually happened).
//
// Cause: a commissioner backdating exercise wrote TransactionEvent only. Three
// of the four missing stashes carry the same wording and date — "IL stash
// (commissioner correction) — effective period 2 start", 2026-04-19. Fees bill
// from RosterSlotEvent, so those stints were invisible and never charged.
//
// DRY RUN BY DEFAULT. Pass --apply to write. Every step asserts the exact
// expected state first and aborts the whole transaction on any mismatch — a
// repair that silently half-applies is worse than one that refuses to start.
//
//   npx tsx src/scripts/repair-il-log-310.ts          # preview
//   npx tsx src/scripts/repair-il-log-310.ts --apply  # write
//
// Run through ./scripts/with-prod-db.sh to target production.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const LEAGUE_ID = 20;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/**
 * Match on the CALENDAR DAY, not an exact timestamp. RosterSlotEvent is
 * anchored at UTC midnight by convention, but TransactionEvent is not —
 * Henderson's stash is stored at 2026-06-07T07:00:00Z (midnight Pacific).
 * An exact-timestamp guard rejected a stash that genuinely exists.
 */
const sameDay = (iso: string) => ({
  gte: new Date(`${iso}T00:00:00.000Z`),
  lt: new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + 86_400_000),
});

interface AddStep {
  op: "add";
  who: string;
  teamName: string;
  playerId: number;
  event: "IL_STASH" | "IL_ACTIVATE" | "IL_RELEASE";
  effDate: string;
  why: string;
}
interface DelStep {
  op: "del";
  who: string;
  teamName: string;
  playerId: number;
  event: string;
  effDate: string;
  why: string;
}
type Step = AddStep | DelStep;

const PLAN: Step[] = [
  // 1. Missing stashes — the transaction log records each of these; the billing
  //    log does not, so the stint was never billable.
  { op: "add", who: "Daniel Palencia", teamName: "RGing Sluggers", playerId: 1339,
    event: "IL_STASH", effDate: "2026-04-19",
    why: "TransactionEvent has IL_STASH 04-19 + IL_ACTIVATE 05-17; billing log had only the close" },
  { op: "add", who: "Logan Henderson", teamName: "The Show", playerId: 1075,
    event: "IL_STASH", effDate: "2026-06-07",
    why: "TransactionEvent has IL_STASH 06-07 + IL_ACTIVATE 07-05; billing log had only the close" },
  { op: "add", who: "Quinn Priester", teamName: "The Show", playerId: 1090,
    event: "IL_STASH", effDate: "2026-04-19",
    why: "TransactionEvent has IL_STASH 04-19; billing log had nothing at all" },

  // 2. Priester was never activated — he was DROPPED on 06-07 while still on IL.
  //    Without a close the stint runs open forever and bills every future period.
  { op: "add", who: "Quinn Priester", teamName: "The Show", playerId: 1090,
    event: "IL_RELEASE", effDate: "2026-06-07",
    why: "Roster shows released 06-07 with slot=IL; closes the stint at the drop" },

  // 3. Vaughn: the billing log holds three events no transaction explains, and
  //    he was BILLED on them (P2 $10 + P3 $10). Removing them without adding the
  //    real stash would erase a legitimate charge; adding the real stash without
  //    removing them would double-bill Period 2. Both halves or neither.
  { op: "del", who: "Andrew Vaughn", teamName: "Demolition Lumber Co.", playerId: 963,
    event: "IL_STASH", effDate: "2026-04-23",
    why: "phantom — zero-length stint, no matching transaction" },
  { op: "del", who: "Andrew Vaughn", teamName: "Demolition Lumber Co.", playerId: 963,
    event: "IL_ACTIVATE", effDate: "2026-04-23",
    why: "phantom — zero-length stint, no matching transaction" },
  { op: "del", who: "Andrew Vaughn", teamName: "Demolition Lumber Co.", playerId: 963,
    event: "IL_STASH", effDate: "2026-05-03",
    why: 'phantom — "Bulk IL audit stash", no matching transaction; this is what he was billed on' },
  { op: "add", who: "Andrew Vaughn", teamName: "Demolition Lumber Co.", playerId: 963,
    event: "IL_STASH", effDate: "2026-04-19",
    why: "the real stash per TransactionEvent; pairs with the existing IL_ACTIVATE 05-17" },

  // 4. Betts: same phantom shape as Vaughn's, missed in the first pass. The pair
  //    forms a ZERO-LENGTH stint (04-23 → 04-23) that the chart showed being
  //    billed $10 — a fee for a stint that occupied a slot for no time at all.
  //    Removing both leaves his real 04-19 → 05-17 stint, which matches
  //    TransactionEvent exactly and bills Period 2 once.
  { op: "del", who: "Mookie Betts", teamName: "Los Doyers", playerId: 1,
    event: "IL_STASH", effDate: "2026-04-23",
    why: "phantom — opens a zero-length stint no transaction explains" },
  { op: "del", who: "Mookie Betts", teamName: "Los Doyers", playerId: 1,
    event: "IL_ACTIVATE", effDate: "2026-04-23",
    why: "phantom — closes that zero-length stint; commissioner confirmed it should not be charged" },
];

async function main() {
  const teams = await prisma.team.findMany({
    where: { leagueId: LEAGUE_ID },
    select: { id: true, name: true },
  });
  const teamByName = new Map(teams.map((t) => [t.name.trim(), t.id]));

  console.log(`=== todo #310 IL-log repair — ${APPLY ? "APPLY" : "DRY RUN"} ===\n`);

  // ── Validate every step before touching anything ──────────────────────────
  const resolved: Array<Step & { teamId: number; rowId?: number }> = [];
  let skipped = 0;
  for (const s of PLAN) {
    const teamId = teamByName.get(s.teamName.trim());
    if (teamId === undefined) throw new Error(`ABORT: team not found: "${s.teamName}"`);

    const existing = await prisma.rosterSlotEvent.findFirst({
      where: { teamId, playerId: s.playerId, event: s.event, effDate: sameDay(s.effDate) },
      select: { id: true },
    });

    // Idempotent: a step whose end state already holds is SKIPPED, not an
    // abort. Phase 1 of this repair is already applied in prod, and a script
    // that cannot be safely re-run is a script nobody dares run twice.
    // Genuinely unexpected states (unknown team, an added stash with no backing
    // transaction) still abort below.
    if (s.op === "add") {
      if (existing) {
        skipped++;
        console.log(`  SKIP ${s.who.padEnd(18)} ${s.event.padEnd(11)} ${s.effDate}  (already present, id=${existing.id})`);
        continue;
      }
      resolved.push({ ...s, teamId });
      console.log(`  ADD  ${s.who.padEnd(18)} ${s.event.padEnd(11)} ${s.effDate}  (${s.teamName})`);
    } else {
      if (!existing) {
        skipped++;
        console.log(`  SKIP ${s.who.padEnd(18)} ${s.event.padEnd(11)} ${s.effDate}  (already removed)`);
        continue;
      }
      resolved.push({ ...s, teamId, rowId: existing.id });
      console.log(`  DEL  ${s.who.padEnd(18)} ${s.event.padEnd(11)} ${s.effDate}  (${s.teamName}) id=${existing.id}`);
    }
    console.log(`       ↳ ${s.why}`);
  }

  // Guard: the transaction log must actually contain each stash we are adding.
  // We are mirroring recorded history, never inventing it.
  for (const s of resolved) {
    if (s.op !== "add" || s.event !== "IL_STASH") continue;
    const te = await prisma.transactionEvent.findFirst({
      where: { teamId: s.teamId, playerId: s.playerId, transactionType: "IL_STASH", effDate: sameDay(s.effDate) },
      select: { id: true },
    });
    if (!te) throw new Error(`ABORT: no TransactionEvent IL_STASH for ${s.who} on ${s.effDate} — refusing to invent a stint`);
  }
  console.log(`\n  ${resolved.length} step(s) to apply, ${skipped} already satisfied; every added stash is backed by a TransactionEvent.`);

  if (resolved.length === 0) {
    console.log("\n  Nothing to do — repair already fully applied.");
    await prisma.$disconnect();
    return;
  }

  if (!APPLY) {
    console.log("\n  DRY RUN — nothing written. Re-run with --apply.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const s of resolved) {
      if (s.op === "del") {
        await tx.rosterSlotEvent.delete({ where: { id: s.rowId! } });
      } else {
        await tx.rosterSlotEvent.create({
          data: {
            teamId: s.teamId,
            playerId: s.playerId,
            leagueId: LEAGUE_ID,
            event: s.event,
            effDate: d(s.effDate),
            createdBy: null,
            reason: `todo #310 repair — ${s.why}`,
          },
        });
      }
    }
  });

  console.log(`\n  APPLIED ${resolved.length} step(s).`);
  console.log("  Next: re-run the drift check and a reconcile DRY RUN before billing anything.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(String(e?.message ?? e));
  await prisma.$disconnect();
  process.exit(1);
});
