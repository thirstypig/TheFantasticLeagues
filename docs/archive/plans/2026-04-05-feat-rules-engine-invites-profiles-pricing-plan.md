---
title: "Rules Engine, League Invites, User Profiles, Pricing Model"
type: feat
status: active
date: 2026-04-05
---

# Rules Engine, League Invites, User Profiles & Pricing Model

## Overview

Four interconnected systems that form the foundation for FBST as a SaaS product:
1. **Rules Engine** — configurable waiver/trade/scoring rules with season-phase locking
2. **League Registration & Invites** — invite flow, public leagues, league capacity
3. **User Profiles** — public profiles with experience, favorites, payment handles
4. **Pricing Implementation** — commissioner-pays-per-league model with Stripe

## 1. Rules Engine & Season-Phase Locking

### Waiver Configuration Settings

| Setting | Options | Default | Lock Point |
|---------|---------|---------|------------|
| Waiver Type | FAAB / Rolling Priority / Reverse Standings / Free Agent | FAAB | Season Start |
| FAAB Budget | $50-$1000 (custom) | $200 | Season Start |
| FAAB Minimum Bid | $0 or $1 | $0 | Season Start |
| Waiver Period | 0-7 days (how long dropped players are locked) | 2 days | Season Start |
| Processing Frequency | Daily / Specific day(s) | Daily | Commissioner anytime |
| FAAB Tiebreaker | Rolling Priority / Reverse Standings / Random | Rolling Priority | Season Start |
| Acquisition Limit | Per week / Per season / Unlimited | Unlimited | Commissioner anytime |
| Conditional Claims | Enabled / Disabled | Enabled | Season Start |

### Rule Lock Tiers

| Category | Lock Point | Override |
|----------|------------|---------|
| League format (H2H/Roto/Points) | Season Start | Never |
| Number of teams | Season Start | Never |
| Roster positions/size | Season Start | Unanimous vote |
| Draft type (Auction/Snake) | Draft Start | Never |
| Scoring categories/values | Season Start | 2/3 supermajority vote |
| Waiver type / FAAB budget | Season Start | Commissioner (some anytime) |
| Trade deadline | Anytime | Commissioner |
| Acquisition limits | Anytime | Commissioner |
| Playoff format (H2H) | Playoff Start | Commissioner |
| Keeper rules | Offseason Only | Next season prep |

### Implementation

**Schema:** Add `LeagueRules` JSON field or expand existing rules on League model:
```prisma
model League {
  // existing fields...
  waiverType        String  @default("FAAB")
  faabBudget        Int     @default(200)
  faabMinBid        Int     @default(0)
  waiverPeriodDays  Int     @default(2)
  processingFreq    String  @default("DAILY") // DAILY, WEEKLY_WED, etc.
  faabTiebreaker    String  @default("ROLLING_PRIORITY")
  acquisitionLimit  Int?    // null = unlimited
  conditionalClaims Boolean @default(true)
  tradeDeadline     DateTime?
  rosterLockTime    String? // "GAME_TIME" or "DAILY_LOCK"
}
```

**Server:** Middleware `requireRuleLock(setting, allowedStatuses)` checks season phase before allowing changes. Commissioner routes validate against lock tiers.

**Client:** Commissioner → League Settings shows rules with lock indicators (padlock icon when locked, editable when unlocked). Clear messaging: "This setting is locked because the season has started."

### "Proposed Rule Change" Voting

For mid-season changes that require owner approval:
1. Commissioner proposes a change
2. System creates a vote (similar to Trade of the Week poll)
3. All owners vote (approve/reject)
4. Change applies only if threshold met (2/3 or unanimous depending on category)
5. Persisted in AuditLog for transparency

---

## 2. League Registration & Invites

### Invite Flow

```
Commissioner creates league
  → Sets rules + scoring format + draft type
  → League gets a shareable invite link (6-char code)
  → Commissioner can also send email invites (via Resend)
  → Invitees click link → Sign up / Log in → Auto-joined to league
  → Commissioner assigns teams to owners
  → When full, invite link auto-disables
```

### Invite Methods (3)
1. **Shareable link** — `app.thefantasticleagues.com/join/{inviteCode}` (Sleeper model)
2. **Email invite** — Already built via Resend (`sendInviteEmail`)
3. **League ID + code** — For posting on message boards / social media

### Public vs Private Leagues

| Type | Visibility | Join Method |
|------|-----------|-------------|
| **Private** (default) | Only visible to members | Invite link or email only |
| **Public** | Listed on Community Board / marketplace | Anyone can request to join; commissioner approves |
| **Open** | Listed on marketplace | Anyone can join immediately (first-come) |

**Schema addition:**
```prisma
model League {
  visibility    String @default("PRIVATE") // PRIVATE, PUBLIC, OPEN
  maxTeams      Int    @default(12)
  description   String? @db.Text
  entryFee      Float?  // display only (collection handled externally)
  entryFeeNote  String? // "Paid via LeagueSafe" or "Venmo @commissioner"
}
```

### League Capacity
- Min: 4 teams (smallest viable league)
- Default: 12 teams
- Max: 20 teams (standard) / 30 teams (premium)
- Auto-disable invite link when full
- Commissioner can override capacity

### Public League Listing on Community Board
Visible fields: league name, format (Roto/H2H/Points), sport, teams filled/capacity, entry fee, experience level, description, commissioner name

---

## 3. User Profiles

### Profile Fields

| Field | Visibility | Required |
|-------|-----------|----------|
| Display name | Public | Yes |
| Avatar/photo | Public | No (default: initials) |
| Bio (one-liner) | Public | No |
| Favorite MLB team | Public | No |
| Fantasy experience | Public | No (dropdown: 1-3 yrs, 3-5 yrs, 5-10 yrs, 10+ yrs) |
| Preferred formats | Public | No (checkboxes: Roto, H2H, Points, Keeper, Dynasty) |
| League history | Public | Auto-populated (championships, seasons played) |
| Achievement badges | Public | Auto-populated (from trophy case) |
| Email | Private | Yes (auth) |
| Payment handles | League members only | No (opt-in: Venmo, PayPal, Zelle, CashApp) |
| Timezone | Private (used for display) | Auto-detected |

### Schema
```prisma
model UserProfile {
  id              Int     @id @default(autoincrement())
  userId          Int     @unique
  bio             String? @db.VarChar(200)
  favoriteTeam    String? // MLB team abbreviation
  experienceLevel String? // "1-3", "3-5", "5-10", "10+"
  preferredFormats String[] @default([]) // ["ROTO", "H2H", "KEEPER"]
  paymentHandles  Json?   // { venmo?: string, paypal?: string, ... }
  timezone        String? // IANA timezone
  isPublic        Boolean @default(true)

  user            User    @relation(fields: [userId], references: [id])
}
```

### Profile Page
- Route: `/profile/:userId` (public view) or `/profile` (own profile, edit mode)
- Shows: name, avatar, bio, favorite team, experience, badges/trophies
- League history: years played, championships won, overall record
- Payment handles: only visible to league members (not public)

---

## 4. Pricing Implementation

### Model: Commissioner Pays Per League + User Subscription

| Tier | Price | Who Pays | What They Get |
|------|-------|----------|---------------|
| **Free** | $0 | — | Full league hosting, basic features, up to 2 leagues |
| **Pro** | $29/season | Individual user | AI features, Statcast, push notifications, unlimited leagues |
| **Commissioner** | $49/season per league | Commissioner | All Pro features for ALL league members + commissioner tools |

**Key insight from research:** Fantrax lets commissioners split the cost (~$5/team). FBST should offer this — when a commissioner upgrades, they can choose to pay full ($49) or split among owners ($49 ÷ 10 = ~$5 each).

### Stripe Integration Plan
1. Stripe Checkout for seasonal subscriptions
2. Products: `pro_season_{sport}_{year}` and `commissioner_league_{leagueId}_{year}`
3. No recurring billing — one-time seasonal charge
4. Multi-currency support via Stripe
5. Founding member lifetime deal ($99) as a separate product

### Database
```prisma
model Subscription {
  id          Int      @id @default(autoincrement())
  userId      Int
  leagueId    Int?     // null for Pro subscription
  type        String   // "PRO" or "COMMISSIONER"
  sport       String
  season      Int      // 2027
  stripeId    String?  // Stripe payment intent or checkout session
  status      String   @default("ACTIVE") // ACTIVE, EXPIRED, CANCELLED
  paidAt      DateTime?
  expiresAt   DateTime?
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id])
  league      League?  @relation(fields: [leagueId], references: [id])

  @@unique([userId, leagueId, season])
  @@index([userId])
}
```

---

## Implementation Priority

| Phase | What | Effort | When |
|-------|------|--------|------|
| 1 | Rule lock tiers + waiver config settings | Medium | Next session |
| 2 | User profiles (schema + page + edit) | Medium | Next session |
| 3 | League invite link + public/open leagues | Small | Next session |
| 4 | Community Board with league listings | Medium | After profiles |
| 5 | Stripe integration + subscription model | Large | When ready to monetize |
| 6 | Rule change voting | Small | After lock tiers |
| 7 | Cost splitting for commissioner tier | Small | After Stripe |

## Test Leagues Needed

1. **Snake Draft Test League** — format: SNAKE, scoring: ROTO, 8 teams
2. **H2H Category Test League** — format: AUCTION, scoring: H2H_CATEGORIES, 8 teams
3. **H2H Points Test League** — format: SNAKE, scoring: H2H_POINTS, 8 teams

These should be created via Admin page with test data to verify all scoring/draft combinations.

---

## Sources

- Yahoo waiver settings: help.yahoo.com/kb/SLN6811.html
- ESPN waiver types: support.espn.com/hc/en-us/articles/360000041152
- ESPN rule lock tiers: support.espn.com/hc/en-us/articles/360000088211
- Fantrax premium: fantrax.com/newui/premiumLeagueFeatures.go
- Yahoo Commissioner Plus: help.yahoo.com/kb/SLN36403.html
- Yahoo invites: help.yahoo.com/kb/invite-managers-league-sln6218.html
- Sleeper invites: support.sleeper.com/en/articles/3995033
- LeagueSafe: leaguesafe.com/howitworks
- Yahoo profiles: help.yahoo.com/kb/SLN22671.html
