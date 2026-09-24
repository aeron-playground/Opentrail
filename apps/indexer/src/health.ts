import { type Logger, type RequestIdEnv, withTimeout } from "@repo/server";
import { Hono } from "hono";
import type { Inbox, InboxStats } from "./inbox";

const DATABASE_TIMEOUT_MS = 2_000;

export type HealthBody =
  | { status: "ok"; checks: { database: "ok" }; inbox: InboxStats }
  | { status: "error"; checks: { database: "down" }; inbox: null };

export type HealthDeps = {
  inbox: Pick<Inbox, "stats">;
  logger: Logger;
  timeoutMs?: number;
};

// Monitors call this. It reports the inbox backlog too. An old backlog doesn't fail the check
// yet: nothing processes the inbox until the processing job exists.
export function healthRoute({ inbox, logger, timeoutMs = DATABASE_TIMEOUT_MS }: HealthDeps) {
  const app = new Hono<RequestIdEnv>();
  app.get("/health", async (c) => {
    // Monitors must always see the live state, never a cached answer.
    c.header("Cache-Control", "no-store");
    try {
      const stats = await withTimeout(inbox.stats(), timeoutMs);
      const body: HealthBody = { status: "ok", checks: { database: "ok" }, inbox: stats };
      return c.json(body, 200);
    } catch (error) {
      logger.warn({ err: error, requestId: c.var.requestId }, "database health check failed");
      const body: HealthBody = { status: "error", checks: { database: "down" }, inbox: null };
      return c.json(body, 503);
    }
  });
  return app;
}
