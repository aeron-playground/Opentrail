import { expect, test } from "bun:test";
import { Hono } from "hono";
import { createLogger } from "./logger";
import { REQUEST_ID_HEADER, type RequestIdEnv, requestId } from "./request-id";
import { requestLog } from "./request-log";

function testApp() {
  const lines: string[] = [];
  const logger = createLogger("info", { write: (line) => void lines.push(line) });
  const app = new Hono<RequestIdEnv>();
  app.use(requestId(), requestLog(logger));
  app.get("/v1/things/:id", (c) => c.json({ ok: true }, 201));
  return { app, lines };
}

test("logs one line per request with the request id, method, path, status and time", async () => {
  const { app, lines } = testApp();
  const response = await app.request("/v1/things/42");

  expect(lines).toHaveLength(1);
  const entry = JSON.parse(String(lines[0]));
  expect(entry).toMatchObject({
    level: "info",
    msg: "request",
    requestId: response.headers.get(REQUEST_ID_HEADER),
    method: "GET",
    path: "/v1/things/42",
    status: 201,
  });
  expect(entry.durationMs).toBeGreaterThanOrEqual(0);
});

test("never logs query strings, headers or IP addresses", async () => {
  const { app, lines } = testApp();
  await app.request("/v1/things/42?email=maya%40example.com", {
    headers: {
      authorization: "Bearer secret-token",
      cookie: "session=secret-cookie",
      "x-forwarded-for": "203.0.113.7",
      "cf-connecting-ip": "203.0.113.7",
    },
  });

  const line = String(lines[0]);
  expect(line).not.toMatch(/example\.com|secret-token|secret-cookie|203\.0\.113\.7/);
});
