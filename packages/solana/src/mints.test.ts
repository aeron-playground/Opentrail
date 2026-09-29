import { describe, expect, test } from "bun:test";
import { isSolanaAddress } from "./address";
import { SOL, TOKEN_PROGRAM_NAMES, TOKEN_PROGRAMS, tokenProgramAt, USDC } from "./mints";

describe.each([
  ["USDC", USDC, 6],
  ["SOL", SOL, 9],
])("%s", (symbol, token, decimals) => {
  test("has a valid mint address", () => {
    expect(isSolanaAddress(token.mint)).toBe(true);
  });

  test(`has its symbol and ${decimals} decimals`, () => {
    expect(token.symbol).toBe(symbol);
    expect(token.decimals).toBe(decimals);
  });
});

describe("token programs", () => {
  test.each(TOKEN_PROGRAM_NAMES)("%s has a valid program address", (name) => {
    expect(isSolanaAddress(TOKEN_PROGRAMS[name])).toBe(true);
  });

  test("the two programs have different addresses", () => {
    expect(TOKEN_PROGRAMS["spl-token"]).not.toBe(TOKEN_PROGRAMS["token-2022"]);
  });

  test("finds each program's short name from its address", () => {
    expect(tokenProgramAt(TOKEN_PROGRAMS["spl-token"])).toBe("spl-token");
    expect(tokenProgramAt(TOKEN_PROGRAMS["token-2022"])).toBe("token-2022");
  });

  test("knows no name for any other address", () => {
    expect(tokenProgramAt(USDC.mint)).toBeNull();
  });
});
