import type { Logger } from "@repo/server";
import type { PriceBook } from "../price-book";
import type { JupiterPrices } from "../providers/jupiter/types";
import type { Job } from "./scheduler";

// One batched call every 15 s is about 4 of Jupiter's 60 allowed calls a minute.
export const PRICES_EVERY_MS = 15_000;

export type RefreshPricesDeps = {
  priceBook: PriceBook;
  jupiter: JupiterPrices;
  logger: Logger;
};

// Asks Jupiter for every listed token's price in one call and saves them. A token Jupiter skips
// keeps its last price; a failed run is logged by the scheduler and tried again next time.
export function refreshPricesJob({ priceBook, jupiter, logger }: RefreshPricesDeps): Job {
  // Warn when the set of unpriced tokens changes, not every 15 seconds.
  let lastMissing = "";
  return {
    name: "refresh-prices",
    everyMs: PRICES_EVERY_MS,
    run: async () => {
      const mints = await priceBook.listedMints();
      if (mints.length === 0) {
        return;
      }
      const quotes = await jupiter.getPrices(mints);
      const missing = mints.filter((mint) => !quotes.has(mint));
      if (missing.join(",") !== lastMissing) {
        lastMissing = missing.join(",");
        if (missing.length > 0) {
          logger.warn(
            { missing },
            "Jupiter has no price for some listed tokens; they keep their last one",
          );
        }
      }
      const changed = await priceBook.save(quotes);
      logger.debug({ priced: quotes.size, changed: changed.length }, "prices refreshed");
    },
  };
}
