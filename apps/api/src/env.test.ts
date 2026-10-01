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
      JUPITER_API_KEY: undefined,
      FEES_ENABLED: false,
      PLATFORM_FEE_BPS: 10,
      FEE_WALLET_ADDRESS: undefined,
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
        name: "a Jupiter API key",
        env: { JUPITER_API_KEY: "test-jupiter-key" },
        expected: { JUPITER_API_KEY: "test-jupiter-key" },
      },
      {
        name: "fees on, with a fee wallet and its own rate",
        env: {
          FEES_ENABLED: "true",
          PLATFORM_FEE_BPS: "25",
          FEE_WALLET_ADDRESS: "AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51",
        },
        expected: {
          FEES_ENABLED: true,
          PLATFORM_FEE_BPS: 25,
          FEE_WALLET_ADDRESS: "AgmLJBMDCqWynYnQiPCuj9ewsNNsBJXyzoUhD9LJzN51",
        },
      },
      {
        name: "fees off, said out loud",
        env: { FEES_ENABLED: "false" },
        expected: { FEES_ENABLED: false },
      },
      { name: "a fee of zero", env: { PLATFORM_FEE_BPS: "0" }, expected: { PLATFORM_FEE_BPS: 0 } },
      {
        name: "a blank fee switch and wallet, as unset",
        env: { FEES_ENABLED: "", FEE_WALLET_ADDRESS: "" },
        expected: { FEES_ENABLED: false, FEE_WALLET_ADDRESS: undefined },
      },
      {
        name: "an empty Jupiter API key, as unset",
        env: { JUPITER_API_KEY: "" },
        expected: { JUPITER_API_KEY: undefined },
      },
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
    { name: "fees on without a fee wallet", env: { FEES_ENABLED: "true" } },
    {
      name: "fees on with a blank fee wallet",
      env: { FEES_ENABLED: "true", FEE_WALLET_ADDRESS: "" },
    },
    { name: "a fee switch of yes", env: { FEES_ENABLED: "yes" } },
    { name: "a fee switch of 1", env: { FEES_ENABLED: "1" } },
    { name: "a fee switch in capitals", env: { FEES_ENABLED: "TRUE" } },
    { name: "a fee above 100 bps", env: { PLATFORM_FEE_BPS: "101" } },
    { name: "a negative fee", env: { PLATFORM_FEE_BPS: "-1" } },
    { name: "a fractional fee", env: { PLATFORM_FEE_BPS: "1.5" } },
    { name: "a fee that isn't a number", env: { PLATFORM_FEE_BPS: "abc" } },
    { name: "a blank fee", env: { PLATFORM_FEE_BPS: "" } },
    {
      name: "a fee wallet that isn't a Solana address",
      env: { FEE_WALLET_ADDRESS: "0x52908400098527886E0F7030069857D2E4169EE7" },
    },
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
