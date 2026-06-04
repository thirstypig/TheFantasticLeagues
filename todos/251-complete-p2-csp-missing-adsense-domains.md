---
status: pending
priority: p2
issue_id: 251
tags: [code-review, security, adsense, csp]
dependencies: []
---

## Problem Statement

The server's Content Security Policy (CSP) in `server/src/index.ts` does not include the domains required for AdSense to function. AdSense scripts load from `pagead2.googlesyndication.com` and serve ads through `googleads.g.doubleclick.net`. Without these in the CSP, either the browser silently blocks AdSense (no revenue) or — if the CSP header is stripped by a CDN/Railway — ads load without restriction from a third-party script that runs in the app's own origin context.

The `AdUnit.tsx` component's `try/catch` around `adsbygoogle.push({})` masks CSP-caused errors from logging, making this failure mode invisible.

## Findings

- `server/src/index.ts` CSP `scriptSrc`: contains `googletagmanager.com` and PostHog domains but NOT `pagead2.googlesyndication.com`
- `server/src/index.ts` CSP `frameSrc`: contains `google.com` but NOT `tpc.googlesyndication.com`
- No `connectSrc` entry for `googleads.g.doubleclick.net`
- `AdUnit.tsx` wraps `push()` in try/catch — CSP blocks are swallowed silently
- AdSense domain approval is still PENDING; the CSP must be fixed BEFORE approval completes or serving will fail immediately

## Proposed Solutions

**Option A — Add AdSense domains to existing helmet CSP config (Recommended)**

In `server/src/index.ts`, extend the `contentSecurityPolicy` directives:
```typescript
scriptSrc: [...existing, "https://pagead2.googlesyndication.com"],
frameSrc: [...existing, "https://tpc.googlesyndication.com"],
connectSrc: [...existing, "https://googleads.g.doubleclick.net"],
```

Effort: Small | Risk: Low

**Option B — Use AdSense's recommended `nonce`-based CSP**

Google recommends nonce-based CSP for AdSense (`script-src 'nonce-...'`). More secure but requires per-request nonce generation and passing to React.

Effort: Large | Risk: Medium

**Recommended:** Option A (domain allowlist). Nonces add complexity without meaningful gain for the current setup.

## Technical Details

Affected files:
- `server/src/index.ts` — helmet CSP configuration
- `client/src/components/AdUnit.tsx` — consumer of AdSense

Google's canonical AdSense CSP domains:
- `https://pagead2.googlesyndication.com` (script delivery)
- `https://googleads.g.doubleclick.net` (ad serving / connect)
- `https://tpc.googlesyndication.com` (iframe / frame)
- `https://www.googletagservices.com` (sometimes needed for tag manager bridge)

## Acceptance Criteria

- [ ] CSP `scriptSrc` includes `https://pagead2.googlesyndication.com`
- [ ] CSP `frameSrc` includes `https://tpc.googlesyndication.com`
- [ ] CSP `connectSrc` includes `https://googleads.g.doubleclick.net`
- [ ] AdUnit renders without CSP console errors in browser (verify with browser DevTools Network → Response Headers)
- [ ] Existing helmet tests (if any) still pass

## Work Log

2026-06-04 — Surfaced by security-sentinel in session code review. High confidence — AdSense CSP domains are documented by Google.
