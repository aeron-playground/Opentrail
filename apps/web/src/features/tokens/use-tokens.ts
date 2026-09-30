import type { components } from "@repo/api-client";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { unwrap } from "../../lib/api";
import { useApi } from "../../lib/api-context";
import { TOKENS_QUERY_KEY } from "./query-keys";

export type TokenList = components["schemas"]["TokenList"];
export type TokenListItem = components["schemas"]["TokenListItem"];

// The tradable tokens. Live `price` messages keep their prices fresh in this query's cache.
export function useTokens(): UseQueryResult<TokenList> {
  const api = useApi();
  return useQuery({
    queryKey: TOKENS_QUERY_KEY,
    queryFn: async () => unwrap(await api.GET("/v1/tokens")),
    // The same for everyone, so it stays when someone signs out.
    meta: { public: true },
  });
}
