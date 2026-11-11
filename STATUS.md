# STATUS

**Last updated:** 2026-11-11

## One-line description
The Fantastic Leagues (FBST): a web app for roto fantasy baseball leagues with auctions, keepers and a commissioner. It replaces spreadsheets and OnRoto for the OGBA league.

## Scope / positioning
- **For:** small private auction-keeper leagues. Today that is OGBA only (8 teams, NL-only, real money).
- **Not:** open signup yet (we're hardening, not taking new users). Not head-to-head or daily fantasy. NFL/NBA pages are stubs with mock data.

## Stack & hosting
- **Frontend:** React 18, Vite 5, TypeScript, Tailwind 3, Sofia Sans
- **Backend:** Express 4, TypeScript (ESM), Prisma 6, Zod
- **DB / auth:** Supabase (Postgres and Auth). Email via Resend.
- **Hosting:** Railway, one service for API and client. Nixpacks build, `prisma migrate deploy` on boot.
- **CDN / DNS:** Cloudflare DNS only. Marketing site is Astro on GitHub Pages (`thefantasticleagues-www` repo).

## URLs
- **Marketing:** https://www.thefantasticleagues.com
- **App:** https://app.thefantasticleagues.com (`/api/health` reports the deployed SHA)
- **Staging:** none hosted. Railway has only `production`. "Staging" is a separate Supabase project used from a local server.

## Shipped (last 60 days)
- NL-only scoring: AL games don't count; 2026 roster dates follow OnRoto (#485)
- UX redesign:
  - commissioner hub, theme, four-tab shell, Today page (#473–#476)
  - steps A–E: style, rules, commissioner, rosters, trades, players and player card (#477–#482)
  - team page (#483)
- Sport-agnostic standings rows (#469)
- Final 2026 audit: every gap against FanGraphs and OnRoto explained (#470, #471)
- Legacy waivers retired (#466); standings cache fix (#465); critical CVEs cleared (#467)

## In progress
- UX step F: auction screens, plus deleting about 2,900 lines of dead legacy auction code
- 2026 re-score, run by the commissioner: turn on "NL players only" → repair script → rescore script → re-audit

## Open bugs / known issues
- OGBA Period 7 is still `active`. Closing it auto-bills contested IL fees.
- `ALERT_EMAIL_TO` is unset, so nightly audit alarms only log.
- One stale P6 stat (Perdomo hits 31 vs MLB 30; 0 points)
- OGBA trade window is still "anytime" (the decision was meeting day only)
- Todos #181 (stale roster across tabs), #304 (cache cleanup), #305 (slow first standings load)

## Next phases (in order)
1. UX F: auction screens
2. UX G: live meeting with a clock
3. Phase 3.5: standings categories from the league's scoring settings
4. Public auction-keeper leagues (not scheduled)

## Decisions changed recently
- 2026-11-11: AL games don't count in NL-only leagues (OnRoto's rule)
- 2026-11-11: 2026 roster dates follow OnRoto and the OGBA workbook
- 2026-11-10: trade window setting (anytime / meeting day only)
- 2026-11-10: Sofia Sans replaces Inter

**Where the repo contradicts CLAUDE.md** (resolved from code):
- "Inter only" → `index.html` loads Sofia Sans
- "97 grandfathered violations" → the baseline file has 86
- "#485 in flight" → merged
- Generated phase "In-Season 2026" → the season is over
