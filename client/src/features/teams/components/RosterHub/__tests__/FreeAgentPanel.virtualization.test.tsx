// FreeAgentPanel — virtualization smoke test.
//
// Production FA pools regularly hit 2,000+ rows (the OGBA league pool
// peaked at 2,283 in PR #210's DOM audit). Without virtualization
// every row mounts a `useDraggable` hook + grid layout, blowing
// scroll perf on desktop and tanking it on mobile.
//
// This test renders 1,000 mock FAs and asserts that the DOM only ever
// contains the visible viewport's worth (~10–12 rows + overscan), not
// the full pool. The vitest setup file (`src/test/setup.ts`) installs
// a 600px synthetic viewport size for jsdom — at 56px/row that yields
// ~10 visible + 6 overscan above + 6 overscan below ≈ 22 rows max,
// well below the 1,000 pool size.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { FreeAgentPanel } from "../FreeAgentPanel";
import { _clearFreeAgentCache } from "../../../hooks/useFreeAgents";

// Generate N fake FA rows. We mirror the PlayerSeasonStat wire shape
// the real `getPlayerSeasonStats` returns so `useFreeAgents` can run
// its full normalization path — no shortcuts that would mask shape
// mismatches in production.
function makeMockPool(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    mlb_id: String(900000 + i), // synthetic ids — won't collide with real MLB
    row_id: `${900000 + i}-H`,
    player_name: `Player ${String(i).padStart(4, "0")}`,
    group: "H" as const,
    is_pitcher: false,
    positions: i % 2 === 0 ? "OF" : "1B",
    mlb_team: "FA",
    ogba_team_code: "", // empty → free agent
    team: "",
    dollar_value: 50 - (i % 50),
    HR: 20,
    SB: 5,
    AVG: ".275",
  }));
}

const MOCK_POOL_SIZE = 1000;

vi.mock("../../../../players/api", () => ({
  getPlayerSeasonStats: vi.fn(async () => makeMockPool(MOCK_POOL_SIZE)),
}));

function renderPanel() {
  return render(
    <DndContext>
      <FreeAgentPanel leagueId={1} teamId={42} isOpen onClose={vi.fn()} />
    </DndContext>,
  );
}

describe("FreeAgentPanel — virtualization", () => {
  beforeEach(() => {
    _clearFreeAgentCache();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders fewer than the full pool — only the virtual window", async () => {
    renderPanel();
    // Wait for the FA hook to resolve and the first virtual row to mount.
    await waitFor(() => {
      expect(screen.queryAllByTestId("fa-row").length).toBeGreaterThan(0);
    });
    const rendered = screen.getAllByTestId("fa-row").length;
    // Hard upper bound: well below the 1,000-row pool. The synthetic
    // 600px viewport at 56px/row + 6 overscan top/bottom yields ~22.
    // Leave generous headroom (50) so the test isn't brittle to
    // virtualizer-internal heuristics, but still catches regressions
    // where someone accidentally falls back to non-virtualized rendering.
    expect(rendered).toBeLessThan(50);
    expect(rendered).toBeGreaterThanOrEqual(1);
  });

  it("does not mount all 1000 rows in the DOM at once", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.queryAllByTestId("fa-row").length).toBeGreaterThan(0);
    });
    const rendered = screen.getAllByTestId("fa-row").length;
    expect(rendered).toBeLessThan(MOCK_POOL_SIZE);
  });

  it("preserves scrollbar height for the full filtered set", async () => {
    const { container } = renderPanel();
    await waitFor(() => {
      expect(screen.queryAllByTestId("fa-row").length).toBeGreaterThan(0);
    });
    // The virtualizer wraps virtual items in a spacer whose height ===
    // total filtered set × estimateSize. With 1000 rows × 56 px the
    // spacer must be ≥ 50,000 px so the user gets a real scrollbar.
    const scroll = container.querySelector("[data-fa-scroll]") as HTMLElement;
    expect(scroll).toBeTruthy();
    const spacer = scroll.firstElementChild as HTMLElement | null;
    // First child may be the loading/empty state slot — find the
    // positioned spacer specifically.
    const positionedSpacer = Array.from(scroll.children).find((el) => {
      const html = el as HTMLElement;
      return html.style.position === "relative" && Number.parseInt(html.style.height, 10) > 1000;
    }) as HTMLElement | undefined;
    expect(positionedSpacer).toBeTruthy();
    const height = Number.parseInt(positionedSpacer!.style.height, 10);
    expect(height).toBeGreaterThanOrEqual(MOCK_POOL_SIZE * 50); // 56px × 1000 = 56000
  });

  it("each rendered virtual row keeps a stable data-mlb-id for dnd-kit binding", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.queryAllByTestId("fa-row").length).toBeGreaterThan(0);
    });
    const rows = screen.getAllByTestId("fa-row");
    for (const row of rows) {
      const mlbId = row.getAttribute("data-mlb-id");
      expect(mlbId).toBeTruthy();
      // Synthetic ids are 900000 + index — must round-trip through
      // encodeFaDndId without losing precision.
      expect(Number.parseInt(mlbId!, 10)).toBeGreaterThanOrEqual(900000);
    }
  });
});
