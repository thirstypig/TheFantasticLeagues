-- The first archive import (HistoricalPeriod / HistoricalPlayerStat / HistoricalStanding)
-- was replaced by the workbook-based archive (HistoricalTeam, HistoricalRosterEntry,
-- HistoricalPlayerMatch). Nothing reads these tables since #551. Backed up to
-- archive-work/old-tables-backup/ on 2026-11-24 (69 / 10,640 / 16 rows).
-- IF EXISTS so a re-run, or a database that never had them, can't fail the boot (P3009).

DROP TABLE IF EXISTS "HistoricalPlayerStat";
DROP TABLE IF EXISTS "HistoricalPeriod";
DROP TABLE IF EXISTS "HistoricalStanding";
