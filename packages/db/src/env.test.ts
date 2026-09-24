import { describe, expect, test } from "bun:test";
import { readDbEnv, readTestDbEnv } from "./env";

describe("readDbEnv", () => {
  const cases: { name: string; url: string | undefined; valid: boolean }[] = [
    { name: "postgres URL", url: "postgres://app:app@localhost:5432/app", valid: true },
    { name: "postgresql URL", url: "postgresql://app:app@db.internal:5432/app", valid: true },
    { name: "missing", url: undefined, valid: false },
    { name: "empty", url: "", valid: false },
    { name: "not a URL", url: "localhost:5432/app", valid: false },
    { name: "wrong protocol", url: "mysql://app:app@localhost:3306/app", valid: false },
  ];

  for (const { name, url, valid } of cases) {
    test(`${valid ? "accepts" : "rejects"} ${name}`, () => {
      const read = () => readDbEnv({ DATABASE_URL: url });
      if (valid) {
        expect(read()).toEqual({ DATABASE_URL: url ?? "" });
      } else {
        expect(read).toThrow("Invalid database settings");
      }
    });
  }

  test("never puts the password in the error message", () => {
    const read = () => readDbEnv({ DATABASE_URL: "mysql://app:s3cret-pass@localhost/app" });
    expect(read).toThrow("DATABASE_URL");
    expect(read).not.toThrow("s3cret-pass");
  });
});

describe("readTestDbEnv", () => {
  test("defaults to the local Docker test database", () => {
    expect(readTestDbEnv({})).toEqual({
      TEST_DATABASE_URL: "postgres://app:app@localhost:5432/app_test",
    });
  });

  test("uses TEST_DATABASE_URL when set", () => {
    const url = "postgres://ci:ci@localhost:5432/ci_test";
    expect(readTestDbEnv({ TEST_DATABASE_URL: url })).toEqual({ TEST_DATABASE_URL: url });
  });
});
