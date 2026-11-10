import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamLogo } from "../TeamLogo";

describe("TeamLogo", () => {
  it("unknown code renders only text", () => {
    const { container } = render(<TeamLogo abbr="TOT" />);
    expect(screen.getByText("TOT")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
  it("known code renders img and code", () => {
    const { container } = render(<TeamLogo abbr="SD" />);
    expect(container.querySelector("img")!.getAttribute("src")).toMatch(/\/135\.svg$/);
    expect(screen.getByText("SD")).toBeTruthy();
  });
  it("falls back to code on image error", () => {
    const { container } = render(<TeamLogo abbr="SD" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("SD")).toBeTruthy();
  });
});
