import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PriceChange } from "./price-change";

describe("PriceChange", () => {
  const cases: [string, string, string, boolean][] = [
    ["2.5", "+2.50%", "text-gain", true],
    ["-4.8212", "−4.82%", "text-loss", true],
    ["0", "0.00%", "text-ink-2", false],
    // Rounds to zero, so it shows as flat: no arrow next to 0.00%.
    ["0.004", "0.00%", "text-ink-2", false],
  ];

  test.each(cases)("shows %s as %s", (percent, text, color, arrow) => {
    const { container } = render(<PriceChange percent={percent} />);
    const change = screen.getByText(text);
    expect(change.className).toContain(color);
    expect(container.querySelector("svg[aria-hidden='true']") !== null).toBe(arrow);
  });

  test("shows a dash, and says why to screen readers, before the first change", () => {
    render(<PriceChange percent={null} />);
    expect(screen.getByText("—").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("No 24-hour change yet")).toBeDefined();
  });
});
