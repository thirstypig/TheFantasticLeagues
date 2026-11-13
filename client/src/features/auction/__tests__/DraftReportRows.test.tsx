/** Draft report as rows (design review 2026-11-12): no tables, signed money, my team marked. */
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DraftReportBody, signedMoney, type RetrospectiveData } from "../components/DraftReport";

const data: RetrospectiveData = {
  league: {
    totalLots: 2, totalSpent: 35, avgPrice: 17.5, medianPrice: 17.5, totalBidsPlaced: 4, avgBidsPerLot: 2,
    mostExpensivePlayer: { playerName: "Pete Alonso", position: "1B", price: 21 },
    cheapestWin: { playerName: "Kyle Schwarber", position: "DH", price: 14 },
  },
  bargains: [{ playerName: "Kyle Schwarber", position: "DH", price: 14, projectedValue: 20, surplus: 6 }],
  overpays: [{ playerName: "Pete Alonso", position: "1B", price: 21, projectedValue: 17, surplus: -4 }],
  positionSpending: [{ position: "1B", totalSpent: 21, avgPrice: 21, playerCount: 1 }],
  mostContested: [{ playerName: "Kyle Schwarber", position: "DH", price: 14, bidCount: 2, teamsInvolved: 2 }],
  teamEfficiency: [
    { teamId: 43, teamName: "Los Doyers", totalSpent: 21, playersAcquired: 1, avgPrice: 21, budgetRemaining: 317, bargainCount: 0, overpayCount: 1, totalSurplus: -4 },
    { teamId: 42, teamName: "Dodger Dawgs", totalSpent: 14, playersAcquired: 1, avgPrice: 14, budgetRemaining: 311, bargainCount: 1, overpayCount: 0, totalSurplus: 0 },
  ],
  spendingPace: [
    { quarter: 1, avgPrice: 14, totalSpent: 14, lotsCount: 1 },
    { quarter: 2, avgPrice: 21, totalSpent: 21, lotsCount: 1 },
  ],
};

describe("DraftReportBody", () => {
  it("renders every section as rows, never a table", () => {
    const { container } = render(<DraftReportBody data={data} myTeamId={43} />);
    expect(container.querySelector("table")).toBeNull();
    for (const t of ["League summary", "Top bargains", "Top overpays", "Spending by position", "Most contested", "Team efficiency", "Spending pace"]) {
      expect(screen.getByRole("heading", { name: t })).toBeInTheDocument();
    }
  });

  it("bargain and overpay amounts are signed and colored by class", () => {
    render(<DraftReportBody data={data} />);
    expect(screen.getByText("+$6")).toHaveClass("pos");
    expect(screen.getAllByText("-$4")[0]).toHaveClass("neg");
    expect(screen.getByText("DH · paid $14, value $20")).toBeInTheDocument();
  });

  it("team efficiency marks my team and spells out the numbers", () => {
    render(<DraftReportBody data={data} myTeamId={43} />);
    expect(screen.getByText("You").closest(".ar-row")).toHaveClass("me");
    expect(screen.getByText("1 player · $21 spent · $317 left")).toBeInTheDocument();
  });

  it("spending pace says which way prices moved", () => {
    render(<DraftReportBody data={data} />);
    expect(screen.getByText("avg, up from Q1")).toBeInTheDocument();
  });

  it("signedMoney", () => {
    expect([signedMoney(6), signedMoney(-4), signedMoney(0)]).toEqual(["+$6", "-$4", "—"]);
  });
});
