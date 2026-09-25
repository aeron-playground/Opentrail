import { describe, expect, test } from "bun:test";
import { APP_NAME } from "@repo/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/render-route";
import { type NavItem, RAIL_FOOT_ITEMS, RAIL_ITEMS, TAB_ITEMS } from "./navigation";

const HEADINGS: Record<NavItem["to"], string> = {
  "/": "See what people are trading. Trade it yourself.",
  "/explore": "Explore",
  "/portfolio": "Portfolio",
  "/alerts": "Alerts",
  "/deposit": "Add funds",
  "/settings": "Settings",
};

// Both navigations are in the page: CSS shows the rail from 1024 px and the tabs below that.
function getNav(which: "rail" | "tabs") {
  const [rail, tabs] = screen.getAllByRole("navigation", { name: "Main" });
  const nav = which === "rail" ? rail : tabs;
  if (!nav) {
    throw new Error(`The ${which} navigation is missing.`);
  }
  return nav;
}

function currentLabels(nav: HTMLElement) {
  return within(nav)
    .queryAllByRole("link", { current: "page" })
    .map((link) => link.textContent)
    .filter((label) => label !== APP_NAME);
}

const NAVS = [
  { which: "rail", items: [...RAIL_ITEMS, ...RAIL_FOOT_ITEMS] },
  { which: "tabs", items: TAB_ITEMS },
] as const;

for (const { which, items } of NAVS) {
  describe(`the ${which}`, () => {
    for (const item of items) {
      test(`${item.label} opens its page and becomes the only current item`, async () => {
        const user = userEvent.setup();
        // Start on another page, so the click really navigates.
        await renderRoute(item.to === "/settings" ? "/explore" : "/settings");

        await user.click(within(getNav(which)).getByRole("link", { name: item.label }));

        expect(
          await screen.findByRole("heading", { level: 1, name: HEADINGS[item.to] }),
        ).toBeDefined();
        expect(currentLabels(getNav(which))).toEqual([item.label]);
      });
    }
  });
}

test("the first Tab reaches Skip to content, which points at the main area", async () => {
  const user = userEvent.setup();
  await renderRoute("/explore");

  await user.tab();

  const skipLink = screen.getByRole("link", { name: "Skip to content" });
  expect(document.activeElement).toBe(skipLink);
  expect(skipLink.getAttribute("href")).toBe("#content");
  const main = screen.getByRole("main");
  expect(main.id).toBe("content");
  expect(main.tabIndex).toBe(-1);
});

test("the rail works from the keyboard", async () => {
  const user = userEvent.setup();
  await renderRoute("/");

  // Skip link, the name, Home, then Explore.
  await user.tab();
  await user.tab();
  await user.tab();
  await user.tab();
  expect(document.activeElement).toBe(
    within(getNav("rail")).getByRole("link", { name: "Explore" }),
  );
  await user.keyboard("{Enter}");

  expect(await screen.findByRole("heading", { level: 1, name: "Explore" })).toBeDefined();
});

test("the name in the rail leads home", async () => {
  const user = userEvent.setup();
  await renderRoute("/explore");

  await user.click(within(getNav("rail")).getByRole("link", { name: APP_NAME }));

  expect(await screen.findByRole("heading", { level: 1, name: HEADINGS["/"] })).toBeDefined();
});

test("a missing page keeps the navigation around it", async () => {
  await renderRoute("/no-such-page");
  expect(await screen.findByRole("heading", { name: "Page not found" })).toBeDefined();
  expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(2);
});
