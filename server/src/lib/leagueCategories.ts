// server/src/lib/leagueCategories.ts
// Resolves which of the 10 scorable roto categories a league scores, from its
// `scoring.hitting_stats` / `scoring.pitching_stats` rules (Phase 3.5).
//
// Fallback contract (per half): missing, unparseable, or non-empty-but-nothing-
// scorable => that half's standard 5 + a warning. Only a stored `[]` means
// "score none of this half". Both halves `[]` => all 10.

import { prisma } from "../db/prisma.js";
import { logger } from "./logger.js";
import { getLeagueRules } from "./leagueRuleCache.js";
import { CATEGORY_CONFIG } from "./sports/baseball.js";

export type CategoryDef = {
  key: string;
  label: string;
  lowerIsBetter: boolean;
  group: "H" | "P";
};

// Keep in sync with SCORABLE_HITTING_CATS / SCORABLE_PITCHING_CATS in client/src/lib/sports/baseball.ts.
export const SCORABLE_CATEGORIES: readonly CategoryDef[] = CATEGORY_CONFIG.map((c) => ({
  key: c.key,
  label: c.label,
  lowerIsBetter: c.lowerIsBetter,
  group: c.group,
}));

export const SCORABLE_KEYS: ReadonlySet<string> = new Set(SCORABLE_CATEGORIES.map((c) => c.key));

export function normalizeCategoryKey(raw: string): string {
  const k = raw.trim().toUpperCase();
  return k === "S" ? "SV" : k;
}

type Half = "H" | "P";

/** Parse a stored JSON list of strings. null = missing/unparseable/not an array of strings. */
function parseList(json: string | null | undefined): string[] | null {
  if (json == null) return null;
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return null;
    return v as string[];
  } catch {
    return null;
  }
}

export function resolveCategories(
  hittingJson: string | null | undefined,
  pitchingJson: string | null | undefined,
): { categories: CategoryDef[]; dropped: string[]; fellBack: (Half | "ALL")[] } {
  const dropped: string[] = [];
  const fellBack: (Half | "ALL")[] = [];
  const selected = new Set<string>();
  const stored: Record<Half, string[] | null> = {
    H: parseList(hittingJson),
    P: parseList(pitchingJson),
  };

  for (const half of ["H", "P"] as const) {
    const list = stored[half];
    const standard = SCORABLE_CATEGORIES.filter((c) => c.group === half).map((c) => c.key);
    if (list === null) {
      fellBack.push(half);
      standard.forEach((k) => selected.add(k));
      continue;
    }
    const halfKeys = new Set(standard);
    const usable: string[] = [];
    for (const raw of list) {
      const key = normalizeCategoryKey(raw);
      if (halfKeys.has(key)) usable.push(key);
      else if (!dropped.includes(key)) dropped.push(key);
    }
    if (list.length > 0 && usable.length === 0) {
      fellBack.push(half);
      standard.forEach((k) => selected.add(k));
    } else {
      usable.forEach((k) => selected.add(k));
    }
  }

  if (selected.size === 0) {
    fellBack.length = 0;
    fellBack.push("ALL");
    SCORABLE_CATEGORIES.forEach((c) => selected.add(c.key));
  }

  return {
    categories: SCORABLE_CATEGORIES.filter((c) => selected.has(c.key)),
    dropped,
    fellBack,
  };
}

/** Leagues already warned about this process, so a misconfigured league logs once, not per request. */
const warnedLeagues = new Set<number>();

export async function getLeagueCategories(
  leagueId: number,
  client: Parameters<typeof getLeagueRules>[0] = prisma,
): Promise<CategoryDef[]> {
  const rules = await getLeagueRules(client, leagueId);
  const { categories, dropped, fellBack } = resolveCategories(
    rules.scoring?.hitting_stats,
    rules.scoring?.pitching_stats,
  );
  if ((dropped.length > 0 || fellBack.length > 0) && !warnedLeagues.has(leagueId)) {
    warnedLeagues.add(leagueId);
    logger.warn({ leagueId, dropped, fellBack }, "League scoring categories needed correction");
  }
  return categories;
}
