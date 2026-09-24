import type { ReactNode } from "react";

// The frame of a simple page: the feed column width and the page title.
export function Page({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-feed px-4 py-8 lg:py-10">
      <h1 className="font-condensed font-semibold text-title">{title}</h1>
      {children}
    </section>
  );
}
