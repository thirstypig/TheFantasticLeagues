# Local Supabase Setup — Status & Next Steps

**Status:** ⚠️ **BLOCKED** — Migration chain has multiple missing tables/enums

**Session:** 2026-06-22  
**Commit:** a7b26b5 (ClaimStatus enum fix)

---

## What We Accomplished

✅ Set up local Supabase via CLI (`supabase start`)  
✅ Configured client/.env and server/.env to point to localhost  
✅ Fixed missing ClaimStatus enum (migration 20260311000000)  
✅ Identified remaining migration issues  

---

## Current Blocker

Migration chain is broken. Migrations apply successfully up to **20260312000000_add_cancelled_claim_status**, then fail on **20260421000000_roster_rules_foundation** with:

```
ERROR: relation "TransactionEvent" does not exist
```

### Root Cause
Multiple tables/enums are referenced in migrations but never created:
- ❌ TransactionEvent (referenced in 20260421+)
- ✅ ClaimStatus (fixed in 20260311000000)
- Likely others in the 20260313-20260421 range

---

## How to Resume

### Option A: Fix All Migrations (Comprehensive, 3-4 hours)

1. **Identify missing tables/enums:**
   ```bash
   grep -r "ALTER TABLE.*TransactionEvent" prisma/migrations/
   grep -r "CREATE TABLE.*TransactionEvent" prisma/migrations/
   ```

2. **For each missing table:**
   - Find which migration references it
   - Find which earlier migration should have created it
   - Create intermediate migration with CREATE TABLE statement

3. **Verify:** 
   ```bash
   cd thefantasticleagues-app
   supabase stop --no-backup
   rm -rf .supabase
   supabase start
   npx prisma migrate deploy
   ```

4. **Once migrations pass, seed test data:**
   ```bash
   npm run seed:staging
   ```

5. **Test the feature:**
   ```bash
   npm run dev
   # Navigate to http://localhost:3010/commissioner/1/scoring
   ```

### Option B: Skip Local Testing (Quick, 5 minutes)

1. Use prod Supabase for all development
2. Update .env to point to prod (already done)
3. Test on https://app.thefantasticleagues.com
4. Accept that local testing isn't available yet

### Option C: Use Prod Supabase Locally

1. Revert .env changes to point to prod
2. Run: `npm run dev` to start dev server
3. Test at http://localhost:3010 (connects to prod)
4. ⚠️ **WARNING:** Local writes go to prod database

---

## Configuration Reference

**Local Supabase URLs:**
- Project URL: http://127.0.0.1:54321
- Database: postgresql://postgres:postgres@127.0.0.1:54322/postgres
- Studio (GUI): http://127.0.0.1:54323

**.env Configuration:**
```
# Root .env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# client/.env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<run 'supabase status' to get this>

# server/.env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<run 'supabase status' to get this>
SUPABASE_SERVICE_ROLE_KEY=<run 'supabase status' to get this>
```

**To get actual keys:** Run `supabase status` in terminal (keys regenerate each time you start/stop)

---

## Feature Status

**Scoring Settings (Deliverable 3 & 4):** ✅ **COMPLETE**
- Commit: 859e1bc (Scoring Engine + API + UI)
- Status: Deployed to prod
- Testing: Works on https://app.thefantasticleagues.com
- Local testing: Blocked by migrations

---

## Next Session

1. Choose Option A, B, or C above
2. If Option A: Debug & fix remaining migrations (start with TransactionEvent)
3. If Option B/C: Skip this and move to next feature
4. Update this file with progress

**Related Files:**
- `prisma/migrations/` — All migration files
- `prisma/schema.prisma` — Current schema definition
- `.env` — Local config (points to localhost)
- `server/.env` — Server config (points to localhost)
- `client/.env` — Client config (points to localhost)
