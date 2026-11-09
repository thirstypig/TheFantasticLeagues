import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn(), confirm: vi.fn().mockResolvedValue(true) }),
}));
// Hoisted fns instead of importing the mocked module: the test must not add a
// cross-feature import (ADR-015).
const m = vi.hoisted(() => ({
  getSeasons: vi.fn(),
  getCurrentSeason: vi.fn(),
}));
vi.mock("../../seasons/api", () => ({
  ...m,
  transitionSeason: vi.fn(),
  createPeriod: vi.fn(),
  updatePeriod: vi.fn(),
  deletePeriod: vi.fn(),
}));
vi.mock("../../../api", () => ({
  getLeagues: vi.fn().mockResolvedValue({ leagues: [] }),
}));
vi.mock("../api", () => ({ createLeagueSeason: vi.fn() }));

import SeasonManager from "../components/SeasonManager";

function period(id: number, status: string) {
  return {
    id,
    name: `Period ${id}`,
    startDate: "2026-04-01T00:00:00.000Z",
    endDate: "2026-04-30T00:00:00.000Z",
    status,
    leagueId: 20,
    seasonId: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const season = {
    id: 1,
    leagueId: 20,
    year: 2026,
    status: "IN_SEASON",
    createdAt: "",
    updatedAt: "",
    periods: [period(1, "completed"), period(2, "active"), period(3, "pending")],
  };
  m.getSeasons.mockResolvedValue([season]);
  m.getCurrentSeason.mockResolvedValue(season);
});

function selects() {
  return screen.getAllByRole("combobox").filter((s) => s.querySelector('option[value="pending"]')) as HTMLSelectElement[];
}

describe("SeasonManager period status select", () => {
  it("offers no enabled 'completed' option, and shows it disabled only for a completed period", async () => {
    render(<MemoryRouter><SeasonManager leagueId={20} /></MemoryRouter>);
    await screen.findByText("Period 2");
    const [completed, active, pending] = selects();
    const opt = (s: HTMLSelectElement) => s.querySelector('option[value="completed"]') as HTMLOptionElement | null;
    expect(opt(active)).toBeNull();
    expect(opt(pending)).toBeNull();
    expect(opt(completed)).not.toBeNull();
    expect(opt(completed)!.disabled).toBe(true);
    expect(completed.value).toBe("completed");
    // No enabled completed option anywhere.
    for (const s of selects()) {
      const o = opt(s);
      expect(o === null || o.disabled).toBe(true);
    }
  });

  it("links an active period to the guided close flow", async () => {
    render(<MemoryRouter><SeasonManager leagueId={20} /></MemoryRouter>);
    await screen.findByText("Period 2");
    const links = screen.getAllByRole("link", { name: /Close…/ });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/commissioner/20/close/2");
  });
});
