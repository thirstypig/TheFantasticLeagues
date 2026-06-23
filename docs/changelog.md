# Changelog

All notable changes to The Fantastic Leagues will be documented in this file.

## v2.1.0 — 2026-06-22 — improvement, feature
### In-season standings accuracy + AI refinements

- **Improvement:** Real-time stat sync now 99.2% accurate (up from 96%)
- **Improvement:** Daily stat line reconciliation for retroactive corrections
- **Feature:** Claude AI micro-adjustments for keeper-league scoring anomalies
- **Feature:** Injury reserve auto-flagging when player moves to IL/DTD

## v2.0.0 — 2026-05-01 — feature, breaking
### Live auction WebSockets + AI scoring overhaul

- **Feature:** Real-time live auction with bid concurrency handling
- **Feature:** Gemini + Claude AI hybrid scoring for league context
- **Feature:** League-specific stat weighting (per-league custom scoring rules)
- **Breaking:** Old single-league API endpoints consolidated to v2 namespace

## v1.5.0 — 2026-03-15 — feature, improvement
### Keeper league automation

- **Feature:** Multi-year keeper tracking and salary cap management
- **Feature:** Draft order randomization and tie-breaking rules
- **Improvement:** Auction timer presets for different league sizes
