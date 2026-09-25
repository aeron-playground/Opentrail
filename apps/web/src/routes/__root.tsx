import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { AppShell } from "../app/app-shell";
import type { RouterContext } from "../app/router";

// The loading, not-found and error screens are router defaults (see app/router.ts), so they
// appear inside the shell, with the navigation around them.
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
