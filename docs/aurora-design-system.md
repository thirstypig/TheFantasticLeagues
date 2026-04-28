# Aurora Design System — FBST Style Sheet

The Fantastic Leagues uses the **Aurora** design system from [claude.ai/design](https://claude.ai/design)'s `Aurora System.html` handoff. This doc is the canonical reference for colors, typography, spacing, atoms, tables, and motion. Every Aurora page reads from these tokens — when you change a value here, the entire site picks it up.

**Source files** (don't ad-hoc colors — always reference these):
- `client/src/components/aurora/aurora.css` — CSS variables (light + dark, all `--am-*` tokens, plus `--lg-*` redirects)
- `client/src/components/aurora/atoms.tsx` — React primitives (Glass, IridText, Chip, Topbar, Dock, etc.)
- `client/src/components/aurora/AuroraShell.tsx` — site-wide chrome (Topbar + Dock + AmbientBg)

**Last updated:** April 28, 2026 (Session 84)

---

## Identity

- **Palette name:** Aurora
- **Iridescence:** teal → indigo → magenta gradient
- **Surface treatment:** glassmorphism (28px blur + 140% saturation)
- **Mode default:** dark-first; light mode is a paper-pale companion
- **Display font:** Space Grotesk (300/400/500/600/700)
- **Body font:** Inter (400/500/600/700)
- **Mono fallback:** system mono (used for labels and numeric tabular display)
- **Numerics:** `font-variant-numeric: tabular-nums` on every number rendered in tables, stat tiles, and IridText

---

## Colors — Aurora tokens

All tokens are scoped to the `.aurora-theme` wrapper. They auto-switch on `.dark`. Use the token, not the raw hex — that way light and dark modes update together.

### Background system

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--am-bg` | `#eef3ff` | `#050a14` | Page background |
| `--am-glow-1` | radial teal at 8% / 0% | radial teal at 8% / 6% | First ambient glow layer |
| `--am-glow-2` | radial purple at 95% / 14% | radial purple at 96% / 14% | Second ambient glow layer |
| `--am-glow-3` | radial magenta at 70% / 100% | radial magenta at 65% / 100% | Third ambient glow layer |

The 3 glow layers + a fine grain overlay (3px dot pattern, 0.4 opacity, mix-blend-mode: overlay) compose the `<AmbientBg />` atom. AuroraShell renders one AmbientBg at the root of every authenticated page.

### Surface system

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--am-surface` | `rgba(255,255,255,0.7)` | `rgba(14,20,36,0.55)` | Standard glass card |
| `--am-surface-strong` | `rgba(255,255,255,0.92)` | `rgba(20,28,48,0.72)` | Hero / focus glass |
| `--am-surface-faint` | `rgba(8,12,28,0.03)` | `rgba(255,255,255,0.03)` | Tinted background inside a card |

### Text scale

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--am-text` | `#0b1230` | `#eaf2ff` | Primary body, hero numbers |
| `--am-text-muted` | `#3a4670` | `#a7b6d6` | Secondary copy, muted labels |
| `--am-text-faint` | `#7682a8` | `#6c7896` | Eyebrows, micro-caption |

### Accent + status

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--am-accent` | `#1d6df0` | `#5cf0d4` | Primary action color (replaces legacy blue across the app) |
| `--am-cardinal` | `#c41a85` | `#ff6db5` | Magenta accent — used in iridescent gradient and waiver dot |
| `--am-positive` | `#0a7a5c` | `#5cf0d4` | Success states, up trends |
| `--am-negative` | `#a3148b` | `#ff6db5` | Error states, down trends |

### Iridescence

| Token | Definition | Usage |
|---|---|---|
| `--am-irid` | `linear-gradient(135deg, #00b894 0%, #2f6df0 35%, #8a2bd6 70%, #d62b9b 100%)` (light) → similar but cooler in dark | Hero numbers (IridText), iridescent rings, dock active glyphs, progress bars |
| `--am-ring` | Subtle iridescent border gradient | `IridescentRing` atom — wrap a Glass to get the signature ringed-glass focus card |
| `--am-ai-strip` | Horizontal teal → blue → magenta gradient at low alpha | `AIStrip` atom background |

### Borders

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--am-border` | `rgba(8,12,28,0.10)` | `rgba(255,255,255,0.10)` | Standard 1px border on Glass + Chip |
| `--am-border-strong` | `rgba(8,12,28,0.18)` | `rgba(255,255,255,0.18)` | Active state border, hero strong border, avatar disc border |

### Chips

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--am-chip` | `rgba(8,12,28,0.05)` | `rgba(255,255,255,0.06)` | Default chip / inactive state |
| `--am-chip-strong` | `rgba(8,12,28,0.10)` | `rgba(255,255,255,0.12)` | Active state, "You" indicator, top-spender background |

---

## Typography

### Display heading

The signature Aurora h1 — every page hero uses this.

```css
font-family: var(--am-display);  /* Space Grotesk */
font-size: 30px;
font-weight: 300;                 /* light weight is the Aurora signature */
line-height: 1.1;
color: var(--am-text);
margin: 0;
```

### IridText

Iridescent gradient text, used for hero numbers (points, dollar amounts, counts).

```css
font-family: var(--am-display);
font-size: 28px;                  /* default — override with size prop */
font-weight: 300;
line-height: 1;
font-variant-numeric: tabular-nums;
background: var(--am-irid);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
background-clip: text;
```

Use the `<IridText>` atom; it accepts `size`, `weight`, and `family` props.

### SectionLabel (eyebrow)

Small uppercase eyebrow above section content. Pair with display heading.

```css
font-size: 10px;
letter-spacing: 1.4px;
text-transform: uppercase;
color: var(--am-text-faint);
font-weight: 600;
margin-bottom: 10px;
```

Convention: prefix with `✦ ` for top-level page eyebrows (`✦ COMMISSIONER`, `✦ ADMIN · USERS`, `✦ ACTIVITY`).

### Body sizes

| Use | Size | Weight | Token |
|---|---|---|---|
| Default body | 13px | 400 | `var(--am-body)` |
| Small body / table cell | 12px | 400-500 | — |
| Caption / muted note | 11px | 400 | `var(--am-text-faint)` |
| Micro-caption / timestamp | 10px | 600 | uppercase, letter-spaced |

---

## Atoms — when to use what

### `<Glass padded?={true} strong?={false}>`
Standard surface card. **Default Aurora bento tile.**
- Border-radius: 24px
- Padding: 20px (toggle `padded={false}` if wrapping legacy chrome that has its own padding)
- Backdrop blur: 28px
- Saturate: 140%
- `strong` prop: uses `--am-surface-strong` for hero / focus content; default uses `--am-surface`

### `<IridescentRing>`
1px iridescent border around a child. Pair with Glass for the signature "ringed glass" focus treatment.

### `<IridText size={36} weight={300}>`
Iridescent gradient text — see Typography section. Use for hero numbers and any "feature number" (point totals, dollar amounts, counts).

### `<SectionLabel>`
Eyebrow label above content sections.

### `<Chip strong?={false} color?>`
Pill-shaped tag. Use for:
- Status indicators (`<Chip strong>You</Chip>` for self-team)
- Filter selectors (with active-state strong variant)
- Inline metadata (auction keeper badges, role pills)

### `<Dot color>`
6×6 colored circle. Common pairing: `<Chip strong><Dot color="var(--am-cardinal)" /> Waivers Fri 2:00 PM</Chip>`

### `<Sparkline data={[1,2,3,4,5]} w={120} h={36}>`
1-D iridescent line chart. Use inline for trends (last-N games points, weekly score history).

### `<AmbientBg />`
Full-bleed background with 3 radial-glow layers + grain. AuroraShell renders one at the page root — don't add another inside content.

### `<Dock items={[...]} extra?={...}>`
Floating bottom-center nav pill. Provided by AuroraShell — don't build your own.

### `<Topbar title subtitle right? onLogoClick? onAvatarClick?>`
Top strip with iridescent square logo, league name, right-side chip slot, iridescent avatar disc. Provided by AuroraShell.

### `<AIStrip subtitle items={[{icon, title, body, cta}]}>`
Horizontal woven AI-suggestion strip. Use inside hero cards for AI insights / recommendations.

---

## Tables

The shared table component is `client/src/components/ui/ThemedTable.tsx` (`ThemedTable`, `ThemedThead`, `ThemedTh`, `ThemedTr`, `ThemedTd`). It wraps shadcn's `<Table>` from `client/src/components/ui/table.tsx`.

### Density tiers

| Tier | Row height | Font | Usage |
|---|---|---|---|
| `compact` (default) | ~20px | 11px | Scoreboard-tight, dashboard real-time stats |
| `default` | ~26px | 12px | Standard data tables (players, standings, stats, auction) |
| `comfortable` | ~32px | 13px | Summary tables with breathing room |

Pass via `<ThemedTable density="default">`.

### Token redirects (Aurora alignment)

Inside `.aurora-theme`, the legacy `--lg-*` table tokens redirect to Aurora equivalents (PR #153). This means **every ThemedTable on the site automatically reads Aurora colors** without per-component edits:

```css
.aurora-theme {
  --lg-table-header-bg: var(--am-chip);                /* chip-toned header */
  --lg-table-header-sticky-bg: rgb(20, 28, 48);        /* opaque match for surface-strong */
  --lg-table-sticky-col-bg: rgb(20, 28, 48);
  --lg-table-border: var(--am-border);                 /* aurora border */
  --lg-table-row-hover: var(--am-chip);                /* aurora hover */
  --lg-text-primary: var(--am-text);
  --lg-text-muted: var(--am-text-muted);
  --lg-accent: var(--am-accent);                       /* sortable headers, hover, active sort */
}
```

### Sortable headers

Use `<SortableHeader>` from `client/src/components/ui/SortableHeader.tsx`. It's accessible (button inside th + aria-sort), keyboard-friendly, and reads `--lg-accent` (which redirects to `--am-accent` inside aurora-theme).

```tsx
<SortableHeader
  sortKey="HR"
  activeSortKey={activeSortKey}
  sortDesc={sortDesc}
  onSort={onSort}
>
  HR
</SortableHeader>
```

### Conventions

- **Tabular numerals** are mandatory on any number cell (built into ThemedTd via density styles).
- **Frozen first column** for tables with horizontal scroll: pass `frozen` prop on ThemedTh / ThemedTd. Sticky-bg uses `rgb(20, 28, 48)` (opaque) so glass blur doesn't bleed.
- **Min-width 600px on mobile** (default). Tables with ≤5 short columns can pass `minWidth={320}` or `minWidth={0}` to hug content.
- **Zebra striping** is opt-in via `zebra={true}` — most Aurora tables don't use it; the chip-toned header alone provides enough separation.
- **Wrap tables in Glass** — `<Glass padded={false}><ThemedTable>...</ThemedTable></Glass>` is the standard pattern. `padded={false}` because the table provides its own internal padding.

---

## Layout & spacing

### Page rhythm (Aurora hero pattern)

Every Aurora page follows this structure:

```tsx
<div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
  <Glass strong>
    <SectionLabel>✦ Page Name</SectionLabel>
    <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
      Page Heading
    </h1>
    <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
      One-sentence subtitle.
    </div>
  </Glass>

  {/* tab pills, content, glass cards */}
</div>
```

### Container widths

| Page type | maxWidth |
|---|---|
| Compact info page (Status, Payouts, Roadmap, Profile) | 1100px |
| Standard data page (most pages) | 1200px |
| Wide dashboard (AdminDashboard, Archive) | 1280px |

### Vertical rhythm

- **Page section gap:** 16px (flex column)
- **Glass internal padding:** 20px (default)
- **Hero subtitle margin-top:** 6px
- **AdminCrossNav margin-top:** 12px

### Border-radius

| Element | Radius |
|---|---|
| Glass card | 24px |
| Chip / pill button | 99px (full pill) |
| Tab pill | 99px |
| Inset rounded element | 12-16px |
| Dock | 22px |
| Avatar disc | 99px |

### AuroraShell padding

The shell main container uses `padding: 72px 16px 120px` to clear the Topbar (top: 16px + 30px logo + breathing room ≈ 64px) and the Dock (bottom: 22px + 44px pill + breathing room ≈ 110px). Don't add page-level top padding inside an AuroraShell-wrapped page; the shell already accounts for it.

---

## Buttons

### Aurora chip button (primary pattern)

```css
display: inline-flex;
align-items: center;
gap: 6px;
padding: 6-8px 12-14px;
border-radius: 99px;
font-size: 12px;
font-weight: 600;
letter-spacing: 0.2px;
font-family: inherit;
background: var(--am-chip);
color: var(--am-text);
border: 1px solid var(--am-border);
cursor: pointer;
```

Active variant: `background: var(--am-chip-strong); border: 1px solid var(--am-border-strong);`

Disabled: `opacity: 0.5; cursor: not-allowed;`

### Iridescent CTA (use sparingly)

```css
background: var(--am-irid);
color: white;
border: none;
border-radius: 12-16px;
padding: 10px 18px;
```

### Tab pill / segmented control

Same as chip button, but grouped in a flex row with `gap: 6px`. Active item uses chip-strong + border-strong; inactive uses chip + border.

---

## Motion & transitions

Aurora keeps motion **subtle** — most state changes are color/opacity, not transform.

| Element | Transition |
|---|---|
| Hover state | `200ms` color/background |
| Tab/pill switch | `200ms` background + border |
| Accordion expand | `300ms` chevron rotate (transform) |
| Dock active glyph | iridescent gradient swap (instant) |
| Sticky header sticky | none — it's instant |
| Dropdown/popover entry | none in atoms.tsx — relies on render mount |

**Don't use heavy entrance animations.** The Aurora aesthetic is calm — the iridescent gradients carry the visual interest.

---

## Iconography

- **Library:** [lucide-react](https://lucide.dev) — already a dep.
- **Default size:** 14px in chips, 16px in buttons, 18-20px in headings, 22-30px in atoms (Topbar logo, AIStrip icon).
- **Color:** match surrounding text (`var(--am-text)` or `var(--am-text-muted)`). For accent icons in heroes, use `var(--am-accent)`.

---

## What NOT to do

- **Don't ad-hoc colors.** Always use the token. If you find yourself writing `#1a75ff`, you mean `var(--am-accent)`.
- **Don't redefine `--lg-*` tokens** inside the aurora-theme scope. They're already redirected — fork the redirect in `aurora.css` if you need a different mapping site-wide.
- **Don't double-wrap AmbientBg.** The shell renders one. Inside an Aurora-wrapped page, content should be `position: relative; z-index: 1` over the shell's AmbientBg.
- **Don't use the legacy `--lg-pantone-294` blue** for new components. That's the legacy fallback for pre-auth pages only.
- **Don't bypass `<Glass>`** with hand-rolled `rounded-2xl border bg-white/10 backdrop-blur` etc. — the atom carries the correct blur, saturate, border, and box-shadow stack.
- **Don't put long-form text in IridText.** It's for numbers and hero values only — gradient-clipped text is hard to read at small sizes.

---

## Ports + escape routes

The Aurora rollout used a strangler-fig pattern. For pages that needed a deep Aurora port (Home, Standings, Team, etc.), the original was preserved as `XxxLegacy.tsx` and exposed at `/x-classic`. The Aurora version sits at the original path. Footer link: `Need the original layout? View classic Xxx →`.

For wrapper-only ports (Activity, Commissioner, Admin, Status, Analytics, etc.) no legacy escape route was created — the inner content is unchanged, only the outer chrome.

After PR #153 (token redirects), even wrapper-only ports inherit Aurora colors automatically because `--lg-*` tokens redirect to `--am-*` inside the aurora-theme scope.

---

## Where Aurora is live

**Site-wide:** Topbar + Dock (AuroraShell wraps all authenticated routes).

**21 pages with full Aurora hero treatment:** Home, Standings, Team, Players, PlayerDetail, Matchup, Weekly Report, AuctionValues, AuctionResults, Activity, Commissioner, Admin, AdminDashboard, AdminUsers, TodoPage, Board, Teams, AI Hub, Draft Report, Keeper Selection, Rules.

**Lower-traffic info pages with Aurora wrapper:** Status, Analytics, Payouts, Profile, Concepts, Roadmap, Tech, Changelog, Archive.

**Outside aurora-theme (intentionally):** Login, Signup, ForgotPassword, ResetPassword, DiscoverLeagues — these still use the legacy `--lg-*` defaults from `index.css`.

**Pending:** PR-3 — auction live floor (Auction.tsx + AuctionStage + 8 components, ~3000 LOC). Flagged in the rollout plan as needing a dedicated session with WS load testing.
