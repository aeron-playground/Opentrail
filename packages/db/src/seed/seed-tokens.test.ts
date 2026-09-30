import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { SOL, USDC } from "@repo/solana";
import { eq } from "drizzle-orm";
import type { DbHandle } from "../client";
import { tokens } from "../schema/tokens";
import { createTestDb } from "../testing";
import { seedTokens } from "./seed-tokens";
import { LISTED_TOKENS, seedTokenRows, UNLISTED_TOKENS } from "./tokens";

const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(tokens);
});

const row = async (mint: string) => {
  const [found] = await handle.db.select().from(tokens).where(eq(tokens.mint, mint));
  return found;
};

describe("seedTokens", () => {
  test("loads the whole list, USDC unlisted and SOL first", async () => {
    expect(await seedTokens(handle.db)).toBe(UNLISTED_TOKENS.length + LISTED_TOKENS.length);
    expect(await row(USDC.mint)).toMatchObject({ isListed: false, sortRank: null });
    expect(await row(SOL.mint)).toMatchObject({ isListed: true, sortRank: 1, decimals: 9 });
  });

  test("can run again without adding or changing anything", async () => {
    await seedTokens(handle.db);
    const before = await handle.db.select().from(tokens).orderBy(tokens.mint);

    await seedTokens(handle.db);
    const after = await handle.db.select().from(tokens).orderBy(tokens.mint);

    const withoutTimes = (rows: typeof before) =>
      rows.map(({ updatedAt: _, createdAt: __, ...rest }) => rest);
    expect(withoutTimes(after)).toEqual(withoutTimes(before));
  });

  test("updates what the list says", async () => {
    await seedTokens(handle.db);
    const renamed = seedTokenRows().map((token) =>
      token.mint === JUP ? { ...token, name: "Jupiter (renamed)" } : token,
    );

    await seedTokens(handle.db, renamed);

    expect((await row(JUP))?.name).toBe("Jupiter (renamed)");
  });

  test("writes the reviewed safety notes, and updates them", async () => {
    await seedTokens(handle.db);
    expect((await row(USDC.mint))?.safetyNote).toStartWith("USDC is a stablecoin.");
    expect((await row(JUP))?.safetyNote).toBeNull();

    const reworded = seedTokenRows().map((token) =>
      token.mint === USDC.mint ? { ...token, safetyNote: "Reworded." } : token,
    );
    await seedTokens(handle.db, reworded);

    expect((await row(USDC.mint))?.safetyNote).toBe("Reworded.");
  });

  test("leaves the market-data columns to their jobs", async () => {
    await seedTokens(handle.db);
    await handle.db
      .update(tokens)
      .set({ liquidityUsd: "957577067.00", safetyLevel: "ok", isJupiterVerified: true })
      .where(eq(tokens.mint, SOL.mint));

    await seedTokens(handle.db);

    expect(await row(SOL.mint)).toMatchObject({
      liquidityUsd: "957577067.00",
      safetyLevel: "ok",
      isJupiterVerified: true,
    });
  });

  test("unlists a token that left the list, and keeps its row", async () => {
    await seedTokens(handle.db);

    await seedTokens(
      handle.db,
      seedTokenRows().filter((token) => token.mint !== JUP),
    );

    expect(await row(JUP)).toMatchObject({ isListed: false, sortRank: null, symbol: "JUP" });
  });
});
