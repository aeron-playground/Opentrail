import type { Logger } from "@repo/server";
import type { ChartBook } from "../chart-book";
import { choosePrimaryPool } from "../market/primary-pool";
import { type GeckoTerminal, RateLimitedError } from "../providers/geckoterminal/types";
import type { Job } from "./scheduler";

// Runs hourly, so a check that failed is tried again soon, but checks each token once a day.
export const POOLS_EVERY_MS = 60 * 60 * 1000;
export const POOL_RECHECK_MS = 24 * 60 * 60 * 1000;

export type RefreshPoolsDeps = {
  chartBook: Pick<ChartBook, "listedTokens" | "setPrimaryPool">;
  gecko: Pick<GeckoTerminal, "pools">;
  logger: Logger;
  now?: () => number;
};

// Keeps each listed token's main pool: the most liquid one paired with USDC or SOL. With none
// found, the token keeps its pool, so a bad answer from GeckoTerminal never wipes a chart.
export function refreshPoolsJob({
  chartBook,
  gecko,
  logger,
  now = Date.now,
}: RefreshPoolsDeps): Job {
  const checkedAt = new Map<string, number>();
  return {
    name: "refresh-pools",
    everyMs: POOLS_EVERY_MS,
    run: async () => {
      for (const token of await chartBook.listedTokens()) {
        if (now() - (checkedAt.get(token.mint) ?? Number.NEGATIVE_INFINITY) < POOL_RECHECK_MS) {
          continue;
        }
        let pools: Awaited<ReturnType<GeckoTerminal["pools"]>>;
        try {
          pools = await gecko.pools(token.mint);
        } catch (error) {
          if (error instanceof RateLimitedError) {
            logger.warn("GeckoTerminal is rate limiting us; pools are checked again next hour");
            return;
          }
          throw error;
        }
        checkedAt.set(token.mint, now());
        const chosen = choosePrimaryPool(token.mint, pools);
        if (chosen === null) {
          logger.warn({ mint: token.mint }, "no USDC or SOL pool found; the token keeps its pool");
        } else if (chosen !== token.primaryPoolAddress) {
          await chartBook.setPrimaryPool(token.mint, chosen);
          logger.info({ mint: token.mint, pool: chosen }, "main pool chosen");
        }
      }
    },
  };
}
