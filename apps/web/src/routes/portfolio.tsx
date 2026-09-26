import { createFileRoute } from "@tanstack/react-router";
import { RequireSignIn } from "../features/auth/require-sign-in";
import { PortfolioPage } from "../features/portfolio/portfolio-page";

export const Route = createFileRoute("/portfolio")({
  component: () => (
    <RequireSignIn title="Portfolio" reason="to see your holdings and results">
      <PortfolioPage />
    </RequireSignIn>
  ),
});
