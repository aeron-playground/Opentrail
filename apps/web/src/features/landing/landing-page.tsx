import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "../../components/ui/button";
import { useAuth } from "../auth/auth-context";
import { useSignIn } from "../auth/sign-in";

export function LandingPage() {
  const { status } = useAuth();
  const { openSignIn } = useSignIn();
  // Signed-in people already have an account; while sign-in loads, the button can wait.
  const canCreateAccount = status === "signed-out" || status === "unavailable";
  return (
    <section className="mx-auto max-w-feed px-4 py-10">
      <h1 className="font-condensed font-semibold text-title">
        See what people are trading. Trade it yourself.
      </h1>
      <p className="mt-3 text-ink-2">
        Your keys stay with you, every trade costs 0.1%, and the code is open source.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {canCreateAccount && <Button onClick={openSignIn}>Create account</Button>}
        <Link
          to="/explore"
          className={buttonVariants({ variant: canCreateAccount ? "secondary" : "primary" })}
        >
          Explore tokens
        </Link>
      </div>
    </section>
  );
}
