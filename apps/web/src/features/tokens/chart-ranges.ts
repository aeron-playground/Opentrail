import type { components } from "@repo/api-client";

type Timeframe = components["schemas"]["CandleList"]["timeframe"];

// Each range reads the candles that give it a smooth line, and the API's default history for that
// timeframe is exactly the range: 1 day of 15-minute candles, 7 days of hourly ones, and so on.
export const CHART_RANGES = {
  "1D": { timeframe: "15m", days: 1, words: "past 24 hours" },
  "1W": { timeframe: "1h", days: 7, words: "past week" },
  "1M": { timeframe: "4h", days: 30, words: "past month" },
  "1Y": { timeframe: "1d", days: 365, words: "past year" },
} as const satisfies Record<string, { timeframe: Timeframe; days: number; words: string }>;

export type ChartRange = keyof typeof CHART_RANGES;
