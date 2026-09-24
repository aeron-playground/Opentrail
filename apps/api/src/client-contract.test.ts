import { expect, test } from "bun:test";
import { createApiClient } from "@repo/api-client";
import { createLogger } from "@repo/server";
import { createApp } from "./app";

// The generated client talks to the real app in memory: no network, same contract.
function clientFor(checkDatabase: () => Promise<void>) {
  const app = createApp({ logger: createLogger("silent"), corsOrigins: [], checkDatabase });
  return createApiClient("http://api.test", {
    fetch: async (request) => app.fetch(request),
  });
}

test("reads a healthy API through the typed client", async () => {
  const { data, error, response } = await clientFor(async () => {}).GET("/v1/health");
  expect(response.status).toBe(200);
  expect(error).toBeUndefined();
  expect(data?.checks.database).toBe("ok");
});

test("gets the typed body of a 503 as the error", async () => {
  const { data, error, response } = await clientFor(() => Promise.reject(new Error("down"))).GET(
    "/v1/health",
  );
  expect(response.status).toBe(503);
  expect(data).toBeUndefined();
  expect(error?.checks.database).toBe("down");
});
