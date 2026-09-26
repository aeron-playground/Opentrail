import { createFileRoute } from "@tanstack/react-router";
import { AlertsPage } from "../features/alerts/alerts-page";
import { RequireSignIn } from "../features/auth/require-sign-in";

export const Route = createFileRoute("/alerts")({
  component: () => (
    <RequireSignIn title="Alerts" reason="to see trades from people you follow">
      <AlertsPage />
    </RequireSignIn>
  ),
});
