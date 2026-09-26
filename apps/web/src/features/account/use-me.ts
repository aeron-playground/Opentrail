import type { components } from "@repo/api-client";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { isApiError, unwrap } from "../../lib/api";
import { useApi } from "../../lib/api-context";
import { useAuth } from "../auth/auth-context";

export type Me = components["schemas"]["Me"];

export const ME_QUERY_KEY = ["me"] as const;

// Privy creates the wallet right after the first sign-in. Until it exists the API answers
// WALLET_NOT_READY, so ask again every second, for up to 30 seconds.
const WALLET_WAIT_TRIES = 30;
const WALLET_WAIT_MS = 1000;

// The signed-in person's account. The first call creates it.
export function useMe(): UseQueryResult<Me> {
  const api = useApi();
  const { status } = useAuth();
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => unwrap(await api.GET("/v1/me")),
    enabled: status === "signed-in",
    retry: (failures, error) =>
      isApiError(error, "WALLET_NOT_READY") ? failures < WALLET_WAIT_TRIES : failures < 1,
    retryDelay: WALLET_WAIT_MS,
  });
}

// True while the account waits for Privy to create the wallet.
export function isWaitingForWallet(query: UseQueryResult<Me>): boolean {
  return query.isPending && isApiError(query.failureReason, "WALLET_NOT_READY");
}
