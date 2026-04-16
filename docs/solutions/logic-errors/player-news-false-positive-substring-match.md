---
title: "Player news false positives for common last names (Smith, Garcia, etc.)"
date: 2026-04-16
module: mlb-feed
tags:
  - rss
  - news
  - player-matching
  - regex
  - false-positive
  - disambiguation
severity: P1
symptoms:
  - "Player Detail Modal news tab shows articles about unrelated players sharing a common last name"
  - "Will Smith (LAD) profile returns articles about Dominic Smith, Derek Smith, and any 'Smith' mention"
  - "Trade Rumors category matching similarly polluted with false positives"
root_cause: "matchesPlayer() used substring includes() for last names ≥5 chars — no word-boundary check and no disambiguation for common surnames"
resolution: "Extracted playerNameMatcher module with word-boundary regex (lookbehind/lookahead), 50-name ambiguous-surname allowlist requiring full-name match, and last-name fallback only for distinctive names"
---

# Player News False Positives — Substring Match on Common Last Names

## Problem

Opening a Player Detail Modal for **Will Smith (LAD catcher)** and navigating to the **News** tab showed articles about Dominic Smith, Derek Smith, and any article containing "Smith" in the title or Trade Rumors categories. The same issue affected all players with common last names (Garcia, Martinez, Rodriguez, Perez, etc.).

The `/player-news` endpoint at `server/src/features/mlb-feed/routes.ts:200-210` used this matching logic:

```typescript
const matchesPlayer = (text: string): boolean => {
  const lower = text.toLowerCase();
  if (lower.includes(fullName)) return true;
  if (canMatchByLast && lower.includes(lastName)) return true;
  return false;
};
```

`canMatchByLast` was `true` when `lastName.length >= 5`. "Smith" is 5 characters — so `lower.includes("smith")` matched "Smithson", "Blacksmith", "Dominic Smith", and every other article with "smith" anywhere as a substring.

## Investigation

1. Confirmed the bug by tracing the `/player-news` handler — substring match, no word boundaries.
2. Evaluated `\b` word-boundary regex — failed on names ending in punctuation. `\b` requires a `\w↔\W` transition, but "Jr." followed by a space has `.` (non-word) adjacent to ` ` (non-word), so `\b` never fires.
3. Built lookbehind/lookahead alternative: `(?<=^|\W)name(?=\W|$)` — handles all punctuation correctly.
4. Identified that common surnames need full-name-only matching. Derived a 50-name allowlist from US census top-100 surnames intersected with active MLB player last names.

## Solution

New module: `server/src/features/mlb-feed/services/playerNameMatcher.ts`

### Key design decisions

**1. Lookbehind/lookahead regex instead of `\b`:**

```typescript
function wordBoundaryRegex(phrase: string): RegExp {
  return new RegExp(`(?<=^|\\W)${escapeRegex(phrase)}(?=\\W|$)`, "i");
}
```

Why: `\b` is defined as a transition between `\w` and `\W` character classes. At a `.` followed by a space (both `\W`), `\b` doesn't fire — breaking matches for "Ronald Acuna Jr." and similar suffixed names. The lookbehind/lookahead approach explicitly asserts "start-of-string or any non-word character" on each side.

**2. 50-name ambiguous allowlist:**

```typescript
const AMBIGUOUS_LAST_NAMES = new Set([
  "smith", "garcia", "martinez", "rodriguez", "perez", "hernandez",
  "lopez", "gonzalez", "jones", "williams", "brown", "davis", "miller",
  "wilson", "moore", "taylor", "anderson", "thomas", "jackson", "white",
  // ... 50 total
]);
```

For these names, ONLY full-name matching is accepted (no last-name fallback). Accepts false negatives (a headline saying "Smith homers" won't match Will Smith) to eliminate the dominant false-positive problem.

**3. Factory function returning a reusable interface:**

```typescript
export function createPlayerNameMatcher(playerName: string): PlayerNameMatcher {
  // Pre-compiles regex once; returns { matches(text), fullName, lastName, canMatchByLast }
}
```

Pre-compiles regex patterns once per player. Reusable for any future feature needing article→player matching (Home page player tags, notification filtering, etc.).

### Integration

```typescript
// Before (inline closure):
const matchesPlayer = (text: string) => { ... includes(lastName) ... };

// After (extracted module):
import { createPlayerNameMatcher } from "./services/playerNameMatcher.js";
const matcher = createPlayerNameMatcher(playerName);
// Articles:
if (matcher.matches(article.title)) { ... }
// Trade Rumors categories:
const catMatch = article.categories.some(c => matcher.matches(c));
```

## Tests

25 tests in `server/src/features/mlb-feed/__tests__/playerNameMatcher.test.ts`:

- **Will Smith disambiguation**: full-name ✓, other Smiths ✗, bare "Smith" ✗, substring artifacts ✗
- **Distinctive names**: Ohtani matches by last name alone ✓
- **Ambiguous names**: Martinez, Rodriguez — full-name only ✓
- **Short last names**: Lee, Cruz — disabled (≤4 chars) ✓
- **Punctuation**: possessives ("Trout's"), commas, parens, sentence boundaries ✓
- **Suffixes**: "Ronald Acuna Jr." with escaped period ✓
- **Edge cases**: empty input, single-word names, regex metacharacters, case insensitivity ✓

## Prevention & Best Practices

### Never use `String.includes()` for name matching

`includes()` is a substring check with no word boundaries. It should never be used for matching proper names against free text. The `createPlayerNameMatcher()` function is the centralized utility — all name-matching must route through it.

### Will Smith is the canonical test case

Any name matcher must be validated against the "Will Smith problem" — a common last name shared by 3+ MLB players and a famous actor. The test suite has a dedicated section for this.

### Accept false negatives over false positives

For common last names, it is better to miss an article that only says "Smith" than to show it for every Smith in the league. Users notice irrelevant articles (noise) far more than missing ones.

### Maintain the ambiguous allowlist

Review quarterly against active rosters. Pay attention to Hispanic surnames (overrepresented in baseball relative to Census data). Currently ~50 entries.

### Remaining migration items

Two call sites in `routes.ts` still use the old `includes()` pattern and should be migrated to the matcher:
- YouTube RSS video matching (~line 503)
- Reddit daily-headlines rosterMap matching (~line 687)

## Related Documentation

- `docs/solutions/logic-errors/ohtani-derived-id-api-resolution.md` — same class: identifier-level false matching (derived ID collision). Multi-layer guards for player identity.
- `docs/solutions/logic-errors/ohtani-two-way-player-split-architecture.md` — player identity disambiguation at the data model level.
- `docs/plans/2026-03-23-feat-player-news-feed-plan.md` — original plan called for `matchPlayerByName()` but never specified disambiguation rules, leading to the `includes()` implementation.
