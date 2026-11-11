import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const open = vi.fn();
vi.mock("../../../components/shared/playerCard/PlayerCardProvider", () => ({
  usePlayerCard: () => ({ open, close: vi.fn() }),
  PlayerLink: ({ mlbId, name, group }: { mlbId?: number | null; name: string; group?: string }) =>
    mlbId ? <button type="button" data-group={group} onClick={() => open(mlbId)}>{name}</button> : <span>{name}</span>,
}));
const phone = vi.hoisted(() => ({ on: false }));
vi.mock("../../../hooks/useMediaQuery", () => ({ useMediaQuery: () => phone.on }));

import { PlayersTable } from "../components/PlayersTable";
import type { PlayerSeasonStat } from "../../../api";

const hitter = (over: Partial<PlayerSeasonStat> = {}): PlayerSeasonStat => ({
  id: 11, mlb_id: "660670", row_id: "660670-H", player_name: "Ronald Acuna", positions: "OF", is_pitcher: false,
  mlb_team: "ATL", ogba_team_code: "", ogba_team_id: null,
  R: 41, HR: 9, RBI: 38, SB: 11, AVG: 0.262, G: 50, AB: 190,
  ...over,
} as PlayerSeasonStat);
const pitcher = (over: Partial<PlayerSeasonStat> = {}): PlayerSeasonStat => ({
  id: 22, mlb_id: "694973", row_id: "694973-P", player_name: "Paul Skenes", positions: "P", is_pitcher: true,
  mlb_team: "PIT", ogba_team_code: "", ogba_team_id: null,
  W: 7, SV: 0, K: 88, ERA: 2.31, WHIP: 0.98, IP: 90,
  ...over,
} as PlayerSeasonStat);

function renderTable(rows: PlayerSeasonStat[], props: Partial<React.ComponentProps<typeof PlayersTable>> = {}) {
  return render(
    <MemoryRouter>
      <PlayersTable
        rows={rows}
        group="hitters"
        mode="season"
        myTeamId={1}
        myTeamCode="LOS"
        pendingPeriodId={null}
        listedIds={new Set()}
        onWireListAdd={vi.fn().mockResolvedValue(undefined)}
        {...props}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.clearAllMocks(); phone.on = false; });

describe("PlayersTable", () => {
  it("hitters tab shows R HR RBI SB AVG; pitchers tab shows W SV K ERA WHIP", () => {
    const { unmount } = renderTable([hitter()]);
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(["Player", "MLB", "Pos", "Fantasy team", "R", "HR", "RBI", "SB", "AVG", "Action"]);
    expect(screen.getByText(".262")).toBeInTheDocument();
    unmount();
    renderTable([pitcher()], { group: "pitchers" });
    const pheads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(pheads).toEqual(["Player", "MLB", "Pos", "Fantasy team", "W", "SV", "K", "ERA", "WHIP", "Action"]);
    expect(screen.getByText("2.31")).toBeInTheDocument();
    expect(screen.getByText("0.98")).toBeInTheDocument();
  });

  it("free agent gets + Wire List only when a pending period exists", () => {
    const { unmount } = renderTable([hitter()], { pendingPeriodId: null });
    expect(screen.queryByRole("button", { name: "+ Wire List" })).toBeNull();
    unmount();
    renderTable([hitter()], { pendingPeriodId: 5 });
    expect(screen.getByRole("button", { name: "+ Wire List" })).toBeInTheDocument();
  });

  it("+ Wire List calls the handler, then shows On Wire List (disabled) once listed", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderTable([hitter()], { pendingPeriodId: 5, onWireListAdd: onAdd });
    fireEvent.click(screen.getByRole("button", { name: "+ Wire List" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 11 })));
    rerender(
      <MemoryRouter>
        <PlayersTable rows={[hitter()]} group="hitters" mode="season" myTeamId={1} myTeamCode="LOS"
          pendingPeriodId={5} listedIds={new Set([11])} onWireListAdd={onAdd} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "On Wire List" })).toBeDisabled();
  });

  it("disables + Wire List while the add is in flight (no double POST)", async () => {
    let resolve!: () => void;
    const onAdd = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolve = r; }));
    renderTable([hitter()], { pendingPeriodId: 5, onWireListAdd: onAdd });
    const btn = screen.getByRole("button", { name: "+ Wire List" });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    fireEvent.click(btn);
    expect(onAdd).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() => expect(btn).toBeEnabled());
  });

  it("no Trade button on an IL player", () => {
    renderTable([hitter({ ogba_team_code: "BOM", ogba_team_id: 2, ogba_slot: "IL" })]);
    expect(screen.queryByRole("link", { name: "Trade" })).toBeNull();
  });

  it("shows an inline error when the wire list add fails", async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error("Period is LOCKED"));
    renderTable([hitter()], { pendingPeriodId: 5, onWireListAdd: onAdd });
    fireEvent.click(screen.getByRole("button", { name: "+ Wire List" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Period is LOCKED");
    expect(screen.getByRole("button", { name: "+ Wire List" })).toBeEnabled();
  });

  it("other team's player gets Trade linking to /trades/new?team=..&get=..", () => {
    renderTable([hitter({ ogba_team_code: "BOM", ogba_team_id: 2 })]);
    const link = screen.getByRole("link", { name: "Trade" });
    expect(link).toHaveAttribute("href", "/trades/new?team=2&get=11");
    expect(screen.queryByRole("button", { name: "+ Wire List" })).toBeNull();
  });

  it("own player has no action", () => {
    renderTable([hitter({ ogba_team_code: "LOS", ogba_team_id: 1 })], { pendingPeriodId: 5 });
    expect(screen.queryByRole("link", { name: "Trade" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Wire List/ })).toBeNull();
  });

  it("shows no actions when the viewer has no team", () => {
    renderTable([hitter(), hitter({ id: 12, row_id: "x-H", mlb_id: "1", ogba_team_code: "BOM", ogba_team_id: 2 })], {
      myTeamId: null, myTeamCode: null, pendingPeriodId: 5,
    });
    expect(screen.queryByRole("link", { name: "Trade" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Wire List/ })).toBeNull();
  });

  it("M3: names carry the tab's stat group so a two-way player opens on the right side", () => {
    renderTable([pitcher()], { group: "pitchers" });
    expect(screen.getAllByRole("button", { name: /./ }).find((b) => b.getAttribute("data-group"))!.getAttribute("data-group")).toBe("pitching");
  });

  it("M3: hitters tab passes the hitting group", () => {
    renderTable([hitter()]);
    expect(screen.getByRole("button", { name: "Ronald Acuna" }).getAttribute("data-group")).toBe("hitting");
  });

  it("tapping the name opens the card", () => {
    renderTable([hitter()]);
    fireEvent.click(screen.getByRole("button", { name: "Ronald Acuna" }));
    expect(open).toHaveBeenCalledWith(660670);
  });

  it("a name without a usable mlb_id is not tappable", () => {
    renderTable([hitter({ mlb_id: "" })]);
    expect(screen.queryByRole("button", { name: "Ronald Acuna" })).toBeNull();
    expect(screen.getByText("Ronald Acuna")).toBeInTheDocument();
  });

  it("phone: row shows name, POS · MLB · Fantasy team and a stats line", () => {
    phone.on = true;
    renderTable([hitter({ ogba_team_code: "BOM", ogba_team_id: 2, ogba_team_name: "Bombers" })]);
    expect(screen.queryByRole("table")).toBeNull();
    const item = screen.getByRole("listitem");
    expect(within(item).getByText(/OF · ATL · /)).toBeInTheDocument();
    expect(within(item).getByText("R 41 · HR 9 · RBI 38 · SB 11 · .262")).toBeInTheDocument();
    expect(within(item).getByRole("link", { name: "Trade" })).toBeInTheDocument();
  });

  it("phone pitcher stats line", () => {
    phone.on = true;
    renderTable([pitcher()], { group: "pitchers" });
    expect(screen.getByText("W 7 · SV 0 · K 88 · ERA 2.31 · WHIP 0.98")).toBeInTheDocument();
    expect(screen.getByText(/P · PIT · Free agent/)).toBeInTheDocument();
  });

  it("clicking a sortable header reports the key", () => {
    const onSort = vi.fn();
    renderTable([hitter()], { onSort, sortKey: "name", sortDesc: false });
    fireEvent.click(screen.getByRole("button", { name: /^HR/ }));
    expect(onSort).toHaveBeenCalledWith("HR");
  });
});
