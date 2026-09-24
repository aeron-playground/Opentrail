import { expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderRoute } from "../test/render-route";

test("the home path shows the landing page inside the main landmark", async () => {
  await renderRoute("/");
  const main = await screen.findByRole("main");
  expect(main.id).toBe("content");
  expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
});
