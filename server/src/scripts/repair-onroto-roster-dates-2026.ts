// server/src/scripts/repair-onroto-roster-dates-2026.ts
//
// OPTIONAL commissioner repair: align 2026 OGBA roster dates with OnRoto.
// Evidence and point impact: docs/reports/onroto-roster-diff-2026-11-09.md (DOC-026).
//
// This is a COMMISSIONER DECISION, not a bug fix. Under ADR-013 FBST's roster
// records are the scoring authority; OnRoto is only evidence of what the
// owners did. Each item is opt-in. Adopting all of them changes only 7th/8th
// (Devil Dawgs 255 passes Los Doyers 250); places 1–6 do not move.
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
  // ── Drops FBST recorded at the P7 rollover (08-30); OnRoto released at P6's start.
  //    Each player's FBST-minus-OnRoto delta equals his MLB P6 line exactly.
  { key: "hicks", who: "Liam Hicks", team: "The Show", teamId: 146, playerId: 985, confidence: "strong",
    evidence: "held since 04-19; delta R8 HR3 RBI12 = his P6 line",
    steps: [{ kind: "move-release", rosterId: 4135, txnId: 420, from: "2026-08-30", to: "2026-08-02" }] },
  { key: "garcia", who: "Luis García Jr.", team: "The Show", teamId: 146, playerId: 1658, confidence: "strong",
    evidence: "held since 05-17; delta R12 HR5 RBI12 SB1 = his P6 line",
    steps: [{ kind: "move-release", rosterId: 4166, txnId: 432, from: "2026-08-30", to: "2026-08-02" }] },
  { key: "peralta", who: "Freddy Peralta", team: "The Show", teamId: 146, playerId: 1088, confidence: "strong",
    evidence: "held all season; delta W1 K20 = his P6 line",
    steps: [{ kind: "move-release", rosterId: 3796, txnId: 408, from: "2026-08-30", to: "2026-08-02" }] },
  { key: "griffin", who: "Foster Griffin", team: "Los Doyers", teamId: 147, playerId: 2461, confidence: "strong",
    evidence: "held since 04-19; delta W3 K23 = his P6 line",
    steps: [{ kind: "move-release", rosterId: 4107, txnId: 441, from: "2026-08-30", to: "2026-08-02" }] },
  { key: "ramos", who: "Heliot Ramos", team: "RGing Sluggers", teamId: 145, playerId: 7, confidence: "strong",
    evidence: "held all season; delta R1 RBI1 SB1 = his P6 line",
    steps: [{ kind: "move-release", rosterId: 3819, txnId: 428, from: "2026-08-30", to: "2026-08-02" }] },
  // ── Added in FBST on 08-02; OnRoto credited them (almost) nothing. Backdating
  //    the drop to the add date makes the stint zero-length. Confirm with the owners.
  { key: "miller", who: "Erik Miller", team: "Devil Dawgs", teamId: 144, playerId: 561, confidence: "weaker",
    evidence: "ADDED 08-02 in FBST; OnRoto credits 0 for Devil Dawgs; delta W1 K18 = his P6 line",
    warning: "zero-length stint (acquired = released 08-02) — did the owner reverse this add?",
    steps: [{ kind: "move-release", rosterId: 4246, txnId: 412, from: "2026-08-30", to: "2026-08-02" }] },
  { key: "lowe", who: "Nathaniel Lowe", team: "Demolition Lumber Co.", teamId: 148, playerId: 1294, confidence: "weaker",
    evidence: "ADDED 08-02 in FBST; OnRoto keeps only his 08-02 game (R2 RBI2); MLB-traded CIN→CLE 08-04",
    warning: "any date 08-03..08-05 gives the same stats (no games 08-03/04)",
    steps: [{ kind: "move-release", rosterId: 4261, txnId: 406, from: "2026-08-30", to: "2026-08-03" }] },
  // ── Missing transactions.
  { key: "sheehan", who: "Emmet Sheehan", team: "Demolition Lumber Co.", teamId: 148, playerId: 1639, confidence: "review",
    evidence: "FBST never recorded a drop (stint 07-05..open); OnRoto released him 08-02; delta W1 K28 = every game from 08-02",
    warning: "removes him from Demolition's CURRENT roster — affects next season's keeper pool",
    steps: [{ kind: "add-release", rosterId: 4222, to: "2026-08-02" }] },
  { key: "webb", who: "Jacob Webb", team: "Demolition Lumber Co.", teamId: 148, playerId: 721, confidence: "review",
    evidence: "no FBST roster row; OnRoto has him active, and his credit (W2 SV4 K17) = his Cubs log from 08-04",
    warning: "adds him to Demolition's CURRENT roster — affects next season's keeper pool; slot set to P",
    steps: [{ kind: "add-stint", playerId: 721, to: "2026-08-04", assignedPosition: "P" }] },
  { key: "norby", who: "Connor Norby", team: "Devil Dawgs", teamId: 144, playerId: 998, confidence: "strong",
    evidence: "FBST add 08-31, OnRoto 08-30; his only RBI in the window came 08-30",
    steps: [{ kind: "move-acquire", rosterId: 4287, txnId: 438, from: "2026-08-31", to: "2026-08-30" }] },
  // Paul Sewald (Los Doyers, K+9) is deliberately NOT here: OnRoto credits nothing
  // after 08-04 while listing him active, and no FBST record explains it. Unproven.
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
    const note = `(commissioner correction 2026-11-09 — aligned to OnRoto, DOC-026)`;
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
