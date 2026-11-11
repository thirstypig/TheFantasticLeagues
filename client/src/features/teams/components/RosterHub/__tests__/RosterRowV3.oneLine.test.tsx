import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../../../components/shared/playerCard/PlayerCard", () => ({
  PlayerCard: ({ mlbId }: { mlbId: number }) => <div data-testid="player-card" data-mlbid={mlbId} />,
}));

import { PlayerCardProvider } from "../../../../../components/shared/playerCard/PlayerCardProvider";
import { RosterRowV3 } from "../RosterRowV3";
import { MobileRowV3 } from "../MobileRowV3";
import type { RosterHubPlayer } from "../types";

const player = (over: Partial<RosterHubPlayer> = {}): RosterHubPlayer =>
  ({
    rosterId: 1, playerId: 11, mlbId: 669257, name: "Will Smith", posList: "C,DH", posPrimary: "C",
    mlbTeam: "LAD", assignedSlot: "C", isPitcher: false,
    hitterStats: { AB: 100, H: 31, R: 10, HR: 5, RBI: 20, SB: 1, AVG: 0.31 }, ...over,
  }) as RosterHubPlayer;

const common = {
  isSelected: false, isEligible: false, isDimmed: false, isPending: false,
  isDragSource: false, isDropTarget: false, onPillClick: () => {},
  actions: [{ id: "drop", label: "Drop", onSelect: () => {} }] as any,
};

function wrap(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <PlayerCardProvider>
        <table><tbody>{ui}</tbody></table>
      </PlayerCardProvider>
    </MemoryRouter>,
  );
}

describe("desktop hitter row is one line with Pos and MLB columns", () => {
  it('renders Pos "C/DH" and MLB "LAD" in their own cells, name on one line', () => {
    const { container } = wrap(<RosterRowV3 {...common} player={player()} role="hitter" />);
    const cells = Array.from(container.querySelectorAll("tr > td"));
    // Slot | Player | Pos | MLB | AB H R HR RBI SB AVG | Actions
    expect(cells).toHaveLength(12);
    expect(within(cells[1] as HTMLElement).getByRole("button", { name: "Will Smith" })).toBeInTheDocument();
    expect(cells[2].textContent).toBe("C/DH");
    expect(cells[3].textContent).toBe("LAD");
    // The player cell holds the name only: no "LAD · C" subtitle, no eligibility line.
    expect(cells[1].textContent).not.toMatch(/LAD|·|DH/);
  });

  it("a long eligibility list stays on one ellipsized line with the full list in a title", () => {
    const long = player({ posList: "3B,1B,2B,DH,LF,RF,SS", posPrimary: "3B" });
    const { container } = wrap(<RosterRowV3 {...common} player={long} role="hitter" />);
    const posCell = container.querySelectorAll("tr > td")[2] as HTMLElement;
    const inner = posCell.querySelector("[title]") as HTMLElement;
    expect(inner.getAttribute("title")).toBe("3B/1B/2B/SS/DH/LF/RF");
    expect(inner.textContent).toBe("3B/1B/2B/SS/DH/LF/RF");
    expect(inner.style.whiteSpace).toBe("nowrap");
    expect(inner.style.textOverflow).toBe("ellipsis");
    expect(inner.style.overflow).toBe("hidden");
  });

  it("keeps the keeper star, the player-card tap, the slot pill and the kebab", () => {
    const { container } = wrap(
      <RosterRowV3 {...common} player={player({ isKeeper: true })} role="hitter"
        dnd={{ dragHandleAttrs: {} }} />,
    );
    expect(screen.getByLabelText("Keeper")).toBeInTheDocument();
    expect(screen.getByLabelText(/Drag Will Smith/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open actions menu for Will Smith/ })).toBeInTheDocument();
    expect(container.querySelector(".am-roster-pill")).not.toBeNull();
    fireEvent.click(screen.getByText("Will Smith", { exact: false, selector: "button" }));
    expect(screen.getByTestId("player-card")).toHaveAttribute("data-mlbid", "669257");
  });

  it("pitcher rows get the same Pos/MLB columns", () => {
    const sp = player({
      isPitcher: true, posList: "SP", posPrimary: "SP", assignedSlot: "SP", mlbTeam: "SFG",
      pitcherStats: {}, hitterStats: undefined,
    } as any);
    const { container } = wrap(<RosterRowV3 {...common} player={sp} role="pitcher" />);
    const cells = Array.from(container.querySelectorAll("tr > td"));
    expect(cells).toHaveLength(13);
    expect(cells[2].textContent).toBe("SP");
    expect(cells[3].textContent).toBe("SFG");
  });
});

describe("phone row (MobileRowV3) is two lines", () => {
  it('line 1 = pill, name, "…"; line 2 = "Pos · MLB" + short stats', () => {
    const { container } = render(
      <MemoryRouter>
        <PlayerCardProvider>
          <MobileRowV3 {...common} player={player()} />
        </PlayerCardProvider>
      </MemoryRouter>,
    );
    const l1 = container.querySelector('[data-row-line="1"]') as HTMLElement;
    const l2 = container.querySelector('[data-row-line="2"]') as HTMLElement;
    expect(l1.querySelector(".am-roster-pill")).not.toBeNull();
    expect(within(l1).getByRole("button", { name: "Will Smith" })).toBeInTheDocument();
    expect(within(l1).getByRole("button", { name: /Open actions menu/ })).toBeInTheDocument();
    expect(l2.textContent).toContain("C/DH · LAD");
    expect(l2.textContent).toContain("5 HR");
    expect(l1.textContent).not.toContain("LAD");
  });
});
