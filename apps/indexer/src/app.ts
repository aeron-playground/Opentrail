import {
  errorHandler,
  type Logger,
  notFound,
  type RequestIdEnv,
  requestId,
  requestLog,
} from "@repo/server";
import { Hono } from "hono";
import { healthRoute } from "./health";
import type { Inbox } from "./inbox";
import { heliusWebhook } from "./webhooks/helius";

export type AppDeps = {
  logger: Logger;
  inbox: Inbox;
  // Helius sends it in the Authorization header of every delivery.
  webhookSecret: string;
};

export type App = ReturnType<typeof createApp>;

// Builds the app from its dependencies and reads no settings itself, so tests can build one
// with fakes. Only Helius and monitors call the indexer, never browsers, so there's no CORS.
export function createApp({ logger, inbox, webhookSecret }: AppDeps) {
  const app = new Hono<RequestIdEnv>();
  app.use(requestId(), requestLog(logger));
  app.route("/", healthRoute({ inbox, logger }));
  app.route("/", heliusWebhook({ inbox, logger, secret: webhookSecret }));
  app.notFound(notFound);
  app.onError(errorHandler(logger));
  return app;
}
