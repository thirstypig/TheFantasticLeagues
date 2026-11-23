-- The day each archived scoring period ended, from the workbook's period sheet names.
ALTER TABLE "HistoricalSeason" ADD COLUMN "periodEnds" TEXT[] DEFAULT ARRAY[]::TEXT[];
