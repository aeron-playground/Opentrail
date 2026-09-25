import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { ErrorState } from "../components/common/error-state";
import { Page } from "../components/common/page";

// Shown when a page fails to render or load. The error itself stays out of the page: people
// need what happened and what to do, never a stack trace.
export function ErrorPage({ reset }: ErrorComponentProps) {
  const router = useRouter();

  const tryAgain = () => {
    reset();
    // Runs the page's loaders again, so a failed request is retried too.
    void router.invalidate();
  };

  return (
    <Page title="This page didn't load">
      <ErrorState onRetry={tryAgain} />
    </Page>
  );
}
