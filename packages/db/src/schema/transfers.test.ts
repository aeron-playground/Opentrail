import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { DbHandle } from "../client";
import { postgresErrorCode, UNIQUE_VIOLATION } from "../errors";
import { createTestDb } from "../testing";
import { type NewTransfer, transfers } from "./transfers";
import { users } from "./users";

const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";

let handle: DbHandle;
let userId: string;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(transfers);
  await handle.db.delete(users);
  const [user] = await handle.db
    .insert(users)
    .values({ privyDid: "did:privy:maya", walletAddress: "made-up-wallet", username: "maya" })
    .returning();
  if (!user) throw new Error("insert returned no row");
  userId = user.id;
});

function deposit(overrides: Partial<NewTransfer> = {}): NewTransfer {
  return {
    userId,
    walletAddress: "made-up-wallet",
    signature: "made-up-signature",
    slot: 1n,
    blockTime: new Date("2026-09-27T10:00:00.000Z"),
    direction: "in",
    mint: "made-up-mint",
    amountRaw: 50_000_000n,
    kind: "deposit",
    ...overrides,
  };
}

async function insertError(values: NewTransfer): Promise<string | undefined> {
  try {
    await handle.db.insert(transfers).values(values);
    return undefined;
  } catch (error) {
    return postgresErrorCode(error);
  }
}

describe("transfers", () => {
  test("keeps every digit of a huge amount, and the slot, as bigint", async () => {
    const huge = 10n ** 39n - 1n;
    const [row] = await handle.db
      .insert(transfers)
      .values(deposit({ amountRaw: huge, slot: 9_007_199_254_740_993n }))
      .returning();

    expect(row?.amountRaw).toBe(huge);
    expect(row?.slot).toBe(9_007_199_254_740_993n);
  });

  test("stores a transaction once per user, mint, direction and kind", async () => {
    await handle.db.insert(transfers).values(deposit());
    expect(await insertError(deposit())).toBe(UNIQUE_VIOLATION);

    const skipped = await handle.db
      .insert(transfers)
      .values(deposit())
      .onConflictDoNothing()
      .returning();
    expect(skipped).toHaveLength(0);
    expect(await insertError(deposit({ mint: "another-mint" }))).toBeUndefined();
  });

  test.each([
    ["an amount of zero", { amountRaw: 0n }],
    ["a negative amount", { amountRaw: -1n }],
  ])("refuses %s", async (_, overrides) => {
    expect(await insertError(deposit(overrides))).toBe(CHECK_VIOLATION);
  });

  test("refuses an unknown direction or kind", async () => {
    for (const [column, value] of [
      ["direction", "sideways"],
      ["kind", "gift"],
    ] as const) {
      let code: string | undefined;
      try {
        await handle.db.execute(sql`
          insert into transfers (id, user_id, wallet_address, signature, slot, block_time, direction, mint, amount_raw, kind)
          values (${Bun.randomUUIDv7()}, ${userId}, 'w', ${`sig-${column}`}, 1, now(),
                  ${column === "direction" ? value : "in"}, 'm', 1, ${column === "kind" ? value : "deposit"})
        `);
      } catch (error) {
        code = postgresErrorCode(error);
      }
      expect(code).toBe(CHECK_VIOLATION);
    }
  });

  test("belongs to a user who exists", async () => {
    expect(await insertError(deposit({ userId: Bun.randomUUIDv7() }))).toBe(FOREIGN_KEY_VIOLATION);
  });
});
