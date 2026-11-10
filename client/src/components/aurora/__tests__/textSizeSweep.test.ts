import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../../..");
const SCALE = new Set([13, 15, 17, 24, 32]);

function snap(px: number): number {
  if (px <= 13.5) return 13;
  if (px <= 15.5) return 15;
  if (px <= 20) return 17;
  if (px <= 28) return 24;
  if (px < 40) return 32;
  return px;
}

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      yield* walk(p);
    } else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name)) yield p;
  }
}

// End of a fontSize expression: next depth-0 `,` `;` newline or closing bracket.
function exprEnd(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < text.length && text[i] !== c) {
        if (text[i] === "\\") i++;
        i++;
      }
    } else if ("({[".includes(c)) depth++;
    else if (")}]".includes(c)) {
      if (depth === 0) return i;
      depth--;
    } else if (depth === 0 && (c === "," || c === ";" || c === "\n")) return i;
  }
  return text.length;
}

describe("text size sweep", () => {
  it("no text sizes outside 13/15/17/24/32", () => {
    const bad: string[] = [];
    for (const f of walk(SRC)) {
      const text = fs.readFileSync(f, "utf8");
      const rel = path.relative(SRC, f);
      const lineOf = (i: number) => text.slice(0, i).split("\n").length;
      const isCss = f.endsWith(".css");
      if (!isCss) {
        for (const m of text.matchAll(/text-\[(\d*\.?\d+)(px|rem)\]/g)) {
          const px = parseFloat(m[1]) * (m[2] === "rem" ? 16 : 1);
          if (snap(px) < 40) bad.push(`${rel}:${lineOf(m.index!)} ${m[0]}`);
        }
        for (const m of text.matchAll(/\bfontSize\s*:\s*/g)) {
          const start = m.index! + m[0].length;
          const expr = text.slice(start, exprEnd(text, start));
          // Strip string literals that are not px/rem sizes (e.g. var(...)).
          for (const n of expr.matchAll(/(?<![A-Za-z0-9_$.])(\d*\.?\d+)(px|rem)?(?![A-Za-z_$])/g)) {
            const px = parseFloat(n[1]) * (n[2] === "rem" ? 16 : 1);
            if (px > 0 && px < 40 && !SCALE.has(px)) bad.push(`${rel}:${lineOf(start)} fontSize ${n[0]}`);
          }
        }
      }
      for (const m of text.matchAll(/(?<![-\w])font-size\s*:\s*(\d*\.?\d+)(px|rem)\b/g)) {
        const px = parseFloat(m[1]) * (m[2] === "rem" ? 16 : 1);
        if (px < 40 && !(m[2] === "px" && SCALE.has(px))) bad.push(`${rel}:${lineOf(m.index!)} ${m[0]}`);
      }
    }
    expect(bad, bad.slice(0, 40).join("\n")).toEqual([]);
  });
});
