// Writes the API contract snapshot. Run `bun run openapi` from the repo root, which also
// regenerates the client types from it.

import { createLogger } from "@repo/server";
import { createApp } from "./app";
import { renderOpenApi, SNAPSHOT_PATH } from "./openapi";

// The document only describes the routes, so it needs no database, no Privy and no settings.
const app = createApp({
  logger: createLogger("silent"),
  corsOrigins: [],
  checkDatabase: async () => {},
  privy: { verifyAccessToken: async () => null },
  users: { getOrCreate: () => Promise.reject(new Error("Not available here")) },
  usernames: {
    availability: () => Promise.reject(new Error("Not available here")),
    suggest: () => Promise.reject(new Error("Not available here")),
    change: () => Promise.reject(new Error("Not available here")),
    changeableAt: () => null,
  },
  balances: { forWallet: () => Promise.reject(new Error("Not available here")) },
});

await Bun.write(SNAPSHOT_PATH, await renderOpenApi(app));
console.log(`Wrote ${SNAPSHOT_PATH}`);
