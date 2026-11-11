import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = vi.hoisted(() => ({ user: { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] } as any }));
vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => ({ me: { user: auth.user } }) }));

vi.mock("../api", () => ({
  getLeaguePeriods: vi.fn(),
  getGhostIlSummary: vi.fn(),
  getRosterCheck: vi.fn(),
  getAcceptedTradeCount: vi.fn(),
  getUnbilledPeriods: vi.fn(),
  getRecentChanges: vi.fn(),
}));

import * as api from "../api";
import CommissionerHub from "../pages/CommissionerHub";
import RecentChangesPage from "../pages/RecentChangesPage";

const m = vi.mocked(api);
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10) + "T00:00:00.000Z";

function renderHub() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/20"]}>
      <Routes>
        <Route path="/commissioner/:leagueId" element={<CommissionerHub />} />
        <Route path="/commissioner/:leagueId/recent" element={<RecentChangesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Pinned to the morning (before the 14:00 UTC close threshold) so Needs-you
  // ordering doesn't depend on the wall clock.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T10:00:00.000Z"));
  m.getLeaguePeriods.mockResolvedValue([
    { id: 7, name: "Period 7", startDate: day(-14), endDate: day(-1), status: "active" },
    { id: 8, name: "Period 8", startDate: day(0), endDate: day(14), status: "pending" },
  ]);
  m.getGhostIlSummary.mockResolvedValue({ teams: [], totalTeamsWithGhosts: 0, totalGhosts: 0 });
  m.getRosterCheck.mockResolvedValue({ cap: 23, teams: [] });
  m.getAcceptedTradeCount.mockResolvedValue(0);
  m.getUnbilledPeriods.mockResolvedValue([]);
  m.getRecentChanges.mockResolvedValue([
    { id: 1, action: "PERIOD_CLOSE", resourceType: "Period", resourceId: "7", createdAt: new Date().toISOString(), userName: "Jim", metadata: { leagueId: 20, periodId: 7, billed: true } },
    { id: 2, action: "TRADE_PROCESS", resourceType: "Trade", resourceId: "55", createdAt: new Date().toISOString(), userName: "Jim", metadata: null },
    { id: 3, action: "SOME_OTHER_THING", resourceType: "X", resourceId: null, createdAt: new Date().toISOString(), userName: null, metadata: null },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CommissionerHub", () => {
  it("puts 'Start Period 8 · today' first, linking to start/8", async () => {
    renderHub();
    const link = await screen.findByRole("link", { name: /Start Period 8 · today/ });
    expect(link.getAttribute("href")).toBe("/commissioner/20/start/8");
    const needs = link.closest("[data-testid='needs-you']") as HTMLElement;
    expect(within(needs).getAllByRole("link")[0]).toBe(link);
    expect(m.getLeaguePeriods).toHaveBeenCalledWith(20);
    expect(m.getRecentChanges).toHaveBeenCalledWith(20, 3);
  });

  it("renders exactly seven job rows with the right hrefs", async () => {
    renderHub();
    const jobs = await screen.findByTestId("jobs");
    await waitFor(() => expect(within(jobs).getAllByRole("link")).toHaveLength(7));
    const hrefs = within(jobs).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/commissioner/20/close/7",
      "/commissioner/20/start/8",
      "/commissioner/20/rosters",
      "/commissioner/20/trades",
      "/commissioner/20/money",
      "/commissioner/20/rules",
      "/commissioner/20/owners",
    ]);
    expect(screen.getByRole("link", { name: /Overview/ }).getAttribute("href")).toBe("/commissioner/20/overview");
    expect(screen.getByRole("link", { name: /Archive/ }).getAttribute("href")).toBe("/commissioner/20/archive");
    expect(screen.getByRole("link", { name: "Scoring categories" }).getAttribute("href")).toBe("/commissioner/20/scoring");
    expect(screen.getByRole("link", { name: "Wire List settings" }).getAttribute("href")).toBe("/commissioner/20/wire-list");
  });

  it("after the close threshold on start day, Close Period 7 is listed before Start Period 8", async () => {
    vi.setSystemTime(new Date("2026-09-29T15:00:00.000Z"));
    m.getLeaguePeriods.mockResolvedValue([
      { id: 7, name: "Period 7", startDate: day(-14), endDate: day(-1), status: "active" },
      { id: 8, name: "Period 8", startDate: day(0), endDate: day(14), status: "pending" },
    ]);
    renderHub();
    const start = await screen.findByRole("link", { name: /Start Period 8 · today/ });
    const needs = start.closest("[data-testid='needs-you']") as HTMLElement;
    const links = within(needs).getAllByRole("link");
    expect(links[0].getAttribute("href")).toBe("/commissioner/20/close/7");
    expect(links[1]).toBe(start);
    expect(within(start).getByText("Close Period 7 first, then start Period 8.")).toBeTruthy();
  });

  it("with no pending period, 'Start next period' links to Season and periods with a hint", async () => {
    m.getLeaguePeriods.mockResolvedValue([
      { id: 7, name: "Period 7", startDate: day(-14), endDate: day(3), status: "active" },
    ]);
    renderHub();
    const row = await screen.findByRole("link", { name: /Start next period/ });
    expect(row.getAttribute("href")).toBe("/commissioner/20/season");
    expect(within(row).getByText("No next period set up")).toBeTruthy();
  });

  it("with no closeable period, 'Close a period' stays disabled with a reason", async () => {
    m.getLeaguePeriods.mockResolvedValue([
      { id: 8, name: "Period 8", startDate: day(3), endDate: day(14), status: "pending" },
    ]);
    renderHub();
    const jobs = await screen.findByTestId("jobs");
    const row = await within(jobs).findByText("Close a period");
    const disabled = row.closest("[aria-disabled='true']") as HTMLElement;
    expect(disabled).toBeTruthy();
    expect(within(disabled).getByText("No active period")).toBeTruthy();
    expect(within(jobs).queryByRole("link", { name: /Close a period/ })).toBeNull();
  });

  it("shows recent changes with audit copy and an All link", async () => {
    renderHub();
    expect(await screen.findByText("Closed Period 7 (fees billed)")).toBeTruthy();
    expect(screen.getByText("Processed trade #55")).toBeTruthy();
    expect(screen.getByText("Some other thing")).toBeTruthy();
    expect(screen.getByRole("link", { name: /All/ }).getAttribute("href")).toBe("/commissioner/20/recent");
  });

  it("still renders Needs you and Jobs when getRecentChanges rejects", async () => {
    m.getRecentChanges.mockRejectedValue(new Error("boom"));
    renderHub();
    expect(await screen.findByRole("link", { name: /Start Period 8 · today/ })).toBeTruthy();
    const jobs = await screen.findByTestId("jobs");
    await waitFor(() => expect(within(jobs).getAllByRole("link")).toHaveLength(7));
    expect(await screen.findByText(/Couldn.t load recent changes/)).toBeTruthy();
  });
});

describe("RecentChangesPage (History)", () => {
  const at = (mo: number, d: number, h: number, mi: number) => new Date(2026, mo, d, h, mi).toISOString();
  const rc = (id: number, action: string, createdAt: string, userName: string | null, metadata: Record<string, unknown> | null = null, resourceId: string | null = null) =>
    ({ id, action, resourceType: "X", resourceId, createdAt, userName, metadata });

  function renderHistory() {
    return render(
      <MemoryRouter initialEntries={["/commissioner/20/recent"]}>
        <Routes><Route path="/commissioner/:leagueId/recent" element={<RecentChangesPage />} /></Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    m.getRecentChanges.mockResolvedValue([
      rc(1, "TRADE_PROCESS", at(5, 14, 20, 31), "Jim", null, "55"),
      rc(2, "RULES_UPDATE", at(5, 14, 9, 5), "Jim", { leagueId: 20, key: "trade_window", value: "meeting_day" }),
      rc(3, "PERIOD_START", at(5, 13, 8, 0), null, { leagueId: 20, periodId: 7 }),
      rc(4, "SOME_OTHER_THING", at(5, 13, 7, 0), "Jim"),
    ]);
  });

  it("is titled History, loads 200, links back, and keeps the footnote", async () => {
    renderHistory();
    expect(await screen.findByText("Processed trade #55")).toBeTruthy();
    expect(m.getRecentChanges).toHaveBeenCalledWith(20, 200);
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Commissioner/ }).getAttribute("href")).toBe("/commissioner/20");
    expect(screen.getByText("Older actions from before this feature may not appear.")).toBeTruthy();
  });

  it("groups rows by day under caption headers with time and who below", async () => {
    renderHistory();
    await screen.findByText("Processed trade #55");
    expect(screen.getByRole("heading", { name: "Jun 14" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Jun 13" })).toBeTruthy();
    expect(screen.getByText("8:31 pm · Jim")).toBeTruthy();
    expect(screen.getByText("8:00 am · System")).toBeTruthy();
  });

  it("filter chips are aria-pressed and filter; All shows unmatched actions", async () => {
    renderHistory();
    await screen.findByText("Processed trade #55");
    const all = screen.getByRole("button", { name: "All" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Some other thing")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Trades" }));
    expect(screen.getByRole("button", { name: "Trades" }).getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Processed trade #55")).toBeTruthy();
    expect(screen.queryByText(/Changed a league rule/)).toBeNull();
    expect(screen.queryByText("Some other thing")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Jun 13" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rules" }));
    expect(screen.getByText("Changed a league rule: When trades are allowed → Meeting day only")).toBeTruthy();
  });

  it("shows an empty state for a filter with no rows", async () => {
    renderHistory();
    await screen.findByText("Processed trade #55");
    fireEvent.click(screen.getByRole("button", { name: "Money" }));
    expect(screen.getByText("Nothing in this group yet.")).toBeTruthy();
  });

  it("chips are at least 44px tall", async () => {
    renderHistory();
    await screen.findByText("Processed trade #55");
    expect(screen.getByRole("button", { name: "Owners" }).style.minHeight).toBe("44px");
  });

  it("shows the load error", async () => {
    m.getRecentChanges.mockRejectedValue(new Error("boom"));
    renderHistory();
    expect(await screen.findByText(/Couldn.t load history/)).toBeTruthy();
  });
});
