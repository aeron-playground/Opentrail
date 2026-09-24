import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "../app/router";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <main id="content">
      <Outlet />
    </main>
  );
}
