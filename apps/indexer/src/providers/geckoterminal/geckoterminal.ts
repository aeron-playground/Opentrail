import type { CandleTimeframe } from "@repo/db";
import { parseDecimal, plainDecimal } from "@repo/pnl";
import { z } from "zod";
import { parseJsonKeepingNumbers } from "../../lib/json";
import type { RateLimit } from "../../lib/rate-limit";
import { type CandleQuote, type GeckoTerminal, type Pool, RateLimitedError } from "./types";

export const DEFAULT_BASE_URL = "https://api.geckoterminal.com/api/v2";
// GeckoTerminal's API changes often; naming the version keeps its answers in the shape we read.
const ACCEPT = "application/json;version=20230203";
const TIMEOUT_MS = 10_000;
// GeckoTerminal's limit for one candles call.
export const MAX_CANDLES_PER_CALL = 1_000;

const TIMEFRAMES: Record<CandleTimeframe, { path: "minute" | "hour" | "day"; aggregate: number }> =
  {
    "15m": { path: "minute", aggregate: 15 },
    "1h": { path: "hour", aggregate: 1 },
    "4h": { path: "hour", aggregate: 4 },
    "1d": { path: "day", aggregate: 1 },
  };

// GeckoTerminal names a token "solana_<mint>".
const TokenRef = z.object({ data: z.object({ id: z.string().startsWith("solana_") }) });
const PoolsSchema = z.object({
  data: z.array(
    z.object({
      attributes: z.object({ address: z.string(), reserve_in_usd: z.string().nullable() }),
      relationships: z.object({ base_token: TokenRef, quote_token: TokenRef }),
    }),
  ),
});
// Numbers arrive as their original text (see parseJsonKeepingNumbers), so they're strings here:
// [start in seconds, open, high, low, close, volume].
const OhlcvSchema = z.object({
  data: z.object({
    attributes: z.object({
      ohlcv_list: z.array(
        z.tuple([z.string(), z.string(), z.string(), z.string(), z.string(), z.string()]),
      ),
    }),
  }),
});

export type GeckoTerminalOptions = {
  baseUrl?: string;
  // Shared by every GeckoTerminal call in the indexer.
  rateLimit: RateLimit;
  // Tests answer in place of GeckoTerminal.
  fetch?: (request: Request) => Promise<Response>;
};

export function createGeckoTerminal({
  baseUrl = DEFAULT_BASE_URL,
  rateLimit,
  fetch: send = fetch,
}: GeckoTerminalOptions): GeckoTerminal {
  async function call(path: string): Promise<unknown> {
    let response: Response;
    try {
      // Built inside the queue, so the timeout starts when the call does.
      response = await rateLimit(() =>
        send(
          new Request(`${baseUrl}${path}`, {
            headers: { accept: ACCEPT },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          }),
        ),
      );
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      throw new Error(`GeckoTerminal didn't answer (${name})`);
    }
    if (response.status === 429) {
      throw new RateLimitedError("GeckoTerminal answered 429: too many requests");
    }
    if (!response.ok) {
      throw new Error(`GeckoTerminal answered ${response.status}`);
    }
    return parseJsonKeepingNumbers(await response.text());
  }

  return {
    async pools(mint) {
      const parsed = PoolsSchema.safeParse(await call(`/networks/solana/tokens/${mint}/pools`));
      if (!parsed.success) {
        throw new Error("GeckoTerminal answered pools in a shape we don't know");
      }
      return parsed.data.data.flatMap(({ attributes, relationships }): Pool[] => {
        const liquidityUsd = decimalOrNull(attributes.reserve_in_usd);
        if (liquidityUsd === null) {
          return [];
        }
        return [
          {
            address: attributes.address,
            baseMint: relationships.base_token.data.id.slice("solana_".length),
            quoteMint: relationships.quote_token.data.id.slice("solana_".length),
            liquidityUsd,
          },
        ];
      });
    },

    async candles(pool, mint, timeframe, limit) {
      const { path, aggregate } = TIMEFRAMES[timeframe];
      const query = new URLSearchParams({
        aggregate: String(aggregate),
        limit: String(Math.min(limit, MAX_CANDLES_PER_CALL)),
        currency: "usd",
        token: mint,
      });
      const parsed = OhlcvSchema.safeParse(
        await call(`/networks/solana/pools/${pool}/ohlcv/${path}?${query}`),
      );
      if (!parsed.success) {
        throw new Error("GeckoTerminal answered candles in a shape we don't know");
      }
      return parsed.data.data.attributes.ohlcv_list.flatMap((row) => {
        const candle = toCandle(row);
        return candle ? [candle] : [];
      });
    },
  };
}

// A row that doesn't make sense is skipped, so the database never refuses a whole batch.
function toCandle([start, ...numbers]: readonly string[]): CandleQuote | null {
  const [open, high, low, close, volumeUsd] = numbers.map(decimalOrNull);
  if (!/^\d+$/.test(start ?? "") || !open || !high || !low || !close || !volumeUsd) {
    return null;
  }
  if (volumeUsd.startsWith("-") || [open, high, low, close].some((price) => !isPositive(price))) {
    return null;
  }
  if (compare(high, low) < 0) {
    return null;
  }
  return { bucketStart: new Date(Number(start) * 1000), open, high, low, close, volumeUsd };
}

function decimalOrNull(text: string | null | undefined): string | null {
  if (text == null) {
    return null;
  }
  try {
    return plainDecimal(text);
  } catch {
    return null;
  }
}

const isPositive = (decimal: string) =>
  !decimal.startsWith("-") && parseDecimal(decimal).digits > 0n;

// Compares two non-negative plain decimals exactly.
function compare(a: string, b: string): number {
  const x = parseDecimal(a);
  const y = parseDecimal(b);
  const scale = Math.max(x.scale, y.scale);
  const left = x.digits * 10n ** BigInt(scale - x.scale);
  const right = y.digits * 10n ** BigInt(scale - y.scale);
  return left === right ? 0 : left > right ? 1 : -1;
}
