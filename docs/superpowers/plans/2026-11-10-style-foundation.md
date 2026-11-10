---
id: DOC-033
title: "Style foundation (UX step A) — implementation plan"
description: "Nine colors, Sofia Sans, four text sizes with a 13px floor via a codemod plus sweep test, player photo and team logo components, and the Style Bible as an admin page."
type: plan
status: active
phase: null
owner: james
tags: [design-system]
links: [DOC-032, DOC-027]
updated: 2026-11-10
---

# Style Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole app follow the Style Bible: Sofia Sans, four text sizes with nothing under 13px, nine colors including a Field color for inputs, real player photos and team logos, and the Style Bible available to admins in the app.

**Architecture:**
- **Colors, fonts and sizes** are CSS custom properties in `client/src/components/aurora/aurora.css` (signed-in shell) and `client/src/index.css` (pre-auth pages). Old token names stay as aliases, so no call site changes for color.
- **Tailwind named sizes** are remapped in `tailwind.config.js` `theme.extend.fontSize`.
- **Hard-coded sizes** (Tailwind arbitrary classes, inline `fontSize`, CSS `font-size`) are rewritten by a one-off codemod. A sweep test keeps them from coming back.
- **Photos and logos** are two shared components.
- **The Style Bible** is a static file under `client/public/style-bible/`, served with no-cache, and framed by an admin page.

**Tech Stack:** React 18, Vite 5, Tailwind 3.3, Vitest, Express (helmet CSP), Node ESM scripts.

**Spec:** `docs/superpowers/specs/2026-11-10-style-foundation-design.md` (DOC-032). Visual reference: Style Bible artifact https://claude.ai/artifact/UDWjhsrCsDKxovbSjkyPXc. Its source is at `/private/tmp/claude-501/-Users-jameschang-Projects-thefantasticleagues/f86c0270-f0a2-49b7-9f7b-c175dcfb5669/scratchpad/style-bible/style-bible.html` (Task 6 copies it into the repo).

## Global Constraints

- Work in the worktree `/Users/jameschang/Projects/thefantasticleagues/tfl-style-foundation` on branch `feat/style-foundation` (based on `origin/main` 36f0c7a2).
- **Text sizes, the only ones allowed:**
  - caption **13px**
  - small **15px**
  - body **17px**
  - title **24px**
  - display **32px**, big numbers only
  - anything **≥ 40px** is left as-is

  Nothing under 13px anywhere in `client/src`.
- **Snap rule, used by the codemod and the sweep alike:**
  - ≤ 13.5 → 13
  - ≤ 15.5 → 15
  - ≤ 20 → 17
  - ≤ 28 → 24
  - < 40 → 32
  - ≥ 40 unchanged

  rem/em values convert at 16px per rem.
- **Colors (light / dark), exactly:**

  | Token | Light | Dark |
  |---|---|---|
  | page `--am-bg` | `#ded0a8` | `#341b1e` |
  | card `--am-surface` | `#fbf7ec` | `#5a3337` |
  | line `--am-border` | `#c9b98c` | `#7a4a4f` |
  | text `--am-text` | `#15171a` | `#f6f7f4` |
  | muted `--am-text-muted` | `#5e5747` | `#c8b9b2` |
  | accent `--am-accent` | `#990000` | `#ffcc00` |
  | on-accent `--am-on-accent` | `#ffffff` | `#2a1a00` |
  | good `--am-positive` | `#2a5f2a` | `#a6e3b0` |
  | alert `--am-negative` | `#8a3a00` | `#ffb38a` |
  | field `--am-field` | `#ffffff` | `#1f0e10` |
  | field line `--am-field-line` | `#8a7a4f` | `#b08488` |
  | chip `--am-chip` | `#ece3c8` | `#4a2629` |
- **Aliases** (each becomes a `var()` of a canonical token):

  | Alias | Points to |
  |---|---|
  | `--am-surface-alt` | `--am-chip` |
  | `--am-surface-strong` | `--am-chip` |
  | `--am-chip-strong` | `--am-chip` |
  | `--am-surface-faint` | `--am-surface` |
  | `--am-border-strong` | `--am-field-line` |
  | `--am-text-faint` | `--am-text-muted` |
  | `--am-warning` | `--am-negative` |
  | `--am-accent-2` | `--am-accent` |
  | `--am-cardinal` | `--am-accent` |
- **Fonts:** `"Sofia Sans"` for text and `"Sofia Sans Condensed"` for display/headings, weights 400;600;700, from Google Fonts. Each stack ends in `system-ui, sans-serif`.
- Feature isolation (ADR-015): no new cross-feature imports. Shared components go in `client/src/components/shared/` and helpers in `client/src/lib/`.
- No modals. Don't rename `--am-*` / `--lg-*` call sites. Don't delete auction Legacy files (step F).
- Run `npm run docs:refresh` before every push. Never commit `docs/under-the-hood/system-status.md`.
- Browser verification is mandatory before the PR (Task 7). Prod is not touched by this plan.

## Review Focus

1. **Pre-auth pages** (`/login`, `/signup`) render outside `.aurora-theme`. They must get the new font and colors from `index.css` too, not keep Inter and the old page color. (Test in Task 1 and Task 2.)
2. **Conditional inline sizes** like `fontSize: compact ? 10 : 11` (`WireListRow.tsx:139`). The codemod must snap every number in the expression, and the sweep must catch any it misses. (Task 4 tests.)
3. **SVG and chart sizes** (Recharts `tick={{ fontSize: 10 }}`) must stay numbers. A `"var(--…)"` string there renders at the browser default. (Task 4 test: the codemod emits numbers.)
4. **Image failure loops:** a broken headshot URL must fall back to initials once, not re-request forever. An unknown team code (`"FA"`, `"TOT"`, an AL team) must render text only. (Task 5 tests.)
5. **Bigger text overflowing fixed-width boxes** on phone (Standings at 440px, the commissioner hub, bottom tabs). Caught in Task 7's browser pass; fix by letting the box grow or wrap, not by shrinking text.

---

### Task 1: Nine colors

**Files:**
- Modify: `client/src/components/aurora/aurora.css` (the `.aurora-theme` light block, the `.aurora-theme.dark, .dark .aurora-theme` block, and the `--lg-*` redirect block: `--lg-input-bg` → `var(--am-field)`, `--lg-input-border` → `var(--am-field-line)`)
- Modify: `client/src/index.css` (`:root` and `.dark` `--lg-*` values used by pre-auth pages: `--lg-bg-page`, `--lg-bg-card`, `--lg-text-*`, `--lg-accent`, `--lg-input-bg`, `--lg-input-border`, `--lg-border-*`, set to the Global Constraints values)
- Modify: `client/src/components/aurora/__tests__/tokenContrast.test.ts`
- Modify: secondary buttons, which today use the card color and vanish on cards:
  - `client/src/index.css:485-495`: `.lg-button-secondary` gets `background: var(--lg-tint)` and `border-color: var(--lg-input-border)`.
  - `client/src/components/ui/button.tsx`: in the `secondary` and `outline` variants, `bg-[var(--lg-glass-bg)]` / `liquid-glass` becomes `bg-[var(--lg-tint)] border border-[var(--lg-input-border)]`.
- Test: `client/src/components/ui/__tests__/buttonColors.test.ts` (new). Read the two files as text. Expect `.lg-button-secondary` to contain `var(--lg-tint)`, and the `secondary` and `outline` variant strings to contain `bg-[var(--lg-tint)]` and not `--lg-glass-bg)]`. Add it to Step 1. It must fail in Step 2 and pass in Step 4.

**Interfaces:**
- Produces: tokens `--am-field` and `--am-field-line` (new). Later tasks and steps B–G style inputs with them.

- [ ] **Step 1: Update the test first.** In `tokenContrast.test.ts`:
  - Set `BACKGROUNDS = ["--am-bg", "--am-surface", "--am-chip", "--am-field"]`, with foregrounds `--am-text`, `--am-text-muted`, `--am-accent`, `--am-positive` and `--am-negative`, each at ≥ 4.5:1 in both modes. Alias tokens aren't hex, so drop `--am-surface-alt` from the backgrounds.
  - Replace the `--am-border-strong` check with `--am-field-line on --am-surface >= 3:1` and `--am-field-line on --am-field >= 3:1`.
  - Change the spec-value checks to `light --am-bg "#ded0a8"`, `dark --am-bg "#341b1e"`, `light --am-surface "#fbf7ec"` and `dark --am-surface "#5a3337"`, and the `--lg-bg-page` checks to the same page values.
  - Add `it("retired names alias the nine")`: in both blocks, `--am-surface-alt === "var(--am-chip)"`, `--am-border-strong === "var(--am-field-line)"`, `--am-text-faint === "var(--am-text-muted)"`, `--am-warning === "var(--am-negative)"`, and the other aliases in Global Constraints.
  - Change the redirect expectations to `--lg-input-bg: var(--am-field)` and `--lg-input-border: var(--am-field-line)`.
- [ ] **Step 2: Run** `cd client && npx vitest run src/components/aurora/__tests__/tokenContrast.test.ts`. Expected: FAIL on the spec values and on `--am-field` not found.
- [ ] **Step 3: Set the values** in `aurora.css` and `index.css` exactly as in Global Constraints, and make the two secondary-button edits. Also update the header comment: drop "Inter only" and note "Sofia Sans; nine colors; see DOC-032".
- [ ] **Step 4: Run** the same test. Expected: PASS. Then run `npx vitest run src/components/aurora` and confirm `onAccentSweep` still passes.
- [ ] **Step 5: Commit** `feat(theme): nine-color palette with Field color for inputs (DOC-032)`.

### Task 2: Sofia Sans

**Files:**
- Modify: `client/index.html:38-41` (replace the Inter link with `https://fonts.googleapis.com/css2?family=Sofia+Sans:wght@400;600;700&family=Sofia+Sans+Condensed:wght@400;600;700&display=swap`, and update the comment)
- Modify: `client/src/components/aurora/aurora.css`: `--am-display: "Sofia Sans Condensed", "Sofia Sans", system-ui, sans-serif;` and `--am-body: "Sofia Sans", system-ui, sans-serif;`
- Modify: `client/src/index.css:107`: `--lg-font-family: "Sofia Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;`
- Modify: `client/tailwind.config.js`: `theme.extend.fontFamily = { sans: ['"Sofia Sans"', 'system-ui', 'sans-serif'], display: ['"Sofia Sans Condensed"', '"Sofia Sans"', 'system-ui', 'sans-serif'] }`
- Test: `client/src/components/aurora/__tests__/fontStack.test.ts` (new)

- [ ] **Step 1: Write `fontStack.test.ts`** (read the files with `readFileSync`, like `tokenContrast.test.ts`):
  - `index.html contains "family=Sofia+Sans:wght@400;600;700" and "family=Sofia+Sans+Condensed"`
  - `index.html does not contain "family=Inter"`
  - `aurora.css --am-body starts with "\"Sofia Sans\""`
  - `aurora.css --am-display starts with "\"Sofia Sans Condensed\""`
  - `index.css --lg-font-family starts with "\"Sofia Sans\""`
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Make the edits** listed under Files.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(theme): Sofia Sans + Sofia Sans Condensed`.

### Task 3: Type scale tokens and Tailwind sizes

**Files:**
- Modify: `client/src/components/aurora/aurora.css` (`.aurora-theme`) and `client/src/index.css` (`:root`): add `--am-t-caption: 13px; --am-t-small: 15px; --am-t-body: 17px; --am-t-title: 24px; --am-t-display: 32px;`. In `index.css`, remap `--lg-font-size-xs: 13px; -sm: 15px; -base: 17px; -lg: 17px; -xl: 24px; -2xl: 24px; -3xl: 32px`.
- Modify: `client/tailwind.config.js`: `theme.extend.fontSize`:

  ```
  xs: ['13px','18px'], sm: ['15px','20px'], base: ['17px','24px'], lg: ['17px','24px'],
  xl: ['24px','30px'], '2xl': ['24px','30px'], '3xl': ['32px','38px'], '4xl': ['32px','38px']
  ```

  `5xl` and up are untouched.
- Test: `client/src/components/aurora/__tests__/typeScale.test.ts` (new)

**Interfaces:**
- Produces: CSS tokens `--am-t-caption|small|body|title|display`, and Tailwind classes `text-xs`=13, `text-sm`=15, `text-base`=17, `text-xl`=24, `text-3xl`=32, which Task 4's codemod targets.

- [ ] **Step 1: Write `typeScale.test.ts`:**
  - Import `tailwind.config.js` via dynamic `import()`. Expect `fontSize.xs[0] === "13px"`, `sm[0] === "15px"`, `base[0] === "17px"`, `xl[0] === "24px"`, `"3xl"[0] === "32px"`.
  - Parse `aurora.css` `.aurora-theme`. Expect `--am-t-caption === "13px"`, `--am-t-small === "15px"`, `--am-t-body === "17px"`, `--am-t-title === "24px"`, `--am-t-display === "32px"`.
  - Parse `index.css` `:root`. Expect `--lg-font-size-xs === "13px"`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Make the edits.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(theme): four-size type scale (13/15/17/24 + 32 display)`.

### Task 4: Codemod and sweep test (the 13px floor)

**Files:**
- Create: `client/scripts/normalize-font-sizes.mjs`. It exports `snapPx(px: number): number`, `rewriteSource(text: string, kind: "tsx" | "css"): { text: string; changes: number }`, and a CLI that walks `client/src` (skipping `__tests__`, `*.test.*` and `node_modules`), rewrites files in place, and prints `<file>: <n>` plus a total.
- Create: `client/scripts/__tests__/normalize-font-sizes.test.mjs`. Add `scripts/**/*.test.mjs` to `client/vitest.config.ts` `include` if it isn't matched.
- Create: `client/src/components/aurora/__tests__/textSizeSweep.test.ts`
- Modify: every file the codemod touches (about 80 TSX files with arbitrary classes, plus files with inline or CSS sizes)

**Interfaces:**
- Consumes: Task 3's Tailwind sizes.
- Produces: `snapPx`. Its rule is in Global Constraints.

`rewriteSource` rewrites exactly three shapes:
1. **TSX** `text-[Npx]` / `text-[Nrem]` → a named class:
   - 13 → `text-xs`
   - 15 → `text-sm`
   - 17 → `text-base`
   - 24 → `text-xl`
   - 32 → `text-3xl`
   - snapped ≥ 40 → left as-is
2. **TSX** `fontSize:` followed by an expression up to the next top-level `,` or `}`: every bare numeric literal and every `"Npx"`/`'Npx'`/`"Nrem"` string in that expression is replaced by the snapped **number**, for example `fontSize: compact ? 10 : 11` → `fontSize: compact ? 13 : 13`. Variables and `var(...)` are left alone.
3. **CSS** `font-size: Npx|Nrem` → `font-size: <snapped>px`.

- [ ] **Step 1: Write the codemod tests:**
  - `snapPx`: 8→13, 10.5→13, 13→13, 14→15, 16→17, 18→17, 20→17, 22→24, 30→32, 34→32, 48→48.
  - `rewriteSource('className="text-[10px] font-bold"', "tsx").text === 'className="text-xs font-bold"'`
  - `rewriteSource('className="text-[14px]"', "tsx").text === 'className="text-sm"'`
  - `rewriteSource('style={{ fontSize: 11, color: "x" }}', "tsx").text === 'style={{ fontSize: 13, color: "x" }}'`
  - `rewriteSource('style={{ fontSize: compact ? 10 : 16 }}', "tsx").text === 'style={{ fontSize: compact ? 13 : 17 }}'`
  - `rewriteSource('tick={{ fontSize: 10 }}', "tsx").text === 'tick={{ fontSize: 13 }}'`: a number, not a string.
  - `rewriteSource("fontSize: '0.7rem'", "tsx").text === "fontSize: 13"`
  - `rewriteSource('fontSize: size', "tsx").changes === 0`
  - `rewriteSource('.x{font-size:11px}', "css").text === '.x{font-size:13px}'`
  - `rewriteSource('.x{font-size: 48px}', "css").changes === 0`
- [ ] **Step 2: Run** `cd client && npx vitest run scripts/__tests__/normalize-font-sizes.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `normalize-font-sizes.mjs`.** Use regexes on the three shapes. For shape 2, scan from `fontSize:` while tracking `()`/`{}`/`[]` depth to find where the expression ends.
- [ ] **Step 4: Run** the codemod tests. Expected: PASS. Commit `chore(theme): font-size codemod (snap to 13/15/17/24/32)`.
- [ ] **Step 5: Write `textSizeSweep.test.ts`.** It walks `client/src` (`*.tsx`, `*.ts`, `*.css`, excluding tests). It fails, listing `file:line`, if it finds:
  - any `text-[<n>px|rem]` whose snapped value is under 40
  - any number in a `fontSize:` expression not in {13, 15, 17, 24, 32} and under 40
  - any CSS `font-size` px value not in that set and under 40

  Name it `it("no text sizes outside 13/15/17/24/32")`.
- [ ] **Step 6: Run** the sweep. Expected: FAIL with roughly 1,300 offenders.
- [ ] **Step 7: Run** `cd client && node scripts/normalize-font-sizes.mjs`. Expected: per-file counts and a total of roughly 1,300.
- [ ] **Step 8: Run** the sweep again. Expected: PASS. If anything is left, it's a shape outside the three. Fix those by hand to a scale value, and note each one in the commit body.
- [ ] **Step 9: Run** `cd client && npx vitest run && npx tsc --noEmit -p . > /tmp/tsc.log 2>&1; echo $?` and read the full tsc log, not a tail. Expected: tests pass and tsc exits 0. Tests that assert an old pixel size get updated to the snapped value, and each such update is listed in the commit body.
- [ ] **Step 10: Commit** `feat(theme): enforce 13px floor app-wide (codemod run + sweep test)`.

### Task 5: Player photos and team logos

**Files:**
- Create: `client/src/lib/mlbImages.ts`, exporting:
  - `playerHeadshotUrl(mlbId: number | string, width?: 120 | 213 | 426): string`. Pattern: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${width},q_auto:best/v1/people/${mlbId}/headshot/67/current`. Default width 213.
  - `MLB_TEAM_IDS: Record<string, number>`, covering all 30 clubs (`ARI 109, ATL 144, BAL 110, BOS 111, CHC 112, CWS 145, CIN 113, CLE 114, COL 115, DET 116, HOU 117, KC 118, LAA 108, LAD 119, MIA 146, MIL 158, MIN 142, NYM 121, NYY 147, OAK 133, PHI 143, PIT 134, SD 135, SF 137, SEA 136, STL 138, TB 139, TEX 140, TOR 141, WSH 120`) plus aliases `AZ→109, CHW→145, KCR→118, SDP→135, SFG→137, TBR→139, WSN→120, ATH→133`.
  - `teamLogoUrl(abbr: string): string | null`, which returns `https://www.mlbstatic.com/team-logos/${id}.svg`, or `null` when the code is unknown.
- Create: `client/src/components/shared/PlayerFace.tsx`, with `PlayerFace({ mlbId, name, size = 40 }: { mlbId?: number | string | null; name: string; size?: 30 | 40 | 60 | 84 })`.
  - Renders a round `<img>` (`object-fit: cover; object-position: 50% 15%`, `alt=""`) with a `--am-chip` background and a `--am-border` border.
  - On `onError` it switches **once** to an initials circle (state flag, never re-sets `src`).
  - A missing `mlbId` renders initials directly.
- Create: `client/src/components/shared/TeamLogo.tsx`, with `TeamLogo({ abbr, size = 22, showCode = true }: { abbr: string; size?: number; showCode?: boolean })`.
  - Renders the logo on a white circle with a `--am-border` border, followed by the code at caption size.
  - An unknown code, or an image that fails, renders only the code.
- Modify: `server/src/index.ts:134`: add `"https://www.mlbstatic.com"` to `imgSrc`.
- Modify: replace the inline headshot URL strings with `playerHeadshotUrl(...)` in:
  - `features/auction/components/AuctionStage.tsx` (lines 250 and 253)
  - `MyNominationQueue.tsx:44`
  - `AuctionReplay.tsx:105, 326`
  - `features/players/pages/InjuredListPage.tsx:37`

  Leave the `*Legacy.tsx` files alone.
- Test: `client/src/lib/__tests__/mlbImages.test.ts`, `client/src/components/shared/__tests__/PlayerFace.test.tsx`, `client/src/components/shared/__tests__/TeamLogo.test.tsx`

**Interfaces:**
- Produces: `PlayerFace`, `TeamLogo`, `playerHeadshotUrl` and `teamLogoUrl`. Steps B–G use these on every player and team row.

- [ ] **Step 1: Write the tests:**
  - `playerHeadshotUrl(660271)` contains `/people/660271/headshot/67/current` and `w_213`.
  - `teamLogoUrl("LAD") === "https://www.mlbstatic.com/team-logos/119.svg"`, `teamLogoUrl("AZ")` ends with `/109.svg`, and `teamLogoUrl("FA") === null`.
  - `PlayerFace` with `mlbId` renders an img whose src is `playerHeadshotUrl`. After `fireEvent.error(img)` it renders `"SO"` for name "Shohei Ohtani" and no img. Firing error again doesn't throw.
  - `PlayerFace` without `mlbId` renders initials only.
  - `TeamLogo abbr="TOT"` renders the text `TOT` and no img. `TeamLogo abbr="SD"` renders an img with the `/135.svg` src and the text `SD`.
- [ ] **Step 2: Run** `cd client && npx vitest run src/lib/__tests__/mlbImages.test.ts src/components/shared/__tests__/PlayerFace.test.tsx src/components/shared/__tests__/TeamLogo.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above, then swap the four call sites to `playerHeadshotUrl`. Their fallback `src` lines become `playerHeadshotUrl("generic")`, which keeps the existing behavior.
- [ ] **Step 4: Run** the same tests plus `npx vitest run src/features/auction src/features/players` and `cd ../server && npx vitest run`. Expected: PASS. Run `node scripts/check-feature-isolation.mjs` from the repo root. Expected: no new violations.
- [ ] **Step 5: Commit** `feat(players): PlayerFace + TeamLogo with MLB images and safe fallbacks; allow www.mlbstatic.com in CSP`.

### Task 6: Style Bible as an admin page

**Files:**
- Create: `client/public/style-bible/index.html`. Copy it from the scratchpad source named in the header, then:
  - wrap it in a full `<!doctype html><html lang="en"><head>` with charset, viewport and `<meta name="robots" content="noindex">`
  - move the inline `<script>` into `client/public/style-bible/bible.js`, loaded with `<script src="bible.js" defer>`
  - change every `img/pNNN.jpg` to `playerHeadshotUrl(NNN, 213)`'s literal URL
  - change every `img/tNNN.svg` to `https://www.mlbstatic.com/team-logos/NNN.svg`
  - change gallery links (`claude.ai/artifact/WaFaZ9ngtqcHXzdopU4dwS#…`) to plain text "(screenshot gallery)", because the gallery is a private artifact
- Create: `client/public/style-bible/bible.js`
- Modify: `server/src/index.ts`. Before the main `express.static(clientDistPath…)` (lines 638 and 645), mount `app.use('/style-bible', express.static(path.join(<dist>, 'style-bible'), { maxAge: 0, index: 'index.html' }))` for both dist paths, following the `serveSWNocache` pattern.
- Create: `client/src/features/admin/pages/AdminStyleBible.tsx`.
  - Non-admins (`!user?.isAdmin`) see "Admins only." and no iframe.
  - Admins see the title "Style Bible", a link "Open full page ›" to `/style-bible/index.html` (`target="_blank"`), and `<iframe title="Style Bible" src="/style-bible/index.html" style="width:100%;height:calc(100vh - 140px);border:0">`.
- Modify: `client/src/App.tsx`: lazy route `<Route path="/admin/style-bible" element={<AdminStyleBible />} />` next to the other admin routes (line 224).
- Modify: `client/src/lib/navModel.ts` `ACCOUNT_LINKS`: for admins, push `{ to: "/admin/style-bible", label: "Style Bible" }` after Admin.
- Test: `client/src/features/admin/__tests__/AdminStyleBible.test.tsx`, and add a case to `client/src/lib/__tests__/navModel.test.ts`.

- [ ] **Step 1: Write the tests:**
  - `ACCOUNT_LINKS(true)` includes `{ to: "/admin/style-bible", label: "Style Bible" }`, and `ACCOUNT_LINKS(false)` doesn't.
  - `AdminStyleBible` with a non-admin user renders "Admins only." and `queryByTitle("Style Bible")` is null.
  - `AdminStyleBible` with an admin user renders an iframe titled "Style Bible" with `src="/style-bible/index.html"`.

  Mock `useAuth` the way other admin page tests do. Grep `features/admin/__tests__` for the pattern.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** the tests. Expected: PASS. Then:
  - `cd client && npm run build`. Expected: `dist/style-bible/index.html` and `dist/style-bible/bible.js` exist.
  - `grep -c "<script>" dist/style-bible/index.html`. Expected: 0 inline scripts.
- [ ] **Step 5: Commit** `feat(admin): Style Bible at /admin/style-bible (static, no-cache, admin-linked)`.

### Task 7: Docs, browser check, PR

**Files:**
- Modify:
  - `CLAUDE.md` DESIGN bullet: replace "Inter only, warm taupe / medium gray, outfield-green accent" with "Sofia Sans, four text sizes (13px floor), nine colors incl. Field; source of truth `/admin/style-bible` (DOC-032)".
  - `docs/aurora-design-system.md`: a top note pointing to DOC-032 and `/style-bible`.
  - `docs/TESTING.md`: list `fontStack`, `typeScale` and `textSizeSweep`.

- [ ] **Step 1: Make the doc edits.** Run `npm run docs:refresh` and then `git checkout -- docs/under-the-hood/system-status.md`.
- [ ] **Step 2: Run the full gates:**
  - `cd client && npx vitest run && npx tsc --noEmit -p . && npm run build`
  - `cd ../server && npx vitest run && npx tsc --noEmit`
  - `node scripts/check-feature-isolation.mjs` from the root

  Read full output. Expected: all pass.
- [ ] **Step 3: Browser check** on local Supabase, per memory `local_browser_check_setup.md`. Check phone width (440px) and desktop (1440) in light and dark:
  - `/login`: Sofia Sans, the new page color
  - `/`: Today
  - `/season`: Standings. No clipped team names; rows may wrap.
  - `/players`: player rows
  - `/commissioner/5`: the hub
  - `/teams/<code>`: a team page
  - `/auction-results`
  - `/admin/style-bible` as an admin: the iframe loads, photos and logos show, and the console shows no CSP errors

  Confirm in DevTools: computed body `font-family` starts with "Sofia Sans", no element renders under 13px, and inputs have the Field background. Fix any overflow by letting the box grow, and commit each fix.
- [ ] **Step 4: Commit, push and open the PR** against `main`. Title: `feat(theme): style foundation — Sofia Sans, 13px floor, nine colors, player photos, Style Bible (UX step A)`. The body links DOC-032 and DOC-033, lists the codemod total, the browser check, and the MLB image licensing note.
