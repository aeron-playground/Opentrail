import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PendingPage } from "./pending-page";

test("the loading screen tells screen readers that the page is loading", () => {
  render(<PendingPage />);
  expect(screen.getByRole("status").textContent).toBe("Loading");
});
