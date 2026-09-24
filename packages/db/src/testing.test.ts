import { describe, expect, test } from "bun:test";
import { assertTestDatabaseUrl, postgresErrorCode } from "./testing";

describe("assertTestDatabaseUrl", () => {
  const cases: { name: string; url: string; allowed: boolean }[] = [
    { name: "a _test database", url: "postgres://app:app@localhost:5432/app_test", allowed: true },
    { name: "the dev database", url: "postgres://app:app@localhost:5432/app", allowed: false },
    { name: "no database name", url: "postgres://app:app@localhost:5432", allowed: false },
    { name: "_test in the middle", url: "postgres://app:app@localhost/app_test_x", allowed: false },
    { name: "_test in the host only", url: "postgres://app:app@db_test:5432/app", allowed: false },
  ];

  for (const { name, url, allowed } of cases) {
    test(`${allowed ? "allows" : "refuses"} ${name}`, () => {
      const check = () => assertTestDatabaseUrl(url);
      if (allowed) {
        expect(check).not.toThrow();
      } else {
        expect(check).toThrow("Refusing to reset database");
      }
    });
  }
});

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
