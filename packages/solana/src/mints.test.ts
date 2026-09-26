import { describe, expect, test } from "bun:test";
import { isSolanaAddress } from "./address";
import { SOL, USDC } from "./mints";

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
