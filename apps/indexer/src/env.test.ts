import { describe, expect, test } from "bun:test";
import { readIndexerEnv } from "./env";

const DATABASE_URL = "postgres://app:app@localhost:5432/app";
const HELIUS_WEBHOOK_SECRET = "a-webhook-secret-that-is-long-enough-123";

describe("readIndexerEnv", () => {
  test("uses local defaults, with the address sync off", () => {
    expect(readIndexerEnv({ DATABASE_URL, HELIUS_WEBHOOK_SECRET })).toEqual({
      DATABASE_URL,
      HELIUS_WEBHOOK_SECRET,
      HELIUS_API_KEY: undefined,
      HELIUS_WEBHOOK_ID: undefined,
      PORT: 3002,
      LOG_LEVEL: "info",
    });
  });

  test("turns the address sync on with both Helius settings", () => {
    expect(
      readIndexerEnv({
        DATABASE_URL,
        HELIUS_WEBHOOK_SECRET,
        HELIUS_API_KEY: "made-up-key",
        HELIUS_WEBHOOK_ID: "made-up-webhook",
      }),
    ).toMatchObject({ HELIUS_API_KEY: "made-up-key", HELIUS_WEBHOOK_ID: "made-up-webhook" });
  });

  test("reads empty Helius settings as unset", () => {
    const env = readIndexerEnv({
      DATABASE_URL,
      HELIUS_WEBHOOK_SECRET,
      HELIUS_API_KEY: "",
      HELIUS_WEBHOOK_ID: "",
    });
    expect(env.HELIUS_API_KEY).toBeUndefined();
    expect(env.HELIUS_WEBHOOK_ID).toBeUndefined();
  });

  const invalid: { name: string; env: Record<string, string | undefined> }[] = [
    { name: "a Helius API key without a webhook id", env: { HELIUS_API_KEY: "made-up-key" } },
    { name: "a Helius webhook id without an API key", env: { HELIUS_WEBHOOK_ID: "made-up-id" } },
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
