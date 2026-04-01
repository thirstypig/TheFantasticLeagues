---
title: "Period Date Timezone Shift — Dates Off by One Day"
date: 2026-03-31
category: logic-errors
tags:
  - timezone
  - date
  - prisma
  - postgresql
  - javascript
severity: medium
component: periods
status: fixed
commit: 93c8813
---

# Period Date Timezone Shift

## Symptom

Commissioner creates a scoring period with start date `2026-04-07`. After saving, the period displays as `2026-04-06` — one day earlier than intended. The shift is consistent: every date moves back by exactly one day.

## Root Cause

JavaScript's `new Date("2026-04-07")` parses date-only strings as **midnight UTC** (`2026-04-07T00:00:00Z`). When displayed in Pacific timezone (UTC-7), midnight UTC becomes the **previous evening** — so `toLocaleDateString()` or `.toISOString().slice(0,10)` after local interpretation yields `2026-04-06`.

**The round-trip failure:**

| Step | Value |
|------|-------|
| Client sends | `"2026-04-07"` (YYYY-MM-DD from `<input type="date">`) |
| Server parses | `new Date("2026-04-07")` → `2026-04-07T00:00:00Z` |
| DB stores | `2026-04-07T00:00:00Z` |
| Client reads in PDT | midnight UTC = 5 PM PDT on April **6** |
| User sees | `2026-04-06` (wrong) |

## Fix

Anchor all date-only strings to **noon UTC** before storing:

```typescript
// ❌ Before (buggy)
startDate: new Date(startDate),
endDate: new Date(endDate),

// ✅ After (fixed)
startDate: new Date(startDate + "T12:00:00Z"),
endDate: new Date(endDate + "T12:00:00Z"),
```

**Why noon UTC?** It provides a ±12 hour buffer that keeps the date on the correct calendar day in any timezone:

| Timezone | Noon UTC displayed as | Same day? |
|----------|----------------------|-----------|
| UTC-4 (Eastern) | 8:00 AM EDT | Yes |
| UTC-7 (Pacific) | 5:00 AM PDT | Yes |
| UTC-8 (Alaska) | 4:00 AM AKDT | Yes |
| UTC-10 (Hawaii) | 2:00 AM HST | Yes |

## Files Changed

**`server/src/features/periods/routes.ts`** — 3 locations:

1. **POST handler** (create period) — lines 85-86: date conversion for `prisma.period.create()`
2. **PATCH handler** (update period) — lines 118-119: effective date validation
3. **PATCH handler** (update period) — lines 126-127: date conversion for `prisma.period.update()`

**No client changes needed** — the client correctly sends bare `YYYY-MM-DD` strings from HTML date inputs.

## Potential Utility Pattern

For future date-only fields, consider extracting a reusable helper:

```typescript
// server/src/lib/utils.ts
export function parseDateNoonUtc(dateStr: string): Date {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Expected YYYY-MM-DD, got "${dateStr}"`);
  const [, y, m, d] = match;
  return new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0));
}
```

## Other Vulnerable Locations

These code paths also parse date strings and could have the same bug:

| Location | Risk | Status |
|----------|------|--------|
| `server/src/features/commissioner/routes.ts:798-799` | High | Duplicate period creation route — needs same fix |
| `server/src/features/archive/services/archiveImportService.ts` | Medium | Excel import dates |
| `server/src/scripts/import_onroto_transactions.ts` | Low | One-off script |
| `server/src/features/players/services/mlbStatsSyncService.ts` | Safe | Already uses `"T00:00:00Z"` suffix |

## Prevention

1. **Rule**: All date-only strings from client forms MUST be anchored to noon UTC before storing in PostgreSQL
2. **Never**: `new Date("2026-04-07")` — ambiguous timezone interpretation
3. **Always**: `new Date("2026-04-07T12:00:00Z")` or `parseDateNoonUtc("2026-04-07")`
4. **Prisma**: Keep using `DateTime` (not `@db.Date`) — full timestamps allow the noon UTC anchor
5. **Tests**: Round-trip test — parse a date string, format it back, verify it matches the original

## Cross-References

- [hardcoded-season-year-constants.md](./hardcoded-season-year-constants.md) — Related Session 49 fix for `todayDateStr()` UTC issues
- Commit `93c8813` — Full diff including trade UI overhaul and mid-season period editing
