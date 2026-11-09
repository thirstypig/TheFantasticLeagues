import { describe, it, expect } from "vitest";
import { deriveNeedsYou, type NeedsYouInput } from "../lib/needsYou";

const p = (id: number, status: string, startDate: string, endDate: string) => ({
  id,
  name: `P${id}`,
  startDate,
  endDate,
  status,
});

const base: NeedsYouInput = {
  periods: [],
  ghostIlTotal: 0,
  teamsOverCap: 0,
  acceptedTrades: 0,
  unbilled: [],
  now: new Date("2026-06-10T14:00:00Z"),
};

describe("deriveNeedsYou", () => {
  it("nothing to do -> []", () => {
    expect(deriveNeedsYou(base)).toEqual([]);
  });

  it("start day with both due: Close P7 comes FIRST and the start item says to close first", () => {
    const items = deriveNeedsYou({
      ...base,
      periods: [
        p(7, "active", "2026-06-03T00:00:00Z", "2026-06-09T00:00:00Z"),
        p(8, "pending", "2026-06-10T00:00:00Z", "2026-06-16T00:00:00Z"),
      ],
      now: new Date("2026-06-10T15:00:00Z"),
    });
    expect(items.map((i) => i.kind)).toEqual(["close", "start"]);
    expect(items[0]).toMatchObject({ to: "close/7", title: "Close P7" });
    expect(items[1]).toMatchObject({
      urgent: true,
      to: "start/8",
      title: "Start P8 · today",
      detail: "Close P7 first, then start P8.",
    });
  });

  it("start alone (no close due) keeps the normal detail", () => {
    const items = deriveNeedsYou({
      ...base,
      periods: [p(8, "pending", "2026-06-10T00:00:00Z", "2026-06-16T00:00:00Z")],
    });
    expect(items).toHaveLength(1);
    expect(items[0].detail).toBe("Review rosters, then activate the period.");
  });

  it("close uses the server threshold: 12:59 UTC the day after end -> no close", () => {
    const periods = [p(7, "active", "2026-06-03T00:00:00Z", "2026-06-09T00:00:00Z")];
    expect(deriveNeedsYou({ ...base, periods, now: new Date("2026-06-10T12:59:00Z") })).toEqual([]);
    expect(
      deriveNeedsYou({ ...base, periods, now: new Date("2026-06-10T13:00:00Z") }).map((i) => i.kind),
    ).toEqual(["close"]);
  });

  it("pending P8 starting in 3 days -> no start item", () => {
    const items = deriveNeedsYou({
      ...base,
      periods: [p(8, "pending", "2026-06-13T00:00:00Z", "2026-06-19T00:00:00Z")],
    });
    expect(items).toEqual([]);
  });

  it("start is withheld while an active period still ends in the future", () => {
    const items = deriveNeedsYou({
      ...base,
      periods: [
        p(7, "active", "2026-06-03T00:00:00Z", "2026-06-12T00:00:00Z"),
        p(8, "pending", "2026-06-10T00:00:00Z", "2026-06-16T00:00:00Z"),
      ],
    });
    expect(items).toEqual([]);
  });

  it("start 2 days late -> title contains '2 days late'", () => {
    const items = deriveNeedsYou({
      ...base,
      periods: [p(8, "pending", "2026-06-08T00:00:00Z", "2026-06-16T00:00:00Z")],
    });
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("2 days late");
    expect(items[0].urgent).toBe(true);
  });

  it("ghostIlTotal: 1 -> one roster item", () => {
    const items = deriveNeedsYou({ ...base, ghostIlTotal: 1 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "roster", to: "rosters" });
  });

  it("teamsOverCap alone also emits roster; trades emit trade", () => {
    const items = deriveNeedsYou({ ...base, teamsOverCap: 2, acceptedTrades: 1 });
    expect(items.map((i) => i.kind)).toEqual(["roster", "trade"]);
    expect(items[1].to).toBe("trades");
  });

  it("two unbilled -> two bill items pointing at the bill page, titled by period name", () => {
    const items = deriveNeedsYou({
      ...base,
      periods: [p(3, "completed", "2026-05-01T00:00:00Z", "2026-05-14T00:00:00Z")],
      unbilled: [
        { periodId: 3, closedAt: "x" },
        { periodId: 4, closedAt: "y" },
      ],
    });
    expect(items.map((i) => i.kind)).toEqual(["bill", "bill"]);
    expect(items.map((i) => i.to)).toEqual(["bill/3", "bill/4"]);
    // Name when the period is known; "period <id>" when it isn't.
    expect(items.map((i) => i.title)).toEqual(["Bill IL fees · P3", "Bill IL fees · period 4"]);
    expect(new Set(items.map((i) => i.key)).size).toBe(2);
  });

  it("orders close, start, bill, roster, trade", () => {
    const items = deriveNeedsYou({
      ...base,
      periods: [
        p(7, "active", "2026-06-03T00:00:00Z", "2026-06-09T00:00:00Z"),
        p(8, "pending", "2026-06-10T00:00:00Z", "2026-06-16T00:00:00Z"),
      ],
      ghostIlTotal: 1,
      acceptedTrades: 1,
      unbilled: [{ periodId: 3, closedAt: "x" }],
    });
    expect(items.map((i) => i.kind)).toEqual(["close", "start", "bill", "roster", "trade"]);
  });
});
