---
title: "SaaS Phase 1 — Multi-League Baseball Platform"
type: plan
status: draft
date: 2026-03-23
---

# SaaS Phase 1: Multi-League Baseball Fantasy Platform

## Vision

Transform FBST from a single-league tool into a multi-league SaaS platform that any fantasy baseball league can use. Baseball first, then expand to other sports.

## Current Foundation

**Already Built:**
- Franchise model (tenant boundary) + FranchiseMembership
- League-scoped data isolation (leagueId on every query)
- Auction draft (full lifecycle: nominate → bid → finish → complete)
- Keeper prep workflow
- Season lifecycle (SETUP → DRAFT → IN_SEASON → COMPLETED)
- 9 AI features with Gemini/Claude fallback
- 19 feature modules, 680+ tests
- Supabase Auth (Google/email OAuth)

**Missing for SaaS:**
1. Snake draft mode
2. Self-service league creation (currently admin-only)
3. Public league directory
4. Stripe billing
5. Marketing site
6. Feature gating (free vs pro)

---

## Pricing Model

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 1 league, snake draft, standings, transactions, basic stats |
| **Pro** | $49/season or $79/year | Unlimited leagues, auction draft, keepers, AI insights, archive, custom scoring rules |

**Rationale:**
- Snake draft is table stakes — ESPN, Yahoo, Sleeper all offer it free
- Auction draft is the premium differentiator (only CBS/Fantrax/Ottoneu charge for it)
- Per-franchise pricing (not per-user) — aligns with Franchise model
- Seasonal billing (March–October) or annual for retention discount
- AI features are natural Pro upsell (API costs scale with usage)

---

## Implementation Phases

### Phase 1A: Snake Draft (Weeks 1-2)

**Extend the existing auction module** — 60-70% shared infrastructure.

**Shared with auction:**
- WebSocket real-time state + broadcast
- Player availability tracking
- Timer system (nomination timer → pick timer)
- Draft log/history
- Roster population on pick
- Season phase gating (DRAFT only)

**Snake-specific:**
- `mode: "AUCTION" | "SNAKE"` on draft state
- Pick order: `getPickingTeamId(order, round, pick)` — reverses on even rounds (serpentine)
- Auto-pick on timer expiry (highest-ranked available per team's pre-draft rankings)
- No budget, no bidding, no nomination queue
- Pre-draft rankings (drag-and-drop player ranking per team)
- Trade draft picks (future: pick-for-pick or pick-for-player trades)

**Schema changes:**
```prisma
model DraftPick {
  id         Int      @id @default(autoincrement())
  leagueId   Int
  round      Int
  pick       Int      // overall pick number
  teamId     Int
  playerId   Int?     // null = not yet picked
  autoPick   Boolean  @default(false)
  createdAt  DateTime @default(now())
}
```

**Files:**
- `server/src/features/auction/routes.ts` — add snake mode branches
- `client/src/features/auction/pages/Auction.tsx` — snake UI (simpler than auction)
- New: `client/src/features/auction/components/SnakeDraftBoard.tsx`
- New: `client/src/features/auction/components/PreDraftRankings.tsx`

### Phase 1B: Self-Service League Creation (Week 2)

**Current state:** League creation is admin-only via `/api/admin/create-league`.

**Target:** Any authenticated user can create a league:
1. Create franchise (or use existing)
2. Create league under franchise
3. Configure rules (roster size, positions, scoring categories)
4. Generate invite link/code
5. Share with friends → they sign up → join league

**Key endpoints to promote from admin to user:**
- `POST /api/franchises` — create franchise
- `POST /api/leagues` — create league (within franchise)
- `POST /api/leagues/:id/invite` — generate invite code

**New middleware:** `requireFranchiseOwner` or `requireFranchiseMember` — users can only manage their own franchises.

**Onboarding flow (3 screens):**
1. **Name your league** → franchise name, league name, season year
2. **Set the rules** → roster size, budget cap, scoring categories (presets: standard rotisserie, custom)
3. **Invite your league** → shareable link, copy to clipboard, email invites via Resend

### Phase 1C: Public League Directory (Week 3)

**Purpose:** SEO + organic discovery. Users can find and join public leagues.

**Schema change:**
```prisma
model League {
  // existing fields...
  isPublic     Boolean  @default(false)
  description  String?
  maxTeams     Int      @default(8)
}
```

**Endpoints:**
- `GET /api/directory` — list public leagues (paginated, filterable)
- `POST /api/directory/:leagueId/join` — request to join a public league

**Client:**
- New page: `/directory` — searchable list of public leagues
- Filter by: format (auction/snake), league size, status (open/full)
- "Join" button → auto-creates team + franchise membership

### Phase 1D: Stripe Billing (Week 3-4)

**Stack:** Stripe Checkout + Customer Portal + Webhooks

**Schema changes:**
```prisma
model Franchise {
  // existing fields...
  stripeCustomerId     String?
  subscriptionStatus   String?   // "active", "past_due", "canceled", "trialing"
  subscriptionEndsAt   DateTime?
  planTier             String    @default("free") // "free" | "pro"
}
```

**Server changes:**
- `server/src/features/billing/routes.ts` — new feature module
  - `POST /api/billing/checkout` — create Stripe Checkout session
  - `POST /api/billing/portal` — redirect to Stripe Customer Portal
  - `POST /api/billing/webhook` — handle Stripe events
- `server/src/middleware/auth.ts` — add `requirePro` middleware
- Gate auction draft, keeper prep, AI features, archive behind Pro

**Free tier must feel complete:**
- Snake draft ✅
- Standings ✅
- Transactions ✅
- Basic player stats ✅
- Mobile-responsive UI ✅

### Phase 1E: Marketing Site (Week 4+)

**Stack:** Astro (static HTML, ~50ms load, SEO-friendly)

**Why not in the Vite SPA:**
- Google indexes static HTML immediately
- Deploy/update independently of the app
- ~50ms TTFB vs ~800ms for SPA hydration
- Separate concerns: marketing ≠ app

**Routing:**
- `fantastic-leagues.com/` → Astro (landing, features, pricing, blog)
- `fantastic-leagues.com/app/*` → Vite SPA (the actual app)

**Pages:**
- Landing page with hero, features grid, social proof
- Pricing page (free vs pro comparison)
- Features deep-dive pages (SEO keywords: "fantasy baseball auction draft", "rotisserie standings calculator")

---

## Technical Architecture Notes

### Multi-Tenancy Strategy
- **Row-level isolation** via `leagueId`/`franchiseId` on all queries (already in place)
- Do NOT use schema-per-tenant or DB-per-tenant — overkill
- PostgreSQL RLS as optional hardening later (not needed for launch)

### Feature Gating Implementation
```typescript
// Middleware approach — clean and consistent
export function requirePro(req, res, next) {
  const franchise = req.franchise; // attached by middleware
  if (franchise.planTier === "pro" || franchise.subscriptionStatus === "active") {
    return next();
  }
  return res.status(403).json({ error: "Pro plan required", upgradeUrl: "/billing" });
}
```

### Data Isolation Verification
- Add integration test: create 2 franchises, 2 leagues — verify zero data leakage
- Audit all `findMany` queries to confirm `leagueId` scoping

---

## Priority Order

| # | Item | Effort | Unlocks |
|---|------|--------|---------|
| 1 | Snake draft | 2 weeks | Free tier — cannot acquire users without it |
| 2 | Self-service onboarding | 1 week | Users can create leagues independently |
| 3 | Public league directory | 1 week | Organic growth + SEO |
| 4 | Stripe billing | 1 week | Revenue |
| 5 | Astro marketing site | 1 week | SEO + professional presence |
| 6 | Feature gating | 3 days | Free vs Pro enforcement |

**Total estimated: ~6 weeks to MVP launch.**

---

## Success Metrics

- **Week 1:** Snake draft functional, internal testing
- **Week 3:** First external league signs up (beta invite)
- **Week 6:** Public launch with free + Pro tiers
- **Month 3:** 10 active leagues, at least 2 paying
- **Month 6:** 50 active leagues, MRR covering infrastructure costs
