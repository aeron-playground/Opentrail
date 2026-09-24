import { afterAll, describe, expect, test } from "bun:test";
import { connectTestDb } from "@repo/db/testing";
import { createApp } from "../../app";
import { createLogger } from "../../lib/logger";
import { createRouter } from "../../lib/router";
import { requestId } from "../../middleware/request-id";
import { healthRoutes } from "./health";

const database = connectTestDb();

afterAll(async () => {
  await database.close();
});

function capturedLogger() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger("info", {
    write: (line) => {
      lines.push(JSON.parse(line));
    },
  });
  return { logger, lines };
}

describe("GET /v1/health", () => {
  test("answers 200 when the database answers", async () => {
    const app = createApp({
      logger: createLogger("silent"),
      corsOrigins: [],
      checkDatabase: database.ping,
    });
    const response = await app.request("/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", checks: { database: "ok" } });
  });

  test("answers 503 and logs a warning when the database fails", async () => {
    const { logger, lines } = capturedLogger();
    const app = createApp({
      logger,
      corsOrigins: [],
      checkDatabase: () => Promise.reject(new Error("connection refused")),
    });
    const response = await app.request("/v1/health");

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "error", checks: { database: "down" } });
    expect(lines.find((line) => line.msg === "database health check failed")).toMatchObject({
      level: "warn",
      err: { message: "connection refused" },
    });
  });

  test("answers 503 when the database doesn't answer in time", async () => {
    const app = createRouter();
    app.use(requestId());
    app.route(
      "/v1",
      healthRoutes({
        checkDatabase: () => new Promise(() => {}),
        logger: createLogger("silent"),
        timeoutMs: 10,
      }),
    );
    const response = await app.request("/v1/health");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "error", checks: { database: "down" } });
  });
});
