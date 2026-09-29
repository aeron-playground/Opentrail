import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { DbHandle } from "../client";
import { postgresErrorCode, UNIQUE_VIOLATION } from "../errors";
import { createTestDb } from "../testing";
import { type NewToken, tokens } from "./tokens";

const CHECK_VIOLATION = "23514";

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

// A made-up token: the address names nothing real.
function token(overrides: Partial<NewToken> = {}): NewToken {
  return {
    mint: "made-up-mint",
    symbol: "MADE",
    name: "Made Up",
    decimals: 6,
    tokenProgram: "spl-token",
    ...overrides,
  };
}

async function insertError(values: NewToken): Promise<string | undefined> {
  try {
    await handle.db.insert(tokens).values(values);
    return undefined;
  } catch (error) {
    return postgresErrorCode(error);
  }
}

describe("tokens", () => {
  test("starts unlisted, with the market-data columns empty", async () => {
    const [row] = await handle.db.insert(tokens).values(token()).returning();

    expect(row).toMatchObject({
      isListed: false,
      sortRank: null,
      primaryPoolAddress: null,
      isJupiterVerified: null,
      liquidityUsd: null,
      safetyLevel: null,
      safetyNote: null,
    });
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  test("keeps liquidity to the cent, as a string", async () => {
    await handle.db.insert(tokens).values(token({ liquidityUsd: "123456789012345678.99" }));
    const [row] = await handle.db.select().from(tokens).where(eq(tokens.mint, "made-up-mint"));
    expect(row?.liquidityUsd).toBe("123456789012345678.99");
  });

  test("accepts both token programs and every safety level", async () => {
    await handle.db
      .insert(tokens)
      .values([
        token({ mint: "made-up-a", tokenProgram: "spl-token", safetyLevel: "ok" }),
        token({ mint: "made-up-b", tokenProgram: "token-2022", safetyLevel: "caution" }),
        token({ mint: "made-up-c", safetyLevel: "high_risk" }),
      ]);
    expect(await handle.db.$count(tokens)).toBe(3);
  });

  test("keeps one row per mint", async () => {
    await handle.db.insert(tokens).values(token());
    expect(await insertError(token({ symbol: "OTHER" }))).toBe(UNIQUE_VIOLATION);
  });

  test.each([
    ["a program it doesn't know", { tokenProgram: "token-2023" as never }],
    ["decimals below 0", { decimals: -1 }],
    ["decimals above one byte", { decimals: 256 }],
    ["a safety level it doesn't know", { safetyLevel: "fine" as never }],
  ])("refuses %s", async (_, overrides) => {
    expect(await insertError(token(overrides))).toBe(CHECK_VIOLATION);
  });

  test("moves updated_at when a row changes", async () => {
    const [before] = await handle.db.insert(tokens).values(token()).returning();
    await Bun.sleep(5);
    const [after] = await handle.db
      .update(tokens)
      .set({ isListed: true })
      .where(eq(tokens.mint, "made-up-mint"))
      .returning();
    expect(after?.updatedAt.getTime()).toBeGreaterThan(before?.updatedAt.getTime() ?? Infinity);
  });
});
