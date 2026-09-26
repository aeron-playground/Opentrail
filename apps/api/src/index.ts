// Starts the API: `bun run dev` locally, `bun run start` in production.
import { createDb } from "@repo/db";
import { createLogger } from "@repo/server";
import { WS_PING_INTERVAL_MS } from "@repo/shared/ws";
import { createApp } from "./app";
import { type ApiEnv, readApiEnv } from "./env";
import { createPrivy } from "./providers/privy/privy";
import { createSolanaReader } from "./providers/solana/rpc";
import { serveOptions } from "./server";
import { createBalanceService } from "./services/balances";
import { createUsernameService } from "./services/usernames";
import { createUserService } from "./services/users";
import { createHub } from "./ws/hub";
import { forwardBalanceChanges } from "./ws/listen";

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
const users = createUserService({ db: database.db, privy, logger });
const app = createApp({
  logger,
  corsOrigins: env.CORS_ORIGINS,
  checkDatabase: database.ping,
  privy,
  users,
  usernames: createUsernameService({ db: database.db }),
  balances: createBalanceService({ solana: createSolanaReader({ url: env.SOLANA_RPC_URL }) }),
});
const hub = createHub({
  privy,
  userIdFor: async (privyDid) => (await users.getOrCreate(privyDid)).id,
  logger,
});
const heartbeat = setInterval(hub.heartbeat, WS_PING_INTERVAL_MS);
const stopListening = await forwardBalanceChanges({ listen: database.listen, hub, logger });
const server = Bun.serve(serveOptions({ app, hub, port: env.PORT }));
logger.info({ port: server.port }, "API started");

// Hosts send SIGTERM before they replace the process: tell live connections to come back later,
// finish open requests, then close the pool.
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "API stopping");
  clearInterval(heartbeat);
  hub.closeAll();
  await stopListening();
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
