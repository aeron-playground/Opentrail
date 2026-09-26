import { createFileRoute } from "@tanstack/react-router";
import { RequireSignIn } from "../features/auth/require-sign-in";
import { SettingsPage } from "../features/settings/settings-page";

export const Route = createFileRoute("/settings")({
  component: () => (
    <RequireSignIn title="Settings" reason="to change your settings">
      <SettingsPage />
    </RequireSignIn>
  ),
});
