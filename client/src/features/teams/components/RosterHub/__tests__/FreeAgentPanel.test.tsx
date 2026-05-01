// FreeAgentPanel — render, search, position chip, sort tests.
//
// dnd-kit's useDraggable runs in jsdom but emits noisy console errors
// when there's no DndContext above it. The panel only ATTACHES draggable
// behavior via the hook; visual + filter logic doesn't depend on the
// context, so we wrap the panel in a minimal DndContext for the test.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { FreeAgentPanel } from "../FreeAgentPanel";
import { _clearFreeAgentCache } from "../../../hooks/useFreeAgents";

// Mock the underlying league pool fetcher used by useFreeAgents. We
// supply a small canned roster pool — half free agents, half rostered.
// The hook filters by `ogba_team_code` / `team`, normalizes names, and
// computes projected $ — all of which we exercise here.
vi.mock("../../../../players/api", () => ({
  getPlayerSeasonStats: vi.fn(async () => [
    {
      id: 1, mlb_id: "545361", row_id: "545361-H", player_name: "Mike Trout",
      group: "H", is_pitcher: false, positions: "OF", mlb_team: "LAA",
      ogba_team_code: "", team: "", dollar_value: 38, HR: 40, SB: 12, AVG: ".301",
    },
    {
      id: 2, mlb_id: "660271", row_id: "660271-H", player_name: "Shohei Ohtani",
      group: "H", is_pitcher: false, positions: "DH", mlb_team: "LAD",
      ogba_team_code: "", team: "", dollar_value: 50, HR: 44, SB: 22, AVG: ".310",
    },
    {
      id: 3, mlb_id: "592450", row_id: "592450-H", player_name: "Aaron Judge",
      group: "H", is_pitcher: false, positions: "OF", mlb_team: "NYY",
      ogba_team_code: "", team: "", dollar_value: 42, HR: 48, SB: 8, AVG: ".289",
    },
    {
      id: 4, mlb_id: "543037", row_id: "543037-P", player_name: "Gerrit Cole",
      group: "P", is_pitcher: true, positions: "SP", mlb_team: "NYY",
      ogba_team_code: "", team: "", dollar_value: 28, IP: "180.2", K: 220, ERA: "2.85",
    },
    // Rostered — should NOT appear.
    {
      id: 5, mlb_id: "111111", row_id: "111111-H", player_name: "Rostered Guy",
      group: "H", is_pitcher: false, positions: "1B", mlb_team: "BOS",
      ogba_team_code: "OWN", team: "OWN", dollar_value: 10,
    },
  ]),
}));

function renderPanel(props: Partial<Parameters<typeof FreeAgentPanel>[0]> = {}) {
  return render(
    <DndContext>
      <FreeAgentPanel
        leagueId={1}
        teamId={42}
        isOpen
        onClose={vi.fn()}
        {...props}
      />
    </DndContext>,
  );
}

describe("FreeAgentPanel", () => {
  beforeEach(() => {
    _clearFreeAgentCache();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when isOpen=false (no fetch)", () => {
    renderPanel({ isOpen: false });
    // DndContext injects a hidden screen-reader description div, so the
    // container won't be empty — what matters is the panel itself isn't
    // rendered. Asserting on the absence of the panel's role/aria-label
    // is the precise check.
    expect(screen.queryByRole("complementary", { name: /Free agent panel/ })).toBeNull();
  });

  it("lists free agents only (filters out rostered players)", async () => {
    renderPanel();
    // The rostered player should never appear; default sort is projected $ desc.
    const rows = await screen.findAllByTestId("fa-row");
    expect(rows).toHaveLength(4);
    expect(screen.queryByText(/Rostered Guy/)).toBeNull();
    // Projected $ desc: Ohtani ($50) → Judge ($42) → Trout ($38) → Cole ($28).
    expect(rows[0]).toHaveTextContent("Shohei Ohtani");
    expect(rows[1]).toHaveTextContent("Aaron Judge");
  });

  it("filters by name substring (FA-#1)", async () => {
    renderPanel();
    await screen.findAllByTestId("fa-row");
    fireEvent.change(screen.getByLabelText(/Search free agents/), { target: { value: "ohtani" } });
    const rows = screen.getAllByTestId("fa-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Shohei Ohtani");
  });

  it("filters by MLB team abbr substring (FA-#1)", async () => {
    renderPanel();
    await screen.findAllByTestId("fa-row");
    fireEvent.change(screen.getByLabelText(/Search free agents/), { target: { value: "NYY" } });
    const rows = screen.getAllByTestId("fa-row");
    expect(rows).toHaveLength(2);
    // Both Yankees show up regardless of role.
    expect(rows.some((r) => within(r).queryByText(/Aaron Judge/))).toBe(true);
    expect(rows.some((r) => within(r).queryByText(/Gerrit Cole/))).toBe(true);
  });

  it("position chip toggle filters to OF only", async () => {
    renderPanel();
    await screen.findAllByTestId("fa-row");
    fireEvent.click(screen.getByRole("button", { name: "OF" }));
    const rows = screen.getAllByTestId("fa-row");
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => within(r).queryByText(/Mike Trout/))).toBe(true);
    expect(rows.some((r) => within(r).queryByText(/Aaron Judge/))).toBe(true);
  });

  it("sort dropdown switches to alphabetical", async () => {
    renderPanel();
    await screen.findAllByTestId("fa-row");
    fireEvent.change(screen.getByLabelText(/Sort free agents/), { target: { value: "alphabetical" } });
    const rows = screen.getAllByTestId("fa-row");
    // Alpha order: Aaron Judge, Gerrit Cole, Mike Trout, Shohei Ohtani.
    expect(rows[0]).toHaveTextContent("Aaron Judge");
    expect(rows[1]).toHaveTextContent("Gerrit Cole");
    expect(rows[2]).toHaveTextContent("Mike Trout");
    expect(rows[3]).toHaveTextContent("Shohei Ohtani");
  });

  it("ESC key closes the panel", async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    await screen.findAllByTestId("fa-row");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Close button fires onClose", async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    await screen.findAllByTestId("fa-row");
    fireEvent.click(screen.getByLabelText(/Close free agent panel/));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("each FA row carries its mlb_id as a draggable data-attribute", async () => {
    renderPanel();
    const rows = await screen.findAllByTestId("fa-row");
    const ids = rows.map((r) => r.getAttribute("data-mlb-id"));
    expect(ids).toContain("545361");
    expect(ids).toContain("660271");
    expect(ids).toContain("592450");
    expect(ids).toContain("543037");
  });

  it("renders empty-state copy when filters yield zero matches", async () => {
    renderPanel();
    await screen.findAllByTestId("fa-row");
    fireEvent.change(screen.getByLabelText(/Search free agents/), { target: { value: "zzz nobody" } });
    expect(screen.queryAllByTestId("fa-row")).toHaveLength(0);
    expect(screen.getByText(/No free agents match those filters/)).toBeInTheDocument();
  });
});

describe("encodeFaDndId / decodeFaDndId", () => {
  it("round-trips an mlbId", async () => {
    const { encodeFaDndId, decodeFaDndId, FA_DND_ID_PREFIX } = await import("../FreeAgentPanel");
    expect(encodeFaDndId(660271)).toBe(`${FA_DND_ID_PREFIX}660271`);
    expect(decodeFaDndId(encodeFaDndId(660271))).toBe(660271);
  });

  it("returns null for non-FA prefixes", async () => {
    const { decodeFaDndId } = await import("../FreeAgentPanel");
    expect(decodeFaDndId("hub-row-1")).toBeNull();
    expect(decodeFaDndId("nonsense")).toBeNull();
  });
});
