# STATUS

**Last updated:** 2026-11-18

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
- 2026 season closed: FanGraphs/OnRoto audit (#470, #471); NL-only scoring and OnRoto roster dates (#485); re-score applied, Period 7 closed with no IL fees (2026-11-12)
- Style Bible UX redesign: shell, Today, commissioner, rules, rosters, trades, players, player card, team page, auction screens (#473–#497)
- Live meeting with a clock, off until turned on in Rules (#499, #502, #504)
- Standings score each league's own categories (#513); digest includes saves (#515)
- Hardening: roster version guard (#503), season standings in 6 queries (#501), IL fixes (#505), meeting-fee void (#506), cache and dead-table cleanup (#500, #510, #516), test flakes (#507, #508, #512)
- No sideways scrolling on desktop (#517); mobile standings scale, order and widths (#518–#520)
- Design-review polish: Season legend, Rules chips, phone Rules order, single-half leagues, Settings cards, 44px tap targets (#523)
- CI blocks new cross-feature imports (#522)

## In progress
- Nothing in flight

## Open bugs / known issues
- None open. (2026 final vs OnRoto: P4 and P7 each have one ±1 pair, DDG/RGS and RGS/The Show; accepted 2026-11-18 because the final order is identical and payouts don't change.)

## Next phases (in order)
1. Public auction-keeper leagues (not scheduled)

## Decisions changed recently
- 2026-11-18: The P4/P7 ±1 differences from OnRoto are accepted, not investigated (todo #331)
- 2026-11-18: No sideways scrolling on a computer (1280px and wider); phones may scroll stat tables with the name pinned (Style Bible)
- 2026-11-11: AL games don't count in NL-only leagues (OnRoto's rule)
- 2026-11-11: 2026 roster dates follow OnRoto and the OGBA workbook
- 2026-11-10: trade window setting (anytime / meeting day only)
- 2026-11-10: Sofia Sans replaces Inter
