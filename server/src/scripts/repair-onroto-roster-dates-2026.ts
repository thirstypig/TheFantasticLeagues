// server/src/scripts/repair-onroto-roster-dates-2026.ts
//
// Commissioner repair: align 2026 OGBA roster records with OnRoto's transaction log
// and Kent's period-end workbook. DECIDED 2026-11-11: "follow OnRoto and the workbook".
// Evidence: docs/reports/ogba-2026-onroto-gap-analysis.md (DOC-040), which supersedes
// DOC-026's late-drop items. A full transaction diff (414 OnRoto vs 415 FBST moves)
// left exactly these six differences.
//
// DRY RUN BY DEFAULT — verifies the exact current state of every row and prints
// the plan. To write, you must name the items:
//
//   ./scripts/with-prod-db.sh npx tsx src/scripts/repair-onroto-roster-dates-2026.ts
//   ./scripts/with-prod-db.sh npx tsx src/scripts/repair-onroto-roster-dates-2026.ts --apply --items=hicks,garcia
//   ./scripts/with-prod-db.sh npx tsx src/scripts/repair-onroto-roster-dates-2026.ts --apply --items=all
//
// Every step asserts its expected starting state and the whole run is one
// transaction: any mismatch aborts everything. Re-running after an apply
// fails the assertions for the items already applied, by design.
//
// After --apply: the running server's standings cache expires within 2 minutes
// (STANDINGS_CACHE_TTL); bounce the Railway service for an immediate refresh.

import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaClient, type Prisma } from "@prisma/client";

const LEAGUE_ID = 20;
const SEASON = 2026;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const day = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "open");

type Step =
  | { kind: "move-release"; rosterId: number; txnId: number; from: string; to: string }
  | { kind: "move-acquire"; rosterId: number; txnId: number; from: string; to: string }
  | { kind: "add-release"; rosterId: number; to: string }
  | { kind: "add-stint"; playerId: number; to: string; assignedPosition: string };

interface Item {
  key: string;
  who: string;
  team: string;
  teamId: number;
  playerId: number;
  evidence: string;
  confidence: "strong" | "weaker" | "review";
  warning?: string;
  steps: Step[];
}

export const ITEMS: Item[] = [
  // REMOVED 2026-11-11: hicks, garcia, peralta, griffin, ramos, miller, lowe. They were
  // NOT late drops. OnRoto's own transaction log releases all seven on 08.30 — the same
  // date FBST has — and Kent's period-end workbook lists them on their teams at 8/30.
  // Each had been traded to an AL club (NYY, TB, CLE, BOS); OnRoto doesn't score AL
  // games in an NL-only league. That is now a scoring rule (mlbStatsSyncService league
  // filter), not a roster edit. Backdating their drops would have misstated the rosters.
  { key: "sheehan", who: "Emmet Sheehan", team: "Demolition Lumber Co.", teamId: 148, playerId: 1639, confidence: "strong",
    evidence: "FBST never recorded a drop (stint 07-05..open); OnRoto log: Release 08.02; workbook P6/P7 lists J. Webb, not Sheehan",
    warning: "removes him from Demolition's CURRENT roster — affects next season's keeper pool",
    steps: [{ kind: "add-release", rosterId: 4222, to: "2026-08-02" }] },
  { key: "webb", who: "Jacob Webb", team: "Demolition Lumber Co.", teamId: 148, playerId: 721, confidence: "strong",
    evidence: "no FBST roster row; OnRoto log: Add to Actives 08.02; workbook P6/P7 lists him on Demolition",
    warning: "adds him to Demolition's CURRENT roster — affects next season's keeper pool; slot set to P",
    steps: [{ kind: "add-stint", playerId: 721, to: "2026-08-02", assignedPosition: "P" }] },
  { key: "norby", who: "Connor Norby", team: "Devil Dawgs", teamId: 144, playerId: 998, confidence: "strong",
    evidence: "FBST add 08-31, OnRoto log 08.30",
    steps: [{ kind: "move-acquire", rosterId: 4287, txnId: 438, from: "2026-08-31", to: "2026-08-30" }] },
  { key: "pratt", who: "Cooper Pratt", team: "Devil Dawgs", teamId: 144, playerId: 3192, confidence: "strong",
    evidence: "FBST drop 08-31, OnRoto log 08.30 (the other half of the Norby move)",
    steps: [{ kind: "move-release", rosterId: 4232, txnId: 437, from: "2026-08-31", to: "2026-08-30" }] },
  { key: "greene", who: "Hunter Greene", team: "Skunk Dogs", teamId: 141, playerId: 96, confidence: "strong",
    evidence: "FBST drop 08-31, OnRoto log 08.30",
    steps: [{ kind: "move-release", rosterId: 4208, txnId: 439, from: "2026-08-31", to: "2026-08-30" }] },
  { key: "gusto", who: "Ryan Gusto", team: "Skunk Dogs", teamId: 141, playerId: 982, confidence: "strong",
    evidence: "FBST add 08-31, OnRoto log 08.30 (the other half of the Greene move)",
    steps: [{ kind: "move-acquire", rosterId: 4288, txnId: 440, from: "2026-08-31", to: "2026-08-30" }] },
  // Paul Sewald (Los Doyers): OnRoto shows no move after his 04-19 add, same as FBST. No change.
];

/** Verify every step's starting state; returns human-readable problems (empty = OK). */
async function verify(db: Prisma.TransactionClient | PrismaClient, item: Item): Promise<string[]> {
  const problems: string[] = [];
  for (const s of item.steps) {
    if (s.kind === "add-stint") {
      const existing = await db.roster.findFirst({ where: { playerId: s.playerId, team: { leagueId: LEAGUE_ID } } });
      if (existing) problems.push(`player ${s.playerId} already has a league-${LEAGUE_ID} roster row #${existing.id}`);
      const p = await db.player.findUnique({ where: { id: s.playerId }, select: { name: true, mlbId: true } });
      if (!p || p.name !== item.who) problems.push(`player #${s.playerId} is ${p?.name ?? "missing"}, expected ${item.who}`);
      continue;
    }
    const r = await db.roster.findUnique({ where: { id: s.rosterId } });
    if (!r) { problems.push(`roster #${s.rosterId} missing`); continue; }
    if (r.playerId !== item.playerId || r.teamId !== item.teamId) problems.push(`roster #${s.rosterId} is player ${r.playerId}/team ${r.teamId}`);
    if (s.kind === "move-release" && day(r.releasedAt) !== s.from) problems.push(`roster #${s.rosterId} releasedAt ${day(r.releasedAt)}, expected ${s.from}`);
    if (s.kind === "move-acquire" && day(r.acquiredAt) !== s.from) problems.push(`roster #${s.rosterId} acquiredAt ${day(r.acquiredAt)}, expected ${s.from}`);
    if (s.kind === "add-release" && r.releasedAt !== null) problems.push(`roster #${s.rosterId} already released ${day(r.releasedAt)}`);
    if (s.kind === "move-release" && r.acquiredAt > d(s.to)) problems.push(`new releasedAt ${s.to} precedes acquiredAt ${day(r.acquiredAt)}`);
    if (s.kind === "add-release" && r.acquiredAt > d(s.to)) problems.push(`new releasedAt ${s.to} precedes acquiredAt ${day(r.acquiredAt)}`);
    if (s.kind === "move-acquire") {
      const clash = await db.roster.findFirst({ where: {
        id: { not: s.rosterId }, playerId: item.playerId, team: { leagueId: LEAGUE_ID },
        acquiredAt: { lt: d(s.from) }, OR: [{ releasedAt: null }, { releasedAt: { gt: d(s.to) } }],
      } });
      if (clash) problems.push(`another league-${LEAGUE_ID} stint #${clash.id} (team ${clash.teamId}) overlaps the new start ${s.to}`);
    }
    if (s.kind === "move-release" || s.kind === "move-acquire") {
      const t = await db.transactionEvent.findUnique({ where: { id: s.txnId } });
      if (!t || t.playerId !== item.playerId || day(t.effDate) !== s.from)
        problems.push(`txn #${s.txnId} is ${t ? `player ${t.playerId} eff ${day(t.effDate)}` : "missing"}, expected player ${item.playerId} eff ${s.from}`);
    }
  }
  return problems;
}

async function apply(tx: Prisma.TransactionClient, item: Item): Promise<void> {
  for (const s of item.steps) {
    const note = `(commissioner correction 2026-11-11 — aligned to OnRoto, DOC-040)`;
    if (s.kind === "move-release") {
      await tx.roster.update({ where: { id: s.rosterId }, data: { releasedAt: d(s.to) } });
      await tx.transactionEvent.update({ where: { id: s.txnId }, data: { effDate: d(s.to), transactionRaw: `Dropped ${item.who} ${note}` } });
    } else if (s.kind === "move-acquire") {
      await tx.roster.update({ where: { id: s.rosterId }, data: { acquiredAt: d(s.to) } });
      await tx.transactionEvent.update({ where: { id: s.txnId }, data: { effDate: d(s.to), transactionRaw: `Claimed ${item.who} ${note}` } });
    } else if (s.kind === "add-release") {
      await tx.roster.update({ where: { id: s.rosterId }, data: { releasedAt: d(s.to), source: "DROP" } });
      await tx.transactionEvent.create({ data: {
        rowHash: `DROP-${crypto.randomUUID()}-${item.playerId}`, leagueId: LEAGUE_ID, season: SEASON,
        effDate: d(s.to), submittedAt: new Date(), teamId: item.teamId, playerId: item.playerId,
        transactionRaw: `Dropped ${item.who} ${note}`, transactionType: "DROP" } });
    } else {
      await tx.roster.create({ data: { teamId: item.teamId, playerId: s.playerId, source: "waiver_claim",
        acquiredAt: d(s.to), assignedPosition: s.assignedPosition } });
      await tx.transactionEvent.create({ data: {
        rowHash: `CLAIM-${crypto.randomUUID()}-${item.playerId}`, leagueId: LEAGUE_ID, season: SEASON,
        effDate: d(s.to), submittedAt: new Date(), teamId: item.teamId, playerId: item.playerId,
        transactionRaw: `Claimed ${item.who} ${note}`, transactionType: "ADD" } });
    }
  }
}

export async function preview(db: PrismaClient): Promise<boolean> {
  let ok = true;
  for (const item of ITEMS) {
    const problems = await verify(db, item);
    ok &&= problems.length === 0;
    const what = item.steps.map((s) =>
      s.kind === "move-release" ? `release ${s.from} → ${s.to}` :
      s.kind === "move-acquire" ? `acquire ${s.from} → ${s.to}` :
      s.kind === "add-release" ? `release open → ${s.to} (+DROP event)` : `new stint from ${s.to} (+ADD event)`).join("; ");
    console.log(`${problems.length ? "✗" : "✓"} ${item.key.padEnd(8)} [${item.confidence}] ${item.who} (${item.team}): ${what}`);
    console.log(`    evidence: ${item.evidence}`);
    if (item.warning) console.log(`    ⚠ ${item.warning}`);
    for (const p of problems) console.log(`    PROBLEM: ${p}`);
  }
  return ok;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const APPLY = process.argv.includes("--apply");
    const itemsArg = process.argv.find((a) => a.startsWith("--items="))?.slice("--items=".length);
    const ok = await preview(prisma);
    if (!APPLY) { console.log(`\nDRY RUN — nothing written. ${ok ? "All starting states verified." : "Fix the problems above first."}`); return; }
    if (!itemsArg) throw new Error("--apply requires --items=<keys,...> or --items=all");
    const chosen = itemsArg === "all" ? ITEMS : ITEMS.filter((i) => itemsArg.split(",").includes(i.key));
    const unknown = itemsArg === "all" ? [] : itemsArg.split(",").filter((k) => !ITEMS.some((i) => i.key === k));
    if (unknown.length) throw new Error(`unknown item(s): ${unknown.join(", ")}`);
    await prisma.$transaction(async (tx) => {
      for (const item of chosen) {
        const problems = await verify(tx, item);
        if (problems.length) throw new Error(`${item.key}: ${problems.join("; ")} — nothing written`);
        await apply(tx, item);
      }
    });
    console.log(`\nAPPLIED: ${chosen.map((i) => i.key).join(", ")}. Standings self-heal within 2 min, or bounce Railway.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
