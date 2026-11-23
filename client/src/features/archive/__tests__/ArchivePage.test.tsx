import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ArchiveSeasonListResponseSchema, ArchiveSeasonResponseSchema, type ArchiveSeasonResponse } from "@shared/api/archiveSeason";

vi.mock("../historyApi", () => ({ getArchiveHistory: vi.fn(), getArchiveSeason: vi.fn() }));
vi.mock("../components/TrophyCaseTab", () => ({ default: ({ leagueId }: { leagueId: number }) => <div>Trophy case for league {leagueId}</div> }));
vi.mock("../../../contexts/LeagueContext", () => ({ useLeague: () => ({ leagueId: 20 }) }));

import { ApiError } from "../../../api/base";
import * as api from "../historyApi";
import ArchivePage from "../pages/ArchivePage";

const m = vi.mocked(api);

const E = (slot: string, name: string, over: Partial<ArchiveSeasonResponse["rosters"][string]["draft"][number]> = {}) =>
  ({ slot, name, mlbId: null, mlbName: null, price: null, priceNote: null, keeper: false, ...over });

const history = ArchiveSeasonListResponseSchema.parse({
  seasons: [
    { year: 2012, champion: { owner: "Kurt Sakamoto", teamName: "Dodger Dawgs" } },
    { year: 2003, champion: { owner: "Yuji Ogasa", teamName: "Demolition Lumber Co." } },
  ],
});

const s2012 = ArchiveSeasonResponseSchema.parse({
  year: 2012, keepersFromSheet: true, periodCount: 2, hasMoves: true,
  teams: [
    { code: "DDG", name: "Dodger Dawgs", owner: "Kurt Sakamoto", points: [72.5, 42], total: 394.5, rank: 1, note: "Total row 394.5 ≠ standings block 349.5." },
    { code: "MNB", name: "MoneyBall", owner: "Mike Gin", points: [40, 44.5], total: 351, rank: 2, note: null },
  ],
  rosters: {
    DDG: {
      draft: [E("C", "B. Posey", { mlbId: 457763, mlbName: "Buster Posey", price: 25, keeper: true }), E("P", "J. Soto", { priceNote: "AL" })],
      final: [E("C", "B. Posey", { mlbId: 457763, mlbName: "Buster Posey" })],
    },
    MNB: { draft: [], final: [] },
  },
  moves: [{ period: 2, byTeam: { DDG: { added: [E("3B", "R. Roberts", { mlbName: "Ryan Roberts", mlbId: 1 })], dropped: [E("P", "J. Soto")] }, MNB: { added: [], dropped: [] } } }],
});

const s2003 = ArchiveSeasonResponseSchema.parse({
  year: 2003, keepersFromSheet: false, periodCount: 6, hasMoves: false,
  teams: [{ code: "DLC", name: "Demolition Lumber Co.", owner: "Yuji Ogasa", points: [40, 41, 42, 50, 51, 51], total: 275, rank: 1, note: null }],
  rosters: { DLC: { draft: [], final: [E("C", "J. Kendall", { mlbName: "Jason Kendall", mlbId: 2 })] } },
  moves: [],
});

function Where() { return <output data-testid="search">{useLocation().search}</output>; }
const renderAt = (path = "/archive") => render(<MemoryRouter initialEntries={[path]}><ArchivePage /><Where /></MemoryRouter>);
const search = () => screen.getByTestId("search").textContent;

beforeEach(() => {
  vi.clearAllMocks();
  m.getArchiveHistory.mockResolvedValue(history);
  m.getArchiveSeason.mockImplementation(async (y: number) => (y === 2003 ? s2003 : s2012));
});

describe("the season view", () => {
  it("opens on the newest season: champion and standings with owners first, points per period", async () => {
    renderAt();
    await screen.findByText("2012 champion");
    expect(m.getArchiveSeason).toHaveBeenCalledWith(2012);
    const rows = within(screen.getByRole("region", { name: "2012 standings" })).getAllByRole("row");
    expect(rows[0].textContent).toBe("#OwnerP1P2Total");
    expect(rows[1].textContent).toContain("Kurt Sakamoto");
    expect(rows[1].textContent).toContain("Dodger Dawgs");
    expect(rows[1].textContent).toContain("72.5");
    expect(rows[1].textContent).toContain("394.5");
  });

  it("opens the season in the link", async () => {
    renderAt("/archive?season=2003");
    await screen.findByText("2003 champion");
    expect(m.getArchiveSeason).toHaveBeenCalledWith(2003);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["#", "Owner", "P1", "P2", "P3", "P4", "P5", "P6", "Total"]);
  });

  it("switches season from the picker and the arrows, closing any open team", async () => {
    renderAt("/archive?season=2012&team=DDG");
    await screen.findByRole("heading", { name: "Kurt Sakamoto" });
    fireEvent.change(screen.getByLabelText("Season", { selector: "select" }), { target: { value: "2003" } });
    await screen.findByText("2003 champion");
    expect(search()).toBe("?season=2003");
    expect((screen.getByRole("button", { name: "Previous season" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next season" }));
    await screen.findByText("2012 champion");
  });
});

describe("one team", () => {
  it("opens below the table: draft with prices and keepers, moves at each meeting, final roster", async () => {
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: /Kurt Sakamoto/ }));
    expect(search()).toBe("?team=DDG");
    const draft = screen.getByRole("region", { name: "Draft day" });
    expect(within(draft).getByText("Draft day · 1 keeper")).toBeTruthy();
    expect(within(draft).getByRole("link", { name: "Buster Posey" }).getAttribute("href")).toBe("https://www.mlb.com/player/457763");
    expect(within(draft).getByText("keeper")).toBeTruthy();
    expect(within(draft).getByText("$25")).toBeTruthy();
    expect(within(draft).getByText("left the NL")).toBeTruthy();
    // Unresolved names show as written.
    expect(within(draft).getByText("J. Soto")).toBeTruthy();
    const moves = screen.getByRole("region", { name: "Moves at each meeting" });
    expect(moves.textContent).toContain("Before period 2");
    expect(moves.textContent).toContain("+ Ryan Roberts");
    expect(moves.textContent).toContain("− J. Soto");
    expect(screen.getByText(/Total row 394.5/)).toBeTruthy();
  });

  it("labels derived keepers 'possible keeper' and explains it", async () => {
    m.getArchiveSeason.mockResolvedValue({ ...s2012, keepersFromSheet: false });
    renderAt("/archive?team=DDG");
    const draft = await screen.findByRole("region", { name: "Draft day" });
    expect(within(draft).getByText("possible keeper")).toBeTruthy();
    expect(within(draft).getByText(/same price as last season/)).toBeTruthy();
  });

  it("says what the workbook lacks for a season without a draft or meeting rosters (2003)", async () => {
    renderAt("/archive?season=2003&team=DLC");
    await screen.findByRole("heading", { name: "Yuji Ogasa" });
    expect(screen.getByText("The 2003 workbook has no draft sheet.")).toBeTruthy();
    expect(screen.getByText(/doesn’t have a roster for each meeting/)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "End of season" })).getByText("Jason Kendall")).toBeTruthy();
  });

  it("closes when tapped again", async () => {
    renderAt("/archive?team=DDG");
    await screen.findByRole("heading", { name: "Kurt Sakamoto" });
    fireEvent.click(screen.getByRole("button", { name: /Kurt Sakamoto/ }));
    expect(screen.queryByRole("heading", { name: "Kurt Sakamoto" })).toBeNull();
    expect(search()).toBe("");
  });
});

describe("tabs and states", () => {
  it("shows the trophy case for the current league", async () => {
    renderAt();
    fireEvent.click(await screen.findByRole("tab", { name: "Trophy case" }));
    expect(screen.getByText("Trophy case for league 20")).toBeTruthy();
    expect(search()).toBe("?tab=trophy");
  });

  it("says the archive is members-only on a 403", async () => {
    m.getArchiveHistory.mockRejectedValue(new ApiError({ message: "x", status: 403, url: "", requestId: null, body: null }));
    renderAt();
    expect(await screen.findByText("The archive is open to league members only.")).toBeTruthy();
  });

  it("says when a season fails to load, and when nothing is archived", async () => {
    m.getArchiveSeason.mockRejectedValue(new Error("down"));
    const { unmount } = renderAt();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn’t load 2012/);
    unmount();
    m.getArchiveHistory.mockResolvedValue({ seasons: [] });
    renderAt();
    await waitFor(() => expect(screen.getByText("No seasons have been archived yet.")).toBeTruthy());
  });
});
