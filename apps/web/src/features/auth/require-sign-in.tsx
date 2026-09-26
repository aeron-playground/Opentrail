import type { ReactNode } from "react";
import { PendingPage } from "../../app/pending-page";
import { EmptyState } from "../../components/common/empty-state";
import { Page } from "../../components/common/page";
import { Button } from "../../components/ui/button";
import { useAuth } from "./auth-context";
import { SIGN_IN_UNAVAILABLE, useSignIn } from "./sign-in";

type RequireSignInProps = {
  // The page's own title, so the heading stays the same before and after sign-in.
  title: string;
  // Finishes "Sign in …", such as "to see your holdings and results".
  reason: string;
  children: ReactNode;
};

// Shows the page to signed-in people. Everyone else sees why to sign in, and a way to do it.
export function RequireSignIn({ title, reason, children }: RequireSignInProps) {
  const { status } = useAuth();
  const { openSignIn } = useSignIn();

  if (status === "signed-in") {
    return children;
  }
  if (status === "loading") {
    return <PendingPage />;
  }
  return (
    <Page title={title}>
      {status === "unavailable" ? (
        <EmptyState message={SIGN_IN_UNAVAILABLE} />
      ) : (
        <EmptyState
          message={`Sign in ${reason}.`}
          action={<Button onClick={openSignIn}>Sign in</Button>}
        />
      )}
    </Page>
  );
}
