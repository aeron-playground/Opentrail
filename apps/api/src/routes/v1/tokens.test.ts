import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { candles, type DbHandle, tokenPrices, tokens } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { createApp } from "../../app";
import { createTokenService } from "../../services/tokens";
import { testAppDeps } from "../../testing";

// Real mints (public data); PYUSD is real but not in this test's token list.
const SOL = "So11111111111111111111111111111111111111112";
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PYUSD = "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo";

const HOUR_MS = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR_MS);

let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb("api");
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(candles);
  await handle.db.delete(tokenPrices);
  await handle.db.delete(tokens);
  await handle.db.insert(tokens).values([
    {
      mint: SOL,
      symbol: "SOL",
      name: "Wrapped SOL",
      decimals: 9,
      tokenProgram: "spl-token",
      isListed: true,
      sortRank: 1,
    },
    {
      mint: JUP,
      symbol: "JUP",
      name: "Jupiter",
      decimals: 6,
      tokenProgram: "spl-token",
      isListed: true,
      sortRank: 2,
    },
    { mint: USDC, symbol: "USDC", name: "USD Coin", decimals: 6, tokenProgram: "spl-token" },
  ]);
  await handle.db.insert(tokenPrices).values({
    mint: SOL,
    priceUsd: "118.25881126799591",
    change24hPct: "-2.1",
    updatedAt: new Date("2026-09-30T12:00:00.000Z"),
  });
});

const app = () => createApp(testAppDeps({ tokens: createTokenService({ db: handle.db }) }));
const get = (path: string) => app().request(path);

const candle = (mint: string, timeframe: "1h" | "4h", start: Date, close: string) => ({
  mint,
  timeframe,
  bucketStart: start,
  open: "1",
  high: "200",
  low: "0.5",
  close,
  volumeUsd: "10.50",
});

describe("GET /v1/tokens", () => {
  test("lists the tradable tokens without sign-in, for 10 seconds of caching", async () => {
    await handle.db.insert(candles).values(candle(SOL, "4h", hoursAgo(4), "118.5"));

    const response = await get("/v1/tokens");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=10");
    expect(await response.json()).toEqual({
      items: [
        {
          mint: SOL,
          symbol: "SOL",
          name: "Wrapped SOL",
          decimals: 9,
          logoUrl: null,
          rank: 1,
          priceUsd: "118.25881126799591",
          change24hPct: "-2.1",
          priceUpdatedAt: "2026-09-30T12:00:00.000Z",
          sparkline7d: ["118.5"],
        },
        {
          mint: JUP,
          symbol: "JUP",
          name: "Jupiter",
          decimals: 6,
          logoUrl: null,
          rank: 2,
          priceUsd: null,
          change24hPct: null,
          priceUpdatedAt: null,
          sparkline7d: [],
        },
      ],
      nextCursor: null,
    });
  });
});

describe("GET /v1/tokens/{mint}", () => {
  test("describes a token that isn't tradable, with safety and stats not checked yet", async () => {
    const response = await get(`/v1/tokens/${USDC}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=10");
    expect(await response.json()).toEqual({
      mint: USDC,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      logoUrl: null,
      isListed: false,
      rank: null,
      priceUsd: null,
      change24hPct: null,
      priceUpdatedAt: null,
      safety: { level: null, note: null },
      stats: { marketCapUsd: null, liquidityUsd: null, volume24hUsd: null },
    });
  });

  test("gives the price of a tradable token", async () => {
    const body = (await (await get(`/v1/tokens/${SOL}`)).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ isListed: true, rank: 1, priceUsd: "118.25881126799591" });
  });

  test("answers NOT_FOUND for a token it doesn't know", async () => {
    const response = await get(`/v1/tokens/${PYUSD}`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  test("answers VALIDATION_FAILED for a mint that isn't a Solana address", async () => {
    const response = await get("/v1/tokens/not-a-mint");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });
});

describe("GET /v1/tokens/{mint}/candles", () => {
  test("gives the candles in the range, oldest first, for 30 seconds of caching", async () => {
    await handle.db
      .insert(candles)
      .values([
        candle(SOL, "1h", new Date("2026-09-30T11:00:00Z"), "118.3"),
        candle(SOL, "1h", new Date("2026-09-30T10:00:00Z"), "118.1"),
        candle(SOL, "1h", new Date("2026-09-30T12:00:00Z"), "118.9"),
      ]);

    const response = await get(
      `/v1/tokens/${SOL}/candles?tf=1h&from=2026-09-30T10:00:00Z&to=2026-09-30T12:00:00Z`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=30");
    expect(await response.json()).toEqual({
      mint: SOL,
      timeframe: "1h",
      items: [
        {
          start: "2026-09-30T10:00:00.000Z",
          open: "1",
          high: "200",
          low: "0.5",
          close: "118.1",
          volumeUsd: "10.5",
        },
        {
          start: "2026-09-30T11:00:00.000Z",
          open: "1",
          high: "200",
          low: "0.5",
          close: "118.3",
          volumeUsd: "10.5",
        },
      ],
    });
  });

  test("covers 7 days of hourly candles up to now when no range is given", async () => {
    await handle.db
      .insert(candles)
      .values([candle(SOL, "1h", hoursAgo(1), "118"), candle(SOL, "1h", hoursAgo(8 * 24), "90")]);

    const body = (await (await get(`/v1/tokens/${SOL}/candles?tf=1h`)).json()) as {
      items: { close: string }[];
    };

    expect(body.items.map((item) => item.close)).toEqual(["118"]);
  });

  test("accepts a time with an offset", async () => {
    const response = await get(
      `/v1/tokens/${SOL}/candles?tf=4h&from=2026-09-30T10:00:00%2B02:00&to=2026-09-30T14:00:00%2B02:00`,
    );
    expect(response.status).toBe(200);
  });

  test("answers NOT_FOUND for a token it doesn't know", async () => {
    expect((await get(`/v1/tokens/${PYUSD}/candles?tf=1d`)).status).toBe(404);
  });

  test.each([
    ["no timeframe", `/v1/tokens/${SOL}/candles`],
    ["a timeframe it doesn't know", `/v1/tokens/${SOL}/candles?tf=5m`],
    ["a time that isn't ISO 8601", `/v1/tokens/${SOL}/candles?tf=1h&from=yesterday`],
    [
      "from after to",
      `/v1/tokens/${SOL}/candles?tf=1h&from=2026-09-30T12:00:00Z&to=2026-09-30T10:00:00Z`,
    ],
    [
      "from equal to to",
      `/v1/tokens/${SOL}/candles?tf=1h&from=2026-09-30T12:00:00Z&to=2026-09-30T12:00:00Z`,
    ],
    [
      "a range of more than 1,000 candles",
      `/v1/tokens/${SOL}/candles?tf=15m&from=2026-09-01T00:00:00Z&to=2026-09-30T00:00:00Z`,
    ],
    ["a mint that isn't a Solana address", "/v1/tokens/not-a-mint/candles?tf=1h"],
  ])("answers VALIDATION_FAILED for %s", async (_, path) => {
    const response = await get(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  test("takes a range of exactly 1,000 candles", async () => {
    // 1,000 hours before the end.
    const response = await get(
      `/v1/tokens/${SOL}/candles?tf=1h&from=2026-08-19T08:00:00Z&to=2026-09-30T00:00:00Z`,
    );
    expect(response.status).toBe(200);
  });
});
