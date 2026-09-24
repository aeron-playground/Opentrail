import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorPage } from "./error-page";

// React reports a caught render error on the console; this test expects exactly that.
let consoleError: ReturnType<typeof spyOn>;
beforeEach(() => {
  consoleError = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

test("a failing page shows a calm message, never the error, and recovers on Try again", async () => {
  let failing = true;
  const rootRoute = createRootRoute({
    component: () => {
      if (failing) {
        throw new Error("internal detail that must stay hidden");
      }
      return <p>The page loaded</p>;
    },
    errorComponent: ErrorPage,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);

  expect(await screen.findByRole("heading", { name: "This page didn't load" })).toBeDefined();
  expect(document.body.textContent).not.toContain("internal detail");

  failing = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("The page loaded")).toBeDefined();
});
