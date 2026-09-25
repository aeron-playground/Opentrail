import type { ReactNode } from "react";

// The frame of a simple page: the feed column width, the page title and an optional action
// beside it.
export function Page({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-feed px-4 py-8 lg:py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-condensed font-semibold text-title">{title}</h1>
        {action}
      </header>
      {children}
    </section>
  );
}
