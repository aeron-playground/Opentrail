import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createRateLimit } from "@repo/server";
import { createGeckoTerminal, DEFAULT_BASE_URL, MAX_CANDLES_PER_CALL } from "./geckoterminal";
import { RateLimitedError } from "./types";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_USDC_POOL = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";

// GeckoTerminal's real answers, 2026-09-29 (public data).
const fixture = (name: string) =>
  Bun.file(join(import.meta.dir, "..", "..", "..", "test", "fixtures", `${name}.json`)).text();

function fakeServer(answers: (string | Response | Error)[], baseUrl?: string) {
  const requests: Request[] = [];
  let rateLimited = 0;
  const noWait = createRateLimit(0);
  const gecko = createGeckoTerminal({
    baseUrl,
    rateLimit: (task) => {
      rateLimited += 1;
      return noWait(task);
    },
    fetch: async (request) => {
      requests.push(request);
      const answer = answers.shift() ?? new Error("The test gave no more answers");
      if (answer instanceof Error) throw answer;
      return typeof answer === "string" ? new Response(answer) : answer;
    },
  });
  return { gecko, requests, rateLimitedCalls: () => rateLimited };
}

const ohlcv = (rows: (string | number)[][]) =>
  JSON.stringify({ data: { attributes: { ohlcv_list: rows } } });

describe("pools", () => {
  test("reads SOL's real top pools, with both tokens and exact liquidity", async () => {
    const { gecko, requests } = fakeServer([await fixture("geckoterminal-pools-sol")]);

    const pools = await gecko.pools(SOL);

    expect(requests[0]?.url).toBe(`${DEFAULT_BASE_URL}/networks/solana/tokens/${SOL}/pools`);
    expect(requests[0]?.headers.get("accept")).toBe("application/json;version=20230203");
    expect(pools).toHaveLength(20);
    expect(pools).toContainEqual({
      address: SOL_USDC_POOL,
      baseMint: SOL,
      quoteMint: USDC,
      liquidityUsd: "37848514.3069",
    });
  });

  test("leaves out a pool without liquidity", async () => {
    const pool = (reserve: string | null) => ({
      attributes: { address: "made-up-pool", reserve_in_usd: reserve },
      relationships: {
        base_token: { data: { id: `solana_${SOL}` } },
        quote_token: { data: { id: `solana_${USDC}` } },
      },
    });
    const { gecko } = fakeServer([JSON.stringify({ data: [pool(null), pool("not a number")] })]);
    expect(await gecko.pools(SOL)).toEqual([]);
  });
});

describe("candles", () => {
  test("reads SOL's real 15-minute candles, keeping every digit", async () => {
    const { gecko, requests } = fakeServer([await fixture("geckoterminal-ohlcv-sol-15m")]);

    const candles = await gecko.candles(SOL_USDC_POOL, SOL, "15m", 3);

    expect(new URL(requests[0]?.url ?? "").pathname).toBe(
      `/api/v2/networks/solana/pools/${SOL_USDC_POOL}/ohlcv/minute`,
    );
    expect(Object.fromEntries(new URL(requests[0]?.url ?? "").searchParams)).toEqual({
      aggregate: "15",
      limit: "3",
      currency: "usd",
      token: SOL,
    });
    expect(candles).toHaveLength(3);
    expect(candles[1]).toEqual({
      bucketStart: new Date("2026-09-29T15:00:00.000Z"),
      open: "120.33402620643214",
      high: "120.617169214674",
      low: "119.252861360384",
      close: "119.41402313269509",
      volumeUsd: "213925.60067345842",
    });
  });

  test.each([
    ["1h", "hour", "1"],
    ["4h", "hour", "4"],
    ["1d", "day", "1"],
  ] as const)("asks for %s as %s with aggregate %s", async (timeframe, path, aggregate) => {
    const { gecko, requests } = fakeServer([ohlcv([])]);
    await gecko.candles(SOL_USDC_POOL, SOL, timeframe, 10);
    const url = new URL(requests[0]?.url ?? "");
    expect(url.pathname.endsWith(`/ohlcv/${path}`)).toBe(true);
    expect(url.searchParams.get("aggregate")).toBe(aggregate);
  });

  test(`asks for at most ${MAX_CANDLES_PER_CALL} candles`, async () => {
    const { gecko, requests } = fakeServer([ohlcv([])]);
    await gecko.candles(SOL_USDC_POOL, SOL, "1d", 5_000);
    expect(new URL(requests[0]?.url ?? "").searchParams.get("limit")).toBe("1000");
  });

  test("uses another base address when told, through the rate limit", async () => {
    const { gecko, requests, rateLimitedCalls } = fakeServer(
      [ohlcv([])],
      "https://example.test/v2",
    );
    await gecko.candles(SOL_USDC_POOL, SOL, "1h", 1);
    expect(requests[0]?.url.startsWith("https://example.test/v2/networks/solana/pools/")).toBe(
      true,
    );
    expect(rateLimitedCalls()).toBe(1);
  });

  test("keeps only the first of a start time GeckoTerminal sends twice", async () => {
    // Seen in a real answer: 1,000 hourly candles with one hour in them twice.
    const { gecko } = fakeServer([
      ohlcv([
        [1790694000, 1, 2, 0.5, 1.5, 10],
        [1790690400, 1, 2, 0.5, 1.25, 10],
        [1790690400, 1, 2, 0.5, 1.75, 10],
      ]),
    ]);
    const candles = await gecko.candles("made-up-pool", SOL, "1h", 3);
    expect(candles.map((candle) => [candle.bucketStart.getTime(), candle.close])).toEqual([
      [1_790_694_000_000, "1.5"],
      [1_790_690_400_000, "1.25"],
    ]);
  });

  test("writes exponents as plain decimals", async () => {
    const { gecko } = fakeServer([ohlcv([[1790694000, 3.7e-6, 3.8e-6, 3.6e-6, 3.75e-6, 1e3]])]);
    expect(await gecko.candles("made-up-pool", SOL, "1h", 1)).toEqual([
      {
        bucketStart: new Date(1_790_694_000_000),
        open: "0.0000037",
        high: "0.0000038",
        low: "0.0000036",
        close: "0.00000375",
        volumeUsd: "1000",
      },
    ]);
  });

  test.each([
    ["a price of zero", [1790694000, 0, 1, 1, 1, 5]],
    ["a negative price", [1790694000, 1, 1, -1, 1, 5]],
    ["a high below the low", [1790694000, 1, 1, 2, 1, 5]],
    ["a negative volume", [1790694000, 1, 1, 1, 1, -5]],
    ["a start that isn't whole seconds", [1790694000.5, 1, 1, 1, 1, 5]],
    ["a number it can't read", [1790694000, "1e999", 1, 1, 1, 5]],
  ])("skips a row with %s, and keeps the good ones", async (_, bad) => {
    const good = [1790690400, 1, 2, 0.5, 1.5, 10];
    const { gecko } = fakeServer([ohlcv([bad as number[], good])]);
    const candles = await gecko.candles("made-up-pool", SOL, "1h", 2);
    expect(candles.map((candle) => candle.bucketStart.getTime())).toEqual([1_790_690_400_000]);
  });
});

describe("failures", () => {
  test("a 429 answer is a RateLimitedError, so the job can pause", async () => {
    const { gecko } = fakeServer([new Response("{}", { status: 429 })]);
    await expect(gecko.pools(SOL)).rejects.toBeInstanceOf(RateLimitedError);
  });

  test.each([
    ["another refusal", new Response("{}", { status: 500 }), "GeckoTerminal answered 500"],
    ["no answer at all", new Error("Unable to connect"), "GeckoTerminal didn't answer (Error)"],
  ])("reports %s", async (_, answer, message) => {
    const { gecko } = fakeServer([answer]);
    await expect(gecko.candles("made-up-pool", SOL, "1h", 1)).rejects.toThrow(message);
  });

  test.each([
    ["pools", (g: ReturnType<typeof createGeckoTerminal>) => g.pools(SOL)],
    ["candles", (g: ReturnType<typeof createGeckoTerminal>) => g.candles("p", SOL, "1h", 1)],
  ])("refuses %s in a shape it doesn't know", async (name, ask) => {
    const { gecko } = fakeServer(['{"data":"something else"}']);
    await expect(ask(gecko)).rejects.toThrow(
      `GeckoTerminal answered ${name} in a shape we don't know`,
    );
  });
});
