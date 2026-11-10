import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlayerFace } from "../PlayerFace";
import { playerHeadshotUrl } from "../../../lib/mlbImages";

describe("PlayerFace", () => {
  it("renders headshot img, then initials after error", () => {
    const { container } = render(<PlayerFace mlbId={660271} name="Shohei Ohtani" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(playerHeadshotUrl(660271));
    fireEvent.error(img);
    expect(screen.getByText("SO")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(() => fireEvent.error(img)).not.toThrow();
  });
  it("renders initials without mlbId", () => {
    const { container } = render(<PlayerFace name="Fernando Tatis Jr." />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("FT")).toBeTruthy();
  });
});
