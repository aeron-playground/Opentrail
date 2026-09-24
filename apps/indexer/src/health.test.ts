import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DbHandle } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { createLogger } from "@repo/server";
import { createApp } from "./app";
import { healthRoute } from "./health";
import { createInbox, type Inbox } from "./inbox";
import { capturedLogger } from "./testing";

let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb("indexer");
});

afterAll(async () => {
  await handle.close();
});

const failingInbox: Inbox = { stats: () => Promise.reject(new Error("connection refused")) };
const hangingInbox: Inbox = { stats: () => new Promise(() => {}) };

describe("GET /health", () => {
  test("answers 200 with the inbox numbers when the database answers", async () => {
    const app = createApp({ logger: createLogger("silent"), inbox: createInbox(handle.db) });
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { database: "ok" },
      inbox: { pending: 0, oldestPendingSeconds: null },
    });
  });

  test("answers 503 and logs a warning when the database fails", async () => {
    const { logger, lines } = capturedLogger();
    const response = await createApp({ logger, inbox: failingInbox }).request("/health");

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "error",
      checks: { database: "down" },
      inbox: null,
    });
    expect(lines.find((line) => line.msg === "database health check failed")).toMatchObject({
      level: "warn",
      err: { message: "connection refused" },
    });
  });

  test("answers 503 when the database doesn't answer in time", async () => {
    const app = healthRoute({ inbox: hangingInbox, logger: createLogger("silent"), timeoutMs: 10 });
    const response = await app.request("/health");
    expect(response.status).toBe(503);
  });
});
