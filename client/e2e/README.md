# E2E tests

Playwright-based end-to-end tests for TFL. Run against real dev servers (Vite on `:3010`, Express on `:4010`).

## Running

```bash
# Both dev servers must be up (npm run server + npm run dev from repo root)
cd client
npm run test:e2e        # headless
npm run test:e2e:ui     # interactive UI mode
```

## Writing tests

- Use the `loginViaDev` helper in `helpers/auth.ts` — it clicks the Dev Login button and waits for the dashboard.
- Prefer role-based locators (`getByRole`, `getByLabel`) over CSS selectors. They survive redesigns.
- Keep each spec focused on one user journey. Long orchestration belongs in helpers.
- Do **not** share state across tests. Each `test()` starts from a fresh browser context.

## Scope

E2E tests are expensive to maintain — only write them for the flows that cost real money if they break:

- Auction draft (claiming players, budget enforcement)
- Trade processing (atomic player + budget movement)
- Waiver claims (FAAB ordering, drop-add flow)
- Roster lock/unlock
- Watchlist round-trip (starred on Players appears on Add/Drop, survives reload)

For everything else, prefer unit or integration tests — they're 10× cheaper.
