// Writes the API contract snapshot. Run `bun run openapi` from the repo root, which also
// regenerates the client types from it.
import { createApp } from "./app";
import { createLogger } from "./lib/logger";
import { renderOpenApi, SNAPSHOT_PATH } from "./openapi";

// The document only describes the routes, so it needs no database and no settings.
const app = createApp({
  logger: createLogger("silent"),
  corsOrigins: [],
  checkDatabase: async () => {},
});

await Bun.write(SNAPSHOT_PATH, await renderOpenApi(app));
console.log(`Wrote ${SNAPSHOT_PATH}`);
