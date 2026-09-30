import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { candles, type DbHandle, tokenPrices, tokens } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { createSafetyBook, type SafetyBook, type SafetyCheck } from "./safety-book";

let handle: DbHandle;
let safetyBook: SafetyBook;

beforeAll(async () => {
  handle = await createTestDb("indexer");
  safetyBook = createSafetyBook(handle.db);
});

afterAll(async () => {
  await handle.close();
});

// Made-up tokens: the addresses name nothing real.
const token = (mint: string, fields: Partial<typeof tokens.$inferInsert> = {}) => ({
  mint,
  symbol: mint.toUpperCase(),
  name: mint,
  decimals: 6,
  tokenProgram: "spl-token" as const,
  ...fields,
});

beforeEach(async () => {
  await handle.db.delete(candles);
  await handle.db.delete(tokenPrices);
  await handle.db.delete(tokens);
  await handle.db
    .insert(tokens)
    .values([
      token("made-up-b", { isListed: true, sortRank: 2 }),
      token("made-up-usd", { safetyNote: "A reviewed reason." }),
      token("made-up-a", { isListed: true, sortRank: 1, safetyLevel: "caution" }),
    ]);
});

const check = (mint: string, fields: Partial<SafetyCheck> = {}): SafetyCheck => ({
  mint,
  isJupiterVerified: true,
  mintAuthorityRevoked: true,
  freezeAuthorityRevoked: true,
  liquidityUsd: "5877443.9157540025",
  marketCapUsd: "1084239675.815317",
  volume24hUsd: "17085883.597498145",
  safetyLevel: "ok",
  ...fields,
});

const row = async (mint: string) =>
  (await handle.db.select().from(tokens).where(eq(tokens.mint, mint)))[0];

describe("tokens", () => {
  test("lists every token, listed ones first in rank order, with its note and level", async () => {
    expect(await safetyBook.tokens()).toEqual([
      { mint: "made-up-a", symbol: "MADE-UP-A", hasReviewedNote: false, safetyLevel: "caution" },
      { mint: "made-up-b", symbol: "MADE-UP-B", hasReviewedNote: false, safetyLevel: null },
      { mint: "made-up-usd", symbol: "MADE-UP-USD", hasReviewedNote: true, safetyLevel: null },
    ]);
  });
});

describe("save", () => {
  test("saves the checks, the stats to the cent, the level and the time", async () => {
    const checkedAt = new Date("2026-10-01T09:00:00.000Z");

    await safetyBook.save(
      [
        check("made-up-a"),
        check("made-up-b", {
          safetyLevel: "high_risk",
          isJupiterVerified: false,
          liquidityUsd: null,
        }),
      ],
      checkedAt,
    );

    expect(await row("made-up-a")).toMatchObject({
      isJupiterVerified: true,
      mintAuthorityRevoked: true,
      freezeAuthorityRevoked: true,
      liquidityUsd: "5877443.92",
      marketCapUsd: "1084239675.82",
      volume24hUsd: "17085883.60",
      safetyLevel: "ok",
    });
    expect((await row("made-up-a"))?.safetyCheckedAt).toEqual(checkedAt);
    expect(await row("made-up-b")).toMatchObject({
      safetyLevel: "high_risk",
      isJupiterVerified: false,
      liquidityUsd: null,
    });
  });

  test("leaves the list, the note and unchecked tokens alone", async () => {
    await safetyBook.save([check("made-up-usd", { mintAuthorityRevoked: false })], new Date());

    expect(await row("made-up-usd")).toMatchObject({
      safetyNote: "A reviewed reason.",
      isListed: false,
      symbol: "MADE-UP-USD",
    });
    expect(await row("made-up-a")).toMatchObject({
      safetyLevel: "caution",
      liquidityUsd: null,
      safetyCheckedAt: null,
    });
  });

  test("does nothing with no checks", async () => {
    await safetyBook.save([], new Date());
    expect((await row("made-up-a"))?.safetyCheckedAt).toBeNull();
  });
});
