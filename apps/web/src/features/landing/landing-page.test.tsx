import { expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderRoute } from "../../test/render-route";

test("leads with the headline, the promise and a way to explore", async () => {
  await renderRoute("/");
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "See what people are trading. Trade it yourself.",
    }),
  ).toBeDefined();
  expect(screen.getByText(/Your keys stay with you/)).toBeDefined();
  expect(screen.getByRole("link", { name: "Explore tokens" }).getAttribute("href")).toBe(
    "/explore",
  );
});
