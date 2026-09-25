import { Link } from "@tanstack/react-router";
import { buttonVariants } from "../../components/ui/button";

export function LandingPage() {
  return (
    <section className="mx-auto max-w-feed px-4 py-10">
      <h1 className="font-condensed font-semibold text-title">
        See what people are trading. Trade it yourself.
      </h1>
      <p className="mt-3 text-ink-2">
        Your keys stay with you, every trade costs 0.1%, and the code is open source.
      </p>
      <Link to="/explore" className={buttonVariants({ className: "mt-6" })}>
        Explore tokens
      </Link>
    </section>
  );
}
