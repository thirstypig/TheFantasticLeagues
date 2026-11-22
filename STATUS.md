# STATUS

**Last updated:** 2026-11-22

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
- Fixed: the commissioner "Scoring categories" page crashed for every league (found in PostHog error events, 2026-11-19); a wrong API URL now fails loudly instead of returning empty data
- CI reports test coverage on every run and fails if it drops below a floor (server 45% lines, client 51%)
- Standings tested against a real Postgres in CI: hand-worked expected points, 9 deliberate breakages each caught
- Period-close audit (`audit-period-close.ts`): one command checks every scored player's stats against MLB game logs and every in-season add, drop and trade against OnRoto's transaction log; 2026 passes both (all 7 periods equal MLB, 390 moves match by date), and deliberately broken versions are caught. Team points vs OnRoto's period standings are still compared by hand
- Keeper save: an owner can no longer mark a released (dropped or traded) player as a keeper; endpoint now tested, 11 tests, each guard mutation-checked
- Settings shows the stats source in plain words and always shows the saved value (a stored "ALL" used to display as "NL")

## In progress
- Past seasons archive rebuild (2003–2025, all 23 seasons). #537–#539 merged; prod has 19 seasons and the player check (/archive/player-check, 145 names to decide). PR (feat/archive-new-workbooks): James's 2026-11-22 workbooks add 2010–2013, per-period rosters for 2006–2014 and 2017–2020, the full 2017 draft, and real keeper lists for 2008–2013 and 2015; the player check grows to 245 names. After merge James reloads seasons, then the player check (decisions kept). Then: archive page on the new tables, old rows removed, re-scoring

## Open bugs / known issues
- None open. 2026 standings match OnRoto exactly in P1, P2, P3, P5, P6. The P4 and P7 ±1 pairs are OnRoto errors, verified 2026-11-19: FBST matches MLB and Baseball-Reference in both (todo #331). A full player-by-player sweep against MLB game logs (all 7 periods, 2026-11-19) found every stat that feeds standings correct.

## Next phases (in order)
1. Public auction-keeper leagues (not scheduled)

## Decisions changed recently
- 2026-11-19: The P4/P7 ±1 differences from OnRoto are OnRoto errors, not ours (todo #331): P4 = a Manaea scoring change (6 ER to 3) OnRoto applied after the period closed; P7 = OnRoto has Bubba Chandler 2 ER high. MLB, Baseball-Reference and FBST agree in both.
- 2026-11-18: No sideways scrolling on a computer (1280px and wider); phones may scroll stat tables with the name pinned (Style Bible)
- 2026-11-11: AL games don't count in NL-only leagues (OnRoto's rule)
- 2026-11-11: 2026 roster dates follow OnRoto and the OGBA workbook
- 2026-11-10: trade window setting (anytime / meeting day only)
- 2026-11-10: Sofia Sans replaces Inter
