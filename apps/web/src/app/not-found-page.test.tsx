import { expect, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { renderRoute } from "../test/render-route";

test("an unknown path shows the not-found page, with a way back home", async () => {
  await renderRoute("/no-such-page");
  expect(await screen.findByRole("heading", { name: "Page not found" })).toBeDefined();

  fireEvent.click(screen.getByRole("link", { name: "Go to the home page" }));
  expect(
    await screen.findByRole("heading", {
      name: "See what people are trading. Trade it yourself.",
    }),
  ).toBeDefined();
});
