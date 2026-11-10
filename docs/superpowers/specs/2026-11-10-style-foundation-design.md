---
id: DOC-032
title: "Style foundation (UX step A) — design"
description: "Apply the Style Bible app-wide: Sofia Sans, four text sizes with a 13px floor, nine colors including a Field color, MLB player photos and team logos, and the Style Bible as an admin page."
type: spec
status: active
phase: null
owner: james
tags: [design-system]
links: [DOC-027]
updated: 2026-11-10
---

# Style foundation (UX step A)

## Why

James reviewed the app's screens and found text too small, boxes that blend into the page, and no single source for how things should look. We worked out a **Style Bible** together and he approved it. It's a private artifact: https://claude.ai/artifact/UDWjhsrCsDKxovbSjkyPXc.

This step makes the whole app follow it, so the later screen redesigns (commissioner, rosters, trades, auction) start from the right base. Measured on main (2026-11-10):
- 20 different text sizes are in use, from 8px to 34px.
- About 1,330 places set text at 12px or smaller: 539 Tailwind arbitrary classes, 766 inline styles and 27 CSS rules. Another 636 uses of `text-xs` render at 12px.
- 19 color names, several of them duplicates. Inputs use the same color as cards, so search boxes vanish.

## Decisions (James's, from the Style Bible sessions)

- **Font:**
  - Sofia Sans for text.
  - Sofia Sans Condensed for headings, team names on tight rows, and big numbers.
  - Both from Google Fonts, weights 400/600/700.
- **Text sizes:** four sizes, plus one display size for big numbers only. Nothing anywhere under 13px.

  | Role | Size |
  |---|---|
  | Title | 24px |
  | Body (section headings are body bold) | 17px |
  | Small / table cells | 15px |
  | Caption / chips / column headers | 13px |
  | Display: big numbers only (clock, stat tiles) | 32px |

  Sizes of 40px and up are left alone as hero numbers.
- **Colors:** nine, light / dark.

  | Token | Light | Dark |
  |---|---|---|
  | Page | `#ded0a8` | `#341b1e` |
  | Card | `#fbf7ec` | `#5a3337` |
  | Line | `#c9b98c` | `#7a4a4f` |
  | Text | `#15171a` | `#f6f7f4` |
  | Muted | `#5e5747` | `#c8b9b2` |
  | Accent | `#990000` | `#ffcc00` |
  | On-accent text | `#ffffff` | `#2a1a00` |
  | Good | `#2a5f2a` | `#a6e3b0` |
  | Alert (merges the old warning and negative) | `#8a3a00` | `#ffb38a` |
  | Field: inputs, pickers, segmented controls | `#ffffff` | `#1f0e10` |
  | Field line | `#8a7a4f` | `#b08488` |
  | Chip, for tags and zebra rows (derived) | `#ece3c8` | `#4a2629` |

  Every text color passes 4.5:1 on Page, Card, Chip and Field in both themes. Field line passes 3:1 on Card. (Verified while writing this doc.)
- **Rule: no box has the same background as what it sits on.**
  - Cards sit on the page.
  - Inputs, pickers and segmented controls use Field.
  - Secondary buttons use Chip.
- **Player photos and team logos:**
  - Headshots come from `img.mlbstatic.com`. The app already does this in 6 places.
  - Logos come from `https://www.mlbstatic.com/team-logos/{teamId}.svg`.
  - Both fall back to initials or the 3-letter code when the image fails.
  - **Known risk:** MLB images are copyrighted and trademarked. Acceptable for a private league; revisit before marketing the app.
- **The Style Bible becomes an admin-only page:** `/admin/style-bible`, linked from the Account menu for admins. The repo copy is the source of truth from now on; the artifact is for sharing.

## Non-goals

- No screen redesigns. Those are steps B–G. Layout changes here are limited to what bigger text forces.
- No renaming of the `--am-*` / `--lg-*` tokens across call sites. The old names stay as aliases of the nine.
- No deleting of unused auction "Legacy" files. That's step F.

## Constraints

- The CSP allows inline styles but not inline scripts. So the Style Bible ships as a static HTML file plus a separate JS file, not as an embedded page.
- Express serves `client/dist` with `maxAge: '1y', immutable`. The Style Bible files need a no-cache mount, or edits will never show.
- Pre-auth pages (Login, Signup) render outside `.aurora-theme` and read `index.css` `:root` / `.dark` tokens. Those need the same values.
- Recharts and other SVG props take numeric `fontSize`. So inline sizes are rewritten to snapped numbers, never CSS-variable strings.

## Left to the builder

- The exact line-heights per size.
- Small layout fixes where 13px+ text overflows a fixed-width box.
- Which pages to browser-check beyond the required list in the plan.
