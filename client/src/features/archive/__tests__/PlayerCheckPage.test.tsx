import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("../playerCheckApi", () => ({
  getPlayerCheck: vi.fn(),
  decidePlayer: vi.fn(),
  undoPlayerDecision: vi.fn(),
  searchPlayers: vi.fn(),
}));

import { ApiError } from "../../../api/base";
import * as api from "../playerCheckApi";
import PlayerCheckPage from "../pages/PlayerCheckPage";
import { decided, flaggedPujols, JAMEY, JARET, line, openWright, picked, response, suggestedHawpe } from "./playerCheckFixtures";

const m = vi.mocked(api);
/** An owner let in for his own team (MNB); his decisions aren't final. */
const OWNER = { isAdmin: false, final: false, level: "OWN_TEAM" as const, teamCodes: ["MNB"] };

const apiError = (status: number, serverMessage: string | null = null) =>
  new ApiError({ message: serverMessage ?? `HTTP ${status}`, status, url: "/api/archive/player-check", requestId: null, body: null, serverMessage });

function Where() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderPage(path = "/archive/player-check") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PlayerCheckPage />
      <Where />
    </MemoryRouter>,
  );
}

/** The card for a workbook name. */
const card = (name: string) => screen.getByRole("article", { name: new RegExp(`^${name.replace(/\./g, "\\.")},`) });
const cards = () => screen.queryAllByRole("article");
const seasonRow = (year: number) => screen.getByRole("button", { name: String(year) }).closest("tr") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  m.getPlayerCheck.mockResolvedValue(response([openWright, flaggedPujols, suggestedHawpe]));
});

describe("what the page shows", () => {
  it("summarises the work: settled names, names to decide, and progress", async () => {
    m.getPlayerCheck.mockResolvedValue(response([picked(openWright, JARET), flaggedPujols, suggestedHawpe]));
    renderPage();
    await screen.findByText("Archive player check");
    expect(await screen.findByText(/515 are settled\./)).toBeTruthy();
    expect(screen.getByText(/3 need a decision/)).toBeTruthy();
    expect(screen.getByText((_, el) => el?.className === "apc-progress" && el.textContent === "1 of 3 decided")).toBeTruthy();
  });

  it("lists every season with its counts and how many names are left, plus a total", async () => {
    m.getPlayerCheck.mockResolvedValue(response([picked(openWright, JARET), flaggedPujols, suggestedHawpe]));
    renderPage();
    const cellsOf = (row: HTMLElement) => within(row).getAllByRole("cell").map((c) => c.textContent);
    await waitFor(() => expect(cellsOf(seasonRow(2004))).toEqual(["2004", "267", "3", "1", "4", "1"]));
    expect(cellsOf(seasonRow(2005))).toEqual(["2005", "248", "2", "1", "5", "1"]);
    const total = screen.getByText("All seasons").closest("tr") as HTMLElement;
    expect(cellsOf(total)).toEqual(["All seasons", "515", "5", "2", "9", "2"]);
  });

  it("shows a card per name: spelling, season, team, slots, where it appears, and why it is in doubt", async () => {
    renderPage();
    const pujols = await waitFor(() => card("A. Pujols"));
    expect(within(pujols).getByText("Flagged")).toBeTruthy();
    expect(pujols.textContent).toContain("2004 · MoneyBall");
    expect(pujols.textContent).toContain("on draft day, the final roster");
    expect(within(pujols).getByText("The name fits Albert Pujols, but he didn’t qualify at 3B.")).toBeTruthy();
    expect(within(pujols).getByText("154 G · 692 PA · 46 HR · .331 AVG · 5 SB")).toBeTruthy();
    expect(within(pujols).getByLabelText("Not eligible")).toBeTruthy();
    expect(within(pujols).getByRole("link", { name: "Albert Pujols" }).getAttribute("href")).toBe("https://www.mlb.com/player/405395");
  });

  it("marks the suggested candidate, says why, and offers Confirm for him and Pick for the others", async () => {
    renderPage();
    const wright = await waitFor(() => card("J. Wright"));
    expect(within(wright).getByText("Suggested")).toBeTruthy();
    expect(within(wright).getByText("Why suggested: eligible and played the most (186.1 IP).")).toBeTruthy();
    expect(within(wright).getByText("186.1 IP · 15 W · 0 SV · 159 K · 3.28 ERA")).toBeTruthy();
    expect(within(wright).getByRole("button", { name: "Confirm Jaret Wright" })).toBeTruthy();
    expect(within(wright).getByRole("button", { name: "Pick Jamey Wright" })).toBeTruthy();
    expect(within(wright).queryByText("Close call")).toBeNull();
  });

  it("flags a close call, and shows why a non-matching spelling is offered", async () => {
    m.getPlayerCheck.mockResolvedValue(response([
      { ...openWright, suggestion: { mlbId: 124605, why: "eligible and played the most (186.1 IP)", closeCall: true } },
      suggestedHawpe,
    ]));
    renderPage();
    expect(within(await waitFor(() => card("J. Wright"))).getByText("Close call")).toBeTruthy();
    expect(within(card("C. Hawpe")).getByText("Offered because: wrong first initial")).toBeTruthy();
  });

  it("tells each kind of viewer what their decisions mean, and only an admin how to choose helpers", async () => {
    const { unmount } = renderPage();
    expect(await screen.findByText(/Yours and the commissioner’s are final/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Choose who can help" }).getAttribute("href")).toBe("/archive/player-check/access");
    unmount();

    m.getPlayerCheck.mockResolvedValue(response([openWright], { viewer: OWNER }));
    const owner = renderPage();
    expect(await screen.findByText(/You’re checking the names on .+\. Your decisions are saved under your name; the commissioner’s are final\./)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Choose who can help" })).toBeNull();
    owner.unmount();

    m.getPlayerCheck.mockResolvedValue(response([openWright], { viewer: { isAdmin: false, final: true, level: "ALL", teamCodes: null } }));
    renderPage();
    expect(await screen.findByText(/You have the commissioner’s final say/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Choose who can help" })).toBeNull();
  });
});

describe("when there is nothing to work on", () => {
  it("shows the server's reason on a 403 (not let in, or not a member), and shows no names", async () => {
    m.getPlayerCheck.mockRejectedValue(apiError(403, "Ask the commissioner to turn on player-check access for you."));
    renderPage();
    expect(await screen.findByText("Ask the commissioner to turn on player-check access for you.")).toBeTruthy();
    expect(cards()).toHaveLength(0);
  });

  it("says it couldn't load on any other failure", async () => {
    m.getPlayerCheck.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn’t load the player check/);
  });

  it("says the list hasn't been loaded when the archive has no player check yet", async () => {
    m.getPlayerCheck.mockResolvedValue(response([], { seasons: [], teams: [] }));
    renderPage();
    expect(await screen.findByText(/player list hasn’t been loaded/)).toBeTruthy();
  });

  it("says every name is decided once they all are", async () => {
    m.getPlayerCheck.mockResolvedValue(response([picked(openWright, JARET)]));
    renderPage("/archive/player-check?todo=1");
    expect(await screen.findByText("Every name is decided.")).toBeTruthy();
  });
});

describe("filters", () => {
  it("clicking a season shows only its names and puts the season in the URL", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "2005" }));
    expect(cards().map((c) => c.getAttribute("aria-label"))).toEqual(["C. Hawpe, 2005 B.O.H.I.C.A."]);
    expect(screen.getByTestId("search").textContent).toBe("?season=2005");
    expect(seasonRow(2005).className).toContain("is-selected");
    expect(screen.getByText("1 shown")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "2005 only · show all seasons" }));
    expect(cards()).toHaveLength(3);
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("clicking the selected season again clears it", async () => {
    renderPage("/archive/player-check?season=2004");
    await waitFor(() => expect(cards()).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "2004" }));
    expect(cards()).toHaveLength(3);
  });

  it("filters by team and by status, with counts on the status buttons", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    const status = screen.getByRole("group", { name: "Status" });
    expect(within(status).getAllByRole("button").map((b) => b.textContent)).toEqual(["All 3", "Flagged 1", "Open 1", "Suggested 1"]);

    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "MNB" } });
    expect(cards()).toHaveLength(2);
    expect(within(status).getAllByRole("button").map((b) => b.textContent)).toEqual(["All 2", "Flagged 1", "Open 1", "Suggested 0"]);

    fireEvent.click(within(status).getByRole("button", { name: "Flagged 1" }));
    expect(cards().map((c) => c.getAttribute("aria-label"))).toEqual(["A. Pujols, 2004 MoneyBall"]);
    expect(screen.getByTestId("search").textContent).toBe("?team=MNB&status=flagged");
    expect(within(status).getByRole("button", { name: "Flagged 1" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens on the filters in the link, so a shared link lands on the same view", async () => {
    renderPage("/archive/player-check?season=2004&team=MNB&status=open");
    await waitFor(() => expect(cards().map((c) => c.getAttribute("aria-label"))).toEqual(["J. Wright, 2004 MoneyBall"]));
  });

  it("says so when a filter matches nothing", async () => {
    renderPage("/archive/player-check?season=2005&status=flagged");
    expect(await screen.findByText("Nothing to check for this filter.")).toBeTruthy();
  });
});

describe("deciding", () => {
  it("confirming the suggested player saves a pick and shows who made it", async () => {
    m.decidePlayer.mockResolvedValue(picked(openWright, JARET));
    renderPage();
    fireEvent.click(within(await waitFor(() => card("J. Wright"))).getByRole("button", { name: "Confirm Jaret Wright" }));
    expect(m.decidePlayer).toHaveBeenCalledWith(10, { decision: "PICK", mlbId: 124605 });
    await within(card("J. Wright")).findByText("Jaret Wright", { selector: "strong" });
    expect(card("J. Wright").textContent).toContain("Picked Jaret Wright");
    expect(card("J. Wright").textContent).toContain("James, Nov 20");
    expect(within(card("J. Wright")).queryByRole("button", { name: /Confirm|Pick/ })).toBeNull();
    expect(screen.getByText((_, el) => el?.className === "apc-progress" && el.textContent === "1 of 3 decided")).toBeTruthy();
  });

  it("picking another candidate saves that one", async () => {
    m.decidePlayer.mockResolvedValue(picked(openWright, JAMEY));
    renderPage();
    fireEvent.click(within(await waitFor(() => card("J. Wright"))).getByRole("button", { name: "Pick Jamey Wright" }));
    expect(m.decidePlayer).toHaveBeenCalledWith(10, { decision: "PICK", mlbId: 124604 });
    await waitFor(() => expect(card("J. Wright").textContent).toContain("Picked Jamey Wright"));
  });

  it("keeping a flagged player records an allowed exception", async () => {
    m.decidePlayer.mockResolvedValue(decided(flaggedPujols, { decision: "EXCEPTION", mlbId: 405395, name: "Albert Pujols", byName: "James", at: null, locked: false }));
    renderPage();
    fireEvent.click(within(await waitFor(() => card("A. Pujols"))).getByRole("button", { name: "Keep Albert Pujols: the league allowed it" }));
    expect(m.decidePlayer).toHaveBeenCalledWith(11, { decision: "EXCEPTION" });
    await waitFor(() => expect(card("A. Pujols").textContent).toContain("Kept Albert Pujols: the league allowed it"));
  });

  it("'None of these' leaves the name unknown and opens the search", async () => {
    m.decidePlayer.mockResolvedValue(decided(openWright, { decision: "NONE", mlbId: null, name: null, byName: "James", at: null, locked: false }));
    renderPage();
    fireEvent.click(within(await waitFor(() => card("J. Wright"))).getByRole("button", { name: "None of these" }));
    expect(m.decidePlayer).toHaveBeenCalledWith(10, { decision: "NONE" });
    await waitFor(() => expect(card("J. Wright").textContent).toContain("None of these. Search for the right one."));
    expect((within(card("J. Wright")).getByLabelText("Find the player by name") as HTMLInputElement).value).toBe("Wright");
  });

  it("undo clears the decision", async () => {
    m.getPlayerCheck.mockResolvedValue(response([picked(openWright, JARET)]));
    m.undoPlayerDecision.mockResolvedValue(openWright);
    renderPage();
    fireEvent.click(within(await waitFor(() => card("J. Wright"))).getByRole("button", { name: "Undo" }));
    expect(m.undoPlayerDecision).toHaveBeenCalledWith(10);
    await within(card("J. Wright")).findByRole("button", { name: "Confirm Jaret Wright" });
    expect(screen.getByText((_, el) => el?.className === "apc-progress" && el.textContent === "0 of 1 decided")).toBeTruthy();
  });

  it("a decision the commissioner made shows no Undo to a member", async () => {
    m.getPlayerCheck.mockResolvedValue(response([picked(openWright, JARET, { locked: true })], { viewer: OWNER }));
    renderPage();
    const wright = await waitFor(() => card("J. Wright"));
    expect(within(wright).getByText("The commissioner decided this one.")).toBeTruthy();
    expect(within(wright).queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("a locked 'none of these' offers a member no search either", async () => {
    m.getPlayerCheck.mockResolvedValue(response([decided(openWright, { decision: "NONE", mlbId: null, name: null, byName: "James", at: null, locked: true })], { viewer: OWNER }));
    renderPage();
    const wright = await waitFor(() => card("J. Wright"));
    expect(within(wright).queryByLabelText("Find the player by name")).toBeNull();
  });

  it("shows the server's reason on the card when a save is refused, and changes nothing", async () => {
    m.decidePlayer.mockRejectedValue(apiError(403, "The commissioner already decided this one."));
    renderPage();
    fireEvent.click(within(await waitFor(() => card("J. Wright"))).getByRole("button", { name: "Confirm Jaret Wright" }));
    expect((await within(card("J. Wright")).findByRole("alert")).textContent).toBe("The commissioner already decided this one.");
    expect(within(card("J. Wright")).getByRole("button", { name: "Confirm Jaret Wright" })).toBeTruthy();
    expect(within(card("A. Pujols")).queryByRole("alert")).toBeNull();
  });

  it("says to check the connection when the save never reached the server, then clears on a retry", async () => {
    m.decidePlayer.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(picked(openWright, JARET));
    renderPage();
    fireEvent.click(within(await waitFor(() => card("J. Wright"))).getByRole("button", { name: "Confirm Jaret Wright" }));
    expect((await within(card("J. Wright")).findByRole("alert")).textContent).toMatch(/didn’t save/);
    fireEvent.click(within(card("J. Wright")).getByRole("button", { name: "Confirm Jaret Wright" }));
    await waitFor(() => expect(card("J. Wright").textContent).toContain("Picked Jaret Wright"));
    expect(within(card("J. Wright")).queryByRole("alert")).toBeNull();
  });

  it("ignores a second click while the first save is in flight", async () => {
    let finish!: (v: typeof openWright) => void;
    m.decidePlayer.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage();
    const wright = await waitFor(() => card("J. Wright"));
    fireEvent.click(within(wright).getByRole("button", { name: "Confirm Jaret Wright" }));
    await waitFor(() => expect((within(card("J. Wright")).getByRole("button", { name: "Pick Jamey Wright" }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(within(card("J. Wright")).getByRole("button", { name: "Pick Jamey Wright" }));
    expect(m.decidePlayer).toHaveBeenCalledTimes(1);
    // Another name is not held up by this one.
    expect((within(card("A. Pujols")).getByRole("button", { name: "Wrong player" }) as HTMLButtonElement).disabled).toBe(false);
    finish(picked(openWright, JARET));
    await waitFor(() => expect(card("J. Wright").textContent).toContain("Picked Jaret Wright"));
  });

  it("saves once when two clicks land before the button has had time to disable itself", async () => {
    m.decidePlayer.mockReturnValue(new Promise(() => {}));
    renderPage();
    const confirm = within(await waitFor(() => card("J. Wright"))).getByRole("button", { name: "Confirm Jaret Wright" });
    act(() => { confirm.click(); confirm.click(); });
    expect(m.decidePlayer).toHaveBeenCalledTimes(1);
  });

  it("under 'left to decide only', a name decided just now stays on screen with its Undo", async () => {
    m.getPlayerCheck.mockResolvedValue(response([openWright, picked(suggestedHawpe, { mlbId: 425547, name: "Brad Hawpe" })]));
    m.decidePlayer.mockResolvedValue(picked(openWright, JARET));
    renderPage("/archive/player-check?todo=1");
    await waitFor(() => expect(cards().map((c) => c.getAttribute("aria-label"))).toEqual(["J. Wright, 2004 MoneyBall"]));
    fireEvent.click(within(card("J. Wright")).getByRole("button", { name: "Confirm Jaret Wright" }));
    await within(card("J. Wright")).findByRole("button", { name: "Undo" });
    // Changing a filter is the moment it drops out.
    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "MNB" } });
    expect(cards()).toHaveLength(0);
  });
});

describe("searching for someone who isn't listed", () => {
  const craig = { mlbId: 150400, name: "Craig Wilson", line: line({ g: 59, pa: 238, hr: 5, avg: ".264", sb: 3 }), playingTime: 238, eligibleSlots: 0, checks: [{ slot: "P", eligible: false, reason: "not eligible at P" }] };

  it("opens on request, searches by the typed name, and picks a result", async () => {
    m.searchPlayers.mockResolvedValue({ candidates: [craig], more: true });
    m.decidePlayer.mockResolvedValue(picked(openWright, craig));
    renderPage();
    const wright = await waitFor(() => card("J. Wright"));
    expect(within(wright).queryByLabelText("Find the player by name")).toBeNull();
    fireEvent.click(within(wright).getByRole("button", { name: "Search for someone else" }));
    fireEvent.change(within(wright).getByLabelText("Find the player by name"), { target: { value: " craig wilson " } });
    fireEvent.click(within(wright).getByRole("button", { name: "Search" }));
    expect(m.searchPlayers).toHaveBeenCalledWith(10, "craig wilson");
    fireEvent.click(await within(card("J. Wright")).findByRole("button", { name: "Pick Craig Wilson" }));
    expect(m.decidePlayer).toHaveBeenCalledWith(10, { decision: "PICK", mlbId: 150400 });
    expect(within(card("J. Wright")).getByText("More players match. Add a first name to narrow it down.")).toBeTruthy();
    // Someone from outside the list is named in the banner, with a link to check him.
    await waitFor(() => expect(within(card("J. Wright")).getByRole("link", { name: "Craig Wilson" }).getAttribute("href")).toBe("https://www.mlb.com/player/150400"));
  });

  it("a flagged card reaches the search through 'Wrong player', and a result replaces that decision", async () => {
    const wrong = decided(flaggedPujols, { decision: "WRONG", mlbId: null, name: null, byName: "James", at: null, locked: false });
    m.decidePlayer.mockResolvedValueOnce(wrong).mockResolvedValueOnce(picked(flaggedPujols, craig));
    m.searchPlayers.mockResolvedValue({ candidates: [craig], more: false });
    renderPage();
    fireEvent.click(within(await waitFor(() => card("A. Pujols"))).getByRole("button", { name: "Wrong player" }));
    await waitFor(() => expect(card("A. Pujols").textContent).toContain("Marked as the wrong player."));
    fireEvent.click(within(card("A. Pujols")).getByRole("button", { name: "Search" }));
    expect(m.searchPlayers).toHaveBeenCalledWith(11, "Pujols");
    fireEvent.click(await within(card("A. Pujols")).findByRole("button", { name: "Pick Craig Wilson" }));
    expect(m.decidePlayer).toHaveBeenLastCalledWith(11, { decision: "PICK", mlbId: 150400 });
  });

  it("needs three letters, says when nothing matches, and reports a failed search", async () => {
    m.searchPlayers.mockResolvedValueOnce({ candidates: [], more: false }).mockRejectedValueOnce(apiError(502, "Couldn't reach MLB's player search. Try again in a minute."));
    renderPage();
    const wright = await waitFor(() => card("J. Wright"));
    fireEvent.click(within(wright).getByRole("button", { name: "Search for someone else" }));
    const input = within(wright).getByLabelText("Find the player by name");
    fireEvent.change(input, { target: { value: "xy" } });
    expect((within(wright).getByRole("button", { name: "Search" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "zzqq" } });
    fireEvent.click(within(wright).getByRole("button", { name: "Search" }));
    expect(await within(card("J. Wright")).findByText(/No MLB player found for “zzqq”/)).toBeTruthy();
    fireEvent.click(within(card("J. Wright")).getByRole("button", { name: "Search" }));
    expect((await within(card("J. Wright")).findByRole("alert")).textContent).toBe("Couldn't reach MLB's player search. Try again in a minute.");
  });

  it("a name with nobody listed opens straight on the search, with a way to record 'can't find him'", async () => {
    const nobody = { ...openWright, id: 13, names: ["P. Strokes"], candidates: [], suggestion: null };
    m.getPlayerCheck.mockResolvedValue(response([nobody]));
    m.decidePlayer.mockResolvedValue(decided(nobody, { decision: "NONE", mlbId: null, name: null, byName: "James", at: null, locked: false }));
    renderPage();
    const strokes = await waitFor(() => card("P. Strokes"));
    expect(within(strokes).getByText("No MLB player fits this spelling.")).toBeTruthy();
    expect((within(strokes).getByLabelText("Find the player by name") as HTMLInputElement).value).toBe("Strokes");
    expect(within(strokes).queryByRole("button", { name: "None of these" })).toBeNull();
    fireEvent.click(within(strokes).getByRole("button", { name: "Can’t find him" }));
    expect(m.decidePlayer).toHaveBeenCalledWith(13, { decision: "NONE" });
    await waitFor(() => expect(card("P. Strokes").textContent).toContain("Not found yet. Search for the right one."));
  });
});

describe("archive tabs", () => {
  it("sits in the Archive section: Season | Trophy case | Player check, with Player check selected", async () => {
    renderPage();
    const strip = await screen.findByRole("navigation", { name: "Archive" });
    const links = within(strip).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Season", "Trophy case", "Player check"]);
    expect(within(strip).getByRole("link", { name: "Player check" }).getAttribute("aria-current")).toBe("page");
    expect(within(strip).getByRole("link", { name: "Trophy case" }).getAttribute("href")).toBe("/archive?tab=trophy");
  });

  it("shows no Player check tab to someone turned away", async () => {
    m.getPlayerCheck.mockRejectedValue(apiError(403, "Ask the commissioner to turn on player-check access for you."));
    renderPage();
    const strip = await screen.findByRole("navigation", { name: "Archive" });
    await screen.findByText("Ask the commissioner to turn on player-check access for you.");
    expect(within(strip).queryByRole("link", { name: "Player check" })).toBeNull();
  });
});

