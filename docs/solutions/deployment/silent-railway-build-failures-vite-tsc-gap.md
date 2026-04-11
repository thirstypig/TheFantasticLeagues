---
title: "Silent Railway deploy failures from Vite/tsc build gap + Cloudflare stale cache"
category: deployment
tags: [railway, typescript, cloudflare, cache-control, vite, esbuild, silent-failure]
module: client, server
severity: HIGH
date_resolved: 2026-04-10
session: 61
symptom: "Production serves stale code after push to main — Railway deploys fail silently, old JS bundle hash persists"
root_cause: "tsc fails on pre-existing type errors that Vite dev (esbuild) ignores; Cloudflare caches stale index.html"
---

# Silent Railway Deploy Failures: Vite/tsc Build Gap + Cloudflare Stale Cache

## Problem

All 5 Railway deploys in a single day failed silently. Production at `app.thefantasticleagues.com` served stale code from the last successful deploy. New features (split-screen login, admin tasks page, pitcher ER/BB+H stats) were committed and pushed to main but never went live.

### Symptoms

1. Production login page showed old centered layout instead of new split-screen
2. Railway GitHub integration showed deployments triggered but all had `failure` status
3. Same old JS bundle hash (`index-BwXV4reT.js`) served repeatedly
4. Even after Cloudflare cache purge, old code persisted (because the deploy itself failed)
5. No error notifications — Railway silently keeps serving last-good-deploy on build failure

### How It Was Discovered

Checked production after committing session work. Login page showed old layout. Investigated via GitHub API: `gh api repos/thirstypig/fbst/deployments` — all 5 deploys returned `state: "failure"`.

## Root Cause

Three compounding issues:

### 1. Vite Dev vs tsc Production Build Gap

The client build script runs `tsc && vite build`. Local development uses Vite's dev server which compiles via **esbuild** — a fast transpiler that deliberately **ignores TypeScript type errors**. The production build runs **tsc** first, which enforces strict type checking.

This means type errors can accumulate across multiple development sessions without being caught until a deploy is attempted.

### 2. Two Pre-Existing TypeScript Errors

**Error A — Missing prop on TableCard Th component:**

`client/src/components/ui/TableCard.tsx` — The `Th` component didn't accept a `title` prop, but `Team.tsx` line 766 passed `title="Walks + Hits (WHIP numerator)"` on the BB+H column header.

```
src/features/teams/pages/Team.tsx(766,40): error TS2322:
  Property 'title' does not exist on type '{ children: ReactNode; className?: string; align?: Align; w?: number; }'
```

**Error B — Duplicate object properties in Changelog:**

`client/src/pages/Changelog.tsx` — A new changelog entry was accidentally merged into an existing entry's object literal, creating duplicate `version`, `date`, and `session` properties.

```
src/pages/Changelog.tsx(86,5): error TS1117:
  An object literal cannot have multiple properties with the same name.
```

### 3. Cloudflare Caching Stale index.html

The Express SPA catch-all in `server/src/index.ts` served `index.html` via `res.sendFile(index)` without cache-control headers. Cloudflare applied default caching (hours). Even after a successful deploy, users could see stale code until Cloudflare TTL expired.

## Solution

### Fix 1: Add `title` prop to TableCard Th

```typescript
// client/src/components/ui/TableCard.tsx
export function Th({
  children,
  className,
  align = "center",
  w,
  title,          // Added
}: {
  children: React.ReactNode;
  className?: string;
  align?: Align;
  w?: number;
  title?: string; // Added
}) {
  return (
    <th
      title={title} // Added
      style={w ? { width: w } : undefined}
      // ...
```

### Fix 2: Fix duplicate Changelog properties

Corrected the object structure so each changelog entry is a separate object in the array.

### Fix 3: Set no-cache headers on index.html

```typescript
// server/src/index.ts — SPA catch-all
app.get("*", (req, res) => {
  let index = path.join(clientDistPath, 'index.html');
  if (!fs.existsSync(index)) {
    index = path.join(process.cwd(), 'client/dist/index.html');
  }
  if (fs.existsSync(index)) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); // Added
    res.sendFile(index);
  } else {
    res.status(404).send("FBST UI not built or found.");
  }
});
```

Static assets (JS/CSS with content hashes) remain cached for 1 year via `express.static({ maxAge: '1y', immutable: true })` — safe because Vite content-hashes every bundle file.

## Prevention

### Immediate (do now)

1. **Install `vite-plugin-checker`** — runs tsc in a worker thread alongside Vite dev server. Type errors show as browser overlay in real-time. Zero workflow change.
2. **Add pre-push hook** — runs `tsc --noEmit` before pushing. Catches errors before they leave your machine.
3. **Add `npm run preflight` script** — `concurrently "cd client && npx tsc --noEmit" "cd server && npx tsc --noEmit"`. Quick manual check.

### Medium-term

4. **Add build version to health endpoint** — return `RAILWAY_GIT_COMMIT_SHA` from `/api/auth/health` so you can verify the correct version deployed.
5. **Railway deploy webhook** — POST to Slack/Discord on deploy success/failure for immediate visibility.
6. **GitHub Actions CI** — run `tsc --noEmit` + tests on every push as a safety net.

### Key Principle

> **Dev/prod parity for type checking.** If production runs `tsc`, development should surface `tsc` errors too. The speed benefit of esbuild in dev is real, but the type-checking gap is a landmine. Run both in parallel.

## Cross-References

- [cloudflare-cached-stale-service-worker.md](cloudflare-cached-stale-service-worker.md) — Same Railway silent failure pattern with TrophyCaseTab.tsx (Session 55)
- [hardcoded-api-paths-cloudflare-cache-bypass.md](hardcoded-api-paths-cloudflare-cache-bypass.md) — Cloudflare caching SPA HTML instead of API JSON
- [service-worker-immutable-cache-headers.md](service-worker-immutable-cache-headers.md) — express.static caching of unhashed files
- [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) — Pre-deploy tsc + git status checks

## Timeline

| Time | Event |
|------|-------|
| Session 61 start | Committed split-screen login, admin tasks, ER/BB+H stats |
| All day | 5 Railway deploys triggered and failed silently |
| Late session | Noticed production still showing old login |
| Investigation | `gh api` showed all deploys as `failure` |
| Root cause | `tsc` failing on TableCard title prop + Changelog duplicates |
| Fix | Added title prop, fixed Changelog, added Cache-Control header |
| Verification | Railway deploy succeeded, split-screen login live on production |
