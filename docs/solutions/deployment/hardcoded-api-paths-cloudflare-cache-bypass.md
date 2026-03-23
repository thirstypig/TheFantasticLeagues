---
title: "Hardcoded API paths bypass API_BASE, causing Cloudflare cache misrouting"
category: deployment
problem_type: production_incident
component: global
tags:
  - api-routing
  - cloudflare
  - cdn
  - environment-variables
  - production
module: global
severity: critical
root_cause: hardcoded_paths
symptom: "API responses return HTML instead of JSON; auction state empty despite valid server data"
date: 2026-03-22
time_to_resolve: 45_minutes
---

# Hardcoded API paths bypass API_BASE, causing Cloudflare cache misrouting

## Problem Statement

In production, 7 client components used hardcoded `/api/` paths instead of the `${API_BASE}` constant. This caused API requests to resolve through Cloudflare (the custom domain) instead of directly to Render, where Cloudflare cached the responses as HTML from the SPA catch-all route.

**Visible symptom:** Auction page showed 0 teams despite the server having valid auction state. API responses returned HTML instead of JSON.

---

## Root Cause Analysis

### Environment Setup (Correct)

Production Render deployment uses a CDN architecture:
- **User domain:** `https://thefantasticleagues.com` (Cloudflare custom domain, proxies to Render)
- **API domain:** `https://fbst-api.onrender.com` (direct Render URL, bypasses Cloudflare)
- **WebSocket domain:** `https://fbst-api.onrender.com` (same as API)

Client code should use `API_BASE = https://fbst-api.onrender.com` to bypass Cloudflare for API calls.

### What Went Wrong

7 components used hardcoded paths:

| Component | Hardcoded Paths | Count |
|-----------|-----------------|-------|
| `useAuctionState.ts` | `/api/auction/state`, `/api/auction/nominate`, `/api/auction/bid`, `/api/auction/proxy-bid`, `/api/auction/force-assign`, `/api/auction/pause`, `/api/auction/resume`, `/api/auction/reset`, `/api/auction/finish` | 9 |
| `TeamListTab.tsx` | `/api/teams/${teamId}/roster/${rosterId}` | 1 |
| `RosterControls.tsx` | `/api/commissioner/${leagueId}/roster/assign` | 1 |
| `RosterGrid.tsx` | `/api/commissioner/${effectiveLeagueId}/roster/release` | 1 |
| `RosterManagementForm.tsx` | `/api/roster/add-player`, `/api/roster/${id}` | 2 |
| `TransactionsPage.tsx` | `/api/transactions/claim` | 1 |
| **Total** | | **15 paths** |

### Why This Broke Things

When the browser makes a request to `/api/auction/state`:

1. **With hardcoded path:** Browser resolves to `https://thefantasticleagues.com/api/auction/state` (same origin as current page)
2. Cloudflare intercepts the request and caches the response
3. Express Server Behind Cloudflare receives the request and serves the correct JSON response
4. Cloudflare caches it
5. On the **second** request (or after a brief interval), Cloudflare serves the cached response
6. **But Cloudflare misattributed the content type.** The SPA catch-all route (`*`) returns HTML. On rare occasions, the cache key collides with the SPA, and Cloudflare serves HTML instead of JSON.

When the browser makes a request to `${API_BASE}/auction/state`:

1. **With API_BASE:** Browser resolves to `https://fbst-api.onrender.com/api/auction/state` (different origin)
2. Browser makes a **cross-origin** request
3. Cloudflare never sees it; it goes straight to Render
4. Cloudflare does not cache it (different origin, different server)
5. Responses are always fresh, always correct content-type

### Why It Wasn't Caught Earlier

- **Localhost development works:** Vite proxies `/api` to `http://localhost:4010`, so hardcoded paths worked fine during development.
- **Cloudflare caching is non-deterministic:** The issue only manifested intermittently when Cloudflare decided to serve the cached response.
- **The bug only appeared in production:** Localhost, staging, and test environments don't have Cloudflare, so the hardcoded paths worked fine.
- **Tests don't validate API paths:** Unit and integration tests mock `fetchJsonApi()` — they don't verify that the URL is correct.

---

## The Fix

### Code Changes

**`client/src/features/auction/hooks/useAuctionState.ts`**
```typescript
// BEFORE
import { fetchJsonApi } from '../../../api/base';
const data = await fetchJsonApi<ClientAuctionState>(`/api/auction/state?leagueId=${lid}`);

// AFTER
import { fetchJsonApi, API_BASE } from '../../../api/base';
const data = await fetchJsonApi<ClientAuctionState>(`${API_BASE}/auction/state?leagueId=${lid}`);
```

All 9 paths in this file were updated.

**Other files:** Same pattern — import `API_BASE` and wrap all hardcoded paths with `${API_BASE}`.

### Additional Safety Net: Refetch on WebSocket Connect

```typescript
ws.onopen = () => {
    stopPolling();
    fetchState(); // <-- Re-fetch state on connect to ensure we have latest
    // ... rest of onopen logic
};
```

If the initial HTTP fetch fails or returns stale data, the client re-fetches when WebSocket connects. This is a safety net against cache bypass issues.

### What NOT to Do

Do NOT try to fix this by configuring Cloudflare caching:
- ❌ Set Cloudflare to cache API responses (defeats the purpose; APIs change frequently)
- ❌ Add `/api/*` to "Cache Everything" rule (same issue)
- ❌ Set very short cache TTL (still causes brief stale-data windows)

The correct fix is to **bypass Cloudflare entirely for API calls**.

---

## How API_BASE is Determined

In `client/src/api/base.ts`:

```typescript
export const API_BASE = ((): string => {
  // Running in browser?
  if (typeof window === 'undefined') return '/api';

  // In production (thefantasticleagues.com), route to Render API domain
  if (window.location.hostname === 'thefantasticleagues.com') {
    return 'https://fbst-api.onrender.com';
  }

  // In dev/staging, use relative path (Vite proxies to localhost:4010)
  return '/api';
})();
```

This logic runs once at module load, so `API_BASE` is a constant throughout the app.

### If You Change the Production Domain

Update **three places**:

1. **API_BASE check** in `client/src/api/base.ts`
   ```typescript
   if (window.location.hostname === 'mynewdomain.com') {
     return 'https://fbst-api.onrender.com';
   }
   ```

2. **WebSocket host check** in `client/src/features/auction/hooks/useAuctionState.ts`
   ```typescript
   const host = window.location.hostname === 'mynewdomain.com'
       ? 'fbst-api.onrender.com'
       : window.location.host;
   ```

3. **CSP wss: rule** in `server/src/index.ts`
   ```typescript
   connectSrc: [
     "wss://mynewdomain.com",  // <-- Update here
     // ... other origins
   ],
   ```

---

## Prevention Strategy

### Code Review Checklist

Before every commit:

```bash
# Find all hardcoded /api/ paths
grep -rn "'/api/" client/src --include="*.tsx" --include="*.ts" | grep -v "test"
```

Any result should be a false positive (from comments, test data, etc.). If you see actual hardcoded paths, it's a bug.

### Lint Rule (Future)

Consider adding an ESLint rule to flag hardcoded `/api/` strings:

```javascript
// .eslintrc.js
{
  rules: {
    'no-hardcoded-api-paths': {
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value === 'string' && node.value.startsWith('/api/')) {
              context.report({
                node,
                message: "Use ${API_BASE} instead of hardcoded /api/ paths",
              });
            }
          },
        };
      },
    },
  },
}
```

### Testing

Add a test that verifies API paths work with different `API_BASE` values:

```typescript
// client/src/api/__tests__/base.test.ts
describe('fetchJsonApi respects API_BASE', () => {
  it('constructs URLs correctly when API_BASE is set', async () => {
    // Mock API_BASE
    const originalBase = window.location.hostname;
    // Test that fetchJsonApi('${API_BASE}/foo') uses the correct base
    // (This requires some refactoring to make API_BASE injectable)
  });
});
```

---

## Impact Analysis

### Files Affected (Commits a510daf, b43ce0b)
- `client/src/features/auction/hooks/useAuctionState.ts` (9 paths)
- `client/src/features/auction/components/TeamListTab.tsx` (1 path)
- `client/src/features/roster/components/RosterControls.tsx` (1 path)
- `client/src/features/roster/components/RosterGrid.tsx` (1 path)
- `client/src/features/roster/components/RosterManagementForm.tsx` (2 paths)
- `client/src/features/transactions/pages/TransactionsPage.tsx` (1 path)

### Deployment Impact
- **Production:** Critical (auction broken)
- **Staging/Local:** Not affected (no Cloudflare)
- **Backward Compatibility:** None (API endpoints unchanged, only client-side routing fixed)

### Test Coverage
- All 710 existing tests pass
- New safety net: `fetchState()` on WebSocket connect (covers network failure scenarios)

---

## Key Learnings

1. **Hardcoded paths break in production.** Environment-specific variables (API domains, origins) must ALWAYS be computed at runtime, not hardcoded.

2. **Relative paths work in dev but not in production CDN scenarios.** When you have multiple origins (user domain vs. API domain), you need absolute URLs or a well-defined `API_BASE` constant.

3. **Cloudflare caching is silent.** There are no error messages when Cloudflare serves stale/incorrect content. You have to actively test API responses.

4. **Cross-origin requests bypass CDN caches.** When `fetch()` makes a request to a different domain, Cloudflare doesn't see it. This is a feature for performance (direct to backend).

5. **Tests don't catch environment-specific bugs.** Unit tests with mocked `fetch()` will pass even if the URL is wrong. You need integration tests or production testing.

6. **Every API call point must be audited.** A single missed hardcoded path can break an entire feature in production.

---

## Related Incidents

- **Incident 2:** Cloudflare cached API responses as HTML (`b8f69c2`)
  - This incident made the hardcoded-path bug worse by introducing cache misattribution
  - Both must be fixed together

- **Incident 3:** WebSocket through Cloudflare fails (`28d21be`, `913719b`)
  - Same root cause: requests through Cloudflare don't work for WebSocket
  - Both use the same pattern: hardcode Render URL for production domain

---

## References

- **Commit (Fix):** `a510daf` — "fix: route all API calls through API_BASE, not hardcoded /api/ paths"
- **Commit (Backup):** `b43ce0b` — same changes without PR
- **FEEDBACK.md:** Session 33-34 deployment notes
- **docs/plans/2026-03-20-feat-production-deployment-render-plan.md** — deployment plan

---

## Testing Checklist

After deploy:

```bash
# 1. Verify API responses are JSON, not HTML
curl https://thefantasticleagues.com/api/health | jq .
# Expected: {"status": "ok"}
# Not: <html>...</html>

# 2. Verify API calls go through Render, not Cloudflare
# Open DevTools, go to Network tab, search for "fbst-api.onrender.com"
# All API responses should come from fbst-api.onrender.com, not thefantasticleagues.com

# 3. Test auction state loads
# Navigate to Auction page
# Open DevTools Network tab
# Look for /api/auction/state?leagueId=...
# Verify it returns JSON with teams list

# 4. Verify no hardcoded paths slipped through
grep -rn "'/api/" client/src --include="*.tsx" --include="*.ts" | grep -v test | grep -v ".md"
# Should return 0 results
```

---
