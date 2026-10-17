import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, users } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { AppError } from "@repo/server";
import { ERRORS, type ErrorCode } from "@repo/shared";
import { USDC } from "@repo/solana";
import { createApp } from "../../app";
import { createFakePrivy, type FakePrivy, fakeSolanaAddress } from "../../providers/privy/fake";
import type { Quote, QuoteRequest, SwapService } from "../../services/swaps";
import { createUserService } from "../../services/users";
import { capturedLogger, testAppDeps } from "../../testing";

const TOKEN = fakeSolanaAddress();

let database: DbHandle;
let privy: FakePrivy;
let asked: QuoteRequest[];
let answer: (request: QuoteRequest) => Promise<Quote>;

beforeAll(async () => {
  database = await createTestDb("api");
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.db.delete(users);
  privy = createFakePrivy();
  asked = [];
  answer = async (request) => ({
    id: "0192b6f0-7c1e-7a3b-9d7e-3f5c1a2b4d6e",
    side: request.side,
    mint: request.mint,
    inputMint: USDC.mint,
    outputMint: request.mint,
    inAmountRaw: request.amountRaw,
    expectedOutRaw: 123_456_789_012_345_678_901n,
    minOutRaw: 123_000_000_000_000_000_000n,
    feeBps: 10,
    feeUsdcMicro: 25_000n,
    slippageBps: request.slippageBps,
    priceImpactBps: 3,
    routeLabel: "Made-up pool",
    providerFeeBps: 0,
    networkFeeLamports: 58_095n,
    transaction: "AQID",
    expiresAt: new Date("2026-10-02T09:00:45.000Z"),
  });
});

function testApp() {
  const { logger } = capturedLogger();
  const swaps: SwapService = {
    quote: (request) => {
      asked.push(request);
      return answer(request);
    },
  };
  return createApp(
    testAppDeps({
      logger,
      privy,
      users: createUserService({ db: database.db, privy, logger }),
      swaps,
    }),
  );
}

const postQuote = (body: unknown, token?: string) =>
  testApp().request("/v1/swaps/quote", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

const BUY = { side: "buy", mint: TOKEN, amountRaw: "25000000" };

async function expectError(response: Response, status: number, code: ErrorCode) {
  expect(response.status).toBe(status);
  const body = (await response.json()) as { error: { code: string; message: string } };
  expect(body.error).toMatchObject({ code, message: ERRORS[code].message });
}

describe("POST /v1/swaps/quote", () => {
  test("quotes for the signed-in wallet, with the default slippage, amounts as strings", async () => {
    const person = privy.signIn();
    const response = await postQuote(BUY, person.token);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(asked).toEqual([
      expect.objectContaining({
        wallet: person.wallet,
        side: "buy",
        mint: TOKEN,
        amountRaw: 25_000_000n,
        slippageBps: 50,
        acceptHighImpact: false,
      }),
    ]);
    expect(await response.json()).toMatchObject({
      inAmountRaw: "25000000",
      expectedOutRaw: "123456789012345678901",
      minOutRaw: "123000000000000000000",
      feeUsdcMicro: "25000",
      networkFeeLamports: "58095",
      expiresAt: "2026-10-02T09:00:45.000Z",
    });
  });

  test("ignores a wallet sent in the request: the wallet comes from the sign-in", async () => {
    const person = privy.signIn();
    const response = await postQuote({ ...BUY, wallet: fakeSolanaAddress() }, person.token);
    expect(response.status).toBe(200);
    expect(asked[0]?.wallet).toBe(person.wallet ?? "");
  });

  test("passes a sell with its own slippage and the second confirmation", async () => {
    const person = privy.signIn();
    await postQuote(
      { side: "sell", mint: TOKEN, amountRaw: "1", slippageBps: 300, acceptHighImpact: true },
      person.token,
    );
    expect(asked[0]).toMatchObject({
      side: "sell",
      amountRaw: 1n,
      slippageBps: 300,
      acceptHighImpact: true,
    });
  });

  test("refuses a request without a sign-in, before quoting", async () => {
    await expectError(await postQuote(BUY), 401, "UNAUTHORIZED");
    expect(asked).toEqual([]);
  });

  test.each<[string, Record<string, unknown>]>([
    ["an unknown side", { side: "short" }],
    ["a mint that isn't an address", { mint: "0x52908400098527886E0F7030069857D2E4169EE7" }],
    ["an amount of zero", { amountRaw: "0" }],
    ["an amount with a leading zero", { amountRaw: "025000000" }],
    ["a fractional amount", { amountRaw: "25.5" }],
    ["a negative amount", { amountRaw: "-25000000" }],
    ["an amount as a number", { amountRaw: 25_000_000 }],
    ["an amount of 41 digits", { amountRaw: "1".repeat(41) }],
    ["slippage under 10 bps", { slippageBps: 9 }],
    ["slippage over 300 bps", { slippageBps: 301 }],
    ["fractional slippage", { slippageBps: 50.5 }],
  ])("refuses %s, before quoting", async (_, change) => {
    const person = privy.signIn();
    await expectError(
      await postQuote({ ...BUY, ...change }, person.token),
      400,
      "VALIDATION_FAILED",
    );
    expect(asked).toEqual([]);
  });

  test("refuses a person's quote past 30 in a minute, before quoting", async () => {
    const person = privy.signIn();
    const app = testApp();
    const quote = () =>
      app.request("/v1/swaps/quote", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${person.token}` },
        body: JSON.stringify(BUY),
      });
    for (let n = 0; n < 30; n += 1) {
      expect((await quote()).status).toBe(200);
    }
    const refused = await quote();
    await expectError(refused, 429, "RATE_LIMITED");
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(asked).toHaveLength(30);
  });

  test.each<[ErrorCode, number]>([
    ["INSUFFICIENT_BALANCE", 400],
    ["PRICE_IMPACT_TOO_HIGH", 400],
    ["QUOTE_UNAVAILABLE", 502],
    ["QUOTE_BUSY", 503],
  ])("answers the service's %s with status %i", async (code, status) => {
    answer = () => Promise.reject(new AppError(code));
    const person = privy.signIn();
    await expectError(await postQuote(BUY, person.token), status, code);
  });
});
