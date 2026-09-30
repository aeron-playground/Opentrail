import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Sparkline } from "./sparkline";

describe("Sparkline", () => {
  const cases: [string, string[], string, string][] = [
    ["a rise", ["1", "1.5", "2"], "7-day trend: up 100.00%", "text-gain"],
    ["a fall", ["2", "3", "1"], "7-day trend: down 50.00%", "text-loss"],
    ["no change", ["1", "2", "1"], "7-day trend: unchanged", "text-ink-3"],
    ["a change that rounds to 0.00%", ["100", "100.001"], "7-day trend: unchanged", "text-ink-3"],
    ["a rise from zero, with no percent", ["0", "1"], "7-day trend: up", "text-gain"],
    ["a price it can't read, left out", ["1", "oops", "2"], "7-day trend: up 100.00%", "text-gain"],
  ];

  test.each(cases)("describes %s", (_, prices, name, color) => {
    render(<Sparkline prices={prices} label="7-day trend" />);
    expect(screen.getByRole("img", { name }).getAttribute("class")).toContain(color);
  });

  test("draws the highest price at the top and the lowest at the bottom, inside the edges", () => {
    const { container } = render(<Sparkline prices={["1", "3", "2"]} label="7-day trend" />);
    expect(container.querySelector("polyline")?.getAttribute("points")).toBe(
      "2.0,26.0 36.0,2.0 70.0,14.0",
    );
  });

  test.each([[[]], [["1"]], [["1", "oops"]]])(
    "says there aren't enough prices yet for %p",
    (prices) => {
      render(<Sparkline prices={prices} label="7-day trend" />);
      expect(screen.queryByRole("img")).toBeNull();
      expect(screen.getByText("7-day trend: not enough prices yet")).toBeDefined();
    },
  );
});
