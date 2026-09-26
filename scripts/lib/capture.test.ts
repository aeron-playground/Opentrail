import { describe, expect, test } from "bun:test";
import { SIGNATURE, unsafeNumberPath } from "./capture";

describe("SIGNATURE", () => {
  test("accepts a base58 signature and refuses other text", () => {
    expect(
      SIGNATURE.test(
        "3AeyuLVPMr53xVWnf1jLsnFCCAtRTUBCtF9yQMAK5iTTxBXZAXeg345HnGutQs6asRs7d1d9BaQrjnsH71ZAUrs4",
      ),
    ).toBe(true);
    expect(SIGNATURE.test("0xabc")).toBe(false);
    expect(SIGNATURE.test("short")).toBe(false);
  });
});

describe("unsafeNumberPath", () => {
  test("finds nothing in ordinary data", () => {
    expect(
      unsafeNumberPath({ meta: { preBalances: [1, 2_000_000_000], fee: 5000 }, ok: true }),
    ).toBeNull();
  });

  test("points at a number too large to keep exact", () => {
    expect(unsafeNumberPath({ meta: { postBalances: [1, 2 ** 53 + 2] } })).toBe(
      "$.meta.postBalances[1]",
    );
  });
});
