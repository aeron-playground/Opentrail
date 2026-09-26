import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorState } from "../../components/common/error-state";
import { Page } from "../../components/common/page";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { isWaitingForWallet, useMe } from "../account/use-me";
import { useAuth } from "../auth/auth-context";
import { ThemeSwitch } from "./theme-switch";

export function SettingsPage() {
  return (
    <Page title="Settings">
      <AccountSection />
      <div className="mt-10">
        <ThemeSwitch />
      </div>
    </Page>
  );
}

function AccountSection() {
  const me = useMe();
  const auth = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await auth.signOut();
      await navigate({ to: "/" });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <section aria-labelledby="account-title" className="mt-8">
      <h2 id="account-title" className="font-semibold text-section">
        Account
      </h2>
      <div className="mt-3">
        {me.isSuccess ? (
          <p>
            Signed in as <span className="font-medium">{me.data.username}</span>
          </p>
        ) : me.isError ? (
          <ErrorState
            message="We couldn't load your account. Try again."
            onRetry={() => me.refetch()}
          />
        ) : isWaitingForWallet(me) ? (
          <p role="status" className="text-ink-2">
            Setting up your wallet…
          </p>
        ) : (
          <div role="status">
            <span className="sr-only">Loading your account</span>
            <Skeleton className="h-6 w-56" />
          </div>
        )}
      </div>
      <Button variant="secondary" className="mt-4" disabled={signingOut} onClick={signOut}>
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>
    </section>
  );
}
