# Aurora Mobile Design Archive

This directory contains the original mobile design handoff files from the **Aurora** design experiment (April 2026, Sessions 80–85). They are **not used by the current codebase** and are preserved for historical reference only.

## Files

| File | Description |
|---|---|
| `Aurora Mobile.html` | Static HTML prototype of the Aurora mobile UI (iridescent palette, glassmorphism) |
| `mobile-aurora-screens.jsx` | Aurora-era React screen mockups for mobile |
| `mobile-aurora-atoms.jsx` | Aurora-era React atom components for mobile |
| `Mobile Handoff Prompt.md` | Designer handoff notes from the Aurora experiment |

## Context

Aurora was replaced by the **Score Sheet** design system in PR #346 (2026-05-19). Score Sheet is flat paper, Inter only, warm taupe / medium gray, outfield-green accent — no blur, no gradients, no glassmorphism.

The current mobile implementation uses `MobileShell.tsx` and the `--am-*` CSS tokens defined in `client/src/components/aurora/aurora.css`. The token names and `.aurora-theme` class are kept from the Aurora era as backward-compatibility shims; the visual identity is Score Sheet.

See `docs/aurora-design-system.md` for the live design system reference.
