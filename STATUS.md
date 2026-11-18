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
- 2026 re-score applied (2026-11-12): NL games only, OnRoto roster dates; Period 7 closed (no IL fees due)
- NL-only scoring: AL games don't count; 2026 roster dates follow OnRoto (#485)
- UX redesign:
  - commissioner hub, theme, four-tab shell, Today page (#473–#476)
  - steps A–E: style, rules, commissioner, rosters, trades, players and player card (#477–#482)
  - team page (#483)
  - step F: auction screens 8–11 and engine fixes (#487–#493)
- UX G live meeting with a clock (DOC-042; #499, #502, #504), off until turned on in Rules
- "Wire List" renamed "List", with an ⓘ help note (#498)
- Stale tabs can't overwrite a newer roster (#503)
- Season standings load in 6 queries, not ~45 (#501); IL stints close on a drop, IL events per league (#505)
- Commissioner can void a meeting fee on the Money page (#506)
- Cache cleanup: MLB teams refresh hourly; one trade-block store (#500)
- Dropped `TeamStatsSeason` and `Team.tradeBlockPlayerIds` (trade-block entries copied first); parse-based Wire List guard; 15s test timeout (#510)
- Local test flakes fixed: supertest connects over IPv6 loopback, so another process can't steal its port on macOS (todo #318)
- Mobile standings columns use the Rules page order (R HR RBI SB AVG / W SV ERA WHIP K), sized to their labels (no more "ERAWHIP")
- Mobile standings: point range and green "category leader" follow the team count; empty ad slot hidden on Season
- No horizontal scrolling on desktop (≥1280px): Watchlist and Trading Block cards are compact, roster tables fit, the shared table's 600px floor is phone-only
- Weekly digest stats line now includes saves and lists only the league's categories (todo #319)
- Phase 3.5: standings score each league's own Rules-page categories, any subset of the 10 (#513, live d1ad7c5b). Prod check: no standings number moved in either league
- Auction: timers survive restarts (#496); commissioner can start it pre-season (#497)
- Switch League pick survives reloads, shows its season (#494, #495)
- 2026 audit vs FanGraphs/OnRoto (#470, #471); waivers retired, cache fix, CVEs (#465–#467)

## In progress
- Nothing in flight

## Open bugs / known issues
- 2026 final vs OnRoto: P1–P3, P5, P6 exact; P4 and P7 each have one ±1 pair (DDG/RGS, RGS/The Show). Final order identical.

## Next phases (in order)
1. Public auction-keeper leagues (not scheduled)

## Decisions changed recently
- 2026-11-18: No sideways scrolling on a computer (1280px and wider); phones may scroll stat tables with the name pinned (Style Bible)
- 2026-11-11: AL games don't count in NL-only leagues (OnRoto's rule)
- 2026-11-11: 2026 roster dates follow OnRoto and the OGBA workbook
- 2026-11-10: trade window setting (anytime / meeting day only)
- 2026-11-10: Sofia Sans replaces Inter

**Known doc drift:** the generated "Current status" phase block in CLAUDE.md/README still says "In-Season 2026" — its source `server/data/planning.json` is stale.
