import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileStandings, pointColor, CAT_COL_W, standingsViews } from "../pages/MobileStandings";
import { getSeasonStandings } from "../../api";
import { getPeriodCategoryStandings } from "../../api";

vi.mock("../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20, myTeamId: 101 }),
}));

vi.mock("../../api", async () => {
  return {
    getSeasonStandings: vi.fn(),
    getPeriodCategoryStandings: vi.fn(),
  };
});

const SAMPLE_RESPONSE = {
  periodId: 7,
  teamCount: 3,
  categories: [
    {
      key: "AVG",
      label: "AVG",
      group: "H",
      higherIsBetter: true,
      rows: [
        { teamId: 101, teamCode: "LDY", teamName: "Los Doyers", value: 0.282, rank: 1, points: 9 },
        { teamId: 202, teamCode: "DLC", teamName: "Demolition Lumber Co.", value: 0.275, rank: 2, points: 7 },
        { teamId: 303, teamCode: "BCR", teamName: "Bleacher Creatures", value: 0.260, rank: 3, points: 4 },
      ],
    },
    {
      key: "HR",
      label: "HR",
      group: "H",
      higherIsBetter: true,
      rows: [
        { teamId: 101, teamCode: "LDY", teamName: "Los Doyers", value: 110, rank: 2, points: 8 },
        { teamId: 202, teamCode: "DLC", teamName: "Demolition Lumber Co.", value: 130, rank: 1, points: 10 },
        { teamId: 303, teamCode: "BCR", teamName: "Bleacher Creatures", value: 90, rank: 3, points: 5 },
      ],
    },
    {
      key: "ERA",
      label: "ERA",
      group: "P",
      higherIsBetter: false,
      rows: [
        { teamId: 101, teamCode: "LDY", teamName: "Los Doyers", value: 3.42, rank: 1, points: 10 },
        { teamId: 202, teamCode: "DLC", teamName: "Demolition Lumber Co.", value: 3.85, rank: 2, points: 7 },
        { teamId: 303, teamCode: "BCR", teamName: "Bleacher Creatures", value: 4.20, rank: 3, points: 3 },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSeasonStandings).mockResolvedValue({
    periodIds: [5, 6, 7],
    rows: [],
  } as any);
  vi.mocked(getPeriodCategoryStandings).mockResolvedValue(SAMPLE_RESPONSE as any);
});

function renderStandings() {
  return render(
    <MemoryRouter>
      <MobileStandings />
    </MemoryRouter>,
  );
}

describe("MobileStandings", () => {
  it("renders the team rows after the data resolves", async () => {
    renderStandings();
    // Team names appear in both the standings table and Category Leaders cards
    expect((await screen.findAllByText("Los Doyers")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Demolition Lumber Co.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bleacher Creatures").length).toBeGreaterThanOrEqual(1);
  });

  it("highlights the user's team with a YOU badge", async () => {
    renderStandings();
    // Multiple "Los Doyers" elements exist (standings table + Category Leaders cards);
    // only the standings row has the YOU badge inline.
    const ldyItems = await screen.findAllByText("Los Doyers");
    const ldyWithYou = ldyItems.find((el) => within(el.parentElement!).queryByText("YOU"));
    expect(ldyWithYou).toBeDefined();
  });

  it("switches columns when the segmented control changes view", async () => {
    renderStandings();
    await screen.findAllByText("Los Doyers"); // wait for data
    // Hitting view: AVG header should be visible.
    expect(screen.getByRole("tab", { name: "Hitting", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AVG/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Pitching" }));
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Pitching", selected: true })).toBeInTheDocument();
    });
    // Pitching view: ERA header should now be visible.
    expect(screen.getByRole("button", { name: /ERA/ })).toBeInTheDocument();
  });

  it("toggles sort direction when the same column header is clicked twice", async () => {
    renderStandings();
    await screen.findAllByText("Los Doyers"); // wait for data
    const totalHeader = screen.getByRole("button", { name: /PTS/ });
    // Default sort is total/desc — click once to flip to ascending.
    fireEvent.click(totalHeader);
    expect(totalHeader.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(totalHeader);
    expect(totalHeader.getAttribute("aria-sort")).toBe("descending");
  });

  // ── Category leaders ──────────────────────────────────────────────────

  it("renders the Category Leaders section after data loads", async () => {
    renderStandings();
    expect(await screen.findByText("Category Leaders")).toBeInTheDocument();
  });

  it("shows a card per category with the category key as label", async () => {
    renderStandings();
    await screen.findByText("Category Leaders");
    // Three categories in SAMPLE_RESPONSE: AVG, HR, ERA
    expect(screen.getAllByText("AVG").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("HR").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ERA").length).toBeGreaterThanOrEqual(1);
  });

  it("displays team stat values in category leaders cards", async () => {
    renderStandings();
    await screen.findByText("Category Leaders");
    // AVG leader: Los Doyers at .282
    expect(screen.getByText(".282")).toBeInTheDocument();
    // HR leader: Demolition Lumber Co. at 130
    expect(screen.getByText("130")).toBeInTheDocument();
    // ERA leader: Los Doyers at 3.42
    expect(screen.getByText("3.42")).toBeInTheDocument();
  });

  it("shows points values in each category card", async () => {
    renderStandings();
    await screen.findByText("Category Leaders");
    // Points values appear from row.points fields (9, 7, 4, 8, 10, 5, 10, 7, 3)
    expect(screen.getAllByText("9").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("10").length).toBeGreaterThanOrEqual(1);
  });

  it("shows only the leagues categories and an empty state for a tab with none", async () => {
    const two = {
      ...SAMPLE_RESPONSE,
      categories: [
        { ...SAMPLE_RESPONSE.categories[1], key: "R", label: "R" },
        SAMPLE_RESPONSE.categories[1],
      ],
    };
    vi.mocked(getPeriodCategoryStandings).mockResolvedValue(two as any);
    renderStandings();
    await screen.findAllByText("Los Doyers");
    const headers = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim() ?? "")
      .filter((t) => ["AVG", "HR", "R", "RBI", "SB"].includes(t));
    expect(headers).toEqual(["R", "HR"]); // canonical order, not response order

    // A hitting-only league gets no Pitching tab at all.
    expect(screen.queryByRole("tab", { name: "Pitching" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Hitting" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Period" })).toBeInTheDocument();
  });

  it("opens a pitching-only league on the Pitching tab, with no Hitting tab", async () => {
    const pitchOnly = {
      ...SAMPLE_RESPONSE,
      categories: SAMPLE_RESPONSE.categories.filter((c: any) => ["W", "SV", "ERA", "WHIP", "K"].includes(c.key)),
    };
    expect(pitchOnly.categories.length).toBeGreaterThan(0);
    vi.mocked(getPeriodCategoryStandings).mockResolvedValue(pitchOnly as any);
    renderStandings();
    await screen.findAllByText("Los Doyers");
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Hitting" })).toBeNull());
    expect(screen.getByRole("tab", { name: "Pitching", selected: true })).toBeInTheDocument();
  });

  it("does not show the unscored-half text while loading", () => {
    vi.mocked(getSeasonStandings).mockReturnValue(new Promise(() => {}) as any);
    renderStandings();
    expect(screen.queryByText(/doesn't score/)).toBeNull();
  });

  it("shows 'No standings available yet.' for a league with no periods", async () => {
    vi.mocked(getSeasonStandings).mockResolvedValue({ periodIds: [], rows: [] } as any);
    renderStandings();
    expect(await screen.findByText("No standings available yet.")).toBeInTheDocument();
    expect(screen.queryByText(/doesn't score/)).toBeNull();
  });

  it("uses the canonical column order (same as the Rules page) for a standard-10 response", async () => {
    const mk = (key: string, group: string) => ({
      ...SAMPLE_RESPONSE.categories[1], key, label: key, group,
    });
    const std = {
      ...SAMPLE_RESPONSE,
      categories: [
        ...["R", "HR", "RBI", "SB", "AVG"].map((k) => mk(k, "H")),
        ...["W", "SV", "ERA", "WHIP", "K"].map((k) => mk(k, "P")),
      ],
    };
    vi.mocked(getPeriodCategoryStandings).mockResolvedValue(std as any);
    renderStandings();
    await screen.findAllByText("Los Doyers");
    const cols = (set: string[]) =>
      screen.getAllByRole("button").map((b) => b.textContent?.trim() ?? "").filter((t) => set.includes(t));
    expect(cols(["AVG", "HR", "R", "RBI", "SB"])).toEqual(["R", "HR", "RBI", "SB", "AVG"]);
    fireEvent.click(screen.getByRole("tab", { name: "Pitching" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /WHIP/ })).toBeInTheDocument());
    expect(cols(["W", "SV", "K", "ERA", "WHIP"])).toEqual(["W", "SV", "ERA", "WHIP", "K"]);
  });
});

// Design review 2026-11-18: the footnote said "1–10" and green meant ">= 8 points"
// regardless of league size. Both now follow the team count.
describe("MobileStandings point scale follows the team count", () => {
  it("footnote states the real point range", async () => {
    renderStandings();
    expect(await screen.findByText(/roto points \(1–3 for 3 teams\)/)).toBeInTheDocument();
    expect(screen.queryByText(/1–10/)).toBeNull();
    expect(screen.getByText(/Green = 1st in the category/)).toBeInTheDocument();
  });

  it("pointColor: leader green (ties too), top half normal, bottom half muted", () => {
    expect(pointColor(8, 8, 8)).toBe("var(--am-positive)");
    expect(pointColor(7.5, 7.5, 8)).toBe("var(--am-positive)"); // tied for 1st
    expect(pointColor(7, 8, 8)).toBe("var(--am-text)");
    expect(pointColor(4, 8, 8)).toBe("var(--am-text-muted)");
    expect(pointColor(12, 12, 12)).toBe("var(--am-positive)");
    expect(pointColor(8, 12, 12)).toBe("var(--am-text)"); // was green on the fixed 8-team scale
    expect(pointColor(0, 0, 8)).toBe("var(--am-text-muted)");
    expect(pointColor(4.5, 4.5, 8)).not.toBe("var(--am-positive)"); // all 8 tied: nobody leads
  });
});

// "ERA" and "WHIP" ran together as "ERAWHIP" in flat 26px columns (seen on prod
// 2026-11-18). Measured label widths + 8px header padding must fit each column.
describe("MobileStandings column widths fit their labels", () => {
  const measured: Record<string, number> = { R: 9, HR: 18, RBI: 21, SB: 17, AVG: 26, W: 12, SV: 17, ERA: 25, WHIP: 34, K: 9 };
  it.each(Object.entries(measured))("%s fits", (k, textW) => {
    expect(CAT_COL_W[k] ?? 26).toBeGreaterThanOrEqual(textW + 8);
  });
});

describe("standingsViews", () => {
  it("offers all three tabs before categories load", () => {
    expect(standingsViews(new Set())).toEqual(["Hitting", "Pitching", "Period"]);
  });
  it("drops the half a league doesn't score", () => {
    expect(standingsViews(new Set(["R", "HR"]))).toEqual(["Hitting", "Period"]);
    expect(standingsViews(new Set(["ERA"]))).toEqual(["Pitching", "Period"]);
  });
  it("keeps both halves for a standard league", () => {
    expect(standingsViews(new Set(["R", "W"]))).toEqual(["Hitting", "Pitching", "Period"]);
  });
});
