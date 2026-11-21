/**
 * Load the player check (audit-archive-eligibility.ts output) into
 * HistoricalPlayerMatch. Dry run unless --apply.
 *
 *   From server/:
 *   npx tsx src/scripts/archive/load-archive-matches.ts <matchDir> --league <id> [--picks <file> --picks-user <userId>] [--apply]
 *
 * Safe to re-run: it writes only the columns the audit produces. A person's
 * decision (and the player it resolved to) is never overwritten — a name the
 * audit no longer lists is removed only if nobody decided it.
 *
 * --picks  JSON array of decisions made on the earlier review page
 *          ({ key, decision, mlbId, name, decidedAt }). Applied only to names
 *          that have no decision yet, recorded as made by --picks-user.
 *
 * Salaries-sheet names (last season's roster, priced) are not loaded: they are
 * the previous season's final roster and are checked there.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { archivePlayerKey } from "../../lib/archive/mlbNameMatcher.js";
import {
  decisionResolution, importedDecision, planSeasonLoad, toMatchRow,
  type ExistingMatchRow, type ImportedPick, type MatchRowData, type ReviewDetail, type ReviewRecord, type ReviewStatus,
} from "../../lib/archive/playerReview.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function main() {
  const dir = process.argv[2];
  const leagueId = Number(arg("--league"));
  const apply = process.argv.includes("--apply");
  const picksPath = arg("--picks");
  const picksUserId = arg("--picks-user") ? Number(arg("--picks-user")) : null;
  if (!dir || dir.startsWith("--") || !Number.isFinite(leagueId)) {
    console.error("usage: load-archive-matches.ts <matchDir> --league <id> [--picks <file> --picks-user <userId>] [--apply]");
    process.exit(2);
  }
  if (picksPath && !picksUserId) { console.error("--picks needs --picks-user <userId> (who made them)"); process.exit(2); }

  const records = JSON.parse(readFileSync(join(dir, "audit.json"), "utf8")) as ReviewRecord[];
  const picks = picksPath ? (JSON.parse(readFileSync(picksPath, "utf8")) as ImportedPick[]) : [];
  if (picksUserId) {
    const user = await prisma.user.findUnique({ where: { id: picksUserId }, select: { id: true, name: true, isAdmin: true } });
    if (!user) { console.error(`user ${picksUserId} not found`); process.exit(2); }
    console.log(`picks will be recorded as made by user ${user.id} (${user.name ?? "no name"}${user.isAdmin ? ", admin" : ""})`);
  }

  const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/[/?].*$/, "");
  console.log(`${apply ? "APPLY" : "DRY RUN"} → ${dbHost} · league ${leagueId} · ${records.length} names from ${join(dir, "audit.json")}\n`);

  const byYear = new Map<number, ReviewRecord[]>();
  for (const r of records) byYear.set(r.year, [...(byYear.get(r.year) ?? []), r]);
  const picksByKey = new Map(picks.map((p) => [p.key, p]));
  const usedPicks = new Set<string>();
  const problems: string[] = [];
  const totals: Record<ReviewStatus, number> = { VERIFIED: 0, SUGGESTED: 0, FLAGGED: 0, OPEN: 0 };

  for (const year of [...byYear.keys()].sort()) {
    const season = await prisma.historicalSeason.findUnique({ where: { year_leagueId: { year, leagueId } }, select: { id: true } });
    if (!season) { problems.push(`${year}: no archived season for league ${leagueId} — load the seasons first`); continue; }
    const next: MatchRowData[] = byYear.get(year)!.map(toMatchRow);
    for (const r of next) totals[r.status]++;

    // Every roster row that played must resolve to one of these names, and vice versa.
    const entries = await prisma.historicalRosterEntry.findMany({
      where: { seasonId: season.id, kind: { not: "SALARIES" } },
      select: { teamCode: true, playerName: true, slot: true },
    });
    const entryKeys = new Set(entries.map((e) => `${year}|${archivePlayerKey(e.teamCode, e.playerName, e.slot)}`));
    const nextKeys = new Set(next.map((r) => r.key));
    const unmatchedEntries = [...entryKeys].filter((k) => !nextKeys.has(k));
    const unusedNames = [...nextKeys].filter((k) => !entryKeys.has(k));
    if (unmatchedEntries.length) problems.push(`${year}: ${unmatchedEntries.length} roster names in the database are not in the audit (e.g. ${unmatchedEntries.slice(0, 3).join(", ")}) — the audit was built from different workbooks than the ones loaded`);
    if (unusedNames.length) problems.push(`${year}: ${unusedNames.length} audited names are on no roster row in the database (e.g. ${unusedNames.slice(0, 3).join(", ")})`);

    const stored = await prisma.historicalPlayerMatch.findMany({ where: { seasonId: season.id } });
    const existing: ExistingMatchRow[] = stored.map((s) => ({
      id: s.id, key: s.key, teamCode: s.teamCode, role: s.role, names: s.names, slots: s.slots, seenIn: s.seenIn,
      status: s.status, autoMlbId: s.autoMlbId, autoName: s.autoName, detail: s.detail as unknown as ReviewDetail,
      decision: s.decision, mlbId: s.mlbId, mlbName: s.mlbName,
    }));
    const plan = planSeasonLoad(next, existing);

    // Earlier picks for names nobody has decided here yet.
    const decided = new Set(existing.filter((e) => e.decision).map((e) => e.key));
    const toDecide: { key: string; data: Prisma.HistoricalPlayerMatchUpdateManyMutationInput }[] = [];
    for (const row of next) {
      const pick = picksByKey.get(row.key);
      if (!pick) continue;
      usedPicks.add(row.key);
      if (decided.has(row.key)) { console.log(`   pick skipped, already decided: ${row.key}`); continue; }
      const result = importedDecision(row, pick);
      if ("error" in result) { problems.push(`pick ${row.key}: ${result.error}`); continue; }
      const resolved = decisionResolution(row, result.input);
      toDecide.push({
        key: row.key,
        data: { decision: result.input.decision, decidedAt: pick.decidedAt ? new Date(pick.decidedAt) : new Date(), ...resolved },
      });
    }

    const by = (s: ReviewStatus) => next.filter((r) => r.status === s).length;
    console.log(
      `${year}: ${next.length} names (verified ${by("VERIFIED")}, suggested ${by("SUGGESTED")}, flagged ${by("FLAGGED")}, open ${by("OPEN")})`
      + ` → create ${plan.create.length}, update ${plan.update.length}, remove ${plan.remove.length}, unchanged ${plan.unchanged}`
      + (toDecide.length ? `, picks ${toDecide.length}` : ""),
    );
    for (const k of plan.orphanedDecisions) console.log(`   kept (decided, no longer in the audit): ${k}`);
    for (const d of plan.disagreements) console.log(`   decided differently from the matcher: ${d}`);
    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      if (plan.create.length) {
        await tx.historicalPlayerMatch.createMany({
          data: plan.create.map((r) => ({ ...r, seasonId: season.id, detail: json(r.detail) })),
        });
      }
      for (const u of plan.update) {
        await tx.historicalPlayerMatch.update({
          where: { id: u.id },
          data: { ...u.data, detail: json(u.data.detail), ...(u.resolved ?? {}) },
        });
      }
      if (plan.remove.length) await tx.historicalPlayerMatch.deleteMany({ where: { id: { in: plan.remove } } });
      for (const d of toDecide) {
        // decision: null in the filter — never overwrite a decision made since the plan was read.
        await tx.historicalPlayerMatch.updateMany({
          where: { seasonId: season.id, key: d.key, decision: null },
          data: { ...d.data, decidedById: picksUserId },
        });
      }
    }, { timeout: 120_000 });
  }

  for (const p of picks) if (!usedPicks.has(p.key)) problems.push(`pick ${p.key}: no such name in the audit (it may have been settled since)`);
  console.log(`\ntotal: verified ${totals.VERIFIED} · suggested ${totals.SUGGESTED} · flagged ${totals.FLAGGED} · open ${totals.OPEN}`);
  if (problems.length) { console.log(`\n${problems.length} thing(s) to look at:`); for (const p of problems) console.log(` - ${p}`); }
  if (!apply) console.log("\nDry run only. Re-run with --apply to write.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
