// Desktop rule (CLAUDE.md, 2026-11-18): no horizontal scroll at >=1280px.
// ThemedTable's default 600px floor must be phone-only; an explicit minWidth
// (wide-by-nature tables) still applies at every width. jsdom can't do layout,
// so these pin the inline style and the responsive classes instead.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemedTable } from "../ThemedTable";

const body = <tbody><tr><td>x</td></tr></tbody>;

describe("ThemedTable minWidth", () => {
  it("default: 600px floor on phones only, none inline", () => {
    render(<ThemedTable bare aria-label="t">{body}</ThemedTable>);
    const t = screen.getByRole("table", { name: "t" });
    expect(t.style.minWidth).toBe("");
    expect(t.className).toContain("min-w-[600px]");
    expect(t.className).toContain("md:min-w-0");
  });

  it("explicit minWidth applies at every width", () => {
    render(<ThemedTable bare minWidth={840} aria-label="t">{body}</ThemedTable>);
    const t = screen.getByRole("table", { name: "t" });
    expect(t.style.minWidth).toBe("840px");
    expect(t.className).not.toContain("min-w-[600px]");
  });

  it("minWidth={0}: no floor at all", () => {
    render(<ThemedTable bare minWidth={0} aria-label="t">{body}</ThemedTable>);
    const t = screen.getByRole("table", { name: "t" });
    expect(t.style.minWidth).toBe("");
    expect(t.className).not.toContain("min-w-");
  });
});
