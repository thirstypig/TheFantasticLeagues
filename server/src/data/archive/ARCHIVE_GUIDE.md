# Archive Data Management Guide

## Overview

This guide documents the process for importing, managing, and recovering historical archive data for the FBST (Fantasy Baseball Stats Tracker) application.

## Table of Contents

1. [Data Persistence](#data-persistence)
2. [Excel Upload Process](#excel-upload-process)
3. [Auto-Matching Player Names](#auto-matching-player-names)
4. [CSV Format Requirements](#csv-format-requirements)
5. [Import Process](#import-process)
6. [MLB ID Reference System](#mlb-id-reference-system)
7. [Recovery Process](#recovery-process)
8. [Troubleshooting](#troubleshooting)

---

## Data Persistence

### Where is data stored?

All archive data is stored in the **PostgreSQL database** via Prisma. This means:

- ✅ **Data survives server restarts** - The database is persistent
- ✅ **Data survives code changes** - Only database migrations affect data
- ✅ **Data is backed up** - As long as your database is backed up

### What data is stored?

| Table | Description |
|-------|-------------|
| `HistoricalSeason` | Season metadata (year, isImported, etc.) |
| `HistoricalPeriod` | Period definitions (start/end dates, tab names) |
| `HistoricalPlayerStat` | Player stats per period (with MLB ID, position, etc.) |
| `HistoricalStanding` | Team standings and scores |

### How to protect your data

1. **Export MLB ID references after corrections**:
   ```bash
   npx tsx src/scripts/export_mlb_id_reference.ts
   ```

2. **Generated CSV files persist on disk**:
   - Location: `server/src/data/archive/{year}/`
   - Files: `draft_YYYY_auction.csv`, `period_N.csv`, `period_dates_YYYY.csv`

3. **If you need to re-import**: The Excel upload process will regenerate CSVs and update the database. Manual MLB ID corrections can be recovered using the reference files.

---

## Excel Upload Process

### How it works

1. **Upload via Admin Panel**: Go to Archive → Admin tab → Upload Excel file
2. **Server parses Excel**: The `ArchiveImportService` detects sheet layouts
3. **CSVs are generated**: Period CSVs, draft CSV, and standings CSV are created
4. **Database is updated**: Data is imported into the database

### Sheet Detection

The importer looks for these sheets:
- **Draft**: "Draft", "auction", "draft order"
- **Standings**: "standings", "league standings", "final"
- **Period Tabs**: Date-formatted tabs like "May 5", "June 21", etc.

### Period Date Rules

> [!IMPORTANT]
> **Period 1** always starts on **MLB Opening Day** for that year:
> - 2009: April 5, 2016: April 3, 2022: April 7, etc.

**Date logic**:
1. Period 1 = Draft tab → Starts Opening Day, ends day before first date tab
2. Period 2+ = Date tabs → Starts on tab date, ends day before next tab
3. Last period ends October 31

### Team Detection

Teams are detected from header rows in the Excel file. The system recognizes:
- Standard names: "Diamond Kings", "Devil Dawgs", etc.
- Legacy codes: DKG, DDG, DEV, DMK, SKD, RGS, LDY, SHO
- 2009 alternate names: "B.O.H.I.C.A.", "The Fluffers"

If a team isn't recognized, it gets a temporary code like `UNK-14`.

### Position Detection

Positions are detected from:
1. **Leftmost position column** (C, 1B, 2B, SS, 3B, MI, OF, DH, P, SP, RP, R)
2. **Adjacent cells** to player names
3. **Section headers** ("Hitters", "Pitchers")

---

## Auto-Matching Player Names

### How matching works

When importing, the system attempts to match abbreviated names (e.g., "A. Riley") to known players using:

1. **Exact name match**: `player_name` matches exactly
2. **Full name fallback**: If MLB ID exists, uses `full_name`
3. **Position filter**: Distinguishes between hitter/pitcher
4. **Year/period context**: Considers which year the player was active

### Matching priority

```
1. Exact player_name + team_code + year → Direct match
2. player_name + is_pitcher flag → Narrow by role
3. player_name + position → Narrow by position
4. MLB ID lookup → If ID exists, use it
```

### When manual matching is needed

The system will **NOT** auto-match if:
- Multiple players have the same abbreviated name (e.g., "J. Rodriguez")
- Position/pitcher status is ambiguous
- No MLB ID exists

In these cases, use the Archive UI to manually assign the correct player.

### Future Enhancement: Fuzzy Matching

The system could be enhanced to:
1. Parse "A. Riley" → search for `first_name LIKE 'A%' AND last_name = 'Riley'`
2. Cross-reference with MLB Stats API
3. Consider year/period activity to disambiguate

---

## CSV Format Requirements

### Period Stats Files

**Filename Pattern**: `period_N.csv` or `Period_N.csv` (where N is the period number 1-7)

**Required Columns**:
```csv
player_name,mlb_id,team_code,is_pitcher,AB,H,R,HR,RBI,SB,AVG,W,SV,K,IP,ER,ERA,WHIP
```

**Column Specifications**:
- `player_name`: Abbreviated player name (e.g., "S. Ohtani", "J. Altuve")
  - ⚠️ **CRITICAL**: No commas in names! Use periods instead
  - ✅ Good: "H. Badeer" 
  - ❌ Bad: "H, Badeer"
- `mlb_id`: MLB Stats API player ID (can be empty if using reference lookup)
- `team_code`: 3-4 letter team code (e.g., "DKD", "SDS", "DD2")
- `is_pitcher`: `true` or `false`
- Stats columns: Numeric values or empty for null

**Optional Columns** (will be populated if reference exists):
- `full_name`: Full player name
- `position`: Player position
- `mlb_team`: MLB team abbreviation

### Draft Files

**Filename Pattern**: `draft_YYYY_auction.csv` (where YYYY is the year)

**Required Columns**:
```csv
player_name,team_code,mlb_team,is_pitcher,position,draft_dollars
```

**Column Specifications**:
- `player_name`: Abbreviated player name (e.g., "S. Ohtani")
- `team_code`: Fantasy team code (e.g., "DKD", "SDS")
- `mlb_team`: MLB team abbreviation (optional)
- `is_pitcher`: `true` or `false`
- `position`: Player position (e.g., "OF", "1B", "SP")
- `draft_dollars`: Dollar amount spent in auction

### Season Standings Files

**Filename**: `season_standings.csv` (optional)

```csv
team_code,team_name,R_score,HR_score,RBI_score,SB_score,AVG_score,W_score,SV_score,K_score,ERA_score,WHIP_score,total_score,final_rank
```

---

## Import Process

### Standard Import (New Data)

**Script**: [`import_historical_archive.ts`](file:///Users/jameschang/Projects/thefantasticleagues/thefantasticleagues-app/server/src/scripts/import_historical_archive.ts)

```bash
cd server
npx tsx src/scripts/import_historical_archive.ts <year>
```

**What it does**:
1. Creates/updates `HistoricalSeason` record for the year
2. Creates `HistoricalPeriod` records for each period CSV found
3. Imports player stats from each CSV file
4. Optionally imports season standings if file exists

**Example**:
```bash
npx tsx src/scripts/import_historical_archive.ts 2024
```

### Import with MLB ID Reference

After importing, if you have MLB ID reference files, propagate them:

```bash
npx tsx src/scripts/propagate_mlb_ids.ts
```

This copies MLB IDs across all periods for each player.

---

## MLB ID Reference System

### Purpose

The MLB ID reference system maintains a persistent mapping of player abbreviations to their MLB IDs, full names, and positions. This allows:
- Quick recovery after data loss
- Consistent player identification across years
- Easy population of new imports

### Reference File Location

```
server/src/data/mlb_id_reference/
├── 2023_mlb_ids.json    # JSON format (machine-readable)
├── 2023_mlb_ids.csv     # CSV format (human-readable)
├── 2024_mlb_ids.json
├── 2024_mlb_ids.csv
├── 2025_mlb_ids.json
└── 2025_mlb_ids.csv
```

### Exporting MLB ID Reference

**When to export**: After manually correcting player MLB IDs or completing a new season's data entry.

**Script**: [`export_mlb_id_reference.ts`](file:///Users/jameschang/Projects/thefantasticleagues/thefantasticleagues-app/server/src/scripts/export_mlb_id_reference.ts)

```bash
cd server
npx tsx src/scripts/export_mlb_id_reference.ts
```

**Output**: Creates JSON and CSV files for all years in the database (2023-2025).

### Reference File Format

**JSON**:
```json
{
  "year": 2024,
  "exportDate": "2026-01-17T17:29:12.000Z",
  "totalPlayers": 130,
  "players": [
    {
      "playerName": "S. Ohtani",
      "fullName": "Shohei Ohtani",
      "mlbId": "660271",
      "teamCode": "DKD",
      "position": "DH",
      "isPitcher": false
    },
    ...
  ]
}
```

**CSV**:
```csv
playerName,fullName,mlbId,teamCode,position,isPitcher
"S. Ohtani","Shohei Ohtani",660271,DKD,"DH",false
```

---

## Recovery Process

If you accidentally lose MLB ID data (e.g., by importing from CSVs without MLB IDs):

### Step 1: Check Current State

```bash
cd server
npx tsx src/scripts/check_mlb_ids.ts
```

Output shows how many players have MLB IDs in each year.

### Step 2: Propagate Existing MLB IDs

If some MLB IDs survived, propagate them across all periods:

```bash
npx tsx src/scripts/propagate_mlb_ids.ts
```

This finds players with MLB IDs in any period and copies them to all their other periods.

### Step 3: Verify Recovery

```bash
npx tsx src/scripts/check_mlb_ids.ts
```

Check the final coverage percentage.

### Step 4: Export Reference (For Future Use)

```bash
npx tsx src/scripts/export_mlb_id_reference.ts
```

Saves current MLB ID mappings so you don't lose them again.

### Step 5: Manual Completion

For remaining players without MLB IDs:
1. Use the Archive page UI
2. Click "Search Players" feature
3. Look up missing players
4. Update MLB IDs through the interface

OR use the fetch script to search MLB API:

```bash
cd server  
npx tsx src/scripts/fetch_2024_mlb_teams.ts
```

(This searches the MLB Stats API by player name and updates the database)

---

## Troubleshooting

### Issue: Import fails with "Invalid number of columns"

**Cause**: Player name contains a comma (e.g., "H, Badeer")

**Solution**: 
1. Find the offending row in the CSV
2. Change comma to period: "H. Badeer"
3. Re-run import

**Prevention**: Always use periods in abbreviated names, never commas.

### Issue: MLB IDs not showing after import

**Cause**: CSV files don't contain MLB IDs

**Solution**: Use the propagation script or reference files (see [Recovery Process](#recovery-process))

### Issue: Duplicate players or missing players

**Cause**: Inconsistent player name abbreviations across periods

**Solution**:
1. Check reference CSV files for canonical player names
2. Update source CSVs to use consistent abbreviations
3. Re-import

### Issue: "No periods found" when importing

**Cause**: CSV filenames don't match expected pattern

**Expected patterns**:
- `period_1.csv`, `period_2.csv`, etc. (lowercase)
- `Period_1.csv`, `Period_2.csv`, etc. (capitalized)

**Solution**: Rename files to match pattern or update import script to recognize your naming convention.

### Issue: Only some teams imported from Excel

**Cause**: Team name not recognized in `identifyTeam` mapping

**Solution**: 
1. Check the generated CSV for `UNK-XX` team codes
2. Add the missing team name to `archiveImportService.ts` → `identifyTeam()`
3. Re-upload the Excel file

### Issue: Players missing from draft import

**Cause**: Blank cells or position column not detected

**Solution**:
1. Ensure position column is in leftmost columns (col A-E)
2. Ensure team headers are in rows 1-15
3. Re-upload the Excel file

---

## Best Practices

1. **Always export MLB ID reference after completing/correcting data**
   ```bash
   npx tsx src/scripts/export_mlb_id_reference.ts
   ```

2. **Use consistent player name abbreviations**
   - First initial + period + space + last name
   - Example: "S. Ohtani", not "Shohei Ohtani" or "S.Ohtani"

3. **Never use commas in player names in CSV files**
   - Use periods for abbreviations instead

4. **Keep a backup of reference files**
   - Commit `server/src/data/mlb_id_reference/` to version control
   - These files are small and invaluable for recovery

5. **Verify imports before deleting source**
   - Check player counts match expectations
   - Spot-check a few players have MLB IDs
   - Review standings calculations

6. **Document any manual corrections**
   - If you manually fix player data, note it
   - Re-export reference files after fixes

---

## Scripts Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `import_historical_archive.ts` | Import archive data from CSV | `npx tsx src/scripts/import_historical_archive.ts <year>` |
| `export_mlb_id_reference.ts` | Save MLB ID mappings to reference files | `npx tsx src/scripts/export_mlb_id_reference.ts` |
| `propagate_mlb_ids.ts` | Copy MLB IDs across periods for same players | `npx tsx src/scripts/propagate_mlb_ids.ts` |
| `check_mlb_ids.ts` | Check current MLB ID coverage | `npx tsx src/scripts/check_mlb_ids.ts` |
| `fetch_2024_mlb_teams.ts` | Search MLB API and update database | `npx tsx src/scripts/fetch_2024_mlb_teams.ts` |

---

## Recovery Example: Real Scenario

**What happened**: Ran `import_historical_archive.ts` which wiped database and re-imported from CSVs. CSV files had empty MLB ID fields, so all MLB IDs were lost.

**Recovery steps**:
1. Ran `check_mlb_ids.ts` → Found 129 MLB IDs survived in 2024, 180 in 2025
2. Ran `propagate_mlb_ids.ts` → Propagated IDs to 681 records (53% coverage) for 2024
3. Ran `export_mlb_id_reference.ts` → Saved mappings for future use
4. Manually corrected remaining ~54 players without IDs using Archive UI
5. Ran `export_mlb_id_reference.ts` again to save complete mappings

**Result**: Full recovery of MLB IDs with persistent backup in reference files.

