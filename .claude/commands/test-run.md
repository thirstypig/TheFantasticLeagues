Run the full test dance (typecheck → unit/integration → E2E) and report cleanly.

## Steps

Run these in sequence. Stop at the first failure — don't mask errors by continuing.

1. **Typecheck (parallel):**
   - `cd client && npx tsc --noEmit`
   - `cd server && npx tsc --noEmit`

2. **Unit + integration (server and client):**
   - `npm run test` (runs server then client; ~10s total)
   - Report: `<server-passed> server + <client-passed> client, <skipped> skipped`

3. **E2E (optional — only if `$ARGUMENTS` contains `e2e` OR the arg is empty):**
   - Verify dev servers: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3010` and `http://localhost:4010/api/health`. Both must be 200.
   - If either is down: tell the user which one, don't try to start it yourself.
   - If both up: `cd client && npx playwright test`. Report time per spec + total.

## Report format

Keep it terse. Aim for this shape:

```
✓ tsc client  (0.8s)
✓ tsc server  (1.1s)
✓ 571 server + 201 client   (7.4s)
✓ 1 E2E       (29.6s)
Total: 773 tests green
```

On failure:
```
✗ <where> — <file:line>: <assertion>
<next steps — one sentence>
```

## Arguments

- `/test-run` — typecheck + unit/integration (no E2E). Fast — use before commits.
- `/test-run e2e` — full dance including E2E. Use before push.
- `/test-run <feature>` — typecheck + `/feature-test <feature>` only. Use during iteration on one feature.

## Guardrails

- **Don't skip on "known flakes."** Flakes are bugs — report them honestly.
- **Don't retry automatically.** If the first run fails, show the failure. Let the user decide whether to retry.
- **Never suppress output to make things look clean.** Tail + summarize is fine; silently swallowing errors is not.
