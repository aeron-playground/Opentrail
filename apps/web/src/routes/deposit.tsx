import { createFileRoute } from "@tanstack/react-router";
import { RequireSignIn } from "../features/auth/require-sign-in";
import { DepositPage } from "../features/wallet/deposit-page";

export const Route = createFileRoute("/deposit")({
  component: () => (
    <RequireSignIn title="Add funds" reason="to see where to send your funds">
      <DepositPage />
    </RequireSignIn>
  ),
});
