import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { LandingPage } from "./landing-page";

test("leads with the headline and the promise", () => {
  render(<LandingPage />);
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "See what people are trading. Trade it yourself.",
    }),
  ).toBeDefined();
  expect(screen.getByText(/Your keys stay with you/)).toBeDefined();
});
