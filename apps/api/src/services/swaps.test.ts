import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, swapIntents, tokens, users } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { AppError } from "@repo/server";
import type { ErrorCode } from "@repo/shared";
import { messageHash, SOL, USDC } from "@repo/solana";
import {
  address,
  generateKeyPairSigner,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";
import { createFakeSolana, type FakeSolana } from "../providers/solana/fake";
import type { Simulation } from "../providers/solana/types";
import { createFakeSwapProvider, type FakeSwapProvider, fakeRoute } from "../providers/swap/fake";
import { SwapProviderError } from "../providers/swap/types";
import { type FeeSettings, feeSettings } from "./fees";
import type { PriceReader } from "./prices";
import { createSwapService, type QuoteRequest, type TradeLimits } from "./swaps";

const NOW = new Date("2026-10-02T09:00:00.000Z");
const COMPUTE_BUDGET = address("ComputeBudget111111111111111111111111111111");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const LIMITS: TradeLimits = {
  maxTradeUsd: 5_000,
  minSolForFeesLamports: 5_000_000n,
  maxPriorityFeeMicroLamports: 1_000_000n,
};
// A real wallet that has a USDC account on mainnet (public data), standing in for the fee wallet.
const FEES_ON = await feeSettings({
  FEES_ENABLED: true,
  PLATFORM_FEE_BPS: 10,
  FEE_WALLET_ADDRESS: "AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51",
});
const FEES_OFF: FeeSettings = { enabled: false };

// Throwaway addresses: the token mints and the wallet name nothing real.
const someAddress = async () => (await generateKeyPairSigner()).address;
const WALLET = await someAddress();
const TOKEN = await someAddress();
const UNLISTED = await someAddress();
const RISKY = await someAddress();
const SWAP_PROGRAM = fakeRoute({
  inputMint: USDC.mint,
  outputMint: TOKEN,
  amountRaw: 1n,
  slippageBps: 50,
  userPublicKey: WALLET,
  maxAccounts: 54,
}).parts.swap.programAddress;

let handle: DbHandle;
let userId: string;
let solana: FakeSolana;
let swaps: FakeSwapProvider;
let prices: Map<string, string>;

beforeAll(async () => {
  handle = await createTestDb("api");
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(swapIntents);
  await handle.db.delete(users);
  await handle.db.delete(tokens);
  const [user] = await handle.db
    .insert(users)
    .values({ privyDid: "did:privy:maya", walletAddress: WALLET, username: "maya" })
    .returning();
  if (!user) throw new Error("insert returned no row");
  userId = user.id;
  const token = { name: "Made-up", decimals: 6, tokenProgram: "spl-token" as const };
  await handle.db.insert(tokens).values([
    { ...token, mint: TOKEN, symbol: "TKN", isListed: true, safetyLevel: "ok" },
    { ...token, mint: SOL.mint, symbol: "SOL", decimals: 9, isListed: true, safetyLevel: "ok" },
    { ...token, mint: UNLISTED, symbol: "UNL", isListed: false, safetyLevel: "ok" },
    { ...token, mint: RISKY, symbol: "RSK", isListed: true, safetyLevel: "high_risk" },
  ]);

  solana = createFakeSolana();
  solana.setSol(WALLET, 20_000_000n);
  solana.setToken(WALLET, USDC.mint, 500_000_000n);
  solana.setToken(WALLET, TOKEN, 1_000_000_000n);
  swaps = createFakeSwapProvider();
  prices = new Map([
    [TOKEN, "2"],
    [SOL.mint, "150"],
  ]);
});

const priceReader: PriceReader = {
  current: async (mints) =>
    mints.flatMap((mint) => {
      const priceUsd = prices.get(mint);
      return priceUsd ? [{ mint, priceUsd, change24hPct: null }] : [];
    }),
};

function service(fees: FeeSettings = FEES_OFF) {
  return createSwapService({
    db: handle.db,
    solana,
    swaps,
    fees,
    prices: priceReader,
    limits: LIMITS,
    now: () => NOW,
  });
}

// A $100 buy of the made-up token unless told otherwise.
const request = (overrides: Partial<QuoteRequest> = {}): QuoteRequest => ({
  userId,
  wallet: WALLET,
  side: "buy",
  mint: TOKEN,
  amountRaw: 100_000_000n,
  slippageBps: 50,
  acceptHighImpact: false,
  ...overrides,
});

async function refusal(promise: Promise<unknown>): Promise<ErrorCode> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof AppError)) {
    throw new Error(`expected an AppError, got ${String(error)}`);
  }
  return error.code;
}

// Reads a transaction back: its programs in order, and the compute budget it asks for.
async function inspect(base64: string) {
  const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(base64));
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  // Trades are always version 0, the version that can use lookup tables.
  if (message.version !== 0)
    throw new Error(`expected a version 0 message, got ${message.version}`);
  const programs = message.instructions.map((i) => message.staticAccounts[i.programAddressIndex]);
  const littleEndian = (bytes: ArrayLike<number>, from: number, count: number) => {
    let value = 0n;
    for (let i = count - 1; i >= 0; i -= 1) value = (value << 8n) | BigInt(bytes[from + i] ?? 0);
    return value;
  };
  // SetComputeUnitLimit is [2, u32], SetComputeUnitPrice is [3, u64], both little-endian.
  const limit = message.instructions[0]?.data ?? new Uint8Array();
  const price = message.instructions[1]?.data ?? new Uint8Array();
  return {
    programs,
    unitLimit: Number(littleEndian(limit, 1, 4)),
    priorityMicroLamports: littleEndian(price, 1, 8),
    messageHash: await messageHash(transaction.messageBytes),
  };
}

describe("quote: a buy", () => {
  test("routes the whole amount with fees off, and saves the intent it answers with", async () => {
    const quote = await service().quote(request());

    expect(swaps.requests).toEqual([
      {
        inputMint: USDC.mint,
        outputMint: TOKEN,
        amountRaw: 100_000_000n,
        slippageBps: 50,
        userPublicKey: WALLET,
        maxAccounts: 54,
      },
    ]);
    expect(quote).toMatchObject({
      side: "buy",
      mint: TOKEN,
      inputMint: USDC.mint,
      outputMint: TOKEN,
      inAmountRaw: 100_000_000n,
      expectedOutRaw: 100_000_000n,
      minOutRaw: 99_500_000n,
      feeBps: 0,
      feeUsdcMicro: 0n,
      routeLabel: "Fake pool",
      expiresAt: new Date("2026-10-02T09:00:45.000Z"),
    });

    const [intent] = await handle.db.select().from(swapIntents);
    expect(intent).toMatchObject({
      id: quote.id,
      userId,
      kind: "swap",
      side: "buy",
      status: "built",
      inAmountRaw: 100_000_000n,
      minOutRaw: 99_500_000n,
      provider: "jupiter",
      lastValidBlockHeight: 1_000n,
      expiresAt: quote.expiresAt,
    });
    expect(intent?.messageHash).toBe((await inspect(quote.transaction)).messageHash);
  });

  test("with fees on, takes the fee off the top and pays it before the swap", async () => {
    const quote = await service(FEES_ON).quote(request());
    expect(swaps.requests[0]?.amountRaw).toBe(99_900_000n);
    expect(quote).toMatchObject({ feeBps: 10, feeUsdcMicro: 100_000n });
    expect((await inspect(quote.transaction)).programs).toEqual([
      COMPUTE_BUDGET,
      COMPUTE_BUDGET,
      TOKEN_PROGRAM,
      SWAP_PROGRAM,
    ]);
  });

  test("with fees off, carries no fee instruction", async () => {
    const quote = await service().quote(request());
    expect((await inspect(quote.transaction)).programs).toEqual([
      COMPUTE_BUDGET,
      COMPUTE_BUDGET,
      SWAP_PROGRAM,
    ]);
  });
});

describe("quote: a sell", () => {
  test("sells the whole amount and charges the fee on the minimum USDC, after the swap", async () => {
    const quote = await service(FEES_ON).quote(request({ side: "sell", amountRaw: 50_000_000n }));
    expect(swaps.requests[0]).toMatchObject({
      inputMint: TOKEN,
      outputMint: USDC.mint,
      amountRaw: 50_000_000n,
    });
    // The fake routes one for one: a minimum of 49,750,000 at 10 bps is 49,750.
    expect(quote).toMatchObject({ minOutRaw: 49_750_000n, feeUsdcMicro: 49_750n });
    expect((await inspect(quote.transaction)).programs).toEqual([
      COMPUTE_BUDGET,
      COMPUTE_BUDGET,
      SWAP_PROGRAM,
      TOKEN_PROGRAM,
    ]);
  });

  test("selling SOL keeps the network fee reserve", async () => {
    // 0.02 SOL held, 0.005 SOL kept: 0.015 SOL can be sold, and not a lamport more.
    const sol = { side: "sell", mint: SOL.mint } as const;
    expect(await service().quote(request({ ...sol, amountRaw: 15_000_000n }))).toBeDefined();
    expect(await refusal(service().quote(request({ ...sol, amountRaw: 15_000_001n })))).toBe(
      "INSUFFICIENT_BALANCE",
    );
  });
});

describe("quote: the transaction's compute budget", () => {
  test("simulates with the most compute, then asks for what it used plus 10%, rounded up", async () => {
    solana.simulateWith(() => ({ error: null, unitsConsumed: 48_268n, logs: [] }));
    const quote = await service().quote(request());
    const draft = await inspect(solana.simulations[0] ?? "");
    expect(draft).toMatchObject({ unitLimit: 1_400_000, priorityMicroLamports: 0n });
    expect((await inspect(quote.transaction)).unitLimit).toBe(53_095);
  });

  test("never asks for more than the most a transaction may use", async () => {
    solana.simulateWith(() => ({ error: null, unitsConsumed: 1_300_000n, logs: [] }));
    const quote = await service().quote(request());
    expect((await inspect(quote.transaction)).unitLimit).toBe(1_400_000);
  });

  test.each([
    ["the median of recent fees", [0n, 100n, 300_000n, 2_000_000n, 50n], 100n],
    ["the lower middle of an even count", [10n, 20n, 30n, 40n], 20n],
    ["none when nobody paid", [], 0n],
    ["the cap when the median is above it", [5_000_000n, 6_000_000n, 7_000_000n], 1_000_000n],
  ])("offers %s as the priority fee", async (_, recent, expected) => {
    solana.setPriorityFees(recent);
    const quote = await service().quote(request());
    expect((await inspect(quote.transaction)).priorityMicroLamports).toBe(expected);
  });

  test("tells the most the network can take: the signature fee plus the priority fee", async () => {
    solana.simulateWith(() => ({ error: null, unitsConsumed: 48_268n, logs: [] }));
    solana.setPriorityFees([1_000_000n]);
    const quote = await service().quote(request());
    // 5,000 + 53,095 units × 1,000,000 micro-lamports ÷ 1,000,000.
    expect(quote.networkFeeLamports).toBe(58_095n);
  });
});

describe("quote: too big for one transaction", () => {
  test("asks again with fewer accounts until it fits", async () => {
    swaps.respond((r) => fakeRoute(r, { extraAccounts: r.maxAccounts > 40 ? 60 : 5 }));
    await service().quote(request());
    expect(swaps.requests.map((r) => r.maxAccounts)).toEqual([54, 40]);
  });

  test("gives up after the smallest route", async () => {
    swaps.respond((r) => fakeRoute(r, { extraAccounts: 60 }));
    expect(await refusal(service().quote(request()))).toBe("QUOTE_UNAVAILABLE");
    expect(swaps.requests.map((r) => r.maxAccounts)).toEqual([54, 40, 30]);
  });
});

describe("quote: refusals", () => {
  test.each<[string, () => Partial<QuoteRequest>, ErrorCode]>([
    ["a token we don't know", () => ({ mint: SWAP_PROGRAM }), "TOKEN_NOT_SUPPORTED"],
    ["a token we don't list", () => ({ mint: UNLISTED }), "TOKEN_NOT_SUPPORTED"],
    ["a high-risk token", () => ({ mint: RISKY }), "TOKEN_NOT_SUPPORTED"],
    ["USDC for USDC", () => ({ mint: USDC.mint }), "TOKEN_NOT_SUPPORTED"],
    ["a buy under $1", () => ({ amountRaw: 999_999n }), "AMOUNT_TOO_SMALL"],
    ["a buy over the maximum", () => ({ amountRaw: 5_000_000_001n }), "AMOUNT_TOO_LARGE"],
    // 499,999 raw units at $2 per 10^6 is $0.999998.
    ["a sell worth under $1", () => ({ side: "sell", amountRaw: 499_999n }), "AMOUNT_TOO_SMALL"],
    [
      "a sell worth over the maximum",
      () => ({ side: "sell", amountRaw: 2_500_000_001n }),
      "AMOUNT_TOO_LARGE",
    ],
    ["a buy above the USDC held", () => ({ amountRaw: 500_000_001n }), "INSUFFICIENT_BALANCE"],
    [
      "a sell above the tokens held",
      () => ({ side: "sell", amountRaw: 1_000_000_001n }),
      "INSUFFICIENT_BALANCE",
    ],
  ])("refuses %s", async (_, overrides, code) => {
    expect(await refusal(service().quote(request(overrides())))).toBe(code);
    expect(await handle.db.select().from(swapIntents)).toEqual([]);
  });

  test("refuses a sell of a token without a stored price", async () => {
    prices.delete(TOKEN);
    expect(await refusal(service().quote(request({ side: "sell" })))).toBe("QUOTE_UNAVAILABLE");
  });

  test("refuses a wallet under the SOL needed for network fees", async () => {
    solana.setSol(WALLET, 4_999_999n);
    expect(await refusal(service().quote(request()))).toBe("INSUFFICIENT_SOL_FOR_FEES");
  });

  test.each([
    ["no route", "no_route", "QUOTE_UNAVAILABLE"],
    ["no answer in time", "unavailable", "QUOTE_BUSY"],
  ] as const)("says %s from the provider plainly", async (_, failure, code) => {
    swaps.respond(() => new SwapProviderError(failure, "made-up failure"));
    expect(await refusal(service().quote(request()))).toBe(code);
  });

  test("asks for a second confirmation at 5% price impact, and goes ahead with it", async () => {
    swaps.respond((r) => fakeRoute(r, { priceImpactBps: 500 }));
    expect(await refusal(service().quote(request()))).toBe("PRICE_IMPACT_TOO_HIGH");
    expect(await service().quote(request({ acceptHighImpact: true }))).toMatchObject({
      priceImpactBps: 500,
    });
  });

  test("lets just under 5% through without asking", async () => {
    swaps.respond((r) => fakeRoute(r, { priceImpactBps: 499 }));
    expect(await service().quote(request())).toMatchObject({ priceImpactBps: 499 });
  });

  test.each<[string, Simulation, ErrorCode]>([
    [
      "a failing swap",
      { error: { InstructionError: [3n, { Custom: 6001n }] }, unitsConsumed: 40_000n, logs: [] },
      "TX_SIMULATION_FAILED",
    ],
    [
      "too little SOL for the fee",
      { error: "InsufficientFundsForFee", unitsConsumed: null, logs: [] },
      "INSUFFICIENT_SOL_FOR_FEES",
    ],
    [
      "too little SOL for a new account",
      {
        error: { InstructionError: [2n, { Custom: 1n }] },
        unitsConsumed: 3_000n,
        logs: ["Transfer: insufficient lamports 1000, need 2039280"],
      },
      "INSUFFICIENT_SOL_FOR_FEES",
    ],
    [
      "a run that doesn't say what it used",
      { error: null, unitsConsumed: null, logs: [] },
      "QUOTE_UNAVAILABLE",
    ],
  ])(
    "refuses a trade whose simulation shows %s, and saves nothing",
    async (_, simulation, code) => {
      solana.simulateWith(() => simulation);
      expect(await refusal(service().quote(request()))).toBe(code);
      expect(await handle.db.select().from(swapIntents)).toEqual([]);
    },
  );
});
