import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, users } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { USERNAME_PATTERN } from "@repo/shared";
import { createApp } from "../../app";
import { fakeSolanaAddress } from "../../providers/privy/fake";
import { createUsernameService } from "../../services/usernames";
import { testAppDeps } from "../../testing";

let database: DbHandle;

beforeAll(async () => {
  database = await createTestDb("api");
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.db.delete(users);
});

// No token anywhere: both routes are public.
const testApp = () =>
  createApp(testAppDeps({ usernames: createUsernameService({ db: database.db }) }));

describe("GET /v1/usernames/suggest", () => {
  test("suggests a free name without sign-in", async () => {
    const response = await testApp().request("/v1/usernames/suggest");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { username } = (await response.json()) as { username: string };
    expect(username).toMatch(USERNAME_PATTERN);
  });
});

describe("GET /v1/usernames/{name}/available", () => {
  const check = (name: string) => testApp().request(`/v1/usernames/${name}/available`);

  test("says a free name is available, in lowercase", async () => {
    const response = await check("Maya");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ username: "maya", available: true });
  });

  test("says a name someone has is taken", async () => {
    await database.db.insert(users).values({
      privyDid: "did:privy:maya",
      walletAddress: fakeSolanaAddress(),
      username: "maya",
    });
    expect(await (await check("maya")).json()).toEqual({
      username: "maya",
      available: false,
      reason: "taken",
    });
  });

  test.each([
    ["support", "reserved"],
    ["s0lana", "reserved"],
    ["ab", "invalid"],
    ["maya%20k", "invalid"],
  ])("says %s isn't available: %s", async (name, reason) => {
    const body = (await (await check(name)).json()) as { available: boolean; reason: string };
    expect(body).toMatchObject({ available: false, reason });
  });

  test("answers 400 for a name longer than 64 characters", async () => {
    const response = await check("a".repeat(65));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "VALIDATION_FAILED",
    );
  });
});
