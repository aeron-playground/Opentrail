import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { ErrorPage } from "../app/error-page";
import { NotFoundPage } from "../app/not-found-page";
import type { RouterContext } from "../app/router";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});

function RootLayout() {
  return (
    <main id="content">
      <Outlet />
    </main>
  );
}
