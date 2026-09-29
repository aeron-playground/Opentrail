import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { DbHandle } from "../client";
import { postgresErrorCode } from "../errors";
import { createTestDb } from "../testing";
import { type NewTokenPrice, tokenPrices } from "./token-prices";
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
  await handle.db.delete(tokenPrices);
  await handle.db.delete(tokens);
  // A made-up token: the address names nothing real.
  await handle.db.insert(tokens).values({
    mint: "made-up-mint",
    symbol: "MADE",
    name: "Made Up",
    decimals: 5,
    tokenProgram: "spl-token",
  });
});

async function saved(values: NewTokenPrice) {
  await handle.db.insert(tokenPrices).values(values);
  const [row] = await handle.db.select().from(tokenPrices).where(eq(tokenPrices.mint, values.mint));
  return row;
}

async function insertError(values: NewTokenPrice): Promise<string | undefined> {
  try {
    await handle.db.insert(tokenPrices).values(values);
    return undefined;
  } catch (error) {
    return postgresErrorCode(error);
  }
}

describe("token_prices", () => {
  test("keeps a tiny price to 18 decimal places, as a string", async () => {
    // BONK's real price from Jupiter, 2026-09-29.
    const row = await saved({ mint: "made-up-mint", priceUsd: "0.0000037264429947363744" });
    expect(row?.priceUsd).toBe("0.000003726442994736");
  });

  test("keeps a negative 24-hour change to 4 decimal places", async () => {
    const row = await saved({
      mint: "made-up-mint",
      priceUsd: "0.3290360488731354",
      change24hPct: "-4.821237250067719",
    });
    expect(row?.change24hPct).toBe("-4.8212");
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });

  test("refuses a price for a token it doesn't know", async () => {
    expect(await insertError({ mint: "unknown-mint", priceUsd: "1" })).toBe(FOREIGN_KEY_VIOLATION);
  });

  test.each(["0", "-1.5"])("refuses the price %s", async (priceUsd) => {
    expect(await insertError({ mint: "made-up-mint", priceUsd })).toBe(CHECK_VIOLATION);
  });
});
