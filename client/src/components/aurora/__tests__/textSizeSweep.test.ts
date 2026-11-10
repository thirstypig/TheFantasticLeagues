import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error -- plain .mjs without types; one shared implementation with the codemod
import { snapPx as snap, ALLOWED_SIZES as SCALE, findFontSizeExpressions, isComputed } from "../../../../scripts/normalize-font-sizes.mjs";

const SRC = path.resolve(__dirname, "../../..");
function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      yield* walk(p);
    } else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name)) yield p;
  }
}

function scan(text: string, rel: string, isCss: boolean): string[] {
  const bad: string[] = [];
  const lineOf = (i: number) => text.slice(0, i).split("\n").length;
  if (!isCss) {
    for (const m of text.matchAll(/text-\[(\d*\.?\d+)(px|rem)\]/g)) {
      const px = parseFloat(m[1]) * (m[2] === "rem" ? 16 : 1);
      if (snap(px) < 40) bad.push(`${rel}:${lineOf(m.index!)} ${m[0]}`);
    }
    for (const { start, expr } of findFontSizeExpressions(text) as { start: number; expr: string }[]) {
      if (isComputed(expr)) continue;
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
  return bad;
}

describe("text size sweep", () => {
  it("no text sizes outside 13/15/17/24/32", () => {
    const bad: string[] = [];
    for (const f of walk(SRC)) {
      bad.push(...scan(fs.readFileSync(f, "utf8"), path.relative(SRC, f), f.endsWith(".css")));
    }
    expect(bad, bad.slice(0, 40).join("\n")).toEqual([]);
  });

  it("scanner flags literals, multi-line ternaries and JSX props", () => {
    expect(scan("style={{ fontSize: 11 }}", "x", false)).toHaveLength(1);
    expect(scan("fontSize: compact\n  ? 10\n  : 13", "x", false)).toHaveLength(1);
    expect(scan("<Text fontSize={10} />", "x", false)).toHaveLength(1);
    expect(scan("<Text fontSize={compact ? 10 : 13} />", "x", false)).toHaveLength(1);
    expect(scan("fontSize: 13, x: 1", "x", false)).toHaveLength(0);
  });

  it("does not flag computed expressions", () => {
    expect(scan("fontSize: size * 0.85", "x", false)).toEqual([]);
    expect(scan("fontSize: Math.round(size * 0.35)", "x", false)).toEqual([]);
  });
});
