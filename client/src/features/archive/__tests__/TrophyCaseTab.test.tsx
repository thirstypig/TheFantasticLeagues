import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../api", () => ({ getTrophyCase: vi.fn() }));

import * as api from "../api";
import TrophyCaseTab from "../components/TrophyCaseTab";
import { seasonRanges } from "../lib/seasonView";

const m = vi.mocked(api);

const data = {
  championships: [
    { year: 2004, teamCode: "DMK", teamName: "Diamond Kings", owner: "Kent Sakamoto" },
    { year: 2012, teamCode: "DDG", teamName: "Dodger Dawgs", owner: "Kurt Sakamoto" },
  ],
  allTimeStandings: [
    { key: "Kurt Sakamoto", owner: "Kurt Sakamoto", teamCode: "DDG", teamName: "Dodger Dawgs", teamNames: ["Dodger Dawgs", "Disco Rover", "Crush Brothers Inc."], totalPoints: 1, seasons: 23, avgRank: 4.09, avgScore: 1, championships: 2 },
    { key: "Tim Yuba", owner: "Tim Yuba", teamCode: "SKD", teamName: "Skunk Dogs", teamNames: ["Skunk Dogs"], totalPoints: 1, seasons: 23, avgRank: 3.39, avgScore: 1, championships: 6 },
    { key: "James Chang", owner: "James Chang", teamCode: "LDY", teamName: "Los Doyers", teamNames: ["Los Doyers", "The Fluffers", "VIP BALCOS"], totalPoints: 1, seasons: 16, avgRank: 6, avgScore: 1, championships: 0 },
  ],
  records: { bestSeason: null, worstSeason: null, mostChampionships: null, bestCategoryBySeason: {} },
  dynastyScores: [],
  profiles: {
    "Kurt Sakamoto": {
      key: "Kurt Sakamoto", owner: "Kurt Sakamoto",
      owners: [{ name: "Kurt Sakamoto", from: 2003, to: 2025 }],
      teams: [{ name: "Dodger Dawgs", from: 2006, to: 2025 }, { name: "Crush Brothers Inc.", from: 2003, to: 2004 }],
      titleYears: [2012, 2025],
      favoriteKeepers: [{ name: "Buster Posey", mlbId: 457763, seasons: [2012, 2013, 2014], possible: true }, { name: "Pablo Sandoval", mlbId: null, seasons: [2009, 2010], possible: false }],
    },
    "Tim Yuba": {
      key: "Tim Yuba", owner: "Tim Yuba",
      owners: [{ name: "Tim Yuba", from: 2005, to: 2025 }, { name: "Tim Yuba & Jerrod Jue", from: 2004, to: 2004 }],
      teams: [{ name: "Skunk Dogs", from: 2003, to: 2025 }], titleYears: [2009], favoriteKeepers: [],
    },
    "James Chang": { key: "James Chang", owner: "James Chang", owners: [{ name: "James Chang", from: 2004, to: 2025 }], teams: [{ name: "Los Doyers", from: 2016, to: 2025 }], titleYears: [], favoriteKeepers: [] },
  },
  keeperSeasons: [2006, 2025],
};

beforeEach(() => { vi.clearAllMocks(); m.getTrophyCase.mockResolvedValue(data as never); });

describe("TrophyCaseTab", () => {
  it("shows champions, the completeness note, and one leaderboard: avg finish, titles, seasons", async () => {
    render(<TrophyCaseTab leagueId={20} />);
    await screen.findByRole("heading", { name: "All-time leaderboard" });
    expect(m.getTrophyCase).toHaveBeenCalledWith(20);
    expect(screen.getByText(/incomplete or approximate/)).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["#", "Owner", "Avg finish", "Titles", "Seasons"]);
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows[0]).toBe("1Kurt SakamotoDodger Dawgs · Disco Rover · Crush Brothers Inc.4.09223");
    expect(rows[2]).toBe("3James ChangLos Doyers · The Fluffers · VIP BALCOS6.00—16");
    expect(screen.queryByText(/Dynasty/)).toBeNull();
    expect(screen.queryByText(/Records/)).toBeNull();
  });

  it("opens an owner's profile: teams, titles, favorite keepers with the possible-keeper note", async () => {
    render(<TrophyCaseTab leagueId={20} />);
    fireEvent.click(await screen.findByRole("button", { name: /Kurt Sakamoto/ }));
    expect(screen.getByRole("heading", { name: "Kurt Sakamoto" })).toBeTruthy();
    expect(screen.getByText("2 titles: 2012, 2025")).toBeTruthy();
    const keepers = screen.getByRole("region", { name: "Favorite keepers" });
    expect(within(keepers).getByRole("link", { name: "Buster Posey" }).getAttribute("href")).toBe("https://www.mlb.com/player/457763");
    expect(keepers.textContent).toContain("2012–20143 seasons *");
    expect(keepers.textContent).toContain("Pablo Sandoval2009–20102 seasons");
    expect(screen.getByText(/same team at the same price as last season/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Teams" }).textContent).toContain("Crush Brothers Inc.2003–2004");
  });

  it("lists the owners when they changed, and not when they didn't", async () => {
    render(<TrophyCaseTab leagueId={20} />);
    fireEvent.click(await screen.findByRole("button", { name: /Tim Yuba/ }));
    expect(screen.getByRole("region", { name: "Owners" }).textContent).toBe("OwnersTim Yuba2005–2025Tim Yuba & Jerrod Jue2004");
    fireEvent.click(screen.getByRole("button", { name: /Kurt Sakamoto/ }));
    expect(screen.queryByRole("region", { name: "Owners" })).toBeNull();
  });

  it("says so when an owner has no repeat keepers, and closes on a second tap", async () => {
    render(<TrophyCaseTab leagueId={20} />);
    fireEvent.click(await screen.findByRole("button", { name: /James Chang/ }));
    expect(screen.getByText("No titles yet")).toBeTruthy();
    expect(screen.getByText("No player kept more than one season since 2006.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /James Chang/ }));
    expect(screen.queryByRole("heading", { name: "James Chang" })).toBeNull();
  });

  it("reports a load failure", async () => {
    m.getTrophyCase.mockRejectedValue(new Error("down"));
    render(<TrophyCaseTab leagueId={20} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn’t load the trophy case/);
  });
});

describe("seasonRanges", () => {
  it("joins runs and keeps gaps", () => {
    expect(seasonRanges([2006, 2007, 2008])).toBe("2006–2008");
    expect(seasonRanges([2025, 2022, 2024])).toBe("2022, 2024–2025");
    expect(seasonRanges([2012])).toBe("2012");
  });
});
