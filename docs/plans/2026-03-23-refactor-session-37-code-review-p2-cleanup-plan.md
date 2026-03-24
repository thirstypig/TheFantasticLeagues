---
title: "refactor: Session 37 Code Review P2 Cleanup"
type: refactor
status: active
date: 2026-03-23
deepened: 2026-03-23
---

# Session 37 Code Review P2 Cleanup

## Enhancement Summary

**Deepened on:** 2026-03-23
**Agents used:** 9 (TypeScript Reviewer, Performance Oracle, Code Simplicity Reviewer, Pattern Recognition, Architecture Strategist, Frontend Races Reviewer, Best Practices Researcher, Learnings Researcher, Codebase Explorer)

### Key Improvements from Research
1. **Revised Task 1 architecture** — merge myTeamId into existing outfieldMode fetch (same endpoint), expose only `myTeamId` (not full team object), memoize entire context value, reset to null on league switch
2. **Fixed type safety gap** — `LeagueDetail` type missing `ownerships` field; must fix before centralizing
3. **Corrected SortableHeader a11y approach** — use `<button>` inside `<th>` (WAI-ARIA pattern) instead of tabIndex/onKeyDown on `<th>`; omit `aria-sort` on unsorted columns (not `"none"`)
4. **Expanded Task 5 scope** — pattern recognition found `AddDropTab.tsx` (10+ inline sort headers) was missed
5. **Made SortableHeader generic** — `<K extends string = string>` for typed sort keys
6. **Fixed AbortError detection** — use `controller.signal.aborted` check instead of `instanceof DOMException`
7. **Found existing bug** — concurrent `generate` calls trample single `loading` state; AbortController fixes this

### Conflicting Advice Resolved
| Topic | Performance Oracle | Simplicity Reviewer | Architecture Strategist | **Decision** |
|-------|-------------------|--------------------|-----------------------|-------------|
| myTeamId location | Standalone hook (avoid 29-consumer re-renders) | Standalone hook (only AIHub needs it) | Context OK if merged with existing fetch | **Context, but merge with outfieldMode fetch + memoize value object** |
| AbortController | Keep | Drop (YAGNI) | N/A | **Keep — fixes real concurrent-generate bug** |
| SortableHeader a11y | N/A | Just aria-sort | N/A | **Full WAI-ARIA pattern (<button> in <th>) — it's actually simpler** |

---

## Overview

Resolve all 5 P2 findings from the Session 37 five-agent code review (PR #89). These are client-side refactoring tasks that reduce duplication, improve accessibility, and standardize table components. No new features — purely code quality and a11y improvements.

## Problem Statement / Motivation

The 5-agent code review (Security Sentinel, Performance Oracle, Architecture Strategist, TypeScript Reviewer, Code Simplicity Reviewer) identified 5 P2 items. The P1 security fix (User field stripping) was done immediately. These P2 items remain:

1. **7 pages duplicate team-finding logic** — maintenance burden, inconsistent error handling
2. **AIHub fetches lack cleanup** — potential stale setState on unmount
3. **SortableHeader has zero accessibility** — built but unusable by keyboard/screen reader users
4. **`compact` prop still used in 2 places** — dual-context conflict with density system
5. **26+ inline sort headers** — verbose, inconsistent arrow styling, no keyboard support

## Proposed Solution

Five tasks executed in dependency order, all client-side.

---

### Task 1: Add `myTeamId` to LeagueContext (merged with existing fetch)

**Decision:** Extend LeagueContext by piggybacking on the existing `GET /api/leagues/:id` fetch that already retrieves `outfieldMode`. The response already contains `teams` — extract `myTeamId` from the same response in the same effect. This **reduces** total API calls vs. status quo (eliminates 6 duplicate fetches across consumer files).

**Critical prerequisite — fix `LeagueDetail` type:**

The `LeagueDetail` type at `client/src/api/types.ts` is missing the `ownerships` field that all 7 consumer files rely on. Fix this first:

```ts
// client/src/api/types.ts
export interface TeamOwnership {
  userId: number;
}

export type LeagueDetail = LeagueSummary & {
  teams: Array<{
    id: number;
    name: string;
    code: string;
    ownerUserId?: number | null;
    owner?: string | null;
    ownerships?: TeamOwnership[];  // ADD THIS
  }>;
};
```

**Extract a named helper function (testable, single source of truth):**

```ts
// client/src/lib/teamUtils.ts (or inline in LeagueContext)
export function findMyTeam(
  teams: LeagueDetail["teams"],
  userId: number
): LeagueDetail["teams"][0] | null {
  return teams.find(t =>
    t.ownerUserId === userId ||
    (t.ownerships ?? []).some(o => o.userId === userId)
  ) ?? null;
}
```

**Merge with existing outfieldMode fetch (same useEffect):**

```ts
// LeagueContext.tsx — replace the existing outfieldMode effect
useEffect(() => {
  if (!user || !leagueId) return;
  let canceled = false;

  // Reset synchronously to prevent stale cross-league contamination
  setMyTeamId(null);
  setOutfieldMode("OF");

  fetchJsonApi<{ league: LeagueDetail }>(
    `${API_BASE}/leagues/${leagueId}`
  ).then(res => {
    if (canceled) return;
    setOutfieldMode(res?.league?.outfieldMode || "OF");
    const mine = findMyTeam(res.league?.teams ?? [], Number(user.id));
    setMyTeamId(mine?.id ?? null);
  }).catch(() => {
    if (canceled) return;
    setOutfieldMode("OF");
    setMyTeamId(null);
  });

  return () => { canceled = true; };
}, [user, leagueId]);
```

### Research Insights (Task 1)

**Race condition prevention (Frontend Races Reviewer — MEDIUM-HIGH):**
- When user switches leagues, `leagueId` updates immediately but `myTeamId` still reflects the old league until the fetch resolves. Any component using both could send mismatched IDs.
- **Fix:** Reset `myTeamId` to `null` synchronously at the top of the effect, before the async call. This ensures no stale cross-league contamination.
- The existing `outfieldMode` fetch has the same race condition (no cancellation flag) — fix it in the same change.

**Context re-render prevention (Performance Oracle — CRITICAL):**
- The current `LeagueContext.Provider` creates a new value object literal on every render (line 96). This causes all 29 consumers to re-render on any state change.
- **Fix:** Memoize the entire context value object and wrap `setLeagueId` in `useCallback`:

```ts
const setLeagueId = useCallback((id: number) => {
  setLeagueIdState(id);
  localStorage.setItem(STORAGE_KEY, String(id));
}, []);

const contextValue = useMemo(() => ({
  leagueId, setLeagueId, leagues, outfieldMode,
  currentLeagueName, currentSeason, currentFranchiseId,
  leagueSeasons, seasonStatus, myTeamId,
}), [leagueId, setLeagueId, leagues, outfieldMode,
     currentLeagueName, currentSeason, currentFranchiseId,
     leagueSeasons, seasonStatus, myTeamId]);

return <LeagueContext.Provider value={contextValue}>{children}</LeagueContext.Provider>;
```

- Also memoize `leagueSeasons` (currently runs `.filter()` every render, creating unstable array reference).

**Expose only `myTeamId`, NOT `myTeam` (Architecture Strategist):**
- The full team object (name, budget, roster) changes frequently during auction/season. Putting mutable domain data into session-level context creates stale-data bugs.
- Features that need team name/budget should continue fetching from their own domain-specific calls.
- This is the architectural ceiling for LeagueContext. Document in CLAUDE.md that a third user-derived field should trigger a context split.

**Type safety (TypeScript Reviewer):**
- Use `catch (err: unknown)` not `catch (err: any)` throughout
- Clean up `Record<string, any>` in AIHub → `Record<string, unknown>`
- The `any` annotations on team-finding in consumer files will disappear when centralized

**Files to modify:**
- `client/src/api/types.ts` — add `ownerships` to `LeagueDetail`
- `client/src/contexts/LeagueContext.tsx` — merge outfieldMode + myTeamId fetch, memoize value, add `myTeamId`
- `client/src/features/ai/pages/AIHub.tsx` — remove team fetch useEffect, use `useLeague().myTeamId`
- `client/src/pages/Home.tsx` — remove team fetch, use `useLeague().myTeamId`
- `client/src/features/auction/pages/Auction.tsx` — use `useLeague().myTeamId`
- `client/src/features/auction/pages/AuctionResults.tsx` — use `useLeague().myTeamId`
- `client/src/features/trades/pages/TradesPage.tsx` — use `useLeague().myTeamId`
- `client/src/features/transactions/pages/ActivityPage.tsx` — use `useLeague().myTeamId`

**Excluded:** `TransactionsPage.tsx` (admin filter pattern, semantically different).

**TradesPage email fallback:** Investigate whether any teams have null `ownerUserId`. If none, remove `t.owner === user?.email` from TradesPage. If some exist, include in `findMyTeam`.

**Test:** Unit test for `findMyTeam` helper with scenarios: standard ownership, ownerships array, no team, admin without team.

---

### Task 2: AIHub AbortController

**File:** `client/src/features/ai/pages/AIHub.tsx`

**Pattern A — team fetch useEffect:**
Eliminated entirely by Task 1 (replaced by context). No abort controller needed.

**Pattern B — generate callback:**

### Research Insights (Task 2)

**Real bug found (Frontend Races Reviewer):**
The current `loading` state is a single string. Clicking "Draft Grades" then "Draft Report" before the first resolves causes the first response's `finally` block to clear `loading`, making the Draft Report card lose its spinner prematurely. AbortController fixes this by cancelling the first request.

**AbortError detection (Best Practices Researcher):**
- Do NOT use `err instanceof DOMException` — fails in Node.js test environments.
- Use `controller.signal.aborted` as the source of truth (authoritative, not fragile error classification):

```ts
const abortRef = useRef<AbortController | null>(null);

const generate = useCallback(async (feature: string) => {
  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;
  try {
    setLoading(feature);
    const res = await fetchJsonApi<Record<string, unknown>>(url, {
      signal: controller.signal,
    });
    if (!controller.signal.aborted) setResult(res);
  } catch (err: unknown) {
    if (controller.signal.aborted) return; // Check signal, not error type
    setErrors(prev => ({
      ...prev,
      [feature]: (err as Error)?.message || "Failed",
    }));
  } finally {
    if (!controller.signal.aborted) setLoading(null);
  }
}, [leagueId, myTeamId]);

// Cleanup on unmount
useEffect(() => () => { abortRef.current?.abort(); }, []);
```

**Confirmed: `fetchJsonApi` already supports signal forwarding** — `RequestInit` is spread into `fetch()` at `base.ts:40-44`. No changes to `base.ts` needed.

**Note:** `getSession()` call inside `fetchJsonApi` runs before `fetch()`. If aborted during that window, abort is picked up when `fetch` starts. This is fine — slightly wasteful but not dangerous.

---

### Task 3: SortableHeader Accessibility

**File:** `client/src/components/ui/SortableHeader.tsx`

### Research Insights (Task 3)

**WAI-ARIA correct pattern (Best Practices Researcher):**
The W3C APG Sortable Table example uses a `<button>` inside `<th>`, NOT `onClick` on `<th>`. This is simpler than the original plan's tabIndex/onKeyDown approach because `<button>` provides keyboard support natively (Enter + Space).

**aria-sort placement (Best Practices Researcher):**
- `aria-sort` ONLY on the currently sorted column
- **Omit entirely** on unsorted columns (do NOT set `aria-sort="none"`)
- `aria-hidden="true"` on the sort icon (aria-sort already conveys the information)

**Make SortableHeader generic (TypeScript Reviewer + Pattern Recognition):**

```tsx
interface SortableHeaderProps<K extends string = string> {
  sortKey: K;
  activeSortKey: K;        // KEEP existing name (not "currentSortKey")
  sortDesc: boolean;
  onSort: (key: K) => void;
  children: React.ReactNode; // KEEP (more flexible than "label: string")
  align?: "left" | "center" | "right";
  className?: string;
  title?: string;
}

export function SortableHeader<K extends string = string>({
  sortKey, activeSortKey, sortDesc, onSort, children, align, className, title,
}: SortableHeaderProps<K>) {
  const isActive = activeSortKey === sortKey;
  const alignClass = { left: "text-left", center: "text-center", right: "text-right" }[align ?? "left"];
  const SortIcon = isActive ? (sortDesc ? ArrowDown : ArrowUp) : ArrowUpDown;

  return (
    <TableHead
      className={cn(alignClass, className)}
      {...(isActive ? { "aria-sort": sortDesc ? "descending" : "ascending" } : {})}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={title}
        className={cn(
          "inline-flex items-center gap-1 cursor-pointer select-none",
          "hover:text-[var(--lg-accent)] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lg-tint)] focus-visible:rounded-sm",
          isActive && "text-[var(--lg-accent)]",
        )}
      >
        {children}
        <SortIcon
          size={12}
          aria-hidden="true"
          className={cn("flex-shrink-0", isActive ? "opacity-80" : "opacity-30")}
        />
      </button>
    </TableHead>
  );
}
```

**Key changes from original plan:**
1. Sort activation via `<button>` (not `tabIndex + onKeyDown` on `<th>`) — native keyboard support
2. `aria-sort` only on active column, omitted entirely otherwise (not `"none"`)
3. `aria-hidden="true"` on icon
4. Generic `<K extends string>` for typed sort keys
5. Keep `children` and `activeSortKey` (existing API, don't rename)

**Touch target (Learnings — iOS accessibility):** The `<button>` with padding should meet 44x44px minimum. Verify on mobile at 390px width.

**Test:** Render test verifying `<button>` is keyboard-accessible, `aria-sort` present only on active column.

---

### Task 4: Deprecate `compact` Prop

**Files to modify:**
- `client/src/features/auction/components/PlayerPoolTab.tsx` line 404 — `<ThemedTable bare compact>` → `<ThemedTable bare density="compact">`
- `client/src/features/auction/components/AuctionDraftLog.tsx` line 91 — same change
- `client/src/components/ui/ThemedTable.tsx` — remove `compact` prop, simplify to:

```tsx
export function ThemedTable({
  children, className = '', bare = false, density = "comfortable", zebra = false,
}: ThemedTableProps) {
  const zebraClass = zebra ? "lg-table" : "";
  const tableEl = (
    <table className={cn("w-full caption-bottom text-sm", zebraClass, bare ? className : "")}>
      {children}
    </table>
  );
  return (
    <TableDensityProvider density={density}>
      {bare ? tableEl : (
        <div className={cn('overflow-x-auto rounded-2xl liquid-glass', className)}>
          {tableEl}
        </div>
      )}
    </TableDensityProvider>
  );
}
```

- `client/src/components/ui/table.tsx` — remove `TableCompactProvider`, `TableCompactContext`, `useTableCompact` (all dead code: zero consumers outside definitions)

### Research Insights (Task 4)

**Confirmed safe (Architecture Strategist):** Only ThemedTable.tsx consumes `TableCompactProvider`. Removing both files atomically is safe.

**Default density value (TypeScript Reviewer):** Ensure `density = "comfortable"` in destructuring (not just type) to preserve backwards compatibility.

**Visual change:** None. Confirm with browser spot-check in dark + light mode.

---

### Task 5: Adopt SortableHeader

**Files to modify:**
- `client/src/features/players/pages/Players.tsx` — replace inline sort headers (8 hitter + 8 pitcher columns, conditionally rendered)
- `client/src/features/auction/components/PlayerPoolTab.tsx` — replace 13+ inline sort headers, remove `sortArrow` helper and `handleHeaderClick`
- `client/src/features/roster/components/AddDropTab.tsx` — **NEW** (found by Pattern Recognition): 10+ inline sort headers with identical pattern

### Research Insights (Task 5)

**Missed file (Pattern Recognition — IMPORTANT):**
`AddDropTab.tsx` has the exact same inline sort pattern as Players.tsx (10+ columns with `sortKey === 'X' && (sortDesc ? '▼' : '▲')`). Adding this file increases the dedup win significantly.

**ArchivePage.tsx deferred:** Only 2 sortable columns with a different state shape (`sortConfig: { key, direction }` object). Not worth the conversion complexity in this PR.

**Per-column default sort direction:** Consumer's `handleSort` encodes this, not SortableHeader:

```ts
const handleSort = (key: string) => {
  if (sortKey === key) {
    setSortDesc(!sortDesc);
  } else {
    setSortKey(key);
    setSortDesc(!['name', 'mlb_team'].includes(key));
  }
};
```

**Visual change:** Intentional. Unicode arrows → Lucide icons. Design-system standard.

**Custom classes:** Preserve column-specific widths and padding via `className` prop.

**Test:** Update any assertions checking for Unicode arrow characters. Verify existing `Players.test.tsx` passes.

---

## Technical Considerations

- **No API changes** — all work is client-side React/TypeScript
- **`fetchJsonApi` signal forwarding** — already works (confirmed: `RequestInit` spread at `base.ts:40-44`)
- **Sticky header CSS** — per `docs/solutions/ui-bugs/css-sticky-fails-nested-overflow-containers.md`, do NOT add `overflow-auto` wrappers when modifying table components
- **Context value memoization** — fixes a pre-existing performance issue independent of this refactoring (29 consumers creating new object reference every render)
- **LeagueContext is the ceiling** — document that a third user-derived field should trigger a context split into `LeagueConfigContext` + `LeagueSessionContext`

## Execution Order

```
Task 1 (LeagueContext myTeamId + memoize) ──→ Task 2 (AbortController — team fetch eliminated)
Task 3 (SortableHeader a11y + generic) ────→ Task 5 (Adopt SortableHeader)
Task 4 (Deprecate compact) ─────────────→ Task 5 (both touch PlayerPoolTab.tsx)
```

**Recommended order:** 1 → 2 → 3 → 4 → 5

Tasks 1+2 and 3+4 are independent pairs that could be done in parallel.

## Acceptance Criteria

### Functional
- [ ] `LeagueDetail` type includes `ownerships` field
- [ ] `findMyTeam` helper extracted and typed
- [ ] `useLeague()` returns `myTeamId: number | null` (NOT full team object)
- [ ] Context value memoized with `useMemo`; `setLeagueId` wrapped in `useCallback`
- [ ] `myTeamId` resets to `null` synchronously on league switch (before async fetch)
- [ ] Existing outfieldMode fetch has cancellation flag (`let canceled = false`)
- [ ] All 6 consumer files use context instead of local fetch+find
- [ ] AIHub generate callback uses AbortController with `signal.aborted` check
- [ ] SortableHeader uses `<button>` inside `<th>` (WAI-ARIA pattern)
- [ ] SortableHeader generic: `<K extends string = string>`
- [ ] `aria-sort` only on active column, omitted on unsorted columns
- [ ] Zero callers of `compact` prop remain; prop removed from ThemedTable
- [ ] `TableCompactProvider`, `TableCompactContext`, `useTableCompact` removed
- [ ] Players.tsx, PlayerPoolTab.tsx, and AddDropTab.tsx use SortableHeader
- [ ] Inline `sortArrow` helpers and `handleHeaderClick` functions removed

### Quality
- [ ] All 187 client tests pass (update Unicode arrow assertions)
- [ ] All 493 server tests pass
- [ ] `cd client && npx tsc --noEmit` — zero TypeScript errors
- [ ] Zero new `any` types; net reduction of `any` in touched files
- [ ] Unit test for `findMyTeam` helper (4+ scenarios)
- [ ] Render test for SortableHeader `<button>` + `aria-sort`
- [ ] Visual spot-check: sort headers in dark + light mode, mobile 390px

## Dependencies & Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Stale myTeamId on league switch | Medium-High | Reset to null synchronously before async fetch; cancellation flag |
| LeagueContext re-renders cascade | Medium | Memoize entire value object; wrap setLeagueId in useCallback |
| Concurrent generate calls trample loading | Medium | AbortController cancels previous request |
| LeagueDetail type missing ownerships | High | Fix type BEFORE centralizing team-finding logic |
| Existing tests break on arrow changes | Low | Update assertions in Task 5 |
| TradesPage email fallback removal | Low | Query DB first to check for null ownerUserId teams |

## Sources & References

### Internal
- Code review findings: FEEDBACK.md Session 37, PR #89
- League context: `client/src/contexts/LeagueContext.tsx`
- SortableHeader: `client/src/components/ui/SortableHeader.tsx`
- ThemedTable: `client/src/components/ui/ThemedTable.tsx`, `client/src/components/ui/table.tsx`
- API types: `client/src/api/types.ts`
- Hook pattern: `client/src/hooks/useSeasonGating.ts`
- Learnings: `docs/solutions/ui-bugs/css-sticky-fails-nested-overflow-containers.md`
- Learnings: `docs/solutions/ui-bugs/ios-viewport-height-and-touch-target-sizing.md`

### External
- [W3C WAI-APG Sortable Table Example](https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/)
- [aria-sort — MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-sort)
- [AbortController — MDN](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort)
- [React useContext optimization — react.dev](https://react.dev/reference/react/useContext)

### Files Modified (complete list — 16 files)
1. `client/src/api/types.ts` — add ownerships to LeagueDetail
2. `client/src/contexts/LeagueContext.tsx` — merge fetch, add myTeamId, memoize value
3. `client/src/features/ai/pages/AIHub.tsx` — use context, add AbortController
4. `client/src/pages/Home.tsx` — use context
5. `client/src/features/auction/pages/Auction.tsx` — use context
6. `client/src/features/auction/pages/AuctionResults.tsx` — use context
7. `client/src/features/trades/pages/TradesPage.tsx` — use context
8. `client/src/features/transactions/pages/ActivityPage.tsx` — use context
9. `client/src/components/ui/SortableHeader.tsx` — a11y + generic + button pattern
10. `client/src/components/ui/ThemedTable.tsx` — remove compact prop, simplify
11. `client/src/components/ui/table.tsx` — remove compact infrastructure
12. `client/src/features/players/pages/Players.tsx` — adopt SortableHeader
13. `client/src/features/auction/components/PlayerPoolTab.tsx` — adopt SortableHeader, migrate compact
14. `client/src/features/auction/components/AuctionDraftLog.tsx` — migrate compact
15. `client/src/features/roster/components/AddDropTab.tsx` — adopt SortableHeader (NEW)
16. `client/src/lib/teamUtils.ts` — findMyTeam helper (NEW, optional — can inline in context)
