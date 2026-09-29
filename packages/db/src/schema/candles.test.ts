import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { DbHandle } from "../client";
import { postgresErrorCode, UNIQUE_VIOLATION } from "../errors";
import { createTestDb } from "../testing";
import { candles, type NewCandle } from "./candles";
import { tokens } from "./tokens";

const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";

let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(candles);
  await handle.db.delete(tokens);
  // A made-up token: the address names nothing real.
  await handle.db.insert(tokens).values({
    mint: "made-up-mint",
    symbol: "MADE",
    name: "Made Up",
    decimals: 9,
    tokenProgram: "spl-token",
  });
});

// A real 15-minute SOL candle from GeckoTerminal (2026-09-29), on the made-up token.
function candle(overrides: Partial<NewCandle> = {}): NewCandle {
  return {
    mint: "made-up-mint",
    timeframe: "15m",
    bucketStart: new Date(1_790_694_000 * 1000),
    open: "120.33402620643214",
    high: "120.617169214674",
    low: "119.252861360384",
    close: "119.41402313269509",
    volumeUsd: "213925.60067345842",
    ...overrides,
  };
}

async function insertError(values: NewCandle): Promise<string | undefined> {
  try {
    await handle.db.insert(candles).values(values);
    return undefined;
  } catch (error) {
    return postgresErrorCode(error);
  }
}

describe("candles", () => {
  test("keeps prices to 18 places and volume to the cent, as strings", async () => {
    const [row] = await handle.db.insert(candles).values(candle()).returning();
    expect(row).toMatchObject({
      open: "120.334026206432140000",
      close: "119.414023132695090000",
      volumeUsd: "213925.60",
      bucketStart: new Date("2026-09-29T13:40:00.000Z"),
    });
  });

  test("keeps one candle per token, timeframe and start", async () => {
    await handle.db.insert(candles).values(candle());
    expect(await insertError(candle({ close: "119" }))).toBe(UNIQUE_VIOLATION);
    await handle.db.insert(candles).values(candle({ timeframe: "1h" }));
    expect(await handle.db.$count(candles)).toBe(2);
  });

  test("refuses a candle for a token it doesn't know", async () => {
    expect(await insertError(candle({ mint: "unknown-mint" }))).toBe(FOREIGN_KEY_VIOLATION);
  });

  test.each([
    ["a timeframe it doesn't know", { timeframe: "5m" as never }],
    ["a price of zero", { open: "0" }],
    ["a negative price", { low: "-1" }],
    ["a high below the low", { high: "100", low: "101" }],
    ["a negative volume", { volumeUsd: "-0.01" }],
  ])("refuses %s", async (_, overrides) => {
    expect(await insertError(candle(overrides))).toBe(CHECK_VIOLATION);
  });
});
