# Feedback Loop & Session Checklists

## Purpose

Maintain a structured feedback loop between development sessions to ensure continuity, catch regressions, and improve code quality over time.

## Session Start Checklist

When starting a new session, review these items:

1. **Read `CLAUDE.md`** — confirms current architecture and conventions
2. **Check `FEEDBACK.md`** — review any open items from previous sessions
3. **Run `npm run test`** — verify all tests pass before making changes
4. **Run `git log --oneline -10`** — understand recent changes
5. **Check for open TODOs** — `grep -r "TODO\|FIXME\|HACK" server/src/ client/src/ --include="*.ts" --include="*.tsx" | head -20`

## Browser Verification (MANDATORY after every code change)

After ANY code change — before declaring "done" or moving to the next task:

1. **Open affected page** in Playwright browser
2. **Interact with the changed feature** — click, select, submit, not just look
3. **Verify persistence** — reload the page, confirm the change survived
4. **Check adjacent features** — if you changed position handling, verify dropdowns, sort, AND eligibility still work
5. **Check for cron/background job conflicts** — if the changed data is also modified by daily syncs, verify the sync won't overwrite your change

## Session End Checklist

Before ending a session:

1. **Run tests** — `npm run test` must pass
2. **Run builds** — `cd client && npx tsc --noEmit` and `cd server && npx tsc --noEmit`
3. **Browser smoke test** — open the app in Playwright, navigate to pages touched this session, verify no regressions
4. **Update `FEEDBACK.md`** — log what was done, what's pending, any concerns
5. **Update `CLAUDE.md`** — if architecture or conventions changed
6. **Commit with descriptive message** — include scope of changes

## FEEDBACK.md Format

```markdown
## Session [DATE]

### Completed
- [ item ]

### Pending / Next Steps
- [ item ]

### Concerns / Tech Debt
- [ item ]

### Test Results
- Server: X passing, Y failing
- Client: X passing, Y failing
```

## Continuous Improvement Signals

Track these metrics across sessions:

- **Test coverage trend** — are new features being tested?
- **Build errors** — are pre-existing TypeScript errors being resolved?
- **Cross-feature dependencies** — are they growing? Should modules be refactored?
- **Import path consistency** — all Prisma imports from `db/prisma.ts`, all routers named exports
- **Feature module completeness** — does each module have tests, proper index.ts, types?
