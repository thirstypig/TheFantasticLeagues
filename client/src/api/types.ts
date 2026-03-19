
export type HOrP = "hitting" | "pitching";

export interface JsonError {
  error?: string;
  message?: string;
}

export type LeagueRole = "COMMISSIONER" | "OWNER";

export type FranchiseSummary = {
  id: number;
  name: string;
  isPublic: boolean;
  publicSlug: string | null;
};

export type FranchiseMembership = {
  franchiseId: number;
  role: LeagueRole;
  franchise?: FranchiseSummary;
};

export type LeagueSummary = {
  id: number;
  name: string;
  season: number;
  draftMode: "AUCTION" | "DRAFT";
  draftOrder: "SNAKE" | "LINEAR" | null;
  isPublic: boolean;
  publicSlug: string | null;
  franchiseId: number;
};

export type LeagueMembership = {
  leagueId: number;
  role: LeagueRole;
  league?: LeagueSummary;
};

export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  venmoHandle?: string | null;
  zelleHandle?: string | null;
  paypalHandle?: string | null;
  memberships: LeagueMembership[];
  franchiseMemberships?: FranchiseMembership[];
};

export type AuthMeResponse = { user: AuthUser | null };

export type LeagueAccess =
  | { type: "PUBLIC_VIEWER" }
  | { type: "MEMBER"; role: LeagueRole }
  | { type: "NONE" };

export type LeagueListItem = LeagueSummary & {
  access: LeagueAccess;
};

export type LeaguesListResponse = { leagues: LeagueListItem[] };

export type TeamDetailResponse = {
  team: { id: number; name: string; owner: string; budget: number };
  currentRoster: Array<{
    id: number;
    playerId: number;
    name: string;
    posPrimary: string;
    price: number;
  }>;
};

export type LeagueDetail = LeagueSummary & {
  teams: Array<{
    id: number;
    name: string;
    code: string;
    ownerUserId?: number | null;
    owner?: string | null;
  }>;
};

export type AdminCreateLeagueInput = {
  name: string;
  season: number;
  draftMode: "AUCTION" | "DRAFT";
  draftOrder?: "SNAKE" | "LINEAR" | null;
  isPublic?: boolean;
  publicSlug?: string | null;
  copyFromLeagueId?: number;
};

export type AdminCreateLeagueResponse = {
  league: LeagueSummary;
};

export type SeasonStandingRow = Record<string, unknown>;
export type PeriodStatRow = Record<string, unknown>;

export type SeasonStandingsApiResponse = {
  periodIds: number[];
  rows: SeasonStandingRow[];
};

export type PlayerProfile = {
  mlbId: string;
  fullName: string;
  currentTeam?: string;
  primaryPosition?: string;
  bats?: string;
  throws?: string;
  height?: string;
  weight?: string;
  birthDate?: string;
  mlbDebutDate?: string;
  currentAge?: number;
  jerseyNumber?: string;
  nickName?: string;
  birthCity?: string;
  birthStateProvince?: string;
  birthCountry?: string;
  draftYear?: number;
  active?: boolean;
  pronunciation?: string;
};

export type PlayerTransaction = {
  date: string | null;
  typeDesc: string;
  description: string;
};

export type RecentHittingRow = {
  label: string;
  AB: number;
  H: number;
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AVG: string;
};

export type RecentPitchingRow = {
  label: string;
  IP: string;
  W: number;
  SV: number;
  K: number;
  ERA: string;
  WHIP: string;
};

export type RecentStatsResponse = {
  rows: (RecentHittingRow | RecentPitchingRow)[];
};

export type PeriodCategoryKey = "R" | "HR" | "RBI" | "SB" | "AVG" | "W" | "SV" | "K" | "ERA" | "WHIP";

export type PeriodCategoryStandingRow = {
  teamCode: string;
  teamName: string;
  value: number;
  rank: number;
  points: number;
};

export type PeriodCategoryStandingTable = {
  key: PeriodCategoryKey;
  label: string;
  group: "H" | "P";
  higherIsBetter: boolean;
  rows: PeriodCategoryStandingRow[];
};

export type PeriodCategoryStandingsResponse = {
  periodId: string | number;
  periodNum?: number;
  teamCount: number;
  categories: PeriodCategoryStandingTable[];
};

export type PlayerSeasonStat = {
  mlb_id: string;
  row_id?: string;
  player_name?: string;
  mlb_full_name?: string;
  ogba_team_code?: string;
  ogba_team_name?: string;
  group?: "H" | "P";
  is_pitcher?: boolean | number;
  positions?: string;
  posPrimary?: string;
  mlb_team?: string;
  mlb_team_abbr?: string;
  mlbTeam?: string;
  price?: number;
  AB?: number;
  H?: number;
  R?: number;
  HR?: number;
  RBI?: number;
  SB?: number;
  AVG?: number | string;
  W?: number;
  SV?: number;
  K?: number;
  IP?: number | string;
  ER?: number | string;
  ERA?: number | string;
  BB_H?: number | string;
  WHIP?: number | string;
  dollar_value?: number;
  value?: number;
  z_total?: number;
  GS?: number;
  SO?: number;
  pos?: string;
  name?: string;
  team?: string;
  isPitcher?: boolean;
};

export type CareerHittingRow = {
  year: string;
  tm: string;
  G: number;
  AB: number;
  R: number;
  H: number;
  d2B: number;
  d3B: number;
  HR: number;
  RBI: number;
  SB: number;
  CS: number;
  BB: number;
  SO: number;
  GS: number;
  AVG: string;
  OBP: string;
  SLG: string;
};

export type CareerPitchingRow = {
  year: string;
  tm: string;
  G: number;
  GS: number;
  W: number;
  L: number;
  SV: number;
  IP: number;
  H: number;
  ER: number;
  HR: number;
  BB: number;
  SO: number;
  SHO: number;
  ERA: string;
  WHIP: string;
};

export type CareerStatsResponse = {
  rows: (CareerHittingRow | CareerPitchingRow)[];
};

export type PeriodDef = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
};

export type LeagueRule = {
    id: number;
    leagueId: number;
    category: string;
    key: string;
    value: string;
    label: string;
};
