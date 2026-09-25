import { expect, test } from "bun:test";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderRoute } from "../test/render-route";

const PAGES: { path: string; title: string }[] = [
  { path: "/explore", title: "Explore" },
  { path: "/portfolio", title: "Portfolio" },
  { path: "/alerts", title: "Alerts" },
  { path: "/deposit", title: "Add funds" },
  { path: "/settings", title: "Settings" },
];

for (const { path, title } of PAGES) {
  test(`${path} shows the ${title} page`, async () => {
    await renderRoute(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeDefined();
  });
}

test("the landing page leads to Explore", async () => {
  await renderRoute("/");
  fireEvent.click(await screen.findByRole("link", { name: "Explore tokens" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Explore" })).toBeDefined();
});

test("the Portfolio page leads to Add funds, which has no phone tab of its own", async () => {
  await renderRoute("/portfolio");
  const main = await screen.findByRole("main");
  fireEvent.click(within(main).getByRole("link", { name: "Add funds" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Add funds" })).toBeDefined();
});
