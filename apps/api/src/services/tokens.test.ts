import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { candles, type DbHandle, tokenPrices, tokens } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { createTokenService, MAX_CANDLES, type TokenService } from "./tokens";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR_MS);

let handle: DbHandle;
let service: TokenService;

beforeAll(async () => {
  handle = await createTestDb("api");
  service = createTokenService({ db: handle.db, now: () => NOW });
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(candles);
  await handle.db.delete(tokenPrices);
  await handle.db.delete(tokens);
  // Made-up tokens: the addresses name nothing real.
  await handle.db.insert(tokens).values([
    {
      mint: "made-up-b",
      symbol: "BBB",
      name: "B",
      decimals: 5,
      tokenProgram: "spl-token",
      isListed: true,
      sortRank: 2,
    },
    {
      mint: "made-up-a",
      symbol: "AAA",
      name: "A",
      decimals: 9,
      tokenProgram: "spl-token",
      isListed: true,
      sortRank: 1,
      logoUrl: "https://example.com/a.png",
    },
    {
      mint: "made-up-usd",
      symbol: "USD",
      name: "U",
      decimals: 6,
      tokenProgram: "spl-token",
      safetyLevel: "ok",
      safetyNote: "A stablecoin keeps a mint authority by design.",
      liquidityUsd: "470000000.50",
    },
  ]);
  await handle.db.insert(tokenPrices).values([
    { mint: "made-up-a", priceUsd: "120.5", change24hPct: "-1.25", updatedAt: hoursAgo(0) },
    { mint: "made-up-usd", priceUsd: "0.9999", change24hPct: "0" },
  ]);
});

const candle = (mint: string, timeframe: "15m" | "1h" | "4h" | "1d", start: Date, close = "1") => ({
  mint,
  timeframe,
  bucketStart: start,
  open: "1",
  high: "2",
  low: "0.5",
  close,
  volumeUsd: "10",
});

describe("listed", () => {
  test("gives the tradable tokens in rank order, with trimmed prices", async () => {
    const listed = await service.listed();
    expect(listed.map((token) => [token.symbol, token.rank])).toEqual([
      ["AAA", 1],
      ["BBB", 2],
    ]);
    expect(listed[0]).toMatchObject({
      mint: "made-up-a",
      decimals: 9,
      logoUrl: "https://example.com/a.png",
      priceUsd: "120.5",
      change24hPct: "-1.25",
    });
    expect(listed[0]?.priceUpdatedAt).toEqual(NOW);
  });

  test("lists a token without a price yet, with nulls", async () => {
    expect((await service.listed())[1]).toMatchObject({
      symbol: "BBB",
      priceUsd: null,
      change24hPct: null,
      priceUpdatedAt: null,
      sparkline7d: [],
    });
  });

  test("draws the sparkline from the last 7 days of 4-hour closes, oldest first", async () => {
    await handle.db
      .insert(candles)
      .values([
        candle("made-up-a", "4h", hoursAgo(4), "121"),
        candle("made-up-a", "4h", hoursAgo(8), "119.500"),
        candle("made-up-a", "4h", hoursAgo(7 * 24 + 4), "90"),
        candle("made-up-a", "1h", hoursAgo(1), "130"),
        candle("made-up-b", "4h", hoursAgo(4), "0.5"),
      ]);

    const [a, b] = await service.listed();

    expect(a?.sparkline7d).toEqual(["119.5", "121"]);
    expect(b?.sparkline7d).toEqual(["0.5"]);
  });

  test("gives nothing when no token is listed", async () => {
    await handle.db.delete(tokenPrices);
    await handle.db.delete(tokens);
    expect(await service.listed()).toEqual([]);
  });
});

describe("detail", () => {
  test("describes an unlisted token with its safety and stats", async () => {
    expect(await service.detail("made-up-usd")).toMatchObject({
      symbol: "USD",
      isListed: false,
      rank: null,
      priceUsd: "0.9999",
      change24hPct: "0",
      safety: { level: "ok", note: "A stablecoin keeps a mint authority by design." },
      stats: { marketCapUsd: null, liquidityUsd: "470000000.5", volume24hUsd: null },
    });
  });

  test("describes a listed token whose safety isn't checked yet", async () => {
    expect(await service.detail("made-up-b")).toMatchObject({
      isListed: true,
      rank: 2,
      priceUsd: null,
      safety: { level: null, note: null },
      stats: { marketCapUsd: null, liquidityUsd: null, volume24hUsd: null },
    });
  });

  test("gives null for a token it doesn't know", async () => {
    expect(await service.detail("made-up-unknown")).toBeNull();
  });
});

describe("candles", () => {
  test("gives the timeframe's candles from `from` up to, not including, `to`, oldest first", async () => {
    await handle.db
      .insert(candles)
      .values([
        candle("made-up-a", "1h", hoursAgo(3), "3"),
        candle("made-up-a", "1h", hoursAgo(1), "1.10"),
        candle("made-up-a", "1h", hoursAgo(2), "2"),
        candle("made-up-a", "1h", hoursAgo(5), "5"),
        candle("made-up-a", "4h", hoursAgo(2), "4"),
      ]);

    const points = await service.candles("made-up-a", "1h", hoursAgo(3), hoursAgo(1));

    expect(points).toEqual([
      { start: hoursAgo(3), open: "1", high: "2", low: "0.5", close: "3", volumeUsd: "10" },
      { start: hoursAgo(2), open: "1", high: "2", low: "0.5", close: "2", volumeUsd: "10" },
    ]);
  });

  test(`gives at most ${MAX_CANDLES}`, async () => {
    await handle.db
      .insert(candles)
      .values(
        Array.from({ length: MAX_CANDLES + 5 }, (_, index) =>
          candle("made-up-a", "15m", new Date(NOW.getTime() - index * 15 * 60 * 1000)),
        ),
      );
    const points = await service.candles("made-up-a", "15m", hoursAgo(400), NOW);
    expect(points).toHaveLength(MAX_CANDLES);
  });

  test("gives an empty list for a known token without candles, and null for an unknown one", async () => {
    expect(await service.candles("made-up-b", "1d", hoursAgo(100), NOW)).toEqual([]);
    expect(await service.candles("made-up-unknown", "1d", hoursAgo(100), NOW)).toBeNull();
  });
});
