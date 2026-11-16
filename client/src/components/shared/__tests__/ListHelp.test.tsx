import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ListHelp } from "../ListHelp";

const WIRE = "Your wire list: players you'd pick up between periods, in order.";
const AUCTION =
  "Your auction list: players you plan to put up, in order. If your clock runs out, the top one goes up.";

describe("ListHelp", () => {
  it("shows wire text on click", () => {
    render(<ListHelp kind="wire" />);
    expect(screen.queryByText(WIRE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "What is this list?" }));
    expect(screen.getByText(WIRE)).toBeInTheDocument();
  });

  it("shows auction text", () => {
    render(<ListHelp kind="auction" />);
    fireEvent.click(screen.getByRole("button", { name: "What is this list?" }));
    expect(screen.getByText(AUCTION)).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<ListHelp kind="wire" />);
    fireEvent.click(screen.getByRole("button", { name: "What is this list?" }));
    expect(screen.getByText(WIRE)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText(WIRE)).toBeNull();
  });

  it("closes on a second tap", () => {
    render(<ListHelp kind="wire" />);
    const btn = screen.getByRole("button", { name: "What is this list?" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.queryByText(WIRE)).toBeNull();
  });

  it("opens on hover with a mouse and closes on leave", () => {
    render(<ListHelp kind="wire" />);
    const btn = screen.getByRole("button", { name: "What is this list?" });
    fireEvent.pointerEnter(btn, { pointerType: "mouse" });
    expect(screen.getByText(WIRE)).toBeInTheDocument();
    fireEvent.pointerLeave(btn, { pointerType: "mouse" });
    expect(screen.queryByText(WIRE)).toBeNull();
  });

  it("reflects open state in aria-expanded", () => {
    render(<ListHelp kind="wire" />);
    const btn = screen.getByRole("button", { name: "What is this list?" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});
