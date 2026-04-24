---
title: React Key Collision From `?? 0` Fallback on Optional ID Field
category: logic-errors
component: transactions/roster-moves
date: 2026-04-23
session: 75
tags:
  - react-keys
  - selection-state
  - list-rendering
  - id-namespace
  - test-fixtures
  - roster-moves
  - activity-page
related_commits:
  - 27b0961  # the fix on the feat/roster-moves-client-unified branch
  - 7adb9ce  # PR #123 merge (Roster Moves client re-homing)
related_files:
  - logic-errors/waiver-priority-ui-server-mismatch.md
  - runtime-errors/auction-production-outage-api-routing-player-ids.md
  - logic-errors/ohtani-derived-id-api-resolution.md
severity: high
---

# React Key Collision From `?? 0` Fallback on Optional ID Field

`AddDropPanel` rendered a list of free agents and tracked which one was selected, keying both the list's React `key` and the selection state by `p._dbPlayerId ?? 0`. Free agents from `getPlayerSeasonStats` don't carry `_dbPlayerId` — that field is only enriched on rows joined against a `Roster` row. So every free agent collapsed to `pid = 0`. React kept rendering 30 distinct rows (positional fallback) but every row shared the same `key={0}` and the same selection ID. Clicking one highlighted all 30. A submit would have posted `{ playerId: 0 }` to `/transactions/claim`.

The bug shipped through CI. Every unit test for this component mocked free agents as `{ _dbPlayerId: 500, ... }` — a value the real API never emits.

## Symptom

In `/activity?tab=add_drop`, with enforcement on:

- Free-agent list shows 30 candidates, all distinct names.
- Clicking "Carson Spiers" visually highlights **every row** (all 30 get the selected background).
- React devtools: 29 warnings of the form *"Encountered two children with the same key, `0`"*.
- If the user proceeds to submit, the request body contains `{ playerId: 0, mlbId: undefined }` — server rejects with an opaque `PLAYER_NOT_FOUND` or silently resolves to a stale placeholder.

Pre-fix empirical confirmation via Playwright:

```js
// After clicking one FA, every FA had the selected class.
{
  totalFAButtons: 30,
  selectedCount: 30,
  selectedNames: ["Michael Toglia", "Carson Spiers", ..., "Sonny Gray"],
}
```

## Root cause

### The fallback lie

```tsx
// AddDropPanel.tsx — BEFORE
const [addPlayerId, setAddPlayerId] = useState<number | null>(null);

freeAgents.map((p) => {
  const pid = p._dbPlayerId ?? 0;              // ← the lie
  const isSelected = pid === addPlayerId;
  return (
    <button
      key={pid}                                // every FA gets key={0}
      onClick={() => setAddPlayerId(pid)}       // selection ID is also 0
      className={isSelected ? "selected" : ""}
    >
      {p.player_name}
    </button>
  );
});
```

`_dbPlayerId` is populated only on rows that went through the client's roster-enrichment path (`Team.tsx` roster query, commissioner roster tool, etc.). The free-agent pool comes from `getPlayerSeasonStats`, which returns raw `Player` rows with no `Roster` join — so `_dbPlayerId` is `undefined`. The `?? 0` fallback converted "missing identity" into "shared identity zero." Every free agent became the same row as far as selection state was concerned.

### What kept React from crashing

React's reconciler falls back to positional matching when keys collide, so the 30 rows still rendered in order. That's why the bug produced a warning, not a runtime error. The visible failure was entirely in selection state — which derives from `addPlayerId` via a pure `===` compare outside React's render tree, so React couldn't save us there.

### Why tests didn't catch it

```ts
// AddDropPanel.test.tsx — BEFORE
const freeAgent = {
  _dbPlayerId: 500,          // ← fabricated; real free agents have undefined
  _dbTeamId: undefined,
  player_name: "Jake Bauers",
  positions: "1B,OF",
} as RosterMovesPlayer;
```

Every test mocked the field with a real value, so `pid` was always unique in the test. The tests asserted button enable/disable states and warning text, never "clicking one row highlights exactly one row." Browser verification caught the bug the first time real data touched the panel.

## Solution

**Track selection by a field that exists on every row.** The server's `/transactions/claim` endpoint accepts either `playerId` (DB `Player.id`) or `mlbId` (string) — this dual-ID contract was already in use by the legacy `ActivityPage.handleClaim`. Pivoting to `mlb_id` lets the same code path work for enriched-and-unenriched rows uniformly.

### The fix

```tsx
// AddDropPanel.tsx — AFTER
// Track selection by mlb_id, not _dbPlayerId. Free agents come from
// getPlayerSeasonStats and do NOT carry _dbPlayerId (that field is only
// enriched on rows joined against a Roster row). Keying by _dbPlayerId
// collapsed every FA to pid=0, making one click select all 30. mlb_id is
// set by normalizeTwoWayRow for every row and is also what the server's
// /transactions/claim accepts for FAs that aren't in the Roster table.
const [addMlbId, setAddMlbId] = useState<string | null>(null);

freeAgents.map((p) => {
  const key = String(p.mlb_id ?? p._dbPlayerId ?? p.player_name ?? "");
  const isSelected = key === addMlbId;
  return (
    <button
      key={key}
      onClick={() => setAddMlbId(key)}
      className={isSelected ? "selected" : ""}
    >
      {p.player_name}
    </button>
  );
});

// On submit:
const addDbId = selectedAdd?._dbPlayerId;
await fetchJsonApi("/api/transactions/claim", {
  method: "POST",
  body: JSON.stringify({
    leagueId,
    teamId,
    mlbId: addMlbId,
    ...(addDbId ? { playerId: addDbId } : {}),
    ...(dropPlayerId !== "" ? { dropPlayerId: Number(dropPlayerId) } : {}),
  }),
});
```

Chain of fallbacks in the key (`mlb_id ?? _dbPlayerId ?? player_name`) is deliberate: if `mlb_id` is ever missing (shouldn't happen given `normalizeTwoWayRow`), fall to other stable identifiers rather than back to `0`. `String()` is also deliberate — the `RosterMovesPlayer` type permits `mlb_id: string | number`, and `===` comparison between string and number fails silently. The wrapper makes the key a consistent type regardless of source.

### The regression test

```tsx
// AddDropPanel.test.tsx — regression lock
it("clicking one free agent selects only that one, not every FA with missing _dbPlayerId", async () => {
  const user = userEvent.setup();
  const fas: RosterMovesPlayer[] = [
    { mlb_id: "1001", player_name: "Alpha One", positions: "1B" },
    { mlb_id: "1002", player_name: "Bravo Two", positions: "OF" },
    { mlb_id: "1003", player_name: "Charlie Three", positions: "P" },
  ];
  render(<AddDropPanel {...BASE_PROPS} players={[...fas, ownRosterPlayer]} />);

  await user.click(screen.getByText("Bravo Two"));

  const allFaButtons = screen.getAllByRole("button").filter((b) =>
    fas.some((f) => b.textContent?.includes(f.player_name ?? ""))
  );
  const selected = allFaButtons.filter((b) =>
    b.className.includes("bg-[var(--lg-accent)]/15"),
  );
  expect(selected).toHaveLength(1);
  expect(selected[0].textContent).toContain("Bravo Two");
});
```

Key fixture decision: **no `_dbPlayerId` on the free agents.** The fixture now matches the real API shape; if anyone reintroduces `p._dbPlayerId ?? 0` in future, this test fails.

Also added two submit-body contract tests that assert the request body contains `mlbId` (not `playerId: 0`) for free agents, so a future refactor that drops the `mlbId` send gets caught at unit test time instead of at the server.

## Prevention strategies

### 1. Never `?? 0` or `?? ""` an identifier used as a key or a lookup

The fallback lies about identity. If a row has no stable ID, either:
- Use a composite key: `` `${p.mlb_id}-${p.role}` ``
- Derive a namespaced key: `` p._dbPlayerId ? `db:${p._dbPlayerId}` : `mlb:${p.mlb_id}` ``
- Assign a UUID at data-load time and store it on the object (never in render)

`?? 0` / `?? ""` is only safe when `0` / `""` is itself a distinct semantic value — which is almost never the case for IDs.

### 2. Test fixtures must mirror real API shapes

Don't add fields the real API never emits, even if doing so makes assertions simpler. See [`memory/feedback_test_fixtures.md`](../../../memory/feedback_test_fixtures.md) for the durable form of this lesson.

Before writing any mock of a paginated or list endpoint, check the actual response shape against a live call (curl, dev browser, Playwright `page.evaluate`). A `satisfies Type` annotation on the fixture gives some coverage, but can't catch cases where `Type` declares a field as optional and production omits it 100% of the time.

### 3. Invariant-based regression guard — a one-line test

For any list component, one unit test pins the invariant cheaply:

```ts
it("every rendered row gets a unique React key", () => {
  const keyOf = (p: RosterMovesPlayer) =>
    String(p.mlb_id ?? p._dbPlayerId ?? p.player_name ?? "");
  const samplePlayers = [...thirtyRealisticFreeAgents];
  const keys = new Set(samplePlayers.map(keyOf));
  expect(keys.size).toBe(samplePlayers.length);
});
```

Runs in milliseconds. Catches the `?? 0` regression immediately.

### 4. "Exactly one" pattern for selection UIs

When a click is supposed to select exactly one row of N, assert it:

```ts
await user.click(rows[5]);
const selected = screen.getAllByRole("button", { selected: true });
// or filter by selected class if aria-selected isn't set
expect(selected).toHaveLength(1);
```

This is the Testing Library "contract, not implementation" idiom. Adopting it everywhere a list has click-selection would have caught this bug without any understanding of `_dbPlayerId` vs `mlb_id`.

### 5. Lint gap — known, not fixed

`eslint-plugin-react`'s `react/jsx-key` catches missing keys but not duplicate-or-nullable keys. There's no mainstream rule for "this key expression may evaluate to a shared sentinel." Teams who care write a custom ESLint rule. We haven't; the invariant test above is the pragmatic substitute.

## Related work

- [`logic-errors/waiver-priority-ui-server-mismatch.md`](waiver-priority-ui-server-mismatch.md) — same shape: UI and server computed different truths from different data sources; fix was to unify on a single source of truth.
- [`runtime-errors/auction-production-outage-api-routing-player-ids.md`](../runtime-errors/auction-production-outage-api-routing-player-ids.md) — same class of bug: ID-namespace confusion (internal Prisma `id` vs MLB `mlb_id`) collapsed distinct entities into one. Defense-in-depth resolution: validate at every layer.
- [`logic-errors/ohtani-derived-id-api-resolution.md`](ohtani-derived-id-api-resolution.md) — defense-in-depth pattern: API functions, modal entry points, and server endpoints each independently validate IDs. Relevant here because the fix adopted the server's existing dual-ID contract (`playerId` or `mlbId`) instead of inventing a new convention.

## Regression checklist

When changing anything in `RosterMovesTab/AddDropPanel.tsx` (or the sibling `PlaceOnIlPanel.tsx` / `ActivateFromIlPanel.tsx`):

- [ ] Selection state tracked by a field present on every row.
- [ ] React `key` uses the same field or a composite including it.
- [ ] No `?? 0` or `?? ""` fallback on the key expression.
- [ ] Unit tests use realistic fixtures (no fabricated `_dbPlayerId` on free agents).
- [ ] At least one test clicks a row and asserts exactly one row is visually selected.
- [ ] Submit-body contract test asserts `mlbId` is sent for free agents (not `playerId: 0`).
