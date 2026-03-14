# How-To Guides

Practical step-by-step guides for common FBST tasks. For architecture reference, see `CLAUDE.md`. For decision rationale, see `decisions.md`.

---

## Add a New Feature Module

1. Create server directory:
   ```
   server/src/features/<name>/
   ├── routes.ts      # Express router (named export: <name>Router)
   ├── index.ts       # Re-exports router
   └── __tests__/     # Unit tests
   ```

2. Create client directory:
   ```
   client/src/features/<name>/
   ├── pages/         # Page components (default exports)
   ├── components/    # Feature-specific components
   ├── api.ts         # API client using fetchJsonApi()
   └── index.ts       # Re-exports pages
   ```

3. Mount router in `server/src/index.ts`:
   ```ts
   import { nameRouter } from "./features/name/index.js";
   app.use("/api/name", nameRouter);
   ```

4. Add routes in `client/src/App.tsx`:
   ```tsx
   import NamePage from "./features/name/pages/NamePage";
   <Route path="/name" element={<NamePage />} />
   ```

5. Add API re-exports to `client/src/api/index.ts` if other features need them.

6. Document cross-feature imports in `CLAUDE.md` if any exist.

---

## Import Archive Data (Historical Season)

1. Prepare an Excel file matching the expected format (see `docs/archive_standards.md`).

2. Upload via the Archive page (admin only) or use the API directly:
   ```bash
   curl -X POST http://localhost:4010/api/archive/2025/import-excel \
     -H "Authorization: Bearer $TOKEN" \
     -F "file=@Fantasy_Baseball_2025.xlsx"
   ```

3. After import, run sync to populate computed stats:
   ```bash
   curl -X POST http://localhost:4010/api/archive/2025/sync \
     -H "Authorization: Bearer $TOKEN"
   ```

4. Check for unmatched players in the response — these need manual name mapping.

---

## Run an Auction Draft

1. Ensure the season is in `DRAFT` status (Commissioner > Season Manager > advance to DRAFT).

2. Navigate to `/auction`. The page auto-initializes the auction server for your league.

3. **Nomination phase**: When it's your turn, click "Bid" next to a player in the Player Pool tab, or use your personal nomination queue.

4. **Bidding phase**: Other teams can bid. Timer counts down — highest bid when timer expires wins.

5. The auction cycles through teams for nominations until all roster slots are filled.

6. Use the Player Pool tab's "Avail" toggle to filter to undrafted players only.

---

## Propose and Process a Trade

1. Navigate to `/trades` and click "Propose Trade".

2. Select the trade partner team, then pick players/picks from each side using the asset selector.

3. Submit the trade — status becomes `PROPOSED`.

4. The other team's owner votes to accept or reject.

5. Once accepted (`ACCEPTED`), a commissioner can:
   - **Process** — executes the trade (moves players, adjusts budgets)
   - **Veto** — blocks the trade, sets status to `VETOED`

6. The proposer or commissioner can **Cancel** any `PROPOSED` trade.

---

## Manage Season Lifecycle

Seasons progress through: `SETUP` → `DRAFT` → `IN_SEASON` → `COMPLETED`

1. **SETUP**: Configure league rules, set rosters. Rules are editable.
2. **DRAFT** (transition auto-locks rules): Run auction draft or manual draft.
3. **IN_SEASON**: Regular season play. Trades, waivers, and add/drops are active.
4. **COMPLETED**: Season is archived. No further changes.

Use Commissioner > Season Manager to advance between phases. Each transition has validation (e.g., DRAFT requires rules to be set).

---

## Add a Write Endpoint (POST/PATCH/DELETE)

All write endpoints must follow this middleware pattern:

```ts
router.post(
  "/resource",
  requireAuth,                          // Always first
  validateBody(createResourceSchema),   // Zod validation
  requireLeagueRole("COMMISSIONER"),    // Authorization
  asyncHandler(async (req, res) => {
    // Handler logic
  })
);
```

**Exception**: When authorization reads from `req.body` (e.g., `requireTeamOwner("proposerTeamId")`), validation must run first so the body is parsed.

---

## Run Tests

```bash
# All tests (from root)
npm run test

# Server only
npm run test:server

# Client only
npm run test:client

# Single feature
cd server && npx vitest run src/features/trades/__tests__/

# Watch mode
npx vitest --watch
```

Always run tests before committing. Check both `tsc --noEmit` (client and server) for type errors.

---

## Set Up Dev Login

For local development without OAuth:

1. Set env vars in `server/.env`:
   ```
   ENABLE_DEV_LOGIN=true
   DEV_LOGIN_PASSWORD=devpass123!
   ```

2. The login page shows a "Dev Login" button that calls `POST /api/auth/dev-login`.

3. Server finds the first admin user, sets their Supabase password, and returns `{email, password}`.

4. Client auto-fills and signs in with those credentials.

---

## Add a UI Component

1. Check if a shadcn-style primitive exists in `client/src/components/ui/`.
2. Use `--lg-*` CSS custom properties for all colors — never hardcode `bg-slate-*` or `bg-gray-*`.
3. For tables, use `ThemedTable`, `ThemedThead`, `ThemedTh`, `ThemedTr`, `ThemedTd` from `components/ui/ThemedTable`.
4. For themed cards, use the `lg-card` class.
5. Support both light and dark mode — test both before committing.
