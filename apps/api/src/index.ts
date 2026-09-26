// Starts the API: `bun run dev` locally, `bun run start` in production.
import { createDb } from "@repo/db";
import { createLogger } from "@repo/server";
import { createApp } from "./app";
import { type ApiEnv, readApiEnv } from "./env";
import { createPrivy } from "./providers/privy/privy";
import { createUsernameService } from "./services/usernames";
import { createUserService } from "./services/users";

let env: ApiEnv;
try {
  env = readApiEnv();
} catch (error) {
  // The message says what to fix; a stack trace would only bury it.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const logger = createLogger(env.LOG_LEVEL);
const database = createDb(env.DATABASE_URL);
const privy = createPrivy({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET });
const app = createApp({
  logger,
  corsOrigins: env.CORS_ORIGINS,
  checkDatabase: database.ping,
  privy,
  users: createUserService({ db: database.db, privy, logger }),
  usernames: createUsernameService({ db: database.db }),
});
const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
logger.info({ port: server.port }, "API started");

// Hosts send SIGTERM before they replace the process: finish open requests, then close the pool.
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "API stopping");
  await server.stop();
  await database.close();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    shutdown(signal).catch((error: unknown) => {
      logger.error({ err: error }, "API did not stop cleanly");
      process.exit(1);
    });
  });
}
