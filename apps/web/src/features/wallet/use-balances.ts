import type { components } from "@repo/api-client";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { unwrap } from "../../lib/api";
import { useApi } from "../../lib/api-context";
import { useAuth } from "../auth/auth-context";

export type Balances = components["schemas"]["Balances"];

export const BALANCES_QUERY_KEY = ["me", "balances"] as const;

// While Add funds is open, ask every 5 seconds: the API serves the same answer for that long.
export const BALANCE_POLL_MS = 5_000;

export function useBalances({ pollMs }: { pollMs?: number } = {}): UseQueryResult<Balances> {
  const api = useApi();
  const { status } = useAuth();
  return useQuery({
    queryKey: BALANCES_QUERY_KEY,
    queryFn: async () => unwrap(await api.GET("/v1/me/balances")),
    enabled: status === "signed-in",
    refetchInterval: pollMs ?? false,
  });
}
