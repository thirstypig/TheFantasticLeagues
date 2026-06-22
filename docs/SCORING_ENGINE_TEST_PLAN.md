# Scoring Engine Test Plan

**Status:** 📋 **DOCUMENTED** (tests not yet written — local Supabase blocked)  
**Feature:** Scoring Settings (Phase 3)  
**Session:** 2026-06-22  
**Feature Commit:** 859e1bc  

---

## Overview

The Scoring Engine feature consists of:
- **Pure functions** for NFL/NBA scoring calculations
- **HTTP endpoints** for scoring-settings and roster-config CRUD
- **React component** for commissioner-facing UI

This plan outlines the test coverage needed before local testing becomes possible (see `LOCAL_SUPABASE_SETUP.md`).

---

## UNIT TESTS — Backend Pure Functions

**File:** `server/src/services/__tests__/scoringEngine.test.ts`

### 1. `calculateNFLPoints(stats, rules)`

**What it does:** Multiplies player stats by point values per league rules.

**Tests needed:**

| Test Name | Input | Expected Output | Why It Matters |
|-----------|-------|-----------------|-----------------|
| Happy path: standard stats | `{passing_yards: 250, passing_td: 2}` + NFL rules | `(250 × 0.04) + (2 × 4) = 18.0` | Regression: stats × points calculation must be exact |
| Ignores inactive rules | Stats + inactive rule in list | Omits that rule from total | Regression: inactive rules shouldn't count |
| Missing stat = 0 | `{passing_yards: 250}` (no passing_td) + rules | Uses 0 for missing stat | Regression: missing stats cause NaN |
| Zero stats | `{passing_yards: 0, passing_td: 0}` | 0 | Edge case: shutdown game |
| Fractional points | `{passing_yards: 1}` + 0.04 rule | 0.04 | Precision: maintain decimal accuracy |

**Setup:**
```typescript
const mockRules = [
  { id: 1, statKey: 'passing_yards', pointValue: 0.04, isActive: true, sortOrder: 1 },
  { id: 2, statKey: 'passing_td', pointValue: 4.0, isActive: true, sortOrder: 2 },
  { id: 3, statKey: 'rushing_yards', pointValue: 0.1, isActive: false, sortOrder: 3 },
];
```

---

### 2. `calculateNBACategories(stats, rules)`

**What it does:** Extracts per-category NBA stats from raw player stats, mapping BallDontLie keys to category names.

**Tests needed:**

| Test Name | Input | Expected Output | Why It Matters |
|-----------|-------|-----------------|-----------------|
| Happy path: 9 categories | `{pts: 28.4, reb: 7.2, ast: 5.1, to: 2.1, ...}` | `{pts: 28.4, reb: 7.2, ...}` | Regression: category mapping must match BallDontLie |
| Percentage stat handling | `{fg_pct: 0.453}` | Returns 0.453 (not 45.3) | Critical: percentages are decimals, not whole numbers |
| Turnover mapping | `{turnovers: 2.1}` → extracted as 'to' | `{to: 2.1}` | Regression: 'turnovers' key → 'to' category |
| Missing category | Rules ask for 'stl' but not in stats | 0 or undefined (per design) | Edge case: what if a category wasn't counted? |

**Setup:**
```typescript
const mockRules = [
  { statKey: 'pts' },
  { statKey: 'reb' },
  { statKey: 'fg_pct' },
  { statKey: 'to' },
];
const mockStats = { pts: 28.4, reb: 7.2, fg_pct: 0.453, turnovers: 2.1 };
```

---

### 3. `compareNBACategories(homeStats, awayStats, rules)`

**What it does:** Compares two teams category-by-category, determines winner per category.

**Tests needed:**

| Test Name | Input | Expected Output | Why It Matters |
|-----------|-------|-----------------|-----------------|
| Home wins all | Home 28 pts, Away 20 pts (etc.) | homeWins=9, awayWins=0, ties=0 | Regression: perfect win detection |
| Split matchup | Home wins PTS/REB, Away wins AST/STL | homeWins=2, awayWins=2, ties=0 | Regression: per-category tally |
| Ties | Both teams 25.0 pts (same value) | ties=1 for that category | Regression: ties must increment |
| Percentage inversion | High FG% is good, low TO is good | Correctly awards category to lower TO | Critical: invert logic for 'to' stat |

**Setup:**
```typescript
const home = { pts: 28.4, reb: 7.2, ast: 5.1, to: 2.1 };
const away = { pts: 20.0, reb: 8.0, ast: 4.5, to: 2.0 };
const rules = [
  { statKey: 'pts' },
  { statKey: 'reb' },
  { statKey: 'ast' },
  { statKey: 'to' },
];
```

---

### 4. `calculateStandings(matchups, season)`

**What it does:** Aggregates H2H results into W/L/T standings with streak tracking.

**Tests needed:**

| Test Name | Input | Expected Output | Why It Matters |
|-----------|-------|-----------------|-----------------|
| Linear wins | Team A beats Team B twice | W=2, L=0, T=0, streak="W2" | Regression: win tally and streak |
| Streak reset | W-W-L-W | streak="W1" (not W3) | Critical: losing breaks the streak |
| Ties in streak | T-T-W | streak="W1" or "T2"? | Edge: how do ties affect streaks? Clarify design |
| Points for/against | Team A 100pts vs Team B 90pts | pointsFor=100, pointsAgainst=90 | Regression: PF/PA calculation |

---

### 5. `getDefaultScoringRules(sport)`

**What it does:** Returns the hardcoded default rules for a sport.

**Tests needed:**

| Test Name | Input | Expected Output | Why It Matters |
|-----------|-------|-----------------|-----------------|
| NFL defaults | 'NFL' | Array with passing_yards (0.04), passing_td (4.0), etc. | Regression: default rule set must be correct |
| NBA defaults | 'NBA' | Array with pts, reb, ast, 3pm, fg_pct, ft_pct, to | Regression: NBA categories match league standard |
| Invalid sport | 'XYZ' | Throw error or return empty | Edge: graceful failure |

---

## INTEGRATION TESTS — API Endpoints

**File:** `server/src/features/scoring/__tests__/routes.test.ts`

### GET `/api/leagues/:id/scoring-settings`

**Setup:** Create league → fetch settings → verify shape

```typescript
describe('GET /api/leagues/:id/scoring-settings', () => {
  it('returns default rules if none exist', async () => {
    const league = await createLeague({ sport: 'NFL' });
    const res = await client.get(`/api/leagues/${league.id}/scoring-settings`);
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      leagueId: league.id,
      sport: 'NFL',
      rules: expect.arrayContaining([
        expect.objectContaining({ statKey: 'passing_yards', pointValue: 0.04 }),
        expect.objectContaining({ statKey: 'passing_td', pointValue: 4.0 }),
      ]),
    });
  });

  it('rejects unauthenticated requests', async () => {
    const res = await client.get(`/api/leagues/1/scoring-settings`)
      .set('Authorization', 'Bearer invalid');
    expect(res.status).toBe(401);
  });

  it('rejects non-commissioner access', async () => {
    const league = await createLeague();
    const user = await createUser({ email: 'owner@test.com' });
    const res = await client.get(`/api/leagues/${league.id}/scoring-settings`)
      .set('Authorization', `Bearer ${userToken(user)}`);
    expect(res.status).toBe(403);
  });
});
```

---

### PATCH `/api/leagues/:id/scoring-settings`

**Tests needed:**

| Test Name | Setup | Payload | Expected | Why |
|-----------|-------|---------|----------|-----|
| Update points | Existing league + rules | `{rules: [{id, pointValue: 5.0}]}` | Rule updated to 5.0 | Regression: point value updates persist |
| Commissioner only | Non-commissioner user | (same) | 403 Forbidden | Authorization must work |
| Validation: min/max | (any) | `{pointValue: -10}` | 400 Bad Request | Points can't be negative |
| Partial update | 10 rules, update 2 | Update 2 rules | Other 8 unchanged | Regression: partial updates don't wipe others |

---

### GET `/api/leagues/:id/roster-config`

**Tests needed:** Same shape as scoring-settings (default if none exist, auth checks, returns slot config)

---

### PATCH `/api/leagues/:id/roster-config`

**Tests needed:**

| Test Name | Payload | Expected | Why |
|-----------|---------|----------|-----|
| Valid slots | `{slots: {BN: 7, C: 2}}` total=9 | 200, saved | Valid config persists |
| Below min (8) | `{BN: 5, C: 1}` total=6 | 400 Bad Request | Min slot validation |
| Above max (25) | 26 total slots | 400 Bad Request | Max slot validation |
| Update from 9→10 | Change BN from 5→6 | Config updates | Slot changes work |

---

## COMPONENT TESTS — React UI

**File:** `client/src/features/commissioner/pages/__tests__/ScoringSettings.test.tsx`

### Rendering & Initialization

```typescript
describe('ScoringSettings component', () => {
  it('renders two tabs: Scoring Rules and Roster Config', async () => {
    const { getByRole } = render(
      <ScoringSettings />,
      { wrapper: withRouter }
    );
    
    expect(getByRole('tab', { name: /scoring rules/i })).toBeInTheDocument();
    expect(getByRole('tab', { name: /roster config/i })).toBeInTheDocument();
  });

  it('fetches settings on mount', async () => {
    vi.mock('../api', () => ({
      fetchJsonApi: vi.fn().mockResolvedValue({
        rules: [{ id: 1, statKey: 'passing_yards', pointValue: 0.04 }],
      }),
    }));

    render(<ScoringSettings />, { wrapper: withRouter });
    
    await waitFor(() => {
      expect(fetchJsonApi).toHaveBeenCalledWith(
        'GET /api/leagues/1/scoring-settings'
      );
    });
  });

  it('shows loading skeleton while fetching', () => {
    vi.mock('../api', () => ({
      fetchJsonApi: vi.fn(() => new Promise(() => {})), // Never resolves
    }));

    const { getByTestId } = render(<ScoringSettings />, { wrapper: withRouter });
    expect(getByTestId('loading-skeleton')).toBeInTheDocument();
  });
});
```

---

### Editing Rules

```typescript
it('marks rules as changed when value is edited', async () => {
  const { getByRole, getByDisplayValue } = render(
    <ScoringSettings />,
    { wrapper: withRouter, initialProps: { rules: [{ id: 1, statKey: 'passing_td', pointValue: 4.0 }] } }
  );

  const input = getByDisplayValue('4.0');
  await userEvent.clear(input);
  await userEvent.type(input, '5.0');

  const saveButton = getByRole('button', { name: /save/i });
  expect(saveButton).toBeEnabled(); // Not disabled when changed
});

it('sends PATCH when Save is clicked', async () => {
  const mockPatch = vi.fn().mockResolvedValue({});
  vi.mock('../api', () => ({ fetchJsonApi: mockPatch }));

  const { getByRole, getByDisplayValue } = render(<ScoringSettings />);

  const input = getByDisplayValue('4.0');
  await userEvent.clear(input);
  await userEvent.type(input, '5.0');

  const saveButton = getByRole('button', { name: /save/i });
  await userEvent.click(saveButton);

  expect(mockPatch).toHaveBeenCalledWith(
    'PATCH /api/leagues/1/scoring-settings',
    expect.objectContaining({ rules: [{ id: 1, pointValue: 5.0 }] })
  );
});
```

---

### Tab Switching

```typescript
it('switches to Roster Config tab', async () => {
  const { getByRole, getByText } = render(
    <ScoringSettings />,
    { wrapper: withRouter }
  );

  const rosterTab = getByRole('tab', { name: /roster config/i });
  await userEvent.click(rosterTab);

  expect(getByText(/bench/i)).toBeInTheDocument(); // Roster config content
});

it('preserves unsaved changes when switching tabs', async () => {
  const { getByRole, getByDisplayValue } = render(
    <ScoringSettings />,
    { wrapper: withRouter }
  );

  // Edit a rule
  const input = getByDisplayValue('4.0');
  await userEvent.clear(input);
  await userEvent.type(input, '5.0');

  // Switch tabs
  const rosterTab = getByRole('tab', { name: /roster config/i });
  await userEvent.click(rosterTab);

  // Switch back
  const rulesTab = getByRole('tab', { name: /scoring rules/i });
  await userEvent.click(rulesTab);

  // Change should still be there
  expect(getByDisplayValue('5.0')).toBeInTheDocument();
});
```

---

## Test Execution Strategy

### Prerequisites (Blocking)

1. **Fix local Supabase migrations** (see `LOCAL_SUPABASE_SETUP.md` Option A)
   - Required to run integration tests against real DB
   - Estimated effort: 3-4 hours

2. **Verify Vitest/Jest are installed** in client/
   - Check `package.json` for `vitest` or `jest`
   - Add if missing

### Phase 3 Execution Order

```bash
# Step 1: Type checking
cd server && npx tsc --noEmit
cd ../client && npx tsc --noEmit

# Step 2: Backend unit tests (no DB needed)
cd ../server && npx vitest run server/src/services/__tests__/scoringEngine.test.ts

# Step 3: Backend integration tests (needs DB + migrations)
npx vitest run server/src/features/scoring/__tests__/routes.test.ts

# Step 4: Frontend component tests
cd ../client && npx vitest run client/src/features/commissioner/pages/__tests__/ScoringSettings.test.tsx

# Step 5: Full suite
npx vitest run
```

---

## Success Criteria

- ✅ All unit tests pass (pure functions)
- ✅ All integration tests pass (API endpoints with DB)
- ✅ All component tests pass (React rendering & interaction)
- ✅ Typecheck clean (0 errors)
- ✅ Coverage: `calculateNFLPoints`, `calculateNBACategories`, `compareNBACategories` at 90%+
- ✅ Coverage: Routes at 80%+ (happy path + auth checks)
- ✅ Coverage: Component at 70%+ (tabs, fetch, save flow)

---

## Deferred (Not High Priority)

- ❌ **E2E tests**: Feature works in prod; E2E not needed unless there's a regression pattern
- ❌ **Mock API fixtures**: Unit tests sufficient; use real Supabase in integration tests
- ❌ **Snapshot tests**: Component logic is simple; snapshots would be false confidence

---

## Notes for Next Session

1. **Start with migrations fix** (Option A) before running any tests
2. **Unit tests are safe to write now** (no DB) — they'd just fail at build-time due to import errors from the integration tests
3. **API endpoint tests are the most critical** — they validate the HTTP contracts
4. **Component tests catch UI regressions** — verify they reflect API shape changes
5. If local testing still blocked, consider writing tests in a feature branch and merging after migrations are fixed

---

## Related Documentation

- `docs/LOCAL_SUPABASE_SETUP.md` — How to fix migrations before tests can run
- `server/src/services/scoringEngine.ts` — Source file with JSDoc examples
- `server/src/features/scoring/routes.ts` — API endpoint definitions
- `client/src/features/commissioner/pages/ScoringSettings.tsx` — React component
