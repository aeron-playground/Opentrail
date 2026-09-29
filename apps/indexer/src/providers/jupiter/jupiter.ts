import { parseDecimal, plainDecimal } from "@repo/pnl";
import { z } from "zod";
import type { RateLimit } from "../../lib/rate-limit";
import type { JupiterPrices, PriceQuote } from "./types";

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

export type JupiterOptions = {
  apiKey?: string;
  // Shared by every Jupiter call in the indexer.
  rateLimit: RateLimit;
  // Tests answer in place of Jupiter.
  fetch?: (request: Request) => Promise<Response>;
};

export function createJupiterPrices({
  apiKey,
  rateLimit,
  fetch: send = fetch,
}: JupiterOptions): JupiterPrices {
  const base = apiKey ? KEYED_URL : KEYLESS_URL;

  async function call(ids: readonly string[]): Promise<unknown> {
    let response: Response;
    try {
      // Built inside the queue, so the timeout starts when the call does, not while it waits.
      response = await rateLimit(() =>
        send(
          new Request(`${base}/price/v3?ids=${ids.join(",")}`, {
            // A header, never the address, so no error message can show the key.
            headers: apiKey ? { "x-api-key": apiKey } : {},
            signal: AbortSignal.timeout(TIMEOUT_MS),
          }),
        ),
      );
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      throw new Error(`Jupiter prices didn't answer (${name})`);
    }
    if (!response.ok) {
      throw new Error(`Jupiter prices answered ${response.status}`);
    }
    return readJson(await response.text());
  }

  return {
    async getPrices(mints) {
      const prices = new Map<string, PriceQuote>();
      for (let start = 0; start < mints.length; start += MAX_IDS_PER_CALL) {
        const ids = mints.slice(start, start + MAX_IDS_PER_CALL);
        const parsed = PricesSchema.safeParse(await call(ids));
        if (!parsed.success) {
          throw new Error("Jupiter answered prices in a shape we don't know");
        }
        for (const mint of ids) {
          const answer = parsed.data[mint];
          const quote = answer && toQuote(answer.usdPrice, answer.priceChange24h);
          if (quote) {
            prices.set(mint, quote);
          }
        }
      }
      return prices;
    },
  };
}

// JSON.parse hands the reviver each number's original text, so a price keeps every digit Jupiter
// sent instead of becoming a float first.
function readJson(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) =>
    typeof value === "number" && context?.source !== undefined ? context.source : value,
  );
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
