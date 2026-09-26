import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMe } from "../account/use-me";

// Signed in without a chosen username: every page leads to onboarding until one is chosen.
// Keeping the suggested name counts, so this is one click.
export function OnboardingRedirect() {
  const me = useMe();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const needsUsername = me.data?.usernameChosen === false;

  useEffect(() => {
    if (needsUsername && pathname !== "/onboarding") {
      void navigate({ to: "/onboarding", replace: true });
    }
  }, [needsUsername, pathname, navigate]);

  return null;
}
