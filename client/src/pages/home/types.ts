// ─── MLB Feed Types ─────────────────────────────────────────────

/** Hitting stats from /api/mlb/roster-stats-today */
export interface HittingLine {
  AB: number; H: number; R: number; HR: number;
  RBI: number; SB: number; BB: number; K: number;
}

/** Pitching stats from /api/mlb/roster-stats-today */
export interface PitchingLine {
  IP: string; H: number; R: number; ER: number;
  K: number; BB: number; W: number; L: number; SV: number;
}

/** A player from /api/mlb/roster-stats-today */
export interface RosterStatsPlayer {
  playerName: string;
  mlbId: number | null;
  mlbTeam: string;
  position: string;
  isPitcher: boolean;
  gameToday: boolean;
  gameStatus: string;
  opponent: string;
  homeAway: string;
  gameTime: string;
  hitting: HittingLine | null;
  pitching: PitchingLine | null;
  thumbnail: string | null;
}

/** A player from /api/mlb/roster-status */
export interface RosterAlertPlayer {
  playerName: string;
  mlbId: number | null;
  mlbTeam: string;
  position: string;
  mlbStatus: string;
  isInjured: boolean;
  isMinors: boolean;
  ilPlacedDate: string | null;
  ilDays: number | null;
  ilInjury: string | null;
  ilEligibleReturn: string | null;
  ilReplacement: string | null;
}

/** A video from /api/mlb/player-videos */
export interface PlayerVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  published: string;
  channelTitle: string;
  source: string;
  matchedPlayer: string | null;
}

/** Player match inside Reddit/News items */
export interface MatchedPlayer {
  name: string;
  fantasyTeam: string;
}

/** A Reddit post from /api/mlb/reddit-baseball */
export interface RedditPost {
  title: string;
  url: string;
  permalink: string;
  score: number;
  numComments: number;
  createdUtc: number;
  thumbnail: string | null;
  flair: string;
  matchedPlayers: MatchedPlayer[];
}

/** A news article from /api/mlb/yahoo-sports, mlb-news, espn-news */
export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  matchedPlayers?: MatchedPlayer[];
}

/** Roster-stats-today response shape */
export interface RosterStatsResponse {
  date: string;
  teamName: string;
  players: RosterStatsPlayer[];
}

/** A player scored by the Daily Diamond headline generator */
export interface ScoredPlayer extends RosterStatsPlayer {
  score: number;
  _isILStory?: boolean;
  _ilInjury?: string;
  _ilLabel?: string;
  _daysSince?: number;
}

/** Trade rumors feed item */
export interface TradeRumor {
  title: string;
  link: string;
  pubDate: string;
  categories: string[];
  matchedPlayers: MatchedPlayer[];
}

// ─── Digest Types ───────────────────────────────────────────────

/** Power ranking entry in the new digest format. */
export interface PowerRanking {
  rank: number;
  teamName: string;
  movement: string;
  commentary: string;
}

/** Category mover entry. */
export interface CategoryMover {
  category: string;
  team: string;
  direction: string;
  detail: string;
}

/** Proposed trade in the digest. */
export interface ProposedTrade {
  style: string;
  title: string;
  description: string;
  teamA: string;
  teamAGives: string;
  teamB: string;
  teamBGives: string;
  reasoning: string;
}

/** Team grade entry (old digest format). */
export interface TeamGrade {
  teamName: string;
  grade: string;
  trend: string;
}

/** Hot/cold team spotlight. */
export interface TeamSpotlight {
  name: string;
  reason: string;
}

/** Vote results for Trade of the Week. */
export interface VoteResults {
  yes: number;
  no: number;
  myVote: string | null;
}

/**
 * League digest API response.
 * Supports both the new 7-section format (powerRankings) and the
 * legacy format (overview + teamGrades) for backward compatibility.
 */
export interface DigestResponse {
  // New format (7-section)
  weekInOneSentence?: string;
  powerRankings?: PowerRanking[];
  hotTeam?: TeamSpotlight;
  coldTeam?: TeamSpotlight;
  statOfTheWeek?: string;
  categoryMovers?: CategoryMover[];
  proposedTrade?: ProposedTrade;
  boldPrediction?: string;

  // Old format (backward compat)
  overview?: string;
  teamGrades?: TeamGrade[];

  // Metadata (added by API response)
  generatedAt?: string;
  weekKey?: string;
  isCurrentWeek?: boolean;
  voteResults?: VoteResults;
}
