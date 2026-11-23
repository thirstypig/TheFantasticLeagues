-- Archive page: whether a season's keepers come from the workbook's Keepers
-- sheet (shown as "keeper") or are derived from prices ("possible keeper").
-- Additive with a default; set by load-archive-seasons.ts.
ALTER TABLE "HistoricalSeason" ADD COLUMN "keepersFromSheet" BOOLEAN NOT NULL DEFAULT false;
