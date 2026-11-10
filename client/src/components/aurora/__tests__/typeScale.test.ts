import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Type scale (UX step A). Four text sizes (13/15/17/24) plus a 32px display size.
 * Tailwind's text-xs/sm/base/lg/xl/2xl/3xl map onto this scale; the CSS tokens
 * mirror it. Reads the real source files so drift in any of the three fails here.
 */

const auroraCss = readFileSync(resolve(__dirname, "../aurora.css"), "utf8");
const indexCss = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");

/** Returns the value of the first `--name:` declaration in the CSS, trimmed. */
function declaration(css: string, name: string): string {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`declaration not found: ${name}`);
  return m[1].trim();
}

describe("type scale (Tailwind fontSize)", () => {
  it("text-xs/sm/base/xl/3xl map to 13/15/17/24/32px", async () => {
    const config = (await import("../../../../tailwind.config.js")).default;
    const fontSize = config.theme.extend.fontSize;
    expect(fontSize.xs[0]).toBe("13px");
    expect(fontSize.sm[0]).toBe("15px");
    expect(fontSize.base[0]).toBe("17px");
    expect(fontSize.xl[0]).toBe("24px");
    expect(fontSize["3xl"][0]).toBe("32px");
  });
});

describe("type scale (CSS tokens)", () => {
  it("aurora.css .aurora-theme defines the --am-t-* scale", () => {
    expect(declaration(auroraCss, "--am-t-caption")).toBe("13px");
    expect(declaration(auroraCss, "--am-t-small")).toBe("15px");
    expect(declaration(auroraCss, "--am-t-body")).toBe("17px");
    expect(declaration(auroraCss, "--am-t-title")).toBe("24px");
    expect(declaration(auroraCss, "--am-t-display")).toBe("32px");
  });

  it("index.css :root remaps --lg-font-size-* onto the scale", () => {
    expect(declaration(indexCss, "--lg-font-size-xs")).toBe("13px");
    expect(declaration(indexCss, "--lg-font-size-sm")).toBe("15px");
    expect(declaration(indexCss, "--lg-font-size-base")).toBe("17px");
    expect(declaration(indexCss, "--lg-font-size-lg")).toBe("17px");
    expect(declaration(indexCss, "--lg-font-size-xl")).toBe("24px");
    expect(declaration(indexCss, "--lg-font-size-2xl")).toBe("24px");
    expect(declaration(indexCss, "--lg-font-size-3xl")).toBe("32px");
  });
});
