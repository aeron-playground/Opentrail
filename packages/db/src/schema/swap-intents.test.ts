import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { DbHandle } from "../client";
import { postgresErrorCode, UNIQUE_VIOLATION } from "../errors";
import { createTestDb } from "../testing";
import { type NewSwapIntent, swapIntents } from "./swap-intents";
import { users } from "./users";

const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
// The SHA-256 of nothing: a hash in the right shape.
const HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

let handle: DbHandle;
let userId: string;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(swapIntents);
  await handle.db.delete(users);
  const [user] = await handle.db
    .insert(users)
    .values({ privyDid: "did:privy:maya", walletAddress: "made-up-wallet", username: "maya" })
    .returning();
  if (!user) throw new Error("insert returned no row");
  userId = user.id;
});

function buy(overrides: Partial<NewSwapIntent> = {}): NewSwapIntent {
  return {
    userId,
    side: "buy",
    inputMint: "made-up-usdc-mint",
    outputMint: "made-up-token-mint",
    inAmountRaw: 100_000_000n,
    expectedOutRaw: 3_169_210n,
    minOutRaw: 3_153_364n,
    feeBps: 10,
    feeUsdcMicro: 100_000n,
    slippageBps: 50,
    priceImpactBps: 0,
    provider: "jupiter",
    routeLabel: "Made-up pool",
    messageHash: HASH,
    lastValidBlockHeight: 300_000_000n,
    expiresAt: new Date("2026-10-01T12:00:45.000Z"),
    ...overrides,
  };
}

async function failure(values: NewSwapIntent): Promise<string | undefined> {
  return handle.db
    .insert(swapIntents)
    .values(values)
    .then(
      () => undefined,
      (error: unknown) => postgresErrorCode(error),
    );
}

describe("swap_intents", () => {
  test("saves a built swap, with defaults for its kind and status", async () => {
    const [row] = await handle.db.insert(swapIntents).values(buy()).returning();
    expect(row).toMatchObject({ kind: "swap", status: "built", signature: null, finishedAt: null });
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("keeps every digit of amounts too big for a JavaScript number", async () => {
    const huge = 123_456_789_012_345_678_901_234_567_890n;
    const [row] = await handle.db
      .insert(swapIntents)
      .values(buy({ inAmountRaw: huge, expectedOutRaw: huge, minOutRaw: huge - 1n }))
      .returning();
    const [read] = await handle.db
      .select()
      .from(swapIntents)
      .where(eq(swapIntents.id, row?.id ?? ""));
    expect(read?.inAmountRaw).toBe(huge);
    expect(read?.minOutRaw).toBe(huge - 1n);
  });

  test("allows another intent kind without swap fields", async () => {
    const withdrawal = buy({
      kind: "withdraw",
      side: null,
      expectedOutRaw: null,
      minOutRaw: null,
      provider: null,
      destinationAddress: "made-up-address",
    });
    expect(await failure(withdrawal)).toBeUndefined();
  });

  test.each<[string, Partial<NewSwapIntent>]>([
    ["an unknown kind", { kind: "loan" as never }],
    ["an unknown side", { side: "short" as never }],
    ["an unknown status", { status: "pending" as never }],
    ["an unknown provider", { provider: "other" as never }],
    ["an amount of zero", { inAmountRaw: 0n }],
    ["a minimum above the expected amount", { minOutRaw: 3_169_211n }],
    ["a negative minimum", { minOutRaw: -1n }],
    ["a negative fee", { feeUsdcMicro: -1n }],
    ["a negative fee rate", { feeBps: -1 }],
    ["a hash in capitals", { messageHash: HASH.toUpperCase() }],
    ["a hash too short", { messageHash: HASH.slice(1) }],
    ["a swap without a side", { side: null }],
    ["a swap without an expected amount", { expectedOutRaw: null }],
    ["a swap without a provider", { provider: null }],
  ])("refuses %s", async (_, overrides) => {
    expect(await failure(buy(overrides))).toBe(CHECK_VIOLATION);
  });

  test("refuses a second intent with the same transaction signature", async () => {
    await handle.db.insert(swapIntents).values(buy({ signature: "made-up-signature" }));
    expect(await failure(buy({ signature: "made-up-signature" }))).toBe(UNIQUE_VIOLATION);
  });

  test("refuses an intent for a user who doesn't exist", async () => {
    expect(await failure(buy({ userId: "0192a0a0-0000-7000-8000-000000000000" }))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
  });
});
