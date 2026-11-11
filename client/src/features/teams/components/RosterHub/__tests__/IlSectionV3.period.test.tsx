import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../../../components/shared/playerCard/PlayerCard", () => ({ PlayerCard: () => null }));

import { PlayerCardProvider } from "../../../../../components/shared/playerCard/PlayerCardProvider";
import { IlSectionV3 } from "../IlSectionV3";
import type { RosterHubPlayer } from "../types";

const il = (rosterId: number, name: string, ilSince?: string | null): RosterHubPlayer =>
  ({
    rosterId, playerId: rosterId, mlbId: 1000 + rosterId, name, posList: "SP", posPrimary: "SP",
    assignedSlot: "IL", isPitcher: true, mlbTeam: "LAD", pitcherStats: {}, ilSince,
  }) as any;

const periods = [
  { id: 1, name: "Period 1", status: "completed", startDate: "2026-03-25T00:00:00Z" },
  { id: 5, name: "Period 5", status: "completed", startDate: "2026-06-01T00:00:00Z" },
  { id: 6, name: "Period 6", status: "active", startDate: "2026-07-01T00:00:00Z" },
];

function renderIl(isMobile: boolean) {
  return render(
    <MemoryRouter>
      <PlayerCardProvider>
        <IlSectionV3
          players={[
            il(1, "Old Stint", "2026-06-10T00:00:00Z"),
            il(2, "New Stint", "2026-07-04T00:00:00Z"),
            il(3, "Unknown Stint", null),
            il(4, "Preseason", "2026-03-01T00:00:00Z"),
          ]}
          periods={periods as any}
          selectedRosterId={null}
          eligibleRosterIds={new Set()}
          pendingRosterIds={new Set()}
          isMobile={isMobile}
          totalSlots={4}
          onPillClick={() => {}}
          buildActions={() => []}
        />
      </PlayerCardProvider>
    </MemoryRouter>,
  );
}

describe("IL section Period column", () => {
  it('desktop: shows "Since Period N", "This period", "—", "Before Period 1" under a Period header', () => {
    renderIl(false);
    expect(screen.getByRole("columnheader", { name: "Period" })).toBeInTheDocument();
    const periodCell = (name: string) =>
      (screen.getByText(name).closest("tr") as HTMLElement).querySelectorAll("td")[5];
    expect(periodCell("Old Stint").textContent).toBe("Since Period 5");
    expect(periodCell("New Stint").textContent).toBe("This period");
    expect(periodCell("Unknown Stint").textContent).toBe("—");
    expect(periodCell("Preseason").textContent).toBe("Before Period 1");
  });

  it("phone: the same labels appear on the IL list rows", () => {
    renderIl(true);
    expect(screen.getByText(/Since Period 5/)).toBeInTheDocument();
    expect(screen.getByText(/This period/)).toBeInTheDocument();
    expect(screen.getByText(/Before Period 1/)).toBeInTheDocument();
  });

  it("phone: keeps the IL row's statSnapshot text next to the period", () => {
    render(
      <MemoryRouter>
        <PlayerCardProvider>
          <IlSectionV3
            players={[{ ...il(1, "Snap", "2026-06-10T00:00:00Z"), statSnapshot: "Injured 10-Day" } as any]}
            periods={periods as any}
            selectedRosterId={null} eligibleRosterIds={new Set()} pendingRosterIds={new Set()}
            isMobile totalSlots={1} onPillClick={() => {}} buildActions={() => []}
          />
        </PlayerCardProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Injured 10-Day · Since Period 5/)).toBeInTheDocument();
  });
});
