import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type DbHandle, PRICE_UPDATED_CHANNEL, tokenPrices, tokens } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { eq, sql } from "drizzle-orm";
import { createPriceBook, type PriceBook } from "./price-book";
import type { PriceQuote } from "./providers/jupiter/types";

let handle: DbHandle;
let priceBook: PriceBook;
let notified: string[];
let marker: PromiseWithResolvers<void>;

beforeAll(async () => {
  handle = await createTestDb("indexer");
  priceBook = createPriceBook(handle.db);
  await handle.listen(PRICE_UPDATED_CHANNEL, (payload) => {
    if (payload === "marker") marker.resolve();
    else notified.push(payload);
  });
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(tokenPrices);
  await handle.db.delete(tokens);
  notified = [];
  marker = Promise.withResolvers();
  // Made-up tokens: the addresses name nothing real.
  await handle.db.insert(tokens).values([
    {
      mint: "made-up-b",
      symbol: "BBB",
      name: "B",
      decimals: 6,
      tokenProgram: "spl-token",
      isListed: true,
      sortRank: 2,
    },
    {
      mint: "made-up-a",
      symbol: "AAA",
      name: "A",
      decimals: 6,
      tokenProgram: "spl-token",
      isListed: true,
      sortRank: 1,
    },
    { mint: "made-up-usd", symbol: "USD", name: "U", decimals: 6, tokenProgram: "spl-token" },
  ]);
});

// Notifications arrive in order, so once the marker is in, every earlier one is too.
async function notificationsSoFar(): Promise<string[]> {
  await handle.db.execute(sql`select pg_notify(${PRICE_UPDATED_CHANNEL}, 'marker')`);
  await marker.promise;
  return notified;
}

const quotes = (entries: Record<string, PriceQuote>) => new Map(Object.entries(entries));
const priceOf = async (mint: string) =>
  (await handle.db.select().from(tokenPrices).where(eq(tokenPrices.mint, mint)))[0];

describe("listedMints", () => {
  test("gives the tradable tokens in list order", async () => {
    expect(await priceBook.listedMints()).toEqual(["made-up-a", "made-up-b"]);
  });
});

describe("save", () => {
  test("saves new prices and announces their mints", async () => {
    const changed = await priceBook.save(
      quotes({
        "made-up-a": { priceUsd: "1.5", change24hPct: "-2.25" },
        "made-up-b": { priceUsd: "0.0000037264429947363744", change24hPct: null },
      }),
    );

    expect(changed.sort()).toEqual(["made-up-a", "made-up-b"]);
    expect(await priceOf("made-up-b")).toMatchObject({ priceUsd: "0.000003726442994736" });
    expect(await notificationsSoFar()).toEqual([expect.stringMatching(/made-up-a|made-up-b/)]);
    expect(notified[0]?.split(",").sort()).toEqual(["made-up-a", "made-up-b"]);
  });

  test("announces nothing for the same prices, but marks them confirmed", async () => {
    const same = quotes({ "made-up-a": { priceUsd: "1.5", change24hPct: "-2.25" } });
    await priceBook.save(same);
    const before = (await priceOf("made-up-a"))?.updatedAt.getTime() ?? 0;
    await Bun.sleep(5);

    expect(await priceBook.save(same)).toEqual([]);

    expect((await priceOf("made-up-a"))?.updatedAt.getTime()).toBeGreaterThan(before);
    expect(await notificationsSoFar()).toEqual(["made-up-a"]);
  });

  test("doesn't count a wobble beyond 18 decimal places as a change", async () => {
    await priceBook.save(
      quotes({ "made-up-a": { priceUsd: "0.1234567890123456781", change24hPct: null } }),
    );
    const changed = await priceBook.save(
      quotes({ "made-up-a": { priceUsd: "0.1234567890123456784", change24hPct: null } }),
    );
    expect(changed).toEqual([]);
  });

  test("counts a new 24-hour change as a change", async () => {
    await priceBook.save(quotes({ "made-up-a": { priceUsd: "1.5", change24hPct: "1" } }));
    expect(
      await priceBook.save(quotes({ "made-up-a": { priceUsd: "1.5", change24hPct: "2" } })),
    ).toEqual(["made-up-a"]);
  });

  test("leaves a token that got no quote as it was", async () => {
    await priceBook.save(
      quotes({
        "made-up-a": { priceUsd: "1", change24hPct: null },
        "made-up-b": { priceUsd: "2", change24hPct: null },
      }),
    );
    const before = await priceOf("made-up-b");
    await Bun.sleep(5);

    await priceBook.save(quotes({ "made-up-a": { priceUsd: "1.1", change24hPct: null } }));

    expect(await priceOf("made-up-b")).toEqual(before);
  });

  test("does nothing for no quotes", async () => {
    expect(await priceBook.save(new Map())).toEqual([]);
    expect(await notificationsSoFar()).toEqual([]);
  });

  test("splits a long list of changed mints over several notifications", async () => {
    const many = Array.from(
      { length: 101 },
      (_, index) => `made-up-${String(index).padStart(3, "0")}`,
    );
    await handle.db.insert(tokens).values(
      many.map((mint) => ({
        mint,
        symbol: "M",
        name: "M",
        decimals: 6,
        tokenProgram: "spl-token" as const,
      })),
    );

    await priceBook.save(
      quotes(Object.fromEntries(many.map((mint) => [mint, { priceUsd: "1", change24hPct: null }]))),
    );

    expect((await notificationsSoFar()).map((payload) => payload.split(",").length)).toEqual([
      100, 1,
    ]);
  });
});
