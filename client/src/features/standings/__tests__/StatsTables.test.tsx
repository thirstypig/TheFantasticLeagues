import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  PeriodSummaryTable,
  CategoryPeriodTable,
  SeasonTable,
  TeamSeasonSummaryTable,
  TeamPeriodHittersTable,
  TeamPeriodPitchersTable,
} from "../../../components/StatsTables";
import type {
  PeriodSummaryTableProps,
  CategoryPeriodTableProps,
  SeasonTableProps,
  TeamSeasonSummaryProps,
  TeamPeriodHittersProps,
  TeamPeriodPitchersProps,
} from "../../../components/StatsTables";

// Wrap in MemoryRouter since components use <Link>
function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("PeriodSummaryTable", () => {
  const props: PeriodSummaryTableProps = {
    periodId: "P1",
    categories: ["R", "HR", "AVG"],
    rows: [
      {
        teamId: "1", teamName: "Team Alpha", gamesPlayed: 10,
        categories: [
          { categoryId: "R", points: 8 },
          { categoryId: "HR", points: 6 },
          { categoryId: "AVG", points: 7 },
        ],
        totalPoints: 21, totalPointsDelta: 1.5,
      },
      {
        teamId: "2", teamName: "Team Beta", gamesPlayed: 10,
        categories: [
          { categoryId: "R", points: 5 },
          { categoryId: "HR", points: 7 },
          { categoryId: "AVG", points: 4 },
        ],
        totalPoints: 16, totalPointsDelta: -0.5,
      },
    ],
  };

  it("renders team names", () => {
    renderWithRouter(<PeriodSummaryTable {...props} />);
    expect(screen.getByText("Team Alpha")).toBeInTheDocument();
    expect(screen.getByText("Team Beta")).toBeInTheDocument();
  });

  it("renders category headers", () => {
    renderWithRouter(<PeriodSummaryTable {...props} />);
    expect(screen.getByText("R")).toBeInTheDocument();
    expect(screen.getByText("HR")).toBeInTheDocument();
    expect(screen.getByText("AVG")).toBeInTheDocument();
  });

  it("sorts rows by totalPoints descending", () => {
    renderWithRouter(<PeriodSummaryTable {...props} />);
    const teamLinks = screen.getAllByRole("link");
    expect(teamLinks[0]).toHaveTextContent("Team Alpha");
    expect(teamLinks[1]).toHaveTextContent("Team Beta");
  });

  it("renders total points formatted to 1 decimal", () => {
    renderWithRouter(<PeriodSummaryTable {...props} />);
    expect(screen.getByText("21.0")).toBeInTheDocument();
    expect(screen.getByText("16.0")).toBeInTheDocument();
  });

  it("renders delta with sign", () => {
    renderWithRouter(<PeriodSummaryTable {...props} />);
    expect(screen.getByText("+1.5")).toBeInTheDocument();
    expect(screen.getByText("-0.5")).toBeInTheDocument();
  });
});

describe("CategoryPeriodTable", () => {
  const props: CategoryPeriodTableProps = {
    periodId: "P1",
    categoryId: "AVG",
    rows: [
      { teamId: "1", teamName: "Team A", periodStat: 0.285, points: 7, pointsDelta: 0.5 },
      { teamId: "2", teamName: "Team B", periodStat: 0.312, points: 8, pointsDelta: -1.0 },
    ],
  };

  it("renders category metric label", () => {
    renderWithRouter(<CategoryPeriodTable {...props} />);
    expect(screen.getByText(/AVG Metric/)).toBeInTheDocument();
  });

  it("formats AVG stat as rate (leading dot)", () => {
    renderWithRouter(<CategoryPeriodTable {...props} />);
    expect(screen.getByText(".285")).toBeInTheDocument();
    expect(screen.getByText(".312")).toBeInTheDocument();
  });

  it("sorts rows by points descending", () => {
    renderWithRouter(<CategoryPeriodTable {...props} />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("Team B"); // 8 points
    expect(links[1]).toHaveTextContent("Team A"); // 7 points
  });
});

describe("SeasonTable", () => {
  const props: SeasonTableProps = {
    periods: [
      { periodId: "P1", label: "April 20", meetingDate: "2025-04-20" },
      { periodId: "P2", label: "May 4", meetingDate: "2025-05-04" },
    ],
    rows: [
      { teamId: "1", teamName: "Team A", periodPoints: { P1: 21, P2: 18 }, seasonTotalPoints: 39 },
      { teamId: "2", teamName: "Team B", periodPoints: { P1: 16, P2: 22 }, seasonTotalPoints: 38 },
    ],
  };

  it("renders period column headers", () => {
    renderWithRouter(<SeasonTable {...props} />);
    expect(screen.getByText("April 20")).toBeInTheDocument();
    expect(screen.getByText("May 4")).toBeInTheDocument();
  });

  it("renders season total column", () => {
    renderWithRouter(<SeasonTable {...props} />);
    expect(screen.getByText("Season Total")).toBeInTheDocument();
  });

  it("sorts by season total descending", () => {
    renderWithRouter(<SeasonTable {...props} />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("Team A"); // 39 pts
    expect(links[1]).toHaveTextContent("Team B"); // 38 pts
  });

  it("renders period point values", () => {
    renderWithRouter(<SeasonTable {...props} />);
    expect(screen.getByText("39.0")).toBeInTheDocument();
    expect(screen.getByText("38.0")).toBeInTheDocument();
  });
});

describe("TeamSeasonSummaryTable", () => {
  const props: TeamSeasonSummaryProps = {
    summary: {
      teamId: "1",
      teamName: "Team Alpha",
      periodPoints: [
        { periodId: "P1", points: 21 },
        { periodId: "P2", points: 18 },
      ],
      seasonTotalPoints: 39,
    },
    periods: [
      { periodId: "P1", label: "April 20", meetingDate: "2025-04-20" },
      { periodId: "P2", label: "May 4", meetingDate: "2025-05-04" },
    ],
  };

  it("renders team name in heading", () => {
    renderWithRouter(<TeamSeasonSummaryTable {...props} />);
    expect(screen.getByText(/Team Alpha/)).toBeInTheDocument();
  });

  it("renders period rows with scores", () => {
    renderWithRouter(<TeamSeasonSummaryTable {...props} />);
    expect(screen.getByText("April 20")).toBeInTheDocument();
    expect(screen.getByText("21.0")).toBeInTheDocument();
  });

  it("renders season total row", () => {
    renderWithRouter(<TeamSeasonSummaryTable {...props} />);
    expect(screen.getByText("Season Total")).toBeInTheDocument();
    expect(screen.getByText("39.0")).toBeInTheDocument();
  });
});

describe("TeamPeriodHittersTable", () => {
  const props: TeamPeriodHittersProps = {
    periodId: "P1",
    teamId: "1",
    hitters: [
      {
        playerId: "1", playerName: "Aaron Judge", mlbTeam: "NYY",
        positions: ["OF", "DH"], gDH: 5, gC: 0, g1B: 0, g2B: 0, g3B: 0, gSS: 0, gOF: 5,
        ab: 40, runs: 8, hits: 12, hr: 4, rbi: 10, sb: 1, bb: 6, gs: 0, avg: 0.300,
      },
      {
        playerId: "2", playerName: "Freddie Freeman", mlbTeam: "LAD",
        positions: ["1B"], gDH: 0, gC: 0, g1B: 10, g2B: 0, g3B: 0, gSS: 0, gOF: 0,
        ab: 38, runs: 6, hits: 11, hr: 2, rbi: 7, sb: 0, bb: 4, gs: 1, avg: 0.289,
      },
    ],
  };

  it("renders hitter names", () => {
    renderWithRouter(<TeamPeriodHittersTable {...props} />);
    expect(screen.getByText("Aaron Judge")).toBeInTheDocument();
    expect(screen.getByText("Freddie Freeman")).toBeInTheDocument();
  });

  it("renders batting totals row", () => {
    renderWithRouter(<TeamPeriodHittersTable {...props} />);
    expect(screen.getByText("Batting Totals")).toBeInTheDocument();
  });

  it("computes correct total stats", () => {
    renderWithRouter(<TeamPeriodHittersTable {...props} />);
    // Total runs: 8 + 6 = 14
    const cells = screen.getAllByText("14");
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });
});

describe("TeamPeriodPitchersTable", () => {
  const props: TeamPeriodPitchersProps = {
    periodId: "P1",
    teamId: "1",
    pitchers: [
      {
        playerId: "10", playerName: "Gerrit Cole", mlbTeam: "NYY", role: "SP",
        g: 3, gs: 3, soShutouts: 0, ip: 20, h: 15, er: 5, bb: 3, k: 25, w: 2, l: 1, sv: 0, bs: 0,
        era: 2.25, whip: 0.90,
      },
      {
        playerId: "11", playerName: "Edwin Diaz", mlbTeam: "NYM", role: "RP",
        g: 5, gs: 0, soShutouts: 0, ip: 5, h: 3, er: 1, bb: 2, k: 8, w: 0, l: 0, sv: 3, bs: 1,
        era: 1.80, whip: 1.00,
      },
    ],
  };

  it("renders pitcher names", () => {
    renderWithRouter(<TeamPeriodPitchersTable {...props} />);
    expect(screen.getByText("Gerrit Cole")).toBeInTheDocument();
    expect(screen.getByText("Edwin Diaz")).toBeInTheDocument();
  });

  it("renders role badges", () => {
    renderWithRouter(<TeamPeriodPitchersTable {...props} />);
    expect(screen.getByText("SP")).toBeInTheDocument();
    expect(screen.getByText("RP")).toBeInTheDocument();
  });

  it("renders pitching totals row", () => {
    renderWithRouter(<TeamPeriodPitchersTable {...props} />);
    expect(screen.getByText("Pitching Totals")).toBeInTheDocument();
  });

  it("computes correct total ERA", () => {
    renderWithRouter(<TeamPeriodPitchersTable {...props} />);
    // Total: (9 * 6) / 25 = 2.16
    expect(screen.getByText("2.16")).toBeInTheDocument();
  });
});
