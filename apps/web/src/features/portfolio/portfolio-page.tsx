import { Link } from "@tanstack/react-router";
import { Page } from "../../components/common/page";
import { buttonVariants } from "../../components/ui/button";

// Add funds sits in this header because the phone tabs have no room for it.
export function PortfolioPage() {
  return (
    <Page
      title="Portfolio"
      action={
        <Link to="/deposit" className={buttonVariants({ variant: "secondary" })}>
          Add funds
        </Link>
      }
    >
      <p className="mt-3 text-ink-2">Your holdings, cash and results will show here.</p>
    </Page>
  );
}
