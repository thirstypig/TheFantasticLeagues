# STATUS

**Last updated:** 2026-11-13

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
  - step F: auction screens 8–11, auction engine safety fixes, live auction socket fixed, ~6,800 lines of dead auction code deleted (#487), plus design-review polish (phone best-available list, named undo, "you're up after") (#489), rebuilt post-auction report (#490), review polish (results title, phone team rows, turn order, grayed-button reasons)
- Sport-agnostic standings rows (#469)
- Final 2026 audit: every gap against FanGraphs and OnRoto explained (#470, #471)
- Legacy waivers retired (#466); standings cache fix (#465); critical CVEs cleared (#467)

## In progress
- Nothing in flight. Step F design review: all suggestions shipped. Draft report "money left" fix in #492.

## Open bugs / known issues
- Auction: starting an auction needs a site admin.
- 2026 final vs OnRoto (Kent's workbook): P1–P3, P5, P6 exact; P4 and P7 each have one ±1 pair (DDG/RGS, RGS/The Show). Final order identical.
- Todos #181 (stale roster across tabs), #304 (cache cleanup), #305 (slow first standings load)

## Next phases (in order)
1. UX G: live meeting with a clock
2. Phase 3.5: standings categories from the league's scoring settings
3. Public auction-keeper leagues (not scheduled)

## Decisions changed recently
- 2026-11-11: AL games don't count in NL-only leagues (OnRoto's rule)
- 2026-11-11: 2026 roster dates follow OnRoto and the OGBA workbook
- 2026-11-10: trade window setting (anytime / meeting day only)
- 2026-11-10: Sofia Sans replaces Inter

**Known doc drift:** the generated "Current status" phase block in CLAUDE.md/README still says "In-Season 2026" — its source `server/data/planning.json` is stale.
