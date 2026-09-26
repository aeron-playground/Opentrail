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

const CREATED_AT = new Date("2026-09-26T10:00:00.000Z");

function fakeUser(privyDid: string, overrides: Partial<User> = {}): User {
  return {
    id: Bun.randomUUIDv7(),
    privyDid,
    walletAddress: fakeSolanaAddress(),
    username: "calm_otter_42",
    usernameChangedAt: null,
    status: "active",
    webhookRegisteredAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    ...overrides,
  };
}

test("reads the signed-in account through the typed client", async () => {
  const privy = createFakePrivy();
  const person = privy.signIn();
  const user = fakeUser(person.privyDid);
  const client = clientFor({ privy, users: { getOrCreate: async () => user } });

  const { data, response } = await client.GET("/v1/me", {
    headers: { Authorization: `Bearer ${person.token}` },
  });
  expect(response.status).toBe(200);
  expect(data).toEqual({
    id: user.id,
    username: "calm_otter_42",
    usernameChosen: false,
    usernameChangeableAt: null,
    walletAddress: user.walletAddress,
    createdAt: "2026-09-26T10:00:00.000Z",
  });
});

test("changes the username through the typed client", async () => {
  const privy = createFakePrivy();
  const person = privy.signIn();
  const user = fakeUser(person.privyDid);
  const changeableAt = new Date("2026-10-26T10:00:00.000Z");
  const client = clientFor({
    privy,
    users: { getOrCreate: async () => user },
    usernames: {
      ...testAppDeps().usernames,
      change: async (current, username) => ({
        ...current,
        username,
        usernameChangedAt: CREATED_AT,
      }),
      changeableAt: () => changeableAt,
    },
  });

  const { data, response } = await client.PATCH("/v1/me", {
    headers: { Authorization: `Bearer ${person.token}` },
    body: { username: "maya" },
  });
  expect(response.status).toBe(200);
  expect(data?.username).toBe("maya");
  expect(data?.usernameChosen).toBe(true);
  expect(data?.usernameChangeableAt).toBe("2026-10-26T10:00:00.000Z");
});

test("checks a username through the typed client", async () => {
  const client = clientFor({
    usernames: {
      ...testAppDeps().usernames,
      availability: async () => ({ available: false, reason: "taken" }),
    },
  });

  const { data } = await client.GET("/v1/usernames/{name}/available", {
    params: { path: { name: "Maya" } },
  });
  expect(data).toEqual({ username: "maya", available: false, reason: "taken" });
});

test("gets a missing sign-in as a typed error", async () => {
  const { error, response } = await clientFor({}).GET("/v1/me");
  expect(response.status).toBe(401);
  expect(error?.error.code).toBe("UNAUTHORIZED");
});
