import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { renderMarkdown } from "../lib/renderMarkdown";

function renderMd(md: string) {
  const { container } = render(<>{renderMarkdown(md)}</>);
  return container;
}

// ─── Table parsing ──────────────────────────────────────────────────────────

describe("renderMarkdown — table", () => {
  const TABLE_MD = [
    "| Team | Pts |",
    "|------|-----|",
    "| DLC  | 65  |",
    "| SKD  | 51  |",
  ].join("\n");

  it("renders column headers from the first row", () => {
    renderMd(TABLE_MD);
    expect(screen.getByRole("columnheader", { name: "Team" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Pts" })).toBeTruthy();
  });

  it("renders data rows and excludes the separator row", () => {
    renderMd(TABLE_MD);
    // 1 header row + 2 data rows — the ---|--- separator must not become a row
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("renders cell content in data rows", () => {
    renderMd(TABLE_MD);
    expect(screen.getByRole("cell", { name: "DLC" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "65" })).toBeTruthy();
  });

  it("renders bold inside table cells as <strong>", () => {
    // The audit doc has cells like **+16.5** — must render as <strong>, not raw text
    const md = "| Delta |\n|-------|\n| **+16.5** |";
    const container = renderMd(md);
    const strong = container.querySelector("td strong");
    expect(strong).toBeTruthy();
    expect(strong!.textContent).toBe("+16.5");
  });

  it("does not render a table for a single pipe row with no separator", () => {
    // A lone | line without a separator row must not produce a <table>
    const md = "| only one row |";
    const container = renderMd(md);
    expect(container.querySelector("table")).toBeNull();
  });
});

// ─── Inline formatting ──────────────────────────────────────────────────────

describe("renderMarkdown — inline formatting", () => {
  it("renders **bold** as <strong>", () => {
    const container = renderMd("Period 3 has **+16.5 pts** divergence.");
    const strong = container.querySelector("strong");
    expect(strong).toBeTruthy();
    expect(strong!.textContent).toBe("+16.5 pts");
  });

  it("renders `inline code` as <code>", () => {
    const container = renderMd("Query the `TeamStatsPeriod` table.");
    const code = container.querySelector("code");
    expect(code).toBeTruthy();
    expect(code!.textContent).toBe("TeamStatsPeriod");
  });

  it("renders [link](url) as <a> with correct href and label", () => {
    const container = renderMd("See [FanGraphs](https://fangraphs.com) for details.");
    const a = container.querySelector("a");
    expect(a).toBeTruthy();
    expect(a!.href).toContain("fangraphs.com");
    expect(a!.textContent).toBe("FanGraphs");
  });

  it("leaves plain text without wrapping it in formatting elements", () => {
    const container = renderMd("No special formatting here.");
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("code")).toBeNull();
    expect(container.textContent).toContain("No special formatting here.");
  });
});

// ─── Headings ───────────────────────────────────────────────────────────────

describe("renderMarkdown — headings", () => {
  it("renders # as h1", () => {
    renderMd("# OGBA 2026 Audit");
    expect(screen.getByRole("heading", { level: 1, name: "OGBA 2026 Audit" })).toBeTruthy();
  });

  it("renders ## as h2", () => {
    renderMd("## Period 1 Audit");
    expect(screen.getByRole("heading", { level: 2, name: "Period 1 Audit" })).toBeTruthy();
  });

  it("renders ### as h3", () => {
    renderMd("### Raw Stats");
    expect(screen.getByRole("heading", { level: 3, name: "Raw Stats" })).toBeTruthy();
  });

  it("renders inline bold inside a heading", () => {
    const container = renderMd("## **Key** Finding");
    const strong = container.querySelector("h2 strong");
    expect(strong).toBeTruthy();
    expect(strong!.textContent).toBe("Key");
  });
});

// ─── Block-level elements ────────────────────────────────────────────────────

describe("renderMarkdown — block elements", () => {
  it("renders > as a blockquote with the source text", () => {
    const container = renderMd("> Source: production DB");
    const bq = container.querySelector("blockquote");
    expect(bq).toBeTruthy();
    expect(bq!.textContent).toContain("Source: production DB");
  });

  it("renders a fenced code block as <pre> containing the inner text", () => {
    const md = "```sql\nSELECT * FROM standings;\n```";
    const container = renderMd(md);
    const pre = container.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre!.textContent).toContain("SELECT * FROM standings;");
  });

  it("renders --- as <hr>", () => {
    expect(renderMd("---").querySelector("hr")).toBeTruthy();
  });

  it("renders a bullet list with correct item text", () => {
    const container = renderMd("- DLC: 65.0\n- SKD: 51.0");
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("DLC: 65.0");
    expect(items[1].textContent).toContain("SKD: 51.0");
  });
});
