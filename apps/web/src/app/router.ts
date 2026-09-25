import type { QueryClient } from "@tanstack/react-query";
import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { routeTree } from "../routeTree.gen";
import { ErrorPage } from "./error-page";
import { NotFoundPage } from "./not-found-page";
import { PendingPage } from "./pending-page";

// What every route can read in its loader, for example to prefetch queries.
export type RouterContext = {
  queryClient: QueryClient;
};

// Tests pass their own history, so they can start on any path without a browser.
export function createAppRouter(context: RouterContext, options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
    context,
    history: options.history,
    defaultPreload: "intent",
    // Loaders read through the query cache, so the router doesn't keep its own copy.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    // Set for every page rather than once on the root route: the root's own screens would
    // replace the whole layout, navigation included, while these render in the page's place.
    defaultPendingComponent: PendingPage,
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: ErrorPage,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
