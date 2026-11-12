import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Text on the accent must use --am-on-accent.
 *
 * The accent is cardinal in light mode and gold in dark mode, so a white
 * (or --am-bg / --am-surface) label on an accent background is unreadable in
 * one of the two themes. This sweep finds every place that paints a SOLID
 * accent background — a style object, a Tailwind `bg-[var(--am-accent)]`
 * className, or a CSS rule — and asserts that the same object / className /
 * rule sets its text color to var(--am-on-accent).
 *
 * --lg-accent (legacy token, also cardinal/gold) requires --lg-on-accent
 * (or --am-on-accent).
 *
 * --am-irid is a legacy alias defined as var(--am-accent) in aurora.css, so
 * fills that use it are held to the same rule.
 *
 * Blocks with background-clip: text are skipped (the accent colors the glyphs).
 *
 * Tints (color-mix(... var(--am-accent) N% ...)) and inset shadows are not
 * solid backgrounds and are ignored.
 */

const SRC = resolve(__dirname, "../../..");
const EXCLUDED_DIRS = [
  join(SRC, "pages", "design"),
  join(SRC, "features", "nba"),
  join(SRC, "features", "nfl"),
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === "__tests__" || name === "node_modules") continue;
    if (EXCLUDED_DIRS.includes(full)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** Text of the innermost `{ ... }` block enclosing `index` (brace depth counting). */
function enclosingBlock(text: string, index: number): string {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i--) {
    const c = text[i];
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start < 0) return "";
  depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

/** Text of the quoted string (", ' or `) enclosing `index` on its line. */
function enclosingString(text: string, index: number): string {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEndRaw = text.indexOf("\n", index);
  const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw;
  const line = text.slice(lineStart, lineEnd);
  const at = index - lineStart;
  for (const q of ['"', "'", "`"]) {
    const open = line.lastIndexOf(q, at);
    const close = line.indexOf(q, at);
    if (open >= 0 && close >= 0) return line.slice(open + 1, close);
  }
  return line;
}

// style object: background / backgroundColor whose value (possibly a ternary
// branch) is exactly the string "var(--am-accent)".
const STYLE_BG = /\bbackground(?:Color|Image)?\s*:\s*[^,{}]*?["'`]var\(--(?:am-accent|am-irid|lg-accent)\)["'`]/g;
// Tailwind arbitrary class, solid (not a /opacity variant).
const CLASS_BG = /\bbg-\[var\(--(?:am-accent|am-irid|lg-accent)\)\](?![\/\w-])/g;
// CSS rule: background / background-color whose whole value is var(--am-accent).
const CSS_BG = /\bbackground(?:-color|-image)?\s*:\s*var\(--(?:am-accent|am-irid|lg-accent)\)\s*(?:!important\s*)?[;}]/g;

const ON_ACCENT = /var\(--(?:am|lg)-on-accent\)/;

const TEXT_CLIP = /[bB]ackgroundClip\s*:\s*["'`]text/;

// The block's own `color` property (not borderColor / background-color etc.).
const STYLE_COLOR = /(?:^|[\s,{])color\s*:\s*([^,\n}]+)/;
const CSS_COLOR = /(?:^|[\s;{])color\s*:\s*([^;}]+)/;

function findOffenders(): string[] {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    const rel = relative(SRC, file);
    const report = (index: number, why: string) => offenders.push(`${rel}:${lineOf(text, index)} ${why}`);

    if (file.endsWith(".css")) {
      const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
      for (const m of stripped.matchAll(CSS_BG)) {
        const block = enclosingBlock(stripped, m.index!);
        const color = CSS_COLOR.exec(block.slice(1));
        if (!color || !ON_ACCENT.test(color[1])) {
          report(m.index!, `rule color is ${color ? color[1].trim() : "unset"}`);
        }
      }
      continue;
    }

    for (const m of text.matchAll(STYLE_BG)) {
      const block = enclosingBlock(text, m.index!);
      // background-clip: text paints the GLYPHS with the accent — that is
      // accent-as-text-color, not a fill behind text.
      if (TEXT_CLIP.test(block)) continue;
      const color = STYLE_COLOR.exec(block.slice(1));
      if (!color || !ON_ACCENT.test(color[1])) {
        report(m.index!, `style color is ${color ? color[1].trim() : "unset"}`);
      }
    }
    for (const m of text.matchAll(CLASS_BG)) {
      const cls = enclosingString(text, m.index!);
      if (!/text-\[var\(--(?:am|lg)-on-accent\)\]/.test(cls)) {
        report(m.index!, `className lacks text-[var(--am-on-accent)] / text-[var(--lg-on-accent)]`);
      }
    }
  }
  return offenders;
}

describe("text on the accent uses --am-on-accent", () => {
  it("every solid accent background sets color: var(--am-on-accent)", () => {
    const offenders = findOffenders();
    expect(offenders, `Offenders:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the sweep actually finds accent backgrounds (guards against a vacuous pass)", () => {
    // If a regex breaks, findOffenders() would silently return [] — so each
    // matcher must still see roughly today's number of known sites. Minimums
    // sit a little below the current counts, so deleting a site or two is fine
    // but a dead regex (count -> 0) fails.
    const files = walk(SRC);
    const counts = { style: 0, className: 0, css: 0, lgAccent: 0 };
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const isCss = file.endsWith(".css");
      if (!isCss && !file.endsWith(".tsx")) continue;
      const style = isCss ? [] : [...text.matchAll(STYLE_BG)];
      const className = isCss ? [] : [...text.matchAll(CLASS_BG)];
      const css = isCss ? [...text.matchAll(CSS_BG)] : [];
      counts.style += style.length;
      counts.className += className.length;
      counts.css += css.length;
      counts.lgAccent += [...style, ...className, ...css].filter((m) => m[0].includes("--lg-accent")).length;
    }
    // Counts on 2026-11-09: style 61, className 85, css 7, --lg-accent 82.
    // Floors lowered 2026-11-11 (className 75 to 45, --lg-accent 72 to 40) after the dead legacy auction UI was deleted; className was 56 and --lg-accent 53 then.
    expect(counts.style, "style-object matches").toBeGreaterThanOrEqual(55);
    expect(counts.className, "className matches").toBeGreaterThanOrEqual(45);
    expect(counts.css, "CSS rule matches").toBeGreaterThanOrEqual(5);
    expect(counts.lgAccent, "--lg-accent matches").toBeGreaterThanOrEqual(40);
    expect(files.some((f) => f.endsWith("commissioner.css"))).toBe(true);
  });

  it("legacy --lg-* tokens provide on-accent and theme-following glass", () => {
    const indexCss = readFileSync(join(SRC, "index.css"), "utf8");
    const auroraCss = readFileSync(join(SRC, "components", "aurora", "aurora.css"), "utf8");
    // Outside .aurora-theme (pre-auth / legacy pages): light white, dark ink.
    expect(indexCss).toMatch(/--lg-accent:\s*#990000;[\s\S]*?--lg-on-accent:\s*#ffffff;/);
    expect(indexCss).toMatch(/--lg-accent:\s*#ffcc00;[\s\S]*?--lg-on-accent:\s*#2a1a00;/);
    // Inside .aurora-theme the legacy tokens redirect to --am-*.
    for (const decl of [
      /--lg-on-accent:\s*var\(--am-on-accent\);/,
      /--lg-glass-bg:\s*var\(--am-surface\);/,
      /--lg-glass-bg-hover:\s*var\(--am-surface-alt\);/,
      /--lg-glass-border:\s*var\(--am-border\);/,
    ]) {
      expect(auroraCss).toMatch(decl);
    }
  });

  it("the commissioner toggle knob uses --am-on-accent on the accent track", () => {
    // A #fff knob on the dark-mode gold track is ~1.4:1; --am-on-accent is
    // guaranteed >= 4.5:1 against --am-accent by tokenContrast.test.ts.
    const css = readFileSync(join(SRC, "features", "commissioner", "commissioner.css"), "utf8");
    const rule = /\.cm-toggle\.on::after\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/background:\s*var\(--am-on-accent\)/);
  });
});

