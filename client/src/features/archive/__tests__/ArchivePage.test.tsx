import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ArchiveSeasonListResponseSchema, ArchiveSeasonResponseSchema, type ArchiveSeasonResponse } from "@shared/api/archiveSeason";

vi.mock("../historyApi", () => ({ getArchiveHistory: vi.fn(), getArchiveSeason: vi.fn(), downloadWorkbook: vi.fn() }));
vi.mock("../playerCheckApi", () => ({ getMyAuditAccess: vi.fn() }));
vi.mock("../components/TrophyCaseTab", () => ({ default: ({ leagueId }: { leagueId: number }) => <div>Trophy case for league {leagueId}</div> }));
vi.mock("../../../contexts/LeagueContext", () => ({ useLeague: () => ({ leagueId: 20 }) }));

import { ApiError } from "../../../api/base";
import * as api from "../historyApi";
import ArchivePage from "../pages/ArchivePage";
import * as checkApi from "../playerCheckApi";

const m = vi.mocked(api);
const check = vi.mocked(checkApi);

const E = (slot: string, name: string, over: Partial<ArchiveSeasonResponse["rosters"][string]["draft"][number]> = {}) =>
  ({ slot, name, mlbId: null, mlbName: null, price: null, priceNote: null, keeper: false, ...over });

const history = ArchiveSeasonListResponseSchema.parse({
  seasons: [
    { year: 2012, champion: { owner: "Kurt Sakamoto", teamName: "Dodger Dawgs" }, workbook: { fileName: "Fantasy_Baseball_2012.xls", bytes: 118272 } },
    { year: 2003, champion: { owner: "Yuji Ogasa", teamName: "Demolition Lumber Co." }, workbook: null },
  ],
});

const s2012 = ArchiveSeasonResponseSchema.parse({
  year: 2012, keepersFromSheet: true, periodEnds: ["2012-05-06"], periodCount: 2, hasMoves: true,
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
  moves: [{ period: 1, meetingDate: null, byTeam: { DDG: { added: [], dropped: [] }, MNB: { added: [], dropped: [] } } }, { period: 2, meetingDate: "2012-05-06", byTeam: { DDG: { added: [E("3B", "R. Roberts", { mlbName: "Ryan Roberts", mlbId: 1 })], dropped: [E("P", "J. Soto")] }, MNB: { added: [], dropped: [] } } }],
});

const s2003 = ArchiveSeasonResponseSchema.parse({
  year: 2003, keepersFromSheet: false, periodEnds: [], periodCount: 6, hasMoves: false,
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
  check.getMyAuditAccess.mockResolvedValue({ level: null, teamCodes: null });
});

describe("the season view", () => {
  it("opens on the newest season: champion and standings with owners first, points per period", async () => {
    renderAt();
    await screen.findByText("2012 champion");
    expect(m.getArchiveSeason).toHaveBeenCalledWith(2012);
    const rows = within(screen.getByRole("region", { name: "2012 standings" })).getAllByRole("row");
    expect(rows[0].textContent).toBe("#OwnerP1May 6P2Total"); // each period with the day it ended; the last ends with the season
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
    expect(screen.getByRole("note").textContent).toBe(
      "Rebuilt from the commissioner’s old workbooks, so some seasons are incomplete and may have mistakes. The 2003 workbook is missing the draft and the moves at each meeting.",
    );
  });

  it("says a season is rebuilt and may be incomplete even when nothing is known to be missing, and says rows can be tapped", async () => {
    renderAt();
    await screen.findByText("2012 champion");
    expect(screen.getByRole("note").textContent).toBe("Rebuilt from the commissioner’s old workbooks, so some seasons are incomplete and may have mistakes.");
    expect(screen.getByText(/Tap a team to see its draft/)).toBeTruthy();
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
    expect(moves.textContent).toContain("May 6 meeting · before period 2");
    expect(moves.textContent).not.toContain("After the draft"); // no changes then, so not listed
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

  it("names the missing meeting for a season whose workbook lacks one sheet (2009), under the standings and in the team's moves", async () => {
    m.getArchiveSeason.mockResolvedValue({ ...s2012, year: 2009 });
    renderAt("/archive?season=2009&team=DDG");
    await screen.findByRole("heading", { name: "Kurt Sakamoto" });
    expect(screen.getByRole("note").textContent).toContain("no roster for period 1: the May 5 sheet already includes that meeting’s moves");
    const moves = screen.getByRole("region", { name: "Moves at each meeting" });
    expect(moves.textContent).toContain("Missing meeting: ");
    expect(moves.textContent).toContain("show under “After the draft”");
  });

  it("says nothing about a missing meeting for a season with every sheet (2012)", async () => {
    renderAt("/archive?team=DDG");
    await screen.findByRole("heading", { name: "Kurt Sakamoto" });
    expect(screen.queryByText(/Missing meeting/)).toBeNull();
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
    fireEvent.click(await screen.findByRole("link", { name: "Trophy case" }));
    expect(await screen.findByText("Trophy case for league 20")).toBeTruthy();
    expect(search()).toBe("?tab=trophy");
    expect(screen.getByRole("link", { name: "Trophy case" }).getAttribute("aria-current")).toBe("page");
    // Back to the season keeps the year that was showing.
    expect(screen.getByRole("link", { name: "Season" }).getAttribute("href")).toBe("/archive?season=2012");
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

describe("player check tab", () => {
  beforeEach(() => {
    m.getArchiveHistory.mockResolvedValue(history);
    m.getArchiveSeason.mockResolvedValue(s2012);
  });

  it("shows a Player check tab to an owner who was let in, next to Season and Trophy case", async () => {
    check.getMyAuditAccess.mockResolvedValue({ level: "OWN_TEAM", teamCodes: ["DDG"] });
    renderAt("/archive?season=2012");
    const tab = await screen.findByRole("link", { name: "Player check" });
    expect(tab.getAttribute("href")).toBe("/archive/player-check");
    const strip = screen.getByRole("navigation", { name: "Archive" });
    expect(within(strip).getAllByRole("link").map((l) => l.textContent)).toEqual(["Season", "Trophy case", "Player check"]);
    expect(within(strip).getByRole("link", { name: "Season" }).getAttribute("aria-current")).toBe("page");
    expect(within(strip).getByRole("link", { name: "Season" }).getAttribute("href")).toBe("/archive?season=2012");
  });

  it("shows it to the commissioner or an admin too", async () => {
    check.getMyAuditAccess.mockResolvedValue({ level: "ALL", teamCodes: null });
    renderAt();
    expect(await screen.findByRole("link", { name: "Player check" })).toBeTruthy();
  });

  it("shows no Player check tab to a member nobody let in, or when the check can't be reached", async () => {
    check.getMyAuditAccess.mockResolvedValue({ level: null, teamCodes: null });
    const { unmount } = renderAt();
    await waitFor(() => expect(check.getMyAuditAccess).toHaveBeenCalled());
    await screen.findByRole("link", { name: "Trophy case" });
    expect(screen.queryByRole("link", { name: "Player check" })).toBeNull();
    unmount();
    check.getMyAuditAccess.mockRejectedValue(new Error("offline"));
    renderAt();
    await waitFor(() => expect(check.getMyAuditAccess).toHaveBeenCalledTimes(2));
    await screen.findByRole("link", { name: "Trophy case" });
    expect(screen.queryByRole("link", { name: "Player check" })).toBeNull();
  });
});

describe("source workbooks", () => {
  it("names the season's original workbook in plain words, and downloads it under its real file name", async () => {
    m.downloadWorkbook.mockResolvedValue(undefined);
    renderAt("/archive?season=2012");
    expect(await screen.findByText("Read from the commissioner’s 2012 workbook, unedited (Excel, 116 KB).")).toBeTruthy();
    expect(screen.queryByText(/Fantasy_Baseball_2012\.xls/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Download the 2012 workbook (Excel, 116 KB)" })[0]);
    expect(m.downloadWorkbook).toHaveBeenCalledWith(2012, "Fantasy_Baseball_2012.xls");
  });

  it("shows why when the download fails, and lets you try again", async () => {
    m.downloadWorkbook.mockRejectedValueOnce(new Error("The 2012 workbook hasn’t been uploaded yet."));
    renderAt("/archive?season=2012");
    const btn = (await screen.findAllByRole("button", { name: /the 2012 workbook/ }))[0];
    fireEvent.click(btn);
    expect(await screen.findByText("The 2012 workbook hasn’t been uploaded yet.")).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("lists every season that has a workbook in one place, and says nothing for a season without one", async () => {
    renderAt("/archive?season=2003");
    await waitFor(() => expect(screen.getByText("All source workbooks (1 season)")).toBeTruthy());
    expect(screen.queryByText(/Read from the commissioner’s/)).toBeNull();
    const list = screen.getByText("All source workbooks (1 season)").closest("details")!;
    expect(within(list).getByText("Excel · 116 KB")).toBeTruthy();
  });
});
