/**
 * Test routes for validating NFL and NBA API connectivity.
 * Used in Phase 2 to validate APIs work before implementing full sync.
 * Routes: GET /api/test/nfl/teams, /api/test/nfl/players/:teamAbbr,
 *         GET /api/test/nba/teams, /api/test/nba/players/:teamId
 */

import express, { Router, Request, Response } from "express";

const router = Router();

// ============================================================================
// NFL ROUTES (via nflfastR endpoints)
// ============================================================================

/**
 * GET /api/test/nfl/teams
 * Fetch NFL teams from nflfastR schedule endpoint
 * nflfastR provides free, open-source NFL data via parquet/CSV endpoints
 * For MVP, we'll parse the team list from their schedule data
 */
router.get("/test/nfl/teams", async (req: Request, res: Response) => {
  try {
    // nflfastR team list (hardcoded for MVP — can be extended to fetch from data source)
    // Endpoint: https://raw.githubusercontent.com/nflverse/nflverse-data/master/raw/teams_colors_logos.parquet
    // For now, using known NFL teams
    const nflTeams = [
      { id: "ARI", name: "Arizona Cardinals", abbr: "ARI", city: "Phoenix" },
      { id: "ATL", name: "Atlanta Falcons", abbr: "ATL", city: "Atlanta" },
      { id: "BAL", name: "Baltimore Ravens", abbr: "BAL", city: "Baltimore" },
      { id: "BUF", name: "Buffalo Bills", abbr: "BUF", city: "Buffalo" },
      { id: "CAR", name: "Carolina Panthers", abbr: "CAR", city: "Charlotte" },
      { id: "CHI", name: "Chicago Bears", abbr: "CHI", city: "Chicago" },
      { id: "CIN", name: "Cincinnati Bengals", abbr: "CIN", city: "Cincinnati" },
      { id: "CLE", name: "Cleveland Browns", abbr: "CLE", city: "Cleveland" },
      { id: "DAL", name: "Dallas Cowboys", abbr: "DAL", city: "Dallas" },
      { id: "DEN", name: "Denver Broncos", abbr: "DEN", city: "Denver" },
      { id: "DET", name: "Detroit Lions", abbr: "DET", city: "Detroit" },
      { id: "GB", name: "Green Bay Packers", abbr: "GB", city: "Green Bay" },
      { id: "HOU", name: "Houston Texans", abbr: "HOU", city: "Houston" },
      { id: "IND", name: "Indianapolis Colts", abbr: "IND", city: "Indianapolis" },
      { id: "JAX", name: "Jacksonville Jaguars", abbr: "JAX", city: "Jacksonville" },
      { id: "KC", name: "Kansas City Chiefs", abbr: "KC", city: "Kansas City" },
      { id: "LAC", name: "Los Angeles Chargers", abbr: "LAC", city: "Los Angeles" },
      { id: "LAR", name: "Los Angeles Rams", abbr: "LAR", city: "Los Angeles" },
      { id: "LV", name: "Las Vegas Raiders", abbr: "LV", city: "Las Vegas" },
      { id: "MIA", name: "Miami Dolphins", abbr: "MIA", city: "Miami" },
      { id: "MIN", name: "Minnesota Vikings", abbr: "MIN", city: "Minneapolis" },
      { id: "NE", name: "New England Patriots", abbr: "NE", city: "Foxborough" },
      { id: "NO", name: "New Orleans Saints", abbr: "NO", city: "New Orleans" },
      { id: "NYG", name: "New York Giants", abbr: "NYG", city: "New York" },
      { id: "NYJ", name: "New York Jets", abbr: "NYJ", city: "New York" },
      { id: "PHI", name: "Philadelphia Eagles", abbr: "PHI", city: "Philadelphia" },
      { id: "PIT", name: "Pittsburgh Steelers", abbr: "PIT", city: "Pittsburgh" },
      { id: "SF", name: "San Francisco 49ers", abbr: "SF", city: "San Francisco" },
      { id: "SEA", name: "Seattle Seahawks", abbr: "SEA", city: "Seattle" },
      { id: "TB", name: "Tampa Bay Buccaneers", abbr: "TB", city: "Tampa" },
      { id: "TEN", name: "Tennessee Titans", abbr: "TEN", city: "Nashville" },
      { id: "WAS", name: "Washington Commanders", abbr: "WAS", city: "Washington" },
    ];

    res.json({
      success: true,
      source: "nflfastR (hardcoded MVP)",
      teamCount: nflTeams.length,
      teams: nflTeams.slice(0, 5),
    });
  } catch (error) {
    console.error("NFL teams endpoint error:", error);
    res.status(500).json({
      error: "Failed to fetch NFL teams",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/test/nfl/players/:teamAbbr
 * Fetch NFL players for a given team abbreviation
 * nflfastR provides player stats via their data repository
 * For MVP, returning a sample roster (can extend to fetch real data)
 */
router.get("/test/nfl/players/:teamAbbr", async (req: Request, res: Response) => {
  try {
    const { teamAbbr } = req.params;

    // Sample NFL players (can extend to fetch from nflfastR data endpoint)
    const nflPlayers: Record<string, any[]> = {
      KC: [
        { id: "P001", name: "Patrick Mahomes", position: "QB", team: "KC" },
        { id: "P002", name: "Travis Kelce", position: "TE", team: "KC" },
        { id: "P003", name: "Isiah Pacheco", position: "RB", team: "KC" },
      ],
      DAL: [
        { id: "P004", name: "Dak Prescott", position: "QB", team: "DAL" },
        { id: "P005", name: "CeeDee Lamb", position: "WR", team: "DAL" },
        { id: "P006", name: "Ezekiel Elliott", position: "RB", team: "DAL" },
      ],
      SF: [
        { id: "P007", name: "Brock Purdy", position: "QB", team: "SF" },
        { id: "P008", name: "Deebo Samuel", position: "WR", team: "SF" },
        { id: "P009", name: "Christian McCaffrey", position: "RB", team: "SF" },
      ],
    };

    const players = nflPlayers[teamAbbr.toUpperCase()] || [];

    res.json({
      success: true,
      source: "nflfastR (sample MVP data)",
      teamAbbr,
      playerCount: players.length,
      players,
    });
  } catch (error) {
    console.error("NFL players endpoint error:", error);
    res.status(500).json({
      error: "Failed to fetch NFL players",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ============================================================================
// NBA ROUTES (via stats.nba.com)
// ============================================================================

/**
 * GET /api/test/nba/teams
 * Fetch NBA teams from stats.nba.com
 * Endpoint: https://stats.nba.com/stats/leaguedashteamstats
 * Rate limit: ~600 requests/hour
 * Auth: User-Agent header required (Mozilla/5.0)
 */
router.get("/test/nba/teams", async (req: Request, res: Response) => {
  try {
    // Call stats.nba.com API with 3-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(
      "https://stats.nba.com/stats/leaguedashteamstats?Season=2025-26&SeasonType=Regular%20Season",
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`NBA API returned ${response.status}`);
    }

    const data = (await response.json()) as any;

    // Extract team data from resultSets
    const teamHeaders = data.resultSets[0]?.headers || [];
    const teamRows = data.resultSets[0]?.rowSet || [];

    // Map to readable format (using TEAM_ID, TEAM_NAME indices)
    const teamIdIdx = teamHeaders.indexOf("TEAM_ID");
    const teamNameIdx = teamHeaders.indexOf("TEAM_NAME");

    const teams = teamRows.slice(0, 5).map((row: any[]) => ({
      id: row[teamIdIdx],
      name: row[teamNameIdx],
    }));

    // Check for rate limit headers
    const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");

    res.json({
      success: true,
      source: "stats.nba.com (official)",
      endpoint: "leaguedashteamstats",
      teamCount: teamRows.length,
      rateLimit: {
        remaining: rateLimitRemaining ? parseInt(rateLimitRemaining) : "unknown",
      },
      teams,
    });
  } catch (error) {
    console.error("NBA teams endpoint error:", error);
    res.status(500).json({
      error: "Failed to fetch NBA teams",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/test/nba/players/:teamId
 * Fetch NBA players for a given team ID
 * Endpoint: https://stats.nba.com/stats/commonteamroster
 * Params: TeamID (e.g., 1610612738 for Celtics)
 * Rate limit: ~600 requests/hour
 * Auth: User-Agent header required (Mozilla/5.0)
 */
router.get("/test/nba/players/:teamId", async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    // Validate teamId is numeric
    if (!/^\d+$/.test(teamId)) {
      return res.status(400).json({
        error: "Invalid teamId",
        message: "teamId must be numeric (e.g., 1610612738 for Celtics)",
      });
    }

    // Call stats.nba.com API for team roster with 3-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(
      `https://stats.nba.com/stats/commonteamroster?TeamID=${teamId}&Season=2025-26`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`NBA API returned ${response.status}`);
    }

    const data = (await response.json()) as any;

    // Extract player data from resultSets
    const playerHeaders = data.resultSets[0]?.headers || [];
    const playerRows = data.resultSets[0]?.rowSet || [];

    // Map to readable format (using PLAYER_ID, PLAYER_NAME, POSITION indices)
    const playerIdIdx = playerHeaders.indexOf("PLAYER_ID");
    const playerNameIdx = playerHeaders.indexOf("PLAYER_NAME");
    const positionIdx = playerHeaders.indexOf("POSITION");

    const players = playerRows.slice(0, 5).map((row: any[]) => ({
      id: row[playerIdIdx],
      name: row[playerNameIdx],
      position: row[positionIdx] || "Unknown",
    }));

    // Check for rate limit headers
    const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");

    res.json({
      success: true,
      source: "stats.nba.com (official)",
      endpoint: "commonteamroster",
      teamId,
      playerCount: playerRows.length,
      rateLimit: {
        remaining: rateLimitRemaining ? parseInt(rateLimitRemaining) : "unknown",
      },
      players,
    });
  } catch (error) {
    console.error("NBA players endpoint error:", error);
    res.status(500).json({
      error: "Failed to fetch NBA players",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export { router as testSportsApiRouter };
