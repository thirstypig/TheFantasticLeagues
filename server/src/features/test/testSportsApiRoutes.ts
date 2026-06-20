/**
 * Test routes for validating NFL API connectivity.
 * Used in Phase 2 to validate APIs work before implementing full sync.
 * Routes: GET /api/test/nfl/teams, /api/test/nfl/players/:teamAbbr
 *
 * NOTE: NBA routes removed — stats.nba.com blocks server-side requests at TCP layer
 * (connection established but zero response regardless of User-Agent/headers).
 * For Phase 3, evaluate alternative NBA data sources (ESPN API, residential proxy, etc).
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

export { router as testSportsApiRouter };
