/**
 * Match every player name in the parsed archive seasons to an MLB person.
 * READ-ONLY: reads parse-archive-workbooks.ts output and MLB statsapi; writes
 * matches.json + REVIEW.md into <outDir>. No database.
 *
 *   From server/: npx tsx src/scripts/archive/match-archive-players.ts <parsedDir> <outDir> [year...]
 *
 * Candidate pool for season Y: every player on an MLB full-season roster in Y
 * and Y-1 (the Salaries sheet is last season's roster), flagged NL if he was
 * on an NL roster in that span. Rosters are cached in <outDir>/rosters/.
 *
 * Within one season and team, mentions with the same abbreviation + surname
 * resolve together. A bare initial ("W. Contreras") that is ambiguous on its
 * own inherits the match of a fuller spelling on the same team that season
 * ("Wiln. Contreras") only when exactly one such fuller spelling exists.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchPlayer, type MatchResult, type MlbCandidate } from "../../lib/archive/mlbNameMatcher.js";
import { splitWorkbookName } from "../../lib/archive/mlbNameMatcher.js";
import type { SeasonData } from "../../lib/archive/seasonBuilder.js";

const API = "https://statsapi.mlb.com/api/v1";
const here = dirname(fileURLToPath(import.meta.url));

interface Override { spellings: string[]; years: [number, number]; mlbId: number; name: string; why: string; confirmed: boolean }
const OVERRIDES = (JSON.parse(readFileSync(join(here, "player-overrides.json"), "utf8")) as { entries: Override[] }).entries;
const overrideFor = (year: number, spellings: string[]) =>
  OVERRIDES.find((o) => year >= o.years[0] && year <= o.years[1] && o.spellings.some((sp) => spellings.includes(sp)));
const NL = 104;

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

async function seasonRoster(year: number, cacheDir: string): Promise<MlbCandidate[]> {
  const file = join(cacheDir, `${year}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const teams = (await getJson(`${API}/teams?sportId=1&season=${year}`)).teams as any[];
  const out: MlbCandidate[] = [];
  for (const t of teams) {
    const r = await getJson(`${API}/teams/${t.id}/roster?rosterType=fullSeason&season=${year}&hydrate=person`);
    for (const e of r.roster ?? []) {
      out.push({
        mlbId: e.person.id,
        fullName: e.person.fullName,
        firstName: e.person.firstName ?? e.person.fullName.split(" ")[0],
        middleName: e.person.middleName ?? undefined,
        lastName: e.person.lastName ?? e.person.fullName.split(" ").slice(1).join(" "),
        // The position on THAT season's roster. person.primaryPosition is today's
        // (Willson Contreras: 1B now, the Cubs' catcher in 2016–2022).
        position: e.position?.abbreviation ?? e.person.primaryPosition?.abbreviation ?? "",
        nl: t.league?.id === NL,
      });
    }
  }
  writeFileSync(file, JSON.stringify(out));
  return out;
}

/** One person per id; NL if any of his rosters in the span was NL. */
function mergePool(...lists: MlbCandidate[][]): MlbCandidate[] {
  const byId = new Map<number, MlbCandidate>();
  for (const c of lists.flat()) {
    const prev = byId.get(c.mlbId);
    byId.set(c.mlbId, prev ? { ...prev, nl: prev.nl || c.nl } : c);
  }
  return [...byId.values()];
}

interface Mention { year: number; team: string; name: string; slot: string }

function mentions(season: SeasonData): Mention[] {
  const out: Mention[] = [];
  const add = (r: Record<string, { slot: string; name: string }[]> | null) => {
    for (const [team, list] of Object.entries(r ?? {})) for (const e of list) out.push({ year: season.year, team, name: e.name, slot: e.slot });
  };
  add(season.salaries); add(season.draft); add(season.finalRosters);
  for (const p of season.periodRosters) add(p.rosters);
  return out;
}

async function main() {
  const [dir, outDir, ...years] = process.argv.slice(2);
  if (!dir || !outDir) { console.error("usage: match-archive-players.ts <parsedDir> <outDir> [year...]"); process.exit(2); }
  const cacheDir = join(outDir, "rosters");
  mkdirSync(cacheDir, { recursive: true });

  const matches: Record<string, { mlbId: number; fullName: string; how: string; beat?: string }> = {};
  const pendingAmbiguous: { year: number; k: string; spellings: string; slots: string; candidates: MlbCandidate[] }[] = [];
  const tiebreaks: string[] = [];
  const review: string[] = [];
  const summary: string[] = ["| Year | Names | Matched | Ambiguous | Unmatched |", "|---|---|---|---|---|"];

  for (const f of readdirSync(dir).filter((x) => /^\d{4}\.json$/.test(x)).sort()) {
    const year = Number(f.slice(0, 4));
    if (years.length && !years.includes(String(year))) continue;
    const season = JSON.parse(readFileSync(join(dir, f), "utf8")) as SeasonData;
    const pool = mergePool(await seasonRoster(year, cacheDir), await seasonRoster(year - 1, cacheDir));

    // Group mentions by (team, abbreviation, surname).
    const keyOf = (m: Mention) => { const { abbr, surname } = splitWorkbookName(m.name); return `${m.team}|${abbr}|${surname.replace(/[^a-z]/g, "")}`; };
    const groups = new Map<string, Mention[]>();
    for (const m of mentions(season)) groups.set(keyOf(m), [...(groups.get(keyOf(m)) ?? []), m]);

    const results = new Map<string, MatchResult>();
    const suggestions = new Map<string, Override>();
    for (const [k, ms] of groups) {
      const ov = overrideFor(year, [...new Set(ms.map((m) => m.name))]);
      if (ov?.confirmed) {
        results.set(k, { status: "matched", how: `override: ${ov.why}`, candidate: { mlbId: ov.mlbId, fullName: ov.name, firstName: "", lastName: "", position: "", nl: true } });
        continue;
      }
      if (ov) suggestions.set(k, ov);
      // Try each distinct spelling/slot; a pitcher slot narrows best, so try those first.
      const tries = [...new Map(ms.map((m) => [`${m.name}|${m.slot}`, m])).values()]
        .sort((a, b) => Number(/^(P|SP|RP)$/.test(b.slot)) - Number(/^(P|SP|RP)$/.test(a.slot)));
      let best: MatchResult = { status: "unmatched" };
      for (const t of tries) {
        const r = matchPlayer(t.name, t.slot, pool);
        if (r.status === "matched") { best = r; break; }
        if (r.status === "ambiguous" && best.status === "unmatched") best = r;
      }
      results.set(k, best);
    }
    // A bare/short abbreviation inherits from the single fuller spelling on the
    // same team — that beats a tie-break (2024 LDY: "W. Contreras" on draft day
    // is the "Wiln. Contreras" of later periods, not William by catcher slot).
    for (const [k, r] of [...results]) {
      if (r.status === "matched" && !r.how.includes("tiebreak")) continue;
      const [team, abbr, sur] = k.split("|");
      const fuller = [...results.entries()].filter(([k2, r2]) => {
        const [t2, a2, s2] = k2.split("|");
        return k2 !== k && t2 === team && s2 === sur && a2.length > abbr.length && a2.startsWith(abbr) && r2.status === "matched";
      });
      const ids = new Set(fuller.map(([, r2]) => (r2 as Extract<MatchResult, { status: "matched" }>).candidate.mlbId));
      if (ids.size === 1) {
        const src = fuller[0][1] as Extract<MatchResult, { status: "matched" }>;
        results.set(k, { status: "matched", candidate: src.candidate, how: `same team, fuller spelling "${fuller[0][0].split("|")[1]}."` });
      }
    }

    let ok = 0, amb = 0, none = 0;
    for (const [k, best] of results) {
      const ms = groups.get(k)!;
      const spellings = [...new Set(ms.map((m) => m.name))].join(" / ");
      const slots = [...new Set(ms.map((m) => m.slot))].join(",");
      if (best.status === "matched") {
        ok++;
        const beat = best.beat?.map((b) => `${b.candidate.fullName} (${b.candidate.position}${b.candidate.nl ? "" : ", AL"}) by ${b.by}`).join("; ");
        matches[`${year}|${k}`] = { mlbId: best.candidate.mlbId, fullName: best.candidate.fullName, how: best.how, ...(beat ? { beat } : {}) };
        if (beat) tiebreaks.push(`| ${year} | ${k.split("|")[0]} | ${spellings} | ${slots} | ${best.candidate.fullName} (${best.candidate.position}) | ${beat} |`);
      } else if (best.status === "ambiguous") {
        amb++;
        pendingAmbiguous.push({ year, k, spellings, slots, candidates: best.candidates });
      } else {
        none++;
        const sug = suggestions.get(k);
        review.push(`| ${year} | ${k.split("|")[0]} | ${spellings} | ${slots} | no MLB match${sug ? ` — suggested: **${sug.name}** (${sug.mlbId}), ${sug.why}` : ""} |`);
      }
    }
    summary.push(`| ${year} | ${groups.size} | ${ok} | ${amb} | ${none} |`);
    console.log(summary[summary.length - 1]);
  }
  // Cross-season pass: keepers and the Salaries sheet carry players between
  // years, so an ambiguous name inherits a CLEAN match (exact, no tie-break)
  // of the same team + surname in the previous or next season — if that clean
  // match is one of its candidates and the two neighbours don't disagree.
  let carried = 0;
  for (const p of pendingAmbiguous) {
    const [team, , sur] = p.k.split("|");
    const ids = new Set<number>();
    for (const y of [p.year - 1, p.year + 1]) {
      for (const [mk, mv] of Object.entries(matches)) {
        const [my, mt, , ms] = mk.split("|");
        if (Number(my) === y && mt === team && ms === sur && !mv.how.includes("tiebreak") && p.candidates.some((c) => c.mlbId === mv.mlbId)) ids.add(mv.mlbId);
      }
    }
    if (ids.size === 1) {
      const id = [...ids][0];
      const cand = p.candidates.find((c) => c.mlbId === id)!;
      matches[`${p.year}|${p.k}`] = { mlbId: id, fullName: cand.fullName, how: "same team, adjacent season" };
      carried++;
    } else {
      review.push(`| ${p.year} | ${team} | ${p.spellings} | ${p.slots} | ambiguous: ${p.candidates.map((c) => `${c.fullName} (${c.position}${c.nl ? "" : ", AL"}, ${c.mlbId})`).join("; ")} |`);
    }
  }
  console.log(`ambiguous resolved by the same team's adjacent season: ${carried}; still ambiguous: ${pendingAmbiguous.length - carried}`);
  writeFileSync(join(outDir, "matches.json"), JSON.stringify(matches, null, 1));
  writeFileSync(join(outDir, "REVIEW.md"), [
    ...summary, "",
    "## Not matched", "", "| Year | Team | Workbook name(s) | Slots | Problem |", "|---|---|---|---|---|", ...review, "",
    "## Matched by a tie-break (check these)", "", "| Year | Team | Workbook name(s) | Slots | Chosen | Ruled out |", "|---|---|---|---|---|---|", ...tiebreaks,
  ].join("\n") + "\n");
  console.log(`tie-break matches with a real alternative: ${tiebreaks.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
