import { describe, expect, test } from "bun:test";
import { isSolanaAddress } from "./address";

describe("isSolanaAddress", () => {
  test.each([
    ["the USDC mint", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"],
    ["the system program, all ones", "11111111111111111111111111111111"],
  ])("accepts %s", (_, value) => {
    expect(isSolanaAddress(value)).toBe(true);
  });

  test.each([
    ["an Ethereum address", "0x52908400098527886E0F7030069857D2E4169EE7"],
    ["too short", "EPjFWdd5AufqSSqeM2qN1xzy"],
    ["too long", `${"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}1`],
    ["letters base58 leaves out (0, O, I, l)", "0OIlWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1"],
    ["an empty string", ""],
  ])("refuses %s", (_, value) => {
    expect(isSolanaAddress(value)).toBe(false);
  });
});
