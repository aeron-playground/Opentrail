import { describe, expect, test } from "bun:test";
import { postgresErrorCode, UNIQUE_VIOLATION } from "./errors";

describe("postgresErrorCode", () => {
  const withCode = (code: string, cause?: unknown) =>
    Object.assign(new Error("driver error", { cause }), { code });

  test("reads the code from the error itself", () => {
    expect(postgresErrorCode(withCode("23505"))).toBe("23505");
  });

  test("reads the code from a wrapped cause", () => {
    expect(postgresErrorCode(new Error("query failed", { cause: withCode("23514") }))).toBe(
      "23514",
    );
  });

  test("returns undefined when there is no code", () => {
    expect(postgresErrorCode(new Error("no code"))).toBeUndefined();
    expect(postgresErrorCode("not an error")).toBeUndefined();
  });
});

test("names the code for a duplicate value", () => {
  expect(UNIQUE_VIOLATION).toBe("23505");
});
