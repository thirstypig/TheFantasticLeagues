-- Migration: add rosterVersion to Team
-- Optimistic-concurrency guard for roster hub (todo #181).
-- All existing rows start at 0 (matches @default(0)).
ALTER TABLE "Team" ADD COLUMN "rosterVersion" INTEGER NOT NULL DEFAULT 0;
