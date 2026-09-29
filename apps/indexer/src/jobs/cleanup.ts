import type { CandleTimeframe } from "@repo/db";
import type { Logger } from "@repo/server";
import type { ChartBook } from "../chart-book";
import type { Inbox } from "../inbox";
import type { Job } from "./scheduler";

const DAY_MS = 24 * 60 * 60 * 1000;

// Processed webhook events are kept this long, for replays and investigations.
export const RETENTION_DAYS = 30;

// Candles of these timeframes are kept this many days; 4h and 1d candles are kept forever.
export const CANDLE_RETENTION_DAYS: Partial<Record<CandleTimeframe, number>> = {
  "15m": 30,
  "1h": 365,
};

export type CleanupDeps = {
  inbox: Pick<Inbox, "deleteProcessedBefore">;
  chartBook: Pick<ChartBook, "deleteCandlesBefore">;
  logger: Logger;
  now?: () => Date;
};

export function cleanupJob({ inbox, chartBook, logger, now = () => new Date() }: CleanupDeps): Job {
  return {
    name: "cleanup",
    everyMs: DAY_MS,
    run: async () => {
      const cutoff = new Date(now().getTime() - RETENTION_DAYS * DAY_MS);
      const deleted = await inbox.deleteProcessedBefore(cutoff);
      if (deleted > 0) {
        logger.info({ deleted, cutoff }, "old webhook events deleted");
      }
      for (const [timeframe, days] of Object.entries(CANDLE_RETENTION_DAYS)) {
        const candleCutoff = new Date(now().getTime() - days * DAY_MS);
        const candles = await chartBook.deleteCandlesBefore(
          timeframe as CandleTimeframe,
          candleCutoff,
        );
        if (candles > 0) {
          logger.info({ timeframe, deleted: candles, cutoff: candleCutoff }, "old candles deleted");
        }
      }
    },
  };
}
