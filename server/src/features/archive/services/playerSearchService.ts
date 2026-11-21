/**
 * "None of these" on the player check: find the right MLB player by name and
 * show him the way the stored candidates are shown — his line that season and
 * whether he was eligible for the slots the name held.
 *
 * Searches the players who appeared in MLB that season first (the people an
 * owner could have rostered), then MLB's all-time name search for anyone who
 * didn't play that year (hurt all season, not yet called up).
 */
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { fetchPlayerFacts, STATS_API, toSeasonFacts, type GetJson } from "../../../lib/archive/mlbFacts.js";
import { normalize } from "../../../lib/archive/mlbNameMatcher.js";
import { buildCandidate, rankCandidates, type ReviewCandidate } from "../../../lib/archive/playerReview.js";

const DAY_SECONDS = 86_400;
const FIELDS = "fields=people,id,fullName,firstName,lastName,useName";
/** Players we look up facts for; more matches than this means the search is too broad. */
export const MAX_LOOKUPS = 40;
export const MAX_RESULTS = 8;
export const MIN_QUERY_LENGTH = 3;

export interface SearchPerson {
  id: number;
  fullName: string;
  firstName?: string;
  lastName?: string;
  useName?: string;
}

interface PeopleResponse { people?: SearchPerson[] }

/** Past seasons don't change, so a day is a conservative cache. */
const cachedJson = <T>(url: string) => mlbGetJson<T>(url, DAY_SECONDS);

const letters = (s: string) => normalize(s).replace(/[^a-z ]/g, "");

/** Every word typed must start a word of the player's name: "jar wright" finds Jaret Wright. */
export function nameMatches(query: string, p: SearchPerson): boolean {
  const words = letters([p.fullName, p.firstName, p.useName, p.lastName].filter(Boolean).join(" ")).split(" ");
  const typed = letters(query).split(" ").filter(Boolean);
  return typed.length > 0 && typed.every((t) => words.some((w) => w.startsWith(t)));
}

export interface SearchContext {
  year: number;
  slots: string[];
  role: string;
  keptFromSlot: string | null;
}

export interface SearchResult {
  candidates: ReviewCandidate[];
  /** More players matched than are shown. */
  more: boolean;
}

export async function searchCandidates(
  query: string, ctx: SearchContext,
  getPeople: (url: string) => Promise<PeopleResponse> = cachedJson,
  getFacts: GetJson = cachedJson,
): Promise<SearchResult> {
  const season = await getPeople(`${STATS_API}/sports/1/players?season=${ctx.year}&${FIELDS}`);
  const found = new Map<number, SearchPerson>();
  for (const p of season.people ?? []) if (nameMatches(query, p)) found.set(p.id, p);

  if (found.size < MAX_LOOKUPS) {
    // Anyone by that name who had no game that season. Best effort: the season list already answered.
    try {
      const byName = await getPeople(`${STATS_API}/people/search?names=${encodeURIComponent(query)}&sportId=1&${FIELDS}`);
      for (const p of byName.people ?? []) if (!found.has(p.id) && nameMatches(query, p)) found.set(p.id, p);
    } catch { /* keep the season matches */ }
  }

  const people = [...found.values()];
  const lookedUp = people.slice(0, MAX_LOOKUPS);
  const facts = await fetchPlayerFacts(lookedUp.map((p) => p.id), ctx.year, getFacts);
  const ranked = rankCandidates(lookedUp.map((p) => {
    const f = facts.get(p.id)!;
    return buildCandidate(
      { mlbId: p.id, name: p.fullName }, ctx.slots, ctx.role,
      toSeasonFacts(f, ctx.year, ctx.keptFromSlot ?? undefined), f.line,
    );
  }));
  // Whoever appeared in MLB that season comes first. Without this, a namesake
  // who never played that year outranks a regular: with no career at-bats he
  // counts as a rookie, and a rookie is eligible at his primary position.
  const ordered = [...ranked.filter((c) => c.playingTime > 0), ...ranked.filter((c) => c.playingTime <= 0)];
  return { candidates: ordered.slice(0, MAX_RESULTS), more: people.length > MAX_RESULTS };
}

/**
 * The player's name as MLB lists it, or null when MLB has no such id (a 404).
 * Any other failure throws: "MLB is unreachable" must not read as "no such player".
 */
export async function lookupPlayerName(
  mlbId: number, getPeople: (url: string) => Promise<PeopleResponse> = cachedJson,
): Promise<string | null> {
  try {
    const r = await getPeople(`${STATS_API}/people/${mlbId}?${FIELDS}`);
    return r.people?.[0]?.fullName ?? null;
  } catch (err) {
    if (err instanceof Error && /\b404\b/.test(err.message)) return null;
    throw err;
  }
}
