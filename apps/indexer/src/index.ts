// Starts the indexer: `bun run dev` locally, `bun run start` in production.
import { createDb } from "@repo/db";
import { createLogger } from "@repo/server";
import { createApp } from "./app";
import { createChartBook } from "./chart-book";
import { type IndexerEnv, readIndexerEnv } from "./env";
import { createInbox } from "./inbox";
import { cleanupJob } from "./jobs/cleanup";
import { processInboxJob } from "./jobs/process-inbox";
import { CANDLES_EVERY_MS, refreshCandlesJob } from "./jobs/refresh-candles";
import { refreshPoolsJob } from "./jobs/refresh-pools";
import { refreshPricesJob } from "./jobs/refresh-prices";
import { refreshTokenSafetyJob } from "./jobs/refresh-token-safety";
import { createScheduler, type Job } from "./jobs/scheduler";
import { syncWebhookAddressesJob } from "./jobs/sync-webhook-addresses";
import { createRateLimit } from "./lib/rate-limit";
import { createPriceBook } from "./price-book";
import { createGeckoTerminal } from "./providers/geckoterminal/geckoterminal";
import { createHeliusWebhooks } from "./providers/helius/helius";
import { createJupiterPrices, createJupiterTokens } from "./providers/jupiter/jupiter";
import { createSolanaMints } from "./providers/solana/solana";
import { createSafetyBook } from "./safety-book";
import { createWatchList } from "./watch-list";

let env: IndexerEnv;
try {
  env = readIndexerEnv();
} catch (error) {
  // The message says what to fix; a stack trace would only bury it.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const logger = createLogger(env.LOG_LEVEL);
const database = createDb(env.DATABASE_URL);
const inbox = createInbox(database.db);
const app = createApp({ logger, inbox, webhookSecret: env.HELIUS_WEBHOOK_SECRET });
const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
// Jupiter's free plan allows one request a second, across every Jupiter call we make.
const jupiterRateLimit = createRateLimit(1_000);
const jupiterOptions = { apiKey: env.JUPITER_API_KEY, rateLimit: jupiterRateLimit };
const jupiter = createJupiterPrices(jupiterOptions);
if (env.JUPITER_API_KEY === undefined) {
  logger.info("Prices come from Jupiter's keyless address: set JUPITER_API_KEY for production");
}
// GeckoTerminal's free API allows about 10 calls a minute, but it varies: one every 15 seconds.
const gecko = createGeckoTerminal({
  baseUrl: env.GECKOTERMINAL_BASE_URL,
  rateLimit: createRateLimit(CANDLES_EVERY_MS),
});
const chartBook = createChartBook(database.db);
const jobs: Job[] = [
  cleanupJob({ inbox, chartBook, logger }),
  processInboxJob({ inbox, logger }),
  refreshPricesJob({ priceBook: createPriceBook(database.db), jupiter, logger }),
  refreshPoolsJob({ chartBook, gecko, logger }),
  refreshCandlesJob({ chartBook, gecko, logger }),
  refreshTokenSafetyJob({
    safetyBook: createSafetyBook(database.db),
    jupiter: createJupiterTokens(jupiterOptions),
    solana: createSolanaMints({ rpcUrl: env.SOLANA_RPC_URL }),
    logger,
  }),
];
if (env.HELIUS_API_KEY !== undefined && env.HELIUS_WEBHOOK_ID !== undefined) {
  const helius = createHeliusWebhooks({
    apiKey: env.HELIUS_API_KEY,
    webhookId: env.HELIUS_WEBHOOK_ID,
  });
  jobs.push(syncWebhookAddressesJob({ watchList: createWatchList(database.db), helius, logger }));
} else {
  // Fine locally: Helius can't reach this computer anyway.
  logger.info("Helius address sync is off: HELIUS_API_KEY and HELIUS_WEBHOOK_ID aren't set");
}
const scheduler = createScheduler(jobs, logger);
scheduler.start();
logger.info({ port: server.port }, "indexer started");

// Hosts send SIGTERM before they replace the process: stop taking requests, let running jobs
// finish, then close the pool.
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "indexer stopping");
  await server.stop();
  await scheduler.stop();
  await database.close();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    shutdown(signal).catch((error: unknown) => {
      logger.error({ err: error }, "indexer did not stop cleanly");
      process.exit(1);
    });
  });
}
