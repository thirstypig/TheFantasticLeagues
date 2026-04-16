/**
 * Matches article text against a player name with word-boundary regex and
 * a disambiguation list for common last names.
 *
 * History: the pre-Session-65 matcher used `text.toLowerCase().includes(lastName)`
 * which caused "Will Smith" to match articles about Dominic Smith, Derek Smith, etc.
 * This module replaces that with two protections:
 *   1. Word-boundary regex (`\bname\b`) — so "Smith" doesn't match "Smithson"
 *   2. Ambiguous-last-name allowlist — for very common last names (Smith, Garcia,
 *      Martinez, Rodriguez, etc.), require full-name match. Accepts some false
 *      negatives (articles that only say "Smith HR last night") to eliminate
 *      the dominant false-positive problem.
 */

// Common last names where last-name-only matching produces false positives.
// Derived from US census top-100 surnames intersected with known active MLB
// players. For these, only full-name matches are accepted.
const AMBIGUOUS_LAST_NAMES = new Set<string>([
  "smith", "garcia", "martinez", "rodriguez", "perez", "hernandez",
  "lopez", "gonzalez", "jones", "williams", "brown", "davis", "miller",
  "wilson", "moore", "taylor", "anderson", "thomas", "jackson", "white",
  "harris", "martin", "thompson", "robinson", "clark", "lewis",
  "walker", "hall", "allen", "young", "king", "scott", "green",
  "baker", "adams", "nelson", "carter", "mitchell", "roberts", "turner",
  "phillips", "campbell", "parker", "evans", "edwards", "collins",
  "diaz", "cruz", "ramirez", "reyes", "sanchez", "morales", "torres",
  "flores", "rivera", "gomez", "ortiz", "gutierrez", "chavez",
]);

/** Escape regex metacharacters in a string so it can be used safely in `new RegExp()`. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a case-insensitive word-boundary regex for the given literal phrase.
 * Uses lookbehind/lookahead instead of `\b` so phrases ending in punctuation
 * (e.g., "Ronald Acuna Jr.") still match correctly — `\b` requires a `\w↔\W`
 * transition, which fails when both sides of the boundary are non-word chars.
 */
function wordBoundaryRegex(phrase: string): RegExp {
  return new RegExp(`(?<=^|\\W)${escapeRegex(phrase)}(?=\\W|$)`, "i");
}

export interface PlayerNameMatcher {
  /** True when `text` references this player per the match rules. */
  matches(text: string): boolean;
  /** The full name used to build this matcher (lowercase). */
  readonly fullName: string;
  /** The last name used. Empty string when the input had no whitespace. */
  readonly lastName: string;
  /** Whether last-name-only matching is enabled. False for ambiguous names. */
  readonly canMatchByLast: boolean;
}

/**
 * Build a matcher for a single player name.
 *
 * @param playerName Display name like "Will Smith" or "Shohei Ohtani". Leading/trailing
 *                   whitespace is trimmed. Multiple whitespace runs are collapsed.
 *                   Short inputs (<2 chars after trim) produce a matcher that never matches.
 */
export function createPlayerNameMatcher(playerName: string): PlayerNameMatcher {
  const normalized = playerName.trim().toLowerCase().replace(/\s+/g, " ");

  if (normalized.length < 2) {
    return {
      matches: () => false,
      fullName: normalized,
      lastName: "",
      canMatchByLast: false,
    };
  }

  const parts = normalized.split(" ");
  const lastName = parts.length > 1 ? parts[parts.length - 1]! : "";

  const fullNameRegex = wordBoundaryRegex(normalized);

  // Last-name fallback is enabled only when the last name is:
  //   (a) at least 5 chars (filters out "Lee", "Kim", "Cruz" etc. which collide heavily)
  //   (b) not in the ambiguous allowlist
  //   (c) distinct from the full name (single-word inputs skip this)
  const canMatchByLast =
    lastName.length >= 5 &&
    !AMBIGUOUS_LAST_NAMES.has(lastName) &&
    lastName !== normalized;

  const lastNameRegex = canMatchByLast ? wordBoundaryRegex(lastName) : null;

  return {
    matches(text: string): boolean {
      if (!text) return false;
      if (fullNameRegex.test(text)) return true;
      if (lastNameRegex && lastNameRegex.test(text)) return true;
      return false;
    },
    fullName: normalized,
    lastName,
    canMatchByLast,
  };
}
