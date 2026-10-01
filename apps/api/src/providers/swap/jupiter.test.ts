import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { RateLimit } from "@repo/server";
import { USDC } from "@repo/solana";
import { AccountRole, address, getBase64Encoder } from "@solana/kit";
import { createJupiterSwaps } from "./jupiter";
import { SwapProviderError, type SwapRequest } from "./types";

// Real answers from Jupiter's swap API, saved once (public data only): a $1 USDC → JUP buy and a
// 0.0085 SOL → USDC sell for the same public wallet.
const fixture = (name: string) =>
  Bun.file(
    join(import.meta.dir, "..", "..", "..", "test", "fixtures", `jupiter-${name}.json`),
  ).text();
const BUY_QUOTE = await fixture("buy-quote");
const BUY_INSTRUCTIONS = await fixture("buy-instructions");
const SELL_QUOTE = await fixture("sell-quote");
const SELL_INSTRUCTIONS = await fixture("sell-instructions");
const NOT_TRADABLE = await fixture("not-tradable");

const WALLET = address("ExYDCa8Gvw8VynhG9SWNKK9k5gg4FpYtf1cF3BUhiDgo");
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const WSOL = "So11111111111111111111111111111111111111112";
const JUPITER_PROGRAM = address("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");

const BUY: SwapRequest = {
  inputMint: USDC.mint,
  outputMint: JUP,
  amountRaw: 999_000n,
  slippageBps: 50,
  userPublicKey: WALLET,
  maxAccounts: 54,
};
const SELL: SwapRequest = { ...BUY, inputMint: WSOL, outputMint: USDC.mint, amountRaw: 8_500_000n };

type Answer = { status?: number; body: string } | Error;

// Stands in for Jupiter: answers each call from the list and keeps what was asked.
function jupiter(quote: Answer, instructions: Answer = { body: BUY_INSTRUCTIONS }) {
  const requests: { url: URL; method: string; headers: Headers; body: string }[] = [];
  const fetch = async (request: Request) => {
    const url = new URL(request.url);
    requests.push({
      url,
      method: request.method,
      headers: request.headers,
      body: await request.text(),
    });
    const answer = url.pathname.endsWith("/quote") ? quote : instructions;
    if (answer instanceof Error) {
      throw answer;
    }
    return new Response(answer.body, { status: answer.status ?? 200 });
  };
  return { fetch, requests };
}

let queued = 0;
const rateLimit: RateLimit = (task) => {
  queued += 1;
  return task();
};

// Changes one field of a saved answer, for the checks a real answer never trips.
const edit = (text: string, change: (json: Record<string, unknown>) => void) => {
  const json = JSON.parse(text) as Record<string, unknown>;
  change(json);
  return JSON.stringify(json);
};

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof SwapProviderError)) {
    throw new Error(`expected a SwapProviderError, got ${String(error)}`);
  }
  return error;
}

describe("createJupiterSwaps", () => {
  test("asks for a quote, then for its instructions, both through the rate limit", async () => {
    const { fetch, requests } = jupiter({ body: BUY_QUOTE });
    queued = 0;
    await createJupiterSwaps({ rateLimit, fetch }).getSwapInstructions(BUY);

    expect(queued).toBe(2);
    const [quote, instructions] = requests;
    expect(quote?.url.origin).toBe("https://lite-api.jup.ag");
    expect(quote?.url.pathname).toBe("/swap/v1/quote");
    expect(Object.fromEntries(quote?.url.searchParams ?? [])).toEqual({
      inputMint: USDC.mint,
      outputMint: JUP,
      amount: "999000",
      slippageBps: "50",
      maxAccounts: "54",
    });
    expect(instructions?.method).toBe("POST");
    expect(instructions?.url.pathname).toBe("/swap/v1/swap-instructions");
    expect(JSON.parse(instructions?.body ?? "")).toEqual({
      quoteResponse: JSON.parse(BUY_QUOTE),
      userPublicKey: WALLET,
      wrapAndUnwrapSol: true,
    });
  });

  test("sends the quote back as the exact text Jupiter sent, so no number changes on the way", async () => {
    const { fetch, requests } = jupiter({ body: BUY_QUOTE });
    await createJupiterSwaps({ rateLimit, fetch }).getSwapInstructions(BUY);
    expect(requests[1]?.body).toContain(`"quoteResponse":${BUY_QUOTE}`);
  });

  test("with a key, calls the keyed address and sends the key in a header", async () => {
    const { fetch, requests } = jupiter({ body: BUY_QUOTE });
    await createJupiterSwaps({ apiKey: "test-key", rateLimit, fetch }).getSwapInstructions(BUY);
    for (const request of requests) {
      expect(request.url.origin).toBe("https://api.jup.ag");
      expect(request.url.search).not.toContain("test-key");
      expect(request.headers.get("x-api-key")).toBe("test-key");
    }
  });

  test("reads a buy: amounts, route and the swap instruction as Jupiter gave it", async () => {
    const { fetch } = jupiter({ body: BUY_QUOTE });
    const route = await createJupiterSwaps({ rateLimit, fetch }).getSwapInstructions(BUY);

    expect(route.expectedOutRaw).toBe(3_169_210n);
    expect(route.minOutRaw).toBe(3_153_364n);
    expect(route.priceImpactBps).toBe(0);
    expect(route.routeLabel).toBe("GoonFi V2 → PancakeSwap → Raydium CLMM");
    expect(route.providerFeeBps).toBe(0);
    expect(route.addressLookupTableAddresses).toHaveLength(3);
    expect(route.parts.setup).toEqual([]);
    expect(route.parts.cleanup).toEqual([]);

    const answer = JSON.parse(BUY_INSTRUCTIONS) as {
      swapInstruction: { accounts: unknown[]; data: string };
    };
    expect(route.parts.swap.programAddress).toBe(JUPITER_PROGRAM);
    expect(route.parts.swap.accounts).toHaveLength(answer.swapInstruction.accounts.length);
    expect(route.parts.swap.data).toEqual(getBase64Encoder().encode(answer.swapInstruction.data));
  });

  test("reads a sell: wrapping SOL in setup, closing the wrapped account in cleanup", async () => {
    const { fetch } = jupiter({ body: SELL_QUOTE }, { body: SELL_INSTRUCTIONS });
    const route = await createJupiterSwaps({ rateLimit, fetch }).getSwapInstructions(SELL);

    expect(route.routeLabel).toBe("Flux");
    expect(route.parts.setup.map((i) => i.programAddress)).toEqual([SYSTEM_PROGRAM, TOKEN_PROGRAM]);
    // System transfer (2) of 8,500,000 lamports into the wrapped SOL account.
    expect(route.parts.setup[0]?.data).toEqual(getBase64Encoder().encode("AgAAACCzgQAAAAAA"));
    // CloseAccount (9).
    expect(route.parts.cleanup.map((i) => [i.programAddress, i.data])).toEqual([
      [TOKEN_PROGRAM, getBase64Encoder().encode("CQ==")],
    ]);
  });

  test.each([
    [false, false, AccountRole.READONLY],
    [false, true, AccountRole.WRITABLE],
    [true, false, AccountRole.READONLY_SIGNER],
    [true, true, AccountRole.WRITABLE_SIGNER],
  ])(
    "gives an account with signer %p and writable %p the role %p",
    async (isSigner, isWritable, role) => {
      const instructions = edit(BUY_INSTRUCTIONS, (json) => {
        json.swapInstruction = {
          programId: JUPITER_PROGRAM,
          accounts: [{ pubkey: WALLET, isSigner, isWritable }],
          data: "",
        };
      });
      const { fetch } = jupiter({ body: BUY_QUOTE }, { body: instructions });
      const route = await createJupiterSwaps({ rateLimit, fetch }).getSwapInstructions(BUY);
      expect(route.parts.swap.accounts).toEqual([{ address: WALLET, role }]);
    },
  );

  test("puts Jupiter's other instructions after its setup, before the swap", async () => {
    const answer = JSON.parse(SELL_INSTRUCTIONS) as { setupInstructions: unknown[] };
    const instructions = edit(SELL_INSTRUCTIONS, (json) => {
      json.otherInstructions = [answer.setupInstructions[1]];
      json.setupInstructions = [answer.setupInstructions[0]];
    });
    const { fetch } = jupiter({ body: SELL_QUOTE }, { body: instructions });
    const route = await createJupiterSwaps({ rateLimit, fetch }).getSwapInstructions(SELL);
    expect(route.parts.setup.map((i) => i.programAddress)).toEqual([SYSTEM_PROGRAM, TOKEN_PROGRAM]);
  });

  test.each([
    ["no impact", "0", 0],
    ["a fraction, rounded up", "0.0042019170635164578029641382", 43],
    ["exactly 5%", "0.05", 500],
    ["the smallest impact, still 1 bp", "0.00000001", 1],
    ["a better-than-market price, as none", "-0.0001", 0],
  ])("reads price impact as a fraction: %s", async (_, priceImpactPct, bps) => {
    const quote = edit(BUY_QUOTE, (json) => {
      json.priceImpactPct = priceImpactPct;
    });
    const { fetch } = jupiter({ body: quote });
    const route = await createJupiterSwaps({ rateLimit, fetch }).getSwapInstructions(BUY);
    expect(route.priceImpactBps).toBe(bps);
  });

  test("shows Jupiter's own fee when it takes one", async () => {
    const quote = edit(BUY_QUOTE, (json) => {
      json.platformFee = { amount: "6338", feeBps: 20 };
    });
    const { fetch } = jupiter({ body: quote });
    const route = await createJupiterSwaps({ rateLimit, fetch }).getSwapInstructions(BUY);
    expect(route.providerFeeBps).toBe(20);
  });

  test("says there's no route when Jupiter won't trade the token", async () => {
    const { fetch } = jupiter({ status: 400, body: NOT_TRADABLE });
    const error = await failure(createJupiterSwaps({ rateLimit, fetch }).getSwapInstructions(BUY));
    expect(error.failure).toBe("no_route");
    expect(error.message).toBe("Jupiter has no route (TOKEN_NOT_TRADABLE)");
  });

  test.each<[string, Answer, Answer?]>([
    ["the quote is rate limited", { status: 429, body: "" }],
    ["the quote fails on Jupiter's side", { status: 500, body: "{}" }],
    ["the quote is a 400 without an error code", { status: 400, body: "bad request" }],
    ["the quote doesn't answer", new DOMException("timed out", "TimeoutError")],
    ["the quote isn't JSON", { body: "<html>" }],
    ["the quote has a shape we don't know", { body: "{}" }],
    ["the instructions fail", { body: BUY_QUOTE }, { status: 400, body: NOT_TRADABLE }],
    ["the instructions don't answer", { body: BUY_QUOTE }, new TypeError("fetch failed")],
    [
      "the instructions have a shape we don't know",
      { body: BUY_QUOTE },
      { body: '{"swapInstruction":1}' },
    ],
  ])("says Jupiter is unavailable when %s", async (_, quote, instructions) => {
    const { fetch } = jupiter(quote, instructions);
    const error = await failure(
      createJupiterSwaps({ apiKey: "test-key", rateLimit, fetch }).getSwapInstructions(BUY),
    );
    expect(error.failure).toBe("unavailable");
    expect(error.message).not.toContain("test-key");
  });

  test.each<[string, (json: Record<string, unknown>) => void]>([
    ["another input token", (json) => (json.inputMint = WSOL)],
    ["another output token", (json) => (json.outputMint = WSOL)],
    ["another amount", (json) => (json.inAmount = "1000000")],
    ["another slippage", (json) => (json.slippageBps = 300)],
    ["exact out", (json) => (json.swapMode = "ExactOut")],
    ["a minimum above the expected amount", (json) => (json.otherAmountThreshold = "3169211")],
  ])("refuses a quote for %s than was asked", async (_, change) => {
    const { fetch } = jupiter({ body: edit(BUY_QUOTE, change) });
    const error = await failure(createJupiterSwaps({ rateLimit, fetch }).getSwapInstructions(BUY));
    expect(error.failure).toBe("unavailable");
  });

  test.each<[string, (json: Record<string, unknown>) => void]>([
    [
      "another signer than the wallet",
      (json) => {
        json.cleanupInstruction = {
          programId: TOKEN_PROGRAM,
          accounts: [{ pubkey: JUPITER_PROGRAM, isSigner: true, isWritable: false }],
          data: "CQ==",
        };
      },
    ],
    [
      "an account that isn't an address",
      (json) => {
        json.setupInstructions = [
          {
            programId: TOKEN_PROGRAM,
            accounts: [{ pubkey: "0x00", isSigner: false, isWritable: false }],
            data: "",
          },
        ];
      },
    ],
    [
      "data that isn't base64",
      (json) => {
        json.setupInstructions = [{ programId: TOKEN_PROGRAM, accounts: [], data: "not base64!" }];
      },
    ],
  ])("refuses instructions with %s", async (_, change) => {
    const { fetch } = jupiter({ body: BUY_QUOTE }, { body: edit(BUY_INSTRUCTIONS, change) });
    const error = await failure(createJupiterSwaps({ rateLimit, fetch }).getSwapInstructions(BUY));
    expect(error.failure).toBe("unavailable");
  });
});
