-- TeamStatsCategoryDaily — daily snapshot of team category totals + rank-points
-- Plan: docs/plans/2026-04-28-server-enhancements-post-aurora.md (Gap 2)
--
-- Powers true day-over-day deltas on CategoryStandingsView (and any future
-- "biggest mover" / "stat of the week" features). Populated by the daily
-- 11:00 UTC cron in server/src/index.ts (after the 13:00 UTC stats sync).
--
-- All-additive: new table only, no changes to existing tables. Safe on a
-- live Postgres database.

CREATE TABLE "TeamStatsCategoryDaily" (
    "id"         SERIAL    PRIMARY KEY,
    "teamId"     INTEGER   NOT NULL,
    "leagueId"   INTEGER   NOT NULL,
    "date"       DATE      NOT NULL,
    "category"   TEXT      NOT NULL,
    "value"      DOUBLE PRECISION NOT NULL,
    "rank"       INTEGER   NOT NULL,
    "rankPoints" INTEGER   NOT NULL,

    CONSTRAINT "TeamStatsCategoryDaily_team_fkey"
      FOREIGN KEY ("teamId")   REFERENCES "Team"("id")   ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "TeamStatsCategoryDaily_league_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

-- Upsert key: one row per (team, league, date, category)
CREATE UNIQUE INDEX "TeamStatsCategoryDaily_teamId_leagueId_date_category_key"
  ON "TeamStatsCategoryDaily" ("teamId", "leagueId", "date", "category");

-- Hot path: "give me all teams' snapshots for league X on date Y"
CREATE INDEX "TeamStatsCategoryDaily_leagueId_date_idx"
  ON "TeamStatsCategoryDaily" ("leagueId", "date");

-- Hot path: "give me team X's history of category Y" (mover charts)
CREATE INDEX "TeamStatsCategoryDaily_teamId_category_date_idx"
  ON "TeamStatsCategoryDaily" ("teamId", "category", "date");
