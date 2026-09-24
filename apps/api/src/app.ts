import type { Logger } from "./lib/logger";
import { createRouter } from "./lib/router";
import { requestId } from "./middleware/request-id";
import { requestLog } from "./middleware/request-log";

export type AppDeps = {
  logger: Logger;
};

export type App = ReturnType<typeof createApp>;

// Builds the app from its dependencies and reads no settings itself, so tests can build one
// with fakes.
export function createApp({ logger }: AppDeps) {
  const app = createRouter();
  app.use(requestId(), requestLog(logger));
  return app;
}
