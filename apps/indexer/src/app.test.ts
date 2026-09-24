import { expect, test } from "bun:test";
import { createLogger, REQUEST_ID_HEADER } from "@repo/server";
import { createApp } from "./app";
import { fakeInbox, TEST_WEBHOOK_SECRET } from "./testing";

const app = createApp({
  logger: createLogger("silent"),
  inbox: fakeInbox(),
  webhookSecret: TEST_WEBHOOK_SECRET,
});

test("an unknown route answers 404 in the shared error shape, with a request id", async () => {
  const response = await app.request("/nope");
  const requestId = response.headers.get(REQUEST_ID_HEADER);

  expect(response.status).toBe(404);
  expect(requestId).not.toBeNull();
  expect(await response.json()).toEqual({
    error: { code: "NOT_FOUND", message: "We couldn't find that.", requestId },
  });
});

test("sends no CORS headers: browsers never call the indexer", async () => {
  const response = await app.request("/health", { headers: { origin: "https://example.com" } });
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});
