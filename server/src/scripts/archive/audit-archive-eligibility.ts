/**
 * Check every matched archive player against OGBA's position-eligibility rules
 * for the slots he was rostered in, and rank the candidates of every
 * unresolved name by eligibility. READ-ONLY (statsapi + files, no database).
 *
 *   From server/: npx tsx src/scripts/archive/audit-archive-eligibility.ts <parsedDir> <matchDir>
 *
 * Reads <matchDir>/matches.json + candidates.json (from match-archive-players.ts);
 * writes <matchDir>/audit.json and AUDIT.md. Facts are cached in <matchDir>/facts/.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { slotEligibility, type PlayerSeasonFacts } from "../../lib/archive/archiveEligibility.js";
import { archivePlayerKey, splitWorkbookName } from "../../lib/archive/mlbNameMatcher.js";
import type { SeasonData } from "../../lib/archive/seasonBuilder.js";

const API = "https://statsapi.mlb.com/api/v1";

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
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

/** Games by fielding position per player for one season. */
async function fieldingFor(ids: number[], season: number, cacheDir: string): Promise<Map<number, Record<string, number>>> {
  const file = join(cacheDir, `fielding-${season}.json`);
  const cache: Record<string, Record<string, number>> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const missing = ids.filter((id) => !(id in cache));
  for (const batch of chunk(missing, 100)) {
    const r = await getJson(`${API}/people?personIds=${batch.join(",")}&hydrate=stats(group=[fielding],type=[season],season=${season})`);
    for (const id of batch) cache[id] = {};
    for (const p of r.people ?? []) {
      // A traded player gets one split per team AND a combined split (no team).
      // Use the combined one when present; summing all three double-counts
      // (Kevin Pillar 2019 read as 266 G in CF).
      const total: Record<string, number> = {};
      const byTeam: Record<string, number> = {};
      for (const grp of p.stats ?? []) for (const sp of grp.splits ?? []) {
        const pos = sp.position?.abbreviation;
        const n = Number(sp.stat?.games ?? sp.stat?.gamesPlayed ?? 0);
        if (!pos || n <= 0) continue;
        const bucket = sp.team ? byTeam : total;
        bucket[pos] = (bucket[pos] ?? 0) + n;
      }
      const g: Record<string, number> = {};
      for (const pos of new Set([...Object.keys(total), ...Object.keys(byTeam)])) g[pos] = total[pos] ?? byTeam[pos];
      cache[p.id] = g;
    }
  }
  writeFileSync(file, JSON.stringify(cache));
  return new Map(ids.map((id) => [id, cache[id] ?? {}]));
}

interface Career { primary: string; abBy: Record<string, number>; ipBy: Record<string, number> }

/** Primary position and at-bats / innings by season, for the rookie test. */
async function careerFor(ids: number[], cacheDir: string): Promise<Map<number, Career>> {
  const file = join(cacheDir, "career.json");
  const cache: Record<string, Career> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const missing = ids.filter((id) => !(id in cache));
  for (const batch of chunk(missing, 50)) {
    const r = await getJson(`${API}/people?personIds=${batch.join(",")}&hydrate=stats(group=[hitting,pitching],type=[yearByYear])`);
    for (const p of r.people ?? []) {
      const c: Career = { primary: p.primaryPosition?.abbreviation ?? "", abBy: {}, ipBy: {} };
      for (const grp of p.stats ?? []) for (const sp of grp.splits ?? []) {
        if (sp.sport && sp.sport.id !== 1) continue; // MLB only
        const y = sp.season;
        if (grp.group?.displayName === "hitting") c.abBy[y] = (c.abBy[y] ?? 0) + Number(sp.stat?.atBats ?? 0);
        if (grp.group?.displayName === "pitching") {
          const [w, f] = String(sp.stat?.inningsPitched ?? "0").split(".");
          c.ipBy[y] = (c.ipBy[y] ?? 0) + Number(w) + Number(f ?? 0) / 3;
        }
      }
      cache[p.id] = c;
    }
  }
  writeFileSync(file, JSON.stringify(cache));
  return new Map(ids.map((id) => [id, cache[id] ?? { primary: "", abBy: {}, ipBy: {} }]));
}

const sumBefore = (by: Record<string, number>, year: number) =>
  Object.entries(by).filter(([y]) => Number(y) < year).reduce((s, [, v]) => s + v, 0);

async function main() {
  const [parsedDir, matchDir] = process.argv.slice(2);
  if (!parsedDir || !matchDir) { console.error("usage: audit-archive-eligibility.ts <parsedDir> <matchDir>"); process.exit(2); }
  const cacheDir = join(matchDir, "facts");
  mkdirSync(cacheDir, { recursive: true });
  const matches = JSON.parse(readFileSync(join(matchDir, "matches.json"), "utf8")) as Record<string, { mlbId: number; fullName: string; how: string }>;
  const candidates = JSON.parse(readFileSync(join(matchDir, "candidates.json"), "utf8")) as Record<string, { mlbId: number; fullName: string }[]>;

  const audit: Record<string, unknown>[] = [];
  const tally = { verified: 0, flagged: 0, resolvedByEligibility: 0, stillOpen: 0 };

  for (const f of readdirSync(parsedDir).filter((x) => /^\d{4}\.json$/.test(x)).sort()) {
    const year = Number(f.slice(0, 4));
    const season = JSON.parse(readFileSync(join(parsedDir, f), "utf8")) as SeasonData;

    // Every (team, name key) → the slots it was rostered in, and where.
    const seen = new Map<string, { names: Set<string>; slots: Set<string>; where: Set<string> }>();
    const add = (label: string, r: Record<string, { slot: string; name: string }[]> | null) => {
      for (const [team, list] of Object.entries(r ?? {})) for (const e of list) {
        const k = archivePlayerKey(team, e.name, e.slot);
        const v = seen.get(k) ?? { names: new Set(), slots: new Set(), where: new Set() };
        v.names.add(e.name); v.slots.add(e.slot); v.where.add(label);
        seen.set(k, v);
      }
    };
    add("draft", season.draft); add("final", season.finalRosters);
    for (const p of season.periodRosters) if (p.period > 1) add(`P${p.period}`, p.rosters);
    // Salary sheets are LAST season's rosters: eligibility there belongs to year-1, skip.

    const ids = new Set<number>();
    for (const k of seen.keys()) {
      const m = matches[`${year}|${k}`];
      if (m) ids.add(m.mlbId);
      for (const c of candidates[`${year}|${k}`] ?? []) ids.add(c.mlbId);
    }
    const idList = [...ids].filter((id) => id < 1_000_000);
    const [now, prior, career] = await Promise.all([
      fieldingFor(idList, year, cacheDir), fieldingFor(idList, year - 1, cacheDir), careerFor(idList, cacheDir),
    ]);
    // Last season's slot for each (team, name key), from the Salaries sheet.
    const keptSlot = new Map<string, string>();
    for (const [team, list] of Object.entries(season.salaries ?? {})) for (const e of list) {
      keptSlot.set(archivePlayerKey(team, e.name, e.slot), e.slot);
    }
    const facts = (id: number, k: string): PlayerSeasonFacts => {
      const c = career.get(id)!;
      return {
        games: now.get(id) ?? {}, priorGames: prior.get(id) ?? {}, primaryPosition: c?.primary ?? "",
        careerAbBefore: sumBefore(c?.abBy ?? {}, year), careerIpBefore: sumBefore(c?.ipBy ?? {}, year),
        keptFromSlot: keptSlot.get(k),
      };
    };
    const check = (id: number, slots: Set<string>, k: string) => [...slots].map((s) => ({ slot: s, ...slotEligibility(s, facts(id, k)) }));

    for (const [k, v] of seen) {
      const [team] = k.split("|");
      const m = matches[`${year}|${k}`];
      const base = { year, team, names: [...v.names], slots: [...v.slots], where: [...v.where] };
      if (m) {
        const checks = check(m.mlbId, v.slots, k);
        const ok = checks.every((c) => c.eligible);
        ok ? tally.verified++ : tally.flagged++;
        audit.push({ ...base, status: ok ? "verified" : "flagged", match: { ...m, checks } });
      } else {
        const ranked = (candidates[`${year}|${k}`] ?? []).map((c) => {
          const checks = check(c.mlbId, v.slots, k);
          return { ...c, checks, eligibleSlots: checks.filter((x) => x.eligible).length };
        }).sort((a, b) => b.eligibleSlots - a.eligibleSlots);
        const full = ranked.filter((c) => c.eligibleSlots === v.slots.size);
        const status = full.length === 1 ? "resolved-by-eligibility" : "open";
        status === "open" ? tally.stillOpen++ : tally.resolvedByEligibility++;
        audit.push({ ...base, status, candidates: ranked });
      }
    }
    console.log(`${year}: done`);
  }
  writeFileSync(join(matchDir, "audit.json"), JSON.stringify(audit, null, 1));
  const lines = [
    `verified ${tally.verified} · flagged (matched but not eligible) ${tally.flagged} · resolved by eligibility ${tally.resolvedByEligibility} · still open ${tally.stillOpen}`, "",
    "| Year | Team | Name | Slots | Status | Detail |", "|---|---|---|---|---|---|",
    ...audit.filter((a) => a.status !== "verified").map((a: any) => {
      const detail = a.match
        ? `${a.match.fullName}: ${a.match.checks.filter((c: any) => !c.eligible).map((c: any) => `${c.slot} — ${c.reason}`).join("; ")}`
        : a.candidates.map((c: any) => `${c.fullName} ${c.eligibleSlots}/${a.slots.length}`).join("; ") || "no candidates";
      return `| ${a.year} | ${a.team} | ${a.names.join(" / ")} | ${a.slots.join(",")} | ${a.status} | ${detail} |`;
    }),
  ];
  writeFileSync(join(matchDir, "AUDIT.md"), lines.join("\n") + "\n");
  console.log(lines[0]);
}

main().catch((e) => { console.error(e); process.exit(1); });
