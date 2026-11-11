import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    rosterId: 1, playerId: 11, mlbId: 660271, name: "Shohei Ohtani", posList: "DH", posPrimary: "DH",
    assignedSlot: "DH", isPitcher: false, ...over,
  }) as RosterHubPlayer;

const common = {
  isSelected: false, isEligible: false, isDimmed: false, isPending: false,
  isDragSource: false, isDropTarget: false, onPillClick: () => {}, actions: [],
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

describe("roster hub name taps open the player card", () => {
  it("desktop row: name opens the card for the row's mlbId, not the accordion", () => {
    const onToggleExpand = vi.fn();
    wrap(<RosterRowV3 {...common} player={player()} role="hitter" onToggleExpand={onToggleExpand} />);
    fireEvent.click(screen.getByRole("button", { name: "Shohei Ohtani" }));
    expect(screen.getByTestId("player-card")).toHaveAttribute("data-mlbid", "660271");
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it("desktop row without an mlbId falls back to the expand toggle", () => {
    const onToggleExpand = vi.fn();
    wrap(<RosterRowV3 {...common} player={player({ mlbId: null })} role="hitter" onToggleExpand={onToggleExpand} />);
    fireEvent.click(screen.getByRole("button", { name: "Shohei Ohtani" }));
    expect(screen.queryByTestId("player-card")).toBeNull();
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("mobile row: name opens the card; no mlbId renders plain text", () => {
    const { unmount } = wrap(<tr><td><MobileRowV3 {...common} player={player()} /></td></tr>);
    fireEvent.click(screen.getByRole("button", { name: "Shohei Ohtani" }));
    expect(screen.getByTestId("player-card")).toHaveAttribute("data-mlbid", "660271");
    unmount();
    wrap(<tr><td><MobileRowV3 {...common} player={player({ mlbId: undefined })} /></td></tr>);
    expect(screen.queryByRole("button", { name: "Shohei Ohtani" })).toBeNull();
  });
});
