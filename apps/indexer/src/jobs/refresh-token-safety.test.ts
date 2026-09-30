import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { candles, type DbHandle, tokenPrices, tokens } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { createFakeJupiterTokens } from "../providers/jupiter/fake";
import type { TokenMarket } from "../providers/jupiter/types";
import { createFakeSolanaMints } from "../providers/solana/fake";
import type { MintAuthorities } from "../providers/solana/types";
import { createSafetyBook } from "../safety-book";
import { capturedLogger } from "../testing";
import { refreshTokenSafetyJob } from "./refresh-token-safety";

let handle: DbHandle;

beforeAll(async () => {
  handle = await createTestDb("indexer");
});

afterAll(async () => {
  await handle.close();
});

const CHECKED_AT = new Date("2026-10-01T09:00:00.000Z");

beforeEach(async () => {
  await handle.db.delete(candles);
  await handle.db.delete(tokenPrices);
  await handle.db.delete(tokens);
  // Made-up tokens: the addresses name nothing real.
  const token = (mint: string, fields: Partial<typeof tokens.$inferInsert> = {}) => ({
    mint,
    symbol: mint.slice(-3).toUpperCase(),
    name: mint,
    decimals: 6,
    tokenProgram: "spl-token" as const,
    ...fields,
  });
  await handle.db
    .insert(tokens)
    .values([
      token("made-up-aaa", { isListed: true, sortRank: 1 }),
      token("made-up-bbb", { isListed: true, sortRank: 2, safetyLevel: "ok" }),
      token("made-up-usd", { safetyNote: "The issuer keeps both authorities by design." }),
    ]);
});

const MARKET: TokenMarket = {
  isVerified: true,
  liquidityUsd: "5877443.92",
  marketCapUsd: "1084239675.82",
  volume24hUsd: "17085883.60",
};
const REVOKED: MintAuthorities = { mintAuthorityRevoked: true, freezeAuthorityRevoked: true };
const KEPT: MintAuthorities = { mintAuthorityRevoked: false, freezeAuthorityRevoked: false };

function setup(market: Record<string, TokenMarket>, chain: Record<string, MintAuthorities>) {
  const jupiter = createFakeJupiterTokens(market);
  const solana = createFakeSolanaMints(chain);
  const { logger, lines } = capturedLogger();
  const job = refreshTokenSafetyJob({
    safetyBook: createSafetyBook(handle.db),
    jupiter,
    solana,
    logger,
    now: () => CHECKED_AT,
  });
  return { job, jupiter, solana, lines };
}

const row = async (mint: string) =>
  (await handle.db.select().from(tokens).where(eq(tokens.mint, mint)))[0];
const warnings = (lines: Record<string, unknown>[]) =>
  lines.filter((line) => line.level === "warn").map((line) => line.msg);

describe("refresh-token-safety", () => {
  test("checks every token, listed or not, in one call to each source", async () => {
    const { job, jupiter, solana } = setup(
      { "made-up-aaa": MARKET, "made-up-bbb": MARKET, "made-up-usd": MARKET },
      { "made-up-aaa": REVOKED, "made-up-bbb": REVOKED, "made-up-usd": KEPT },
    );

    await job.run();

    const all = ["made-up-aaa", "made-up-bbb", "made-up-usd"];
    expect(jupiter.calls).toEqual([all]);
    expect(solana.calls).toEqual([all]);
    expect(await row("made-up-aaa")).toMatchObject({
      isJupiterVerified: true,
      mintAuthorityRevoked: true,
      freezeAuthorityRevoked: true,
      liquidityUsd: "5877443.92",
      marketCapUsd: "1084239675.82",
      volume24hUsd: "17085883.60",
      safetyLevel: "ok",
      safetyCheckedAt: CHECKED_AT,
    });
    // Both authorities kept, but a reviewed note explains why.
    expect(await row("made-up-usd")).toMatchObject({
      mintAuthorityRevoked: false,
      safetyLevel: "ok",
    });
  });

  test("marks thin or unverified tokens, and kept authorities without a note", async () => {
    const { job } = setup(
      {
        "made-up-aaa": { ...MARKET, liquidityUsd: "50000" },
        "made-up-bbb": MARKET,
        "made-up-usd": { ...MARKET, isVerified: false },
      },
      { "made-up-aaa": REVOKED, "made-up-bbb": KEPT, "made-up-usd": REVOKED },
    );

    await job.run();

    expect((await row("made-up-aaa"))?.safetyLevel).toBe("high_risk");
    expect((await row("made-up-bbb"))?.safetyLevel).toBe("caution");
    expect((await row("made-up-usd"))?.safetyLevel).toBe("high_risk");
  });

  test("says when a token's level changes, and not on its first check", async () => {
    const { job, lines } = setup(
      { "made-up-aaa": MARKET, "made-up-bbb": MARKET, "made-up-usd": MARKET },
      { "made-up-aaa": REVOKED, "made-up-bbb": KEPT, "made-up-usd": KEPT },
    );

    await job.run();

    expect(lines.filter((line) => line.msg === "a token's safety level changed")).toEqual([
      expect.objectContaining({ symbol: "BBB", from: "ok", to: "caution" }),
    ]);
  });

  test("keeps the last checks of a token either source skips, and says so once", async () => {
    await handle.db
      .update(tokens)
      .set({ liquidityUsd: "123.00", safetyLevel: "caution" })
      .where(eq(tokens.mint, "made-up-bbb"));
    const { job, lines } = setup(
      { "made-up-aaa": MARKET, "made-up-bbb": MARKET },
      { "made-up-aaa": REVOKED, "made-up-usd": KEPT },
    );

    await job.run();
    await job.run();

    expect(await row("made-up-bbb")).toMatchObject({
      liquidityUsd: "123.00",
      safetyLevel: "caution",
      safetyCheckedAt: null,
    });
    expect((await row("made-up-aaa"))?.safetyLevel).toBe("ok");
    expect(warnings(lines)).toEqual([
      "no safety data for some tokens; they keep their last checks",
    ]);
    expect(lines.find((line) => line.msg === warnings(lines)[0])).toMatchObject({
      missing: ["BBB", "USD"],
    });
  });

  test("changes nothing when a source fails, so the scheduler can try again", async () => {
    const { job, solana } = setup({ "made-up-aaa": MARKET }, { "made-up-aaa": REVOKED });
    solana.failWith(new Error("The Solana server answered 429"));

    await expect(job.run()).rejects.toThrow("The Solana server answered 429");

    expect((await row("made-up-aaa"))?.safetyCheckedAt).toBeNull();
  });

  test("asks nothing when no token is known", async () => {
    await handle.db.delete(tokens);
    const { job, jupiter, solana } = setup({}, {});
    await job.run();
    expect(jupiter.calls).toEqual([]);
    expect(solana.calls).toEqual([]);
  });

  test("runs every 10 minutes", () => {
    expect(setup({}, {}).job).toMatchObject({ name: "refresh-token-safety", everyMs: 600_000 });
  });
});
