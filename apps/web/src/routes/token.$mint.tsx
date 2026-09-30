import { createFileRoute } from "@tanstack/react-router";
import { TokenPage } from "../features/tokens/token-page";

export const Route = createFileRoute("/token/$mint")({
  component: TokenRoute,
});

function TokenRoute() {
  const { mint } = Route.useParams();
  // A new token starts fresh: its own range and loading state.
  return <TokenPage key={mint} mint={mint} />;
}
