import { describe, it, expect } from "vitest";
import { deriveActivity } from "../components/ActivityHistoryTab";

const TX_DATE = new Date("2026-04-29");

function txItem(overrides: Partial<{ type: string; transactionRaw: string }>) {
  return {
    type: "transaction" as const,
    date: TX_DATE,
    data: {
      id: 1,
      leagueId: 1,
      teamId: 1,
      playerId: 1,
      type: overrides.type ?? "ADD",
      amount: null,
      relatedTransactionId: null,
      submittedAt: TX_DATE.toISOString(),
      processedAt: TX_DATE.toISOString(),
      status: "APPROVED",
      transactionRaw: overrides.transactionRaw,
    } as unknown as Parameters<typeof deriveActivity>[0]["data"],
  } as Parameters<typeof deriveActivity>[0];
}

describe("deriveActivity — IL detection (precedence over plain Add/Drop)", () => {
  it("classifies 'IL activate — returned X to OF' with destination slot detail", () => {
    const result = deriveActivity(
      txItem({ type: "ADD", transactionRaw: "IL activate — returned Mookie Betts to OF" }),
    );
    expect(result).toEqual({
      label: "IL Activate",
      tone: "il-activate",
      detail: "→ OF",
    });
  });

  it("classifies 'IL activate — dropped from <slot>' as IL Activate without destination", () => {
    const result = deriveActivity(
      txItem({ type: "DROP", transactionRaw: "IL activate — dropped from IL" }),
    );
    expect(result.label).toBe("IL Activate");
    expect(result.tone).toBe("il-activate");
    // 'dropped from IL' shouldn't hit the "to <slot>" regex
    expect(result.detail).toBeUndefined();
  });

  it("classifies 'IL stash — added X' as IL Stash (amber)", () => {
    const result = deriveActivity(
      txItem({ type: "ADD", transactionRaw: "IL stash — added Aaron Judge" }),
    );
    expect(result.label).toBe("IL Stash");
    expect(result.tone).toBe("il-stash");
  });

  it("classifies 'IL stash — MLB status \"Injured 10-Day\"' as IL Stash", () => {
    const result = deriveActivity(
      txItem({ type: "DROP", transactionRaw: 'IL stash — MLB status "Injured 10-Day"' }),
    );
    expect(result.label).toBe("IL Stash");
    expect(result.tone).toBe("il-stash");
  });
});

describe("deriveActivity — commissioner overrides", () => {
  it("classifies 'Commissioner reassign — released from <team>' as Reassigned (violet)", () => {
    const result = deriveActivity(
      txItem({ type: "COMMISSIONER", transactionRaw: "Commissioner reassign — released from Slammers" }),
    );
    expect(result.label).toBe("Reassigned");
    expect(result.tone).toBe("commish");
  });

  it("falls back to 'Commissioner' for COMMISSIONER type with no recognizable raw text", () => {
    const result = deriveActivity(txItem({ type: "COMMISSIONER", transactionRaw: undefined }));
    expect(result.label).toBe("Commissioner");
    expect(result.tone).toBe("commish");
  });
});

describe("deriveActivity — claim/drop happy path", () => {
  it("'Claimed Mike Trout' → Claimed (emerald)", () => {
    const result = deriveActivity(
      txItem({ type: "ADD", transactionRaw: "Claimed Mike Trout" }),
    );
    expect(result.label).toBe("Claimed");
    expect(result.tone).toBe("add");
  });

  it("'Dropped Joey Gallo' → Dropped (red)", () => {
    const result = deriveActivity(
      txItem({ type: "DROP", transactionRaw: "Dropped Joey Gallo" }),
    );
    expect(result.label).toBe("Dropped");
    expect(result.tone).toBe("drop");
  });

  it("falls back to type when transactionRaw is empty: ADD → Claimed", () => {
    const result = deriveActivity(txItem({ type: "ADD", transactionRaw: undefined }));
    expect(result.label).toBe("Claimed");
    expect(result.tone).toBe("add");
  });

  it("falls back to type when transactionRaw is empty: DROP → Dropped", () => {
    const result = deriveActivity(txItem({ type: "DROP", transactionRaw: undefined }));
    expect(result.label).toBe("Dropped");
    expect(result.tone).toBe("drop");
  });
});

describe("deriveActivity — trades", () => {
  it("classifies a completed trade with status detail", () => {
    const item = {
      type: "trade" as const,
      date: TX_DATE,
      data: {
        id: 99,
        createdAt: TX_DATE.toISOString(),
        status: "PROCESSED",
        items: [],
        proposingTeam: { id: 1, name: "Sluggers", code: "SLG" },
        acceptingTeam: { id: 2, name: "Wolves", code: "WLV" },
      } as unknown as Parameters<typeof deriveActivity>[0]["data"],
    } as Parameters<typeof deriveActivity>[0];
    const result = deriveActivity(item);
    expect(result.label).toBe("Trade");
    expect(result.tone).toBe("trade");
    expect(result.detail).toBe("processed");
  });
});

describe("deriveActivity — unknown / fallback", () => {
  it("returns the raw text as label when nothing matches", () => {
    const result = deriveActivity(
      txItem({ type: "WAIVER" as unknown as string, transactionRaw: "Waiver claim from Yahoo import" }),
    );
    expect(result.tone).toBe("other");
    expect(result.label).toBe("Waiver claim from Yahoo import");
  });
});
