# The Fantastic Leagues — API Schema (v0.1)

_Source of truth for JSON shapes returned by the server._

---

## 1. `GET /api/season-standings`

```ts
type SeasonStandingsResponse = {
  periodIds: number[];            // e.g. [1,2,3,4,5,6]
  rows: SeasonRow[];
};

type SeasonRow = {
  teamId: number;
  teamName: string;
  owner: string;

  // raw season totals
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AVG: number;      // 0.265...
  W: number;
  S: number;
  K: number;
  ERA: number;
  WHIP: number;

  totalPoints: number;          // sum of categoryPoints
  categoryPoints: {
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
};
## 2. 'GET /api/period-standings?periodId=:id
ts
Copy code
type PeriodStandingsResponse = {
  periodId: number;
  periodName: string;     // e.g. "Period 3"
  rows: PeriodRow[];
};

type PeriodRow = {
  teamId: number;
  teamName: string;

  stats: {
    R: number;
    HR: number;
    RBI: number;
    SB: number;
    AVG: number;      // 0.265...
    W: number;
    S: number;
    K: number;
    ERA: number;
    WHIP: number;
  };

  points: {
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

  totalPoints: number;      // sum of points.*
};
## 3. 'GET /api/auction-values
ts
Copy code
type AuctionValuesResponse = {
  rows: AuctionRow[];
};

type AuctionRow = {
  mlb_id: string;       // MLBAM id as string, e.g. "665742"
  name: string;         // "J. Naylor"
  team: string;         // OGBA team code: "DMK", "LDY", etc.
  pos: string;          // primary fantasy position
  value: number;        // dollar auction value
  relValue: number;     // optional "value above replacement" style metric
  isPitcher: boolean;   // true = pitcher, false = hitter
};
Anything new we add (player detail, game logs, projections) should get a section here before we start coding against it.

markdown
Copy code

This doesn’t affect runtime, but it will keep both of us honest as we add features.
