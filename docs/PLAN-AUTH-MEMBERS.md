# Plan: Auth Fixes + Commissioner Member Management

## Problem Statement

Two related issues:

1. **Users can't create accounts** — The signup flow depends entirely on Supabase email confirmation, and password reset endpoints are missing on the server (client pages exist but hit dead endpoints). Need to investigate what's actually failing and fix the gaps.

2. **Commissioner needs to add members by email with role assignment** — The add-member form already exists in the Commissioner Overview tab, but it requires users to have signed up and logged in first. Commissioner should be able to invite users who haven't signed up yet, and assign them as OWNER or COMMISSIONER.

---

## Current State

### What Already Works
- **Signup page** (`/signup`) — email/password + Google OAuth via Supabase
- **Login page** (`/login`) — email/password + Google OAuth
- **Add member by email** — `POST /api/commissioner/:leagueId/members` with `{ email, role }` (OWNER or COMMISSIONER)
- **Commissioner UI** — Overview tab has member list, add-member form with email + role dropdown
- **Invite codes** — Franchise-level invite codes exist; users can `POST /api/leagues/join` with a code
- **Team ownership** — Up to 2 owners per team via `TeamOwnership` table

### What's Broken or Missing
- **Password reset**: Client pages exist (`/forgot-password`, `/reset-password`) but server endpoints don't
- **Email confirmation**: Supabase sends confirmation email, but there's no resend mechanism in the UI
- **Pre-signup invites**: Can't add a member who hasn't logged in yet — error: "User not found by email. That user must log in once first."
- **Error messages**: Supabase errors surface raw to users (e.g., "Invalid login credentials" instead of "Email not confirmed yet")
- **Commissioner role restriction**: Only site admins can assign COMMISSIONER role — commissioners themselves cannot promote others

---

## Detailed To-Do List

### Phase 1: Fix Account Creation (Signup/Login)

#### 1.1 Investigate Supabase Email Confirmation
- [x] Check Supabase dashboard: is email confirmation enabled? What's the redirect URL?
  - **Result**: `mailer_autoconfirm: false` — email confirmation IS required (working correctly)
  - Signup creates user with `email_confirmed_at: null`, no session returned until confirmed
  - `external.email: true`, `external.google: true`, `disable_signup: false`
- [x] Test signup flow end-to-end: sign up → receive email → click link → login
  - **Result**: Programmatic test confirms no session until email confirmed
  - Client code shows success message "Check your email for a confirmation link" (Signup.tsx:78)
  - Login page handles `email_not_confirmed` error with "Resend confirmation email" button (Login.tsx:146-161)
- [x] Verify Supabase email templates are configured (confirmation, password reset)
  - **Result**: All 6 authentication templates configured (Supabase defaults):
    - Confirm sign up, Invite user, Magic link, Change email, Reset password, Reauthentication
  - Security notification templates exist but are disabled (password changed, email changed, etc.)
- [x] Check if Supabase SMTP is set up or using default Supabase mailer (rate-limited to 4/hour on free tier)
  - **Result**: Using default Supabase mailer — hit `email rate limit exceeded` during testing
  - Dashboard warns: "You're using the built-in email service. This service has rate limits and is not meant to be used for production apps."
  - **DONE (2026-03-17)**: Custom SMTP configured via Resend:
    - Domain `thefantasticleagues.com` verified in Resend (3 DNS records: DKIM TXT, SPF MX, SPF TXT)
    - Supabase SMTP settings saved: `smtp.resend.com:465`, sender `noreply@thefantasticleagues.com`
    - Rate limit increased from 4/hour (built-in) to 30/min (custom SMTP)

#### 1.2 Implement Password Reset (Server Endpoints)
- [x] `POST /api/auth/forgot-password` — calls `supabase.auth.admin.generateLink({ type: 'recovery', email })` or use client-side `supabase.auth.resetPasswordForEmail(email)`
  - Decision: Use **client-side Supabase call directly** (no server endpoint needed) — simpler, Supabase handles email sending
  - Update `ForgotPassword.tsx` to call `supabase.auth.resetPasswordForEmail(email)` instead of `POST /api/auth/forgot-password`
- [x] `ResetPassword.tsx` — Supabase handles the token in the URL hash automatically via `onAuthStateChange('PASSWORD_RECOVERY')` event
  - Update to listen for `PASSWORD_RECOVERY` event, then call `supabase.auth.updateUser({ password })`
  - Remove dead fetch to `/api/auth/reset-password`

#### 1.3 Improve Signup Error Handling
- [x] Catch Supabase-specific error codes and map to user-friendly messages:
  - `user_already_exists` → "An account with this email already exists. Try logging in."
  - `weak_password` → "Password must be at least 6 characters."
  - `over_email_send_rate_limit` → "Too many attempts. Please try again in a few minutes."
  - `email_not_confirmed` → "Please check your email for a confirmation link."
- [x] Add "Resend confirmation email" button on login page when user gets `email_not_confirmed` error
  - Calls `supabase.auth.resend({ type: 'signup', email })`

#### 1.4 Verify OAuth Redirect URLs
- [x] Confirm Google OAuth redirect URL matches production and dev environments
  - **Result**: `external.google: true` — Google OAuth is enabled
  - Client code uses `redirectTo: window.location.origin` (AuthProvider.tsx:129), which is:
    - Dev: `http://localhost:3010`
    - Prod: production URL (needs to match Supabase Site URL)
  - Supabase callback: `https://oaogpsshewmcazhehryl.supabase.co/auth/v1/callback`
- [x] Verify Supabase dashboard has correct Site URL and Redirect URLs configured
  - **Site URL**: `https://thefantasticleagues.com` (correct)
  - **Redirect URLs** (5 total, verified via dashboard):
    1. `https://thefantasticleagues.com`
    2. `https://www.thefantasticleagues.com`
    3. `https://fbst-api.onrender.com/`
    4. `https://fbst-api.onrender.com`
    5. `http://localhost:3010/**` (**ADDED** — was missing, blocking local dev OAuth + password reset)
  - **Google OAuth config** (verified via dashboard):
    - Client ID: `67372893718-sjs5dldmaetp3boes7recknshct5gda2.apps.googleusercontent.com`
    - Client Secret: configured
    - Callback URL: `https://oaogpsshewmcazhehryl.supabase.co/auth/v1/callback`
  - **Google Cloud Console** (verified 2026-03-17):
    - `https://oaogpsshewmcazhehryl.supabase.co/auth/v1/callback` present as authorized redirect URI #9
    - `http://localhost:3010` present as both JS origin (#5) and redirect URI (#11)
    - No changes needed
- [x] Test Google OAuth end-to-end in both dev (localhost:3010) and production
  - **Dev (localhost:3010)**: Tested 2026-03-17 — full flow works: login page → Google account chooser → redirect back → logged in as James Chang
  - **Production (thefantasticleagues.com)**: Tested 2026-03-18 via Playwright — full redirect chain works: login page → Google account chooser → password challenge. Redirect URI (`oaogpsshewmcazhehryl.supabase.co/auth/v1/callback`) and client ID confirmed correct in production.

### Phase 2: Commissioner Member Management

#### 2.1 Pre-Signup Email Invites
Currently: "User not found by email. That user must log in once first."
Goal: Commissioner can invite anyone by email, even if they haven't signed up yet.

- [x] **Server: Create pending invite system**
  - New model: `LeagueInvite` with `InviteStatus` enum (PENDING, ACCEPTED, EXPIRED, CANCELLED)
  - Migration: `20260317000000_add_league_invite`
  - `POST /api/commissioner/:leagueId/members` — updated logic:
    1. Try to find user by email (existing behavior)
    2. If found → add to league immediately (existing behavior)
    3. If NOT found → create `LeagueInvite` row with status=PENDING, 30-day expiry
    4. Return `{ status: "invited" }` or `{ status: "added" }`
  - `GET /api/commissioner/:leagueId/invites` — list pending invites
  - `DELETE /api/commissioner/:leagueId/invites/:inviteId` — cancel/revoke invite

- [x] **Server: Auto-accept pending invites on first login**
  - In `GET /api/auth/me`:
    - After user record is found, calls `CommissionerService.acceptPendingInvites()`
    - Checks `LeagueInvite` for matching email with status=PENDING and not expired
    - If found: creates `LeagueMembership` + `FranchiseMembership`, marks invite ACCEPTED
    - Re-fetches user data to include new memberships in response

- [ ] **Optional: Send invite email**
  - Use Supabase `auth.admin.inviteUserByEmail(email)` to send a signup invite
  - Or use a custom email service (Resend, SendGrid, etc.)
  - Include league name and invite link in the email
  - Decision: **Defer email sending to Phase 3** — start with manual "tell them to sign up" flow

#### 2.2 Commissioner Can Assign Commissioner Role
Currently: Only site admins can assign COMMISSIONER role.

- [x] **Update `CommissionerService.addMember()`**:
  - Removed admin-only restriction for COMMISSIONER role assignment
  - Commissioners can now assign both OWNER and COMMISSIONER roles
  - All role changes logged via audit log

- [x] **Update commissioner UI**:
  - Role dropdown now shows COMMISSIONER option for all commissioners (not just admins)
  - Updated help text to explain pre-signup invite flow

#### 2.3 UI Improvements — Commissioner Members Section
- [x] **Pending invites list**: Amber-bordered section showing pending invites with email, role, dates, cancel button
- [x] **Better member list**: Show current members with role, team assignment badges
  - Change Role action (OWNER ↔ COMMISSIONER) — done in Phase 2.2
  - Remove Member action with confirmation — done in Phase 2.2
  - Team assignment badges via client-side cross-reference of overview data
- [x] **Improve error messages**: Updated help text to explain pre-signup invite flow
- [x] **Success feedback**: Toast notifications — "added to league" or "invite sent, will be added when they sign up"

### Phase 3: Email Notifications
- [x] Send email when commissioner invites a new user (via Resend SDK, fire-and-forget)
- [ ] Send email when user is added to a league (deferred — low priority)
- [ ] Send email when user's role changes (deferred — low priority)
- [x] Evaluate: Supabase built-in emails vs. third-party → **Chose Resend** for transactional emails; Supabase SMTP for auth emails (confirmation, password reset)

---

## Architecture Notes

### Invite Flow (Phase 2)
```
Commissioner adds "newuser@gmail.com" as OWNER
  ↓
Server checks: does user exist?
  ├── YES → create LeagueMembership immediately → { status: "added" }
  └── NO  → create LeagueInvite (PENDING) → { status: "invited" }
                ↓
        New user signs up via /signup
                ↓
        First login hits GET /api/auth/me
                ↓
        Server checks LeagueInvite for this email
                ↓
        Auto-creates LeagueMembership + FranchiseMembership
                ↓
        Invite status → ACCEPTED
```

### Files to Modify

**Server:**
- `prisma/schema.prisma` — add `LeagueInvite` model (if going that route)
- `server/src/features/commissioner/services/CommissionerService.ts` — update `addMember()`, add invite logic
- `server/src/features/commissioner/routes.ts` — update member endpoint, add invite endpoints
- `server/src/features/auth/routes.ts` — auto-accept invites on first login

**Client:**
- `client/src/features/auth/pages/ForgotPassword.tsx` — use Supabase client directly
- `client/src/features/auth/pages/ResetPassword.tsx` — use Supabase `PASSWORD_RECOVERY` event
- `client/src/features/auth/pages/Signup.tsx` — better error messages
- `client/src/features/auth/pages/Login.tsx` — resend confirmation, better errors
- `client/src/features/commissioner/pages/Commissioner.tsx` — pending invites UI, role changes

---

## Priority Order

1. **Phase 1.1–1.2**: Fix password reset (unblocks users who forgot passwords)
2. **Phase 1.3**: Better error messages (reduces confusion during signup)
3. **Phase 2.2**: Let commissioners assign COMMISSIONER role (quick config change)
4. **Phase 2.1**: Pre-signup invites (biggest feature, needs schema change)
5. **Phase 2.3**: UI polish for member management
6. **Phase 3**: Email notifications (nice-to-have, defer)

## Open Questions

1. **Supabase tier?** — Free tier limits to 4 emails/hour. If multiple users signing up, could hit limits. May need to upgrade or use custom SMTP.
2. **Invite expiration?** — Should pending invites expire? (e.g., 30 days?) Or persist indefinitely?
3. **Schema migration?** — Adding `LeagueInvite` model requires a Prisma migration. Safe to run on prod?
4. **Commissioner self-promotion?** — Should a commissioner be able to make someone else a commissioner, or should that remain admin-only? Current ask is to allow it.
