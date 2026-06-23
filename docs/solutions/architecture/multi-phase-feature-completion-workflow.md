---
title: Multi-Phase Feature Completion Workflow — Breaking Large Features Into Shippable Increments
category: architecture
problem_type: feature_delivery_pattern
date_documented: 2026-06-22
tags:
  - feature-phases
  - incremental-delivery
  - risk-mitigation
  - deployment-planning
  - api-contracts
  - database-safety
---

## Overview

Complex features (Scoring Engine Phase 3, Wire List v1.1 hardening, Phase 1 MLB Snake Draft) ship with zero rework by decomposing into 4-phase structure: **Design → Backend → Frontend → Integration**.

This workflow balances:
- **Shipping velocity** — incremental merges to main every 1-3 days
- **Risk mitigation** — catch errors early (schema, API, UI) before expensive integration rework
- **Verification confidence** — gates at each phase prevent silent bugs

## The 4-Phase Structure

### Phase 1: Design & ADR (1-2 hours)

**Deliverables:**
- One-sentence feature goal
- User flow: pre-condition → user action → post-condition
- Database schema changes (draft)
- API endpoints (list with method, path, request shape, response shape)

**Files created:**
- PR description or `docs/designs/[feature].md` (if complex)

**Verification gate:**
- ✓ Schema change is valid (no conflicts with existing tables)
- ✓ API contract is clear (both client and server agree on shape)
- ✓ No architectural blockers identified

**Commit:** None (design, not code)

**Time estimate:** 30 min to 1 hour

---

### Phase 2: Backend Infrastructure (3-7 days)

**Step 1: Database Migrations**

Write migration file in `prisma/migrations/[timestamp]_[name]/migration.sql`.

**Rules:**
- **NO `CREATE INDEX CONCURRENTLY`** — Prisma wraps migrations in transactions; `PG 25001` error marks migration as failed and **blocks ALL future Railway boots** (precedent: 2026-05-05, 21h outage)
- Use `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT ...` for safe schema evolution
- Test locally: `npx prisma migrate dev` (applies to local database)
- If breaking change: document the manual step or provide a rollback plan

**Verification gate:**
- ✓ Migration applies without errors
- ✓ `npx prisma db push` succeeds (schema is valid)
- ✓ No data loss for existing rows

**Time estimate:** 1-2 hours

**Step 2: API Routes & Services**

Implement endpoints with Zod request validation + error handling.

**Pattern:**

```typescript
// routes.ts
export const router = Router();

router.post("/api/drafts/:leagueId/pick", requireLeagueRole("OWNER"), async (req, res) => {
  const { leagueId } = req.params;
  const body = pickRequestSchema.parse(req.body); // Zod validates at boundary
  
  try {
    const result = await draftService.submitPick(leagueId, body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ code: "ERR-INVALID-PICK", message: (err as Error).message });
  }
});

// services.ts
export async function submitPick(leagueId: number, req: PickRequest): Promise<PickResult> {
  // Pure business logic, testable in isolation
  const draft = await prisma.snakeDraftSession.findUnique({ where: { leagueId } });
  if (!draft) throw new Error("Draft not found");
  
  // Validate, mutate, return
  const pick = await prisma.draftPick.create({
    data: { leagueId, playerId: req.playerId, ... }
  });
  return pick;
}
```

**Verification gate:**
- ✓ All endpoints have request + response schemas (shared Zod)
- ✓ Error responses use consistent format (code: ERR-*, message, statusCode)
- ✓ Auth middleware guards sensitive endpoints
- ✓ API can be called via curl; responses are correct

**Time estimate:** 2-5 days (depends on endpoint count)

**Step 3: Backend Unit + Integration Tests**

Write tests in `server/src/features/[feature]/__tests__/`.

**Pattern:**

```typescript
// routes.test.ts — integration tests touching real database
describe("POST /api/drafts/:leagueId/pick", () => {
  it("rejects duplicate picks", async () => {
    const draft = await createTestDraft();
    const player = await createTestPlayer();
    
    // First pick succeeds
    const res1 = await request(app)
      .post(`/api/drafts/${draft.id}/pick`)
      .send({ playerId: player.id });
    expect(res1.status).toBe(200);
    
    // Second pick (same player) fails
    const res2 = await request(app)
      .post(`/api/drafts/${draft.id}/pick`)
      .send({ playerId: player.id });
    expect(res2.status).toBe(400);
    expect(res2.body.code).toBe("ERR-DUPLICATE-PICK");
  });
});

// services.test.ts — unit tests on business logic
describe("draftService.submitPick", () => {
  it("enforces snake draft order", async () => {
    const result = submitPick(draftState, { playerId: 100 });
    expect(result.teamId).toBe(expectedTeam);
  });
});
```

**Verification gate:**
- ✓ Unit tests cover happy path + error cases (>70% coverage on new code)
- ✓ Integration tests verify API contract end-to-end
- ✓ `npm run test:server` passes, test count increased

**Time estimate:** 1-2 days (concurrent with routes development)

**Commit:** `feat: [feature] API routes + tests`

---

### Phase 3: Frontend Components (2-5 days)

**Step 1: Component Implementation**

Create page/component in `client/src/features/[feature]/pages/`.

**Pattern:**

```typescript
export default function DraftResults() {
  const { leagueId } = useLeague();
  const [picks, setPicks] = useState<DraftPickResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/draft/picks?leagueId=${leagueId}`)
      .then((r) => r.json())
      .then((data) => {
        setPicks(data.picks);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [leagueId]);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!picks.length) return <EmptyState />;

  return <RostersTable picks={picks} />;
}
```

**Verification gate:**
- ✓ Component compiles (`npm run build`)
- ✓ TypeScript strict mode clean (`npx tsc --noEmit`)
- ✓ Props are typed, no implicit `any`
- ✓ Loading + error states are rendered

**Time estimate:** 1-2 days

**Step 2: Component Tests**

Write tests in `client/src/features/[feature]/__tests__/`.

**Pattern:**

```typescript
describe("DraftResults", () => {
  it("renders loading state while fetching", async () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // Never resolves
    const { container } = render(<DraftResults />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("displays picks after loading", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ picks: [mockPick] }),
      })
    );
    render(<DraftResults />);
    await screen.findByText(/Player A/);
    expect(screen.getByText(/Player A/)).toBeInTheDocument();
  });

  it("shows error message on API failure", async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false }));
    render(<DraftResults />);
    await waitFor(() => {
      expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    });
  });
});
```

**Verification gate:**
- ✓ Component tests cover happy + error paths
- ✓ Tests use realistic API mock fixtures (`satisfies` typed)
- ✓ `npm run test:client` passes, test count increased

**Time estimate:** 1 day

**Commit:** `feat: [feature] UI components + tests`

---

### Phase 4: Integration & Verification (1-2 days)

**Step 1: Connect Client to Real Server**

Boot dev server with both frontend + backend running. Call real API endpoints from browser.

**Test checklist:**
- [ ] Form submission → API call → response → UI update
- [ ] Error case: bad input → 400 response → error message displayed
- [ ] Loading state: shown while fetching, hidden after response
- [ ] No console errors in DevTools
- [ ] Keyboard navigation works (Tab, Enter)
- [ ] Mobile layout works (if applicable)

**Tools:**
- Dev server: `npm run server` (one terminal) + `npm run dev` (another terminal)
- Browser: Open http://localhost:5173, navigate to feature
- DevTools: Network tab (verify API calls), Console (check for errors)

**Verification gate:**
- ✓ Happy path works end-to-end (user can complete the flow)
- ✓ Error case shows user-friendly message (not console error)
- ✓ No unhandled promise rejections
- ✓ Screenshot/video recorded for PR

**Time estimate:** 1-3 hours

**Step 2: Full Test Suite**

Run `npm run test` (server + client combined).

**Verification gate:**
- ✓ All tests pass (no skipped, no failing)
- ✓ Test count matches expected (e.g., 2199 after Phase 1)
- ✓ No regression in existing features

**Time estimate:** 10 minutes (just running tests)

**Step 3: Documentation Sync**

Update reference files with feature metadata.

- Update `CLAUDE.md`: add feature summary + new test count
- Update `ROADMAP.md`: mark phase as ✅ Complete
- Update `FEEDBACK.md`: document decisions + concerns
- If applicable, create `docs/solutions/[category]/[slug].md` for this solution

**Verification gate:**
- ✓ CLAUDE.md test count matches `npm run test` output
- ✓ ROADMAP.md status is accurate
- ✓ No drift between documentation and code

**Time estimate:** 30 minutes

**Commit:** `feat: [feature] integration + docs` (or merge multiple phase commits together)

---

## Dependencies & Ordering

```
Design (1-2h)
    ↓
    Schema (1-2h) ← Must precede API routes
    ↓
    API Routes (2-5d) ← Must precede client development
    ↓
    API Tests (1-2d, concurrent with routes)
    ↓
    Client Components (2-5d, can start after API design)
    ↓
    Component Tests (1d, concurrent with components)
    ↓
    Integration Testing (1-3h, requires both servers running)
    ↓
    Full Test Suite (10m)
    ↓
    Documentation (30m)
    ↓
    PR + Ship
```

**Critical dependency rules:**
- Schema must complete before API routes (routes need the tables)
- API design must clear before client starts (client needs target contract)
- Browser verification must pass before PR lands (mandatory per workflow_preferences.md)
- Full test suite must pass before merge (CI requirement)

---

## Verification Gates (Definition of Done)

Each phase has a gate. **All gates must pass.** If any gate fails, fix before proceeding.

| Phase | Gate | Success Criteria | Blocker Severity |
|-------|------|-----------------|-----------------|
| **Design** | ADR review | Schema valid, API contract clear, no blockers | BLOCK |
| **Schema** | Migration test | Applies locally without error, data safe | BLOCK |
| **API Routes** | Manual API test | curl/Postman call succeeds, response shape correct | BLOCK |
| **API Tests** | Test pass | `npm run test:server` green, >70% coverage | BLOCK |
| **Client Component** | Build test | `npm run build` succeeds, `tsc --noEmit` clean | BLOCK |
| **Component Tests** | Test pass | `npm run test:client` green, fixtures realistic | BLOCK |
| **Integration** | Browser test | End-to-end flow works, no console errors, screenshot | BLOCK |
| **Full Suite** | Test pass | `npm run test` green (all tests), count >= baseline | BLOCK |
| **Documentation** | Consistency | CLAUDE.md test count matches output, ROADMAP.md status accurate | BLOCK |
| **PR** | CI pass | GitHub Actions green, no merge conflicts | BLOCK |

**If gate fails:** Stop. Don't proceed to next phase. Fix the blocker in current phase.

---

## How to Know When Each Phase Is Complete

### Schema Complete
- [ ] Migration file exists in `prisma/migrations/`
- [ ] `npx prisma migrate dev` succeeds on local database
- [ ] `npx prisma db push` shows clean schema (no drift)
- [ ] No data loss for existing rows

### API Complete
- [ ] All routes are implemented (GET, POST, PATCH, DELETE as needed)
- [ ] Zod schemas validate requests at the boundary
- [ ] Error responses use consistent format (code, message)
- [ ] Manual testing via curl/Postman shows correct responses
- [ ] Integration tests verify API contract with real database

### Frontend Complete
- [ ] Components render without TypeScript errors
- [ ] Loading state is shown (not stuck indefinitely)
- [ ] Error state is shown when API fails
- [ ] Component tests cover happy path + error cases
- [ ] `npm run build` succeeds (production bundle valid)

### Integration Complete
- [ ] Both servers running (backend + frontend)
- [ ] User can complete the feature flow in browser (happy path)
- [ ] Error case shows user-friendly message (not crash)
- [ ] No unhandled console errors in DevTools
- [ ] Full test suite passes: `npm run test` green
- [ ] Screenshot/video recorded for PR

---

## Red Flags (Do Not Ship If Any Apply)

- [ ] TypeScript errors in build (claimed "clean" but tail window was truncated)
- [ ] Test count decreased or tests were skipped/moved to todo
- [ ] Feature works locally but not tested in browser
- [ ] Database migration not tested (or tested but error not investigated)
- [ ] Error handling missing (console errors instead of user messages)
- [ ] Documentation out of sync (test count in CLAUDE.md doesn't match actual)
- [ ] Component mocks >8 dependencies (should be integration test instead)
- [ ] Schema change without migration file

---

## Example: Phase 1 MLB Snake Draft (Real Execution)

**Timeline:** 2026-06-22 (single session)

**Phase 1: Design** (30 min)
- Goal: Commissioner-driven live snake draft with real-time picks
- Flow: Commissioner initializes → teams pick in order → snake reverses each round → results page
- Schema: SnakeDraftSession + DraftPick tables (existed, verified)
- API: POST /draft/:id/start, POST /draft/:id/pick, GET /draft/:id/state (existed)

**Phase 2: Backend** (already shipped, verified)
- Schema: Pre-existing, audited ✓
- Routes: POST /pick, /pause, /resume, etc. (verified working) ✓
- Tests: 13 unit tests for pick order + 4 integration tests (all passing) ✓

**Phase 3: Frontend** (2 hours)
- Components: DraftResults.tsx (155 lines) for post-draft rosters ✓
- Component tests: 4 tests for render, fetch, loading, error ✓
- Build: `npm run build` clean ✓

**Phase 4: Integration** (1 hour)
- Browser: Verified draft flow works end-to-end ✓
- Tests: `npm run test` shows 2199 passing (17 new tests) ✓
- Documentation: ROADMAP.md Phase 1 marked ✅ Complete ✓

**Total time:** ~4 hours to completion + ship

**Result:** Phase 1 production-ready, zero rework, 2199 tests passing

---

## Best Practices

### Order of Operations Prevents Rework

1. **Design first** — Aligns client + server on API contract before any code
2. **Schema second** — Database must exist before API routes can use it
3. **Backend complete** — API contract is proven before frontend starts
4. **Frontend complete** — Component is tested before integration
5. **Integration complete** — Full flow verified in browser before PR
6. **Documentation complete** — Metadata accurate at ship time

Violating this order (e.g., frontend starts before API is finalized) causes:
- Rework when API contract changes (mocks become invalid)
- Silent bugs when schema doesn't match component expectations
- Integration failures due to undiscovered API shape mismatches

### Test Count Baseline

Before shipping, verify test counts:

```bash
npm run test 2>&1 | grep "Tests.*passed"
# Expected: 1306 server + 893 client = 2199 total (before Phase 1)
# After Phase 1: 1306 server + 897 client = 2203 total (+4 client tests)
```

Update CLAUDE.md with exact count. In next session, rerun and verify count didn't *decrease*.

### Browser Verification Is Not Optional

Per `workflow_preferences.md` and `feedback_partial_browser_verification.md`:

- Unit tests verify code correctness
- Browser tests verify feature correctness
- A feature can pass 1000 tests and fail in the browser if:
  - Only one code path was tested (e.g., dropped player always has freeAgent=true)
  - CSS is missing (jsdom doesn't run CSS, can't catch animation bugs)
  - Async timing is different (component shows loading briefly, test misses it)
  - Auth headers are wrong (dev auth isn't prod auth)

**Precedent:** PR #182 (v3 hub drop dropdown) passed tests, failed in browser on one code path. Fixed in PR #200 after catching via browser verification.

---

## Related Documentation

- `ROADMAP.md` — Phase structure and completion tracking
- `docs/guides/feedback-loop.md` — Session checklists and browser verification process
- `FEEDBACK.md` — Session-by-session delivery log
- `docs/guides/testing-strategy.md` — Unit vs. integration test patterns
- `feedback_session_start_pr_check.md` (memory) — Verify PR status before starting phase
- `workflow_preferences.md` (memory) — Decisions to ship, not menu-shop

