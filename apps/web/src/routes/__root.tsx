import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "../app/router";

// The loading, not-found and error screens are router defaults (see app/router.ts).
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
