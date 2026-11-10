import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Secondary buttons must use the tint color, not the card color (they vanish on cards). */
const indexCss = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");
const buttonTsx = readFileSync(resolve(__dirname, "../button.tsx"), "utf8");

function variant(name: string): string {
  const m = new RegExp(`${name}:\\s*\\n?\\s*"([^"]*)"`).exec(buttonTsx);
  if (!m) throw new Error(`variant not found: ${name}`);
  return m[1];
}

describe("secondary button colors", () => {
  it(".lg-button-secondary uses --lg-tint", () => {
    const m = /\.lg-button-secondary\s*\{([^}]*)\}/.exec(indexCss);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("var(--lg-tint)");
  });
  it.each(["secondary", "outline"])("%s variant uses tint, not glass", (name) => {
    const v = variant(name);
    expect(v).toContain("bg-[var(--lg-tint)]");
    expect(v).not.toContain("--lg-glass-bg)]");
  });
});
