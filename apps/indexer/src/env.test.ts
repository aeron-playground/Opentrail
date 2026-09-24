import { describe, expect, test } from "bun:test";
import { readIndexerEnv } from "./env";

const DATABASE_URL = "postgres://app:app@localhost:5432/app";
const HELIUS_WEBHOOK_SECRET = "a-webhook-secret-that-is-long-enough-123";

describe("readIndexerEnv", () => {
  test("uses local defaults for the port and log level", () => {
    expect(readIndexerEnv({ DATABASE_URL, HELIUS_WEBHOOK_SECRET })).toEqual({
      DATABASE_URL,
      HELIUS_WEBHOOK_SECRET,
      PORT: 3002,
      LOG_LEVEL: "info",
    });
  });

  const invalid: { name: string; env: Record<string, string | undefined> }[] = [
    { name: "a missing database URL", env: { DATABASE_URL: undefined } },
    { name: "a non-Postgres database URL", env: { DATABASE_URL: "mysql://app@localhost/app" } },
    { name: "a missing webhook secret", env: { HELIUS_WEBHOOK_SECRET: undefined } },
    { name: "a webhook secret under 32 characters", env: { HELIUS_WEBHOOK_SECRET: "too-short" } },
    { name: "port 0", env: { PORT: "0" } },
    { name: "a port that isn't a number", env: { PORT: "abc" } },
    { name: "an unknown log level", env: { LOG_LEVEL: "verbose" } },
  ];

  for (const { name, env } of invalid) {
    test(`rejects ${name}`, () => {
      const read = () => readIndexerEnv({ DATABASE_URL, HELIUS_WEBHOOK_SECRET, ...env });
      expect(read).toThrow("Invalid indexer settings");
    });
  }

  test("names the variable but never shows its value", () => {
    const read = () =>
      readIndexerEnv({
        DATABASE_URL: "mysql://app:s3cret-pass@x/app",
        HELIUS_WEBHOOK_SECRET: "s3cret",
      });
    expect(read).toThrow("DATABASE_URL");
    expect(read).toThrow("HELIUS_WEBHOOK_SECRET");
    expect(read).not.toThrow("s3cret");
  });
});
