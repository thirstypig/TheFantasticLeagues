/**
 * Check every matched archive player against OGBA's position-eligibility rules
 * for the slots he was rostered in, and rank the candidates of every
 * unresolved name by eligibility, then playing time. READ-ONLY (statsapi +
 * files, no database).
 *
 *   From server/: npx tsx src/scripts/archive/audit-archive-eligibility.ts <parsedDir> <matchDir>
 *
 * Reads <matchDir>/matches.json + candidates.json (from match-archive-players.ts);
 * writes <matchDir>/audit.json (one ReviewRecord per name per team per season —
 * the input of load-archive-matches.ts) and AUDIT.md. MLB facts are cached in
 * <matchDir>/facts/.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  emptyCareer, emptyLine, factsUrl, parseCareer, parseFielding, parseSeasonLine, toSeasonFacts,
  type Career, type SeasonLine, type StatsPerson,
} from "../../lib/archive/mlbFacts.js";
import { archivePlayerKey } from "../../lib/archive/mlbNameMatcher.js";
import {
  buildCandidate, checkSlots, rankCandidates, suggest, unresolvedStatus, type ReviewRecord, type Role,
} from "../../lib/archive/playerReview.js";
import type { SeasonData } from "../../lib/archive/seasonBuilder.js";

async function getJson(url: string): Promise<{ people?: StatsPerson[] }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return (await res.json()) as { people?: StatsPerson[] };
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Fetch-through file cache: one JSON file of id → parsed value. */
async function cached<T>(
  file: string, ids: number[], batchSize: number, url: (batch: number[]) => string,
  parse: (p: StatsPerson) => T, empty: () => T,
): Promise<Map<number, T>> {
  const cache: Record<string, T> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const missing = ids.filter((id) => !(id in cache));
  for (const batch of chunk(missing, batchSize)) {
    const r = await getJson(url(batch));
    for (const id of batch) cache[id] = empty();
    for (const p of r.people ?? []) cache[p.id] = parse(p);
  }
  if (missing.length) writeFileSync(file, JSON.stringify(cache));
  return new Map(ids.map((id) => [id, cache[id] ?? empty()]));
}

const ORDER = (label: string) => (label === "draft" ? 0 : label === "final" ? 99 : Number(label.slice(1)));

async function main() {
  const [parsedDir, matchDir] = process.argv.slice(2);
  if (!parsedDir || !matchDir) { console.error("usage: audit-archive-eligibility.ts <parsedDir> <matchDir>"); process.exit(2); }
  const cacheDir = join(matchDir, "facts");
  mkdirSync(cacheDir, { recursive: true });
  const matches = JSON.parse(readFileSync(join(matchDir, "matches.json"), "utf8")) as Record<string, { mlbId: number; fullName: string; how: string; beat?: string }>;
  const candidates = JSON.parse(readFileSync(join(matchDir, "candidates.json"), "utf8")) as Record<string, { mlbId: number; fullName: string; note?: string }[]>;

  const audit: ReviewRecord[] = [];

  for (const f of readdirSync(parsedDir).filter((x) => /^\d{4}\.json$/.test(x)).sort()) {
    const year = Number(f.slice(0, 4));
    const season = JSON.parse(readFileSync(join(parsedDir, f), "utf8")) as SeasonData;

    // Every (team, name key) → the slots it was rostered in, and where.
    const seen = new Map<string, { names: Set<string>; slots: Set<string>; seenIn: Set<string> }>();
    const add = (label: string, r: Record<string, { slot: string; name: string }[]> | null) => {
      for (const [team, list] of Object.entries(r ?? {})) for (const e of list) {
        const k = archivePlayerKey(team, e.name, e.slot);
        const v = seen.get(k) ?? { names: new Set(), slots: new Set(), seenIn: new Set() };
        v.names.add(e.name); v.slots.add(e.slot); v.seenIn.add(label);
        seen.set(k, v);
      }
    };
    add("draft", season.draft);
    for (const p of season.periodRosters) add(`P${p.period}`, p.rosters);
    add("final", season.finalRosters);
    // Salary sheets are LAST season's rosters: eligibility there belongs to year-1, skip.

    const ids = new Set<number>();
    for (const k of seen.keys()) {
      const m = matches[`${year}|${k}`];
      if (m) ids.add(m.mlbId);
      for (const c of candidates[`${year}|${k}`] ?? []) ids.add(c.mlbId);
    }
    const idList = [...ids].filter((id) => id < 1_000_000);
    const [now, prior, career, lines] = await Promise.all([
      cached<Record<string, number>>(join(cacheDir, `fielding-${year}.json`), idList, 100, (b) => factsUrl.fielding(b, year), parseFielding, () => ({})),
      cached<Record<string, number>>(join(cacheDir, `fielding-${year - 1}.json`), idList, 100, (b) => factsUrl.fielding(b, year - 1), parseFielding, () => ({})),
      // v3: v1 double-counted traded seasons; v2 stored innings jsonb can't round-trip.
      cached<Career>(join(cacheDir, "career-v3.json"), idList, 50, (b) => factsUrl.career(b), parseCareer, emptyCareer),
      cached<SeasonLine>(join(cacheDir, `lines-v2-${year}.json`), idList, 100, (b) => factsUrl.line(b, year), parseSeasonLine, emptyLine),
    ]);
    // Last season's slot for each (team, name key), from the Salaries sheet.
    const keptSlot = new Map<string, string>();
    for (const [team, list] of Object.entries(season.salaries ?? {})) for (const e of list) {
      keptSlot.set(archivePlayerKey(team, e.name, e.slot), e.slot);
    }
    const factsFor = (id: number, k: string) => toSeasonFacts(
      { games: now.get(id) ?? {}, priorGames: prior.get(id) ?? {}, career: career.get(id) ?? emptyCareer() }, year, keptSlot.get(k),
    );
    const lineFor = (id: number): SeasonLine | null => lines.get(id) ?? null;

    for (const [k, v] of seen) {
      const [team, , , role] = k.split("|");
      const slots = [...v.slots];
      const base = {
        key: `${year}|${k}`, year, team, role: role as Role,
        names: [...v.names], slots, seenIn: [...v.seenIn].sort((a, b) => ORDER(a) - ORDER(b)),
        keptFromSlot: keptSlot.get(k) ?? null,
      };
      const m = matches[`${year}|${k}`];
      if (m) {
        const checks = checkSlots(slots, factsFor(m.mlbId, k));
        audit.push({
          ...base, status: checks.every((c) => c.eligible) ? "VERIFIED" : "FLAGGED",
          match: { mlbId: m.mlbId, name: m.fullName, how: m.how, ...(m.beat ? { beat: m.beat } : {}), checks, line: lineFor(m.mlbId) },
          candidates: [], suggestion: null,
        });
      } else {
        const ranked = rankCandidates((candidates[`${year}|${k}`] ?? []).map((c) =>
          buildCandidate({ mlbId: c.mlbId, name: c.fullName, note: c.note }, slots, role, factsFor(c.mlbId, k), lineFor(c.mlbId))));
        audit.push({
          ...base, status: unresolvedStatus(ranked, slots.length), match: null,
          candidates: ranked, suggestion: suggest(ranked, slots.length, role),
        });
      }
    }
    console.log(`${year}: done`);
  }

  writeFileSync(join(matchDir, "audit.json"), JSON.stringify(audit, null, 1));
  const count = (s: string) => audit.filter((a) => a.status === s).length;
  const report = [
    `verified ${count("VERIFIED")} · flagged (matched but not eligible) ${count("FLAGGED")} · suggested (one candidate eligible) ${count("SUGGESTED")} · open ${count("OPEN")}`, "",
    "| Year | Team | Name | Slots | Status | Detail |", "|---|---|---|---|---|---|",
    ...audit.filter((a) => a.status !== "VERIFIED").map((a) => {
      const detail = a.match
        ? `${a.match.name}: ${a.match.checks.filter((c) => !c.eligible).map((c) => `${c.slot} — ${c.reason}`).join("; ")}`
        : a.candidates.map((c) => `${c.name} ${c.eligibleSlots}/${a.slots.length}`).join("; ") || "no candidates";
      return `| ${a.year} | ${a.team} | ${a.names.join(" / ")} | ${a.slots.join(",")} | ${a.status} | ${detail} |`;
    }),
  ];
  writeFileSync(join(matchDir, "AUDIT.md"), report.join("\n") + "\n");
  console.log(report[0]);
}

main().catch((e) => { console.error(e); process.exit(1); });
