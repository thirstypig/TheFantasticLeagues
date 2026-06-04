import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AdUnit from "../AdUnit";

describe("AdUnit", () => {
  beforeEach(() => {
    // Provide a real adsbygoogle queue so the push call can be observed.
    (window as any).adsbygoogle = [];
  });

  afterEach(() => {
    delete (window as any).adsbygoogle;
  });

  it("renders an <ins> element with the adsbygoogle class", () => {
    const { container } = render(<AdUnit slot="1234567890" />);
    const ins = container.querySelector("ins.adsbygoogle");
    expect(ins).not.toBeNull();
  });

  it("sets data-ad-client to the publisher ID", () => {
    const { container } = render(<AdUnit slot="1234567890" />);
    const ins = container.querySelector("ins");
    expect(ins?.getAttribute("data-ad-client")).toBe("ca-pub-7103672049879516");
  });

  it("forwards the slot prop to data-ad-slot", () => {
    const { container } = render(<AdUnit slot="8629489586" />);
    expect(container.querySelector("ins")?.getAttribute("data-ad-slot")).toBe("8629489586");
  });

  it("defaults data-ad-format to auto", () => {
    const { container } = render(<AdUnit slot="1234567890" />);
    expect(container.querySelector("ins")?.getAttribute("data-ad-format")).toBe("auto");
  });

  it("respects an explicit format prop", () => {
    const { container } = render(<AdUnit slot="1234567890" format="horizontal" />);
    expect(container.querySelector("ins")?.getAttribute("data-ad-format")).toBe("horizontal");
  });

  it("sets data-full-width-responsive to true", () => {
    const { container } = render(<AdUnit slot="1234567890" />);
    expect(container.querySelector("ins")?.getAttribute("data-full-width-responsive")).toBe("true");
  });

  it("pushes to window.adsbygoogle on mount", () => {
    render(<AdUnit slot="1234567890" />);
    // The push() call appends {} to the array.
    expect((window as any).adsbygoogle).toHaveLength(1);
    expect((window as any).adsbygoogle[0]).toEqual({});
  });

  it("initialises window.adsbygoogle if it does not exist yet", () => {
    delete (window as any).adsbygoogle;
    render(<AdUnit slot="1234567890" />);
    // Component creates the array and pushes into it.
    expect(Array.isArray((window as any).adsbygoogle)).toBe(true);
  });

  it("does not throw when push() raises (adblocker simulation)", () => {
    (window as any).adsbygoogle = {
      push: () => { throw new Error("blocked by adblocker"); },
    };
    // Component must mount without propagating the error.
    expect(() => render(<AdUnit slot="1234567890" />)).not.toThrow();
  });

  it("merges the style prop with the base display:block style", () => {
    const { container } = render(<AdUnit slot="1234567890" style={{ marginTop: 8 }} />);
    const ins = container.querySelector<HTMLElement>("ins");
    expect(ins?.style.display).toBe("block");
    expect(ins?.style.marginTop).toBe("8px");
  });
});
