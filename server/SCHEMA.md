# The Fantastic Leagues — API Schema (2025 OGBA)

This document defines the JSON shapes returned by the API.  
All endpoints are prefixed with `/api`.

---

## 1. Season standings

**Endpoint**

- `GET /api/season-standings`

**Response**

```ts
type CategoryPoints = {
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AVG: number;
  W: number;
  S: number;
  K: number;
  ERA: number;
  WHIP: number;
};

type SeasonStandingsRow = {
  teamId: number;
  teamName: string;
  owner: string;
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AVG: number;   // 0.265, etc.
  W: number;
  S: number;
  K: number;
  ERA: number;
  WHIP: number;
  totalPoints: number;      // 0–(nTeams * nCats)
  categoryPoints: CategoryPoints;
};

type SeasonStandingsResponse = {
  periodIds: number[];       // e.g. [1,2,3,4,5,6]
  rows: SeasonStandingsRow[];
};
Example

json
Copy code
{
  "periodIds": [1, 2, 3, 4, 5, 6],
  "rows": [
    {
      "teamId": 4,
      "teamName": "Skunk Dogs",
      "owner": "Tim Yuba",
      "R": 927,
      "HR": 228,
      "RBI": 808,
      "SB": 140,
      "AVG": 0.2659305993690852,
      "W": 49,
      "S": 20,
      "K": 775,
      "ERA": 3.86992055129994,
      "WHIP": 1.2486829740581484,
      "totalPoints": 64,
      "categoryPoints": { "R": 8, "HR": 8, "RBI": 8, "SB": 7, "AVG": 8, "W": 7, "S": 6, "K": 8, "ERA": 3, "WHIP": 1 }
    }
  ]
}
2. Period standings
Endpoint

GET /api/period-standings?periodId=:id

Response

ts
Copy code
type PeriodCategoryPoints = CategoryPoints;

type PeriodStandingsRow = {
  teamId: number;
  teamName: string;
  owner: string;
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AVG: number;
  W: number;
  S: number;
  K: number;
  ERA: number;
  WHIP: number;
  totalPoints: number;          // points for this period only
  categoryPoints: PeriodCategoryPoints;
};

type PeriodStandingsResponse = {
  periodId: number;
  periodName: string;           // "Period 1", etc.
  rows: PeriodStandingsRow[];
};
3. Auction values / players list
Endpoint

GET /api/auction-values

Response

ts
Copy code
type AuctionPlayer = {
  mlb_id: string;        // Baseball Savant / MLB ID
  name: string;          // "J. Soto"
  team: string;          // OGBA team code, e.g. "LDY"
  pos: string;           // primary position, e.g. "1B", "SP"
  value: number;         // dollar value, e.g. 23.4
  relValue: number;      // value above replacement
  isPitcher: boolean;
};

type AuctionValuesResponse = AuctionPlayer[];
This is the backing data for /players (with some extra derived fields).

4. Players endpoint (pool browser)
Endpoint

GET /api/players

Response shape used by the UI

ts
Copy code
type PlayerRow = {
  mlbId: string;
  name: string;          // "Juan Soto"
  isPitcher: boolean;

  // roster / league info
  ogbaTeam: string | null; // "Skunk Dogs", null if FA
  ogbaStatus: "Owned" | "Free agent";

  // position & games
  gamesByPos: Record<string, number>; // { "1B": 27, "OF": 3 }
  totalGames: number;                 // sum of gamesByPos

  // hitting season stats (hitters only)
  G?: number;
  AB?: number;
  R?: number;
  H?: number;
  HR?: number;
  RBI?: number;
  SB?: number;
  AVG?: number;
  GS_h?: number;       // games started as hitter, if you need it

  // pitching season stats (pitchers only)
  IP?: number;         // innings pitched, decimal
  ER?: number;
  H_allowed?: number;
  BB?: number;
  SO?: number;
  W?: number;
  SV?: number;
  ERA?: number;
  WHIP?: number;
};

type PlayersResponse = PlayerRow[];
5. Player detail (for modal)
Endpoint

GET /api/player-detail?mlbId=:mlbId

Response

ts
Copy code
type RecentRowHitter = {
  label: "Last 7 days" | "Last 14 days" | "Last 21 days" | "YTD";
  G: number;
  AB: number;
  R: number;
  H: number;
  "2B": number;
  "3B": number;
  HR: number;
  RBI: number;
  SB: number;
  CS: number;
  AVG: number;
  OBP: number;
  SLG: number;
};

type RecentRowPitcher = {
  label: "Last 7 days" | "Last 14 days" | "Last 21 days" | "YTD";
  G: number;
  IP: number;
  ER: number;
  H: number;
  BB: number;
  SO: number;
  W: number;
  SV: number;
  ERA: number;
  WHIP: number;
};

type ProjectionRowHitter = {
  label: "Preseason" | "Rest-of-Season" | "YTD+RoS";
  AB: number;
  R: number;
  H: number;
  "2B": number;
  "3B": number;
  HR: number;
  RBI: number;
  SB: number;
  CS: number;
  BB: number;
  K: number;
  AVG: number;
  OBP: number;
  SLG: number;
};

type ProjectionRowPitcher = {
  label: "Preseason" | "Rest-of-Season" | "YTD+RoS";
  IP: number;
  ER: number;
  H: number;
  BB: number;
  SO: number;
  W: number;
  SV: number;
  ERA: number;
  WHIP: number;
};

type CareerRowHitter = {
  year: number | "TOT";
  team: string;
  G: number;
  AB: number;
  R: number;
  H: number;
  "2B": number;
  "3B": number;
  HR: number;
  RBI: number;
  SB: number;
  CS: number;
  BB: number;
  K: number;
  AVG: number;
  OBP: number;
  SLG: number;
};

type CareerRowPitcher = {
  year: number | "TOT";
  team: string;
  G: number;
  IP: number;
  ER: number;
  H: number;
  BB: number;
  SO: number;
  W: number;
  SV: number;
  ERA: number;
  WHIP: number;
};

type GameLogRowHitter = {
  date: string;      // "2025-09-17"
  opp: string;       // "vs SF"
  AB: number;
  R: number;
  H: number;
  "2B": number;
  "3B": number;
  HR: number;
  RBI: number;
  SB: number;
  CS: number;
  BB: number;
  HBP: number;
  K: number;
};

type GameLogRowPitcher = {
  date: string;
  opp: string;
  IP: number;
  ER: number;
  H: number;
  BB: number;
  SO: number;
  W: number;
  SV: number;
  ERA: number;
  WHIP: number;
};

type PlayerDetailResponse = {
  mlbId: string;
  name: string;
  mlbTeam: string;
  batsThrows: string; // "L/R"
  positionText: string; // "1B / OF"
  isPitcher: boolean;

  news: { headline: string; source: string; timestamp: string; url?: string }[];

  recent: (RecentRowHitter | RecentRowPitcher)[];
  projections: (ProjectionRowHitter | ProjectionRowPitcher)[];
  career: (CareerRowHitter | CareerRowPitcher)[];
  gameLog: (GameLogRowHitter | GameLogRowPitcher)[];
};
