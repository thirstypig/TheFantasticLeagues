import express from 'express';
import { requireAuth, requireLeagueMember } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireArchiveAccess } from './archiveAccess.js';
import { playerCheckRouter } from './playerCheckRoutes.js';
import { archiveHistoryRouter } from './historyRoutes.js';
import { computeTrophyCase } from './services/trophyCaseService.js';

/** One person in the MLB Stats API people search. */
interface MlbSearchPerson {
  id: number;
  fullName: string;
  active?: boolean;
  primaryPosition?: { abbreviation?: string };
  currentTeam?: { name?: string };
}

const router = express.Router();

// Members-only (owner names are shown). Path-scoped on purpose: this router is
// mounted at /api, so a bare router.use() would gate every API route.
router.use('/archive', requireAuth, requireArchiveAccess());

// /archive/player-check… and /archive/history… — both read the archive tables
// loaded from the commissioner's workbooks (HistoricalTeam, HistoricalRosterEntry,
// HistoricalPlayerMatch).
router.use(playerCheckRouter);
router.use(archiveHistoryRouter);

/**
 * GET /api/archive/search-mlb?query=
 * MLB player search, used by the roster screen's search box. Lives here for
 * historical reasons; it reads statsapi, not the archive.
 */
router.get('/archive/search-mlb', requireAuth, asyncHandler(async (req, res) => {
  const query = req.query.query as string;
  if (!query || query.trim().length < 2) {
    return res.json({ players: [] });
  }

  const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(query.trim())}&sportId=1`;
  const response = await fetch(url);
  if (!response.ok) return res.json({ players: [] });

  const data = await response.json() as { people?: MlbSearchPerson[] };
  const players = (data.people || []).slice(0, 10).map((p) => ({
    id: p.id,
    name: p.fullName,
    mlbId: p.id,
    position: p.primaryPosition?.abbreviation || 'UT',
    team: p.currentTeam?.name || 'Free Agent',
    active: p.active,
  }));

  return res.json({ players });
}));

/**
 * GET /api/archive/trophy-case?leagueId=X
 * All-time trophy case: championships, all-time standings, records, dynasty scores.
 */
router.get('/archive/trophy-case', requireAuth, requireLeagueMember('leagueId'), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) {
    return res.status(400).json({ error: 'Invalid leagueId' });
  }
  const result = await computeTrophyCase(leagueId);
  return res.json(result);
}));

export const archiveRouter = router;
export default archiveRouter;
