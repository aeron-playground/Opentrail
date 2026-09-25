import { describe, expect, test } from "bun:test";
import { shortAddress } from "./address";

describe("shortAddress", () => {
  test.each([
    ["7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "7xKX…gAsU"],
    ["1234567890", "1234567890"],
    ["12345678901", "1234…8901"],
    ["", ""],
  ])("%s → %s", (address, expected) => {
    expect(shortAddress(address)).toBe(expected);
  });
});
