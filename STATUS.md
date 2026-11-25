# STATUS

**Last updated:** 2026-11-25

## One-line description
The Fantastic Leagues (FBST): a web app for roto fantasy baseball leagues with auctions, keepers and a commissioner. It replaces spreadsheets and OnRoto for the OGBA league.

## Scope / positioning
- **For:** small private auction-keeper leagues. Today that is OGBA only (8 teams, NL-only, real money).
- **Not:** open signup yet, head-to-head or daily fantasy. NFL/NBA are admin-only test pages

## Stack & hosting
- **Frontend:** React 18, Vite 5, TypeScript, Tailwind 3, Sofia Sans
- **Backend:** Express 4, TypeScript (ESM), Prisma 6, Zod
- **DB / auth:** Supabase (Postgres and Auth). Email via Resend.
- **Hosting:** Railway, one service for API and client. Nixpacks build, `prisma migrate deploy` on boot.
- **CDN / DNS:** Cloudflare DNS only; marketing site is Astro on GitHub Pages

## URLs
- **Marketing:** https://www.thefantasticleagues.com
- **App:** https://app.thefantasticleagues.com (`/api/health` reports the deployed SHA)
- **Staging:** none hosted (a separate Supabase project used from a local server)

## Shipped (last 60 days)
- Past seasons archive (#537–#557): 23 seasons, season pages, trophy case, player check (an Archive tab) with a guide and a next-name button (#559, #560); members download the commissioner's original workbook per season; admin picks who helps check names (off / own team / all teams); 2021–2022 rosters fixed from the source workbooks
- NBA/NFL pages admin-only and marked as tests; admin page groups its hidden pages (#556)
- 2026 season closed and audited; standings match MLB in all 7 periods (#470–#535)
- Style Bible redesign, auction, live meeting with a clock (#473–#504)
- League-specific scoring categories (#513); period-close audit (#535)
- Hardening: roster version guard, IL and keeper fixes, coverage floor, real-Postgres standings tests (#500–#523)

## In progress
- Past seasons archive (2003–2025): data cleanup. 8,098 roster names in the player check, 244 still need a person to decide. Waiting on James to give the commissioner "All teams" access, and on the commissioner for two answers (2012 DDG total 394.5 vs 349.5; which 2008 final roster is right). Stats pull on hold until the names are decided; then re-score each season against the workbook points

## Open bugs / known issues
- None open. 2026 P4/P7 ±1 differences from OnRoto are OnRoto errors (FBST = MLB = Baseball-Reference)
- One mobile standings test flaked once in CI (passes locally)

## Next phases (in order)
1. Finish the archive: player check, player stats, re-score past seasons
2. Public auction-keeper leagues (not scheduled)

## Decisions changed recently
- 2026-11-24: Archive seasons read from the season's own workbook; the next year's "End of Season" copy can include offseason trades. Commissioner decisions on the player check are final, like the admin's; other owners can decide only their own team
- 2026-11-19: 2026 P4/P7 ±1 differences from OnRoto are OnRoto errors (todo #331)
- 2026-11-18: No sideways scrolling on a computer (1280px and wider); phones may scroll stat tables with the name pinned (Style Bible)
- 2026-11-11: AL games don't count in NL-only leagues (OnRoto's rule)
