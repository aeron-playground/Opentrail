import type { components } from "@repo/api-client";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { unwrap } from "../../lib/api";
import { useApi } from "../../lib/api-context";
import { CHART_RANGES, type ChartRange } from "./chart-ranges";
import { candlesQueryKey } from "./query-keys";

export type Candle = components["schemas"]["Candle"];

// The indexer adds candles every few minutes; in between, the live price moves the newest point.
const REFRESH_MS = 60_000;

// A token's candles for one chart range, oldest first.
export function useCandles(mint: string, range: ChartRange): UseQueryResult<Candle[]> {
  const api = useApi();
  return useQuery({
    queryKey: candlesQueryKey(mint, range),
    queryFn: async () => {
      const list = unwrap(
        await api.GET("/v1/tokens/{mint}/candles", {
          params: { path: { mint }, query: { tf: CHART_RANGES[range].timeframe } },
        }),
      );
      return list.items;
    },
    meta: { public: true },
    refetchInterval: REFRESH_MS,
  });
}
