import { expect, test } from "bun:test";
import { fireEvent, screen, within } from "@testing-library/react";
import { createFakeAuth } from "../test/fake-auth";
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
  await renderRoute("/portfolio", { auth: createFakeAuth({ status: "signed-in" }) });
  const main = await screen.findByRole("main");
  fireEvent.click(within(main).getByRole("link", { name: "Add funds" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Add funds" })).toBeDefined();
});

test("the Settings page has the theme switch", async () => {
  await renderRoute("/settings", { auth: createFakeAuth({ status: "signed-in" }) });
  expect(await screen.findByRole("group", { name: "Theme" })).toBeDefined();
});
