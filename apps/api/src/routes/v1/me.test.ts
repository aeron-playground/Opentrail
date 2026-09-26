import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, users } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { type Logger, REQUEST_ID_HEADER } from "@repo/server";
import { ERRORS, USERNAME_PATTERN } from "@repo/shared";
import { SOL, USDC } from "@repo/solana";
import { createApp } from "../../app";
import { createFakePrivy, type FakePrivy } from "../../providers/privy/fake";
import { createFakeSolana, type FakeSolana } from "../../providers/solana/fake";
import { createBalanceService } from "../../services/balances";
import { createUsernameService } from "../../services/usernames";
import { createUserService } from "../../services/users";
import { capturedLogger, testAppDeps } from "../../testing";

let database: DbHandle;
let privy: FakePrivy;
let solana: FakeSolana;

beforeAll(async () => {
  database = await createTestDb("api");
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.db.delete(users);
  privy = createFakePrivy();
  solana = createFakeSolana();
});

function testApp(logger: Logger = capturedLogger().logger) {
  return createApp(
    testAppDeps({
      logger,
      privy,
      users: createUserService({ db: database.db, privy, logger }),
      usernames: createUsernameService({ db: database.db }),
      balances: createBalanceService({ solana }),
    }),
  );
}

const patchMe = (app: ReturnType<typeof testApp>, token: string, body: unknown) =>
  app.request("/v1/me", {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

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
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "createdAt",
      "id",
      "username",
      "usernameChangeableAt",
      "usernameChosen",
      "walletAddress",
    ]);
    expect(body.walletAddress).toBe(String(person.wallet));
    expect(body.usernameChosen).toBe(false);
    expect(body.usernameChangeableAt).toBeNull();
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

describe("PATCH /v1/me", () => {
  type Me = { username: string; usernameChosen: boolean; usernameChangeableAt: string | null };

  test("answers 401 without a valid token", async () => {
    await expectError(
      await patchMe(testApp(), "fake-token-unknown", { username: "maya" }),
      401,
      "UNAUTHORIZED",
    );
  });

  test("changes the name, marks it chosen and says when it can change again", async () => {
    const person = privy.signIn();
    const app = testApp();
    const before = Date.now();
    const response = await patchMe(app, person.token, { username: "Maya" });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const me = (await response.json()) as Me;
    expect(me.username).toBe("maya");
    expect(me.usernameChosen).toBe(true);
    const wait = new Date(String(me.usernameChangeableAt)).getTime() - before;
    expect(wait).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000);
    expect(wait).toBeLessThan(30 * 24 * 60 * 60 * 1000 + 60_000);

    expect(await (await getMe(app, person.token)).json()).toEqual(me);
  });

  test("keeping the random name marks it chosen", async () => {
    const person = privy.signIn();
    const app = testApp();
    const { username } = (await (await getMe(app, person.token)).json()) as Me;
    const me = (await (await patchMe(app, person.token, { username })).json()) as Me;

    expect(me.username).toBe(username);
    expect(me.usernameChosen).toBe(true);
  });

  test("answers 429 with Retry-After for a second change within 30 days", async () => {
    const person = privy.signIn();
    const app = testApp();
    await patchMe(app, person.token, { username: "maya" });
    const response = await patchMe(app, person.token, { username: "kiran" });

    const retryAfter = Number(response.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(30 * 24 * 60 * 60 - 60);
    expect(retryAfter).toBeLessThanOrEqual(30 * 24 * 60 * 60);
    await expectError(response, 429, "USERNAME_CHANGE_TOO_SOON");
  });

  test("answers 409 USERNAME_TAKEN for someone else's name", async () => {
    const [maya, kiran] = [privy.signIn(), privy.signIn()];
    const app = testApp();
    await patchMe(app, maya.token, { username: "maya" });
    await expectError(await patchMe(app, kiran.token, { username: "maya" }), 409, "USERNAME_TAKEN");
  });

  test("answers 409 USERNAME_RESERVED for a blocked name or a look-alike", async () => {
    const person = privy.signIn();
    await expectError(
      await patchMe(testApp(), person.token, { username: "adm1n" }),
      409,
      "USERNAME_RESERVED",
    );
  });

  test.each([
    ["a name that breaks the format", { username: "no spaces" }],
    ["a missing name", {}],
    ["a name that isn't text", { username: 42 }],
  ])("answers 400 for %s", async (_, body) => {
    const person = privy.signIn();
    await expectError(await patchMe(testApp(), person.token, body), 400, "VALIDATION_FAILED");
  });

  test("ignores a wallet address sent by the client", async () => {
    const person = privy.signIn();
    const response = await patchMe(testApp(), person.token, {
      username: "maya",
      walletAddress: "SomeoneElsesWallet1111111111111111111111111",
    });
    expect(((await response.json()) as { walletAddress: string }).walletAddress).toBe(
      String(person.wallet),
    );
  });
});

describe("GET /v1/me/balances", () => {
  const getBalances = (app: ReturnType<typeof testApp>, token?: string) =>
    app.request(
      "/v1/me/balances",
      token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } },
    );

  test("answers 401 without a token", async () => {
    await expectError(await getBalances(testApp()), 401, "UNAUTHORIZED");
  });

  test("gives USDC and SOL for the person's own wallet, as exact strings", async () => {
    const person = privy.signIn();
    const wallet = String(person.wallet);
    solana.setToken(wallet, USDC.mint, 50_000_000n);
    solana.setSol(wallet, 20_000_000n);
    const response = await getBalances(testApp(), person.token);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { balances: unknown[]; updatedAt: string };
    expect(body.balances).toEqual([
      { token: { mint: USDC.mint, symbol: "USDC", decimals: 6 }, amountRaw: "50000000" },
      { token: { mint: SOL.mint, symbol: "SOL", decimals: 9 }, amountRaw: "20000000" },
    ]);
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
  });

  test("never shows someone else's wallet", async () => {
    const [maya, kiran] = [privy.signIn(), privy.signIn()];
    solana.setSol(String(maya.wallet), 7n);
    const response = await getBalances(testApp(), kiran.token);
    const body = (await response.json()) as { balances: { amountRaw: string }[] };

    expect(body.balances.map((balance) => balance.amountRaw)).toEqual(["0", "0"]);
  });

  test("answers 500 with the generic message when Solana can't be read", async () => {
    const person = privy.signIn();
    solana.fail(new Error("RPC down"));
    await expectError(await getBalances(testApp(), person.token), 500, "INTERNAL");
  });
});
