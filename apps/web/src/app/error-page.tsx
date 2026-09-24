import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";

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
    <section className="mx-auto max-w-feed px-4 py-10">
      <h1 className="font-condensed font-semibold text-title">This page didn't load</h1>
      <p className="mt-3 text-ink-2">Something went wrong on our side. Try again.</p>
      <button
        type="button"
        onClick={tryAgain}
        className="mt-6 inline-flex min-h-11 items-center rounded-control bg-ink px-4 font-medium text-paper"
      >
        Try again
      </button>
    </section>
  );
}
