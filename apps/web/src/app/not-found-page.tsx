import { Link } from "@tanstack/react-router";

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-feed px-4 py-10">
      <h1 className="font-condensed font-semibold text-title">Page not found</h1>
      <p className="mt-3 text-ink-2">
        We couldn't find that page. Check the address, or start again from the home page.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-control bg-ink px-4 font-medium text-paper"
      >
        Go to the home page
      </Link>
    </section>
  );
}
