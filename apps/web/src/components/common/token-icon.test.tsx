import { describe, expect, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { TokenIcon } from "./token-icon";

describe("TokenIcon", () => {
  test("shows the logo without sending a referrer, hidden from screen readers", () => {
    const { container } = render(
      <TokenIcon symbol="JUP" logoUrl="https://static.jup.ag/jup/icon.png" />,
    );
    const icon = container.firstElementChild;
    const logo = container.querySelector("img");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(logo?.getAttribute("src")).toBe("https://static.jup.ag/jup/icon.png");
    expect(logo?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(logo?.getAttribute("alt")).toBe("");
  });

  test("shows the first letter when the logo won't load", () => {
    const { container } = render(
      <TokenIcon symbol="JUP" logoUrl="https://static.jup.ag/jup/icon.png" />,
    );
    const logo = container.querySelector("img");
    if (logo === null) throw new Error("no logo");
    fireEvent.error(logo);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("J");
  });

  test.each([
    ["JUP", "J"],
    ["$WIF", "W"],
    ["mSOL", "M"],
    ["$$", "?"],
  ])("shows %s without a logo as %s", (symbol, letter) => {
    const { container } = render(<TokenIcon symbol={symbol} logoUrl={null} />);
    expect(container.textContent).toBe(letter);
  });
});
