import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Typeface guard (DOC-032). Sofia Sans carries text; Sofia Sans Condensed carries
 * headings and big numbers. Reads the source files directly so a regression to
 * Inter in any of the three places fails here.
 */

const indexHtml = readFileSync(resolve(__dirname, "../../../../index.html"), "utf8");
const auroraCss = readFileSync(resolve(__dirname, "../aurora.css"), "utf8");
const indexCss = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");

/** Returns the value of the first `--name:` declaration in the CSS, trimmed. */
function declaration(css: string, name: string): string {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`declaration not found: ${name}`);
  return m[1].trim();
}

describe("typeface stack (Sofia Sans)", () => {
  it("index.html loads Sofia Sans and Sofia Sans Condensed", () => {
    expect(indexHtml).toContain("family=Sofia+Sans:wght@400;500;600;700");
    expect(indexHtml).toContain("family=Sofia+Sans+Condensed:wght@400;500;600;700");
  });

  it("index.html no longer loads Inter", () => {
    expect(indexHtml).not.toContain("family=Inter");
  });

  it("aurora.css --am-body starts with Sofia Sans and ends with the system fallback", () => {
    const value = declaration(auroraCss, "--am-body");
    expect(value).toMatch(/^"Sofia Sans"/);
    expect(value).toMatch(/system-ui, sans-serif$/);
  });

  it("aurora.css --am-display starts with Sofia Sans Condensed", () => {
    expect(declaration(auroraCss, "--am-display")).toMatch(/^"Sofia Sans Condensed"/);
  });

  it("index.css --lg-font-family starts with Sofia Sans and ends with a generic family", () => {
    const value = declaration(indexCss, "--lg-font-family");
    expect(value).toMatch(/^"Sofia Sans"/);
    expect(value).toMatch(/sans-serif$/);
  });
});
