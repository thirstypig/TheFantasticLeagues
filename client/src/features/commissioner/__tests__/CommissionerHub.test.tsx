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
  getLeagueBalances: vi.fn(),
  getCommissionerRules: vi.fn(),
  getCommissionerOverview: vi.fn(),
  getInvites: vi.fn(),
}));

import * as api from "../api";
import CommissionerHub from "../pages/CommissionerHub";
import RecentChangesPage from "../pages/RecentChangesPage";

const m = vi.mocked(api);
const P = (id: number, status: string, start: string, end: string) =>
  ({ id, name: `Period ${id}`, startDate: `${start}T00:00:00.000Z`, endDate: `${end}T00:00:00.000Z`, status });

function setDesktop(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q.includes("1024"), media: q, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as any;
}

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

function at(iso: string) {
  vi.setSystemTime(new Date(iso));
}

beforeEach(() => {
  vi.clearAllMocks();
  setDesktop(false);
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-06-10T10:00:00.000Z");
  m.getLeaguePeriods.mockResolvedValue([P(7, "active", "2026-06-01", "2026-06-14"), P(8, "pending", "2026-06-15", "2026-06-28")]);
  m.getGhostIlSummary.mockResolvedValue({ teams: [], totalTeamsWithGhosts: 0, totalGhosts: 0 });
  m.getRosterCheck.mockResolvedValue({ cap: 23, teams: [] });
  m.getAcceptedTradeCount.mockResolvedValue(0);
  m.getUnbilledPeriods.mockResolvedValue([]);
  m.getLeagueBalances.mockResolvedValue([
    { teamId: 1, teamName: "A", balance: 30 },
    { teamId: 2, teamName: "B", balance: 15 },
    { teamId: 3, teamName: "C", balance: -10 },
  ]);
  m.getCommissionerRules.mockResolvedValue([
    { id: 1, category: "transactions", key: "trade_window", value: "meeting_day", label: "x", isLocked: false },
  ]);
  m.getCommissionerOverview.mockResolvedValue({
    league: { id: 20, name: "L", season: 2026 },
    teams: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `T${i}` })),
    memberships: [],
  } as any);
  m.getInvites.mockResolvedValue([
    { id: 1, status: "PENDING" }, { id: 2, status: "PENDING" }, { id: 3, status: "ACCEPTED" },
  ] as any);
  m.getRecentChanges.mockResolvedValue([
    { id: 1, action: "PERIOD_CLOSE", resourceType: "Period", resourceId: "7", createdAt: new Date().toISOString(), userName: "Jim", metadata: { leagueId: 20, periodId: 7, billed: true } },
    { id: 2, action: "TRADE_PROCESS", resourceType: "Trade", resourceId: "55", createdAt: new Date().toISOString(), userName: "Jim", metadata: null },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

const href = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href");

describe("CommissionerHub tracker", () => {
  it("play: caption with days left and a disabled close button", async () => {
    renderHub();
    expect(await screen.findByText("Period 7 \u00b7 ends Jun 14 \u00b7 4 days left")).toBeTruthy();
    expect(screen.getByText("When Period 7 ends, close it to freeze standings.")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Close Period 7 \u00b7 Jun 14" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId("step-play").getAttribute("aria-current")).toBe("step");
  });

  it("close: primary link to the close page", async () => {
    at("2026-06-15T15:00:00.000Z");
    renderHub();
    const link = await screen.findByRole("link", { name: "Close Period 7" });
    expect(link.getAttribute("href")).toBe("/commissioner/20/close/7");
    expect(screen.getByTestId("step-close").getAttribute("aria-current")).toBe("step");
  });

  it("meeting: sentence and a Start link", async () => {
    m.getLeaguePeriods.mockResolvedValue([P(7, "completed", "2026-06-01", "2026-06-14"), P(8, "pending", "2026-06-20", "2026-06-28")]);
    at("2026-06-16T10:00:00.000Z");
    renderHub();
    expect(await screen.findByText("Enter meeting moves when ready, then start Period 8.")).toBeTruthy();
    expect(href("Start Period 8")).toBe("/commissioner/20/start/8");
    expect(screen.getByTestId("step-meeting").getAttribute("aria-current")).toBe("step");
  });

  it("meeting with nothing pending: Add the next period -> season", async () => {
    m.getLeaguePeriods.mockResolvedValue([P(7, "completed", "2026-06-01", "2026-06-14")]);
    renderHub();
    expect(await screen.findByRole("link", { name: "Add the next period" })).toBeTruthy();
    expect(href("Add the next period")).toBe("/commissioner/20/season");
  });

  it("start: primary Start link", async () => {
    m.getLeaguePeriods.mockResolvedValue([P(7, "completed", "2026-06-01", "2026-06-14"), P(8, "pending", "2026-06-15", "2026-06-28")]);
    at("2026-06-15T10:00:00.000Z");
    renderHub();
    const link = await screen.findByTestId("tracker-action");
    expect(link.textContent).toBe("Start Period 8");
    expect(link.getAttribute("href")).toBe("/commissioner/20/start/8");
    expect(screen.getByTestId("step-start").getAttribute("aria-current")).toBe("step");
  });

  it("setup: Set up periods -> season", async () => {
    m.getLeaguePeriods.mockResolvedValue([]);
    renderHub();
    expect(await screen.findByRole("link", { name: "Set up periods" })).toBeTruthy();
    expect(href("Set up periods")).toBe("/commissioner/20/season");
  });
});

describe("CommissionerHub tiles and rows", () => {
  it("tiles link to the right routes with live status", async () => {
    m.getAcceptedTradeCount.mockResolvedValue(2);
    renderHub();
    expect(await screen.findByText("8 teams \u00b7 2 invites pending")).toBeTruthy();
    expect(href(/^Rosters/)).toBe("/commissioner/20/rosters");
    expect(href(/^Trades/)).toBe("/commissioner/20/trades");
    expect(href(/^Money/)).toBe("/commissioner/20/money");
    expect(href(/^Rules/)).toBe("/commissioner/20/rules");
    expect(href(/^Owners/)).toBe("/commissioner/20/owners");
    expect(href(/^Season/)).toBe("/commissioner/20/season");
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /^Trades/ }).textContent).toContain("2 waiting");
    });
    expect(screen.getByRole("link", { name: /^Rosters/ }).textContent).toContain("8 teams");
    expect(screen.getByRole("link", { name: /^Money/ }).textContent).toContain("$45 owed");
    expect(screen.getByRole("link", { name: /^Rules/ }).textContent).toContain("Trades: meeting day only");
    expect(screen.getByRole("link", { name: /^Season/ }).textContent).toContain("Period 7");
  });

  it("money says All paid up when nobody owes; rules anytime", async () => {
    m.getLeagueBalances.mockResolvedValue([{ teamId: 1, teamName: "A", balance: 0 }]);
    m.getCommissionerRules.mockResolvedValue([{ id: 1, category: "t", key: "trade_window", value: "anytime", label: "x", isLocked: false }]);
    renderHub();
    await waitFor(() => expect(screen.getByRole("link", { name: /^Money/ }).textContent).toContain("All paid up"));
    await waitFor(() => expect(screen.getByRole("link", { name: /^Rules/ }).textContent).toContain("Trades: anytime"));
  });

  it("link rows below the tiles", async () => {
    renderHub();
    expect(await screen.findByRole("link", { name: /History/ })).toBeTruthy();
    expect(href(/History/)).toBe("/commissioner/20/recent");
    expect(href(/Scoring categories/)).toBe("/commissioner/20/scoring");
    expect(href(/Wire List settings/)).toBe("/commissioner/20/wire-list");
  });

  it("failed status calls leave tiles without a status line and nothing crashes", async () => {
    m.getLeagueBalances.mockRejectedValue(new Error("x"));
    m.getCommissionerRules.mockRejectedValue(new Error("x"));
    m.getCommissionerOverview.mockRejectedValue(new Error("x"));
    m.getInvites.mockRejectedValue(new Error("x"));
    m.getAcceptedTradeCount.mockRejectedValue(new Error("x"));
    renderHub();
    await screen.findByText("Period 7 \u00b7 ends Jun 14 \u00b7 4 days left");
    await waitFor(() => expect(screen.getByRole("link", { name: /^Season/ }).textContent).toContain("Period 7"));
    expect(screen.getByRole("link", { name: /^Money/ }).textContent).toBe("Money");
    expect(screen.getByRole("link", { name: /^Rules/ }).textContent).toBe("Rules");
    expect(screen.getByRole("link", { name: /^Owners/ }).textContent).toBe("Owners");
    expect(screen.getByRole("link", { name: /^Trades/ }).textContent).toBe("Trades");
    expect(screen.getByRole("link", { name: /^Rosters/ }).textContent).toBe("Rosters");
  });

  it("Waiting on you shows needs-you rows first", async () => {
    m.getLeaguePeriods.mockResolvedValue([P(7, "completed", "2026-06-01", "2026-06-14"), P(8, "pending", "2026-06-15", "2026-06-28")]);
    at("2026-06-15T10:00:00.000Z");
    m.getAcceptedTradeCount.mockResolvedValue(1);
    renderHub();
    const row = await screen.findByRole("link", { name: /Start Period 8 \u00b7 today/ });
    expect(row.getAttribute("href")).toBe("/commissioner/20/start/8");
    const box = screen.getByTestId("needs-you");
    expect(within(box).getByRole("link", { name: /1 accepted trade/ }).getAttribute("href")).toBe("/commissioner/20/trades");
  });

  it("empty: 'Nothing needs you right now.'", async () => {
    renderHub();
    expect(await screen.findByText("Nothing needs you right now.")).toBeTruthy();
  });

  it("a failed needs-you source still shows the others and a note", async () => {
    m.getRosterCheck.mockRejectedValue(new Error("x"));
    m.getAcceptedTradeCount.mockResolvedValue(3);
    renderHub();
    expect(await screen.findByRole("link", { name: /3 accepted trades/ })).toBeTruthy();
    expect(screen.getByText(/Some checks couldn.t load/)).toBeTruthy();
  });

  it("desktop shows the latest 3 history rows; recent failure does not break the page", async () => {
    setDesktop(true);
    renderHub();
    expect(await screen.findByText("Closed Period 7 (fees billed)")).toBeTruthy();
    expect(screen.getByText("Processed trade #55")).toBeTruthy();
    expect(m.getRecentChanges).toHaveBeenCalledWith(20, 3);
  });

  it("desktop with failed history still renders tracker and tiles", async () => {
    setDesktop(true);
    m.getRecentChanges.mockRejectedValue(new Error("boom"));
    renderHub();
    expect(await screen.findByText("Period 7 \u00b7 ends Jun 14 \u00b7 4 days left")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Money/ })).toBeTruthy();
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
