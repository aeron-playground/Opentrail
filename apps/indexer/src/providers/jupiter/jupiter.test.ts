import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createRateLimit } from "../../lib/rate-limit";
import { createJupiterPrices, createJupiterTokens, MAX_IDS_PER_CALL } from "./jupiter";

// Made up for these tests: no real key.
const API_KEY = "test-jupiter-key-0123";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const RAY = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
const SOL = "So11111111111111111111111111111111111111112";

// Jupiter's real answer for our 8 tokens, 2026-09-29 (public data).
const realAnswer = () =>
  Bun.file(
    join(import.meta.dir, "..", "..", "..", "test", "fixtures", "jupiter-prices.json"),
  ).text();

// Answers each request with the next text or error, and keeps the requests.
function fakeJupiter({
  apiKey,
  answers,
}: {
  apiKey?: string;
  answers: (string | Response | Error)[];
}) {
  const requests: Request[] = [];
  const noWait = createRateLimit(0);
  let rateLimited = 0;
  const options = {
    apiKey,
    rateLimit: <T>(task: () => Promise<T>) => {
      rateLimited += 1;
      return noWait(task);
    },
    fetch: async (request: Request) => {
      requests.push(request);
      const answer = answers.shift() ?? new Error("The test gave no more answers");
      if (answer instanceof Error) throw answer;
      return typeof answer === "string" ? new Response(answer) : answer;
    },
  };
  return {
    prices: createJupiterPrices(options),
    tokens: createJupiterTokens(options),
    requests,
    rateLimitedCalls: () => rateLimited,
  };
}

describe("getPrices", () => {
  test("reads the real answer and keeps every digit Jupiter sent", async () => {
    const { prices } = fakeJupiter({ answers: [await realAnswer()] });

    const quotes = await prices.getPrices([BONK, RAY, SOL]);

    expect(quotes.get(BONK)).toEqual({
      priceUsd: "0.0000037264429947363744",
      change24hPct: "5.599782143800134",
    });
    expect(quotes.get(RAY)).toEqual({
      priceUsd: "1.9125516469008939",
      change24hPct: "-4.836798889303811",
    });
    expect(quotes.size).toBe(3);
  });

  test("asks the keyless address when there's no key", async () => {
    const { prices, requests } = fakeJupiter({ answers: ["{}"] });
    await prices.getPrices([BONK, RAY]);
    expect(requests[0]?.url).toBe(`https://lite-api.jup.ag/price/v3?ids=${BONK},${RAY}`);
    expect(requests[0]?.headers.get("x-api-key")).toBeNull();
  });

  test("sends the key in a header to the keyed address, never in the address", async () => {
    const { prices, requests } = fakeJupiter({ apiKey: API_KEY, answers: ["{}"] });
    await prices.getPrices([BONK]);
    expect(requests[0]?.url).toBe(`https://api.jup.ag/price/v3?ids=${BONK}`);
    expect(requests[0]?.headers.get("x-api-key")).toBe(API_KEY);
  });

  test(`splits more than ${MAX_IDS_PER_CALL} tokens into calls, each through the rate limit`, async () => {
    const mints = Array.from({ length: MAX_IDS_PER_CALL + 1 }, (_, index) => `mint${index}`);
    const { prices, requests, rateLimitedCalls } = fakeJupiter({ answers: ["{}", "{}"] });

    await prices.getPrices(mints);

    expect(
      requests.map((request) => new URL(request.url).searchParams.get("ids")?.split(",").length),
    ).toEqual([MAX_IDS_PER_CALL, 1]);
    expect(rateLimitedCalls()).toBe(2);
  });

  test("makes no call for no tokens", async () => {
    const { prices, requests } = fakeJupiter({ answers: [] });
    expect((await prices.getPrices([])).size).toBe(0);
    expect(requests).toHaveLength(0);
  });

  test("writes exponents as plain decimals, and takes a missing 24-hour change", async () => {
    const answer = `{"${BONK}":{"usdPrice":3.7e-6,"priceChange24h":null},"${RAY}":{"usdPrice":1.5E+3}}`;
    const { prices } = fakeJupiter({ answers: [answer] });

    const quotes = await prices.getPrices([BONK, RAY]);

    expect(quotes.get(BONK)).toEqual({ priceUsd: "0.0000037", change24hPct: null });
    expect(quotes.get(RAY)).toEqual({ priceUsd: "1500", change24hPct: null });
  });

  test("leaves out a token Jupiter omitted or priced at zero or below", async () => {
    const answer = `{"${BONK}":{"usdPrice":0},"${RAY}":{"usdPrice":-2}}`;
    const { prices } = fakeJupiter({ answers: [answer] });
    expect((await prices.getPrices([BONK, RAY, SOL])).size).toBe(0);
  });

  test("keeps a price whose 24-hour change is out of range, without the change", async () => {
    const answer = `{"${BONK}":{"usdPrice":1,"priceChange24h":1e999}}`;
    const { prices } = fakeJupiter({ answers: [answer] });
    expect((await prices.getPrices([BONK])).get(BONK)).toEqual({
      priceUsd: "1",
      change24hPct: null,
    });
  });

  test("leaves out a price it can't read", async () => {
    const answer = `{"${BONK}":{"usdPrice":1e999}}`;
    const { prices } = fakeJupiter({ answers: [answer] });
    expect((await prices.getPrices([BONK])).size).toBe(0);
  });

  const failures: [string, string | Response | Error, string][] = [
    ["a refusal", new Response("{}", { status: 429 }), "Jupiter prices answered 429"],
    [
      "no answer at all",
      new Error(`Unable to connect to https://api.jup.ag/price/v3?x-api-key=${API_KEY}`),
      "Jupiter prices didn't answer (Error)",
    ],
    ["an answer in a shape it doesn't know", `{"${BONK}":{"price":1}}`, "in a shape we don't know"],
  ];

  test.each(failures)("reports %s without the API key", async (_, answer, message) => {
    const { prices } = fakeJupiter({ apiKey: API_KEY, answers: [answer] });
    const error = await prices.getPrices([BONK]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(message);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(API_KEY);
  });
});

describe("getTokens", () => {
  const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  // Jupiter's real token data for our 8 tokens, 2026-10-01 (public data).
  const realTokens = () =>
    Bun.file(
      join(import.meta.dir, "..", "..", "..", "test", "fixtures", "jupiter-tokens.json"),
    ).text();
  const token = (fields: Record<string, unknown>) => JSON.stringify([{ id: JUP, ...fields }]);

  test("reads the real answer, adding up 24-hour buys and sells exactly", async () => {
    const { tokens } = fakeJupiter({ answers: [await realTokens()] });

    const found = await tokens.getTokens([JUP, USDC]);

    expect(found.get(JUP)).toEqual({
      isVerified: true,
      liquidityUsd: "5877443.9157540025",
      marketCapUsd: "1084239675.815317",
      volume24hUsd: "17085883.597498145",
    });
    expect(found.get(USDC)?.volume24hUsd).toBe("2280258938.2795062");
    // The answer holds all 8 tokens; only the ones asked for count.
    expect(found.size).toBe(2);
  });

  test("asks for every mint in one search, through the rate limit", async () => {
    const { tokens, requests, rateLimitedCalls } = fakeJupiter({ answers: ["[]"] });
    await tokens.getTokens([JUP, USDC]);
    expect(requests.map((request) => request.url)).toEqual([
      `https://lite-api.jup.ag/tokens/v2/search?query=${JUP},${USDC}`,
    ]);
    expect(rateLimitedCalls()).toBe(1);
  });

  test("sends the key in a header to the keyed address", async () => {
    const { tokens, requests } = fakeJupiter({ apiKey: API_KEY, answers: ["[]"] });
    await tokens.getTokens([JUP]);
    expect(requests[0]?.url).toStartWith("https://api.jup.ag/tokens/v2/search?");
    expect(requests[0]?.headers.get("x-api-key")).toBe(API_KEY);
  });

  test("leaves out a mint Jupiter doesn't know", async () => {
    const { tokens } = fakeJupiter({ answers: ["[]"] });
    expect((await tokens.getTokens([JUP])).size).toBe(0);
  });

  test("counts a token without Jupiter's review as not verified, and missing data as none", async () => {
    const { tokens } = fakeJupiter({ answers: [token({})] });
    expect((await tokens.getTokens([JUP])).get(JUP)).toEqual({
      isVerified: false,
      liquidityUsd: null,
      marketCapUsd: null,
      volume24hUsd: null,
    });
  });

  test("takes no amount below zero or unreadable, and no volume from half of it", async () => {
    const answer = token({
      isVerified: true,
      liquidity: -5,
      mcap: "lots",
      stats24h: { buyVolume: 10.5, sellVolume: null },
    });
    const { tokens } = fakeJupiter({ answers: [answer] });
    expect((await tokens.getTokens([JUP])).get(JUP)).toEqual({
      isVerified: true,
      liquidityUsd: null,
      marketCapUsd: null,
      volume24hUsd: null,
    });
  });

  test("writes exponents as plain decimals", async () => {
    const { tokens } = fakeJupiter({ answers: [token({ liquidity: 1.5e6 })] });
    expect((await tokens.getTokens([JUP])).get(JUP)?.liquidityUsd).toBe("1500000");
  });

  test("fails on an answer in a shape it doesn't know", async () => {
    const { tokens } = fakeJupiter({ answers: ['{"tokens": []}'] });
    await expect(tokens.getTokens([JUP])).rejects.toThrow(
      "Jupiter answered tokens in a shape we don't know",
    );
  });

  test("fails when Jupiter answers with an error or not at all", async () => {
    const { tokens } = fakeJupiter({
      answers: [new Response("", { status: 503 }), new TypeError("network down")],
    });
    await expect(tokens.getTokens([JUP])).rejects.toThrow("Jupiter tokens answered 503");
    await expect(tokens.getTokens([JUP])).rejects.toThrow(
      "Jupiter tokens didn't answer (TypeError)",
    );
  });
});
