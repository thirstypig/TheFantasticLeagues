-- Add owner-directed slot rearrangement to Wire List entries.
-- Owners specify slotChanges at list-build time; processorService applies
-- them inside finalizePeriod when a SUCCEEDED add is committed to the roster.
-- Mirrors the slotChanges field shipped for direct add/drop in PR #347.

ALTER TABLE "WaiverAddEntry" ADD COLUMN "slotChanges" JSONB;
ALTER TABLE "WaiverDropEntry" ADD COLUMN "slotChanges" JSONB;
