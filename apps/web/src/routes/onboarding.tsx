import { createFileRoute } from "@tanstack/react-router";
import { RequireSignIn } from "../features/auth/require-sign-in";
import { OnboardingPage } from "../features/onboarding/onboarding-page";

export const Route = createFileRoute("/onboarding")({
  component: () => (
    <RequireSignIn title="Set up your account" reason="to set up your account">
      <OnboardingPage />
    </RequireSignIn>
  ),
});
