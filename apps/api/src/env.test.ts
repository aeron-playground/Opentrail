import { describe, expect, test } from "bun:test";
import { readApiEnv } from "./env";

const REQUIRED = {
  DATABASE_URL: "postgres://app:app@localhost:5432/app",
  PRIVY_APP_ID: "test-app-id",
  PRIVY_APP_SECRET: "test-app-secret",
};

describe("readApiEnv", () => {
  test("uses local defaults for everything but the database and Privy", () => {
    expect(readApiEnv(REQUIRED)).toEqual({
      ...REQUIRED,
      CORS_ORIGINS: ["http://localhost:5173"],
      SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
      PORT: 3001,
      LOG_LEVEL: "info",
    });
  });

  const valid: { name: string; env: Record<string, string>; expected: Record<string, unknown> }[] =
    [
      { name: "a port", env: { PORT: "8080" }, expected: { PORT: 8080 } },
      {
        name: "a Solana RPC provider URL",
        env: { SOLANA_RPC_URL: "https://rpc.example.com/?api-key=abc" },
        expected: { SOLANA_RPC_URL: "https://rpc.example.com/?api-key=abc" },
      },
      { name: "a log level", env: { LOG_LEVEL: "debug" }, expected: { LOG_LEVEL: "debug" } },
      {
        name: "several origins with spaces",
        env: { CORS_ORIGINS: "https://example.com, http://localhost:5173" },
        expected: { CORS_ORIGINS: ["https://example.com", "http://localhost:5173"] },
      },
      {
        name: "a trailing comma",
        env: { CORS_ORIGINS: "https://example.com," },
        expected: { CORS_ORIGINS: ["https://example.com"] },
      },
      {
        name: "an origin with a port",
        env: { CORS_ORIGINS: "https://example.com:8443" },
        expected: { CORS_ORIGINS: ["https://example.com:8443"] },
      },
    ];

  for (const { name, env, expected } of valid) {
    test(`accepts ${name}`, () => {
      expect(readApiEnv({ ...REQUIRED, ...env })).toMatchObject(expected);
    });
  }

  const invalid: { name: string; env: Record<string, string | undefined> }[] = [
    { name: "a missing database URL", env: { DATABASE_URL: undefined } },
    { name: "a non-Postgres database URL", env: { DATABASE_URL: "mysql://app@localhost/app" } },
    { name: "a missing Privy app id", env: { PRIVY_APP_ID: undefined } },
    { name: "an empty Privy app id", env: { PRIVY_APP_ID: "" } },
    { name: "a missing Privy app secret", env: { PRIVY_APP_SECRET: undefined } },
    { name: "an empty Privy app secret", env: { PRIVY_APP_SECRET: "" } },
    { name: "a Solana RPC URL that isn't http", env: { SOLANA_RPC_URL: "wss://rpc.example.com" } },
    { name: "a Solana RPC URL that isn't a URL", env: { SOLANA_RPC_URL: "rpc.example.com" } },
    { name: "port 0", env: { PORT: "0" } },
    { name: "a port above 65535", env: { PORT: "65536" } },
    { name: "a port that isn't a number", env: { PORT: "abc" } },
    { name: "a fractional port", env: { PORT: "30.5" } },
    { name: "an empty port", env: { PORT: "" } },
    { name: "an unknown log level", env: { LOG_LEVEL: "verbose" } },
    { name: "the * origin", env: { CORS_ORIGINS: "*" } },
    { name: "an origin with a trailing slash", env: { CORS_ORIGINS: "https://example.com/" } },
    { name: "an origin with a path", env: { CORS_ORIGINS: "https://example.com/app" } },
    { name: "an origin without a scheme", env: { CORS_ORIGINS: "example.com" } },
    { name: "an origin in upper case", env: { CORS_ORIGINS: "https://Example.com" } },
    { name: "a non-web origin", env: { CORS_ORIGINS: "ftp://example.com" } },
    { name: "an empty origin list", env: { CORS_ORIGINS: " , " } },
  ];

  for (const { name, env } of invalid) {
    test(`rejects ${name}`, () => {
      expect(() => readApiEnv({ ...REQUIRED, ...env })).toThrow("Invalid API settings");
    });
  }

  test("names the variable but never shows its value", () => {
    const read = () =>
      readApiEnv({
        DATABASE_URL: "mysql://app:s3cret-pass@localhost/app",
        PRIVY_APP_ID: "",
        PORT: "s3cret-port",
      });
    expect(read).toThrow("DATABASE_URL");
    expect(read).toThrow("PRIVY_APP_ID");
    expect(read).toThrow("PRIVY_APP_SECRET");
    expect(read).toThrow("PORT");
    expect(read).not.toThrow("s3cret");
  });
});
