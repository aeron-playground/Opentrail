// Starts the indexer: `bun run dev` locally, `bun run start` in production.
import { createDb } from "@repo/db";
import { createLogger } from "@repo/server";
import { createApp } from "./app";
import { type IndexerEnv, readIndexerEnv } from "./env";
import { createInbox } from "./inbox";
import { cleanupJob } from "./jobs/cleanup";
import { createScheduler } from "./jobs/scheduler";

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
const scheduler = createScheduler([cleanupJob({ inbox, logger })], logger);
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
