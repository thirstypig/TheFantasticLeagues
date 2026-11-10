#!/usr/bin/env node
// Rewrites hard-coded text sizes in client/src onto the 13/15/17/24/32 scale.
// Shapes: TSX `text-[Npx]`, TSX `fontSize:` expressions, CSS `font-size: Npx|rem`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function snapPx(px) {
  if (px <= 13.5) return 13;
  if (px <= 15.5) return 15;
  if (px <= 20) return 17;
  if (px <= 28) return 24;
  if (px < 40) return 32;
  return px;
}

const toPx = (n, unit) => (unit === "rem" ? n * 16 : n);
const CLASS_FOR = { 13: "text-xs", 15: "text-sm", 17: "text-base", 24: "text-xl", 32: "text-3xl" };

// Find the end index of a fontSize expression starting at `start`.
function exprEnd(text, start) {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < text.length && text[i] !== c) {
        if (text[i] === "\\") i++;
        i++;
      }
    } else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      if (depth === 0) return i;
      depth--;
    } else if ((c === "," || c === ";" || c === "\n") && depth === 0) return i;
    i++;
  }
  return i;
}

function rewriteExpr(expr) {
  let changes = 0;
  // Whole-string px/rem literals first, then bare numbers outside strings.
  const out = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < expr.length && expr[j] !== c) {
        if (expr[j] === "\\") j++;
        j++;
      }
      const lit = expr.slice(i, j + 1);
      const m = c !== "`" && /^["']\s*(\d*\.?\d+)(px|rem)\s*["']$/.exec(lit);
      if (m) {
        const px = toPx(parseFloat(m[1]), m[2]);
        if (px > 0 && px < 40) {
          out.push(String(snapPx(px)));
          changes++;
        } else out.push(lit);
      } else out.push(lit);
      i = j + 1;
    } else {
      const m = /^(\d*\.?\d+)/.exec(expr.slice(i));
      const prev = i > 0 ? expr[i - 1] : "";
      if (m && !/[A-Za-z0-9_$.]/.test(prev)) {
        const n = parseFloat(m[1]);
        const next = expr[i + m[1].length] || "";
        if (n > 0 && n < 40 && !/[A-Za-z_$]/.test(next)) {
          const s = snapPx(n);
          if (String(s) !== m[1]) {
            out.push(String(s));
            changes++;
          } else out.push(m[1]);
        } else out.push(m[1]);
        i += m[1].length;
      } else {
        out.push(c);
        i++;
      }
    }
  }
  return { text: out.join(""), changes };
}

export function rewriteSource(text, kind) {
  let changes = 0;
  if (kind === "css") {
    const t = text.replace(/((?<![-\w])font-size\s*:\s*)(\d*\.?\d+)(px|rem)\b/g, (all, pre, n, unit) => {
      const px = toPx(parseFloat(n), unit);
      if (px >= 40) return all;
      changes++;
      return `${pre}${snapPx(px)}px`;
    });
    return { text: t, changes };
  }
  // tsx: text-[Npx]
  let t = text.replace(/text-\[(\d*\.?\d+)(px|rem)\]/g, (all, n, unit) => {
    const s = snapPx(toPx(parseFloat(n), unit));
    if (s >= 40) return all;
    changes++;
    return CLASS_FOR[s];
  });
  // tsx: fontSize: <expr>
  const re = /\bfontSize\s*:\s*/g;
  let result = "";
  let last = 0;
  let m;
  while ((m = re.exec(t))) {
    const start = m.index + m[0].length;
    const end = exprEnd(t, start);
    const r = rewriteExpr(t.slice(start, end));
    result += t.slice(last, start) + r.text;
    changes += r.changes;
    last = end;
    re.lastIndex = end;
  }
  result += t.slice(last);
  return { text: result, changes };
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      yield* walk(p);
    } else if (!/\.test\./.test(e.name)) yield p;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
  let total = 0;
  for (const f of walk(root)) {
    const kind = /\.tsx?$/.test(f) ? "tsx" : /\.css$/.test(f) ? "css" : null;
    if (!kind) continue;
    const src = fs.readFileSync(f, "utf8");
    const r = rewriteSource(src, kind);
    if (r.changes > 0) {
      fs.writeFileSync(f, r.text);
      total += r.changes;
      console.log(`${path.relative(root, f)}: ${r.changes}`);
    }
  }
  console.log(`total: ${total}`);
}
