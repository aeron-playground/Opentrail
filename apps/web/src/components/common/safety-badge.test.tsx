import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { SafetyBadge } from "./safety-badge";

describe("SafetyBadge", () => {
  const cases: [string | null, string, string][] = [
    ["ok", "Safety: Verified", "text-ink-2"],
    ["caution", "Safety: Caution", "text-caution"],
    ["high_risk", "Safety: High risk", "text-caution"],
    // The API may add levels; one this app doesn't know yet counts as caution.
    ["watch", "Safety: Caution", "text-caution"],
  ];

  test.each(cases)("shows %p as %p", (level, words, tone) => {
    const { container } = render(<SafetyBadge level={level} />);
    const badge = container.firstElementChild;
    expect(badge?.textContent).toBe(words);
    expect(badge?.className).toContain(tone);
    expect(badge?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  test("shows nothing before the first check", () => {
    const { container } = render(<SafetyBadge level={null} />);
    expect(container.innerHTML).toBe("");
  });
});
