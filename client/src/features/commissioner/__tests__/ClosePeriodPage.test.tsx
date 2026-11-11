import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const mockToast = vi.fn();
const auth = vi.hoisted(() => ({ user: { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] } as any }));
vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => ({ me: { user: auth.user } }) }));

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast, confirm: vi.fn() }),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
  // Pure helpers stay real so the card logic is exercised end to end.
  teamsUnderInnings: actual.teamsUnderInnings,
  formatInnings: actual.formatInnings,
  getCloseReadiness: vi.fn(),
  getGhostIlSummary: vi.fn(),
  getRosterCheck: vi.fn(),
  getPeriodStandingsPreview: vi.fn(),
  toTeamTotals: vi.fn(),
  previewIlFees: vi.fn(),
  setPeriodStatus: vi.fn(),
  };
});

import * as api from "../api";
import ClosePeriodPage from "../pages/ClosePeriodPage";

const m = vi.mocked(api);

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderAt(entries: string[], initialIndex = entries.length - 1) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
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


const closeBtn = () => screen.findByRole("button", { name: "Close Period 7" }) as Promise<HTMLButtonElement>;
const billNow = () => screen.findByRole("button", { name: "Bill now" }) as Promise<HTMLButtonElement>;
const confirmClose = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole("button", { name: "Close period" }));
const feesOf = (preview: any[]) => ({ leagueId: 20, periodId: 7, added: 0, voided: 0, unchanged: 0, dryRun: true, preview });
const withInnings = (teamInnings: Array<{ teamId: number; teamName: string; ip: number }>, minInnings: number | null) =>
  m.getPeriodStandingsPreview.mockResolvedValue({
    periodId: 7, categories: [], teamCount: 2, totalDelta: {}, teamInnings, minInnings,
    computedAt: "2026-09-29T00:00:00.000Z",
  });
const notReady = (status = "active") =>
  m.getCloseReadiness.mockResolvedValue({
    periodId: 7, name: "Period 7", status, endDate: "2026-09-28T00:00:00.000Z",
    lastStatDate: "2026-09-27T00:00:00.000Z", ready: false,
  });

describe("ClosePeriodPage: one checklist page", () => {
  it("shows the title, back link, checklist, standings and fees together", async () => {
    renderAt([URL]);
    expect(await screen.findByRole("heading", { name: "Close Period 7" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "‹ Commissioner" }).getAttribute("href")).toBe("/commissioner/20");
    expect(screen.getByText("Before you close")).toBeTruthy();
    expect(await screen.findByText("Final stats are in")).toBeTruthy();
    expect(screen.getByText(/Last stat date Sep 28 · period ended Sep 28/)).toBeTruthy();
    expect((await screen.findAllByText("Demolition Lumber")).length).toBeGreaterThan(0);
    expect(screen.getByText("Standings at close")).toBeTruthy();
    expect(await screen.findByText("IL fees for Period 7")).toBeTruthy();
    expect(m.getCloseReadiness).toHaveBeenCalledWith(20, 7);
    expect(m.getPeriodStandingsPreview).toHaveBeenCalledWith(20, 7);
    expect(m.toTeamTotals).toHaveBeenCalledWith(await m.getPeriodStandingsPreview.mock.results[0].value);
    expect(m.previewIlFees).toHaveBeenCalledWith(20, 7);
    expect(m.previewIlFees).toHaveBeenCalledTimes(1);
  });

  it("?step=4 and ?step=5&bill=later still render the single page (the step is ignored)", async () => {
    renderAt([`${URL}?step=4`]);
    expect(await screen.findByText("Before you close")).toBeTruthy();
    expect(screen.getByText("Standings at close")).toBeTruthy();
    expect(screen.queryByText(/Step \d of 5/)).toBeNull();
    expect((await closeBtn()).disabled).toBe(false);
  });

  it("?bill=later in the URL does not change the default or the PATCH body", async () => {
    renderAt([`${URL}?step=5&bill=later`]);
    expect((await billNow()).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(await closeBtn());
    confirmClose(screen.getByRole("dialog"));
    await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledWith(7, { status: "completed", billFees: true }));
  });

  it("keeps the note that rosters are checked as they are now", async () => {
    renderAt([URL]);
    expect(await screen.findByText("This checks rosters as they are now, not every day of the period.")).toBeTruthy();
  });

  it("a load failure for the period shows an error and a hub link, no Close button", async () => {
    m.getCloseReadiness.mockRejectedValue(new Error("boom"));
    renderAt([URL]);
    expect(await screen.findByText("Couldn’t load this period.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Close Period/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Back to Commissioner/ }).getAttribute("href")).toBe("/commissioner/20");
  });
});

describe("ClosePeriodPage: readiness gating", () => {
  it("not ready: Waiting chip, stats row explains, Close is disabled and the sheet never opens", async () => {
    notReady();
    renderAt([URL]);
    const btn = await closeBtn();
    expect(btn.disabled).toBe(true);
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(screen.getByText(/Come back after tomorrow morning's stats sync\./)).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.setPeriodStatus).not.toHaveBeenCalled();
  });

  it("a pending (never started) period is not closable either", async () => {
    notReady("pending");
    renderAt([URL]);
    expect((await closeBtn()).disabled).toBe(true);
    expect(screen.getByText(/This period hasn't started\./)).toBeTruthy();
    expect(screen.queryByText(/Come back after tomorrow morning's stats sync\./)).toBeNull();
  });

  it("ready: Ready chip on the stats row and Close is enabled", async () => {
    renderAt([URL]);
    expect((await closeBtn()).disabled).toBe(false);
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
  });

  it("an already-closed period says so and has no Close button", async () => {
    m.getCloseReadiness.mockResolvedValue({
      periodId: 7, name: "Period 7", status: "completed", endDate: "2026-09-28T00:00:00.000Z",
      lastStatDate: "2026-09-28T00:00:00.000Z", ready: true,
    });
    renderAt([URL]);
    expect(await screen.findByText("This period is already closed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Close Period/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Back to Commissioner/ }).getAttribute("href")).toBe("/commissioner/20");
  });
});

describe("ClosePeriodPage: checklist rows", () => {
  it("flags over-cap rosters and ghost IL players, each linking to rosters", async () => {
    renderAt([URL]);
    const over = await screen.findByRole("link", { name: /Skunk Dogs 24 \/ 23/ });
    expect(over.getAttribute("href")).toBe("/commissioner/20/rosters");
    const ghost = await screen.findByRole("link", { name: /Devil Dawgs.*Webb/ });
    expect(ghost.getAttribute("href")).toBe("/commissioner/20/rosters");
    expect(m.getGhostIlSummary).toHaveBeenCalledWith(20);
    expect(m.getRosterCheck).toHaveBeenCalledWith(20);
    expect(screen.getAllByText("Review").length).toBeGreaterThanOrEqual(2);
  });

  it("clean rosters and no ghosts read Ready with a count", async () => {
    m.getRosterCheck.mockResolvedValue({
      cap: 23,
      teams: [
        { teamId: 1, teamName: "A", activeCount: 23, over: false },
        { teamId: 2, teamName: "B", activeCount: 23, over: false },
      ],
    });
    m.getGhostIlSummary.mockResolvedValue({ teams: [], totalTeamsWithGhosts: 0, totalGhosts: 0 });
    renderAt([URL]);
    expect(await screen.findByText("2 of 2 teams within 23")).toBeTruthy();
    expect(await screen.findByText("None")).toBeTruthy();
  });

  it("roster and ghost check failures show a message but do not block closing", async () => {
    m.getGhostIlSummary.mockRejectedValue(new Error("boom"));
    m.getRosterCheck.mockRejectedValue(new Error("boom"));
    renderAt([URL]);
    expect(await screen.findByText("Couldn’t load roster sizes.")).toBeTruthy();
    expect(await screen.findByText("Couldn’t load the IL check.")).toBeTruthy();
    expect((await closeBtn()).disabled).toBe(false);
  });

  it("shows the innings row only for teams under the minimum", async () => {
    withInnings([{ teamId: 1, teamName: "Bombers", ip: 46.3333 }, { teamId: 2, teamName: "Devil Dawgs", ip: 61 }], 50);
    renderAt([URL]);
    expect(await screen.findByText("Bombers 46⅓ of 50 IP · you decide")).toBeTruthy();
    expect(screen.queryByText(/Devil Dawgs \d+ of/)).toBeNull();
    expect((await closeBtn()).disabled).toBe(false);
  });

  it("omits the innings row when nobody is under or there is no rule", async () => {
    withInnings([{ teamId: 1, teamName: "Bombers", ip: 50 }], 50);
    const first = renderAt([URL]);
    await screen.findAllByText("Demolition Lumber");
    expect(screen.queryByText(/IP · you decide/)).toBeNull();
    expect(screen.queryByText("Innings minimum")).toBeNull();
    first.unmount();
    withInnings([{ teamId: 1, teamName: "Bombers", ip: 10 }], null);
    renderAt([URL]);
    await screen.findAllByText("Demolition Lumber");
    expect(screen.queryByText("Innings minimum")).toBeNull();
  });

  it("standings load failure is shown in place and does not block closing", async () => {
    m.getPeriodStandingsPreview.mockRejectedValue(new Error("boom"));
    renderAt([URL]);
    expect(await screen.findByText("Couldn’t load the standings preview.")).toBeTruthy();
    expect((await closeBtn()).disabled).toBe(false);
  });
});

describe("ClosePeriodPage: IL fees panel", () => {
  it("sums preview rows per team (voids subtract) with team names and a total", async () => {
    renderAt([URL]);
    expect(await screen.findByText("This close would bill $40")).toBeTruthy();
    expect(within(screen.getByTestId("fee-team-2")).getByText("Devil Dawgs")).toBeTruthy();
    expect(within(screen.getByTestId("fee-team-2")).getByText("$30")).toBeTruthy();
    expect(within(screen.getByTestId("fee-team-3")).getByText("$0")).toBeTruthy();
  });

  it("zero preview rows: no control, 'No IL fees this period'", async () => {
    m.previewIlFees.mockResolvedValue(feesOf([]));
    renderAt([URL]);
    expect(await screen.findByText("No IL fees this period")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bill now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Bill later" })).toBeNull();
  });

  it("a failed preview disables Bill now and explains", async () => {
    m.previewIlFees.mockRejectedValue(new Error("boom"));
    renderAt([URL]);
    expect(await screen.findByText("Couldn’t load the fee preview; you can bill later from Money")).toBeTruthy();
    expect((await billNow()).disabled).toBe(true);
    const later = screen.getByRole("button", { name: "Bill later" }) as HTMLButtonElement;
    expect(later.disabled).toBe(false);
    expect(later.getAttribute("aria-pressed")).toBe("true");
  });

  it("defaults to Bill now when fees are above zero", async () => {
    renderAt([URL]);
    expect((await billNow()).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Bill later" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("Close stays disabled while the fee preview is still loading", async () => {
    m.previewIlFees.mockReturnValue(new Promise(() => {}));
    renderAt([URL]);
    expect((await closeBtn()).disabled).toBe(true);
  });
});

describe("ClosePeriodPage: the close write", () => {
  it("Bill now: the sheet names the amount; nothing is sent until confirmed; PATCH has billFees:true", async () => {
    renderAt([URL]);
    await billNow();
    await screen.findByText("This close would bill $40");
    fireEvent.click(await closeBtn());
    const dialog = screen.getByRole("dialog");
    expect(m.setPeriodStatus).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Close Period 7?")).toBeTruthy();
    expect(within(dialog).getByText("Standings lock and about $40 in IL fees will be billed. You can't undo this.")).toBeTruthy();
    confirmClose(dialog);
    await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledTimes(1));
    expect(m.setPeriodStatus).toHaveBeenCalledWith(7, { status: "completed", billFees: true });
    expect(await screen.findByText("HUB PAGE")).toBeTruthy();
    expect(mockToast).toHaveBeenCalledWith("Period 7 closed", "success");
  });

  it("Bill later: unbilled copy and billFees:false", async () => {
    renderAt([URL]);
    await screen.findByText("This close would bill $40");
    fireEvent.click(await screen.findByRole("button", { name: "Bill later" }));
    fireEvent.click(await closeBtn());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Standings lock — IL fees stay unbilled until you bill them. You can't undo this.")).toBeTruthy();
    confirmClose(dialog);
    await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledWith(7, { status: "completed", billFees: false }));
    expect(m.setPeriodStatus).toHaveBeenCalledTimes(1);
  });

  it("failed preview: closing sends billFees:false with the unbilled copy", async () => {
    m.previewIlFees.mockRejectedValue(new Error("boom"));
    renderAt([URL]);
    await screen.findByText("Couldn’t load the fee preview; you can bill later from Money");
    fireEvent.click(await closeBtn());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Standings lock — IL fees stay unbilled until you bill them. You can't undo this.")).toBeTruthy();
    confirmClose(dialog);
    await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledWith(7, { status: "completed", billFees: false }));
  });

  it("zero preview rows: the no-fees copy, Close enabled, and billFees:true (no stuck bill-later reminder)", async () => {
    m.previewIlFees.mockResolvedValue(feesOf([]));
    renderAt([URL]);
    await screen.findByText("No IL fees this period");
    expect((await closeBtn()).disabled).toBe(false);
    fireEvent.click(await closeBtn());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Standings lock. There are no IL fees to bill. You can't undo this.")).toBeTruthy();
    confirmClose(dialog);
    await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledWith(7, { status: "completed", billFees: true }));
  });

  describe("offsetting rows (+10 / -10, net 0)", () => {
    const offset = () =>
      m.previewIlFees.mockResolvedValue(
        feesOf([
          { action: "add", teamId: 2, playerId: 101, playerName: "Webb", rank: 1, amount: 10 },
          { action: "void", teamId: 3, playerId: 104, playerName: "Old", rank: 1, amount: -10 },
        ]),
      );

    it("shows the per-team lines and requires a choice", async () => {
      offset();
      renderAt([URL]);
      expect(await screen.findByTestId("fee-team-2")).toBeTruthy();
      expect(screen.getByTestId("fee-team-3")).toBeTruthy();
      expect(screen.queryByText("No IL fees this period")).toBeNull();
      expect((await closeBtn()).disabled).toBe(true);
      expect(screen.getByText("Choose Bill now or Bill later to close.")).toBeTruthy();
    });

    it("Bill later sends billFees:false", async () => {
      offset();
      renderAt([URL]);
      fireEvent.click(await screen.findByRole("button", { name: "Bill later" }));
      fireEvent.click(await closeBtn());
      confirmClose(screen.getByRole("dialog"));
      await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledWith(7, { status: "completed", billFees: false }));
    });

    it("Bill now sends billFees:true", async () => {
      offset();
      renderAt([URL]);
      fireEvent.click(await billNow());
      fireEvent.click(await closeBtn());
      confirmClose(screen.getByRole("dialog"));
      await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledWith(7, { status: "completed", billFees: true }));
    });
  });

  it("a net-$0 Bill now sheet says charges and credits are applied", async () => {
    m.previewIlFees.mockResolvedValue(
      feesOf([
        { action: "add", teamId: 1, playerId: 101, playerName: "A", rank: 1, amount: 10 },
        { action: "void", teamId: 3, playerId: 104, playerName: "Old", rank: 1, amount: -10 },
      ]),
    );
    renderAt([URL]);
    expect(await screen.findByText("IL fees net to $0")).toBeTruthy();
    fireEvent.click(await billNow());
    fireEvent.click(await closeBtn());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Standings lock, and the IL fee charges and credits (net $0) are applied. You can't undo this.")).toBeTruthy();
  });

  it("a negative net needs an explicit choice, reads as a credit, and bills now only when chosen", async () => {
    m.previewIlFees.mockResolvedValue(
      feesOf([{ action: "void", teamId: 3, playerId: 104, playerName: "Old", rank: 1, amount: -10 }]),
    );
    renderAt([URL]);
    expect(await screen.findByText("IL fees net to a $10 credit")).toBeTruthy();
    expect(screen.queryByText(/-\$/)).toBeNull();
    expect((await closeBtn()).disabled).toBe(true);
    fireEvent.click(await billNow());
    fireEvent.click(await closeBtn());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Standings lock and a $10 IL fee credit is applied. You can't undo this.")).toBeTruthy();
    confirmClose(dialog);
    await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledWith(7, { status: "completed", billFees: true }));
  });

  it("cancelling the sheet sends nothing", async () => {
    renderAt([URL]);
    await screen.findByText("This close would bill $40");
    fireEvent.click(await closeBtn());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.setPeriodStatus).not.toHaveBeenCalled();
  });

  it("double-clicking confirm sends the PATCH exactly once", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof api.setPeriodStatus>>) => void;
    m.setPeriodStatus.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderAt([URL]);
    await screen.findByText("This close would bill $40");
    fireEvent.click(await closeBtn());
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Close period" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.doubleClick(confirm);
    expect(m.setPeriodStatus).toHaveBeenCalledTimes(1);
    resolve({ id: 7, name: "Period 7", startDate: "", endDate: "", status: "completed" });
    expect(await screen.findByText("HUB PAGE")).toBeTruthy();
    expect(m.setPeriodStatus).toHaveBeenCalledTimes(1);
  });

  it("a failed close stays on the page, toasts the error, and allows a retry", async () => {
    m.setPeriodStatus.mockRejectedValueOnce(new Error("Server said no"));
    renderAt([URL]);
    await screen.findByText("This close would bill $40");
    fireEvent.click(await closeBtn());
    confirmClose(screen.getByRole("dialog"));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Server said no", "error"));
    expect(screen.queryByText("HUB PAGE")).toBeNull();
    fireEvent.click(await closeBtn());
    confirmClose(screen.getByRole("dialog"));
    await waitFor(() => expect(m.setPeriodStatus).toHaveBeenCalledTimes(2));
  });
});
