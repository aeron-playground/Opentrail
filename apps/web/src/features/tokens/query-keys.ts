import type { ChartRange } from "./chart-ranges";

// Every token query starts with "tokens", so refreshing that key refreshes them all.
export const TOKENS_QUERY_KEY = ["tokens"] as const;
export const TOKEN_DETAILS_QUERY_KEY = ["tokens", "detail"] as const;

export const tokenQueryKey = (mint: string) => [...TOKEN_DETAILS_QUERY_KEY, mint] as const;
export const candlesQueryKey = (mint: string, range: ChartRange) =>
  ["tokens", "candles", mint, range] as const;
