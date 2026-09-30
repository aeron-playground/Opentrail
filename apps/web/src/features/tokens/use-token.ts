import type { components } from "@repo/api-client";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { isApiError, unwrap } from "../../lib/api";
import { useApi } from "../../lib/api-context";
import { tokenQueryKey } from "./query-keys";

export type TokenDetail = components["schemas"]["TokenDetail"];

// No such token: the mint is unknown, or not an address at all. Asking again won't change that.
export const isUnknownToken = (error: unknown) =>
  isApiError(error, "NOT_FOUND") || isApiError(error, "VALIDATION_FAILED");

// One token. Live `price` messages keep its price fresh in this query's cache too.
export function useToken(mint: string): UseQueryResult<TokenDetail> {
  const api = useApi();
  return useQuery({
    queryKey: tokenQueryKey(mint),
    queryFn: async () => unwrap(await api.GET("/v1/tokens/{mint}", { params: { path: { mint } } })),
    // The same for everyone, so it stays when someone signs out.
    meta: { public: true },
    retry: (failures, error) => !isUnknownToken(error) && failures < 1,
  });
}
