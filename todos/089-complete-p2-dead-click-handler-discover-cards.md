---
status: complete
priority: p2
issue_id: "089"
tags: [code-review, quality, ux]
dependencies: []
---

# Dead Click Handler on Discover League Cards

## Problem Statement

After removing the `LeagueDetail` page (`/discover/:slug` route), the league cards on the Discover page still appear interactive (with `cursor-pointer`, `hover:border`, and "Join Now →" / "View Details →" CTA text) but clicking them does nothing for authenticated users. The `onClick` handler only handles the unauthenticated case (navigate to `/login`) and falls through to a no-op TODO comment for authenticated users. Missing `return` after `navigate()` makes the control flow sloppy.

This creates a broken UX where logged-in users see a clearly clickable card with an action prompt, click it, and nothing happens.

## Findings

### Agent: kieran-typescript-reviewer
- Flagged the dead click path for authenticated users
- Missing `return` after `navigate("/login")` — harmless now but fragile

### Agent: architecture-strategist
- Card still has "Join Now →" and "View Details →" CTA text (lines 111-114) that promise navigation
- Misleading affordance creates user confusion

### Agent: code-simplicity-reviewer
- Recommends removing `cursor-pointer`, `onClick`, and CTA text entirely (Option A — YAGNI)
- Alternative: keep only unauthenticated redirect, make cards informational-only

### Agent: security-sentinel
- No security impact, but noted as UX regression

## Proposed Solutions

### Solution 1: Make cards non-interactive until detail page is built
- Remove `cursor-pointer` from card className
- Remove `onClick` handler entirely
- Remove "Join Now →" / "View Details →" CTA div (lines 111-115)
- **Pros**: Clean, no misleading affordance, simplest
- **Cons**: Users can't click to login from cards
- **Effort**: Small (5 minutes)
- **Risk**: Low

### Solution 2: Keep unauthenticated redirect, remove affordance for authed users
- Add `return` after `navigate("/login")`
- For authenticated users: remove `cursor-pointer` conditionally and hide CTA
- **Pros**: Preserves login funnel from Discover page
- **Cons**: Slightly more complex conditional styling
- **Effort**: Small (10 minutes)
- **Risk**: Low

### Solution 3: Navigate authenticated users to the league's home if they are a member
- Check if user is a member of the clicked league
- Navigate to `/league/:id/home` if member, show "Request to Join" modal if not
- **Pros**: Best UX
- **Cons**: Requires membership check logic, scope creep for a rollback PR
- **Effort**: Medium
- **Risk**: Medium (adds scope)

## Recommended Action



## Technical Details

### Affected Files
- `client/src/features/leagues/pages/DiscoverLeagues.tsx` — lines 79-85 (onClick), lines 111-115 (CTA)

### Components
- DiscoverLeagues page

## Acceptance Criteria

- [ ] Authenticated users clicking a league card either get feedback or don't see a clickable affordance
- [ ] `cursor-pointer` is not present on cards that have no click action
- [ ] "Join Now →" / "View Details →" text is not shown if clicking does nothing
- [ ] Unauthenticated users can still discover and are prompted to log in or sign up

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-04-09 | Created from code review | All 5 review agents flagged this as the primary issue |

## Resources

- Commit being rolled back: `13fdc37` (feat: league detail page at /discover/:slug)
- File: `client/src/features/leagues/pages/DiscoverLeagues.tsx`
