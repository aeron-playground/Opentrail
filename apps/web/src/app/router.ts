import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { routeTree } from "../routeTree.gen";

// Tests pass their own history, so they can start on any path without a browser.
export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
    history: options.history,
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
