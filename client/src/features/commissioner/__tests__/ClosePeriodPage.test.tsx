import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";

const mockToast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast, confirm: vi.fn() }),
}));

vi.mock("../api", async () => ({
  // Pure helpers stay real so the card logic is exercised end to end.
  teamsUnderInnings: (await vi.importActual<typeof import("../api")>("../api")).teamsUnderInnings,
  formatInnings: (await vi.importActual<typeof import("../api")>("../api")).formatInnings,
  getCloseReadiness: vi.fn(),
  getGhostIlSummary: vi.fn(),
  getRosterCheck: vi.fn(),
  getPeriodStandingsPreview: vi.fn(),
  toTeamTotals: vi.fn(),
  previewIlFees: vi.fn(),
  setPeriodStatus: vi.fn(),
}));

import * as api from "../api";
import ClosePeriodPage from "../pages/ClosePeriodPage";

const m = vi.mocked(api);

/** Stands in for the browser Back button (MemoryRouter ignores window.history). */
function BrowserBack() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>browser-back</button>;
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderAt(entries: string[], initialIndex = entries.length - 1) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
      <BrowserBack />
      <LocationProbe />
      <Routes>
        <Route path="/commissioner/:leagueId/close/:periodId" element={<ClosePeriodPage />} />
        <Route path="/commissioner/:leagueId" element={<div>HUB PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const URL = "/commissioner/20/close/7";

beforeEach(() => {
  vi.clearAllMocks();
  m.getCloseReadiness.mockResolvedValue({
    periodId: 7,
    name: "Period 7",
    status: "active",
    endDate: "2026-09-28T00:00:00.000Z",
    lastStatDate: "2026-09-28T00:00:00.000Z",
    ready: true,
  });
  m.getGhostIlSummary.mockResolvedValue({
    teams: [
      {
        teamId: 2,
        teamName: "Devil Dawgs",
        teamCode: "DD",
        ghosts: [{ rosterId: 9, playerId: 101, playerName: "Webb", currentMlbStatus: "Active" }],
      },
    ],
    totalTeamsWithGhosts: 1,
    totalGhosts: 1,
  });
  m.getRosterCheck.mockResolvedValue({
    cap: 23,
    teams: [
      { teamId: 1, teamName: "Demolition Lumber", activeCount: 23, over: false },
      { teamId: 2, teamName: "Devil Dawgs", activeCount: 23, over: false },
      { teamId: 3, teamName: "Skunk Dogs", activeCount: 24, over: true },
    ],
  });
  m.getPeriodStandingsPreview.mockResolvedValue({
    periodId: 7,
    categories: [],
    teamCount: 3,
    totalDelta: {},
    computedAt: "2026-09-29T00:00:00.000Z",
  });
  m.toTeamTotals.mockReturnValue([
    { teamName: "Demolition Lumber", points: 58 },
    { teamName: "Devil Dawgs", points: 53 },
  ]);
  m.previewIlFees.mockResolvedValue({
    leagueId: 20,
    periodId: 7,
    added: 3,
    voided: 1,
    unchanged: 0,
    dryRun: true,
    preview: [
      { action: "add", teamId: 2, playerId: 101, playerName: "Webb", rank: 1, amount: 10 },
      { action: "add", teamId: 2, playerId: 102, playerName: "Diaz", rank: 2, amount: 20 },
      { action: "add", teamId: 3, playerId: 103, playerName: "Sewald", rank: 1, amount: 10 },
      { action: "void", teamId: 3, playerId: 104, playerName: "Old", rank: 1, amount: -10 },
      { action: "add", teamId: 1, playerId: 105, playerName: "Kim", rank: 1, amount: 10 },
    ],
  });
  m.setPeriodStatus.mockResolvedValue({ id: 7, name: "Period 7", startDate: "", endDate: "", status: "completed" });
});

describe("ClosePeriodPage — step 1", () => {
  it("defaults to step 1 and shows the period with a Next button when ready", async () => {
    renderAt([URL]);
    expect(await screen.findByRole("heading", { name: "Close Period 7" })).toBeTruthy();
    expect(screen.getByText(/Step 1 of 5/)).toBeTruthy();
    expect(m.getCloseReadiness).toHaveBeenCalledWith(20, 7);
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(screen.getByTestId("location").textContent).toBe(`${URL}?step=2`);
  });

  it("with ready:false has no Next button, shows the come-back copy and a hub link", async () => {
    m.getCloseReadiness.mockResolvedValue({
      periodId: 7,
      name: "Period 7",
      status: "active",
      endDate: "2026-09-28T00:00:00.000Z",
      lastStatDate: "2026-09-27T00:00:00.000Z",
      ready: false,
    });
    renderAt([URL]);
    expect(await screen.findByText("Come back after tomorrow morning's stats sync.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByRole("link", { name: /Back to Commissioner/ }).getAttribute("href")).toBe("/commissioner/20");
  });

  it("for an already-closed period has no Next button", async () => {
    m.getCloseReadiness.mockResolvedValue({
      periodId: 7,
      name: "Period 7",
      status: "completed",
      endDate: "2026-09-28T00:00:00.000Z",
      lastStatDate: "2026-09-28T00:00:00.000Z",
      ready: true,
    });
    renderAt([URL]);
    expect(await screen.findByText(/already closed/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });
});

describe("ClosePeriodPage — step 2", () => {
  it("lists flagged rows linking to rosters and keeps Next enabled", async () => {
    renderAt([`${URL}?step=2`]);
    expect(await screen.findByText("This checks rosters as they are now, not every day of the period.")).toBeTruthy();
    expect(m.getGhostIlSummary).toHaveBeenCalledWith(20);
    expect(m.getRosterCheck).toHaveBeenCalledWith(20);
    const ghost = await screen.findByRole("link", { name: /Devil Dawgs.*Webb/ });
    expect(ghost.getAttribute("href")).toBe("/commissioner/20/rosters");
    const over = screen.getByRole("link", { name: /Skunk Dogs.*24/ });
    expect(over.getAttribute("href")).toBe("/commissioner/20/rosters");
    const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
  });

  it("Next stays enabled even when the checks fail to load", async () => {
    m.getGhostIlSummary.mockRejectedValue(new Error("boom"));
    m.getRosterCheck.mockRejectedValue(new Error("boom"));
    renderAt([`${URL}?step=2`]);
    expect(await screen.findAllByText(/Couldn’t load/)).toHaveLength(2);
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("after step 2 → 3, browser Back renders step 2 again (pushed history)", async () => {
    renderAt([URL, `${URL}?step=2`], 1);
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText(/Step 3 of 5/)).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe(`${URL}?step=3`);
    fireEvent.click(screen.getByRole("button", { name: "browser-back" }));
    expect(await screen.findByText(/Step 2 of 5/)).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe(`${URL}?step=2`);
    // step 2 re-fetched its own data on remount
    await waitFor(() => expect(m.getRosterCheck).toHaveBeenCalledTimes(2));
  });

  it("the in-page back control on step 3 returns to step 2", async () => {
    renderAt([URL, `${URL}?step=2`], 1);
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText(/Step 3 of 5/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Step 2/ }));
    expect(await screen.findByText(/Step 2 of 5/)).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe(`${URL}?step=2`);
    // It popped history rather than stacking a new entry: browser Back now reaches step 1.
    fireEvent.click(screen.getByRole("button", { name: "browser-back" }));
    expect(await screen.findByText(/Step 1 of 5/)).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe(URL);
  });

  it("the in-page back control on a deep-linked step replaces instead of leaving the flow", async () => {
    renderAt([`${URL}?step=3`]);
    expect(await screen.findByText(/Step 3 of 5/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Step 2/ }));
    expect(await screen.findByText(/Step 2 of 5/)).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe(`${URL}?step=2`);
  });
});

describe("ClosePeriodPage — step 3", () => {
  it("shows team totals labelled not final", async () => {
    renderAt([`${URL}?step=3`]);
    expect(await screen.findByText("Demolition Lumber")).toBeTruthy();
    expect(screen.getByText(/not final/)).toBeTruthy();
    expect(m.getPeriodStandingsPreview).toHaveBeenCalledWith(20, 7);
    expect(m.toTeamTotals).toHaveBeenCalledWith(await m.getPeriodStandingsPreview.mock.results[0].value);
  });
});

describe("ClosePeriodPage — step 3 innings minimum", () => {
  const withInnings = (teamInnings: Array<{ teamId: number; teamName: string; ip: number }>, minInnings: number | null) =>
    m.getPeriodStandingsPreview.mockResolvedValue({
      periodId: 7, categories: [], teamCount: 2, totalDelta: {}, teamInnings, minInnings,
      computedAt: "2026-09-29T00:00:00.000Z",
    });

  it("lists teams under the minimum and leaves Next enabled", async () => {
    withInnings([{ teamId: 1, teamName: "Bombers", ip: 46.3333 }, { teamId: 2, teamName: "Devil Dawgs", ip: 61 }], 50);
    renderAt([`${URL}?step=3`]);
    expect(await screen.findByText("Innings minimum")).toBeTruthy();
    expect(screen.getByText("Bombers · 46⅓ of 50 IP")).toBeTruthy();
    expect(screen.queryByText(/Devil Dawgs · /)).toBeNull();
    expect(screen.getByText("Review")).toBeTruthy();
    expect(screen.getByText("You decide what happens; closing isn't blocked.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows no card when nobody is under, or there is no rule", async () => {
    withInnings([{ teamId: 1, teamName: "Bombers", ip: 50 }], 50);
    const first = renderAt([`${URL}?step=3`]);
    await screen.findByText("Demolition Lumber");
    expect(screen.queryByText("Innings minimum")).toBeNull();
    first.unmount();

    withInnings([{ teamId: 1, teamName: "Bombers", ip: 10 }], null);
    renderAt([`${URL}?step=3`]);
    await screen.findByText("Demolition Lumber");
    expect(screen.queryByText("Innings minimum")).toBeNull();
  });
});

describe("ClosePeriodPage — step 4", () => {
  it("rendering ?step=4 calls previewIlFees on mount (reload case)", async () => {
    renderAt([`${URL}?step=4`]);
    await waitFor(() => expect(m.previewIlFees).toHaveBeenCalledWith(20, 7));
    expect(m.previewIlFees).toHaveBeenCalledTimes(1);
  });

  it("sums preview rows per team (voids subtract) and shows the total with team names", async () => {
    renderAt([`${URL}?step=4`]);
    expect(await screen.findByText("This close would bill $40")).toBeTruthy();
    const dd = screen.getByTestId("fee-team-2");
    expect(within(dd).getByText("Devil Dawgs")).toBeTruthy();
    expect(within(dd).getByText("$30")).toBeTruthy();
    const sd = screen.getByTestId("fee-team-3");
    expect(within(sd).getByText("Skunk Dogs")).toBeTruthy();
    expect(within(sd).getByText("$0")).toBeTruthy();
    expect(within(screen.getByTestId("fee-team-1")).getByText("$10")).toBeTruthy();
  });

  it("a zero net total says 'No IL fees to bill', never '$0' or '-$0'", async () => {
    m.previewIlFees.mockResolvedValue({ leagueId: 20, periodId: 7, added: 0, voided: 0, unchanged: 2, dryRun: true, preview: [] });
    renderAt([`${URL}?step=4`]);
    expect(await screen.findByText("No IL fees to bill")).toBeTruthy();
    expect(screen.queryByText(/This close would bill/)).toBeNull();
  });

  it("a negative net total reads as a credit, not '-$X' (team row too)", async () => {
    m.previewIlFees.mockResolvedValue({
      leagueId: 20, periodId: 7, added: 0, voided: 1, unchanged: 0, dryRun: true,
      preview: [{ action: "void", teamId: 3, playerId: 104, playerName: "Old", rank: 1, amount: -10 }],
    });
    renderAt([`${URL}?step=4`]);
    expect(await screen.findByText("IL fees net to a $10 credit")).toBeTruthy();
    expect(within(screen.getByTestId("fee-team-3")).getByText("$10 credit")).toBeTruthy();
    expect(screen.queryByText(/-\$/)).toBeNull();
  });

  it("'Close & bill now' goes to step 5 with bill=now", async () => {
    renderAt([`${URL}?step=4`]);
    fireEvent.click(await screen.findByRole("button", { name: "Close & bill now" }));
    expect(screen.getByTestId("location").textContent).toBe(`${URL}?step=5&bill=now`);
  });

  it("'Close, bill later' goes to step 5 with bill=later", async () => {
    renderAt([`${URL}?step=4`]);
    fireEvent.click(await screen.findByRole("button", { name: "Close, bill later" }));
    expect(screen.getByTestId("location").textContent).toBe(`${URL}?step=5&bill=later`);
  });
});

describe("ClosePeriodPage — step 5", () => {
  async function openSheet() {
    fireEvent.click(await screen.findByRole("button", { name: "Close Period 7" }));
    return screen.getByRole("dialog");
  }

  it("bill later: confirming calls setPeriodStatus with billFees:false, toasts, and returns to the hub", async () => {
    renderAt([`${URL}?step=4`]);
    fireEvent.click(await screen.findByRole("button", { name: "Close, bill later" }));
    const dialog = await openSheet();
    expect(within(dialog).getByText("Close Period 7?")).toBeTruthy();
    expect(
      within(dialog).getByText("Standings lock — IL fees stay unbilled until you bill them. You can't undo this."),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close period" }));
    await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledTimes(1));
    expect(m.setPeriodStatus).toHaveBeenCalledWith(7, { status: "completed", billFees: false });
    expect(await screen.findByText("HUB PAGE")).toBeTruthy();
    expect(mockToast).toHaveBeenCalledWith("Period 7 closed", "success");
  });

  it("bill now: the sheet names the dollar amount and sends billFees:true", async () => {
    renderAt([`${URL}?step=5&bill=now`]);
    const dialog = await openSheet();
    expect(
      await within(dialog).findByText("Standings lock and $40 in IL fees are billed. You can't undo this."),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close period" }));
    await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledWith(7, { status: "completed", billFees: true }));
  });

  it("bill now with a negative net: the sheet states a credit, not '-$X'", async () => {
    m.previewIlFees.mockResolvedValue({
      leagueId: 20, periodId: 7, added: 0, voided: 1, unchanged: 0, dryRun: true,
      preview: [{ action: "void", teamId: 3, playerId: 104, playerName: "Old", rank: 1, amount: -10 }],
    });
    renderAt([`${URL}?step=5&bill=now`]);
    expect(await screen.findByText("$10 credit applied now")).toBeTruthy();
    const dialog = await openSheet();
    expect(
      within(dialog).getByText("Standings lock and a $10 IL fee credit is applied. You can't undo this."),
    ).toBeTruthy();
  });

  it("bill now with a zero net: summary and sheet say there are no IL fees to bill", async () => {
    m.previewIlFees.mockResolvedValue({ leagueId: 20, periodId: 7, added: 0, voided: 0, unchanged: 0, dryRun: true, preview: [] });
    renderAt([`${URL}?step=5&bill=now`]);
    expect(await screen.findByText("No IL fees to bill")).toBeTruthy();
    const dialog = await openSheet();
    expect(within(dialog).getByText("Standings lock. There are no IL fees to bill. You can't undo this.")).toBeTruthy();
  });

  it("double-clicking confirm calls setPeriodStatus exactly once", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof api.setPeriodStatus>>) => void;
    m.setPeriodStatus.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderAt([`${URL}?step=5&bill=later`]);
    const dialog = await openSheet();
    const confirm = within(dialog).getByRole("button", { name: "Close period" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.doubleClick(confirm);
    expect(m.setPeriodStatus).toHaveBeenCalledTimes(1);
    resolve({ id: 7, name: "Period 7", startDate: "", endDate: "", status: "completed" });
    expect(await screen.findByText("HUB PAGE")).toBeTruthy();
    expect(m.setPeriodStatus).toHaveBeenCalledTimes(1);
  });

  it("a failed close keeps the user on step 5, toasts the error, and allows a retry", async () => {
    m.setPeriodStatus.mockRejectedValueOnce(new Error("Server said no"));
    renderAt([`${URL}?step=5&bill=later`]);
    const dialog = await openSheet();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close period" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Server said no", "error"));
    expect(screen.queryByText("HUB PAGE")).toBeNull();
    const dialog2 = await openSheet();
    fireEvent.click(within(dialog2).getByRole("button", { name: "Close period" }));
    await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledTimes(2));
  });

  it("cancel closes the sheet without calling setPeriodStatus", async () => {
    renderAt([`${URL}?step=5&bill=later`]);
    const dialog = await openSheet();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.setPeriodStatus).not.toHaveBeenCalled();
  });

  it("without a bill choice in the URL, step 5 sends you back to step 4 instead of offering a close", async () => {
    renderAt([`${URL}?step=5`]);
    expect(await screen.findByRole("link", { name: /Choose how to bill/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close Period 7" })).toBeNull();
  });
});

describe("ClosePeriodPage — readiness gate on steps 4 and 5", () => {
  const notReady = () =>
    m.getCloseReadiness.mockResolvedValue({
      periodId: 7,
      name: "Period 7",
      status: "active",
      endDate: "2026-09-28T00:00:00.000Z",
      lastStatDate: "2026-09-27T00:00:00.000Z",
      ready: false,
    });

  it("?step=5&bill=now on a not-ready period shows the come-back copy and no close button", async () => {
    notReady();
    renderAt([`${URL}?step=5&bill=now`]);
    expect(await screen.findByText("Come back after tomorrow morning's stats sync.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to Commissioner/ }).getAttribute("href")).toBe("/commissioner/20");
    expect(screen.queryByRole("button", { name: "Close Period 7" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.setPeriodStatus).not.toHaveBeenCalled();
  });

  it("?step=4 on a not-ready period offers no close choices and runs no fee preview", async () => {
    notReady();
    renderAt([`${URL}?step=4`]);
    expect(await screen.findByText("Come back after tomorrow morning's stats sync.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Close & bill now/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close, bill later" })).toBeNull();
    expect(m.previewIlFees).not.toHaveBeenCalled();
  });

  it("?step=5 on a pending period (never started) is gated too", async () => {
    m.getCloseReadiness.mockResolvedValue({
      periodId: 7,
      name: "Period 7",
      status: "pending",
      endDate: "2026-09-28T00:00:00.000Z",
      lastStatDate: null,
      ready: false,
    });
    renderAt([`${URL}?step=5&bill=later`]);
    expect(await screen.findByText("Come back after tomorrow morning's stats sync.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close Period 7" })).toBeNull();
    expect(m.setPeriodStatus).not.toHaveBeenCalled();
  });
});
