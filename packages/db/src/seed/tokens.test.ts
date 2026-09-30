import { describe, expect, test } from "bun:test";
import { isSolanaAddress, SOL, USDC } from "@repo/solana";
import { SAFETY_NOTES } from "./safety-notes";
import { LISTED_TOKENS, seedTokenRows, UNLISTED_TOKENS } from "./tokens";

const ALL = [...UNLISTED_TOKENS, ...LISTED_TOKENS];

describe("the token list", () => {
  test("names each mint once", () => {
    expect(new Set(ALL.map((token) => token.mint)).size).toBe(ALL.length);
  });

  test.each(ALL.map((token) => [token.symbol, token] as const))(
    "%s has a valid mint, decimals Solana allows, and an https logo",
    (_, token) => {
      expect(isSolanaAddress(token.mint)).toBe(true);
      expect(token.decimals).toBeGreaterThanOrEqual(0);
      expect(token.decimals).toBeLessThanOrEqual(255);
      expect(token.logoUrl ?? "https://").toStartWith("https://");
    },
  );

  test("agrees with the tokens every part of the app knows by heart", () => {
    const find = (mint: string) => ALL.find((token) => token.mint === mint);
    expect(find(USDC.mint)).toMatchObject({ symbol: USDC.symbol, decimals: USDC.decimals });
    expect(find(SOL.mint)).toMatchObject({ symbol: SOL.symbol, decimals: SOL.decimals });
  });

  test("keeps USDC off the tradable list", () => {
    expect(LISTED_TOKENS.map((token) => token.mint)).not.toContain(USDC.mint);
  });

  test("has reviewed notes only for tokens on it that keep an authority by design", () => {
    const symbolOf = (mint: string) => ALL.find((token) => token.mint === mint)?.symbol;
    expect(Object.keys(SAFETY_NOTES).map(symbolOf).sort()).toEqual(["JitoSOL", "USDC", "mSOL"]);
  });
});

describe("seedTokenRows", () => {
  test("ranks the listed tokens from 1 in list order, and leaves the rest unranked", () => {
    const rows = seedTokenRows();
    expect(rows.filter((row) => row.isListed).map((row) => [row.symbol, row.sortRank])).toEqual(
      LISTED_TOKENS.map((token, index) => [token.symbol, index + 1]),
    );
    expect(rows.filter((row) => !row.isListed)).toEqual(
      UNLISTED_TOKENS.map((token) => ({
        ...token,
        isListed: false,
        sortRank: null,
        safetyNote: SAFETY_NOTES[token.mint] ?? null,
      })),
    );
  });

  test("gives each token its reviewed note, or none", () => {
    const noteOf = (symbol: string) =>
      seedTokenRows().find((row) => row.symbol === symbol)?.safetyNote;
    expect(noteOf("JitoSOL")).toStartWith("JitoSOL is a liquid staking token.");
    expect(noteOf("JUP")).toBeNull();
  });
});
