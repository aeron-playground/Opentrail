import { describe, expect, test } from "bun:test";
import { ERROR_CODES, ERRORS } from "./errors";

describe("ERRORS", () => {
  for (const code of ERROR_CODES) {
    const { status, message } = ERRORS[code];

    test(`${code} is a stable, upper snake case code`, () => {
      expect(code).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
    });

    test(`${code} has an HTTP error status`, () => {
      expect(Number.isInteger(status)).toBe(true);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThanOrEqual(599);
    });

    test(`${code} has a calm, complete sentence as its message`, () => {
      expect(message).toMatch(/^[A-Z].*\.$/);
      expect(message).not.toContain("!");
    });
  }
});
