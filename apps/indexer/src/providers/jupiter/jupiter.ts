import { parseDecimal, plainDecimal, sumDecimals } from "@repo/pnl";
import { parseJsonKeepingNumbers, type RateLimit } from "@repo/server";
import { z } from "zod";
import type { JupiterPrices, JupiterTokens, PriceQuote, TokenMarket } from "./types";

// With a key, Jupiter's API. Without one, its keyless address, which Jupiter plans to retire, so
// production sets a key.
const KEYED_URL = "https://api.jup.ag";
const KEYLESS_URL = "https://lite-api.jup.ag";
const TIMEOUT_MS = 10_000;
// Jupiter's limit for one price call.
export const MAX_IDS_PER_CALL = 50;

// Numbers arrive as their original text (see readJson), so they're strings here.
const PricesSchema = z.record(
  z.string(),
  z.object({ usdPrice: z.string(), priceChange24h: z.string().nullish() }),
);

// Only the fields the safety job reads; numbers arrive as their original text.
const TokensSchema = z.array(
  z.object({
    id: z.string(),
    isVerified: z.boolean().nullish(),
    liquidity: z.string().nullish(),
    mcap: z.string().nullish(),
    stats24h: z
      .object({ buyVolume: z.string().nullish(), sellVolume: z.string().nullish() })
      .nullish(),
  }),
);

export type JupiterOptions = {
  apiKey?: string;
  // Shared by every Jupiter call in the indexer.
  rateLimit: RateLimit;
  // Tests answer in place of Jupiter.
  fetch?: (request: Request) => Promise<Response>;
};

// One GET to Jupiter, through the shared rate limit, answered with numbers kept as text. `what`
// names the call in errors, which never show the address or the key.
async function jupiterGet(
  { apiKey, rateLimit, fetch: send = fetch }: JupiterOptions,
  path: string,
  what: string,
): Promise<unknown> {
  const base = apiKey ? KEYED_URL : KEYLESS_URL;
  let response: Response;
  try {
    // Built inside the queue, so the timeout starts when the call does, not while it waits.
    response = await rateLimit(() =>
      send(
        new Request(`${base}${path}`, {
          // A header, never the address, so no error message can show the key.
          headers: apiKey ? { "x-api-key": apiKey } : {},
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }),
      ),
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    throw new Error(`Jupiter ${what} didn't answer (${name})`);
  }
  if (!response.ok) {
    throw new Error(`Jupiter ${what} answered ${response.status}`);
  }
  return parseJsonKeepingNumbers(await response.text());
}

export function createJupiterPrices(options: JupiterOptions): JupiterPrices {
  return {
    async getPrices(mints) {
      const prices = new Map<string, PriceQuote>();
      for (let start = 0; start < mints.length; start += MAX_IDS_PER_CALL) {
        const ids = mints.slice(start, start + MAX_IDS_PER_CALL);
        const answer = await jupiterGet(options, `/price/v3?ids=${ids.join(",")}`, "prices");
        const parsed = PricesSchema.safeParse(answer);
        if (!parsed.success) {
          throw new Error("Jupiter answered prices in a shape we don't know");
        }
        for (const mint of ids) {
          const quote =
            parsed.data[mint] &&
            toQuote(parsed.data[mint].usdPrice, parsed.data[mint].priceChange24h);
          if (quote) {
            prices.set(mint, quote);
          }
        }
      }
      return prices;
    },
  };
}

// Jupiter's token search takes several mints at once, comma-separated.
export function createJupiterTokens(options: JupiterOptions): JupiterTokens {
  return {
    async getTokens(mints) {
      const tokens = new Map<string, TokenMarket>();
      for (let start = 0; start < mints.length; start += MAX_IDS_PER_CALL) {
        const ids = mints.slice(start, start + MAX_IDS_PER_CALL);
        const answer = await jupiterGet(
          options,
          `/tokens/v2/search?query=${ids.join(",")}`,
          "tokens",
        );
        const parsed = TokensSchema.safeParse(answer);
        if (!parsed.success) {
          throw new Error("Jupiter answered tokens in a shape we don't know");
        }
        for (const token of parsed.data) {
          // A search can find more than was asked for; only the exact mints count.
          if (ids.includes(token.id)) {
            const buy = dollarsOrNull(token.stats24h?.buyVolume);
            const sell = dollarsOrNull(token.stats24h?.sellVolume);
            tokens.set(token.id, {
              isVerified: token.isVerified === true,
              liquidityUsd: dollarsOrNull(token.liquidity),
              marketCapUsd: dollarsOrNull(token.mcap),
              volume24hUsd: buy === null || sell === null ? null : sumDecimals([buy, sell]),
            });
          }
        }
      }
      return tokens;
    },
  };
}

// An amount of dollars Jupiter sent, as plain decimal text; below zero or unreadable, none.
function dollarsOrNull(text: string | null | undefined): string | null {
  const value = text == null ? null : decimalOrNull(text);
  return value === null || value.startsWith("-") ? null : value;
}

// A price that isn't a number above zero counts as no reliable price, like one Jupiter omits.
function toQuote(usdPrice: string, change: string | null | undefined): PriceQuote | null {
  const priceUsd = decimalOrNull(usdPrice);
  if (priceUsd === null || priceUsd.startsWith("-") || parseDecimal(priceUsd).digits === 0n) {
    return null;
  }
  return { priceUsd, change24hPct: change == null ? null : decimalOrNull(change) };
}

function decimalOrNull(text: string): string | null {
  try {
    return plainDecimal(text);
  } catch {
    return null;
  }
}
