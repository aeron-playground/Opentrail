import { describe, expect, test } from "bun:test";
import { fixtureFileName, SIGNATURE, unsafeNumberPath } from "./capture";

const SIGNATURE_EXAMPLE =
  "3AeyuLVPMr53xVWnf1jLsnFCCAtRTUBCtF9yQMAK5iTTxBXZAXeg345HnGutQs6asRs7d1d9BaQrjnsH71ZAUrs4";

describe("SIGNATURE", () => {
  test("accepts a base58 signature and refuses other text", () => {
    expect(SIGNATURE.test(SIGNATURE_EXAMPLE)).toBe(true);
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

describe("fixtureFileName", () => {
  test("names the file after the name given", () => {
    expect(fixtureFileName(SIGNATURE_EXAMPLE, "transfer-usdc")).toBe("transfer-usdc.json");
  });

  test("names the file after the signature when no name is given", () => {
    expect(fixtureFileName(SIGNATURE_EXAMPLE)).toBe(`${SIGNATURE_EXAMPLE}.json`);
  });

  test.each(["../escape", "Transfer", "two words", "a/b", ""])("refuses the name %p", (name) => {
    expect(fixtureFileName(SIGNATURE_EXAMPLE, name)).toBeNull();
  });

  test("refuses a signature that isn't one", () => {
    expect(fixtureFileName("0xabc", "transfer-usdc")).toBeNull();
  });
});
