import { describe, expect, test } from "bun:test";
import { SWAP_EXPIRED_MESSAGE, SWAP_FAILURE_MESSAGES, SWAP_FAILURE_REASONS } from "./swaps";

describe("swap messages", () => {
  test("every failure reason has a message", () => {
    expect(Object.keys(SWAP_FAILURE_MESSAGES).sort()).toEqual([...SWAP_FAILURE_REASONS].sort());
  });

  test.each([...Object.entries(SWAP_FAILURE_MESSAGES), ["expired", SWAP_EXPIRED_MESSAGE]])(
    "%s says it in calm, complete sentences",
    (_, message) => {
      expect(message).toMatch(/^[A-Z].*\.$/);
      expect(message).not.toContain("!");
    },
  );
});
