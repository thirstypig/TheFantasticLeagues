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
const STYLE_BG = /\bbackground(?:Color|Image)?\s*:\s*[^,\n]*?["'`]var\(--am-(?:accent|irid)\)["'`]/g;
// Tailwind arbitrary class, solid (not a /opacity variant).
const CLASS_BG = /\bbg-\[var\(--am-(?:accent|irid)\)\](?!\/)/g;
// CSS rule: background / background-color whose whole value is var(--am-accent).
const CSS_BG = /\bbackground(?:-color|-image)?\s*:\s*var\(--am-(?:accent|irid)\)\s*(?:!important\s*)?[;}]/g;

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
        if (!color || !color[1].includes("var(--am-on-accent)")) {
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
      if (!color || !color[1].includes("var(--am-on-accent)")) {
        report(m.index!, `style color is ${color ? color[1].trim() : "unset"}`);
      }
    }
    for (const m of text.matchAll(CLASS_BG)) {
      const cls = enclosingString(text, m.index!);
      if (!cls.includes("text-[var(--am-on-accent)]")) {
        report(m.index!, `className lacks text-[var(--am-on-accent)]`);
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
    // If the regexes break, findOffenders() would silently return [] — make sure
    // the scanner still sees the known accent-background sites.
    const files = walk(SRC);
    let hits = 0;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const re = file.endsWith(".css") ? CSS_BG : file.endsWith(".tsx") ? STYLE_BG : null;
      if (!re) continue;
      hits += [...text.matchAll(re)].length;
      if (file.endsWith(".tsx")) hits += [...text.matchAll(CLASS_BG)].length;
    }
    expect(hits).toBeGreaterThanOrEqual(15);
    expect(files.some((f) => f.endsWith("commissioner.css"))).toBe(true);
  });
});
