import { expect, test } from "bun:test";
import { createApiClient } from "@repo/api-client";
import type { User } from "@repo/db";
import { type AppDeps, createApp } from "./app";
import { createFakePrivy, fakeSolanaAddress } from "./providers/privy/fake";
import { testAppDeps } from "./testing";

// The generated client talks to the real app in memory: no network, same contract.
function clientFor(deps: Partial<AppDeps>) {
  const app = createApp(testAppDeps(deps));
  return createApiClient("http://api.test", {
    fetch: async (request) => app.fetch(request),
  });
}

test("reads a healthy API through the typed client", async () => {
  const { data, error, response } = await clientFor({}).GET("/v1/health");
  expect(response.status).toBe(200);
  expect(error).toBeUndefined();
  expect(data?.checks.database).toBe("ok");
});

test("gets the typed body of a 503 as the error", async () => {
  const { data, error, response } = await clientFor({
    checkDatabase: () => Promise.reject(new Error("down")),
  }).GET("/v1/health");
  expect(response.status).toBe(503);
  expect(data).toBeUndefined();
  expect(error?.checks.database).toBe("down");
});

test("reads the signed-in account through the typed client", async () => {
  const privy = createFakePrivy();
  const person = privy.signIn();
  const createdAt = new Date("2026-09-26T10:00:00.000Z");
  const user: User = {
    id: Bun.randomUUIDv7(),
    privyDid: person.privyDid,
    walletAddress: fakeSolanaAddress(),
    username: "calm_otter_42",
    usernameChangedAt: null,
    status: "active",
    webhookRegisteredAt: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  const client = clientFor({ privy, users: { getOrCreate: async () => user } });

  const { data, response } = await client.GET("/v1/me", {
    headers: { Authorization: `Bearer ${person.token}` },
  });
  expect(response.status).toBe(200);
  expect(data).toEqual({
    id: user.id,
    username: "calm_otter_42",
    walletAddress: user.walletAddress,
    createdAt: "2026-09-26T10:00:00.000Z",
  });
});

test("gets a missing sign-in as a typed error", async () => {
  const { error, response } = await clientFor({}).GET("/v1/me");
  expect(response.status).toBe(401);
  expect(error?.error.code).toBe("UNAUTHORIZED");
});
