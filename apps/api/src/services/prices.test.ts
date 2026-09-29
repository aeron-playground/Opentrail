import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, tokenPrices, tokens } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { createPriceReader, type PriceReader } from "./prices";

let handle: DbHandle;
let reader: PriceReader;

beforeAll(async () => {
  handle = await createTestDb("api");
  reader = createPriceReader(handle.db);
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(tokenPrices);
  await handle.db.delete(tokens);
  // Made-up tokens: the addresses name nothing real.
  await handle.db.insert(tokens).values(
    ["made-up-a", "made-up-b", "made-up-c"].map((mint) => ({
      mint,
      symbol: "M",
      name: "M",
      decimals: 6,
      tokenProgram: "spl-token" as const,
    })),
  );
  await handle.db.insert(tokenPrices).values([
    { mint: "made-up-a", priceUsd: "1.5", change24hPct: "-2.25" },
    { mint: "made-up-b", priceUsd: "0.0000037264429947363744", change24hPct: null },
    { mint: "made-up-c", priceUsd: "120", change24hPct: "0" },
  ]);
});

describe("current", () => {
  test("gives the asked prices without the padding zeros, in mint order", async () => {
    expect(await reader.current(["made-up-c", "made-up-a"])).toEqual([
      { mint: "made-up-a", priceUsd: "1.5", change24hPct: "-2.25" },
      { mint: "made-up-c", priceUsd: "120", change24hPct: "0" },
    ]);
  });

  test("keeps a tiny price's 18 decimal places and a missing change", async () => {
    expect(await reader.current(["made-up-b"])).toEqual([
      { mint: "made-up-b", priceUsd: "0.000003726442994736", change24hPct: null },
    ]);
  });

  test("leaves out a mint with no price, and asks nothing for no mints", async () => {
    expect(await reader.current(["made-up-unpriced"])).toEqual([]);
    expect(await reader.current([])).toEqual([]);
  });
});
