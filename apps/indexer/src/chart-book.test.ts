import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { candles, type DbHandle, tokens } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { type ChartBook, createChartBook } from "./chart-book";
import type { CandleQuote } from "./providers/geckoterminal/types";

let handle: DbHandle;
let book: ChartBook;

beforeAll(async () => {
  handle = await createTestDb("indexer");
  book = createChartBook(handle.db);
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(candles);
  await handle.db.delete(tokens);
  // Made-up tokens: the addresses name nothing real.
  await handle.db.insert(tokens).values([
    {
      mint: "made-up-b",
      symbol: "B",
      name: "B",
      decimals: 6,
      tokenProgram: "spl-token",
      isListed: true,
      sortRank: 2,
    },
    {
      mint: "made-up-a",
      symbol: "A",
      name: "A",
      decimals: 6,
      tokenProgram: "spl-token",
      isListed: true,
      sortRank: 1,
    },
    { mint: "made-up-usd", symbol: "U", name: "U", decimals: 6, tokenProgram: "spl-token" },
  ]);
});

const candle = (hour: number, close = "1.5"): CandleQuote => ({
  bucketStart: new Date(Date.UTC(2026, 8, 29, hour)),
  open: "1",
  high: "2",
  low: "0.5",
  close,
  volumeUsd: "100",
});

describe("chart book", () => {
  test("lists the tradable tokens with their pools, in list order", async () => {
    await book.setPrimaryPool("made-up-b", "made-up-pool");
    expect(await book.listedTokens()).toEqual([
      { mint: "made-up-a", primaryPoolAddress: null },
      { mint: "made-up-b", primaryPoolAddress: "made-up-pool" },
    ]);
  });

  test("saves candles and updates the one still open", async () => {
    expect(await book.saveCandles("made-up-a", "1h", [candle(10), candle(11)])).toBe(2);

    expect(await book.saveCandles("made-up-a", "1h", [candle(11, "1.75")])).toBe(1);

    const rows = await handle.db.select().from(candles).where(eq(candles.mint, "made-up-a"));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.bucketStart.getUTCHours() === 11)?.close).toBe(
      "1.750000000000000000",
    );
  });

  test("saves nothing for no candles", async () => {
    expect(await book.saveCandles("made-up-a", "1h", [])).toBe(0);
  });

  test("finds a chart's newest candle, per timeframe", async () => {
    expect(await book.newestBucket("made-up-a", "1h")).toBeNull();
    await book.saveCandles("made-up-a", "1h", [candle(9), candle(12), candle(10)]);
    await book.saveCandles("made-up-a", "1d", [candle(0)]);

    expect(await book.newestBucket("made-up-a", "1h")).toEqual(new Date(Date.UTC(2026, 8, 29, 12)));
    expect(await book.newestBucket("made-up-b", "1h")).toBeNull();
  });

  test("deletes only the timeframe's candles from before the cutoff", async () => {
    await book.saveCandles("made-up-a", "15m", [candle(8), candle(9), candle(10)]);
    await book.saveCandles("made-up-a", "1d", [candle(8)]);

    expect(await book.deleteCandlesBefore("15m", new Date(Date.UTC(2026, 8, 29, 10)))).toBe(2);

    expect(await handle.db.$count(candles)).toBe(2);
  });
});
