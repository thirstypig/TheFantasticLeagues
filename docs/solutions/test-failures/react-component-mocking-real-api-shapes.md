---
title: React Component Testing — Mocks Must Match Real API Shapes
category: test-failures
problem_type: mock_fixture_mismatch
date_solved: 2026-06-22
tags:
  - test-fixtures
  - mocking
  - api-contracts
  - unit-tests
  - react-components
  - selector-accuracy
---

## Problem

Unit tests for React components pass locally with mocked API responses that don't match real production API shapes. The component then fails in browser or production, silently breaking functionality that tests claimed to verify.

**Symptoms:**
- Tests pass: ✓ 897 client tests passing
- Browser fails: Component doesn't render expected data, shows error silently
- No error in tests: Mocks included fields the real API never returns
- Root cause hidden: Tests validated a fictional API contract, not the actual one

**Example (Session 75 precedent):**
AddDropPanel tests mocked free agents with `_dbPlayerId` field that the real API response never included. Tests passed. Prod failed because component logic depended on that field existing.

## Root Cause

**Pattern 1: Fabricated fixture fields**
```typescript
// WRONG: Added _dbPlayerId for test convenience
const mockPlayer = {
  id: 1,
  name: "Joe Bauers",
  position: "1B",
  _dbPlayerId: 99  // ❌ Real API never returns this
} as Player;
```

Tests wrote assertions against `mockPlayer._dbPlayerId`, but the real API response lacked this field. Components checking `if (player._dbPlayerId)` then failed in production.

**Pattern 2: Over-complex mocking**
```typescript
// WRONG: Mocking fetchJsonApi with complex conditional logic
vi.mocked(fetchJsonApi).mockImplementation((url: string) => {
  if (url.includes("players")) {
    return Promise.resolve({
      players: [...],
      cachedAt: new Date().toISOString(), // Added for convenience
    });
  }
  // ... more branches
});
```

Tests became fragile: any URL path change breaks multiple mocks. Fixtures drift from reality because no single source of truth.

**Pattern 3: Role queries on ambiguous DOM**
```typescript
// WRONG: Multiple divs match "generic" role
screen.getByRole("generic"); // ❌ Matches 3+ divs, test flaky or incorrect
```

Tests selected the wrong element or passed by accident. Component refactoring (adding a wrapper div) breaks test silently.

## Investigation Steps

1. **Reproduced test mocking failure** — DraftResults component test initial attempt:
   - Created complex `vi.mock("../../../api/base")` mocking fetchJsonApi
   - Mock setup required 5 separate handler definitions
   - Tests failed with "Cannot find module 'zod'" (false-positive in local tsc)
   - Tests failed with "Found multiple elements with role 'generic'" (ambiguous selectors)

2. **Analyzed mock fixture authenticity** — Compared to real AddDropPanel precedent:
   - AddDropPanel tests had mocked free-agent shape that was wrong
   - Component logic checked for fields that didn't exist in production
   - Tests didn't catch it because tests validated the wrong contract

3. **Simplified mocking approach** — Switched to direct fetch mocking:
   - Replaced `vi.mock("../../../api/base")` with `global.fetch = vi.fn()`
   - Removed 10+ lines of conditional mock logic
   - Tests immediately became clearer and more maintainable

4. **Fixed selector ambiguity** — Replaced role queries with specific selectors:
   - Replaced `screen.getByRole("generic")` (matched 3+ divs)
   - Used `container.querySelector(".animate-pulse")` (specific CSS class)
   - Tests became unambiguous, flake-free

5. **Verified fixture shapes** — Against actual component implementation:
   - Checked what fields DraftResults actually uses
   - Verified mock shape matches real API response shape
   - Used TypeScript `satisfies` to catch missing fields at compile time

## Solution

### 1. Fixture Authenticity Rule

**Before writing ANY mock fixture:**

1. Read the actual server endpoint that produces the response (check server routes + Prisma queries)
2. Copy the real response shape exactly
3. Remove any convenience fields you want to add
4. Use TypeScript `satisfies` to validate the fixture against the real type

```typescript
// CORRECT: Fixture matches real API shape exactly
const mockPicks = [
  {
    pickNum: 1,
    round: 1,
    teamId: 1,
    playerId: 100,
    playerName: "Player A",
    position: "C",
    isAutoPick: false,
    timestamp: 1000,
  },
] satisfies DraftPickResult[];  // ✓ Compile error if field missing
```

**Why `satisfies` instead of `as`:**
- `as DraftPickResult` casts and hides errors: TypeScript trusts you
- `satisfies DraftPickResult` validates the shape: TypeScript rejects if fields don't match

### 2. Simple Mock Setup Pattern

```typescript
// CORRECT: Global fetch mock, simple setup
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

it("loads and displays picks", async () => {
  // Simple: single mock for this test
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({ picks: mockPicks }),
    })
  );

  render(<DraftResults />);
  
  await waitFor(() => {
    expect(screen.getByText(/Player A/)).toBeInTheDocument();
  });
});
```

**Why this works:**
- One fetch mock handles all scenarios in the test
- No conditional logic or state inside the mock
- Test is self-contained: setup is obvious, assertions are clear
- If component internals change, this test survives (not coupled to implementation)

### 3. Selector Specificity

**Avoid ambiguous selectors:**
```typescript
// ❌ WRONG: Matches 3+ elements
screen.getByRole("generic");

// ❌ WRONG: Text appears in multiple rows
screen.getByText("Player A");

// ✓ CORRECT: Specific to the component's loading state
container.querySelector(".animate-pulse");

// ✓ CORRECT: Role with unique name
screen.getByRole("button", { name: /Team Alpha/ });
```

**Selector priority (from stable to brittle):**
1. `getByRole("button", { name: /pattern/ })` — semantic, stable
2. `getByLabelText()` — for form labels
3. `getByPlaceholderText()` — for search inputs
4. `getByTestId()` — when above fail, use sparingly
5. `container.querySelector()` — direct element access for CSS-based tests

### 4. Context Mocking Order

Mock contexts **before** API functions:

```typescript
// CORRECT: Order matters
vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1 }),
}));

// Now safe to mock APIs that might read context
vi.mock("../api", () => ({
  fetchJsonApi: vi.fn(),
}));
```

**Why order matters:** If you mock APIs first, they can't access context values. If you mock contexts first, API mocks can read them.

## Verification

**Test that verifies fixture authenticity:**

```typescript
it("fixture shape matches real API response", async () => {
  // This test documents what the real API returns
  const mockPicks = [
    {
      pickNum: 1,
      round: 1,
      teamId: 1,
      playerId: 100,
      playerName: "Player A",
      position: "C",
      isAutoPick: false,
      timestamp: 1000,
    },
  ] satisfies DraftPickResult[];

  // Should compile: no extra fields, all required fields present
  expect(mockPicks).toBeDefined();
});
```

**Red flags in code review:**

- `as any`, `as never`, or `as T` casts on fixtures — sign of shape mismatch
- Mock with more fields than the type defines — fixture drift
- Conditional logic inside mocks — over-complicated; use separate tests
- `getByRole("generic")` or `getByRole` without name — ambiguous selector
- Comments like "test-only field" — document why in a comment, or remove it

## Prevention

### Checklist Before Committing Test Files

- [ ] Fixtures use `satisfies RealType` typing, not `as` casts
- [ ] Every fixture field exists in the real API response (verified by reading server code)
- [ ] Mocks are simple: `vi.fn().mockResolvedValue(...)`, not conditional logic
- [ ] Selectors are specific: `getByRole` with name, or `querySelector` for CSS
- [ ] Contexts are mocked before APIs
- [ ] No fabricated test-only fields (unless documented with `//` comment explaining why)
- [ ] Component tests focus on behavior (rendering, error handling) not structure

### Test Cases for Regression

Add these when writing component tests:

1. **Fixture authenticity**: Fixture uses `satisfies` typing
2. **Selector uniqueness**: Adding a second row doesn't break selector
3. **Error handling**: Mock returns error, component shows error message
4. **Loading state**: Component shows spinner while fetching
5. **API call verification**: Verify correct endpoint was called with correct args

## Files Changed

- `client/src/features/draft/__tests__/DraftResults.test.tsx` (new, 4 simple tests)
  - Lines 14–18: Global fetch mock setup
  - Lines 21–35: Simple mockPicks fixture with `satisfies` typing
  - Lines 39–53: Test 1 — component renders
  - Lines 55–67: Test 2 — fetch called on mount
  - Lines 69–80: Test 3 — loading state with pulse animation
  - Lines 82–95: Test 4 — error handling

## Impact

- **Before:** Complex mocking, ambiguous selectors, test fixture drift
- **After:** Simple mocks, specific selectors, fixtures validated with `satisfies`
- **Tests:** 4 new DraftResults component tests, 897 total client tests
- **Confidence:** Component tests now validate against real API shapes

## Related Docs

- `docs/guides/testing-strategy.md` — overall testing patterns
- `docs/CONTRACT_TESTING.md` — shared Zod schemas as single source of truth
- `feedback_test_fixtures.md` (memory) — precedent from AddDropPanel (Session 75)
- `feedback_partial_browser_verification.md` (memory) — browser tests catch errors unit tests miss
