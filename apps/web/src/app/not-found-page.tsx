import { Link } from "@tanstack/react-router";
import { EmptyState } from "../components/common/empty-state";
import { Page } from "../components/common/page";
import { buttonVariants } from "../components/ui/button";

export function NotFoundPage() {
  return (
    <Page title="Page not found">
      <EmptyState
        message="We couldn't find that page. Check the address, or start again from the home page."
        action={
          <Link to="/" className={buttonVariants()}>
            Go to the home page
          </Link>
        }
      />
    </Page>
  );
}
