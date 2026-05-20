# Score Sheet Design System — FBST Style Sheet

> **Filename note:** This file was originally `aurora-design-system.md` and documented the Aurora design experiment (iridescent palette, glassmorphism, Space Grotesk). Aurora shipped in April 2026 as a proof-of-concept and was replaced by Score Sheet in May 2026 (PR #346). The filename is preserved so existing cross-references don't break. The Aurora reference is archived in the **Design History** section at the bottom.

The Fantastic Leagues uses the **Score Sheet** design system. Scorebook / scoreboard aesthetic: flat paper, Inter only, warm taupe light mode, medium-gray dark mode, dark-green primary accent.

**Source files** (don't ad-hoc colors — always reference these):
- `client/src/components/aurora/aurora.css` — all `--am-*` CSS tokens (scoped to `.aurora-theme`)
- `client/src/components/aurora/atoms.tsx` — React primitives (Glass, IridText, Chip, SectionLabel, etc.)
- `client/src/components/aurora/AuroraShell.tsx` — desktop site chrome (56px sticky top nav + horizontal tabs)
- `client/src/mobile/MobileShell.tsx` — mobile chrome (50px top bar + left-slide drawer)

> **CSS class naming:** The wrapper class `.aurora-theme` and token prefix `--am-*` are kept from the Aurora era so that hundreds of existing callsites don't need touching. The visual identity is Score Sheet; the code names are legacy Aurora. Don't rename them unless doing a full codebase sweep.

**Last updated:** 2026-05-19 (PR #346)

---

## Identity

- **Design name:** Score Sheet
- **Aesthetic:** flat paper / scorebook — no gradients, no glassmorphism, no iridescent shimmer
- **Font:** Inter only (`--am-display` and `--am-body` both set to Inter; Space Grotesk removed)
- **Light mode:** soft taupe paper (`#ebe6db` page / `#f6f2e6` surface)
- **Dark mode:** medium-gray page (`#3d434b`) + near-black cards (`#222630`)
- **Primary accent:** outfield green (`#1f5a3d` light / `#82c896` dark)
- **Numerics:** `font-variant-numeric: tabular-nums` on every `td` and `th` (built into `aurora.css`)

---

## Colors

All tokens are scoped to `.aurora-theme`. Light/dark auto-switch via `.aurora-theme.dark` or `.dark .aurora-theme`. Use the token — never raw hex.

### Backgrounds & surfaces

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--am-bg` | `#ebe6db` | `#3d434b` | Page background |
| `--am-surface` | `#f6f2e6` | `#222630` | Card / table background |
| `--am-surface-alt` | `#e3ddcd` | `#292d35` | Zebra row, table header |
| `--am-surface-strong` | `#e3ddcd` | `#292d35` | alias → surface-alt |
| `--am-surface-faint` | `#f6f2e6` | `#222630` | compat alias → surface |

### Borders

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--am-border` | `#c2bbab` | `#4a5058` | Hairline borders on cards, chips |
| `--am-border-strong` | `#8e8775` | `#6a7079` | Nav active underline, dividers |

### Text

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--am-text` | `#1c1f1a` | `#f1f2ec` | Primary body |
| `--am-text-muted` | `#4a4d44` | `#d0d2c8` | Secondary copy, labels |
| `--am-text-faint` | `#60635a` | `#c0c5cb` | Eyebrows, captions — WCAG AA |

### Accent & status

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--am-accent` | `#1f5a3d` | `#82c896` | Primary action / active tab indicator |
| `--am-accent-2` / `--am-cardinal` | `#1a3a5a` | `#8ec1e6` | Secondary — activity tags, navy |
| `--am-positive` | `#2e6a2e` | `#92d292` | +stat deltas, success states |
| `--am-negative` | `#9b2c2c` | `#e89a9a` | −stat deltas, error states |

### Chips

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--am-chip` | `#dad3bf` | `#303640` | Filter pill / inactive state |
| `--am-chip-strong` | `#c8c0a8` | `#3b4047` | Active/selected pill |

### Gradient tokens (removed)

`--am-glow-1/2/3`, `--am-irid`, `--am-ring`, `--am-ai-strip` are all set to `none` / neutral fallbacks. Score Sheet is flat — no gradient layers. Any component that still reads these tokens renders with a plain fallback.

---

## Typography

Inter only. No separate display font.

```css
--am-display: "Inter", system-ui, sans-serif;
--am-body:    "Inter", system-ui, sans-serif;
```

### Scale conventions

| Use | Size | Weight | Notes |
|---|---|---|---|
| Page heading | 24–28px | 600 | `var(--am-text)` |
| Section eyebrow | 10.5px | 700 | uppercase, 0.4 letter-spacing, `--am-text-faint` |
| Default body | 13px | 400 | `var(--am-body)` |
| Table cell | 12px | 400–500 | tabular-nums auto |
| Caption / note | 11px | 400 | `--am-text-faint` |

Eyebrow convention: prefix with `✦ ` for top-level page sections (`✦ COMMISSIONER`, `✦ ACTIVITY`). Use the `<SectionLabel>` atom.

---

## Atoms

React primitives exported from `client/src/components/aurora/atoms.tsx`.

| Atom | Renders |
|---|---|
| `<Glass padded strong>` | Solid surface card: `--am-surface` bg, 1px `--am-border`, 6px radius. `strong` → `--am-surface-alt`. |
| `<IridText size weight>` | Text in `--am-accent` color (was iridescent gradient in Aurora era). |
| `<SectionLabel>` | 10.5px uppercase eyebrow in `--am-text-faint`. |
| `<Chip strong color>` | 11px pill tag: `--am-chip` bg, 1px border. |
| `<Dot color>` | 6×6 inline circle. |
| `<Sparkline data w h>` | SVG trend line. |
| `<AmbientBg>` | No-op flat fill (gradient removed; kept so callsites compile). |
| `<IridescentRing>` | Plain 1px border wrapper (iridescent ring removed). |

### Standard page layout pattern

```tsx
<div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
  <Glass strong>
    <SectionLabel>✦ Page Name</SectionLabel>
    <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--am-text)", margin: 0 }}>
      Page Heading
    </h1>
    <p style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
      One-sentence subtitle.
    </p>
  </Glass>

  {/* tab pills, content, glass cards */}
</div>
```

---

## Tables

Shared table components: `ThemedTable` family in `client/src/components/ui/table.tsx` and `ThemedTable.tsx`.

### Density tiers

| Tier | Row height | Font | Use |
|---|---|---|---|
| `compact` | ~20px | 11px | Dense scoreboard-style |
| `default` | ~26px | 12px | Standard data tables |
| `comfortable` | ~32px | 13px | Summary tables |

Pass via `<ThemedTable density="default">`.

### Conventions

- **Tabular numerals** mandatory on all number cells (auto via `aurora.css` `td`/`th` rule)
- **Wrap tables in Glass**: `<Glass padded={false}><ThemedTable>…</ThemedTable></Glass>`
- **Sortable headers**: use `<SortableHeader>` from `ui/SortableHeader.tsx` — accessible (`aria-sort`, keyboard), reads `--lg-accent` → `--am-accent`
- **Zebra striping**: opt-in via `zebra={true}` — most Score Sheet tables skip it; the `--am-surface-alt` header provides enough separation

### Legacy `--lg-*` redirects

All pre-Score Sheet components still reference `--lg-*` tokens. `aurora.css` remaps them to `--am-*` equivalents inside `.aurora-theme`. **Don't touch these redirects** — they're what makes every legacy ThemedTable automatically inherit Score Sheet colors.

---

## Layout

### Container widths

| Page type | maxWidth |
|---|---|
| Standard data page | 1200px |
| Compact info page (Status, Payouts, Roadmap) | 1100px |
| Wide dashboard (AdminDashboard, Archive) | 1280px |

### AuroraShell padding

The shell's main content area is padded to clear the 56px sticky header. Don't add page-level top padding inside AuroraShell-wrapped pages.

### Spacing

- Page section gap: 16px (flex column)
- Glass internal padding: 16px default (Score Sheet reduced from Aurora's 20px)
- Hero subtitle margin-top: 6px

---

## Chrome

### Desktop (≥768px) — AuroraShell

- 56px sticky `<header>` with horizontal text tabs
- Active tab: 2px solid `--am-accent` underline
- More popover: secondary routes (AI, Commissioner, Wire List, etc.)
- Logo block left; season chip + user chip right

### Mobile (<768px) — MobileShell

- 50px top app bar: hamburger | league name | theme toggle
- Left-slide drawer: 260px, always-mounted in DOM via CSS `transform` (not conditional render — keeps tests stable)
- Drawer has all nav links; no bottom dock

---

## Buttons

### Standard chip button

```css
background: var(--am-chip);
color: var(--am-text);
border: 1px solid var(--am-border);
border-radius: 99px;
padding: 6px 12px;
font-size: 12px;
font-weight: 600;
```

Active/selected: `background: var(--am-chip-strong); border-color: var(--am-border-strong);`

### Primary CTA (execute / confirm)

```css
background: var(--am-accent);
color: white;
border: none;
border-radius: 6px;
padding: 10px 18px;
font-size: 14px;
font-weight: 600;
```

---

## What NOT to do

- **Don't ad-hoc colors.** If you're writing `#1f5a3d`, write `var(--am-accent)` instead.
- **Don't redefine `--lg-*` tokens** inside `.aurora-theme` scope — they're already redirected. Edit the redirect in `aurora.css` if you need a different mapping.
- **Don't rename `.aurora-theme` or `--am-*`** without a full codebase sweep — hundreds of callsites depend on them.
- **Don't add gradient, glassmorphism, or blur** — Score Sheet is flat. If you're writing `backdrop-filter: blur(...)` you're adding Aurora aesthetics back in.
- **Don't use Space Grotesk** — it was removed from the font stack in PR #346.

---

## Pre-auth pages (outside `.aurora-theme`)

Login, Signup, ForgotPassword, ResetPassword, DiscoverLeagues still use the legacy `--lg-*` defaults from `index.css` and `client/src/index.css`. They inherit a flat gray dark mode background via `.dark { --lg-bg-page: #3d434b }` which was updated in PR #346 to match Score Sheet.

---

## Design History

Score Sheet replaced Aurora in PR #346 (2026-05-19). Aurora was the initial design exploration.

| Phase | Period | Identity |
|---|---|---|
| Legacy AppShell | Before Apr 2026 | Sidebar nav, Tailwind utility classes, no design system |
| **Aurora** (experiment) | Apr 2026 — Sessions 80–85 | Iridescent teal→indigo→magenta gradient, 28px glassmorphism blur, Space Grotesk display font, dark-first, AmbientBg 3-layer glow mesh |
| **Score Sheet** (current) | May 2026 → | Flat paper, Inter only, warm taupe / medium gray, outfield-green accent, no blur |

The Aurora → Score Sheet transition kept all CSS class names (`.aurora-theme`, `--am-*`) to avoid touching hundreds of callsites. Only the token values changed.

### Why Aurora didn't ship long-term

Aurora looked great in isolation but created practical problems:
- Glassmorphism blur over data-dense tables was visually noisy
- Dark-first iridescent palette had poor contrast on stat-heavy rows
- Space Grotesk at light weight (300) was harder to read at small sizes
- The aesthetic read as "tech product" not "baseball scorecard"

Score Sheet solves these by being unapologetically sports-print: flat paper, solid borders, Inter at sensible weights, green accent.

### Aurora design archives

The original design handoff files are preserved at `docs/design/aurora-mobile/` for historical reference. They are not used by the current codebase.
