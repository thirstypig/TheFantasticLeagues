import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({ getChoices: vi.fn(), searchFreeAgents: vi.fn() }));

import * as api from "../api";
import { TurnEntry } from "../components/TurnEntry";
import { ALONSO, CASAS, FRALEY, HAYS, choices } from "./fixtures";

const m = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  m.getChoices.mockResolvedValue(choices({ list: [FRALEY], roster: [ALONSO, HAYS], activeCount: 23 }));
  m.searchFreeAgents.mockResolvedValue([CASAS]);
});

function renderEntry(onSubmit = vi.fn().mockResolvedValue(undefined), onPass = vi.fn().mockResolvedValue(undefined)) {
  render(<TurnEntry leagueId={7} sessionId={55} teamId={3} onSubmit={onSubmit} onPass={onPass} />);
  return { onSubmit, onPass };
}

describe("TurnEntry", () => {
  it("keeps Submit disabled until an add and a drop are picked", async () => {
    const { onSubmit } = renderEntry();
    const submit = await screen.findByRole("button", { name: "Submit move" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: /Jake Fraley/ }));
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Roster stays at/)).toBeNull();
    expect(screen.getByRole("option", { name: "Choose a player to drop" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Drop"), { target: { value: String(HAYS.playerId) } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("✓ Roster stays at 23 / 23")).toBeTruthy();
    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(FRALEY.playerId, HAYS.playerId));
  });

  it("adds a searched free agent", async () => {
    const { onSubmit } = renderEntry();
    fireEvent.change(await screen.findByLabelText("Search free agents"), { target: { value: "cas" } });
    fireEvent.click(await screen.findByRole("button", { name: /Triston Casas/ }));
    fireEvent.change(screen.getByLabelText("Drop"), { target: { value: String(ALONSO.playerId) } });
    fireEvent.click(screen.getByRole("button", { name: "Submit move" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(CASAS.playerId, ALONSO.playerId));
    expect(m.searchFreeAgents).toHaveBeenCalledWith(7, "cas");
  });

  it("hides free agents already added earlier in this meeting", async () => {
    m.searchFreeAgents.mockResolvedValue([CASAS, HAYS]);
    render(
      <TurnEntry leagueId={7} sessionId={55} teamId={3} pickedPlayerIds={[CASAS.playerId]} onSubmit={vi.fn()} onPass={vi.fn()} />,
    );
    fireEvent.change(await screen.findByLabelText("Search free agents"), { target: { value: "a" } });
    expect(await screen.findByRole("button", { name: /Austin Hays/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Triston Casas/ })).toBeNull();
  });

  it("shows a server error inline", async () => {
    renderEntry(vi.fn().mockRejectedValue(new Error("That player is already on a team")));
    fireEvent.click(await screen.findByRole("button", { name: /Jake Fraley/ }));
    fireEvent.change(screen.getByLabelText("Drop"), { target: { value: String(HAYS.playerId) } });
    fireEvent.click(screen.getByRole("button", { name: "Submit move" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That player is already on a team");
  });

  it("Pass calls onPass", async () => {
    const { onPass } = renderEntry();
    fireEvent.click(await screen.findByRole("button", { name: "Pass" }));
    await waitFor(() => expect(onPass).toHaveBeenCalled());
  });
});
