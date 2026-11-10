import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrast guard for the USC palette. Parses the --am-* tokens straight out of
 * the CSS so the test fails if a token drifts below WCAG thresholds.
 * Helpers are exported-shaped (plain functions) so other CSS files can reuse them.
 */

type Tokens = Record<string, string>;

/** Returns the custom properties declared in the first rule whose selector equals `selector`. */
function parseBlock(css: string, selector: string): Tokens {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const [, sel, body] of rules) {
    if (sel.trim().replace(/\s+/g, " ") === selector) {
      const tokens: Tokens = {};
      for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
      return tokens;
    }
  }
  throw new Error(`selector not found: ${selector}`);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex color: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function expectRatio(tokens: Tokens, fg: string, bg: string, min: number): void {
  const ratio = contrast(tokens[fg], tokens[bg]);
  expect(
    ratio,
    `${fg} (${tokens[fg]}) on ${bg} (${tokens[bg]}) = ${ratio.toFixed(2)}:1, need >= ${min}`,
  ).toBeGreaterThanOrEqual(min);
}

const css = readFileSync(resolve(__dirname, "../aurora.css"), "utf8");
const modes: Record<string, Tokens> = {
  light: parseBlock(css, ".aurora-theme"),
  dark: parseBlock(css, ".aurora-theme.dark, .dark .aurora-theme"),
};

const TEXT_TOKENS = [
  "--am-text", "--am-text-muted", "--am-accent", "--am-positive", "--am-negative",
];
const BACKGROUNDS = ["--am-bg", "--am-surface", "--am-chip", "--am-chip-strong", "--am-field"];

describe.each(Object.entries(modes))("aurora tokens (%s)", (_mode, tokens) => {
  for (const fg of TEXT_TOKENS) {
    for (const bg of BACKGROUNDS) {
      it(`${fg} on ${bg} >= 4.5:1`, () => expectRatio(tokens, fg, bg, 4.5));
    }
  }
  it("chip-strong differs from chip", () => {
    expect(tokens["--am-chip-strong"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens["--am-chip-strong"]).not.toBe(tokens["--am-chip"]);
  });
  it("--am-on-accent on --am-accent >= 4.5:1", () =>
    expectRatio(tokens, "--am-on-accent", "--am-accent", 4.5));
  it("--am-field-line on --am-surface >= 3:1", () =>
    expectRatio(tokens, "--am-field-line", "--am-surface", 3));
  it("--am-field-line on --am-field >= 3:1", () =>
    expectRatio(tokens, "--am-field-line", "--am-field", 3));
  it("retired names alias the nine", () => {
    expect(tokens["--am-surface-alt"]).toBe("var(--am-chip)");
    expect(tokens["--am-surface-strong"]).toBe("var(--am-chip-strong)");
    expect(tokens["--am-surface-faint"]).toBe("var(--am-surface)");
    expect(tokens["--am-border-strong"]).toBe("var(--am-field-line)");
    expect(tokens["--am-text-faint"]).toBe("var(--am-text-muted)");
    expect(tokens["--am-warning"]).toBe("var(--am-negative)");
    expect(tokens["--am-accent-2"]).toBe("var(--am-accent)");
    expect(tokens["--am-cardinal"]).toBe("var(--am-accent)");
  });
});

describe("USC spec values", () => {
  it("light bg/accent", () => {
    expect(modes.light["--am-bg"]).toBe("#ded0a8");
    expect(modes.light["--am-surface"]).toBe("#fbf7ec");
    expect(modes.light["--am-accent"]).toBe("#990000");
  });
  it("dark bg/accent", () => {
    expect(modes.dark["--am-bg"]).toBe("#341b1e");
    expect(modes.dark["--am-surface"]).toBe("#5a3337");
    expect(modes.dark["--am-accent"]).toBe("#ffcc00");
  });
  it("light negative is distinct from the brand accent", () => {
    expect(modes.light["--am-negative"]).not.toBe(modes.light["--am-accent"]);
  });
});

describe("index.css legacy --lg-* tokens (logged-out pages)", () => {
  const indexCss = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");
  const lg: Record<string, Tokens> = {
    light: parseBlock(indexCss, ":root"),
    dark: parseBlock(indexCss, ".dark"),
  };

  it.each(Object.entries(lg))("%s --lg-text-primary on --lg-bg-card >= 4.5:1", (_m, t) =>
    expectRatio(t, "--lg-text-primary", "--lg-bg-card", 4.5));
  it.each(Object.entries(lg))("%s --lg-text-muted on --lg-bg-page >= 4.5:1", (_m, t) =>
    expectRatio(t, "--lg-text-muted", "--lg-bg-page", 4.5));

  it("page backgrounds equal the spec values", () => {
    expect(lg.light["--lg-bg-page"]).toBe("#ded0a8");
    expect(lg.dark["--lg-bg-page"]).toBe("#341b1e");
  });
  it("accent equals the spec values", () => {
    expect(lg.light["--lg-accent"]).toBe("#990000");
    expect(lg.dark["--lg-accent"]).toBe("#ffcc00");
  });
});

describe("index.css pre-auth --lg-tint-hover equals chip-strong", () => {
  const indexCss = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");
  it("light", () => expect(parseBlock(indexCss, ":root")["--lg-tint-hover"]).toBe("#ddd0a8"));
  it("dark", () => expect(parseBlock(indexCss, ".dark")["--lg-tint-hover"]).toBe("#633a3e"));
});

describe("aurora.css --lg-* redirect block", () => {
  const redirect = parseBlock(css, ".aurora-theme, .aurora-theme.dark, .dark .aurora-theme");

  it.each([
    ["--lg-input-bg", "var(--am-field)"],
    ["--lg-input-border", "var(--am-field-line)"],
    ["--lg-input-focus", "var(--am-accent)"],
    ["--lg-table-row-alt", "var(--am-surface-alt)"],
    ["--lg-warning", "var(--am-warning)"],
    ["--lg-bg-primary", "var(--am-surface)"],
    ["--lg-bg-secondary", "var(--am-chip)"],
    ["--lg-tint-hover", "var(--am-chip-strong)"],
  ])("%s redirects to %s (no navy/slate leak inside the app)", (token, value) => {
    expect(redirect[token]).toBe(value);
  });
});
