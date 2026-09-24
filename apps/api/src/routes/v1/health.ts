import { createRoute, z } from "@hono/zod-openapi";
import type { Logger } from "@repo/server";
import { createRouter } from "../../lib/router";

const DATABASE_TIMEOUT_MS = 2_000;

const HealthSchema = z
  .object({
    status: z.enum(["ok", "error"]),
    // One entry per dependency, so new checks can be added without breaking clients.
    checks: z.object({
      database: z.enum(["ok", "down"]),
    }),
  })
  .openapi("Health");

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Check that the API and its database are up",
  description: `Answers 503 when the database doesn't respond within ${DATABASE_TIMEOUT_MS / 1000} seconds.`,
  responses: {
    200: {
      description: "The API and the database are up.",
      content: { "application/json": { schema: HealthSchema } },
    },
    503: {
      description: "The database is down or too slow.",
      content: { "application/json": { schema: HealthSchema } },
    },
  },
});

export type HealthDeps = {
  checkDatabase: () => Promise<void>;
  logger: Logger;
  timeoutMs?: number;
};

export function healthRoutes({
  checkDatabase,
  logger,
  timeoutMs = DATABASE_TIMEOUT_MS,
}: HealthDeps) {
  return createRouter().openapi(healthRoute, async (c) => {
    // Monitors must always see the live state, never a cached answer.
    c.header("Cache-Control", "no-store");
    try {
      await withTimeout(checkDatabase(), timeoutMs);
      return c.json({ status: "ok", checks: { database: "ok" } }, 200);
    } catch (error) {
      logger.warn({ err: error, requestId: c.var.requestId }, "database health check failed");
      return c.json({ status: "error", checks: { database: "down" } }, 503);
    }
  });
}

// A hung connection must not hang the health check: monitors need an answer in time.
function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`No answer within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
