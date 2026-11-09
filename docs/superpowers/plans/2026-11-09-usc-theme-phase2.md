---
id: DOC-029
title: "USC theme (UX Phase 2) — implementation plan"
description: "Task-by-task plan to replace the Score Sheet light/dark tokens with the medium-tone USC palette, make the theme follow the OS with a Profile override, and verify every routed page in both modes."
type: plan
status: active
phase: null
owner: james
tags: [design-system]
links: [DOC-027]
updated: 2026-11-09
---

# USC Theme (UX Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page renders in the USC palette, with medium tones in both modes (Trojan Gold light, Cardinal dark). The theme follows the phone or computer setting, with a System / Light / Dark override in Profile.

**Architecture:**
- **Tokens.**
  - Colors stay in CSS custom properties. The `--am-*` values in `client/src/components/aurora/aurora.css` change.
  - The legacy `--lg-*` page tokens in `client/src/index.css`, used by pages outside the aurora wrapper (Login, Signup and so on), move to the same palette.
  - One new token, `--am-on-accent`, carries the label color for anything drawn on the accent color.
- **Contrast guard.** A test parses `aurora.css` and fails if any text token drops below 4.5:1 on any surface.
- **Theme context.** `ThemeContext` changes from a stored light/dark toggle to a stored *preference* (`system` | `light` | `dark`) that resolves against `prefers-color-scheme`.

**Tech Stack:** React 18, Tailwind + CSS custom properties, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-11-09-ux-simplification-design.md` (DOC-027), section "Theme: USC, medium tones", plus Phase 2.

## Global Constraints

- **The spec's palette, verbatim.**

  | | Light | Dark |
  |---|---|---|
  | Page | `#e0d3ae` | `#3a1f22` |
  | Card / surface | `#ece2c6` | `#4a2a2e` |
  | Border | `#c9b98c` | `#6a3d42` |
  | Text | `#15171a` | `#f6f7f4` |
  | Secondary text | `#33373b` | `#dde1dc` |
  | Accent | USC Cardinal `#990000`, label `#ffffff` | USC Gold `#FFCC00`, label `#2a1a00` |
  | Warning (amber) | `#5e3400` | `#f8db9c` |

- **Red never means "warning".** `--am-negative` must not be the brand cardinal.
- **Contrast.** Text tokens need ≥ 4.5:1 on every surface they sit on (bg, surface, surface-alt, chip). The accent label needs ≥ 4.5:1 on the accent. `--am-border-strong` needs ≥ 3:1 on surface.
- **Theme follows the OS** (`prefers-color-scheme`), with a manual override in Profile. The header/popover toggle is removed from the app shells.
- **Colors only.** No USC logo or marks.
- **Out of scope:**
  - `client/src/pages/design/**` (preview artifacts).
  - The NBA/NFL sport accent overrides (pages being hidden in Phase 3).
  - `--am-scrim`: it arrives with PR #473. Do not add it here, to avoid a merge conflict.
- No new cross-feature imports (`node scripts/check-feature-isolation.mjs` exits 0). Mobile: ≥ 16px body text, ≥ 44px tap targets for new controls.
- Run `npm run docs:refresh` before push, and never commit `docs/under-the-hood/system-status.md`.

## Token values (decided here; verified by Task 2's contrast test)

| Token | Light | Dark |
|---|---|---|
| `--am-bg` | `#e0d3ae` | `#3a1f22` |
| `--am-surface` / `--am-surface-faint` | `#ece2c6` | `#4a2a2e` |
| `--am-surface-alt` / `--am-surface-strong` | `#e5d9b8` | `#553236` |
| `--am-border` | `#c9b98c` | `#6a3d42` |
| `--am-border-strong` | `#8a7a4f` | `#a07a7e` |
| `--am-text` | `#15171a` | `#f6f7f4` |
| `--am-text-muted` | `#33373b` | `#dde1dc` |
| `--am-text-faint` | `#4f4a3d` | `#cfc6c0` |
| `--am-accent` | `#990000` | `#ffcc00` |
| `--am-on-accent` (new) | `#ffffff` | `#2a1a00` |
| `--am-accent-2` / `--am-cardinal` (alias) | `#6b4e00` | `#f0c8a8` |
| `--am-chip` | `#dccb98` | `#5a3a30` |
| `--am-chip-strong` | `#cfbb80` | `#6a4636` |
| `--am-positive` | `#2a5f2a` | `#a6e3b0` |
| `--am-negative` | `#8a3a00` | `#ffb38a` |
| `--am-warning` | `#5e3400` | `#f8db9c` |

The `theme-color` meta tag is set to `#e0d3ae` (light) and `#3a1f22` (dark).

## Review Focus

1. **Gold accent with a white label.** Any button or badge with `background: var(--am-accent)` and a hard-coded `#fff` / `white` / `var(--am-bg)` label becomes unreadable in dark mode (white on `#ffcc00` is 1.4:1). Every such site must use `var(--am-on-accent)`. Task 4 greps for them and has a regression test.
2. **Existing users stuck on a theme.** The old `ThemeProvider` wrote `fbst-theme` to localStorage on *every* render, so every past visitor has a stored value they never chose. That key must be ignored (and removed), so everyone starts on "System". Test in Task 1.
3. **The OS switches while the app is open** (iOS auto dark mode at sunset). With preference "System", the app must follow it live, without a reload. Test in Task 1.
4. **Logged-out pages.** Login, Signup and the password pages live outside `.aurora-theme` and read `--lg-*` tokens from `index.css`, so a token change in `aurora.css` alone leaves them on the old palette. Task 3 covers them, and Task 5's browser pass checks them.
5. **Red error vs. red brand.** Error and negative-delta text using `--am-negative` must stay distinguishable from brand-cardinal buttons in light mode. That's why `#8a3a00` (rust), not red. Task 5 checks a standings page with negative deltas.

---

### Task 1: Theme preference model (System / Light / Dark)

**Files:**
- Modify: `client/src/contexts/ThemeContext.tsx`
- Test: `client/src/contexts/__tests__/ThemeContext.test.tsx` (create)

**Interfaces:**
- Produces:
  - `type ThemePreference = 'system' | 'light' | 'dark'`
  - `useTheme(): { theme: 'light' | 'dark'; preference: ThemePreference; setPreference(p: ThemePreference): void; toggleTheme(): void }`
  - `toggleTheme` stays for the logged-out Landing page and the legacy AppShell. It sets an explicit preference opposite to the current resolved `theme`.
  - Storage: key `fbst-theme-pref` holds the preference. The legacy key `fbst-theme` is removed on first load and never read.
  - `<html>` gets class `dark` or `light`, as today.

- [ ] **Step 1: Write the failing tests** (mock `window.matchMedia` with a controllable listener):
  - `"defaults to system and resolves to the OS scheme"`: matchMedia dark=true, no storage → `theme === "dark"`, `preference === "system"`, `<html>` has class `dark`.
  - `"ignores and removes the legacy fbst-theme key"`: `localStorage.fbst-theme = "light"`, OS dark → `theme === "dark"` and `localStorage.getItem("fbst-theme") === null`.
  - `"follows a live OS change while preference is system"`: fire a matchMedia change event to light → `theme === "light"` without a remount.
  - `"explicit preference wins over the OS and persists"`: `setPreference("light")` with OS dark → `theme === "light"`, `localStorage.fbst-theme-pref === "light"`, and a later OS change does nothing.
  - `"toggleTheme sets the opposite explicit preference"`: resolved dark → after `toggleTheme()`, `preference === "light"`.
  - `"theme-color meta follows the resolved theme"`: dark → `#3a1f22`, light → `#e0d3ae`.
- [ ] **Step 2:** `cd client && npx vitest run src/contexts/__tests__/ThemeContext.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. Subscribe to `matchMedia('(prefers-color-scheme: dark)')` change events only while the preference is `system`, and unsubscribe on cleanup.
- [ ] **Step 4:** Re-run. Expected: PASS. Then run the whole client suite: existing callers of `useTheme().theme` / `toggleTheme` must still compile and pass.
- [ ] **Step 5:** Commit: `feat(theme): follow the OS by default with a stored preference override`.

---

### Task 2: USC tokens + contrast guard

**Files:**
- Modify: `client/src/components/aurora/aurora.css`. Update the light block (`.aurora-theme`, ~lines 17–56) and the dark block (`.aurora-theme.dark, .dark .aurora-theme`, ~58–91) to the Token values table, add `--am-on-accent` to both, and update the file header comment to describe the USC palette.
- Test: `client/src/components/aurora/__tests__/tokenContrast.test.ts` (create)

**Interfaces:**
- Produces: the token values above, including `--am-on-accent`.

- [ ] **Step 1: Write the failing test.**
  - It reads `aurora.css` with `fs.readFileSync` (resolve from `__dirname`) and extracts the custom properties of the light block and the dark block with a small regex parser.
  - It computes WCAG relative-luminance contrast.
  - Assertions, for each mode:
    - Each of `--am-text`, `--am-text-muted`, `--am-text-faint`, `--am-accent`, `--am-accent-2`, `--am-positive`, `--am-negative`, `--am-warning` is ≥ 4.5 against each of `--am-bg`, `--am-surface`, `--am-surface-alt`, `--am-chip`.
    - `--am-on-accent` vs `--am-accent` ≥ 4.5.
    - `--am-border-strong` vs `--am-surface` ≥ 3.
    - Light `--am-negative` ≠ light `--am-accent`.
    - Exact spec values: light `--am-bg` = `#e0d3ae`, dark `--am-bg` = `#3a1f22`, light `--am-accent` = `#990000`, dark `--am-accent` = `#ffcc00`.
  - The failure message names the token pair and the ratio.
- [ ] **Step 2:** Run it. Expected: FAIL (old values, and `--am-on-accent` missing).
- [ ] **Step 3:** Update both blocks to the table's values.
- [ ] **Step 4:** Re-run. Expected: PASS. Mutation check: temporarily set dark `--am-text-faint` to `#8a7f7a` and confirm the test fails, then revert.
- [ ] **Step 5:** Commit: `feat(theme): USC medium-tone palette for light and dark + contrast guard`.

---

### Task 3: Logged-out pages and the theme-color meta use the same palette

**Files:**
- Modify: `client/src/index.css`.
  - In `:root` (~line 13), set `--lg-bg-page`, `--lg-bg-primary`, `--lg-bg-secondary`, `--lg-text-primary`, `--lg-text-heading`, `--lg-text-secondary`, `--lg-text-muted`, `--lg-accent` / `-hover` / `-active`, `--lg-border-subtle`, `--lg-border-strong` and `--lg-bg-card` to the light Token values.
  - Do the same in `.dark` (~line 164) with the dark values.
  - The light `--lg-bg-page` is currently a gradient; replace it with the flat `#e0d3ae`.
- Modify: the hard-coded colors in `client/src/features/auth/pages/Login.tsx` (5), `ForgotPassword.tsx` (1) and `ResetPassword.tsx` (1). Use tokens. `client/src/components/GoogleSignInButton.tsx` keeps Google's brand colors.
- Test: extend `tokenContrast.test.ts` with an `index.css` block, asserting that `:root` and `.dark` `--lg-text-primary` vs `--lg-bg-card` are ≥ 4.5 and that the page backgrounds equal the spec values.

**Interfaces:**
- Consumes: the Task 2 values.

- [ ] **Step 1:** Write the `index.css` contrast and value assertions. Run them. Expected: FAIL.
- [ ] **Step 2:** Update `index.css` and the three auth pages.
- [ ] **Step 3:** Re-run the contrast test and `cd client && npx vitest run src/features/auth`. Expected: PASS.
- [ ] **Step 4:** Commit: `feat(theme): logged-out pages on the USC palette`.

---

### Task 4: Text on the accent uses `--am-on-accent`; product pages drop hard-coded theme colors

**Files:**
- Modify: every non-design file where an element has `background: var(--am-accent)` (or `bg-[var(--am-accent)]`). There are 24 sites as of writing; find them with `grep -rnE "var\(--am-accent\)" client/src | grep -iE "background|bg-\["`. Give each one `color: var(--am-on-accent)`, replacing `#fff`, `white`, `var(--am-bg)` or `var(--am-surface)`.
- Modify: the hard-coded hex colors in these product files. Convert theme-meaning colors (backgrounds, text, borders, success/warn/error) to `--am-*` tokens.
  - `features/wire-list/pages/WireListCommissionerPage.tsx` (12)
  - `features/teams/components/RosterHub/PendingChangeBar.tsx` (11), `SaveDiffPreviewModal.tsx` (10), `IlSectionV3.tsx` (8), `DropPool.tsx` (4), `FreeAgentPanel.tsx` (3), `rowShared.tsx`, `RosterHubV3.tsx`
  - `features/teams/pages/Team.tsx` (6)
  - `features/wire-list/pages/WireListOwnerPage.tsx` (5), `components/AddPicker.tsx`, `components/DropPicker.tsx`
  - `features/archive/pages/ArchivePage.tsx` (4)
  - `pages/components/NewsFeedsPanel.tsx` (4)
  - `mobile/pages/MobileWireList.tsx` (3), `mobile/pages/MobilePlayers.tsx`
  - `features/ai/components/DraftReportCard.tsx` (3)
  - `features/transactions/components/SwapMode/SlotCell.tsx` (2)
  - `features/commissioner/pages/ScoringSettings.tsx` (2), `Commissioner.tsx` (1)
  - `pages/Home.tsx`, `pages/Roadmap.tsx`, `App.tsx`

  **Leave and list in the report:** `mobile/atoms/MSparkline.tsx` chart series colors, the NBA/NFL dashboards, and any brand color. Leave one only if converting it would change meaning, and list each one left with its reason.
- Test: `client/src/components/aurora/__tests__/onAccentSweep.test.ts` (create). It walks `client/src` (excluding `pages/design`, `__tests__`, `nba`, `nfl`), finds every style object or className that sets the background to `var(--am-accent)`, and asserts its nearest `color` is `var(--am-on-accent)`. A line-window heuristic is fine (same object literal, or the same className string). The failure message prints `file:line`.

**Interfaces:**
- Consumes: `--am-on-accent` (Task 2).

- [ ] **Step 1:** Write `onAccentSweep.test.ts`. Run it. Expected: FAIL, listing the current offenders.
- [ ] **Step 2:** Fix every accent site. Re-run. Expected: PASS.
- [ ] **Step 3:** Convert the listed files' hard-coded colors. Run the full client suite and `tsc` (full-log count). Expected: 0 failures, 0 errors.
- [ ] **Step 4:** Commit in two commits: `fix(theme): text on accent uses --am-on-accent` and `refactor(theme): product pages use tokens instead of hard-coded colors`.

---

### Task 5: Theme control in Profile; remove the shell toggles

**Files:**
- Modify: `client/src/features/profiles/pages/ProfilePage.tsx`. Add an "Appearance" section (id `appearance`) with a 3-option segmented control: System, Light, Dark. Each option is a `role="radio"` button inside `role="radiogroup"` with `aria-label="Appearance"`, ≥ 44px tall, 16px text, and the selected option uses `--am-accent` / `--am-on-accent`. It is wired to `setPreference`.
- Modify: remove the theme toggle from `client/src/components/aurora/AuroraShell.tsx` (popover row ~line 459) and from `client/src/mobile/MobileShell.tsx` (header button ~line 134 and menu ~line 251).
- Modify: `client/src/mobile/pages/MobileMore.tsx` (~line 194). Its theme row becomes a link row "Appearance" → `/profile#appearance`.
- Keep: the toggle buttons on the logged-out `Landing.tsx` and the legacy `AppShell.tsx` (they call `toggleTheme`).
- Test: extend the Profile page test (create `client/src/features/profiles/__tests__/ProfileAppearance.test.tsx` if none exists) and the shell tests.

**Interfaces:**
- Consumes: `useTheme().preference` / `setPreference` (Task 1).

- [ ] **Step 1: Write the failing tests:**
  - Profile renders a radiogroup "Appearance" with System / Light / Dark. The current preference is `aria-checked="true"`. Clicking "Dark" calls `setPreference("dark")`.
  - AuroraShell and MobileShell render no element whose accessible name matches `/switch to (light|dark) theme|light theme|dark theme/i`.
  - MobileMore has an "Appearance" link to `/profile#appearance`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run, then run the full client suite. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(theme): appearance control in Profile; remove shell toggles`.

---

### Task 6: Every-page browser check in both modes, then PR

Owner: the controller, not an implementer. The local setup is in memory `local_browser_check_setup`: Colima, local Supabase, `prisma db push`, process-env keys, and a seeded league.

- [ ] **Step 1:** Run the full server and client suites, both `tsc` (full-log counts), and `check-feature-isolation`. Expected: all green.
- [ ] **Step 2: Browser pass** at 440 × 956 and 1440 × 900, with Appearance set to Light, then Dark. Visit every non-design route in `client/src/App.tsx`. For each, note: illegible text, white-on-gold, leftover green/taupe, or a broken layout. At minimum, visit these, in this order:
  - **Logged out:** `/`, `/login`, `/signup`, `/forgot-password`.
  - **Core pages:** `/season` (negative deltas visible: Review Focus 5), `/players`, `/players/:mlbId`, `/teams/:teamCode`, `/teams/:teamCode/wire-list`, `/my-team`, `/activity`, `/trades`, `/rules`, `/payouts`, `/archive`, `/profile`.
  - **Commissioner:** `/commissioner/:leagueId` and its section pages.
  - **Admin and auction:** `/admin`, `/auction-results`, `/draft-results`.
  - **The rest:** everything else in the route list.
- [ ] **Step 3:** Toggle the OS appearance with Appearance on "System" and confirm the app follows it live (Review Focus 3). Then choose Light explicitly and confirm an OS change no longer switches it.
- [ ] **Step 4:** Fix findings through one implementer dispatch with the full list, then run one scoped re-review.
- [ ] **Step 5:** `npm run docs:refresh`, commit, push `feat/usc-theme-phase2`, and open the PR against `main`. The PR body must note:
  - It touches `aurora.css` next to #473's `--am-scrim` line. Whichever merges second rebases and keeps both.
  - Run the browser check again on prod after deploy.
