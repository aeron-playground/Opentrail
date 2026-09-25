import { createFileRoute } from "@tanstack/react-router";
import { DepositPage } from "../features/wallet/deposit-page";

export const Route = createFileRoute("/deposit")({
  component: DepositPage,
});
