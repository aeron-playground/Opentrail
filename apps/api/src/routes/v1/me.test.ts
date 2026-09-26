import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, users } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { type Logger, REQUEST_ID_HEADER } from "@repo/server";
import { ERRORS, USERNAME_PATTERN } from "@repo/shared";
import { createApp } from "../../app";
import { createFakePrivy, type FakePrivy } from "../../providers/privy/fake";
import { createUserService } from "../../services/users";
import { capturedLogger, testAppDeps } from "../../testing";

let database: DbHandle;
let privy: FakePrivy;

beforeAll(async () => {
  database = await createTestDb("api");
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.db.delete(users);
  privy = createFakePrivy();
});

function testApp(logger: Logger = capturedLogger().logger) {
  return createApp(
    testAppDeps({
      logger,
      privy,
      users: createUserService({ db: database.db, privy, logger }),
    }),
  );
}

const getMe = (app: ReturnType<typeof testApp>, token?: string) =>
  app.request(
    "/v1/me",
    token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } },
  );

async function expectError(response: Response, status: number, code: keyof typeof ERRORS) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({
    error: {
      code,
      message: ERRORS[code].message,
      requestId: String(response.headers.get(REQUEST_ID_HEADER)),
    },
  });
}

describe("GET /v1/me", () => {
  test("answers 401 without a token", async () => {
    await expectError(await getMe(testApp()), 401, "UNAUTHORIZED");
  });

  test("answers 401 for a token Privy didn't issue", async () => {
    await expectError(await getMe(testApp(), "fake-token-unknown"), 401, "UNAUTHORIZED");
    expect(await database.db.query.users.findMany()).toHaveLength(0);
  });

  test("creates the account on the first call and returns it", async () => {
    const person = privy.signIn();
    const response = await getMe(testApp(), person.token);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as Record<string, string>;
    expect(Object.keys(body).sort()).toEqual(["createdAt", "id", "username", "walletAddress"]);
    expect(body.walletAddress).toBe(String(person.wallet));
    expect(body.username).toMatch(USERNAME_PATTERN);
    expect(new Date(String(body.createdAt)).toISOString()).toBe(String(body.createdAt));

    const [saved] = await database.db.query.users.findMany();
    expect(saved?.id).toBe(String(body.id));
    expect(saved?.privyDid).toBe(person.privyDid);
  });

  test("returns the same account on later calls", async () => {
    const person = privy.signIn();
    const app = testApp();
    const first = await (await getMe(app, person.token)).json();
    const second = await (await getMe(app, person.token)).json();

    expect(second).toEqual(first);
    expect(privy.walletReads).toBe(1);
  });

  test("answers 409 WALLET_NOT_READY while Privy is still creating the wallet", async () => {
    const person = privy.signIn({ wallet: null });
    await expectError(await getMe(testApp(), person.token), 409, "WALLET_NOT_READY");
  });

  test("answers 500 with the generic message when Privy fails", async () => {
    const person = privy.signIn();
    privy.failWalletReads(new Error("Privy is down at 10.0.0.1"));
    const response = await getMe(testApp(), person.token);

    await expectError(response, 500, "INTERNAL");
  });

  test("never writes the token to the logs", async () => {
    const { logger, lines } = capturedLogger();
    const app = testApp(logger);
    const person = privy.signIn();
    await getMe(app, person.token);
    await getMe(app, "fake-token-that-is-not-valid");

    const logged = JSON.stringify(lines);
    expect(lines.filter((line) => line.msg === "request")).toHaveLength(2);
    expect(logged).not.toContain(person.token);
    expect(logged).not.toContain("fake-token-that-is-not-valid");
  });
});
