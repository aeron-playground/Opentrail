import { describe, expect, test } from "bun:test";
import {
  BPS_PER_WHOLE,
  FEE_BPS,
  MICRO_USDC_PER_USD,
  MIN_TRADE_MICRO_USDC,
  USERNAME_PATTERN,
} from "./constants";

test("the fee on a $100 trade is 10 cents", () => {
  const trade = 100n * MICRO_USDC_PER_USD;
  expect((trade * FEE_BPS) / BPS_PER_WHOLE).toBe(100_000n);
});

test("the smallest trade is one dollar", () => {
  expect(MIN_TRADE_MICRO_USDC).toBe(1_000_000n);
});

describe("usernames", () => {
  test.each(["maya", "kiran_2", "abc", "a_______________z19"])("accepts %s", (name) => {
    expect(USERNAME_PATTERN.test(name)).toBe(true);
  });

  test.each([
    ["ab", "too short"],
    ["a".repeat(21), "too long"],
    ["2maya", "starts with a digit"],
    ["_maya", "starts with an underscore"],
    ["Maya", "has a capital: check the lowercased name"],
    ["maya-k", "has a hyphen"],
    ["maya k", "has a space"],
    ["mayá", "has an accent"],
  ])("refuses %s (%s)", (name) => {
    expect(USERNAME_PATTERN.test(name)).toBe(false);
  });
});
